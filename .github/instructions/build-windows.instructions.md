````instructions
---
description: Guidelines for building VS Code from source on Windows
---

## Prerequisites

### Node.js v22.22.0+

The required Node.js version is specified in `.nvmrc`. Use **fnm** (Fast Node Manager) for version management:

```powershell
# Install fnm
winget install Schniz.fnm

# Add to PowerShell profile for persistence across sessions
fnm env --use-on-cd --shell power-shell | Out-String | Add-Content -Path $PROFILE

# Reload VS Code to pick up profile changes, then:
fnm install
fnm use
````

**Common Pitfall**: Node v22.14.0 or earlier causes `ERR_UNKNOWN_FILE_EXTENSION ".ts"` errors. Ensure you have v22.22.0+ which has native TypeScript support.

### Python 3.x

Required for `node-gyp` native module compilation. Python must be in PATH.

```powershell
python --version  # Should show 3.x
```

### Visual Studio Build Tools 2022

Install via Visual Studio Installer with these **required components**:

1. **Desktop development with C++** workload
2. **Individual Components** (critical for native modules):
   - MSVC v143 - VS 2022 C++ x64/x86 Spectre-mitigated libs (Latest)
   - C++ ATL for latest v143 build tools with Spectre Mitigations (x86 & x64)
   - C++ MFC for latest v143 build tools with Spectre Mitigations (x86 & x64)

**Error MSB8040**: If you see "Spectre-mitigated libraries are required", install these components.

## Building

### Install Dependencies

```powershell
npm install
```

This compiles native modules including `@vscode/sqlite3`, `node-pty`, `@parcel/watcher`, and `native-is-elevated`.

### Start Watch Mode Build

Use the VS Code task **"VS Code - Build"** which runs:

- Core - Transpile (incremental TypeScript transpilation)
- Core - Typecheck (type checking)
- Ext - Build (built-in extensions)

Or run manually:

```powershell
npm run watch
```

**Performance Tip**: The **Ext - Build** task (built-in extensions) is very time-consuming and only needs to run when you are modifying code inside the `extensions/` folder. If you are only working on core VS Code source (`src/`), you can skip it and run only the core tasks individually:

```powershell
# Run only core transpilation and type checking (much faster)
npm run watch-client-transpiled   # Core - Transpile
npm run watch-clientd             # Core - Typecheck
```

Or start just the individual VS Code tasks **"Core - Transpile"** and **"Core - Typecheck"** instead of the combined **"VS Code - Build"** task. Only add **"Ext - Build"** (`npm run watch-extensionsd`) when you need to build or modify built-in extensions.

### Launch VS Code

```powershell
.\scripts\code.bat
```

### Building a Single Extension

When working on a single built-in extension (e.g. `extensions/markdown-menu/`), you don't need the full **Ext - Build** task. Compile just your extension directly:

```powershell
node node_modules\typescript\bin\tsc -p extensions\<extension-name>\tsconfig.json
```

This takes seconds instead of the minutes required by the full extensions build. Note that `npx tsc` won't work from within the `extensions/` subfolders because TypeScript is installed at the root `node_modules/`, not under `extensions/node_modules/`.

## Troubleshooting

### Electron Download / EBUSY Errors

The `scripts\code.bat` launcher and `npm run electron` download Electron to `.build\electron\`. If you see:

```
[Error: EBUSY: resource busy or locked, unlink '...\default_app.asar']
'".build\electron\Code - OSS.exe"' is not recognized as an internal or external command
```

This means a previous VS Code dev instance (or another process) is locking files in `.build\electron\`. To fix:

1. **Close all VS Code dev instances** (`Code - OSS` processes), or reboot if the lock persists
2. **Delete the broken Electron directory**:

```powershell
Remove-Item ".build\electron" -Recurse -Force
```

3. **Re-download Electron**:

```powershell
npm run electron
```

4. **Verify** the binary exists:

```powershell
Test-Path ".build\electron\Code - OSS.exe"  # Should return True
```

Then `.\scripts\code.bat` will work again.

**Tip**: The `Code - OSS.exe` binary is distinct from your regular VS Code (`Code.exe`). When checking for locking processes, look specifically for `Code - OSS` in Task Manager or via `Get-Process`.

### Native Module Errors

If VS Code fails to launch with errors like `Cannot find module vscode-sqlite3.node`:

```powershell
node build/npm/postinstall.ts
```

This rebuilds native modules using Electron's Node headers.

### Copilot and Marketplace in Code-OSS

Code-OSS (the open-source build) requires `product.json` configuration for:

1. **Extension Marketplace Access** - Add `extensionsGallery`:

```json
"extensionsGallery": {
    "serviceUrl": "https://marketplace.visualstudio.com/_apis/public/gallery",
    "itemUrl": "https://marketplace.visualstudio.com/items",
    "cacheUrl": "https://vscode.blob.core.windows.net/gallery/index",
    "controlUrl": ""
}
```

2. **Copilot Functionality** - Add `extensionEnabledApiProposals`:

```json
"extensionEnabledApiProposals": {
    "GitHub.copilot": [
        "inlineCompletionsAdditions"
    ],
    "GitHub.copilot-chat": [
        "chatParticipantAdditions",
        "chatProvider",
        "chatVariableResolver",
        "defaultChatParticipant",
        "devDeviceId",
        "editorInsets",
        "findFiles2New",
        "inlineCompletionsAdditions",
        "interactive",
        "interactiveUserActions",
        "mappedEditsProvider",
        "languageModels",
        "languageModelsCustomizations",
        "languageModelsSystem",
        "lmTools",
        "textSearchProvider",
        "aiRelatedInformation",
        "portsAttributes",
        "quickPickSortByLabel",
        "terminalDataWriteEvent",
        "terminalExecuteCommandEvent",
        "terminalSelection",
        "terminalQuickFixProvider",
        "chatParticipantPrivate",
        "embeddings"
    ]
}
```

**Note**: The extension may request additional API proposals in future versions. Check the error message for missing proposals and add them to `product.json`.

### fnm Environment Not Persisting

If Node version resets between terminal sessions:

1. Add fnm to PowerShell profile:

```powershell
fnm env --use-on-cd --shell power-shell | Out-String | Add-Content -Path $PROFILE
```

2. **Reload VS Code completely** (not just the terminal) to pick up profile changes.

## Validation

1. Check for compilation errors in the **"VS Code - Build"** task output (or just **"Core - Typecheck"** if not modifying extensions)
2. Run `.\scripts\code.bat` and verify VS Code launches
3. Check Developer Tools (Help > Toggle Developer Tools) console for errors

## Developing Built-in Extensions with Proposed APIs

Built-in extensions live in `extensions/<name>/` and can use proposed APIs by declaring them in `package.json`:

```json
{
  "enabledApiProposals": ["proposalName"]
}
```

The extension's `tsconfig.json` must include the proposed API type definition:

```jsonc
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./out",
    "skipLibCheck": true
  },
  "include": [
    "src/**/*",
    "../../src/vscode-dts/vscode.d.ts",
    "../../src/vscode-dts/vscode.proposed.<proposalName>.d.ts"
  ]
}
```

Key notes:
- The base tsconfig at `extensions/tsconfig.base.json` uses `"module": "commonjs"` which is required for VS Code extensions
- Use `"skipLibCheck": true` to avoid errors from unrelated `@types` packages in the workspace root `node_modules/`
- Proposed API names must be registered in `src/vs/platform/extensions/common/extensionsApiProposals.ts` (auto-generated from `src/vscode-dts/vscode.proposed.*.d.ts` files)
- Extensions using `"activationEvents": ["*"]` activate eagerly on startup

```

```
