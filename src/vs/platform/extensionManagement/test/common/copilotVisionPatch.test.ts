/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { copilotVisionPatchSentinel, patchCopilotVisionBundleContent } from '../../common/copilotVisionPatch.js';

suite('Copilot vision patch', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const bundle = 'this.supportsVision=!!e.capabilities.supports.vision;' +
		'a.messages?.some(b=>Array.isArray(b.content)?b.content.some(c=>"image_url"in c):!1)&&d.supportsVision&&(h["Copilot-Vision-Request"]="true");' +
		'async fetchMany(n,r){let{debugName:o,endpoint:a,finishedCb:s,location:c,messages:l,requestOptions:u,rest:v}=n;return v}';

	test('patches supported bundle and is idempotent', () => {
		const patched = patchCopilotVisionBundleContent(bundle);
		const second = patchCopilotVisionBundleContent(patched.content);
		assert.deepStrictEqual({
			status: patched.status,
			hasSentinel: patched.content.includes(copilotVisionPatchSentinel),
			hasVisionCapabilityGate: patched.content.includes('capabilities.supports.vision'),
			hasVisionHeader: patched.content.includes('Copilot-Vision-Request'),
			retryHandlesBadRequest: patched.content.includes('_vr.type==="badRequest"'),
			secondStatus: second.status,
			secondUnchanged: second.content === patched.content,
		}, {
			status: 'patched',
			hasSentinel: true,
			hasVisionCapabilityGate: false,
			hasVisionHeader: false,
			retryHandlesBadRequest: true,
			secondStatus: 'alreadyPatched',
			secondUnchanged: true,
		});
	});

	test('rejects an unsupported bundle shape', () => {
		assert.throws(() => patchCopilotVisionBundleContent('const unsupported = true;'), /Unsupported Copilot bundle shape/);
	});

	test('accepts only complete typed built-in behavior', () => {
		const marker = 'Vision attachment was rejected; retrying the request without image attachments.';
		let incompleteError: string | undefined;
		try {
			patchCopilotVisionBundleContent(marker);
		} catch (error) {
			incompleteError = error instanceof Error ? error.message : String(error);
		}
		assert.deepStrictEqual({
			complete: patchCopilotVisionBundleContent(`this.supportsVision=!0;${marker}`).status,
			incompleteError,
		}, {
			complete: 'alreadyPatched',
			incompleteError: 'The typed Copilot vision behavior is incomplete.',
		});
	});
});
