@echo off
chcp 65001 >nul
title Kreisel - DRY RUN [bez postowania]

REM Use local portable Node if available, else system Node
if exist "C:\kreisel\system\nodejs\node.exe" (
    set "NODE_EXE=C:\kreisel\system\nodejs\node.exe"
) else (
    set "NODE_EXE=node"
)

cd /d C:\kreisel\system
echo.
echo =======================================================================
echo   SPRAWDZENIE FAKTUR - TRYB DRY-RUN [NIC NIE WYSLE DO QBO]
echo =======================================================================
echo.
echo   Skrypt sprawdzi czy kazdy PDF da sie sparsowac i wystawic,
echo   ale NIE wysyla nic do QBO i NIE przenosi plikow.
echo.
echo   Przydatne by zobaczyc podglad przed prawdziwym posting.
echo.
pause
echo.
"%NODE_EXE%" process_inbox.js
echo.
echo =======================================================================
echo   TO BYL DRY-RUN. Nic nie zostalo wyslane.
echo   Jesli wyniki sa OK, uruchom: 3_Procesuj_faktury.cmd
echo =======================================================================
pause
