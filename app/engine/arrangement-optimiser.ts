import {
  applySharedPins,
  applySharedSplit,
  applySharedX,
  calculateProject,
  calculateStabilityProbe,
  engineeringLimitsFor,
} from "./core";
import {
  applyArrangementDescriptor,
  applyArrangementEnvironmentalActions,
  arrangementSummary,
  collectArrangementIssues,
  createArrangementDescriptor,
  effectiveMaximumFormationWidth,
  formationPitchBounds,
  minimumAxleLinesPerTrainForSupports,
  minimumTotalAxleLines,
  longitudinalOffsetCandidates,
  spacingCandidates,
  validAxleLineValues,
} from "./arrangement";
import { createEmptyRun, rankPasses, runOptimiser } from "./optimiser";
import type {
  ActivityEvent,
  ArrangementDescriptor,
  HydraulicSystemMode,
  OptimiserRun,
  PassResult,
  ProjectModel,
} from "./types";

const EPS = 1e-9;
export const MINIMUM_TRAIN_COUNT_COMPARISONS = 4;

/**
 * Keep automatic formation searching independent of the hydraulic system
 * presently displayed in the case. BOTH is the safe default: it evaluates the
 * valid 3-point triangle and 4-point polygon alternatives separately.
 */
export function arrangementHydraulicModes(model: ProjectModel): HydraulicSystemMode[] {
  switch (model.arrangementOptimiser.hydraulicSearchMode) {
    case "THREE_POINT": return ["THREE_POINT"];
    case "FOUR_POINT": return ["FOUR_POINT"];
    case "BOTH":
    default: return ["THREE_POINT", "FOUR_POINT"];
  }
}

function hydraulicModeLabel(mode: HydraulicSystemMode): string {
  return mode === "FOUR_POINT" ? "4-point" : "3-point";
}

export interface HydraulicYPitchBound {
  feasible: boolean;
  requiredSpanM: number;
  minimumPitchM: number;
  minimumAvailableSpanM: number;
  maximumAvailableSpanM: number;
}

function hydraulicGroupYSpan(result: ReturnType<typeof calculateProject>): number {
  if (result.groups.length < 3) return 0;
  const values = result.groups.map((group) => group.point.y);
  return Math.max(...values) - Math.min(...values);
}

/**
 * A necessary lateral-width bound. The full basic, slope and dynamic point
 * clouds already contain the COG envelope and force shifts. Each point also
 * needs enough horizontal reserve to achieve its configured minimum tipping
 * angle at the all-inclusive COG height.
 */
export function requiredHydraulicGroupYSpan(
  model: ProjectModel,
  result: ReturnType<typeof calculateProject>,
): number {
  const limits = engineeringLimitsFor(model.engineeringDegree);
  const heightM = Math.max(0, result.combinedCog.z);
  const requiredFor = (
    points: Array<{ y: number }>,
    minimumAngleDeg: number,
  ): number => {
    if (!points.length) return Number.POSITIVE_INFINITY;
    const values = points.map((point) => point.y);
    const pointCloudSpan = Math.max(...values) - Math.min(...values);
    const angularReserve = heightM * Math.tan((minimumAngleDeg * Math.PI) / 180);
    return pointCloudSpan + 2 * angularReserve;
  };
  return Math.max(
    requiredFor(result.casePoints.basic, limits.basicAngle),
    requiredFor(result.casePoints.slope, limits.slopeAngle),
    requiredFor(result.casePoints.dynamic, limits.dynamicAngle),
  );
}

export function deriveHydraulicYPitchBound(
  model: ProjectModel,
  minimumPitchM: number,
  maximumPitchM: number,
  minimumResult: ReturnType<typeof calculateProject>,
  maximumResult: ReturnType<typeof calculateProject>,
): HydraulicYPitchBound {
  const minimumAvailableSpanM = hydraulicGroupYSpan(minimumResult);
  const maximumAvailableSpanM = hydraulicGroupYSpan(maximumResult);
  const requiredSpanM = Math.max(
    requiredHydraulicGroupYSpan(model, minimumResult),
    requiredHydraulicGroupYSpan(model, maximumResult),
  );
  if (
    !Number.isFinite(requiredSpanM) ||
    maximumAvailableSpanM + EPS < requiredSpanM
  ) {
    return {
      feasible: false,
      requiredSpanM,
      minimumPitchM: maximumPitchM,
      minimumAvailableSpanM,
      maximumAvailableSpanM,
    };
  }
  const pitchRange = maximumPitchM - minimumPitchM;
  const spanRange = maximumAvailableSpanM - minimumAvailableSpanM;
  const solvedMinimum =
    requiredSpanM <= minimumAvailableSpanM + EPS ||
    pitchRange <= EPS ||
    spanRange <= EPS
      ? minimumPitchM
      : minimumPitchM +
        (pitchRange * (requiredSpanM - minimumAvailableSpanM)) / spanRange;
  return {
    feasible: true,
    requiredSpanM,
    minimumPitchM: Math.max(
      minimumPitchM,
      Math.min(maximumPitchM, solvedMinimum),
    ),
    minimumAvailableSpanM,
    maximumAvailableSpanM,
  };
}

function mathematicalPitchEvaluationUpperBound(
  definition: ProjectModel["catalogue"][number],
  settings: ProjectModel["arrangementOptimiser"],
  trainCount: number,
  cargoWidthM?: number,
): number {
  const bounds = formationPitchBounds(
    definition,
    settings,
    trainCount,
    cargoWidthM,
  );
  if (!bounds || trainCount === 1) return bounds ? 1 : 0;
  const span = Math.max(0, bounds.maximumPitchM - bounds.minimumPitchM);
  const tolerance = Math.max(1e-6, settings.spacingToleranceM);
  return 3 + 2 * Math.max(0, Math.ceil(Math.log2(Math.max(1, span / tolerance))));
}

