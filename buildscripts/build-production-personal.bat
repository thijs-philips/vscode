@echo off
setlocal

pushd %~dp0\..
call node scripts\run-with-product-variant.ts personal -- "%ComSpec%" /d /s /c buildscripts\build-production.bat
set "BUILD_EXIT_CODE=%ERRORLEVEL%"
popd

endlocal & exit /b %BUILD_EXIT_CODE%