/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');

const root = path.join(__dirname, '..');
const productPath = path.join(root, 'product.json');

function main(): void {
	const separatorIndex = process.argv.indexOf('--');
	const variant = process.argv[2];
	if (!variant || !/^[a-z0-9-]+$/.test(variant) || separatorIndex < 0 || separatorIndex === process.argv.length - 1) {
		throw new Error('Usage: node scripts/run-with-product-variant.ts <variant> -- <command> [args...]');
	}

	const variantPath = path.join(root, 'build', 'variants', `${variant}.json`);
	if (!fs.existsSync(variantPath)) {
		throw new Error(`Unknown product variant: ${variant}`);
	}

	const originalProduct = fs.readFileSync(productPath, 'utf8');
	const product = JSON.parse(originalProduct);
	const overrides = JSON.parse(fs.readFileSync(variantPath, 'utf8'));
	const command = process.argv[separatorIndex + 1];
	const args = process.argv.slice(separatorIndex + 2);
	let exitCode = 1;

	try {
		fs.writeFileSync(productPath, `${JSON.stringify({ ...product, ...overrides }, undefined, '\t')}\n`, 'utf8');
		const result = childProcess.spawnSync(command, args, {
			cwd: root,
			env: { ...process.env, VSCODE_PRODUCT_VARIANT: variant },
			stdio: 'inherit',
		});
		if (result.error) {
			throw result.error;
		}
		exitCode = result.status ?? 1;
	} finally {
		fs.writeFileSync(productPath, originalProduct, 'utf8');
	}

	process.exitCode = exitCode;
}

try {
	main();
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
}