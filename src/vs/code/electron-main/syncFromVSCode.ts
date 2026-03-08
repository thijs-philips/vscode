/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import { homedir } from 'os';
import { join, dirname } from '../../base/common/path.js';
import { isWindows, isMacintosh, isLinux } from '../../base/common/platform.js';
import { generateUuid } from '../../base/common/uuid.js';
import { ILogService } from '../../platform/log/common/log.js';

// ---------------------------------------------------------------------------
// Types mirroring the chat index stored in per-workspace state.vscdb
// ---------------------------------------------------------------------------

interface IChatSessionEntryMetadataRaw {
	sessionId: string;
	title: string;
	lastMessageDate: number;
	timing?: {
		created?: number;
		lastRequestStarted?: number;
		lastRequestEnded?: number;
	};
	isEmpty?: boolean;
	isExternal?: boolean;
	[key: string]: unknown;
}

interface IChatSessionIndexData {
	version: 1;
	entries: Record<string, IChatSessionEntryMetadataRaw>;
}

// ---------------------------------------------------------------------------
// Sync tracking state stored in Code OSS's state.vscdb
// ---------------------------------------------------------------------------

/** Records VS Code's lastMessageDate per session at the time we last synced. */
interface ISyncSessionState {
	[sessionId: string]: number; // lastMessageDate as seen in VS Code at last sync
}

/** Records session IDs that were forked due to divergence; prevents re-forking. */
interface ISyncSessionForks {
	[originalSessionId: string]: string; // new session ID in Code OSS
}

// ---------------------------------------------------------------------------
// Low-level SQLite helpers using @vscode/sqlite3
// ---------------------------------------------------------------------------

interface ISqliteRow {
	key: string;
	value: string;
}

/**
 * Opens a SQLite database at `path` in read-only mode and returns a Map of
 * all rows from `ItemTable`. This is the same table layout VS Code's
 * `SQLiteStorageDatabase` uses.
 */
function readSqliteItems(path: string): Promise<Map<string, string>> {
	return new Promise((resolve, reject) => {
		import('@vscode/sqlite3').then(sqlite3 => {
			const OPEN_READONLY = 1; // sqlite3.OPEN_READONLY
			const db = new sqlite3.default.Database(path, OPEN_READONLY, (err: Error | null) => {
				if (err) {
					return reject(err);
				}
				db.all('SELECT key, value FROM ItemTable', (err2: Error | null, rows: ISqliteRow[]) => {
					db.close();
					if (err2) {
						return reject(err2);
					}
					const map = new Map<string, string>();
					if (rows) {
						for (const row of rows) {
							map.set(row.key, row.value);
						}
					}
					resolve(map);
				});
			});
		}, reject);
	});
}

/**
 * Upserts a key/value pair into `ItemTable` of an existing SQLite database.
 */
function writeSqliteItem(path: string, key: string, value: string): Promise<void> {
	return new Promise((resolve, reject) => {
		import('@vscode/sqlite3').then(sqlite3 => {
			const db = new sqlite3.default.Database(path, (err: Error | null) => {
				if (err) {
					return reject(err);
				}
				db.run(
					'INSERT INTO ItemTable (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
					[key, value],
					(err2: Error | null) => {
						db.close();
						if (err2) {
							return reject(err2);
						}
						resolve();
					}
				);
			});
		}, reject);
	});
}

/**
 * Ensures the database at `path` exists with the ItemTable schema.
 * Creates the file if it does not exist.
 */
function ensureSqliteDb(path: string): Promise<void> {
	return new Promise((resolve, reject) => {
		import('@vscode/sqlite3').then(sqlite3 => {
			const db = new sqlite3.default.Database(path, (err: Error | null) => {
				if (err) {
					return reject(err);
				}
				db.exec(
					'PRAGMA user_version = 1; CREATE TABLE IF NOT EXISTS ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB)',
					(err2: Error | null) => {
						db.close();
						if (err2) {
							return reject(err2);
						}
						resolve();
					}
				);
			});
		}, reject);
	});
}

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

/**
 * Returns the user-data path that the official VS Code (stable) uses.
 * This is the "Code" folder inside the platform's app-data directory.
 */
