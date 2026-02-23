# Pulldown Menu API — VS Code Core Changes

This document describes the modifications made to VS Code core to implement the `menuAccess` proposed API, which gives extensions programmatic read/write access to the menu system at runtime.

---

## Overview

The standard `contributes.menus` mechanism in `package.json` allows extensions to place commands in existing menus, but it is **static** — items are declared at install time and cannot be added or removed dynamically. The `menuAccess` proposed API adds a runtime `vscode.menus` namespace that lets extensions read, add, and remove menu items dynamically.

---

## New Files

### `src/vscode-dts/vscode.proposed.menuAccess.d.ts`

Proposed API type definitions for the `vscode.menus` namespace. Defines:

- `MenuItemInfo` — read-only snapshot of a menu item (menuId, commandId, title, group, order, submenuId, isBuiltin)
- `MenuItemOptions` — options for adding a menu item (commandId, title, group, order)
- `SubmenuOptions` — options for adding a submenu (title, group, order)
- `vscode.menus` namespace — `getMenuItems()`, `onDidChangeMenu`, `addMenuItem()`, `addSubmenu()`

### `src/vs/workbench/api/common/extHostMenus.ts`

ExtHost implementation. Manages:

- A handle counter for tracking added items
- `getMenuItems()` → delegates to `proxy.$getMenuItems()`
- `addMenuItem()` → calls `proxy.$addMenuItem()`, returns a `Disposable` that calls `$removeMenuItem()`
- `addSubmenu()` → generates a unique submenu ID (`extHostSubmenu.N`), calls `proxy.$addSubmenu()`, returns `{ submenuId, disposable }`
- `$onDidChangeMenu()` → fires the `onDidChangeMenu` event emitter

### `src/vs/workbench/api/browser/mainThreadMenus.ts`

MainThread implementation (139 lines). Handles:

- `$getMenuItems()` — reads from `MenuRegistry.getMenuItems()`, converts to `IMenuItemInfoDto` array, resolves localized titles
- `$addMenuItem()` — registers a no-op command if needed, calls `MenuRegistry.appendMenuItem()`, tracks via `DisposableMap`
- `$addSubmenu()` — creates a `MenuId` via `MenuId.for(submenuId)`, appends submenu item to parent menu
- `$removeMenuItem()` — disposes the tracked item via `DisposableMap.deleteAndDispose()`
- Listens to `MenuRegistry.onDidChangeMenu` and forwards changes to the ExtHost via `proxy.$onDidChangeMenu()`

---

## Modified Files

### `src/vs/workbench/api/common/extHost.protocol.ts`

Added the following to the protocol file:

- **`IMenuItemInfoDto`** — DTO interface with fields: `menuId`, `commandId`, `title`, `group`, `order`, `submenuId`, `isBuiltin`
- **`MainThreadMenusShape`** — RPC interface:
  - `$getMenuItems(menuId: string): Promise<IMenuItemInfoDto[]>`
  - `$addMenuItem(handle, menuId, commandId, title, group, order): void`
  - `$addSubmenu(handle, menuId, submenuId, title, group, order): void`
  - `$removeMenuItem(handle): void`
- **`ExtHostMenusShape`** — RPC interface:
  - `$onDidChangeMenu(menuId: string): void`
- **Proxy identifiers** — Added `MainThreadMenus` to `MainContext` and `ExtHostMenus` to `ExtHostContext`

### `src/vs/workbench/api/common/extHost.api.impl.ts`

Wired the `vscode.menus` namespace into the API factory:

```typescript
const menus: typeof vscode.menus = {
    getMenuItems(menuId: string) {
        checkProposedApiEnabled(extension, 'menuAccess');
        return extHostMenus.getMenuItems(menuId);
    },
    get onDidChangeMenu() {
        checkProposedApiEnabled(extension, 'menuAccess');
        return extHostMenus.onDidChangeMenu;
    },
    addMenuItem(menuId: string, options: vscode.MenuItemOptions) {
        checkProposedApiEnabled(extension, 'menuAccess');
        return extHostMenus.addMenuItem(menuId, options);
    },
    addSubmenu(menuId: string, options: vscode.SubmenuOptions) {
        checkProposedApiEnabled(extension, 'menuAccess');
        return extHostMenus.addSubmenu(menuId, options);
    },
};
```

All four methods are guarded by `checkProposedApiEnabled(extension, 'menuAccess')`.

### `src/vs/workbench/api/browser/extensionHost.contribution.ts`

Added import:

```typescript
import './mainThreadMenus.js';
```

### `src/vs/platform/extensions/common/extensionsApiProposals.ts`

Registered the proposal:

```typescript
menuAccess: {
    proposal: 'https://raw.githubusercontent.com/microsoft/vscode/main/src/vscode-dts/vscode.proposed.menuAccess.d.ts',
},
```

---

## Architecture

```
vscode.menus.addSubmenu('MenubarMainMenu', { title: 'Markdown' })
  │
  ▼
ExtHostMenus.addSubmenu()
  │  generates handle + submenuId ('extHostSubmenu.N')
  │
  ▼  RPC
MainThreadMenus.$addSubmenu(handle, 'MenubarMainMenu', submenuId, 'Markdown', ...)
  │
  ▼
MenuRegistry.appendMenuItem(MenuId.for('MenubarMainMenu'), { submenu, title, ... })
  │
  ▼
Menu bar re-renders with new "Markdown" pulldown
```

```
vscode.menus.addMenuItem(submenuId, { commandId: 'markdownMenu.bold', title: 'Toggle Bold', ... })
  │
  ▼
ExtHostMenus.addMenuItem()
  │  assigns handle
  │
  ▼  RPC
MainThreadMenus.$addMenuItem(handle, submenuId, 'markdownMenu.bold', 'Toggle Bold', ...)
  │
  ▼
MenuRegistry.appendMenuItem(MenuId.for(submenuId), { command: { id, title }, group, order })
```

When disposed:

```
disposable.dispose()
  │
  ▼
ExtHostMenus → proxy.$removeMenuItem(handle)
  │
  ▼
MainThreadMenus.$removeMenuItem(handle)
  │
  ▼
DisposableMap.deleteAndDispose(handle) → removes from MenuRegistry
```

---

## Further Reading

- [API Description](./extension-api-description.md) — Detailed API reference
- [Sample Usage](./sample-usage.md) — Markdown Menu extension walkthrough
- [Learnings & Guidelines](../../guidelines.md) — Architecture and implementation patterns
