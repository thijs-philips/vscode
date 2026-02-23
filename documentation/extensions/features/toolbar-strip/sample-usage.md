# Toolbar Strip — Sample Usage

Two extensions demonstrate the toolbar strip:

1. **Toolbar Sample** (`extensions/toolbar-sample/`) — Minimal, always-visible buttons
2. **Markdown Menu** (`extensions/markdown-menu/`) — Conditional buttons with `when` clauses

---

## Sample 1: Toolbar Sample Extension

A minimal extension demonstrating three always-visible toolbar buttons.

### package.json

```json
{
  "name": "toolbar-sample",
  "displayName": "Toolbar Sample",
  "description": "Minimal extension demonstrating the global toolbar strip",
  "enabledApiProposals": ["contribGlobalToolbar"],
  "main": "./out/extension.js",
  "contributes": {
    "commands": [
      { "command": "toolbarSample.hello", "title": "Hello from Toolbar", "icon": "$(smiley)" },
      { "command": "toolbarSample.build", "title": "Build",              "icon": "$(tools)" },
      { "command": "toolbarSample.run",   "title": "Run",                "icon": "$(play)" }
    ],
    "menus": {
      "window/toolbar": [
        { "command": "toolbarSample.hello", "group": "navigation" },
        { "command": "toolbarSample.build", "group": "navigation" },
        { "command": "toolbarSample.run",   "group": "navigation" }
      ]
    }
  }
}
```

### Extension Code (`src/extension.ts`)

```typescript
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('toolbarSample.hello', () => {
            vscode.window.showInformationMessage('Hello from the toolbar strip!');
        }),
        vscode.commands.registerCommand('toolbarSample.build', () => {
            vscode.window.showInformationMessage('Build triggered from toolbar strip!');
        }),
        vscode.commands.registerCommand('toolbarSample.run', () => {
            vscode.window.showInformationMessage('Run triggered from toolbar strip!');
        })
    );
}

export function deactivate() { }
```

### How It Works

1. Declares three commands with codicon icons
2. Places all three in `window/toolbar`, same `navigation` group → they appear side-by-side without separators
3. No `when` clause → buttons are **always visible**
4. The `ToolbarStripPart` reads `MenuId.GlobalToolbar`, finds three actions, renders the strip at 28px height
5. Clicking any button triggers the corresponding command handler

### Result

```
┌───────────────────────────────────┐
│  Title Bar / Menu Bar              │
├───────────────────────────────────┤
│  😊  🔧  ▶                        │  ← Toolbar strip with 3 buttons
├───────────────────────────────────┤
│  Editor content...                 │
```

---

## Sample 2: Markdown Menu Extension (Conditional Toolbar Buttons)

The `markdown-menu` extension (see also [Pulldown Menu — Sample Usage](../pulldown-menu/sample-usage.md)) contributes **conditional** toolbar buttons that only appear when editing Markdown files.

### package.json (toolbar-related excerpt)

```json
{
  "enabledApiProposals": ["menuAccess", "contribGlobalToolbar"],
  "contributes": {
    "commands": [
      { "command": "markdownMenu.bold",      "title": "Toggle Bold",       "icon": "$(bold)" },
      { "command": "markdownMenu.italic",    "title": "Toggle Italic",     "icon": "$(italic)" },
      { "command": "markdownMenu.heading",   "title": "Insert Heading",    "icon": "$(symbol-structure)" },
      { "command": "markdownMenu.link",      "title": "Insert Link",       "icon": "$(link)" },
      { "command": "markdownMenu.codeBlock", "title": "Insert Code Block", "icon": "$(code)" },
      { "command": "markdownMenu.bulletList","title": "Insert Bullet List", "icon": "$(list-unordered)" },
      { "command": "markdownMenu.preview",   "title": "Open Preview",      "icon": "$(open-preview)" }
    ],
    "menus": {
      "window/toolbar": [
        { "command": "markdownMenu.bold",      "group": "markdown_format",  "when": "editorLangId == markdown" },
        { "command": "markdownMenu.italic",    "group": "markdown_format",  "when": "editorLangId == markdown" },
        { "command": "markdownMenu.heading",   "group": "markdown_format",  "when": "editorLangId == markdown" },
        { "command": "markdownMenu.link",      "group": "markdown_insert",  "when": "editorLangId == markdown" },
        { "command": "markdownMenu.codeBlock", "group": "markdown_insert",  "when": "editorLangId == markdown" },
        { "command": "markdownMenu.bulletList","group": "markdown_insert",  "when": "editorLangId == markdown" },
        { "command": "markdownMenu.preview",   "group": "markdown_preview", "when": "editorLangId == markdown" }
      ]
    }
  }
}
```

### Key Differences from Toolbar Sample

| Aspect | Toolbar Sample | Markdown Menu |
|--------|---------------|---------------|
| Visibility | Always visible | Only when editing Markdown |
| `when` clause | None | `editorLangId == markdown` |
| Groups | Single group (`navigation`) | Three groups (`markdown_format`, `markdown_insert`, `markdown_preview`) |
| Separators | None (same group) | Vertical bars between groups |

### Result (when Markdown file is open)

```
┌────────────────────────────────────────────────────┐
│  Title Bar / Menu Bar             [Markdown ▾]      │
├────────────────────────────────────────────────────┤
│  😊 🔧 ▶  |  B I 🏗  |  🔗 📋 •  |  📖            │  ← Both extensions
├────────────────────────────────────────────────────┤
│  # My Document                                      │
│  Some **markdown** content...                       │
```

### Result (when non-Markdown file is open)

```
┌────────────────────────────────────────────────────┐
│  Title Bar / Menu Bar                               │
├────────────────────────────────────────────────────┤
│  😊 🔧 ▶                                           │  ← Only toolbar-sample
├────────────────────────────────────────────────────┤
│  const x = 42;                                      │
│  // TypeScript file...                              │
```

If the toolbar-sample extension were also not loaded, the toolbar strip would hide completely (0px height).

---

## Creating Your Own Toolbar Extension

### Step-by-Step

1. **Create `package.json`** with `"enabledApiProposals": ["contribGlobalToolbar"]`

2. **Define commands with icons** in `contributes.commands`:
   ```json
   { "command": "myExt.action", "title": "My Action", "icon": "$(rocket)" }
   ```

3. **Place in `window/toolbar`** in `contributes.menus`:
   ```json
   { "command": "myExt.action", "group": "myGroup", "when": "optionalCondition" }
   ```

4. **Register command handlers** in `activate()`:
   ```typescript
   vscode.commands.registerCommand('myExt.action', () => { /* ... */ });
   ```

5. **Reference the proposed API** in `tsconfig.json`:
   ```json
   {
     "compilerOptions": { "lib": ["ES2020"] },
     "include": ["src/**/*"],
     "files": ["../../src/vscode-dts/vscode.proposed.contribGlobalToolbar.d.ts"]
   }
   ```

### Tips

- Use **meaningful group names** to logically separate your actions from other extensions' actions
- Always provide an **icon** — toolbar items without icons render as text, which looks inconsistent
- Use **`when` clauses** to avoid cluttering the toolbar with irrelevant actions
- Test with multiple extensions contributing to see how separators work between groups

---

## Further Reading

- [VS Code Changes](./vs-code-changes.md) — Core implementation details
- [API Description](./extension-api-description.md) — API reference
- [Pulldown Menu Sample](../pulldown-menu/sample-usage.md) — The pulldown menu from the same Markdown Menu extension
