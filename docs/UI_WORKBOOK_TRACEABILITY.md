# UI and Workbook Traceability

Audit date: 2026-07-26  
Application: `trailer-stability-native-web` v0.7.0-standalone.1  
Workbook baseline: `outputs/Trailer_Stability_Calculator_Optimiser_v0.7.xlsm`

## Audit evidence

- Current UI captures: `audit/ui-redesign-2026-07-26/02-standalone-current-1440x900.png` through `07-current-verify-1440x900.png`.
- Visual reference capture: `audit/ui-redesign-2026-07-26/08-inspiration-ertdfgcvb-1440x900.png`.
- Machine-readable workbook inventory: `audit/ui-redesign-2026-07-26/workbook-audit-v0.7.json`.
- Workbook inspection helper: `scripts/audit-workbook.mjs`.
- Baseline verification: `pnpm.cmd test` passes type-checking, the engine/workbook round trip, production build and both rendered-HTML tests.

## Current application architecture

| Area | Current implementation | Audit finding |
| --- | --- | --- |
| Frontend | Vinext/Next-compatible App Router, React 19, TypeScript | Appropriate framework; no replacement is needed. |
| Main UI | `app/components/TrailerWorkbench.tsx` (about 1,400 lines) | Six screens and most interaction state are concentrated in one component. Refactor by engineering domain. |
| State | Local React `useState`; calculation derived with `useMemo`; project persisted to `localStorage` | Simple and compatible with saved JSON. Selection, viewport, layers and panel layout need separate UI state. |
| Calculation execution | `calculateProject(model)` runs inside the render process through `useMemo`; `runOptimiser` also calls it in the browser task and only yields with `setTimeout(0)` | Contrary to the supplied premise, there is no browser calculation Web Worker. `worker/index.ts` is the Cloudflare/server entry point. A browser-worker orchestration layer is required before claiming the UI remains responsive under calculation load. |
| Engineering engine | `app/engine/core.ts`, `beam.ts`, `optimiser.ts` | Engine is already separated from the UI. Formula and sequence changes are out of scope for the visual redesign. |
| Visualisation | Bespoke React/SVG in `app/components/Charts.tsx`; no charting library | Reusable and lightweight, but each chart owns its own coordinate transform. Replace with one typed geometry/view-model adapter. |
| Import/export | `app/engine/workbook.ts`, XLSX import plus OOXML-preserving verification export | Broad workbook mapping and VBA preservation are already tested. Keep this module authoritative. |
| Offline/mobile | PWA manifest, service worker and local persistence | Preserve. Desktop remains the primary engineering target. |
| Tests | Node assertions for engine, beam, optimiser and workbook parity; two server-rendered HTML tests | Strong engine baseline, but no geometry-adapter, interaction, accessibility or screenshot tests. |
| Repository | The supplied `standalone-web` directory and its parents contain no usable `.git` repository | Logical commits, branch name and push are blocked until a repository/worktree is supplied or initialisation is explicitly authorised. |

## Current workspace screens

1. **Live analysis** — result banner, mass/support/time summaries, eight metric cards, plan/stability/elevation/axle charts and beam diagrams.
2. **Load & trailer setup** — project/cargo, packing, trailers, grouping, supports, spine-beam and environmental input forms.
3. **Optimiser** — all optimiser controls, progress, weights, ranked passes and activity in one long page.
4. **Cases & activity** — run summary, full case table and event table.
5. **Trailer catalogue** — searchable catalogue list and property editor.
6. **Import & verify** — XLSM import, verification-workbook export and portable JSON import/export.

The current shell is functional, but the screenshots show a generic rounded-card dashboard. Geometry is below metrics, invalid cases still devote most of the viewport to zero/NOK tiles, and configuration is separated from the geometry it changes.

## Engine interfaces available to the frontend

### Inputs already represented by `ProjectModel`

