/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { Emitter } from '../../../base/common/event.js';
import { toDisposable } from '../../../base/common/lifecycle.js';
import { MainContext, MainThreadMenusShape, IMenuItemInfoDto, ExtHostMenusShape } from './extHost.protocol.js';
import { IExtHostRpcService } from './extHostRpcService.js';

export class ExtHostMenus implements ExtHostMenusShape {

	private readonly _proxy: MainThreadMenusShape;
	private readonly _onDidChangeMenu = new Emitter<string>();
	readonly onDidChangeMenu = this._onDidChangeMenu.event;
	private _handleCounter = 0;

	constructor(
		@IExtHostRpcService rpc: IExtHostRpcService,
	) {
		this._proxy = rpc.getProxy(MainContext.MainThreadMenus);
	}

	$onDidChangeMenu(menuId: string): void {
		this._onDidChangeMenu.fire(menuId);
	}

	getMenuItems(menuId: string): Promise<IMenuItemInfoDto[]> {
		return this._proxy.$getMenuItems(menuId);
	}

	addMenuItem(menuId: string, options: vscode.MenuItemOptions): vscode.Disposable {
		const handle = this._handleCounter++;
		this._proxy.$addMenuItem(handle, menuId, options.commandId, options.title, options.group, options.order);
		return toDisposable(() => {
			this._proxy.$removeMenuItem(handle);
		});
	}

	addSubmenu(menuId: string, options: vscode.SubmenuOptions): { submenuId: string; disposable: vscode.Disposable } {
		const handle = this._handleCounter++;
		const submenuId = `extHostSubmenu.${handle}`;
		this._proxy.$addSubmenu(handle, menuId, submenuId, options.title, options.group, options.order);
		return {
			submenuId,
			disposable: toDisposable(() => {
				this._proxy.$removeMenuItem(handle);
			}),
		};
	}
}
