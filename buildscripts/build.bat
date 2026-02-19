@echo off
setlocal

echo === VS Code Build ===
pushd %~dp0\..

echo.
echo [1/2] Compiling core TypeScript...
call npm run compile
if errorlevel 1 goto fail

echo.
echo [2/2] Compiling built-in extensions...
call npm run compile-extensions
if errorlevel 1 goto fail

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
