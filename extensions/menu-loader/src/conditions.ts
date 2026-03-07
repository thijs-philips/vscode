/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Context snapshot evaluated once per rebuild and cached until the next
 * context-changing event (editor switch, config change, etc.).
 */
export interface ConditionContext {
	/** Active editor language id, e.g. `'markdown'`, `'typescript'`. */
	languageId: string | undefined;

	/** Active file extension including the dot, e.g. `'.md'`. */
	fileExtension: string | undefined;

	/** Active file name, e.g. `'README.md'`. */
	fileName: string | undefined;

	/** URI scheme of the active editor, e.g. `'file'`, `'untitled'`. */
	resourceScheme: string | undefined;

	/** Runtime platform: `'win32'` | `'darwin'` | `'linux'`. */
	platform: NodeJS.Platform;

	/** IDs of all installed extensions. */
	installedExtensions: ReadonlySet<string>;

	/** Workspace folder root paths. */
	workspaceFolders: readonly string[];
}

/**
 * Build a fresh {@link ConditionContext} from the current VS Code state.
 */
export function buildConditionContext(): ConditionContext {
	const editor = vscode.window.activeTextEditor;
	const doc = editor?.document;

	return {
		languageId: doc?.languageId,
		fileExtension: doc ? path.extname(doc.fileName) : undefined,
		fileName: doc ? path.basename(doc.fileName) : undefined,
		resourceScheme: doc?.uri.scheme,
		platform: process.platform,
		installedExtensions: new Set(vscode.extensions.all.map(e => e.id)),
		workspaceFolders: (vscode.workspace.workspaceFolders ?? []).map(f => f.uri.fsPath),
	};
}

/**
 * Evaluate a `when` clause string against the given context.
 *
 * Supported expressions (all case-insensitive):
 * - `languageId == <value>` / `editorLangId == <value>`
 * - `fileExtension == <value>` / `resourceExtname == <value>`
 * - `fileName == <value>` / `resourceFilename == <value>`
 * - `resourceScheme == <value>`
 * - `platform == win32|darwin|linux` / `isWindows` / `isMac` / `isLinux`
 * - `hasExtension(<extensionId>)`
 * - `workspaceContains(<glob>)`
 * - `configValue(<section>.<key>) == <value>`
 * - `true` / `false`
 * - `!<expr>` (negation)
 * - `<expr> && <expr>` (conjunction)
 * - `<expr> || <expr>` (disjunction)
 */
export function evaluateWhen(expr: string | undefined, ctx: ConditionContext): boolean {
	if (expr === undefined || expr.trim() === '') {
		return true;
	}
	return evaluateOr(expr.trim(), ctx);
}

// ─── Recursive‐descent parser ────────────────────────────────────────────────

function evaluateOr(expr: string, ctx: ConditionContext): boolean {
	// Split on `||` that is NOT inside parentheses
	const parts = splitOutsideParens(expr, '||');
	return parts.some(part => evaluateAnd(part.trim(), ctx));
}

function evaluateAnd(expr: string, ctx: ConditionContext): boolean {
	const parts = splitOutsideParens(expr, '&&');
	return parts.every(part => evaluateAtom(part.trim(), ctx));
}

function evaluateAtom(expr: string, ctx: ConditionContext): boolean {
	// Negation
	if (expr.startsWith('!')) {
		return !evaluateAtom(expr.slice(1).trim(), ctx);
	}

	// Parenthesized sub-expression
	if (expr.startsWith('(') && expr.endsWith(')')) {
		return evaluateOr(expr.slice(1, -1).trim(), ctx);
	}

	// Literal booleans
	const lower = expr.toLowerCase();
	if (lower === 'true') {
		return true;
	}
	if (lower === 'false') {
		return false;
	}

	// Platform shorthands
	if (lower === 'iswindows') {
		return ctx.platform === 'win32';
	}
	if (lower === 'ismac' || lower === 'ismacos') {
		return ctx.platform === 'darwin';
	}
	if (lower === 'islinux') {
		return ctx.platform === 'linux';
	}

	// hasExtension(id)
	const hasExtMatch = /^hasExtension\(\s*(.+?)\s*\)$/i.exec(expr);
	if (hasExtMatch) {
		return ctx.installedExtensions.has(hasExtMatch[1]);
	}

	// workspaceContains(glob)
	const wsContainsMatch = /^workspaceContains\(\s*(.+?)\s*\)$/i.exec(expr);
	if (wsContainsMatch) {
		return evaluateWorkspaceContains(wsContainsMatch[1], ctx);
	}

	// configValue(section.key) == value
	const configMatch = /^configValue\(\s*(.+?)\s*\)\s*==\s*(.+)$/i.exec(expr);
	if (configMatch) {
		const configVal = vscode.workspace.getConfiguration().get<string>(configMatch[1].trim());
		return String(configVal) === configMatch[2].trim();
	}

	// Equality: key == value
	const eqMatch = /^(.+?)\s*==\s*(.+)$/.exec(expr);
	if (eqMatch) {
		return resolveContextKey(eqMatch[1].trim(), ctx) === eqMatch[2].trim();
	}

	// Inequality: key != value
	const neqMatch = /^(.+?)\s*!=\s*(.+)$/.exec(expr);
	if (neqMatch) {
		return resolveContextKey(neqMatch[1].trim(), ctx) !== neqMatch[2].trim();
	}

	// Bare context key — truthy check
	const val = resolveContextKey(expr, ctx);
	return val !== undefined && val !== '' && val !== 'false';
}

/**
 * Resolve a context key name to its string value.
 */
function resolveContextKey(key: string, ctx: ConditionContext): string | undefined {
	const lower = key.toLowerCase();
	switch (lower) {
		case 'languageid':
		case 'editorlangid':
			return ctx.languageId;
		case 'fileextension':
		case 'resourceextname':
			return ctx.fileExtension;
		case 'filename':
		case 'resourcefilename':
			return ctx.fileName;
		case 'resourcescheme':
			return ctx.resourceScheme;
		case 'platform':
			return ctx.platform;
		default:
			return undefined;
	}
}

/**
 * Check whether any workspace folder contains a file matching the glob.
 * This is a synchronous, shallow check — it only looks for exact file names
 * or simple globs in the workspace root.
 */
function evaluateWorkspaceContains(glob: string, ctx: ConditionContext): boolean {
	for (const folder of ctx.workspaceFolders) {
		// Simple case: exact filename
		const candidate = path.join(folder, glob);
		if (fs.existsSync(candidate)) {
			return true;
		}
	}
	return false;
}

/**
 * Split a string by a delimiter that is NOT inside parentheses.
 */
function splitOutsideParens(input: string, delimiter: string): string[] {
	const parts: string[] = [];
	let depth = 0;
	let current = '';

	for (let i = 0; i < input.length; i++) {
		if (input[i] === '(') {
			depth++;
		} else if (input[i] === ')') {
			depth--;
		}

		if (depth === 0 && input.startsWith(delimiter, i)) {
			parts.push(current);
			current = '';
			i += delimiter.length - 1;
		} else {
			current += input[i];
		}
	}

	parts.push(current);
	return parts;
}
