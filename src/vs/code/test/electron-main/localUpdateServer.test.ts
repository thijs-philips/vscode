/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { isExpectedUpdateAssetName, isNewerReleaseVersion, parseUpdateChecksum, resolveReleaseCommit, selectLatestSemanticRelease } from '../../electron-main/localUpdateServer.js';

suite('Local update server', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('only accepts newer semantic versions from the configured release channel', () => {
		assert.deepStrictEqual({
			older: isNewerReleaseVersion('1.139.0', '1.128.1'),
			equal: isNewerReleaseVersion('1.139.0', '1.139.0'),
			newerPatch: isNewerReleaseVersion('1.139.0', '1.139.1'),
			newerMinor: isNewerReleaseVersion('1.139.0', '1.140.0'),
			invalid: isNewerReleaseVersion('1.139.0', 'latest'),
		}, {
			older: false,
			equal: false,
			newerPatch: true,
			newerMinor: true,
			invalid: false,
		});
	});

	test('selects the highest semantic release regardless of publication order', () => {
		const releases = [
			{ tag_name: 'v1.139.0-aaaaaaaaaaaa' },
			{ tag_name: 'not-a-release' },
			{ tag_name: 'v1.128.1-bbbbbbbbbbbb' },
			{ tag_name: 'v1.140.2-cccccccccccc' },
			{ tag_name: 'v1.140.1-dddddddddddd' },
		];
		assert.strictEqual(selectLatestSemanticRelease(releases)?.tag_name, 'v1.140.2-cccccccccccc');
	});

	test('validates OSS and Personal asset prefixes', () => {
		assert.deepStrictEqual({
			oss: isExpectedUpdateAssetName('CodeOSSSetup-win32-x64-user.exe', 'CodeOSSSetup'),
			ossChecksum: isExpectedUpdateAssetName('CodeOSSSetup-win32-x64-user.exe.sha256', 'CodeOSSSetup'),
			personal: isExpectedUpdateAssetName('CodePersonalSetup-win32-x64-user.exe', 'CodePersonalSetup'),
			wrongPrefix: isExpectedUpdateAssetName('CodeOSSSetup-win32-x64-user.exe', 'CodePersonalSetup'),
			traversal: isExpectedUpdateAssetName('../CodeOSSSetup-win32-x64-user.exe', 'CodeOSSSetup'),
		}, {
			oss: true,
			ossChecksum: true,
			personal: true,
			wrongPrefix: false,
			traversal: false,
		});
	});

	test('requires valid checksums and a matching full release commit', () => {
		const fullCommit = 'abcdef1234567890abcdef1234567890abcdef12';
		assert.deepStrictEqual({
			plainChecksum: parseUpdateChecksum('A'.repeat(64)),
			checksumWithFilename: parseUpdateChecksum(`${'b'.repeat(64)}  CodeOSSSetup-win32-x64-user.exe`),
			invalidChecksum: parseUpdateChecksum('not-a-checksum'),
			matchingCommit: resolveReleaseCommit(fullCommit.slice(0, 12), fullCommit),
			mismatchedCommit: resolveReleaseCommit('1234567890ab', fullCommit),
			shortTarget: resolveReleaseCommit(fullCommit.slice(0, 12), fullCommit.slice(0, 12)),
		}, {
			plainChecksum: 'a'.repeat(64),
			checksumWithFilename: 'b'.repeat(64),
			invalidChecksum: undefined,
			matchingCommit: fullCommit,
			mismatchedCommit: undefined,
			shortTarget: undefined,
		});
	});
});