- Project source, engineering degree and workbook references.
- Cargo dimensions, datum/extremes, mass, COG, envelope and wind properties.
- Packing mass, height and COG.
- Up to 12 trailer units, catalogue definition, axle-line count, one/multi-file mode, X/Y placement, relative-placement mode and PPUs.
- Per-trailer hydraulic corner groups, split, explicit group array and pinned axle lines.
- Up to 10 supports with X, width, allowed/active state and optional weight.
- Route/residual slopes, combination factor, wind and longitudinal/transverse acceleration.
- Analysed trailer, spine load case, mesh size and loose packing.
- Complete optimiser scan, support gate, deflection/pin search, weighting, refinement and progress settings.
- Complete dynamic trailer catalogue.

### Authoritative calculated outputs already available

- Load and all-inclusive combined COG, total mass and resolved trailer bounds.
- Axle points with group, pin state, load, tare, capacity and utilisation.
- Hydraulic group centres, axle count, load and reaction fraction.
- Stability triangle/polygon and basic, slope and dynamic case-point arrays.
- Settled support state, reaction, disable reason, active count and iteration count.
- Beam points for shear, moment and deflection plus extrema, positions and utilisations.
- All current final checks, warnings, fail class/detail and calculation duration.
- Optimiser passes, stable references, rank, progress, events and candidate settings.

### Calculated data present but not exposed by the current UI

- Exact support reactions and disable reasons in a persistent table.
- Group reaction fractions and group loads next to the hydraulic geometry.
- Per-axle loads/capacities as a selectable geometry/table pair.
- All individual basic/slope/dynamic case points.
- Spine-beam extrema coordinates, local bending result and detailed structural metrics.
- Resolved PPU lengths and resolved trailer engineering bounds.
- Full optimiser pass result objects, progress accounting and error detail.

### Data requiring a display-only view-model adapter

- Shared engineering-to-screen transforms, bounds and fit-to-view.
- Stable selectable geometry entities, source references and labels.
- Trailer outlines, deck centrelines, axle/bogie rows, PPUs and orientation glyphs.
- Hydraulic route segments and group-coloured axle-line segments.
- COG marker catalogue assembled from authoritative model inputs and exposed result points.
- Stability polygon edges, candidate controlling-edge display and envelope paths.
- Support footprint/spread display from X and width.
- Beam schematic entities and synchronised diagram/table selections.
- Unit formatting, precision, visibility, selection and inspector metadata.

The adapter may transform and aggregate values already supplied by the model/result. It must not reproduce stability, load-distribution, beam or optimiser formulas.

## Workbook inventory

The audited XLSM contains 31 sheets, 1,496 defined names, one trailer table, 26 charts, six drawing collections, comments, embedded guidance images, VBA and an external link. The principal engineering sheets are:

- `Load and Stability Calculation` — `A1:DP685`, 35,013 populated cells, 2,124 formulas, 16 charts.
- `Spinebeam calculation` — `A1:GYK161`, 32,340 populated cells, 412 formulas, eight charts.
- `Slope effect COG` — two COG/stability charts.
- `Database` — `tblTrailerData`, `A3:W18`, 23 defined property columns.
- `TS_COMMAND_CENTER`, `TS_CONTROL`, `TS_OPTIMISER_LOG`, `TS_LIVE_FEED`, `TS_RUN_ACTIVITY_LOG`.
- Supporting bogie, load-case, coordinate, dynamic COG, unit and code/guidance sheets.

## Traceability matrix

Status is the state at this audit checkpoint, before the new workspace implementation.

