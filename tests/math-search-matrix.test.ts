import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { createDefaultModel } from "../app/data/default-model";
import { recommendedPackingSupports } from "../app/engine/arrangement";
import { runArrangementOptimiser } from "../app/engine/arrangement-optimiser";
import type { ProjectModel } from "../app/engine/types";

type CaseSpec = {
  id: string;
  description: string;
  dimensions: [number, number, number];
  massT: number;
  cog: [number, number, number];
  packingMassT?: number;
  packingHeightM?: number;
  packingCogZ?: number;
  windMps?: number;
  longAccel?: number;
  transverseAccel?: number;
  slopeDeg?: number;
  hydraulicSystemMode?: ProjectModel["hydraulicSystemMode"];
  supportLayout?: "standard" | "narrow" | "sparse" | "minimum" | "wide";
  ppuPosition?: ProjectModel["arrangementOptimiser"]["ppuPosition"];
  trailerDefinitionId?: string;
  minimumTrains?: number;
  maximumTrains?: number;
  maximumAxleLinesPerTrain?: number;
  formationMode?: ProjectModel["arrangementOptimiser"]["formationMode"];
  maximumLongitudinalStaggerM?: number;
  limitFormationWidthToCargo?: boolean;
  enforceMaximumFormationWidth?: boolean;
  maximumFormationWidthM?: number;
};

type CaseRecord = {
  id: string;
  description: string;
  inputs: Record<string, unknown>;
  state: string;
  durationMs: number;
  passCount: number;
  failedPassCount: number;
  statusCounts: Record<string, number>;
  best: Record<string, unknown> | null;
  recommendation: string;
  keyEvents: Array<{ stage: string; message: string; detail: string; level: string }>;
  warnings: string[];
};

function applySpec(spec: CaseSpec): ProjectModel {
  const model = createDefaultModel();
  const [lengthM, widthM, heightM] = spec.dimensions;
  const [cogX, cogY, cogZ] = spec.cog;
  model.cargo = {
    ...model.cargo,
    name: spec.id,
    clientReference: "MATH-SEARCH-REVIEW",
    lengthM,
    widthM,
    heightM,
    massT: spec.massT,
    cog: { x: cogX, y: cogY, z: cogZ },
    envelopeX: Math.max(lengthM * 0.025, 0.1),
    envelopeY: Math.max(widthM * 0.025, 0.1),
    sideWindAreaM2: lengthM * heightM,
    frontWindAreaM2: widthM * heightM,
    sideWindHeightM: heightM / 2,
    frontWindHeightM: heightM / 2,
  };
  model.packing = {
    ...model.packing,
    massT: spec.packingMassT ?? 0,
    heightM: spec.packingHeightM ?? 0,
    cog: {
      x: lengthM / 2,
      y: widthM / 2,
      z: spec.packingCogZ ?? (spec.packingHeightM ?? 0) / 2,
    },
  };
  model.environment = {
    ...model.environment,
    routeLongitudinalSlopeDeg: spec.slopeDeg ?? 0,
    longitudinalSlopeDeg: spec.slopeDeg ?? 0,
    routeTransverseSlopeDeg: spec.slopeDeg ?? 0,
    transverseSlopeDeg: spec.slopeDeg ?? 0,
    windSpeedMps: spec.windMps ?? 15,
    longitudinalAccelerationMps2: spec.longAccel ?? 0.5,
    transverseAccelerationMps2: spec.transverseAccel ?? 0.2,
  };
  model.hydraulicSystemMode = spec.hydraulicSystemMode ?? "THREE_POINT";
  const supportX = {
    standard: recommendedPackingSupports(model).map((support) => support.xM),
    narrow: [5.0, 5.7, 6.4, 7.1],
    sparse: [1.0, 11.0],
    minimum: [3.0, 9.0],
    wide: [1.0, 4.0, 8.0, 11.0],
  }[spec.supportLayout ?? "standard"];
  model.supports = supportX.map((xM, index) => ({
    id: `${spec.id}-support-${index + 1}`,
    xM,
    widthM: 0.5,
    allowed: true,
    active: true,
  }));
  model.arrangementOptimiser = {
    ...model.arrangementOptimiser,
    searchMode: "MATHEMATICAL_BRANCH_BOUND",
    trailerDefinitionId: spec.trailerDefinitionId ?? "k2400-st",
    ppuPosition: spec.ppuPosition ?? "REAR",
    minimumTrains: spec.minimumTrains ?? 1,
    maximumTrains: spec.maximumTrains ?? 4,
    // Broad survey cases use a controlled 20 AL/train horizon so the matrix
    // remains runnable. Dedicated stress cases can opt into the full 44 AL.
    maximumAxleLinesPerTrain: spec.maximumAxleLinesPerTrain ?? 20,
    formationMode: spec.formationMode ?? "ALLOW_STAGGERED",
    maximumLongitudinalStaggerM: spec.maximumLongitudinalStaggerM ?? 3,
    longitudinalStaggerSamples: 1,
    limitFormationWidthToCargo: spec.limitFormationWidthToCargo ?? false,
    enforceMaximumFormationWidth: spec.enforceMaximumFormationWidth ?? false,
    maximumFormationWidthM: spec.maximumFormationWidthM ?? 30,
    searchMaximumFormationWidthM: spec.maximumFormationWidthM ?? 30,
    spacingSamples: 3,
  };
  model.optimiser = {
    ...model.optimiser,
    minimumActiveSupports: model.supports.length <= 2 ? 2 : 2,
    pinSearchMode: "OFF",
    deflectionCheck: "OFF",
    stopAtFirstPass: false,
    e89Step: 0.5,
    d138Step: 1,
  };
  return model;
}

