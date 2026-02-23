# Toolbar Strip — VS Code Core Changes

This document describes the modifications made to VS Code core to implement the **Global Toolbar Strip**, a horizontal toolbar area between the title/menu bar and the workbench content area.

---

## Overview

The toolbar strip is a new workbench **Part** (like the status bar or banner) that renders as a single horizontal row directly below the title/menu bar. It:

- Is **automatically hidden** when no actions are contributed (zero-height)
- Is **automatically shown** when at least one extension contributes items to `window/toolbar`
- Supports **`when` clauses** for dynamic show/hide based on context
- Uses the standard `WorkbenchToolBar` rendering with codicon icons

---

## New Files

### `src/vs/workbench/browser/parts/toolbarStrip/toolbarStripPart.ts`

The main workbench Part (approximately 200 lines). Key responsibilities:

- **Extends `Part`** implementing `IToolbarStripService`
- **Dynamic height**: `minimumHeight`/`maximumHeight` return `ROW_HEIGHT` (28px) when visible, `0` when hidden
- **Creates a scoped `ContextKeyService`** whose parent is dynamically updated to the active editor pane's scope (so that `editorLangId` and other editor-scoped context keys are available)
- **Creates a `Menu`** from `MenuId.GlobalToolbar` using the scoped CKS
- **Renders actions** via `WorkbenchToolBar` with `Separator.join()` for group separators
- **Auto-shows/hides** by calling `layoutService.setPartHidden()` when actions appear/disappear
- **Registers** `toolbarStrip.border` theme color
- **Registers** a `FocusToolbarStripAction` command (`workbench.action.focusToolbarStrip`)

#### Scoped Context Key Service Pattern

```typescript
// Create scoped CKS rooted at the toolbar element
this.scopedContextKeyService = this.contextKeyService.createScoped(this.element);

// Track active editor and re-parent
this.editorService.onDidActiveEditorChange(() => {
    const activePane = this.editorService.activeEditorPane;
    this.scopedContextKeyService.updateParent(
        activePane?.scopedContextKeyService
        ?? this.editorGroupsService.activeGroup?.scopedContextKeyService
        ?? this.contextKeyService  // fallback to global
    );
});
```

This ensures that `when: editorLangId == markdown` evaluates correctly in the toolbar context.

### `src/vs/workbench/browser/parts/toolbarStrip/media/toolbarStripPart.css`

Flexbox layout for the strip:

```css
.monaco-workbench .part.toolbarstrip {
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    overflow: hidden;
}

.monaco-workbench .part.toolbarstrip > .toolbar-strip-row {
    display: flex;
    flex-direction: row;
    align-items: center;
    height: 28px;
    padding: 0 8px;
    overflow: hidden;
}
```

### `src/vs/workbench/services/toolbarStrip/browser/toolbarStripService.ts`

Service interface (30 lines):

```typescript
export interface IToolbarStripService {
    readonly _serviceBrand: undefined;
    readonly onDidChangeVisibility: Event<boolean>;
    readonly isVisible: boolean;
    focus(): void;
}
```

### `src/vscode-dts/vscode.proposed.contribGlobalToolbar.d.ts`

Proposed API marker file. No runtime types — just a comment explaining that this proposal enables the `window/toolbar` menu contribution point.

### `extensions/toolbar-sample/`

Minimal sample extension with 3 always-visible toolbar buttons:
- `toolbarSample.hello` — shows an info message
- `toolbarSample.build` — shows an info message
- `toolbarSample.run` — shows an info message

---

## Modified Files

### `src/vs/workbench/services/layout/browser/layoutService.ts`

Added to the `Parts` enum:

```typescript
TOOLBARSTRIP_PART = 'workbench.parts.toolbarstrip',
```

### `src/vs/platform/actions/common/actions.ts`

Added `MenuId`:

```typescript
static readonly GlobalToolbar = new MenuId('GlobalToolbar');
```

### `src/vs/workbench/services/actions/common/menusExtensionPoint.ts`

Added entry in the `apiMenus` array:

```typescript
{
    key: 'window/toolbar',
    id: MenuId.GlobalToolbar,
    description: localize('menus.globalToolbar', "The global toolbar strip below the title bar"),
    proposed: 'contribGlobalToolbar'
}
```

The `proposed` field means extensions must declare `"enabledApiProposals": ["contribGlobalToolbar"]` to contribute to this menu.

### `src/vs/platform/extensions/common/extensionsApiProposals.ts`

Registered the proposal:

```typescript
contribGlobalToolbar: {
    proposal: 'https://raw.githubusercontent.com/microsoft/vscode/main/src/vscode-dts/vscode.proposed.contribGlobalToolbar.d.ts',
},
```

### `src/vs/workbench/browser/layout.ts`

Approximately 20 lines of changes to integrate the toolbar strip into the workbench grid:

- **Content area offset calculation** — adds toolbar strip height to `top` offset when visible
- **`getPart()` switch** — added `Parts.TOOLBARSTRIP_PART` case
- **Grid data map** — included in `partViewMap`
- **`createGridDescriptor()`** — positioned the toolbar strip between title bar and banner in the vertical stack
- **Initial visibility** — starts hidden (setPartHidden) until extensions contribute actions

### `src/vs/workbench/browser/workbench.ts`

Added Part registration in the parts array:

```typescript
{ id: Parts.TOOLBARSTRIP_PART, role: 'toolbar', classes: ['toolbarstrip'] },
```

### `src/vs/workbench/browser/workbench.common.main.ts`

Added import to ensure the toolbar strip service is loaded:

```typescript
import 'vs/workbench/services/toolbarStrip/browser/toolbarStripService.js';
```

---

## Architecture

### Position in the Layout Grid

```
Layout Grid (vertical stack):
  ┌─ Title Bar Part
  ├─ Toolbar Strip Part  ← NEW (0px when hidden, 28px when visible)
  ├─ Banner Part
  ├─ Middle Section (sidebar + editor + panel)
  └─ Status Bar Part
```

The toolbar strip follows the **BannerPart** pattern: a Part that has zero height when hidden, causing it to visually collapse without grid re-layout.

### Rendering Pipeline

```
1. ToolbarStripPart.createContentArea()
   │
   ├─ Creates scoped ContextKeyService
   │  └─ Re-parents to active editor pane's CKS
   │
   └─ Creates Menu from MenuId.GlobalToolbar
      │
      └─ updateActions() — called on menu.onDidChange
         │
         ├─ menu.getActions() → [[group, actions], ...]
         ├─ Separator.join(...actionLists) → flat action array
         ├─ Creates WorkbenchToolBar, sets actions
         │
         └─ If hasActions changed:
            ├─ layoutService.setPartHidden(!hasActions, TOOLBARSTRIP_PART)
            └─ fires _onDidChangeSize and _onDidChangeVisibility
```

### Service Registration

```typescript
// Eager: must be instantiated at startup so the Part exists in the grid
registerSingleton(IToolbarStripService, ToolbarStripPart, InstantiationType.Eager);
```

---

## Further Reading

- [API Description](./extension-api-description.md) — How extensions contribute to the toolbar
- [Sample Usage](./sample-usage.md) — Toolbar Sample and Markdown Menu extensions
- [Learnings & Guidelines](../../guidelines.md) — Architecture and implementation patterns
