@echo off
title Wiola Helper - Instalator (production)
color 0B
echo.
echo ===========================================================
echo   WIOLA HELPER - INSTALATOR
echo ===========================================================
echo.
echo Skrypt zainstaluje wszystko na tym komputerze:
echo   - Node.js (portable, lokalnie w C:\kreisel)
echo   - kod aplikacji (z GitHub)
echo   - skroty na pulpicie
echo.
echo Bedziesz musiala wskazac plik .env z pendrive.
echo.
echo Instalacja trwa 5-10 minut.
echo.
pause

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup_wiola.ps1"
if errorlevel 1 (
    color 0C
    echo.
    echo INSTALACJA NIE POWIODLA SIE - sprawdz komunikaty wyzej.
    pause
    exit /b 1
)

pause
