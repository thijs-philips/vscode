/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';

/**
 * Expand `${variable}` placeholders in a string at action execution time.
 *
 * Supported variables:
 * - `${workspaceFolder}` — first workspace folder path
 * - `${workspaceFolderBasename}` — basename of the first workspace folder
 * - `${file}` — full path of the active file
 * - `${fileBasename}` — basename of the active file
 * - `${fileExtname}` — extension of the active file (with dot)
 * - `${fileDirname}` — directory of the active file
 * - `${selectedText}` — currently selected text
 * - `${lineNumber}` — 1-based line number of the cursor
 * - `${columnNumber}` — 1-based column number of the cursor
 * - `${clipboard}` — current clipboard contents (async, resolved before call)
 */
export async function expandVariables(template: string): Promise<string> {
	let result = template;
	const editor = vscode.window.activeTextEditor;
	const doc = editor?.document;
	const wsFolder = vscode.workspace.workspaceFolders?.[0];

	const replacements: Record<string, () => string | Promise<string>> = {
		'${workspaceFolder}': () => wsFolder?.uri.fsPath ?? '',
		'${workspaceFolderBasename}': () => wsFolder ? path.basename(wsFolder.uri.fsPath) : '',
		'${file}': () => doc?.fileName ?? '',
		'${fileBasename}': () => doc ? path.basename(doc.fileName) : '',
		'${fileExtname}': () => doc ? path.extname(doc.fileName) : '',
		'${fileDirname}': () => doc ? path.dirname(doc.fileName) : '',
		'${selectedText}': () => editor ? doc!.getText(editor.selection) : '',
		'${lineNumber}': () => editor ? String(editor.selection.active.line + 1) : '1',
		'${columnNumber}': () => editor ? String(editor.selection.active.character + 1) : '1',
		'${clipboard}': () => Promise.resolve(vscode.env.clipboard.readText()),
	};

	for (const [variable, resolver] of Object.entries(replacements)) {
		if (result.includes(variable)) {
			const value = await resolver();
			result = result.split(variable).join(value);
		}
	}

	return result;
}
