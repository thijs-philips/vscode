/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { scanMenuFiles } from './scanner';
import { MenuNode } from './schema';

// ─── Cache Directory ─────────────────────────────────────────────────────────

/**
 * Return the `.vscode/menus/.cache/` directory in the first workspace folder.
 * Creates the directory if it doesn't exist. Returns `undefined` if no
 * workspace is open.
 */
function getCacheDir(): string | undefined {
	const folders = vscode.workspace.workspaceFolders;
	if (!folders || folders.length === 0) {
		return undefined;
	}
	const cacheDir = path.join(folders[0].uri.fsPath, '.vscode', 'menus', '.cache');
	fs.mkdirSync(cacheDir, { recursive: true });

	// Ensure .gitignore exists so cache files aren't committed
	const gitignorePath = path.join(cacheDir, '.gitignore');
	if (!fs.existsSync(gitignorePath)) {
		fs.writeFileSync(gitignorePath, '*\n', 'utf-8');
	}
	return cacheDir;
}

/**
 * Write content to a cache file and also open it as a document for the user.
 */
async function writeAndOpen(filename: string, content: string): Promise<void> {
	const cacheDir = getCacheDir();
	if (cacheDir) {
		const filePath = path.join(cacheDir, filename);
		fs.writeFileSync(filePath, content, 'utf-8');
		const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
		await vscode.window.showTextDocument(doc);
	} else {
		// No workspace — fall back to untitled document
		await openMarkdownOutput(content);
	}
}

// ─── Command Lister ──────────────────────────────────────────────────────────

/**
 * List all registered commands grouped by source extension.
 * Opens a markdown document the user can browse or feed to Copilot.
 */
export async function listCommands(): Promise<void> {
	const allCommands = await vscode.commands.getCommands(/* filterInternal */ true);
	allCommands.sort();

	// Build a map: extension id → declared commands (from package.json)
	const extensionCommands = new Map<string, { id: string; title: string }[]>();
	const claimedIds = new Set<string>();

	for (const ext of vscode.extensions.all) {
		const pkg = ext.packageJSON;
		const declared: { command: string; title: string | { value: string } }[] =
			pkg?.contributes?.commands ?? [];

		if (declared.length > 0) {
			const entries = declared.map(c => ({
				id: c.command,
				title: typeof c.title === 'string' ? c.title : c.title?.value ?? c.command,
			}));
			extensionCommands.set(ext.id, entries);
			for (const e of entries) {
				claimedIds.add(e.id);
			}
		}
	}

	// Partition unclaimed commands
	const unclaimed = allCommands.filter(cmd => !claimedIds.has(cmd));
	const editorActions = unclaimed.filter(c => c.startsWith('editor.'));
	const workbenchActions = unclaimed.filter(c => c.startsWith('workbench.'));
	const otherActions = unclaimed.filter(
		c => !c.startsWith('editor.') && !c.startsWith('workbench.')
	);

	// ── Render markdown ──────────────────────────────────────────────────
	const lines: string[] = [];
	lines.push('# Available VS Code Commands');
	lines.push('');
	lines.push(`Generated: ${new Date().toISOString()}`);
	lines.push(
		`Total: ${allCommands.length} commands ` +
		`(${claimedIds.size} from extensions, ${unclaimed.length} built-in/internal)`
	);
	lines.push('');

	// Extension commands, sorted alphabetically by extension id
	const sorted = [...extensionCommands.entries()].sort((a, b) =>
		a[0].localeCompare(b[0])
	);
	for (const [extId, cmds] of sorted) {
		const ext = vscode.extensions.all.find(e => e.id === extId);
		const displayName: string = ext?.packageJSON?.displayName ?? extId;
		lines.push(`## ${displayName} (\`${extId}\`)`);
		lines.push('');
		lines.push('| Command ID | Title |');
		lines.push('|---|---|');
		for (const cmd of cmds) {
			lines.push(`| \`${cmd.id}\` | ${cmd.title} |`);
		}
		lines.push('');
	}

	// Built-in / core commands
	lines.push('## Built-in / Core Commands');
	lines.push('');

	if (editorActions.length > 0) {
		lines.push('### Editor Actions');
		lines.push('');
		for (const cmd of editorActions) {
			lines.push(`- \`${cmd}\``);
		}
		lines.push('');
	}

	if (workbenchActions.length > 0) {
		lines.push('### Workbench Actions');
		lines.push('');
		for (const cmd of workbenchActions) {
			lines.push(`- \`${cmd}\``);
		}
		lines.push('');
	}

	if (otherActions.length > 0) {
		lines.push('### Other');
		lines.push('');
		for (const cmd of otherActions) {
			lines.push(`- \`${cmd}\``);
		}
		lines.push('');
	}

	await writeAndOpen('commands.md', lines.join('\n'));
}

