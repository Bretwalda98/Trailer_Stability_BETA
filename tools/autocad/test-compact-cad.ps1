param(
  [string]$AutoCADCoreConsole = "C:\Program Files\Autodesk\AutoCAD 2026\accoreconsole.exe"
)

$ErrorActionPreference = "Stop"
$script = Join-Path $PSScriptRoot "test-compact-cad.scr"
$drawing = Join-Path $PSScriptRoot "SARENS_TRAILERDRAFTSMAN\Autocad Blocks\SARENS_TRAILERDRAFTSMAN_BLOCK_LIBRARY.dwg"

if (-not (Test-Path -LiteralPath $AutoCADCoreConsole)) {
  throw "AutoCAD Core Console was not found at '$AutoCADCoreConsole'."
}

$output = ((& $AutoCADCoreConsole /i $drawing /s $script /l en-US 2>&1 | Out-String) -replace "`0", "")
if ($output -notmatch "SARTD-CAD-PARSE-PASS") {
  throw "Compact CAD parser test failed.`n$output"
}
Write-Host "Compact CAD parser/contract test passed in AutoCAD Core Console."
