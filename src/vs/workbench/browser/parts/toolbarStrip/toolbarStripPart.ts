/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/toolbarStripPart.css';
import { localize, localize2 } from '../../../../nls.js';
import { Part } from '../../part.js';
import { IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IMenuService, MenuId } from '../../../../platform/actions/common/actions.js';
import { IContextKeyService, IScopedContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { $, append, clearNode } from '../../../../base/browser/dom.js';
import { WorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IToolbarStripService } from '../../../services/toolbarStrip/browser/toolbarStripService.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { Separator } from '../../../../base/common/actions.js';
import { registerColor, contrastBorder } from '../../../../platform/theme/common/colorRegistry.js';
import { TITLE_BAR_BORDER } from '../../../common/theme.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';

/**
 * Border color for the toolbar strip. Registered here rather than in theme.ts
 * to keep the toolbar-strip footprint self-contained.
 */
const TOOLBAR_STRIP_BORDER = registerColor('toolbarStrip.border', {
	dark: TITLE_BAR_BORDER,
	light: TITLE_BAR_BORDER,
	hcDark: contrastBorder,
	hcLight: contrastBorder
}, localize('toolbarStripBorder', "Toolbar strip border color when the strip is visible."));

// Toolbar Strip Part

const ROW_HEIGHT = 28;

export class ToolbarStripPart extends Part implements IToolbarStripService {

	declare readonly _serviceBrand: undefined;

	//#region IView

	readonly minimumWidth: number = 0;
	readonly maximumWidth: number = Number.POSITIVE_INFINITY;

	get minimumHeight(): number {
		return this.visible ? ROW_HEIGHT : 0;
	}

	get maximumHeight(): number {
		return this.visible ? ROW_HEIGHT : 0;
	}

	private _onDidChangeSize = this._register(new Emitter<{ width: number; height: number } | undefined>());
	override get onDidChange() { return this._onDidChangeSize.event; }

	//#endregion

	private _onDidChangeVisibility = this._register(new Emitter<boolean>());
	readonly onDidChangeVisibility: Event<boolean> = this._onDidChangeVisibility.event;

	private visible = false;

	private readonly toolbarDisposables = this._register(new DisposableStore());

	/**
	 * A scoped context key service whose parent is updated to follow
	 * the active editor pane so that `when`-clauses referencing editor-scoped
	 * context keys (e.g. `editorLangId`) evaluate correctly.
	 */
	private scopedContextKeyService: IScopedContextKeyService | undefined;

	get isVisible(): boolean {
		return this.visible;
	}

	constructor(
		@IThemeService themeService: IThemeService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IMenuService private readonly menuService: IMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IEditorService private readonly editorService: IEditorService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
	) {
		super(Parts.TOOLBARSTRIP_PART, { hasTitle: false }, themeService, storageService, layoutService);
	}

	protected override createContentArea(parent: HTMLElement): HTMLElement {
		this.element = parent;

		// Create a scoped context key service rooted at this element.
		// Its parent is dynamically updated to the active editor pane's
		// scoped CKS so that editor-level context keys like `editorLangId`
		// are available when evaluating `when`-clauses on menu items.
		this.scopedContextKeyService = this._register(this.contextKeyService.createScoped(this.element));

		// Track active editor and re-parent the scoped CKS
		this._register(this.editorService.onDidActiveEditorChange(() => this.updateScopedContextKeyService()));
		this.updateScopedContextKeyService();

		// Create the menu and listen for changes
		this.updateToolbars();

		return this.element;
	}

	/**
	 * Re-parent our scoped context key service to the active editor pane's
	 * scope (or the active editor group's scope as fallback, or the global
	 * scope when no editor is open). This ensures that context keys set by
	 * the editor (like `editorLangId`) are visible to our toolbar menu.
	 */
	private updateScopedContextKeyService(): void {
		if (!this.scopedContextKeyService) {
			return;
		}

		const activePane = this.editorService.activeEditorPane;
		const parentCKS = activePane?.scopedContextKeyService
			?? this.editorGroupsService.activeGroup?.scopedContextKeyService
			?? this.contextKeyService;

		this.scopedContextKeyService.updateParent(parentCKS);
	}

	private updateToolbars(): void {
		if (!this.element) {
			return;
		}

		this.toolbarDisposables.clear();
		clearNode(this.element);

		const menu = this.toolbarDisposables.add(this.menuService.createMenu(MenuId.GlobalToolbar, this.scopedContextKeyService ?? this.contextKeyService));

		const renderDisposables = this.toolbarDisposables.add(new DisposableStore());

		const updateActions = () => {
			if (!this.element) {
				return;
			}

			renderDisposables.clear();
			clearNode(this.element);

			// Flatten all groups into a single action list with separators
			const groups = menu.getActions();
			const actionLists = groups
				.map(([, actions]) => actions)
				.filter(actions => actions.length > 0);

			const allActions = Separator.join(...actionLists);
			const hasActions = allActions.length > 0;

			if (hasActions) {
				const row = append(this.element!, $('div.toolbar-strip-row'));
				const toolbar = renderDisposables.add(this.instantiationService.createInstance(WorkbenchToolBar, row, {
					orientation: 0 /* ActionsOrientation.HORIZONTAL */,
					ariaLabel: localize('ariaLabelToolbarStrip', "Toolbar strip"),
					telemetrySource: 'toolbarStrip',
				}));
				toolbar.setActions(allActions);
			}

			const wasVisible = this.visible;

			if (hasActions !== wasVisible) {
				this.visible = hasActions;
				this.layoutService.setPartHidden(!hasActions, Parts.TOOLBARSTRIP_PART);
				this._onDidChangeSize.fire(undefined);
				this._onDidChangeVisibility.fire(hasActions);
			}
		};

		this.toolbarDisposables.add(menu.onDidChange(() => updateActions()));
		updateActions();
	}

	override updateStyles(): void {
		super.updateStyles();

		if (this.element) {
			const borderColor = this.getColor(TOOLBAR_STRIP_BORDER);
			this.element.style.borderBottom = borderColor ? `1px solid ${borderColor}` : '';
		}
	}

	focus(): void {
		this.element?.focus();
	}

	toJSON(): object {
		return {
			type: Parts.TOOLBARSTRIP_PART
		};
	}
}

registerSingleton(IToolbarStripService, ToolbarStripPart, InstantiationType.Eager);

// Actions

class FocusToolbarStripAction extends Action2 {

	static readonly ID = 'workbench.action.focusToolbarStrip';
	static readonly LABEL = localize2('focusToolbarStrip', "Focus Toolbar Strip");

	constructor() {
		super({
			id: FocusToolbarStripAction.ID,
			title: FocusToolbarStripAction.LABEL,
			category: Categories.View,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const layoutService = accessor.get(IWorkbenchLayoutService);
		layoutService.focusPart(Parts.TOOLBARSTRIP_PART);
	}
}

registerAction2(FocusToolbarStripAction);
