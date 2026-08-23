# AutoCAD JSON/LISP integration handoff

## Purpose

This document records the coded JSON contract and the completed AutoCAD integration so a later Codex task can maintain it without rediscovering the schema or workflow.

The web application produces the JSON. AutoLISP release 1.22 contains the reader, coded-field accessors, validation, adapter and `SARTDJSON`/`SARTDJSONDATA` commands. `SARTDRUN` selects the source once, retains the imported case data in memory, and sends every source through the same ModelSpace, Sarens/T.EN PaperSpace, viewport, information-attribute and border/title-block workflow. The JSON and compact CAD readers remain independent of Excel/COM.

Do not redesign the engineering engine in this task. Do not infer a new schema from screenshots. Read the live contract in the source files listed below and keep the AutoLISP reader aligned with that contract.

## Repository and current state

Repository:

`C:\Users\Harry\Documents\Codex\2026-07-16\the\github-publish\Trailer_Stability_BETA`

The current `main` branch contains the coded export and its companion key. At handoff time the latest merge was:

`d9a47fd Merge pull request #17 from Bretwalda98/agent/coded-autocad-export-and-engineering-reference`

Relevant files:

- Web export implementation: `app/engine/autocad-export.ts`
- Downloadable field key: `public/autocad-export-key-v1.json`
- Engineering explanations embedded in the export: `app/engine/engineering-reference.ts`
- Current AutoLISP source: `tools/autocad/SARENS_TRAILERDRAFTSMAN/SARENS_TRAILERDRAFTSMAN_v1.1.lsp`
- Current distributable package: `public/autocad/SARENS_TRAILERDRAFTSMAN_v1.22_FULL_PACKAGE.zip`
- AutoCAD source-package files: `tools/autocad/SARENS_TRAILERDRAFTSMAN/`

The current LISP still contains the old workbook/code transfer path, including `SARTDWEB`, Excel COM functions and legacy comments. Do not use that path for JSON. The JSON implementation is a parser plus an adapter that produces the internal data shape expected by the existing drawing workflow. Do not blindly delete old drawing routines: the JSON command should reuse them where desktop AutoCAD supports the existing VLA/block operations.

### Current implementation status

- `data.r.rv` is emitted by the web exporter and documented in the key. It contains the authoritative post-placement start/centre positions, lengths, widths and rear/front PPU lengths.
- `SARTDJSONDATA` validates the export envelope and writes a `.lisp.log` beside the input file without drawing.
- `SARTDJSON` validates first, then runs the complete retained-data drawing workflow through the JSON adapter and catches drawing errors safely.
- `SARTDJSON` always opens the case-file picker; `SARTDJSONDATA` deliberately reuses only the last validated case.
- `SARTDRUN` first asks `Excel/JSON`. Excel then asks `Active/Browse/Last` once; JSON opens its case picker once.
- After selection, either source uses the same six stages: ModelSpace, Sarens/T.EN PaperSpace selection/import, all matching information attributes, auto-fit and viewport scaling, border/title attributes, and final PaperSpace restoration.
- Auto-fit redraws consume the retained in-memory case, so they do not reopen/reselect the workbook or reparse/reselect the JSON.
- The browser downloads one numbered case file. The versioned decoding key is bundled with the AutoCAD reader instead of being downloaded for every case.
- `Active` discovers compatible workbooks across visible Excel processes and takes a temporary copy containing the current unsaved in-memory values.
- Core Console load and JSON validation tests cover valid three-/four-point exports, invalid JSON, missing file, wrong key, wrong version, missing cargo/trailers and invalid three-/four-point geometry.
- A desktop AutoCAD smoke test is still required for the final packaged drawing result because the existing renderer uses VLA document/block operations that Core Console does not expose in the same way.

## User-facing workflow

The intended workflow is:

