import {
  applySharedPins,
  applySharedSplit,
  applySharedX,
  calculateProject,
  engineeringLimitsFor,
} from "./core";
import {
  applyArrangementDescriptor,
  arrangementSummary,
  collectArrangementIssues,
  createArrangementDescriptor,
  formationPitchBounds,
  minimumTotalAxleLines,
  spacingCandidates,
  validAxleLineValues,
} from "./arrangement";
import { createEmptyRun, rankPasses, runOptimiser } from "./optimiser";
import type {
  ActivityEvent,
  ArrangementDescriptor,
  OptimiserRun,
  PassResult,
  ProjectModel,
} from "./types";

const EPS = 1e-9;

export interface HydraulicYPitchBound {
  feasible: boolean;
  requiredSpanM: number;
  minimumPitchM: number;
  minimumAvailableSpanM: number;
  maximumAvailableSpanM: number;
}

function hydraulicGroupYSpan(result: ReturnType<typeof calculateProject>): number {
  if (result.groups.length !== 3) return 0;
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
): number {
  const bounds = formationPitchBounds(definition, settings, trainCount);
  if (!bounds || trainCount === 1) return bounds ? 1 : 0;
  const span = Math.max(0, bounds.maximumPitchM - bounds.minimumPitchM);
  const tolerance = Math.max(1e-6, settings.spacingToleranceM);
  return 3 + 2 * Math.max(0, Math.ceil(Math.log2(Math.max(1, span / tolerance))));
}

