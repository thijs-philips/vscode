/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { MenuManager } from './menuManager';
import { listCommands, showMenuTree, validateMenuYaml, listMenuIds, checkDuplicates, dumpAll } from './tools';
import { getMenuDirectories } from './scanner';

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
		vscode.commands.registerCommand('menuLoader.openMenusFolder', openMenusFolder),
		vscode.commands.registerCommand('menuLoader.createMenu', createMenu),
		vscode.commands.registerCommand('menuLoader.toggleToolbar', toggleToolbar),
	);

	// Perform initial load
	void menuManager.load();
}

async function openMenusFolder(): Promise<void> {
	const dirs = getMenuDirectories();
	const items = dirs.map(dir => ({ label: dir, dir }));
	if (items.length === 1) {
		await vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(items[0].dir));
		return;
	}
	const pick = await vscode.window.showQuickPick(items, { placeHolder: 'Select menus folder to open' });
	if (pick) {
		await vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(pick.dir));
	}
}

async function createMenu(): Promise<void> {
	await vscode.commands.executeCommand('workbench.action.chat.open', {
		query: '@workspace /new Create a new .menu.yaml file. Ask me what menu I want to build (top-level dropdown, injection into existing menu, or context menu), which commands to include, and where to place it. Use the menu-loader YAML format.',
		isPartialQuery: true
	});
}

async function toggleToolbar(): Promise<void> {
	const config = vscode.workspace.getConfiguration('menuLoader');
	const enabled = config.get<boolean>('toolbar.enabled', true);
	await config.update('toolbar.enabled', !enabled, vscode.ConfigurationTarget.Global);
	vscode.window.setStatusBarMessage(
		`Menu Loader: Toolbar ${enabled ? 'Hidden' : 'Shown'}`,
		3000,
	);
}

export function deactivate(): void {
	menuManager?.dispose();
	menuManager = undefined;
}