// ─── Menu ID Lister ──────────────────────────────────────────────────────────

/**
 * Curated list of well-known menu location IDs from VS Code's `MenuId` class.
 * The extension cannot import `MenuId` directly (core layer), so we maintain
 * a hand-picked reference list instead.
 */
const KNOWN_MENU_IDS: { id: string; description: string; category: string }[] = [
	// Menu bar
	{ id: 'MenubarMainMenu', description: 'Top-level menu bar — add new dropdown menus', category: 'Menu Bar' },
	{ id: 'MenubarFileMenu', description: 'File menu', category: 'Menu Bar' },
	{ id: 'MenubarEditMenu', description: 'Edit menu', category: 'Menu Bar' },
	{ id: 'MenubarSelectionMenu', description: 'Selection menu', category: 'Menu Bar' },
	{ id: 'MenubarViewMenu', description: 'View menu', category: 'Menu Bar' },
	{ id: 'MenubarGoMenu', description: 'Go menu', category: 'Menu Bar' },
	{ id: 'MenubarRunMenu', description: 'Run menu (Debug)', category: 'Menu Bar' },
	{ id: 'MenubarTerminalMenu', description: 'Terminal menu', category: 'Menu Bar' },
	{ id: 'MenubarHelpMenu', description: 'Help menu', category: 'Menu Bar' },
	{ id: 'MenubarAppearanceMenu', description: 'Appearance submenu (under View)', category: 'Menu Bar' },
	{ id: 'MenubarLayoutMenu', description: 'Editor Layout submenu', category: 'Menu Bar' },
	{ id: 'MenubarPreferencesMenu', description: 'Preferences submenu (under File)', category: 'Menu Bar' },
	{ id: 'MenubarRecentMenu', description: 'Open Recent submenu (under File)', category: 'Menu Bar' },
	{ id: 'MenubarShare', description: 'Share submenu', category: 'Menu Bar' },
	{ id: 'MenubarDebugMenu', description: 'Debug menu (alias for Run)', category: 'Menu Bar' },

	// Editor
	{ id: 'EditorContext', description: 'Editor right-click context menu', category: 'Editor' },
	{ id: 'EditorTitle', description: 'Editor tab title bar actions', category: 'Editor' },
	{ id: 'EditorTitleContext', description: 'Editor tab right-click menu', category: 'Editor' },
	{ id: 'EditorTitleRun', description: 'Editor title run button menu', category: 'Editor' },
	{ id: 'EditorLineNumberContext', description: 'Line number gutter right-click', category: 'Editor' },
	{ id: 'EditorContent', description: 'Editor content area', category: 'Editor' },
	{ id: 'EditorContextCopy', description: 'Editor context copy submenu', category: 'Editor' },
	{ id: 'EditorContextPeek', description: 'Editor context peek submenu', category: 'Editor' },
	{ id: 'EditorContextShare', description: 'Editor context share submenu', category: 'Editor' },
	{ id: 'StickyScrollContext', description: 'Sticky scroll header right-click', category: 'Editor' },

	// Explorer & Files
	{ id: 'ExplorerContext', description: 'File Explorer right-click menu', category: 'Explorer' },
	{ id: 'ExplorerContextShare', description: 'Explorer share submenu', category: 'Explorer' },

	// SCM / Git
	{ id: 'SCMTitle', description: 'Source Control view title bar', category: 'SCM' },
	{ id: 'SCMSourceControl', description: 'SCM provider section header', category: 'SCM' },
	{ id: 'SCMResourceContext', description: 'SCM changed file right-click', category: 'SCM' },
	{ id: 'SCMChangeContext', description: 'SCM change inline actions', category: 'SCM' },
	{ id: 'SCMHistoryTitle', description: 'SCM history view title', category: 'SCM' },
	{ id: 'SCMHistoryItemContext', description: 'SCM history item context', category: 'SCM' },

	// Terminal
	{ id: 'TerminalInstanceContext', description: 'Terminal right-click menu', category: 'Terminal' },
	{ id: 'TerminalTabContext', description: 'Terminal tab right-click', category: 'Terminal' },
	{ id: 'TerminalNewDropdownContext', description: 'Terminal new dropdown', category: 'Terminal' },

	// Debug
	{ id: 'DebugToolBar', description: 'Debug toolbar actions', category: 'Debug' },
	{ id: 'DebugCallStackContext', description: 'Debug call stack right-click', category: 'Debug' },
	{ id: 'DebugBreakpointsContext', description: 'Debug breakpoints right-click', category: 'Debug' },
	{ id: 'DebugVariablesContext', description: 'Debug variables right-click', category: 'Debug' },
	{ id: 'DebugConsoleContext', description: 'Debug console right-click', category: 'Debug' },

	// Notebook
	{ id: 'NotebookToolbar', description: 'Notebook toolbar actions', category: 'Notebook' },
	{ id: 'NotebookCellTitle', description: 'Notebook cell title actions', category: 'Notebook' },
	{ id: 'NotebookCellExecute', description: 'Notebook cell execute button', category: 'Notebook' },
	{ id: 'NotebookOutputToolbar', description: 'Notebook output toolbar', category: 'Notebook' },

	// Chat
	{ id: 'ChatContext', description: 'Chat view context menu', category: 'Chat' },
	{ id: 'ChatExecute', description: 'Chat execute (send) area', category: 'Chat' },
	{ id: 'ChatInput', description: 'Chat input field menu', category: 'Chat' },
	{ id: 'ChatCodeBlock', description: 'Chat code block actions', category: 'Chat' },
	{ id: 'ChatMessageTitle', description: 'Chat message title bar', category: 'Chat' },

	// Views
	{ id: 'ViewTitle', description: 'View title bar actions (any view)', category: 'Views' },
	{ id: 'ViewItemContext', description: 'Tree/list item right-click in views', category: 'Views' },
	{ id: 'ViewContainerTitle', description: 'View container (sidebar section) title', category: 'Views' },

	// Global
	{ id: 'CommandPalette', description: 'Command Palette — controls command visibility', category: 'Global' },
	{ id: 'GlobalActivity', description: 'Activity bar bottom actions', category: 'Global' },
	{ id: 'CommandCenter', description: 'Command center in title bar', category: 'Global' },
	{ id: 'StatusBarWindowIndicatorMenu', description: 'Status bar window indicator', category: 'Global' },
	{ id: 'StatusBarRemoteIndicatorMenu', description: 'Status bar remote indicator', category: 'Global' },
	{ id: 'TitleBar', description: 'Title bar context menu', category: 'Global' },
	{ id: 'GlobalToolbar', description: 'Global toolbar strip', category: 'Global' },
	{ id: 'NewFile', description: 'New File... submenu', category: 'Global' },

	// Toolbar (proposed)
	{ id: 'window/toolbar', description: 'Window toolbar (proposed contribGlobalToolbar API)', category: 'Toolbar (Proposed)' },

	// Comments
	{ id: 'CommentThreadTitle', description: 'Comment thread title bar', category: 'Comments' },
	{ id: 'CommentThreadActions', description: 'Comment thread actions', category: 'Comments' },
	{ id: 'CommentActions', description: 'Individual comment actions', category: 'Comments' },

	// Other
	{ id: 'TimelineItemContext', description: 'Timeline item right-click', category: 'Other' },
	{ id: 'AccountsContext', description: 'Accounts menu actions', category: 'Other' },
	{ id: 'BulkEditContext', description: 'Bulk edit preview context', category: 'Other' },
	{ id: 'TouchBarContext', description: 'macOS Touch Bar', category: 'Other' },
	{ id: 'AccessibleView', description: 'Accessible view context', category: 'Other' },
];

