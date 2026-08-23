import type {
  ArrangementDescriptor,
  ArrangementOptimiserSettings,
  CargoSupport,
  HydraulicGrouping,
  HydraulicSystemMode,
  ProjectModel,
  TrailerDefinition,
  TrailerInput,
} from "./types";
import { cargoCogEnvelopeGuidance } from "./cargo-envelope";

export interface ModuleComposition {
  modules4: number;
  modules5: number;
  modules6: number;
  axleLines: number;
  moduleCount: number;
}

export interface ArrangementIssue {
  id: string;
  severity: "blocking" | "warning";
  title: string;
  detail: string;
}

export interface FormationPitchBounds {
  minimumPitchM: number;
  maximumPitchM: number;
  preferredPitchM: number;
  effectiveMaximumFormationWidthM: number;
}

const EPS = 1e-9;
/** Fixed clear gap required between neighbouring trailer trains. */
export const MINIMUM_TRAIN_CLEARANCE_M = 0.47;

function integer(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.max(minimum, Math.min(maximum, Math.round(value)));
}

function selectedDefinition(
  model: ProjectModel,
  settings: ArrangementOptimiserSettings,
): TrailerDefinition | undefined {
  return model.catalogue.find((item) => item.id === settings.trailerDefinitionId);
}

export function moduleCompositions(
  axleLines: number,
  settings: ArrangementOptimiserSettings,
  trainCount = 1,
): ModuleComposition[] {
  const target = integer(axleLines, 1, 99);
  const trains = integer(trainCount, 1, 12);
  const results: ModuleComposition[] = [];
  const maximum4 = settings.allow4AxleModules ? Math.floor(target / 4) : 0;
  const maximum5 = settings.allow5AxleModules ? Math.floor(target / 5) : 0;
  const maximum6 = settings.allow6AxleModules ? Math.floor(target / 6) : 0;

  for (let modules4 = 0; modules4 <= maximum4; modules4 += 1) {
    for (let modules5 = 0; modules5 <= maximum5; modules5 += 1) {
      for (let modules6 = 0; modules6 <= maximum6; modules6 += 1) {
        if (modules4 * 4 + modules5 * 5 + modules6 * 6 !== target) continue;
        if (modules4 + modules5 + modules6 === 0) continue;
        if (
          settings.limitModuleAvailability &&
          (modules4 * trains > settings.available4AxleModules ||
            modules5 * trains > settings.available5AxleModules ||
            modules6 * trains > settings.available6AxleModules)
        ) {
          continue;
        }
        results.push({
          modules4,
          modules5,
          modules6,
          axleLines: target,
          moduleCount: modules4 + modules5 + modules6,
        });
      }
    }
  }

  return results.sort(
    (left, right) =>
      left.moduleCount - right.moduleCount ||
      right.modules6 - left.modules6 ||
      right.modules5 - left.modules5 ||
      right.modules4 - left.modules4,
  );
}

export function bestModuleComposition(
  axleLines: number,
  settings: ArrangementOptimiserSettings,
  trainCount = 1,
): ModuleComposition | null {
  return moduleCompositions(axleLines, settings, trainCount)[0] ?? null;
}

export function validAxleLineValues(
  settings: ArrangementOptimiserSettings,
  trainCount: number,
  minimumAxleLines = 4,
): Array<{ axleLines: number; composition: ModuleComposition }> {
  const result: Array<{ axleLines: number; composition: ModuleComposition }> = [];
  const maximum = integer(settings.maximumAxleLinesPerTrain, 4, 99);
  for (let axleLines = Math.max(4, Math.ceil(minimumAxleLines)); axleLines <= maximum; axleLines += 1) {
    const composition = bestModuleComposition(axleLines, settings, trainCount);
    if (composition) result.push({ axleLines, composition });
  }
  return result;
}

/**
 * Optimistic static-capacity lower bound. Exact dynamic, hydraulic, support and
 * beam checks still run for every candidate retained by the arrangement search.
 */
