# Menu Loader YAML Samples

Annotated examples covering all major patterns. Each can be placed in `~/.vscode/menus/` or `.vscode/menus/`.

---

## 1. Minimal Menu — New Top-Level Dropdown

The simplest possible menu file. Creates a "Bookmarks" dropdown in the menu bar with two commands.

```yaml
name: bookmarks
menu: MenubarMainMenu
title: Bookmarks

items:
  - group: 1_nav
    items:
      - title: Toggle Bookmark
        command: bookmarks.toggle
      - title: Jump to Next Bookmark
        command: bookmarks.jumpToNext
```

**Key points:**
- `menu: MenubarMainMenu` creates a new dropdown in the menu bar
- `group: 1_nav` wraps items in a separator-delimited section
- Every leaf needs `title` + one action field

---

## 2. Injecting Into an Existing Menu

Add items to the existing Edit menu instead of creating a new dropdown.

```yaml
name: edit-extras
menu: MenubarEditMenu
# No title — items inject directly into the Edit menu

items:
  - group: 9_custom
    items:
      - title: Sort Lines Ascending
        command: editor.action.sortLinesAscending
      - title: Sort Lines Descending
        command: editor.action.sortLinesDescending
      - title: Join Lines
        command: editor.action.joinLines
```

**Key points:**
- `menu: MenubarEditMenu` targets an existing menu
- Omitting `title` at the top level injects items directly (no submenu created)
- `group: 9_custom` places items at the bottom (high prefix number)

---

## 3. Editor Right-Click Context Menu

Add items to the editor's context menu, only visible for Python files.

```yaml
name: python-tools
menu: EditorContext
when: "editorLangId == python"

items:
  - group: z_custom
    items:
      - title: Run in Terminal
        shell: "python ${file}"
      - title: Run Selected Text
        shell: "python -c \"${selectedText}\""
        when: "editorHasSelection"
      - title: Open Python Docs
        url: "https://docs.python.org/3/search.html?q=${selectedText}"
```

**Key points:**
- `menu: EditorContext` = right-click menu
- Top-level `when` applies to all items
- Item-level `when` adds additional conditions
- `shell` and `url` both use `${variable}` expansion

---

## 4. Conditional Groups — Third-Party Extensions

Show commands from optional extensions only when they are installed.

```yaml
name: markdown-extras
menu: MenubarMainMenu
when: "editorLangId == markdown"
title: Markdown

items:
  - group: 1_builtin
    items:
      - title: Open Preview
        command: markdown.showPreview
      - title: Open Preview to Side
        command: markdown.showPreviewToSide

  - group: 2_toc
    when: "hasExtension(yzhang.markdown-all-in-one)"
    items:
      - title: Create Table of Contents
        command: markdown.extension.toc.create
      - title: Update Table of Contents
        command: markdown.extension.toc.update

  - group: 3_lint
    when: "hasExtension(DavidAnson.vscode-markdownlint)"
    items:
      - title: Fix All Lint Violations
        command: markdownlint.fixAll
```

**Key points:**
- `when` on a group hides the entire section when the extension is not installed
- `hasExtension(publisher.name)` is the condition for optional dependencies
- Run `menuLoader.listCommands` to discover the exact command IDs

---

## 5. All Six Action Types

Demonstrates every supported action type in one file.

```yaml
name: action-demo
menu: MenubarMainMenu
title: Actions Demo

items:
  - group: 1_command
    items:
      - title: Format Document
        command: editor.action.formatDocument

  - group: 2_shell
    items:
      - title: Build Project
        shell: "npm run build"
      - title: Run Tests (with options)
        shell:
          cmd: "npm test"
          cwd: "${workspaceFolder}"
          name: "Tests"

  - group: 3_snippet
    items:
      - title: Insert Console.log
        snippet: "console.log('${1:label}:', ${2:value});"
        when: "editorLangId == javascript || editorLangId == typescript"

  - group: 4_url
    items:
      - title: Search MDN
        url: "https://developer.mozilla.org/en-US/search?q=${selectedText}"

  - group: 5_chat
    items:
      - title: Explain Selection
        chat: "Explain this code: ${selectedText}"
        when: "editorHasSelection"

  - group: 6_clipboard
    items:
      - title: Copy Relative Path
        clipboard: "${fileBasename}"
      - title: Copy File Path with Line
        clipboard: "${file}:${lineNumber}"
```

---

## 6. Nested Submenus

Deep menu hierarchy with flyout submenus.

```yaml
name: text-tools
menu: MenubarEditMenu

items:
  - group: 9_texttools
    items:
      - title: Text Tools
        icon: symbol-string
        items:
          - title: Transform Case
            items:
              - title: To Uppercase
                command: editor.action.transformToUppercase
              - title: To Lowercase
                command: editor.action.transformToLowercase
              - title: To Title Case
                command: editor.action.transformToTitlecase
              - title: To Snake Case
                command: editor.action.transformToSnakecase
          - title: Sort Lines
            items:
              - title: Sort Ascending
                command: editor.action.sortLinesAscending
              - title: Sort Descending
                command: editor.action.sortLinesDescending
```

**Key points:**
- A node with `title` + `items` (no action) becomes a submenu flyout
- Nesting can go multiple levels deep
- `icon` renders a codicon next to the submenu

---

## 7. Platform-Specific Items

Different items for Windows vs macOS vs Linux.

```yaml
name: open-in-terminal
menu: ExplorerContext

items:
  - group: z_terminal
    items:
      - title: Open in Terminal
        shell:
          cmd: "start cmd /k cd \"${fileDirname}\""
        when: "isWindows"
      - title: Open in Terminal
        shell:
          cmd: "open -a Terminal \"${fileDirname}\""
        when: "isMac"
      - title: Open in Terminal
        shell:
          cmd: "xterm -e 'cd \"${fileDirname}\" && bash'"
        when: "isLinux"
```

---

## 8. Command with Arguments

Pass arguments to a VS Code command.

```yaml
name: settings-shortcuts
menu: MenubarMainMenu
title: Settings

items:
  - group: 1_open
    items:
      - title: Font Size
        command:
          id: workbench.action.openSettings
          args: ["editor.fontSize"]
      - title: Theme
        command:
          id: workbench.action.openSettings
          args: ["workbench.colorTheme"]
      - title: Keybindings
        command: workbench.action.openGlobalKeybindings
```

---

## 9. Using the Developer Tools

Recommended workflow for authoring new menus:

```
Step 1: Run "Menu Loader: List Menu Location IDs" (menuLoader.listMenuIds)
        → Pick the right menu: value

Step 2: Run "Menu Loader: List All Commands" (menuLoader.listCommands)
        → Find command IDs for the actions you want

Step 3: Write your .menu.yaml file

Step 4: Run "Menu Loader: Validate Menu Files" (menuLoader.validateMenus)
        → Fix any reported issues

Step 5: Run "Menu Loader: Show Menu Tree" (menuLoader.showMenuTree)
        → Verify the structure looks correct

Step 6: Menu auto-reloads on save, or run "Menu Loader: Reload Menus"
```

These commands are available in the Command Palette and output to an untitled markdown editor. Give the output to Copilot for it to write or fix your YAML.
