import { calculateStabilityProbe } from "./core";
import {
  applyArrangementDescriptor,
  applyArrangementEnvironmentalActions,
  createArrangementDescriptor,
  formationPitchBounds,
  mathematicalPitchSeeds,
  minimumAxleLinesPerTrainForSupports,
  minimumTotalAxleLines,
  validAxleLineValues,
} from "./arrangement";
import type {
  ArrangementDescriptor,
  HydraulicSystemMode,
  ProjectModel,
} from "./types";

export type QuickRecommendationKind = "AL_FIRST" | "TRAIN_FIRST" | "BALANCED";

export interface QuickRecommendationChecks {
  buildableModules: boolean;
  widthAndOverlap: boolean;
  supportCoverage: boolean;
  minimumSupportCount: boolean;
  axleUtilisation: boolean;
  hydraulicBoundary: boolean;
  hydraulicStability: boolean;
}

export interface QuickRecommendationCandidate {
  descriptor: ArrangementDescriptor;
  checks: QuickRecommendationChecks;
  rejectionReasons: string[];
  maximumAxleUtilisation: number | null;
  minimumStabilityAngleDeg: number | null;
  availableSupportCount: number;
  provisionalPass: boolean;
}

export interface QuickArrangementRecommendation {
  kind: QuickRecommendationKind;
  label: string;
  description: string;
  candidate: QuickRecommendationCandidate | null;
  unavailableReason: string;
}

export interface QuickArrangementRecommendationSet {
  capacityLowerBoundAL: number;
  firstBuildableTotalAL: number | null;
  screenedCandidateCount: number;
  exactVerificationRequired: true;
  assumptions: string[];
  rejectionReasons: string[];
  recommendations: QuickArrangementRecommendation[];
}

const EPS = 1e-9;

function hydraulicModes(model: ProjectModel): HydraulicSystemMode[] {
  switch (model.arrangementOptimiser.hydraulicSearchMode) {
    case "THREE_POINT": return ["THREE_POINT"];
    case "FOUR_POINT": return ["FOUR_POINT"];
    case "BOTH":
    default: return ["THREE_POINT", "FOUR_POINT"];
  }
}

function metricPasses(result: ReturnType<typeof calculateStabilityProbe>): boolean {
  return [
    result.metrics.basicUtil,
    result.metrics.slopeUtil,
    result.metrics.dynamicUtil,
    result.metrics.basicAngle,
    result.metrics.slopeAngle,
    result.metrics.dynamicAngle,
    result.metrics.dynamicRatio,
  ].every((metric) => !metric.active || metric.status === "OK");
}

function finiteMinimum(values: Array<number | null>): number | null {
  const finite = values.filter((value): value is number => value !== null && Number.isFinite(value));
  return finite.length ? Math.min(...finite) : null;
}

function candidateKey(candidate: QuickRecommendationCandidate): string {
  const item = candidate.descriptor;
  return [
    item.trainCount,
    item.axleLinesPerTrain,
    item.pitchM.toFixed(6),
    item.hydraulicSystemMode,
  ].join("|");
}

function spacingDeviation(candidate: QuickRecommendationCandidate, preferredPitchM: number): number {
  return candidate.descriptor.trainCount === 1
    ? 0
    : Math.abs(candidate.descriptor.pitchM - preferredPitchM);
}

function recommendation(
  kind: QuickRecommendationKind,
  candidates: QuickRecommendationCandidate[],
  preferredPitchM: number,
): QuickArrangementRecommendation {
  const definitions: Record<QuickRecommendationKind, { label: string; description: string }> = {
    AL_FIRST: {
      label: "Minimum axle lines",
      description: "Lowest screened total AL; train count and preferred spacing break equal-AL ties.",
    },
    TRAIN_FIRST: {
      label: "Minimum trains",
      description: "Lowest screened train count; total AL remains visible and the exact solver still ranks AL first.",
    },
    BALANCED: {
      label: "Balanced shortlist",
      description: "Low total AL and train count with a small preference for the configured centre spacing.",
    },
  };
  const ranked = [...candidates];
  if (kind === "AL_FIRST") {
    ranked.sort((left, right) =>
      left.descriptor.totalAxleLines - right.descriptor.totalAxleLines ||
      left.descriptor.trainCount - right.descriptor.trainCount ||
      spacingDeviation(left, preferredPitchM) - spacingDeviation(right, preferredPitchM));
  } else if (kind === "TRAIN_FIRST") {
    ranked.sort((left, right) =>
      left.descriptor.trainCount - right.descriptor.trainCount ||
      left.descriptor.totalAxleLines - right.descriptor.totalAxleLines ||
      spacingDeviation(left, preferredPitchM) - spacingDeviation(right, preferredPitchM));
  } else {
    const minimumAL = Math.min(...ranked.map((item) => item.descriptor.totalAxleLines));
    const minimumTrains = Math.min(...ranked.map((item) => item.descriptor.trainCount));
    ranked.sort((left, right) => {
      const score = (candidate: QuickRecommendationCandidate) =>
        candidate.descriptor.totalAxleLines / Math.max(1, minimumAL) +
        candidate.descriptor.trainCount / Math.max(1, minimumTrains) +
        spacingDeviation(candidate, preferredPitchM) /
          Math.max(1, preferredPitchM) * 0.15;
      return score(left) - score(right) ||
        left.descriptor.totalAxleLines - right.descriptor.totalAxleLines ||
        left.descriptor.trainCount - right.descriptor.trainCount;
    });
  }
  const detail = definitions[kind];
  return {
    kind,
    ...detail,
    candidate: ranked[0] ?? null,
    unavailableReason: ranked.length
      ? ""
      : "No candidate in the bounded quick screen passed every necessary gate. Run the exact search or widen the configured bounds.",
  };
}

