/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

// ---------------------------------------------------------------------------
// Project-type definitions
// ---------------------------------------------------------------------------

interface ProjectType {
	/** Display label shown in the Build menu */
	readonly label: string;
	/** Glob patterns whose presence in the workspace signals this project type */
	readonly markerGlobs: string[];
	/** Build/run/test/clean commands for this project type */
	readonly commands: {
		build?: string;
		test?: string;
		run?: string;
		clean?: string;
		install?: string;
	};
}

const PROJECT_TYPES: ProjectType[] = [
	{
		label: 'npm',
		markerGlobs: ['package.json'],
		commands: {
			build: 'npm run build',
			test: 'npm test',
			run: 'npm start',
			install: 'npm install',
		},
	},
	{
		label: '.NET',
		markerGlobs: ['**/*.csproj', '**/*.sln'],
		commands: {
			build: 'dotnet build',
			test: 'dotnet test',
			run: 'dotnet run',
			clean: 'dotnet clean',
			install: 'dotnet restore',
		},
	},
	{
		label: 'Python',
		markerGlobs: ['pyproject.toml', 'setup.py', 'requirements.txt'],
		commands: {
			build: 'python -m build',
			test: 'pytest',
			run: 'python main.py',
			install: 'pip install -r requirements.txt',
		},
	},
	{
		label: 'Rust',
		markerGlobs: ['Cargo.toml'],
		commands: {
			build: 'cargo build',
			test: 'cargo test',
			run: 'cargo run',
			clean: 'cargo clean',
		},
	},
	{
		label: 'Go',
		markerGlobs: ['go.mod'],
		commands: {
			build: 'go build ./...',
			test: 'go test ./...',
			run: 'go run .',
			clean: 'go clean',
		},
	},
	{
		label: 'Maven',
		markerGlobs: ['pom.xml'],
		commands: {
			build: 'mvn compile',
			test: 'mvn test',
			run: 'mvn exec:java',
			clean: 'mvn clean',
			install: 'mvn install',
		},
	},
	{
		label: 'Gradle',
		markerGlobs: ['build.gradle', 'build.gradle.kts'],
		commands: {
			build: 'gradle build',
			test: 'gradle test',
			run: 'gradle run',
			clean: 'gradle clean',
		},
	},
	{
		label: 'Make',
		markerGlobs: ['Makefile', 'makefile', 'GNUmakefile'],
		commands: {
			build: 'make',
			test: 'make test',
			clean: 'make clean',
			install: 'make install',
		},
	},
	{
		label: 'CMake',
		markerGlobs: ['CMakeLists.txt'],
		commands: {
			build: 'cmake --build build',
			test: 'ctest --test-dir build',
			clean: 'cmake --build build --target clean',
			install: 'cmake --install build',
		},
	},
];

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

	// Register the five generic commands
	context.subscriptions.push(
		vscode.commands.registerCommand('projectBuild.build', () => pickAndRun('build')),
		vscode.commands.registerCommand('projectBuild.test', () => pickAndRun('test')),
		vscode.commands.registerCommand('projectBuild.run', () => pickAndRun('run')),
		vscode.commands.registerCommand('projectBuild.clean', () => pickAndRun('clean')),
		vscode.commands.registerCommand('projectBuild.install', () => pickAndRun('install')),
	);

	// Re-scan when workspace folders change or marker files are created/deleted
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
// Menu construction
// ---------------------------------------------------------------------------

function rebuildMenu() {
	disposeMenu();

	if (currentProjectTypes.length === 0) {
		return;
	}

	// Create top-level "Build" submenu (after Run=6, before Help)
	const { submenuId: buildMenuId, disposable: buildMenuDisposable } = vscode.menus.addSubmenu('MenubarMainMenu', {
		title: 'Build',
		order: 7
	});
	menuDisposables.push(buildMenuDisposable);

	if (currentProjectTypes.length === 1) {
		// Single project type — flat list of commands directly in the Build menu
		const pt = currentProjectTypes[0];
		addCommandItems(buildMenuId, pt, '1_actions');
	} else {
		// Multiple project types — each gets its own submenu inside Build
		let groupOrder = 1;
		for (const pt of currentProjectTypes) {
			const group = `${groupOrder}_${pt.label.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
			const { submenuId: ptSubmenuId, disposable: ptDisposable } = vscode.menus.addSubmenu(buildMenuId, {
				title: pt.label,
				group,
				order: groupOrder
			});
			menuDisposables.push(ptDisposable);
			addCommandItems(ptSubmenuId, pt, '1_actions');
			groupOrder++;
		}
	}
}

function addCommandItems(menuId: string, pt: ProjectType, group: string) {
	const entries: { key: keyof ProjectType['commands']; label: string; order: number }[] = [
		{ key: 'build',   label: 'Build',              order: 1 },
		{ key: 'test',    label: 'Run Tests',          order: 2 },
		{ key: 'run',     label: 'Run / Start',        order: 3 },
		{ key: 'clean',   label: 'Clean',              order: 4 },
		{ key: 'install', label: 'Install Dependencies', order: 5 },
	];

	for (const entry of entries) {
		const cmd = pt.commands[entry.key];
		if (!cmd) {
			continue;
		}
		// Use a unique command id per project-type + action so QuickPick is skipped
		// when there is only one matching project type
		menuDisposables.push(vscode.menus.addMenuItem(menuId, {
			commandId: `projectBuild.${entry.key}`,
			title: entry.label,
			group,
			order: entry.order
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

async function pickAndRun(action: keyof ProjectType['commands']) {
	const applicable = currentProjectTypes.filter(pt => pt.commands[action]);

	if (applicable.length === 0) {
		vscode.window.showInformationMessage(`No ${action} command available for the detected project types.`);
		return;
	}

	let chosen: ProjectType;

	if (applicable.length === 1) {
		chosen = applicable[0];
	} else {
		// Multiple project types have this action — let the user pick
		const items = applicable.map(pt => ({
			label: pt.label,
			description: pt.commands[action],
			pt,
		}));
		const pick = await vscode.window.showQuickPick(items, {
			placeHolder: `Choose project type for "${action}"`,
		});
		if (!pick) {
			return;
		}
		chosen = pick.pt;
	}

	const shellCmd = chosen.commands[action];
	if (!shellCmd) {
		return;
	}

	const terminal = vscode.window.createTerminal(`Build: ${chosen.label}`);
	terminal.show();
	terminal.sendText(shellCmd);
}

export function deactivate() { }
