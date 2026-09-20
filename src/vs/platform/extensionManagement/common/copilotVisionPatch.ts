/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const copilotVisionPatchSentinel = '/* __vision_retry_patched_v2__ */';

const legacyPatchSentinel = '/* __vision_retry_patched__ */';
const typedRetryMarker = 'Vision attachment was rejected; retrying the request without image attachments.';
const supportsVisionPattern = /this\.supportsVision=!!([\w$]+)\.capabilities\.supports\.vision/g;
const supportsVisionPatchedPattern = /this\.supportsVision\s*=\s*(?:!0|true)/g;
const visionHeaderPattern = /[\w$]+\.messages\?\.\s*some\([\w$]+=>\s*Array\.isArray\([\w$]+\.content\)\?[\w$]+\.content\.some\([\w$]+=>"image_url"\s*in\s*[\w$]+\):!1\)&&[\w$]+\.supportsVision&&\([\w$]+\["Copilot-Vision-Request"\]="true"\)/g;
const fetchManyPattern = /async fetchMany\(([\w$]+),([\w$]+)\)\{let\{debugName:([\w$]+),endpoint:([\w$]+),finishedCb:([\w$]+),location:([\w$]+),messages:([\w$]+),requestOptions:([\w$]+),/g;

export interface ICopilotVisionBundlePatchResult {
	readonly status: 'patched' | 'alreadyPatched';
	readonly content: string;
}

function countMatches(content: string, pattern: RegExp): number {
	pattern.lastIndex = 0;
	return content.match(pattern)?.length ?? 0;
}

function hasCompleteRuntimePatch(content: string): boolean {
	return content.includes('async _fetchManyOrigVR(')
		&& content.includes('_vr.type==="badRequest"')
		&& content.includes('vision_attachment_not_accessible')
		&& content.includes('"imageUrl"in _p');
}

export function patchCopilotVisionBundleContent(content: string): ICopilotVisionBundlePatchResult {
	if (content.includes(copilotVisionPatchSentinel)) {
		if (!hasCompleteRuntimePatch(content) || countMatches(content, supportsVisionPatchedPattern) === 0 || countMatches(content, visionHeaderPattern) !== 0) {
			throw new Error('The Copilot vision patch sentinel exists, but the patched bundle invariants are not satisfied.');
		}
		return { status: 'alreadyPatched', content };
	}
	if (content.includes(typedRetryMarker)) {
		if (countMatches(content, supportsVisionPatchedPattern) === 0 || countMatches(content, visionHeaderPattern) !== 0) {
			throw new Error('The typed Copilot vision behavior is incomplete.');
		}
		return { status: 'alreadyPatched', content };
	}
	if (content.includes(legacyPatchSentinel)) {
		if (countMatches(content, visionHeaderPattern) !== 0 || countMatches(content, supportsVisionPatchedPattern) === 0) {
			throw new Error('The Copilot bundle contains an incomplete legacy vision patch. Reinstall the extension before retrying.');
		}
		return { status: 'alreadyPatched', content };
	}

	const supportsVisionMatches = countMatches(content, supportsVisionPattern);
	const visionHeaderMatches = countMatches(content, visionHeaderPattern);
	const fetchManyMatches = countMatches(content, fetchManyPattern);
	if (supportsVisionMatches !== 1 || visionHeaderMatches < 1 || fetchManyMatches !== 1) {
		throw new Error(`Unsupported Copilot bundle shape (supportsVision=${supportsVisionMatches}, visionHeaders=${visionHeaderMatches}, fetchMany=${fetchManyMatches}).`);
	}

	let patched = content.replace(supportsVisionPattern, 'this.supportsVision=!0');
	patched = patched.replace(visionHeaderPattern, '!1');
	fetchManyPattern.lastIndex = 0;
	patched = patched.replace(fetchManyPattern, (_match, opts, token, debugName, endpoint, finishedCb, location, messages, requestOptions) =>
		`${copilotVisionPatchSentinel}async fetchMany(${opts},${token}){` +
		`let _vr=await this._fetchManyOrigVR(${opts},${token});` +
		`if((_vr.type==="failed"||_vr.type==="badRequest")&&/vision_attachment_not_accessible|attachment[^]*not accessible/i.test((_vr.reason||"")+" "+(_vr.reasonDetail||""))){` +
		`let _sm=${opts}.messages;` +
		`if(_sm&&_sm.some(_m=>Array.isArray(_m.content)&&_m.content.some(_p=>"imageUrl"in _p))){` +
		`let _sl=_sm.map(_m=>Array.isArray(_m.content)?{..._m,content:_m.content.filter(_p=>!("imageUrl"in _p))}:_m);` +
		`return this._fetchManyOrigVR({...${opts},messages:_sl},${token})}}` +
		`return _vr}` +
		`async _fetchManyOrigVR(${opts},${token}){let{debugName:${debugName},endpoint:${endpoint},finishedCb:${finishedCb},location:${location},messages:${messages},requestOptions:${requestOptions},`
	);

	if (!patched.includes(copilotVisionPatchSentinel) || countMatches(patched, supportsVisionPattern) !== 0 || countMatches(patched, visionHeaderPattern) !== 0) {
		throw new Error('Copilot vision patch verification failed.');
	}
	return { status: 'patched', content: patched };
}
