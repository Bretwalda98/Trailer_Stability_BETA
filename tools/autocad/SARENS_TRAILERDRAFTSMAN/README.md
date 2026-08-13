# SARENS_TRAILERDRAFTSMAN v1.17

SARENS_TRAILERDRAFTSMAN is an AutoCAD AutoLISP tool for producing trailer arrangement drawings from a Trailer Stability coded JSON export. It imports the standard block library, draws the model views, creates/fits the PaperSpace sheet, scales the viewport output, and updates the title block.

The primary web integration is JSON-only: `SARTDJSON` and `SARTDJSONDATA` read the downloaded JSON directly and do not require Excel, a workbook, a browser bridge or a transfer code. A clearly separated legacy workflow remains available through `SARTDRUN`/`SARTDWEB` for older projects that still use it.

## Release contents

- `SARENS_TRAILERDRAFTSMAN_v1.1.lsp` — the AutoLISP program, release 1.17.
- `SARTD_Excel_Active.ps1` — discovers visible Excel workbooks and captures current in-memory values without saving the original.
- `SARTD_JSON_Prepare.ps1` — prepares a temporary drawing-only copy of a full case export for faster AutoLISP parsing.
- `Autocad Blocks\SARENS_TRAILERDRAFTSMAN_BLOCK_LIBRARY.dwg` — the unified block and PaperSpace layout library.
- `Autocad Blocks\Autocad Blocks.zip` — packaged copy of the block library folder.
- `autocad-export-key-v1.json` — the coded field key for the JSON export.
- `test-fixtures\valid-three-point.json` and `test-fixtures\valid-four-point.json` — repeatable JSON validation fixtures.

Keep the `.lsp` file and the `Autocad Blocks` folder together in the same parent folder.

## Requirements

- AutoCAD for Windows with AutoLISP/Visual LISP support.
- The bundled `SARENS_TRAILERDRAFTSMAN_BLOCK_LIBRARY.dwg` file.
- For the primary JSON workflow: a JSON file downloaded from the Trailer Stability application and the companion coded field key.
- For the optional legacy workflow only: the older compatible calculation workbook and Microsoft Excel.

## Installation

1. Copy or keep the full `SARENS_TRAILERDRAFTSMAN` folder somewhere stable on your PC or network drive.
2. In AutoCAD, add the folder containing `SARENS_TRAILERDRAFTSMAN_v1.1.lsp` to Trusted Locations if AutoCAD blocks loading from that location.
3. Run `APPLOAD`.
4. Browse to and load `SARENS_TRAILERDRAFTSMAN_v1.1.lsp`.
5. Optional: add the LSP to the AutoCAD Startup Suite if you want it to load automatically in new drawings.

When loaded successfully, AutoCAD prints a message ending with:

```text
SARENS_TRAILERDRAFTSMAN v1.17 final overrides loaded. Active discovers visible Excel workbooks and captures current in-memory values. SARTDJSON always prompts for the numbered case-data JSON; SARTDJSONDATA reuses the last validated case.
```

## JSON workflow (primary)

1. In the Trailer Stability web application, use **AutoCAD** to download one numbered case-data file such as `trailer-stability-autocad-581669.json`. The decoding key is already included with this reader package and is not downloaded for every case.
2. Open or create the target drawing in AutoCAD.
3. Load the LSP if it is not already loaded.
4. Run:

```text
SARTDJSON
```

5. The file picker always opens. Select the numbered `trailer-stability-autocad-*.json` case file, not `trailer-stability-autocad-key-v1.json`.
6. The command validates the format, version, coded key, cargo geometry, resolved trailer geometry and three-/four-point stability boundary before it changes the drawing.
7. If the JSON is rejected, read the AutoCAD command line and the log beside the input file:

```text
<selected-json-file>.lisp.log
```

To repeat the validation summary for the last numbered case without opening the picker or drawing, run:

```text
SARTDJSONDATA
```

This prints the case, trailer count, supplied stability-boundary point count and result status without drawing. Unknown future fields are ignored, but an unsupported envelope version or coded key is rejected rather than silently reinterpreted.

The JSON export uses these fixed conventions:

- X increases from rear to front.
- Rear is lower X/left; front is higher X/right.
- Coordinates and dimensions are metres; masses are tonnes; forces are kN; angles are degrees.
- The authoritative resolved trailer records are in `data.r.rv`.
- The authoritative hydraulic boundary is in `data.r.pg`; a four-point case is never reduced to a triangle.

## Legacy workbook workflow

