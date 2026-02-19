@echo off
setlocal

echo === VS Code Prebuild ===
pushd %~dp0\..

echo.
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
echo === Prebuild complete ===
popd
endlocal
exit /b 0

:fail
echo.
echo === Prebuild FAILED ===
popd
endlocal
exit /b 1