function getVSCodeUserDataPath(): string {
	if (isWindows) {
		const appData = process.env['APPDATA'];
		if (!appData) {
			const userProfile = process.env['USERPROFILE'];
			if (!userProfile) {
				throw new Error('Cannot determine APPDATA');
			}
			return join(userProfile, 'AppData', 'Roaming', 'Code');
		}
		return join(appData, 'Code');
	}
	if (isMacintosh) {
		return join(homedir(), 'Library', 'Application Support', 'Code');
	}
	if (isLinux) {
		const xdg = process.env['XDG_CONFIG_HOME'];
		return join(xdg || join(homedir(), '.config'), 'Code');
	}
	throw new Error('Unsupported platform');
}

function mkdirpSync(dir: string): void {
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
}

// ---------------------------------------------------------------------------
// Recent Workspaces sync
// ---------------------------------------------------------------------------

interface ISerializedRecentEntry {
	workspace?: { id: string; configPath: string };
	folderUri?: string;
	fileUri?: string;
	label?: string;
	remoteAuthority?: string;
}

interface ISerializedRecentlyOpened {
	entries: ISerializedRecentEntry[];
}

function entryKey(entry: ISerializedRecentEntry): string {
	if (entry.workspace) {
		return `ws:${entry.workspace.configPath}`;
	}
	if (entry.folderUri) {
		return `folder:${entry.folderUri}`;
	}
	if (entry.fileUri) {
		return `file:${entry.fileUri}`;
	}
	return '';
}

async function syncRecentWorkspaces(
	vscodeDataPath: string,
	ossDataPath: string,
	log: ILogService,
): Promise<void> {
	const vscodeSqlitePath = join(vscodeDataPath, 'User', 'globalStorage', 'state.vscdb');
	const ossSqlitePath = join(ossDataPath, 'User', 'globalStorage', 'state.vscdb');

	if (!fs.existsSync(vscodeSqlitePath)) {
		log.debug('[syncFromVSCode] VS Code global state.vscdb not found, skipping recent workspaces sync');
		return;
	}

	const storageKey = 'history.recentlyOpenedPathsList';

	// Read VS Code's recent entries
	let vscodeItems: Map<string, string>;
	try {
		vscodeItems = await readSqliteItems(vscodeSqlitePath);
	} catch (e) {
		log.warn(`[syncFromVSCode] Could not read VS Code state.vscdb: ${e}`);
		return;
	}

	const vscodeRaw = vscodeItems.get(storageKey);
	if (!vscodeRaw) {
		log.debug('[syncFromVSCode] No recent workspaces in VS Code');
		return;
	}

	let vscodeRecents: ISerializedRecentlyOpened;
	try {
		vscodeRecents = JSON.parse(vscodeRaw);
	} catch {
		log.warn('[syncFromVSCode] Could not parse VS Code recent workspaces');
		return;
	}

	if (!Array.isArray(vscodeRecents.entries)) {
		return;
	}

	// Read Code OSS's recent entries (may not exist yet)
	let ossRecents: ISerializedRecentlyOpened = { entries: [] };
	if (fs.existsSync(ossSqlitePath)) {
		try {
			const ossItems = await readSqliteItems(ossSqlitePath);
			const ossRaw = ossItems.get(storageKey);
			if (ossRaw) {
				ossRecents = JSON.parse(ossRaw);
				if (!Array.isArray(ossRecents.entries)) {
					ossRecents = { entries: [] };
				}
			}
		} catch {
			// Continue with empty OSS recents
		}
	}

	// Merge: Code OSS entries take priority (preserve their order),
	// then append VS Code entries that are new.
	const ossKeys = new Set(ossRecents.entries.map(entryKey));
	let addedCount = 0;
	for (const entry of vscodeRecents.entries) {
		const key = entryKey(entry);
		if (key && !ossKeys.has(key)) {
			ossRecents.entries.push(entry);
			ossKeys.add(key);
			addedCount++;
		}
	}

	if (addedCount === 0) {
		log.debug('[syncFromVSCode] No new recent workspaces to sync');
		return;
	}

	// Ensure the target directory + DB exists
	const ossDbDir = dirname(ossSqlitePath);
	mkdirpSync(ossDbDir);
	if (!fs.existsSync(ossSqlitePath)) {
		await ensureSqliteDb(ossSqlitePath);
	}

	await writeSqliteItem(ossSqlitePath, storageKey, JSON.stringify(ossRecents));
	log.info(`[syncFromVSCode] Synced ${addedCount} recent workspace(s) from VS Code`);
}

