# build.ps1 — Production build for Windows x64
# Run from the /sane directory: .\build.ps1

$ErrorActionPreference = "Stop"
$target  = "x86_64-pc-windows-msvc"
$binOut  = "src-tauri\binaries\sane-backend-$target.exe"
$exeOut  = "src-tauri\target\release\sane.exe"
$bundleDir = "src-tauri\target\release\bundle"
$start   = Get-Date

function Step($label) {
    Write-Host ""
    Write-Host "==> $label" -ForegroundColor Cyan
}

function Ok($msg) {
    Write-Host "    $msg" -ForegroundColor Green
}

function Fail($msg) {
    Write-Host ""
    Write-Host "ERROR: $msg" -ForegroundColor Red
    exit 1
}

# ── Kill running instance ─────────────────────────────────

foreach ($proc in @("sane", "sane-backend")) {
    $p = Get-Process -Name $proc -ErrorAction SilentlyContinue
    if ($p) {
        Write-Host "==> Stopping $proc..." -ForegroundColor Yellow
        $p | Stop-Process -Force
    }
}
Start-Sleep -Milliseconds 1000

# ── Dependency check ──────────────────────────────────────

Step "Checking dependencies"

if (-not (Get-Command go    -ErrorAction SilentlyContinue)) { Fail "Go not found. Install from https://go.dev/dl/" }
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) { Fail "Rust not found. Install from https://rustup.rs" }
if (-not (Get-Command npm   -ErrorAction SilentlyContinue)) { Fail "Node.js not found. Install from https://nodejs.org" }

Ok "go      $(go version)"
Ok "cargo   $(cargo --version)"
Ok "npm     $(npm --version)"

# ── Clean stale build artifacts ───────────────────────────

Remove-Item -Recurse -Force "src-tauri\target\release\build\sane-*" -ErrorAction SilentlyContinue

# ── Go sidecar ────────────────────────────────────────────

Step "Building Go backend"

New-Item -ItemType Directory -Force -Path "src-tauri\binaries" | Out-Null
Push-Location backend
try {
    go build -ldflags="-s -w" -o "..\$binOut" .
    if ($LASTEXITCODE -ne 0) { throw "go build failed (exit $LASTEXITCODE)" }
} finally {
    Pop-Location
}

Ok "$binOut"

# ── npm install ───────────────────────────────────────────

Step "Installing npm dependencies"
npm install --prefer-offline --silent
if ($LASTEXITCODE -ne 0) { Fail "npm install failed" }
Ok "done"

# ── Tauri build ───────────────────────────────────────────

Step "Building Tauri app (first run takes a few minutes)"
npm run build
if ($LASTEXITCODE -ne 0) { Fail "tauri build failed" }

# ── Done ──────────────────────────────────────────────────

$elapsed = [math]::Round(((Get-Date) - $start).TotalSeconds)

Write-Host ""
Write-Host "Done in ${elapsed}s" -ForegroundColor Green
Write-Host ""
Write-Host "  Standalone : $exeOut"
Write-Host "  Installers : src-tauri\target\release\bundle\"
Write-Host ""

if (Test-Path $exeOut) {
    $choice = Read-Host "Open output folder? [y/N]"
    if ($choice -eq 'y') {
        explorer.exe "src-tauri\target\release"
    }
}
