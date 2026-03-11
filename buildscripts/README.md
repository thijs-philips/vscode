# Buildscripts

Batch scripts for building and running Code - OSS on Windows.

## Quick Reference

| Script | Purpose |
|--------|---------|
| `prebuild.bat` | One-time setup: `npm ci`, download Electron, rebuild native modules |
| `build.bat` | Dev compile: core TypeScript + extensions + Copilot Vision patch |
| `build-core.bat` | Compile only core TypeScript (`src/`) |
| `build-extensions.bat` | Compile only built-in extensions (`extensions/`) |
| `run.bat` | Launch Code - OSS in dev mode (via Electron from `node_modules`) |
| `build-production.bat` | Full production build: standalone app + Windows installer |
| `publish-release.bat` | Production build + publish installer to GitHub Releases |

## Typical Workflows

### First time setup
```
prebuild.bat
build.bat
run.bat
```

### Daily development
```
build.bat          (or build-core.bat / build-extensions.bat)
run.bat
```

### Ship a release
```
publish-release.bat
```
This builds the app, creates a Windows installer via Inno Setup, then uploads
it to GitHub Releases. The embedded update server in Code - OSS checks these
releases to offer silent auto-updates.

## Output Locations

| Artifact | Path |
|----------|------|
| Dev output | `out/` |
| Standalone app | `../VSCode-win32-x64/Code - OSS.exe` |
| Installer | `.build/win32-x64/user-setup/CodeOSSSetup.exe` |

## How Auto-Updates Work

Code - OSS includes an embedded HTTP server (`localUpdateServer.ts`) on
`127.0.0.1:58241` that translates GitHub Releases into the VS Code update
protocol. The built-in `Win32UpdateService` checks this server periodically
(30 s after startup, then every hour).

When a new release is found:
1. The update server fetches the latest GitHub release (tag `v{version}-{commit}`)
2. It validates the SHA-256 checksum from the `.sha256` asset
3. `Win32UpdateService` downloads the installer through the local proxy
4. The installer runs silently (`/verysilent /nocloseapplications`)
5. The user sees "Restart to Update" in the title bar

The installer uploaded by `publish-release.bat` is the same one that the
update service downloads and runs silently — there is no separate update
package.
