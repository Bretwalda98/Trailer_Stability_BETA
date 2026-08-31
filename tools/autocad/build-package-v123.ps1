$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$package = Join-Path $repo 'public/autocad/SARENS_TRAILERDRAFTSMAN_v1.23_FULL_PACKAGE.zip'
$baseline = Join-Path $repo 'public/autocad/SARENS_TRAILERDRAFTSMAN_v1.22_FULL_PACKAGE.zip'
Copy-Item -LiteralPath $baseline -Destination $package -Force
$zip = [IO.Compression.ZipFile]::Open($package, [IO.Compression.ZipArchiveMode]::Update)
try {
  foreach ($name in @('README.md','DOCUMENT_CONTROL.md','SARTD-CAD-FORMAT.md','SARENS_TRAILERDRAFTSMAN_v1.1.lsp','SARTD_Placement_v2.lsp')) {
    $entryName = 'SARENS_TRAILERDRAFTSMAN/' + $name
    $entry = $zip.GetEntry($entryName)
    if ($entry) { $entry.Delete() }
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, (Join-Path $PSScriptRoot ('SARENS_TRAILERDRAFTSMAN/' + $name)), $entryName) | Out-Null
  }
  foreach ($name in @('THREE_POINT','FOUR_POINT')) {
    $entryName = 'SARENS_TRAILERDRAFTSMAN/examples/' + $name + '.sartd'
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, (Join-Path $repo ('test-output/cad-placement/' + $name + '.sartd')), $entryName) | Out-Null
  }
  # Exclude historical editor backups and error logs from the new distribution.
  foreach ($entry in @($zip.Entries | Where-Object { $_.FullName -match '\.(bak|err|log)$' })) { $entry.Delete() }
} finally { $zip.Dispose() }
$checksum = (Get-FileHash -LiteralPath $package -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText(($package -replace '\.zip$', '.sha256'), "$checksum  $([IO.Path]::GetFileName($package))`n", [Text.UTF8Encoding]::new($false))
Write-Output "$package`nSHA256 $checksum"
