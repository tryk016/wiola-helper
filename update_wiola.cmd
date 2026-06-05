@echo off
title Wiola Helper - Aktualizacja
color 0B
echo.
echo ===========================================================
echo   WIOLA HELPER - AKTUALIZACJA
echo ===========================================================
echo.
echo Skrypt pobierze najnowsza wersje z GitHub.
echo Twoje ustawienia (.env), Magemar i historia zostana zachowane.
echo.
echo WAZNE: Zamknij Wiole przed aktualizacja!
echo.
pause

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0update_wiola.ps1"
if errorlevel 1 (
    color 0C
    echo.
    echo AKTUALIZACJA NIE POWIODLA SIE - sprawdz komunikaty wyzej.
    pause
    exit /b 1
)

pause