export function minimumTotalAxleLines(
  model: ProjectModel,
  settings: ArrangementOptimiserSettings,
  trainCount = settings.minimumTrains,
): number {
  const definition = selectedDefinition(model, settings);
  if (!definition) return 4;
  const trains = integer(trainCount, 1, 12);
  const carriedMassT =
    model.cargo.massT +
    model.packing.massT +
    model.loosePacking.reduce((sum, item) => sum + Math.max(0, item.massT), 0);
  const utilisationLimit =
    typeof model.optimiser.maximumAxleUtilisation === "number"
      ? Math.max(EPS, model.optimiser.maximumAxleUtilisation)
      : 1;
  const ppuCountPerTrain = settings.ppuPosition === "NONE"
    ? 0
    : settings.ppuPosition === "BOTH"
      ? 2
      : 1;
  const ppuMassT = Math.max(0, definition.ppuWeightT ?? 0) * trains * ppuCountPerTrain;
  const netCapacityPerLine =
    definition.axleCapacityT * utilisationLimit - definition.axleWeightT;
  if (!(netCapacityPerLine > EPS)) return settings.maximumAxleLinesPerTrain * settings.maximumTrains;
  return Math.max(4, Math.ceil((carriedMassT + ppuMassT) / netCapacityPerLine));
}

/**
 * Exact deck-length lower bound for the packing/support footprint. The
 * calculation engine requires every allowed support (up to the workbook's ten
 * support rows) to remain on the analysed trailer deck. Any shorter formation
 * is therefore impossible regardless of split, hydraulic mode or trailer X.
 */
export function minimumAxleLinesPerTrainForSupports(
  model: ProjectModel,
  settings: ArrangementOptimiserSettings,
): number {
  const definition = selectedDefinition(model, settings);
  if (!definition || !(definition.axleSpacingM > EPS)) return 4;
  const supports = model.supports
    .filter((support) => support.allowed && Number.isFinite(support.xM))
    .slice(0, 10);
  if (!supports.length) return 4;
  const rearEdgeM = Math.min(
    ...supports.map((support) => support.xM - Math.max(0, support.widthM) / 2),
  );
  const frontEdgeM = Math.max(
    ...supports.map((support) => support.xM + Math.max(0, support.widthM) / 2),
  );
  const requiredDeckLengthM = Math.max(0, frontEdgeM - rearEdgeM);
  return Math.max(
    4,
    Math.ceil((requiredDeckLengthM - EPS) / definition.axleSpacingM),
  );
}

export function effectiveMaximumFormationWidth(
  settings: ArrangementOptimiserSettings,
  cargoWidthM?: number,
): number {
  const configured = Math.max(0, settings.maximumFormationWidthM);
  const limits: number[] = [];
  if (settings.enforceMaximumFormationWidth) limits.push(configured);
  if (
    settings.limitFormationWidthToCargo &&
    cargoWidthM !== undefined &&
    Number.isFinite(cargoWidthM) &&
    cargoWidthM > 0
  ) {
    limits.push(cargoWidthM);
  }
  return limits.length ? Math.min(...limits) : Number.POSITIVE_INFINITY;
}

/**
 * Finite spacing-search boundary used when no hard overall-width rule is active.
 * It is a computational horizon only; it does not make a candidate fail.
 */
export function formationSearchMaximumWidth(
  settings: ArrangementOptimiserSettings,
  cargoWidthM?: number,
): number {
  const hardMaximum = effectiveMaximumFormationWidth(settings, cargoWidthM);
  if (Number.isFinite(hardMaximum)) return hardMaximum;
  return Math.max(
    Math.max(0, settings.maximumFormationWidthM),
    Math.max(0, settings.searchMaximumFormationWidthM),
  );
}

