# Menu Organization Plan

> Plan for `.vscode/menus/vscode-native/` — menus built from VS Code's
> internal extensions and core commands only.

---

## 1. Command landscape

| Source                      | Commands | Notes                                     |
|-----------------------------|----------|-------------------------------------------|
| **Core — Editor Actions**   | 285      | `editor.action.*`, `editor.fold*`, etc.   |
| **Core — Workbench Actions**| 1 447    | `workbench.action.*` (chat 189, terminal 146, debug 29, files 25, tasks 17, …) |
| **Core — Other**            | 1 095    | notebook 135, testing 76, search 41, debug 32, extensions 31, git 37, … |
| **Internal exts (vscode.*)** | 399     | git 183, text-toolkit 58, emmet 23, references-view 21, ts-lang 15, md-lang 12, merge-conflict 10, … |
| **External exts**           | 154      | copilot-chat 122, js-debug 31, js-profile 1 — **excluded** |
| **Total**                   | 3 226    |                                           |

### What we exclude

| Extension ID                                   | Why             |
|------------------------------------------------|-----------------|
| `GitHub.copilot-chat`                          | Not in `extensions/` |
| `ms-vscode.js-debug`                           | Not in `extensions/` |
| `ms-vscode.vscode-js-profile-table`            | Not in `extensions/` |
| `ms-vscode.vscode-selfhost-test-provider`      | Not in `extensions/` |
| `philips-internal.vscode-copilot-extensions`   | Not in `extensions/` |

That leaves **~3 072 commands** eligible. But most are *not* menu-worthy.

---

## 2. What makes a command menu-worthy?

A command belongs in a menu when **all** of these apply:

1. **User-facing**: it does something a person would deliberately invoke
   (not internal plumbing like `editor.cancelOperation`)
2. **Not already prominent**: it isn't already a primary keyboard shortcut
   every user knows (Ctrl+C, Ctrl+V, Ctrl+Z) — *unless* we are grouping
   related items and it would be strange to omit it
3. **Not already in a pulldown menu**: if the command already appears in
   a VS Code built-in pulldown menu (File, Edit, Selection, View, Go,
   Run, Terminal, Help) or is placed by text-toolkit's Edit submenus,
   we do **not** re-add it — unless it fits naturally in a language-
   specific context where re-exposure adds discoverability
4. **Discoverable value**: putting it in a menu helps people *find* it
   — niche commands nobody looks for (e.g. `editor.action.debugEditorGpuRenderer`)
   are not worth menu real-estate
5. **Contextually relevant**: it makes sense in the context where the
   menu appears (language-specific commands only show for that language)

### What we explicitly skip

- **~1 200 workbench plumbing** — focus/navigate/layout commands
  (`focusAboveGroup`, `moveEditorToRightGroup`, `editorLayoutTwoRows`, …)
- **~190 chat/copilot** — already have their own panel + inline UX
- **~146 terminal internal** — terminal has its own context menus
- **~135 notebook cell** — notebook has its own toolbar system
- **~76 testing internal** — test explorer has its own UX
- **~40 list/tree** — widget internals
- **~32 output channels** — `output.show.*` dynamic commands
- **Quick-input / quick-open internals** — `quickOpenNavigateNext` etc.
- **Theme/icon selectors** — one-shot commands with existing UI

**Estimated menu-worthy commands: 300–400** (roughly 10–12% of total).

---

## 3. Menu placement strategy

### 3a. File-format menus (top-level, conditional)

Each file-format menu is a **top-level menu bar item** that only appears
when a file of that type is active. Position: **after View** (order ~7).

| Menu file                 | `when` condition                  | Languages / extensions covered |
|---------------------------|-----------------------------------|-------------------------------|
| `markdown.menu.yaml`      | `editorLangId == markdown`        | md-language-features, markdown-menu, mermaid-chat |
| `yaml.menu.yaml`          | `editorLangId == yaml`            | (already exists)              |
| `json.menu.yaml`          | `editorLangId == json \|\| editorLangId == jsonc` | json-language-features |
| `typescript.menu.yaml`    | `editorLangId == typescript \|\| editorLangId == typescriptreact` | ts-language-features, references-view |
| `javascript.menu.yaml`    | `editorLangId == javascript \|\| editorLangId == javascriptreact` | ts-language-features, references-view |
| `html.menu.yaml`          | `editorLangId == html`            | emmet, html-language-features |
| `css.menu.yaml`           | `editorLangId == css \|\| editorLangId == scss \|\| editorLangId == less` | emmet, css-language-features |
| `notebook.menu.yaml`      | *(notebook active)*               | ipynb, notebook cells         |

