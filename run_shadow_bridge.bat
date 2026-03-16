@echo off
setlocal

set VPS_IP=92.4.216.122
set KEY_FILE=ssh-key-2026-03-15.key
set BRIDGE_DIR=%~dp0bridge

echo Shark Bridge starting...

echo Spajam se na Oracle VPS (%VPS_IP%)...
start "Shark Proxy" cmd /c "%~dp0run_proxy_loop.bat"

timeout /t 3 /nobreak > nul

echo Pokrecem lokalni Bridge...
cd /d "%BRIDGE_DIR%"
node server.js

pause
