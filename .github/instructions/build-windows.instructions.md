```instructions
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
```

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

### Launch VS Code

```powershell
.\scripts\code.bat
```

## Troubleshooting

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

1. Check for compilation errors in the **"VS Code - Build"** task output
2. Run `.\scripts\code.bat` and verify VS Code launches
3. Check Developer Tools (Help > Toggle Developer Tools) console for errors

```