/**
 * List all known menu location IDs with descriptions.
 */
export async function listMenuIds(): Promise<void> {
	const lines: string[] = [];
	lines.push('# VS Code Menu Location IDs');
	lines.push('');
	lines.push('Use these as the `menu:` value in your `.menu.yaml` files.');
	lines.push('');

	const categories = [...new Set(KNOWN_MENU_IDS.map(m => m.category))];
	for (const cat of categories) {
		lines.push(`## ${cat}`);
		lines.push('');
		lines.push('| Menu ID | Description |');
		lines.push('|---|---|');
		for (const m of KNOWN_MENU_IDS.filter(m => m.category === cat)) {
			lines.push(`| \`${m.id}\` | ${m.description} |`);
		}
		lines.push('');
	}

	lines.push('## Usage Notes');
	lines.push('');
	lines.push('- **`MenubarMainMenu`**: Creates a **new** top-level dropdown in the menu bar.');
	lines.push('- **`MenubarEditMenu`**, **`MenubarFileMenu`**, etc.: Injects items into an **existing** menu.');
	lines.push('- **`EditorContext`**: Adds items to the editor right-click context menu.');
	lines.push('- **`window/toolbar`**: Proposed API for toolbar strip buttons (requires `contribGlobalToolbar`).');
	lines.push('- Extensions can create additional menu IDs dynamically; the above are the standard built-in ones.');

	await writeAndOpen('menu-ids.md', lines.join('\n'));
}

