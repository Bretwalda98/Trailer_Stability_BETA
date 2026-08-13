param(
  [Parameter(Mandatory = $true)]
  [string]$InputPath,

  [Parameter(Mandatory = $true)]
  [string]$OutputPath
)

$ErrorActionPreference = "Stop"

$root = Get-Content -LiteralPath $InputPath -Raw | ConvertFrom-Json

if ($null -ne $root.data) {
  $result = $root.data.r
  $drawingResult = if ($null -eq $result) {
    $null
  } else {
    [ordered]@{
      st = $result.st
      fc = $result.fc
      fd = $result.fd
      tm = $result.tm
      lc = $result.lc
      cc = $result.cc
      gp = $result.gp
      ax = $result.ax
      ss = $result.ss
      ov = $result.ov
      gq = $result.gq
      pg = $result.pg
      cp = $result.cp
      sr = $result.sr
      mt = $result.mt
      ws = $result.ws
      ms = $result.ms
      rv = $result.rv
    }
  }

  $root = [ordered]@{
    format = $root.format
    version = $root.version
    keyId = $root.keyId
    generatedAt = $root.generatedAt
    data = [ordered]@{
      c = $root.data.c
      cg = $root.data.cg
      pk = $root.data.pk
      tr = $root.data.tr
      hy = $root.data.hy
      su = $root.data.su
      en = $root.data.en
      sp = $root.data.sp
      cat = $root.data.cat
      r = $drawingResult
    }
  }
}

$json = $root | ConvertTo-Json -Depth 100 -Compress
[IO.File]::WriteAllText($OutputPath, $json, [Text.UTF8Encoding]::new($false))
