@echo off
setlocal

echo === VS Code Build ===
pushd %~dp0\..

echo.
echo Compiling core and built-in extensions...
call npm run compile
if errorlevel 1 goto fail

echo.
echo Applying Copilot Vision patch...
call node scripts\patch-copilot-vision.js
if errorlevel 1 (
	echo WARN: Copilot Vision patch script reported a non-zero exit code.
	echo Continuing build output anyway.
)

echo.
echo === Build complete ===
popd
endlocal
exit /b 0

:fail
echo.
echo === Build FAILED ===
popd
endlocal
exit /b 1
