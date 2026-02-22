/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';

// ─── Activation ──────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext) {
	registerCommands(context);
	buildMenus(context);
}

// ─── Command Registration ────────────────────────────────────────────────────

function registerCommands(ctx: vscode.ExtensionContext) {
	const commands: [string, (...args: any[]) => any][] = [
		// Convert Case
		['textToolkit.toUpperCase', () => vscode.commands.executeCommand('editor.action.transformToUppercase')],
		['textToolkit.toLowerCase', () => vscode.commands.executeCommand('editor.action.transformToLowercase')],
		['textToolkit.toProperCase', () => vscode.commands.executeCommand('editor.action.transformToTitlecase')],
		['textToolkit.toProperCaseBlend', () => transformSelection(toProperCaseBlend)],
		['textToolkit.toSentenceCase', () => transformSelection(toSentenceCase)],
		['textToolkit.toSentenceCaseBlend', () => transformSelection(toSentenceCaseBlend)],
		['textToolkit.toInvertCase', () => transformSelection(invertCase)],

		// Line Operations
		['textToolkit.duplicateLine', () => vscode.commands.executeCommand('editor.action.copyLinesDownAction')],
		['textToolkit.removeDuplicateLines', () => vscode.commands.executeCommand('editor.action.removeDuplicateLines')],
		['textToolkit.removeConsecutiveDuplicates', removeConsecutiveDuplicates],
		['textToolkit.splitLines', splitLines],
		['textToolkit.joinLines', () => vscode.commands.executeCommand('editor.action.joinLines')],
		['textToolkit.moveLineUp', () => vscode.commands.executeCommand('editor.action.moveLinesUpAction')],
		['textToolkit.moveLineDown', () => vscode.commands.executeCommand('editor.action.moveLinesDownAction')],
		['textToolkit.removeEmptyLines', () => removeEmptyLines(false)],
		['textToolkit.removeBlankLines', () => removeEmptyLines(true)],
		['textToolkit.insertBlankLineAbove', () => vscode.commands.executeCommand('editor.action.insertLineBefore')],
		['textToolkit.insertBlankLineBelow', () => vscode.commands.executeCommand('editor.action.insertLineAfter')],
		['textToolkit.reverseLineOrder', () => vscode.commands.executeCommand('editor.action.reverseLines')],
		['textToolkit.randomizeLineOrder', randomizeLineOrder],

		// Sort
		['textToolkit.sortLexAsc', () => vscode.commands.executeCommand('editor.action.sortLinesAscending')],
		['textToolkit.sortLexDesc', () => vscode.commands.executeCommand('editor.action.sortLinesDescending')],
		['textToolkit.sortLexAscIgnoreCase', () => sortLines((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))],
		['textToolkit.sortLexDescIgnoreCase', () => sortLines((a, b) => b.toLowerCase().localeCompare(a.toLowerCase()))],
		['textToolkit.sortIntAsc', () => sortLines((a, b) => (parseInt(a) || 0) - (parseInt(b) || 0))],
		['textToolkit.sortIntDesc', () => sortLines((a, b) => (parseInt(b) || 0) - (parseInt(a) || 0))],
		['textToolkit.sortDecCommaAsc', () => sortLines((a, b) => parseDecComma(a) - parseDecComma(b))],
		['textToolkit.sortDecCommaDesc', () => sortLines((a, b) => parseDecComma(b) - parseDecComma(a))],
		['textToolkit.sortDecDotAsc', () => sortLines((a, b) => (parseFloat(a) || 0) - (parseFloat(b) || 0))],
		['textToolkit.sortDecDotDesc', () => sortLines((a, b) => (parseFloat(b) || 0) - (parseFloat(a) || 0))],
		['textToolkit.deduplicateKeepFirst', () => deduplicateLines('first')],
		['textToolkit.deduplicateKeepLast', () => deduplicateLines('last')],

		// EOL Conversion
		['textToolkit.eolWindows', () => setEol(vscode.EndOfLine.CRLF)],
		['textToolkit.eolUnix', () => setEol(vscode.EndOfLine.LF)],
		['textToolkit.eolMac', () => convertToCR()],

		// Blank Operations
		['textToolkit.trimTrailing', () => vscode.commands.executeCommand('editor.action.trimTrailingWhitespace')],
		['textToolkit.trimLeading', () => transformAllLines(line => line.trimStart())],
		['textToolkit.trimBoth', () => transformAllLines(line => line.trim())],
		['textToolkit.eolToSpace', eolToSpace],
		['textToolkit.tabToSpace', tabToSpace],
		['textToolkit.spaceToTabAll', () => spaceToTab(false)],
		['textToolkit.spaceToTabLeading', () => spaceToTab(true)],

		// Copy Filename
		['textToolkit.copyFullPath', () => copyPathInfo('full')],
		['textToolkit.copyFilename', () => copyPathInfo('name')],
		['textToolkit.copyDirPath', () => copyPathInfo('dir')],

		// Line Filtering
		['textToolkit.keepLinesMatching', () => filterLines('keep')],
		['textToolkit.removeLinesMatching', () => filterLines('remove')],
		['textToolkit.keepLinesNotMatching', () => filterLines('keepNot')],
		['textToolkit.copyMatchesToNew', () => filterLines('copyToNew')],
		['textToolkit.moveMatchesToNew', () => filterLines('moveToNew')],

		// Sequence & Numbering
		['textToolkit.insertNumberSequence', insertNumberSequence],
		['textToolkit.insertRomanSequence', insertRomanSequence],
		['textToolkit.insertLetterSequence', insertLetterSequence],
		['textToolkit.incrementNumbers', incrementNumbers],

		// Join / Split
		['textToolkit.joinWithDelimiter', joinWithDelimiter],
		['textToolkit.splitByDelimiter', splitByDelimiter],

		// Alignment
		['textToolkit.alignByDelimiter', alignByDelimiter],
		['textToolkit.alignToColumns', alignToColumns],
	];

	for (const [id, handler] of commands) {
		ctx.subscriptions.push(vscode.commands.registerCommand(id, handler));
	}
}

