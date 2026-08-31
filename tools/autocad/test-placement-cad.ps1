param([switch]$FullAutoCAD, [string]$PackageRoot = (Join-Path $PSScriptRoot "SARENS_TRAILERDRAFTSMAN"))
$ErrorActionPreference = "Stop"
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "../.."))
$out = Join-Path $repo "test-output/cad-placement"
$root = [IO.Path]::GetFullPath($PackageRoot).Replace('\','/')
$fixture = $out.Replace('\','/')
$marker = Join-Path $out $(if ($FullAutoCAD) { "full.result" } else { "core.result" })
$script = Join-Path $out "placement-test.scr"
$legacy = (Join-Path $PSScriptRoot "test-fixtures/valid-compact-four-point.sartd").Replace('\','/')
$draw = if ($FullAutoCAD) { "T" } else { "nil" }
$body = @"
(setenv "SARTD_LSP_FOLDER" "$root")
(load "$root/SARENS_TRAILERDRAFTSMAN_v1.1.lsp")
(setenv "SARTD_LIBRARY_DWG" "$root/Autocad Blocks/SARENS_TRAILERDRAFTSMAN_BLOCK_LIBRARY.dwg")
(setq qa:draw $draw qa:fixture "$fixture" qa:legacy "$legacy" qa:marker "$(($marker).Replace('\','/'))")
(load "$(($PSScriptRoot).Replace('\','/'))/test-placement-cad.lsp")
(command "_.QUIT" "_N")
"@
# Generated batch and results are isolated test artifacts, never the user's drawing.
[IO.File]::WriteAllText($script, $body, [Text.UTF8Encoding]::new($false))
Remove-Item -LiteralPath $marker -ErrorAction SilentlyContinue
if ($FullAutoCAD) {
  $exe = "C:/Program Files/Autodesk/AutoCAD 2026/acad.exe"
  $arguments = @('/nologo','/t','acadiso.dwt','/b',('"'+$script+'"'))
} else {
  $exe = "C:/Program Files/Autodesk/AutoCAD 2026/accoreconsole.exe"
  $arguments = @('/s',('"'+$script+'"'),'/l','en-US')
}
$process = Start-Process -FilePath $exe -ArgumentList $arguments -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $out "cad.stdout.log") -RedirectStandardError (Join-Path $out "cad.stderr.log")
try {
  $deadline = [DateTime]::UtcNow.AddSeconds(90)
  while (-not (Test-Path -LiteralPath $marker) -and -not $process.HasExited -and [DateTime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 400; $process.Refresh() }
  if (-not (Test-Path -LiteralPath $marker)) { throw "CAD test did not reach its completion marker. Inspect test-output/cad-placement logs." }
  $result = Get-Content -LiteralPath $marker -Raw
  Write-Output $result
  if ($result -notmatch 'PLACEMENT-CAD-PASS') { throw 'CAD placement test failed.' }
} finally {
  # Only terminate the isolated process started by this test, never a user's session.
  if (-not $process.HasExited) { $process.Kill(); $process.WaitForExit() }
}
