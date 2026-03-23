// Script to patch Copilot Chat extension bundles so image inputs are not
// blocked by preview-feature token gating.
//
// Usage: node scripts/patch-copilot-vision.js
// Re-run after Copilot extension updates.

const fs = require('fs');
const path = require('path');
const os = require('os');

const extensionRoots = [
	path.join(os.homedir(), '.vscode-oss', 'extensions'),
	path.join(os.homedir(), '.vscode-oss-dev', 'extensions'),
	path.join(os.homedir(), '.vscode', 'extensions'),
	path.join(os.homedir(), '.vscode-insiders', 'extensions')
];

// Patch 5: Wrap fetchMany to retry without images on server-side vision rejection
const visionRetryRegex = /async fetchMany\((\w+),(\w+)\)\{let\{debugName:(\w+),endpoint:(\w+),finishedCb:(\w+),location:(\w+),messages:(\w+),requestOptions:(\w+),/g;
const VISION_RETRY_SENTINEL = '/* __vision_retry_patched__ */';

const helperOld = 'isEditorPreviewFeaturesEnabled(){return this.getTokenValue("editor_preview_features")!=="0"}';
const helperNew = 'isEditorPreviewFeaturesEnabled(){return!0}';
const gateOld = '!this.promptEndpoint.supportsVision||!this.authService.copilotToken?.isEditorPreviewFeaturesEnabled()';
const gateNew = '!1';
const visionCapOld = 'this.supportsVision=!!e.capabilities.supports.vision';
const visionCapNew = 'this.supportsVision=!0';

const helperRegex = /isEditorPreviewFeaturesEnabled\(\)\{return[^}]*?\}/g;
const gateRegex = /!this\.promptEndpoint\.supportsVision\|\|!this\.authService\.copilotToken\?\.isEditorPreviewFeaturesEnabled\(\)/g;
const visionCapRegex = /this\.supportsVision=!!e\.capabilities\.supports\.vision/g;
const visionHeaderRegex = /\w+\.messages\?\.\s*some\(\w+=>\s*Array\.isArray\(\w+\.content\)\?\w+\.content\.some\(\w+=>"image_url"\s*in\s*\w+\):!1\)&&\w+\.supportsVision&&\(\w+\["Copilot-Vision-Request"\]="true"\)/g;

function collectExtensionFiles() {
	const files = [];
	for (const root of extensionRoots) {
		if (!fs.existsSync(root)) {
			continue;
		}
		for (const entry of fs.readdirSync(root)) {
			if (!entry.startsWith('github.copilot-chat-')) {
				continue;
			}
			const file = path.join(root, entry, 'dist', 'extension.js');
			if (fs.existsSync(file)) {
				files.push(file);
			}
		}
	}
	return files;
}

function countOccurrences(text, needle) {
	let count = 0;
	let idx = text.indexOf(needle);
	while (idx !== -1) {
		count++;
		idx = text.indexOf(needle, idx + needle.length);
	}
	return count;
}

function countMatches(text, regex) {
	const matches = text.match(regex);
	return matches ? matches.length : 0;
}

function applyVisionRetryPatch(content) {
	if (content.includes(VISION_RETRY_SENTINEL)) {
		return content;
	}
	visionRetryRegex.lastIndex = 0;
	return content.replace(visionRetryRegex, (match, p1, p2, p3, p4, p5, p6, p7, p8) => {
		return `${VISION_RETRY_SENTINEL}async fetchMany(${p1},${p2}){` +
			`let _vr=await this._fetchManyOrigVR(${p1},${p2});` +
			`if(_vr.type==="failed"&&_vr.reason&&/vision/i.test(_vr.reason)){` +
			`let _sm=${p1}.messages;` +
			`if(_sm&&_sm.some(_m=>Array.isArray(_m.content)&&_m.content.some(_p=>"imageUrl"in _p))){` +
			`let _sl=_sm.map(_m=>Array.isArray(_m.content)?{..._m,content:_m.content.filter(_p=>!("imageUrl"in _p))}:_m);` +
			`return this._fetchManyOrigVR({...${p1},messages:_sl},${p2})}}` +
			`return _vr}` +
			`async _fetchManyOrigVR(${p1},${p2}){let{debugName:${p3},endpoint:${p4},finishedCb:${p5},location:${p6},messages:${p7},requestOptions:${p8},`;
	});
}

function applyRegexReplace(content) {
	let next = content;
	next = next.replace(helperRegex, helperNew);
	next = next.replace(gateRegex, gateNew);
	next = next.replace(visionCapRegex, visionCapNew);
	next = next.replace(visionHeaderRegex, '!1');
	return next;
}

function patchFile(file) {
	let content = fs.readFileSync(file, 'utf8');
	const before = {
		helperOld: countOccurrences(content, helperOld),
		helperNew: countOccurrences(content, helperNew),
		gateOld: countOccurrences(content, gateOld),
		gateNew: countOccurrences(content, gateNew),
		visionCapOld: countOccurrences(content, visionCapOld),
		visionCapNew: countOccurrences(content, visionCapNew),
		helperRegexMatches: countMatches(content, helperRegex),
		gateRegexMatches: countMatches(content, gateRegex),
		visionCapRegexMatches: countMatches(content, visionCapRegex),
		visionHeaderRegexMatches: countMatches(content, visionHeaderRegex),
		visionRetryPatched: content.includes(VISION_RETRY_SENTINEL)
	};

	const backup = `${file}.bak`;
	if (!fs.existsSync(backup)) {
		fs.copyFileSync(file, backup);
	}

	if (before.helperOld > 0) {
		content = content.split(helperOld).join(helperNew);
	}
	if (before.gateOld > 0) {
		content = content.split(gateOld).join(gateNew);
	}
	if (before.visionCapOld > 0) {
		content = content.split(visionCapOld).join(visionCapNew);
	}

	if (before.helperOld === 0 && before.gateOld === 0 && before.visionCapOld === 0) {
		content = applyRegexReplace(content);
	}

	// Always strip the Copilot-Vision-Request header (regex-only, no exact match)
	content = content.replace(visionHeaderRegex, '!1');

	// Apply the fetchMany vision retry wrapper
	content = applyVisionRetryPatch(content);

	fs.writeFileSync(file, content, 'utf8');

	const verify = fs.readFileSync(file, 'utf8');
	const after = {
		helperOld: countOccurrences(verify, helperOld),
		helperNew: countOccurrences(verify, helperNew),
		gateOld: countOccurrences(verify, gateOld),
		gateNew: countOccurrences(verify, gateNew),
		visionCapOld: countOccurrences(verify, visionCapOld),
		visionCapNew: countOccurrences(verify, visionCapNew),
		helperRegexMatches: countMatches(verify, helperRegex),
		gateRegexMatches: countMatches(verify, gateRegex),
		visionCapRegexMatches: countMatches(verify, visionCapRegex),
		visionHeaderRegexMatches: countMatches(verify, visionHeaderRegex),
		visionRetryPatched: verify.includes(VISION_RETRY_SENTINEL)
	};

	return { file, before, after, backupCreated: fs.existsSync(backup) };
}

const files = collectExtensionFiles();
if (files.length === 0) {
	console.warn('WARN: No github.copilot-chat dist/extension.js files found in standard extension roots.');
	process.exit(0);
}

console.log(`Found ${files.length} Copilot Chat bundle(s).`);
let patchedAny = false;
for (const file of files) {
	const result = patchFile(file);
	const changed = result.before.helperOld !== result.after.helperOld || result.before.gateOld !== result.after.gateOld || result.before.visionCapOld !== result.after.visionCapOld || result.before.visionHeaderRegexMatches !== result.after.visionHeaderRegexMatches || result.before.visionRetryPatched !== result.after.visionRetryPatched;
	if (changed) {
		patchedAny = true;
	}
	console.log('---');
	console.log(`FILE: ${result.file}`);
	console.log(`before: helperOld=${result.before.helperOld}, helperNew=${result.before.helperNew}, gateOld=${result.before.gateOld}, gateNew=${result.before.gateNew}, visionCapOld=${result.before.visionCapOld}, visionCapNew=${result.before.visionCapNew}, helperRegex=${result.before.helperRegexMatches}, gateRegex=${result.before.gateRegexMatches}, visionCapRegex=${result.before.visionCapRegexMatches}, visionHeader=${result.before.visionHeaderRegexMatches}, visionRetry=${result.before.visionRetryPatched}`);
	console.log(`after : helperOld=${result.after.helperOld}, helperNew=${result.after.helperNew}, gateOld=${result.after.gateOld}, gateNew=${result.after.gateNew}, visionCapOld=${result.after.visionCapOld}, visionCapNew=${result.after.visionCapNew}, helperRegex=${result.after.helperRegexMatches}, gateRegex=${result.after.gateRegexMatches}, visionCapRegex=${result.after.visionCapRegexMatches}, visionHeader=${result.after.visionHeaderRegexMatches}, visionRetry=${result.after.visionRetryPatched}`);
}

console.log('---');
if (patchedAny) {
	console.log('Patched one or more Copilot Chat bundles. Restart VS Code to apply changes.');
} else {
	console.log('No new changes were needed (already patched or pattern not present).');
}
