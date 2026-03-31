<#
.SYNOPSIS
    Tracks sequential Code OSS settings changes in a rolling changelog.

.DESCRIPTION
    Each invocation snapshots the current settings, compares against the
    previous snapshot, prints the delta, and appends it to a changelog.
    The new snapshot automatically becomes the baseline for the next run.

.PARAMETER Description
    Optional description of what was changed in this session.

.PARAMETER Log
    Path to the changelog file. Defaults to .settings-snapshots/changelog.md

.PARAMETER Init
    Initialize (or reset) the baseline without logging a delta.

.EXAMPLE
    .\scripts\settings-changelog.ps1 -Init
    # Make changes in Code OSS...
    .\scripts\settings-changelog.ps1 -Description "Hid activity bar, enabled word wrap"
    # Make more changes...
    .\scripts\settings-changelog.ps1
#>
param(
    [string]$Description,
    [string]$Log,
    [switch]$Init
)

$snapshotDir = Join-Path (Join-Path $PSScriptRoot "..") ".settings-snapshots"
$baselineDir = Join-Path $snapshotDir "_baseline"
if (-not $Log) { $Log = Join-Path $snapshotDir "changelog.md" }

$dataFolder = Join-Path $env:APPDATA "Code - OSS"
$userFolder = Join-Path $dataFolder "User"

# Files to track (add new files here)
$trackedFiles = @(
    @{ Name = "settings.json";    EmptyDefault = '{}' },
    @{ Name = "keybindings.json"; EmptyDefault = '[]' },
    @{ Name = "mcp.json";         EmptyDefault = '{}' }
)

# --- helpers ---

function Copy-SettingsTo([string]$destDir) {
    if (-not (Test-Path $destDir)) {
        New-Item -ItemType Directory -Path $destDir -Force | Out-Null
    }

    foreach ($tracked in $trackedFiles) {
        $srcFile = Join-Path $userFolder $tracked.Name
        $dstFile = Join-Path $destDir $tracked.Name
        if (Test-Path $srcFile) {
            Copy-Item $srcFile $dstFile
        } else {
            $tracked.EmptyDefault | Out-File $dstFile -Encoding utf8
        }
    }
}

# Ensure baseline has entries for all tracked files (backfill new ones)
function Update-Baseline([string]$baseDir) {
    foreach ($tracked in $trackedFiles) {
        $baseFile = Join-Path $baseDir $tracked.Name
        if (-not (Test-Path $baseFile)) {
            $tracked.EmptyDefault | Out-File $baseFile -Encoding utf8
        }
    }
}

function Get-Delta([string]$oldDir, [string]$newDir) {
    $result = @()
    $hasChanges = $false

    foreach ($tracked in $trackedFiles) {
        $file = $tracked.Name
        $f1 = Join-Path $oldDir $file
        $f2 = Join-Path $newDir $file

        $exists1 = Test-Path $f1
        $exists2 = Test-Path $f2

        if ($exists1 -and $exists2) {
            $content1 = Get-Content $f1 -Raw
            $content2 = Get-Content $f2 -Raw
            if ($content1 -eq $content2) {
                continue
            }
            $hasChanges = $true
            $lines1 = Get-Content $f1
            $lines2 = Get-Content $f2
            $diff = Compare-Object $lines1 $lines2
            if ($diff) {
                $result += "**$file**"
                $result += '```diff'
                foreach ($d in $diff) {
                    if ($d.SideIndicator -eq "=>") {
                        $result += "+ $($d.InputObject)"
                    } else {
                        $result += "- $($d.InputObject)"
                    }
                }
                $result += '```'
            }
        } elseif ($exists1) {
            $hasChanges = $true
            $result += "**$file** - removed"
        } elseif ($exists2) {
            $hasChanges = $true
            $result += "**$file** - created"
            $result += '```'
            $result += (Get-Content $f2)
            $result += '```'
        }
    }

    return @{ HasChanges = $hasChanges; Lines = $result }
}

function Write-Both([string]$text, [string]$logPath, [string]$color) {
    if ($color) {
        Write-Host $text -ForegroundColor $color
    } else {
        Write-Host $text
    }
    Add-Content -Path $logPath -Value $text -Encoding utf8
}

# --- main ---

if (-not (Test-Path $snapshotDir)) {
    New-Item -ItemType Directory -Path $snapshotDir -Force | Out-Null
}

# --- Init mode: set baseline, no delta ---
if ($Init) {
    Copy-SettingsTo $baselineDir
    Write-Host "Baseline initialized at $baselineDir" -ForegroundColor Cyan
    foreach ($tracked in $trackedFiles) {
        $f = Join-Path $baselineDir $tracked.Name
        $content = Get-Content $f -Raw
        if ($content -and $content.Trim() -ne $tracked.EmptyDefault) {
            Write-Host "`nCurrent $($tracked.Name):" -ForegroundColor DarkGray
            Get-Content $f
        }
    }
    exit 0
}

# --- Normal mode: snapshot, diff, rotate ---
if (-not (Test-Path $baselineDir)) {
    Write-Host "No baseline found. Initializing now..." -ForegroundColor Yellow
    Copy-SettingsTo $baselineDir
    Write-Host "Baseline set. Make changes, then run this script again." -ForegroundColor Cyan
    exit 0
}

# Backfill baseline with any newly tracked files
Update-Baseline $baselineDir

$currentDir = Join-Path $snapshotDir "_current"
Copy-SettingsTo $currentDir

$delta = Get-Delta $baselineDir $currentDir

if (-not $delta.HasChanges) {
    Write-Host "No settings changes detected since last baseline." -ForegroundColor Green
    Remove-Item $currentDir -Recurse -Force
    exit 0
}

# Determine entry number
$entryNum = 1
if (Test-Path $Log) {
    $existingEntries = (Select-String -Path $Log -Pattern '^## \d+\.' -AllMatches).Count
    $entryNum = $existingEntries + 1
}

# Build log entry
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$header = "## ${entryNum}. $timestamp"
if ($Description) { $header += " - $Description" }

# Write header to changelog (create if needed)
if (-not (Test-Path $Log)) {
    "# Code OSS Settings Changelog" | Out-File $Log -Encoding utf8
    "" | Add-Content $Log -Encoding utf8
}

# Output to both screen and log
Write-Host ""
Write-Both $header $Log "Cyan"
Write-Both "" $Log
foreach ($line in $delta.Lines) {
    $color = $null
    if ($line -match '^\+ ') { $color = "Green" }
    elseif ($line -match '^- ') { $color = "Red" }
    Write-Both $line $Log $color
}
Write-Both "" $Log

# Rotate: current becomes new baseline
if (Test-Path $baselineDir) { Remove-Item $baselineDir -Recurse -Force }
Move-Item $currentDir $baselineDir -Force

Write-Host "Logged to: $Log" -ForegroundColor DarkGray
Write-Host "Baseline updated. Ready for next change session." -ForegroundColor Cyan