// ─── Menu Building ───────────────────────────────────────────────────────────

function buildMenus(ctx: vscode.ExtensionContext) {
	// Add submenus under the existing Edit menu (MenubarEditMenu)
	// Using group '9_text' to place them after the built-in Edit menu groups
	const editMenuId = 'MenubarEditMenu';

	const submenus: { key: string; title: string; order: number }[] = [
		{ key: 'convertCase', title: 'Convert Case To', order: 1 },
		{ key: 'lineOps', title: 'Line Operations', order: 2 },
		{ key: 'sort', title: 'Sort', order: 3 },
		{ key: 'eol', title: 'EOL Conversion', order: 4 },
		{ key: 'blank', title: 'Blank Operations', order: 5 },
		{ key: 'copyPath', title: 'Copy Filename to Clipboard', order: 6 },
		{ key: 'filter', title: 'Line Filtering', order: 7 },
		{ key: 'sequence', title: 'Sequence & Numbering', order: 8 },
		{ key: 'joinSplit', title: 'Join / Split', order: 9 },
		{ key: 'align', title: 'Alignment', order: 10 },
	];

	const submenuIds: Record<string, string> = {};
	for (const sm of submenus) {
		const { submenuId, disposable } = vscode.menus.addSubmenu(editMenuId, {
			title: sm.title,
			group: '9_text',
			order: sm.order
		});
		submenuIds[sm.key] = submenuId;
		ctx.subscriptions.push(disposable);
	}

	// ── Convert Case items ───────────────────────────────────────────────
	const caseItems: [string, string, number][] = [
		['textToolkit.toUpperCase', 'UPPERCASE', 1],
		['textToolkit.toLowerCase', 'lowercase', 2],
		['textToolkit.toProperCase', 'Proper Case', 3],
		['textToolkit.toProperCaseBlend', 'Proper Case (blend)', 4],
		['textToolkit.toSentenceCase', 'Sentence case', 5],
		['textToolkit.toSentenceCaseBlend', 'Sentence case (blend)', 6],
		['textToolkit.toInvertCase', 'iNVERT cASE', 7],
	];
	addItems(ctx, submenuIds['convertCase'], caseItems);

	// ── Line Operations items ────────────────────────────────────────────
	const lineItems: [string, string, number][] = [
		['textToolkit.duplicateLine', 'Duplicate Current Line', 1],
		['textToolkit.removeDuplicateLines', 'Remove Duplicate Lines', 2],
		['textToolkit.removeConsecutiveDuplicates', 'Remove Consecutive Duplicate Lines', 3],
		['textToolkit.splitLines', 'Split Lines', 4],
		['textToolkit.joinLines', 'Join Lines', 5],
		['textToolkit.moveLineUp', 'Move Up Current Line', 6],
		['textToolkit.moveLineDown', 'Move Down Current Line', 7],
		['textToolkit.removeEmptyLines', 'Remove Empty Lines', 8],
		['textToolkit.removeBlankLines', 'Remove Empty Lines (Containing Blank Characters)', 9],
		['textToolkit.insertBlankLineAbove', 'Insert Blank Line Above Current', 10],
		['textToolkit.insertBlankLineBelow', 'Insert Blank Line Below Current', 11],
		['textToolkit.reverseLineOrder', 'Reverse Line Order', 12],
		['textToolkit.randomizeLineOrder', 'Randomize Line Order', 13],
	];
	addItems(ctx, submenuIds['lineOps'], lineItems);

	// ── Sort items ───────────────────────────────────────────────────────
	const sortItems: [string, string, number][] = [
		['textToolkit.sortLexAsc', 'Sort Lines Ascending', 1],
		['textToolkit.sortLexDesc', 'Sort Lines Descending', 2],
		['textToolkit.sortLexAscIgnoreCase', 'Sort Ascending (Ignore Case)', 3],
		['textToolkit.sortLexDescIgnoreCase', 'Sort Descending (Ignore Case)', 4],
		['textToolkit.sortIntAsc', 'Sort as Integers Ascending', 5],
		['textToolkit.sortIntDesc', 'Sort as Integers Descending', 6],
		['textToolkit.sortDecCommaAsc', 'Sort as Decimals (Comma) Ascending', 7],
		['textToolkit.sortDecCommaDesc', 'Sort as Decimals (Comma) Descending', 8],
		['textToolkit.sortDecDotAsc', 'Sort as Decimals (Dot) Ascending', 9],
		['textToolkit.sortDecDotDesc', 'Sort as Decimals (Dot) Descending', 10],
		['textToolkit.deduplicateKeepFirst', 'Deduplicate Lines (Keep First)', 11],
		['textToolkit.deduplicateKeepLast', 'Deduplicate Lines (Keep Last)', 12],
	];
	addItems(ctx, submenuIds['sort'], sortItems);

	// ── EOL items ────────────────────────────────────────────────────────
	const eolItems: [string, string, number][] = [
		['textToolkit.eolWindows', 'Windows (CR LF)', 1],
		['textToolkit.eolUnix', 'Unix (LF)', 2],
		['textToolkit.eolMac', 'Mac (CR)', 3],
	];
	addItems(ctx, submenuIds['eol'], eolItems);

	// ── Blank Operations items ───────────────────────────────────────────
	const blankItems: [string, string, number][] = [
		['textToolkit.trimTrailing', 'Trim Trailing Space', 1],
		['textToolkit.trimLeading', 'Trim Leading Space', 2],
		['textToolkit.trimBoth', 'Trim Leading and Trailing Space', 3],
		['textToolkit.eolToSpace', 'EOL to Space', 4],
		['textToolkit.tabToSpace', 'TAB to Space', 5],
		['textToolkit.spaceToTabAll', 'Space to TAB (All)', 6],
		['textToolkit.spaceToTabLeading', 'Space to TAB (Leading)', 7],
	];
	addItems(ctx, submenuIds['blank'], blankItems);

	// ── Copy Path items ──────────────────────────────────────────────────
	const copyItems: [string, string, number][] = [
		['textToolkit.copyFullPath', 'Copy Current Full File Path', 1],
		['textToolkit.copyFilename', 'Copy Current Filename', 2],
		['textToolkit.copyDirPath', 'Copy Current Dir. Path', 3],
	];
	addItems(ctx, submenuIds['copyPath'], copyItems);

	// ── Line Filtering items ─────────────────────────────────────────────
	const filterItems: [string, string, number][] = [
		['textToolkit.keepLinesMatching', 'Keep Lines Matching…', 1],
		['textToolkit.removeLinesMatching', 'Remove Lines Matching…', 2],
		['textToolkit.keepLinesNotMatching', 'Keep Lines Not Matching…', 3],
		['textToolkit.copyMatchesToNew', 'Copy Matches to New Document…', 4],
		['textToolkit.moveMatchesToNew', 'Move Matches to New Document…', 5],
	];
	addItems(ctx, submenuIds['filter'], filterItems);

	// ── Sequence & Numbering items ───────────────────────────────────────
	const seqItems: [string, string, number][] = [
		['textToolkit.insertNumberSequence', 'Insert Number Sequence…', 1],
		['textToolkit.insertRomanSequence', 'Insert Roman Number Sequence…', 2],
		['textToolkit.insertLetterSequence', 'Insert Letter Sequence…', 3],
		['textToolkit.incrementNumbers', 'Increment Numbers in Selection…', 4],
	];
	addItems(ctx, submenuIds['sequence'], seqItems);

	// ── Join / Split items ───────────────────────────────────────────────
	const joinSplitItems: [string, string, number][] = [
		['textToolkit.joinWithDelimiter', 'Join Lines with Delimiter…', 1],
		['textToolkit.splitByDelimiter', 'Split by Delimiter / Pattern…', 2],
	];
	addItems(ctx, submenuIds['joinSplit'], joinSplitItems);

	// ── Alignment items ──────────────────────────────────────────────────
	const alignItems: [string, string, number][] = [
		['textToolkit.alignByDelimiter', 'Align by Delimiter…', 1],
		['textToolkit.alignToColumns', 'Align to Columns (by Whitespace)…', 2],
	];
	addItems(ctx, submenuIds['align'], alignItems);
}

