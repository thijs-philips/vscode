# Menu Loader YAML Format Reference

Complete schema for `.menu.yaml` files consumed by the menu-loader extension.

---

## File Location

| Location | Scope |
|---|---|
| `~/.vscode/menus/*.menu.yaml` | Global — available in all workspaces |
| `.vscode/menus/*.menu.yaml` | Project — only in that workspace |

Files must end in `.menu.yaml` or `.menu.yml`.

---

## Top-Level Fields (`MenuDefinitionYaml`)

```yaml
name: <string>          # REQUIRED — unique internal identifier
menu: <string>          # REQUIRED — target menu location ID
title: <string>         # Display label for the submenu entry (omit to inject items directly)
when: <string>          # When-clause — hides entire menu if false
group: <string>         # Group string on the top-level submenu entry
order: <number>         # Sort order within the group
position: <string>      # Relative position reference (e.g. '$Selection', '^Run')
icon: <string>          # Codicon name (e.g. 'markdown', 'git-merge')
items: <MenuNodeYaml[]> # REQUIRED — tree of groups and items
```

### `menu` — Target Location

Where the menu appears. Common values:

| Value | Creates |
|---|---|
| `MenubarMainMenu` | New top-level dropdown in the menu bar |
| `MenubarFileMenu` | Items inside the File menu |
| `MenubarEditMenu` | Items inside the Edit menu |
| `EditorContext` | Items in the editor right-click menu |
| `ExplorerContext` | Items in the file explorer right-click menu |
| `window/toolbar` | Toolbar strip button (proposed API) |

Run `menuLoader.listMenuIds` for the full list of ~70 locations.

---

## Node Fields (`MenuNodeYaml`)

Each entry in `items:` is a node. Three kinds of nodes exist:

### Group Node
Has `group` + `items`, no action. At depth 0 without `title` creates a separator-delimited section. At depth 0 with `title` creates a submenu flyout placed in that group. At deeper levels creates a submenu.

```yaml
# Flat group (no title) — items appear directly with separator
- group: 1_format
  when: "editorLangId == markdown"   # optional
  items:
    - title: Bold
      snippet: "**${TM_SELECTED_TEXT}**"

# Titled group — creates a submenu flyout in the group
- group: 8_testing
  title: Testing
  items:
    - title: Run All Tests
      command: testing.runAll
```

### Submenu Node
Has `title` + `items`, no action field.

```yaml
- title: Transform
  icon: symbol-operator
  items:
    - title: Uppercase
      command: editor.action.transformToUppercase
    - title: Lowercase
      command: editor.action.transformToLowercase
```

### Leaf Node
Has `title` + exactly ONE action field. No `items`.

```yaml
- title: Format Document
  command: editor.action.formatDocument
  when: "editorHasSelection == false"
  icon: layout
```

`order` is auto-assigned from YAML position when omitted. Use explicit `order` only when interleaving with built-in menu items.

### All Node Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `title` | string | On leaves/submenus | Display label |
| `group` | string | On group nodes | Group identifier. Sortable prefix: `1_name`, `2_name` |
| `order` | number | No | Sort order within parent. **Auto-assigned from YAML position (1-based) when omitted.** |
| `position` | string | No | Relative position reference (`$Title`, `^Title`, `$#cmdId`, `^#cmdId`) |
| `when` | string | No | When-clause — hides node if false |
| `icon` | string | No | Codicon name |
| `command` | string or object | Leaf only | Execute a VS Code command |
| `shell` | string or object | Leaf only | Run a terminal command |
| `snippet` | string | Leaf only | Insert an editor snippet |
| `url` | string | Leaf only | Open URL in browser |
| `chat` | string | Leaf only | Open Copilot Chat with prompt |
| `clipboard` | string | Leaf only | Copy text to clipboard |
| `items` | MenuNodeYaml[] | On groups/submenus | Nested children |

---

## Action Types (Detail)

### `command`

Execute a registered VS Code command.

```yaml
# Simple — just the command ID
command: editor.action.formatDocument

# With arguments
command:
  id: workbench.action.openSettings
  args: ["editor.fontSize"]
```

Use `menuLoader.listCommands` to discover available command IDs.

### `shell`

Run a command in a VS Code terminal.

```yaml
# Simple — just the command string
shell: "npm run build"

# With options
shell:
  cmd: "npm test -- --grep '${selectedText}'"
  cwd: "${workspaceFolder}/packages/core"
  name: "Unit Tests"
```

| Sub-field | Description |
|---|---|
| `cmd` | The shell command to run |
| `cwd` | Working directory (supports variables) |
| `name` | Terminal tab name |

### `snippet`

Insert a snippet into the active editor. Uses VS Code snippet syntax (tab stops, placeholders, variables).

