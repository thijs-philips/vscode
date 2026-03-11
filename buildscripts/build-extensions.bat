@echo off
setlocal

echo ============================================
echo  build-extensions.bat
echo.
echo  Compiles only the built-in extensions
echo  under extensions/. Faster than build.bat
echo  when you only changed extension code.
echo ============================================
echo.

pushd %~dp0\..

echo Compiling built-in extensions...
call npm run gulp compile-extensions
if errorlevel 1 goto fail

echo.
echo === Extensions build complete ===
popd
endlocal
exit /b 0

:fail
echo.
echo === Extensions build FAILED ===
popd
endlocal
exit /b 1