export function rankArrangementPasses(passes: PassResult[], model: ProjectModel): PassResult[] {
  rankPasses(passes, model);
  const preferredPitch = model.arrangementOptimiser.preferredCentreSpacingM;
  const limits = engineeringLimitsFor(model.engineeringDegree);
  const finiteOr = (value: number | null | undefined, fallback: number): number =>
    typeof value === "number" && Number.isFinite(value) ? value : fallback;
  const arrangementQuality = (pass: PassResult) => {
    const result = pass.result;
    const stabilityMargin = Math.min(
      finiteOr(result.metrics.basicAngle.value, Number.NEGATIVE_INFINITY) - limits.basicAngle,
      finiteOr(result.metrics.slopeAngle.value, Number.NEGATIVE_INFINITY) - limits.slopeAngle,
      finiteOr(result.metrics.dynamicAngle.value, Number.NEGATIVE_INFINITY) - limits.dynamicAngle,
    );
    const peakUtilisation = Math.max(
      finiteOr(result.metrics.basicUtil.value, Number.POSITIVE_INFINITY),
      finiteOr(result.metrics.slopeUtil.value, Number.POSITIVE_INFINITY),
      finiteOr(result.metrics.dynamicUtil.value, Number.POSITIVE_INFINITY),
      finiteOr(result.metrics.spineUtil.value, Number.POSITIVE_INFINITY),
    );
    const groupFractions = result.groups.map((group) => group.reactionFraction);
    const groupBalance = groupFractions.length
      ? Math.max(...groupFractions) - Math.min(...groupFractions)
      : Number.POSITIVE_INFINITY;
    return {
      cargoOnlyPassPriority: result.stabilityReferences.cargoOnlyPass ? 0 : 1,
      supportReserve: result.activeSupportCount - result.minimumActiveSupports,
      stabilityMargin,
      peakUtilisation,
      deflection: finiteOr(result.beam.absoluteDeflectionMm, Number.POSITIVE_INFINITY),
      hydraulicAltitude: finiteOr(result.groupingQuality.minimumAltitudeM, 0),
      groupBalance,
    };
  };
  const ordered = passes
    .filter((pass) => pass.result.status === "PASS" && pass.arrangement && pass.rating !== null)
    .sort((left, right) => {
      const leftArrangement = left.arrangement!;
      const rightArrangement = right.arrangement!;
      const leftQuality = arrangementQuality(left);
      const rightQuality = arrangementQuality(right);
      return (
        leftArrangement.totalAxleLines - rightArrangement.totalAxleLines ||
        // Total axle lines are the primary economic constraint. A two-train
        // 8-AL formation must beat a one-train 12-AL formation. Train count
        // is only a tie-breaker when both formations use the same total AL.
        leftArrangement.trainCount - rightArrangement.trainCount ||
        leftQuality.cargoOnlyPassPriority - rightQuality.cargoOnlyPassPriority ||
        // Once the economic objectives and cargo-only preference are equal,
        // use the operator's standard pitch before spending extra formation
        // width merely to increase an already-passing stability margin.
        Math.abs(leftArrangement.pitchM - preferredPitch) -
          Math.abs(rightArrangement.pitchM - preferredPitch) ||
        rightQuality.supportReserve - leftQuality.supportReserve ||
        rightQuality.stabilityMargin - leftQuality.stabilityMargin ||
        leftQuality.peakUtilisation - rightQuality.peakUtilisation ||
        leftQuality.deflection - rightQuality.deflection ||
        rightQuality.hydraulicAltitude - leftQuality.hydraulicAltitude ||
        leftQuality.groupBalance - rightQuality.groupBalance ||
        leftArrangement.longitudinalSpanM - rightArrangement.longitudinalSpanM ||
        (left.rating ?? Infinity) - (right.rating ?? Infinity) ||
        left.sequence - right.sequence
      );
    });
  for (const pass of passes) {
    if (pass.result.status === "PASS") pass.overallRank = null;
  }
  ordered.forEach((pass, index) => {
    pass.overallRank = index + 1;
  });
  return passes;
}