1. The user clicks **AutoCAD** in the web application.
2. The browser downloads one export file named like `trailer-stability-autocad-XXXXXX.json`. The companion key is already bundled with the AutoCAD reader package.
3. The user starts AutoCAD, opens or creates a drawing, loads the LISP package, and runs `SARTDRUN`.
4. The LISP asks for Excel or JSON. JSON opens one normal file picker and must not require Excel, a browser bridge or a transfer code. Excel asks for Active/Browse/Last once.
5. The LISP validates/reads the selected source into one retained data object, then asks for the Sarens or T.EN PaperSpace sheet.
6. It draws the arrangement, populates all matching information attributes, scales/fits the viewport, updates the border/title block and leaves the selected PaperSpace sheet fitted to the screen.
7. Errors are reported at the AutoCAD command line and JSON errors are also written beside the input file; malformed input must not leave AutoCAD in a broken state or crash the command session.

Recommended command names:

- `SARTDRUN` — choose Excel or JSON once and run the complete common drawing workflow.
- `SARTDJSON` — direct shortcut to the same complete workflow using one JSON file selection.
- `SARTDJSONDATA` — validate the last successfully selected numbered case and print a compact data summary for debugging without opening the picker or drawing.
- Keep `SARTDWEB` only as an explicitly labelled legacy workbook-transfer command if backward compatibility is useful. It must not be used by the JSON workflow.

`SARTDJSON` must always open the file picker so a remembered test or failed case can never be reused silently. `SARTDJSONDATA` is the only command that deliberately reuses the last validated JSON for a non-drawing diagnostic summary.

## JSON envelope and coded key

Every export has this top-level shape:

```json
{
  "format": "TRAILER-STABILITY-CAD-DATA",
  "version": 1,
  "keyId": "TS-CAD-KEY-1",
  "generatedAt": "2026-08-13T00:00:00.000Z",
  "data": {
    "c": {},
    "cg": {},
    "pk": {},
    "tr": [],
    "hy": {},
    "su": [],
    "en": {},
    "sp": {},
    "cat": {},
    "r": {},
    "eng": {}
  }
}
```

The key identifier is deliberately coded:

`TS-CAD-KEY-1`

The complete human-readable key is in `public/autocad-export-key-v1.json`. The LISP should validate `format`, `version` and `keyId` before drawing. Unknown fields must be ignored so the web export can add fields without breaking older LISP versions. A changed meaning or removed field requires a version/key change rather than silent reinterpretation.

### Coordinate and unit conventions

- X increases from rear to front.
- Rear is the lower-X/left side.
- Front is the higher-X/right side.
- Coordinates are absolute metres from the case datum unless a field explicitly says it is an offset.
- Y is transverse position; retain the sign convention already used by the existing drawing workflow and document the mapping in the LISP comments.
- Masses are tonnes.
- Forces are kN.
- Angles are degrees.
- Wind speed is m/s.
- Lengths and positions are metres.
- The JSON result is authoritative for the arrangement actually calculated. Do not recalculate a different arrangement in AutoCAD.

The rear/front rule is important. Every routine that labels a trailer, PPU, axle line, support or stability edge must know that the lower X end is rear and the higher X end is front. Do not use array order alone to decide front/rear.

## Coded section and field map

The compact keys are only the outer field names. Some result and grouping values are deliberately retained as verbose objects so the full engineering detail is not lost. The LISP must therefore support both compact outer keys and ordinary object properties inside the values.

### `data.c` — case

| Key | Meaning |
|---|---|
| `id` | Case/project identifier |
| `cr` | Client reference |
| `or` | Owner reference |
| `er` | Engineering/verification degree |
| `wr` | Weight/COG reference |
| `rp` | Reference/datum point |
| `ox` | Origin/reference metadata |

### `data.cg` — cargo

| Key | Meaning |
|---|---|
| `n` | Cargo name |
| `l`, `w`, `h` | Cargo length, width and height |
| `ex`, `ey` | Cargo rear-X and lower-Y extreme coordinates |
| `m` | Cargo mass |
| `x`, `y`, `z` | Cargo COG |
| `exn`, `eyn` | Symmetric cargo COG-envelope half-widths in X and Y |
| `sa`, `sc`, `sh` | Side/projected wind area, coefficient and application height inputs |
| `fa`, `fc`, `fh` | Front/projected wind area, coefficient and application height inputs |

`ex`/`ey` locate the cargo footprint and must never be substituted for the COG
envelope. `exn`/`eyn` are the calculation inputs used to build the four COG
envelope corners around the neutral cargo or combined COG.

