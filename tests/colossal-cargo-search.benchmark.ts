import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { createDefaultModel } from "../app/data/default-model";
import { minimumTotalAxleLines } from "../app/engine/arrangement";
import { runArrangementOptimiser } from "../app/engine/arrangement-optimiser";
import type { OptimiserRun, ProjectModel } from "../app/engine/types";

interface ColossalCaseSpec {
  id: string;
  cargoMassT: number;
  lengthM: number;
  widthM: number;
  heightM: number;
  packingHeightM: number;
  packingMassFraction: number;
}

interface ColossalCaseSummary {
  id: string;
  input: ColossalCaseSpec & {
    packingMassT: number;
    supportXM: number[];
  };
  capacityLowerBoundTotalAL: Record<string, number>;
  state: OptimiserRun["state"];
  timedOut: boolean;
  durationMs: number;
  passCount: number;
  validPassCount: number;
  fallbackCount: number;
  fallbackEvents: Array<{
    elapsedMs: number;
    message: string;
    detail: string;
  }>;
  eventCounts: Record<string, number>;
  failureCounts: Record<string, number>;
  best: null | {
    passId: string;
    trainCount: number;
    axleLinesPerTrain: number;
    totalAxleLines: number;
    hydraulicSystemMode: string;
    pitchM: number;
    overallWidthM: number;
    splitAfterAxleLine: number;
    sharedTrailerXM: number;
    activeSupports: number;
    status: string;
    failClass: string;
    basicUtilisation: number | null;
    dynamicUtilisation: number | null;
    dynamicAngleDeg: number | null;
    spineUtilisation: number | null;
    absoluteDeflectionMm: number;
  };
}

const CASES: ColossalCaseSpec[] = [
  { id: "COL-01", cargoMassT: 800, lengthM: 50, widthM: 50, heightM: 50, packingHeightM: 0.2, packingMassFraction: 0.01 },
  { id: "COL-02", cargoMassT: 1000, lengthM: 75, widthM: 50, heightM: 100, packingHeightM: 0.4, packingMassFraction: 0.02 },
  { id: "COL-03", cargoMassT: 1200, lengthM: 100, widthM: 75, heightM: 50, packingHeightM: 0.6, packingMassFraction: 0.03 },
  { id: "COL-04", cargoMassT: 1400, lengthM: 125, widthM: 100, heightM: 75, packingHeightM: 0.8, packingMassFraction: 0.04 },
  { id: "COL-05", cargoMassT: 1600, lengthM: 150, widthM: 125, heightM: 100, packingHeightM: 1.0, packingMassFraction: 0.02 },
  { id: "COL-06", cargoMassT: 1800, lengthM: 50, widthM: 150, heightM: 125, packingHeightM: 1.0, packingMassFraction: 0.03 },
  { id: "COL-07", cargoMassT: 2000, lengthM: 75, widthM: 125, heightM: 150, packingHeightM: 0.8, packingMassFraction: 0.01 },
  { id: "COL-08", cargoMassT: 2200, lengthM: 100, widthM: 100, heightM: 100, packingHeightM: 0.6, packingMassFraction: 0.04 },
  { id: "COL-09", cargoMassT: 2400, lengthM: 125, widthM: 75, heightM: 125, packingHeightM: 0.4, packingMassFraction: 0.02 },
  { id: "COL-10", cargoMassT: 2600, lengthM: 150, widthM: 50, heightM: 150, packingHeightM: 0.2, packingMassFraction: 0.03 },
  { id: "COL-11", cargoMassT: 2800, lengthM: 50, widthM: 75, heightM: 100, packingHeightM: 0.8, packingMassFraction: 0.04 },
  { id: "COL-12", cargoMassT: 3000, lengthM: 75, widthM: 150, heightM: 50, packingHeightM: 0.4, packingMassFraction: 0.01 },
  { id: "COL-13", cargoMassT: 900, lengthM: 100, widthM: 150, heightM: 150, packingHeightM: 0.2, packingMassFraction: 0.02 },
  { id: "COL-14", cargoMassT: 1300, lengthM: 150, widthM: 100, heightM: 50, packingHeightM: 0.5, packingMassFraction: 0.03 },
  { id: "COL-15", cargoMassT: 1700, lengthM: 50, widthM: 125, heightM: 75, packingHeightM: 0.7, packingMassFraction: 0.04 },
  { id: "COL-16", cargoMassT: 2100, lengthM: 125, widthM: 50, heightM: 150, packingHeightM: 0.9, packingMassFraction: 0.01 },
  { id: "COL-17", cargoMassT: 2500, lengthM: 150, widthM: 150, heightM: 75, packingHeightM: 1.0, packingMassFraction: 0.02 },
  { id: "COL-18", cargoMassT: 2900, lengthM: 100, widthM: 75, heightM: 125, packingHeightM: 0.3, packingMassFraction: 0.03 },
];

