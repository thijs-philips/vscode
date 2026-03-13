/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { MenuDefinition, MenuNode, MenuAction } from './schema';
import { ConditionContext, evaluateWhen } from './conditions';
import { expandVariables } from './variables';
import { resolvePosition } from './positioning';

/** Counter for generating unique command ids for action wrappers. */
let commandCounter = 0;

/**
 * Holds all disposables for a single built menu definition so it can be
 * torn down and rebuilt on context changes.
 */
export interface BuiltMenu {
	/** Definition this was built from. */
	definition: MenuDefinition;
	/** All disposables (submenu entries, menu items, commands). */
	disposables: vscode.Disposable[];
}

/**
 * Build a complete menu tree from a {@link MenuDefinition}, registering
 * submenus and menu items via the `vscode.menus` API.
 *
 * Returns a {@link BuiltMenu} whose disposables must be disposed to tear
 * the menu down.
 */
export async function buildMenu(definition: MenuDefinition, ctx: ConditionContext): Promise<BuiltMenu> {
	const disposables: vscode.Disposable[] = [];

	// Top-level when gate
	if (!evaluateWhen(definition.when, ctx)) {
		return { definition, disposables };
	}

	const targetMenuId = definition.menu;

	if (definition.title) {
		// Resolve relative position if specified
		let group = definition.group;
		let order = definition.order;
		if (definition.position) {
			const resolved = await resolvePosition(targetMenuId, definition.position, group, order);
			group = resolved.group;
			order = resolved.order;
		}

		// Create a top-level submenu in the target menu
		const { submenuId, disposable } = vscode.menus.addSubmenu(targetMenuId, {
			title: definition.title,
			icon: definition.icon,
			group,
			order,
		});
		disposables.push(disposable);

		// Populate this submenu with child items
		await buildChildren(submenuId, definition.items, ctx, disposables, 0);
	} else {
		// No title = inject items directly into the target menu
		await buildChildren(targetMenuId, definition.items, ctx, disposables, 0);
	}

	return { definition, disposables };
}

/**
 * Recursively build child nodes into the given parent menu.
 *
 * @param parentMenuId The menu to add items into.
 * @param nodes The child nodes from the YAML tree.
 * @param ctx The current condition context.
 * @param disposables Accumulator for all created disposables.
 * @param depth Current nesting depth (0 = top of items tree).
 */
async function buildChildren(
	parentMenuId: string,
	nodes: MenuNode[],
	ctx: ConditionContext,
	disposables: vscode.Disposable[],
	depth: number,
): Promise<void> {
	for (const node of nodes) {
		// Skip hidden nodes (and all their children)
		if (!evaluateWhen(node.when, ctx)) {
			continue;
		}

		if (node.children.length > 0 && !node.action) {
			// This is a container node (group or submenu)
			if (node.group && depth === 0 && !node.title) {
				// Depth 0 group without title: flat separator section
				// Items get the group string prepended so VS Code renders separators
				await buildGroupSection(parentMenuId, node, ctx, disposables, depth);
			} else {
				// Submenu flyout — either nested depth, or depth 0 group with title
				await buildSubmenu(parentMenuId, node, ctx, disposables, depth);
			}
		} else if (node.action) {
			// Leaf item with an action
			buildLeafItem(parentMenuId, node, ctx, disposables);
		}
	}
}

/**
 * Build a group section: items share the same `group` string and are rendered
 * with a separator before/after.
 */