The legacy commands are retained for older drawings and projects:

1. Open the older calculation workbook in Excel, or have it ready to browse to.
2. Open or create the target drawing in AutoCAD.
3. Load the LSP if it is not already loaded.
4. Run:

```text
SARTDRUN
```

5. Choose the legacy source:

- `Active` — discover compatible workbooks in every visible Excel window. If exactly one is open it is selected automatically; if several are open, their full paths are listed and AutoCAD asks which one to use. Current unsaved in-memory values are captured in a temporary copy without saving or changing the original workbook.
- `Browse` — choose the exact saved workbook file by full path.
- `Last` — reuse the last workbook selected by this tool.

6. Follow the AutoCAD command-line prompts. On the first run, AutoCAD asks you to select `SARENS_TRAILERDRAFTSMAN_BLOCK_LIBRARY.dwg` from the `Autocad Blocks` folder.

Browse/Last open the selected calculation file read-only in a dedicated Excel instance when the file cannot be reached through Excel's active-process connection. Excel may remain open. If file validation blocks the ordinary COM open (common with downloaded files), v1.17 retries read-only using Excel's repair-open mode. The workbook is accepted only after `Load and Stability Calculation` is found. `Export to DWG`, `Export to CAD`, `Export to AutoCAD`, `DWG Export` and equivalent punctuation/spacing variants are accepted for the export worksheet.

`SARTDRUN` remains the legacy Active/Browse/Last workflow. `SARTDWEB` is the legacy transfer-code command. Neither command is used by `SARTDJSON`.

## Optional legacy automatic bridge

`SARENS_AutoCAD_Bridge.ps1` is a local-only Windows helper for the older transfer-code workflow. It is not required for JSON. The JSON workflow is intentionally a simple file handoff: download the JSON, run `SARTDJSON`, and select the file.

## Block library folder

The program checks for the block library in this order:

1. Saved `SARTD_LIBRARY_DWG` path.
2. Saved `SARTD_BLOCKS_FOLDER` folder.
3. Bundled `Autocad Blocks` folder beside the loaded LSP.
4. AutoCAD's normal support file search paths.
5. A prompt asking you to select `SARENS_TRAILERDRAFTSMAN_BLOCK_LIBRARY.dwg` directly.

That folder must contain:

```text
SARENS_TRAILERDRAFTSMAN_BLOCK_LIBRARY.dwg
```

After a successful selection, the program remembers both the folder and DWG path for future runs. Run `SARTDBLOCKS` at any time to replace or repair that saved location.

## Legacy website transfer workflow

The older website transfer action exports a recalculation-ready workbook with a six-digit transfer code in the filename:

```text
SARENS_AUTOCAD_482731.xlsm
```

After downloading that legacy file, run `SARTDWEB` and enter the six-digit code. The JSON workflow does not use this code.

## Troubleshooting

- If blocks are missing, run `SARTDBLOCKS` and select the exact `SARENS_TRAILERDRAFTSMAN_BLOCK_LIBRARY.dwg` file from the correct `Autocad Blocks` folder.
- If the wrong block path was saved, run these at the AutoCAD command line and then rerun the command:

```lisp
(setenv "SARTD_BLOCKS_FOLDER" "")
(setenv "SARTD_LIBRARY_DWG" "")
```

- If `SARTDJSON` does not show a picker, confirm the load message ends with `v1.17 final overrides loaded`; an older LSP is still loaded otherwise.
- If the key file is selected accidentally, v1.17 explains the difference and asks again for the numbered case file.
- If a JSON export is rejected, open its `.lisp.log` file and check the format, version, key id and required geometry fields. Download the numbered case again if the export is incomplete.
- If `Active` cannot read the visible workbook, ensure `SARTD_Excel_Active.ps1` remains beside the LSP. `Browse` can still select the intended saved file by full path.
- If AutoCAD refuses to load the LISP, add the program folder to AutoCAD Trusted Locations.

## JSON test fixtures

The package contains small fixtures for `SARTDJSONDATA`:

- `valid-three-point.json` — validates a three-point/triangle boundary.
- `valid-four-point.json` — validates a four-point/quadrilateral boundary.

The source repository also contains deliberate failure fixtures and an automated Core Console runner at `tools/autocad/test-json-validation.ps1`. The failure set covers invalid JSON, missing files, wrong key, wrong version, missing cargo/trailers, and invalid three-/four-point geometry. Core Console validates the parser and command safety; full model drawing must be smoke-tested in desktop AutoCAD because the existing block renderer requires a full AutoCAD VLA document.
