# Trailer Stability To-Do List

Only unfinished work is listed. Each task keeps its complete scope and the recommended model configuration.

## TS-005 — Authoritative latest four-point mapping — Recommended: GPT-5.6 Sol Ultra

Reconcile the latest four-point workbook, website model and AutoCAD exchange field by field. Cover cargo, packing, COGs and envelopes, wind, trailers and PPUs, three-/four-point hydraulics, support reactions, active states, GBP, spine-beam results, traction, stability angles and exports. Keep one documented source-to-engine-to-output map, identify required versus optional fields and compare at least one known case end to end. Correct confirmed mapping errors without changing valid engineering logic.

## TS-012 — Negative reactions and active-support settling — Recommended: GPT-5.6 Sol Ultra

After every relevant geometry or arrangement change, calculate support reactions, deactivate each disallowed or negative support, recalculate and repeat deterministically until no prohibited negative reaction remains or the case is correctly classified as unable to settle. Record the complete reaction table and every state transition. Add an off-by-default option permitting negative reactions only where packing/supports are explicitly positively connected to the deck or spine beam; preserve the raw values and show a strong warning. Benchmark a faster dependency-aware path against exact results and use `Supports active check.pdf` as a reference case.

## TS-011 — Cargo COG-envelope defaults and 100 mm rule — Recommended: GPT-5.6 Sol Ultra

Define envelope controls in cargo details. Automatically set X and Y envelopes to 2.5% of cargo length and width respectively, show 2% as the advised minimum, and apply a 0.100 m automatic minimum. Warn when the automatic minimum applies or when a manual value is outside the advised range. A value below 100 mm remains possible only as an explicit, clearly labelled not-advised override. Verify small and large cargo boundaries and agreement with the authoritative workbook.

## TS-013 — Website export to the latest four-point workbook — Recommended: GPT-5.6 Sol Ultra

Use the latest four-point/four-group workbook as the authoritative export target. Map all required inputs, four hydraulic groups, support states and reactions, GBP, stability results and calculation outputs to the current sheet contract. Preserve VBA, formulas, drawings and workbook structure. Include an export-version identifier, reject incompatible files with useful diagnostics, then reopen and recalculate an exported workbook to prove there are no missing sheets, missing fields, stale formulas or three-point fallback mappings.

## TS-001 — Quick minimum-train / minimum-axle-line recommendation — Recommended: GPT-5.6 Sol Ultra

Before the exact search, calculate a capacity-derived lower bound for total axle lines using payload, packing, PPU mass, trailer tare, axle self-weight, capacity and permitted utilisation. Round to buildable 4-, 5- and 6-AL module combinations, estimate feasible train counts and rapidly screen a short list for overlap, width, support coverage, minimum active supports, axle utilisation and three-/four-point hydraulic stability. Return labelled AL-first, train-first and balanced suggestions with assumptions and rejection reasons. The exact solver remains authoritative and must verify anything applied. The reference case must show a 187-AL lower bound and 188-AL first buildable total where applicable.

## TS-003 — Recommendation explanation panel — Recommended: GPT-5.6 Terra High

Explain the capacity lower bound, module rounding, train assumptions, rapid screening and every candidate rejection in plain language. Clearly distinguish an estimate from an exact verified result and link each statement to the value or constraint that produced it. Keep the panel responsive and accessible.

## TS-006 — ESLint cleanup — Recommended: GPT-5.6 Terra Medium

Inventory and group existing lint failures, then fix only mechanically safe issues. Run lint and the full regression suite and report anything requiring a semantic change as separate work. Calculation, optimiser, export and UI behaviour must remain unchanged.
