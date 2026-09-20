/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as http from 'http';
import { IDisposable } from '../../base/common/lifecycle.js';
import * as semver from '../../base/common/semver/semver.js';
import { ILogService } from '../../platform/log/common/log.js';
import { IProductService } from '../../platform/product/common/productService.js';

const DEFAULT_LOCAL_UPDATE_PORT = 58241;
const DEFAULT_UPDATE_ASSET_PREFIX = 'CodeOSSSetup';
const GITHUB_API = 'https://api.github.com';
const RELEASE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getGitHubToken(): string | undefined {
	return process.env['GITHUB_TOKEN'];
}

// ---------------------------------------------------------------------------
// GitHub API helpers
// ---------------------------------------------------------------------------

interface IGitHubRelease {
	id: number;
	tag_name: string;
	target_commitish: string;
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

async function githubRequest(urlPath: string, token: string | undefined): Promise<string> {
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
				...(token ? { 'Authorization': `token ${token}` } : {}),
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
async function githubDownloadAssetText(owner: string, repo: string, assetId: number, token: string | undefined): Promise<string> {
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
				...(token ? { 'Authorization': `token ${token}` } : {}),
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

async function getLatestRelease(owner: string, repo: string, token: string | undefined): Promise<IGitHubRelease> {
	if (releaseCache && Date.now() < releaseCache.expiresAt) {
		return releaseCache.release;
	}

	const body = await githubRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases?per_page=100`, token);
	const releases: IGitHubRelease[] = JSON.parse(body);
	const release = selectLatestSemanticRelease(releases);
	if (!release) {
		throw new Error('No valid semantic release found');
	}
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

export function selectLatestSemanticRelease<T extends Pick<IGitHubRelease, 'tag_name'>>(releases: readonly T[]): T | undefined {
	return releases.reduce<T | undefined>((latest, candidate) => {
		const candidateTag = parseReleaseTag(candidate.tag_name);
		if (!candidateTag || !semver.valid(candidateTag.productVersion)) {
			return latest;
		}
		const latestTag = latest ? parseReleaseTag(latest.tag_name) : undefined;
		return !latestTag || semver.gt(candidateTag.productVersion, latestTag.productVersion) ? candidate : latest;
	}, undefined);
}

/**
 * Maps the VS Code platform string to an expected asset name prefix.
 * Platform examples: win32-x64-user, win32-x64-archive, win32-arm64-user
 */
function getAssetName(platform: string, assetPrefix: string): string {
	return `${assetPrefix}-${platform}.exe`;
}

function getChecksumAssetName(platform: string, assetPrefix: string): string {
	return `${assetPrefix}-${platform}.exe.sha256`;
}

export function isNewerReleaseVersion(currentProductVersion: string, releaseProductVersion: string): boolean {
	return !!semver.valid(currentProductVersion) && !!semver.valid(releaseProductVersion) && semver.gt(releaseProductVersion, currentProductVersion);
}

export function isExpectedUpdateAssetName(assetName: string, assetPrefix: string): boolean {
	const escapedAssetPrefix = assetPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return new RegExp(`^${escapedAssetPrefix}-[\\w-]+\\.exe(?:\\.sha256)?$`).test(assetName);
}

export function parseUpdateChecksum(value: string): string | undefined {
	const checksum = value.trim().split(/\s+/)[0];
	return /^[0-9a-f]{64}$/i.test(checksum) ? checksum.toLowerCase() : undefined;
}

export function resolveReleaseCommit(tagCommit: string, targetCommitish: string): string | undefined {
	return /^[0-9a-f]{40}$/i.test(targetCommitish) && targetCommitish.startsWith(tagCommit)
		? targetCommitish.toLowerCase()
		: undefined;
}

// ---------------------------------------------------------------------------
// HTTP Server
// ---------------------------------------------------------------------------

function handleUpdateCheck(
	_req: http.IncomingMessage,
	res: http.ServerResponse,
	pathParts: string[],
	port: number,
	owner: string,
	repo: string,
	assetPrefix: string,
	currentProductVersion: string,
	token: string | undefined,
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

			if (!isNewerReleaseVersion(currentProductVersion, parsed.productVersion)) {
				res.writeHead(204);
				res.end();
				return;
			}

			// Find the installer asset for this platform
			const assetName = getAssetName(platform, assetPrefix);
			const installerAsset = release.assets.find(a => a.name === assetName);
			if (!installerAsset) {
				log.info(`[localUpdateServer] No asset '${assetName}' in release ${release.tag_name}. Available: ${release.assets.map(a => a.name).join(', ')}`);
				res.writeHead(204);
				res.end();
				return;
			}

			const checksumName = getChecksumAssetName(platform, assetPrefix);
			const checksumAsset = release.assets.find(a => a.name === checksumName);
			if (!checksumAsset) {
				log.warn(`[localUpdateServer] No checksum asset '${checksumName}' in release ${release.tag_name}`);
				res.writeHead(204);
				res.end();
				return;
			}
			const checksumBody = await githubDownloadAssetText(owner, repo, checksumAsset.id, token);
			const sha256hash = parseUpdateChecksum(checksumBody);
			if (!sha256hash) {
				log.warn(`[localUpdateServer] Invalid checksum asset '${checksumName}' in release ${release.tag_name}`);
				res.writeHead(204);
				res.end();
				return;
			}

			const fullCommit = resolveReleaseCommit(parsed.commit, release.target_commitish);
			if (!fullCommit) {
				log.warn(`[localUpdateServer] Release ${release.tag_name} does not target a matching full commit`);
				res.writeHead(204);
				res.end();
				return;
			}

			// Build the response — url points to our local download proxy
			const downloadUrl = `http://127.0.0.1:${port}/download/${release.id}/${encodeURIComponent(installerAsset.name)}`;

			const update = {
				url: downloadUrl,
				version: fullCommit,
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
	assetPrefix: string,
	token: string | undefined,
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

	let decodedName: string;
	try {
		decodedName = decodeURIComponent(assetName);
	} catch {
		res.writeHead(400);
		res.end('Invalid asset name');
		return;
	}
	if (!isExpectedUpdateAssetName(decodedName, assetPrefix)) {
		res.writeHead(400);
		res.end('Invalid asset name');
		return;
	}

	(async () => {
		const https = await import('https');
		const releaseBody = await githubRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/${encodeURIComponent(releaseId)}`, token);
		const release: IGitHubRelease = JSON.parse(releaseBody);
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
				...(token ? { 'Authorization': `token ${token}` } : {}),
			},
		};
		const pipeDownload = (downloadRes: http.IncomingMessage): void => {
			if (downloadRes.statusCode !== 200) {
				res.writeHead(downloadRes.statusCode || 502);
				res.end('Download failed');
				return;
			}
			const contentLength = downloadRes.headers['content-length'];
			res.writeHead(200, {
				'Content-Type': 'application/octet-stream',
				...(contentLength ? { 'Content-Length': contentLength } : {}),
			});
			downloadRes.pipe(res);
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
				https.get(location, pipeDownload).on('error', (err: Error) => {
					log.warn(`[localUpdateServer] Download redirect failed: ${err}`);
					res.writeHead(502);
					res.end('Download failed');
				});
				return;
			}

			pipeDownload(proxyRes);
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

	const token = getGitHubToken();
	const { owner, repo } = releaseRepo;
	const port = productService.updateServerPort || DEFAULT_LOCAL_UPDATE_PORT;
	const assetPrefix = productService.updateAssetPrefix || DEFAULT_UPDATE_ASSET_PREFIX;

	const httpModule = await import('http');
	const server = httpModule.createServer((req, res) => {
		const urlPath = req.url || '/';
		const pathParts = urlPath.split('/').filter(Boolean);

		// Route: /api/update/{platform}/{quality}/{commit}
		if (pathParts[0] === 'api' && pathParts[1] === 'update' && pathParts.length >= 5) {
			handleUpdateCheck(req, res, pathParts, port, owner, repo, assetPrefix, productService.version, token, log);
			return;
		}

		// Route: /download/{releaseId}/{assetName}
		if (pathParts[0] === 'download' && pathParts.length >= 3) {
			handleDownloadProxy(req, res, pathParts, owner, repo, assetPrefix, token, log);
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
				}
			});
		});
	});
}