// ---------------------------------------------------------------------------
// Chat Sessions sync
// ---------------------------------------------------------------------------

async function syncChatSessionsForWorkspace(
	vscodeWsDir: string,
	ossWsDir: string,
	log: ILogService,
): Promise<void> {
	const vscodeChatDir = join(vscodeWsDir, 'chatSessions');
	if (!fs.existsSync(vscodeChatDir)) {
		return; // No chat sessions in this workspace
	}

	const vscodeSqlite = join(vscodeWsDir, 'state.vscdb');
	const ossSqlite = join(ossWsDir, 'state.vscdb');
	const ossChatDir = join(ossWsDir, 'chatSessions');
	const chatIndexKey = 'chat.ChatSessionStore.index';
	const syncStateKey = 'sync.vscodeSessionState';
	const syncForksKey = 'sync.chatSessionForks';

	// Read VS Code's chat index from its workspace state.vscdb
	let vscodeIndex: IChatSessionIndexData | undefined;
	if (fs.existsSync(vscodeSqlite)) {
		try {
			const items = await readSqliteItems(vscodeSqlite);
			const raw = items.get(chatIndexKey);
			if (raw) {
				const parsed = JSON.parse(raw);
				if (parsed && parsed.version === 1 && parsed.entries) {
					vscodeIndex = parsed;
				}
			}
		} catch (e) {
			log.warn(`[syncFromVSCode] Could not read VS Code workspace state: ${e}`);
			return;
		}
	}

	if (!vscodeIndex || Object.keys(vscodeIndex.entries).length === 0) {
		return; // Nothing to sync
	}

	// Ensure Code OSS workspace storage directory exists
	mkdirpSync(ossWsDir);

	// Copy workspace.json if we need to create the workspace folder
	const vscodeWsJson = join(vscodeWsDir, 'workspace.json');
	const ossWsJson = join(ossWsDir, 'workspace.json');
	if (fs.existsSync(vscodeWsJson) && !fs.existsSync(ossWsJson)) {
		fs.copyFileSync(vscodeWsJson, ossWsJson);
	}

	// Ensure Code OSS's state.vscdb exists
	if (!fs.existsSync(ossSqlite)) {
		await ensureSqliteDb(ossSqlite);
	}

	// Read Code OSS's chat index
	let ossIndex: IChatSessionIndexData = { version: 1, entries: {} };
	try {
		const items = await readSqliteItems(ossSqlite);
		const raw = items.get(chatIndexKey);
		if (raw) {
			const parsed = JSON.parse(raw);
			if (parsed && parsed.version === 1 && parsed.entries) {
				ossIndex = parsed;
			}
		}
	} catch {
		// Continue with empty index
	}

	// Read sync tracking state from Code OSS's state.vscdb
	let syncState: ISyncSessionState = {};
	let syncForks: ISyncSessionForks = {};
	try {
		const items = await readSqliteItems(ossSqlite);
		const stateRaw = items.get(syncStateKey);
		if (stateRaw) {
			syncState = JSON.parse(stateRaw);
		}
		const forksRaw = items.get(syncForksKey);
		if (forksRaw) {
			syncForks = JSON.parse(forksRaw);
		}
	} catch {
		// Continue with empty state
	}

	// Ensure chat sessions directory exists in Code OSS
	mkdirpSync(ossChatDir);

	let syncedCount = 0;
	let forkedCount = 0;

	for (const [sessionId, vscodeMeta] of Object.entries(vscodeIndex.entries)) {
		// Skip external sessions (e.g., from providers)
		if (vscodeMeta.isExternal) {
			continue;
		}

		// Skip empty sessions
		if (vscodeMeta.isEmpty) {
			continue;
		}

		// Already forked? Don't re-process.
		if (syncForks[sessionId]) {
			continue;
		}

		// Find the session file in VS Code's chatSessions folder
		const vscodeJsonl = join(vscodeChatDir, `${sessionId}.jsonl`);
		const vscodeJson = join(vscodeChatDir, `${sessionId}.json`);
		let vscodeSessionFile: string | undefined;
		let vscodeSessionExt: string;

		if (fs.existsSync(vscodeJsonl)) {
			vscodeSessionFile = vscodeJsonl;
			vscodeSessionExt = '.jsonl';
		} else if (fs.existsSync(vscodeJson)) {
			vscodeSessionFile = vscodeJson;
			vscodeSessionExt = '.json';
		} else {
			continue; // No file on disk
		}

		const ossMeta = ossIndex.entries[sessionId];
		const lastSyncedDate = syncState[sessionId];

		if (!ossMeta) {
			// Case 1: New session — copy it
			const ossTarget = join(ossChatDir, `${sessionId}${vscodeSessionExt}`);
			try {
				fs.copyFileSync(vscodeSessionFile, ossTarget);
				ossIndex.entries[sessionId] = { ...vscodeMeta };
				syncState[sessionId] = vscodeMeta.lastMessageDate;
				syncedCount++;
			} catch (e) {
				log.warn(`[syncFromVSCode] Could not copy session ${sessionId}: ${e}`);
			}
		} else if (vscodeMeta.lastMessageDate === lastSyncedDate) {
			// Case 2: VS Code session unchanged since last sync — skip
			continue;
		} else if (ossMeta.lastMessageDate === lastSyncedDate || lastSyncedDate === undefined) {
			// Case 3: VS Code updated, Code OSS unchanged since last sync (or first sync)
			// Safe to overwrite Code OSS's copy
			if (lastSyncedDate !== undefined || ossMeta.lastMessageDate <= vscodeMeta.lastMessageDate) {
				const ossTarget = join(ossChatDir, `${sessionId}${vscodeSessionExt}`);
				try {
					fs.copyFileSync(vscodeSessionFile, ossTarget);
					ossIndex.entries[sessionId] = { ...vscodeMeta };
					syncState[sessionId] = vscodeMeta.lastMessageDate;
					syncedCount++;
				} catch (e) {
					log.warn(`[syncFromVSCode] Could not overwrite session ${sessionId}: ${e}`);
				}
			}
		} else {
			// Case 4: Both sides changed — fork
			// Keep Code OSS's version untouched. Import VS Code's version as a new session.
			const newSessionId = generateUuid();
			const ossTarget = join(ossChatDir, `${newSessionId}${vscodeSessionExt}`);
			try {
				fs.copyFileSync(vscodeSessionFile, ossTarget);
				const forkedMeta: IChatSessionEntryMetadataRaw = {
					...vscodeMeta,
					sessionId: newSessionId,
					title: `[VS Code] ${vscodeMeta.title}`,
				};
				ossIndex.entries[newSessionId] = forkedMeta;
				syncForks[sessionId] = newSessionId;
				syncState[sessionId] = vscodeMeta.lastMessageDate;
				forkedCount++;
			} catch (e) {
				log.warn(`[syncFromVSCode] Could not fork session ${sessionId}: ${e}`);
			}
		}
	}

	if (syncedCount === 0 && forkedCount === 0) {
		return; // Nothing changed
	}

	// Persist updated index and sync state
	try {
		await writeSqliteItem(ossSqlite, chatIndexKey, JSON.stringify(ossIndex));
		await writeSqliteItem(ossSqlite, syncStateKey, JSON.stringify(syncState));
		await writeSqliteItem(ossSqlite, syncForksKey, JSON.stringify(syncForks));
	} catch (e) {
		log.warn(`[syncFromVSCode] Could not persist sync state: ${e}`);
	}

	log.info(`[syncFromVSCode] Chat sync for workspace dir ${dirname(ossWsDir).split(/[\\/]/).pop()}: ${syncedCount} synced, ${forkedCount} forked`);
}

