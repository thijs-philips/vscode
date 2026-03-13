@echo off
setlocal

echo ============================================
echo  run.bat
echo.
echo  Launches Code - OSS in development mode.
echo  Uses the Electron binary from node_modules
echo  and runs source directly (not bundled).
echo.
echo  This is the fast inner-loop: edit code,
echo  then run this to test your changes.
echo.
echo  Any extra arguments are passed to Code - OSS.
echo ============================================
echo.

pushd %~dp0\..

:: Kill only the dev instance of Code - OSS running from .build\electron
:: (prevents EBUSY errors when preLaunch tries to refresh the Electron binary)
:: We filter by path so the installed IDE (running from a different location) is not affected.
for /f "tokens=2 delims=," %%P in ('wmic process where "name='Code - OSS.exe' and ExecutablePath like '%%\\.build\\electron\\%%'" get ProcessId /format:csv 2^>nul ^| findstr /R "[0-9]"') do (
	echo Killing dev Code - OSS process %%P ...
	taskkill /F /PID %%P >nul 2>&1
)
:: If we killed anything, wait for file handles to be released
wmic process where "name='Code - OSS.exe' and ExecutablePath like '%%\\.build\\electron\\%%'" get ProcessId /format:csv 2>nul | findstr /R "[0-9]" >nul 2>&1
if %errorlevel%==0 (
	timeout /t 2 /nobreak >nul
)

echo Applying Copilot Vision patch...
call node scripts\patch-copilot-vision.js
if errorlevel 1 (
	echo WARN: patch-copilot-vision.js returned non-zero, continuing.
)

:: Use separate data & extensions dirs to avoid clashing with the regular VS Code install
set "VSCODE_DEV_DATA=%~dp0\..\..\.vscode-oss-dev"
set "VSCODE_DEV_EXTENSIONS=%VSCODE_DEV_DATA%\extensions"

echo.
echo Launching Code - OSS (dev)...
echo   user-data-dir:  %VSCODE_DEV_DATA%
echo   extensions-dir: %VSCODE_DEV_EXTENSIONS%
echo.
call .\scripts\code.bat --user-data-dir "%VSCODE_DEV_DATA%" --extensions-dir "%VSCODE_DEV_EXTENSIONS%" %*

popd
endlocal
