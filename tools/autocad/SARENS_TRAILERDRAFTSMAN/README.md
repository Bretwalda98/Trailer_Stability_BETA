# SARENS_TRAILERDRAFTSMAN v1.15

SARENS_TRAILERDRAFTSMAN is an AutoCAD AutoLISP tool for producing trailer arrangement drawings from a Trailer Stability coded JSON export. It imports the standard block library, draws the model views, creates/fits the PaperSpace sheet, scales the viewport output, and updates the title block.

The primary web integration is JSON-only: `SARTDJSON` and `SARTDJSONDATA` read the downloaded JSON directly and do not require Excel, a workbook, a browser bridge or a transfer code. A clearly separated legacy workflow remains available through `SARTDRUN`/`SARTDWEB` for older projects that still use it.

## Release contents

- `SARENS_TRAILERDRAFTSMAN_v1.1.lsp` — the AutoLISP program, release 1.15.
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
SARENS_TRAILERDRAFTSMAN v1.1 full release loaded. Commands: SARTDRUN, SARTDWEB, SARTDJSON and SARTDJSONDATA.
```

## JSON workflow (primary)

1. In the Trailer Stability web application, use **AutoCAD** to download the coded JSON export and the companion `autocad-export-key-v1.json` key.
2. Open or create the target drawing in AutoCAD.
3. Load the LSP if it is not already loaded.
4. Run:

```text
SARTDJSON
```

5. Select the downloaded `trailer-stability-autocad-*.json` file.
6. The command validates the format, version, coded key, cargo geometry, resolved trailer geometry and three-/four-point stability boundary before it changes the drawing.
7. If the JSON is rejected, read the AutoCAD command line and the log beside the input file:

```text
<selected-json-file>.lisp.log
```

For a read-only summary and validation check, run:

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

- `Active` — use the currently active Excel workbook.
- `Browse` — choose a workbook file.
- `Last` — reuse the last workbook selected by this tool.

6. Follow the AutoCAD command-line prompts. On the first run, you may be asked for the `Autocad Blocks` folder.

`SARTDRUN` remains the legacy Active/Browse/Last workflow. `SARTDWEB` is the legacy transfer-code command. Neither command is used by `SARTDJSON`.

## Optional legacy automatic bridge

`SARENS_AutoCAD_Bridge.ps1` is a local-only Windows helper for the older transfer-code workflow. It is not required for JSON. The JSON workflow is intentionally a simple file handoff: download the JSON, run `SARTDJSON`, and select the file.

## Block library folder

The program checks for the block library in this order:

1. Saved `SARTD_LIBRARY_DWG` path.
2. Saved `SARTD_BLOCKS_FOLDER` folder.
3. Bundled `Autocad Blocks` folder beside the loaded LSP.
4. AutoCAD's normal support file search paths.
5. A prompt asking you to select the `Autocad Blocks` folder.

That folder must contain:

```text
SARENS_TRAILERDRAFTSMAN_BLOCK_LIBRARY.dwg
```

After a successful selection, the program remembers the folder and DWG path for future runs. If the folder picker is unavailable, or the selected folder does not contain the library DWG, the program falls back to asking you to select the DWG file directly.

## Legacy website transfer workflow

The older website transfer action exports a recalculation-ready workbook with a six-digit transfer code in the filename:

```text
SARENS_AUTOCAD_482731.xlsm
```

After downloading that legacy file, run `SARTDWEB` and enter the six-digit code. The JSON workflow does not use this code.

## Troubleshooting

- If blocks are missing, rerun `SARTDJSON` or `SARTDRUN` and select the correct `Autocad Blocks` folder when prompted.
- If the wrong block path was saved, run these at the AutoCAD command line and then rerun the command:

```lisp
(setenv "SARTD_BLOCKS_FOLDER" "")
(setenv "SARTD_LIBRARY_DWG" "")
```

- If a JSON export is rejected, open its `.lisp.log` file and check the format, version, key id and required geometry fields. Re-download the JSON and companion key if the export is incomplete.
- If the legacy source cannot be read, make sure the workbook is open, not protected in a way that blocks reading, and contains the expected sheets.
- If AutoCAD refuses to load the LISP, add the program folder to AutoCAD Trusted Locations.

## JSON test fixtures

The package contains small fixtures for `SARTDJSONDATA`:

- `valid-three-point.json` — validates a three-point/triangle boundary.
- `valid-four-point.json` — validates a four-point/quadrilateral boundary.

The source repository also contains deliberate failure fixtures and an automated Core Console runner at `tools/autocad/test-json-validation.ps1`. The failure set covers invalid JSON, missing files, wrong key, wrong version, missing cargo/trailers, and invalid three-/four-point geometry. Core Console validates the parser and command safety; full model drawing must be smoke-tested in desktop AutoCAD because the existing block renderer requires a full AutoCAD VLA document.
