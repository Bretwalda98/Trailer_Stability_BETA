# Document control

| Field | Value |
|---|---|
| Package | SARENS_TRAILERDRAFTSMAN |
| Release | 1.21 |
| Release date | 2026-08-22 |
| Status | Beta — controlled test release |
| Supersedes | 1.20 |
| Primary command | SARTDCAD (`SARTDRUN > CAD` equivalent) |
| Preferred import | Direct compact `.sartd` case exchange |
| Compatibility imports | Calculation file; legacy coded JSON |

## Controlled changes

- Added the versioned, line-oriented `SARTD-CAD|1` exchange parsed directly by AutoLISP.
- Added `SARTDCAD` and non-drawing `SARTDCADDATA`; `SARTDRUN` now defaults to `CAD` while retaining `Excel` and `JSON` choices.
- Reduced the website transfer to one numbered file containing only data consumed by the drawing workflow.
- Retained one selected source in memory throughout ModelSpace, PaperSpace, viewport, annotation, and title-block stages.
- Added per-group bogie, load, utilisation and hydraulic-pressure records for official paper-space tables.
- Removed the duplicate free-standing result polygon and `RESULT` label; authoritative values remain in the drawing annotations.
- Added safe validation and adjacent `.lisp.log` diagnostics.

## Verification record

- LISP structural parse: balanced, no premature load termination.
- Core Console compact parser/contract test: passed.
- Full AutoCAD 2026 compact drawing smoke test: passed; 38 generated entities and no `SARTD-HYD-RESULT` overlay.
- Website typecheck and engineering/exchange regressions: passed.

## Release identification

```text
SARENS_TRAILERDRAFTSMAN_v1.21_FULL_PACKAGE.zip
```

Verify the archive against `SARENS_TRAILERDRAFTSMAN_v1.21_FULL_PACKAGE.sha256` before distribution.