function specs(): CaseSpec[] {
  return [
    { id: "C01_LIGHT_COMPACT", description: "Light central compact cargo", dimensions: [8, 3, 2], massT: 20, cog: [4, 1.5, 1], maximumTrains: 2 },
    { id: "C02_MEDIUM_CENTRAL", description: "Medium central cargo", dimensions: [12, 4.9, 4.9], massT: 100, cog: [6, 2.45, 2.45], maximumTrains: 3 },
    { id: "C03_STANDARD_HEAVY", description: "Standard heavy cargo", dimensions: [12, 4.9, 4.9], massT: 450, cog: [6, 2.45, 2.45], maximumTrains: 4 },
    { id: "C04_VERY_HEAVY", description: "Very heavy cargo near capacity bound", dimensions: [12, 4.9, 4.9], massT: 800, cog: [6, 2.45, 2.45], maximumTrains: 6, maximumAxleLinesPerTrain: 44 },
    { id: "C05_LONG_WIDE_TALL", description: "25 m x 16 m x 16 m cargo", dimensions: [25, 16, 16], massT: 100, cog: [12.5, 8, 8], maximumTrains: 6 },
    { id: "C06_LONG_WIDE_HEAVY", description: "25 m x 16 m x 16 m heavy cargo", dimensions: [25, 16, 16], massT: 650, cog: [12.5, 8, 8], maximumTrains: 6 },
    { id: "C07_WIDE_LOW", description: "Wide low centre-of-gravity cargo", dimensions: [20, 12, 3], massT: 350, cog: [10, 6, 1.5], maximumTrains: 6 },
    { id: "C08_NARROW_HIGH", description: "Narrow tall high-COG cargo", dimensions: [20, 3, 12], massT: 350, cog: [10, 1.5, 6], maximumTrains: 6 },
    { id: "C09_COG_REAR", description: "COG shifted toward rear", dimensions: [16, 6, 6], massT: 300, cog: [1, 3, 3], maximumTrains: 4 },
    { id: "C10_COG_FRONT", description: "COG shifted toward front", dimensions: [16, 6, 6], massT: 300, cog: [15, 3, 3], maximumTrains: 4 },
    { id: "C11_COG_LEFT", description: "COG shifted toward left", dimensions: [16, 6, 6], massT: 300, cog: [8, 0.5, 3], maximumTrains: 4 },
    { id: "C12_COG_RIGHT", description: "COG shifted toward right", dimensions: [16, 6, 6], massT: 300, cog: [8, 5.5, 3], maximumTrains: 4 },
    { id: "C13_HIGH_COG", description: "High COG stability challenge", dimensions: [14, 5, 14], massT: 250, cog: [7, 2.5, 12], maximumTrains: 6 },
    { id: "C14_HEAVY_PACKING", description: "Heavy packing contribution", dimensions: [14, 5, 8], massT: 300, cog: [7, 2.5, 4], packingMassT: 100, packingHeightM: 1, packingCogZ: 0.5, maximumTrains: 6 },
    { id: "C15_TALL_PACKING", description: "Tall packing contribution", dimensions: [14, 5, 8], massT: 300, cog: [7, 2.5, 4], packingMassT: 20, packingHeightM: 3, packingCogZ: 1.5, maximumTrains: 6 },
    { id: "C16_SEVERE_WIND", description: "High wind action", dimensions: [16, 6, 8], massT: 350, cog: [8, 3, 4], windMps: 25, maximumTrains: 6 },
    { id: "C17_SEVERE_ACCEL", description: "High longitudinal and transverse acceleration", dimensions: [16, 6, 8], massT: 350, cog: [8, 3, 4], longAccel: 1.2, transverseAccel: 0.8, maximumTrains: 6 },
    { id: "C18_SEVERE_COMBINED", description: "High wind, slope and acceleration", dimensions: [16, 6, 8], massT: 350, cog: [8, 3, 4], windMps: 25, longAccel: 1.2, transverseAccel: 0.8, slopeDeg: 3, maximumTrains: 6 },
    { id: "C19_FOUR_POINT", description: "Four-point hydraulic arrangement", dimensions: [14, 6, 5], massT: 300, cog: [7, 3, 2.5], hydraulicSystemMode: "FOUR_POINT", maximumTrains: 4 },
    { id: "C20_NARROW_SUPPORTS", description: "Localised narrow support layout", dimensions: [14, 5, 6], massT: 300, cog: [7, 2.5, 3], supportLayout: "narrow", maximumTrains: 4 },
    { id: "C21_SPARSE_SUPPORTS", description: "Only two widely spaced supports", dimensions: [14, 5, 6], massT: 300, cog: [7, 2.5, 3], supportLayout: "sparse", maximumTrains: 4 },
    { id: "C22_MINIMUM_SUPPORTS", description: "Minimum permitted support count", dimensions: [12, 5, 5], massT: 220, cog: [6, 2.5, 2.5], supportLayout: "minimum", maximumTrains: 3 },
    { id: "C23_ONE_TRAIN_ONLY", description: "Force one-train search", dimensions: [12, 5, 5], massT: 220, cog: [6, 2.5, 2.5], minimumTrains: 1, maximumTrains: 1 },
    { id: "C24_TWO_TRAIN_ONLY", description: "Force two-train search", dimensions: [18, 8, 6], massT: 500, cog: [9, 4, 3], minimumTrains: 2, maximumTrains: 2 },
    { id: "C25_MAX_AXLE_20", description: "Restricted maximum of 20 AL/train", dimensions: [18, 8, 6], massT: 500, cog: [9, 4, 3], maximumAxleLinesPerTrain: 20, maximumTrains: 6 },
    { id: "C26_CARGO_WIDTH_LIMIT", description: "Formation width limited to cargo width", dimensions: [18, 5, 6], massT: 400, cog: [9, 2.5, 3], limitFormationWidthToCargo: true, maximumTrains: 6 },
    { id: "C27_HARD_WIDTH_LIMIT", description: "Hard 9 m formation-width limit", dimensions: [18, 10, 6], massT: 400, cog: [9, 5, 3], enforceMaximumFormationWidth: true, maximumFormationWidthM: 9, maximumTrains: 6 },
    { id: "C28_STAGGERED", description: "Bounded longitudinal stagger allowed", dimensions: [22, 8, 7], massT: 450, cog: [11, 4, 3.5], formationMode: "ALLOW_STAGGERED", maximumLongitudinalStaggerM: 6, maximumTrains: 6 },
    { id: "C29_INLINE_ONLY", description: "Longitudinal stagger prohibited", dimensions: [22, 8, 7], massT: 450, cog: [11, 4, 3.5], formationMode: "INLINE_ONLY", maximumTrains: 6 },
    { id: "C30_PPU_BOTH", description: "PPU on both rear and front", dimensions: [16, 6, 6], massT: 350, cog: [8, 3, 3], ppuPosition: "BOTH", maximumTrains: 6 },
    { id: "C31_PPU_NONE", description: "No PPU mass", dimensions: [16, 6, 6], massT: 350, cog: [8, 3, 3], ppuPosition: "NONE", maximumTrains: 6 },
    { id: "C32_K2500_TRAILER", description: "Alternative K2500 3000 trailer catalogue model", dimensions: [16, 6, 6], massT: 350, cog: [8, 3, 3], trailerDefinitionId: "k2500-3000", maximumTrains: 6 },
    { id: "C33_PEKZ_TRAILER", description: "PEKZ G4 trailer catalogue model", dimensions: [16, 6, 6], massT: 350, cog: [8, 3, 3], trailerDefinitionId: "pekz-g4", maximumTrains: 6 },
    { id: "C34_WIDE_SUPPORTS", description: "Widely distributed supports", dimensions: [18, 8, 8], massT: 500, cog: [9, 4, 4], supportLayout: "wide", maximumTrains: 6 },
    { id: "C35_THIRD_DEGREE_REDUCED", description: "Reduced search actions requiring third-degree check", dimensions: [18, 8, 8], massT: 500, cog: [9, 4, 4], windMps: 10, longAccel: 0.3, transverseAccel: 0.1, maximumTrains: 6 },
    { id: "C36_ADVERSE_ALL", description: "Large, heavy, tall and laterally difficult case", dimensions: [25, 16, 16], massT: 650, cog: [21, 14, 13], packingMassT: 100, packingHeightM: 2, packingCogZ: 1, windMps: 25, longAccel: 1.2, transverseAccel: 0.8, slopeDeg: 3, hydraulicSystemMode: "FOUR_POINT", supportLayout: "narrow", ppuPosition: "BOTH", maximumTrains: 6 },
  ];
}