### `data.pk` — packing

| Key | Meaning |
|---|---|
| `en` | Packing enabled |
| `m` | Packing mass |
| `h` | Packing height |
| `x`, `y`, `z` | Packing COG |
| `fp` | Optional visual footprint metadata |

Packing footprint data is visual metadata. The AutoCAD drawing may show it if useful, but it must not replace the calculated cargo/packing positions supplied by the result.

### `data.tr` — active trailers

`tr` is an array. Each object represents one active selected trailer.

| Key | Meaning |
|---|---|
| `id` | Trailer instance identifier |
| `n` | Catalogue/model name |
| `al` | Axle lines |
| `sf` | Single-file flag/mode |
| `x`, `y` | Resolved trailer start X and centre Y |
| `xr`, `yr` | Raw input X/Y before resolving placement mode |
| `pr` | Placement reference/mode |
| `ox`, `oy` | Placement offsets |
| `rb` | Rear PPU enabled; rear is lower X |
| `ff` | Front PPU enabled; front is higher X |
| `w` | Trailer/deck width |
| `ap` | Axle pitch/spacing |
| `ah` | Axle capacity |
| `dh` | Neutral/deck height |
| `tw` | Tyre width |
| `wd` | Wheel/tyre diameter |
| `pl`, `fl` | Rear/front PPU lengths |

The exporter first uses the resolved trailer start and centre. When the result contains `r.resolvedTrailers`, prefer its exact `startXM`, `centreYM`, `lengthM`, `widthM`, `ppuLeftLengthM` and `ppuRightLengthM` values for drawing. The compact `tr` values are the fallback and are still required for validation and annotations.

### `data.hy` — hydraulics

| Key | Meaning |
|---|---|
| `md` | Hydraulic mode, such as three-point or four-point |
| `g` | Full hydraulic grouping array; group objects retain verbose properties |
| `sp` | Shared split-after axle line |
| `pi` | Shared pinned axle lines |

Do not default to a triangle. For a four-point grouping, draw the four-point boundary/polygon supplied in the result. A four-point arrangement may be a quadrilateral or another valid convex hull; the number and order of points must come from the result.

### `data.su` — supports

`su` is an array. Compact fields:

| Key | Meaning |
|---|---|
| `id` | Support identifier |
| `x` | Support X position |
| `w` | Support width/spread |
| `al` | Allowed flag |
| `ac` | Active flag after support settling |
| `pc` | Positive connection to the deck/spine beam; permits a warned tensile reaction when true |
| `rs` | Final reaction state, including restrained tension |
| `ra` | Settled reaction |
| `rt` | Reaction/status text |
| `dr` | Detail/status data |

Use the result support state, not just the input allowed flag, when drawing active/inactive support status.

### `data.en` — environment and road inputs

| Key | Meaning |
|---|---|
| `rls`, `rts` | Longitudinal and transverse road slopes |
| `rlsr`, `rtsr` | Road slope references/metadata |
| `cf` | Friction/traction coefficient set |
| `ws` | Wind speed |
| `la`, `ta` | Longitudinal/transverse acceleration |

Road slope is already reflected in the shifted COG/stability cases in the engineering result. Show the road inputs as annotations if required, but do not draw a sloped ground line in the side or end view unless a future explicit display option is added. The current visual convention is to show the shifted COG envelope and stability boundaries instead.

### `data.sp` — spine beam

| Key | Meaning |
|---|---|
| `at` | Beam/attachment data |
| `lc` | Load case |
| `ms` | Beam metrics/settings |

### `data.cat` — catalogue

| Key | Meaning |
|---|---|
| `all` | Catalogue data needed to identify selected trailer geometry |

### `data.r` — authoritative result

