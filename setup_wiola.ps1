# ===========================================================================
# Wiola Helper — installer for fresh Windows PC (production)
#
# What this does (no admin needed):
#   1. Creates C:\kreisel\ folder
#   2. Downloads project ZIP from GitHub → extracts to C:\kreisel\
#   3. Downloads portable Node.js 22 LTS → C:\kreisel\nodejs\
#   4. Runs npm install in system\ and wiola-helper\
#   5. Builds wiola-helper (Vite + tsc) → dist\, dist-electron\
#   6. Opens file picker → user selects .env from USB stick
#   7. Copies .env → C:\kreisel\system\.env
#   8. Creates working folders: inbox, gotowe, bledy, wstrzymane
#   9. Creates Desktop shortcut "Wiola Helper"
#
# Total time: ~5-10 min depending on internet speed.
# ===========================================================================

$ErrorActionPreference = 'Stop'
$ProgressPreference    = 'SilentlyContinue'   # faster Invoke-WebRequest

# --- config ---------------------------------------------------------------
$ROOT          = 'C:\kreisel'
$REPO_USER     = 'tryk016'
$REPO_NAME     = 'wiola-helper'
$REPO_BRANCH   = 'main'
$NODE_VERSION  = 'v22.11.0'
$NODE_ZIP_URL  = "https://nodejs.org/dist/$NODE_VERSION/node-$NODE_VERSION-win-x64.zip"
$REPO_ZIP_URL  = "https://github.com/$REPO_USER/$REPO_NAME/archive/refs/heads/$REPO_BRANCH.zip"

