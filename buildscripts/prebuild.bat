@echo off
setlocal

echo ============================================
echo  prebuild.bat
echo.
echo  One-time setup before you can build or run:
echo    1. Installs Node dependencies (npm ci)
echo    2. Downloads the Electron binary
echo    3. Rebuilds native Node modules
echo.
echo  Run this after cloning, or after changing
echo  branches that update package-lock.json.
echo ============================================
echo.

pushd %~dp0\..

echo [1/3] Installing Node dependencies...
call npm ci
if errorlevel 1 goto fail

echo.
echo [2/3] Downloading Electron...
call npm run electron
if errorlevel 1 goto fail

echo.
echo [3/3] Rebuilding native modules...
call node build/npm/postinstall.ts
if errorlevel 1 goto fail

echo.
echo === Prebuild complete. You can now run build.bat or run.bat. ===
popd
endlocal
exit /b 0

:fail
echo.
echo === Prebuild FAILED ===
popd
endlocal
exit /b 1
