# Four-Point Engineering Data Mapping

## Authority and conventions

This is the controlled source-to-engine-to-output map for three- and four-point
Trailer Stability cases. The calculation engine in `app/engine/core.ts` is the
authoritative web result. The latest calculation reference is
`Trailer_Stability_Calculator_Optimiser_v0.8_4Point_InPlace.xlsm`; it extends
the existing `Load and Stability Calculation` and `Export to DWG` sheets in
place. AutoCAD consumes the calculated web result and must not recalculate it.
The website export uses the tracked copy
`public/templates/Trailer_Stability_Verification_Template_v0.8_4Point_InPlace.xlsm`
and records contract identifier `TS-XLSM-4P-1` in `TS_CONTROL!B102`.

- Lengths are metres in `ProjectModel`/JSON, millimetres in compact CAD, and
  workbook display units shown by the relevant cells.
- Mass/load is tonnes unless a property explicitly ends in `KN` or `KNm`.
- Lower X/screen left is rear; higher X/screen right is front.
- Cargo COG Z is measured from cargo bottom. Packing COG Z is measured from
  packing bottom. The absolute cargo datum is deck + packing + cargo-relative Z.
- Required means a valid calculated case cannot be reconstructed without it.
  Optional values may be blank and retain the documented fallback.

## Input and state map

| Domain | Four-point workbook source | Web source | CAD output | Requirement |
|---|---|---|---|---|
| Case | `F17`, `D21`, `J21`, `D22`, `J22`, `D48` | degree, cargo refs, weight/COG ref, datum | JSON `c`; compact `CASE` | Required except descriptive refs |
| Cargo geometry | `C52:C56` | `cargo.lengthM`, `widthM`, extremes, `heightM` | JSON `cg`; compact `LOAD[1:5]` | Required; positive dimensions |
| Wind | `C57:C60`, `F57`, `F59`, `E353` | cargo areas, coefficients, heights; wind speed | JSON `cg`/`en`; compact `LOAD` + `RESULT[10]` | Required when wind check active |
| Cargo mass/COG | `C63:C66` | `cargo.massT`, `cargo.cog` | JSON `cg`; compact `LOAD[6:9]` | Required |
| COG envelope | `E64:E65` | `cargo.envelopeX/Y` | JSON `cg.exn/eyn`; compact `LOAD[10:11]` | Required non-negative half-widths |
| Packing | `C70:C74` | `packing.massT`, `heightM`, `cog` | JSON `pk`; compact `PACKING` | Optional; zero mass/height disables physical effect |
| Packing footprint | no calculation cell | `packing.footprint` | JSON `pk.fp` only | Optional, web visual only |
| Deck | `C85` | `trailerDeckHeightM` | trailer JSON `dh`; compact `DECK` | Required |
| Trailer catalogue | `Database!A:W`, `tblTrailerData` | `catalogue[]` | JSON `cat` and selected `tr`; compact resolved `TRAILER` | Required for every selected model |
| Trailer selection | `B89:B100` | `trailers[].definitionId` | JSON/compact trailer name | Required for enabled rows |
| Shared AL and X | `C89:C100`, `E89:E100` (top input plus copied formulas) | `trailers[].axleLines`, resolved `startXM` | JSON `tr.al/x`, `r.rv`; compact `TRAILER[3:4]` | Workbook-compatible shared values required |
| Trailer Y and PPU | `F89:F100`, `J89:K100` | resolved centre Y; rear/front PPU | JSON `tr.y/rb/ff`; compact `TRAILER[5,9:14]` | Y required; PPUs optional |
| Hydraulic mode | `D133` | `hydraulicSystemMode` | JSON `hy.md`; compact `HYDRAULIC[2]` | Required; explicit mode overrides legacy inference |
| Corner routing | `B138:C161` | `groupings[].cornerGroups` | JSON `hy.g`; compact `HYDRAULIC[4:7]` | Three populated groups for 3-point; four for 4-point |
| Shared split/pins | `D138:D161`, `G:N136:147` | split and pinned AL arrays | JSON `hy.sp/pi`; compact `HYDRAULIC[3]`/`PINS` | Split required; pins optional |
| Supports | position `E71:E80`/`C446:C455`; width `D446:D455`; allowed `F446:F455`; reaction `G446:G455`; active `I446:I455` | `supports[]` plus settled result | JSON `su`/`r.ss`; compact `SUPPORT` | At least configured minimum active supports |
| Route/actions | `D291:E293`, `E353:E355` | environment slopes, factor, wind, accelerations | JSON `en`; compact `RESULT[8:11]` | Required for active checks |
| Spine beam | `F433:F435`; loose packing `B,D:F439:442` | analysed trailer, case, mesh, loose packing | JSON `sp`, result `bm` | Settings required when beam check active |

