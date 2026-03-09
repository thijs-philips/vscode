/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as http from 'http';
import { ILogService } from '../../platform/log/common/log.js';
import { IProductService } from '../../platform/product/common/productService.js';
import { IDisposable } from '../../base/common/lifecycle.js';

const LOCAL_UPDATE_PORT = 58241;
const GITHUB_API = 'https://api.github.com';
const TOKEN_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const RELEASE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ---------------------------------------------------------------------------
// GitHub authentication via git credential helper
// ---------------------------------------------------------------------------

interface ITokenCache {
	token: string;
	expiresAt: number;
}

let tokenCache: ITokenCache | undefined;

async function getGitHubTokenFromCredentialHelper(): Promise<string | undefined> {
	const { spawn } = await import('child_process');
	return new Promise(resolve => {
		const child = spawn('git', ['credential', 'fill'], { stdio: ['pipe', 'pipe', 'ignore'] });
		let stdout = '';

		child.stdout.on('data', (data: Buffer) => {
			stdout += data.toString();
		});

		child.on('error', () => resolve(undefined));
		child.on('close', (code) => {
			if (code !== 0) {
				return resolve(undefined);
			}
			const match = stdout.match(/^password=(.+)$/m);
			resolve(match ? match[1].trim() : undefined);
		});

		child.stdin.write('protocol=https\nhost=github.com\n\n');
		child.stdin.end();
	});
}

async function getGitHubToken(log: ILogService): Promise<string | undefined> {
	// Check environment variable first
	const envToken = process.env['GITHUB_TOKEN'];
	if (envToken) {
		return envToken;
	}

	// Check cache
	if (tokenCache && Date.now() < tokenCache.expiresAt) {
		return tokenCache.token;
	}

	// Fetch from git credential helper
	const token = await getGitHubTokenFromCredentialHelper();
	if (token) {
		tokenCache = { token, expiresAt: Date.now() + TOKEN_CACHE_TTL };
		return token;
	}

	log.warn('[localUpdateServer] No GitHub token available. Set GITHUB_TOKEN or configure git credentials for github.com');
	return undefined;
}

// ---------------------------------------------------------------------------
// GitHub API helpers
// ---------------------------------------------------------------------------

interface IGitHubRelease {
	id: number;
	tag_name: string;
	name: string;
	body: string;
	assets: IGitHubAsset[];
}

interface IGitHubAsset {
	id: number;
	name: string;
	size: number;
	browser_download_url: string;
}

interface IReleaseCache {
	release: IGitHubRelease;
	expiresAt: number;
}

let releaseCache: IReleaseCache | undefined;

async function githubRequest(urlPath: string, token: string): Promise<string> {
	const https = await import('https');
	return new Promise((resolve, reject) => {
		const url = new URL(urlPath, GITHUB_API);
		const options = {
			hostname: url.hostname,
			path: url.pathname + url.search,
			method: 'GET',
			headers: {
				'User-Agent': 'Code-OSS-Update-Server',
				'Accept': 'application/vnd.github.v3+json',
				'Authorization': `token ${token}`,
			},
		};

		const req = https.request(options, (res) => {
			let body = '';
			res.setEncoding('utf8');
			res.on('data', (chunk: string) => { body += chunk; });
			res.on('end', () => {
				if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
					resolve(body);
				} else {
					reject(new Error(`GitHub API ${res.statusCode}: ${body.substring(0, 200)}`));
				}
			});
		});
		req.on('error', reject);
		req.end();
	});
}

/**
 * Downloads a GitHub release asset's raw content by following the redirect
 * that GitHub returns when using Accept: application/octet-stream.
 */
