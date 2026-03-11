@echo off
setlocal

echo ============================================
echo  build-core.bat
echo.
echo  Compiles only the core TypeScript under
echo  src/ (skips extensions). Faster than
echo  build.bat when you only changed core code.
echo ============================================
echo.

pushd %~dp0\..

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