# --- helpers --------------------------------------------------------------
function Step($n, $total, $msg) {
    Write-Host ""
    Write-Host "[$n/$total] $msg" -ForegroundColor Cyan
}
function Ok($msg)   { Write-Host "       OK  $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "       !!  $msg" -ForegroundColor Yellow }
function Fail($msg) { Write-Host "       BLAD $msg" -ForegroundColor Red; throw $msg }

# --- 1. project folder ----------------------------------------------------
Step 1 9 "Tworzenie folderu C:\kreisel"
if (Test-Path "$ROOT\system" -PathType Container) {
    Warn "Folder $ROOT\system juz istnieje."
    $a = Read-Host "Czy chcesz NADPISAC? Stary kod zniknie, ale .env i magemar zostana. [t/N]"
    if ($a -ne 't' -and $a -ne 'T') {
        Write-Host "Anulowano." -ForegroundColor Yellow
        exit 0
    }
    # Save .env, magemar.xlsx, queue/history state — restore after extract
    if (Test-Path "$ROOT\system\.env") { Copy-Item "$ROOT\system\.env" "$env:TEMP\wiola_env.bak" -Force }
    if (Test-Path "$ROOT\magemar.xlsx") { Copy-Item "$ROOT\magemar.xlsx" "$env:TEMP\wiola_magemar.bak" -Force }
}
if (-not (Test-Path $ROOT)) { New-Item -ItemType Directory -Path $ROOT | Out-Null }
Ok "$ROOT"

# --- 2. download project ZIP from GitHub ---------------------------------
Step 2 9 "Pobieranie kodu z GitHub"
$repoZip = "$env:TEMP\wiola_repo.zip"
try {
    Invoke-WebRequest -Uri $REPO_ZIP_URL -OutFile $repoZip -UseBasicParsing
} catch {
    Fail "Nie udalo sie pobrac z GitHub: $($_.Exception.Message)"
}
Ok "Pobrano $([math]::Round((Get-Item $repoZip).Length/1MB,1)) MB"

Write-Host "       Rozpakowywanie..."
$tmpExtract = "$env:TEMP\wiola_extract"
if (Test-Path $tmpExtract) { Remove-Item $tmpExtract -Recurse -Force }
Expand-Archive -Path $repoZip -DestinationPath $tmpExtract -Force
# repo extracts as wiola-helper-main/ — move contents up one level
$repoRoot = Get-ChildItem $tmpExtract -Directory | Select-Object -First 1
Get-ChildItem $repoRoot.FullName -Force | ForEach-Object {
    $dest = Join-Path $ROOT $_.Name
    if ($_.PSIsContainer) {
        if (Test-Path $dest) { Remove-Item $dest -Recurse -Force -ErrorAction SilentlyContinue }
    }
    Move-Item $_.FullName $dest -Force
}
Remove-Item $tmpExtract -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item $repoZip -Force -ErrorAction SilentlyContinue

# Restore backed-up env/magemar
if (Test-Path "$env:TEMP\wiola_env.bak") {
    Move-Item "$env:TEMP\wiola_env.bak" "$ROOT\system\.env" -Force
    Ok "Przywrocono stare .env"
}
if (Test-Path "$env:TEMP\wiola_magemar.bak") {
    Move-Item "$env:TEMP\wiola_magemar.bak" "$ROOT\magemar.xlsx" -Force
    Ok "Przywrocono magemar.xlsx"
}
Ok "Kod zainstalowany w $ROOT"

# Record installed commit SHA for in-app update check
try {
    $commitInfo = Invoke-RestMethod -Uri "https://api.github.com/repos/$REPO_USER/$REPO_NAME/commits/$REPO_BRANCH" -Headers @{ 'User-Agent' = 'WiolaHelper' } -TimeoutSec 10
    Set-Content -Path "$ROOT\.version" -Value $commitInfo.sha -Encoding ASCII -NoNewline
    Ok "Zapisano wersje: $($commitInfo.sha.Substring(0,8))"
} catch {
    Warn "Nie udalo sie odczytac SHA z GitHub: $($_.Exception.Message)"
}

# --- 3. download Node.js portable ----------------------------------------
Step 3 9 "Pobieranie Node.js $NODE_VERSION (portable)"
$nodeDir = "$ROOT\nodejs"
if (Test-Path "$nodeDir\node.exe") {
    Ok "Node.js juz zainstalowany w $nodeDir"
} else {
    $nodeZip = "$env:TEMP\nodejs.zip"
    Invoke-WebRequest -Uri $NODE_ZIP_URL -OutFile $nodeZip -UseBasicParsing
    Ok "Pobrano $([math]::Round((Get-Item $nodeZip).Length/1MB,1)) MB"
    Write-Host "       Rozpakowywanie..."
    Expand-Archive -Path $nodeZip -DestinationPath $ROOT -Force
    Rename-Item "$ROOT\node-$NODE_VERSION-win-x64" 'nodejs' -Force
    Remove-Item $nodeZip -Force
    Ok "Node.js zainstalowany w $nodeDir"
}
$env:Path = "$nodeDir;$nodeDir\node_modules\npm\bin;$env:Path"
$nodeVer = & "$nodeDir\node.exe" --version
$npmVer  = & "$nodeDir\npm.cmd"  --version
Ok "node $nodeVer / npm $npmVer"

# --- 4. npm install in system/ -------------------------------------------
Step 4 9 "Instalacja zaleznosci systemowych (Anthropic, MySQL, ExcelJS...)"
Push-Location "$ROOT\system"
& "$nodeDir\npm.cmd" install --silent --no-audit --no-fund --omit=dev 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Fail "npm install failed in system\" }
Pop-Location
Ok "system\node_modules zainstalowane"

# --- 5. npm install in wiola-helper/ -------------------------------------
Step 5 9 "Instalacja zaleznosci GUI (Electron, React, Vite...)"
Push-Location "$ROOT\wiola-helper"
& "$nodeDir\npm.cmd" install --silent --no-audit --no-fund 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Fail "npm install failed in wiola-helper\" }
Pop-Location
Ok "wiola-helper\node_modules zainstalowane"

# --- 6. build Wiola Helper (Vite only — pomijamy electron-builder przez symlink issue) ---
Step 6 9 "Budowanie aplikacji (Vite + Electron main/preload compile)"
Push-Location "$ROOT\wiola-helper"
$buildOut = & "$nodeDir\npm.cmd" run build:vite 2>&1
if (-not (Test-Path "$ROOT\wiola-helper\dist\index.html")) {
    Write-Host ($buildOut -join "`n")
    Fail "Build sie nie powiodl - brak dist\index.html"
}
Pop-Location
Ok "Aplikacja zbudowana (dist\ + dist-electron\)"

# --- 7. .env picker ------------------------------------------------------
Step 7 9 "Wskaz plik .env z pendrive"
Add-Type -AssemblyName System.Windows.Forms
$dlg = New-Object System.Windows.Forms.OpenFileDialog
$dlg.Title  = 'Wybierz plik .env z pendrive (od Patryka)'
$dlg.Filter = 'Plik .env|.env;*.env;wiola_env.txt;*.txt|Wszystkie pliki (*.*)|*.*'
# domyslnie pierwsza dostepna litera dysku usuwalnego
$removable = Get-CimInstance Win32_LogicalDisk -Filter "DriveType=2" | Select-Object -First 1
if ($removable) { $dlg.InitialDirectory = $removable.DeviceID + '\' }
$dlg.RestoreDirectory = $true

if ($dlg.ShowDialog() -ne 'OK') {
    Warn "Nie wybrano pliku - .env trzeba bedzie skonfigurowac recznie pozniej."
    Warn "Otwarcie Wioli > Ustawienia > wpisz tokeny QBO i ANTHROPIC_API_KEY."
} else {
    $src = $dlg.FileName
    Copy-Item $src "$ROOT\system\.env" -Force
    Ok "Skopiowano: $src -> $ROOT\system\.env"
}

# --- 8. working folders --------------------------------------------------
Step 8 9 "Tworzenie folderow roboczych"
foreach ($d in 'inbox','gotowe','bledy','wstrzymane') {
    $p = Join-Path $ROOT $d
    if (-not (Test-Path $p)) { New-Item -ItemType Directory -Path $p | Out-Null }
}
Ok "inbox, gotowe, bledy, wstrzymane"

# --- 9. desktop shortcut + start menu shortcut ---------------------------
Step 9 9 "Tworzenie skrotow (pulpit + Menu Start)"

$electronExe = "$ROOT\wiola-helper\node_modules\electron\dist\electron.exe"
if (-not (Test-Path $electronExe)) {
    Fail "Brak $electronExe - npm install w wiola-helper\ sie nie powiodl"
}

# Use .ico if present in repo, else fall back to electron.exe icon
$iconPath = "$ROOT\wiola-helper\build\icon.ico"
if (-not (Test-Path $iconPath)) { $iconPath = "${electronExe},0" }

# Backup launcher CMD (jesli ktos chce uruchomic z konsoli z logami)
$launcher = "$ROOT\Wiola Helper.cmd"
$launcherTxt = "@echo off`r`ntitle Wiola Helper`r`ncd /d `"$ROOT\wiola-helper`"`r`n`"$electronExe`" ."
Set-Content -Encoding ASCII -Path $launcher -Value $launcherTxt

# Funkcja tworzaca skrot
function New-Shortcut($targetPath, $shortcutPath, $arg1, $workDir, $icon, $desc) {
    $dir = Split-Path $shortcutPath -Parent
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $ws = New-Object -ComObject WScript.Shell
    $sc = $ws.CreateShortcut($shortcutPath)
    $sc.TargetPath       = $targetPath
    $sc.Arguments        = $arg1
    $sc.WorkingDirectory = $workDir
    $sc.IconLocation     = $icon
    $sc.WindowStyle      = 1
    $sc.Description      = $desc
    $sc.Save()
}

$shortcutDesc = 'Wiola Helper - automatyzacja faktur Kreisel'

# 1) Pulpit
$desktop      = [Environment]::GetFolderPath('Desktop')
$desktopLnk   = Join-Path $desktop 'Wiola Helper.lnk'
New-Shortcut $electronExe $desktopLnk '.' "$ROOT\wiola-helper" $iconPath $shortcutDesc
Ok "Pulpit:    $desktopLnk"

# 2) Menu Start (Wszystkie aplikacje)
$startMenu    = [Environment]::GetFolderPath('Programs')
$startMenuLnk = Join-Path $startMenu 'Wiola Helper.lnk'
New-Shortcut $electronExe $startMenuLnk '.' "$ROOT\wiola-helper" $iconPath $shortcutDesc
Ok "Menu Start: $startMenuLnk"

# 3) Pinujemy do paska zadan (best-effort - Windows 10/11 blokuje to czesto)
try {
    $shell = New-Object -ComObject Shell.Application
    $folder = $shell.Namespace((Split-Path $desktopLnk -Parent))
    $item = $folder.ParseName((Split-Path $desktopLnk -Leaf))
    $verb = $item.Verbs() | Where-Object { $_.Name -match 'pasek zadan|taskbar' } | Select-Object -First 1
    if ($verb) { $verb.DoIt() }
} catch { }

# --- summary -------------------------------------------------------------
Write-Host ""
Write-Host "===========================================================" -ForegroundColor Green
Write-Host "   GOTOWE!" -ForegroundColor Green
Write-Host "===========================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Aplikacja:   $ROOT\wiola-helper\"
Write-Host "  Skrot:       Pulpit -> Wiola Helper"
Write-Host "  Foldery:     $ROOT\inbox, gotowe, bledy, wstrzymane"
Write-Host "  Magemar:     $ROOT\magemar.xlsx  (sciagasz codziennie z SharePoint)"
Write-Host "  Logi:        $ROOT\log.txt"
Write-Host ""
Write-Host "  Codzienna praca:"
Write-Host "    1. Rano zapisz magemar.xlsx do $ROOT\magemar.xlsx"
Write-Host "    2. Klik 2x na 'Wiola Helper' na pulpicie"
Write-Host "    3. Przeciagnij PDFy faktur Kreisla do okna"
Write-Host "    4. Klik 'Skanuj' - program odczyta wszystkie faktury"
Write-Host "    5. Sprawdz/popraw pozycje w edytorze (kurs, ilosci, ceny)"
Write-Host "    6. Klik 'Upload do QuickBooks'"
Write-Host ""
