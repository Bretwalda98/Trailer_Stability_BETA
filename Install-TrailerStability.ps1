param(
    [switch]$SkipVerification
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $ProjectRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js 22.13 or newer is required. Install Node.js, then run this installer again."
}
if (-not (Get-Command pnpm.cmd -ErrorAction SilentlyContinue)) {
    throw "pnpm 9.10 or newer is required. Install it with 'corepack enable', then run this installer again."
}

Write-Host "Installing the locked Trailer Stability dependencies..."
& pnpm.cmd install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { throw "Dependency installation failed." }

if ($SkipVerification) {
    Write-Host "Building the production application..."
    & pnpm.cmd build
} else {
    Write-Host "Running the engineering, workbook and interface verification suite..."
    & pnpm.cmd test
}
if ($LASTEXITCODE -ne 0) { throw "Installation verification failed." }

Write-Host ""
Write-Host "Installation complete."
Write-Host "Run .\Start-TrailerStability.ps1 to open the application."