function inputsFor(spec: CaseSpec): Record<string, unknown> {
  return { ...spec };
}

function makeRecord(spec: CaseSpec, run: Awaited<ReturnType<typeof runArrangementOptimiser>>, durationMs: number): CaseRecord {
  const statusCounts: Record<string, number> = {};
  for (const pass of run.passes) statusCounts[pass.result.status] = (statusCounts[pass.result.status] ?? 0) + 1;
  const best = run.passes.find((pass) => pass.overallRank === 1);
  const bestArrangement = best?.arrangement;
  const recommendation = bestArrangement
    ? `${bestArrangement.trainCount} train(s), ${bestArrangement.axleLinesPerTrain} AL/train, ${bestArrangement.totalAxleLines} AL total, ${bestArrangement.pitchM.toFixed(3)} m centre pitch, ${bestArrangement.formationMode.toLowerCase()} formation${bestArrangement.longitudinalSpanM > 0 ? `, ${bestArrangement.longitudinalSpanM.toFixed(3)} m longitudinal stagger` : ""}.`
    : "No valid automatic arrangement found within the configured search bounds.";
  return {
    id: spec.id,
    description: spec.description,
    inputs: inputsFor(spec),
    state: run.state,
    durationMs: Math.round(durationMs * 100) / 100,
    passCount: run.passes.length,
    failedPassCount: run.passes.filter((pass) => pass.result.status !== "PASS").length,
    statusCounts,
    best: best && bestArrangement ? {
      passId: best.id,
      caseReference: best.caseReference,
      overallRank: best.overallRank,
      rating: best.rating,
      arrangement: bestArrangement,
      resultStatus: best.result.status,
      basicUtil: best.result.metrics.basicUtil.value,
      dynamicUtil: best.result.metrics.dynamicUtil.value,
      dynamicAngle: best.result.metrics.dynamicAngle.value,
      activeSupports: best.result.activeSupportCount,
      cargoOnlyPass: best.result.stabilityReferences.cargoOnlyPass,
      combinedCogRequired: best.result.stabilityReferences.combinedCogRequired,
      combinedCogPassOnly: best.result.stabilityReferences.combinedCogPassOnly,
    } : null,
    recommendation,
    keyEvents: run.events
      .filter((event) => ["Minimum arrangement selected", "No valid arrangement", "Maximum axle formation failed necessary gates", "Hydraulic Y-span bound rejected formation", "Train count rejected by capacity or stock bound", "Minimum axle-line boundary solved", "Winning formation fully verified"].includes(event.message))
      .slice(0, 20)
      .map((event) => ({ stage: event.stage, message: event.message, detail: event.detail, level: event.level })),
    warnings: run.events.filter((event) => event.level === "WARN" || event.level === "ERROR").slice(0, 20).map((event) => `${event.stage}: ${event.message} — ${event.detail}`),
  };
}

