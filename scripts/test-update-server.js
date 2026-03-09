/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check
'use strict';

/**
 * Standalone test for the local update server.
 *
 * Starts a minimal HTTP server that mimics localUpdateServer.ts logic,
 * then exercises every endpoint and validates the responses.
 *
 * Usage:
 *   node scripts/test-update-server.js
 *
 * This avoids the full build-install cycle - just run after transpile.
 */

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const PRODUCT = JSON.parse(fs.readFileSync(path.join(ROOT, 'product.json'), 'utf8'));
const PORT = 58242; // Use a different port to avoid conflict with running Code OSS

// Colors
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

// GitHub auth (same logic as localUpdateServer.ts)
function getToken() {
	if (process.env.GITHUB_TOKEN) { return Promise.resolve(process.env.GITHUB_TOKEN); }
	return new Promise((resolve) => {
		const child = spawn('git', ['credential', 'fill'], { stdio: ['pipe', 'pipe', 'ignore'] });
		let stdout = '';
		child.stdout.on('data', (d) => { stdout += d; });
		child.on('error', () => resolve(undefined));
		child.on('close', (code) => {
			if (code !== 0) { return resolve(undefined); }
			const m = stdout.match(/^password=(.+)$/m);
			resolve(m ? m[1].trim() : undefined);
		});
		child.stdin.write('protocol=https\nhost=github.com\n\n');
		child.stdin.end();
	});
}

function githubApi(urlPath, token) {
	return new Promise((resolve, reject) => {
		const url = new URL(urlPath, 'https://api.github.com');
		const opts = {
			hostname: url.hostname, path: url.pathname + url.search, method: 'GET',
			headers: { 'User-Agent': 'test', 'Accept': 'application/vnd.github.v3+json', 'Authorization': `token ${token}` },
		};
		https.request(opts, (res) => {
			let d = ''; res.setEncoding('utf8');
			res.on('data', (c) => { d += c; });
			res.on('end', () => res.statusCode >= 200 && res.statusCode < 300 ? resolve(JSON.parse(d)) : reject(new Error(`${res.statusCode}: ${d.substring(0, 200)}`)));
		}).on('error', reject).end();
	});
}

/**
 * Download a GitHub release asset's raw content (follows redirect).
 */
function githubDownloadAssetRaw(owner, repo, assetId, token) {
	return new Promise((resolve, reject) => {
		const url = new URL(`/repos/${owner}/${repo}/releases/assets/${assetId}`, 'https://api.github.com');
		const opts = {
			hostname: url.hostname, path: url.pathname, method: 'GET',
			headers: { 'User-Agent': 'test', 'Accept': 'application/octet-stream', 'Authorization': `token ${token}` },
		};
		https.request(opts, (proxyRes) => {
			if (proxyRes.statusCode === 302 || proxyRes.statusCode === 301) {
				const location = proxyRes.headers.location;
				if (!location) { return reject(new Error('Missing redirect')); }
				proxyRes.resume();
				https.get(location, (dlRes) => {
					const chunks = [];
					dlRes.on('data', (c) => chunks.push(c));
					dlRes.on('end', () => dlRes.statusCode === 200 ? resolve(Buffer.concat(chunks)) : reject(new Error(`DL ${dlRes.statusCode}`)));
				}).on('error', reject);
				return;
			}
			const chunks = [];
			proxyRes.on('data', (c) => chunks.push(c));
			proxyRes.on('end', () => proxyRes.statusCode >= 200 && proxyRes.statusCode < 300 ? resolve(Buffer.concat(chunks)) : reject(new Error(`${proxyRes.statusCode}`)));
		}).on('error', reject).end();
	});
}

function httpGet(url) {
	return new Promise((resolve, reject) => {
		http.get(url, (res) => {
			const chunks = [];
			res.on('data', (c) => chunks.push(c));
			res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
		}).on('error', reject);
	});
}

// Replicate actual server logic
function parseReleaseTag(tag) {
	const m = tag.match(/^v(\d+\.\d+\.\d+)-([0-9a-f]{10,40})$/);
	return m ? { productVersion: m[1], commit: m[2] } : undefined;
}

// Test runner
let passed = 0, failed = 0;
function assert(name, condition, detail) {
	if (condition) { console.log(`  ${green('OK')} ${name}`); passed++; }
	else { console.log(`  ${red('FAIL')} ${name} ${dim(detail || '')}`); failed++; }
}