// ─── Menu Tree Visualizer ────────────────────────────────────────────────────

/**
 * Render the loaded `.menu.yaml` files as a Unicode box-drawing tree.
 */
export async function showMenuTree(): Promise<void> {
	const definitions = scanMenuFiles();

	if (definitions.length === 0) {
		vscode.window.showWarningMessage(
			'Menu Loader: No .menu.yaml files found in any .vscode/menus/ directory.'
		);
		return;
	}

	const lines: string[] = [];
	lines.push('# Menu Structure');
	lines.push('');
	lines.push(`Generated from ${definitions.length} file(s).`);
	lines.push('');

	for (const def of definitions) {
		lines.push(`## ${def.title ?? def.name} (\u2192 \`${def.menu}\`)`);
		if (def.when) {
			lines.push(`*Visible when:* \`${def.when}\``);
		}
		lines.push(`*Source:* \`${path.basename(def.sourcePath)}\``);
		lines.push('');
		lines.push('```');
		renderTree(def.items, lines, '');
		lines.push('```');
		lines.push('');
	}

	await writeAndOpen('menu-tree.md', lines.join('\n'));
}

function renderTree(nodes: MenuNode[], lines: string[], prefix: string): void {
	for (let i = 0; i < nodes.length; i++) {
		const node = nodes[i];
		const isLast = i === nodes.length - 1;
		const connector = isLast ? '\u2514\u2500\u2500 ' : '\u251C\u2500\u2500 ';
		const childPrefix = prefix + (isLast ? '    ' : '\u2502   ');

		// Determine label
		let label: string;
		if (node.group && !node.title && node.children.length > 0) {
			label = `[${node.group}]`;
		} else if (node.title) {
			label = node.title;
		} else {
			label = '(unnamed)';
		}

		// Annotations
		const annotations: string[] = [];
		if (node.when) {
			annotations.push(`when: ${node.when}`);
		}
		if (node.action) {
			switch (node.action.kind) {
				case 'command':
					annotations.push(`\u2192 ${node.action.id}`);
					break;
				case 'shell':
					annotations.push(`\u2192 shell: ${node.action.cmd}`);
					break;
				case 'snippet':
					annotations.push('\u2192 snippet');
					break;
				case 'url':
					annotations.push(`\u2192 url: ${node.action.href}`);
					break;
				case 'chat':
					annotations.push('\u2192 chat');
					break;
				case 'clipboard':
					annotations.push('\u2192 clipboard');
					break;
			}
		}

		const suffix = annotations.length > 0 ? `  (${annotations.join(', ')})` : '';
		lines.push(`${prefix}${connector}${label}${suffix}`);

		if (node.children.length > 0) {
			renderTree(node.children, lines, childPrefix);
		}
	}
}

