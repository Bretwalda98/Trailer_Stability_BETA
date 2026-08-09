# Trailer Stability Shell, Startup and Orientation — Design QA

## Comparison target

- Source visual truth: Browser comments 1–7 in the current task, supplied as a 1280 × 876 annotated desktop capture.
- Additional source target: `docs/design/setup-wizard-guided-split-reference.png`.
- Functional source additions: the user’s startup-choice requirement and the canonical rule that screen-left/lower X is REAR and screen-right/higher X is FRONT.
- Matched desktop implementation: `qa-evidence/implementation-desktop-report-details-1280x876.jpg`.
- Desktop orientation implementation: `qa-evidence/implementation-desktop-geometry-1440x900.jpg`.
- Mobile implementation: `qa-evidence/implementation-mobile-main-390x844.jpg`.
- Mobile wizard implementation: `qa-evidence/implementation-mobile-wizard-390x844.jpg`.
- Startup chooser: `qa-evidence/implementation-startup-chooser-1280x876.jpg` and `qa-evidence/implementation-startup-chooser-mobile-390x844.jpg`.
- Route: `http://127.0.0.1:4174/`.

## Normalization

- Desktop source pixels and CSS target: 1280 × 876.
- Matched desktop implementation pixels and CSS viewport: 1280 × 876.
- Mobile implementation pixels and CSS viewport: 390 × 844.
- Device density normalization: captured image pixels equal CSS pixels, so no density conversion was required.
- State for matched comparison: Report workspace, model tree visible, Engineering Details open at 250 px, current calculation visible.
- The annotated source and matched implementation were compared together in the current multimodal task context at the same viewport and equivalent state.

## Findings

- No actionable P0, P1 or P2 findings remain.
- [P3] The phone Report table uses an internal horizontal scrollbar for its least important trailing columns.
  - Location: Report workspace at 390 px.
  - Evidence: the page itself remains exactly 390 px wide, while the dense engineering table can be swiped horizontally.
  - Impact: low. No persistent controls or page content are clipped, and the full result summary remains available in the Results panel.
  - Follow-up: consider a stacked phone-only report layout if field users spend substantial time reviewing the long report table on phones.

## Required fidelity surfaces

- Fonts and typography: the implementation preserves the existing Inter-first technical sans-serif stack, compact tabular numerics, white primary text, restrained metadata, and clear PASS/NOK hierarchy. The 38 px desktop header and 50 px Report heading avoid cramped or wrapped primary labels.
- Spacing and layout rhythm: the desktop shell is materially denser than the annotated source while keeping the same model/workspace/result structure. The Workspace list folds below its heading, the model tree remains fully available, and Engineering Details scales from a collapsed strip through 170–650 px to full page.
- Colors and visual tokens: the black technical canvas, white/grey hierarchy, blue selection, green pass, amber warning and red failure tokens remain consistent. The startup chooser uses the same square borders and restrained blue emphasis rather than introducing a separate visual language.
- Image quality and asset fidelity: the target contains no photographic or branded raster assets. Engineering drawings remain live vector/data visualizations driven by the calculation model. Interface icons use the existing Tabler family; no emoji, placeholder art, fake SVG illustration or CSS illustration was added.
- Copy and content: visible spreadsheet/workbook filenames, source-cell mappings and spreadsheet-specific labels were removed from the shell, report and detail table. Verification exchange remains described in standalone user language. Help content now covers startup, setup, workspace folding, phone panels, details sizing, optimisation and the rear/front convention.
- Icons and states: startup, setup, help, import, export, panel switching, resize, full-page and run/stop controls use one icon family with visible focus. Disabled, selected, calculating, PASS and NOK states remain distinct.
- Accessibility: dialogs are semantic and modal, startup focus lands on Start new setup, Escape cannot bypass the required startup choice, phone primary controls measure 44 px, mobile panel controls have accessible names, and the document has no horizontal page overflow at 390 px.

## Full-view comparison evidence

- The desktop top bar reduced from the annotated tall source to 38 px without losing the case, setup, help, verification or optimisation controls.
- The selected source filename has been removed. The header now presents only product, project/case state and user actions.
- The Workspace list is collapsed by default beneath a single WORKSPACE row, leaving the model tree visible. Expanding it restores all workspace destinations.
- The Report title region measures 50 px in the matched implementation and keeps the result verdict aligned on the same row.
- Engineering Details retains the source’s bottom-drawer placement but adds a persistent size slider, minimise action and full-page action.
- The new startup chooser presents Start new setup and Open saved file as the two primary decisions, with Continue saved case only when local data exists.

## Focused-region comparison evidence

