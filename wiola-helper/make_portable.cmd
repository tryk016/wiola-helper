@echo off
chcp 65001 >nul
title Wiola Helper - tworzenie paczki przenosnej
color 0B
echo.
echo =======================================================================
echo   Wiola Helper - paczka przenosna
echo =======================================================================
echo.

set BUILD_DIR=C:\kreisel\wiola-helper\portable
set ZIP_OUT=C:\kreisel\WiolaHelper-portable.zip

echo Czyszczenie poprzedniej paczki...
if exist "%BUILD_DIR%" rmdir /S /Q "%BUILD_DIR%"
if exist "%ZIP_OUT%" del "%ZIP_OUT%"

echo.
echo [1/4] Buduje aplikacje (Vite)...
cd /d C:\kreisel\wiola-helper
call npx vite build
if errorlevel 1 (
    color 0C
    echo BLAD buildu Vite
    pause
    exit /b 1
)

echo.
echo [2/4] Kopiowanie plikow...
mkdir "%BUILD_DIR%\wiola-helper"
xcopy /E /I /Y /Q dist "%BUILD_DIR%\wiola-helper\dist" >nul
xcopy /E /I /Y /Q dist-electron "%BUILD_DIR%\wiola-helper\dist-electron" >nul
xcopy /E /I /Y /Q node_modules "%BUILD_DIR%\wiola-helper\node_modules" >nul
copy package.json "%BUILD_DIR%\wiola-helper\" >nul

mkdir "%BUILD_DIR%\system"
xcopy /E /I /Y /Q C:\kreisel\system "%BUILD_DIR%\system" >nul

echo.
echo [3/4] Tworzenie skryptu uruchamiajacego...
(
echo @echo off
echo title Wiola Helper
echo cd /d "%%~dp0wiola-helper"
echo node_modules\.bin\electron.cmd .
) > "%BUILD_DIR%\Wiola Helper.cmd"

echo.
echo [4/4] Pakowanie do ZIP...
powershell -NoProfile -Command "Compress-Archive -Path '%BUILD_DIR%\*' -DestinationPath '%ZIP_OUT%' -Force"

echo.
color 0A
echo =======================================================================
echo   GOTOWE
echo =======================================================================
echo.
echo   Paczka: %ZIP_OUT%
echo.
echo   Dla kolezanki:
echo     1. Skopiuj %ZIP_OUT% na jej komputer
echo     2. Rozpakuj gdziekolwiek (np. C:\WiolaHelper\)
echo     3. Dwuklik "Wiola Helper.cmd"
echo.
echo   Wymaga: Node.js zainstalowany na jej komputerze
echo   (albo dolaczyc portable node_modules - patrz nizej)
echo.
pause
