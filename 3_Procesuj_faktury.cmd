@echo off
chcp 65001 >nul
title Kreisel - procesowanie faktur

if exist "C:\kreisel\system\nodejs\node.exe" (
    set "NODE_EXE=C:\kreisel\system\nodejs\node.exe"
) else (
    set "NODE_EXE=node"
)

cd /d C:\kreisel\system
echo.
echo =======================================================================
echo   PROCESOWANIE FAKTUR KREISEL - TRYB POSTING
echo =======================================================================
echo.
echo   PRZED uruchomieniem upewnij sie ze:
echo     1. Magemar Excel jest swiezy [pobralas dzis z SharePoint]
echo        ^(C:\kreisel\magemar.xlsx^)
echo     2. PDFy faktur sa w  C:\kreisel\inbox\
echo.
echo   Skrypt:
echo     - Przeczyta kazdy PDF
echo     - Wystawi 3 dokumenty w QBO [Pro Bill, Invoice, Store Bill]
echo     - Przeniesie PDF do gotowe\ albo bledy\ albo wstrzymane\
echo.
pause
echo.
"%NODE_EXE%" process_inbox.js --post
echo.
echo =======================================================================
pause