| Workbook feature | Source cells / defined data / engine output | Current website support | Required new UI component | Status |
| --- | --- | --- | --- | --- |
| Project and verification degree | `F17`, `D21`, `J21`, `D22`, `J22`, `D48`; `ProjectModel` | Editable in setup | Case header plus Engineering details / Project | Partial |
| Cargo dimensions and datum | `C52:C60`, `F57`, `F59`; `model.cargo` | Editable form; basic plan/elevation outline | Cargo inspector, plan/end/side geometry, exact table | Partial |
| Cargo mass and COG | `C63:C66`; `model.cargo.massT/cog` | Editable and one plan/elevation marker | Toggleable cargo COG with X/Y/Z dimensions | Partial |
| COG envelope | `E64:E65`; `model.cargo.envelopeX/Y`; `result.casePoints` | Used in stability chart | Named A/B/C/D envelope, selectable load-case layers | Partial |
| Packing | `C70:C74`; `model.packing` | Editable; only generic elevation block | Plan/end/side packing geometry and table | Partial |
| Optional/counterweights | `E71:E80`, `F71:F80`; support optional weights | Editable as support optional weight | Plan/side footprint, label and details row | Partial |
| Trailer deck height | `C85`; `model.trailerDeckHeightM` | Editable | End/side dimension and datum | Partial |
| Trailer selection and arrangement | `B89:K100`; `model.trailers` | Editable cards | Model tree, plan/end/side selectable trailer units | Partial |
| Trailer footprint collision | physical deck/PPU extents; `result.trailerOverlaps` | Not present | Hard geometry failure, red plan outline, optimiser rejection and detailed log rows | Complete in native engine |
| Shared axle-line count | `C89:C100`; `applySharedAxleLines` | Editable per card and optimiser | Explicit shared master control and dependency label | Partial |
| Shared trailer X | `E89:E100`; `applySharedX` | Editable; relative mode available | Drag/select plus exact X control and reference mode | Partial |
| Trailer Y and relative placement | `F89:F100`; placement reference/offset | Editable | Plan manipulation, load/all-inclusive COG reference overlay | Partial |
| One-file / multi-file arrangement | `D89:D100`; `singleFile` | Editable, lightly visualised | True bogie-row geometry in plan/end views | Partial |
| PPU selection and catalogue data | `J89:K100`, `tblTrailerData[G:H]` | Editable; basic plan/elevation blocks | Correct-end PPU geometry, mass/COG details and layers | Partial |
| Trailer catalogue | `Database!A3:W18`, `tblTrailerData`, `TrailerTypeList` | Search/edit/custom model, import/export | Compact catalogue dialog and preflight diagnostics | Complete functionally |
| Hydraulic corner grouping | `B:C138:161`; `cornerGroups` | Table-style controls | Interactive plan routes with synchronised exact table | Partial |
| Split after axle line | `D138:D161`; `splitAfterAxleLine` | Editable | Clear split handle/control on both circuits | Partial |
| Pinned axle lines | `G136:N147`; `pinnedAxleLines` | Clickable chips/grid | Visible pin state in all views and synchronised rows | Partial |
| Hydraulic group centres | `K151:K153`, `M151:M153`; `result.groups[].point` | Stability triangle only | Named centres with coordinates, counts and loads | Partial |
| Hydraulic group locality and triangle quality | axle connectivity; `result.groupingQuality` | Not present | Connected-cluster warning, triangle area, minimum altitude and narrow-shape diagnostics | Complete in native engine |
| All-inclusive combined COG | workbook `L158:M158`; `result.combinedCog` | Single chart marker | Primary COG layer and inspector value | Partial |
| Neutral group loads | rows `262:266`; `result.groups[].loadT/reactionFraction` | Metric/axle chart only | Group contribution/load table beside hydraulic view | Partial |
| Basic static capacity | rows `262:266`, summary `F503`; `metrics.basicUtil` | Metric card and axle chart | Persistent result inspector plus controlling geometry | Partial |
| Ground-bearing pressure | rows `268:281` | Native overall and per-group GBP in engineering details/report and CAD outputs | GBP calculation/result table and pressure footprint | Implemented from active trailer width × axle pitch shadow areas; group demand uses maximum A-D envelope reaction. |
| Route and residual slopes | `D291:E293`; `model.environment` | Editable | End/side slope construction and load-case inspector | Partial |
| Static tipping construction | rows `295:297`; slope charts 10, 11, 17, 18 | One simplified stability chart | Dedicated static/slope modes, edge construction and angles | Partial |
| Slope-adjusted group/axle loads | rows `299:306`; slope result points and axle metrics | Final percentage only | Per-case group/axle table and highlighted worst group | Partial |
| Dynamic environment | `E353:E355`, cargo wind fields; `model.environment/cargo` | Editable | Force arrows, application heights and contribution details | Partial |
| Dynamic COG shifts | `Dynamic loading CombinedCOG`; charts 12, 13 | Final dynamic envelope only | Separate slope/wind/acceleration/final layers | **Needs engine output exposure** |
| Dynamic capacity/stability | rows `359:429`; `metrics.dynamicUtil/dynamicAngle/dynamicRatio` | Final cards | Dynamic construction, worst group, load ratio table | Partial |
| Dynamic group contribution charts | charts 14–16, rows `398:402` | Missing | Compact stacked contribution chart for G1/G2/G3 | **Blocked: component contributions not exposed** |
| Analysed trailer and load case | `F433:F434`; model fields | Editable | Spine-beam header and selected-trailer synchronisation | Partial |
| Spine mesh | `F435`; `spineMeshSizeM` | Editable | Beam setup inspector and details table | Partial |
| Loose packing | `B,D:F439:442`; `loosePacking` | Editable | Plan/side load blocks and schematic loads | Partial |
| Beam supports | `D,F,G,I446:I455`; `result.supports` | Editable list; inactive warnings | Selectable schematic/table, Rstatic and disable chain | Partial |
| Support spreading | workbook beam charts 6–9 and 19–26; support width | Simplified beam-load chart | Spread bands, exact widths and active/allowed styling | Partial |
| Beam load schematic | charts 6, 19, 23; axle, PPU, loose-packing and support loads | Simplified | Full interactive load schematic by hydraulic group | Partial |
| Bending-moment diagram | charts 7, 20, 24; `beam.points[].momentKNm` | Present as a single selectable channel | Dedicated aligned diagram with extrema/allowables | Partial |
| Shear-force diagram | charts 8, 21, 25; `beam.points[].shearKN` | Present as a single selectable channel | Dedicated aligned diagram with extrema/allowables | Partial |
| Deflection diagram | charts 9, 22, 26; `beam.points[].deflectionMm` | Present as a single selectable channel | Dedicated aligned diagram, warning and limit | Partial |
| Beam slope diagram | Requested “if available” | No workbook chart or engine output identified | Explicit unavailable state; do not invent | Unavailable in audited data |
| Beam extrema/utilisation | rows `477:484`; `result.beam`, `metrics.spineUtil` | Summary text and card | Results table with min/max, X, allowable and status | Partial |
| Final checks | `B503:M506`; `result.metrics` | Eight metric cards | Concise persistent results inspector | Partial |
| Notes and warnings | `B508:M511`, comments and engine warnings | Warning card | Validation panel linked to controls and geometry | Partial |
| Plan view | chart 1 plus charts 3–5 | Basic cargo/trailer/support SVG | Full orthographic plan viewport | Partial |
| Side elevation | chart 2 | Basic elevation SVG | Complete longitudinal view with dimensions and forces | Partial |
| End view | workbook front/support helper data; catalogue width/bogie data | Missing | True transverse end viewport | Missing |
| Axle-line loads | bogie/load sheets; `result.axlePoints` | Basic bar chart | Selectable geometry/table with capacity and utilisation | Partial |
| Stability comparison | charts 10–13, 17–18 | One combined chart | Basic / slope / dynamic / comparison workspace | Missing as a workflow |
| Workbook guidance | `Codes and Guidelines`, comments, embedded images | One generic explanation paragraph | Contextual explanations and source references | Missing |
| Command centre | `TS_COMMAND_CENTER` | Split between Optimiser and Logs screens | Contextual optimisation drawer and ranked-result comparison | Partial |
| Optimiser controls | `TS_CONTROL!B2:B73`; optimiser settings | Broadly complete | Compact settings sheet; one Run action | Complete functionally |
| Optimiser progress and ETA | command centre and `ProgressState` | Present on permanent optimiser page | Bottom drawer only while running | Partial |
| Ranked passes and apply | `TS_OPTIMISER_LOG`; `PassResult` | Table with immediate Apply | Compare-to-start, explicit Apply and pre-run undo | Partial |
| Permanent case log | `TS_OPTIMISER_LOG!A:CT` | Exportable table | Lower drawer/full-screen searchable table | Partial |
| Live activity | `TS_LIVE_FEED`, `TS_RUN_ACTIVITY_LOG`; events | Separate page and optimiser list | Concise running log; detailed log on demand | Partial |
| XLSM import | workbook mapping in `workbook.ts` | Present and tested | Compact header command plus diagnostics | Complete |
| Verification XLSM export | OOXML patching in `workbook.ts` | Present and tested with VBA preservation | Compact header command plus completion state | Complete |
| Portable JSON round trip | `hydrateProjectModel` and UI handlers | Present | Compact header command | Complete |

