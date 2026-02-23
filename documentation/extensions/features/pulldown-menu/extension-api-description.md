# Pulldown Menu API — Extension API Description

**Proposed API** — requires `"enabledApiProposals": ["menuAccess"]` in `package.json`.

---

## Namespace: `vscode.menus`

Provides read access to all menu items and the ability to add new items or submenus to any menu location at runtime.

---

## Functions

### `menus.getMenuItems(menuId)`

Returns a snapshot of all items in a given menu.

```typescript
function getMenuItems(menuId: string): Thenable<MenuItemInfo[]>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `menuId` | `string` | Menu identifier, e.g. `'MenubarFileMenu'`, `'MenubarMainMenu'`, `'EditorContext'` |

**Returns:** `Thenable<MenuItemInfo[]>`

### `menus.addMenuItem(menuId, options)`

Adds a command as a menu item to the specified menu.

```typescript
function addMenuItem(menuId: string, options: MenuItemOptions): Disposable
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `menuId` | `string` | The menu to add to |
| `options` | `MenuItemOptions` | Item configuration |

**Returns:** `Disposable` — dispose to remove the item.

### `menus.addSubmenu(menuId, options)`

Creates a new submenu inside the specified menu.

```typescript
function addSubmenu(menuId: string, options: SubmenuOptions): { submenuId: string; disposable: Disposable }
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `menuId` | `string` | The parent menu |
| `options` | `SubmenuOptions` | Submenu configuration |

**Returns:** An object with:
- `submenuId` — the new submenu's identifier (use with `addMenuItem` to populate it)
- `disposable` — dispose to remove the submenu

---

## Events

### `menus.onDidChangeMenu`

Fires when items in any menu have changed. The event value is the menu identifier that changed.

```typescript
const onDidChangeMenu: Event<string>
```

---

## Types

### `MenuItemInfo`

Read-only snapshot of a menu item.

```typescript
interface MenuItemInfo {
    /** The identifier of the menu this item belongs to */
    readonly menuId: string;

    /** The command identifier (undefined for submenus) */
    readonly commandId: string | undefined;

    /** The display title */
    readonly title: string;

    /** The group (e.g. 'navigation', '1_modification') */
    readonly group: string | undefined;

    /** Sort order within group */
    readonly order: number | undefined;

    /** If this is a submenu, its identifier */
    readonly submenuId: string | undefined;

    /** Whether this is a built-in item (not added by an extension via this API) */
    readonly isBuiltin: boolean;
}
```

### `MenuItemOptions`

Options for adding a menu item.

```typescript
interface MenuItemOptions {
    /** Command to execute (must be registered via commands.registerCommand) */
    commandId: string;

    /** Display title */
    title: string;

    /** Group for sorting (e.g. 'navigation') */
    group?: string;

    /** Sort order within group (lower = earlier) */
    order?: number;
}
```

### `SubmenuOptions`

Options for adding a submenu.

```typescript
interface SubmenuOptions {
    /** Display title for the submenu entry */
    title: string;

    /** Group for sorting */
    group?: string;

    /** Sort order within group */
    order?: number;
}
```

---

## Well-Known Menu Identifiers

| Menu ID | Location |
|---------|----------|
| `MenubarMainMenu` | The top-level menu bar (File, Edit, View, ...) |
| `MenubarFileMenu` | File menu |
| `MenubarEditMenu` | Edit menu |
| `MenubarSelectionMenu` | Selection menu |
| `MenubarViewMenu` | View menu |
| `MenubarGoMenu` | Go menu |
| `MenubarRunMenu` | Run menu |
| `MenubarTerminalMenu` | Terminal menu |
| `MenubarHelpMenu` | Help menu |
| `EditorContext` | Editor right-click context menu |
| `ExplorerContext` | File explorer right-click menu |
| `EditorTitle` | Editor title bar actions |
| `ViewTitle` | View title bar actions |

---

## Usage Example

```typescript
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    // Register a command
    context.subscriptions.push(
        vscode.commands.registerCommand('myExt.sayHello', () => {
            vscode.window.showInformationMessage('Hello!');
        })
    );

    // Add a submenu to the main menu bar
    const { submenuId, disposable } = vscode.menus.addSubmenu('MenubarMainMenu', {
        title: 'My Extension',
        order: 10
    });
    context.subscriptions.push(disposable);

    // Add an item to the submenu
    context.subscriptions.push(
        vscode.menus.addMenuItem(submenuId, {
            commandId: 'myExt.sayHello',
            title: 'Say Hello',
            group: 'navigation',
            order: 1
        })
    );
}
```

---

## Further Reading

- [VS Code Changes](./vs-code-changes.md) — Core implementation details
- [Sample Usage](./sample-usage.md) — Full Markdown Menu extension walkthrough
