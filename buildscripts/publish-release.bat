@echo off
setlocal

echo ============================================
echo  publish-release.bat
echo.
echo  Publishes the installer to GitHub Releases
echo  so the embedded update server can find it.
echo.
echo  What it does:
echo    1. Runs build-production.bat (app + installer)
echo    2. Creates a GitHub release tagged v{version}-{commit}
echo    3. Uploads the installer + SHA256 checksum
echo.
echo  The local update server in Code - OSS checks
echo  these releases to offer silent auto-updates.
echo.
echo  Auth: uses GITHUB_TOKEN env var, or git
echo        credential helper for github.com.
echo ============================================
echo.

:: Step 1: Full production build (app + installer)
call %~dp0\build-production.bat
if %ERRORLEVEL% neq 0 (
    echo.
    echo Build failed, aborting publish.
    exit /b %ERRORLEVEL%
)

:: Step 2: Publish installer to GitHub Releases
echo.
echo Publishing to GitHub Releases...
echo.

pushd %~dp0\..
call node scripts\publish-release.js
if %ERRORLEVEL% neq 0 (
    echo.
    echo PUBLISH FAILED with exit code %ERRORLEVEL%
    popd
    exit /b %ERRORLEVEL%
)

popd
endlocal
