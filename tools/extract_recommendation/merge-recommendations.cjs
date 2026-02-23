// merge-recommendations.cjs
// Extracts product configuration fields from an installed VS Code's product.json
// and merges them into this repo's product.json. Covers extension recommendations,
// MCP gallery, extension trust/kind, UI/help links, Settings Sync, and more.
//
// Usage: node tools/extract_recommendation/merge-recommendations.cjs [vscode-install-path]
// Default install path: C:\Program Files\Microsoft VS Code

const fs = require('fs');
const path = require('path');

const VSCODE_INSTALL = process.argv[2] || 'C:\\Program Files\\Microsoft VS Code';
const sourceProductPath = path.join(VSCODE_INSTALL, 'resources', 'app', 'product.json');
const targetProductPath = path.join(__dirname, '..', '..', 'product.json');

const KEYS_TO_COPY = [
	// --- Extension recommendations ---
	'extensionRecommendations',
	'configBasedExtensionTips',
	'exeBasedExtensionTips',
	'remoteExtensionTips',
	'virtualWorkspaceExtensionTips',
	'extensionKeywords',
	'keymapExtensionTips',
	'webExtensionTips',
	'languageExtensionTips',

	// --- MCP gallery / marketplace ---
	'mcpGallery',

	// --- Strongly recommended (functionality) ---
	'quality',
	'extensionAllowedBadgeProviders',
	'extensionAllowedBadgeProvidersRegex',
	'extensionPublisherOrgs',
	'trustedExtensionPublishers',
	'extensionProperties',
	'extensionKind',
	'extensionPointExtensionKind',
	'extensionVirtualWorkspacesSupport',
	'extensionSyncedKeys',
	'extensionsForceVersionByQuality',
	'extensionsEnabledWithApiProposalVersion',
	'linkProtectionTrustedDomains',
	'trustedExtensionProtocolHandlers',
	'commandPaletteSuggestedCommandIds',
	'commonlyUsedSettings',
	'configurationSync.store',
	'editSessions.store',
	'chatParticipantRegistry',
	'chatSessionRecommendations',
	'profileTemplatesUrl',
	'remoteDefaultExtensionsIfInstalledLocally',
	'extensionConfigurationPolicy',

	// --- Recommended (UI/help links) ---
	'documentationUrl',
	'serverDocumentationUrl',
	'releaseNotesUrl',
	'keyboardShortcutsUrlMac',
	'keyboardShortcutsUrlLinux',
	'keyboardShortcutsUrlWin',
	'introductoryVideosUrl',
	'tipsAndTricksUrl',
	'newsletterSignupUrl',
	'youTubeUrl',
	'requestFeatureUrl',
	'reportMarketplaceIssueUrl',
	'privacyStatementUrl',
	'downloadUrl',
	'webUrl',
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
for (const key of KEYS_TO_COPY) {
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