function addItems(ctx: vscode.ExtensionContext, submenuId: string, items: [string, string, number][]) {
	for (const [commandId, title, order] of items) {
		ctx.subscriptions.push(vscode.menus.addMenuItem(submenuId, {
			commandId, title, order
		}));
	}
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getEditor(): vscode.TextEditor | undefined {
	return vscode.window.activeTextEditor;
}

function getSelectedRange(editor: vscode.TextEditor): vscode.Range {
	if (editor.selection.isEmpty) {
		return new vscode.Range(0, 0, editor.document.lineCount - 1, editor.document.lineAt(editor.document.lineCount - 1).text.length);
	}
	return editor.selection;
}

function getLinesInRange(editor: vscode.TextEditor, range: vscode.Range): string[] {
	const lines: string[] = [];
	for (let i = range.start.line; i <= range.end.line; i++) {
		lines.push(editor.document.lineAt(i).text);
	}
	return lines;
}

function replaceRange(editor: vscode.TextEditor, range: vscode.Range, newText: string): Thenable<boolean> {
	const fullRange = new vscode.Range(range.start.line, 0, range.end.line, editor.document.lineAt(range.end.line).text.length);
	return editor.edit(eb => eb.replace(fullRange, newText));
}

// ─── Case Conversion Implementations ────────────────────────────────────────

function transformSelection(fn: (text: string) => string) {
	const editor = getEditor();
	if (!editor) { return; }
	const sel = editor.selection;
	if (sel.isEmpty) { return; }
	const text = editor.document.getText(sel);
	editor.edit(eb => eb.replace(sel, fn(text)));
}

function toProperCaseBlend(text: string): string {
	// Capitalize first letter of each word, keep rest as-is
	return text.replace(/\b\w/g, c => c.toUpperCase());
}

function toSentenceCase(text: string): string {
	return text.toLowerCase().replace(/(^\s*|[.!?]\s+)(\w)/gm, (_, pre, ch) => pre + ch.toUpperCase());
}

function toSentenceCaseBlend(text: string): string {
	// Capitalize first letter after sentence boundaries, keep rest as-is
	return text.replace(/(^\s*|[.!?]\s+)(\w)/gm, (_, pre, ch) => pre + ch.toUpperCase());
}

function invertCase(text: string): string {
	return text.split('').map(c => c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()).join('');
}

// ─── Line Operations ────────────────────────────────────────────────────────

function removeConsecutiveDuplicates() {
	const editor = getEditor();
	if (!editor) { return; }
	const range = getSelectedRange(editor);
	const lines = getLinesInRange(editor, range);
	const result = lines.filter((line, i) => i === 0 || line !== lines[i - 1]);
	replaceRange(editor, range, result.join('\n'));
}

function splitLines() {
	const editor = getEditor();
	if (!editor) { return; }
	const sel = editor.selection;
	if (sel.isEmpty) { return; }
	const text = editor.document.getText(sel);
	// Split each line at cursor positions — but for simplicity, split selections into individual lines
	const lines = text.split('');
	editor.edit(eb => eb.replace(sel, lines.join('\n')));
}

function removeEmptyLines(includeBlank: boolean) {
	const editor = getEditor();
	if (!editor) { return; }
	const range = getSelectedRange(editor);
	const lines = getLinesInRange(editor, range);
	const result = lines.filter(line => includeBlank ? line.trim().length > 0 : line.length > 0);
	replaceRange(editor, range, result.join('\n'));
}

function randomizeLineOrder() {
	const editor = getEditor();
	if (!editor) { return; }
	const range = getSelectedRange(editor);
	const lines = getLinesInRange(editor, range);
	// Fisher-Yates shuffle
	for (let i = lines.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[lines[i], lines[j]] = [lines[j], lines[i]];
	}
	replaceRange(editor, range, lines.join('\n'));
}

// ─── Sort ────────────────────────────────────────────────────────────────────

function sortLines(compareFn: (a: string, b: string) => number) {
	const editor = getEditor();
	if (!editor) { return; }
	const range = getSelectedRange(editor);
	const lines = getLinesInRange(editor, range);
	lines.sort(compareFn);
	replaceRange(editor, range, lines.join('\n'));
}

function parseDecComma(s: string): number {
	const cleaned = s.trim().replace(',', '.');
	return parseFloat(cleaned) || 0;
}

function deduplicateLines(keep: 'first' | 'last') {
	const editor = getEditor();
	if (!editor) { return; }
	const range = getSelectedRange(editor);
	const lines = getLinesInRange(editor, range);

	if (keep === 'first') {
		const seen = new Set<string>();
		const result = lines.filter(line => {
			if (seen.has(line)) { return false; }
			seen.add(line);
			return true;
		});
		replaceRange(editor, range, result.join('\n'));
	} else {
		// Keep last: reverse, deduplicate keeping first, reverse back
		const reversed = [...lines].reverse();
		const seen = new Set<string>();
		const result = reversed.filter(line => {
			if (seen.has(line)) { return false; }
			seen.add(line);
			return true;
		});
		replaceRange(editor, range, result.reverse().join('\n'));
	}
}

// ─── EOL Conversion ─────────────────────────────────────────────────────────

function setEol(eol: vscode.EndOfLine) {
	const editor = getEditor();
	if (!editor) { return; }
	editor.edit(eb => eb.setEndOfLine(eol));
}

function convertToCR() {
	// VS Code doesn't natively support CR-only. Replace all line content with CR separators.
	const editor = getEditor();
	if (!editor) { return; }
	const doc = editor.document;
	const fullRange = new vscode.Range(0, 0, doc.lineCount - 1, doc.lineAt(doc.lineCount - 1).text.length);
	const lines: string[] = [];
	for (let i = 0; i < doc.lineCount; i++) {
		lines.push(doc.lineAt(i).text);
	}
	// Set to LF first, then the content will have \n. We replace via raw text with \r.
	// Note: VS Code doesn't support CR as EOL natively, so we just insert \r as text.
	editor.edit(eb => {
		eb.replace(fullRange, lines.join('\r'));
	});
}

// ─── Blank Operations ───────────────────────────────────────────────────────

function transformAllLines(fn: (line: string) => string) {
	const editor = getEditor();
	if (!editor) { return; }
	const range = getSelectedRange(editor);
	const lines = getLinesInRange(editor, range);
	replaceRange(editor, range, lines.map(fn).join('\n'));
}

function eolToSpace() {
	const editor = getEditor();
	if (!editor) { return; }
	const range = getSelectedRange(editor);
	const lines = getLinesInRange(editor, range);
	const fullRange = new vscode.Range(range.start.line, 0, range.end.line, editor.document.lineAt(range.end.line).text.length);
	editor.edit(eb => eb.replace(fullRange, lines.join(' ')));
}

function tabToSpace() {
	const editor = getEditor();
	if (!editor) { return; }
	const tabSize = editor.options.tabSize as number || 4;
	const range = getSelectedRange(editor);
	const lines = getLinesInRange(editor, range);
	const spaces = ' '.repeat(tabSize);
	replaceRange(editor, range, lines.map(l => l.replace(/\t/g, spaces)).join('\n'));
}

function spaceToTab(leadingOnly: boolean) {
	const editor = getEditor();
	if (!editor) { return; }
	const tabSize = editor.options.tabSize as number || 4;
	const range = getSelectedRange(editor);
	const lines = getLinesInRange(editor, range);
	const pattern = new RegExp(' '.repeat(tabSize), 'g');

	const result = lines.map(line => {
		if (leadingOnly) {
			const match = line.match(/^( +)/);
			if (match) {
				const leading = match[1].replace(pattern, '\t');
				return leading + line.slice(match[1].length);
			}
			return line;
		}
		return line.replace(pattern, '\t');
	});
	replaceRange(editor, range, result.join('\n'));
}

// ─── Copy Path ───────────────────────────────────────────────────────────────

function copyPathInfo(what: 'full' | 'name' | 'dir') {
	const editor = getEditor();
	if (!editor) { return; }
	const filePath = editor.document.uri.fsPath;
	let value: string;
	switch (what) {
		case 'full': value = filePath; break;
		case 'name': value = path.basename(filePath); break;
		case 'dir': value = path.dirname(filePath); break;
	}
	vscode.env.clipboard.writeText(value);
	vscode.window.showInformationMessage(`Copied: ${value}`);
}

// ─── Line Filtering ─────────────────────────────────────────────────────────

async function filterLines(mode: 'keep' | 'remove' | 'keepNot' | 'copyToNew' | 'moveToNew') {
	const editor = getEditor();
	if (!editor) { return; }

	const pattern = await vscode.window.showInputBox({
		prompt: 'Enter regex pattern',
		placeHolder: 'e.g. TODO|FIXME'
	});
	if (pattern === undefined) { return; }

	let regex: RegExp;
	try {
		regex = new RegExp(pattern, 'i');
	} catch {
		vscode.window.showErrorMessage('Invalid regex pattern');
		return;
	}

	const range = getSelectedRange(editor);
	const lines = getLinesInRange(editor, range);

	const matching = lines.filter(l => regex.test(l));
	const notMatching = lines.filter(l => !regex.test(l));

	switch (mode) {
		case 'keep':
			replaceRange(editor, range, matching.join('\n'));
			break;
		case 'remove':
			replaceRange(editor, range, notMatching.join('\n'));
			break;
		case 'keepNot':
			replaceRange(editor, range, notMatching.join('\n'));
			break;
		case 'copyToNew': {
			const doc = await vscode.workspace.openTextDocument({ content: matching.join('\n') });
			await vscode.window.showTextDocument(doc, { preview: false });
			break;
		}
		case 'moveToNew': {
			const doc = await vscode.workspace.openTextDocument({ content: matching.join('\n') });
			await vscode.window.showTextDocument(doc, { preview: false });
			// Remove matched lines from original
			const originalEditor = vscode.window.visibleTextEditors.find(e => e.document === editor.document);
			if (originalEditor) {
				replaceRange(originalEditor, range, notMatching.join('\n'));
			}
			break;
		}
	}
}

// ─── Sequence & Numbering ───────────────────────────────────────────────────

async function insertNumberSequence() {
	const editor = getEditor();
	if (!editor) { return; }

	const startStr = await vscode.window.showInputBox({ prompt: 'Start number', value: '1' });
	if (startStr === undefined) { return; }
	const start = parseInt(startStr) || 1;

	const range = getSelectedRange(editor);
	const lines = getLinesInRange(editor, range);
	const result = lines.map((line, i) => `${start + i}. ${line}`);
	replaceRange(editor, range, result.join('\n'));
}

async function insertRomanSequence() {
	const editor = getEditor();
	if (!editor) { return; }

	const range = getSelectedRange(editor);
	const lines = getLinesInRange(editor, range);
	const result = lines.map((line, i) => `${toRoman(i + 1)}. ${line}`);
	replaceRange(editor, range, result.join('\n'));
}

function toRoman(num: number): string {
	const vals = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1];
	const syms = ['M', 'CM', 'D', 'CD', 'C', 'XC', 'L', 'XL', 'X', 'IX', 'V', 'IV', 'I'];
	let result = '';
	for (let i = 0; i < vals.length; i++) {
		while (num >= vals[i]) {
			result += syms[i];
			num -= vals[i];
		}
	}
	return result;
}

