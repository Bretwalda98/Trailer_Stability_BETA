# SARENS_TRAILERDRAFTSMAN v1.19

SARENS_TRAILERDRAFTSMAN is an AutoCAD AutoLISP tool for producing a complete trailer-arrangement drawing from either a compatible Excel calculation workbook or a Trailer Stability coded JSON case export.

Version 1.19 gives both import sources the same drawing process. `SARTDRUN` asks for **Excel** or **JSON**, captures the selected source once, retains its case data in memory, and then completes ModelSpace, the selected Sarens or T.EN PaperSpace sheet, all matching information attributes, viewport scaling, border/title-block updates and final PaperSpace display. JSON data is explicitly kept out of the older Excel-only diagnostic routine before ModelSpace drawing.

## Release contents

- `SARENS_TRAILERDRAFTSMAN_v1.1.lsp` - AutoLISP program, release 1.19.
- `DOCUMENT_CONTROL.md` - controlled release identification, change summary and verification record.
- `SARTD_Excel_Active.ps1` - discovers compatible workbooks in visible Excel processes and captures current unsaved in-memory values without saving the original.
- `SARTD_JSON_Prepare.ps1` - prepares a temporary drawing-only copy of a coded JSON case for efficient AutoLISP parsing.
- `Autocad Blocks\SARENS_TRAILERDRAFTSMAN_BLOCK_LIBRARY.dwg` - block and PaperSpace layout library.
- `Autocad Blocks\Autocad Blocks.zip` - packaged copy of the block-library folder.
- `autocad-export-key-v1.json` - coded JSON field key.
- `test-fixtures\valid-three-point.json` and `test-fixtures\valid-four-point.json` - repeatable three- and four-point validation fixtures.

Keep the `.lsp`, both PowerShell helpers, the key file and the `Autocad Blocks` folder together.

## Requirements

- AutoCAD for Windows with AutoLISP/Visual LISP support.
- The bundled block-library DWG.
- For JSON import: a numbered `trailer-stability-autocad-*.json` case export.
- For Excel import: a compatible calculation workbook and Microsoft Excel.

## Installation

1. Extract the full v1.19 package to a stable local or network folder.
2. If required by AutoCAD security, add the extracted folder to AutoCAD **Trusted Locations**.
3. Run `APPLOAD`.
4. Load `SARENS_TRAILERDRAFTSMAN_v1.1.lsp`.
5. Optionally add the LSP to the AutoCAD Startup Suite.

The last load message must end with:

```text
SARENS_TRAILERDRAFTSMAN v1.19 final overrides loaded. SARTDRUN asks Excel or JSON once, retains that selected import in memory, then runs the same six-stage ModelSpace/PaperSpace/viewport/attribute workflow for either source.
```

## Main workflow: SARTDRUN

Open or create the target AutoCAD drawing, then run:

```text
SARTDRUN
```

The command performs this interaction:

1. Choose `Excel` or `JSON` as the import source.
2. Select the source once:
   - **Excel**: choose `Active`, `Browse` or `Last`. `Active` searches all visible Excel processes for a compatible workbook; `Browse` selects an exact file; `Last` reuses the last validated workbook path.
   - **JSON**: select one numbered case-data JSON in the normal file picker. Do not select the companion key file.
3. If the block library has not already been found, select `SARENS_TRAILERDRAFTSMAN_BLOCK_LIBRARY.dwg` once. The location is remembered.
4. Choose the required Sarens or T.EN PaperSpace sheet from the existing library-layout prompt.
5. The program completes its six common stages:
   1. draw ModelSpace from the retained source data;
   2. import the selected PaperSpace sheet and populate its matching attributes;
   3. auto-space views and apply the nearest safe existing viewport scale;
   4. verify the final viewport scale for dimensions, blocks and border;
   5. populate all available border and title-block attributes from the same retained data;
   6. restore, regenerate and fit PaperSpace.

The workbook or JSON file is not selected again during these stages. Viewport redraws reuse the retained in-memory data, so AutoCAD does not silently switch workbooks and does not repeatedly parse the JSON.

Cancelling any required picker or sheet selection stops safely before the next stage. The last numbered stage printed at the AutoCAD command line identifies where the run stopped.

## JSON shortcut and validation command

`SARTDJSON` is a shortcut to the same complete JSON workflow used by `SARTDRUN > JSON`. It opens the JSON picker once, validates once, then continues through the same Sarens/T.EN PaperSpace and attribute process.

```text
SARTDJSON
```

`SARTDJSONDATA` validates and summarises the last successfully selected numbered case without drawing or opening the picker:

```text
SARTDJSONDATA
```

