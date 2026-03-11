---
name: code-oss-build
description: Build, test, and release Code OSS on Windows. Use when asked to compile, build, run, release, publish, or update Code OSS. Covers dev builds, production builds, installer creation, GitHub release publishing, the auto-update system, and integration tests. Includes troubleshooting for common build failures like EBUSY locks and corrupt installers.
---

# Code OSS Build and Release

This skill covers how to build, test, and release the Code OSS fork on Windows. All build scripts live in `buildscripts/` and are Windows batch files.

## Build Modes

There are two distinct build modes with different purposes:

### 1. Development Build (fast iteration)

For editing and testing source code changes with fast feedback.

```
buildscripts\build.bat      # compile everything
buildscripts\run.bat        # launch Code OSS in dev mode
```

Or compile only what changed:

```
buildscripts\build-core.bat        # core TypeScript (src/) only
buildscripts\build-extensions.bat  # built-in extensions only
```

**Dev mode** runs from the `out/` directory using the Electron binary in `node_modules/`. Changes to TypeScript in `src/` are reflected after recompiling. This is the inner loop for feature development.

You can also use the VS Code tasks instead of batch files:
- **VS Code - Build** task: starts watch mode (auto-recompile on save)
- **Run Dev** task: launches Code OSS in dev mode

### 2. Production Build (standalone app + installer)

Creates a distributable standalone application and a Windows installer.

```
buildscripts\build-production.bat
```

This runs four steps:
1. `gulp vscode-win32-x64` - bundles Code OSS into `../VSCode-win32-x64/`
2. `node scripts/patch-copilot-vision.js` - patches Copilot Chat vision gating
3. `gulp vscode-win32-x64-inno-updater` - copies the inno_updater binary into `tools/`
4. `gulp vscode-win32-x64-user-setup` - builds the Windows installer via Inno Setup

**Output locations:**

| Artifact | Path |
|----------|------|
| Standalone app | `../VSCode-win32-x64/Code - OSS.exe` |
| Windows installer | `.build/win32-x64/user-setup/CodeOSSSetup.exe` |

## First Time Setup

If this is a fresh clone or after `package-lock.json` changes:

```
buildscripts\prebuild.bat
```

This installs npm dependencies, downloads Electron, and rebuilds native modules.

## Releasing

To build and publish an installer to GitHub Releases:

```
buildscripts\publish-release.bat
```

This runs the full production build, then calls `scripts/publish-release.js` which:
1. Computes the SHA-256 checksum of the installer
2. Creates a GitHub release tagged `v{version}-{commit12}` (e.g., `v1.112.0-a8472a3fba4c`)
3. Uploads `CodeOSSSetup-win32-x64-user.exe` and its `.sha256` checksum file

**Authentication:** Uses `GITHUB_TOKEN` environment variable, or falls back to the git credential helper for `github.com`.

**Important:** The commit must be pushed to GitHub before publishing. The release tag references the commit hash, and the update server fetches releases from the remote repository.

To publish without rebuilding (if you already have the installer):

```
node scripts/publish-release.js
```

## Auto-Update System

Code OSS includes an embedded HTTP server (`localUpdateServer.ts`) on `127.0.0.1:58241` that translates GitHub Releases into the VS Code update protocol.

The built-in `Win32UpdateService` checks this server periodically (30 seconds after startup, then every hour). When a newer release is found:
1. The local server fetches the latest GitHub release
2. It downloads the raw `.sha256` asset to get the checksum
3. The update service downloads the installer through the local proxy
4. The installer runs silently with `/verysilent /nocloseapplications`
5. The user sees "Restart to Update" in the title bar

**Configuration in `product.json`:**
- `updateUrl`: `"http://127.0.0.1:58241"` - where the update service connects
- `releaseRepository`: `{ "owner": "...", "repo": "..." }` - which GitHub repo to check
- `quality`: `"stable"` - the update channel

## Testing

### Sync Module Tests

Integration tests for the workspace/chat session sync module:

```powershell
npm run transpile-client
npx mocha --ui tdd --timeout 30000 "out/vs/code/test/electron-main/syncFromVSCode.integrationTest.js"
```

### General Unit Tests

```powershell
.\scripts\test.bat --grep "pattern"
```

### Type Checking

After making TypeScript changes under `src/`, validate types:

```powershell
npm run compile-check-ts-native
```

For extension changes under `extensions/`:

```powershell
npm run gulp compile-extensions
```

## Troubleshooting

### EBUSY / EPERM: Build output directory locked

**Symptom:** `gulp vscode-win32-x64` fails with EBUSY or EPERM errors on `../VSCode-win32-x64/`.

**Cause:** A running instance of Code OSS (from a previous production build) has files locked.

**Fix:** Ask the user to close Code OSS, then verify no processes remain:

```powershell
Get-Process | Where-Object { $_.Path -like "*VSCode-win32-x64*" } | Select-Object Id, ProcessName, Path
```

If processes are still running:

```powershell
Get-Process | Where-Object { $_.Path -like "*VSCode-win32-x64*" } | Stop-Process -Force
```

Wait a few seconds, then retry the build. **Always check for and resolve these locks before starting a production build.**

### Batch file only runs step 1

**Symptom:** `build-production.bat` appears to complete after only the first gulp step when run from a background terminal.

**Fix:** Run the remaining steps manually in sequence:

```powershell
node scripts/patch-copilot-vision.js
node_modules\.bin\gulp vscode-win32-x64-inno-updater
node_modules\.bin\gulp vscode-win32-x64-user-setup
```

### Installer too small (corrupt)

**Symptom:** Installer is much smaller than expected (e.g., 58 MB instead of ~150 MB).

**Cause:** The standalone app in `../VSCode-win32-x64/` was incomplete or stale.

**Fix:** Delete the output directory and rebuild from scratch:

```powershell
Remove-Item -Recurse -Force "..\VSCode-win32-x64"
node_modules\.bin\gulp vscode-win32-x64
node scripts/patch-copilot-vision.js
node_modules\.bin\gulp vscode-win32-x64-inno-updater
node_modules\.bin\gulp vscode-win32-x64-user-setup
```

Verify the installer is ~150 MB before publishing.

### GitHub release creation fails (502)

**Symptom:** `publish-release.js` returns a 502 error when creating the release.

**Cause:** The commit referenced in the release tag has not been pushed to GitHub.

**Fix:** Push first, then publish:

```powershell
git push origin main
node scripts/publish-release.js
```

### SHA-256 hash mismatch during update

**Symptom:** Code OSS reports a hash mismatch when checking for updates.

**Cause (historical):** The update server was using the GitHub JSON API to fetch the `.sha256` asset, which returns asset metadata (JSON) instead of the raw file content.

**Fix:** This was fixed by adding `githubDownloadAssetText()` in `localUpdateServer.ts` that uses `Accept: application/octet-stream` and follows the GitHub 302 redirect to get raw content. If you see this issue, ensure the installed Code OSS build includes this fix.

## Build Verification Checklist

Before declaring a production build complete:

1. **Installer size:** Verify `CodeOSSSetup.exe` is approximately 150 MB
2. **Commit pushed:** Ensure the HEAD commit is pushed to GitHub
3. **Release assets:** Check the GitHub release has both `.exe` and `.sha256` files
4. **Checksum valid:** The `.sha256` file should contain a 64-character hex string
