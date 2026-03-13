/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { MenuDefinition } from './schema';
import { scanMenuFiles, watchMenuDirectories } from './scanner';
import { buildConditionContext, ConditionContext } from './conditions';
import { buildMenu, BuiltMenu } from './menuBuilder';

function isToolbarDefinition(definition: MenuDefinition): boolean {
	return definition.menu === 'GlobalToolbar';
}

/**
 * Manages the full lifecycle of dynamically loaded menus:
 * - Scans directories for `.menu.yaml` files
 * - Builds menus from parsed definitions
 * - Watches for file changes and context changes to rebuild
 * - Tears down and rebuilds menus on demand
 */
export class MenuManager implements vscode.Disposable {
	private readonly _disposables: vscode.Disposable[] = [];
	private _definitions: MenuDefinition[] = [];
	private _builtMenus: BuiltMenu[] = [];
	private _rebuildTimer: ReturnType<typeof setTimeout> | undefined;

	constructor() {
		// Watch for context changes that could affect `when` clauses
		this._disposables.push(
			vscode.window.onDidChangeActiveTextEditor(() => this._scheduleRebuild()),
			vscode.workspace.onDidOpenTextDocument(() => this._scheduleRebuild()),
			vscode.workspace.onDidChangeConfiguration(() => this._scheduleRebuild()),
		);

		// Watch for YAML file changes
		this._disposables.push(
			watchMenuDirectories(() => this._onFilesChanged()),
		);

		// Register the manual reload command
		this._disposables.push(
			vscode.commands.registerCommand('menuLoader.reload', () => this.reload()),
		);
	}

	/**
	 * Initial load: scan files and build menus.
	 */
	async load(): Promise<void> {
		this._definitions = scanMenuFiles();
		await this._buildAll();
	}

	/**
	 * Full reload: rescan files, tear down existing menus, rebuild.
	 */
	async reload(): Promise<void> {
		this._tearDownAll();
		this._definitions = scanMenuFiles();
		await this._buildAll();
		vscode.window.setStatusBarMessage(
			`Menu Loader: Loaded ${this._definitions.length} menu definition(s)`,
			3000,
		);
	}

	/**
	 * Rebuild all menus with fresh context (no file rescan).
	 */
	private async _rebuild(): Promise<void> {
		this._tearDownAll();
		await this._buildAll();
	}

	/**
	 * Schedule a rebuild after a short debounce to coalesce rapid changes
	 * (e.g. switching between files quickly).
	 */
	private _scheduleRebuild(): void {
		if (this._rebuildTimer !== undefined) {
			clearTimeout(this._rebuildTimer);
		}
		this._rebuildTimer = setTimeout(() => {
			this._rebuildTimer = undefined;
			void this._rebuild();
		}, 150);
	}

	/**
	 * Called when YAML files on disk change — triggers a full reload.
	 */
	private _onFilesChanged(): void {
		// Debounce file changes slightly to handle batch saves
		if (this._rebuildTimer !== undefined) {
			clearTimeout(this._rebuildTimer);
		}
		this._rebuildTimer = setTimeout(() => {
			this._rebuildTimer = undefined;
			void this.reload();
		}, 300);
	}

	/**
	 * Build menus for all definitions using the current context.
	 */
	private async _buildAll(): Promise<void> {
		const ctx: ConditionContext = buildConditionContext();
		const toolbarEnabled = vscode.workspace.getConfiguration('menuLoader').get<boolean>('toolbar.enabled', true);

		for (const definition of this._definitions) {
			if (!toolbarEnabled && isToolbarDefinition(definition)) {
				continue;
			}

			const built = await buildMenu(definition, ctx);
			this._builtMenus.push(built);
		}
	}

	/**
	 * Tear down all built menus, disposing their items and commands.
	 */
	private _tearDownAll(): void {
		for (const built of this._builtMenus) {
			for (const d of built.disposables) {
				d.dispose();
			}
		}
		this._builtMenus = [];
	}

	dispose(): void {
		if (this._rebuildTimer !== undefined) {
			clearTimeout(this._rebuildTimer);
		}
		this._tearDownAll();
		for (const d of this._disposables) {
			d.dispose();
		}
	}
}
