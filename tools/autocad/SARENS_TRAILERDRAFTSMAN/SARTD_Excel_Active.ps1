param(
  [Parameter(Mandatory = $true)]
  [string]$OutputPath
)

$ErrorActionPreference = "Stop"

$nativeSource = @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class SartdExcelWindowAccess
{
    public delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool EnumChildWindows(IntPtr parent, EnumWindowsProc callback, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetClassName(IntPtr hwnd, StringBuilder className, int maxCount);

    [DllImport("oleacc.dll")]
    public static extern int AccessibleObjectFromWindow(
        IntPtr hwnd,
        uint objectId,
        ref Guid interfaceId,
        [MarshalAs(UnmanagedType.IUnknown)] out object accessibleObject);

    private static string WindowClass(IntPtr hwnd)
    {
        var value = new StringBuilder(256);
        GetClassName(hwnd, value, value.Capacity);
        return value.ToString();
    }

    public static IntPtr[] ExcelTopLevelWindows()
    {
        var result = new List<IntPtr>();
        EnumWindows(delegate(IntPtr hwnd, IntPtr ignored)
        {
            if (WindowClass(hwnd) == "XLMAIN") result.Add(hwnd);
            return true;
        }, IntPtr.Zero);
        return result.ToArray();
    }

    public static IntPtr ExcelDocumentWindow(IntPtr parent)
    {
        IntPtr result = IntPtr.Zero;
        EnumChildWindows(parent, delegate(IntPtr hwnd, IntPtr ignored)
        {
            if (WindowClass(hwnd) == "EXCEL7")
            {
                result = hwnd;
                return false;
            }
            return true;
        }, IntPtr.Zero);
        return result;
    }
}
'@

if (-not ("SartdExcelWindowAccess" -as [type])) {
  Add-Type -TypeDefinition $nativeSource
}

function Normalize-SheetName([string]$Value) {
  if ($null -eq $Value) { return "" }
  return [regex]::Replace($Value.ToUpperInvariant(), "[^A-Z0-9]", "")
}

function Test-CalculationWorkbook($Workbook) {
  try {
    foreach ($sheet in $Workbook.Worksheets) {
      $name = Normalize-SheetName ([string]$sheet.Name)
      if ($name -in @(
          "LOADANDSTABILITYCALCULATION",
          "LOADSTABILITYCALCULATION",
          "LOADANDSTABILITYCALCULATIONS",
          "LOADSTABILITYCALCULATIONS")) {
        return $true
      }
    }
  } catch {
    return $false
  }
  return $false
}

$outputDirectory = Split-Path -Parent $OutputPath
if (-not [string]::IsNullOrWhiteSpace($outputDirectory)) {
  [IO.Directory]::CreateDirectory($outputDirectory) | Out-Null
}

$snapshotRoot = Join-Path ([IO.Path]::GetTempPath()) "SARTD_ACTIVE_EXCEL"
[IO.Directory]::CreateDirectory($snapshotRoot) | Out-Null
Get-ChildItem -LiteralPath $snapshotRoot -File -Filter "SARTD_ACTIVE_*" -ErrorAction SilentlyContinue |
  Where-Object LastWriteTimeUtc -lt ([DateTime]::UtcNow.AddHours(-12)) |
  ForEach-Object {
    try { [IO.File]::Delete($_.FullName) } catch { }
  }

$dispatchId = [uint32]4294967280 # OBJID_NATIVEOM
$dispatchInterface = [Guid]"00020400-0000-0000-C000-000000000046" # IDispatch
$seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
$records = [Collections.Generic.List[string]]::new()

foreach ($excelWindow in [SartdExcelWindowAccess]::ExcelTopLevelWindows()) {
  $documentWindow = [SartdExcelWindowAccess]::ExcelDocumentWindow($excelWindow)
  if ($documentWindow -eq [IntPtr]::Zero) { continue }

  $nativeObject = $null
  $application = $null
  try {
    $result = [SartdExcelWindowAccess]::AccessibleObjectFromWindow(
      $documentWindow,
      $dispatchId,
      [ref]$dispatchInterface,
      [ref]$nativeObject)
    if ($result -ne 0 -or $null -eq $nativeObject) { continue }

    $application = $nativeObject.Application
    $workbooks = @()
    if ($null -ne $application.ActiveWorkbook) {
      $workbooks += $application.ActiveWorkbook
    }
    foreach ($workbook in $application.Workbooks) {
      $workbooks += $workbook
    }

    foreach ($workbook in $workbooks) {
      try {
        $originalPath = [string]$workbook.FullName
        if ([string]::IsNullOrWhiteSpace($originalPath)) { continue }
        if (-not $seen.Add($originalPath)) { continue }
        if (-not (Test-CalculationWorkbook $workbook)) { continue }

        $extension = [IO.Path]::GetExtension($originalPath)
        if ([string]::IsNullOrWhiteSpace($extension)) { $extension = ".xlsm" }
        $snapshotPath = Join-Path $snapshotRoot (
          "SARTD_ACTIVE_{0}_{1}{2}" -f $PID, [Guid]::NewGuid().ToString("N"), $extension)
        try {
          # SaveCopyAs captures current in-memory values, including unsaved user changes, without
          # saving or changing the original workbook.
          $workbook.SaveCopyAs($snapshotPath)
        } catch {
          $snapshotPath = ""
        }
        $records.Add($originalPath + "`t" + $snapshotPath)
      } catch {
        # A protected or closing workbook must not prevent another visible workbook being found.
      }
    }
  } catch {
    # Ignore inaccessible Excel windows and continue through the remaining desktop instances.
  } finally {
    foreach ($value in @($application, $nativeObject)) {
      if ($null -ne $value -and [Runtime.InteropServices.Marshal]::IsComObject($value)) {
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($value)
      }
    }
  }
}

[IO.File]::WriteAllLines($OutputPath, $records, [Text.UTF8Encoding]::new($false))
