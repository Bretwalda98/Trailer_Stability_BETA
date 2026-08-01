import {
  applySharedPins,
  applySharedSplit,
  applySharedX,
  calculateProject,
} from "./core";
import {
  applyArrangementDescriptor,
  arrangementSummary,
  collectArrangementIssues,
  createArrangementDescriptor,
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
  const totalAxleLowerBound = minimumTotalAxleLines(model, settings);
  const plans = Array.from(
    {
      length: Math.max(0, settings.maximumTrains - settings.minimumTrains + 1),
    },
    (_, offset) => settings.minimumTrains + offset,
  ).flatMap((trainCount) => {
    const minimumPerTrain = Math.ceil(totalAxleLowerBound / trainCount);
    return validAxleLineValues(settings, trainCount, minimumPerTrain).flatMap(({ axleLines, composition }) =>
      spacingCandidates(definition, settings, trainCount).map((pitchM) => ({
        trainCount,
        composition,
        pitchM,
        axleLines,
      })),
    );
  });
  run.progress.overallPlanned = Math.max(1, plans.length + 1);
  run.progress.phasePlanned = Math.max(1, plans.length);
  run.progress.phase = "FORMATION_SEARCH";
  run.progress.runState = "RUNNING";
  run.state = "RUNNING";
  addEvent(
    run,
    started,
    "Planning",
    "Arrangement search planned",
    `Minimum static-capacity estimate ${totalAxleLowerBound} total AL; ${plans.length} exact formation searches available before lexicographic stopping.`,
  );
  await notify(true, true);

  let completedUnits = 0;
  let winningTrainCount: number | null = null;
  let winningAxleLines: number | null = null;

  try {
    for (let trainCount = settings.minimumTrains; trainCount <= settings.maximumTrains; trainCount += 1) {
      throwIfStopped(callbacks.signal);
      const minimumPerTrain = Math.ceil(totalAxleLowerBound / trainCount);
      const axleValues = validAxleLineValues(settings, trainCount, minimumPerTrain);
      for (const { axleLines, composition } of axleValues) {
        throwIfStopped(callbacks.signal);
        const pitches = spacingCandidates(definition, settings, trainCount);
        if (!pitches.length) {
          addEvent(
            run,
            started,
            "Formation",
            "Formation does not fit",
            `${trainCount} trains at ${axleLines} AL/train exceed the configured overall width at minimum clearance.`,
            "WARN",
          );
          continue;
        }
        let bucketHasPass = false;
        for (const pitchM of pitches) {
          throwIfStopped(callbacks.signal);
          const descriptor = createArrangementDescriptor(
            definition,
            settings,
            trainCount,
            composition,
            pitchM,
          );
          const arranged = applyArrangementDescriptor(model, descriptor);
          const exactModel: ProjectModel = {
            ...arranged,
            optimiser: {
              ...arranged.optimiser,
              stopAtFirstPass: false,
              afterFirstPass: "CONTINUE_SCAN",
              fineFirstPassReference: "",
              fineSecondPassReference: "",
            },
          };
          const unitStarted = performance.now();
          run.progress.reference = arrangementSummary(descriptor);
          addEvent(
            run,
            started,
            "Formation",
            "Testing exact arrangement",
            arrangementSummary(descriptor),
          );
          const inner = await runOptimiser(exactModel, {
            signal: callbacks.signal,
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
          if (inner.passes.some((pass) => pass.result.status === "PASS")) {
            bucketHasPass = true;
            addEvent(
              run,
              started,
              "Formation",
              "Minimum-level pass found",
              `${arrangementSummary(descriptor)} produced at least one exact valid pass. Remaining equal-priority spacings will be compared.`,
              "PASS",
            );
          }
          await notify(true, true);
        }
        if (bucketHasPass) {
          winningTrainCount = trainCount;
          winningAxleLines = axleLines;
          break;
        }
      }
      if (winningTrainCount !== null) break;
    }

    rankArrangementPasses(run.passes, model);
    let best = run.passes.find((pass) => pass.overallRank === 1) ?? null;
    if (best?.arrangement && winningTrainCount !== null && winningAxleLines !== null) {
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
