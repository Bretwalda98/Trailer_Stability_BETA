# Mathematical arrangement search review — 11 August 2026

This is a review run only. No mathematical-search logic was changed.

## Survey coverage

The matrix contains 36 deterministic cases covering:

- cargo size from 8 × 3 × 2 m through 25 × 16 × 16 m;
- cargo mass from 20 t through 800 t;
- central, rear, front, left, right and high COG positions;
- heavy and tall packing;
- normal, severe-wind, severe-acceleration and combined adverse actions;
- three-point and four-point hydraulics;
- standard, narrow, sparse, minimum and widely distributed supports;
- one-train, two-train and multi-train bounds;
- a dedicated 44 AL/train high-bound stress case, with the broad survey otherwise using 20 AL/train;
- cargo-width limiting and hard formation-width limiting;
- inline-only versus bounded longitudinal stagger;
- rear PPU, front/front-and-rear variants through `BOTH`, and no PPU;
- K2500 and PEKZ trailer catalogue selections; and
- reduced-action third-degree search settings.

All 36 cases reached `COMPLETE` at the optimiser run-state level. Thirty cases produced a ranked recommendation and six produced no valid arrangement within their configured search bounds.

Total survey time was approximately 173.3 seconds. The very-heavy stress case alone produced 19,324 exact pass records and took approximately 55 seconds. This is a material performance finding: the current bound search can still become expensive even though it prunes many branches.

## Early observations

1. The search is lexicographic before it is geometric. It prefers fewer trains first and fewer total axle lines next. Only after those objectives does it use cargo-only priority, support reserve, stability margin, utilisation, deflection, hydraulic altitude, balance, longitudinal span and pitch proximity.

2. The preferred 2.9 m pitch is not a hard preference. Several recommendations use the maximum searchable pitch of 27.570 m because the wider hydraulic separation improves the stability result while remaining inside the 30 m search horizon. This is consistent with the current ranking code but may not be the desired engineering preference.

3. Bounded stagger materially changes feasibility. The 22 m cargo comparison produced a valid recommendation with stagger allowed (`C28_STAGGERED`) but no recommendation when restricted to inline-only (`C29_INLINE_ONLY`). The inline failure was dominated by support settlement: one active support remained against a minimum of two, although the stability utilisation and tipping-angle metrics were otherwise passing in the recorded final probes.

4. Large, tall and wide cargo can be rejected by the hydraulic Y-span bound before full candidate evaluation. For the 25 × 16 × 16 m case, the required hydraulic span was reported as approximately 2.196 m at one 20 AL/train probe versus only 1.450 m available from one train. The adverse-all case required approximately 6.786 m at one 20 AL/train probe. These are necessary-geometry rejections, not proof that every conceivable physical arrangement is impossible.

5. Six no-recommendation cases were recorded: `C05_LONG_WIDE_TALL`, `C06_LONG_WIDE_HEAVY`, `C10_COG_FRONT`, `C19_FOUR_POINT`, `C29_INLINE_ONLY` and `C36_ADVERSE_ALL`. The full event and pass files should be used to distinguish hydraulic geometry, support settlement, combined-COG angle failure and search-bound limitations in each case.

6. The current search can produce a recommendation with cargo-only stability passing, meaning combined COG is not required for the angle check. The full records retain `cargoOnlyPass`, `combinedCogRequired` and `combinedCogPassOnly` for every evaluated result so this can be analysed separately from the overall pass state.

7. A “complete” run does not mean a valid arrangement was found. The UI/reporting should keep `COMPLETE` and “no valid arrangement” visibly separate; the six no-recommendation cases demonstrate why.

## Recorded data

The generated output directory contains:

- `math-search-review.json`: readable case-level summary and recommendation table;
- `math-search-review.csv`: compact sortable summary;
- `math-search-review-full-manifest.json`: index of all full case files;
- `cases/<case-id>.json`: complete case model, complete optimiser run, every event and every evaluated pass/result;
- `cases/<case-id>.json.gz`: compressed copy of each complete case record.

The full pass records include the exact arrangement descriptor, train and axle counts, pitch, stagger, PPU position, split line, trailer X, pins, calculation mode, all result status/failure fields, support reactions and states, group results, COG/stability references, metrics, beam outputs, warnings, resolved trailer positions, timing and ranking fields. This is intentionally much larger than the summary and is the source material for the next high-reasoning analysis.

## Important qualification

The broad survey uses a controlled 20 AL/train horizon to keep the matrix tractable. `C04_VERY_HEAVY` is the dedicated high-bound case using the full 44 AL/train limit. A no-recommendation result therefore means “no recommendation within this case’s configured search bounds and search templates”; it should not be described as a universal impossibility without a separate extended-bound run.