// ─── YAML Validator ──────────────────────────────────────────────────────────

/**
 * Validate all `.menu.yaml` files and produce a diagnostic report.
 */
export async function validateMenuYaml(): Promise<void> {
	const definitions = scanMenuFiles();

	if (definitions.length === 0) {
		vscode.window.showWarningMessage(
			'Menu Loader: No .menu.yaml files found in any .vscode/menus/ directory.'
		);
		return;
	}

	const allCommands = new Set(await vscode.commands.getCommands(true));
	const installedExtensions = new Set(vscode.extensions.all.map(e => e.id));
	const knownMenuIds = new Set(KNOWN_MENU_IDS.map(m => m.id));

	const lines: string[] = [];
	let totalIssues = 0;

	lines.push('# Menu YAML Validation Report');
	lines.push('');
	lines.push(''); // placeholder for summary — filled in after scanning

	for (const def of definitions) {
		const issues: string[] = [];
		const basename = path.basename(def.sourcePath);

		// Menu ID check
		if (!knownMenuIds.has(def.menu)) {
			issues.push(
				`\u26A0 Unknown menu ID: \`${def.menu}\`. ` +
				'It may be valid if created by another extension.'
			);
		}

		// Validate nodes recursively
		validateNodes(def.items, allCommands, installedExtensions, issues, '');

		if (issues.length === 0) {
			lines.push(`## \u2705 ${basename}`);
			lines.push('');
			lines.push('No issues found.');
		} else {
			lines.push(`## \u26A0 ${basename} \u2014 ${issues.length} issue(s)`);
			lines.push('');
			for (const issue of issues) {
				lines.push(`- ${issue}`);
			}
		}
		lines.push('');
		totalIssues += issues.length;
	}

	// Fill in summary placeholder
	lines[2] = `Checked ${definitions.length} file(s), found ${totalIssues} issue(s).`;

	await writeAndOpen('validation.md', lines.join('\n'));
}

