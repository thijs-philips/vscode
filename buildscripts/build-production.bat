@echo off
setlocal

echo ============================================
echo  build-production.bat
echo.
echo  Creates a distributable production build:
echo    1. Bundles Code - OSS into a standalone app
echo    2. Patches Copilot Chat vision gating
echo    3. Copies inno_updater into tools/
echo    4. Builds a Windows installer (Inno Setup)
echo.
echo  Output:
echo    App:       ..\VSCode-win32-x64\
echo    Installer: .build\win32-x64\user-setup\CodeOSSSetup.exe
echo ============================================
echo.

pushd %~dp0\..

:: Step 1 - Bundle the standalone application
echo [1/4] Bundling standalone app (gulp vscode-win32-x64)...
call node_modules\.bin\gulp vscode-win32-x64
if %ERRORLEVEL% neq 0 (
    echo.
    echo FAILED: gulp vscode-win32-x64 exit code %ERRORLEVEL%
    popd
    exit /b 1
)
if not exist "..\VSCode-win32-x64\Code - OSS.exe" (
    echo.
    echo FAILED: Expected output not found: ..\VSCode-win32-x64\Code - OSS.exe
    popd
    exit /b 1
)

:: Step 2 - Patch Copilot Chat vision gating
echo.
echo [2/4] Patching Copilot Chat vision...
call node scripts\patch-copilot-vision.js
if %ERRORLEVEL% neq 0 (
    echo WARN: patch-copilot-vision.js returned non-zero, continuing.
)

:: Step 3 - Copy inno_updater + vcruntime into tools directory
echo.
echo [3/4] Copying inno_updater to tools/...
call node_modules\.bin\gulp vscode-win32-x64-inno-updater
if %ERRORLEVEL% neq 0 (
    echo.
    echo FAILED: gulp vscode-win32-x64-inno-updater exit code %ERRORLEVEL%
    popd
    exit /b 1
)
if not exist "..\VSCode-win32-x64\tools\inno_updater.exe" (
    echo.
    echo FAILED: Expected output not found: ..\VSCode-win32-x64\tools\inno_updater.exe
    popd
    exit /b 1
)

:: Step 4 - Build the Windows user-setup installer via Inno Setup
echo.
echo [4/4] Building installer (gulp vscode-win32-x64-user-setup)...
call node_modules\.bin\gulp vscode-win32-x64-user-setup
if %ERRORLEVEL% neq 0 (
    echo.
    echo FAILED: gulp vscode-win32-x64-user-setup exit code %ERRORLEVEL%
    popd
    exit /b 1
)
if not exist ".build\win32-x64\user-setup\CodeOSSSetup.exe" (
    echo.
    echo FAILED: Installer was not produced at .build\win32-x64\user-setup\CodeOSSSetup.exe
    echo         Inno Setup may have failed silently. Check output above for errors.
    popd
    exit /b 1
)

echo.
echo ============================================
echo  Production build complete!
echo.
echo  Standalone app:  ..\VSCode-win32-x64\Code - OSS.exe
echo  Installer:       .build\win32-x64\user-setup\CodeOSSSetup.exe
echo ============================================

popd
endlocal