/** Exact geometric pitch limits for equal, symmetric parallel trains. */
export function formationPitchBounds(
  definition: TrailerDefinition,
  settings: ArrangementOptimiserSettings,
  trainCount: number,
  cargoWidthM?: number,
): FormationPitchBounds | null {
  const trains = integer(trainCount, 1, 12);
  const effectiveMaximumWidth = formationSearchMaximumWidth(settings, cargoWidthM);
  if (trains === 1) {
    if (definition.trailerWidthM > effectiveMaximumWidth + EPS) return null;
    return {
      minimumPitchM: 0,
      maximumPitchM: 0,
      preferredPitchM: 0,
      effectiveMaximumFormationWidthM: effectiveMaximumWidth,
    };
  }
  const minimumPitchM = definition.trailerWidthM + MINIMUM_TRAIN_CLEARANCE_M;
  const maximumPitchM =
    (effectiveMaximumWidth - definition.trailerWidthM) /
    (trains - 1);
  if (maximumPitchM + EPS < minimumPitchM) return null;
  return {
    minimumPitchM,
    maximumPitchM,
    effectiveMaximumFormationWidthM: effectiveMaximumWidth,
    preferredPitchM: Math.max(
      minimumPitchM,
      Math.min(maximumPitchM, settings.preferredCentreSpacingM),
    ),
  };
}

/**
 * Preferred pitch plus the two exact geometric limits. These establish the
 * branch-and-bound brackets without stepping through the complete Y range.
 */
export function mathematicalPitchSeeds(
  definition: TrailerDefinition,
  settings: ArrangementOptimiserSettings,
  trainCount: number,
  cargoWidthM?: number,
): number[] {
  const bounds = formationPitchBounds(definition, settings, trainCount, cargoWidthM);
  if (!bounds) return [];
  return [...new Set([
    bounds.preferredPitchM,
    bounds.maximumPitchM,
    bounds.minimumPitchM,
  ].map((value) => Math.round(value * 1e9) / 1e9))];
}

export function spacingCandidates(
  definition: TrailerDefinition,
  settings: ArrangementOptimiserSettings,
  trainCount: number,
  cargoWidthM?: number,
): number[] {
  const trains = integer(trainCount, 1, 12);
  if (trains === 1) return [0];
  const bounds = formationPitchBounds(definition, settings, trains, cargoWidthM);
  if (!bounds) return [];
  const minimumPitch = bounds.minimumPitchM;
  const maximumPitch = bounds.maximumPitchM;
  const count = integer(settings.spacingSamples, 2, 7);
  if (Math.abs(maximumPitch - minimumPitch) < EPS) return [maximumPitch];
  const values = Array.from(
    { length: count },
    (_, index) => minimumPitch + ((maximumPitch - minimumPitch) * index) / (count - 1),
  );
  const preferredPitch = bounds.preferredPitchM;
  values.push(preferredPitch);
  // The standard 2.9 m pitch (or the configured equivalent) is tried first.
  // Formation ranking is based on total axle lines before train count, so a
  // multi-train solution is retained whenever it can use fewer total AL.
  return [...new Set(values.map((value) => Math.round(value * 1e6) / 1e6))].sort(
    (left, right) =>
      Math.abs(left - settings.preferredCentreSpacingM) -
        Math.abs(right - settings.preferredCentreSpacingM) ||
      right - left,
  );
}

export function createArrangementDescriptor(
  definition: TrailerDefinition,
  settings: ArrangementOptimiserSettings,
  trainCount: number,
  composition: ModuleComposition,
  pitchM: number,
  longitudinalOffsetsM: number[] = [],
  hydraulicSystemMode?: HydraulicSystemMode,
): ArrangementDescriptor {
  const trains = integer(trainCount, 1, 12);
  const pitch = trains === 1 ? 0 : Math.max(0, pitchM);
  const overallWidthM = definition.trailerWidthM + Math.max(0, trains - 1) * pitch;
  const offsets = Array.from(
    { length: trains },
    (_, index) => Number.isFinite(longitudinalOffsetsM[index]) ? longitudinalOffsetsM[index] : 0,
  );
  const minimumOffset = Math.min(...offsets);
  const maximumOffset = Math.max(...offsets);
  return {
    trailerDefinitionId: definition.id,
    trainCount: trains,
    axleLinesPerTrain: composition.axleLines,
    totalAxleLines: composition.axleLines * trains,
    modules4: composition.modules4,
    modules5: composition.modules5,
    modules6: composition.modules6,
    moduleCountPerTrain: composition.moduleCount,
    pitchM: pitch,
    clearanceM: trains === 1 ? 0 : Math.max(0, pitch - definition.trailerWidthM),
    overallWidthM,
    ppuPosition: settings.ppuPosition,
    hydraulicSystemMode,
    formationMode: maximumOffset - minimumOffset > EPS ? "STAGGERED" : "INLINE",
    longitudinalOffsetsM: offsets,
    longitudinalSpanM: maximumOffset - minimumOffset,
  };
}

