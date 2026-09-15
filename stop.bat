@echo off
setlocal
echo ===================================================
echo   WESION - arresto server
echo ===================================================

set "PORTA=3015"
set "TROVATO=0"

for /f "tokens=5" %%a in ('netstat -aon ^| findstr :%PORTA% ^| findstr LISTENING') do (
    echo Termino il processo con PID %%a
    taskkill /F /PID %%a >nul 2>&1
    set "TROVATO=1"
)

if "%TROVATO%"=="0" (
    echo Nessun server attivo sulla porta %PORTA%.
) else (
    echo Server arrestato.
)
echo.
pause
