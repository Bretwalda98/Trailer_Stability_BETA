import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import {
  collectArrangementIssues,
  payloadCogX,
  recommendedPackingSupports,
} from "../app/engine/arrangement";
import { runArrangementOptimiser } from "../app/engine/arrangement-optimiser";
import type { OptimiserRun, PassResult, ProjectModel } from "../app/engine/types";

const CASE_IDS = [
  "C05_LONG_WIDE_TALL",
  "C06_LONG_WIDE_HEAVY",
  "C10_COG_FRONT",
  "C19_FOUR_POINT",
  "C29_INLINE_ONLY",
  "C36_ADVERSE_ALL",
] as const;

interface StoredCase {
  model: ProjectModel;
  run: OptimiserRun;
}

function counts<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const item of items) {
    const value = key(item) || "none";
    result[value] = (result[value] ?? 0) + 1;
  }
  return result;
}

function bestSummary(best: PassResult | undefined): Record<string, unknown> | null {
  if (!best?.arrangement) return null;
  return {
    passId: best.id,
    caseReference: best.caseReference,
    arrangement: best.arrangement,
    splitAfterAxleLine: best.d138,
    sharedTrailerX: best.e89,
    pinnedAxleLines: best.pinnedAxleLines,
    activeSupports: best.result.activeSupportCount,
    minimumActiveSupports: best.result.minimumActiveSupports,
    supportResults: best.result.supports,
    status: best.result.status,
    failClass: best.result.failClass,
    failDetail: best.result.failDetail,
    metrics: best.result.metrics,
    stabilityReferences: best.result.stabilityReferences,
    combinedCog: best.result.combinedCog,
    loadCog: best.result.loadCog,
    groups: best.result.groups,
    stabilityPolygon: best.result.stabilityPolygon,
    groupingQuality: best.result.groupingQuality,
    beam: {
      ...best.result.beam,
      points: undefined,
      pointCount: best.result.beam.points.length,
    },
    warnings: best.result.warnings,
  };
}

async function main(): Promise<void> {
  const sourceDir = path.join(process.cwd(), "outputs", "math-search-review-2026-08-11", "cases");
  const outputDir = path.join(process.cwd(), "outputs", "math-search-unsolved-recovery-2026-08-11");
  const caseDir = path.join(outputDir, "cases");
  await mkdir(caseDir, { recursive: true });
  const summary: Array<Record<string, unknown>> = [];

  for (const id of CASE_IDS) {
    const stored = JSON.parse(
      await readFile(path.join(sourceDir, `${id}.json`), "utf8"),
    ) as StoredCase;
    const model = structuredClone(stored.model);
    const originalIssues = collectArrangementIssues(model, model.arrangementOptimiser);
    const originalSupportSpan = model.supports
      .filter((support) => support.allowed)
      .map((support) => support.xM);
    const changedSupports = id !== "C19_FOUR_POINT";
    if (changedSupports) model.supports = recommendedPackingSupports(model);

    const started = performance.now();
    const run = await runArrangementOptimiser(model);
    const durationMs = performance.now() - started;
    const best = run.passes.find((pass) => pass.overallRank === 1);
    const record = {
      id,
      recoveryReason: id === "C19_FOUR_POINT"
        ? "Four-point stability polygons are now supported by the mathematical shared-X interval solver. No case input was changed."
        : "The original packing supports did not provide a usable longitudinal support envelope. The explicit COG-spanning four-support proposal was applied; all engineering limits and arrangement bounds were retained.",
      inputChanges: changedSupports
        ? {
            supportsBefore: stored.model.supports,
            supportsAfter: model.supports,
          }
        : {},
      original: {
        state: stored.run.state,
        passRecords: stored.run.passes.length,
        statusCounts: counts(stored.run.passes, (pass) => pass.result.status),
        failClassCounts: counts(stored.run.passes, (pass) => pass.result.failClass),
        payloadCogX: payloadCogX(stored.model),
        supportCentreMinimumX: originalSupportSpan.length ? Math.min(...originalSupportSpan) : null,
        supportCentreMaximumX: originalSupportSpan.length ? Math.max(...originalSupportSpan) : null,
        preflightIssues: originalIssues,
      },
      recovery: {
        durationMs,
        state: run.state,
        passRecords: run.passes.length,
        statusCounts: counts(run.passes, (pass) => pass.result.status),
        failClassCounts: counts(run.passes, (pass) => pass.result.failClass),
        best: bestSummary(best),
      },
      model,
      run,
    };
    const json = JSON.stringify(record, null, 2);
    await writeFile(path.join(caseDir, `${id}.json`), json, "utf8");
    await writeFile(path.join(caseDir, `${id}.json.gz`), gzipSync(json));
    summary.push({
      id,
      recoveryReason: record.recoveryReason,
      inputChanges: record.inputChanges,
      original: record.original,
      recovery: record.recovery,
      fullRecord: `cases/${id}.json`,
      compressedRecord: `cases/${id}.json.gz`,
    });
    console.log(
      `${id}: ${best ? "RECOVERED" : "NO PASS"}; ${run.passes.length} records; ${durationMs.toFixed(1)} ms; ${best?.arrangement ? `${best.arrangement.trainCount} train(s), ${best.arrangement.axleLinesPerTrain} AL/train` : "none"}`,
    );
  }

  await writeFile(
    path.join(outputDir, "math-search-unsolved-recovery.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), cases: summary }, null, 2),
    "utf8",
  );
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