- Header: controls remain on one line at 1280 px, labels do not collide, and no source filename appears.
- Left rail: the folded Workspace row and visible model tree directly address the annotated obstruction.
- Report heading: the 50 px measured implementation is substantially slimmer than the annotated target while retaining case identity and engineering state.
- Engineering Details: the slider was exercised at 250 px and 500 px; minimise, reopen, full page and restore all worked.
- Phone header: Set up, Help, Run and More each measure 44 × 44 px. Workspace, View, Model and Results are also 44 px high.
- Orientation: Plan and Hydraulics explicitly render `REAR · −X` on the left and `FRONT · +X` on the right. PPU fields use Rear/Front wording, and axle line 1 maps to the rear segment.
- Startup: both 1280 × 876 and 390 × 844 captures show an unobstructed modal, readable option descriptions and no viewport overflow.

## Responsive and interaction evidence

- 1280 × 876: exact viewport fit; 38 px top bar; 50 px Report title; no page overflow.
- 1440 × 900: Plan drawing, model tree, results and collapsed Engineering Details remain visible together.
- 390 × 844: exact viewport fit; no horizontal or vertical page overflow; View, Model and Results switch the single visible workbench panel correctly.
- Startup paths tested: Continue saved case closes the chooser; Start new setup opens a blank wizard with Blank case selected and empty case references; the saved-file input accepts project JSON and verification exports.
- Wizard path tested: the seven-step phone wizard opens with sticky preview, scrollable form and fixed Save/Next actions.
- Help tested: the maintained guide opens on phone, exposes all topics and closes cleanly.
- Engineering Details tested: 250 px, 500 px, minimised, full page and restored split view.
- Browser console errors/warnings checked: none.
- Automated verification: typecheck, engine/verification parity tests, geometry tests, production build and rendered-HTML tests all pass.

## Comparison history

### Iteration 1 — shell density and terminology

- Earlier P2 findings: the top bar and Report title occupied too much vertical space; a visible verification-source filename remained; the expanded Workspace list crowded the model tree.
- Fixes: reduced the desktop header to 38 px, removed the visible source filename and spreadsheet-specific UI labels, reduced the Report title to 50 px, and made Workspace independently collapsible.
- Post-fix evidence: `qa-evidence/implementation-desktop-report-details-1280x876.jpg`.

### Iteration 2 — detail panel and phone navigation

- Earlier P2 findings: Engineering Details had a fixed height; the phone compressed three desktop columns and panel-switch icons lacked durable accessible names.
- Fixes: added a 170–650 px slider, minimise and full-page states; replaced the phone layout with View/Model/Results panels and labelled 44 px controls.
- Post-fix evidence: `qa-evidence/implementation-mobile-main-390x844.jpg` and the matched desktop report capture.

### Iteration 3 — orientation consistency

- Earlier P1 risk: front/rear semantics were not canonical across group corners, PPUs, data exchange and drawings.
- Fixes: added a versioned `REAR_LEFT_FRONT_RIGHT` convention, migrated legacy corner fields, routed axle lines through one orientation helper, remapped verification exchange, relabelled PPUs, and added drawing annotations and tests.
- Post-fix evidence: `qa-evidence/implementation-desktop-geometry-1440x900.jpg`; engine and geometry tests pass.

### Iteration 4 — startup flow

- Earlier P2 finding: startup either loaded local data silently or opened the wizard directly, so users were not explicitly offered a new setup versus a saved file.
- Fixes: added a mandatory responsive startup chooser with Start new setup, Open saved file and conditional Continue saved case actions; updated Help and rendered-output coverage.
- Post-fix evidence: `qa-evidence/implementation-startup-chooser-1280x876.jpg` and `qa-evidence/implementation-startup-chooser-mobile-390x844.jpg`.

## Implementation checklist

- [x] Slim desktop top bar and Report title.
- [x] Remove visible spreadsheet/source references.
- [x] Keep Workspace independently foldable above the model tree.
- [x] Add resizable, minimisable and full-page Engineering Details.
- [x] Add and maintain a Help guide.
- [x] Provide a usable no-overflow phone shell and wizard.
- [x] Canonicalize rear-left/front-right engineering semantics.
- [x] Prompt for a new setup or saved file at startup.
- [x] Clear all P0–P2 design findings before handoff.

## Follow-up polish

- P3: evaluate a stacked phone Report table after real field-use feedback.

## Iteration 5 — cargo-derived wind and blank setup

### Comparison target

