param(
  [string]$AutoCADCoreConsole = "C:\Program Files\Autodesk\AutoCAD 2026\accoreconsole.exe"
)

$ErrorActionPreference = "Stop"
$dwg = Join-Path $PSScriptRoot "SARENS_TRAILERDRAFTSMAN\Autocad Blocks\SARENS_TRAILERDRAFTSMAN_BLOCK_LIBRARY.dwg"
$script = Join-Path $PSScriptRoot "test-json-modelspace-smoke.scr"

if (-not (Test-Path -LiteralPath $AutoCADCoreConsole)) {
  throw "AutoCAD Core Console was not found at '$AutoCADCoreConsole'."
}

$output = ((& $AutoCADCoreConsole /i $dwg /s $script /l en-US 2>&1 | Out-String) -replace "`0", "")
if ($output -notlike "*V118_JSON_MODELSPACE_SMOKE_PASS*") {
  throw "JSON ModelSpace smoke test failed.`n$output"
}

Write-Host "JSON ModelSpace smoke test passed."
