@echo off
setlocal

echo === Launching Code - OSS ===
pushd %~dp0\..

call .\scripts\code.bat %*

popd
endlocal
