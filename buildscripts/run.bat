@echo off
setlocal

echo === Launching Code - OSS ===
pushd %~dp0\..

echo.
echo Applying Copilot Vision patch...
call node scripts\patch-copilot-vision.js
if errorlevel 1 (
	echo WARN: Copilot Vision patch script reported a non-zero exit code.
	echo Continuing launch anyway.
)

call .\scripts\code.bat %*

popd
endlocal
