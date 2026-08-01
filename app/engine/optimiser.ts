import { applySharedAxleLines, applySharedPins, applySharedSplit, applySharedX, calculateProject } from "./core";
import { applyArrangementDescriptor } from "./arrangement";
import type {
  ActivityEvent,
  CalculationResult,
  OptimiserRun,
  OptimiserWeights,
  PassResult,
  ProgressState,
  ProjectModel,
  RunPhase,
  WeightPreset,
} from "./types";

export interface OptimiserCallbacks {
  onUpdate?: (run: OptimiserRun, detailIncluded: boolean) => void;
  signal?: AbortSignal;
  /** Internal arrangement-search mode. Full grid search remains the default. */
  boundedConvergence?: boolean;
  /** Solves the stability-feasible X interval before exact case evaluation. */
  mathematicalConvergence?: boolean;
  /** Stops after feasibility is established; the winning formation is fully searched later. */
  feasibilityOnly?: boolean;
}

interface PlannedCase {
  c89: number;
  d138: number;
  e89: number;
  phase: RunPhase;
  parent?: string;
  pins?: number[];
  cachedResult?: CalculationResult;
}

const LOWER_METRICS: Array<keyof OptimiserWeights> = [
  "basicUtil",
  "slopeUtil",
  "dynamicUtil",
  "spineUtil",
  "shearUtil",
  "bendingUtil",
  "deflection",
  "localBendingUtil",
  "axleLinesUsed",
];

const HIGHER_METRICS: Array<keyof OptimiserWeights> = [
  "basicAngle",
  "slopeAngle",
  "dynamicAngle",
  "dynamicRatio",
];

const METRICS: Array<keyof OptimiserWeights> = [
  "basicUtil",
  "slopeUtil",
  "dynamicUtil",
  "spineUtil",
  "basicAngle",
  "slopeAngle",
  "dynamicAngle",
  "dynamicRatio",
  "shearUtil",
  "bendingUtil",
  "deflection",
  "localBendingUtil",
  "axleLinesUsed",
];

function cloneModel(model: ProjectModel): ProjectModel {
  return JSON.parse(JSON.stringify(model)) as ProjectModel;
}

function round(value: number, digits = 8): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function range(start: number, end: number, step: number): number[] {
  const safeStep = Math.abs(step) > 1e-12 ? Math.abs(step) : 1;
  const low = Math.min(start, end);
  const high = Math.max(start, end);
  const values: number[] = [];
  for (let value = low; value <= high + safeStep * 1e-8; value += safeStep) values.push(round(value));
  return start <= end ? values : values.reverse();
}

export function weightsForPreset(
  preset: WeightPreset,
  custom: OptimiserWeights,
  detailedWeighting: boolean,
  f506Policy: "KEEP" | "REPLACE",
): OptimiserWeights {
  if (preset === "CUSTOM") return { ...custom };
  const weights: OptimiserWeights = {
    basicUtil: 1,
    slopeUtil: 1,
    dynamicUtil: 1,
    spineUtil: 1,
    basicAngle: 1,
    slopeAngle: 1,
    dynamicAngle: 1,
    dynamicRatio: 1,
    shearUtil: 1,
    bendingUtil: 1,
    deflection: 1,
    localBendingUtil: 1,
    axleLinesUsed: 0.5,
  };
  switch (preset) {
    case "UTILISATION_PRIORITY":
      weights.basicUtil = weights.slopeUtil = weights.dynamicUtil = weights.spineUtil = 3;
      break;
    case "STABILITY_PRIORITY":
      weights.basicAngle = weights.slopeAngle = weights.dynamicAngle = weights.dynamicRatio = 3;
      break;
    case "STATIC_PRIORITY":
      weights.basicUtil = weights.slopeUtil = weights.basicAngle = weights.slopeAngle = 3;
      break;
    case "DYNAMIC_PRIORITY":
      weights.dynamicUtil = 4;
      weights.dynamicAngle = 4;
      weights.dynamicRatio = 3;
      break;
    case "SPINE_BEAM_PRIORITY":
      weights.spineUtil = 5;
      weights.shearUtil = 2;
      weights.bendingUtil = 3;
      weights.deflection = 2;
      weights.localBendingUtil = 3;
      break;
    case "STRUCTURAL_BALANCED":
      weights.bendingUtil = 2;
      weights.localBendingUtil = 2;
      break;
    case "LOCAL_DEFLECTION_PRIORITY":
      weights.shearUtil = 1;
      weights.bendingUtil = 2;
      weights.deflection = 5;
      weights.localBendingUtil = 2;
      break;
    case "LOCAL_BENDING_PRIORITY":
      weights.shearUtil = 1;
      weights.bendingUtil = 3;
      weights.deflection = 1;
      weights.localBendingUtil = 5;
      break;
    default:
      break;
  }
  if (!detailedWeighting) {
    weights.shearUtil = 0;
    weights.bendingUtil = 0;
    weights.deflection = 0;
    weights.localBendingUtil = 0;
  } else if (f506Policy === "REPLACE") {
    weights.spineUtil = 0;
  }
  return weights;
}

function metricValue(pass: PassResult, key: keyof OptimiserWeights): number | null {
  const item = pass.result.metrics[key];
  return item?.active && typeof item.value === "number" && Number.isFinite(item.value) ? item.value : null;
}

function pairwiseContribution(
  current: PassResult,
  passes: PassResult[],
  key: keyof OptimiserWeights,
  lowerIsBetter: boolean,
): number | null {
  const value = metricValue(current, key);
  if (value === null) return null;
  const comparable = passes.filter((pass) => metricValue(pass, key) !== null);
  if (comparable.length <= 1) return 0;
  const better = comparable.filter((pass) => {
    const other = metricValue(pass, key);
    if (other === null) return false;
    return lowerIsBetter ? other < value : other > value;
  }).length;
  return better / (comparable.length - 1);
}

function weightedRank(
  current: PassResult,
  passes: PassResult[],
  weights: OptimiserWeights,
  keys: Array<keyof OptimiserWeights>,
): number | null {
  let numerator = 0;
  let denominator = 0;
  for (const key of keys) {
    const weight = weights[key];
    if (!(weight > 0)) continue;
    const contribution = pairwiseContribution(current, passes, key, LOWER_METRICS.includes(key));
    if (contribution === null) continue;
    numerator += contribution * weight;
    denominator += weight;
  }
  return denominator > 0 ? numerator / denominator : null;
}

