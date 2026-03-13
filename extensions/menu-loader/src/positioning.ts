/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * Resolve a relative position reference like `^Run` (before item titled "Run")
 * or `$Bold` (after item titled "Bold") into a concrete `{ group, order }`.
 *
 * Prefix conventions:
 * - `^Title` — place **before** the item with this title
 * - `$Title` — place **after** the item with this title
 * - `^#commandId` — place before the item with this command id
 * - `$#commandId` — place after the item with this command id
 *
 * Falls back to the given `defaultGroup` / `defaultOrder` when the reference
 * cannot be resolved.
 */
export async function resolvePosition(
	menuId: string,
	reference: string | undefined,
	defaultGroup: string | undefined,
	defaultOrder: number | undefined,
): Promise<{ group: string | undefined; order: number | undefined }> {
	if (!reference) {
		return { group: defaultGroup, order: defaultOrder };
	}

	const before = reference.startsWith('^');
	const after = reference.startsWith('$');
	if (!before && !after) {
		// Not a positional reference — treat as a literal group name
		return { group: reference, order: defaultOrder };
	}

	const needle = reference.slice(1);
	const byCommand = needle.startsWith('#');
	const searchValue = byCommand ? needle.slice(1) : needle;

	try {
		const items = await vscode.menus.getMenuItems(menuId);

		// First pass: exact match
		for (const item of items) {
			const matches = byCommand
				? item.commandId === searchValue
				: item.title === searchValue;

			if (matches) {
				const group = item.group;
				const baseOrder = item.order ?? 0;
				const order = before ? baseOrder - 0.5 : baseOrder + 0.5;
				return { group, order };
			}
		}

		// Second pass (title only): case-insensitive match
		if (!byCommand) {
			const lowerNeedle = searchValue.toLowerCase();
			for (const item of items) {
				if (item.title.toLowerCase() === lowerNeedle) {
					const group = item.group;
					const baseOrder = item.order ?? 0;
					const order = before ? baseOrder - 0.5 : baseOrder + 0.5;
					return { group, order };
				}
			}
		}
	} catch {
		// getMenuItems may fail for unknown menus — fall through
	}

	return { group: defaultGroup, order: defaultOrder };
}