async function insertLetterSequence() {
	const editor = getEditor();
	if (!editor) { return; }

	const startStr = await vscode.window.showInputBox({
		prompt: 'Start letter (a or A)',
		value: 'a'
	});
	if (startStr === undefined) { return; }

	const isUpper = startStr === startStr.toUpperCase();
	const base = startStr.toLowerCase().charCodeAt(0) - 97;

	const range = getSelectedRange(editor);
	const lines = getLinesInRange(editor, range);
	const result = lines.map((line, i) => {
		let ch = String.fromCharCode(97 + ((base + i) % 26));
		if (isUpper) { ch = ch.toUpperCase(); }
		return `${ch}. ${line}`;
	});
	replaceRange(editor, range, result.join('\n'));
}

async function incrementNumbers() {
	const editor = getEditor();
	if (!editor) { return; }
	const sel = editor.selection;
	if (sel.isEmpty) {
		vscode.window.showInformationMessage('Select text containing numbers to increment');
		return;
	}

	const incrementStr = await vscode.window.showInputBox({ prompt: 'Increment by', value: '1' });
	if (incrementStr === undefined) { return; }
	const increment = parseInt(incrementStr) || 1;

	const text = editor.document.getText(sel);
	const result = text.replace(/-?\d+/g, match => String(parseInt(match) + increment));
	editor.edit(eb => eb.replace(sel, result));
}