export function rankPasses(passes: PassResult[], model: ProjectModel): PassResult[] {
  const valid = passes.filter((pass) => pass.result.status === "PASS");
  const weights = weightsForPreset(
    model.optimiser.weightPreset,
    model.optimiser.weights,
    model.optimiser.detailedWeighting,
    model.optimiser.f506Policy,
  );
  for (const pass of passes) {
    if (pass.result.status !== "PASS") {
      pass.lowerRank = null;
      pass.higherRank = null;
      pass.rating = null;
      pass.overallRank = null;
      continue;
    }
    pass.lowerRank = weightedRank(pass, valid, weights, LOWER_METRICS);
    pass.higherRank = weightedRank(pass, valid, weights, HIGHER_METRICS);
    pass.rating = weightedRank(pass, valid, weights, METRICS);
  }
  const ordered = valid
    .filter((pass) => pass.rating !== null)
    .sort((a, b) => (a.rating ?? Infinity) - (b.rating ?? Infinity) || a.sequence - b.sequence);
  ordered.forEach((pass, index) => {
    pass.overallRank = index + 1;
  });
  return passes;
}

function initialProgress(): ProgressState {
  return {
    runState: "IDLE",
    phase: "PLANNING",
    overallCompleted: 0,
    overallPlanned: 1,
    phaseCompleted: 0,
    phasePlanned: 1,
    overallPercent: 0,
    phasePercent: 0,
    elapsedMs: 0,
    currentEtaMs: null,
    overallEtaMs: null,
    estimatedFinish: null,
    reference: "Ready",
  };
}

export function createEmptyRun(): OptimiserRun {
  return {
    runReference: "",
    state: "IDLE",
    progress: initialProgress(),
    passes: [],
    events: [],
    bestPassId: null,
    startedAt: null,
    finishedAt: null,
  };
}

function runReference(): string {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    "-",
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
    "-",
    String(now.getMilliseconds()).padStart(3, "0"),
  ].join("");
  return `TS-${stamp}`;
}

class ProgressTracker {
  private start = performance.now();
  private phaseStart = this.start;
  private lastUnit = this.start;
  private phaseSamples = 0;
  private phaseEwma = 0;
  private displayedPercent = 0;

  constructor(
    private run: OptimiserRun,
    overallPlanned: number,
  ) {
    run.progress = { ...initialProgress(), runState: "RUNNING", overallPlanned: Math.max(1, overallPlanned) };
  }

  setPhase(phase: RunPhase, planned: number, reference: string): void {
    this.run.progress.phase = phase;
    this.run.progress.phaseCompleted = 0;
    this.run.progress.phasePlanned = Math.max(1, planned);
    this.run.progress.reference = reference;
    this.phaseStart = performance.now();
    this.lastUnit = this.phaseStart;
    this.phaseSamples = 0;
    this.phaseEwma = 0;
    this.refresh();
  }

  adjustOverallPlanned(delta: number): void {
    this.run.progress.overallPlanned = Math.max(
      this.run.progress.overallCompleted + 1,
      this.run.progress.overallPlanned + delta,
    );
    this.refresh();
  }

  advance(reference: string, units = 1): void {
    const now = performance.now();
    const sample = (now - this.lastUnit) / Math.max(1, units);
    this.lastUnit = now;
    this.phaseEwma = this.phaseSamples === 0 ? sample : 0.25 * sample + 0.75 * this.phaseEwma;
    this.phaseSamples += units;
    this.run.progress.phaseCompleted = Math.min(
      this.run.progress.phasePlanned,
      this.run.progress.phaseCompleted + units,
    );
    this.run.progress.overallCompleted = Math.min(
      this.run.progress.overallPlanned,
      this.run.progress.overallCompleted + units,
    );
    this.run.progress.reference = reference;
    this.refresh();
  }

  complete(): void {
    this.run.progress.overallCompleted = this.run.progress.overallPlanned;
    this.run.progress.phaseCompleted = this.run.progress.phasePlanned;
    this.displayedPercent = 100;
    this.refresh(true);
  }

  stop(state: "STOPPED" | "FAILED"): void {
    this.run.progress.runState = state;
    this.run.progress.currentEtaMs = null;
    this.run.progress.overallEtaMs = null;
    this.run.progress.estimatedFinish = null;
    this.refresh();
  }

  private refresh(forceComplete = false): void {
    const now = performance.now();
    const raw = (100 * this.run.progress.overallCompleted) / this.run.progress.overallPlanned;
    const capped = forceComplete ? 100 : Math.min(99, raw);
    this.displayedPercent = Math.max(this.displayedPercent, capped);
    this.run.progress.overallPercent = this.displayedPercent;
    this.run.progress.phasePercent =
      (100 * this.run.progress.phaseCompleted) / Math.max(1, this.run.progress.phasePlanned);
    this.run.progress.elapsedMs = now - this.start;
    if (this.phaseSamples >= 3) {
      const phaseRemaining = this.run.progress.phasePlanned - this.run.progress.phaseCompleted;
      const overallRemaining = this.run.progress.overallPlanned - this.run.progress.overallCompleted;
      this.run.progress.currentEtaMs = phaseRemaining * this.phaseEwma;
      this.run.progress.overallEtaMs = overallRemaining * this.phaseEwma;
      this.run.progress.estimatedFinish = new Date(Date.now() + this.run.progress.overallEtaMs).toISOString();
    } else {
      this.run.progress.currentEtaMs = null;
      this.run.progress.overallEtaMs = null;
      this.run.progress.estimatedFinish = null;
    }
  }
}

function triangleFractions(point: { x: number; y: number }, polygon: Array<{ x: number; y: number }>): number[] {
  if (polygon.length !== 3) return [];
  const [a, b, c] = polygon;
  const denominator = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
  if (Math.abs(denominator) < 1e-12) return [];
  const first = ((b.y - c.y) * (point.x - c.x) + (c.x - b.x) * (point.y - c.y)) / denominator;
  const second = ((c.y - a.y) * (point.x - c.x) + (a.x - c.x) * (point.y - c.y)) / denominator;
  return [first, second, 1 - first - second];
}