/**
 * Longitudinal COG of the cargo plus declared packing, using the same rear
 * datum convention as the engineering engine. Loose packing is deliberately
 * excluded because its rows redistribute the declared packing mass for the
 * beam check rather than adding a second copy of that mass.
 */
export function payloadCogX(model: ProjectModel): number {
  const cargoMass = Math.max(0, model.cargo.massT);
  const packingMass = Math.max(0, model.packing.massT);
  const total = cargoMass + packingMass;
  const cargoX = model.cargo.extremeX + model.cargo.cog.x;
  const packingX = model.cargo.extremeX + model.packing.cog.x;
  return total > EPS
    ? (cargoMass * cargoX + packingMass * packingX) / total
    : model.cargo.extremeX + model.cargo.lengthM / 2;
}

/**
 * Produces a transparent, user-editable, equally spaced support layout. The
 * first and last supports sit inside the cargo extremes, so every generated
 * count brackets any valid cargo-and-packing COG.
 */
export function recommendedPackingSupports(
  model: ProjectModel,
  supportWidthM = 0.5,
  supportCount = 4,
): CargoSupport[] {
  const lengthM = Math.max(0, model.cargo.lengthM);
  const widthM = Math.max(0.001, Math.min(supportWidthM, Math.max(0.001, lengthM / 5)));
  const minimumX = model.cargo.extremeX + widthM / 2;
  const maximumX = model.cargo.extremeX + lengthM - widthM / 2;
  const centreX = (minimumX + maximumX) / 2;
  const count = Math.max(2, Math.min(10, Math.round(supportCount)));
  const proposed = maximumX > minimumX
    ? Array.from({ length: count }, (_, index) =>
        minimumX + (index / Math.max(1, count - 1)) * (maximumX - minimumX))
    : Array.from({ length: count }, () => centreX);
  return proposed.map((xM, index) => ({
    id: `recommended-support-${index + 1}`,
    xM,
    widthM,
    allowed: true,
    active: true,
    positiveConnectionToDeck: false,
  }));
}

export function applyArrangementEnvironmentalActions(model: ProjectModel): {
  model: ProjectModel;
  reduced: boolean;
  detail: string;
} {
  const settings = model.arrangementOptimiser;
  if (!settings.allowReducedEnvironmentalActions) {
    return {
      model: {
        ...model,
        arrangementOptimiser: {
          ...settings,
          reducedEnvironmentalActionsAccepted: false,
        },
      },
      reduced: false,
      detail: "Project wind and acceleration values retained.",
    };
  }
  const nextWind = Math.max(0, settings.searchWindSpeedMps);
  const nextLongitudinal = Math.max(0, settings.searchLongitudinalAccelerationMps2);
  const nextTransverse = Math.max(0, settings.searchTransverseAccelerationMps2);
  const reduced = settings.reducedEnvironmentalActionsAccepted ||
    nextWind < model.environment.windSpeedMps - EPS ||
    nextLongitudinal < model.environment.longitudinalAccelerationMps2 - EPS ||
    nextTransverse < model.environment.transverseAccelerationMps2 - EPS;
  return {
    model: {
      ...model,
      engineeringDegree: reduced ? "Third" : model.engineeringDegree,
      arrangementOptimiser: {
        ...settings,
        reducedEnvironmentalActionsAccepted: reduced,
      },
      environment: {
        ...model.environment,
        windSpeedMps: nextWind,
        longitudinalAccelerationMps2: nextLongitudinal,
        transverseAccelerationMps2: nextTransverse,
      },
    },
    reduced,
    detail: `${reduced ? "Reduced actions accepted; Third-degree verification required" : "Search action override applied without reduction"}: wind ${nextWind.toFixed(3)} m/s, longitudinal acceleration ${nextLongitudinal.toFixed(3)} m/s², transverse acceleration ${nextTransverse.toFixed(3)} m/s².`,
  };
}

