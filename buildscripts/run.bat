@echo off
setlocal

echo ============================================
echo  run.bat
echo.
echo  Launches Code - OSS in development mode.
echo  Uses the Electron binary from node_modules
echo  and runs source directly (not bundled).
echo.
echo  This is the fast inner-loop: edit code,
echo  then run this to test your changes.
echo.
echo  Any extra arguments are passed to Code - OSS.
echo ============================================
echo.

pushd %~dp0\..

echo Applying Copilot Vision patch...
call node scripts\patch-copilot-vision.js
if errorlevel 1 (
	echo WARN: patch-copilot-vision.js returned non-zero, continuing.
)

echo.
echo Launching Code - OSS (dev)...
call .\scripts\code.bat %*

popd
endlocal
