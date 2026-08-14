param(
  [string]$AutoCADCoreConsole = "C:\Program Files\Autodesk\AutoCAD 2026\accoreconsole.exe"
)

$ErrorActionPreference = "Stop"
$dwg = Join-Path $PSScriptRoot "SARENS_TRAILERDRAFTSMAN\Autocad Blocks\SARENS_TRAILERDRAFTSMAN_BLOCK_LIBRARY.dwg"
$script = Join-Path $PSScriptRoot "test-sartdrun-source-routing.scr"

if (-not (Test-Path -LiteralPath $AutoCADCoreConsole)) {
  throw "AutoCAD Core Console was not found at '$AutoCADCoreConsole'."
}

$output = ((& $AutoCADCoreConsole /i $dwg /s $script /l en-US 2>&1 | Out-String) -replace "`0", "")
$required = @(
  "V118_JSON_PAPERSPACE_DATA_PASS",
  "V118_JSON_SKIPS_EXCEL_DEBUG_PASS",
  "V118_EXCEL_SINGLE_SELECTION_PASS",
  "V118_JSON_SINGLE_SELECTION_PASS",
  "V118_SARTDRUN_JSON_ROUTE_PASS",
  "V118_SARTDRUN_EXCEL_ROUTE_PASS"
)

foreach ($marker in $required) {
  if ($output -notlike "*$marker*") {
    throw "SARTDRUN source-routing regression failed: missing '$marker'.`n$output"
  }
}

[pscustomobject]@{
  ExcelSelections = 1
  ExcelReads = 1
  JsonSelections = 1
  JsonParses = 1
  JsonPaperSpaceData = "PASS"
  CommonWorkflow = "PASS"
  Routes = "Excel, JSON"
} | Format-List

Write-Host "SARTDRUN v1.18 single-selection and source-routing checks passed."
