@echo off
REM ============================================================
REM Preventivatore Abruzzo Digitale — Avvio rapido (Windows)
REM
REM Avvia in 2 finestre separate:
REM   - Backend Node/Express (porta 4321)
REM   - Frontend statico HTTP (porta 8000)
REM Entrambi accessibili sia da localhost sia da iPad/iPhone
REM sullo stesso Wi-Fi del PC (vedi gli URL stampati in console).
REM
REM Al PRIMO avvio Windows Firewall chiederà di "Consentire
REM l'accesso" a Node.js: spunta "Reti private" e clicca Consenti.
REM ============================================================

setlocal
cd /d "%~dp0"

REM 1) Verifica Node
where node >nul 2>nul
if errorlevel 1 (
  echo [ERRORE] Node.js non e^^' installato. Scaricalo da https://nodejs.org
  pause
  exit /b 1
)

REM 2) Installa dipendenze backend se manca node_modules
if not exist "server\node_modules" (
  echo [setup] Prima volta: installo dipendenze backend...
  pushd server
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo [ERRORE] npm install fallito.
    popd
    pause
    exit /b 1
  )
  popd
)

REM 3) Verifica .env del backend
if not exist "server\.env" (
  echo [ATTENZIONE] server\.env non esiste. Copia server\.env.example
  echo            in server\.env e compila JWT_SECRET, FIC_ACCESS_TOKEN
  echo            e FIC_COMPANY_ID prima di procedere.
  echo.
  echo Apro la cartella server\ — copia il file .env.example come .env.
  start "" "%~dp0server"
  pause
  exit /b 1
)

REM 4) Pre-flight: termina eventuali Node già in ascolto su 4321 / 8000.
REM Senza questo, i nuovi server non partono ('EADDRINUSE') e l'utente
REM finisce per usare la versione VECCHIA del backend (porta gia presa).
echo Pre-flight: chiudo eventuali processi node residui sulle porte 4321/8000...
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":4321 .*LISTENING" /C:":8000 .*LISTENING"') do (
  taskkill /F /PID %%P >nul 2>nul
)

REM 5) Avvio i due server in finestre separate
echo Avvio backend (porta 4321) e frontend (porta 8000) in finestre separate...
start "Preventivatore — Backend (4321)"  cmd /k "cd /d %~dp0server & node server.js"
timeout /t 2 >nul
start "Preventivatore — Frontend (8000)" cmd /k "cd /d %~dp0 & node tools\static.js"

REM 5) Apri il browser sull'app
timeout /t 2 >nul
start "" "http://localhost:8000"

echo.
echo ================================================================
echo  App avviata.
echo   - Dal PC:    http://localhost:8000
echo   - Da iPad:   guarda gli URL stampati nelle 2 finestre nere
echo                (la tua rete Wi-Fi assegna un IP tipo 192.168.x.x).
echo
echo  Per FERMARE i server: chiudi le 2 finestre nere (o Ctrl+C in
echo  ciascuna).
echo ================================================================
echo.
pause
endlocal
