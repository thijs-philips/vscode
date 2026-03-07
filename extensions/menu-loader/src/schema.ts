/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// ─── Raw YAML shape (what the user writes) ───────────────────────────────────

/**
 * Top-level structure of a `.menu.yaml` file.
 */
export interface MenuDefinitionYaml {
	/** Human-readable name used for merging definitions across files. */
	name: string;

	/**
	 * Target menu id, e.g. `MenubarMainMenu`, `MenubarEditMenu`,
	 * `EditorContext`, `window/toolbar`.
	 * Use `null` to inject items directly into an existing menu without
	 * creating a new submenu.
	 */
	menu: string;

	/**
	 * Optional when-clause evaluated against current context.
	 * If it evaluates to false the entire menu is hidden.
	 */
	when?: string;

	/**
	 * Display title for the top-level submenu (ignored when `menu` is null).
	 */
	title?: string;

	/**
	 * Group string placed on the top-level submenu entry.
	 */
	group?: string;

	/**
	 * Sort order within the group.
	 */
	order?: number;

	/**
	 * Optional codicon name for the submenu, e.g. `'markdown'`.
	 */
	icon?: string;

	/**
	 * Tree of groups and items that populate this menu.
	 */
	items: MenuNodeYaml[];
}

/**
 * A node inside the `items` tree. It can be:
 * - A **group separator** (has `group` + nested `items`)
 * - A **submenu** (has `title` + nested `items`, no action fields)
 * - A **leaf item** (has `title` + exactly one action field)
 */
export interface MenuNodeYaml {
	/** Display title. Required for leaf items and submenus. */
	title?: string;

	/**
	 * Group string. At depth 0 this creates a separator-delimited section.
	 * At depth > 0 this creates a submenu flyout.
	 */
	group?: string;

	/** Sort order within the parent. */
	order?: number;

	/** Optional when-clause. If false, this node and all children are hidden. */
	when?: string;

	/** Optional codicon name for this item. */
	icon?: string;

	// ── Action fields (mutually exclusive, exactly one on leaf items) ─────

	/**
	 * Execute a registered VS Code command.
	 * Can be a string command id or `{ id: string; args: any[] }`.
	 */
	command?: string | { id: string; args?: unknown[] };

	/** Run a shell command in a VS Code terminal. */
	shell?: string | { cmd: string; cwd?: string; name?: string };

	/** Insert a snippet body (supports `${TM_SELECTED_TEXT}`, tab stops, etc.). */
	snippet?: string;

	/** Open a URL in the default browser. */
	url?: string;

	/** Open the chat panel with a pre-filled prompt. */
	chat?: string;

	/** Copy the given text to the clipboard. */
	clipboard?: string;

	// ── Nesting ──────────────────────────────────────────────────────────

	/** Nested child nodes. */
	items?: MenuNodeYaml[];
}

// ─── Parsed / normalised internal representation ─────────────────────────────

/**
 * A fully resolved menu definition ready for the menu builder.
 */
export interface MenuDefinition {
	name: string;
	menu: string;
	when: string | undefined;
	title: string | undefined;
	group: string | undefined;
	order: number | undefined;
	icon: string | undefined;
	items: MenuNode[];
	/** Absolute path of the source file — used for diagnostics. */
	sourcePath: string;
}

export type ActionKind = 'command' | 'shell' | 'snippet' | 'url' | 'chat' | 'clipboard';

export interface CommandAction {
	kind: 'command';
	id: string;
	args?: unknown[];
}

export interface ShellAction {
	kind: 'shell';
	cmd: string;
	cwd?: string;
	name?: string;
}

export interface SnippetAction {
	kind: 'snippet';
	body: string;
}

export interface UrlAction {
	kind: 'url';
	href: string;
}

export interface ChatAction {
	kind: 'chat';
	prompt: string;
}

export interface ClipboardAction {
	kind: 'clipboard';
	text: string;
}

export type MenuAction =
	| CommandAction
	| ShellAction
	| SnippetAction
	| UrlAction
	| ChatAction
	| ClipboardAction;

/**
 * Internal representation of a single node in the menu tree.
 */
export interface MenuNode {
	title: string | undefined;
	group: string | undefined;
	order: number | undefined;
	when: string | undefined;
	icon: string | undefined;
	action: MenuAction | undefined;
	children: MenuNode[];
}
