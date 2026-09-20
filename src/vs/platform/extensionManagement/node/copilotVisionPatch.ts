/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from '../../../base/common/path.js';
import { URI } from '../../../base/common/uri.js';
import { patchCopilotVisionBundleContent } from '../common/copilotVisionPatch.js';

export const copilotChatExtensionId = 'github.copilot-chat';

export interface ICopilotVisionPatchResult {
	readonly status: 'patched' | 'alreadyPatched';
	readonly bundlePath: string;
}

export async function patchCopilotVisionBundle(bundlePath: string): Promise<ICopilotVisionPatchResult> {
	let original: string;
	try {
		original = await fs.promises.readFile(bundlePath, 'utf8');
	} catch (error) {
		throw new Error(`Cannot read Copilot bundle at ${bundlePath}: ${error}`);
	}
	const result = patchCopilotVisionBundleContent(original);
	if (result.status === 'alreadyPatched') {
		return { status: result.status, bundlePath };
	}

	const temporaryPath = `${bundlePath}.${process.pid}.${Date.now()}.tmp`;
	try {
		await fs.promises.writeFile(temporaryPath, result.content, 'utf8');
		await fs.promises.rename(temporaryPath, bundlePath);
	} finally {
		await fs.promises.rm(temporaryPath, { force: true });
	}
	return { status: result.status, bundlePath };
}

export async function patchCopilotExtensionLocation(location: URI): Promise<ICopilotVisionPatchResult> {
	return patchCopilotVisionBundle(path.join(location.fsPath, 'dist', 'extension.js'));
}

export async function patchInstalledCopilotExtensions(extensionsPath: string): Promise<ICopilotVisionPatchResult[]> {
	let entries: fs.Dirent[];
	try {
		entries = await fs.promises.readdir(extensionsPath, { withFileTypes: true });
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			return [];
		}
		throw error;
	}

	const results: ICopilotVisionPatchResult[] = [];
	for (const entry of entries) {
		if (entry.isDirectory() && entry.name.toLowerCase().startsWith(`${copilotChatExtensionId}-`)) {
			results.push(await patchCopilotVisionBundle(path.join(extensionsPath, entry.name, 'dist', 'extension.js')));
		}
	}
	return results;
}
