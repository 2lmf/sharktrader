@echo off
setlocal

set VPS_IP=92.4.216.122
set KEY_FILE=ssh-key-2026-03-15.key

:loop
echo [PROXY] Pokrecem SSH tunel prema %VPS_IP%...
ssh -N -D 1080 -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -o StrictHostKeyChecking=no -i "%~dp0%KEY_FILE%" ubuntu@%VPS_IP%
echo [PROXY] SSH tunel je prekinut. Ponovno spajanje za 3 sekunde...
timeout /t 3 /nobreak > nul
goto loop