function validateNodes(
	nodes: MenuNode[],
	allCommands: Set<string>,
	installedExtensions: Set<string>,
	issues: string[],
	pathPrefix: string,
): void {
	for (let i = 0; i < nodes.length; i++) {
		const node = nodes[i];
		const label = node.title ?? node.group ?? `[${i}]`;
		const nodePath = `${pathPrefix}${label}`;

		// Leaf without action and without children
		if (!node.action && node.children.length === 0 && !node.group) {
			issues.push(
				`\u26A0 \`${nodePath}\`: No action and no children \u2014 will be invisible.`
			);
		}

		// Command ID validation
		if (node.action?.kind === 'command') {
			if (!allCommands.has(node.action.id)) {
				issues.push(
					`\u26A0 \`${nodePath}\`: Command \`${node.action.id}\` is not currently ` +
					'registered. It may belong to an extension that has not activated.'
				);
			}
		}

		// hasExtension() references in when clauses
		if (node.when) {
			const extRefs = [...node.when.matchAll(/hasExtension\(\s*([^)]+?)\s*\)/gi)];
			for (const match of extRefs) {
				const extId = match[1];
				if (!installedExtensions.has(extId)) {
					issues.push(
						`\u2139 \`${nodePath}\`: When-clause references extension ` +
						`\`${extId}\` which is not installed. Items will be hidden.`
					);
				}
			}
		}

		// Missing title on leaf items
		if (node.action && !node.title) {
			issues.push(
				`\u26A0 \`${nodePath}\`: Leaf item has no \`title\` \u2014 will show command ID as label.`
			);
		}

		// Recurse
		if (node.children.length > 0) {
			validateNodes(
				node.children,
				allCommands,
				installedExtensions,
				issues,
				`${nodePath} > `,
			);
		}
	}
}

// ─── Duplicate Detection ─────────────────────────────────────────────────────

/** Represents a single command placement in a menu, from any source. */
interface MenuPlacement {
	commandId: string;
	menuId: string;
	when: string | undefined;
	source: string; // e.g. "ext:vscode.git", "yaml:markdown.menu.yaml"
	title: string | undefined;
}

/**
 * Collect every menu-contributed command from all installed extensions.
 * Extensions declare these in `package.json` → `contributes.menus`.
 */
function collectExtensionMenuPlacements(): MenuPlacement[] {
	const placements: MenuPlacement[] = [];

	for (const ext of vscode.extensions.all) {
		const pkg = ext.packageJSON;
		const menus: Record<string, { command?: string; when?: string }[]> | undefined =
			pkg?.contributes?.menus;
		if (!menus) {
			continue;
		}

		// Build a title lookup from contributes.commands
		const titleMap = new Map<string, string>();
		const declaredCmds: { command: string; title: string | { value: string } }[] =
			pkg?.contributes?.commands ?? [];
		for (const c of declaredCmds) {
			const t = typeof c.title === 'string' ? c.title : c.title?.value ?? '';
			titleMap.set(c.command, t);
		}

		for (const [menuId, items] of Object.entries(menus)) {
			if (!Array.isArray(items)) {
				continue;
			}
			for (const item of items) {
				if (item.command) {
					placements.push({
						commandId: item.command,
						menuId,
						when: item.when ?? undefined,
						source: `ext:${ext.id}`,
						title: titleMap.get(item.command),
					});
				}
			}
		}
	}

	return placements;
}

/**
 * Collect every command placement from loaded `.menu.yaml` files.
 * Walks the tree recursively, inheriting `when` from ancestors.
 */
function collectYamlMenuPlacements(): MenuPlacement[] {
	const definitions = scanMenuFiles();
	const placements: MenuPlacement[] = [];

	for (const def of definitions) {
		const sourceLabel = `yaml:${path.basename(def.sourcePath)}`;
		collectFromNodes(def.items, def.menu, def.when, sourceLabel, placements);
	}

	return placements;
}

function collectFromNodes(
	nodes: MenuNode[],
	menuId: string,
	inheritedWhen: string | undefined,
	source: string,
	placements: MenuPlacement[],
): void {
	for (const node of nodes) {
		// Combine inherited when-clause with node's own when-clause
		const effectiveWhen = combineWhen(inheritedWhen, node.when);

		if (node.action?.kind === 'command') {
			placements.push({
				commandId: node.action.id,
				menuId,
				when: effectiveWhen,
				source,
				title: node.title,
			});
		}

		if (node.children.length > 0) {
			collectFromNodes(node.children, menuId, effectiveWhen, source, placements);
		}
	}
}

function combineWhen(parent: string | undefined, child: string | undefined): string | undefined {
	if (!parent && !child) {
		return undefined;
	}
	if (!parent) {
		return child;
	}
	if (!child) {
		return parent;
	}
	return `${parent} && ${child}`;
}