The importer reads `D133` first. Legacy files without that cell fall back to
Group 4 routing inference. The exporter always records `3-point` or `4-point`
in `D133`, so mode cannot be lost during an import/export round trip. Export is
stricter than import: it rejects templates without the required sheets, VBA,
`tblTrailerData`, direct Group 4 reaction/centre formulas, Group 4 output cells,
or the four-point `Export to DWG` polygon check. This prevents an older
three-point-only workbook from silently becoming the export target.

The export also writes `TS-XLSM-4P-1` support metadata in
`TS_CONTROL!D102:G112`: support ID, user-allowed state, final settled-active
state and positive-connection state. This preserves the distinction between a
support deliberately disabled by the user and one disabled by reaction
settling when the workbook is imported again. Existing workbook eligibility
formulas in `F446:F455` remain formulas; the final settled state is written to
`I446:I455`.

## Calculated output map

| Result | Workbook output | Web result | CAD output |
|---|---|---|---|
| Group centres/boundary | `K151:M154`, `Export to DWG!C49:D55` | `groups[].point`, `stabilityPolygon` | JSON `r.gp/r.pg`; compact `GROUP`/`BOUNDARY` |
| Neutral/A–D loads | main group tables around rows `252:266`; Group 4 `N:Q` helpers | `stabilityLoads` and `groups` | JSON `r.gp/r.hp`; compact `GROUP[3:8]` |
| Active bogies/AL and GBP | rows `249:266`; `Export to DWG!C9:J26` | `groundBearing` | JSON `r.gb/r.sm`; compact `GROUP[9:15]`/`SUMMARY` |
| Stability utilisation/angles | `F503:F505`, `L503:L505`; detailed cargo/combined cases in checks 2, 3 and 5 | `metrics`, `stabilityReferences`, `analysis` | JSON `r.mt/r.sr/r.an`; compact governing angles in `RESULT` |
| Dynamic/static ratio | `L506` | `metrics.dynamicRatio` | JSON `r.mt` |
| Spine utilisation/extrema | `F506` plus spine-beam sheets | `beam`, `metrics.spineUtil` | JSON `r.bm/r.mt` |
| Support settlement | `G446:I455` | `supports`, `activeSupportCount` | JSON `r.ss`; compact `SUPPORT` |
| Road traction/braking | no complete v0.8 cell contract | `roadTransport` | JSON `r.rt` | Web/CAD JSON authoritative; not invented in workbook |
| Status and warnings | workbook checks/logs | `status`, failure class/detail, warnings | JSON `r.st/r.fc/r.fd/r.ws`; compact `CASE`/`RESULT` |

## Verification case and tolerances

The regression case in `tests/engine-and-workbook.test.ts` is passed through
the web calculation, JSON export, compact CAD export, workbook patching and
workbook re-import. It proves:

- four groups and four ordered boundary points survive every web/CAD path;
- force and X/Y moment equilibrium close within `1e-6`;
- cargo, packing, wind, trailers, supports, shared AL and hydraulic mode round
  trip without changing values;
- compact `LOAD` and retained `RESULT` envelopes are identical millimetres;
- overall/per-group GBP and neutral/A–D pressure values come from the same
  authoritative result.
- settled support active states are written before Excel recalculates reaction,
  GBP, hydraulic load and stability formulas;
- the workbook archive, VBA project, formula/drawing parts and sheet structure
  survive export unchanged except for the documented mapped cells, catalogue
  table extent and forced full-calculation settings.

The obsolete calculation chain is removed during export so Excel rebuilds it
against the newly written inputs. This is intentional and is verified by
opening without repair, performing a full calculation, saving and reopening.
Expected `#N/A` placeholders in formula rows belonging to blank trailer slots
are recorded separately; any error in an active row or other key output range
fails verification.

The workbook verifier
`tools/excel/verify_v08_four_point_in_place.py` independently records exact
three-point parity, four-point force/moment equilibrium, polygon validity,
Group 4 calculations, drawings and VBA presence in
`tools/excel/outputs/v08_4point_in_place_verification.json`. Negative reaction
settling is intentionally tracked separately as TS-012; it is not hidden or
reclassified by this mapping contract.

`tools/excel/verify_web_export_v08.py` opens a generated website workbook in
desktop Excel, performs a full rebuild, saves and reopens it, then checks the
contract ID, required sheets, direct Group 4 formulas, four-point boundary,
Group 4 loading/GBP outputs, support reactions and key formula ranges.