async function syncAllChatSessions(
	vscodeDataPath: string,
	ossDataPath: string,
	log: ILogService,
): Promise<void> {
	const vscodeWsStorage = join(vscodeDataPath, 'User', 'workspaceStorage');
	if (!fs.existsSync(vscodeWsStorage)) {
		log.debug('[syncFromVSCode] VS Code workspaceStorage not found, skipping chat sync');
		return;
	}

	const ossWsStorage = join(ossDataPath, 'User', 'workspaceStorage');

	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(vscodeWsStorage, { withFileTypes: true });
	} catch {
		return;
	}

	for (const entry of entries) {
		if (!entry.isDirectory()) {
			continue;
		}

		const vscodeWsDir = join(vscodeWsStorage, entry.name);
		const ossWsDir = join(ossWsStorage, entry.name);

		try {
			await syncChatSessionsForWorkspace(vscodeWsDir, ossWsDir, log);
		} catch (e) {
			log.warn(`[syncFromVSCode] Error syncing chat for workspace ${entry.name}: ${e}`);
		}
	}

	// Also sync empty-window sessions
	const vscodeEmptyChat = join(vscodeDataPath, 'User', 'globalStorage', 'emptyWindowChatSessions');
	const ossEmptyChat = join(ossDataPath, 'User', 'globalStorage', 'emptyWindowChatSessions');
	if (fs.existsSync(vscodeEmptyChat)) {
		try {
			await syncEmptyWindowChatSessions(vscodeEmptyChat, ossEmptyChat, vscodeDataPath, ossDataPath, log);
		} catch (e) {
			log.warn(`[syncFromVSCode] Error syncing empty-window chat: ${e}`);
		}
	}
}

