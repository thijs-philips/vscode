/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getWin32UpdateCachePath } from '../../electron-main/win32UpdateCache.js';

suite('Win32UpdateService', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('isolates update caches by product application name', () => {
		assert.deepStrictEqual([
			getWin32UpdateCachePath('C:\\Temp', 'code-oss', 'stable', 'user', 'x64'),
			getWin32UpdateCachePath('C:\\Temp', 'code-personal', 'stable', 'user', 'x64')
		], [
			'C:\\Temp\\vscode-code-oss-stable-user-x64',
			'C:\\Temp\\vscode-code-personal-stable-user-x64'
		]);
	});
});
