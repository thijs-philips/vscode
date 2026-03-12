/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check
'use strict';

/**
 * Bumps the patch version in package.json and commits the change.
 *
 * Usage:
 *   node scripts/bump-version.js          — Increments patch:  1.112.0 → 1.112.1
 *   node scripts/bump-version.js --minor  — Increments minor:  1.112.x → 1.113.0
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PACKAGE_JSON_PATH = path.join(ROOT, 'package.json');

function main() {
	const bumpMinor = process.argv.includes('--minor');

	// Read current package.json
	const pkgText = fs.readFileSync(PACKAGE_JSON_PATH, 'utf8');
	const pkg = JSON.parse(pkgText);
	const currentVersion = pkg.version;

	// Parse semver
	const match = currentVersion.match(/^(\d+)\.(\d+)\.(\d+)$/);
	if (!match) {
		console.error(`Cannot parse version "${currentVersion}" — expected X.Y.Z format.`);
		process.exit(1);
	}

	const major = parseInt(match[1], 10);
	let minor = parseInt(match[2], 10);
	let patch = parseInt(match[3], 10);

	if (bumpMinor) {
		minor += 1;
		patch = 0;
	} else {
		patch += 1;
	}

	const newVersion = `${major}.${minor}.${patch}`;

	// Update package.json (preserve formatting by doing a targeted replace)
	const updatedText = pkgText.replace(
		`"version": "${currentVersion}"`,
		`"version": "${newVersion}"`
	);
	if (updatedText === pkgText) {
		console.error('Failed to update version string in package.json');
		process.exit(1);
	}
	fs.writeFileSync(PACKAGE_JSON_PATH, updatedText, 'utf8');

	console.log(`Version bumped: ${currentVersion} → ${newVersion}`);

	// Stage and commit
	execSync('git add package.json', { cwd: ROOT, stdio: 'inherit' });
	execSync(`git commit -m "chore: bump version to ${newVersion}"`, { cwd: ROOT, stdio: 'inherit' });

	console.log(`Committed version bump to ${newVersion}`);
}

main();
