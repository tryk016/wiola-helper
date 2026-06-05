# ===========================================================================
# Wiola Helper — UPDATE script (downloads latest from GitHub, rebuilds GUI)
#
# Preserves:
#   - C:\kreisel\system\.env (credentials)
#   - C:\kreisel\magemar.xlsx (today's manifest)
#   - C:\kreisel\nodejs\ (Node.js, never re-downloaded)
#   - C:\kreisel\wiola-helper\node_modules\ (rebuilds only if package.json changed)
#   - %APPDATA%\Wiola Helper\state\ (queue, history, prefs — kept by Wiola Helper itself)
#
# Replaces:
#   - all *.js / *.ts / *.tsx / *.json / *.md / *.html source files
#
# Total time: ~2-5 min depending on whether npm install is needed.
# ===========================================================================

$ErrorActionPreference = 'Stop'
$ProgressPreference    = 'SilentlyContinue'

$ROOT          = 'C:\kreisel'
$REPO_USER     = 'tryk016'
$REPO_NAME     = 'wiola-helper'
$REPO_BRANCH   = 'main'
$REPO_ZIP_URL  = "https://github.com/$REPO_USER/$REPO_NAME/archive/refs/heads/$REPO_BRANCH.zip"

function Step($n, $total, $msg) {
    Write-Host ""
    Write-Host "[$n/$total] $msg" -ForegroundColor Cyan
}
function Ok($msg)   { Write-Host "       OK  $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "       !!  $msg" -ForegroundColor Yellow }
function Fail($msg) { Write-Host "       BLAD $msg" -ForegroundColor Red; throw $msg }

# --- 0. sanity check -----------------------------------------------------
if (-not (Test-Path "$ROOT\system" -PathType Container)) {
    Fail "Brak $ROOT\system - najpierw uruchom setup_wiola.cmd (pierwsza instalacja)."
}
if (-not (Test-Path "$ROOT\nodejs\node.exe")) {
    Fail "Brak Node.js w $ROOT\nodejs - uruchom najpierw setup_wiola.cmd."
}
$nodeDir = "$ROOT\nodejs"

# --- 1. is Wiola Helper running? -----------------------------------------
Step 1 6 "Sprawdzanie czy Wiola Helper jest zamknieta"
$running = Get-Process -Name electron -ErrorAction SilentlyContinue
if ($running) {
    Warn "Wiola Helper jest uruchomiona - probuje zamknac..."
    $running | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    if (Get-Process -Name electron -ErrorAction SilentlyContinue) {
        Fail "Nie udalo sie zamknac Wioli. Zamknij recznie i sprobuj ponownie."
    }
}
Ok "Aplikacja zamknieta"

# --- 2. backup .env + magemar --------------------------------------------
Step 2 6 "Backup ustawien i Magemar"
$bakDir = "$env:TEMP\wiola_update_bak"
if (Test-Path $bakDir) { Remove-Item $bakDir -Recurse -Force }
New-Item -ItemType Directory -Path $bakDir | Out-Null
if (Test-Path "$ROOT\system\.env")  { Copy-Item "$ROOT\system\.env"  "$bakDir\.env"  -Force }
if (Test-Path "$ROOT\magemar.xlsx") { Copy-Item "$ROOT\magemar.xlsx" "$bakDir\magemar.xlsx" -Force }
Ok "Backup w $bakDir"

# --- 3. download latest ZIP from GitHub ----------------------------------
Step 3 6 "Pobieranie najnowszej wersji z GitHub"
$repoZip = "$env:TEMP\wiola_update.zip"
if (Test-Path $repoZip) { Remove-Item $repoZip -Force }
try {
    Invoke-WebRequest -Uri $REPO_ZIP_URL -OutFile $repoZip -UseBasicParsing
} catch {
    Fail "Nie udalo sie pobrac z GitHub: $($_.Exception.Message)"
}
Ok "Pobrano $([math]::Round((Get-Item $repoZip).Length/1MB,1)) MB"

# --- 4. extract + overwrite source files ---------------------------------
Step 4 6 "Aktualizacja plikow zrodlowych"
$tmpExtract = "$env:TEMP\wiola_update_extract"
if (Test-Path $tmpExtract) { Remove-Item $tmpExtract -Recurse -Force }
Expand-Archive -Path $repoZip -DestinationPath $tmpExtract -Force
$repoRoot = (Get-ChildItem $tmpExtract -Directory | Select-Object -First 1).FullName

# Files/folders we NEVER overwrite (preserve local state)
$preserve = @(
    'system\.env',
    'magemar.xlsx',
    'nodejs',
    'system\node_modules',
    'wiola-helper\node_modules',
    'wiola-helper\dist',
    'wiola-helper\dist-electron',
    'inbox',
    'gotowe',
    'bledy',
    'wstrzymane',
    'log.txt',
    'order_history.json',
    'recommendations2.json',
    '.git'
)

# package.json change detection (signals npm install needed)
$systemPkgChanged = $false
$guiPkgChanged    = $false
if (Test-Path "$repoRoot\system\package.json" -PathType Leaf) {
    $oldHash = (Get-FileHash "$ROOT\system\package.json" -Algorithm SHA256 -ErrorAction SilentlyContinue).Hash
    $newHash = (Get-FileHash "$repoRoot\system\package.json" -Algorithm SHA256).Hash
    if ($oldHash -ne $newHash) { $systemPkgChanged = $true }
}
if (Test-Path "$repoRoot\wiola-helper\package.json" -PathType Leaf) {
    $oldHash = (Get-FileHash "$ROOT\wiola-helper\package.json" -Algorithm SHA256 -ErrorAction SilentlyContinue).Hash
    $newHash = (Get-FileHash "$repoRoot\wiola-helper\package.json" -Algorithm SHA256).Hash
    if ($oldHash -ne $newHash) { $guiPkgChanged = $true }
}

# Copy all files except preserved ones (overwrite)
$count = 0
Get-ChildItem $repoRoot -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($repoRoot.Length + 1)
    $skip = $false
    foreach ($p in $preserve) {
        if ($rel -like "$p*" -or $rel -eq $p) { $skip = $true; break }
    }
    if ($skip) { return }
    $dest = Join-Path $ROOT $rel
    $destDir = Split-Path $dest -Parent
    if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
    Copy-Item $_.FullName $dest -Force
    $count++
}
Ok "Zaktualizowano $count plikow"

