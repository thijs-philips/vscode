/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { MenuManager } from './menuManager';
import { listCommands, showMenuTree, validateMenuYaml, listMenuIds, checkDuplicates, dumpAll } from './tools';

let menuManager: MenuManager | undefined;

export function activate(context: vscode.ExtensionContext): void {
	menuManager = new MenuManager();
	context.subscriptions.push(menuManager);

	// Developer tools — standalone commands for menu authoring
	context.subscriptions.push(
		vscode.commands.registerCommand('menuLoader.listCommands', listCommands),
		vscode.commands.registerCommand('menuLoader.showMenuTree', showMenuTree),
		vscode.commands.registerCommand('menuLoader.validateMenus', validateMenuYaml),
		vscode.commands.registerCommand('menuLoader.listMenuIds', listMenuIds),
		vscode.commands.registerCommand('menuLoader.dumpAll', dumpAll),
		vscode.commands.registerCommand('menuLoader.checkDuplicates', checkDuplicates),
	);

	// Perform initial load
	menuManager.load();
}

export function deactivate(): void {
	menuManager?.dispose();
	menuManager = undefined;
}
