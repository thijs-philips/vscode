# Pulldown Menu API — Sample: Markdown Menu Extension

**Extension:** `extensions/markdown-menu/`

This extension creates a top-level **"Markdown"** pulldown menu that appears dynamically when a Markdown file is the active editor and disappears when switching to non-Markdown files.

> This extension also contributes toolbar strip buttons for the same commands. See [Toolbar Strip — Sample Usage](../toolbar-strip/sample-usage.md) for that aspect.

---

## What It Does

1. Registers seven Markdown editing commands (bold, italic, heading, link, code block, bullet list, preview)
2. Listens for active editor changes
3. When a Markdown-like file becomes active → dynamically adds a **"Markdown"** submenu to the top-level menu bar using `vscode.menus.addSubmenu()` and populates it with all seven commands
4. When switching away from Markdown → disposes the menu (it disappears immediately)
5. Additionally contributes the same commands to the `window/toolbar` menu location with `when: editorLangId == markdown` for toolbar strip buttons

---

## package.json

Key sections of the extension manifest:

```json
{
  "name": "markdown-menu",
  "displayName": "Markdown Menu",
  "description": "Adds a top-level Markdown menu to the menu bar",
  "enabledApiProposals": ["menuAccess", "contribGlobalToolbar"],
  "activationEvents": ["*"],
  "main": "./out/extension.js",
  "contributes": {
    "commands": [
      { "command": "markdownMenu.bold",      "title": "Toggle Bold",      "icon": "$(bold)" },
      { "command": "markdownMenu.italic",    "title": "Toggle Italic",    "icon": "$(italic)" },
      { "command": "markdownMenu.heading",   "title": "Insert Heading",   "icon": "$(symbol-structure)" },
      { "command": "markdownMenu.link",      "title": "Insert Link",      "icon": "$(link)" },
      { "command": "markdownMenu.codeBlock", "title": "Insert Code Block", "icon": "$(code)" },
      { "command": "markdownMenu.bulletList","title": "Insert Bullet List","icon": "$(list-unordered)" },
      { "command": "markdownMenu.preview",   "title": "Open Preview",     "icon": "$(open-preview)" }
    ],
    "menus": {
      "window/toolbar": [
        { "command": "markdownMenu.bold",      "group": "markdown_format", "when": "editorLangId == markdown" },
        { "command": "markdownMenu.italic",    "group": "markdown_format", "when": "editorLangId == markdown" },
        { "command": "markdownMenu.heading",   "group": "markdown_format", "when": "editorLangId == markdown" },
        { "command": "markdownMenu.link",      "group": "markdown_insert", "when": "editorLangId == markdown" },
        { "command": "markdownMenu.codeBlock", "group": "markdown_insert", "when": "editorLangId == markdown" },
        { "command": "markdownMenu.bulletList","group": "markdown_insert", "when": "editorLangId == markdown" },
        { "command": "markdownMenu.preview",   "group": "markdown_preview","when": "editorLangId == markdown" }
      ]
    }
  }
}
```

**Notes:**
- `menuAccess` enables the runtime `vscode.menus.*` API for adding the pulldown menu
- `contribGlobalToolbar` enables the `window/toolbar` menu location for toolbar strip buttons
- Commands include `icon` for the toolbar strip (icons are not used in pulldown menus)

---

## Extension Code

### `src/extension.ts`

```typescript
import * as vscode from 'vscode';

const MARKDOWN_LANGUAGES = new Set([
    'markdown', 'mermaid', 'markwhen', 'mdx', 'rmd', 'quarto',
]);

let menuDisposables: vscode.Disposable[] = [];
let menuVisible = false;

export function activate(context: vscode.ExtensionContext) {
    // 1. Register commands (always available)
    context.subscriptions.push(
        vscode.commands.registerCommand('markdownMenu.bold', () => wrapSelectionWith('**')),
        vscode.commands.registerCommand('markdownMenu.italic', () => wrapSelectionWith('_')),
        vscode.commands.registerCommand('markdownMenu.heading', () => insertAtLineStart('## ')),
        vscode.commands.registerCommand('markdownMenu.link', () => wrapSelectionAsLink()),
        vscode.commands.registerCommand('markdownMenu.codeBlock', () => insertCodeBlock()),
        vscode.commands.registerCommand('markdownMenu.bulletList', () => insertAtLineStart('- ')),
        vscode.commands.registerCommand('markdownMenu.preview', () => {
            vscode.commands.executeCommand('markdown.showPreview');
        })
    );

    // 2. Show/hide menu based on active editor language
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(() => updateMenuVisibility()),
        vscode.workspace.onDidOpenTextDocument(() => updateMenuVisibility()),
    );

    context.subscriptions.push({ dispose: disposeMenu });
    updateMenuVisibility();
}

function updateMenuVisibility() {
    const shouldShow = isMarkdownLike(vscode.window.activeTextEditor);
    if (shouldShow && !menuVisible) {
        showMenu();
    } else if (!shouldShow && menuVisible) {
        disposeMenu();
    }
}
```