export interface ArrangementOptimiserCallbacks {
  onUpdate?: (run: OptimiserRun, detailIncluded: boolean) => void;
  signal?: AbortSignal;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function runReference(): string {
  const now = new Date();
  return `ARR-${now.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)}`;
}

function addEvent(
  run: OptimiserRun,
  started: number,
  stage: string,
  message: string,
  detail: string,
  level: ActivityEvent["level"] = "INFO",
  caseReference = "",
): void {
  run.events.unshift({
    id: run.events.length + 1,
    timestamp: new Date().toISOString(),
    elapsedMs: performance.now() - started,
    phase: stage === "Final" ? "FINALISING" : "FORMATION_SEARCH",
    caseReference,
    stage,
    message,
    detail,
    level,
    progress: run.progress.overallPercent,
  });
}

function copyRunForUpdate(run: OptimiserRun, detailIncluded: boolean): OptimiserRun {
  return detailIncluded
    ? clone(run)
    : {
        ...run,
        progress: { ...run.progress },
        passes: [],
        events: [],
      };
}

function appendInnerRun(
  target: OptimiserRun,
  source: OptimiserRun,
  descriptor: ArrangementDescriptor,
  startedOffsetMs: number,
): void {
  const caseReferences = new Map<string, string>();
  for (const sourcePass of source.passes) {
    const sequence = target.passes.length + 1;
    const id = `${target.runReference}-P${String(sequence).padStart(5, "0")}`;
    const caseReference = `${target.runReference}-C${String(sequence).padStart(5, "0")}`;
    caseReferences.set(sourcePass.caseReference, caseReference);
    target.passes.push({
      ...clone(sourcePass),
      id,
      runReference: target.runReference,
      caseReference,
      sequence,
      arrangement: { ...descriptor },
      progressPercent: target.progress.overallPercent,
      completedWork: target.progress.overallCompleted,
      plannedWork: target.progress.overallPlanned,
      elapsedMs: target.progress.elapsedMs,
    });
  }
  for (const sourceEvent of [...source.events].reverse()) {
    target.events.unshift({
      ...clone(sourceEvent),
      id: target.events.length + 1,
      elapsedMs: startedOffsetMs + sourceEvent.elapsedMs,
      caseReference: caseReferences.get(sourceEvent.caseReference) ?? sourceEvent.caseReference,
      detail: `${arrangementSummary(descriptor)}; ${sourceEvent.detail}`,
      progress: target.progress.overallPercent,
    });
  }
}

function makeRefinementPass(
  run: OptimiserRun,
  descriptor: ArrangementDescriptor,
  template: PassResult,
  result: ReturnType<typeof calculateProject>,
  durationMs: number,
): PassResult {
  const sequence = run.passes.length + 1;
  return {
    id: `${run.runReference}-P${String(sequence).padStart(5, "0")}`,
    runReference: run.runReference,
    caseReference: `${run.runReference}-C${String(sequence).padStart(5, "0")}`,
    phase: "REFINEMENT",
    sequence,
    c89: descriptor.axleLinesPerTrain,
    d138: template.d138,
    e89: template.e89,
    pinnedAxleLines: [...template.pinnedAxleLines],
    result,
    lowerRank: null,
    higherRank: null,
    rating: null,
    overallRank: null,
    startedAt: new Date(Date.now() - durationMs).toISOString(),
    durationMs,
    progressPercent: run.progress.overallPercent,
    completedWork: run.progress.overallCompleted,
    plannedWork: run.progress.overallPlanned,
    elapsedMs: run.progress.elapsedMs,
    calculationMode: template.calculationMode,
    arrangement: { ...descriptor },
  };
}

function throwIfStopped(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new DOMException("Stopped by user", "AbortError");
}

/**
 * Searches a deliberately small arrangement space. Total axle lines are the
 * primary economic objective; train count is only a tie-breaker. Every
 * retained formation receives the exact split, longitudinal, pin and selected
 * hydraulic-system search.
 */
export async function runArrangementOptimiser(
  sourceModel: ProjectModel,
  callbacks: ArrangementOptimiserCallbacks = {},
): Promise<OptimiserRun> {
  const started = performance.now();
  const actionSelection = applyArrangementEnvironmentalActions(clone(sourceModel));
  const model = actionSelection.model;
  const settings = model.arrangementOptimiser;
  const run = createEmptyRun();
  run.runReference = runReference();
  run.startedAt = new Date().toISOString();
  run.state = "PLANNING";
  run.progress.runState = "PLANNING";
  run.progress.phase = "PLANNING";
  run.progress.reference = "Checking automatic-arrangement inputs";

  let lastNotify = 0;
  const notify = async (force = false, detailIncluded = false) => {
    const now = performance.now();
    if (!force && now - lastNotify < Math.max(250, model.optimiser.progressRefreshSeconds * 1000)) return;
    lastNotify = now;
    run.progress.elapsedMs = now - started;
    callbacks.onUpdate?.(copyRunForUpdate(run, detailIncluded), detailIncluded);
    await Promise.resolve();
  };

  const issues = collectArrangementIssues(model, settings);
  if (issues.some((item) => item.severity === "blocking")) {
    run.state = "FAILED";
    run.progress.runState = "FAILED";
    run.progress.reference = issues[0]?.title ?? "Arrangement preflight failed";
    run.finishedAt = new Date().toISOString();
    issues.forEach((issue) =>
      addEvent(run, started, "Preflight", issue.title, issue.detail, issue.severity === "blocking" ? "ERROR" : "WARN"),
    );
    await notify(true, true);
    return run;
  }

  const definition = model.catalogue.find((item) => item.id === settings.trailerDefinitionId)!;
  const hydraulicModes = arrangementHydraulicModes(model);
  const comparisonTrainCountTarget = Math.min(
    MINIMUM_TRAIN_COUNT_COMPARISONS,
    Math.max(0, settings.maximumTrains - settings.minimumTrains + 1),
  );
  const supportAxleLowerBound = minimumAxleLinesPerTrainForSupports(model, settings);
  const plannedFormationUpperBound = Array.from(
    {
      length: Math.max(0, settings.maximumTrains - settings.minimumTrains + 1),
    },
    (_, offset) => settings.minimumTrains + offset,
  ).flatMap((trainCount) => {
    const totalAxleLowerBound = minimumTotalAxleLines(model, settings, trainCount);
    const minimumPerTrain = Math.max(
      Math.ceil(totalAxleLowerBound / trainCount),
      supportAxleLowerBound,
    );
    const axleBuckets = validAxleLineValues(settings, trainCount, minimumPerTrain).length;
    const pitchesPerBucket = settings.searchMode === "MATHEMATICAL_BRANCH_BOUND"
      ? mathematicalPitchEvaluationUpperBound(definition, settings, trainCount, model.cargo.widthM)
      : spacingCandidates(definition, settings, trainCount, model.cargo.widthM).length;
    return axleBuckets * pitchesPerBucket * longitudinalOffsetCandidates(settings, trainCount).length * hydraulicModes.length;
  }).reduce((sum, count) => sum + count, 0);
  run.progress.overallPlanned = Math.max(1, plannedFormationUpperBound + 1);
  run.progress.phasePlanned = Math.max(1, plannedFormationUpperBound);
  run.progress.phase = "FORMATION_SEARCH";
  run.progress.runState = "RUNNING";
  run.state = "RUNNING";
  addEvent(
    run,
    started,
    "Planning",
    "Arrangement search planned",
    `${settings.searchMode === "MATHEMATICAL_BRANCH_BOUND" ? "Mathematical branch-and-bound" : settings.searchMode === "ADAPTIVE_BOUNDED" ? "Legacy bounded convergence" : "Legacy grid search"}; ${plannedFormationUpperBound} upper formation evaluations before capacity, buildability and total-axle-line pruning.`,
  );
  addEvent(
    run,
    started,
    "Planning",
    "Hydraulic systems scheduled",
    `${hydraulicModes.map(hydraulicModeLabel).join(" and ")} configurations will be evaluated for every retained train, axle and spacing formation.`,
  );
  addEvent(
    run,
    started,
    "Planning",
    "Train-count comparison scheduled",
    comparisonTrainCountTarget > 1
      ? `The search will retain an exact passing arrangement for at least ${comparisonTrainCountTarget} permitted train counts where feasible. Total axle lines remain the primary ranking objective; train count is only the secondary tie-breaker.`
      : "Only one train count is permitted by the configured search limits.",
  );
  if (settings.allowReducedEnvironmentalActions) {
    addEvent(
      run,
      started,
      "Planning",
      actionSelection.reduced ? "Third-degree reduced actions active" : "Environmental action override active",
      actionSelection.detail,
      actionSelection.reduced ? "WARN" : "INFO",
    );
  }
  await notify(true, true);

  let completedUnits = 0;

  const evaluateFormation = async (
    trainCount: number,
    axleLines: number,
    composition: Parameters<typeof createArrangementDescriptor>[3],
    pitchM: number,
    finalVerification = false,
    verificationTemplate?: PassResult,
    longitudinalOffsetsM: number[] = [],
    hydraulicSystemMode: HydraulicSystemMode = model.hydraulicSystemMode,
  ): Promise<boolean> => {
    throwIfStopped(callbacks.signal);
    if (completedUnits + 1 >= run.progress.overallPlanned) {
      run.progress.overallPlanned = completedUnits + 2;
    }
    const descriptor = createArrangementDescriptor(
      definition,
      settings,
      trainCount,
      composition,
      pitchM,
      longitudinalOffsetsM,
      hydraulicSystemMode,
    );
    const arranged = applyArrangementDescriptor(model, descriptor);
    if (finalVerification && verificationTemplate) {
      const unitStarted = performance.now();
      run.progress.reference = `${arrangementSummary(descriptor)}; exact winning case`;
      addEvent(
        run,
        started,
        "Final",
        "Reapplying exact winning arrangement",
        `${arrangementSummary(descriptor)}; split ${verificationTemplate.d138}, X ${verificationTemplate.e89.toFixed(6)} m and pins ${verificationTemplate.pinnedAxleLines.join(", ") || "none"}.`,
      );
      let verificationModel = applySharedSplit(arranged, verificationTemplate.d138);
      verificationModel = applySharedX(verificationModel, verificationTemplate.e89);
      verificationModel = applySharedPins(
        verificationModel,
        verificationTemplate.pinnedAxleLines,
      );
      const verificationResult = calculateProject(verificationModel);
      run.passes.push(makeRefinementPass(
        run,
        descriptor,
        verificationTemplate,
        verificationResult,
        performance.now() - unitStarted,
      ));
      completedUnits += 1;
      run.progress.overallCompleted = completedUnits;
      run.progress.overallPercent = Math.min(
        99,
        (completedUnits / Math.max(1, run.progress.overallPlanned)) * 100,
      );
      rankArrangementPasses(run.passes, model);
      addEvent(
        run,
        started,
        "Final",
        verificationResult.status === "PASS"
          ? "Winning case reapplied and verified"
          : "Winning case recheck failed",
        `Split ${verificationTemplate.d138}, X ${verificationTemplate.e89.toFixed(6)} m and pins ${verificationTemplate.pinnedAxleLines.join(", ") || "none"}; ${verificationResult.failDetail || "exact result verified"}.`,
        verificationResult.status === "PASS" ? "PASS" : "ERROR",
      );
      addEvent(
        run,
        started,
        "Final",
        verificationResult.status === "PASS"
          ? "Winning formation fully verified"
          : "Winning formation verification failed",
        verificationResult.status === "PASS"
          ? `${arrangementSummary(descriptor)}; the retained split, X, pins, support settlement, beam response and engineering result were recalculated from the applied formation.`
          : `${arrangementSummary(descriptor)}; the retained winning case did not reproduce its earlier PASS status.`,
        verificationResult.status === "PASS" ? "PASS" : "ERROR",
      );
      await notify(true, true);
      return verificationResult.status === "PASS";
    }
    const mathematical = settings.searchMode === "MATHEMATICAL_BRANCH_BOUND" && !finalVerification;
    const exactModel: ProjectModel = {
      ...arranged,
      optimiser: {
        ...arranged.optimiser,
        stopAtFirstPass: mathematical,
        afterFirstPass: mathematical ? "STOP" : "CONTINUE_SCAN",
        fineFirstPassReference: "",
        fineSecondPassReference: "",
      },
    };
    const unitStarted = performance.now();
    run.progress.reference = `${arrangementSummary(descriptor)}; ${hydraulicModeLabel(hydraulicSystemMode)}`;
    addEvent(
      run,
      started,
      finalVerification ? "Final" : "Formation",
      finalVerification ? "Running complete winning-formation verification" : "Testing exact arrangement",
      `${arrangementSummary(descriptor)}; ${hydraulicModeLabel(hydraulicSystemMode)} hydraulics`,
    );
    const inner = await runOptimiser(exactModel, {
      signal: callbacks.signal,
      boundedConvergence: settings.searchMode === "ADAPTIVE_BOUNDED" && !finalVerification,
      mathematicalConvergence: mathematical,
      feasibilityOnly: mathematical,
      onUpdate: async (innerRun) => {
        const innerFraction = Math.max(0, Math.min(1, innerRun.progress.overallPercent / 100));
        run.progress.overallCompleted = completedUnits + innerFraction;
        run.progress.overallPercent = Math.min(
          99,
          (run.progress.overallCompleted / Math.max(1, run.progress.overallPlanned)) * 100,
        );
        run.progress.phaseCompleted = innerRun.progress.overallCompleted;
        run.progress.phasePlanned = Math.max(1, innerRun.progress.overallPlanned);
        run.progress.phasePercent = innerRun.progress.overallPercent;
        run.progress.currentEtaMs = innerRun.progress.overallEtaMs;
        run.progress.reference = `${trainCount} train${trainCount === 1 ? "" : "s"} · ${axleLines} AL/train · ${innerRun.progress.reference}`;
        await notify();
      },
    });
    if (inner.state === "STOPPED") throw new DOMException("Stopped by user", "AbortError");
    appendInnerRun(run, inner, descriptor, unitStarted - started);
    completedUnits += 1;
    run.progress.overallCompleted = completedUnits;
    run.progress.overallPercent = Math.min(
      99,
      (completedUnits / Math.max(1, run.progress.overallPlanned)) * 100,
    );
    run.progress.phaseCompleted = completedUnits;
    run.progress.phasePlanned = Math.max(1, run.progress.overallPlanned - 1);
    run.progress.phasePercent = Math.min(100, (completedUnits / run.progress.phasePlanned) * 100);
    rankArrangementPasses(run.passes, model);
    const hasPass = inner.passes.some((pass) => pass.result.status === "PASS");
    if (hasPass) {
      addEvent(
        run,
        started,
        finalVerification ? "Final" : "Formation",
        finalVerification ? "Winning formation fully verified" : "Minimum-level pass found",
        `${arrangementSummary(descriptor)}; ${hydraulicModeLabel(hydraulicSystemMode)} hydraulics produced at least one exact valid pass.`,
        "PASS",
      );
    }
    await notify(true, true);
    return hasPass;
  };

  const evaluateFormationTemplates = async (
    trainCount: number,
    axleLines: number,
    composition: Parameters<typeof createArrangementDescriptor>[3],
    pitchM: number,
    hydraulicSystemMode: HydraulicSystemMode,
  ): Promise<boolean> => {
    let passed = false;
    for (const offsets of longitudinalOffsetCandidates(settings, trainCount)) {
      passed = await evaluateFormation(
        trainCount,
        axleLines,
        composition,
        pitchM,
        false,
        undefined,
        offsets,
        hydraulicSystemMode,
      );
      // Templates are ordered in-line first, then by increasing stagger, so
      // the first exact pass is least complex at this fixed total-AL,
      // train-count and hydraulic-system level.
      if (passed) break;
    }
    return passed;
  };

  try {
    for (let trainCount = settings.minimumTrains; trainCount <= settings.maximumTrains; trainCount += 1) {
      throwIfStopped(callbacks.signal);
      const totalAxleLowerBound = minimumTotalAxleLines(model, settings, trainCount);
      const capacityPerTrainLowerBound = Math.ceil(totalAxleLowerBound / trainCount);
      const minimumPerTrain = Math.max(
        capacityPerTrainLowerBound,
        supportAxleLowerBound,
      );
      const axleValues = validAxleLineValues(settings, trainCount, minimumPerTrain);
      if (!axleValues.length) {
        addEvent(
          run,
          started,
          "Bound",
          "Train count rejected by capacity or stock bound",
          `${trainCount} train${trainCount === 1 ? "" : "s"} require at least ${totalAxleLowerBound} total AL, but no enabled 4/5/6-AL module composition fits the configured per-train and stock limits.`,
          "INFO",
        );
        continue;
      }
      if (supportAxleLowerBound > capacityPerTrainLowerBound) {
        addEvent(
          run,
          started,
          "Bound",
          "Support span raised the axle-line lower bound",
          `${trainCount} train${trainCount === 1 ? "" : "s"} need at least ${capacityPerTrainLowerBound} AL/train by capacity, but every allowed support can fit on the deck only from ${supportAxleLowerBound} AL/train. Shorter constructible module combinations were removed without calculation.`,
          "INFO",
        );
      }
      const maximumAxleBucket = axleValues[axleValues.length - 1];
      const pitchBoundsForBranch = formationPitchBounds(
        definition,
        settings,
        trainCount,
        model.cargo.widthM,
      );
      const viableHydraulicModes: HydraulicSystemMode[] = [];
      if (pitchBoundsForBranch) {
        for (const hydraulicSystemMode of hydraulicModes) {
          const resultAtPitch = (pitchM: number) => calculateStabilityProbe(
            applyArrangementDescriptor(
              model,
              createArrangementDescriptor(
                definition,
                settings,
                trainCount,
                maximumAxleBucket.composition,
                pitchM,
                [],
                hydraulicSystemMode,
              ),
            ),
          );
          const minimumPitchResult = resultAtPitch(pitchBoundsForBranch.minimumPitchM);
          const maximumPitchResult =
            Math.abs(pitchBoundsForBranch.maximumPitchM - pitchBoundsForBranch.minimumPitchM) <= EPS
              ? minimumPitchResult
              : resultAtPitch(pitchBoundsForBranch.maximumPitchM);
          const branchYBound = deriveHydraulicYPitchBound(
            model,
            pitchBoundsForBranch.minimumPitchM,
            pitchBoundsForBranch.maximumPitchM,
            minimumPitchResult,
            maximumPitchResult,
          );
          if (branchYBound.feasible) {
            viableHydraulicModes.push(hydraulicSystemMode);
          } else {
            addEvent(
              run,
              started,
              "Bound",
              "Hydraulic Y-span bound rejected formation",
              `${trainCount} train${trainCount === 1 ? "" : "s"} with ${hydraulicModeLabel(hydraulicSystemMode)} hydraulics cannot provide the required ${branchYBound.requiredSpanM.toFixed(3)} m Y span even at ${maximumAxleBucket.axleLines} AL/train and the maximum ${pitchBoundsForBranch.maximumPitchM.toFixed(3)} m pitch. Every smaller AL formation in this branch was removed.`,
              "INFO",
            );
          }
        }
      }
      if (!pitchBoundsForBranch || !viableHydraulicModes.length) {
        addEvent(
          run,
          started,
          "Bound",
          "Train branch has no feasible hydraulic width",
          pitchBoundsForBranch
            ? `${trainCount} train${trainCount === 1 ? "" : "s"} cannot form a passing 3-point or 4-point stability boundary inside the configured spacing horizon.`
            : `${trainCount} train${trainCount === 1 ? "" : "s"} do not fit inside the configured spacing horizon at minimum clearance.`,
          "INFO",
        );
        addEvent(
          run,
          started,
          "Bound",
          "Maximum axle formation failed necessary gates",
          `${trainCount} train${trainCount === 1 ? "" : "s"} at the maximum ${maximumAxleBucket.axleLines} AL/train cannot satisfy the configured formation-width and hydraulic stability gates. Smaller axle formations at this train count were removed by the same necessary bounds.`,
          "INFO",
        );
        continue;
      }
      const smallestBuildableTotalAL = axleValues[0].axleLines * trainCount;
      const currentBest = run.passes.find((pass) => pass.overallRank === 1);
      const currentArrangement = currentBest?.arrangement;
      const representedTrainCounts = new Set(
        run.passes
          .filter((pass) => pass.result.status === "PASS" && pass.arrangement)
          .map((pass) => pass.arrangement!.trainCount),
      );
      const dominatedByCurrentBest = Boolean(
        currentArrangement &&
          (
            smallestBuildableTotalAL > currentArrangement.totalAxleLines ||
            (
              smallestBuildableTotalAL === currentArrangement.totalAxleLines &&
              trainCount >= currentArrangement.trainCount
            )
          ),
      );
      const retainForComparison = representedTrainCounts.size < comparisonTrainCountTarget;
      if (dominatedByCurrentBest && !retainForComparison && currentArrangement) {
        addEvent(
          run,
          started,
          "Bound",
          "Train count dominated by a lower-AL result",
          `${trainCount} train${trainCount === 1 ? "" : "s"} need at least ${smallestBuildableTotalAL} total AL. The current best valid formation uses ${currentArrangement.totalAxleLines} total AL across ${currentArrangement.trainCount} train${currentArrangement.trainCount === 1 ? "" : "s"}, so this branch cannot improve the primary total-AL objective.`,
          "INFO",
        );
        continue;
      }
      if (dominatedByCurrentBest && retainForComparison && currentArrangement) {
        addEvent(
          run,
          started,
          "Comparison",
          "Dominated train count retained for comparison",
          `${trainCount} train${trainCount === 1 ? "" : "s"} cannot beat the current ${currentArrangement.totalAxleLines}-AL primary result, but this branch is being solved so the operator can compare at least ${comparisonTrainCountTarget} permitted train-count arrangements.`,
          "INFO",
        );
      }
      const evaluateAxleBucket = async ({
        axleLines,
        composition,
      }: (typeof axleValues)[number], hydraulicSystemMode: HydraulicSystemMode): Promise<boolean> => {
        throwIfStopped(callbacks.signal);
        const pitchBounds = formationPitchBounds(
          definition,
          settings,
          trainCount,
          model.cargo.widthM,
        );
        if (!pitchBounds) {
          addEvent(
            run,
            started,
            "Formation",
            "Formation does not fit",
            `${trainCount} trains at ${axleLines} AL/train exceed the configured overall width at minimum clearance.`,
            "WARN",
          );
          return false;
        }
        let bucketHasPass = false;
        if (settings.searchMode === "MATHEMATICAL_BRANCH_BOUND") {
          const resultAtPitch = (pitchM: number) => {
            const descriptor = createArrangementDescriptor(
              definition,
              settings,
              trainCount,
              composition,
              pitchM,
              [],
              hydraulicSystemMode,
            );
            return calculateStabilityProbe(applyArrangementDescriptor(model, descriptor));
          };
          const minimumPitchResult = resultAtPitch(pitchBounds.minimumPitchM);
          const maximumPitchResult =
            Math.abs(pitchBounds.maximumPitchM - pitchBounds.minimumPitchM) <= EPS
              ? minimumPitchResult
              : resultAtPitch(pitchBounds.maximumPitchM);
          const hydraulicYBound = deriveHydraulicYPitchBound(
            model,
            pitchBounds.minimumPitchM,
            pitchBounds.maximumPitchM,
            minimumPitchResult,
            maximumPitchResult,
          );
          if (!hydraulicYBound.feasible) {
            addEvent(
              run,
              started,
              "Bound",
              "Hydraulic Y-span bound rejected formation",
              `${trainCount} train${trainCount === 1 ? "" : "s"} at ${axleLines} AL/train can provide at most ${hydraulicYBound.maximumAvailableSpanM.toFixed(3)} m between outer hydraulic group centres, but the all-inclusive COG height, envelope, dynamic shifts and minimum tipping angles require at least ${hydraulicYBound.requiredSpanM.toFixed(3)} m.`,
              "INFO",
            );
            return false;
          }
          const effectivePitchBounds = {
            minimumPitchM: hydraulicYBound.minimumPitchM,
            maximumPitchM: pitchBounds.maximumPitchM,
            preferredPitchM: Math.max(
              hydraulicYBound.minimumPitchM,
              Math.min(
                pitchBounds.maximumPitchM,
                pitchBounds.preferredPitchM,
              ),
            ),
          };
          if (hydraulicYBound.minimumPitchM > pitchBounds.minimumPitchM + EPS) {
            addEvent(
              run,
              started,
              "Bound",
              "Minimum hydraulic Y spacing solved",
              `Pitch values below ${hydraulicYBound.minimumPitchM.toFixed(3)} m cannot provide the required ${hydraulicYBound.requiredSpanM.toFixed(3)} m hydraulic Y span and were removed before exact calculations.`,
              "INFO",
            );
          }
          const tested = new Map<string, { passed: boolean; caseCount: number }>();
          const testPitch = async (
            pitchM: number,
          ): Promise<{ passed: boolean; caseCount: number }> => {
            const bounded = Math.max(
              effectivePitchBounds.minimumPitchM,
              Math.min(effectivePitchBounds.maximumPitchM, pitchM),
            );
            const rounded = Math.round(bounded * 1e9) / 1e9;
            const key = rounded.toFixed(9);
            const previous = tested.get(key);
            if (previous !== undefined) return previous;
            const passCountBefore = run.passes.length;
            const passed = await evaluateFormationTemplates(trainCount, axleLines, composition, rounded, hydraulicSystemMode);
            const outcome = {
              passed,
              caseCount: run.passes.length - passCountBefore,
            };
            tested.set(key, outcome);
            return outcome;
          };
          const preferred = effectivePitchBounds.preferredPitchM;
          const independentPitchCandidates = [...new Set([
            ...spacingCandidates(definition, settings, trainCount, model.cargo.widthM),
            effectivePitchBounds.minimumPitchM,
            effectivePitchBounds.maximumPitchM,
            preferred,
          ].filter(
            (value) =>
              value >= effectivePitchBounds.minimumPitchM - EPS &&
              value <= effectivePitchBounds.maximumPitchM + EPS,
          ).map((value) => Math.round(value * 1e9) / 1e9))].sort(
            (left, right) =>
              Math.abs(left - preferred) - Math.abs(right - preferred) ||
              right - left,
          );
          const passingSeeds: number[] = [];
          for (const seed of independentPitchCandidates) {
            const outcome = await testPitch(seed);
            if (outcome.passed) {
              // Candidates are ordered by distance from the preferred pitch.
              // The first passing seed is therefore the correct bracket for
              // nearest-boundary convergence; testing farther independent
              // seeds before that convergence cannot improve the pitch goal.
              passingSeeds.push(seed);
              break;
            }
          }
          const preferredOutcome = await testPitch(preferred);
          if (!preferredOutcome.passed && passingSeeds.length) {
            let nearestPassingPitch = passingSeeds.reduce((best, value) =>
              Math.abs(value - preferred) < Math.abs(best - preferred) ? value : best,
            );
            let failingPitch = preferred;
            const tolerance = Math.max(1e-6, settings.spacingToleranceM);
            let rounds = 0;
            while (Math.abs(nearestPassingPitch - failingPitch) > tolerance && rounds < 32) {
              const midpoint = (nearestPassingPitch + failingPitch) / 2;
              const outcome = await testPitch(midpoint);
              if (outcome.passed) nearestPassingPitch = midpoint;
              else failingPitch = midpoint;
              rounds += 1;
            }
            passingSeeds.push(nearestPassingPitch);
            addEvent(
              run,
              started,
              "Bound",
              "Nearest passing pitch converged",
              `The preferred ${preferred.toFixed(3)} m pitch did not pass. The closest passing boundary was converged to ${nearestPassingPitch.toFixed(3)} m within the configured ${tolerance.toFixed(3)} m tolerance after ${rounds} exact step${rounds === 1 ? "" : "s"}.`,
              "PASS",
            );
          }
          if (passingSeeds.length) {
            bucketHasPass = true;
            const preferredPassed = passingSeeds.some(
              (value) => Math.abs(value - preferred) <= EPS,
            );
            addEvent(
              run,
              started,
              "Bound",
              preferredPassed
                ? "Preferred and independent spacings verified"
                : "Independent spacings verified without preferred pitch",
              `${passingSeeds.length} spacing candidate${passingSeeds.length === 1 ? "" : "s"} passed, including ${preferredPassed ? "the preferred pitch and " : ""}independent minimum/maximum/sample candidates.`,
              preferredPassed ? "BEST" : "PASS",
            );
          }
          if (bucketHasPass) {
            addEvent(
              run,
              started,
              "Bound",
              "Feasible axle bucket established",
              `${trainCount} train${trainCount === 1 ? "" : "s"} at ${axleLines} AL/train has at least one exact passing formation.`,
              "INFO",
            );
          }
        } else {
          const pitches = spacingCandidates(
            definition,
            settings,
            trainCount,
            model.cargo.widthM,
          );
          let passingDistance = Number.POSITIVE_INFINITY;
          let skippedPitches = 0;
          for (const pitchM of pitches) {
            const pitchDistance = Math.abs(pitchM - settings.preferredCentreSpacingM);
            if (
              settings.searchMode === "ADAPTIVE_BOUNDED" &&
              bucketHasPass &&
              pitchDistance > passingDistance + EPS
            ) {
              skippedPitches += 1;
              continue;
            }
            if (await evaluateFormationTemplates(trainCount, axleLines, composition, pitchM, hydraulicSystemMode)) {
              bucketHasPass = true;
              passingDistance = Math.min(passingDistance, pitchDistance);
            }
          }
          if (skippedPitches > 0) {
            addEvent(
              run,
              started,
              "Formation",
              "Dominated spacings pruned",
              `${skippedPitches} spacing candidate${skippedPitches === 1 ? " was" : "s were"} farther from the preferred ${settings.preferredCentreSpacingM.toFixed(3)} m pitch than an already verified passing formation.`,
              "INFO",
            );
          }
        }
        return bucketHasPass;
      };

      interface AxleBucketOutcome {
        passed: boolean;
        necessaryGateFailure: boolean;
      }
      const bucketOutcomes = new Map<number, AxleBucketOutcome>();
      const evaluateAxleIndex = async (index: number): Promise<AxleBucketOutcome> => {
        const previous = bucketOutcomes.get(index);
        if (previous) return previous;
        const passStart = run.passes.length;
        let passed = false;
        for (const hydraulicSystemMode of viableHydraulicModes) {
          const modePassed = await evaluateAxleBucket(axleValues[index], hydraulicSystemMode);
          passed ||= modePassed;
        }
        const evaluated = run.passes.slice(passStart);
        const outcome = {
          passed,
          necessaryGateFailure:
            evaluated.length === 0 ||
            evaluated.every(
              (pass) =>
                pass.result.status === "GEOMETRY_FAIL" ||
                pass.result.status === "SUPPORT_FAIL",
            ),
        };
        bucketOutcomes.set(index, outcome);
        return outcome;
      };
      const selectWinningAxleIndex = (index: number) => {
        addEvent(
          run,
          started,
          "Bound",
          "Minimum axle-line boundary solved",
          `${trainCount} train${trainCount === 1 ? "" : "s"} require ${axleValues[index].axleLines} AL/train within the tested 4/5/6-AL module compositions. Other permitted train counts remain under evaluation because they may use fewer total axle lines.`,
          "BEST",
        );
      };

      if (settings.searchMode === "MATHEMATICAL_BRANCH_BOUND") {
        const lowerOutcome = await evaluateAxleIndex(0);
        if (lowerOutcome.passed) {
          selectWinningAxleIndex(0);
        } else if (axleValues.length > 1) {
          const maximumIndex = axleValues.length - 1;
          let failingIndex = 0;
          let passingIndex: number | null = null;
          let probeIndex = 1;
          while (probeIndex <= maximumIndex) {
            const outcome = await evaluateAxleIndex(probeIndex);
            if (outcome.passed) {
              passingIndex = probeIndex;
              break;
            }
            failingIndex = probeIndex;
            if (probeIndex === maximumIndex) break;
            probeIndex = Math.min(maximumIndex, probeIndex * 2 + 1);
          }
          if (passingIndex !== null) {
            while (passingIndex - failingIndex > 1) {
              const midpointIndex = Math.floor((failingIndex + passingIndex) / 2);
              if ((await evaluateAxleIndex(midpointIndex)).passed) passingIndex = midpointIndex;
              else failingIndex = midpointIndex;
            }
            selectWinningAxleIndex(passingIndex);
          } else if ((await evaluateAxleIndex(maximumIndex)).necessaryGateFailure) {
            addEvent(
              run,
              started,
              "Bound",
              "Maximum axle formation failed necessary gates",
              `${trainCount} train${trainCount === 1 ? "" : "s"} at the maximum ${axleValues[maximumIndex].axleLines} AL/train still cannot satisfy the stability/support geometry gates after exact legacy-step fallback inside the mathematically feasible intervals. Smaller axle formations at this train count were pruned only after the same exact fallback was checked.`,
              "INFO",
            );
          } else {
            for (let index = 1; index < maximumIndex; index += 1) {
              if (bucketOutcomes.has(index)) continue;
              if ((await evaluateAxleIndex(index)).passed) {
                selectWinningAxleIndex(index);
                break;
              }
            }
          }
        }
      } else {
        for (let index = 0; index < axleValues.length; index += 1) {
          if ((await evaluateAxleIndex(index)).passed) {
            selectWinningAxleIndex(index);
            break;
          }
        }
      }
    }

    rankArrangementPasses(run.passes, model);
    let best = run.passes.find((pass) => pass.overallRank === 1) ?? null;
    if (
      settings.searchMode !== "MATHEMATICAL_BRANCH_BOUND" &&
      best?.arrangement &&
      Math.abs(best.arrangement.pitchM - settings.preferredCentreSpacingM) > settings.spacingToleranceM
    ) {
      run.progress.phase = "REFINEMENT";
      run.progress.reference = "Refining equal train spacing";
      const winningTrainCount = best.arrangement.trainCount;
      const winningAxleLines = best.arrangement.axleLinesPerTrain;
      const minimumPitch =
        winningTrainCount === 1
          ? 0
          : definition.trailerWidthM + Math.max(0, settings.minimumClearanceM);
      const maximumPitch =
        winningTrainCount === 1
          ? 0
          : (effectiveMaximumFormationWidth(settings, model.cargo.widthM) -
              definition.trailerWidthM) /
            (winningTrainCount - 1);
      let step =
        winningTrainCount === 1
          ? 0
          : Math.max(
              settings.spacingToleranceM,
              (maximumPitch - minimumPitch) / Math.max(2, settings.spacingSamples - 1) / 2,
            );
      const tested = new Set(
        run.passes
          .filter(
            (pass) =>
              pass.arrangement?.trainCount === winningTrainCount &&
              pass.arrangement?.axleLinesPerTrain === winningAxleLines,
          )
          .map((pass) => pass.arrangement?.pitchM.toFixed(6)),
      );
      for (let round = 0; round < 4 && step >= settings.spacingToleranceM - EPS; round += 1) {
        throwIfStopped(callbacks.signal);
        best = run.passes.find((pass) => pass.overallRank === 1) ?? best;
        const bestArrangement = best.arrangement;
        if (!bestArrangement) break;
        const centrePitch = bestArrangement.pitchM;
        const pitches = [centrePitch - step, centrePitch + step]
          .map((value) => Math.max(minimumPitch, Math.min(maximumPitch, value)))
          .filter((value) => !tested.has(value.toFixed(6)));
        if (!pitches.length) {
          step /= 2;
          continue;
        }
        for (const pitchM of pitches) {
          tested.add(pitchM.toFixed(6));
          const descriptor = createArrangementDescriptor(
            definition,
            settings,
            winningTrainCount,
            {
              modules4: bestArrangement.modules4,
              modules5: bestArrangement.modules5,
              modules6: bestArrangement.modules6,
              axleLines: bestArrangement.axleLinesPerTrain,
              moduleCount: bestArrangement.moduleCountPerTrain,
            },
            pitchM,
            bestArrangement.longitudinalOffsetsM,
            bestArrangement.hydraulicSystemMode,
          );
          let candidateModel = applyArrangementDescriptor(model, descriptor);
          candidateModel = applySharedSplit(candidateModel, best.d138);
          candidateModel = applySharedX(candidateModel, best.e89);
          candidateModel = applySharedPins(candidateModel, best.pinnedAxleLines);
          const caseStarted = performance.now();
          const result = calculateProject(candidateModel);
          const pass = makeRefinementPass(
            run,
            descriptor,
            best,
            result,
            performance.now() - caseStarted,
          );
          run.passes.push(pass);
          addEvent(
            run,
            started,
            "Refinement",
            result.status,
            `${arrangementSummary(descriptor)}; fixed split ${best.d138}, X ${best.e89.toFixed(3)} m and pins ${best.pinnedAxleLines.join(", ") || "none"}.`,
            result.status === "PASS" ? "PASS" : "WARN",
            pass.caseReference,
          );
          rankArrangementPasses(run.passes, model);
          await notify();
        }
        step /= 2;
      }
    }

    if (settings.searchMode === "MATHEMATICAL_BRANCH_BOUND") {
      rankArrangementPasses(run.passes, model);
      best = run.passes.find((pass) => pass.overallRank === 1) ?? null;
      if (best?.arrangement) {
        run.progress.phase = "FINALISING";
        run.progress.reference = "Complete search of the winning formation";
        const arrangement = best.arrangement;
        await evaluateFormation(
          arrangement.trainCount,
          arrangement.axleLinesPerTrain,
          {
            modules4: arrangement.modules4,
            modules5: arrangement.modules5,
            modules6: arrangement.modules6,
            axleLines: arrangement.axleLinesPerTrain,
            moduleCount: arrangement.moduleCountPerTrain,
          },
          arrangement.pitchM,
          true,
          best,
          arrangement.longitudinalOffsetsM,
          arrangement.hydraulicSystemMode,
        );
      }
    }

    run.progress.phase = "FINALISING";
    run.progress.reference = "Ranking and verifying the minimum arrangement";
    rankArrangementPasses(run.passes, model);
    best = run.passes.find((pass) => pass.overallRank === 1) ?? null;
    run.bestPassId = best?.id ?? null;
    run.state = "COMPLETE";
    run.progress.runState = "COMPLETE";
    run.progress.overallCompleted = run.progress.overallPlanned;
    run.progress.phaseCompleted = 1;
    run.progress.phasePlanned = 1;
    run.progress.overallPercent = 100;
    run.progress.phasePercent = 100;
    run.progress.currentEtaMs = 0;
    run.progress.overallEtaMs = 0;
    run.progress.estimatedFinish = new Date().toISOString();
    run.progress.reference = best?.arrangement
      ? `${arrangementSummary(best.arrangement)}; ${hydraulicModeLabel(best.arrangement.hydraulicSystemMode ?? model.hydraulicSystemMode)} hydraulics`
      : "No valid automatic arrangement";
    addEvent(
      run,
      started,
      "Final",
      best ? "Minimum arrangement selected" : "No valid arrangement",
      best?.arrangement
        ? `${best.id}; ${arrangementSummary(best.arrangement)}; ${hydraulicModeLabel(best.arrangement.hydraulicSystemMode ?? model.hydraulicSystemMode)} hydraulics; rating ${(best.rating ?? 0).toFixed(4)}.`
        : "No arrangement passed every active engineering and support check within the configured bounds.",
      best ? "BEST" : "WARN",
      best?.caseReference ?? "",
    );
  } catch (error) {
    const stopped = error instanceof DOMException && error.name === "AbortError";
    run.state = stopped ? "STOPPED" : "FAILED";
    run.progress.runState = run.state;
    run.progress.currentEtaMs = null;
    run.progress.overallEtaMs = null;
    run.progress.estimatedFinish = null;
    run.progress.reference = stopped ? "Stopped" : "Failed";
    addEvent(
      run,
      started,
      stopped ? "Stop" : "Error",
      stopped ? "Arrangement search stopped" : "Arrangement search failed",
      stopped
        ? "Completed cases and their exact results were retained."
        : error instanceof Error
          ? error.message
          : String(error),
      stopped ? "WARN" : "ERROR",
    );
  }

  run.finishedAt = new Date().toISOString();
  run.progress.elapsedMs = performance.now() - started;
  await notify(true, true);
  return run;
}
