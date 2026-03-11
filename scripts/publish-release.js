/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check
'use strict';

/**
 * Creates a GitHub release from the current build output.
 *
 * Usage:
 *   node scripts/publish-release.js
 *
 * Environment:
 *   GITHUB_TOKEN  — Personal access token with `repo` scope (or use git credential helper)
 *
 * Expects:
 *   - product.json with `releaseRepository` and `version` fields
 *   - Installer at .build/win32-x64/user-setup/CodeOSSSetup.exe
 *   - Git repo with current HEAD matching the build commit
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PRODUCT = JSON.parse(fs.readFileSync(path.join(ROOT, 'product.json'), 'utf8'));
const INSTALLER_PATH = path.join(ROOT, '.build', 'win32-x64', 'user-setup', 'CodeOSSSetup.exe');
const BUILT_PRODUCT_PATH = path.join(ROOT, '..', 'VSCode-win32-x64', 'resources', 'app', 'product.json');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getCommit() {
	const env = process.env['BUILD_SOURCEVERSION'];
	if (env) {
		return env;
	}
	return require('child_process')
		.execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' })
		.trim();
}

function hasUncommittedChanges() {
	const status = require('child_process')
		.execSync('git status --porcelain', { cwd: ROOT, encoding: 'utf8' })
		.trim();
	return status.length > 0;
}

function sha256File(filePath) {
	return new Promise((resolve, reject) => {
		const hash = crypto.createHash('sha256');
		const stream = fs.createReadStream(filePath);
		stream.on('data', (data) => hash.update(data));
		stream.on('end', () => resolve(hash.digest('hex')));
		stream.on('error', reject);
	});
}

function getTokenFromCredentialHelper() {
	return new Promise((resolve) => {
		const child = spawn('git', ['credential', 'fill'], { stdio: ['pipe', 'pipe', 'ignore'] });
		let stdout = '';
		child.stdout.on('data', (data) => { stdout += data.toString(); });
		child.on('error', () => resolve(undefined));
		child.on('close', (code) => {
			if (code !== 0) { return resolve(undefined); }
			const match = stdout.match(/^password=(.+)$/m);
			resolve(match ? match[1].trim() : undefined);
		});
		child.stdin.write('protocol=https\nhost=github.com\n\n');
		child.stdin.end();
	});
}

async function getToken() {
	const envToken = process.env['GITHUB_TOKEN'];
	if (envToken) { return envToken; }
	const credToken = await getTokenFromCredentialHelper();
	if (credToken) { return credToken; }
	throw new Error('No GitHub token. Set GITHUB_TOKEN or configure git credentials for github.com');
}

function githubApi(method, urlPath, token, body) {
	return new Promise((resolve, reject) => {
		const url = new URL(urlPath, 'https://api.github.com');
		const options = {
			hostname: url.hostname,
			path: url.pathname + url.search,
			method,
			headers: {
				'User-Agent': 'Code-OSS-Release-Publisher',
				'Accept': 'application/vnd.github.v3+json',
				'Authorization': `token ${token}`,
			},
		};
		if (body) {
			const bodyStr = JSON.stringify(body);
			options.headers['Content-Type'] = 'application/json';
			options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
		}
		const req = https.request(options, (res) => {
			let data = '';
			res.setEncoding('utf8');
			res.on('data', (chunk) => { data += chunk; });
			res.on('end', () => {
				if (res.statusCode >= 200 && res.statusCode < 300) {
					resolve(data ? JSON.parse(data) : null);
				} else {
					reject(new Error(`GitHub API ${method} ${urlPath} → ${res.statusCode}: ${data.substring(0, 300)}`));
				}
			});
		});
		req.on('error', reject);
		if (body) { req.write(JSON.stringify(body)); }
		req.end();
	});
}

function uploadAsset(uploadUrl, filePath, fileName, token) {
	return new Promise((resolve, reject) => {
		const stat = fs.statSync(filePath);
		const url = new URL(uploadUrl.replace('{?name,label}', `?name=${encodeURIComponent(fileName)}`));
		const options = {
			hostname: url.hostname,
			path: url.pathname + url.search,
			method: 'POST',
			headers: {
				'User-Agent': 'Code-OSS-Release-Publisher',
				'Accept': 'application/vnd.github.v3+json',
				'Authorization': `token ${token}`,
				'Content-Type': 'application/octet-stream',
				'Content-Length': stat.size,
			},
		};
		const req = https.request(options, (res) => {
			let data = '';
			res.setEncoding('utf8');
			res.on('data', (chunk) => { data += chunk; });
			res.on('end', () => {
				if (res.statusCode >= 200 && res.statusCode < 300) {
					resolve(JSON.parse(data));
				} else {
					reject(new Error(`Upload failed ${res.statusCode}: ${data.substring(0, 300)}`));
				}
			});
		});
		req.on('error', reject);
		fs.createReadStream(filePath).pipe(req);
	});
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
	const releaseRepo = PRODUCT.releaseRepository;
	if (!releaseRepo || !releaseRepo.owner || !releaseRepo.repo) {
		throw new Error('product.json must have releaseRepository.owner and releaseRepository.repo');
	}

	const version = PRODUCT.version || require(path.join(ROOT, 'package.json')).version;
	const commit = getCommit();
	const tag = `v${version}-${commit.substring(0, 12)}`;
	const { owner, repo } = releaseRepo;

	console.log(`Version:    ${version}`);
	console.log(`Commit:     ${commit}`);
	console.log(`Tag:        ${tag}`);
	console.log(`Repository: ${owner}/${repo}`);
	console.log();

	// Warn if there are uncommitted changes
	if (hasUncommittedChanges()) {
		console.log('WARNING: You have uncommitted changes. The release will be tagged');
		console.log('         with the current HEAD commit, not including your changes.');
		console.log('         Consider committing first if those changes should be included.');
		console.log();
	}
	// Verify installer exists
	if (!fs.existsSync(INSTALLER_PATH)) {
		throw new Error(`Installer not found at ${INSTALLER_PATH}. Run buildscripts/build-production.bat first.`);
	}

	// Verify the build output was produced from the current commit
	if (fs.existsSync(BUILT_PRODUCT_PATH)) {
		const builtProduct = JSON.parse(fs.readFileSync(BUILT_PRODUCT_PATH, 'utf8'));
		if (builtProduct.commit !== commit) {
			throw new Error(
				`Stale build detected!\n` +
				`  Git HEAD commit:   ${commit}\n` +
				`  Built app commit:  ${builtProduct.commit || '(none)'}\n` +
				`The installer was built from a different commit. Rebuild with buildscripts/build-production.bat first.`
			);
		}
		console.log(`Build commit verified: ${builtProduct.commit.substring(0, 12)}`);
	} else {
		console.log('WARN: Cannot verify build commit (built product.json not found). Proceeding anyway.');
	}
	console.log();

	const token = await getToken();

	// Compute SHA256 of the installer
	console.log('Computing SHA256 checksum...');
	const checksum = await sha256File(INSTALLER_PATH);
	console.log(`SHA256: ${checksum}`);
	console.log();

	// Write checksum file alongside installer
	const checksumPath = INSTALLER_PATH + '.sha256';
	fs.writeFileSync(checksumPath, checksum, 'utf8');

	// Create (or find existing) release
	const apiBase = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
	let release;

	try {
		console.log(`Creating release ${tag}...`);
		release = await githubApi('POST', `${apiBase}/releases`, token, {
			tag_name: tag,
			target_commitish: commit,
			name: `Code OSS ${version}`,
			body: `Code OSS ${version}\n\nCommit: ${commit}\nInstaller SHA256: ${checksum}`,
			draft: false,
			prerelease: false,
		});
		console.log(`Release created: ${release.html_url}`);
	} catch (err) {
		// If release already exists with this tag, find it
		if (err.message && err.message.includes('422')) {
			console.log(`Release ${tag} already exists, fetching...`);
			release = await githubApi('GET', `${apiBase}/releases/tags/${encodeURIComponent(tag)}`, token);
			console.log(`Found existing release: ${release.html_url}`);
		} else {
			throw err;
		}
	}

	// Upload installer asset
	const assetName = 'CodeOSSSetup-win32-x64-user.exe';
	const existingAsset = release.assets.find((a) => a.name === assetName);
	if (existingAsset) {
		console.log(`Asset ${assetName} already exists, deleting...`);
		await githubApi('DELETE', `${apiBase}/releases/assets/${existingAsset.id}`, token);
	}

	console.log(`Uploading ${assetName} (${(fs.statSync(INSTALLER_PATH).size / 1024 / 1024).toFixed(1)} MB)...`);
	await uploadAsset(release.upload_url, INSTALLER_PATH, assetName, token);
	console.log(`Uploaded ${assetName}`);

	// Upload checksum asset
	const checksumAssetName = 'CodeOSSSetup-win32-x64-user.exe.sha256';
	const existingChecksumAsset = release.assets.find((a) => a.name === checksumAssetName);
	if (existingChecksumAsset) {
		console.log(`Asset ${checksumAssetName} already exists, deleting...`);
		await githubApi('DELETE', `${apiBase}/releases/assets/${existingChecksumAsset.id}`, token);
	}

	console.log(`Uploading ${checksumAssetName}...`);
	await uploadAsset(release.upload_url, checksumPath, checksumAssetName, token);
	console.log(`Uploaded ${checksumAssetName}`);

	console.log();
	console.log('=== Release published successfully ===');
	console.log(`  URL: ${release.html_url}`);
	console.log(`  Tag: ${tag}`);
	console.log(`  SHA256: ${checksum}`);
}

main().catch(err => {
	console.error('Release publish failed:', err.message || err);
	process.exit(1);
});