/**
 * Rough heuristic: check if two when-clauses are likely mutually exclusive.
 * Looks for patterns like `editorLangId == X` vs `editorLangId == Y` (X ≠ Y).
 */
function likelyMutuallyExclusive(whenA: string | undefined, whenB: string | undefined): boolean {
	if (!whenA || !whenB) {
		return false; // no condition means always visible → can overlap
	}

	// Extract editorLangId comparisons
	const langIdPattern = /editorLangId\s*==\s*(\S+)/gi;
	const langsA = [...whenA.matchAll(langIdPattern)].map(m => m[1].toLowerCase());
	const langsB = [...whenB.matchAll(langIdPattern)].map(m => m[1].toLowerCase());
	if (langsA.length > 0 && langsB.length > 0) {
		const overlap = langsA.some(a => langsB.includes(a));
		if (!overlap) {
			return true;
		}
	}

	// Extract resourceExtname comparisons
	const extPattern = /resourceExtname\s*==\s*(\S+)/gi;
	const extsA = [...whenA.matchAll(extPattern)].map(m => m[1].toLowerCase());
	const extsB = [...whenB.matchAll(extPattern)].map(m => m[1].toLowerCase());
	if (extsA.length > 0 && extsB.length > 0) {
		const overlap = extsA.some(a => extsB.includes(a));
		if (!overlap) {
			return true;
		}
	}

	// Extract platform checks
	const platforms = ['isWindows', 'isMac', 'isLinux'];
	const platA = platforms.filter(p => whenA.includes(p));
	const platB = platforms.filter(p => whenB.includes(p));
	if (platA.length > 0 && platB.length > 0) {
		const overlap = platA.some(a => platB.includes(a));
		if (!overlap) {
			return true;
		}
	}

	return false;
}

/**
 * Check for duplicate command placements across all sources:
 * - VS Code built-in menu contributions
 * - Extensions' menu contributions (from package.json)
 * - Menu-loader YAML definitions
 *
 * Reports duplicates with their when-clauses so the user can judge
 * if they are mutually exclusive (and thus acceptable).
 */