function boundedProbeValues(
  values: number[],
  preferred: number,
  maximum = 7,
): number[] {
  if (values.length <= maximum) return values;
  const nearestIndex = values.reduce(
    (best, value, index) =>
      Math.abs(value - preferred) < Math.abs(values[best] - preferred) ? index : best,
    0,
  );
  const indexes = [
    nearestIndex,
    values.length - 1,
    0,
    Math.round((values.length - 1) / 2),
    Math.round((values.length - 1) / 4),
    Math.round(((values.length - 1) * 3) / 4),
    nearestIndex - 1,
    nearestIndex + 1,
  ];
  const selected = new Set<number>();
  for (const index of indexes) {
    if (index >= 0 && index < values.length) selected.add(values[index]);
    if (selected.size >= maximum) break;
  }
  return [...selected];
}

function automaticE89Cases(
  model: ProjectModel,
  c89: number,
  d138: number,
  boundedConvergence = false,
): PlannedCase[] {
  const probe0: PlannedCase = { c89, d138, e89: 0, phase: "COARSE_SCAN" };
  const probe1: PlannedCase = { c89, d138, e89: 1, phase: "COARSE_SCAN" };
  const result0 = calculateProject(caseModel(model, probe0));
  const result1 = calculateProject(caseModel(model, probe1));
  const fractions0 = triangleFractions(result0.combinedCog, result0.stabilityPolygon);
  const fractions1 = triangleFractions(result1.combinedCog, result1.stabilityPolygon);
  if (fractions0.length !== 3 || fractions1.length !== 3) return [];
  let minimum = Number.NEGATIVE_INFINITY;
  let maximum = Number.POSITIVE_INFINITY;
  for (let index = 0; index < 3; index += 1) {
    const intercept = fractions0[index];
    const slope = fractions1[index] - intercept;
    if (Math.abs(slope) < 1e-12) {
      if (intercept < 0) return [];
      continue;
    }
    const boundary = -intercept / slope;
    if (slope > 0) minimum = Math.max(minimum, boundary);
    else maximum = Math.min(maximum, boundary);
  }
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum > maximum) return [];
  minimum -= Math.max(0, model.optimiser.boundaryToleranceM);
  maximum += Math.max(0, model.optimiser.boundaryToleranceM);
  const completeValues = range(minimum, maximum, model.optimiser.e89Step);
  const values = boundedConvergence
    ? boundedProbeValues(completeValues, (minimum + maximum) / 2)
    : completeValues;
  return values.map((e89) => ({
    c89,
    d138,
    e89,
    phase: "COARSE_SCAN",
    cachedResult:
      Math.abs(e89) < 1e-10
        ? result0
        : Math.abs(e89 - 1) < 1e-10
          ? result1
          : undefined,
  }));
}

export interface StabilityXInterval {
  minimumM: number;
  maximumM: number;
}

function stabilityConstraintPoints(result: CalculationResult): Array<{ x: number; y: number }> {
  return [
    result.combinedCog,
    ...result.casePoints.basic,
    ...result.casePoints.slope,
    ...result.casePoints.dynamic,
  ];
}

/**
 * Intersects every triangular barycentric inequality at X=0 and X=1. For a
 * fixed axle/split geometry these coordinates are affine in shared trailer X,
 * so the result is the complete stability-feasible longitudinal interval.
 */
export function deriveStabilityXInterval(
  result0: CalculationResult,
  result1: CalculationResult,
): StabilityXInterval | null {
  if (result0.stabilityPolygon.length !== 3 || result1.stabilityPolygon.length !== 3) return null;
  const points0 = stabilityConstraintPoints(result0);
  const points1 = stabilityConstraintPoints(result1);
  if (points0.length !== points1.length) return null;
  let minimumM = Number.NEGATIVE_INFINITY;
  let maximumM = Number.POSITIVE_INFINITY;
  for (let pointIndex = 0; pointIndex < points0.length; pointIndex += 1) {
    const fractions0 = triangleFractions(points0[pointIndex], result0.stabilityPolygon);
    const fractions1 = triangleFractions(points1[pointIndex], result1.stabilityPolygon);
    if (fractions0.length !== 3 || fractions1.length !== 3) return null;
    for (let fractionIndex = 0; fractionIndex < 3; fractionIndex += 1) {
      const intercept = fractions0[fractionIndex];
      const slope = fractions1[fractionIndex] - intercept;
      if (Math.abs(slope) < 1e-12) {
        if (intercept < -1e-12) return null;
        continue;
      }
      const boundary = -intercept / slope;
      if (slope > 0) minimumM = Math.max(minimumM, boundary);
      else maximumM = Math.min(maximumM, boundary);
    }
  }
  if (!Number.isFinite(minimumM) || !Number.isFinite(maximumM) || minimumM > maximumM) return null;
  return { minimumM, maximumM };
}

function mathematicalE89Cases(
  model: ProjectModel,
  c89: number,
  d138: number,
): PlannedCase[] {
  const probe0: PlannedCase = { c89, d138, e89: 0, phase: "COARSE_SCAN" };
  const probe1: PlannedCase = { c89, d138, e89: 1, phase: "COARSE_SCAN" };
  const result0 = calculateProject(caseModel(model, probe0));
  const result1 = calculateProject(caseModel(model, probe1));
  const interval = deriveStabilityXInterval(result0, result1);
  if (!interval) return [];
  const tolerance = Math.max(0, model.optimiser.boundaryToleranceM);
  const minimum = interval.minimumM - tolerance;
  const maximum = interval.maximumM + tolerance;
  const midpoint = (minimum + maximum) / 2;
  const values = [
    midpoint,
    minimum,
    maximum,
    minimum + (maximum - minimum) / 4,
    minimum + (3 * (maximum - minimum)) / 4,
  ];
  return [...new Set(values.map((value) => round(value, 9)))].map((e89) => ({
    c89,
    d138,
    e89,
    phase: "COARSE_SCAN",
    cachedResult:
      Math.abs(e89) < 1e-10
        ? result0
        : Math.abs(e89 - 1) < 1e-10
          ? result1
          : undefined,
  }));
}

type CoarsePlanningMode = "FULL" | "BOUNDED" | "MATHEMATICAL";

