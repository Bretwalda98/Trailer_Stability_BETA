import type {
  ArrangementDescriptor,
  ArrangementOptimiserSettings,
  HydraulicGrouping,
  ProjectModel,
  TrailerDefinition,
  TrailerInput,
} from "./types";

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
}

const EPS = 1e-9;

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
  const ppuMassT =
    settings.ppuPosition === "NONE"
      ? 0
      : Math.max(0, definition.ppuWeightT ?? 0) * trains;
  const netCapacityPerLine =
    definition.axleCapacityT * utilisationLimit - definition.axleWeightT;
  if (!(netCapacityPerLine > EPS)) return settings.maximumAxleLinesPerTrain * settings.maximumTrains;
  return Math.max(4, Math.ceil((carriedMassT + ppuMassT) / netCapacityPerLine));
}

/** Exact geometric pitch limits for equal, symmetric parallel trains. */
export function formationPitchBounds(
  definition: TrailerDefinition,
  settings: ArrangementOptimiserSettings,
  trainCount: number,
): FormationPitchBounds | null {
  const trains = integer(trainCount, 1, 12);
  if (trains === 1) {
    return { minimumPitchM: 0, maximumPitchM: 0, preferredPitchM: 0 };
  }
  const minimumPitchM = definition.trailerWidthM + Math.max(0, settings.minimumClearanceM);
  const maximumPitchM =
    (Math.max(0, settings.maximumFormationWidthM) - definition.trailerWidthM) /
    (trains - 1);
  if (maximumPitchM + EPS < minimumPitchM) return null;
  return {
    minimumPitchM,
    maximumPitchM,
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
): number[] {
  const bounds = formationPitchBounds(definition, settings, trainCount);
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
): number[] {
  const trains = integer(trainCount, 1, 12);
  if (trains === 1) return [0];
  const bounds = formationPitchBounds(definition, settings, trains);
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
  // Train count remains the hard outer priority, so a wider valid formation is
  // still preferred to adding another train.
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
): ArrangementDescriptor {
  const trains = integer(trainCount, 1, 12);
  const pitch = trains === 1 ? 0 : Math.max(0, pitchM);
  const overallWidthM = definition.trailerWidthM + Math.max(0, trains - 1) * pitch;
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
  };
}

function groupingForTrain(
  index: number,
  trainCount: number,
  axleLines: number,
): HydraulicGrouping {
  const splitAfterAxleLine = Math.max(1, Math.min(axleLines - 1, Math.round(axleLines / 3)));
  const relative = index - (trainCount - 1) / 2;
  const lower = relative < -EPS;
  const upper = relative > EPS;
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
  for (let index = 0; index < descriptor.trainCount; index += 1) {
    const transverseOffset = (index - (descriptor.trainCount - 1) / 2) * descriptor.pitchM;
    trailers.push({
      id: `arranged-train-${index + 1}`,
      definitionId: descriptor.trailerDefinitionId,
      axleLines: descriptor.axleLinesPerTrain,
      singleFile: false,
      xM: loadCentreX + centreXOffset,
      yM: loadCentreY + transverseOffset,
      placementReference: "ALL_INCLUSIVE_COG",
      offsetFromReference: { x: centreXOffset, y: transverseOffset },
      ppuLeft: descriptor.ppuPosition === "REAR",
      ppuRight: descriptor.ppuPosition === "FRONT",
      enabled: true,
    });
    groupings.push(
      groupingForTrain(index, descriptor.trainCount, descriptor.axleLinesPerTrain),
    );
  }
  return {
    ...base,
    trailers,
    groupings,
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
  if (!(settings.maximumFormationWidthM > 0) || !(settings.minimumClearanceM >= 0)) {
    issues.push({
      id: "formation-width",
      severity: "blocking",
      title: "Formation-width limits are invalid",
      detail: "Enter a positive maximum width and a non-negative trailer clearance.",
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
    const widestMinimum =
      definition.trailerWidthM +
      Math.max(0, settings.minimumTrains - 1) *
        (definition.trailerWidthM + Math.max(0, settings.minimumClearanceM));
    if (widestMinimum > settings.maximumFormationWidthM + EPS) {
      issues.push({
        id: "minimum-formation-width",
        severity: "blocking",
        title: "The minimum formation does not fit",
        detail: `The selected minimum train count needs at least ${widestMinimum.toFixed(3)} m overall width.`,
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
  return `${descriptor.trainCount} train${descriptor.trainCount === 1 ? "" : "s"}; ${descriptor.axleLinesPerTrain} AL/train (${modules}); ${descriptor.totalAxleLines} AL total; ${descriptor.overallWidthM.toFixed(3)} m wide`;
}
