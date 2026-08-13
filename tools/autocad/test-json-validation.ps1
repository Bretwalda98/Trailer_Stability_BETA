param(
  [string]$AutoCADCoreConsole = "C:\Program Files\Autodesk\AutoCAD 2026\accoreconsole.exe"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$lsp = Join-Path $PSScriptRoot "SARENS_TRAILERDRAFTSMAN\SARENS_TRAILERDRAFTSMAN_v1.1.lsp"
$dwg = Join-Path $PSScriptRoot "SARENS_TRAILERDRAFTSMAN\Autocad Blocks\SARENS_TRAILERDRAFTSMAN_BLOCK_LIBRARY.dwg"
$validationScript = Join-Path $PSScriptRoot "test-json-validation.scr"
$missingScript = Join-Path $PSScriptRoot "test-json-missing-file.scr"
$fixtures = Join-Path $PSScriptRoot "test-fixtures"

if (-not (Test-Path -LiteralPath $AutoCADCoreConsole)) {
  throw "AutoCAD Core Console was not found at '$AutoCADCoreConsole'. Pass -AutoCADCoreConsole with the installed accoreconsole.exe path."
}

function Invoke-CoreTest {
  param(
    [Parameter(Mandatory)] [string]$Script,
    [Parameter(Mandatory)] [string]$Fixture,
    [Parameter(Mandatory)] [string]$ExpectedLogText,
    [string]$LogPath = "$Fixture.lisp.log"
  )

  $env:SARTD_JSON_TEST_FILE = $Fixture
  Remove-Item -LiteralPath $LogPath -Force -ErrorAction SilentlyContinue
  $null = & $AutoCADCoreConsole /i $dwg /s $Script /l en-US 2>&1
  if (-not (Test-Path -LiteralPath $LogPath)) {
    throw "No JSON diagnostic log was produced for '$Fixture'."
  }
  $log = Get-Content -LiteralPath $LogPath -Raw
  if ($log -notlike "*$ExpectedLogText*") {
    throw "Fixture '$Fixture' did not produce expected log text '$ExpectedLogText'.`n$log"
  }
  [pscustomobject]@{ Fixture = Split-Path -Leaf $Fixture; Expected = $ExpectedLogText; Result = "PASS" }
}

$cases = @(
  @{ Name = "valid-three-point.json"; Expected = "SARTDJSONDATA complete." },
  @{ Name = "valid-four-point.json"; Expected = "SARTDJSONDATA complete." },
  @{ Name = "invalid-json.txt"; Expected = "JSON object key must be a string." },
  @{ Name = "wrong-key.json"; Expected = "Unsupported JSON keyId." },
  @{ Name = "wrong-version.json"; Expected = "Unsupported JSON version." },
  @{ Name = "missing-cargo.json"; Expected = "Cargo object data.cg is missing." },
  @{ Name = "missing-trailer.json"; Expected = "At least one active trailer is required." },
  @{ Name = "invalid-three-point.json"; Expected = "Stability polygon must contain at least three points." },
  @{ Name = "invalid-four-point.json"; Expected = "Four-point hydraulic mode requires four polygon points." }
)

$results = foreach ($case in $cases) {
  Invoke-CoreTest `
    -Script $validationScript `
    -Fixture (Join-Path $fixtures $case.Name) `
    -ExpectedLogText $case.Expected
}

$missingFixture = Join-Path $fixtures "valid-three-point.json"
$results += Invoke-CoreTest `
  -Script $missingScript `
  -Fixture $missingFixture `
  -ExpectedLogText "Cannot open JSON file:" `
  -LogPath "$missingFixture.missing.lisp.log"

$results | Format-Table -AutoSize
Write-Host "JSON AutoCAD validation matrix passed: $($results.Count) cases."
