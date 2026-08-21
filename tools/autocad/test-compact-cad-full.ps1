param(
  [string]$AutoCAD = "C:\Program Files\Autodesk\AutoCAD 2026\acad.exe",
  [int]$TimeoutSeconds = 60
)

$ErrorActionPreference = "Stop"
$script = Join-Path $PSScriptRoot "test-compact-cad-full.scr"
$result = Join-Path $PSScriptRoot "test-compact-cad-full.result"

if (-not (Test-Path -LiteralPath $AutoCAD)) {
  throw "AutoCAD was not found at '$AutoCAD'."
}

Remove-Item -LiteralPath $result -Force -ErrorAction SilentlyContinue
$process = Start-Process -FilePath $AutoCAD -ArgumentList @("/nologo", "/t", "acadiso.dwt", "/b", $script) -WindowStyle Hidden -PassThru
$deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
while (-not (Test-Path -LiteralPath $result) -and -not $process.HasExited -and [DateTime]::UtcNow -lt $deadline) {
  Start-Sleep -Milliseconds 500
  $process.Refresh()
}

if (-not (Test-Path -LiteralPath $result) -and -not $process.HasExited) {
  $process.Kill()
  throw "Full AutoCAD compact CAD smoke test exceeded $TimeoutSeconds seconds."
}
if (-not (Test-Path -LiteralPath $result)) {
  throw "Full AutoCAD compact CAD smoke test did not create its result marker."
}

# The drawing result is authoritative. Some AutoCAD installations keep the hidden application
# alive on a template/save prompt even after the batch script reaches QUIT, so close only this
# isolated test process once the marker has been flushed.
if (-not $process.HasExited) {
  $process.Kill()
  $process.WaitForExit()
}

$output = Get-Content -LiteralPath $result -Raw
if ($output -notmatch "SARTD-CAD-FULL-DRAW-PASS") {
  throw "Full AutoCAD compact CAD smoke test failed.`n$output"
}

Write-Host "Full AutoCAD compact CAD drawing smoke test passed."
Write-Host $output.Trim()
Remove-Item -LiteralPath $result -Force -ErrorAction SilentlyContinue
