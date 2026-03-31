<#
.SYNOPSIS
    Snapshots the current Code OSS user settings and state for comparison.

.DESCRIPTION
    Captures the user settings.json, keybindings.json, and relevant state
    from the Code OSS data folder. Use this before and after making changes
    to see what changed.

.PARAMETER Name
    A label for the snapshot (e.g. "before", "after").

.PARAMETER Compare
    If provided, compares two named snapshots instead of creating one.
    Pass two names separated by comma: -Compare "before,after"

.EXAMPLE
    .\scripts\snapshot-settings.ps1 -Name "before"
    # Make changes in Code OSS...
    .\scripts\snapshot-settings.ps1 -Name "after"
    .\scripts\snapshot-settings.ps1 -Compare "before,after"
#>
param(
    [string]$Name,
    [string]$Compare
)

$snapshotDir = Join-Path (Join-Path $PSScriptRoot "..") ".settings-snapshots"

# Code OSS data folder on Windows
$dataFolder = Join-Path $env:APPDATA "Code - OSS"
$userFolder = Join-Path $dataFolder "User"

if ($Compare) {
    $names = $Compare -split ','
    if ($names.Count -ne 2) {
        Write-Error "Provide two snapshot names separated by comma, e.g. -Compare 'before,after'"
        exit 1
    }

    $dir1 = Join-Path $snapshotDir $names[0].Trim()
    $dir2 = Join-Path $snapshotDir $names[1].Trim()

    if (-not (Test-Path $dir1)) { Write-Error "Snapshot '$($names[0].Trim())' not found at $dir1"; exit 1 }
    if (-not (Test-Path $dir2)) { Write-Error "Snapshot '$($names[1].Trim())' not found at $dir2"; exit 1 }

    Write-Host "`n=== Comparing snapshots: $($names[0].Trim()) -> $($names[1].Trim()) ===" -ForegroundColor Cyan

    foreach ($file in @("settings.json", "keybindings.json", "globalState.json")) {
        $f1 = Join-Path $dir1 $file
        $f2 = Join-Path $dir2 $file

        if ((Test-Path $f1) -and (Test-Path $f2)) {
            $content1 = Get-Content $f1 -Raw
            $content2 = Get-Content $f2 -Raw
            if ($content1 -eq $content2) {
                Write-Host "`n[$file] No changes." -ForegroundColor Green
            } else {
                Write-Host "`n[$file] CHANGED:" -ForegroundColor Yellow
                # Show a simple diff
                $lines1 = Get-Content $f1
                $lines2 = Get-Content $f2
                $diff = Compare-Object $lines1 $lines2
                foreach ($d in $diff) {
                    if ($d.SideIndicator -eq "=>") {
                        Write-Host "  + $($d.InputObject)" -ForegroundColor Green
                    } else {
                        Write-Host "  - $($d.InputObject)" -ForegroundColor Red
                    }
                }
            }
        } elseif (Test-Path $f1) {
            Write-Host "`n[$file] Removed in $($names[1].Trim())" -ForegroundColor Red
        } elseif (Test-Path $f2) {
            Write-Host "`n[$file] Added in $($names[1].Trim())" -ForegroundColor Green
        } else {
            Write-Host "`n[$file] Not present in either snapshot." -ForegroundColor DarkGray
        }
    }
    Write-Host ""
    exit 0
}

if (-not $Name) {
    Write-Error "Provide -Name for the snapshot, e.g. -Name 'before'"
    exit 1
}

$destDir = Join-Path $snapshotDir $Name
if (Test-Path $destDir) {
    Write-Warning "Snapshot '$Name' already exists at $destDir. Overwriting."
    Remove-Item $destDir -Recurse -Force
}
New-Item -ItemType Directory -Path $destDir -Force | Out-Null

Write-Host "Snapshotting Code OSS settings -> $destDir" -ForegroundColor Cyan
Write-Host "Data folder: $userFolder"

# Copy settings.json
$settingsFile = Join-Path $userFolder "settings.json"
if (Test-Path $settingsFile) {
    Copy-Item $settingsFile (Join-Path $destDir "settings.json")
    Write-Host "  [OK] settings.json" -ForegroundColor Green
} else {
    # No user settings file yet - create empty snapshot
    '{}' | Out-File (Join-Path $destDir "settings.json") -Encoding utf8
    Write-Host "  [--] settings.json (not found, using empty)" -ForegroundColor Yellow
}

# Copy keybindings.json
$keybindingsFile = Join-Path $userFolder "keybindings.json"
if (Test-Path $keybindingsFile) {
    Copy-Item $keybindingsFile (Join-Path $destDir "keybindings.json")
    Write-Host "  [OK] keybindings.json" -ForegroundColor Green
} else {
    '[]' | Out-File (Join-Path $destDir "keybindings.json") -Encoding utf8
    Write-Host "  [--] keybindings.json (not found, using empty)" -ForegroundColor Yellow
}

# Capture global state (storage) - contains sidebar visibility, view states, etc.
$globalStatePath = Join-Path (Join-Path (Join-Path $dataFolder "User") "globalStorage") "state.vscdb"
$globalStateJson = Join-Path $destDir "globalState.json"
if (Test-Path $globalStatePath) {
    Write-Host "  [OK] state.vscdb found (SQLite global state)" -ForegroundColor Green
    # Try to extract key/value pairs if sqlite3 is available
    $sqlite = Get-Command sqlite3 -ErrorAction SilentlyContinue
    if ($sqlite) {
        $output = & sqlite3 $globalStatePath "SELECT key, value FROM ItemTable WHERE key LIKE 'workbench.%' OR key LIKE 'views.%' OR key LIKE 'sidebar.%' OR key LIKE 'activitybar.%' ORDER BY key;" 2>&1
        $output | Out-File $globalStateJson -Encoding utf8
        Write-Host "  [OK] globalState.json (extracted workbench state)" -ForegroundColor Green
    } else {
        "# sqlite3 not available - cannot extract state.vscdb" | Out-File $globalStateJson -Encoding utf8
        Write-Host "  [!!] sqlite3 not found; cannot extract globalState. Install sqlite3 for full snapshots." -ForegroundColor Yellow
    }
} else {
    "# No global state found" | Out-File $globalStateJson -Encoding utf8
    Write-Host "  [--] globalState (state.vscdb not found)" -ForegroundColor Yellow
}

Write-Host "`nSnapshot '$Name' saved to: $destDir" -ForegroundColor Cyan
Write-Host "Files captured:"
Get-ChildItem $destDir | ForEach-Object { Write-Host "  - $($_.Name)" }
