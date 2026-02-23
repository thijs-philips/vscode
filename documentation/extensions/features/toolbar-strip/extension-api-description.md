# Toolbar Strip — Extension API Description

**Proposed API** — requires `"enabledApiProposals": ["contribGlobalToolbar"]` in `package.json`.

---

## Contribution Point: `contributes.menus` → `window/toolbar`

Extensions contribute actions to the toolbar strip using the standard `contributes.menus` mechanism with the `window/toolbar` menu location.

This is a **contribution point only** — there is no runtime `vscode.*` API. All configuration is in `package.json`.

---

## Extension Manifest

### Enabling the API

```json
{
  "enabledApiProposals": ["contribGlobalToolbar"]
}
```

### Contributing Toolbar Items

```json
{
  "contributes": {
    "commands": [
      {
        "command": "myExt.myAction",
        "title": "My Action",
        "icon": "$(play)"
      }
    ],
    "menus": {
      "window/toolbar": [
        {
          "command": "myExt.myAction",
          "group": "navigation",
          "when": "editorLangId == typescript"
        }
      ]
    }
  }
}
```

---

## Menu Item Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `command` | `string` | **Yes** | The command ID. Must be registered in `contributes.commands` with an `icon`. |
| `group` | `string` | No | Group name for separator placement. Items in different groups are separated by a vertical bar. |
| `when` | `string` | No | Context key expression controlling visibility. Supports all standard context keys including editor-scoped ones like `editorLangId`. |

---

## Behavior

### Auto-Show / Auto-Hide

The toolbar strip is a workbench Part that automatically manages its own visibility:

- **Shows** when at least one contributed item's `when` clause evaluates to `true` (or has no `when` clause)
- **Hides** (collapses to 0px height) when all items' `when` clauses evaluate to `false`
- The transition is seamless — no flickering or layout jumps

### Grouping and Separators

Items with the same `group` value appear together. Different groups are separated by **vertical bar separators** (`|`).

Example with three groups:

```
| 😊 🔧 ▶ |  B I H  |  🔗 📋 📖 |
  ^^^^^^^^    ^^^^^     ^^^^^^^^^
  navigation  format    insert
```

### Icons

The toolbar renders **icon buttons** (similar to editor title bar actions). Commands **should** have an `icon` defined in `contributes.commands`.

Icons use VS Code's [codicon](https://microsoft.github.io/vscode-codicons/) library. Reference them with `$(iconName)` syntax.

### When Clause Context Keys

The toolbar strip evaluates `when` clauses using a scoped context key service that inherits from the active editor's scope. This means all standard context keys are available:

| Context Key | Example Value | Description |
|-------------|---------------|-------------|
| `editorLangId` | `markdown`, `typescript` | Active editor's language |
| `resourceExtname` | `.md`, `.ts` | Active file extension |
| `isLinux`, `isMac`, `isWindows` | `true`/`false` | Platform |
| `config.<setting>` | varies | Any VS Code setting |
| Custom keys | varies | Keys set by your extension |

---

## Theme Colors

| Color ID | Description | Default |
|----------|-------------|---------|
| `toolbarStrip.border` | Bottom border color when the strip is visible | Same as `titleBar.border` |

---

## Commands

| Command ID | Title | Description |
|------------|-------|-------------|
| `workbench.action.focusToolbarStrip` | Focus Toolbar Strip | Moves keyboard focus to the toolbar strip |

---

## Minimal Example

```json
{
  "name": "my-toolbar-ext",
  "enabledApiProposals": ["contribGlobalToolbar"],
  "contributes": {
    "commands": [
      { "command": "myExt.run", "title": "Run", "icon": "$(play)" }
    ],
    "menus": {
      "window/toolbar": [
        { "command": "myExt.run", "group": "navigation" }
      ]
    }
  }
}
```

This shows a single ▶ (play) button in the toolbar strip, always visible.

---

## Conditional Example

```json
"menus": {
  "window/toolbar": [
    {
      "command": "myExt.run",
      "group": "navigation",
      "when": "editorLangId == python"
    }
  ]
}
```

The button appears only when a Python file is the active editor.

---

## Further Reading

- [VS Code Changes](./vs-code-changes.md) — Core implementation details
- [Sample Usage](./sample-usage.md) — Working extension walkthroughs