- Source visual truth: the established black technical wizard reference at `docs/design/setup-wizard-guided-split-reference.png`, augmented by the explicit requested states: blank new case has no arrangement, and wind inputs are derived from cargo dimensions by default.
- Implementation capture: `qa-evidence/implementation-wind-auto-and-blank-wizard-1280x720.png`.
- Route: `http://127.0.0.1:4174/`.
- Viewport and density: 1280 × 720 CSS px; capture pixels equal CSS pixels; no density normalization required.
- Compared states: blank Wizard/Cargo state, then entered 12 m × 5 m × 4 m cargo with automatic wind enabled.

### Findings

- No actionable P0, P1 or P2 findings remain.
- [P3] The compact form requires a short scroll to expose every wind field at a 720 px desktop height. This is intentional density behaviour; the section heading and automatic toggle remain visible in the form flow.

### Required fidelity surfaces

- Fonts and typography: retains the compact technical sans-serif hierarchy and legible 9–12 px form labels. Computed wind hints are secondary and do not compete with the numeric values.
- Spacing and layout rhythm: the empty preview holds the same dominant right-hand area as the live model, so the split view does not jump when a trailer is added.
- Colors and visual tokens: invalid cargo dimensions/mass are amber; accepted values and calculated wind fields are green; disabled calculated fields remain readable on the black canvas.
- Image quality and asset fidelity: no new raster or decorative assets were added. Existing Tabler icons remain consistent with the established interface.
- Copy and content: wording states the formulas directly: side = length × height, front = width × height, with both forces at half cargo height.

### Full-view and focused evidence

- Blank state shows “Start with the cargo envelope” rather than a pre-populated trailer arrangement. The setup rail and form stay usable and the Next action remains correctly blocked.
- With 12 m length, 5 m width and 4 m height, the live automatic fields show 48 m² side area, 20 m² front area and 2 m application height for both directions.
- The automatic control is checked by default. Turning it off exposes the same populated values as manual inputs; turning it back on restores calculated, locked values.
- Primary interactions tested in the in-app browser: new setup, empty canvas, cargo numeric entry, live automatic recomputation, automatic/manual toggle, and server reload. Browser console errors: none observed.

### Comparison history

- Earlier P2 finding: Start new setup still exposed a sample arrangement and could mislead users into treating it as part of a new case.
  - Fix: blank model now contains no trailers, hydraulic groups or supports; the wizard substitutes an explicit empty-preview state until cargo dimensions and a trailer exist.
  - Post-fix evidence: `qa-evidence/implementation-wind-auto-and-blank-wizard-1280x720.png` and the in-app browser blank-state capture.
- Earlier P2 finding: wind areas and application heights had to be maintained manually after cargo geometry changes.
  - Fix: automatic cargo-derived wind mode is defaulted on, calculated in the engineering engine and verification export, and exposed as a clear manual override.
  - Post-fix evidence: automatic values 48 m² / 20 m² / 2 m for a 12 × 5 × 4 m cargo in the browser capture; engine regression tests pass.

### Implementation checklist

- [x] Default automatic side/front projected wind areas and mid-height force application.
- [x] Preserve workbook-imported manual wind inputs until automatic mode is explicitly enabled.
- [x] Apply automatic values to calculation and verification export.
- [x] Add amber invalid and green accepted input states in the wizard.
- [x] Start new setup with no pre-existing arrangement or geometry drawing.
- [x] Update maintained Help content and automated regression coverage.

final result: passed

---

# SPMT End-View Renderer - Design QA

## Comparison target

