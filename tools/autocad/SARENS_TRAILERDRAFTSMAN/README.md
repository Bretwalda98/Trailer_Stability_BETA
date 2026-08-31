# SARENS_TRAILERDRAFTSMAN v1.23

Version 1.23 adds CAD v2 for individual beds, stagger/yaw and secured deck-mounted PPUs. Use the website's compact `.sartd` export, not the legacy coded JSON route, for these layouts. Keep `SARTD_Placement_v2.lsp` beside the main LISP. The imported file contains resolved plan and orthographic side/end equipment envelopes; these are dimensionally scaled drafting geometry, not a manufacturer fabrication model. Group tables still use the authoritative website results. V1 exports retain their existing block-based renderer.

SARENS_TRAILERDRAFTSMAN creates the complete trailer-arrangement drawing in AutoCAD. Version 1.22 carries the website's resolved three-/four-point hydraulic results into the official loading tables, including neutral and A-D pressures, per-group utilisation, and ground-bearing pressure (GBP).

The preferred web workflow uses one numbered `.sartd` file. It contains only resolved drawing inputs: case references, cargo and packing geometry, trailer positions and dimensions, PPU states, hydraulic routing, pinned axle lines, supports, the authoritative stability boundary, and summary results. AutoLISP parses it directly; no key file, JSON parser, PowerShell conversion, or browser bridge is required.

## Package contents

- `SARENS_TRAILERDRAFTSMAN_v1.1.lsp` — AutoLISP release 1.23; stable APPLOAD filename.
- `SARTD_Placement_v2.lsp` — validated, data-only bed/PPU geometry importer and renderer.
- `Autocad Blocks\SARENS_TRAILERDRAFTSMAN_BLOCK_LIBRARY.dwg` — blocks and Sarens/T.EN layouts.
- `SARTD-CAD-FORMAT.md` — controlled compact exchange contract.
- `SARTD_Excel_Active.ps1` — compatibility helper for live calculation-file import.
- `SARTD_JSON_Prepare.ps1` — compatibility helper for legacy JSON import.
- `DOCUMENT_CONTROL.md` — release and verification record.

Keep the LSP, helpers, documentation, and complete `Autocad Blocks` folder together.

## Installation

1. Extract the full v1.23 archive to a stable local or network folder.
2. Add the extracted `SARENS_TRAILERDRAFTSMAN` folder to AutoCAD **Support File Search Path** and **Trusted Locations** if required. Both LISP files must stay together.
3. Run `APPLOAD` and load `SARENS_TRAILERDRAFTSMAN_v1.1.lsp`.
4. Optionally add the LSP to the Startup Suite.
5. If prompted, select `SARENS_TRAILERDRAFTSMAN_BLOCK_LIBRARY.dwg`. The path is remembered.

The final load message must report `SARTD placement CAD v2 reader/drawing module loaded (v1.23)`.

## Preferred website workflow

1. In Trailer Stability, choose **AutoCAD compact case data**.
2. Save the single numbered `trailer-stability-autocad-######.sartd` file.
3. Open or create the target AutoCAD drawing.
4. Run:

```text
SARTDCAD
```

5. Select the `.sartd` file once.
6. Select the required Sarens or T.EN PaperSpace layout when prompted.

The same imported case remains in memory throughout ModelSpace drawing, PaperSpace import, viewport fitting, dimensions, annotations, border fields, and title-block fields. The file is not requested again during that run.

`SARTDCADDATA` validates and summarises a compact file without changing the drawing.

## Unified command

Run `SARTDRUN` to select one of three sources:

- `CAD` — preferred compact `.sartd` website exchange.
- `Excel` — retained compatibility path with `Active`, `Browse`, or `Last` selection.
- `JSON` — retained legacy numbered case-data JSON path.

`CAD` is the default. Every source is adapted to the same retained drawing-data structure and then uses the same six-stage drawing workflow.

## Geometry and validation

- X increases from rear to front: rear is lower X/left; front is higher X/right.
- Compact lengths and coordinates are millimetres; masses are tonnes; forces are kN; angles are degrees.
- Trailer width, length, axle count, pitch, deck height, PPU geometry, and resolved X/Y positions come from the selected case.
- Three-point and four-point hydraulic routing are supported.
- V1 retains the existing boundary/annotation behaviour. V2 draws the authoritative three-/four-point boundary once with the resolved plan and marks the exported case status explicitly, including diagnostic failed cases.
- Hydraulic group counts, loads, utilisation and neutral/A-D pressure cases populate the official paper-space tables.
- Overall and per-group GBP are read from the exported calculation result; Group 4 uses its own selected trailer width and axle pitch rather than a scaled Group 3 placeholder.
- Cargo COG Z is relative to the cargo bottom. AutoCAD places the deck first, the packing on the deck, and the cargo on the packing without adding either height twice.
- Missing header, case, load, packing, deck, trailer, hydraulic, result, or end records stop safely before drawing.
- Errors are appended beside the selected file as `<case>.sartd.lisp.log`.

## Block-library setup

The program checks the remembered library, the bundled folder beside the LSP, AutoCAD support paths, and finally a file picker. Run `SARTDBLOCKS` to replace an incorrect remembered location.

To clear stored paths manually:

```lisp
(setenv "SARTD_BLOCKS_FOLDER" "")
(setenv "SARTD_LIBRARY_DWG" "")
```

## Compatibility commands

- `SARTDJSON` — complete legacy JSON drawing workflow.
- `SARTDJSONDATA` — legacy JSON validation and summary.
- `SARTDWEB` — older six-digit transfer-code workflow.
- `SARTDBLOCKS` — change or repair the block-library location.

## Troubleshooting

- If `SARTDRUN` does not offer `Excel/CAD/JSON`, reload the v1.22 LSP.
- If `SARTDCAD` does not open a picker, an older LSP definition is still loaded.
- If blocks or layouts are missing, run `SARTDBLOCKS` and select the bundled library DWG.
- If a compact case is rejected, read the adjacent `.lisp.log`; it identifies the record and validation failure.
- If AutoCAD refuses the LSP, add the extracted package folder to Trusted Locations.

## Verification supplied with v1.22

- AutoCAD Core Console parser/contract test for a resolved four-point compact case.
- Full AutoCAD ModelSpace smoke test asserts generated arrangement entities and no duplicate `SARTD-HYD-RESULT` overlay.
- Four-point parser assertion retains all four authoritative boundary points and four group-metric records.
- Compact and JSON regressions verify trailer/PPU masses, cargo COG datum, Group 4 GBP, COG envelope, and neutral/A-D hydraulic pressures without a worksheet lookup.
- Legacy JSON validation, source-routing, and drawing regressions retained.
- Website typecheck, engineering tests, production build, and exchange-format tests.

Desktop AutoCAD remains the authoritative environment for final visual inspection of blocks, layouts, attributes, and viewport presentation.
