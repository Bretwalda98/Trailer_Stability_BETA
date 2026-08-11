# Mathematical search — six unsolved-case recovery

Date: 11 August 2026

## Outcome

All six cases that previously returned no recommendation now produce at least one fully calculated and verified PASS without reducing an engineering limit, environmental action, minimum support count, train bound or axle-line bound.

Five cases were blocked by unrealistic longitudinal packing-support layouts in the survey inputs. One case exposed a genuine four-point mathematical-planning defect. The severe four-point case contained both problems.

| Case | Original dominant failure | Verified recovered arrangement | Key verified result |
|---|---|---|---|
| `C05_LONG_WIDE_TALL` | 5,463 support failures; support centres ended at X 9.600 m behind payload COG X 12.500 m | 2 trains × 14 AL; 28 AL total; 8.963 m pitch; 11.393 m overall width; split after AL 5 | 4 active supports; dynamic utilisation 25.96%; dynamic angle 18.64°; spine utilisation 9.13%; cargo-only PASS |
| `C06_LONG_WIDE_HEAVY` | 7,795 support failures; same non-bracketing support layout | 2 trains × 14 AL; 28 AL total; 5.931 m pitch; 8.361 m overall width; split after AL 4 | 4 active supports; dynamic utilisation 96.86%; dynamic angle 7.89°; spine utilisation 40.62%; cargo-only PASS |
| `C10_COG_FRONT` | 4,046 support failures; support centres ended at X 9.600 m while payload COG was X 15.000 m | 1 train × 13 AL; 13 AL total; split after AL 4 | 2 active supports; dynamic utilisation 96.64%; dynamic angle 5.57°; spine utilisation 72.44%; combined-COG PASS only |
| `C19_FOUR_POINT` | Zero cases were evaluated because the shared-X planner accepted triangles only | 1 train × 10 AL; 10 AL total; split after AL 5; four distinct hydraulic corners | 3 active supports; dynamic utilisation 97.72%; dynamic angle 8.37°; spine utilisation 47.79%; cargo-only PASS |
| `C29_INLINE_ONLY` | 3,197 support failures; all original supports were rear of the payload COG | 2 in-line trains × 13 AL; 26 AL total; preferred 2.900 m pitch; 5.330 m overall width; split after AL 2 | 4 active supports; dynamic utilisation 84.73%; dynamic angle 11.19°; spine utilisation 20.21%; cargo-only PASS |
| `C36_ADVERSE_ALL` | Four-point planner rejected all cases before evaluation; after that defect was removed, the narrow X 5.000–7.100 m support cluster still failed settlement | 2 trains × 20 AL; 40 AL total; PPUs at both ends; 22.964 m pitch; 25.394 m overall width; split after AL 10 | 3 active supports; dynamic utilisation 69.66%; dynamic angle 20.58°; spine utilisation 64.06%; cargo-only PASS |

## Root-cause detail

### 1. Four-point arrangements were pruned before calculation

The four-point arrangement builder already created G1–G4 correctly, and the engineering engine already calculated a four-corner convex stability boundary. The defect was in the optimiser's shared-X planning stage: `deriveStabilityXInterval` and automatic E89 planning returned no interval unless the stability polygon contained exactly three vertices. Consequently, every exact inner run for `C19` and `C36` was planned with zero cases.

The planner now intersects affine convex-polygon half-plane inequalities for a three- or four-vertex stability boundary. The existing triangle barycentric route is retained for three-point calculations, while four-point calculations use one non-negative-inside edge constraint per polygon side. Every retained case still goes through the complete engineering calculation.

### 2. The survey's fixed supports did not follow cargo length or COG

The survey reused X positions 2.4, 4.8, 7.2 and 9.6 m for cargo up to 25 m long and for COG X positions as far forward as 15 m. With the vertical resultant outside the support-centre envelope, iterative support settling correctly removed negative reactions until one support remained. Increasing train count, axle count or transverse separation cannot repair a physically non-bracketing longitudinal packing arrangement.

