# Trailer Stability To-Do List

## [x] TS-005 — Authoritative latest four-point mapping

Recommended model: **GPT-5.6 Sol Ultra**

Reconcile the latest four-point workbook, website model and AutoCAD exchange
field by field. Cover cargo, packing, COGs and envelopes, wind, trailers and
PPUs, three-/four-point hydraulics, support reactions, active states, GBP,
spine-beam results, traction, stability angles and exports. Keep one documented
source-to-engine-to-output map, identify required versus optional fields and
compare at least one known case end to end. Correct confirmed mapping errors
without changing valid engineering logic.

## [ ] TS-012 — Negative reactions and active-support settling

Recommended model: **GPT-5.6 Sol Ultra**

After every relevant geometry or arrangement change, calculate support
reactions, deactivate each disallowed or negative support, recalculate and
repeat deterministically until no prohibited negative reaction remains or the
case is correctly classified as unable to settle. Record the complete reaction
table and every state transition. Add an off-by-default option permitting
negative reactions only where packing/supports are explicitly positively
connected to the deck or spine beam; preserve the raw values and show a strong
warning. Benchmark a faster dependency-aware path against exact results and use
the supplied `Supports active check.pdf` as a reference case.

## [ ] TS-011 — Cargo COG-envelope defaults and 100 mm rule

Recommended model: **GPT-5.6 Sol Ultra**

Define envelope controls in cargo details. Automatically set X and Y envelopes
to 2.5% of cargo length and width respectively, show 2% as the advised minimum,
and cap each automatic value at 0.100 m. Warn when the automatic cap applies or
when a manual value is outside the advised range. A value below 100 mm remains
possible only as an explicit, clearly labelled not-advised override. Verify
small and large cargo boundaries and agreement with the authoritative workbook.

## [ ] TS-013 — Website export to the latest four-point workbook

Recommended model: **GPT-5.6 Sol Ultra**

Use the latest four-point/four-group workbook as the authoritative export
target. Map all required inputs, four hydraulic groups, support states and
reactions, GBP, stability results and calculation outputs to the current sheet
contract. Preserve VBA, formulas, drawings and workbook structure. Include an
export-version identifier, reject incompatible files with useful diagnostics,
then reopen and recalculate an exported workbook to prove there are no missing
sheets, missing fields, stale formulas or three-point fallback mappings.

## [ ] TS-001 — Quick minimum-train / minimum-axle-line recommendation

Recommended model: **GPT-5.6 Sol Ultra**

Before the exact search, calculate a capacity-derived lower bound for total
axle lines using payload, packing, PPU mass, trailer tare, axle self-weight,
capacity and permitted utilisation. Round to buildable 4-, 5- and 6-AL module
combinations, estimate feasible train counts and rapidly screen a short list for
overlap, width, support coverage, minimum active supports, axle utilisation and
three-/four-point hydraulic stability. Return labelled AL-first, train-first and
balanced suggestions with assumptions and rejection reasons. The exact solver
remains authoritative and must verify anything applied. The reference case must
show a 187-AL lower bound and 188-AL first buildable total where applicable.

## [ ] TS-002 — Large scaled search-case matrix

Recommended model: **GPT-5.6 Sol High**

Create a reproducible set of at least ten cases scaling cargo size, mass and COG
height from small to extreme. Include cargo larger than the trailer footprint,
one and multiple trains, maximum train/AL ranges, three- and four-point
hydraulics, supports, spacing on/off and width-limited/unlimited searches.
Record inputs, candidate counts, passes, failures, rankings, timing and the
reason each unsolved case failed. Do not change production logic merely to make
the matrix pass.

## [ ] TS-010 — Complete engineering result panels

Recommended model: **GPT-5.6 Sol High**

Build compact responsive result boxes matching the useful detail of the AutoCAD
tables: trailer specifications, parameters, loading/capacity, group and total
GBP, hydraulic neutral and A–D pressures, road traction/transport checks and
every applicable stability angle. Include cargo-only, combined-COG, basic,
slope, dynamic, envelope, route and governing edge/case values. Show units,
active status and prominent failures. Support both three- and four-point cases
without hiding non-governing results.

## [ ] TS-009 — Readable activity log and diagnostic audit output

Recommended model: **GPT-5.6 Sol High**

Make search activity readable to a person: concise event summaries, filters and
red highlighting for the exact failed metric or constraint. Add copy/download
outputs in human-readable Markdown and lossless JSON. The diagnostic record must
contain case inputs, search settings, candidate decisions, rejection reasons,
engineering metrics, support-settling transitions and complete chronological
activity so another engineer or Codex task can reproduce and diagnose the run.

## [ ] TS-003 — Recommendation explanation panel

Recommended model: **GPT-5.6 Terra High**

Explain the capacity lower bound, module rounding, train assumptions, rapid
screening and every candidate rejection in plain language. Clearly distinguish
an estimate from an exact verified result and link each statement to the value
or constraint that produced it. Keep the panel responsive and accessible.

## [ ] TS-004 — Pareto comparison view

Recommended model: **GPT-5.6 Sol High**

Compare AL-first, train-first and balanced valid candidates side by side. Show
total AL, train count, spacing/width, utilisation, stability margin, support
reserve and rating without changing the solver. Engineering failures may never
rank above passing arrangements. Make trade-offs and dominated candidates
obvious on desktop and phone.

## [ ] TS-008 — User-editable optimiser objective order

Recommended model: **GPT-5.6 Sol High**

Let the user reorder ranking objectives with accessible move controls, restore
an engineering-default preset and save custom presets. Engineering PASS and the
minimum-support rule remain hard constraints. Optional soft criteria include
minimum trains, minimum total AL, support reserve, deflection/hydraulic quality,
group-load balance, preferred spacing and rating. Show a plain-language summary
before the run and record the exact preset/order in logs and exported results.

## [ ] TS-007 — Dependency and security review

Recommended model: **GPT-5.6 Sol High**

Review dependency advisories separately from engineering changes. Identify
compatible update paths, apply only isolated verified upgrades and run install,
build and regression checks. Record unresolved risks and never combine a
dependency update with calculation, optimiser or export behaviour changes.

## [ ] TS-006 — ESLint cleanup

Recommended model: **GPT-5.6 Terra Medium**

Inventory and group existing lint failures, then fix only mechanically safe
issues. Run lint and the full regression suite and report anything requiring a
semantic change as separate work. Calculation, optimiser, export and UI
behaviour must remain unchanged.
