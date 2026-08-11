# Project JSON to active Excel importer

`import_project_json_to_active_excel.py` transfers the supported case inputs from a Trailer Stability project JSON file into the workbook currently active in Microsoft Excel. Its cell addresses mirror the web app's verification-workbook export map.

## Safety behaviour

- It attaches to an existing Excel session; it does not open or close workbooks.
- It requires the calculation sheet but treats `TS_CONTROL` as optional, allowing calculation-only/legacy workbooks to be used.
- It writes the deliberately unlocked inputs on a protected sheet while preserving locked formulas and calculation cells.
- It does not bypass or remove workbook or worksheet passwords.
- It temporarily disables events and automatic calculation while writing, then restores the original Excel settings.
- It restores the original cell contents if a write fails.
- It performs a full calculation rebuild after a successful import.
- It does not save by default.

## Run

First install the one Windows dependency:

```powershell
py -m pip install pywin32
```

Validate and display the import without touching Excel:

```powershell
py .\tools\excel\import_project_json_to_active_excel.py "C:\path\project.json" --plan-only
```

Import into the active workbook, calculate it, but leave saving to the user:

```powershell
py .\tools\excel\import_project_json_to_active_excel.py "C:\path\project.json"
```

Require a particular active workbook and save after the import:

```powershell
py .\tools\excel\import_project_json_to_active_excel.py "C:\path\project.json" `
  --workbook-name "Trailer_Stability_Calculator_Optimiser_v0.7.xlsm" --save
```

Use `--verbose` to print every mapped cell. Use `--no-calculate` only for diagnostics.

Calculation-only locked workbooks are supported automatically. When `TS_CONTROL` is absent, the case inputs are still imported and the 53 web-optimiser control values are reported as skipped. Existing locked formulas remain unchanged. Add `--strict` if you instead want any absent sheet or locked target to stop the import before changes are made.

## Mapping limits

The current workbook has no matching cell map for the web-only packing footprint, road-transport model, or mathematical arrangement-search settings. The script reports these explicitly. It writes their resulting calculation inputs where supported—for example cargo wind areas, application heights, COG envelopes, environment actions, resolved trailer X position, and selected trailer arrangement.

The script validates trailer selections against the catalogue embedded in the JSON but intentionally does not rewrite the active workbook's `Database` sheet.
