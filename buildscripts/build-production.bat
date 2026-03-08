@echo off
setlocal

echo ============================================
echo  Building Code - OSS (Production Build)
echo ============================================
echo.

pushd %~dp0\..

:: Run the gulp task to produce a standalone production build
echo Running: gulp vscode-win32-x64
call node_modules\.bin\gulp vscode-win32-x64

if %ERRORLEVEL% neq 0 (
    echo.
    echo BUILD FAILED with exit code %ERRORLEVEL%
    popd
    exit /b %ERRORLEVEL%
)

echo.
echo ============================================
echo  Build complete!
echo.
echo  Output: %~dp0..\..\VSCode-win32-x64\
echo  Exe:    %~dp0..\..\VSCode-win32-x64\Code - OSS.exe
echo.
echo  Use this path in VS Code Switcher:
echo    D:\Github\VSCode-win32-x64\Code - OSS.exe
echo ============================================

:: Patch Copilot Chat vision gating (if extension is installed)
echo.
echo Running: patch-copilot-vision.js
call node scripts\patch-copilot-vision.js

popd
endlocal
