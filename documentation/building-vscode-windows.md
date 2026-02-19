# Building VS Code from Source (Windows)

## Prerequisites

1. **Node.js v22.22.0+** — install via [fnm](https://github.com/Schniz/fnm):

   ```powershell
   winget install Schniz.fnm
   fnm install
   fnm use
   node --version   # must be 22.22.0+
   ```

2. **Python 3.x** — must be in PATH (`python --version`)

3. **Visual Studio Build Tools 2022** — install via Visual Studio Installer with:
   - **Desktop development with C++** workload
   - MSVC v143 Spectre-mitigated libs
   - C++ ATL with Spectre Mitigations
   - C++ MFC with Spectre Mitigations

## Build Steps

### 1. Install dependencies

```powershell
npm install
```

### 2. Start the build (watch mode)

Use the VS Code task **"VS Code - Build"**, or run manually:

```powershell
npm run watch
```

This runs three parallel tasks:
- **Core - Transpile** — incremental TypeScript transpilation
- **Core - Typecheck** — type checking
- **Ext - Build** — built-in extensions

> **Tip**: If you're only working on core source (`src/`), skip extensions and run just:
> ```powershell
> npm run watch-client-transpiled
> npm run watch-clientd
> ```

### 3. Launch

```powershell
.\scripts\code.bat
```

This downloads Electron (first time) and starts **Code - OSS**.

## Building a Single Extension

Instead of the full Ext - Build, compile one extension directly:

```powershell
node node_modules\typescript\bin\tsc -p extensions\<extension-name>\tsconfig.json
```

Add `--watch` for incremental rebuilds.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `ERR_UNKNOWN_FILE_EXTENSION ".ts"` | Upgrade Node to v22.22.0+ |
| `EBUSY` / Electron lock errors | Close all Code - OSS instances, delete `.build\electron`, run `npm run electron` |
| `Cannot find module vscode-sqlite3.node` | Run `node build/npm/postinstall.ts` |
| `Error MSB8040` (Spectre libs) | Install the Spectre-mitigated components in VS Build Tools |
