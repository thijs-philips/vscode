@echo off
setlocal

echo ============================================
echo  publish-release.bat
echo.
echo  Publishes the installer to GitHub Releases
echo  so the embedded update server can find it.
echo.
echo  What it does:
echo    0. Bumps the patch version and commits
echo    1. Builds Code - OSS and Code - Personal
echo    2. Creates a GitHub release tagged v{version}-{commit}
echo    3. Uploads both installers + SHA256 checksums
echo.
echo  The local update server in Code - OSS checks
echo  these releases to offer silent auto-updates.
echo.
echo  Auth: uses GITHUB_TOKEN env var, or git
echo        credential helper for github.com.
echo ============================================
echo.

:: Step 0: Bump version in package.json and commit
echo Bumping version...
pushd %~dp0\..
call node scripts\bump-version.js
if %ERRORLEVEL% neq 0 (
    echo.
    echo Version bump failed, aborting.
    popd
    exit /b 1
)
popd
echo.

:: Step 1: Full production build (app + installer)
call %~dp0\build-production.bat
if %ERRORLEVEL% neq 0 (
    echo.
    echo Build failed, aborting publish.
    exit /b %ERRORLEVEL%
)

:: Step 2: Push commits to remote (GitHub needs the commit to create a release)
echo.
echo Pushing to origin...
pushd %~dp0\..
git push
if %ERRORLEVEL% neq 0 (
    echo.
    echo Git push failed, aborting publish.
    popd
    exit /b 1
)
popd

:: Step 3: Publish installer to GitHub Releases
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

echo.
echo Building Code - Personal...
echo.
call node scripts\run-with-product-variant.ts personal -- "%ComSpec%" /d /s /c buildscripts\build-production.bat
if %ERRORLEVEL% neq 0 (
    echo.
    echo PERSONAL BUILD FAILED with exit code %ERRORLEVEL%
    popd
    exit /b %ERRORLEVEL%
)

echo.
echo Publishing Code - Personal to the same GitHub release...
echo.
call node scripts\run-with-product-variant.ts personal -- node scripts\publish-release.js
if %ERRORLEVEL% neq 0 (
    echo.
    echo PERSONAL PUBLISH FAILED with exit code %ERRORLEVEL%
    popd
    exit /b %ERRORLEVEL%
)

popd
endlocal
