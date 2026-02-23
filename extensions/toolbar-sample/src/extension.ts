/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.commands.registerCommand('toolbarSample.hello', () => {
			vscode.window.showInformationMessage('Hello from the toolbar strip!');
		}),
		vscode.commands.registerCommand('toolbarSample.build', () => {
			vscode.window.showInformationMessage('Build triggered from toolbar strip!');
		}),
		vscode.commands.registerCommand('toolbarSample.run', () => {
			vscode.window.showInformationMessage('Run triggered from toolbar strip!');
		})
	);
}

export function deactivate() { }
