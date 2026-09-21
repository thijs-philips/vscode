/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from '../../../base/common/path.js';

export function getWin32UpdateCachePath(temporaryDirectory: string, applicationName: string, quality: string, target: string | undefined, architecture: string): string {
	return path.join(temporaryDirectory, `vscode-${applicationName}-${quality}-${target}-${architecture}`);
}
