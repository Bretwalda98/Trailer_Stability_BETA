param(
  [int]$Port = 17840,
  [string]$LispPath = "",
  [string]$DownloadsPath = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($LispPath)) {
  $LispPath = Join-Path $PSScriptRoot "SARENS_TRAILERDRAFTSMAN\SARENS_TRAILERDRAFTSMAN_v1.1.lsp"
}
if ([string]::IsNullOrWhiteSpace($DownloadsPath)) {
  $DownloadsPath = Join-Path $env:USERPROFILE "Downloads"
}
if (!(Test-Path -LiteralPath $LispPath)) {
  throw "The SARENS AutoCAD LSP was not found: $LispPath"
}

function Write-JsonResponse($Context, $StatusCode, $Payload) {
  $bytes = [Text.Encoding]::UTF8.GetBytes(($Payload | ConvertTo-Json -Compress))
  $Context.Response.StatusCode = $StatusCode
  $Context.Response.ContentType = "application/json"
  $Context.Response.Headers.Add("Access-Control-Allow-Origin", "*")
  $Context.Response.ContentLength64 = $bytes.Length
  $Context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  $Context.Response.Close()
}

function Find-TransferWorkbook($Code) {
  $pattern = "SARENS_AUTOCAD_{0}*.xlsm" -f $Code
  $deadline = [DateTime]::UtcNow.AddSeconds(12)
  do {
    $file = Get-ChildItem -LiteralPath $DownloadsPath -Filter $pattern -File -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTime -Descending |
      Select-Object -First 1
    if ($file) { return $file.FullName }
    Start-Sleep -Milliseconds 250
  } while ([DateTime]::UtcNow -lt $deadline)
  return $null
}

function Get-AutoCADApplication {
  try {
    $acad = [Runtime.InteropServices.Marshal]::GetActiveObject("AutoCAD.Application")
  } catch {
    $acad = New-Object -ComObject AutoCAD.Application
  }
  $acad.Visible = $true
  $deadline = [DateTime]::UtcNow.AddSeconds(30)
  do {
    try {
      if ($acad.Documents.Count -ge 0) { return $acad }
    } catch { }
    Start-Sleep -Milliseconds 500
  } while ([DateTime]::UtcNow -lt $deadline)
  throw "AutoCAD did not become ready within 30 seconds."
}

function Invoke-AutoCADTransfer($Code) {
  $workbook = Find-TransferWorkbook $Code
  if (!$workbook) {
    throw "No matching SARENS_AUTOCAD_$Code.xlsm was found in $DownloadsPath."
  }

  $acad = Get-AutoCADApplication
  $document = $null
  if ($acad.Documents.Count -gt 0) {
    $document = $acad.ActiveDocument
  } else {
    $document = $acad.Documents.Add()
  }
  if (!$document) { throw "AutoCAD has no active drawing document." }

  # AutoLISP accepts forward-slash Windows paths, avoiding command-string
  # escaping problems when SendCommand receives the load expression.
  $escapedLisp = $LispPath.Replace('\', '/')
  $command = '(load "' + $escapedLisp + '")' + "`nSARTDWEB`n$Code`n"
  $document.SendCommand($command)
  return $workbook
}

$listener = New-Object Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
$listener.Start()
Write-Host "SARENS AutoCAD bridge listening on http://127.0.0.1:$Port/"
Write-Host "Downloads folder: $DownloadsPath"
Write-Host "Press Ctrl+C to stop."

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    try {
      if ($context.Request.HttpMethod -eq "OPTIONS") {
        $context.Response.StatusCode = 204
        $context.Response.Headers.Add("Access-Control-Allow-Origin", "*")
        $context.Response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        $context.Response.Headers.Add("Access-Control-Allow-Headers", "Content-Type")
        $context.Response.Close()
        continue
      }

      if ($context.Request.HttpMethod -eq "GET" -and $context.Request.Url.AbsolutePath -eq "/health") {
        Write-JsonResponse $context 200 @{ ok = $true; service = "SARENS AutoCAD bridge" }
        continue
      }

      if ($context.Request.HttpMethod -eq "POST" -and $context.Request.Url.AbsolutePath -eq "/run") {
        $reader = New-Object IO.StreamReader($context.Request.InputStream, $context.Request.ContentEncoding)
        $body = $reader.ReadToEnd()
        $request = $body | ConvertFrom-Json
        $code = [string]$request.code
        if ($code -notmatch '^[0-9]{6}$') { throw "A six-digit transfer code is required." }
        $workbook = Invoke-AutoCADTransfer $code
        Write-JsonResponse $context 200 @{ ok = $true; code = $code; workbook = $workbook; command = "SARTDWEB" }
        continue
      }

      Write-JsonResponse $context 404 @{ ok = $false; error = "Unknown bridge endpoint." }
    } catch {
      Write-JsonResponse $context 500 @{ ok = $false; error = $_.Exception.Message }
    }
  }
} finally {
  $listener.Stop()
  $listener.Close()
}
