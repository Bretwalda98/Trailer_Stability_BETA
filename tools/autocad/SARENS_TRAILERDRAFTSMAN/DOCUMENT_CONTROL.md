# Document control

| Field | Value |
|---|---|
| Package | SARENS_TRAILERDRAFTSMAN |
| Release | 1.23 |
| Release date | 2026-08-31 |
| Status | Beta — controlled test release |
| Supersedes | 1.22 |
| Primary command | SARTDCAD (`SARTDRUN > CAD` equivalent) |
| Preferred import | Direct compact `.sartd` case exchange |
| Compatibility imports | Calculation file; legacy coded JSON |

## Controlled changes

- Added CAD v2 bed/yaw/PPU records and authoritative orthographic graphics; v1 keeps its renderer.
- Included independent PPU mass/count in the existing loading/attribute tables.
- Kept the selected import in the same ModelSpace/PaperSpace workflow, including redraw after scale changes.
- Rejected malformed geometry, mismatched counts, wrong units/version and unsecured PPUs before drawing.

- Added the versioned, line-oriented `SARTD-CAD|1` exchange parsed directly by AutoLISP.
- Added `SARTDCAD` and non-drawing `SARTDCADDATA`; `SARTDRUN` now defaults to `CAD` while retaining `Excel` and `JSON` choices.
- Reduced the website transfer to one numbered file containing only data consumed by the drawing workflow.
- Retained one selected source in memory throughout ModelSpace, PaperSpace, viewport, annotation, and title-block stages.
- Added per-group bogie, load, utilisation and hydraulic-pressure records for official paper-space tables.
- Removed the duplicate free-standing result polygon and `RESULT` label; authoritative values remain in the drawing annotations.
- Added safe validation and adjacent `.lisp.log` diagnostics.
- Corrected cargo/packing/deck vertical datum handling so cargo COG Z is not offset twice.
- Added authoritative overall/per-group GBP, separate trailer/PPU weights, COG-envelope values, and Group 4 neutral/A-D pressure data to compact and JSON imports.
- Replaced Group 4 worksheet scaling with group-specific website calculations using the selected trailer width and axle pitch.

## Verification record

- 2026-08-31: `test-placement-cad.ps1` passed in AutoCAD Core Console: both hydraulic cases and five deliberate malformed inputs, plus v1 compatibility.
- 2026-08-31: `test-placement-cad.ps1 -FullAutoCAD` passed in an isolated AutoCAD 2026 process: both cases, 16 PPU entities, positive/negative bed rotation coordinates, PPU-count and pressure attributes, Sarens/T.EN PaperSpace imports and border update.
- These generated fixtures deliberately contain support failures to verify diagnostic drawing preserves result status. They are not approved transport arrangements.
- Full interactive user picking and equipment/lashing certification are not claimed by the automated smoke test.

- LISP structural parse: balanced, no premature load termination.
- Core Console compact parser/contract test: passed.
- Full AutoCAD 2026 compact drawing smoke test: passed; 38 generated entities and no `SARTD-HYD-RESULT` overlay.
- Website typecheck and engineering/exchange regressions: passed, including packing datum and three-/four-point GBP/pressure parity.

## Release identification

```text
SARENS_TRAILERDRAFTSMAN_v1.23_FULL_PACKAGE.zip
```

Verify the archive against `SARENS_TRAILERDRAFTSMAN_v1.23_FULL_PACKAGE.sha256` before distribution.