function modelFor(spec: ColossalCaseSpec): ProjectModel {
  const model = createDefaultModel();
  const packingMassT = spec.cargoMassT * spec.packingMassFraction;
  const supportXM = Array.from(
    { length: 8 },
    (_, index) => (spec.lengthM * (index + 1)) / 9,
  );
  model.cargo = {
    ...model.cargo,
    name: spec.id,
    clientReference: "COLOSSAL-SEARCH-BENCHMARK",
    lengthM: spec.lengthM,
    widthM: spec.widthM,
    heightM: spec.heightM,
    extremeX: 0,
    extremeY: 0,
    massT: spec.cargoMassT,
    cog: {
      x: spec.lengthM / 2,
      y: spec.widthM / 2,
      z: spec.heightM / 2,
    },
    autoCogEnvelopeFromCargo: true,
    envelopeX: spec.lengthM * 0.02,
    envelopeY: spec.widthM * 0.02,
    autoWindFromCargo: true,
    sideWindAreaM2: spec.lengthM * spec.heightM,
    frontWindAreaM2: spec.widthM * spec.heightM,
    sideWindHeightM: spec.heightM / 2,
    frontWindHeightM: spec.heightM / 2,
  };
  model.packing = {
    ...model.packing,
    massT: packingMassT,
    heightM: spec.packingHeightM,
    cog: {
      x: model.cargo.cog.x,
      y: model.cargo.cog.y,
      z: spec.packingHeightM / 2,
    },
  };
  model.trailerDeckHeightM = 1.5;
  model.supports = supportXM.map((xM, index) => ({
    id: `${spec.id}-support-${index + 1}`,
    xM,
    widthM: 0.5,
    allowed: true,
    active: true,
  }));
  model.arrangementOptimiser = {
    ...model.arrangementOptimiser,
    searchMode: "MATHEMATICAL_BRANCH_BOUND",
    trailerDefinitionId: "k2400-st",
    ppuPosition: "BOTH",
    hydraulicSearchMode: "BOTH",
    minimumTrains: 2,
    maximumTrains: 12,
    maximumAxleLinesPerTrain: 99,
    limitModuleAvailability: false,
    allow4AxleModules: true,
    allow5AxleModules: true,
    allow6AxleModules: true,
    enforceMaximumFormationWidth: false,
    limitFormationWidthToCargo: false,
    searchMaximumFormationWidthM: 30,
    preferredCentreSpacingM: 2.9,
    minimumClearanceM: 0.05,
    spacingSamples: 3,
    formationMode: "ALLOW_STAGGERED",
    maximumLongitudinalStaggerM: 6,
    longitudinalStaggerSamples: 1,
  };
  model.optimiser = {
    ...model.optimiser,
    minimumActiveSupports: 2,
    progressRefreshSeconds: 0.25,
  };
  return model;
}

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const name = key(item) || "none";
    counts[name] = (counts[name] ?? 0) + 1;
  }
  return counts;
}

function summarise(
  spec: ColossalCaseSpec,
  model: ProjectModel,
  run: OptimiserRun,
  durationMs: number,
  timedOut: boolean,
): ColossalCaseSummary {
  const best = run.passes.find((pass) => pass.overallRank === 1 && pass.arrangement);
  const fallbackEvents = run.events
    .filter((event) => /fallback/i.test(`${event.stage} ${event.message} ${event.detail}`))
    .map((event) => ({
      elapsedMs: Math.round(event.elapsedMs * 100) / 100,
      message: event.message,
      detail: event.detail,
    }));
  return {
    id: spec.id,
    input: {
      ...spec,
      packingMassT: model.packing.massT,
      supportXM: model.supports.map((support) => support.xM),
    },
    capacityLowerBoundTotalAL: Object.fromEntries(
      Array.from({ length: 11 }, (_, index) => index + 2).map((trainCount) => [
        `${trainCount}-trains`,
        minimumTotalAxleLines(model, model.arrangementOptimiser, trainCount),
      ]),
    ),
    state: run.state,
    timedOut,
    durationMs: Math.round(durationMs * 100) / 100,
    passCount: run.passes.length,
    validPassCount: run.passes.filter((pass) => pass.result.status === "PASS").length,
    fallbackCount: fallbackEvents.length,
    fallbackEvents,
    eventCounts: countBy(run.events, (event) => event.message),
    failureCounts: countBy(run.passes, (pass) => pass.result.failClass || pass.result.status),
    best: best?.arrangement
      ? {
          passId: best.id,
          trainCount: best.arrangement.trainCount,
          axleLinesPerTrain: best.arrangement.axleLinesPerTrain,
          totalAxleLines: best.arrangement.totalAxleLines,
          hydraulicSystemMode: best.arrangement.hydraulicSystemMode ?? model.hydraulicSystemMode,
          pitchM: best.arrangement.pitchM,
          overallWidthM: best.arrangement.overallWidthM,
          splitAfterAxleLine: best.d138,
          sharedTrailerXM: best.e89,
          activeSupports: best.result.activeSupportCount,
          status: best.result.status,
          failClass: best.result.failClass,
          basicUtilisation: best.result.metrics.basicUtil.value,
          dynamicUtilisation: best.result.metrics.dynamicUtil.value,
          dynamicAngleDeg: best.result.metrics.dynamicAngle.value,
          spineUtilisation: best.result.metrics.spineUtil.value,
          absoluteDeflectionMm: best.result.beam.absoluteDeflectionMm,
        }
      : null,
  };
}