> **Naming**: Because multiple language menus can appear in split editors,
> use the **language name** as the menu title: "Markdown", "YAML", "JSON",
> "TypeScript", "JavaScript", "HTML", "CSS".
>
> **Within** each language menu, subsection titles do NOT need the language
> prefix (e.g. "Debug Tools" not "TypeScript Debug Tools") because the
> parent menu already establishes context.

### 3b. Injection into existing menus

Instead of new top-level items, some commands fit better injected into
VS Code's built-in menus:

| Target menu          | What to inject                        | Menu YAML file          |
|----------------------|---------------------------------------|-------------------------|
| **Edit → Paste Special** (new submenu) | `editor.action.pasteAs`, paste-as-text, clipboard-to-yaml, image-to-link, etc. | `edit-enhancements.menu.yaml` |
| **Edit → Encode / Decode** (new submenu) | Base64, URL-encode, HTML-encode, Unicode escapes | `edit-enhancements.menu.yaml` |

> **Note:** The `text-toolkit` extension (now fixed in product.json)
> already builds **10 submenus** under Edit → group `9_text`:
> Convert Case, Line Operations, Sort, EOL Conversion, Blank Operations,
> Copy Filename, Line Filtering, Sequence & Numbering, Join/Split,
> Alignment. The `edit-enhancements.menu.yaml` deliberately avoids
> duplicating those and focuses on what text-toolkit does not cover.
| **Go → Debug** (new group) | Start/stop debugging, step, breakpoints | `go-enhancements.menu.yaml` |
| **Go → Build & Run** (new group) | `workbench.action.tasks.build`, run task, project-build commands | `go-enhancements.menu.yaml` |
| **Go → Testing** (new group) | Run/debug tests, coverage | `go-enhancements.menu.yaml` |

> **Note:** Build & debug commands for specific languages mostly come
> from marketplace extensions (e.g. C++ debugger, Java build tools).
> The `go-enhancements.menu.yaml` covers only the generic VS Code
> debug/test/task framework, not language-specific toolchains.
| **View → Folding** (new group) | Fold all/unfold/level commands | `view-enhancements.menu.yaml` |

### 3c. Non-command items

These are items that use `snippet`, `url`, `clipboard`, `chat`, or
`shell` actions rather than plain commands:

| Category          | Examples                               | Where                    |
|-------------------|----------------------------------------|--------------------------|
| **Snippets**      | Insert YAML template, JSON schema boilerplate, common patterns | Language-specific menus |
| **URLs**          | Language spec links, common docs        | Language-specific menus (Help section) |
| **Chat prompts**  | "Explain this file", "Validate", "Convert" | Language-specific menus (AI section) |
| **Shell actions** | Run linter, run formatter script       | Language-specific menus (Tools section) |

---

## 4. File structure

```
.vscode/menus/vscode-native/
├── README.md                    # This plan + conventions
│
│   ── File-format menus (top-level, conditional) ──
├── markdown.menu.yaml
├── yaml.menu.yaml               # migrated from ../yaml.menu.yaml
├── json.menu.yaml
├── typescript.menu.yaml
├── javascript.menu.yaml
├── html-css.menu.yaml           # HTML + CSS + Emmet combined
├── notebook.menu.yaml
│
│   ── Injections into existing menus ──
├── edit-enhancements.menu.yaml  # Paste Special, Transforms, Whitespace
├── go-enhancements.menu.yaml    # Debug, Build/Run, Testing
├── view-enhancements.menu.yaml  # Folding, layout shortcuts
│
│   ── Cross-cutting ──
└── git.menu.yaml                # Git operations (top-level, ~50 commands)
```

