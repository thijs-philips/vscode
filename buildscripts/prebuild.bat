@echo off
setlocal

echo ============================================
echo  prebuild.bat
echo.
echo  One-time setup before you can build or run:
echo    1. Selects the Node.js version from .nvmrc
echo    2. Installs Node dependencies (npm ci)
echo    3. Downloads the Electron binary
echo    4. Rebuilds native Node modules
echo.
echo  Run this after cloning, or after changing
echo  branches that update .nvmrc / package-lock.json.
echo ============================================
echo.

pushd %~dp0\..

echo [1/4] Selecting Node.js version from .nvmrc...
where fnm >nul 2>&1
if %errorlevel%==0 (
	:: fnm reads .nvmrc automatically when no version is passed, so the
	:: required version is never hard-coded here. Installing it also lets
	:: fnm's use-on-cd hook auto-select it for build.bat / run.bat later.
	call fnm install
	if errorlevel 1 goto fail
	call fnm use
	if errorlevel 1 goto fail
) else (
	echo WARN: fnm not found on PATH. Skipping automatic Node selection.
	echo       Ensure your active Node.js matches the version in .nvmrc:
	type .nvmrc
)

echo.
echo [2/4] Installing Node dependencies...
call npm ci
if errorlevel 1 goto fail

echo.
echo [3/4] Downloading Electron...
call npm run electron
if errorlevel 1 goto fail

echo.
echo [4/4] Rebuilding native modules...
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
