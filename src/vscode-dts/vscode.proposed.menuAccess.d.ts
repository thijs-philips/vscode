/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/XXXXX

	/**
	 * Information about a menu item in the menu bar or any other menu.
	 */
	export interface MenuItemInfo {
		/**
		 * The identifier of the menu this item belongs to, e.g. `'MenubarFileMenu'`.
		 */
		readonly menuId: string;

		/**
		 * The command identifier associated with this menu item.
		 * For submenus, this is `undefined`.
		 */
		readonly commandId: string | undefined;

		/**
		 * The display title of this menu item.
		 */
		readonly title: string;

		/**
		 * The group this menu item belongs to, e.g. `'navigation'` or `'1_modification'`.
		 */
		readonly group: string | undefined;

		/**
		 * The order of this menu item within its group.
		 */
		readonly order: number | undefined;

		/**
		 * If this menu item is a submenu, the identifier of the submenu.
		 */
		readonly submenuId: string | undefined;

		/**
		 * Whether this menu item is a built-in item provided by the editor itself
		 * rather than by an extension via this API.
		 */
		readonly isBuiltin: boolean;
	}

	/**
	 * Options for adding a new menu item.
	 */
	export interface MenuItemOptions {
		/**
		 * The command to execute when the menu item is selected.
		 * The command must already be registered via {@link commands.registerCommand}.
		 */
		commandId: string;

		/**
		 * The display title for the menu item.
		 */
		title: string;

		/**
		 * The group to place the menu item in, e.g. `'navigation'`.
		 * Items are sorted by group first, then by order within the group.
		 */
		group?: string;

		/**
		 * The sort order within the group. Lower numbers appear first.
		 */
		order?: number;
	}

	/**
	 * Options for adding a new submenu.
	 */
	export interface SubmenuOptions {
		/**
		 * The display title for the submenu.
		 */
		title: string;

		/**
		 * The group to place the submenu in.
		 */
		group?: string;

		/**
		 * The sort order within the group.
		 */
		order?: number;
	}

	/**
	 * Namespace for accessing and manipulating editor menus programmatically.
	 *
	 * This API provides read access to all menu items and the ability to add
	 * new items or submenus to any menu location.
	 */
	export namespace menus {
		/**
		 * Get a snapshot of all items in a given menu.
		 *
		 * @param menuId The identifier of the menu, e.g. `'MenubarFileMenu'`,
		 *   `'MenubarMainMenu'`, `'EditorContext'`, etc.
		 * @returns A thenable that resolves to an array of menu item info objects.
		 */
		export function getMenuItems(menuId: string): Thenable<MenuItemInfo[]>;

		/**
		 * An event that fires when items in any menu have changed.
		 *
		 * The event value is the menu identifier that changed.
		 */
		export const onDidChangeMenu: Event<string>;

		/**
		 * Add a command as a menu item to an existing menu.
		 *
		 * @param menuId The identifier of the menu to add to.
		 * @param options The menu item options.
		 * @returns A disposable which removes the menu item when disposed.
		 */
		export function addMenuItem(menuId: string, options: MenuItemOptions): Disposable;

		/**
		 * Add a new submenu to an existing menu.
		 *
		 * The returned submenu identifier can be used with {@link addMenuItem}
		 * to add items into the submenu.
		 *
		 * @param menuId The identifier of the parent menu.
		 * @param options The submenu options.
		 * @returns An object containing the new submenu's identifier and a disposable
		 *   which removes the submenu when disposed.
		 */
		export function addSubmenu(menuId: string, options: SubmenuOptions): { submenuId: string; disposable: Disposable };
	}
}
