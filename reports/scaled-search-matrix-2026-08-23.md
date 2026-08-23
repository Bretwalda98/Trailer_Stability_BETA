# Scaled arrangement-search matrix — 2026-08-23

## Outcome

The reproducible TS-002 matrix completed all 37 configured cases in 51.63 s. It evaluated 7,950 exact cases: 431 engineering PASS results and 7,519 recorded failures. Thirty-six scenarios produced a ranked recommendation; one deliberately adverse scenario remained unsolved for a documented physical reason.

The matrix covers small through extreme cargo, cargo larger than the trailer footprint, central and eccentric/high COGs, one and multiple trains, the 12-train/99-AL maximum configured horizon, K2400/K2500/PEKZ data, 3- and 4-point hydraulics, sparse/narrow/wide supports, preferred plus independent spacing, cargo/hard width limits, unlimited width, PPU at neither/both ends, and in-line/staggered formations.

## Reproduction

Run `pnpm run benchmark:matrix`. The command writes a summary JSON/CSV plus one complete JSON and gzip file per case under `outputs/math-search-review-2026-08-23/`. Generated outputs are intentionally not committed; the test source is the durable case definition.

## Notable results

| Case | Exact cases | Duration | Result |
|---|---:|---:|---|
| C01 light compact | 5 | 106 ms | 1 train, 6 AL total |
| C04 very heavy 800 t | 7,399 | 24.10 s | 2 trains, 24 AL total |
| C05 25 × 16 × 16 m | 23 | 629 ms | 2 trains, 36 AL total |
| C19 four-point | 9 | 145 ms | 1 train, 11 AL total, four-point verified |
| C34 wide supports | 28 | 1.43 s | 2 trains, 18 AL total, staggered |
| C37 maximum ranges | 9 | 359 ms | 1 train, 8 AL total; 12-train/99-AL horizon safely pruned |

## Unsolved case

**C36 adverse all** combined a 25 × 16 × 16 m cargo, 650 t mass, highly eccentric 21/14/13 m COG, 100 t packing, 25 m/s wind, 1.2/0.8 m/s² acceleration, 3° slopes, narrow supports, PPUs at both ends and four-point hydraulics. Sixty-seven retained formations were evaluated from a 7,602-candidate upper bound. Every retained case failed support settlement: successive negative reactions deactivated three of four supports, leaving one active support against the required minimum of two. Stability itself could pass in several cases, so the failure is correctly classified as `SUPPORT_SETTLEMENT_FAILED`, not a search crash or missing arrangement. Production logic was not weakened to force a pass.
