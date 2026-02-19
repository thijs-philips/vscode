/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { MainContext, MainThreadMenusShape, IMenuItemInfoDto } from '../../common/extHost.protocol.js';
import { mock } from '../../../../base/test/common/mock.js';
import { TestRPCProtocol } from '../common/testRPCProtocol.js';
import { ExtHostMenus } from '../../common/extHostMenus.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';

suite('ExtHostMenus', () => {

	const disposables = new DisposableStore();
	let extHostMenus: ExtHostMenus;
	let rpcProtocol: TestRPCProtocol;
	let addedItems: { handle: number; menuId: string; commandId?: string; submenuId?: string; title: string; group?: string; order?: number }[];
	let removedHandles: number[];
	let menuItems: IMenuItemInfoDto[];

	setup(() => {
		addedItems = [];
		removedHandles = [];
		menuItems = [];

		rpcProtocol = new TestRPCProtocol();
		rpcProtocol.set(MainContext.MainThreadMenus, new class extends mock<MainThreadMenusShape>() {
			override async $getMenuItems(_menuId: string): Promise<IMenuItemInfoDto[]> {
				return menuItems.filter(i => i.menuId === _menuId);
			}
			override $addMenuItem(handle: number, menuId: string, commandId: string, title: string, group: string | undefined, order: number | undefined): void {
				addedItems.push({ handle, menuId, commandId, title, group, order });
			}
			override $addSubmenu(handle: number, menuId: string, submenuId: string, title: string, group: string | undefined, order: number | undefined): void {
				addedItems.push({ handle, menuId, submenuId, title, group, order });
			}
			override $removeMenuItem(handle: number): void {
				removedHandles.push(handle);
			}
		});

		extHostMenus = new ExtHostMenus(rpcProtocol);
	});

	teardown(async () => {
		disposables.clear();
		await rpcProtocol.sync();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('getMenuItems returns items from main thread', async () => {
		menuItems = [
			{ menuId: 'MenubarFileMenu', commandId: 'workbench.action.newFile', title: 'New File', group: '1_new', order: 1, submenuId: undefined, isBuiltin: true },
			{ menuId: 'MenubarFileMenu', commandId: 'workbench.action.openFile', title: 'Open File', group: '2_open', order: 1, submenuId: undefined, isBuiltin: true },
		];

		const items = await extHostMenus.getMenuItems('MenubarFileMenu');
		// JSON serialization strips undefined values, so submenuId won't be present
		assert.strictEqual(items.length, 2);
		assert.strictEqual(items[0].commandId, 'workbench.action.newFile');
		assert.strictEqual(items[0].title, 'New File');
		assert.strictEqual(items[0].isBuiltin, true);
		assert.strictEqual(items[1].commandId, 'workbench.action.openFile');
	});

	test('getMenuItems returns empty for unknown menu', async () => {
		const items = await extHostMenus.getMenuItems('UnknownMenu');
		assert.deepStrictEqual(items, []);
	});

	test('addMenuItem calls main thread and returns disposable', async () => {
		const disposable = extHostMenus.addMenuItem('MenubarFileMenu', {
			commandId: 'myExtension.myCommand',
			title: 'My Command',
			group: '1_new',
			order: 10,
		});
		disposables.add(disposable);

		await rpcProtocol.sync();

		assert.strictEqual(addedItems.length, 1);
		assert.strictEqual(addedItems[0].menuId, 'MenubarFileMenu');
		assert.strictEqual(addedItems[0].commandId, 'myExtension.myCommand');
		assert.strictEqual(addedItems[0].title, 'My Command');
		assert.strictEqual(addedItems[0].group, '1_new');
		assert.strictEqual(addedItems[0].order, 10);
	});

	test('addMenuItem dispose removes item', async () => {
		const disposable = extHostMenus.addMenuItem('MenubarFileMenu', {
			commandId: 'myExtension.myCommand',
			title: 'My Command',
		});

		await rpcProtocol.sync();
		assert.strictEqual(removedHandles.length, 0);

		disposable.dispose();
		await rpcProtocol.sync();

		assert.strictEqual(removedHandles.length, 1);
		assert.strictEqual(removedHandles[0], addedItems[0].handle);
	});

	test('addSubmenu returns submenuId and disposable', async () => {
		const result = extHostMenus.addSubmenu('MenubarMainMenu', {
			title: 'My Menu',
			group: 'navigation',
			order: 5,
		});
		disposables.add(result.disposable);

		await rpcProtocol.sync();

		assert.ok(result.submenuId);
		assert.ok(result.submenuId.startsWith('extHostSubmenu.'));
		assert.strictEqual(addedItems.length, 1);
		assert.strictEqual(addedItems[0].menuId, 'MenubarMainMenu');
		assert.strictEqual(addedItems[0].title, 'My Menu');
	});

	test('addSubmenu dispose removes submenu', async () => {
		const result = extHostMenus.addSubmenu('MenubarMainMenu', {
			title: 'My Menu',
		});

		await rpcProtocol.sync();
		assert.strictEqual(removedHandles.length, 0);

		result.disposable.dispose();
		await rpcProtocol.sync();

		assert.strictEqual(removedHandles.length, 1);
		assert.strictEqual(removedHandles[0], addedItems[0].handle);
	});

	test('handles are unique across add calls', async () => {
		const d1 = extHostMenus.addMenuItem('MenubarFileMenu', { commandId: 'cmd1', title: 'Cmd 1' });
		const d2 = extHostMenus.addMenuItem('MenubarFileMenu', { commandId: 'cmd2', title: 'Cmd 2' });
		const result = extHostMenus.addSubmenu('MenubarMainMenu', { title: 'Sub' });
		disposables.add(d1);
		disposables.add(d2);
		disposables.add(result.disposable);

		await rpcProtocol.sync();

		const handles = addedItems.map(i => i.handle);
		assert.strictEqual(new Set(handles).size, handles.length, 'All handles should be unique');
	});

	test('$onDidChangeMenu fires event', () => {
		const received: string[] = [];
		disposables.add(extHostMenus.onDidChangeMenu(menuId => received.push(menuId)));

		extHostMenus.$onDidChangeMenu('MenubarFileMenu');
		extHostMenus.$onDidChangeMenu('EditorContext');

		assert.deepStrictEqual(received, ['MenubarFileMenu', 'EditorContext']);
	});
});