/**
 * Bounded non-inline templates. The optimiser checks aligned trains plus
 * mirrored linear and alternating stagger patterns instead of expanding an
 * independent X grid for every train.
 */
export function longitudinalOffsetCandidates(
  settings: ArrangementOptimiserSettings,
  trainCount: number,
): number[][] {
  const trains = integer(trainCount, 1, 12);
  const aligned = Array.from({ length: trains }, () => 0);
  if (settings.formationMode !== "ALLOW_STAGGERED" || trains < 2) return [aligned];
  const maximum = Math.max(0, settings.maximumLongitudinalStaggerM);
  const samples = integer(settings.longitudinalStaggerSamples, 1, 7);
  if (maximum <= EPS) return [aligned];
  const candidates: number[][] = [aligned];
  for (let sample = 1; sample <= samples; sample += 1) {
    const span = (maximum * sample) / samples;
    const linear = Array.from(
      { length: trains },
      (_, index) => ((index / (trains - 1)) - 0.5) * span,
    );
    candidates.push(linear, linear.map((value) => -value));
  }
  const normalised = candidates.map((candidate) => {
    const mean = candidate.reduce((sum, value) => sum + value, 0) / candidate.length;
    return candidate.map((value) => Math.round((value - mean) * 1e6) / 1e6);
  });
  return [...new Map(normalised.map((candidate) => [candidate.join(","), candidate])).values()];
}

function groupingForTrain(
  index: number,
  trainCount: number,
  axleLines: number,
  fourPoint: boolean,
): HydraulicGrouping {
  const splitAfterAxleLine = Math.max(1, Math.min(axleLines - 1, Math.round(axleLines / 3)));
  const relative = index - (trainCount - 1) / 2;
  const lower = relative < -EPS;
  const upper = relative > EPS;
  if (fourPoint) {
    const rearLeft = lower ? 1 : upper ? 2 : 1;
    const rearRight = lower ? 1 : upper ? 2 : 2;
    const frontLeft = lower ? 3 : upper ? 4 : 3;
    const frontRight = lower ? 3 : upper ? 4 : 4;
    return {
      splitAfterAxleLine,
      groups: Array.from(
        { length: axleLines },
        (_, axleIndex) => axleIndex < splitAfterAxleLine ? rearLeft : frontLeft,
      ),
      cornerGroups: { rearLeft, rearRight, frontLeft, frontRight },
      pinnedAxleLines: [],
    };
  }
  const frontLeft = lower ? 2 : upper ? 3 : 2;
  const frontRight = lower ? 2 : upper ? 3 : 3;
  return {
    splitAfterAxleLine,
    groups: Array.from(
      { length: axleLines },
      (_, axleIndex) => axleIndex < splitAfterAxleLine ? 1 : frontLeft,
    ),
    cornerGroups: {
      rearLeft: 1,
      rearRight: 1,
      frontLeft,
      frontRight,
    },
    pinnedAxleLines: [],
  };
}

