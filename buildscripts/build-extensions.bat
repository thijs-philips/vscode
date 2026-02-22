@echo off
setlocal

echo === VS Code Extensions Build ===
pushd %~dp0\..

echo.
echo Compiling built-in extensions...
call npm run gulp compile-extensions
if errorlevel 1 goto fail

echo.
echo === Extensions build complete ===
echo.
echo TIP: To compile a single extension instead:
echo   node node_modules\typescript\bin\tsc -p extensions\^<name^>\tsconfig.json
popd
endlocal
exit /b 0

:fail
echo.
echo === Extensions build FAILED ===
popd
endlocal
exit /b 1