```yaml
snippet: "**${TM_SELECTED_TEXT}**"
snippet: "console.log('${1:label}:', ${2:value});"
snippet: "```${1:language}\n${TM_SELECTED_TEXT}\n```"
```

### `url`

Open a URL in the default browser. Supports variable expansion.

```yaml
url: "https://code.visualstudio.com/docs"
url: "https://github.com/search?q=${selectedText}"
```

### `chat`

Open Copilot Chat with a pre-filled prompt.

```yaml
chat: "Explain the purpose of this file"
chat: "Write unit tests for the selected code: ${selectedText}"
```

### `clipboard`

Copy text to the system clipboard. Supports variable expansion.

```yaml
clipboard: "${file}"
clipboard: "${fileBasename}:${lineNumber}"
```

---

## When-Clause Syntax

When-clauses are boolean expressions evaluated against the current editor context.

### Supported Conditions

| Condition | Example | Meaning |
|---|---|---|
| `editorLangId == <id>` | `editorLangId == typescript` | Active editor language |
| `resourceExtname == <ext>` | `resourceExtname == .py` | Active file extension |
| `platform == <name>` | `platform == win32` | OS platform |
| `isWindows` | `isWindows` | Boolean platform checks |
| `isMac` | `isMac` | |
| `isLinux` | `isLinux` | |
| `hasExtension(<id>)` | `hasExtension(yzhang.markdown-all-in-one)` | Extension is installed |
| `workspaceContains(<glob>)` | `workspaceContains(**/*.py)` | Workspace has matching files |
| `configValue(<key>)` | `configValue(editor.wordWrap) == on` | Setting value |
| `editorHasSelection` | `editorHasSelection` | Text is selected |

### Operators

| Operator | Example |
|---|---|
| `==` | `editorLangId == python` |
| `!=` | `resourceExtname != .md` |
| `&&` | `editorLangId == markdown && hasExtension(yzhang.markdown-all-in-one)` |
| `\|\|` | `isWindows \|\| isLinux` |
| `!` | `!editorHasSelection` |

Parentheses are supported for grouping: `(isWindows || isLinux) && editorLangId == python`

---

## Variable Expansion

Action values (shell, snippet, url, clipboard, chat) support `${variable}` placeholders resolved at execution time.

| Variable | Value |
|---|---|
| `${workspaceFolder}` | Absolute path to workspace root |
| `${workspaceFolderBasename}` | Workspace folder name only |
| `${file}` | Absolute path to current file |
| `${fileBasename}` | Current filename with extension |
| `${fileDirname}` | Directory of current file |
| `${fileExtname}` | Current file extension (e.g. `.ts`) |
| `${selectedText}` | Currently selected text in editor |
| `${lineNumber}` | Current line number (1-based) |
| `${clipboard}` | Current clipboard contents |
| `${env:NAME}` | Environment variable value |

---

## Positioning

### Implicit order from YAML position

When `order` is omitted, items are automatically assigned order values based on their position in the YAML file (1-based). The first item gets `order: 1`, the second `order: 2`, etc. This means **YAML file order = menu order** by default:

```yaml
items:
  - title: Run Build Task       # implicit order: 1
    command: workbench.action.tasks.build
  - title: Run Test Task         # implicit order: 2
    command: workbench.action.tasks.test
  - title: Run Task…             # implicit order: 3
    command: workbench.action.tasks.runTask
```

Explicit `order` overrides the implicit value when you need precise control.

### Group ordering

Groups are sorted alphanumerically by their `group` string. Use numeric prefixes for predictable ordering:

```yaml
items:
  - group: 1_format     # appears first
    items: [...]
  - group: 2_insert     # appears second
    items: [...]
  - group: 9_other      # appears last
    items: [...]
```

### Relative position references

The `position` field places a menu item or submenu relative to an existing item in the target menu. This is useful for injecting items next to built-in menu entries without knowing their exact group/order values.

| Syntax | Meaning |
|---|---|
| `$Title` | Place **after** the item titled "Title" |
| `^Title` | Place **before** the item titled "Title" |
| `$#commandId` | Place after the item with that command ID |
| `^#commandId` | Place before the item with that command ID |

At build time, `position` is resolved into concrete `group` and `order` values by querying the live menu. If the reference cannot be found, it falls back to the explicit `group`/`order` values (if any).

```yaml
# Top-level: place this menu right after the Selection dropdown
name: typescript
menu: MenubarMainMenu
title: TypeScript
position: "$Selection"

# Node-level: place Paste Special right after the built-in Paste item
- position: "$Paste"
  title: Paste Special
  items:
    - title: Paste As…
      command: editor.action.pasteAs
```

The `$` syntax does not conflict with `${variable}` placeholders — variables use braces (`${name}`), position references do not.