async function githubDownloadAssetText(owner: string, repo: string, assetId: number, token: string): Promise<string> {
	const https = await import('https');
	return new Promise((resolve, reject) => {
		const url = new URL(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/assets/${assetId}`, GITHUB_API);
		const options = {
			hostname: url.hostname,
			path: url.pathname,
			method: 'GET',
			headers: {
				'User-Agent': 'Code-OSS-Update-Server',
				'Accept': 'application/octet-stream',
				'Authorization': `token ${token}`,
			},
		};

		const req = https.request(options, (proxyRes) => {
			if (proxyRes.statusCode === 302 || proxyRes.statusCode === 301) {
				const location = proxyRes.headers.location;
				if (!location) {
					return reject(new Error('Missing redirect location'));
				}
				// Follow the redirect to the signed S3 URL
				https.get(location, (downloadRes) => {
					let body = '';
					downloadRes.setEncoding('utf8');
					downloadRes.on('data', (chunk: string) => { body += chunk; });
					downloadRes.on('end', () => {
						if (downloadRes.statusCode === 200) {
							resolve(body);
						} else {
							reject(new Error(`Download failed: ${downloadRes.statusCode}`));
						}
					});
				}).on('error', reject);
				// Consume the redirect response body
				proxyRes.resume();
				return;
			}

			let body = '';
			proxyRes.setEncoding('utf8');
			proxyRes.on('data', (chunk: string) => { body += chunk; });
			proxyRes.on('end', () => {
				if (proxyRes.statusCode && proxyRes.statusCode >= 200 && proxyRes.statusCode < 300) {
					resolve(body);
				} else {
					reject(new Error(`GitHub asset download ${proxyRes.statusCode}: ${body.substring(0, 200)}`));
				}
			});
		});
		req.on('error', reject);
		req.end();
	});
}

async function getLatestRelease(owner: string, repo: string, token: string): Promise<IGitHubRelease> {
	// Check cache
	if (releaseCache && Date.now() < releaseCache.expiresAt) {
		return releaseCache.release;
	}

	const body = await githubRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/latest`, token);
	const release: IGitHubRelease = JSON.parse(body);
	releaseCache = { release, expiresAt: Date.now() + RELEASE_CACHE_TTL };
	return release;
}

// ---------------------------------------------------------------------------
// Release tag parsing
// ---------------------------------------------------------------------------

interface IParsedTag {
	productVersion: string;
	commit: string;
}

/**
 * Parses a release tag like `v1.112.0-abc123def456` into version and commit.
 */
function parseReleaseTag(tag: string): IParsedTag | undefined {
	// Format: v{semver}-{commitPrefix}  e.g. v1.112.0-abc123def456
	const match = tag.match(/^v(\d+\.\d+\.\d+)-([0-9a-f]{10,40})$/);
	if (!match) {
		return undefined;
	}
	return { productVersion: match[1], commit: match[2] };
}

/**
 * Maps the VS Code platform string to an expected asset name prefix.
 * Platform examples: win32-x64-user, win32-x64-archive, win32-arm64-user
 */
function getAssetName(platform: string): string {
	return `CodeOSSSetup-${platform}.exe`;
}

function getChecksumAssetName(platform: string): string {
	return `CodeOSSSetup-${platform}.exe.sha256`;
}

// ---------------------------------------------------------------------------
// HTTP Server
// ---------------------------------------------------------------------------

function handleUpdateCheck(
	req: http.IncomingMessage,
	res: http.ServerResponse,
	pathParts: string[],
	port: number,
	owner: string,
	repo: string,
	token: string,
	log: ILogService,
): void {
	// /api/update/{platform}/{quality}/{commit}
	// pathParts: [0]=api [1]=update [2]=platform [3]=quality [4]=commit
	const platform = pathParts[2];
	const currentCommit = pathParts[4];

	if (!platform || !currentCommit) {
		res.writeHead(400);
		res.end('Missing platform or commit');
		return;
	}

	getLatestRelease(owner, repo, token)
		.then(async release => {
			const parsed = parseReleaseTag(release.tag_name);
			if (!parsed) {
				log.warn(`[localUpdateServer] Could not parse release tag: ${release.tag_name}`);
				res.writeHead(204);
				res.end();
				return;
			}

			// Check if the release commit matches the current commit
			if (currentCommit.startsWith(parsed.commit) || parsed.commit.startsWith(currentCommit)) {
				// Already up to date
				res.writeHead(204);
				res.end();
				return;
			}

			// Find the installer asset for this platform
			const assetName = getAssetName(platform);
			const installerAsset = release.assets.find(a => a.name === assetName);
			if (!installerAsset) {
				log.info(`[localUpdateServer] No asset '${assetName}' in release ${release.tag_name}. Available: ${release.assets.map(a => a.name).join(', ')}`);
				res.writeHead(204);
				res.end();
				return;
			}

			// Look for SHA256 checksum
			const checksumName = getChecksumAssetName(platform);
			const checksumAsset = release.assets.find(a => a.name === checksumName);
			let sha256hash: string | undefined;
			if (checksumAsset) {
				try {
					const checksumBody = await githubDownloadAssetText(owner, repo, checksumAsset.id, token);
					// The .sha256 file contains just the hex hash (possibly with filename)
					sha256hash = checksumBody.trim().split(/\s+/)[0];
				} catch {
					// Continue without checksum
				}
			}

			// Build the response — url points to our local download proxy
			const downloadUrl = `http://127.0.0.1:${port}/download/${release.id}/${encodeURIComponent(installerAsset.name)}`;

			const update = {
				url: downloadUrl,
				version: parsed.commit,
				productVersion: parsed.productVersion,
				sha256hash,
			};

			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify(update));
			log.info(`[localUpdateServer] Update available: ${release.tag_name} (${parsed.productVersion})`);
		})
		.catch(err => {
			log.warn(`[localUpdateServer] Failed to check for updates: ${err}`);
			res.writeHead(500);
			res.end('Internal error');
		});
}

function handleDownloadProxy(
	_req: http.IncomingMessage,
	res: http.ServerResponse,
	pathParts: string[],
	owner: string,
	repo: string,
	token: string,
	log: ILogService,
): void {
	// /download/{releaseId}/{assetName}
	// pathParts: [0]=download [1]=releaseId [2]=assetName
	const releaseId = pathParts[1];
	const assetName = pathParts[2];

	if (!releaseId || !assetName) {
		res.writeHead(400);
		res.end('Missing releaseId or assetName');
		return;
	}

	// Validate asset name to prevent path traversal
	if (!/^CodeOSSSetup-[\w-]+\.exe(\.sha256)?$/.test(decodeURIComponent(assetName))) {
		res.writeHead(400);
		res.end('Invalid asset name');
		return;
	}

	// Find the asset ID by listing release assets
	(async () => {
		const https = await import('https');
		const release = await getLatestRelease(owner, repo, token);
		const decodedName = decodeURIComponent(assetName);
		const asset = release.assets.find(a => a.name === decodedName);
		if (!asset) {
			res.writeHead(404);
			res.end('Asset not found');
			return;
		}

		// Download the asset via GitHub API (requires Accept: application/octet-stream)
		const url = new URL(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/assets/${asset.id}`, GITHUB_API);
		const options = {
			hostname: url.hostname,
			path: url.pathname,
			method: 'GET',
			headers: {
				'User-Agent': 'Code-OSS-Update-Server',
				'Accept': 'application/octet-stream',
				'Authorization': `token ${token}`,
			},
		};

		const proxyReq = https.request(options, (proxyRes: http.IncomingMessage) => {
			// GitHub returns 302 redirect to the actual download URL
			if (proxyRes.statusCode === 302 || proxyRes.statusCode === 301) {
				const location = proxyRes.headers.location;
				if (!location) {
					res.writeHead(502);
					res.end('Missing redirect location');
					return;
				}
				// Follow the redirect — the redirected URL is a signed S3 URL that doesn't need auth
				https.get(location, (downloadRes: http.IncomingMessage) => {
					if (downloadRes.statusCode !== 200) {
						res.writeHead(downloadRes.statusCode || 502);
						res.end('Download failed');
						return;
					}
					res.writeHead(200, {
						'Content-Type': 'application/octet-stream',
						'Content-Length': downloadRes.headers['content-length'] || '',
					});
					downloadRes.pipe(res);
				}).on('error', (err: Error) => {
					log.warn(`[localUpdateServer] Download redirect failed: ${err}`);
					res.writeHead(502);
					res.end('Download failed');
				});
				return;
			}

			if (proxyRes.statusCode !== 200) {
				res.writeHead(proxyRes.statusCode || 502);
				res.end('Download failed');
				return;
			}

			res.writeHead(200, {
				'Content-Type': 'application/octet-stream',
				'Content-Length': proxyRes.headers['content-length'] || '',
			});
			proxyRes.pipe(res);
		});

		proxyReq.on('error', (err: Error) => {
			log.warn(`[localUpdateServer] Asset download failed: ${err}`);
			res.writeHead(502);
			res.end('Download failed');
		});
		proxyReq.end();
	})().catch(err => {
		log.warn(`[localUpdateServer] Download proxy error: ${err}`);
		res.writeHead(500);
		res.end('Internal error');
	});
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ILocalUpdateServer extends IDisposable {
	readonly port: number;
}

/**
 * Starts a local HTTP server that translates GitHub Releases into the
 * VS Code update protocol. The server binds to 127.0.0.1 only.
 *
 * Returns the server handle, or undefined if the server could not start
 * (e.g., port in use, no repository configured).
 */
export async function startLocalUpdateServer(
	productService: IProductService,
	log: ILogService,
): Promise<ILocalUpdateServer | undefined> {
	const releaseRepo = productService.releaseRepository;
	if (!releaseRepo || !releaseRepo.owner || !releaseRepo.repo) {
		log.info('[localUpdateServer] No releaseRepository configured in product.json, skipping');
		return undefined;
	}

	const token = await getGitHubToken(log);
	if (!token) {
		log.warn('[localUpdateServer] No GitHub token available, update server will not start');
		return undefined;
	}

	const { owner, repo } = releaseRepo;
	const port = LOCAL_UPDATE_PORT;

	const httpModule = await import('http');
	const server = httpModule.createServer((req, res) => {
		const urlPath = req.url || '/';
		const pathParts = urlPath.split('/').filter(Boolean);

		// Route: /api/update/{platform}/{quality}/{commit}
		if (pathParts[0] === 'api' && pathParts[1] === 'update' && pathParts.length >= 5) {
			// Refresh token if needed
			getGitHubToken(log).then(freshToken => {
				if (!freshToken) {
					res.writeHead(503);
					res.end('No GitHub token');
					return;
				}
				handleUpdateCheck(req, res, pathParts, port, owner, repo, freshToken, log);
			});
			return;
		}

		// Route: /download/{releaseId}/{assetName}
		if (pathParts[0] === 'download' && pathParts.length >= 3) {
			getGitHubToken(log).then(freshToken => {
				if (!freshToken) {
					res.writeHead(503);
					res.end('No GitHub token');
					return;
				}
				handleDownloadProxy(req, res, pathParts, owner, repo, freshToken, log);
			});
			return;
		}

		// Health check
		if (urlPath === '/health') {
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ status: 'ok', owner, repo }));
			return;
		}

		res.writeHead(404);
		res.end('Not found');
	});

	return new Promise<ILocalUpdateServer | undefined>(resolve => {
		server.on('error', (err: NodeJS.ErrnoException) => {
			if (err.code === 'EADDRINUSE') {
				log.warn(`[localUpdateServer] Port ${port} is in use, update server will not start`);
			} else {
				log.warn(`[localUpdateServer] Server error: ${err.message}`);
			}
			resolve(undefined);
		});

		server.listen(port, '127.0.0.1', () => {
			log.info(`[localUpdateServer] Listening on http://127.0.0.1:${port} (repo: ${owner}/${repo})`);
			resolve({
				port,
				dispose: () => {
					server.close();
					releaseCache = undefined;
					tokenCache = undefined;
				}
			});
		});
	});
}
