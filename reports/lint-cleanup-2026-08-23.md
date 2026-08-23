# TS-006 ESLint Cleanup — 2026-08-23

## Outcome

`pnpm lint` passes with zero errors and zero warnings.

## Safe changes

- Excluded generated CommonJS verification output in `test-output/`, plus other generated evidence directories, from source linting.
- Excluded the separately maintained local Codex workflow companion from this application lint command; it is not part of the published Trailer Stability application.
- Removed the unused trailer index in `ModelTree`.
- Kept React's strict hooks rules active. Where an existing effect intentionally synchronises browser capability, local persistence, a resumed draft, selected entities, viewport state, or external worker state, added a local documented rule exception instead of changing engineering/UI behaviour.

## Verification

- `pnpm lint` — passed.
- `pnpm test` — required before release to confirm TypeScript, engineering calculations, workbook checks, build and rendered interface behaviour remain unchanged.