async function main(): Promise<void> {
  const started = performance.now();
  const records: CaseRecord[] = [];
  const outputDir = path.join(process.cwd(), "outputs", "math-search-review-2026-08-11");
  const caseDir = path.join(outputDir, "cases");
  await mkdir(caseDir, { recursive: true });
  for (const spec of specs()) {
    const caseStarted = performance.now();
    const model = applySpec(spec);
    const run = await runArrangementOptimiser(model);
    const record = makeRecord(spec, run, performance.now() - caseStarted);
    records.push(record);
    const fullCase = { id: spec.id, description: spec.description, model, run };
    const fullCaseJson = JSON.stringify(fullCase);
    await writeFile(path.join(caseDir, `${spec.id}.json`), fullCaseJson, "utf8");
    await writeFile(path.join(caseDir, `${spec.id}.json.gz`), gzipSync(fullCaseJson));
    console.log(`${record.id.padEnd(28)} ${record.state.padEnd(9)} ${record.passCount.toString().padStart(5)} passes  ${record.durationMs.toFixed(0).padStart(6)} ms  ${record.recommendation}`);
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    totalCases: records.length,
    totalDurationMs: Math.round((performance.now() - started) * 100) / 100,
    completedCases: records.filter((record) => record.state === "COMPLETE").length,
    recommendedCases: records.filter((record) => record.best !== null).length,
    noRecommendationCases: records.filter((record) => record.best === null).length,
    records,
  };
  await writeFile(path.join(outputDir, "math-search-review.json"), JSON.stringify(summary, null, 2), "utf8");
  await writeFile(
    path.join(outputDir, "math-search-review-full-manifest.json"),
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      totalCases: records.length,
      format: "One complete JSON and one gzip-compressed JSON file per case; no pass data is omitted.",
      cases: records.map((record) => ({
        id: record.id,
        json: `cases/${record.id}.json`,
        gzip: `cases/${record.id}.json.gz`,
        passCount: record.passCount,
        durationMs: record.durationMs,
      })),
    }, null, 2),
    "utf8",
  );
  const csvEscape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csvRows = [
    ["id", "description", "state", "durationMs", "passCount", "failedPassCount", "statusCounts", "recommendation", "bestTrainCount", "bestAxleLinesPerTrain", "bestTotalAxleLines", "bestPitchM", "bestFormationMode", "bestRating", "bestStatus", "cargoOnlyPass", "combinedCogRequired", "combinedCogPassOnly", "keyEvents"],
    ...records.map((record) => {
      const arrangement = (record.best?.arrangement ?? {}) as Record<string, unknown>;
      return [record.id, record.description, record.state, record.durationMs, record.passCount, record.failedPassCount, JSON.stringify(record.statusCounts), record.recommendation, arrangement.trainCount ?? "", arrangement.axleLinesPerTrain ?? "", arrangement.totalAxleLines ?? "", arrangement.pitchM ?? "", arrangement.formationMode ?? "", record.best?.rating ?? "", record.best?.resultStatus ?? "", record.best?.cargoOnlyPass ?? "", record.best?.combinedCogRequired ?? "", record.best?.combinedCogPassOnly ?? "", JSON.stringify(record.keyEvents)];
    }),
  ];
  await writeFile(path.join(outputDir, "math-search-review.csv"), csvRows.map((row) => row.map(csvEscape).join(",")).join("\n"), "utf8");
  console.log(`\nWrote ${records.length} case records to ${outputDir}`);
}

void main();
