# Using VS Code Extension Points

This guide covers how to create VS Code extensions using the existing extension API and contribution points. It is based on the official VS Code documentation and the patterns found in the VS Code codebase.

## Table of Contents

- [Getting Started](#getting-started)
- [Extension Anatomy](#extension-anatomy)
- [Contribution Points](#contribution-points)
- [Extension API (`vscode` Namespace)](#extension-api-vscode-namespace)
- [Activation Events](#activation-events)
- [Common Extension Patterns](#common-extension-patterns)

---

## Getting Started

### Prerequisites

- Node.js (LTS version)
- VS Code
- Yeoman scaffolder: `npm install -g yo generator-code`

### Creating Your First Extension

```bash
yo code
```

This scaffolds a new TypeScript extension project with:

```
my-extension/
├── .vscode/
│   ├── launch.json       # Debug configuration
│   └── tasks.json        # Build tasks
├── src/
│   └── extension.ts      # Entry point
├── package.json           # Extension manifest
├── tsconfig.json          # TypeScript configuration
└── README.md
```

### Extension Entry Point

Every extension has an `activate()` function called when the extension is activated:

```typescript
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    // Register commands, providers, listeners, etc.
    const disposable = vscode.commands.registerCommand('myExtension.helloWorld', () => {
        vscode.window.showInformationMessage('Hello World!');
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {
    // Cleanup resources
}
```

---

## Extension Anatomy

### `package.json` — The Extension Manifest

The `package.json` file is the heart of every extension. It declares:

| Field | Purpose |
|-------|---------|
| `name` | Extension identifier |
| `publisher` | Publisher name |
| `engines.vscode` | Minimum VS Code version required |
| `main` | Entry point module (e.g., `./out/extension.js`) |
| `activationEvents` | When the extension should be activated |
| `contributes` | Static declarations (contribution points) |
| `enabledApiProposals` | Proposed APIs the extension uses (internal only) |

**Example:**

```json
{
  "name": "my-extension",
  "publisher": "my-publisher",
  "version": "0.0.1",
  "engines": {
    "vscode": "^1.80.0"
  },
  "main": "./out/extension.js",
  "activationEvents": [],
  "contributes": {
    "commands": [
      {
        "command": "myExtension.helloWorld",
        "title": "Hello World"
      }
    ]
  }
}
```

---

## Contribution Points

Contribution points are **static JSON declarations** in `package.json` that extend VS Code's UI and behavior without writing code. They are validated against JSON schemas at extension load time.

### Commands

Register commands that appear in the Command Palette:

```json
"contributes": {
  "commands": [
    {
      "command": "myExtension.doSomething",
      "title": "Do Something",
      "category": "My Extension",
      "icon": "$(zap)"
    }
  ]
}
```

### Menus

Place commands in specific menus:

```json
"contributes": {
  "menus": {
    "editor/context": [
      {
        "command": "myExtension.doSomething",
        "when": "editorHasSelection",
        "group": "1_modification"
      }
    ],
    "view/title": [
      {
        "command": "myExtension.refresh",
        "when": "view == myView",
        "group": "navigation"
      }
    ]
  }
}
```

**Available menu locations include:**
- `commandPalette` — Command Palette
- `editor/context` — Editor right-click menu
- `editor/title` — Editor title bar
- `explorer/context` — File Explorer right-click menu
- `view/title` — View title area
- `view/item/context` — Tree item context menu
- `scm/title` — Source Control title
- `debug/callstack/context` — Debug call stack

### Views and View Containers

Add custom sidebar panels and tree views:

```json
"contributes": {
  "viewsContainers": {
    "activitybar": [
      {
        "id": "my-sidebar",
        "title": "My Extension",
        "icon": "resources/icon.svg"
      }
    ]
  },
  "views": {
    "my-sidebar": [
      {
        "id": "myView",
        "name": "My View",
        "when": "myExtension.enabled",
        "icon": "$(list-tree)"
      }
    ]
  },
  "viewsWelcome": [
    {
      "view": "myView",
      "contents": "No items found.\n[Get Started](command:myExtension.init)"
    }
  ]
}
```

### Configuration (Settings)

Declare extension settings:

```json
"contributes": {
  "configuration": {
    "title": "My Extension",
    "properties": {
      "myExtension.enable": {
        "type": "boolean",
        "default": true,
        "description": "Enable the extension."
      },
      "myExtension.maxItems": {
        "type": "number",
        "default": 10,
        "minimum": 1,
        "maximum": 100,
        "description": "Maximum number of items to display."
      },
      "myExtension.mode": {
        "type": "string",
        "default": "auto",
        "enum": ["auto", "manual", "disabled"],
        "enumDescriptions": [
          "Automatically detect mode",
          "Manually configure mode",
          "Disable the feature"
        ]
      }
    }
  }
}
```

### Keybindings

Register keyboard shortcuts:

```json
"contributes": {
  "keybindings": [
    {
      "command": "myExtension.doSomething",
      "key": "ctrl+shift+p",
      "mac": "cmd+shift+p",
      "when": "editorTextFocus"
    }
  ]
}
```

### Languages

Declare a new language:

```json
"contributes": {
  "languages": [
    {
      "id": "mylang",
      "aliases": ["My Language", "mylang"],
      "extensions": [".mylang", ".ml"],
      "configuration": "./language-configuration.json"
    }
  ],
  "grammars": [
    {
      "language": "mylang",
      "scopeName": "source.mylang",
      "path": "./syntaxes/mylang.tmLanguage.json"
    }
  ]
}
```

### Themes

Contribute color themes:

```json
"contributes": {
  "themes": [
    {
      "label": "My Dark Theme",
      "uiTheme": "vs-dark",
      "path": "./themes/my-dark-theme.json"
    }
  ],
  "iconThemes": [
    {
      "id": "my-icons",
      "label": "My Icon Theme",
      "path": "./icons/icon-theme.json"
    }
  ]
}
```

### Debuggers

Add debug adapter support:

```json
"contributes": {
  "debuggers": [
    {
      "type": "myDebugger",
      "label": "My Debugger",
      "program": "./out/debugAdapter.js",
      "runtime": "node",
      "configurationAttributes": {
        "launch": {
          "required": ["program"],
          "properties": {
            "program": {
              "type": "string",
              "description": "Path to the program to debug"
            }
          }
        }
      }
    }
  ]
}
```

### Task Definitions

```json
"contributes": {
  "taskDefinitions": [
    {
      "type": "myTask",
      "required": ["task"],
      "properties": {
        "task": {
          "type": "string",
          "description": "The task to execute"
        }
      }
    }
  ]
}
```

### Custom Editors

```json
"contributes": {
  "customEditors": [
    {
      "viewType": "myExtension.catEditor",
      "displayName": "Cat Editor",
      "selector": [
        {
          "filenamePattern": "*.cat"
        }
      ]
    }
  ]
}
```

### Notebooks

```json
"contributes": {
  "notebooks": [
    {
      "type": "my-notebook",
      "displayName": "My Notebook",
      "selector": [
        {
          "filenamePattern": "*.mynotebook"
        }
      ]
    }
  ]
}
```

### Walkthroughs (Getting Started)

```json
"contributes": {
  "walkthroughs": [
    {
      "id": "myExtension.gettingStarted",
      "title": "Get Started with My Extension",
      "description": "Learn how to use My Extension",
      "steps": [
        {
          "id": "openPanel",
          "title": "Open the Panel",
          "description": "Click here to open the panel.\n[Open Panel](command:myExtension.openPanel)",
          "media": {
            "image": "resources/walkthrough-1.png",
            "altText": "Opening the panel"
          }
        }
      ]
    }
  ]
}
```

### Authentication Providers

```json
"contributes": {
  "authentication": [
    {
      "id": "myAuth",
      "label": "My Authentication"
    }
  ]
}
```

### Chat Participants (AI Features)

```json
"contributes": {
  "chatParticipants": [
    {
      "id": "myExtension.myAgent",
      "fullName": "My Agent",
      "name": "myagent",
      "description": "An AI assistant for my domain",
      "isSticky": true
    }
  ]
}
```

### Language Model Tools

```json
"contributes": {
  "languageModelTools": [
    {
      "name": "my-tool",
      "displayName": "My Tool",
      "modelDescription": "A tool that does something useful",
      "inputSchema": {
        "type": "object",
        "properties": {
          "query": {
            "type": "string",
            "description": "The search query"
          }
        },
        "required": ["query"]
      }
    }
  ]
}
```

---

## Extension API (`vscode` Namespace)

The runtime Extension API is accessed via `import * as vscode from 'vscode'`. Here are the main API categories:

### Commands

```typescript
// Register a command
const disposable = vscode.commands.registerCommand('myCmd', (args) => {
    // handler
});

// Execute a command
const result = await vscode.commands.executeCommand('vscode.openFolder', uri);

// Get all commands
const commands = await vscode.commands.getCommands();
```

### Window (UI)

```typescript
// Show messages
vscode.window.showInformationMessage('Info');
vscode.window.showWarningMessage('Warning');
vscode.window.showErrorMessage('Error', 'Retry', 'Cancel').then(choice => { });

// Input
const value = await vscode.window.showInputBox({ prompt: 'Enter name' });

// Quick Pick
const item = await vscode.window.showQuickPick(['Option 1', 'Option 2'], {
    placeHolder: 'Select option'
});

// Status Bar
const statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
statusItem.text = '$(sync~spin) Syncing...';
statusItem.show();

// Progress
await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: 'Processing...',
    cancellable: true
}, async (progress, token) => {
    progress.report({ increment: 50, message: 'Halfway done' });
});

// Tree View
const treeView = vscode.window.createTreeView('myView', {
    treeDataProvider: myTreeDataProvider,
    showCollapseAll: true
});

// Webview Panel
const panel = vscode.window.createWebviewPanel('myWebview', 'My Panel',
    vscode.ViewColumn.One, { enableScripts: true });
panel.webview.html = '<html>...</html>';
```

### Workspace

```typescript
// Configuration
const config = vscode.workspace.getConfiguration('myExtension');
const value = config.get<string>('setting');
await config.update('setting', 'newValue', vscode.ConfigurationTarget.Global);

// File system
const files = await vscode.workspace.findFiles('**/*.ts', '**/node_modules/**');
const document = await vscode.workspace.openTextDocument(uri);

// Events
vscode.workspace.onDidChangeTextDocument(event => { });
vscode.workspace.onDidSaveTextDocument(doc => { });
vscode.workspace.onDidChangeConfiguration(event => { });

// File watchers
const watcher = vscode.workspace.createFileSystemWatcher('**/*.json');
watcher.onDidChange(uri => { });
watcher.onDidCreate(uri => { });
watcher.onDidDelete(uri => { });
```

### Language Features (Providers)

```typescript
// Completion
vscode.languages.registerCompletionItemProvider('javascript', {
    provideCompletionItems(document, position, token, context) {
        return [new vscode.CompletionItem('mySnippet', vscode.CompletionItemKind.Snippet)];
    }
});

// Hover
vscode.languages.registerHoverProvider('javascript', {
    provideHover(document, position, token) {
        return new vscode.Hover('Documentation here');
    }
});

// Diagnostics
const diagnostics = vscode.languages.createDiagnosticCollection('myExtension');
diagnostics.set(document.uri, [
    new vscode.Diagnostic(range, 'Error message', vscode.DiagnosticSeverity.Error)
]);

// Code Actions
vscode.languages.registerCodeActionsProvider('javascript', {
    provideCodeActions(document, range, context, token) {
        const fix = new vscode.CodeAction('Fix issue', vscode.CodeActionKind.QuickFix);
        fix.edit = new vscode.WorkspaceEdit();
        fix.edit.replace(document.uri, range, 'corrected');
        return [fix];
    }
});

// Definition Provider
vscode.languages.registerDefinitionProvider('javascript', {
    provideDefinition(document, position, token) {
        return new vscode.Location(uri, new vscode.Position(0, 0));
    }
});

// Document Formatting
vscode.languages.registerDocumentFormattingEditProvider('javascript', {
    provideDocumentFormattingEdits(document, options, token) {
        return [vscode.TextEdit.replace(range, formatted)];
    }
});
```

### Debug

```typescript
// Start debugging
await vscode.debug.startDebugging(workspaceFolder, {
    type: 'node',
    request: 'launch',
    name: 'Debug',
    program: '${workspaceFolder}/app.js'
});

// Debug events
vscode.debug.onDidStartDebugSession(session => { });
vscode.debug.onDidTerminateDebugSession(session => { });

// Register debug adapter
vscode.debug.registerDebugAdapterDescriptorFactory('myDebugger', {
    createDebugAdapterDescriptor(session, executable) {
        return new vscode.DebugAdapterServer(port);
    }
});
```

### Source Control

```typescript
const scm = vscode.scm.createSourceControl('myScm', 'My SCM');
const changes = scm.createResourceGroup('changes', 'Changes');
changes.resourceStates = [
    { resourceUri: uri, decorations: { tooltip: 'Modified' } }
];
```

### Tasks

```typescript
vscode.tasks.registerTaskProvider('myTask', {
    provideTasks(token) {
        const task = new vscode.Task(
            { type: 'myTask', task: 'build' },
            vscode.TaskScope.Workspace,
            'build', 'myExtension',
            new vscode.ShellExecution('npm run build')
        );
        return [task];
    },
    resolveTask(task, token) {
        return task;
    }
});
```

### Authentication

```typescript
// Get auth session
const session = await vscode.authentication.getSession('github', ['repo'], {
    createIfNone: true
});
console.log(session.accessToken);

// Register auth provider
vscode.authentication.registerAuthenticationProvider('myAuth', 'My Auth', {
    getSessions(scopes) { /* ... */ },
    createSession(scopes) { /* ... */ },
    removeSession(sessionId) { /* ... */ },
    onDidChangeSessions: onDidChangeSessionsEmitter.event
});
```

---

## Activation Events

Extensions are lazily activated. Activation events control when `activate()` is called:

| Event | Trigger |
|-------|---------|
| `onCommand:myExtension.cmd` | When a command is executed |
| `onLanguage:javascript` | When a file of that language opens |
| `onView:myView` | When a view becomes visible |
| `onUri` | When a URI handler is triggered |
| `onDebug` | When a debug session starts |
| `onDebugResolve:type` | When a debug configuration resolves |
| `onCustomEditor:viewType` | When a custom editor opens |
| `onNotebook:type` | When a notebook of that type opens |
| `onTaskType:myTask` | When a task of that type is needed |
| `onAuthenticationRequest:myAuth` | When authentication is requested |
| `onWalkthrough:myWalkthrough` | When a walkthrough opens |
| `onChatParticipant:name` | When a chat participant is invoked |
| `onLanguageModelTool:name` | When a language model tool is invoked |
| `onStartupFinished` | After VS Code finishes startup |
| `*` | On VS Code start (avoid — slows startup) |

> **Note:** Most activation events are now **implicitly generated** from contribution points. For example, declaring a command in `contributes.commands` automatically generates `onCommand:` events. You usually don't need to list them explicitly.

---

## Common Extension Patterns

### TreeDataProvider Pattern

```typescript
class MyTreeDataProvider implements vscode.TreeDataProvider<MyItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<MyItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    getTreeItem(element: MyItem): vscode.TreeItem {
        return {
            label: element.name,
            collapsibleState: element.children.length > 0
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None,
            command: { command: 'myExtension.select', title: 'Select', arguments: [element] }
        };
    }

    getChildren(element?: MyItem): MyItem[] {
        if (!element) {
            return this.rootItems;
        }
        return element.children;
    }

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }
}
```

### Webview Pattern

```typescript
class MyWebviewProvider implements vscode.WebviewViewProvider {
    resolveWebviewView(webviewView: vscode.WebviewView) {
        webviewView.webview.options = { enableScripts: true };
        webviewView.webview.html = this.getHtml(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(message => {
            switch (message.command) {
                case 'doSomething':
                    // handle
                    break;
            }
        });
    }

    private getHtml(webview: vscode.Webview): string {
        return `<!DOCTYPE html>
        <html>
        <body>
            <button onclick="vscode.postMessage({command: 'doSomething'})">Click</button>
            <script>const vscode = acquireVsCodeApi();</script>
        </body>
        </html>`;
    }
}
```

### Disposable Management Pattern

```typescript
export function activate(context: vscode.ExtensionContext) {
    // All disposables should be pushed to context.subscriptions
    // They are automatically disposed when the extension is deactivated

    context.subscriptions.push(
        vscode.commands.registerCommand('myCmd', handler),
        vscode.workspace.onDidChangeConfiguration(onConfigChange),
        vscode.languages.registerHoverProvider('js', hoverProvider),
        statusBarItem,
        treeView
    );
}
```

---

## Proposed APIs

Some APIs are experimental and gated behind the `enabledApiProposals` field. These are only available to built-in extensions or extensions in development.

```json
{
  "enabledApiProposals": ["chatParticipantAdditions", "languageModelSystem"]
}
```

Proposed API type definitions live in `src/vscode-dts/vscode.proposed.*.d.ts`. See [Learnings & Guidelines](../guidelines.md) for how to create new proposed APIs.

---

## Further Reading

- [VS Code Extension API Reference](https://code.visualstudio.com/api/references/vscode-api)
- [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)
- [Extension Capabilities](https://code.visualstudio.com/api/extension-capabilities/overview)
- [Contribution Points Catalog](./contribution-points-catalog.md) — Complete reference of all contribution points
- [Learnings & Guidelines](../guidelines.md) — Architecture and implementation patterns