> **Dropped from plan:** `search.menu.yaml` (Find/Replace already in Edit menu,
> remaining search commands are internal to the search sidebar) and
> `editor-context.menu.yaml` (would conflict with VS Code's built-in context
> menu system).

---

## 5. Standard section template for language menus

Each language menu YAML should follow this consistent section order:

```yaml
items:
  # 1_convert    — Format conversions (to/from other formats)
  # 2_format     — Formatting, indentation, whitespace
  # 3_navigate   — Go-to, symbols, references
  # 4_refactor   — Rename, extract, code actions
  # 5_lint       — Validation, linting, diagnostics
  # 6_snippets   — Insert templates / boilerplate
  # 7_tools      — Shell commands, external tools
  # 8_ai         — Chat/AI-assisted actions (when copilot installed)
  # 9_help       — Documentation URLs, language references
```

Groups may be omitted if empty for that language.

---

## 6. Processing approach — how to build these files

### Phase 1: Bootstrap ✅
1. ✅ Dump all commands
2. ✅ Identify internal vs external
3. ✅ Analyze command domains
4. ✅ Create this plan
5. ✅ Get user buy-in

### Phase 2: Build language menus ✅
- ✅ typescript.menu.yaml (32 items)
- ✅ javascript.menu.yaml (28 items)
- ✅ json.menu.yaml (15 items)
- ✅ html-css.menu.yaml (32 items)
- ✅ markdown.menu.yaml (27 items)
- ✅ yaml.menu.yaml (18 items)
- ✅ notebook.menu.yaml (42 items)

### Phase 3: Build injection & cross-cutting menus ✅
- ✅ edit-enhancements.menu.yaml (11 items: Paste Special, Selections)
- ✅ go-enhancements.menu.yaml (18 items: Testing, Build & Tasks)
- ✅ view-enhancements.menu.yaml (25 items: Folding, Display)
- ✅ git.menu.yaml (50 items: commit, branch, remote, stash, tags, view, repo)

### Phase 4: Polish
1. ⬜ Run `menuLoader.dumpAll` to regenerate cache
2. ⬜ Review menu-tree.md for visual structure check
3. ⬜ Test menus visually in Code OSS
4. ✅ Update menu-loader skill with new patterns

---

## 7. Key design decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Language menu position | After View (order ~7) | Easy to find, doesn't push built-in menus around |
| Debug/Build in Go menu | ✅ Yes — as subsections of Go | Not enough commands for dedicated top-level menus; Go is the logic "navigation" menu |
| Language name in menu title | ✅ Always | Split editors can show 2+ language menus simultaneously |
| Language name in *subsection* titles | ❌ No | Parent menu provides context |
| Paste Special under Edit | ✅ Yes | Natural grouping, high discoverability |
| Text transforms under Edit | ✅ Yes | They are editing operations |
| Folding under View | ✅ Yes | Folding is a view configuration |
| Git as separate menu | ✅ Yes — top-level | 183 commands warrant a dedicated top-level menu; curated to ~50 most-used |
| AI/Chat sections | Only in language menus | Generic chat is already in sidebar; language-specific prompts add value |

---

## 8. Estimated scope per file

| File                        | Est. commands | Sections |
|-----------------------------|---------------|----------|
| markdown.menu.yaml          | 27            | preview, insert (snippets), format, navigate, ai |
| yaml.menu.yaml              | 18            | format, fold, navigate, convert, ai |
| json.menu.yaml              | 15            | validate, format, navigate, convert, ai |
| typescript.menu.yaml        | 32            | imports, navigate, refactor, format, server, ai |
| javascript.menu.yaml        | 28            | imports, navigate, refactor, format, project, ai |
| html-css.menu.yaml          | 32            | emmet (tags, nav, values), format, navigate, ai |
| notebook.menu.yaml          | 42            | run, insert, cell ops, output, view, ai |
| edit-enhancements.menu.yaml | 11            | paste-special, selections |
| go-enhancements.menu.yaml   | 18            | testing, build & tasks |
| view-enhancements.menu.yaml | 25            | folding (19), display (6) |
| git.menu.yaml               | 50            | commit, branch, remote, stash, tags, view, repo |

**Total: ~298 items across 11 files.**