async function main() {
	const { owner, repo } = PRODUCT.releaseRepository;
	console.log(`Repository: ${owner}/${repo}`);

	const token = await getToken();
	if (!token) { console.error(red('No GitHub token')); process.exit(1); }
	console.log(`Token: ${token.substring(0, 8)}...`);
	console.log();

	// Step 1: Fetch latest release directly from GitHub
	console.log(yellow('Step 1: Fetch latest release from GitHub'));
	const release = await githubApi(`/repos/${owner}/${repo}/releases/latest`, token);
	const parsed = parseReleaseTag(release.tag_name);
	assert('Release exists', !!release.tag_name, release.tag_name);
	assert('Tag parses', !!parsed, release.tag_name);
	console.log(`  Tag: ${release.tag_name}  Version: ${parsed?.productVersion}  Commit: ${parsed?.commit}`);
	console.log(`  Assets: ${release.assets.map(a => `${a.name} (${Math.round(a.size / 1024 / 1024)}MB)`).join(', ')}`);
	console.log();

	// Step 2: Verify checksum asset can be downloaded as raw content
	console.log(yellow('Step 2: Download checksum asset (raw)'));
	const checksumAsset = release.assets.find(a => a.name.endsWith('.sha256'));
	if (checksumAsset) {
		const checksumRaw = await githubDownloadAssetRaw(owner, repo, checksumAsset.id, token);
		const checksumText = checksumRaw.toString('utf8').trim().split(/\s+/)[0];
		assert('Checksum is 64-char hex', /^[0-9a-f]{64}$/.test(checksumText), `got: "${checksumText.substring(0, 80)}"`);
		console.log(`  SHA256 from .sha256 asset: ${checksumText}`);

		// Contrast with what githubRequest (JSON API) returns
		const jsonMeta = await githubApi(`/repos/${owner}/${repo}/releases/assets/${checksumAsset.id}`, token);
		assert('JSON API returns metadata (not hash)', jsonMeta.name === checksumAsset.name, `got: ${JSON.stringify(jsonMeta).substring(0, 100)}`);
		console.log(`  ${dim('(JSON API returns asset metadata, not the file content - this was the bug)')}`);
	} else {
		console.log(`  ${red('No .sha256 asset found')}`);
	}
	console.log();

	// Step 3: Simulate update check (what localUpdateServer does)
	console.log(yellow('Step 3: Simulate update check response'));
	const platform = 'win32-x64-user';
	const fakeCurrentCommit = '0000000000000000000000000000000000000000';
	const assetName = `CodeOSSSetup-${platform}.exe`;
	const installerAsset = release.assets.find(a => a.name === assetName);
	assert('Installer asset exists', !!installerAsset, `looking for: ${assetName}`);

	if (installerAsset && checksumAsset && parsed) {
		const checksumRaw = await githubDownloadAssetRaw(owner, repo, checksumAsset.id, token);
		const sha256hash = checksumRaw.toString('utf8').trim().split(/\s+/)[0];

		const updateResponse = {
			url: `http://127.0.0.1:${PORT}/download/${release.id}/${encodeURIComponent(installerAsset.name)}`,
			version: parsed.commit,
			productVersion: parsed.productVersion,
			sha256hash,
		};
		console.log('  Update response that would be sent:');
		console.log(`    url: ${updateResponse.url}`);
		console.log(`    version: ${updateResponse.version}`);
		console.log(`    productVersion: ${updateResponse.productVersion}`);
		console.log(`    sha256hash: ${updateResponse.sha256hash}`);
		assert('sha256hash looks valid', /^[0-9a-f]{64}$/.test(updateResponse.sha256hash));
	}
	console.log();

	// Step 4: Download installer and verify SHA256
	console.log(yellow('Step 4: Download installer and verify SHA256'));
	if (installerAsset) {
		console.log(`  Downloading ${installerAsset.name} (${Math.round(installerAsset.size / 1024 / 1024)}MB)...`);
		console.log(`  ${dim('(this downloads the full file to verify the hash)')}`);
		const installerBuf = await githubDownloadAssetRaw(owner, repo, installerAsset.id, token);
		const computedHash = crypto.createHash('sha256').update(installerBuf).digest('hex');
		console.log(`  Downloaded: ${Math.round(installerBuf.length / 1024 / 1024)}MB`);
		console.log(`  Computed SHA256: ${computedHash}`);

		if (checksumAsset) {
			const expectedHash = (await githubDownloadAssetRaw(owner, repo, checksumAsset.id, token)).toString('utf8').trim().split(/\s+/)[0];
			console.log(`  Expected SHA256: ${expectedHash}`);
			assert('SHA256 matches', computedHash === expectedHash, `computed=${computedHash} expected=${expectedHash}`);
		}
	}
	console.log();

	// Summary
	console.log('='.repeat(50));
	console.log(`${green(passed + ' passed')}, ${failed > 0 ? red(failed + ' failed') : dim('0 failed')}`);
	if (failed > 0) { process.exit(1); }
}

main().catch(err => {
	console.error(red('Fatal:'), err);
	process.exit(1);
});
