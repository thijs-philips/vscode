/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap } from '../../../base/common/lifecycle.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { MainContext, MainThreadMenusShape, ExtHostMenusShape, ExtHostContext, IMenuItemInfoDto } from '../common/extHost.protocol.js';
import { MenuId, MenuRegistry, isIMenuItem, isISubmenuItem } from '../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../platform/commands/common/commands.js';
import { ILocalizedString } from '../../../platform/action/common/action.js';

@extHostNamedCustomer(MainContext.MainThreadMenus)
export class MainThreadMenus extends Disposable implements MainThreadMenusShape {

	private readonly _proxy: ExtHostMenusShape;
	private readonly _itemDisposables = this._register(new DisposableMap<number>());
	private readonly _extensionAddedCommands = new Set<string>();

	constructor(
		extHostContext: IExtHostContext,
	) {
		super();
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostMenus);

		// Listen for menu changes and forward to ext host
		this._register(MenuRegistry.onDidChangeMenu(e => {
			// Find which known menu IDs changed and notify the ext host
			// We check statically known menus plus dynamically created ones
			const menuIds = this._getKnownMenuIds();
			for (const menuId of menuIds) {
				if (e.has(menuId)) {
					this._proxy.$onDidChangeMenu(menuId.id);
				}
			}
		}));
	}

	private _getKnownMenuIds(): MenuId[] {
		// Get all MenuId instances from the static fields on MenuId
		const result: MenuId[] = [];
		const menuIdClass = MenuId as unknown as Record<string, unknown>;
		const keys = Object.keys(menuIdClass);
		for (const key of keys) {
			const val = menuIdClass[key];
			if (val instanceof MenuId) {
				result.push(val);
			}
		}
		return result;
	}

	private _resolveTitle(title: string | ILocalizedString | { value: string; original: string }): string {
		if (typeof title === 'string') {
			return title;
		}
		if (typeof title === 'object' && title !== null && typeof (title as ILocalizedString).value === 'string') {
			return (title as ILocalizedString).value;
		}
		return String(title);
	}

	async $getMenuItems(menuId: string): Promise<IMenuItemInfoDto[]> {
		const id = MenuId.for(menuId);
		const items = MenuRegistry.getMenuItems(id);
		const result: IMenuItemInfoDto[] = [];

		for (const item of items) {
			if (isIMenuItem(item)) {
				const commandId = item.command.id;
				result.push({
					menuId,
					commandId,
					title: this._resolveTitle(item.command.title),
					group: item.group,
					order: item.order,
					submenuId: undefined,
					isBuiltin: !this._extensionAddedCommands.has(commandId),
				});
			} else if (isISubmenuItem(item)) {
				result.push({
					menuId,
					commandId: undefined,
					title: this._resolveTitle(item.title),
					group: item.group,
					order: item.order,
					submenuId: item.submenu.id,
					isBuiltin: true, // submenus added via this API are tracked by handle
				});
			}
		}

		return result;
	}

	$addMenuItem(handle: number, menuId: string, commandId: string, title: string, group: string | undefined, order: number | undefined): void {
		const id = MenuId.for(menuId);

		// Register the command if it doesn't exist yet
		const existingCommand = CommandsRegistry.getCommand(commandId);
		if (!existingCommand) {
			// Register a no-op command so the menu item can render;
			// the actual handler is expected to be registered by the extension via commands.registerCommand
			CommandsRegistry.registerCommand(commandId, () => { });
		}

		// Add the command to the MenuRegistry
		const disposable = MenuRegistry.appendMenuItem(id, {
			command: {
				id: commandId,
				title,
			},
			group,
			order,
		});

		this._extensionAddedCommands.add(commandId);
		this._itemDisposables.set(handle, disposable);
	}

	$addSubmenu(handle: number, menuId: string, submenuId: string, title: string, group: string | undefined, order: number | undefined): void {
		const parentId = MenuId.for(menuId);
		const submenu = MenuId.for(submenuId);

		const disposable = MenuRegistry.appendMenuItem(parentId, {
			submenu,
			title: { value: title, original: title },
			group,
			order,
		});

		this._itemDisposables.set(handle, disposable);
	}

	$removeMenuItem(handle: number): void {
		this._itemDisposables.deleteAndDispose(handle);
	}
}