function planCoarseCases(model: ProjectModel, mode: CoarsePlanningMode = "FULL"): PlannedCase[] {
  const settings = model.optimiser;
  const cases: PlannedCase[] = [];
  for (const c89 of range(settings.c89Start, settings.c89Maximum, settings.c89Step).map(Math.round)) {
    const maximumD = Math.max(
      settings.d138Start,
      settings.overrideD138Limit
        ? c89 - 1
        : Math.min(c89 - 1, Math.floor(c89 * settings.d138MaximumFraction)),
    );
    const completeSplits = range(settings.d138Start, maximumD, settings.d138Step).map(Math.round);
    const splitValues = mode !== "FULL"
      ? boundedProbeValues(
          completeSplits,
          Math.max(settings.d138Start, Math.round(c89 / 3)),
          mode === "MATHEMATICAL" ? 5 : 7,
        )
      : completeSplits;
    for (const d138 of splitValues) {
      if (d138 < 1 || d138 >= c89) continue;
      if (settings.e89RangeMode === "MANUAL") {
        const completeValues = range(settings.e89Minimum, settings.e89Maximum, settings.e89Step);
        const e89Values = mode !== "FULL"
          ? boundedProbeValues(
              completeValues,
              (settings.e89Minimum + settings.e89Maximum) / 2,
              mode === "MATHEMATICAL" ? 5 : 7,
            )
          : completeValues;
        for (const e89 of e89Values) {
          cases.push({ c89, d138, e89, phase: "COARSE_SCAN" });
        }
      } else {
        cases.push(...(
          mode === "MATHEMATICAL"
            ? mathematicalE89Cases(model, c89, d138)
            : automaticE89Cases(model, c89, d138, mode === "BOUNDED")
        ));
      }
    }
  }
  return cases;
}

function event(
  run: OptimiserRun,
  started: number,
  phase: RunPhase | "SYSTEM",
  caseReference: string,
  stage: string,
  message: string,
  detail: string,
  level: ActivityEvent["level"],
): void {
  run.events.unshift({
    id: run.events.length + 1,
    timestamp: new Date().toISOString(),
    elapsedMs: performance.now() - started,
    phase,
    caseReference,
    stage,
    message,
    detail,
    level,
    progress: run.progress.overallPercent,
  });
}

function caseModel(base: ProjectModel, planned: PlannedCase): ProjectModel {
  let model = applySharedAxleLines(cloneModel(base), planned.c89);
  model = applySharedSplit(model, planned.d138);
  model = applySharedX(model, planned.e89);
  if (planned.pins) model = applySharedPins(model, planned.pins);
  else if (base.optimiser.existingPinsPolicy === "REARRANGE") model = applySharedPins(model, []);
  return model;
}

function makePass(
  run: OptimiserRun,
  planned: PlannedCase,
  result: CalculationResult,
  durationMs: number,
  calculationMode: ProjectModel["optimiser"]["calculationMode"],
): PassResult {
  const sequence = run.passes.length + 1;
  return {
    id: `${run.runReference}-P${String(sequence).padStart(5, "0")}`,
    runReference: run.runReference,
    caseReference: `${run.runReference}-C${String(sequence).padStart(5, "0")}`,
    phase: planned.phase,
    sequence,
    c89: planned.c89,
    d138: planned.d138,
    e89: planned.e89,
    pinnedAxleLines: [...(planned.pins ?? [])],
    result,
    lowerRank: null,
    higherRank: null,
    rating: null,
    overallRank: null,
    startedAt: new Date(Date.now() - durationMs).toISOString(),
    durationMs,
    progressPercent: run.progress.overallPercent,
    completedWork: Math.min(run.progress.overallPlanned, run.progress.overallCompleted + 1),
    plannedWork: run.progress.overallPlanned,
    elapsedMs: run.progress.elapsedMs,
    calculationMode,
  };
}

async function yieldToBrowser(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function candidatePinLines(model: ProjectModel, pass: PassResult): number[] {
  const definition = model.catalogue.find(
    (item) => item.id === model.trailers[Math.max(0, model.analysedTrailer - 1)]?.definitionId,
  );
  const spacing = definition?.axleSpacingM ?? 1.4;
  const resolved = pass.result.resolvedTrailers.find(
    (item) => item.index === Math.max(0, model.analysedTrailer - 1),
  ) ?? pass.result.resolvedTrailers[0];
  const start = resolved?.startXM ?? pass.e89;
  const targetLocations = [
    model.optimiser.localStructuralTargetMode === "MANUAL_X"
      ? model.optimiser.manualLocalTargetXM ?? pass.result.beam.deflectionPeakXM
      : pass.result.beam.deflectionPeakXM,
    pass.result.beam.bendingMinXM,
    pass.result.beam.bendingMaxXM,
  ];
  const targetLines = targetLocations.map((position) =>
    clampInteger(Math.round((position - start) / spacing + 0.5), 1, pass.c89),
  );
  targetLines.push(
    clampInteger(pass.d138, 1, pass.c89),
    clampInteger(pass.d138 + 1, 1, pass.c89),
    1,
    pass.c89,
  );
  const lines: number[] = [];
  for (let offset = 0; offset <= pass.c89; offset += 1) {
    for (const centre of targetLines) {
      for (const value of [centre - offset, centre + offset]) {
        if (value >= 1 && value <= pass.c89 && !lines.includes(value)) lines.push(value);
      }
    }
  }
  return lines;
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Math.round(value)));
}

function axleUtilisationAllowed(model: ProjectModel, result: CalculationResult): boolean {
  if (model.optimiser.maximumAxleUtilisation === "AUTO") return true;
  const maximum = Math.max(
    result.metrics.basicUtil.value ?? Number.POSITIVE_INFINITY,
    result.metrics.slopeUtil.value ?? Number.POSITIVE_INFINITY,
    result.metrics.dynamicUtil.value ?? Number.POSITIVE_INFINITY,
  );
  return maximum <= model.optimiser.maximumAxleUtilisation + 1e-12;
}

