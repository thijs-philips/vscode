// merge-recommendations.js
// Extracts extension recommendation fields from an installed VS Code's product.json
// and merges them into this repo's product.json.
//
// Usage: node tools/extract_recommendation/merge-recommendations.js [vscode-install-path]
// Default install path: C:\Program Files\Microsoft VS Code

const fs = require('fs');
const path = require('path');

const VSCODE_INSTALL = process.argv[2] || 'C:\\Program Files\\Microsoft VS Code';
const sourceProductPath = path.join(VSCODE_INSTALL, 'resources', 'app', 'product.json');
const targetProductPath = path.join(__dirname, '..', '..', 'product.json');

const RECOMMENDATION_KEYS = [
	'extensionRecommendations',
	'configBasedExtensionTips',
	'exeBasedExtensionTips',
	'remoteExtensionTips',
	'virtualWorkspaceExtensionTips',
	'extensionKeywords',
	'keymapExtensionTips',
	'webExtensionTips',
	'languageExtensionTips',
];

console.log(`Source: ${sourceProductPath}`);
console.log(`Target: ${targetProductPath}\n`);

if (!fs.existsSync(sourceProductPath)) {
	console.error(`ERROR: Source product.json not found at "${sourceProductPath}".`);
	console.error('Provide the VS Code install path as an argument:');
	console.error('  node tools/extract_recommendation/merge-recommendations.js "C:\\Program Files\\Microsoft VS Code"');
	process.exit(1);
}

const source = JSON.parse(fs.readFileSync(sourceProductPath, 'utf8'));
const target = JSON.parse(fs.readFileSync(targetProductPath, 'utf8'));

let added = 0;
for (const key of RECOMMENDATION_KEYS) {
	if (source[key] !== undefined) {
		target[key] = source[key];
		added++;
		const size = Array.isArray(source[key])
			? `${source[key].length} items`
			: typeof source[key] === 'object'
				? `${Object.keys(source[key]).length} entries`
				: 'value';
		console.log(`+ Copied "${key}" (${size})`);
	} else {
		console.log(`- "${key}" not found in source product.json`);
	}
}

fs.writeFileSync(targetProductPath, JSON.stringify(target, null, '\t') + '\n', 'utf8');
console.log(`\nDone: merged ${added} recommendation field(s) into product.json`);