async function syncEmptyWindowChatSessions(
	vscodeChatDir: string,
	ossChatDir: string,
	vscodeDataPath: string,
	ossDataPath: string,
	log: ILogService,
): Promise<void> {
	// Empty-window sessions use a different pattern: the chat index is stored
	// in the global (application-scope) state.vscdb, not a workspace one.
	// The files live in globalStorage/emptyWindowChatSessions/.
	const vscodeSqlite = join(vscodeDataPath, 'User', 'globalStorage', 'state.vscdb');
	const ossSqlite = join(ossDataPath, 'User', 'globalStorage', 'state.vscdb');
	const chatIndexKey = 'chat.ChatSessionStore.index';
	const syncStateKey = 'sync.emptyWindowSessionState';
	const syncForksKey = 'sync.emptyWindowSessionForks';

	if (!fs.existsSync(vscodeSqlite)) {
		return;
	}

	let vscodeIndex: IChatSessionIndexData | undefined;
	try {
		const items = await readSqliteItems(vscodeSqlite);
		const raw = items.get(chatIndexKey);
		if (raw) {
			const parsed = JSON.parse(raw);
			if (parsed && parsed.version === 1 && parsed.entries) {
				vscodeIndex = parsed;
			}
		}
	} catch {
		return;
	}

	if (!vscodeIndex || Object.keys(vscodeIndex.entries).length === 0) {
		return;
	}

	// The empty-window chat index is stored in the global state.vscdb with
	// APPLICATION scope. However, it may conflict with the Code OSS's own
	// application-scoped chat index. We handle this carefully by using
	// separate sync tracking keys for empty-window sessions.

	mkdirpSync(ossChatDir);
	if (!fs.existsSync(ossSqlite)) {
		await ensureSqliteDb(ossSqlite);
	}

	let ossIndex: IChatSessionIndexData = { version: 1, entries: {} };
	let syncState: ISyncSessionState = {};
	let syncForks: ISyncSessionForks = {};
	try {
		const items = await readSqliteItems(ossSqlite);
		const raw = items.get(chatIndexKey);
		if (raw) {
			const parsed = JSON.parse(raw);
			if (parsed?.version === 1 && parsed.entries) {
				ossIndex = parsed;
			}
		}
		const stateRaw = items.get(syncStateKey);
		if (stateRaw) {
			syncState = JSON.parse(stateRaw);
		}
		const forksRaw = items.get(syncForksKey);
		if (forksRaw) {
			syncForks = JSON.parse(forksRaw);
		}
	} catch {
		// Continue with defaults
	}

	let syncedCount = 0;
	let forkedCount = 0;

	for (const [sessionId, vscodeMeta] of Object.entries(vscodeIndex.entries)) {
		if (vscodeMeta.isExternal || vscodeMeta.isEmpty) {
			continue;
		}
		if (syncForks[sessionId]) {
			continue;
		}

		// Find file
		const vscodeJsonl = join(vscodeChatDir, `${sessionId}.jsonl`);
		const vscodeJson = join(vscodeChatDir, `${sessionId}.json`);
		let vscodeSessionFile: string | undefined;
		let ext: string;
		if (fs.existsSync(vscodeJsonl)) {
			vscodeSessionFile = vscodeJsonl;
			ext = '.jsonl';
		} else if (fs.existsSync(vscodeJson)) {
			vscodeSessionFile = vscodeJson;
			ext = '.json';
		} else {
			continue;
		}

		const ossMeta = ossIndex.entries[sessionId];
		const lastSyncedDate = syncState[sessionId];

		if (!ossMeta) {
			// New session
			const ossTarget = join(ossChatDir, `${sessionId}${ext}`);
			try {
				fs.copyFileSync(vscodeSessionFile, ossTarget);
				ossIndex.entries[sessionId] = { ...vscodeMeta };
				syncState[sessionId] = vscodeMeta.lastMessageDate;
				syncedCount++;
			} catch (e) {
				log.warn(`[syncFromVSCode] Could not copy empty-window session ${sessionId}: ${e}`);
			}
		} else if (vscodeMeta.lastMessageDate === lastSyncedDate) {
			continue; // Unchanged
		} else if (ossMeta.lastMessageDate === lastSyncedDate || lastSyncedDate === undefined) {
			if (lastSyncedDate !== undefined || ossMeta.lastMessageDate <= vscodeMeta.lastMessageDate) {
				const ossTarget = join(ossChatDir, `${sessionId}${ext}`);
				try {
					fs.copyFileSync(vscodeSessionFile, ossTarget);
					ossIndex.entries[sessionId] = { ...vscodeMeta };
					syncState[sessionId] = vscodeMeta.lastMessageDate;
					syncedCount++;
				} catch (e) {
					log.warn(`[syncFromVSCode] Could not overwrite empty-window session ${sessionId}: ${e}`);
				}
			}
		} else {
			// Fork
			const newSessionId = generateUuid();
			const ossTarget = join(ossChatDir, `${newSessionId}${ext}`);
			try {
				fs.copyFileSync(vscodeSessionFile, ossTarget);
				ossIndex.entries[newSessionId] = {
					...vscodeMeta,
					sessionId: newSessionId,
					title: `[VS Code] ${vscodeMeta.title}`,
				};
				syncForks[sessionId] = newSessionId;
				syncState[sessionId] = vscodeMeta.lastMessageDate;
				forkedCount++;
			} catch (e) {
				log.warn(`[syncFromVSCode] Could not fork empty-window session ${sessionId}: ${e}`);
			}
		}
	}

	if (syncedCount > 0 || forkedCount > 0) {
		try {
			await writeSqliteItem(ossSqlite, chatIndexKey, JSON.stringify(ossIndex));
			await writeSqliteItem(ossSqlite, syncStateKey, JSON.stringify(syncState));
			await writeSqliteItem(ossSqlite, syncForksKey, JSON.stringify(syncForks));
		} catch (e) {
			log.warn(`[syncFromVSCode] Could not persist empty-window sync state: ${e}`);
		}
		log.info(`[syncFromVSCode] Empty-window chat sync: ${syncedCount} synced, ${forkedCount} forked`);
	}
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Internal implementation – accepts both source and target paths, making it testable.
 */
export async function doSyncFromVSCode(vscodeDataPath: string, ossDataPath: string, log: ILogService): Promise<void> {
	if (!fs.existsSync(vscodeDataPath)) {
		log.debug('[syncFromVSCode] VS Code data directory not found, skipping sync');
		return;
	}

	if (vscodeDataPath === ossDataPath) {
		log.debug('[syncFromVSCode] VS Code and Code OSS share the same data path, skipping sync');
		return;
	}

	log.info(`[syncFromVSCode] Starting one-way sync from VS Code (${vscodeDataPath}) to Code OSS (${ossDataPath})`);

	try {
		await syncRecentWorkspaces(vscodeDataPath, ossDataPath, log);
	} catch (e) {
		log.warn(`[syncFromVSCode] Error syncing recent workspaces: ${e}`);
	}

	try {
		await syncAllChatSessions(vscodeDataPath, ossDataPath, log);
	} catch (e) {
		log.warn(`[syncFromVSCode] Error syncing chat sessions: ${e}`);
	}

	log.info('[syncFromVSCode] Sync complete');
}

/**
 * Performs a one-way sync of recent workspaces and Copilot chat sessions
 * from VS Code (stable) into Code OSS. This function is safe to call
 * at every startup — it is idempotent and all failures are non-fatal.
 *
 * @param ossDataPath The Code OSS user-data directory (e.g. `%APPDATA%/.vscode-oss-dev`)
 * @param log A logger instance
 */
export async function syncFromVSCode(ossDataPath: string, log: ILogService): Promise<void> {
	let vscodeDataPath: string;
	try {
		vscodeDataPath = getVSCodeUserDataPath();
	} catch (e) {
		log.debug(`[syncFromVSCode] Could not determine VS Code data path: ${e}`);
		return;
	}

	await doSyncFromVSCode(vscodeDataPath, ossDataPath, log);
}