/**
 * Produces a small, calculation-backed planning shortlist. These candidates
 * are never treated as final passes: support reactions, pin/split search,
 * spine-beam response and the complete case order remain the responsibility of
 * the exact arrangement optimiser.
 */
export function quickArrangementRecommendations(
  inputModel: ProjectModel,
): QuickArrangementRecommendationSet {
  const model = applyArrangementEnvironmentalActions(inputModel).model;
  const settings = model.arrangementOptimiser;
  const definition = model.catalogue.find((item) => item.id === settings.trailerDefinitionId);
  const assumptions = [
    "Only buildable 4-, 5- and 6-AL module combinations inside the configured stock limits are considered.",
    "Supports are screened for deck coverage and available count; final active reactions are settled only by the exact solver.",
    "The preferred pitch and the widest permitted pitch are probed for each first-buildable train count.",
    "Any applied recommendation must pass the full optimiser, spine-beam and final support verification.",
  ];
  if (!definition) {
    const emptyKinds: QuickRecommendationKind[] = ["AL_FIRST", "TRAIN_FIRST", "BALANCED"];
    return {
      capacityLowerBoundAL: 4,
      firstBuildableTotalAL: null,
      screenedCandidateCount: 0,
      exactVerificationRequired: true,
      assumptions,
      rejectionReasons: ["The selected trailer is not present in the catalogue."],
      recommendations: emptyKinds.map((kind) => recommendation(kind, [], settings.preferredCentreSpacingM)),
    };
  }

  const trainCounts = Array.from(
    { length: Math.max(0, settings.maximumTrains - settings.minimumTrains + 1) },
    (_, index) => settings.minimumTrains + index,
  );
  const lowerBounds = trainCounts.map((trainCount) =>
    minimumTotalAxleLines(model, settings, trainCount));
  const capacityLowerBoundAL = lowerBounds.length ? Math.min(...lowerBounds) : 4;
  const supportAxleLowerBound = minimumAxleLinesPerTrainForSupports(model, settings);
  const configuredAxleUtilisationLimit =
    typeof model.optimiser.maximumAxleUtilisation === "number"
      ? model.optimiser.maximumAxleUtilisation
      : null;
  const candidates: QuickRecommendationCandidate[] = [];
  const rejected: string[] = [];
  const firstBuildableTotals: number[] = [];

  trainCounts.forEach((trainCount, trainIndex) => {
    const capacityLowerBound = lowerBounds[trainIndex];
    const minimumPerTrain = Math.max(
      Math.ceil(capacityLowerBound / trainCount),
      supportAxleLowerBound,
    );
    const firstBuildable = validAxleLineValues(settings, trainCount, minimumPerTrain)[0];
    if (!firstBuildable) {
      rejected.push(
        `${trainCount} train${trainCount === 1 ? "" : "s"}: no allowed 4/5/6-AL composition meets the capacity, support-span, per-train and stock bounds.`,
      );
      return;
    }
    firstBuildableTotals.push(firstBuildable.axleLines * trainCount);
    const pitchBounds = formationPitchBounds(definition, settings, trainCount, model.cargo.widthM);
    if (!pitchBounds) {
      rejected.push(
        `${trainCount} train${trainCount === 1 ? "" : "s"}: the formation cannot fit inside the configured width/search horizon at minimum clearance.`,
      );
      return;
    }
    const pitchSeeds = mathematicalPitchSeeds(
      definition,
      settings,
      trainCount,
      model.cargo.widthM,
    ).filter((pitchM, index, values) =>
      index === 0 ||
      Math.abs(pitchM - pitchBounds.maximumPitchM) <= EPS ||
      (values.length === 1 && index === 0));

    for (const hydraulicSystemMode of hydraulicModes(model)) {
      for (const pitchM of pitchSeeds.slice(0, 2)) {
        const descriptor = createArrangementDescriptor(
          definition,
          settings,
          trainCount,
          firstBuildable.composition,
          pitchM,
          [],
          hydraulicSystemMode,
        );
        const result = calculateStabilityProbe(applyArrangementDescriptor(model, descriptor));
        const maximumAxleUtilisation = result.groundBearing.groups.reduce<number | null>(
          (maximum, group) => group.maximumUtilisation === null
            ? maximum
            : maximum === null
              ? group.maximumUtilisation
              : Math.max(maximum, group.maximumUtilisation),
          null,
        );
        const allowedSupportCount = result.supports.filter((support) => support.allowed).length;
        const expectedBoundaryPoints = hydraulicSystemMode === "FOUR_POINT" ? 4 : 3;
        const checks: QuickRecommendationChecks = {
          buildableModules: true,
          widthAndOverlap: result.trailerOverlaps.length === 0 &&
            descriptor.overallWidthM <= pitchBounds.effectiveMaximumFormationWidthM + EPS,
          supportCoverage: result.failClass !== "SUPPORT_OUTSIDE_TRAILER",
          minimumSupportCount: allowedSupportCount >= model.optimiser.minimumActiveSupports,
          axleUtilisation: maximumAxleUtilisation !== null &&
            (configuredAxleUtilisationLimit === null ||
              maximumAxleUtilisation <= configuredAxleUtilisationLimit + EPS),
          hydraulicBoundary: result.stabilityPolygon.length === expectedBoundaryPoints &&
            result.groupingQuality.populatedGroupCount === expectedBoundaryPoints,
          hydraulicStability: metricPasses(result),
        };
        const rejectionReasons = [
          !checks.widthAndOverlap ? "Trailer footprints overlap or violate the available formation width." : "",
          !checks.supportCoverage ? "One or more allowed packing supports lie outside the analysed trailer deck." : "",
          !checks.minimumSupportCount
            ? `Only ${allowedSupportCount} allowed supports are available; ${model.optimiser.minimumActiveSupports} are required before reaction settling.`
            : "",
          !checks.axleUtilisation
            ? maximumAxleUtilisation === null
              ? "Axle utilisation could not be calculated."
              : `Screened axle utilisation ${(maximumAxleUtilisation * 100).toFixed(1)}% exceeds the configured ${((configuredAxleUtilisationLimit ?? 1) * 100).toFixed(1)}% limit.`
            : "",
          !checks.hydraulicBoundary
            ? `The ${hydraulicSystemMode === "FOUR_POINT" ? "four-point polygon" : "three-point triangle"} is missing or degenerate.`
            : "",
          !checks.hydraulicStability ? "At least one basic, slope or dynamic stability limit fails the quick probe." : "",
        ].filter(Boolean);
        candidates.push({
          descriptor,
          checks,
          rejectionReasons,
          maximumAxleUtilisation,
          minimumStabilityAngleDeg: finiteMinimum([
            result.metrics.basicAngle.value,
            result.metrics.slopeAngle.value,
            result.metrics.dynamicAngle.value,
          ]),
          availableSupportCount: allowedSupportCount,
          provisionalPass: rejectionReasons.length === 0,
        });
      }
    }
  });

  const uniqueCandidates = [
    ...new Map(candidates.map((candidate) => [candidateKey(candidate), candidate])).values(),
  ];
  const provisional = uniqueCandidates.filter((candidate) => candidate.provisionalPass);
  const candidateReasons = uniqueCandidates
    .flatMap((candidate) => candidate.rejectionReasons.map((reason) =>
      `${candidate.descriptor.trainCount} train${candidate.descriptor.trainCount === 1 ? "" : "s"}, ${candidate.descriptor.axleLinesPerTrain} AL/train, ${candidate.descriptor.hydraulicSystemMode === "FOUR_POINT" ? "4-point" : "3-point"}: ${reason}`));

  return {
    capacityLowerBoundAL,
    firstBuildableTotalAL: firstBuildableTotals.length ? Math.min(...firstBuildableTotals) : null,
    screenedCandidateCount: uniqueCandidates.length,
    exactVerificationRequired: true,
    assumptions,
    rejectionReasons: [...new Set([...rejected, ...candidateReasons])].slice(0, 12),
    recommendations: (["AL_FIRST", "TRAIN_FIRST", "BALANCED"] as QuickRecommendationKind[])
      .map((kind) => recommendation(kind, provisional, settings.preferredCentreSpacingM)),
  };
}
