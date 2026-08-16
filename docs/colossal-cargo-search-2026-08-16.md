# Colossal Cargo Search Audit — 2026-08-16

## Scope

The deterministic benchmark covers 18 K2400 ST cases from 800–3000 t. Cargo length, width and height each range from 50–150 m. Every case uses a central cargo COG, eight equally spaced supports, 0.2–1.0 m packing, 1.5 m deck height, front and rear PPUs, 2–12 trains, 4/5/6-AL modules, up to 99 AL/train, and both three- and four-point hydraulics. Each case has an independent eight-second limit; a stopped case retains all events and any valid pass already found.

## Result

| Case | Cargo t / L×W×H m | State | Full cases | Best exact arrangement |
|---|---:|---:|---:|---|
| COL-01 | 800 / 50×50×50 | Complete, 2.48 s | 6 | 2 × 30 AL, 4-point, 26.713 m pitch |
| COL-02 | 1000 / 75×50×100 | Stopped | 15 | None; exact failures were spine utilisation |
| COL-03 | 1200 / 100×75×50 | Complete, 4.83 s | 13 | 2 × 56 AL, 4-point, 20.623 m pitch |
| COL-04 | 1400 / 125×100×75 | Stopped | 0 | No retained result |
| COL-05 | 1600 / 150×125×100 | Stopped | 0 | No retained result |
| COL-06 | 1800 / 50×150×125 | Stopped | 0 | No retained result |
| COL-07 | 2000 / 75×125×150 | Stopped | 0 | Hydraulic-width branches rejected |
| COL-08 | 2200 / 100×100×100 | Stopped | 0 | No retained result |
| COL-09 | 2400 / 125×75×125 | Stopped | 0 | No retained result |
| COL-10 | 2600 / 150×50×150 | Stopped | 0 | Hydraulic-width branches rejected |
| COL-11 | 2800 / 50×75×100 | Stopped | 287 | None; best observed spine utilisation remained far above limit |
| COL-12 | 3000 / 75×150×50 | Stopped | 165 | None; best observed spine utilisation remained far above limit |
| COL-13 | 900 / 100×150×150 | Stopped | 0 | Hydraulic-width branches rejected |
| COL-14 | 1300 / 150×100×50 | Stopped after pass | 9 | 2 × 84 AL, 4-point, 20.858 m pitch |
| COL-15 | 1700 / 50×125×75 | Stopped | 243 | None; exact failures were spine utilisation |
| COL-16 | 2100 / 125×50×150 | Stopped | 0 | Hydraulic-width branches rejected |
| COL-17 | 2500 / 150×150×75 | Stopped | 0 | No retained result |
| COL-18 | 2900 / 100×75×125 | Stopped | 0 | No retained result |

“Stopped” does not mean the entire permitted domain is mathematically impossible. It means the case reached its configured time limit. A zero-case result means all formations reached during that interval were rejected by necessary geometry, support, capacity or reaction-ratio bounds before a full engineering calculation.

## Improvement

The original baseline evaluated 3,749 full cases, triggered 38 fallback events, found no result before any case timeout and completed no case. The final run evaluated 738 full cases, found three exact arrangements and completed two cases within the cap. The 800 t representative case now completes in about 2.5 seconds versus the earlier 43–44 second process, exceeding the 5× / nine-second target.

The speed-up is produced by exact bounds rather than approximate results:

- Support span now raises the minimum AL/train before any shorter deck is calculated.
- Maximum available hydraulic Y span rejects complete train/hydraulic branches.
- Shared-X planning intersects every COG/polygon inequality for three- and four-point boundaries.
- Basic, slope and dynamic group-capacity limits plus the dynamic/static reaction-ratio limit are solved as affine X inequalities.
- Planning uses an exact stability-only probe. It shares the production COG, hydraulic reaction, utilisation and angle equations, but does not run support settlement or the spine beam.
- Planning probes cannot be cached or selected as passes. Every recorded case and final winner still runs the complete support and beam calculation.
- The winner is reapplied once with its retained split, X and pins, then fully recalculated and verified.

## Reproduction and retained evidence

Run from the repository root in PowerShell:

```powershell
$env:COLOSSAL_TIMEOUT_MS = "8000"
$env:COLOSSAL_BENCHMARK_LABEL = "review-run"
pnpm benchmark:colossal
```

The command writes a summary JSON, summary CSV and one gzip-compressed complete model/run/event record per case under `outputs/colossal-cargo-search-2026-08-16/<label>/`. The final local evidence set is `final-exact-v9`; compressed detailed logs total approximately 4.9 MB. `outputs/` is intentionally ignored by Git because it is generated evidence.