export function applyArrangementDescriptor(
  base: ProjectModel,
  descriptor: ArrangementDescriptor,
): ProjectModel {
  const definition = base.catalogue.find((item) => item.id === descriptor.trailerDefinitionId);
  if (!definition) return base;
  const trainLengthM = definition.axleSpacingM * descriptor.axleLinesPerTrain;
  const centreXOffset = -trainLengthM / 2;
  const loadCentreY = base.cargo.extremeY + base.cargo.widthM / 2;
  const loadCentreX = base.cargo.extremeX + base.cargo.lengthM / 2;
  const trailers: TrailerInput[] = [];
  const groupings: HydraulicGrouping[] = [];
  const hydraulicSystemMode = descriptor.hydraulicSystemMode ?? base.hydraulicSystemMode;
  for (let index = 0; index < descriptor.trainCount; index += 1) {
    const transverseOffset = (index - (descriptor.trainCount - 1) / 2) * descriptor.pitchM;
    const longitudinalOffset = descriptor.longitudinalOffsetsM[index] ?? 0;
    trailers.push({
      id: `arranged-train-${index + 1}`,
      definitionId: descriptor.trailerDefinitionId,
      axleLines: descriptor.axleLinesPerTrain,
      singleFile: false,
      xM: loadCentreX + centreXOffset + longitudinalOffset,
      yM: loadCentreY + transverseOffset,
      formationOffsetXM: longitudinalOffset,
      placementReference: "ALL_INCLUSIVE_COG",
      offsetFromReference: { x: centreXOffset + longitudinalOffset, y: transverseOffset },
      ppuLeft: descriptor.ppuPosition === "REAR" || descriptor.ppuPosition === "BOTH",
      ppuRight: descriptor.ppuPosition === "FRONT" || descriptor.ppuPosition === "BOTH",
      enabled: true,
    });
    groupings.push(
      groupingForTrain(
        index,
        descriptor.trainCount,
        descriptor.axleLinesPerTrain,
        hydraulicSystemMode === "FOUR_POINT",
      ),
    );
  }
  return {
    ...base,
    trailers,
    groupings,
    hydraulicSystemMode,
    analysedTrailer: 1,
    optimiser: {
      ...base.optimiser,
      c89Start: descriptor.axleLinesPerTrain,
      c89Maximum: descriptor.axleLinesPerTrain,
      c89Step: 1,
      d138Start: 1,
      d138Step: Math.max(1, Math.round(base.optimiser.d138Step)),
      e89RangeMode: "AUTO_GROUP_CENTRES",
      existingPinsPolicy: "REARRANGE",
    },
  };
}