export async function runOptimiser(model: ProjectModel, callbacks: OptimiserCallbacks = {}): Promise<OptimiserRun> {
  const run = createEmptyRun();
  const started = performance.now();
  run.runReference = runReference();
  run.state = "PLANNING";
  run.startedAt = new Date().toISOString();
  const planningMode: CoarsePlanningMode = callbacks.mathematicalConvergence
    ? "MATHEMATICAL"
    : callbacks.boundedConvergence
      ? "BOUNDED"
      : "FULL";
  const coarseCases = planCoarseCases(model, planningMode);
  const pinUpper =
    model.optimiser.pinSearchMode === "OFF"
      ? 0
      : Math.min(model.optimiser.pinCaseBudget, Math.max(1, model.optimiser.maximumPins * 2));
  const refinementUpper = Math.max(
    3,
    Math.ceil(
      (2 * Math.max(0.01, model.optimiser.e89Step)) /
        Math.max(0.001, model.optimiser.fineE89Step),
    ) + 1,
  );
  const tracker = new ProgressTracker(run, Math.max(1, coarseCases.length + pinUpper + refinementUpper + 2));
  tracker.setPhase("PLANNING", 1, "Enumerating axle-line, split and trailer-X cases");
  event(
    run,
    started,
    "PLANNING",
    "",
    "Plan",
    "Run plan created",
    `${coarseCases.length} ${planningMode === "MATHEMATICAL" ? "mathematically bounded" : planningMode === "BOUNDED" ? "bounded-probe" : "coarse"} cases; pin upper bound ${pinUpper}; refinement upper bound ${refinementUpper}.`,
    "INFO",
  );
  tracker.advance("Plan complete");
  run.state = "RUNNING";
  callbacks.onUpdate?.({ ...run }, true);
  let lastProgressUpdate = performance.now();
  let lastDetailedUpdate = lastProgressUpdate;
  const notify = async (force = false): Promise<void> => {
    const now = performance.now();
    const progressInterval = Math.max(0.1, model.optimiser.progressRefreshSeconds) * 1000;
    const detailInterval = Math.max(progressInterval, model.optimiser.liveRefreshSeconds * 1000);
    if (!force && now - lastProgressUpdate < progressInterval) return;
    const includeDetail = force || now - lastDetailedUpdate >= detailInterval;
    callbacks.onUpdate?.(
      includeDetail
        ? {
            ...run,
            passes: [...run.passes],
            events: [...run.events],
          }
        : {
            ...run,
            passes: [],
            events: [],
          },
      includeDetail,
    );
    lastProgressUpdate = now;
    if (includeDetail) lastDetailedUpdate = now;
    await yieldToBrowser();
  };

  const evaluate = async (planned: PlannedCase): Promise<PassResult> => {
    const caseStarted = performance.now();
    let result: CalculationResult;
    const evaluatedModel = caseModel(model, planned);
    try {
      result = planned.cachedResult ?? calculateProject(evaluatedModel);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      result = {
        ...calculateProject(cloneModel(model)),
        status: "ERROR",
        failClass: "UNHANDLED_CASE_ERROR",
        failDetail: detail,
      };
    }
    const actual = {
      ...planned,
      pins: [...(evaluatedModel.groupings[0]?.pinnedAxleLines ?? planned.pins ?? [])],
    };
    const pass = makePass(
      run,
      actual,
      result,
      performance.now() - caseStarted,
      model.optimiser.calculationMode,
    );
    run.passes.push(pass);
    const level: ActivityEvent["level"] =
      result.status === "PASS" ? "PASS" : result.status === "ERROR" ? "ERROR" : "WARN";
    event(
      run,
      started,
      planned.phase,
      pass.caseReference,
      "Result",
      result.status,
      `Axle lines=${pass.c89}; split after=${pass.d138}; trailer X=${pass.e89}; supports=${result.activeSupportCount}; ${result.failDetail || "verified"}`,
      level,
    );
    return pass;
  };

  try {
    tracker.setPhase("COARSE_SCAN", Math.max(1, coarseCases.length), "Coarse case 1");
    for (let index = 0; index < coarseCases.length; index += 1) {
      if (callbacks.signal?.aborted) throw new DOMException("Stopped by user", "AbortError");
      const pass = await evaluate(coarseCases[index]);
      tracker.advance(pass.caseReference);
      if (index % 3 === 0 || pass.result.status === "PASS") {
        rankPasses(run.passes, model);
        const best = run.passes.find((item) => item.overallRank === 1);
        run.bestPassId = best?.id ?? null;
        await notify();
      }
      if (
        pass.result.status === "PASS" &&
        (model.optimiser.stopAtFirstPass || model.optimiser.afterFirstPass === "STOP")
      )
        break;
    }

    if (
      planningMode !== "FULL" &&
      !run.passes.some((pass) => pass.result.status === "PASS")
    ) {
      const tested = new Set(
        run.passes.map((pass) => `${pass.c89}|${pass.d138}|${pass.e89.toFixed(9)}|${pass.pinnedAxleLines.join(",")}`),
      );
      const fallbackCases = planCoarseCases(model, "FULL").filter(
        (planned) =>
          !tested.has(
            `${planned.c89}|${planned.d138}|${planned.e89.toFixed(9)}|${(planned.pins ?? []).join(",")}`,
          ),
      );
      if (fallbackCases.length) {
        tracker.adjustOverallPlanned(fallbackCases.length);
        tracker.setPhase(
          "COARSE_SCAN",
          Math.max(1, fallbackCases.length),
          "No reduced-search pass; exact grid fallback",
        );
        event(
          run,
          started,
          "COARSE_SCAN",
          "",
          "Fallback",
          "Reduced probes found no pass",
          `${fallbackCases.length} remaining exact cases were restored so the search cannot miss an isolated feasible region.`,
          "INFO",
        );
        for (const planned of fallbackCases) {
          if (callbacks.signal?.aborted) throw new DOMException("Stopped by user", "AbortError");
          const pass = await evaluate(planned);
          tracker.advance(pass.caseReference);
          if (pass.result.status === "PASS") {
            rankPasses(run.passes, model);
            await notify();
            break;
          }
          await notify();
        }
      }
    }

    rankPasses(run.passes, model);
    let best = run.passes.find((item) => item.overallRank === 1) ?? null;
    if (best && !callbacks.feasibilityOnly && model.optimiser.pinSearchMode !== "OFF" && pinUpper > 0) {
      const rankedCandidates = run.passes
        .filter((item) => item.overallRank !== null)
        .sort((a, b) => (a.overallRank ?? Infinity) - (b.overallRank ?? Infinity));
      const finalists =
        model.optimiser.optimiserStrategy === "EXHAUSTIVE"
          ? rankedCandidates
          : rankedCandidates.slice(
              0,
              model.optimiser.pinSearchMode === "THOROUGH"
                ? Math.max(1, Math.round(model.optimiser.thoroughFinalistCount))
                : 1,
            );
      const budgetEach =
        model.optimiser.optimiserStrategy === "EXHAUSTIVE"
          ? Math.max(...finalists.map((item) => item.c89), 1)
          : Math.max(1, Math.floor(model.optimiser.pinCaseBudget / Math.max(1, finalists.length)));
      const plannedPins = finalists.reduce(
        (sum, finalist) => sum + Math.min(budgetEach, candidatePinLines(model, finalist).length),
        0,
      );
      tracker.adjustOverallPlanned(plannedPins - pinUpper);
      tracker.setPhase("PIN_SEARCH", Math.max(1, plannedPins), `${best.caseReference}: candidate pin`);
      for (const finalist of finalists) {
        const pinLines = candidatePinLines(model, finalist).slice(0, budgetEach);
        let currentPins = [...finalist.pinnedAxleLines];
        let bestDeflection = finalist.result.beam.absoluteDeflectionMm;
        for (const line of pinLines) {
          if (callbacks.signal?.aborted) throw new DOMException("Stopped by user", "AbortError");
          if (currentPins.includes(line) || currentPins.length >= model.optimiser.maximumPins) {
            tracker.advance(`Skipped AL ${line}`);
            continue;
          }
          const candidate = await evaluate({
            c89: finalist.c89,
            d138: finalist.d138,
            e89: finalist.e89,
            pins: [...currentPins, line],
            phase: "PIN_SEARCH",
            parent: finalist.caseReference,
          });
          const candidateDeflection = candidate.result.beam.absoluteDeflectionMm;
          const improved =
            bestDeflection - candidateDeflection + model.optimiser.deflectionToleranceMm >=
            model.optimiser.minimumDeflectionImprovementMm;
          if (candidate.result.status === "PASS" && axleUtilisationAllowed(model, candidate.result) && improved) {
            currentPins = [...candidate.pinnedAxleLines];
            bestDeflection = candidateDeflection;
            event(
              run,
              started,
              "PIN_SEARCH",
              candidate.caseReference,
              "Best",
              "Improved pin state",
              `Pinned AL ${currentPins.join(", ")}; deflection ${bestDeflection.toFixed(3)} mm.`,
              "BEST",
            );
            if (model.optimiser.pinStopRule === "FIRST_IMPROVEMENT") {
              tracker.advance(`${candidate.caseReference}: AL ${line}`);
              break;
            }
          }
          tracker.advance(`${candidate.caseReference}: AL ${line}`);
          await notify();
        }
      }
    }

    rankPasses(run.passes, model);
    best = run.passes.find((item) => item.overallRank === 1) ?? null;
    if (best && !callbacks.feasibilityOnly) {
      const ranked = run.passes
        .filter((item) => item.overallRank !== null)
        .sort((a, b) => (a.overallRank ?? Infinity) - (b.overallRank ?? Infinity));
      const selectedA =
        ranked.find(
          (item) =>
            item.id === model.optimiser.fineFirstPassReference ||
            item.caseReference === model.optimiser.fineFirstPassReference,
        ) ?? ranked[0];
      const selectedB =
        ranked.find(
          (item) =>
            item.id === model.optimiser.fineSecondPassReference ||
            item.caseReference === model.optimiser.fineSecondPassReference,
        ) ?? ranked[1] ?? ranked[0];
      const fineBase =
        (selectedA?.overallRank ?? Infinity) <= (selectedB?.overallRank ?? Infinity)
          ? selectedA
          : selectedB;
      const fineStep = Math.max(0.001, model.optimiser.fineE89Step);
      const samePosition = Math.abs((selectedA?.e89 ?? best.e89) - (selectedB?.e89 ?? best.e89)) < 1e-10;
      const values = samePosition
        ? range(best.e89 - model.optimiser.e89Step, best.e89 + model.optimiser.e89Step, fineStep)
        : range(selectedA.e89, selectedB.e89, fineStep);
      const reoptimisePins =
        model.optimiser.fineE89PinMode === "REOPTIMISE_EACH_CASE" &&
        model.optimiser.pinSearchMode !== "OFF"
          ? Math.min(
              model.optimiser.pinCaseBudget,
              Math.max(1, model.optimiser.maximumPins * 2),
            )
          : 0;
      const refinementPlan = Math.max(1, values.length * (1 + reoptimisePins));
      tracker.adjustOverallPlanned(refinementPlan - refinementUpper);
      tracker.setPhase("REFINEMENT", refinementPlan, `${fineBase.caseReference}: fine trailer-X search`);
      for (const e89 of values) {
        if (callbacks.signal?.aborted) throw new DOMException("Stopped by user", "AbortError");
        if (run.passes.some((item) =>
          item.c89 === fineBase.c89 &&
          item.d138 === fineBase.d138 &&
          Math.abs(item.e89 - e89) < 1e-10 &&
          item.pinnedAxleLines.join(",") === fineBase.pinnedAxleLines.join(",")
        )) {
          tracker.advance("Existing best trailer-X case");
          continue;
        }
        const pass = await evaluate({
          c89: fineBase.c89,
          d138: fineBase.d138,
          e89,
          pins: fineBase.pinnedAxleLines,
          phase: "REFINEMENT",
          parent: fineBase.caseReference,
        });
        tracker.advance(pass.caseReference);
        if (reoptimisePins > 0) {
          let currentPins = [...pass.pinnedAxleLines];
          let bestDeflection = pass.result.beam.absoluteDeflectionMm;
          const pinLines = candidatePinLines(model, pass).slice(0, reoptimisePins);
          for (const line of pinLines) {
            if (callbacks.signal?.aborted) throw new DOMException("Stopped by user", "AbortError");
            if (currentPins.includes(line) || currentPins.length >= model.optimiser.maximumPins) {
              tracker.advance(`Fine trailer X ${e89}: skipped AL ${line}`);
              continue;
            }
            const pinPass = await evaluate({
              c89: fineBase.c89,
              d138: fineBase.d138,
              e89,
              pins: [...currentPins, line],
              phase: "REFINEMENT",
              parent: pass.caseReference,
            });
            const candidateDeflection = pinPass.result.beam.absoluteDeflectionMm;
            const improved =
              bestDeflection - candidateDeflection + model.optimiser.deflectionToleranceMm >=
              model.optimiser.minimumDeflectionImprovementMm;
            if (pinPass.result.status === "PASS" && axleUtilisationAllowed(model, pinPass.result) && improved) {
              currentPins = [...pinPass.pinnedAxleLines];
              bestDeflection = candidateDeflection;
              event(
                run,
                started,
                "REFINEMENT",
                pinPass.caseReference,
                "Best",
                "Improved fine trailer-X pin state",
                `Trailer X=${e89}; pinned AL ${currentPins.join(", ")}; deflection ${bestDeflection.toFixed(3)} mm.`,
                "BEST",
              );
              if (model.optimiser.pinStopRule === "FIRST_IMPROVEMENT") {
                tracker.advance(`${pinPass.caseReference}: AL ${line}`);
                break;
              }
            }
            tracker.advance(`${pinPass.caseReference}: AL ${line}`);
            await notify();
          }
        }
        await notify();
      }
    }

    tracker.setPhase("FINALISING", 1, "Ranking and reapplying best verified pass");
    rankPasses(run.passes, model);
    best = run.passes.find((item) => item.overallRank === 1) ?? null;
    run.bestPassId = best?.id ?? null;
    tracker.advance(best ? `Best ${best.id}` : "No verified pass");
    event(
      run,
      started,
      "FINALISING",
      best?.caseReference ?? "",
      "Finish",
      best ? "Best pass verified" : "No valid pass",
      best ? `${best.id}; rating ${(best.rating ?? 0).toFixed(4)}.` : "The run completed without a verified PASS.",
      best ? "BEST" : "WARN",
    );
    tracker.complete();
    run.state = "COMPLETE";
    run.progress.runState = "COMPLETE";
    run.finishedAt = new Date().toISOString();
  } catch (error) {
    const stopped = error instanceof DOMException && error.name === "AbortError";
    run.state = stopped ? "STOPPED" : "FAILED";
    tracker.stop(run.state);
    run.finishedAt = new Date().toISOString();
    event(
      run,
      started,
      "SYSTEM",
      "",
      stopped ? "Stop" : "Error",
      stopped ? "Run stopped" : "Run failed",
      stopped ? "The achieved progress and all completed cases were retained." : error instanceof Error ? error.message : String(error),
      stopped ? "WARN" : "ERROR",
    );
  }
  await notify(true);
  return run;
}

