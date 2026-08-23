# Dependency and security review

Reviewed 2026-08-23 with the locked `pnpm` dependency graph. This review is intentionally separate from engineering behaviour: no calculation, optimiser or export dependency was upgraded as part of TS-007.

## Commands and result

- `pnpm audit --json` — 743 resolved dependencies; 0 critical, 25 high, 17 moderate and 3 low advisories.
- `pnpm outdated --format json` — compatible and major updates are available across the React/Next/vinext/Vite toolchain.
- `pnpm test` — required before accepting any future isolated upgrade.

## Priority findings

| Priority | Path | Finding | Disposition |
|---|---|---|---|
| P0 | `xlsx@0.18.5` | Prototype-pollution and ReDoS advisories affect imported, crafted workbooks. The npm package has no patched release. | Unresolved. Replace or source a maintained patched distribution in a dedicated interchange change with full XLSM/VBA regression evidence. Until then, accept workbook imports only from trusted engineering sources. |
| P1 | `next@16.2.6` / `react-server-dom-webpack@19.2.6` | Multiple framework advisories have newer releases available. | Defer to an isolated framework update because vinext compatibility and static GitHub Pages output must be verified together. |
| P1 | `vinext@0.0.50 > image-size@2.0.2` | Crafted image parsing can hang the process; no patched transitive npm release is currently declared. | Avoid processing untrusted images in build tooling; review with the vinext upgrade. |
| P1 | PostCSS / nanoid / js-yaml transitive paths | Patched transitive versions exist, but forcing overrides can change the build stack. | Apply only in a dependency-only branch, then install, build, export and engineering-regression test. |
| P2 | `drizzle-kit` legacy esbuild path | Development-server CORS advisory; not used by the static engineering runtime. | Keep development servers bound to trusted interfaces and update with the database/tooling stack. |

## Update policy

Do not mix these upgrades with calculation or schema work. The first isolated update should test the current lockfile, update one coherent stack, rerun `pnpm install --frozen-lockfile`, `pnpm test`, workbook round-trip verification and GitHub Pages checks, then compare the generated static asset inventory. The direct `xlsx` risk requires a deliberate library decision rather than a lockfile override.
