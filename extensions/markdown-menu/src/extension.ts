/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

const MARKDOWN_LANGUAGES = new Set([
	'markdown',
	'mermaid',
	'markwhen',
	'mdx',
	'rmd',         // R Markdown
	'quarto',      // Quarto markdown
]);

/** Disposables for the dynamically-added menu (submenu + items). */
let menuDisposables: vscode.Disposable[] = [];
let menuVisible = false;

export function activate(context: vscode.ExtensionContext) {

	// Register commands (always available — they just no-op without a markdown editor)
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

	// Show/hide the menu based on the active editor's language
	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor(() => updateMenuVisibility()),
		vscode.workspace.onDidOpenTextDocument(() => updateMenuVisibility()),
	);

	// Ensure menu state is cleaned up on deactivate
	context.subscriptions.push({ dispose: disposeMenu });

	// Initial check
	updateMenuVisibility();
}

function isMarkdownLike(editor: vscode.TextEditor | undefined): boolean {
	if (!editor) {
		return false;
	}
	return MARKDOWN_LANGUAGES.has(editor.document.languageId);
}

function updateMenuVisibility() {
	const shouldShow = isMarkdownLike(vscode.window.activeTextEditor);

	if (shouldShow && !menuVisible) {
		showMenu();
	} else if (!shouldShow && menuVisible) {
		disposeMenu();
	}
}

function showMenu() {
	const { submenuId, disposable: submenuDisposable } = vscode.menus.addSubmenu('MenubarMainMenu', {
		title: 'Markdown',
		order: 10
	});
	menuDisposables.push(submenuDisposable);

	const items: { commandId: string; title: string; group: string; order: number }[] = [
		{ commandId: 'markdownMenu.bold', title: 'Toggle Bold', group: '1_format', order: 1 },
		{ commandId: 'markdownMenu.italic', title: 'Toggle Italic', group: '1_format', order: 2 },
		{ commandId: 'markdownMenu.heading', title: 'Insert Heading', group: '2_insert', order: 1 },
		{ commandId: 'markdownMenu.link', title: 'Insert Link', group: '2_insert', order: 2 },
		{ commandId: 'markdownMenu.codeBlock', title: 'Insert Code Block', group: '2_insert', order: 3 },
		{ commandId: 'markdownMenu.bulletList', title: 'Insert Bullet List', group: '2_insert', order: 4 },
		{ commandId: 'markdownMenu.preview', title: 'Open Preview', group: '3_preview', order: 1 },
	];

	for (const item of items) {
		menuDisposables.push(vscode.menus.addMenuItem(submenuId, item));
	}

	menuVisible = true;
}

function disposeMenu() {
	for (const d of menuDisposables) {
		d.dispose();
	}
	menuDisposables = [];
	menuVisible = false;
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
