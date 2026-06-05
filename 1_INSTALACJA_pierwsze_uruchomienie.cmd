@echo off
chcp 65001 >nul
title Kreisel - INSTALACJA pierwsze uruchomienie
color 0B
echo.
echo =======================================================================
echo   INSTALATOR - Kreisel automatyzacja ksiegowosci
echo =======================================================================
echo.
echo   Skrypt sprawdzi i zainstaluje wszystko co potrzebne na tym komputerze.
echo   Wszystko bedzie w C:\kreisel\ - nic poza tym folderem.
echo   Trwa 3-5 minut.
echo.
pause

echo.
echo [1/5] Sprawdzanie folderu projektu...
if not exist "C:\kreisel\system" (
    color 0C
    echo.
    echo BLAD: Brak folderu C:\kreisel\system
    echo.
    echo Patryk musi skopiowac caly projekt do C:\kreisel\system\
    echo.
    pause
    exit /b 1
)
echo   [OK] Folder C:\kreisel\system istnieje

echo.
echo [2/5] Sprawdzanie czy Node.js jest dostepny...

REM Najpierw sprawdzamy lokalny portable Node (C:\kreisel\system\nodejs)
if exist "C:\kreisel\system\nodejs\node.exe" (
    set "NODE_EXE=C:\kreisel\system\nodejs\node.exe"
    set "NPM_CMD=C:\kreisel\system\nodejs\npm.cmd"
    echo   [OK] Portable Node.js znaleziony w C:\kreisel\system\nodejs
    goto :node_ready
)

REM Potem sprawdzamy system-wide Node
where node >nul 2>&1
if not errorlevel 1 (
    set "NODE_EXE=node"
    set "NPM_CMD=npm"
    for /f "delims=" %%v in ('node --version') do set NODEVER=%%v
    echo   [OK] System Node.js: %NODEVER%
    goto :node_ready
)

echo   Node.js nie znaleziony. Pobieram portable wersje [~30 MB]...
echo   To moze potrwac 1-2 minuty.

REM Pobierz Node.js portable LTS
set NODE_VERSION=v22.11.0
set NODE_ZIP_URL=https://nodejs.org/dist/%NODE_VERSION%/node-%NODE_VERSION%-win-x64.zip

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -Uri '%NODE_ZIP_URL%' -OutFile 'C:\kreisel\system\nodejs.zip' -UseBasicParsing"
if not exist "C:\kreisel\system\nodejs.zip" (
    color 0C
    echo BLAD: Nie udalo sie pobrac Node.js.
    echo Sprawdz polaczenie internetowe lub pobierz recznie z:
    echo   %NODE_ZIP_URL%
    pause
    exit /b 1
)

echo   Rozpakowywanie...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Path 'C:\kreisel\system\nodejs.zip' -DestinationPath 'C:\kreisel\system\' -Force"
ren "C:\kreisel\system\node-%NODE_VERSION%-win-x64" "nodejs" 2>nul
if not exist "C:\kreisel\system\nodejs\node.exe" (
    color 0C
    echo BLAD: Rozpakowanie nie powiodlo sie.
    pause
    exit /b 1
)
del "C:\kreisel\system\nodejs.zip"

set "NODE_EXE=C:\kreisel\system\nodejs\node.exe"
set "NPM_CMD=C:\kreisel\system\nodejs\npm.cmd"
echo   [OK] Node.js zainstalowany lokalnie

:node_ready
echo.
echo [3/5] Instalacja zaleznosci npm [moze potrwac 2-3 min]...
cd /d C:\kreisel\system
if exist "node_modules\@anthropic-ai\sdk" if exist "node_modules\mysql2" if exist "node_modules\exceljs" (
    echo   [OK] Zaleznosci juz zainstalowane - pomijam
    goto :deps_ready
)
call "%NPM_CMD%" install --silent --no-audit --no-fund
if errorlevel 1 (
    color 0C
    echo BLAD instalacji npm. Sprawdz polaczenie z internetem.
    pause
    exit /b 1
)
echo   [OK] Zainstalowano

:deps_ready
echo.
echo [4/5] Tworzenie folderow roboczych...
if not exist "C:\kreisel\inbox" mkdir "C:\kreisel\inbox"
if not exist "C:\kreisel\gotowe" mkdir "C:\kreisel\gotowe"
if not exist "C:\kreisel\bledy" mkdir "C:\kreisel\bledy"
if not exist "C:\kreisel\wstrzymane" mkdir "C:\kreisel\wstrzymane"
echo   [OK] Foldery: inbox, gotowe, bledy, wstrzymane

echo.
echo [5/5] Test polaczenia z QBO...
if not exist "C:\kreisel\system\.env" (
    color 0E
    echo   OSTRZEZENIE: Brak C:\kreisel\system\.env
    echo   Patryk musi skonfigurowac.
    goto :end
)
"%NODE_EXE%" qbo_client.js 2>nul | findstr /C:"MultiCurrencyEnabled" >nul 2>&1
if errorlevel 1 (
    color 0E
    echo   OSTRZEZENIE: QBO test nie przeszedl.
    echo   Sprawdz czy refresh tokeny sa aktualne [po 100 dniach wygasaja].
) else (
    echo   [OK] Polaczenie QBO dziala
)

:end
echo.
color 0A
echo =======================================================================
echo   INSTALACJA ZAKONCZONA
echo =======================================================================
echo.
echo   Codzienne uruchomienie:
echo     1. Rano: pobierz Magemar.xlsx z SharePoint
echo        zapisz jako C:\kreisel\magemar.xlsx
echo     2. Wrzuc PDFy faktur do  C:\kreisel\inbox\
echo     3. Klik 2x:  2_Sprawdz_bez_postowania.cmd  [podglad]
echo     4. Klik 2x:  3_Procesuj_faktury.cmd  [realny posting]
echo.
echo   Pelna instrukcja w pliku:  INSTRUKCJA.txt
echo.
pause