export function passToProject(base: ProjectModel, pass: PassResult): ProjectModel {
  let model = pass.arrangement
    ? applyArrangementDescriptor(cloneModel(base), pass.arrangement)
    : applySharedAxleLines(cloneModel(base), pass.c89);
  model = applySharedAxleLines(model, pass.c89);
  model = applySharedSplit(model, pass.d138);
  model = applySharedX(model, pass.e89);
  return applySharedPins(model, pass.pinnedAxleLines);
}

export function exportPassesCsv(passes: PassResult[]): string {
  const supportHeaders = Array.from({ length: 10 }, (_, index) => [
    `Support ${index + 1} Active`,
    `Support ${index + 1} Reaction t`,
    `Support ${index + 1} Disable Reason`,
  ]).flat();
  const groupHeaders = Array.from({ length: 3 }, (_, index) => [
    `Group ${index + 1} X m`,
    `Group ${index + 1} Y m`,
    `Group ${index + 1} Load t`,
    `Group ${index + 1} Reaction Fraction`,
    `Group ${index + 1} Axle Count`,
  ]).flat();
  const headers = [
    "Pass Ref",
    "Case Ref",
    "Phase",
    "Status",
    "Arrangement Trains",
    "Arrangement AL / Train",
    "Arrangement Total AL",
    "4 AL Modules / Train",
    "5 AL Modules / Train",
    "6 AL Modules / Train",
    "Train Pitch m",
    "Formation Clearance m",
    "Formation Width m",
    "Axle Lines",
    "Split After",
    "Trailer X Position",
    "Pinned Axle Lines",
    "Active Supports",
    "Basic Utilisation",
    "Slope Utilisation",
    "Dynamic Utilisation",
    "Spine Utilisation",
    "Basic Angle",
    "Slope Angle",
    "Dynamic Angle",
    "Dynamic Static Ratio",
    "Shear Utilisation",
    "Bending Utilisation",
    "Deflection mm",
    "Local Bending Utilisation",
    "Axle Lines Used",
    "Basic Utilisation Status",
    "Slope Utilisation Status",
    "Dynamic Utilisation Status",
    "Spine Utilisation Status",
    "Basic Angle Status",
    "Slope Angle Status",
    "Dynamic Angle Status",
    "Dynamic Static Ratio Status",
    "Shear Status",
    "Bending Status",
    "Deflection Status",
    "Local Bending Status",
    "Total Mass t",
    "Combined COG X m",
    "Combined COG Y m",
    "Combined COG Z m",
    "Load COG X m",
    "Load COG Y m",
    "Load COG Z m",
    "Support Iterations",
    "Minimum Active Supports",
    ...supportHeaders,
    ...groupHeaders,
    "Shear Minimum kN",
    "Shear Minimum X m",
    "Shear Maximum kN",
    "Shear Maximum X m",
    "Bending Minimum kNm",
    "Bending Minimum X m",
    "Bending Maximum kNm",
    "Bending Maximum X m",
    "Deflection Down mm",
    "Deflection Down X m",
    "Deflection Up mm",
    "Deflection Up X m",
    "Absolute Deflection mm",
    "Deflection Peak X m",
    "Local Bending Absolute kNm",
    "Lower Rank",
    "Higher Rank",
    "Rating",
    "Overall Rank",
    "Calculation Mode",
    "Calculation ms",
    "Duration ms",
    "Progress %",
    "Completed Work",
    "Planned Work",
    "Elapsed ms",
    "Fail Class",
    "Fail Detail",
  ];
  const quote = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const rows = passes.map((pass) => {
    const metrics = pass.result.metrics;
    const supports = Array.from({ length: 10 }, (_, index) => {
      const support = pass.result.supports[index];
      return [support?.active ?? "", support?.reactionT ?? "", support?.disableReason ?? ""];
    }).flat();
    const groups = Array.from({ length: 3 }, (_, index) => {
      const group = pass.result.groups[index];
      return [
        group?.point.x ?? "",
        group?.point.y ?? "",
        group?.loadT ?? "",
        group?.reactionFraction ?? "",
        group?.axleCount ?? "",
      ];
    }).flat();
    const beam = pass.result.beam;
    return [
      pass.id,
      pass.caseReference,
      pass.phase,
      pass.result.status,
      pass.arrangement?.trainCount ?? "",
      pass.arrangement?.axleLinesPerTrain ?? "",
      pass.arrangement?.totalAxleLines ?? "",
      pass.arrangement?.modules4 ?? "",
      pass.arrangement?.modules5 ?? "",
      pass.arrangement?.modules6 ?? "",
      pass.arrangement?.pitchM ?? "",
      pass.arrangement?.clearanceM ?? "",
      pass.arrangement?.overallWidthM ?? "",
      pass.c89,
      pass.d138,
      pass.e89,
      pass.pinnedAxleLines.join(","),
      pass.result.activeSupportCount,
      metrics.basicUtil.value,
      metrics.slopeUtil.value,
      metrics.dynamicUtil.value,
      metrics.spineUtil.value,
      metrics.basicAngle.value,
      metrics.slopeAngle.value,
      metrics.dynamicAngle.value,
      metrics.dynamicRatio.value,
      metrics.shearUtil.value,
      metrics.bendingUtil.value,
      metrics.deflection.value,
      metrics.localBendingUtil.value,
      metrics.axleLinesUsed.value,
      metrics.basicUtil.status,
      metrics.slopeUtil.status,
      metrics.dynamicUtil.status,
      metrics.spineUtil.status,
      metrics.basicAngle.status,
      metrics.slopeAngle.status,
      metrics.dynamicAngle.status,
      metrics.dynamicRatio.status,
      metrics.shearUtil.status,
      metrics.bendingUtil.status,
      metrics.deflection.status,
      metrics.localBendingUtil.status,
      pass.result.totalMassT,
      pass.result.combinedCog.x,
      pass.result.combinedCog.y,
      pass.result.combinedCog.z,
      pass.result.loadCog.x,
      pass.result.loadCog.y,
      pass.result.loadCog.z,
      pass.result.supportIterations,
      pass.result.minimumActiveSupports,
      ...supports,
      ...groups,
      beam.shearMinKN,
      beam.shearMinXM,
      beam.shearMaxKN,
      beam.shearMaxXM,
      beam.bendingMinKNm,
      beam.bendingMinXM,
      beam.bendingMaxKNm,
      beam.bendingMaxXM,
      beam.deflectionDownMm,
      beam.deflectionDownXM,
      beam.deflectionUpMm,
      beam.deflectionUpXM,
      beam.absoluteDeflectionMm,
      beam.deflectionPeakXM,
      beam.localBendingAbsKNm,
      pass.lowerRank,
      pass.higherRank,
      pass.rating,
      pass.overallRank,
      pass.calculationMode,
      pass.result.calculationMs,
      pass.durationMs,
      pass.progressPercent,
      pass.completedWork,
      pass.plannedWork,
      pass.elapsedMs,
      pass.result.failClass,
      pass.result.failDetail,
    ].map(quote);
  });
  return [headers.map(quote).join(","), ...rows.map((row) => row.join(","))].join("\r\n");
}

