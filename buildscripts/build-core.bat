@echo off
setlocal

echo === VS Code Core Build ===
pushd %~dp0\..

echo.
echo Compiling core TypeScript (src\)...
call npm run gulp compile-client
if errorlevel 1 goto fail

echo.
echo === Core build complete ===
popd
endlocal
exit /b 0

:fail
echo.
echo === Core build FAILED ===
popd
endlocal
exit /b 1
