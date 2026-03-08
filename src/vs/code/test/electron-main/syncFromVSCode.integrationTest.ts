/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import { deepStrictEqual, ok, strictEqual } from 'assert';
import { tmpdir } from 'os';
import { join } from '../../../base/common/path.js';
import { Promises } from '../../../base/node/pfs.js';
import { NullLogService } from '../../../platform/log/common/log.js';
import { flakySuite, getRandomTestPath } from '../../../base/test/node/testUtils.js';
import { doSyncFromVSCode } from '../../electron-main/syncFromVSCode.js';

/**
 * Helper: create a SQLite state.vscdb with given key/value pairs.
 */
async function createStateDb(dbPath: string, items: Map<string, string>): Promise<void> {
	const dir = join(dbPath, '..');
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
	const sqlite3 = await import('@vscode/sqlite3');
	return new Promise<void>((resolve, reject) => {
		const db = new sqlite3.default.Database(dbPath, (err: Error | null) => {
			if (err) {
				return reject(err);
			}
			db.exec(
				'CREATE TABLE IF NOT EXISTS ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB)',
				(err2: Error | null) => {
					if (err2) {
						db.close();
						return reject(err2);
					}
					const stmt = db.prepare('INSERT INTO ItemTable (key, value) VALUES (?, ?)');
					for (const [key, value] of items) {
						stmt.run(key, value);
					}
					stmt.finalize((err3: Error | null) => {
						db.close();
						if (err3) {
							return reject(err3);
						}
						resolve();
					});
				}
			);
		});
	});
}

/**
 * Helper: read all items from a state.vscdb.
 */
