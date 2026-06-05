@echo off
title Wiola Helper - naprawa skrotu
color 0B
echo.
echo ===========================================================
echo   NAPRAWA SKROTU "Wiola Helper" (bez czarnej konsoli)
echo ===========================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ROOT='C:\kreisel';" ^
  "$exe = Join-Path $ROOT 'wiola-helper\node_modules\electron\dist\electron.exe';" ^
  "if (-not (Test-Path $exe)) { Write-Host '[BLAD] Brak electron.exe - uruchom najpierw setup_wiola.cmd' -ForegroundColor Red; exit 1 };" ^
  "$icon = Join-Path $ROOT 'wiola-helper\build\icon.ico';" ^
  "if (-not (Test-Path $icon)) { $icon = $exe + ',0' };" ^
  "$desktop = [Environment]::GetFolderPath('Desktop');" ^
  "$startMenu = [Environment]::GetFolderPath('Programs');" ^
  "foreach ($lnkPath in @((Join-Path $desktop 'Wiola Helper.lnk'), (Join-Path $startMenu 'Wiola Helper.lnk'))) {" ^
  "    if (Test-Path $lnkPath) { Remove-Item $lnkPath -Force };" ^
  "    $ws = New-Object -ComObject WScript.Shell;" ^
  "    $sc = $ws.CreateShortcut($lnkPath);" ^
  "    $sc.TargetPath = $exe;" ^
  "    $sc.Arguments = '.';" ^
  "    $sc.WorkingDirectory = Join-Path $ROOT 'wiola-helper';" ^
  "    $sc.IconLocation = $icon;" ^
  "    $sc.WindowStyle = 1;" ^
  "    $sc.Description = 'Wiola Helper - automatyzacja faktur Kreisel';" ^
  "    $sc.Save();" ^
  "    Write-Host ('[OK] ' + $lnkPath) -ForegroundColor Green" ^
  "}"

if errorlevel 1 (
    color 0C
    echo.
    echo NAPRAWA NIE POWIODLA SIE
    pause
    exit /b 1
)

color 0A
echo.
echo ===========================================================
echo   GOTOWE - skroty wskazuja teraz bezposrednio na electron.exe
echo   (juz nie pokazuje czarnej konsoli przy uruchamianiu)
echo ===========================================================
echo.
pause