JSON errors are printed at the AutoCAD command line and written beside the selected input as:

```text
<selected-json-file>.lisp.log
```

Validation covers the export format, version, coded key, cargo fields, resolved trailer geometry, and three- or four-point hydraulic boundary. Unknown future fields are ignored, but an unsupported format version or coded key is rejected.

### JSON conventions

- X increases from rear to front.
- Rear is lower X/left; front is higher X/right.
- Lengths and coordinates are metres; masses are tonnes; forces are kN; angles are degrees.
- `data.r.rv` contains authoritative post-placement trailer geometry.
- `data.r.pg` contains the authoritative hydraulic boundary. A four-point case remains a four-point polygon and is never reduced to a triangle.
- Case references and available result metrics are retained for PaperSpace and title-block attributes.

## Excel import behaviour

`SARTDRUN > Excel` asks for the workbook source once and reads the selected calculation data once. ModelSpace drawing, PaperSpace annotations, auto-fit redraws and border attributes all consume the retained data object.

The choices are:

- `Active` - find compatible workbooks in visible Excel processes. One valid workbook is selected automatically; if more than one is found, AutoCAD lists them and asks which workbook to use. Current unsaved values are captured through a temporary copy without saving or changing the source workbook.
- `Browse` - select the exact saved workbook path.
- `Last` - reuse the last validated workbook path.

The workbook is accepted after the required calculation sheet is found. Export-sheet name matching accepts the supported `Export to DWG`, `Export to CAD`, `Export to AutoCAD`, `DWG Export` and punctuation/spacing variants. Browse/Last can open the file read-only in a dedicated Excel process when it is not available through a visible active process. Downloaded files that reject a normal COM open are retried in read-only repair-open mode.

## PaperSpace information attributes

Both Excel and JSON imports populate every matching attribute available in the chosen Sarens or T.EN sheet and its border/title block. Available values include case/cargo name, client and owner references, document/reference data, date, description, verification information, cargo and all-inclusive mass, COG positions, trailer configuration, axle-line totals, PPU count, axle capacity, tipping values and drawing scale. Missing source values remain blank rather than being invented.

The final drawing remains on the chosen PaperSpace sheet, fitted to the available screen.

## Block library setup

The program checks for the block library in this order:

1. remembered `SARTD_LIBRARY_DWG` path;
2. remembered `SARTD_BLOCKS_FOLDER` path;
3. bundled `Autocad Blocks` folder beside the loaded LSP;
4. AutoCAD support search paths;
5. a file picker for the exact block-library DWG.

The successful DWG and folder are remembered. Run `SARTDBLOCKS` to replace or repair the remembered path.

To clear an incorrect saved location manually:

```lisp
(setenv "SARTD_BLOCKS_FOLDER" "")
(setenv "SARTD_LIBRARY_DWG" "")
```

## Compatibility commands

- `SARTDWEB` retains the older six-digit transfer-code workflow for existing projects.
- `SARTDJSONDATA` remains the non-drawing JSON diagnostic command.
- `SARTDBLOCKS` changes or repairs the block-library location.

## Troubleshooting

- If `SARTDRUN` does not first ask `Excel/JSON`, reload the LSP and confirm the final load message reports v1.19.
- If `SARTDJSON` does not open a picker, an older LSP is still loaded.
- If the coded key file is selected instead of the numbered case, select `trailer-stability-autocad-*.json` when prompted again.
- If JSON is rejected, inspect its `.lisp.log` for the exact format, key, field or geometry failure.
- If Excel `Active` cannot see a workbook, leave Excel open, confirm `SARTD_Excel_Active.ps1` is beside the LSP, then try `Active` again. `Browse` remains available for a saved path.
- If blocks or layouts are missing, run `SARTDBLOCKS` and select the exact bundled block-library DWG.
- If AutoCAD refuses to load the LSP, add the program folder to Trusted Locations.

## Verification supplied with v1.19

Repository tests include:

- a ten-case Core Console JSON validation matrix covering valid three-/four-point inputs, malformed JSON, missing files, wrong key/version, missing cargo/trailers and invalid three-/four-point boundaries;
- a Core Console source-routing regression proving one Excel selection/read, one JSON selection/parse, correct `SARTDRUN` routing, and the same common workflow invocation;
- a Core Console ModelSpace smoke test proving a valid JSON case reaches the retained-data drawing path without calling the older Excel-only diagnostic summary;
- repeatable JSON fixtures for manual `SARTDJSONDATA` checks.

Desktop AutoCAD remains the authoritative visual smoke-test environment for block insertion, Sarens/T.EN layout import, attribute appearance and viewport presentation.