export function rankArrangementPasses(passes: PassResult[], model: ProjectModel): PassResult[] {
  rankPasses(passes, model);
  const preferredPitch = model.arrangementOptimiser.preferredCentreSpacingM;
  const ordered = passes
    .filter((pass) => pass.result.status === "PASS" && pass.arrangement && pass.rating !== null)
    .sort((left, right) => {
      const leftArrangement = left.arrangement!;
      const rightArrangement = right.arrangement!;
      return (
        leftArrangement.trainCount - rightArrangement.trainCount ||
        leftArrangement.totalAxleLines - rightArrangement.totalAxleLines ||
        Math.abs(leftArrangement.pitchM - preferredPitch) -
          Math.abs(rightArrangement.pitchM - preferredPitch) ||
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
 * Searches a deliberately small arrangement space. Train count and axle lines
 * are lexicographic hard priorities; the existing optimiser then performs the
 * exact split, longitudinal and pin search for each equal-spacing formation.
 */
export async function runArrangementOptimiser(
  sourceModel: ProjectModel,
  callbacks: ArrangementOptimiserCallbacks = {},
): Promise<OptimiserRun> {
  const started = performance.now();
  const model = clone(sourceModel);
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
  const plannedFormationUpperBound = Array.from(
    {
      length: Math.max(0, settings.maximumTrains - settings.minimumTrains + 1),
    },
    (_, offset) => settings.minimumTrains + offset,
  ).flatMap((trainCount) => {
    const totalAxleLowerBound = minimumTotalAxleLines(model, settings, trainCount);
    const minimumPerTrain = Math.ceil(totalAxleLowerBound / trainCount);
    const axleBuckets = validAxleLineValues(settings, trainCount, minimumPerTrain).length;
    const pitchesPerBucket = settings.searchMode === "MATHEMATICAL_BRANCH_BOUND"
      ? mathematicalPitchEvaluationUpperBound(definition, settings, trainCount)
      : spacingCandidates(definition, settings, trainCount).length;
    return axleBuckets * pitchesPerBucket;
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
    `${settings.searchMode === "MATHEMATICAL_BRANCH_BOUND" ? "Mathematical branch-and-bound" : settings.searchMode === "ADAPTIVE_BOUNDED" ? "Legacy bounded convergence" : "Legacy grid search"}; ${plannedFormationUpperBound} upper formation evaluations before capacity, buildability and lexicographic pruning.`,
  );
  await notify(true, true);

  let completedUnits = 0;
  let winningTrainCount: number | null = null;
  let winningAxleLines: number | null = null;

  const evaluateFormation = async (
    trainCount: number,
    axleLines: number,
    composition: Parameters<typeof createArrangementDescriptor>[3],
    pitchM: number,
    finalVerification = false,
    verificationTemplate?: PassResult,
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
    );
    const arranged = applyArrangementDescriptor(model, descriptor);
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
    run.progress.reference = arrangementSummary(descriptor);
    addEvent(
      run,
      started,
      finalVerification ? "Final" : "Formation",
      finalVerification ? "Running complete winning-formation verification" : "Testing exact arrangement",
      arrangementSummary(descriptor),
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
    let hasPass = inner.passes.some((pass) => pass.result.status === "PASS");
    if (finalVerification && verificationTemplate) {
      let verificationModel = applyArrangementDescriptor(model, descriptor);
      verificationModel = applySharedSplit(verificationModel, verificationTemplate.d138);
      verificationModel = applySharedX(verificationModel, verificationTemplate.e89);
      verificationModel = applySharedPins(verificationModel, verificationTemplate.pinnedAxleLines);
      const verificationStarted = performance.now();
      const verificationResult = calculateProject(verificationModel);
      run.passes.push(makeRefinementPass(
        run,
        descriptor,
        verificationTemplate,
        verificationResult,
        performance.now() - verificationStarted,
      ));
      hasPass ||= verificationResult.status === "PASS";
      rankArrangementPasses(run.passes, model);
      addEvent(
        run,
        started,
        "Final",
        verificationResult.status === "PASS" ? "Winning case reapplied and verified" : "Winning case recheck failed",
        `Split ${verificationTemplate.d138}, X ${verificationTemplate.e89.toFixed(6)} m and pins ${verificationTemplate.pinnedAxleLines.join(", ") || "none"}; ${verificationResult.failDetail || "exact result verified"}.`,
        verificationResult.status === "PASS" ? "PASS" : "ERROR",
      );
    }
    if (hasPass) {
      addEvent(
        run,
        started,
        finalVerification ? "Final" : "Formation",
        finalVerification ? "Winning formation fully verified" : "Minimum-level pass found",
        `${arrangementSummary(descriptor)} produced at least one exact valid pass.`,
        "PASS",
      );
    }
    await notify(true, true);
    return hasPass;
  };

  try {
    for (let trainCount = settings.minimumTrains; trainCount <= settings.maximumTrains; trainCount += 1) {
      throwIfStopped(callbacks.signal);
      const totalAxleLowerBound = minimumTotalAxleLines(model, settings, trainCount);
      const minimumPerTrain = Math.ceil(totalAxleLowerBound / trainCount);
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
      const evaluateAxleBucket = async ({
        axleLines,
        composition,
      }: (typeof axleValues)[number]): Promise<boolean> => {
        throwIfStopped(callbacks.signal);
        const pitchBounds = formationPitchBounds(definition, settings, trainCount);
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
            );
            return calculateProject(applyArrangementDescriptor(model, descriptor));
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
            const passed = await evaluateFormation(trainCount, axleLines, composition, rounded);
            const outcome = {
              passed,
              caseCount: run.passes.length - passCountBefore,
            };
            tested.set(key, outcome);
            return outcome;
          };
          const preferred = effectivePitchBounds.preferredPitchM;
          const widestOutcome = await testPitch(effectivePitchBounds.maximumPitchM);
          if (!widestOutcome.passed && widestOutcome.caseCount === 0) {
            addEvent(
              run,
              started,
              "Bound",
              "Widest hydraulic formation has no feasible X interval",
              `At the maximum ${effectivePitchBounds.maximumPitchM.toFixed(3)} m pitch, no trailer-X case can satisfy both the complete stability boundaries and minimum support footprint. Narrower pitches are geometrically dominated for this axle count.`,
              "INFO",
            );
            return false;
          }
          if ((await testPitch(preferred)).passed) {
            bucketHasPass = true;
            addEvent(
              run,
              started,
              "Bound",
              "Preferred pitch is feasible",
              `${preferred.toFixed(3)} m is the exact closest possible pitch to the configured preference; all other Y positions are dominated.`,
              "BEST",
            );
          } else {
            const passingSeeds: number[] = [];
            for (const seed of [
              effectivePitchBounds.maximumPitchM,
              effectivePitchBounds.minimumPitchM,
            ]) {
              if ((await testPitch(seed)).passed) passingSeeds.push(seed);
            }
            if (!passingSeeds.length) {
              for (const seed of [
                ...spacingCandidates(definition, settings, trainCount).filter(
                  (value) => value >= effectivePitchBounds.minimumPitchM - EPS,
                ),
                effectivePitchBounds.minimumPitchM,
              ]) {
                if (tested.has(seed.toFixed(9))) continue;
                if ((await testPitch(seed)).passed) passingSeeds.push(seed);
              }
            }
            for (const seed of passingSeeds) {
              let failingPitch = preferred;
              let passingPitch = seed;
              let iterations = 0;
              while (
                Math.abs(passingPitch - failingPitch) > settings.spacingToleranceM + EPS &&
                iterations < 48
              ) {
                const midpoint = (passingPitch + failingPitch) / 2;
                if ((await testPitch(midpoint)).passed) passingPitch = midpoint;
                else failingPitch = midpoint;
                iterations += 1;
              }
              bucketHasPass = true;
              addEvent(
                run,
                started,
                "Bound",
                "Pitch feasibility boundary solved",
                `Converged from ${seed.toFixed(3)} m to ${passingPitch.toFixed(3)} m, within ${settings.spacingToleranceM.toFixed(3)} m of the closest passing boundary to the preferred pitch.`,
                "PASS",
              );
            }
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
          const pitches = spacingCandidates(definition, settings, trainCount);
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
            if (await evaluateFormation(trainCount, axleLines, composition, pitchM)) {
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
        const passed = await evaluateAxleBucket(axleValues[index]);
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
        winningTrainCount = trainCount;
        winningAxleLines = axleValues[index].axleLines;
        addEvent(
          run,
          started,
          "Bound",
          "Minimum axle-line boundary solved",
          `${trainCount} train${trainCount === 1 ? "" : "s"} require ${axleValues[index].axleLines} AL/train within the tested 4/5/6-AL module compositions. Higher axle and train branches are lexicographically worse.`,
          "BEST",
        );
      };

      if (settings.searchMode === "MATHEMATICAL_BRANCH_BOUND") {
        const lowerOutcome = await evaluateAxleIndex(0);
        if (lowerOutcome.passed) {
          selectWinningAxleIndex(0);
        } else if (axleValues.length > 1) {
          const maximumIndex = axleValues.length - 1;
          const upperOutcome = await evaluateAxleIndex(maximumIndex);
          if (upperOutcome.passed) {
            let failingIndex = 0;
            let passingIndex = maximumIndex;
            while (passingIndex - failingIndex > 1) {
              const midpointIndex = Math.floor((failingIndex + passingIndex) / 2);
              if ((await evaluateAxleIndex(midpointIndex)).passed) passingIndex = midpointIndex;
              else failingIndex = midpointIndex;
            }
            selectWinningAxleIndex(passingIndex);
          } else if (upperOutcome.necessaryGateFailure) {
            addEvent(
              run,
              started,
              "Bound",
              "Maximum axle formation failed necessary gates",
              `${trainCount} train${trainCount === 1 ? "" : "s"} at the maximum ${axleValues[maximumIndex].axleLines} AL/train still cannot satisfy the stability/support geometry gates. Smaller axle formations at this train count were pruned from the fast search; Legacy Grid remains available for exhaustive non-monotonic checking.`,
              "INFO",
            );
          } else {
            for (let index = 1; index < maximumIndex; index += 1) {
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
      if (winningTrainCount !== null) break;
    }

    rankArrangementPasses(run.passes, model);
    let best = run.passes.find((pass) => pass.overallRank === 1) ?? null;
    if (
      settings.searchMode !== "MATHEMATICAL_BRANCH_BOUND" &&
      best?.arrangement &&
      winningTrainCount !== null &&
      winningAxleLines !== null &&
      Math.abs(best.arrangement.pitchM - settings.preferredCentreSpacingM) > settings.spacingToleranceM
    ) {
      run.progress.phase = "REFINEMENT";
      run.progress.reference = "Refining equal train spacing";
      const minimumPitch =
        winningTrainCount === 1
          ? 0
          : definition.trailerWidthM + Math.max(0, settings.minimumClearanceM);
      const maximumPitch =
        winningTrainCount === 1
          ? 0
          : (settings.maximumFormationWidthM - definition.trailerWidthM) /
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
      ? arrangementSummary(best.arrangement)
      : "No valid automatic arrangement";
    addEvent(
      run,
      started,
      "Final",
      best ? "Minimum arrangement selected" : "No valid arrangement",
      best?.arrangement
        ? `${best.id}; ${arrangementSummary(best.arrangement)}; rating ${(best.rating ?? 0).toFixed(4)}.`
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