export function collectArrangementIssues(
  model: ProjectModel,
  settings: ArrangementOptimiserSettings,
): ArrangementIssue[] {
  const issues: ArrangementIssue[] = [];
  const definition = selectedDefinition(model, settings);
  const allowedSupportXs = model.supports
    .filter((support) => support.allowed && Number.isFinite(support.xM))
    .map((support) => support.xM);
  if (allowedSupportXs.length >= 2) {
    const loadX = payloadCogX(model);
    const rearSupportX = Math.min(...allowedSupportXs);
    const frontSupportX = Math.max(...allowedSupportXs);
    if (loadX <= rearSupportX + EPS || loadX >= frontSupportX - EPS) {
      issues.push({
        id: "support-cog-bracketing",
        severity: "warning",
        title: "Packing supports do not bracket the payload COG",
        detail: `The cargo-and-packing COG is at X ${loadX.toFixed(3)} m, while allowed support centres span X ${rearSupportX.toFixed(3)} to ${frontSupportX.toFixed(3)} m. Support settling is likely to leave only one active support. Confirm the physical packing positions or use the COG-spanning support proposal.`,
      });
    }
  }
  if (!["MATHEMATICAL_BRANCH_BOUND", "ADAPTIVE_BOUNDED", "LEGACY_GRID"].includes(settings.searchMode)) {
    issues.push({
      id: "search-mode",
      severity: "blocking",
      title: "Select a valid arrangement search mode",
      detail: "Use mathematical branch-and-bound, legacy bounded search or the legacy grid search.",
    });
  }
  if (!definition) {
    issues.push({
      id: "catalogue-model",
      severity: "blocking",
      title: "Select a valid trailer model",
      detail: "The selected catalogue trailer is unavailable or incomplete.",
    });
  }
  if (!(["BOTH", "THREE_POINT", "FOUR_POINT"] as const).includes(settings.hydraulicSearchMode)) {
    issues.push({
      id: "hydraulic-search-mode",
      severity: "blocking",
      title: "Hydraulic search mode is invalid",
      detail: "Search both systems, three-point only, or four-point only.",
    });
  }
  if (!settings.allow4AxleModules && !settings.allow5AxleModules && !settings.allow6AxleModules) {
    issues.push({
      id: "module-sizes",
      severity: "blocking",
      title: "Select at least one module size",
      detail: "Automatic arrangements can use 4-, 5- and 6-axle-line SPMT modules only.",
    });
  }
  if (
    !Number.isInteger(settings.minimumTrains) ||
    !Number.isInteger(settings.maximumTrains) ||
    settings.minimumTrains < 1 ||
    settings.maximumTrains > 12 ||
    settings.minimumTrains > settings.maximumTrains
  ) {
    issues.push({
      id: "train-range",
      severity: "blocking",
      title: "Train-count range is invalid",
      detail: "Use a whole-number range between one and twelve trains.",
    });
  }
  if (!(settings.preferredCentreSpacingM > 0)) {
    issues.push({
      id: "preferred-spacing",
      severity: "blocking",
      title: "Enter a valid preferred centre spacing",
      detail: "The standard centre-to-centre spacing must be greater than zero.",
    });
  }
  if (!Number.isInteger(settings.maximumAxleLinesPerTrain) || settings.maximumAxleLinesPerTrain < 4) {
    issues.push({
      id: "maximum-axle-lines",
      severity: "blocking",
      title: "Maximum axle lines is invalid",
      detail: "Allow at least four axle lines per train.",
    });
  }
  if (
    !(settings.maximumFormationWidthM > 0) ||
    !(settings.searchMaximumFormationWidthM > 0)
  ) {
    issues.push({
      id: "formation-width",
      severity: "blocking",
      title: "Formation-width limits are invalid",
      detail: `Enter positive hard/search width values. The inter-train clearance is fixed at ${MINIMUM_TRAIN_CLEARANCE_M.toFixed(2)} m.`,
    });
  }
  if (!(settings.spacingToleranceM > 0)) {
    issues.push({
      id: "spacing-tolerance",
      severity: "blocking",
      title: "Spacing tolerance is invalid",
      detail: "Enter a positive fine-spacing tolerance.",
    });
  }
  if (
    !["INLINE_ONLY", "ALLOW_STAGGERED"].includes(settings.formationMode) ||
    !(settings.maximumLongitudinalStaggerM >= 0) ||
    !Number.isInteger(settings.longitudinalStaggerSamples) ||
    settings.longitudinalStaggerSamples < 1 ||
    settings.longitudinalStaggerSamples > 7
  ) {
    issues.push({
      id: "longitudinal-formation",
      severity: "blocking",
      title: "Longitudinal formation search is invalid",
      detail: "Select in-line or bounded staggered formations, a non-negative stagger and 1–7 template samples.",
    });
  }
  if (
    settings.allowReducedEnvironmentalActions &&
    [
      settings.searchWindSpeedMps,
      settings.searchLongitudinalAccelerationMps2,
      settings.searchTransverseAccelerationMps2,
    ].some((value) => !Number.isFinite(value) || value < 0)
  ) {
    issues.push({
      id: "reduced-actions",
      severity: "blocking",
      title: "Reduced environmental actions are invalid",
      detail: "Wind speed and both acceleration values must be finite and non-negative.",
    });
  }
  if (
    settings.limitModuleAvailability &&
    [
      settings.available4AxleModules,
      settings.available5AxleModules,
      settings.available6AxleModules,
    ].some((value) => !Number.isInteger(value) || value < 0)
  ) {
    issues.push({
      id: "module-availability",
      severity: "blocking",
      title: "Module availability is invalid",
      detail: "Availability values must be zero or positive whole numbers.",
    });
  }
  if (model.supports.filter((support) => support.allowed).length < model.optimiser.minimumActiveSupports) {
    issues.push({
      id: "supports",
      severity: "blocking",
      title: "Too few supports are available",
      detail: `At least ${model.optimiser.minimumActiveSupports} supports must be allowed before arrangement searching can start.`,
    });
  }
  if (!(model.cargo.massT > 0) || !(model.cargo.lengthM > 0) || !(model.cargo.widthM > 0)) {
    issues.push({
      id: "cargo",
      severity: "blocking",
      title: "Cargo definition is incomplete",
      detail: "Enter positive cargo mass, length and width values in case setup.",
    });
  }
  if (!model.cargo.name.trim()) {
    issues.push({
      id: "case-name",
      severity: "blocking",
      title: "Enter a case or cargo name",
      detail: "The mathematical arrangement run needs a reference that can be used in its case log.",
    });
  }
  const cargo = model.cargo;
  cargoCogEnvelopeGuidance(cargo).warnings.forEach((detail, index) => {
    issues.push({
      id: `cargo-envelope-guidance-${index}`,
      severity: "warning",
      title: cargo.autoCogEnvelopeFromCargo
        ? "Automatic COG-envelope minimum applied"
        : "Manual COG-envelope override is below the advised value",
      detail,
    });
  });
  if (cargo.envelopeX < 0 || cargo.envelopeY < 0) {
    issues.push({
      id: "cargo-envelope-negative",
      severity: "blocking",
      title: "Cargo COG envelope cannot be negative",
      detail: "Enter zero or a positive X and Y uncertainty envelope.",
    });
  }
  if (
    cargo.cog.x < cargo.extremeX - EPS ||
    cargo.cog.x > cargo.extremeX + cargo.lengthM + EPS ||
    cargo.cog.y < cargo.extremeY - EPS ||
    cargo.cog.y > cargo.extremeY + cargo.widthM + EPS ||
    cargo.cog.z < -EPS ||
    cargo.cog.z > cargo.heightM + EPS
  ) {
    issues.push({
      id: "cargo-cog",
      severity: "blocking",
      title: "Cargo COG is outside the cargo envelope",
      detail: "Enter a cargo COG within its defined length, width and height.",
    });
  }
  if (
    !(model.trailerDeckHeightM > 0) ||
    !(model.packing.massT >= 0) ||
    !(model.packing.heightM >= 0) ||
    ![model.packing.cog.x, model.packing.cog.y, model.packing.cog.z].every(Number.isFinite)
  ) {
    issues.push({
      id: "packing",
      severity: "blocking",
      title: "Packing or deck definition is incomplete",
      detail: "Enter non-negative packing values and a positive trailer deck height.",
    });
  }
  if (definition && settings.ppuPosition !== "NONE" && !(definition.ppuWeightT !== null && definition.ppuWeightT >= 0)) {
    issues.push({
      id: "ppu-data",
      severity: "blocking",
      title: "Selected trailer has no usable PPU mass",
      detail: "Choose no PPU or select a catalogue trailer with verified PPU data.",
    });
  }
  if (definition) {
    const effectiveMaximumWidth = effectiveMaximumFormationWidth(
      settings,
      model.cargo.widthM,
    );
    const widestMinimum =
      definition.trailerWidthM +
      Math.max(0, settings.minimumTrains - 1) *
        (definition.trailerWidthM + MINIMUM_TRAIN_CLEARANCE_M);
    if (Number.isFinite(effectiveMaximumWidth) && widestMinimum > effectiveMaximumWidth + EPS) {
      issues.push({
        id: "minimum-formation-width",
        severity: "blocking",
        title: "The minimum formation does not fit",
        detail: settings.limitFormationWidthToCargo
          ? `The selected minimum train count needs at least ${widestMinimum.toFixed(3)} m overall width, but the active cargo-width limit is ${effectiveMaximumWidth.toFixed(3)} m.`
          : `The selected minimum train count needs at least ${widestMinimum.toFixed(3)} m overall width.`,
      });
    }
  }
  return issues;
}

export function arrangementSummary(descriptor: ArrangementDescriptor): string {
  const modules = [
    descriptor.modules6 ? `${descriptor.modules6}×6` : "",
    descriptor.modules5 ? `${descriptor.modules5}×5` : "",
    descriptor.modules4 ? `${descriptor.modules4}×4` : "",
  ].filter(Boolean).join(" + ");
  return `${descriptor.trainCount} train${descriptor.trainCount === 1 ? "" : "s"}; ${descriptor.axleLinesPerTrain} AL/train (${modules}); ${descriptor.totalAxleLines} AL total; ${descriptor.overallWidthM.toFixed(3)} m wide; ${descriptor.formationMode === "STAGGERED" ? `${descriptor.longitudinalSpanM.toFixed(3)} m longitudinal stagger` : "in-line"}`;
}