export async function checkDuplicates(): Promise<void> {
	const extPlacements = collectExtensionMenuPlacements();
	const yamlPlacements = collectYamlMenuPlacements();
	const allPlacements = [...extPlacements, ...yamlPlacements];

	// Group by commandId → list of placements
	const byCommand = new Map<string, MenuPlacement[]>();
	for (const p of allPlacements) {
		const list = byCommand.get(p.commandId) ?? [];
		list.push(p);
		byCommand.set(p.commandId, list);
	}

	// Find commands that appear in YAML AND somewhere else (or multiple YAMLs)
	const yamlCommandIds = new Set(yamlPlacements.map(p => p.commandId));
	const duplicates: { commandId: string; placements: MenuPlacement[] }[] = [];

	for (const cmdId of yamlCommandIds) {
		const all = byCommand.get(cmdId);
		if (!all || all.length < 2) {
			continue;
		}
		duplicates.push({ commandId: cmdId, placements: all });
	}

	// Sort by command ID for stable output
	duplicates.sort((a, b) => a.commandId.localeCompare(b.commandId));

	// ── Render report ────────────────────────────────────────────────────
	const lines: string[] = [];
	lines.push('# Duplicate Command Detection Report');
	lines.push('');
	lines.push(`Generated: ${new Date().toISOString()}`);
	lines.push('');
	lines.push(`Scanned: ${extPlacements.length} extension menu placements, ` +
		`${yamlPlacements.length} YAML menu placements.`);
	lines.push('');

	if (duplicates.length === 0) {
		lines.push('## \u2705 No Duplicates Found');
		lines.push('');
		lines.push('None of the commands in your `.menu.yaml` files duplicate commands ' +
			'already placed in menus by extensions or VS Code.');
	} else {
		lines.push(`Found **${duplicates.length}** command(s) that appear in multiple menu sources.`);
		lines.push('');
		lines.push('> Commands marked \u2705 have **mutually exclusive** when-clauses and are likely fine.');
		lines.push('> Commands marked \u26A0 have **overlapping** visibility and may show duplicate menu items.');
		lines.push('');

		for (const dup of duplicates) {
			// Check pairwise if all YAML entries are mutually exclusive with all ext entries
			const yamlEntries = dup.placements.filter(p => p.source.startsWith('yaml:'));
			const otherEntries = dup.placements.filter(p => !p.source.startsWith('yaml:'));

			let allExclusive = true;
			if (otherEntries.length > 0) {
				for (const y of yamlEntries) {
					for (const o of otherEntries) {
						if (!likelyMutuallyExclusive(y.when, o.when)) {
							allExclusive = false;
						}
					}
				}
			} else {
				// Multiple YAML files have the same command — check between them
				for (let i = 0; i < yamlEntries.length; i++) {
					for (let j = i + 1; j < yamlEntries.length; j++) {
						if (!likelyMutuallyExclusive(yamlEntries[i].when, yamlEntries[j].when)) {
							allExclusive = false;
						}
					}
				}
			}

			const icon = allExclusive ? '\u2705' : '\u26A0';
			const verdict = allExclusive
				? 'Mutually exclusive \u2014 likely OK'
				: 'Overlapping visibility \u2014 may show duplicates';

			lines.push(`### ${icon} \`${dup.commandId}\``);
			lines.push('');
			lines.push(`**Verdict:** ${verdict}`);
			lines.push('');
			lines.push('| Source | Menu | When | Title |');
			lines.push('|---|---|---|---|');
			for (const p of dup.placements) {
				const whenCell = p.when ? `\`${p.when}\`` : '*(always)*';
				const titleCell = p.title ?? '—';
				lines.push(`| ${p.source} | \`${p.menuId}\` | ${whenCell} | ${titleCell} |`);
			}
			lines.push('');
		}

		lines.push('---');
		lines.push('');
		lines.push('## How to Read This Report');
		lines.push('');
		lines.push('- **Source** — `ext:publisher.name` means an extension\'s `package.json` menu contribution; `yaml:filename` means a `.menu.yaml` file.');
		lines.push('- **Menu** — The menu location (e.g. `editor/context`, `MenubarEditMenu`).');
		lines.push('- **When** — The when-clause that controls visibility. If two entries have mutually exclusive when-clauses (e.g. different `editorLangId`), they won\'t both appear at the same time.');
		lines.push('- **Verdict** — \u2705 means the when-clauses are mutually exclusive so the duplicate is harmless. \u26A0 means the items may both be visible simultaneously.');
	}

	await writeAndOpen('duplicates.md', lines.join('\n'));
}

// ─── Dump All ────────────────────────────────────────────────────────────────

/**
 * Run all tools at once and write cache files without opening documents.
 * Useful as a one-shot bootstrap when setting up a workspace for Copilot.
 */
export async function dumpAll(): Promise<void> {
	const cacheDir = getCacheDir();
	if (!cacheDir) {
		vscode.window.showWarningMessage('Menu Loader: Open a workspace folder first.');
		return;
	}

	// Silently run each tool by calling the generation logic directly and
	// writing to files. We re-run the full functions but intercept the output.
	await listCommands();
	await listMenuIds();
	await showMenuTree();
	await validateMenuYaml();
	await checkDuplicates();

	vscode.window.showInformationMessage(
		`Menu Loader: Cache files written to .vscode/menus/.cache/`
	);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Open an untitled markdown document with the given content.
 * Fallback when no workspace is open.
 */
async function openMarkdownOutput(content: string): Promise<void> {
	const doc = await vscode.workspace.openTextDocument({
		language: 'markdown',
		content,
	});
	await vscode.window.showTextDocument(doc);
}
