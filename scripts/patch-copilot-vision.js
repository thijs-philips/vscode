/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const fs = require('fs');
const path = require('path');

async function main() {
	const { patchCopilotVisionBundleContent } = await import('../src/vs/platform/extensionManagement/common/copilotVisionPatch.ts');
	const explicitBundles = process.argv.slice(2);
	const candidates = explicitBundles.length > 0 ? explicitBundles : [
		path.join(__dirname, '..', '..', 'VSCode-win32-x64', 'resources', 'app', 'extensions', 'copilot', 'dist', 'extension.js'),
		path.join(__dirname, '..', 'extensions', 'copilot', 'dist', 'extension.js'),
	];
	const bundles = candidates.map(candidate => path.resolve(candidate)).filter(candidate => fs.existsSync(candidate));
	if (bundles.length === 0) {
		throw new Error(`No Copilot bundle found. Checked: ${candidates.join(', ')}`);
	}

	for (const bundle of bundles) {
		const original = fs.readFileSync(bundle, 'utf8');
		const result = patchCopilotVisionBundleContent(original);
		if (result.status === 'patched') {
			const temporary = `${bundle}.${process.pid}.${Date.now()}.tmp`;
			try {
				fs.writeFileSync(temporary, result.content, 'utf8');
				fs.renameSync(temporary, bundle);
			} finally {
				fs.rmSync(temporary, { force: true });
			}
		}
		console.log(`[CopilotVisionPatch] ${result.status}: ${bundle}`);
	}
}

main().catch(error => {
	console.error(`[CopilotVisionPatch] ${error instanceof Error ? error.message : error}`);
	process.exit(1);
});
