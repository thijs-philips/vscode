/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IToolbarStripService = createDecorator<IToolbarStripService>('toolbarStripService');

export interface IToolbarStripService {
	readonly _serviceBrand: undefined;

	/**
	 * Fires when the visibility of the toolbar strip changes.
	 */
	readonly onDidChangeVisibility: Event<boolean>;

	/**
	 * Whether the toolbar strip is currently visible (has any contributed actions).
	 */
	readonly isVisible: boolean;

	/**
	 * Focus the toolbar strip.
	 */
	focus(): void;
}
