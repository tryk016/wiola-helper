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
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$ROOT          = 'C:\kreisel'
$REPO_USER     = 'tryk016'
$REPO_NAME     = 'wiola-helper'
$REPO_BRANCH   = 'main'
# API zipball (not github.com/archive) — also accepts a token if the repo goes private
$REPO_ZIP_URL  = "https://api.github.com/repos/$REPO_USER/$REPO_NAME/zipball/$REPO_BRANCH"

function Step($n, $total, $msg) {
    Write-Host ""
    Write-Host "[$n/$total] $msg" -ForegroundColor Cyan
}
function Ok($msg)   { Write-Host "       OK  $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "       !!  $msg" -ForegroundColor Yellow }
function Fail($msg) { Write-Host "       BLAD $msg" -ForegroundColor Red; throw $msg }

# Value of KEY=... in a .env file (quotes stripped), '' if absent.
function Get-EnvValue($path, $key) {
    if (-not (Test-Path $path)) { return '' }
    foreach ($line in Get-Content $path) {
        if ($line -match "^\s*$key\s*=(.*)$") { return $Matches[1].Trim().Trim("'").Trim('"') }
    }
    return ''
}
function GitHubHeaders($token) {
    $h = @{ 'User-Agent' = 'WiolaHelper'; 'Accept' = 'application/vnd.github+json' }
    if ($token) { $h['Authorization'] = "Bearer $token" }
    return $h
}
function GitHubStatus($err) { try { return [int]$err.Exception.Response.StatusCode } catch { return 0 } }
# Readable message for a failed GitHub request (a private repo answers 404 without access).
function GitHubError($err, $token) {
    $code = GitHubStatus $err
    if ($code -in 401, 403, 404) {
        if ($token) { return "GitHub odrzucil token (HTTP $code). Token wygasl albo nie ma dostepu do $REPO_USER/$REPO_NAME - wpisz nowy w Wiola Helper > Ustawienia > Token GitHub albo popros Patryka." }
        return "GitHub nie wpuszcza bez tokena (HTTP $code) - repozytorium jest prywatne, potrzebny GITHUB_TOKEN od Patryka."
    }
    return $err.Exception.Message
}
# Download the repo ZIP. A public repo needs no token; if GitHub refuses an
# anonymous request (repo made private), ask for a token once and retry.
# Returns the token that worked ('' = none needed).
function Get-RepoZip($token, $outFile) {
    try {
        Invoke-WebRequest -Uri $REPO_ZIP_URL -Headers (GitHubHeaders $token) -OutFile $outFile -UseBasicParsing
        return $token
    } catch {
        if ($token -or ((GitHubStatus $_) -notin 401, 403, 404)) { Fail "Nie udalo sie pobrac z GitHub: $(GitHubError $_ $token)" }
    }
    Warn "GitHub nie wpuszcza bez tokena (repozytorium prywatne)."
    $token = (Read-Host "Wklej token GitHub od Patryka i nacisnij Enter").Trim()
    if (-not $token) { Fail "Bez tokena GitHub nie da sie pobrac aktualizacji." }
    try {
        Invoke-WebRequest -Uri $REPO_ZIP_URL -Headers (GitHubHeaders $token) -OutFile $outFile -UseBasicParsing
    } catch {
        Fail "Nie udalo sie pobrac z GitHub: $(GitHubError $_ $token)"
    }
    return $token
}

# --- 0. sanity check -----------------------------------------------------
if (-not (Test-Path "$ROOT\system" -PathType Container)) {
    Fail "Brak $ROOT\system - najpierw uruchom setup_wiola.cmd (pierwsza instalacja)."
}
if (-not (Test-Path "$ROOT\nodejs\node.exe")) {
    Fail "Brak Node.js w $ROOT\nodejs - uruchom najpierw setup_wiola.cmd."
}
$nodeDir = "$ROOT\nodejs"

# Optional: only needed if the repo is private (see Get-RepoZip).
$envPath  = "$ROOT\system\.env"
$GH_TOKEN = Get-EnvValue $envPath 'GITHUB_TOKEN'

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
$usedToken = Get-RepoZip $GH_TOKEN $repoZip
if ($usedToken -and -not $GH_TOKEN) {
    # typed in just now -> keep it for the next update and the in-app check
    Add-Content -Path $envPath -Value "`r`nGITHUB_TOKEN=$usedToken" -Encoding ASCII
    Ok "Zapisano GITHUB_TOKEN w .env"
}
$GH_TOKEN = $usedToken
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
# (SHA zapisujemy do .version dopiero PO udanym buildzie ponizej, zeby nieudany
#  build nigdy nie raportowal falszywie "masz najnowsza wersje")

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
# Vite wypisuje "CJS build deprecated" na stderr; przy EAP=Stop + 2>&1 to
# przewraca skrypt mimo udanego buildu. Zmiekczamy EAP i oceniamy po dist.
$prevEAP = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
& "$nodeDir\npm.cmd" run build:vite 2>&1 | ForEach-Object { Write-Host "       $_" }
$ErrorActionPreference = $prevEAP
Pop-Location
if (-not (Test-Path "$ROOT\wiola-helper\dist\index.html")) {
    Fail "Build sie nie powiodl (zobacz komunikaty wyzej)"
}
Ok "GUI zbudowane"

# Record new commit SHA ONLY after a successful build, so .version never
# claims "up to date" when the rebuild actually failed.
try {
    $commitInfo = Invoke-RestMethod -Uri "https://api.github.com/repos/$REPO_USER/$REPO_NAME/commits/$REPO_BRANCH" -Headers (GitHubHeaders $GH_TOKEN) -TimeoutSec 10
    Set-Content -Path "$ROOT\.version" -Value $commitInfo.sha -Encoding ASCII -NoNewline
    Ok "Wersja: $($commitInfo.sha.Substring(0,8))"
} catch {
    Warn "Nie udalo sie odczytac SHA z GitHub: $($_.Exception.Message)"
}

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

# --- Rebuild shortcuts (fixes old shortcuts pointing to .cmd which opened a console window) ---
Write-Host ""
Write-Host "[+] Odbudowuje skroty (pulpit + Menu Start)" -ForegroundColor Cyan
$electronExe = "$ROOT\wiola-helper\node_modules\electron\dist\electron.exe"
if (Test-Path $electronExe) {
    $iconPath = "$ROOT\wiola-helper\build\icon.ico"
    if (-not (Test-Path $iconPath)) { $iconPath = "${electronExe},0" }

    $desktop      = [Environment]::GetFolderPath('Desktop')
    $startMenu    = [Environment]::GetFolderPath('Programs')
    $shortcutDesc = 'Wiola Helper - automatyzacja faktur Kreisel'

    foreach ($lnkPath in @((Join-Path $desktop 'Wiola Helper.lnk'),
                           (Join-Path $startMenu 'Wiola Helper.lnk'))) {
        # Delete old shortcut first to force WSH to fully rewrite (avoids stale TargetPath)
        if (Test-Path $lnkPath) { Remove-Item $lnkPath -Force -ErrorAction SilentlyContinue }
        $dir = Split-Path $lnkPath -Parent
        if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
        $ws = New-Object -ComObject WScript.Shell
        $sc = $ws.CreateShortcut($lnkPath)
        $sc.TargetPath       = $electronExe
        $sc.Arguments        = '.'
        $sc.WorkingDirectory = "$ROOT\wiola-helper"
        $sc.IconLocation     = $iconPath
        $sc.WindowStyle      = 1
        $sc.Description      = $shortcutDesc
        $sc.Save()
        Ok "Skrot: $lnkPath"
    }
} else {
    Warn "Brak $electronExe - skroty nie zostaly odbudowane"
}

Write-Host ""
Write-Host "===========================================================" -ForegroundColor Green
Write-Host "   AKTUALIZACJA ZAKONCZONA" -ForegroundColor Green
Write-Host "===========================================================" -ForegroundColor Green
Write-Host ""

# Auto-relaunch Wiola Helper so the user doesn't have to. Hidden runs of this
# script via VBS won't have a console anyway; visible runs (manual cmd) finish
# and exit.
$electronExe = "$ROOT\wiola-helper\node_modules\electron\dist\electron.exe"
if (Test-Path $electronExe) {
    try {
        Start-Process -FilePath $electronExe -ArgumentList '.' -WorkingDirectory "$ROOT\wiola-helper"
        Ok "Wiola Helper uruchomiona ponownie"
    } catch {
        Warn "Nie udalo sie uruchomic Wioli: $($_.Exception.Message)"
    }
} else {
    Warn "Brak electron.exe - uruchom Wiole recznie z pulpitu"
}