- Source visual truth: `C:/Users/Harry/AppData/Local/Temp/codex-clipboard-d50c9d12-e398-4508-a094-04ae7fb2cfa3.png` (996 x 574 px).
- Clean one-trailer implementation capture: `qa-evidence/end-view-clean-one-trailer-20260809.png` (1734 x 1270 px at the browser's native desktop viewport).
- Focused side-by-side comparison: `qa-evidence/end-view-reference-comparison-20260809.png` (1992 x 620 px).
- Additional full-workbench capture: `qa-evidence/end-view-vertical-tyres-20260809.png`.
- State: K2400 ST, one trailer, four dynamically derived transverse tyre profiles, End preview, dimensions and grid visible.

## Findings and fixes

- Earlier P1 finding: the deployed/stale renderer drew tyres as circles, visually implying 90-degree crab steering.
  - Fix: replaced the wheel circles with vertical chamfered tyre-profile polygons derived from selected-trailer tyre width and wheel diameter.
  - Verification: the clean rendered SVG contains four `.spmt-tyre-profile` polygons and zero `circle.wheel` elements.
- Earlier P2 finding: the simplified deck and running gear did not match the supplied SPMT end-view silhouette.
  - Fix: rebuilt the End-only module from catalogue-driven deck, suspension-column, axle-link and brace geometry while preserving the Plan and Side renderers.
- No actionable P0, P1 or P2 visual findings remain in the focused comparison.

## Fidelity and responsive checks

- The focused comparison confirms a wide rectangular deck, four vertical tyre profiles, paired suspension geometry and symmetric end-view layout on the established black technical canvas.
- Width, deck height, cross-bogie spacing, tyre width and wheel diameter are read from the selected trailer/bogie model; no trailer-specific drawing dimensions are hard-coded.
- The clean wizard preview and the full workbench both render the same geometry. The End preview remains contained without horizontal page overflow.
- Existing interaction semantics remain intact: trailer selection, bogie selection, pinned state and collision highlighting still use the same SVG groups.

## Automated verification

- `pnpm test`: passed.
- TypeScript typecheck: passed.
- Engineering and workbook parity tests: passed.
- Geometry-adapter tests: passed.
- Production Vinext build: passed.
- Rendered-HTML tests: passed.

final result: passed

---

# Automatic Trailer Arrangement — Design QA

- Source visual truth: `test-output/design-qa-source-optimiser.png`
- Implementation: `test-output/design-qa-implementation-arrangement.png`
- First implementation capture: `test-output/design-qa-implementation-iteration1.png`
- Viewport and state: desktop, 929 × 821 CSS px, optimiser goal step versus automatic-arrangement case-input step
- Pixel dimensions: source 929 × 821 px; implementation 929 × 821 px
- Density normalization: both captures were produced by the same browser session at the same CSS viewport and native screenshot density

## Full-view comparison evidence

The source and implementation were opened together for comparison at their original dimensions. The automatic-arrangement wizard preserves the established three-column technical shell, top header, step rail, form density, live-plan panel, footer actions, typography, black/white palette, blue selection state, green valid state and amber invalid-input state.

The different step count and candidate table are intentional product differences. They reflect the four-step formation task and its constructible train/module search rather than the existing seven-step current-arrangement optimiser.

## Focused-region evidence

A separate focused crop was not required because the original 929 × 821 captures make the header, rail, form fields, live plan, status colours and footer controls legible. Interactive DOM checks additionally verified the 2.9 m field, amber invalid state, green valid state, disabled Next state, review priority order and mobile panel stacking.

## Required fidelity surfaces

- Fonts and typography: same application font stack, weights, sizes, uppercase technical labels and hierarchy as the source wizard; no unexpected wrapping or clipped primary labels.
- Spacing and layout rhythm: same header/rail/form/preview/footer proportions. Candidate rows, summaries and controls use the existing border and spacing rhythm.
- Colours and tokens: existing background, line, blue, cyan, green, amber and red tokens are reused; no new off-brand palette was introduced.
- Image and asset quality: no raster artwork is required. All interface icons use the existing Tabler icon library; no placeholder, emoji or approximate custom asset is present.
- Copy and content: labels describe the hard objective order, 4/5/6-AL construction rule, all-inclusive-COG centring, 2.9 m preferred spacing and exact engineering verification.

## Comparison history

### Iteration 1 — blocked

- [P2] Live-plan vertical allocation left an oversized empty hero area and clipped the formation facts row.
  - Fix: removed the conflicting optimiser-preview class and assigned explicit max-content tracks around the flexible candidate table.
- [P2] The arrangement header did not follow the existing wizard title hierarchy.
  - Fix: matched the established eyebrow plus current-step heading structure.
- [P2] Mobile arrangement controls inherited sub-44 px input and close-button targets.
  - Fix: added arrangement-specific 44 px minimum touch targets at the phone breakpoint.

### Iteration 2 — passed

The revised desktop capture shows balanced plan allocation, fully visible facts, matching header hierarchy and no horizontal overflow. The 390 × 844 responsive check stacked preview, form and footer into one column with a 390 px document width. Invalid and valid spacing states changed to amber and green respectively, and invalid data blocked navigation.

## Findings

No actionable P0, P1 or P2 findings remain.

## Follow-up polish

- [P3] A future miniature plan schematic could supplement the candidate table when users need a more visual comparison of train-count and pitch options.

## Primary interactions tested

- Opened the existing optimiser wizard and switched to automatic arrangement.
- Navigated all four arrangement steps.
- Verified the default 2.9 m preferred centre spacing.
- Verified amber invalid and green valid input states and Next-button blocking.
- Verified the five-level hard objective order.
- Verified desktop and phone layout structure and absence of page-width overflow.
- Checked the browser console; no warnings or errors were reported.

final result: passed
