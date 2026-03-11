@echo off
setlocal

echo ============================================
echo  build.bat
echo.
echo  Compiles everything for development:
echo    1. Core TypeScript (src/)
echo    2. Built-in extensions (extensions/)
echo    3. Patches Copilot Chat vision gating
echo.
echo  Use this before run.bat, or after pulling
echo  new changes. For production, use
echo  build-production.bat instead.
echo ============================================
echo.

pushd %~dp0\..

echo [1/2] Compiling core and built-in extensions...
call npm run compile
if errorlevel 1 goto fail

echo.
echo [2/2] Applying Copilot Vision patch...
call node scripts\patch-copilot-vision.js
if errorlevel 1 (
	echo WARN: patch-copilot-vision.js returned non-zero, continuing.
)

echo.
echo === Dev build complete ===
popd
endlocal
exit /b 0

:fail
echo.
echo === Build FAILED ===
popd
endlocal
exit /b 1
