/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as yaml from 'js-yaml';
import { MenuDefinition, MenuDefinitionYaml, MenuNode, MenuNodeYaml, MenuAction } from './schema';

const menuIdAliases = new Map<string, string>([
	['window/toolbar', 'GlobalToolbar'],
]);

export function normalizeMenuId(menuId: string): string {
	return menuIdAliases.get(menuId) ?? menuId;
}

/**
 * Directories scanned for `.menu.yaml` files, in priority order
 * (project-local overrides global).
 */
export function getMenuDirectories(): string[] {
	const dirs: string[] = [];

	// Global: ~/.vscode/menus/
	const globalDir = path.join(os.homedir(), '.vscode', 'menus');
	dirs.push(globalDir);

	// Per-workspace: .vscode/menus/ in each workspace folder
	if (vscode.workspace.workspaceFolders) {
		for (const folder of vscode.workspace.workspaceFolders) {
			dirs.push(path.join(folder.uri.fsPath, '.vscode', 'menus'));
		}
	}

	return dirs;
}

/**
 * Scan all known directories for `.menu.yaml` files and parse them
 * into {@link MenuDefinition} objects.
 */
export function scanMenuFiles(): MenuDefinition[] {
	const definitions: MenuDefinition[] = [];

	for (const dir of getMenuDirectories()) {
		if (!fs.existsSync(dir)) {
			continue;
		}
		collectMenuFiles(dir, definitions);
	}

	return definitions;
}

/**
 * Recursively collect `.menu.yaml` / `.menu.yml` files from a directory
 * and its subdirectories, parsing each into a {@link MenuDefinition}.
 */
function collectMenuFiles(dir: string, out: MenuDefinition[]): void {
	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return;
	}

	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			// Skip hidden directories and the .cache directory
			if (!entry.name.startsWith('.')) {
				collectMenuFiles(fullPath, out);
			}
		} else if (entry.name.endsWith('.menu.yaml') || entry.name.endsWith('.menu.yml')) {
			try {
				const content = fs.readFileSync(fullPath, 'utf8');
				const parsed = parseMenuYaml(content, fullPath);
				if (parsed) {
					out.push(parsed);
				}
			} catch (err) {
				vscode.window.showWarningMessage(`Menu Loader: Failed to parse ${entry.name}: ${err}`);
			}
		}
	}
}

/**
 * Parse a single YAML string into a {@link MenuDefinition}.
 */
export function parseMenuYaml(content: string, sourcePath: string): MenuDefinition | undefined {
	const raw = yaml.load(content) as MenuDefinitionYaml | null;
	if (!raw || typeof raw !== 'object') {
		return undefined;
	}

	if (!raw.name || !raw.menu) {
		vscode.window.showWarningMessage(`Menu Loader: ${sourcePath} is missing required 'name' or 'menu' field.`);
		return undefined;
	}

	return {
		name: raw.name,
		menu: normalizeMenuId(raw.menu),
		when: raw.when,
		title: raw.title,
		group: raw.group,
		order: raw.order,
		position: raw.position,
		icon: raw.icon,
		items: normaliseNodes(raw.items ?? []),
		sourcePath,
	};
}

/**
 * Convert raw YAML nodes into normalised {@link MenuNode} objects.
 */
function normaliseNodes(nodes: MenuNodeYaml[]): MenuNode[] {
	return nodes.map((raw, i) => normaliseNode(raw, i));
}

function normaliseNode(raw: MenuNodeYaml, index: number): MenuNode {
	return {
		title: raw.title,
		group: raw.group,
		order: raw.order ?? (index + 1),
		position: raw.position,
		when: raw.when,
		icon: raw.icon,
		action: extractAction(raw),
		children: normaliseNodes(raw.items ?? []),
	};
}

/**
 * Extract the single action from a leaf node, or `undefined` for containers.
 */
function extractAction(raw: MenuNodeYaml): MenuAction | undefined {
	if (raw.command !== undefined) {
		if (typeof raw.command === 'string') {
			return { kind: 'command', id: raw.command };
		}
		return { kind: 'command', id: raw.command.id, args: raw.command.args };
	}
	if (raw.shell !== undefined) {
		if (typeof raw.shell === 'string') {
			return { kind: 'shell', cmd: raw.shell };
		}
		return { kind: 'shell', cmd: raw.shell.cmd, cwd: raw.shell.cwd, name: raw.shell.name };
	}
	if (raw.snippet !== undefined) {
		return { kind: 'snippet', body: raw.snippet };
	}
	if (raw.url !== undefined) {
		return { kind: 'url', href: raw.url };
	}
	if (raw.chat !== undefined) {
		return { kind: 'chat', prompt: raw.chat };
	}
	if (raw.clipboard !== undefined) {
		return { kind: 'clipboard', text: raw.clipboard };
	}
	return undefined;
}

/**
 * Create file system watchers for all menu directories.
 * Calls `onChange` whenever a `.menu.yaml` file is created, changed, or deleted.
 */
export function watchMenuDirectories(onChange: () => void): vscode.Disposable {
	const disposables: vscode.Disposable[] = [];

	for (const dir of getMenuDirectories()) {
		// Use VS Code file watcher for workspace directories (recursive)
		const pattern = new vscode.RelativePattern(vscode.Uri.file(dir), '**/*.menu.{yaml,yml}');
		const watcher = vscode.workspace.createFileSystemWatcher(pattern);

		watcher.onDidCreate(() => onChange());
		watcher.onDidChange(() => onChange());
		watcher.onDidDelete(() => onChange());

		disposables.push(watcher);
	}

	return vscode.Disposable.from(...disposables);
}