### Dynamic Menu Management — The Key Pattern

```typescript
function showMenu() {
    // Create "Markdown" submenu in the main menu bar
    const { submenuId, disposable: submenuDisposable } = vscode.menus.addSubmenu('MenubarMainMenu', {
        title: 'Markdown',
        order: 10
    });
    menuDisposables.push(submenuDisposable);

    // Add items, grouped by function
    const items = [
        { commandId: 'markdownMenu.bold',      title: 'Toggle Bold',      group: '1_format',  order: 1 },
        { commandId: 'markdownMenu.italic',    title: 'Toggle Italic',    group: '1_format',  order: 2 },
        { commandId: 'markdownMenu.heading',   title: 'Insert Heading',   group: '2_insert',  order: 1 },
        { commandId: 'markdownMenu.link',      title: 'Insert Link',      group: '2_insert',  order: 2 },
        { commandId: 'markdownMenu.codeBlock', title: 'Insert Code Block',group: '2_insert',  order: 3 },
        { commandId: 'markdownMenu.bulletList',title: 'Insert Bullet List',group: '2_insert', order: 4 },
        { commandId: 'markdownMenu.preview',   title: 'Open Preview',     group: '3_preview', order: 1 },
    ];

    for (const item of items) {
        menuDisposables.push(vscode.menus.addMenuItem(submenuId, item));
    }
    menuVisible = true;
}

function disposeMenu() {
    for (const d of menuDisposables) {
        d.dispose();
    }
    menuDisposables = [];
    menuVisible = false;
}
```

### Helper Functions

```typescript
function isMarkdownLike(editor: vscode.TextEditor | undefined): boolean {
    return !!editor && MARKDOWN_LANGUAGES.has(editor.document.languageId);
}

function wrapSelectionWith(wrapper: string) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const selection = editor.selection;
    const text = editor.document.getText(selection);
    editor.edit(eb => eb.replace(selection, `${wrapper}${text}${wrapper}`));
}

function insertAtLineStart(prefix: string) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const position = new vscode.Position(editor.selection.active.line, 0);
    editor.edit(eb => eb.insert(position, prefix));
}

function wrapSelectionAsLink() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const text = editor.document.getText(editor.selection);
    editor.edit(eb => eb.replace(editor.selection, `[${text}](url)`));
}

function insertCodeBlock() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const text = editor.document.getText(editor.selection);
    editor.edit(eb => eb.replace(editor.selection, `\`\`\`\n${text}\n\`\`\``));
}
```

---

## How It Works End-to-End

1. Extension activates (via `*` activation event)
2. Registers all seven command handlers
3. Listens for `onDidChangeActiveTextEditor`
4. **Markdown file opened:**
   - `updateMenuVisibility()` detects `languageId === 'markdown'`
   - `showMenu()` calls `vscode.menus.addSubmenu('MenubarMainMenu', { title: 'Markdown' })`
   - This RPC call reaches `MainThreadMenus.$addSubmenu()`, which calls `MenuRegistry.appendMenuItem()` on `MenuId.for('MenubarMainMenu')`
   - The menu bar re-renders, showing a new "Markdown" pulldown
   - Seven items are added via `vscode.menus.addMenuItem(submenuId, ...)`, populating the pulldown
5. **Non-Markdown file opened:**
   - `updateMenuVisibility()` detects non-Markdown language
   - `disposeMenu()` disposes all menu item disposables
   - Each dispose triggers `MainThreadMenus.$removeMenuItem()` → `DisposableMap.deleteAndDispose()`
   - Items are removed from `MenuRegistry`, menu bar re-renders without "Markdown"

---

## Further Reading

- [VS Code Changes](./vs-code-changes.md) — Core implementation details
- [API Description](./extension-api-description.md) — API reference
- [Toolbar Strip Sample](../toolbar-strip/sample-usage.md) — The toolbar buttons from this same extension