The mathematical-search wizard now provides an explicit **Create 4 COG-spanning supports** action. It calculates the cargo-plus-packing longitudinal COG using the same rear-left datum convention as the engineering engine, creates two editable support proposals behind it and two ahead of it, and keeps every centre within the cargo footprint. The preflight also warns when the allowed support centres do not bracket the declared payload COG.

The recovered support proposals were:

- `C05` and `C06`: X 3.925, 9.070, 16.788 and 22.913 m.
- `C10`: X 4.675, 10.870, 15.263 and 15.638 m.
- `C29`: X 3.475, 7.990, 14.763 and 20.138 m.
- `C36`: X 6.135, 14.374, 21.576 and 24.018 m.

These are search-ready proposals, not fabrication instructions. The actual packing/support geometry must still be confirmed by the engineer. The optimiser does not silently move a user's entered physical supports.

### 3. Some long-beam probes were falsely reported as singular

The beam matrix mixed translational and rotational degrees of freedom over long spans containing short feature elements. The unscaled LDLᵀ test compared all pivots against a tolerance based on the largest raw diagonal, which could mark a restrained but poorly scaled system as singular.

The banded solver now performs symmetric diagonal equilibration before LDLᵀ factorisation and maps the solution back to the original units. This does not alter the beam equations. Existing workbook-parity tests still pass, and the former long-spine probes now settle their reactions rather than terminating at a numerical singularity.

### 4. Passing width was sampled but not converged

The mathematical arrangement search tested the preferred, minimum, midpoint, maximum and configured sample pitches. If 2.9 m failed and a wider seed passed, it previously retained the coarse wider seed. It now bisects the failed-to-passing interval with complete logged calculations until it reaches the configured spacing tolerance.

Ranking now applies the stated priorities in this order:

1. fewest trains;
2. fewest total axle lines;
3. cargo-only stability PASS preferred over combined-COG-only PASS;
4. closest verified pitch to the configured preferred spacing; and
5. support reserve, stability margin, utilisation, deflection, hydraulic quality and remaining tie-breakers.

This moved `C29` back to the preferred 2.900 m pitch, reduced `C05` from the coarse 15.025 m seed to 8.963 m, reduced `C06` to 5.931 m, and reduced `C36` from the 30 m search-width edge to 25.394 m overall width.

## Important engineering qualifications

- `C10` is a valid overall PASS but relies on the combined all-inclusive COG. Its cargo-only angle check does not pass, only two supports remain active, dynamic utilisation is 96.64%, and its dynamic angle is 5.57°. It is therefore a low-reserve minimum-resource solution and should remain visibly flagged as **combined-COG PASS only**.
- `C06` and `C19` also sit close to the dynamic utilisation limit at 96.86% and 97.72%. A user who values operational reserve should increase the resource or safety weighting instead of accepting the lexicographic minimum.
- `C36` needs a 25.394 m overall formation width under the entered severe actions. If the route imposes a lower operational width, that hard limit must be enabled; the current result should not be interpreted as fitting an unspecified route envelope.
- Support proposals must correspond to physically possible packing locations and widths. The warning and proposal prevent an accidental one-sided layout, but they do not replace packing design.

## Verification and retained evidence

- Engine/workbook and geometry regression suite: PASS.
- Four-point mathematical arrangement regression: PASS with four groups and a four-vertex stability polygon.
- Offset-COG support-proposal regression: PASS; proposed support span brackets the payload COG.
- Long-spine conditioning regression: PASS; no false singular warning and beam points are produced.
- Exact pitch-convergence regression: PASS and remains below the bounded calculation-count/runtime guard.
- All six recovery runs reached optimiser state `COMPLETE` and produced ranked PASS records.

Local full-fidelity evidence is stored under:

- `outputs/math-search-unsolved-recovery-2026-08-11/math-search-unsolved-recovery.json`
- `outputs/math-search-unsolved-recovery-2026-08-11/cases/<case-id>.json`
- `outputs/math-search-unsolved-recovery-2026-08-11/cases/<case-id>.json.gz`

Each case file contains the recovery model, every optimiser event, every evaluated pass, exact support states and reactions, complete metrics, stability references, hydraulic groups, beam outputs, timing and the final ranked result.