# Record new commit SHA
try {
    $commitInfo = Invoke-RestMethod -Uri "https://api.github.com/repos/$REPO_USER/$REPO_NAME/commits/$REPO_BRANCH" -Headers @{ 'User-Agent' = 'WiolaHelper' } -TimeoutSec 10
    Set-Content -Path "$ROOT\.version" -Value $commitInfo.sha -Encoding ASCII -NoNewline
    Ok "Wersja: $($commitInfo.sha.Substring(0,8))"
} catch {
    Warn "Nie udalo sie odczytac SHA z GitHub: $($_.Exception.Message)"
}

# --- 5. npm install if package.json changed ------------------------------
Step 5 6 "Sprawdzanie zaleznosci"
if ($systemPkgChanged) {
    Write-Host "       package.json (system) zmienione - npm install..."
    Push-Location "$ROOT\system"
    & "$nodeDir\npm.cmd" install --silent --no-audit --no-fund --omit=dev 2>&1 | Out-Null
    Pop-Location
    Ok "system\node_modules zaktualizowane"
} else {
    Ok "system\package.json bez zmian"
}
if ($guiPkgChanged) {
    Write-Host "       package.json (wiola-helper) zmienione - npm install..."
    Push-Location "$ROOT\wiola-helper"
    & "$nodeDir\npm.cmd" install --silent --no-audit --no-fund 2>&1 | Out-Null
    Pop-Location
    Ok "wiola-helper\node_modules zaktualizowane"
} else {
    Ok "wiola-helper\package.json bez zmian"
}

# --- 6. rebuild GUI ------------------------------------------------------
Step 6 6 "Budowanie nowej wersji GUI"
Push-Location "$ROOT\wiola-helper"
$buildOut = & "$nodeDir\npm.cmd" run build:vite 2>&1
if (-not (Test-Path "$ROOT\wiola-helper\dist\index.html")) {
    Write-Host ($buildOut -join "`n")
    Fail "Build sie nie powiodl"
}
Pop-Location
Ok "GUI zbudowane"

# --- restore .env + magemar (powinny i tak byc - preserve list je chronil) ---
if ((Test-Path "$bakDir\.env") -and (-not (Test-Path "$ROOT\system\.env"))) {
    Copy-Item "$bakDir\.env" "$ROOT\system\.env" -Force
    Warn "Przywrocono .env z backupu"
}
if ((Test-Path "$bakDir\magemar.xlsx") -and (-not (Test-Path "$ROOT\magemar.xlsx"))) {
    Copy-Item "$bakDir\magemar.xlsx" "$ROOT\magemar.xlsx" -Force
    Warn "Przywrocono magemar.xlsx z backupu"
}

# Cleanup
Remove-Item $repoZip -Force -ErrorAction SilentlyContinue
Remove-Item $tmpExtract -Recurse -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "===========================================================" -ForegroundColor Green
Write-Host "   AKTUALIZACJA ZAKONCZONA" -ForegroundColor Green
Write-Host "===========================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Mozesz teraz otworzyc Wiola Helper z pulpitu."
Write-Host ""
