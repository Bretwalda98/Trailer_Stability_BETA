param(
    [int]$Port = 3000,
    [string]$HostName = "0.0.0.0"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $ProjectRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js 22.13 or newer is required."
}
if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot "node_modules"))) {
    throw "Dependencies are not installed. Run 'pnpm install' in $ProjectRoot first."
}
if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot "dist\server\index.js"))) {
    & pnpm.cmd build
    if ($LASTEXITCODE -ne 0) { throw "The production build failed." }
}

$LocalUrl = "http://127.0.0.1:$Port"
Write-Host "Starting Trailer Stability at $LocalUrl"
Write-Host "Phone access: use this computer's LAN IP with port $Port."
Start-Process $LocalUrl
& node "scripts\serve.mjs" "--hostname" $HostName "--port" $Port
