// Script to patch Copilot Chat extension bundles so image inputs are not
// blocked by preview-feature token gating.
//
// Usage: node scripts/patch-copilot-vision.js
// Re-run after Copilot extension updates.

const fs = require('fs');
const path = require('path');
const os = require('os');

const extensionRoots = [
	path.join(os.homedir(), '.vscode-oss-dev', 'extensions'),
	path.join(os.homedir(), '.vscode', 'extensions'),
	path.join(os.homedir(), '.vscode-insiders', 'extensions')
];

const helperOld = 'isEditorPreviewFeaturesEnabled(){return this.getTokenValue("editor_preview_features")!=="0"}';
const helperNew = 'isEditorPreviewFeaturesEnabled(){return!0}';
const gateOld = '!this.promptEndpoint.supportsVision||!this.authService.copilotToken?.isEditorPreviewFeaturesEnabled()';
const gateNew = '!1';

const helperRegex = /isEditorPreviewFeaturesEnabled\(\)\{return[^}]*?\}/g;
const gateRegex = /!this\.promptEndpoint\.supportsVision\|\|!this\.authService\.copilotToken\?\.isEditorPreviewFeaturesEnabled\(\)/g;

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

function applyRegexReplace(content) {
	let next = content;
	next = next.replace(helperRegex, helperNew);
	next = next.replace(gateRegex, gateNew);
	return next;
}

function patchFile(file) {
	let content = fs.readFileSync(file, 'utf8');
	const before = {
		helperOld: countOccurrences(content, helperOld),
		helperNew: countOccurrences(content, helperNew),
		gateOld: countOccurrences(content, gateOld),
		gateNew: countOccurrences(content, gateNew),
		helperRegexMatches: countMatches(content, helperRegex),
		gateRegexMatches: countMatches(content, gateRegex)
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

	if (before.helperOld === 0 && before.gateOld === 0) {
		content = applyRegexReplace(content);
	}

	fs.writeFileSync(file, content, 'utf8');

	const verify = fs.readFileSync(file, 'utf8');
	const after = {
		helperOld: countOccurrences(verify, helperOld),
		helperNew: countOccurrences(verify, helperNew),
		gateOld: countOccurrences(verify, gateOld),
		gateNew: countOccurrences(verify, gateNew),
		helperRegexMatches: countMatches(verify, helperRegex),
		gateRegexMatches: countMatches(verify, gateRegex)
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
	const changed = result.before.helperOld !== result.after.helperOld || result.before.gateOld !== result.after.gateOld;
	if (changed) {
		patchedAny = true;
	}
	console.log('---');
	console.log(`FILE: ${result.file}`);
	console.log(`before: helperOld=${result.before.helperOld}, helperNew=${result.before.helperNew}, gateOld=${result.before.gateOld}, gateNew=${result.before.gateNew}, helperRegex=${result.before.helperRegexMatches}, gateRegex=${result.before.gateRegexMatches}`);
	console.log(`after : helperOld=${result.after.helperOld}, helperNew=${result.after.helperNew}, gateOld=${result.after.gateOld}, gateNew=${result.after.gateNew}, helperRegex=${result.after.helperRegexMatches}, gateRegex=${result.after.gateRegexMatches}`);
}

console.log('---');
if (patchedAny) {
	console.log('Patched one or more Copilot Chat bundles. Restart VS Code to apply changes.');
} else {
	console.log('No new changes were needed (already patched or pattern not present).');
}
