import { builtinTrailerCatalogue } from "./trailers";
import { applyAutomaticCargoCogEnvelopeInputs } from "../engine/cargo-envelope";
import { DEFAULT_ARRANGEMENT_OBJECTIVE_ORDER } from "../engine/arrangement-objectives";
import type { OptimiserWeights, ProjectModel } from "../engine/types";
import {
  LONGITUDINAL_ORIENTATION_ID,
  swapLegacyLongitudinalCorners,
} from "../engine/orientation";

export const balancedWeights: OptimiserWeights = {
  basicUtil: 1,
  slopeUtil: 1,
  dynamicUtil: 1,
  spineUtil: 1,
  basicAngle: 1,
  slopeAngle: 1,
  dynamicAngle: 1,
  dynamicRatio: 1,
  shearUtil: 0,
  bendingUtil: 0,
  deflection: 0,
  localBendingUtil: 0,
  axleLinesUsed: 0.5,
};

export function createDefaultModel(): ProjectModel {
  return {
    schemaVersion: 3,
    longitudinalOrientation: LONGITUDINAL_ORIENTATION_ID,
    sourceWorkbook: "Standalone web project",
    engineeringDegree: "Second",
    weightCogReference: "GO",
    referencePoint: "0,0",
    cargo: {
      name: "CARG_NAME",
      clientReference: "CLIENT_REF",
      ownerReference: "OWNER_REF",
      lengthM: 11.89,
      widthM: 4.885,
      heightM: 4.895,
      extremeX: 0,
      extremeY: 0,
      massT: 425.6,
      cog: { x: 5.99, y: 2.4425, z: 2.045 },
      autoCogEnvelopeFromCargo: true,
      envelopeX: 0.29725,
      envelopeY: 0.122125,
      autoWindFromCargo: true,
      sideWindAreaM2: 58.20455,
      sideDragCoefficient: 1.2,
      sideWindHeightM: 2.4475,
      frontWindAreaM2: 23.901575,
      frontDragCoefficient: 1.2,
      frontWindHeightM: 2.4475,
    },
    packing: {
      massT: 22.8,
      heightM: 0.55,
      cog: { x: 5.945, y: 2.4425, z: 0.275 },
      footprint: {
        mode: "CARGO_ESTIMATE",
        lengthM: 11.89,
        widthM: 4.885,
        extremeX: 0,
        extremeY: 0,
      },
    },
    trailerDeckHeightM: 1.5,
    trailers: [
      {
        id: "trailer-1",
        definitionId: "k2400-st",
        axleLines: 8,
        singleFile: false,
        xM: 0,
        yM: 1.6975,
        placementReference: "ABSOLUTE",
        offsetFromReference: { x: 0, y: 0 },
        ppuLeft: false,
        ppuRight: false,
        enabled: true,
      },
      {
        id: "trailer-2",
        definitionId: "k2400-st",
        axleLines: 8,
        singleFile: false,
        xM: 0,
        yM: 3.1875,
        placementReference: "ABSOLUTE",
        offsetFromReference: { x: 0, y: 0 },
        ppuLeft: true,
        ppuRight: false,
        enabled: true,
      },
    ],
    groupings: [
      {
        splitAfterAxleLine: 2,
        groups: [2, 2, 1, 1, 1, 1, 1, 1],
        cornerGroups: { rearLeft: 2, rearRight: 2, frontLeft: 1, frontRight: 1 },
        pinnedAxleLines: [],
      },
      {
        splitAfterAxleLine: 2,
        groups: [1, 1, 3, 3, 3, 3, 3, 3],
        cornerGroups: { rearLeft: 1, rearRight: 1, frontLeft: 3, frontRight: 3 },
        pinnedAxleLines: [],
      },
    ],
    hydraulicSystemMode: "THREE_POINT",
    supports: [
      { id: "support-1", xM: 1, widthM: 0.5, allowed: true, active: true, positiveConnectionToDeck: false },
      { id: "support-2", xM: 4, widthM: 0.5, allowed: true, active: true, positiveConnectionToDeck: false },
      { id: "support-3", xM: 7, widthM: 0.5, allowed: true, active: true, positiveConnectionToDeck: false },
      { id: "support-4", xM: 10, widthM: 0.5, allowed: true, active: true, positiveConnectionToDeck: false },
    ],
    environment: {
      routeLongitudinalSlopeDeg: 2,
      routeTransverseSlopeDeg: 1,
      longitudinalSlopeDeg: 2,
      transverseSlopeDeg: 1,
      combinationFactor: 0.7,
      longitudinalAccelerationMps2: 0.5,
      transverseAccelerationMps2: 0.2,
      windSpeedMps: 15,
    },
    roadTransport: {
      enabled: false,
      surface: "ASPHALT",
      condition: "DRY",
      speedKph: 5,
      driveAccelerationMps2: 0.5,
      brakeDecelerationMps2: 0.5,
      ppuCapacity: "STANDARD_26",
      customDrivenBogieLimit: 26,
    },
    optimiser: {
      calculationMode: "NATIVE_VERIFIED",
      c89Start: 20,
      c89Maximum: 44,
      c89Step: 1,
      d138Start: 1,
      d138Step: 1,
      d138MaximumFraction: 0.5,
      overrideD138Limit: false,
      e89Minimum: -10,
      e89Maximum: 10,
      e89Step: 1,
      e89RangeMode: "AUTO_GROUP_CENTRES",
      boundaryToleranceM: 0.01,
      stopAtFirstPass: false,
      afterFirstPass: "CONTINUE_SCAN",
      fineFirstPassReference: "",
      fineSecondPassReference: "",
      fineE89Step: 0.25,
      minimumActiveSupports: 2,
      deflectionCheck: "OFF",
      deflectionLimitMm: 5,
      deflectionToleranceMm: 0.001,
      pinSearchMode: "FAST",
      pinStopRule: "CONTINUE_IMPROVING",
      existingPinsPolicy: "REARRANGE",
      maximumPins: 8,
      maximumAxleUtilisation: "AUTO",
      minimumDeflectionImprovementMm: 0.01,
      localStructuralTargetMode: "AUTO_AT_DEFLECTION_PEAK",
      manualLocalTargetXM: null,
      fineE89PinMode: "REOPTIMISE_EACH_CASE",
      pinCaseBudget: 12,
      optimiserStrategy: "STAGED_ADAPTIVE",
      thoroughFinalistCount: 3,
      detailedWeighting: false,
      f506Policy: "KEEP",
      weightPreset: "BALANCED",
      weights: { ...balancedWeights },
      progressRefreshSeconds: 1,
      liveRefreshSeconds: 3,
    },
    arrangementOptimiser: {
      searchMode: "MATHEMATICAL_BRANCH_BOUND",
      trailerDefinitionId: "k2400-st",
      allow4AxleModules: true,
      allow5AxleModules: true,
      allow6AxleModules: true,
      limitModuleAvailability: false,
      available4AxleModules: 12,
      available5AxleModules: 12,
      available6AxleModules: 12,
      minimumTrains: 1,
      maximumTrains: 6,
      maximumAxleLinesPerTrain: 44,
      preferredCentreSpacingM: 2.9,
      minimumClearanceM: 0.47,
      maximumFormationWidthM: 15,
      enforceMaximumFormationWidth: false,
      searchMaximumFormationWidthM: 30,
      limitFormationWidthToCargo: false,
      spacingSamples: 3,
      spacingToleranceM: 0.05,
      ppuPosition: "NONE",
      hydraulicSearchMode: "BOTH",
      formationMode: "ALLOW_STAGGERED",
      maximumLongitudinalStaggerM: 6,
      longitudinalStaggerSamples: 1,
      allowReducedEnvironmentalActions: false,
      reducedEnvironmentalActionsAccepted: false,
      searchWindSpeedMps: 15,
      searchLongitudinalAccelerationMps2: 0.5,
      searchTransverseAccelerationMps2: 0.2,
      objectivePresetName: "Engineering default",
      objectiveOrder: [...DEFAULT_ARRANGEMENT_OBJECTIVE_ORDER],
    },
    catalogue: builtinTrailerCatalogue.map((item) => ({ ...item })),
    analysedTrailer: 1,
    spineLoadCase: "Neutral",
    spineMeshSizeM: 0.023,
    loosePacking: [],
  };
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function objectItems(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    : [];
}

/**
 * Adds fields introduced after the first standalone release while preserving
 * imported/custom catalogue rows and user-created arrangements.
 */
export function hydrateProjectModel(value: unknown): ProjectModel {
  const base = createDefaultModel();
  const source = objectValue(value) as Partial<ProjectModel>;
  const cargo = objectValue(source.cargo) as Partial<ProjectModel["cargo"]>;
  const packing = objectValue(source.packing) as Partial<ProjectModel["packing"]>;
  const packingFootprint = objectValue(packing.footprint) as Partial<
    ProjectModel["packing"]["footprint"]
  >;
  const environment = objectValue(source.environment) as Partial<ProjectModel["environment"]>;
  const roadTransport = objectValue(source.roadTransport) as Partial<ProjectModel["roadTransport"]>;
  const optimiser = objectValue(source.optimiser) as Partial<ProjectModel["optimiser"]>;
  const arrangementOptimiser = objectValue(source.arrangementOptimiser) as Partial<
    ProjectModel["arrangementOptimiser"]
  >;
  const weights = objectValue(optimiser.weights) as Partial<OptimiserWeights>;
  const trailerItems = objectItems(source.trailers);
  const groupingItems = objectItems(source.groupings);
  const supportItems = objectItems(source.supports);
  const catalogueItems = objectItems(source.catalogue);
  const loosePackingItems = objectItems(source.loosePacking);
  const hasCurrentOrientation =
    source.longitudinalOrientation === LONGITUDINAL_ORIENTATION_ID;
  const importedUsesGroupFour = groupingItems.some((item) => {
    const corners = objectValue(item.cornerGroups);
    const values = [
      ...Object.values(corners),
      ...(Array.isArray(item.groups) ? item.groups : []),
    ];
    return values.some((entry) => Number(entry) === 4);
  });
  return {
    ...base,
    ...source,
    schemaVersion: 3,
    longitudinalOrientation: LONGITUDINAL_ORIENTATION_ID,
    hydraulicSystemMode:
      source.hydraulicSystemMode === "FOUR_POINT" || importedUsesGroupFour
        ? "FOUR_POINT"
        : "THREE_POINT",
    cargo: applyAutomaticCargoCogEnvelopeInputs({
      ...base.cargo,
      ...cargo,
      cog: { ...base.cargo.cog, ...objectValue(cargo.cog) },
    }),
    packing: {
      ...base.packing,
      ...packing,
      cog: { ...base.packing.cog, ...objectValue(packing.cog) },
      footprint: {
        ...base.packing.footprint,
        ...packingFootprint,
        mode: packingFootprint.mode === "CUSTOM" ? "CUSTOM" : "CARGO_ESTIMATE",
        lengthM:
          typeof packingFootprint.lengthM === "number"
            ? packingFootprint.lengthM
            : cargo.lengthM ?? base.cargo.lengthM,
        widthM:
          typeof packingFootprint.widthM === "number"
            ? packingFootprint.widthM
            : cargo.widthM ?? base.cargo.widthM,
        extremeX:
          typeof packingFootprint.extremeX === "number"
            ? packingFootprint.extremeX
            : cargo.extremeX ?? base.cargo.extremeX,
        extremeY:
          typeof packingFootprint.extremeY === "number"
            ? packingFootprint.extremeY
            : cargo.extremeY ?? base.cargo.extremeY,
      },
    },
    environment: {
      ...base.environment,
      ...environment,
      routeLongitudinalSlopeDeg:
        typeof environment.routeLongitudinalSlopeDeg === "number"
          ? environment.routeLongitudinalSlopeDeg
          : environment.longitudinalSlopeDeg ?? base.environment.routeLongitudinalSlopeDeg,
      routeTransverseSlopeDeg:
        typeof environment.routeTransverseSlopeDeg === "number"
          ? environment.routeTransverseSlopeDeg
          : environment.transverseSlopeDeg ?? base.environment.routeTransverseSlopeDeg,
    },
    roadTransport: {
      ...base.roadTransport,
      ...roadTransport,
    },
    optimiser: {
      ...base.optimiser,
      ...optimiser,
      weights: { ...base.optimiser.weights, ...weights },
    },
    arrangementOptimiser: {
      ...base.arrangementOptimiser,
      ...arrangementOptimiser,
      objectivePresetName:
        typeof arrangementOptimiser.objectivePresetName === "string" && arrangementOptimiser.objectivePresetName.trim()
          ? arrangementOptimiser.objectivePresetName.trim()
          : base.arrangementOptimiser.objectivePresetName,
      objectiveOrder: Array.isArray(arrangementOptimiser.objectiveOrder)
        ? [
            ...arrangementOptimiser.objectiveOrder.filter((item): item is ProjectModel["arrangementOptimiser"]["objectiveOrder"][number] =>
              base.arrangementOptimiser.objectiveOrder.includes(item as ProjectModel["arrangementOptimiser"]["objectiveOrder"][number]),
            ),
            ...base.arrangementOptimiser.objectiveOrder.filter((item) => !arrangementOptimiser.objectiveOrder?.includes(item)),
          ]
        : [...base.arrangementOptimiser.objectiveOrder],
    },
    trailers: Array.isArray(source.trailers)
      ? trailerItems.map((item, index) => ({
          ...(base.trailers[index] ?? base.trailers[0]),
          ...item,
          offsetFromReference: {
            ...(base.trailers[index] ?? base.trailers[0]).offsetFromReference,
            ...objectValue(item.offsetFromReference),
          },
        })) as ProjectModel["trailers"]
      : base.trailers,
    groupings: Array.isArray(source.groupings)
      ? groupingItems.map((item, index) => ({
          ...(base.groupings[index] ?? base.groupings[0]),
          ...item,
          cornerGroups: item.cornerGroups
            ? hasCurrentOrientation
              ? (item.cornerGroups as ProjectModel["groupings"][number]["cornerGroups"])
              : swapLegacyLongitudinalCorners(
                  item.cornerGroups as NonNullable<
                    ProjectModel["groupings"][number]["cornerGroups"]
                  >,
                )
            : (base.groupings[index] ?? base.groupings[0]).cornerGroups,
          groups: Array.isArray(item.groups) ? item.groups : (base.groupings[index] ?? base.groupings[0]).groups,
          pinnedAxleLines: Array.isArray(item.pinnedAxleLines)
            ? item.pinnedAxleLines
            : (base.groupings[index] ?? base.groupings[0]).pinnedAxleLines,
        })) as ProjectModel["groupings"]
      : base.groupings,
    supports: Array.isArray(source.supports)
      ? supportItems.map((item, index) => ({
          ...(base.supports[index] ?? base.supports[0]),
          ...item,
          positiveConnectionToDeck: item.positiveConnectionToDeck === true,
        })) as ProjectModel["supports"]
      : base.supports,
    catalogue: catalogueItems.length
      ? (catalogueItems as unknown as ProjectModel["catalogue"])
      : base.catalogue,
    loosePacking: loosePackingItems.length
      ? (loosePackingItems as unknown as ProjectModel["loosePacking"])
      : [],
  };
}
