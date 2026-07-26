# Design QA

## Comparison target

- Source visual truth: `C:\Users\Harry\.codex\generated_images\019f6a41-4cb2-7b72-852b-1ed0af642779\call_f96WVZNk4vVMatsRnNE6VhWz.png`
- Browser-rendered implementation: `C:\Users\Harry\Documents\Codex\2026-07-16\the\audit\ui-redesign-2026-07-26\final\1440x900-plan-final-pass.png`
- Working hydraulic state: `C:\Users\Harry\Documents\Codex\2026-07-16\the\audit\ui-redesign-2026-07-26\final\1440x900-hydraulics-local-final.png`
- Full-view comparison: `C:\Users\Harry\Documents\Codex\2026-07-16\the\audit\ui-redesign-2026-07-26\final\comparison-final-pass.png`
- Focused error-state evidence: `C:\Users\Harry\Documents\Codex\2026-07-16\the\audit\ui-redesign-2026-07-26\final\overlap-hard-failure.png`
- Mobile evidence: `C:\Users\Harry\Documents\Codex\2026-07-16\the\audit\ui-redesign-2026-07-26\final\390x844-mobile-hydraulics-final.png`
- Local URL: `http://localhost:3000/`

## Normalisation and state

- Source pixels: 1586 × 992.
- Desktop implementation: 1440 × 900 CSS pixels at density 1.
- Full comparison: each image contained and padded to 1440 × 900, then placed side by side at 2880 × 900.
- Mobile implementation: 390 × 844 CSS pixels at density 1.
- State: corrected two-trailer arrangement; trailers separated at Y 1 m and Y 4 m; G1 is the local front cluster, G2/G3 are local rear clusters; four active supports; dynamic result view.
- Theme difference is intentional: the source established the compact CAD/product structure, while the user explicitly selected a black background with white primary text and engineering lines.

## Findings

- No actionable P0, P1 or P2 visual findings remain.
- Typography: the Inter/system-sans stack, compact weights, tab labels and numeric hierarchy are consistent and readable. The header collision between the version and Project label was fixed by widening the title track and hiding the version at narrower breakpoints.
- Spacing and layout: the source's header, model tree, tabbed engineering canvas, results inspector and lower technical editor are preserved. The implementation is intentionally denser while retaining clear region boundaries and no clipped persistent desktop controls.
- Colors and tokens: true black surfaces, white engineering lines, blue selection, cyan/amber/violet hydraulic groups, green OK and red failure states have consistent semantic contrast.
- Image and asset fidelity: there are no decorative raster assets to substitute. The engineering drawing is generated from authoritative model geometry, while controls use one consistent Tabler icon family.
- Copy and content: engineering labels are standalone and specific. The new `THREE LOCAL GROUPS`, triangle area, minimum altitude and trailer-overlap messages explain the physical setup without exposing workbook implementation details.
- Interaction and accessibility: semantic tabs, buttons, labelled numeric fields, select controls, expandable details and keyboard-reachable form controls are present. Error state remains readable while retaining the calculated metrics.
- Responsiveness: the 390 × 844 capture retains the primary actions, workspace selector, view tabs, engineering canvas and details access without collapsing the workflow.

## Focused comparison

- Hydraulic editor: `1440x900-hydraulics-local-final.png` confirms one interactive graph plus the manual table, G1/G2/G3 local clusters, group loads, group centres, split control and grouping-quality summary in one dense workspace.
- Physical error state: `overlap-hard-failure.png` confirms overlapping trailer footprints produce a blocking `INVALID GEOMETRY` state and explicit dimensions while calculations continue to update.
- These focused views were required because the group-assignment table and failure copy are too small to judge reliably in the full-view comparison.

## Comparison history

1. Earlier P1: the first standalone UI spread the workflow across too many large tabs and did not match the compact engineering reference.
   - Fix: consolidated navigation, live canvas, results inspector, hydraulic editor and engineering details into the dense workbench shell.
   - Post-fix evidence: `comparison-final-pass.png`.
2. Earlier P1: hydraulic grouping was difficult to understand and edit.
   - Fix: added the interactive hydraulic graph, colour-coded centres/routes and editable axle-line table.
   - Post-fix evidence: `1440x900-hydraulics-local-final.png`.
3. Earlier P2: narrow screens lacked a compact workspace switcher and stable engineering viewport.
   - Fix: added the mobile workspace selector and responsive single-column layout.
   - Post-fix evidence: `390x844-mobile-hydraulics-final.png`.
4. Earlier P0: physically overlapping trailers could still be evaluated as a valid arrangement.
   - Fix: added a hard footprint-collision gate used by manual calculations and optimiser cases, plus red collision rendering and detailed log/report fields.
   - Post-fix evidence: `overlap-hard-failure.png`.
5. Earlier P1: a hydraulic group could be distributed across disconnected axle regions, creating a misleading triangle corner.
   - Fix: added connected-cluster validation, triangle area/minimum-altitude diagnostics and clear warnings without auto-moving user geometry.
   - Post-fix evidence: `1440x900-hydraulics-local-final.png`.
6. Earlier P2: the desktop title/version block visually collided with the Project label.
   - Fix: widened the title grid track and hid the version at narrower breakpoints.
   - Post-fix evidence: `1440x900-plan-final-pass.png`.

## Primary interactions and technical checks

- Tested Plan, Hydraulics and Stability tabs.
- Tested trailer Y edits, hydraulic circuit edits and restoration of the corrected case.
- Tested a deliberate overlap and verified immediate worker recalculation and blocking failure.
- Verified triangle area/minimum-altitude diagnostics and local-group status.
- Verified the engineering-details drawer open/closed states.
- Browser console checked after the production rebuild: no errors or warnings.
- Full automated suite passed: typecheck, engine/workbook parity, geometry adapter, optimiser, production build and rendered HTML.

## Follow-up polish

- P3: a future optional high-detail mechanical layer could add more trailer hardware detail at high zoom. It is not required for the current engineering workflow and must remain subordinate to authoritative geometry.

## Implementation checklist

- [x] Compact black engineering workbench.
- [x] Corrected non-overlapping trailer arrangement retained.
- [x] Three local hydraulic clusters and broad-triangle diagnostics.
- [x] Hard collision rejection in manual and optimiser calculations.
- [x] Desktop and mobile evidence captured.
- [x] Production build and browser console verified.

final result: passed
