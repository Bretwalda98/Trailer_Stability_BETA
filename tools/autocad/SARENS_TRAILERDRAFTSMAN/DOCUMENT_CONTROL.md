# Document control

| Field | Value |
|---|---|
| Package | SARENS_TRAILERDRAFTSMAN |
| Release | 1.18 |
| Release date | 2026-08-14 |
| Status | Beta - controlled test release |
| Supersedes | 1.17 |
| Primary command | SARTDRUN |
| Supported imports | Excel calculation workbook; coded Trailer Stability JSON |

## Controlled change summary

- `SARTDRUN` now asks for Excel or JSON before drawing.
- Excel Active/Browse/Last selection occurs once and the workbook data is read once.
- JSON file selection and validation occur once.
- Both sources use one retained case-data object through the same six-stage ModelSpace, Sarens/T.EN PaperSpace, information-attribute, viewport, border/title-block and final-display workflow.
- `SARTDJSON` is a direct shortcut to the full JSON workflow.
- JSON case references and available trailer/result values populate the ordinary PaperSpace attribute map.

## Verification record

- AutoCAD Core Console JSON validation matrix: 10/10 passed.
- AutoCAD Core Console source-routing/single-selection regression: passed.
- JSON PaperSpace data mapping fixture: passed.
- Website typecheck, engineering tests, production build and rendered-HTML tests: passed without changing the website JSON contract.

## Release identification

The controlled archive filename is:

```text
SARENS_TRAILERDRAFTSMAN_v1.18_FULL_PACKAGE.zip
```

Verify the archive SHA-256 against the separately issued `.sha256` file before distribution or installation.