async function runCase(
  spec: ColossalCaseSpec,
  timeoutMs: number,
): Promise<{ model: ProjectModel; run: OptimiserRun; durationMs: number; timedOut: boolean }> {
  const model = modelFor(spec);
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const started = performance.now();
  try {
    const run = await runArrangementOptimiser(model, {
      signal: controller.signal,
      onUpdate: async () => {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      },
    });
    return { model, run, durationMs: performance.now() - started, timedOut };
  } finally {
    clearTimeout(timer);
  }
}

function csvCell(value: unknown): string {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

async function main(): Promise<void> {
  const timeoutMs = Math.max(1_000, Number(process.env.COLOSSAL_TIMEOUT_MS ?? 10_000));
  const label = (process.env.COLOSSAL_BENCHMARK_LABEL ?? "baseline").replace(/[^a-z0-9_-]+/gi, "-");
  const offset = Math.max(0, Number(process.env.COLOSSAL_CASE_OFFSET ?? 0));
  const limit = Math.max(1, Number(process.env.COLOSSAL_CASE_LIMIT ?? CASES.length));
  const selected = CASES.slice(offset, offset + limit);
  const outputDir = path.join(process.cwd(), "outputs", "colossal-cargo-search-2026-08-16", label);
  const caseDir = path.join(outputDir, "cases");
  await mkdir(caseDir, { recursive: true });
  const summaries: ColossalCaseSummary[] = [];
  const benchmarkStarted = performance.now();

  for (const spec of selected) {
    const result = await runCase(spec, timeoutMs);
    const summary = summarise(spec, result.model, result.run, result.durationMs, result.timedOut);
    summaries.push(summary);
    const fullRecord = JSON.stringify({
      benchmark: {
        label,
        timeoutMs,
        generatedAt: new Date().toISOString(),
      },
      spec,
      model: result.model,
      run: result.run,
      summary,
    });
    await writeFile(path.join(caseDir, `${spec.id}.json.gz`), gzipSync(fullRecord));
    console.log(
      `${summary.id} ${summary.state.padEnd(8)} ${summary.durationMs.toFixed(0).padStart(6)} ms ` +
      `${summary.passCount.toString().padStart(5)} cases ${summary.fallbackCount.toString().padStart(3)} fallbacks ` +
      `${summary.best ? `${summary.best.trainCount}T × ${summary.best.axleLinesPerTrain}AL = ${summary.best.totalAxleLines} total` : "NO RESULT"}`,
    );
  }

  const aggregate = {
    label,
    generatedAt: new Date().toISOString(),
    timeoutMs,
    totalDurationMs: Math.round((performance.now() - benchmarkStarted) * 100) / 100,
    requestedCaseCount: selected.length,
    completedCaseCount: summaries.filter((item) => item.state === "COMPLETE").length,
    timedOutCaseCount: summaries.filter((item) => item.timedOut).length,
    solvedCaseCount: summaries.filter((item) => item.best !== null).length,
    fallbackCaseCount: summaries.filter((item) => item.fallbackCount > 0).length,
    totalFallbackEvents: summaries.reduce((sum, item) => sum + item.fallbackCount, 0),
    summaries,
  };
  await writeFile(path.join(outputDir, "summary.json"), JSON.stringify(aggregate, null, 2), "utf8");
  const rows = [
    ["id", "state", "timedOut", "durationMs", "passCount", "validPassCount", "fallbackCount", "failureCounts", "trainCount", "axleLinesPerTrain", "totalAxleLines", "hydraulicSystemMode", "pitchM", "overallWidthM", "activeSupports"],
    ...summaries.map((item) => [
      item.id,
      item.state,
      item.timedOut,
      item.durationMs,
      item.passCount,
      item.validPassCount,
      item.fallbackCount,
      JSON.stringify(item.failureCounts),
      item.best?.trainCount ?? "",
      item.best?.axleLinesPerTrain ?? "",
      item.best?.totalAxleLines ?? "",
      item.best?.hydraulicSystemMode ?? "",
      item.best?.pitchM ?? "",
      item.best?.overallWidthM ?? "",
      item.best?.activeSupports ?? "",
    ]),
  ];
  await writeFile(
    path.join(outputDir, "summary.csv"),
    rows.map((row) => row.map(csvCell).join(",")).join("\n"),
    "utf8",
  );
  console.log(`Recorded ${summaries.length} complete case logs in ${outputDir}`);
}

void main();