## Workbook diagrams not fully represented

The current website does not fully reproduce any of the workbook’s 26 charts as a coordinated engineering workspace:

- **Charts 1–5:** plan/elevation cargo, supports, trailers and axle geometry — partly represented, but without full selectable trailer/bogie/hydraulic/COG layering.
- **Charts 6–9:** main-sheet beam loads, bending, shear and deformation — partly represented, but support spreading, PPU/loose-packing detail, allowables and table synchronisation are absent.
- **Charts 10–13:** cargo/combined COG envelopes, slope effects, dynamic virtual envelopes, closest points and worst groups — reduced to one simplified stability chart.
- **Charts 14–16:** partial-load contribution pies for groups 1–3 — absent; replacement should be a compact stacked engineering chart.
- **Charts 17–18:** dedicated slope-effect COG constructions — absent as separate modes.
- **Charts 19–26:** spine-beam loads, bending, shear and deformation variants — partly represented as one chart channel; full schematic and duplicated workbook load-case context are absent.

## Genuine blockers and required safeguards

1. **No browser calculation Web Worker exists.** The UI currently computes synchronously in `useMemo`; the only `worker/index.ts` is the server runtime. A small worker orchestration layer is required, with synchronous fallback only for unsupported environments and tests. Engine formulas remain untouched.
2. **Some acceptance data is not in `CalculationResult`.** Separate slope, wind and acceleration shifts; critical tipping edge; per-component group loads; several requested COG variants; and controlling case/group identifiers are calculated internally or not exposed. Add output fields only where values already exist inside `core.ts`; do not reimplement formulas in React.
3. **Ground-bearing pressure is calculated natively.** Overall neutral GBP uses all-inclusive mass divided by total active trailer shadow area. Per-group GBP uses the maximum A-D static-envelope reaction divided by that group's active shadow area, including each selected trailer's own width and axle pitch.
4. **Some physical geometry is underspecified.** Supports have longitudinal position/width but no transverse footprint; packing has bulk mass/COG/height but no beam-by-beam geometry. End/plan views must use explicit “extent not defined” states where the model lacks dimensions.
5. **No Git repository is available.** Commit sequence, hashes, branch and push cannot be produced from the supplied directory until repository context is provided or initialisation is authorised.

## Implementation boundary

- Keep `core.ts`, `beam.ts`, optimiser ranking/search and workbook cell mappings authoritative.
- Prefer new UI/view-model files and focused components.
- Engine edits, if needed, are limited to exposing already-computed intermediate values and worker-safe entry points.
- Preserve `ProjectModel` hydration and XLSM/JSON round trips.
- Invalid or unavailable engineering data must remain explicit; no presentation-only values.