export function exportAxlesCsv(passes: PassResult[]): string {
  const headers = [
    "Pass Ref",
    "Case Ref",
    "Sequence",
    "Load Basis",
    "Trailer",
    "Axle Line",
    "Hydraulic Group",
    "Pinned",
    "X m",
    "Y m",
    "Tare t",
    "Load t",
    "Capacity t",
    "Utilisation",
  ];
  const quote = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const rows: string[] = [];
  for (const pass of passes) {
    for (const [basis, axles] of [
      ["NEUTRAL", pass.result.axlePoints],
      [`SPINE_${pass.result.casePoints.spineLoadCase}`, pass.result.spineAxlePoints],
    ] as const) {
      for (const axle of axles) {
        rows.push(
          [
            pass.id,
            pass.caseReference,
            pass.sequence,
            basis,
            axle.trailerIndex + 1,
            axle.axleLine,
            axle.group,
            axle.pinned,
            axle.point.x,
            axle.point.y,
            axle.tareT,
            axle.loadT,
            axle.capacityT,
            axle.utilisation,
          ].map(quote).join(","),
        );
      }
    }
  }
  return [headers.map(quote).join(","), ...rows].join("\r\n");
}

export function exportBeamPointsCsv(passes: PassResult[]): string {
  const headers = [
    "Pass Ref",
    "Case Ref",
    "Sequence",
    "Point",
    "X m",
    "Shear kN",
    "Bending kNm",
    "Deflection mm",
  ];
  const quote = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const rows: string[] = [];
  for (const pass of passes) {
    pass.result.beam.points.forEach((point, index) => {
      rows.push(
        [
          pass.id,
          pass.caseReference,
          pass.sequence,
          index + 1,
          point.xM,
          point.shearKN,
          point.momentKNm,
          point.deflectionMm,
        ].map(quote).join(","),
      );
    });
  }
  return [headers.map(quote).join(","), ...rows].join("\r\n");
}

export function exportEventsCsv(events: ActivityEvent[]): string {
  const headers = ["Event", "Timestamp", "Elapsed ms", "Phase", "Case Ref", "Stage", "Message", "Detail", "Level", "Progress %"];
  const quote = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return [
    headers.map(quote).join(","),
    ...[...events].reverse().map((item) =>
      [
        item.id,
        item.timestamp,
        item.elapsedMs,
        item.phase,
        item.caseReference,
        item.stage,
        item.message,
        item.detail,
        item.level,
        item.progress,
      ]
        .map(quote)
        .join(","),
    ),
  ].join("\r\n");
}