// ─── Join / Split ────────────────────────────────────────────────────────────

async function joinWithDelimiter() {
	const editor = getEditor();
	if (!editor) { return; }

	const delimiter = await vscode.window.showInputBox({ prompt: 'Delimiter', value: ', ' });
	if (delimiter === undefined) { return; }

	const range = getSelectedRange(editor);
	const lines = getLinesInRange(editor, range);
	const fullRange = new vscode.Range(range.start.line, 0, range.end.line, editor.document.lineAt(range.end.line).text.length);
	editor.edit(eb => eb.replace(fullRange, lines.join(delimiter)));
}

async function splitByDelimiter() {
	const editor = getEditor();
	if (!editor) { return; }
	const sel = editor.selection;
	if (sel.isEmpty) {
		vscode.window.showInformationMessage('Select text to split');
		return;
	}

	const delimiter = await vscode.window.showInputBox({
		prompt: 'Delimiter or regex pattern to split by',
		value: ', '
	});
	if (delimiter === undefined) { return; }

	const text = editor.document.getText(sel);
	let regex: RegExp;
	try {
		regex = new RegExp(delimiter, 'g');
	} catch {
		regex = new RegExp(delimiter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
	}
	editor.edit(eb => eb.replace(sel, text.split(regex).join('\n')));
}

// ─── Alignment ───────────────────────────────────────────────────────────────

async function alignByDelimiter() {
	const editor = getEditor();
	if (!editor) { return; }

	const delimiter = await vscode.window.showInputBox({
		prompt: 'Delimiter to align by',
		value: '='
	});
	if (delimiter === undefined) { return; }

	const range = getSelectedRange(editor);
	const lines = getLinesInRange(editor, range);

	// Find max position of delimiter
	let maxPos = 0;
	const positions: number[] = [];
	for (const line of lines) {
		const idx = line.indexOf(delimiter);
		positions.push(idx);
		if (idx > maxPos) { maxPos = idx; }
	}

	const result = lines.map((line, i) => {
		if (positions[i] < 0) { return line; }
		const before = line.substring(0, positions[i]).trimEnd();
		const after = line.substring(positions[i] + delimiter.length).trimStart();
		return before + ' '.repeat(maxPos - before.length) + ' ' + delimiter + ' ' + after;
	});
	replaceRange(editor, range, result.join('\n'));
}

async function alignToColumns() {
	const editor = getEditor();
	if (!editor) { return; }

	const range = getSelectedRange(editor);
	const lines = getLinesInRange(editor, range);

	// Split each line by whitespace into columns
	const rows = lines.map(line => line.trim().split(/\s+/));
	const maxCols = Math.max(...rows.map(r => r.length));

	// Find max width per column
	const colWidths: number[] = new Array(maxCols).fill(0);
	for (const row of rows) {
		for (let c = 0; c < row.length; c++) {
			colWidths[c] = Math.max(colWidths[c], row[c].length);
		}
	}

	const result = rows.map(row => {
		return row.map((cell, c) => c < row.length - 1 ? cell.padEnd(colWidths[c]) : cell).join('  ');
	});
	replaceRange(editor, range, result.join('\n'));
}