async function readStateDb(dbPath: string): Promise<Map<string, string>> {
	const sqlite3 = await import('@vscode/sqlite3');
	return new Promise<Map<string, string>>((resolve, reject) => {
		const OPEN_READONLY = 1;
		const db = new sqlite3.default.Database(dbPath, OPEN_READONLY, (err: Error | null) => {
			if (err) {
				return reject(err);
			}
			db.all('SELECT key, value FROM ItemTable', (err2: Error | null, rows: Array<{ key: string; value: string }>) => {
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
	});
}

flakySuite('syncFromVSCode', function () {

	let testDir: string;
	let vscodeDir: string;
	let ossDir: string;
	const log = new NullLogService();

	setup(function () {
		testDir = getRandomTestPath(tmpdir(), 'vsctests', 'syncfromvscode');
		vscodeDir = join(testDir, 'Code');
		ossDir = join(testDir, 'code-oss-dev');
		return fs.promises.mkdir(testDir, { recursive: true });
	});

	teardown(function () {
		return Promises.rm(testDir);
	});

	// -----------------------------------------------------------------------
	// Recent workspaces sync
	// -----------------------------------------------------------------------

	test('syncs recent workspaces from VS Code to Code OSS', async () => {
		const recentEntries = {
			entries: [
				{ folderUri: 'file:///c%3A/Users/test/project-a' },
				{ folderUri: 'file:///c%3A/Users/test/project-b' },
				{ fileUri: 'file:///c%3A/Users/test/file.txt' },
			]
		};

		const vsGlobalDb = join(vscodeDir, 'User', 'globalStorage', 'state.vscdb');
		await createStateDb(vsGlobalDb, new Map([
			['history.recentlyOpenedPathsList', JSON.stringify(recentEntries)]
		]));

		await doSyncFromVSCode(vscodeDir, ossDir, log);

		const ossGlobalDb = join(ossDir, 'User', 'globalStorage', 'state.vscdb');
		ok(fs.existsSync(ossGlobalDb), 'Code OSS state.vscdb should be created');

		const items = await readStateDb(ossGlobalDb);
		const ossRecents = JSON.parse(items.get('history.recentlyOpenedPathsList')!);
		deepStrictEqual(ossRecents.entries, recentEntries.entries);
	});

	test('merges recent workspaces without duplicates', async () => {
		// VS Code has entries A, B, C
		const vsRecents = {
			entries: [
				{ folderUri: 'file:///project-a' },
				{ folderUri: 'file:///project-b' },
				{ folderUri: 'file:///project-c' },
			]
		};
		const vsGlobalDb = join(vscodeDir, 'User', 'globalStorage', 'state.vscdb');
		await createStateDb(vsGlobalDb, new Map([
			['history.recentlyOpenedPathsList', JSON.stringify(vsRecents)]
		]));

		// Code OSS already has entries A and D
		const ossGlobalDb = join(ossDir, 'User', 'globalStorage', 'state.vscdb');
		const ossRecents = {
			entries: [
				{ folderUri: 'file:///project-a' },
				{ folderUri: 'file:///project-d' },
			]
		};
		await createStateDb(ossGlobalDb, new Map([
			['history.recentlyOpenedPathsList', JSON.stringify(ossRecents)]
		]));

		await doSyncFromVSCode(vscodeDir, ossDir, log);

		const items = await readStateDb(ossGlobalDb);
		const merged = JSON.parse(items.get('history.recentlyOpenedPathsList')!);
		// Code OSS entries first (A, D), then new from VS Code (B, C)
		strictEqual(merged.entries.length, 4);
		deepStrictEqual(merged.entries[0], { folderUri: 'file:///project-a' });
		deepStrictEqual(merged.entries[1], { folderUri: 'file:///project-d' });
		deepStrictEqual(merged.entries[2], { folderUri: 'file:///project-b' });
		deepStrictEqual(merged.entries[3], { folderUri: 'file:///project-c' });
	});

	test('no-op when VS Code data does not exist', async () => {
		// vscodeDir doesn't exist
		await doSyncFromVSCode(join(testDir, 'nonexistent'), ossDir, log);
		ok(!fs.existsSync(join(ossDir, 'User', 'globalStorage', 'state.vscdb')));
	});

	test('no-op when paths are the same', async () => {
		fs.mkdirSync(vscodeDir, { recursive: true });
		await doSyncFromVSCode(vscodeDir, vscodeDir, log);
		// Should simply return without error
	});

	// -----------------------------------------------------------------------
	// Chat session sync
	// -----------------------------------------------------------------------

	test('syncs new chat session from VS Code', async () => {
		const workspaceId = 'abc123';
		const sessionId = 'session-1';

		// Create VS Code workspace storage with a chat session
		const vsChatDir = join(vscodeDir, 'User', 'workspaceStorage', workspaceId, 'chatSessions');
		fs.mkdirSync(vsChatDir, { recursive: true });
		fs.writeFileSync(join(vsChatDir, `${sessionId}.jsonl`), '{"type":"request","message":"hello"}\n');

		// Create VS Code workspace state.vscdb with chat index
		const vsWsDb = join(vscodeDir, 'User', 'workspaceStorage', workspaceId, 'state.vscdb');
		const chatIndex = {
			version: 1,
			entries: {
				[sessionId]: {
					sessionId,
					title: 'Test Chat',
					lastMessageDate: 1000,
					isEmpty: false,
				}
			}
		};
		await createStateDb(vsWsDb, new Map([
			['chat.ChatSessionStore.index', JSON.stringify(chatIndex)]
		]));

		// Also need workspace.json for workspace identification
		fs.writeFileSync(join(vscodeDir, 'User', 'workspaceStorage', workspaceId, 'workspace.json'),
			JSON.stringify({ folder: 'file:///project' }));

		// Create minimal VS Code global state so the sync function proceeds
		const vsGlobalDb = join(vscodeDir, 'User', 'globalStorage', 'state.vscdb');
		await createStateDb(vsGlobalDb, new Map());

		await doSyncFromVSCode(vscodeDir, ossDir, log);

		// Verify session was copied
		const ossChatFile = join(ossDir, 'User', 'workspaceStorage', workspaceId, 'chatSessions', `${sessionId}.jsonl`);
		ok(fs.existsSync(ossChatFile), 'Session file should be copied');
		strictEqual(
			fs.readFileSync(ossChatFile, 'utf8'),
			'{"type":"request","message":"hello"}\n'
		);

		// Verify index was updated
		const ossWsDb = join(ossDir, 'User', 'workspaceStorage', workspaceId, 'state.vscdb');
		const items = await readStateDb(ossWsDb);
		const ossIndex = JSON.parse(items.get('chat.ChatSessionStore.index')!);
		ok(ossIndex.entries[sessionId], 'Session should be in index');
		strictEqual(ossIndex.entries[sessionId].title, 'Test Chat');
	});

	test('does not overwrite unchanged session on re-sync', async () => {
		const workspaceId = 'ws-rerun';
		const sessionId = 'session-unchanged';

		// Setup VS Code with one session
		const vsChatDir = join(vscodeDir, 'User', 'workspaceStorage', workspaceId, 'chatSessions');
		fs.mkdirSync(vsChatDir, { recursive: true });
		fs.writeFileSync(join(vsChatDir, `${sessionId}.jsonl`), '{"type":"request","message":"original"}\n');

		const vsWsDb = join(vscodeDir, 'User', 'workspaceStorage', workspaceId, 'state.vscdb');
		await createStateDb(vsWsDb, new Map([
			['chat.ChatSessionStore.index', JSON.stringify({
				version: 1,
				entries: { [sessionId]: { sessionId, title: 'Chat', lastMessageDate: 1000, isEmpty: false } }
			})]
		]));
		const vsGlobalDb = join(vscodeDir, 'User', 'globalStorage', 'state.vscdb');
		await createStateDb(vsGlobalDb, new Map());

		// First sync
		await doSyncFromVSCode(vscodeDir, ossDir, log);

		// Modify Code OSS's copy to verify it isn't overwritten
		const ossChatFile = join(ossDir, 'User', 'workspaceStorage', workspaceId, 'chatSessions', `${sessionId}.jsonl`);
		fs.writeFileSync(ossChatFile, '{"type":"request","message":"oss-modified"}\n');

		// Second sync — VS Code hasn't changed (same lastMessageDate)
		await doSyncFromVSCode(vscodeDir, ossDir, log);

		// Code OSS's modified version should still be there
		strictEqual(
			fs.readFileSync(ossChatFile, 'utf8'),
			'{"type":"request","message":"oss-modified"}\n'
		);
	});

	test('forks diverged session', async () => {
		const workspaceId = 'ws-fork';
		const sessionId = 'session-diverge';

		// Setup VS Code session
		const vsChatDir = join(vscodeDir, 'User', 'workspaceStorage', workspaceId, 'chatSessions');
		fs.mkdirSync(vsChatDir, { recursive: true });
		fs.writeFileSync(join(vsChatDir, `${sessionId}.jsonl`), '{"type":"request","message":"vs-updated"}\n');

		const vsWsDb = join(vscodeDir, 'User', 'workspaceStorage', workspaceId, 'state.vscdb');
		await createStateDb(vsWsDb, new Map([
			['chat.ChatSessionStore.index', JSON.stringify({
				version: 1,
				entries: { [sessionId]: { sessionId, title: 'Diverged Chat', lastMessageDate: 1000, isEmpty: false } }
			})]
		]));
		const vsGlobalDb = join(vscodeDir, 'User', 'globalStorage', 'state.vscdb');
		await createStateDb(vsGlobalDb, new Map());

		// First sync
		await doSyncFromVSCode(vscodeDir, ossDir, log);

		// Now both sides update independently:
		// VS Code adds new messages (lastMessageDate = 2000)
		fs.writeFileSync(join(vsChatDir, `${sessionId}.jsonl`), '{"type":"request","message":"vs-v2"}\n');
		// Must recreate VS Code state.vscdb with updated timestamp
		fs.unlinkSync(vsWsDb);
		await createStateDb(vsWsDb, new Map([
			['chat.ChatSessionStore.index', JSON.stringify({
				version: 1,
				entries: { [sessionId]: { sessionId, title: 'Diverged Chat', lastMessageDate: 2000, isEmpty: false } }
			})]
		]));

		// Code OSS also updates its copy (lastMessageDate = 1500)
		const ossWsDb = join(ossDir, 'User', 'workspaceStorage', workspaceId, 'state.vscdb');
		const ossItems = await readStateDb(ossWsDb);
		const ossIndex = JSON.parse(ossItems.get('chat.ChatSessionStore.index')!);
		ossIndex.entries[sessionId].lastMessageDate = 1500;

		// Rewrite Code OSS's state.vscdb with the updated index
		fs.unlinkSync(ossWsDb);
		// Carry over sync state while updating the index
		await createStateDb(ossWsDb, new Map([
			['chat.ChatSessionStore.index', JSON.stringify(ossIndex)],
			['sync.vscodeSessionState', ossItems.get('sync.vscodeSessionState')!],
			['sync.chatSessionForks', ossItems.get('sync.chatSessionForks') || '{}'],
		]));

		// Second sync — both sides changed → fork expected
		await doSyncFromVSCode(vscodeDir, ossDir, log);

		// Verify: original session in Code OSS should be untouched
		const ossChatFile = join(ossDir, 'User', 'workspaceStorage', workspaceId, 'chatSessions', `${sessionId}.jsonl`);
		ok(fs.existsSync(ossChatFile), 'Original session file should still exist');

		// Verify: a new forked session should exist
		const updatedItems = await readStateDb(ossWsDb);
		const updatedIndex = JSON.parse(updatedItems.get('chat.ChatSessionStore.index')!);
		const forks = JSON.parse(updatedItems.get('sync.chatSessionForks')!);

		// The fork should have a new session ID
		const forkedId = forks[sessionId];
		ok(forkedId, 'Fork mapping should exist');
		ok(updatedIndex.entries[forkedId], 'Forked session should be in the index');
		strictEqual(updatedIndex.entries[forkedId].title, '[VS Code] Diverged Chat');

		// The forked session file should contain VS Code's content
		const forkedFile = join(ossDir, 'User', 'workspaceStorage', workspaceId, 'chatSessions', `${forkedId}.jsonl`);
		ok(fs.existsSync(forkedFile), 'Forked session file should exist');
		strictEqual(
			fs.readFileSync(forkedFile, 'utf8'),
			'{"type":"request","message":"vs-v2"}\n'
		);
	});

	test('skips empty and external sessions', async () => {
		const workspaceId = 'ws-skip';

		const vsChatDir = join(vscodeDir, 'User', 'workspaceStorage', workspaceId, 'chatSessions');
		fs.mkdirSync(vsChatDir, { recursive: true });
		fs.writeFileSync(join(vsChatDir, 'empty-session.jsonl'), '');
		fs.writeFileSync(join(vsChatDir, 'external-session.jsonl'), '{"type":"request"}');

		const vsWsDb = join(vscodeDir, 'User', 'workspaceStorage', workspaceId, 'state.vscdb');
		await createStateDb(vsWsDb, new Map([
			['chat.ChatSessionStore.index', JSON.stringify({
				version: 1,
				entries: {
					'empty-session': { sessionId: 'empty-session', title: 'Empty', lastMessageDate: 100, isEmpty: true },
					'external-session': { sessionId: 'external-session', title: 'External', lastMessageDate: 200, isExternal: true },
				}
			})]
		]));
		const vsGlobalDb = join(vscodeDir, 'User', 'globalStorage', 'state.vscdb');
		await createStateDb(vsGlobalDb, new Map());

		await doSyncFromVSCode(vscodeDir, ossDir, log);

		const ossChatDir = join(ossDir, 'User', 'workspaceStorage', workspaceId, 'chatSessions');
		ok(!fs.existsSync(join(ossChatDir, 'empty-session.jsonl')), 'Empty session should not be synced');
		ok(!fs.existsSync(join(ossChatDir, 'external-session.jsonl')), 'External session should not be synced');
	});

	test('does not re-fork an already forked session', async () => {
		const workspaceId = 'ws-norefolk';
		const sessionId = 'session-already-forked';

		// Setup VS Code session
		const vsChatDir = join(vscodeDir, 'User', 'workspaceStorage', workspaceId, 'chatSessions');
		fs.mkdirSync(vsChatDir, { recursive: true });
		fs.writeFileSync(join(vsChatDir, `${sessionId}.jsonl`), '{"msg":"v1"}\n');

		const vsWsDb = join(vscodeDir, 'User', 'workspaceStorage', workspaceId, 'state.vscdb');
		await createStateDb(vsWsDb, new Map([
			['chat.ChatSessionStore.index', JSON.stringify({
				version: 1,
				entries: { [sessionId]: { sessionId, title: 'Already Forked', lastMessageDate: 1000, isEmpty: false } }
			})]
		]));
		const vsGlobalDb = join(vscodeDir, 'User', 'globalStorage', 'state.vscdb');
		await createStateDb(vsGlobalDb, new Map());

		// First sync to establish baseline
		await doSyncFromVSCode(vscodeDir, ossDir, log);

		// Divergence: both sides update
		fs.writeFileSync(join(vsChatDir, `${sessionId}.jsonl`), '{"msg":"v2-vs"}\n');
		fs.unlinkSync(vsWsDb);
		await createStateDb(vsWsDb, new Map([
			['chat.ChatSessionStore.index', JSON.stringify({
				version: 1,
				entries: { [sessionId]: { sessionId, title: 'Already Forked', lastMessageDate: 2000, isEmpty: false } }
			})]
		]));

		const ossWsDb = join(ossDir, 'User', 'workspaceStorage', workspaceId, 'state.vscdb');
		let ossItems = await readStateDb(ossWsDb);
		const ossIndex = JSON.parse(ossItems.get('chat.ChatSessionStore.index')!);
		ossIndex.entries[sessionId].lastMessageDate = 1500;
		fs.unlinkSync(ossWsDb);
		await createStateDb(ossWsDb, new Map([
			['chat.ChatSessionStore.index', JSON.stringify(ossIndex)],
			['sync.vscodeSessionState', ossItems.get('sync.vscodeSessionState')!],
			['sync.chatSessionForks', '{}'],
		]));

		// Second sync — triggers fork
		await doSyncFromVSCode(vscodeDir, ossDir, log);

		ossItems = await readStateDb(ossWsDb);
		const forksAfterFirst = JSON.parse(ossItems.get('sync.chatSessionForks')!);
		const forkedId = forksAfterFirst[sessionId];
		ok(forkedId, 'Should have a fork');

		// VS Code updates again (lastMessageDate = 3000)
		fs.writeFileSync(join(vsChatDir, `${sessionId}.jsonl`), '{"msg":"v3-vs"}\n');
		fs.unlinkSync(vsWsDb);
		await createStateDb(vsWsDb, new Map([
			['chat.ChatSessionStore.index', JSON.stringify({
				version: 1,
				entries: { [sessionId]: { sessionId, title: 'Already Forked', lastMessageDate: 3000, isEmpty: false } }
			})]
		]));

		// Third sync — should NOT create another fork
		await doSyncFromVSCode(vscodeDir, ossDir, log);

		const finalItems = await readStateDb(ossWsDb);
		const finalForks = JSON.parse(finalItems.get('sync.chatSessionForks')!);
		strictEqual(finalForks[sessionId], forkedId, 'Fork ID should not change');

		// Count chat session files
		const ossChatDir = join(ossDir, 'User', 'workspaceStorage', workspaceId, 'chatSessions');
		const chatFiles = fs.readdirSync(ossChatDir).filter(f => f.endsWith('.jsonl'));
		// Should be exactly 2: original + one fork (no second fork)
		strictEqual(chatFiles.length, 2, 'Should have exactly 2 session files (original + fork)');
	});
});
