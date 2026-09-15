@echo off
setlocal
title Wesion - sviluppo
echo ===================================================
echo   WESION - dashboard in locale
echo ===================================================

cd /d "%~dp0"

:: Porta FISSA, la stessa di "npm run dev" in package.json: se cambia la', va
:: cambiata qui e in stop.bat.
set "PORTA=3015"

:: 1. Node c'e'?
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo ERRORE: Node.js non e' installato o non e' nel PATH.
    pause
    exit /b 1
)

:: 2. Gira gia'? Meglio dirlo che lasciare due server appesi.
netstat -aon | findstr :%PORTA% | findstr LISTENING >nul 2>&1
if %errorlevel% equ 0 (
    echo.
    echo La porta %PORTA% e' gia' occupata: probabilmente Wesion gira gia'.
    echo Apro il browser su quello. Per ripartire pulito, lancia prima stop.bat
    echo.
    start "" http://localhost:%PORTA%/
    pause
    exit /b 0
)

:: 3. Dipendenze
if not exist "node_modules" (
    echo.
    echo Prima volta: installo le dipendenze. Ci vuole qualche minuto...
    call npm install
    if %errorlevel% neq 0 (
        echo ERRORE durante npm install.
        pause
        exit /b 1
    )
)

:: 4. .env: senza, la dashboard non vede il database.
if not exist ".env" (
    echo.
    echo ATTENZIONE: manca il file .env - la dashboard non puo' leggere il database.
    echo.
    pause
)

echo.
echo   Dashboard   http://localhost:%PORTA%/
echo.
echo   Il ROUTER (quello che pubblica davvero su blog e Google) NON parte da qui:
echo   in produzione gira su Oracle. Lanciarlo in locale col .env vero pubblica
echo   per davvero. Se serve:  npm run router
echo.
echo   Per fermare: chiudi questa finestra oppure lancia stop.bat
echo.

:: Next ci mette un po' al primo avvio: il browser si apre da solo dopo.
start "" cmd /c "timeout /t 15 >nul && start "" http://localhost:%PORTA%/"

call npm run dev

echo.
echo Server terminato.
pause
