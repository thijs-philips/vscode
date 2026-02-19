/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {

	// Register markdown editing commands
	context.subscriptions.push(
		vscode.commands.registerCommand('markdownMenu.bold', () => {
			wrapSelectionWith('**');
		}),
		vscode.commands.registerCommand('markdownMenu.italic', () => {
			wrapSelectionWith('_');
		}),
		vscode.commands.registerCommand('markdownMenu.heading', () => {
			insertAtLineStart('## ');
		}),
		vscode.commands.registerCommand('markdownMenu.link', () => {
			wrapSelectionAsLink();
		}),
		vscode.commands.registerCommand('markdownMenu.codeBlock', () => {
			insertCodeBlock();
		}),
		vscode.commands.registerCommand('markdownMenu.bulletList', () => {
			insertAtLineStart('- ');
		}),
		vscode.commands.registerCommand('markdownMenu.preview', () => {
			vscode.commands.executeCommand('markdown.showPreview');
		})
	);

	// Add a top-level "Markdown" submenu to the main menu bar (after Help, which is order 8)
	const { submenuId, disposable: submenuDisposable } = vscode.menus.addSubmenu('MenubarMainMenu', {
		title: 'Markdown',
		order: 10
	});
	context.subscriptions.push(submenuDisposable);

	// Add items into the Markdown submenu
	context.subscriptions.push(
		vscode.menus.addMenuItem(submenuId, {
			commandId: 'markdownMenu.bold',
			title: 'Toggle Bold',
			group: '1_format',
			order: 1
		}),
		vscode.menus.addMenuItem(submenuId, {
			commandId: 'markdownMenu.italic',
			title: 'Toggle Italic',
			group: '1_format',
			order: 2
		}),
		vscode.menus.addMenuItem(submenuId, {
			commandId: 'markdownMenu.heading',
			title: 'Insert Heading',
			group: '2_insert',
			order: 1
		}),
		vscode.menus.addMenuItem(submenuId, {
			commandId: 'markdownMenu.link',
			title: 'Insert Link',
			group: '2_insert',
			order: 2
		}),
		vscode.menus.addMenuItem(submenuId, {
			commandId: 'markdownMenu.codeBlock',
			title: 'Insert Code Block',
			group: '2_insert',
			order: 3
		}),
		vscode.menus.addMenuItem(submenuId, {
			commandId: 'markdownMenu.bulletList',
			title: 'Insert Bullet List',
			group: '2_insert',
			order: 4
		}),
		vscode.menus.addMenuItem(submenuId, {
			commandId: 'markdownMenu.preview',
			title: 'Open Preview',
			group: '3_preview',
			order: 1
		})
	);
}

function wrapSelectionWith(wrapper: string) {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		return;
	}
	const selection = editor.selection;
	const text = editor.document.getText(selection);
	editor.edit(editBuilder => {
		editBuilder.replace(selection, `${wrapper}${text}${wrapper}`);
	});
}

function insertAtLineStart(prefix: string) {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		return;
	}
	const line = editor.selection.active.line;
	const position = new vscode.Position(line, 0);
	editor.edit(editBuilder => {
		editBuilder.insert(position, prefix);
	});
}

function wrapSelectionAsLink() {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		return;
	}
	const selection = editor.selection;
	const text = editor.document.getText(selection);
	editor.edit(editBuilder => {
		editBuilder.replace(selection, `[${text}](url)`);
	});
}

function insertCodeBlock() {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		return;
	}
	const selection = editor.selection;
	const text = editor.document.getText(selection);
	editor.edit(editBuilder => {
		editBuilder.replace(selection, `\`\`\`\n${text}\n\`\`\``);
	});
}

export function deactivate() { }
