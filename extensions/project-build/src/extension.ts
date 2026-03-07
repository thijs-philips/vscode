/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

// ---------------------------------------------------------------------------
// Project-type definitions
// ---------------------------------------------------------------------------

interface ProjectType {
	/** Display label shown in the Run menu (e.g. "Run Python") */
	readonly label: string;
	/** Glob patterns whose presence in the workspace signals this project type */
	readonly markerGlobs: string[];
	/** Shell command executed when the menu item is selected */
	readonly runCommand: string;
}

const PROJECT_TYPES: ProjectType[] = [
	{
		label: 'Python',
		markerGlobs: ['pyproject.toml', 'setup.py', 'requirements.txt', '**/*.py'],
		runCommand: 'python main.py',
	},
	{
		label: '.NET',
		markerGlobs: ['**/*.csproj', '**/*.sln'],
		runCommand: 'dotnet run',
	},
	{
		label: 'JavaScript/TypeScript',
		markerGlobs: ['package.json'],
		runCommand: 'npm start',
	},
];

// ---------------------------------------------------------------------------
// Well-known menu identifier for the "Run" menu in VS Code's menu bar.
// Internally this is called "MenubarDebugMenu" but displayed as "Run".
// ---------------------------------------------------------------------------

const RUN_MENU_ID = 'MenubarDebugMenu';

/**
 * Group used for our items inside the Run menu. The `z_` prefix places them at
 * the bottom of the menu, after the built-in debug/run items.
 */
const RUN_MENU_GROUP = 'z_projectRun';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let menuDisposables: vscode.Disposable[] = [];
let currentProjectTypes: ProjectType[] = [];
let scanning = false;

// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------

export function activate(context: vscode.ExtensionContext) {

	// Register one command per project type
	for (const pt of PROJECT_TYPES) {
		const commandId = commandIdFor(pt);
		context.subscriptions.push(
			vscode.commands.registerCommand(commandId, () => runProject(pt)),
		);
	}

	// Re-scan when workspace folders change
	context.subscriptions.push(
		vscode.workspace.onDidChangeWorkspaceFolders(() => rescan()),
	);

	// Watch for creation / deletion of all marker files across all project types
	const allMarkerGlobs = new Set<string>();
	for (const pt of PROJECT_TYPES) {
		for (const g of pt.markerGlobs) {
			allMarkerGlobs.add(g);
		}
	}
	for (const glob of allMarkerGlobs) {
		const watcher = vscode.workspace.createFileSystemWatcher(`**/${glob}`);
		watcher.onDidCreate(() => rescan());
		watcher.onDidDelete(() => rescan());
		context.subscriptions.push(watcher);
	}

	// Clean up on deactivate
	context.subscriptions.push({ dispose: disposeMenu });

	// Initial scan
	rescan();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Derive a stable command ID from the project type label. */
function commandIdFor(pt: ProjectType): string {
	const slug = pt.label.toLowerCase().replace(/[^a-z0-9]+/g, '');
	return `projectBuild.run${slug}`;
}

// ---------------------------------------------------------------------------
// Workspace scanning
// ---------------------------------------------------------------------------

async function rescan() {
	if (scanning) {
		return;
	}
	scanning = true;
	try {
		const detected = await detectProjectTypes();
		const changed = !arraysEqual(detected, currentProjectTypes);
		if (changed) {
			currentProjectTypes = detected;
			rebuildMenu();
		}
	} finally {
		scanning = false;
	}
}

async function detectProjectTypes(): Promise<ProjectType[]> {
	const folders = vscode.workspace.workspaceFolders;
	if (!folders || folders.length === 0) {
		return [];
	}

	const found: ProjectType[] = [];
	for (const pt of PROJECT_TYPES) {
		if (await hasAnyFile(pt.markerGlobs)) {
			found.push(pt);
		}
	}
	return found;
}

async function hasAnyFile(globs: string[]): Promise<boolean> {
	for (const glob of globs) {
		const uris = await vscode.workspace.findFiles(glob, '**/node_modules/**', 1);
		if (uris.length > 0) {
			return true;
		}
	}
	return false;
}

function arraysEqual(a: ProjectType[], b: ProjectType[]): boolean {
	if (a.length !== b.length) {
		return false;
	}
	for (let i = 0; i < a.length; i++) {
		if (a[i].label !== b[i].label) {
			return false;
		}
	}
	return true;
}

// ---------------------------------------------------------------------------
// Menu construction — adds items to the existing "Run" menu
// ---------------------------------------------------------------------------

function rebuildMenu() {
	disposeMenu();

	if (currentProjectTypes.length === 0) {
		return;
	}

	let order = 1;
	for (const pt of currentProjectTypes) {
		menuDisposables.push(vscode.menus.addMenuItem(RUN_MENU_ID, {
			commandId: commandIdFor(pt),
			title: `Run ${pt.label}`,
			group: RUN_MENU_GROUP,
			order: order++,
		}));
	}
}

function disposeMenu() {
	for (const d of menuDisposables) {
		d.dispose();
	}
	menuDisposables = [];
}

// ---------------------------------------------------------------------------
// Command execution
// ---------------------------------------------------------------------------

function runProject(pt: ProjectType) {
	const terminal = vscode.window.createTerminal(`Run: ${pt.label}`);
	terminal.show();
	terminal.sendText(pt.runCommand);
}

export function deactivate() { }