| Key | Meaning |
|---|---|
| `st` | Overall result status |
| `fc` | Failure class |
| `fd` | Failure detail |
| `tm` | Total/all-inclusive mass |
| `lc` | Load COG result |
| `cc` | Combined COG result |
| `gp` | Hydraulic groups/result group geometry |
| `ax` | Axle points and loads |
| `sx` | Spine/beam axle points |
| `ss` | Settled supports, including raw reactions, reaction states and disable reasons |
| `se` | Complete support-settlement reaction table and state-transition trace |
| `ov` | Trailer overlap pairs |
| `gq` | Grouping quality |
| `pg` | Stability polygon / hydraulic boundary points |
| `cp` | Basic, slope and dynamic case points |
| `sr` | Stability references |
| `an` | Controlling analysis |
| `rt` | Road transport result |
| `bm` | Beam metrics |
| `mt` | Full metric values |
| `ws` | Warnings |
| `ms` | Calculation duration in milliseconds |

Important result substructures are not flattened. Preserve their property names when decoding. In particular, inspect the actual objects in `app/engine/autocad-export.ts` and use the result as the source for exact points and labels:

- `ax` contains axle point records with trailer id/index, axle line, group, pinned state, point coordinates, capacity, tare, load and utilisation.
- `pg` contains the ordered stability polygon/hull points. Use it for three-point and four-point drawing.
- `cp` contains the basic/slope/dynamic shifted points or polygons used for stability cases.
- `lc` and `cc` contain load and combined COG information.
- `ss` contains settled support information.
- `ov` contains overlap diagnostics.
- `bm` contains beam extrema/deflection/shear/bending information where available.

### `data.eng` — engineering reference

| Key | Meaning |
|---|---|
| `iv` | Current engineering values used for this case |
| `methods` | Calculation constants and method descriptions |

This section is suitable for an AutoCAD engineering-information table or a debug export. Do not replace it with guesses in the LISP.

## AutoLISP implementation plan

### 1. Build a small JSON parser

AutoLISP does not have a dependable built-in JSON parser. Add a self-contained parser to the LISP package. It must support:

- objects;
- arrays;
- strings;
- numbers including negative values and exponent notation;
- `true`, `false` and `null`;
- whitespace between tokens;
- JSON string escapes including `\\`, `\"`, `\/`, `\n`, `\r`, `\t`, `\b`, `\f` and `\uXXXX`.

Recommended internal representation is tagged values to avoid confusing an empty object with an empty array:

```lisp
('sartd-json-object (("format" . "TRAILER-STABILITY-CAD-DATA") ...))
('sartd-json-array  (('sartd-json-number . 1.0) ...))
('sartd-json-string . "text")
('sartd-json-number . 12.3)
('sartd-json-boolean . T)
('sartd-json-null)
```

The exact representation is up to the implementer, but access must be centralised in functions such as:

```lisp
(sartd:json-get object "data")
(sartd:json-number value default)
(sartd:json-string value default)
(sartd:json-bool value default)
(sartd:json-array-items value)
```

Do not scatter raw `assoc` calls through all drawing routines. JSON object keys are strings; do not assume they are AutoLISP symbols.

Read the selected file as text, parse it, and include the source path and generated timestamp in the internal data structure for logging. Prefer a file-reading method that handles UTF-8 safely. The current export is ASCII-compatible for its keys and most values, but the parser should not corrupt case names containing non-ASCII characters.

### 2. Validate before drawing

Reject the file with a readable command-line message if:

- the file cannot be opened;
- JSON is malformed, with the character position if possible;
- `format` is not `TRAILER-STABILITY-CAD-DATA`;
- `version` is unsupported;
- `keyId` is not `TS-CAD-KEY-1`;
- `data` is absent;
- no cargo or no active trailer is present;
- required numeric geometry is missing or non-numeric;
- a four-point result is marked four-point but has fewer than four boundary points;
- a trailer has no usable width/length/position.

Warnings such as absent optional beam metrics should not block drawing. Report them in a final summary and write them to a log.

### 3. Adapt JSON into the existing drawing model

The current LISP has a mature drawing workflow and many routines that expect workbook-shaped data. Implement a function such as:

```lisp
(sartd:read-json-data path)
(sartd:json-to-drawing-data json)
```

The adapter should return the same internal keys consumed by `sartd:v69-run-workflow` and the drawing routines, or add a parallel JSON workflow that calls the same drawing stages. Do not make every drawing routine know about compact keys.

At minimum, the adapter must provide:

- case metadata;
- cargo dimensions, COG, mass and envelope values;
- packing mass/height/COG when enabled;
- every active trailer and its resolved absolute X/Y placement;
- trailer width, axle pitch, axle count, deck height, tyre dimensions and PPU state;
- all axle points, group assignments and pin states;
- hydraulic mode, groups, split line, pins and the authoritative polygon;
- supports and settled reactions;
- road, acceleration, wind and friction inputs;
- result status, warnings, COGs, stability cases, angles, beam metrics and traction/braking outputs.

The adapter is allowed to use neutral internal names such as `trailers`, `axles`, `supports`, `hydraulic-polygon`, `result`, etc. It is not required to expose the web compact names to the old drawing code.

### 4. Drawing geometry rules

#### Plan view

- Draw cargo using its actual X/Y extremes and dimensions.
- Draw every trailer at its resolved absolute X/Y location.
- Use the selected trailer catalogue width and exact result-resolved length where available.
- Draw staggered/non-inline formations correctly; do not force all trailers onto one centreline.
- Draw rear at lower X/left and front at higher X/right.
- Draw all axle lines and group colours from the decoded records.
- Draw supports at their decoded positions and widths.
- Draw the hydraulic boundary from ordered `r.pg`/result polygon points. A four-point case must visibly have four boundary corners/edges; never fall back to a triangle merely because the old renderer assumed three groups.

#### Side view

- Do not draw the sloped ground line. Road slope is represented by the shifted COG envelope/case data.
- Deck top is the trailer deck height.
- Packing bottom sits on the deck top when enabled.
- Cargo bottom sits on the top of the packing.
- The top of the PPU should align with the top of the deck. Use the selected trailer PPU/deck dimensions; do not hard-code a generic PPU height.
- Draw trailer/deck, suspension and axle lines with dimensions from the selected catalogue/result.
- Show COG and shifted stability case points from the result rather than recomputing an inconsistent line.

#### End/rear view

- This is a true transverse end view, not a plan view of round wheels.
- Tyres must be vertical end-view profiles: rectangular/chamfered tyre silhouettes with visible width/depth, not circles.
- Use tyre width and wheel diameter from the selected trailer data. Draw the correct number of tyres/suspension assemblies from axle records and single-file mode.
- Position tyre pairs and suspension assemblies from actual axle/pendulum/cross-track data. If a precise transverse offset is present in the result axle point, use it; do not use the old fixed K2400 offsets as the primary geometry.
- Keep the deck and suspension symmetrical only when the decoded geometry is symmetrical.
- Draw the COG shifted ring/points and stability-angle lines from the correct edge outward. The line origin must be the relevant edge/boundary point and the COG shifted point/ring, not an inward line starting at an arbitrary wheel centre.
- Basic, slope and dynamic angle lines must use their corresponding case points/angles from `r.cp`/`r.sr` and be labelled with their actual values.

#### Tables and annotations

- Keep the useful existing table and title-block output.
- Include the JSON filename, `generatedAt`, export `version` and key id in a small source note.
- Include case name/reference, trailer arrangement, groups, active supports, status and controlling condition.
- Show warnings and unavailable metrics clearly; do not print a misleading zero for absent data.

## Error handling and AutoCAD state safety

Wrap the top-level command in a robust error handler. Save and restore any changed system variables (`CMDECHO`, `OSMODE`, layers, current space, UCS/view settings and similar). Close files and release any temporary objects on success or failure.

Use `vl-catch-all-apply` around file access, parsing and drawing stages where practical. A single bad optional annotation must not prevent the core arrangement from being drawn. On a fatal validation error, stop before creating partial geometry if possible.

Write a diagnostic log beside the selected JSON, for example:

`trailer-stability-autocad-<case>-lisp.log`

Log:

- source path and timestamp;
- envelope validation;
- decoded case/trailer/group/support counts;
- each drawing stage;
- warnings and skipped optional fields;
- final object counts and errors.

Do not log secrets or Windows user credentials. The JSON contains engineering data, so make the log location explicit to the user.

## Compatibility and packaging

The existing package contains the old workbook transfer workflow. Add the JSON reader and command to the source package and update the distributable package. The resulting ZIP should include:

- the updated `.lsp`;
- `README.md` with load/command instructions;
- `autocad-export-key-v1.json` or a copy/reference to the key;
- any required `.dcl`, `.scr`, `.txt`, block or support files;
- a short JSON test fixture if it does not expose a real customer case.

Do not make the website depend on AutoCAD being installed. The website only downloads the JSON. AutoCAD is the consumer.

## Test checklist

Use an export generated by the current web application and test in AutoCAD:

- [ ] Open a valid three-point case; the plan view draws a triangle from the authoritative polygon.
- [ ] Open a valid four-point case; the plan view draws a quadrilateral/four-point boundary, never a default triangle.
- [ ] Verify lower X is labelled rear/left and higher X is labelled front/right.
- [ ] Verify rear PPU and front PPU are on the correct ends.
- [ ] Verify at least two trailers with different X and Y positions are drawn without being forced inline.
- [ ] Verify trailer width, axle pitch, deck height and tyre dimensions change when a different catalogue trailer is selected.
- [ ] Verify the correct number of axle lines, tyre profiles and suspension assemblies are drawn.
- [ ] Verify pinned axle lines and group assignments match the JSON.
- [ ] Verify inactive/settled supports and reactions match `data.su`/`data.r.ss`.
- [ ] Verify side-view stacking: deck, packing, cargo and PPU heights.
- [ ] Verify no sloped ground line is drawn in side/end views.
- [ ] Verify basic/slope/dynamic stability lines originate from the correct shifted COG/boundary locations and point outward from the controlling edge.
- [ ] Verify cargo and combined COG annotations are distinct and correctly labelled.
- [ ] Verify warnings, failure class and unavailable metrics are shown without substituting false zeros.
- [ ] Try a missing file, malformed JSON, wrong format, wrong key id and unsupported version; each gives a readable error and leaves AutoCAD usable.
- [ ] Run `SARTDRUN > Excel`; select Active/Browse/Last once, choose Sarens or T.EN, and confirm the retained workbook data populates ModelSpace and all matching PaperSpace information attributes without another workbook prompt.
- [ ] Run `SARTDRUN > JSON`; select the numbered case once, choose Sarens or T.EN, and confirm the retained JSON data populates the same ModelSpace/PaperSpace stages without Excel COM or another JSON prompt.
- [ ] Confirm `SARTDJSON` is a direct shortcut to the same full JSON workflow and `SARTDJSONDATA` alone reuses the last case for non-drawing diagnostics.
- [ ] Load the final v1.22 ZIP into a clean AutoCAD profile and test all retained import sources from a new blank drawing.

## Maintenance boundary for the next Codex chat

Maintain the v1.22 reader, adapter, retained-data workflow, four-point-aware geometry and packaged documentation. Keep the web export contract unchanged unless a real schema defect is found. If a schema change is unavoidable, update all three together:

1. `app/engine/autocad-export.ts`;
2. `public/autocad-export-key-v1.json`;
3. this handoff and the AutoLISP reader.

Do not reintroduce visible references to Excel or EZ Trailer into the web application. The AutoCAD package may retain clearly labelled legacy workbook code for backward compatibility, but the new JSON workflow must be the primary integration path.

## Suggested first prompt for the next Codex chat

> Read `docs/AUTOCAD_JSON_LISP_HANDOFF.md` completely. Then inspect `app/engine/autocad-export.ts`, `app/engine/autocad-compact-export.ts`, `public/autocad-export-key-v1.json`, `app/engine/engineering-reference.ts` and `tools/autocad/SARENS_TRAILERDRAFTSMAN/SARENS_TRAILERDRAFTSMAN_v1.1.lsp`. Maintain the v1.22 retained-data workflow: SARTDRUN selects Excel, compact CAD or JSON once, and every source completes the same ModelSpace, Sarens/T.EN PaperSpace, attribute, viewport and title-block stages. Use authoritative resolved geometry/results, support both three-point and four-point boundaries, enforce rear=lower-X/front=higher-X, and do not let JSON or compact CAD invoke Excel COM. Preserve cargo/packing/deck Z datums, direct Group 4 values, neutral/A-D pressures and overall/per-group GBP. Do not guess the schema; run the malformed-input, three-/four-point and single-selection regressions before packaging.