async function buildGroupSection(
	parentMenuId: string,
	node: MenuNode,
	ctx: ConditionContext,
	disposables: vscode.Disposable[],
	depth: number,
): Promise<void> {
	// Resolve group via relative position if specified
	let groupName = node.group!;
	let groupOrder = node.order;
	if (node.position) {
		const resolved = await resolvePosition(parentMenuId, node.position, groupName, groupOrder);
		groupName = resolved.group ?? groupName;
		groupOrder = resolved.order;
	}

	for (const child of node.children) {
		if (!evaluateWhen(child.when, ctx)) {
			continue;
		}

		if (child.children.length > 0 && !child.action) {
			// Nested container inside a group — becomes a submenu
			const title = child.title ?? child.group ?? 'Untitled';
			const { submenuId, disposable } = vscode.menus.addSubmenu(parentMenuId, {
				title,
				icon: child.icon,
				group: groupName,
				order: child.order,
			});
			disposables.push(disposable);
			await buildChildren(submenuId, child.children, ctx, disposables, depth + 1);
		} else if (child.action) {
			// Leaf inside a group
			const commandId = registerActionCommand(child.action, disposables);
			disposables.push(vscode.menus.addMenuItem(parentMenuId, {
				commandId,
				title: child.title ?? commandId,
				icon: child.icon,
				group: groupName,
				order: child.order,
			}));
		}
	}
}

/**
 * Build a submenu flyout node.
 */
async function buildSubmenu(
	parentMenuId: string,
	node: MenuNode,
	ctx: ConditionContext,
	disposables: vscode.Disposable[],
	depth: number,
): Promise<void> {
	const title = node.title ?? node.group ?? 'Untitled';

	// Resolve group/order via relative position if specified
	let group = node.group;
	let order = node.order;
	if (node.position) {
		const resolved = await resolvePosition(parentMenuId, node.position, group, order);
		group = resolved.group;
		order = resolved.order;
	}

	const { submenuId, disposable } = vscode.menus.addSubmenu(parentMenuId, {
		title,
		icon: node.icon,
		group,
		order,
	});
	disposables.push(disposable);

	await buildChildren(submenuId, node.children, ctx, disposables, depth + 1);
}

/**
 * Build a single leaf menu item that executes an action.
 */
function buildLeafItem(
	parentMenuId: string,
	node: MenuNode,
	_ctx: ConditionContext,
	disposables: vscode.Disposable[],
): void {
	if (!node.action) {
		return;
	}

	const commandId = registerActionCommand(node.action, disposables);
	disposables.push(vscode.menus.addMenuItem(parentMenuId, {
		commandId,
		title: node.title ?? commandId,
		icon: node.icon,
		group: node.group,
		order: node.order,
	}));
}

/**
 * Register a VS Code command that executes the given {@link MenuAction}.
 * Returns the generated command id.
 */
function registerActionCommand(action: MenuAction, disposables: vscode.Disposable[]): string {
	// For plain `command` actions with no args, use the command id directly
	// (no wrapper needed)
	if (action.kind === 'command' && !action.args?.length) {
		return action.id;
	}

	const id = `menuLoader._action_${++commandCounter}`;

	const disposable = vscode.commands.registerCommand(id, async () => {
		await executeAction(action);
	});
	disposables.push(disposable);

	return id;
}

/**
 * Execute a single menu action.
 */
async function executeAction(action: MenuAction): Promise<void> {
	switch (action.kind) {
		case 'command': {
			if (action.args?.length) {
				await vscode.commands.executeCommand(action.id, ...action.args);
			} else {
				await vscode.commands.executeCommand(action.id);
			}
			break;
		}
		case 'shell': {
			const cmd = await expandVariables(action.cmd);
			const cwd = action.cwd ? await expandVariables(action.cwd) : undefined;
			const terminal = vscode.window.createTerminal({
				name: action.name ?? 'Menu Loader',
				cwd,
			});
			terminal.show();
			terminal.sendText(cmd);
			break;
		}
		case 'snippet': {
			await vscode.commands.executeCommand('editor.action.insertSnippet', {
				snippet: action.body,
			});
			break;
		}
		case 'url': {
			const href = await expandVariables(action.href);
			await vscode.env.openExternal(vscode.Uri.parse(href));
			break;
		}
		case 'chat': {
			const prompt = await expandVariables(action.prompt);
			await vscode.commands.executeCommand('workbench.action.chat.open', { query: prompt });
			break;
		}
		case 'clipboard': {
			const text = await expandVariables(action.text);
			await vscode.env.clipboard.writeText(text);
			vscode.window.setStatusBarMessage(`Copied to clipboard`, 2000);
			break;
		}
	}
}
