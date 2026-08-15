# Repository Guidelines

## Project Structure & Module Organization

The responsive React application lives in `app/`. Put engineering calculations and interchange logic in `app/engine/`, trailer catalogue data in `app/data/`, geometry adapters in `app/geometry/`, and UI code in `app/components/`. Browser-worker orchestration belongs in `app/workers/` and `app/hooks/`. Static assets and downloadable packages live in `public/`. Automated checks are under `tests/`; Excel and AutoCAD utilities, fixtures, and package sources are under `tools/`. Keep durable technical notes in `docs/` or `reports/`. Treat `dist/`, `.next/`, `test-output/`, `outputs/`, and `qa-evidence/` as generated artifacts.

## Build, Test, and Development Commands

Use Node 22.13+ and pnpm 9.10.

- `pnpm install --frozen-lockfile` — install the locked dependency set.
- `pnpm dev --host 0.0.0.0` — run the local vinext development server, including LAN/mobile access.
- `pnpm typecheck` — run strict TypeScript checks without emitting files.
- `pnpm lint` — apply the Next.js Core Web Vitals and TypeScript ESLint rules.
- `pnpm test:engine` — compile and run the core engine/workbook and geometry regression suites.
- `pnpm test` — run type checks, engineering tests, a production build, and rendered-HTML validation.
- `pnpm build` / `pnpm start --hostname 0.0.0.0` — build and serve the production output.

## Coding Style & Naming Conventions

Follow the existing two-space TypeScript/TSX style, double quotes, semicolons, trailing commas, and strict typing. Use `PascalCase` for React components and exported types, `camelCase` for functions and values, and descriptive kebab-case filenames for engine modules. Preserve the canonical orientation: lower X/screen left is rear; higher X/screen right is front. Keep calculations deterministic, identify units in names (`massT`, `widthM`, `windSpeedMps`), and never hand-edit generated output.

## Testing Guidelines

Tests use `node:assert/strict` in `*.test.ts` and `*.test.mjs` files. Add numerical regression cases with explicit tolerances and cover both three- and four-point hydraulics when relevant. Geometry or UI changes should also verify responsive rendering. Run `pnpm test` before submitting; use the compiled `test-output/cjs/tests/` files for focused optimiser investigations.

## Commit & Pull Request Guidelines

Use concise, imperative commit subjects such as `Fix AutoCAD JSON import validation`. Keep each commit focused. Pull requests must explain engineering impact, list verification commands, link related issues, and include screenshots for visual or responsive changes. Call out schema, calculation, catalogue, and export-contract changes explicitly. Never commit credentials, private case data, local logs, or generated build directories.
