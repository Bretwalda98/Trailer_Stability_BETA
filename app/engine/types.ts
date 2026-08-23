export type YesNo = "yes" | "no";
export type RunState = "IDLE" | "PLANNING" | "RUNNING" | "STOPPED" | "FAILED" | "COMPLETE";
export type RunPhase = "PLANNING" | "FORMATION_SEARCH" | "COARSE_SCAN" | "PIN_SEARCH" | "REFINEMENT" | "FINALISING";
export type PlacementReference = "ABSOLUTE" | "LOAD_COG" | "ALL_INCLUSIVE_COG";
export type PackingFootprintMode = "CARGO_ESTIMATE" | "CUSTOM";
export type CalculationMode = "NATIVE_VERIFIED" | "WORKBOOK_PARITY";
export type EngineeringDegree = "First" | "Second" | "Third";
export type HydraulicSystemMode = "THREE_POINT" | "FOUR_POINT";
export type RoadSurface = "ASPHALT" | "CONCRETE" | "SOIL_EARTH" | "GRAVEL" | "SAND" | "STEEL";
export type RoadSurfaceCondition = "DRY" | "WET";
export type RoadPpuCapacity = "STANDARD_26" | "ALASKA_32" | "CUSTOM";
export type ArrangementFormationMode = "INLINE_ONLY" | "ALLOW_STAGGERED";
export type SpineLoadCase =
  | "Neutral"
  | "A"
  | "B"
  | "C"
  | "D"
  | "A1"
  | "A2"
  | "A3"
  | "B1"
  | "B2"
  | "B3"
  | "C1"
  | "C2"
  | "C3"
  | "D1"
  | "D2"
  | "D3";

export interface Point2 {
  x: number;
  y: number;
}

export interface Point3 extends Point2 {
  z: number;
}

export interface TrailerDefinition {
  id: string;
  name: string;
  category: string;
  axleSpacingM: number;
  trailerWidthM: number;
  crossBogieSpacingM: number | null;
  axleWeightT: number;
  axleCapacityT: number;
  ppuLengthM: number | null;
  ppuWeightT: number | null;
  neutralHeightM: number;
  tyreWidthM: number;
  wheelDiameterM: number;
  strokeMaxM: number;
  strokePracticalM: number;
  secondMomentCm4: number;
  momentMaxKNm: number;
  momentMinKNm: number;
  shearMaxKN: number;
  shearMinKN: number;
  liftRatio: number | null;
  cylinderDiameterMm: number | null;
  factor: number | null;
  massBelowCylinderT: number | null;
}

export interface CargoInput {
  name: string;
  clientReference: string;
  ownerReference: string;
  lengthM: number;
  widthM: number;
  heightM: number;
  extremeX: number;
  extremeY: number;
  massT: number;
  cog: Point3;
  /** When enabled, COG uncertainty is +/-2% of cargo length/width. */
  autoCogEnvelopeFromCargo: boolean;
  envelopeX: number;
  envelopeY: number;
  /** When enabled, projected areas and force heights follow the cargo envelope. */
  autoWindFromCargo: boolean;
  sideWindAreaM2: number;
  sideDragCoefficient: number;
  sideWindHeightM: number;
  frontWindAreaM2: number;
  frontDragCoefficient: number;
  frontWindHeightM: number;
}

export interface PackingInput {
  massT: number;
  heightM: number;
  cog: Point3;
  footprint: {
    mode: PackingFootprintMode;
    lengthM: number;
    widthM: number;
    extremeX: number;
    extremeY: number;
  };
}

export interface TrailerInput {
  id: string;
  definitionId: string;
  axleLines: number;
  singleFile: boolean;
  xM: number;
  yM: number;
  /** Optimiser-owned offset retained when the common longitudinal datum moves. */
  formationOffsetXM?: number;
  placementReference: PlacementReference;
  offsetFromReference: Point2;
  ppuLeft: boolean;
  ppuRight: boolean;
  enabled: boolean;
}

export interface HydraulicGrouping {
  splitAfterAxleLine: number;
  groups: number[];
  cornerGroups?: {
    frontLeft: number;
    frontRight: number;
    rearLeft: number;
    rearRight: number;
  };
  pinnedAxleLines: number[];
}

export interface CargoSupport {
  id: string;
  xM: number;
  widthM: number;
  allowed: boolean;
  active: boolean;
  optionalWeightT?: number;
  /**
   * Off by default. When true, a designed positive connection may carry a
   * tensile (negative Rstatic) reaction instead of settling this support out.
   */
  positiveConnectionToDeck?: boolean;
}

export interface LoosePacking {
  id: string;
  type: string;
  massT: number;
  startXM: number;
  endXM: number;
}

export interface EnvironmentInput {
  routeLongitudinalSlopeDeg: number;
  routeTransverseSlopeDeg: number;
  longitudinalSlopeDeg: number;
  transverseSlopeDeg: number;
  combinationFactor: number;
  longitudinalAccelerationMps2: number;
  transverseAccelerationMps2: number;
  windSpeedMps: number;
}

export interface RoadTransportInput {
  enabled: boolean;
  surface: RoadSurface;
  condition: RoadSurfaceCondition;
  speedKph: number;
  driveAccelerationMps2: number;
  brakeDecelerationMps2: number;
  ppuCapacity: RoadPpuCapacity;
  customDrivenBogieLimit: number;
}

export interface OptimiserWeights {
  basicUtil: number;
  slopeUtil: number;
  dynamicUtil: number;
  spineUtil: number;
  basicAngle: number;
  slopeAngle: number;
  dynamicAngle: number;
  dynamicRatio: number;
  shearUtil: number;
  bendingUtil: number;
  deflection: number;
  localBendingUtil: number;
  axleLinesUsed: number;
}

export type WeightPreset =
  | "BALANCED"
  | "UTILISATION_PRIORITY"
  | "STABILITY_PRIORITY"
  | "STATIC_PRIORITY"
  | "DYNAMIC_PRIORITY"
  | "SPINE_BEAM_PRIORITY"
  | "STRUCTURAL_BALANCED"
  | "LOCAL_DEFLECTION_PRIORITY"
  | "LOCAL_BENDING_PRIORITY"
  | "CUSTOM";

export interface OptimiserSettings {
  calculationMode: CalculationMode;
  c89Start: number;
  c89Maximum: number;
  c89Step: number;
  d138Start: number;
  d138Step: number;
  d138MaximumFraction: number;
  overrideD138Limit: boolean;
  e89Minimum: number;
  e89Maximum: number;
  e89Step: number;
  e89RangeMode: "AUTO_GROUP_CENTRES" | "MANUAL";
  boundaryToleranceM: number;
  stopAtFirstPass: boolean;
  afterFirstPass: "CONTINUE_SCAN" | "STOP";
  fineFirstPassReference: string;
  fineSecondPassReference: string;
  fineE89Step: number;
  minimumActiveSupports: number;
  deflectionCheck: "OFF" | "REQUIRED";
  deflectionLimitMm: number;
  deflectionToleranceMm: number;
  pinSearchMode: "OFF" | "FAST" | "THOROUGH";
  pinStopRule: "CONTINUE_IMPROVING" | "FIRST_IMPROVEMENT";
  existingPinsPolicy: "REARRANGE" | "KEEP";
  maximumPins: number;
  maximumAxleUtilisation: "AUTO" | number;
  minimumDeflectionImprovementMm: number;
  localStructuralTargetMode: "AUTO_AT_DEFLECTION_PEAK" | "MANUAL_X";
  manualLocalTargetXM: number | null;
  fineE89PinMode: "KEEP_BETTER_PASS" | "REOPTIMISE_EACH_CASE";
  pinCaseBudget: number;
  optimiserStrategy: "STAGED_ADAPTIVE" | "EXHAUSTIVE";
  thoroughFinalistCount: number;
  detailedWeighting: boolean;
  f506Policy: "KEEP" | "REPLACE";
  weightPreset: WeightPreset;
  weights: OptimiserWeights;
  progressRefreshSeconds: number;
  liveRefreshSeconds: number;
}

export type ArrangementPpuPosition = "NONE" | "REAR" | "FRONT" | "BOTH";
export type ArrangementHydraulicSearchMode = "BOTH" | "THREE_POINT" | "FOUR_POINT";
export type ArrangementSearchMode =
  | "MATHEMATICAL_BRANCH_BOUND"
  | "ADAPTIVE_BOUNDED"
  | "LEGACY_GRID";

export interface ArrangementOptimiserSettings {
  searchMode: ArrangementSearchMode;
  trailerDefinitionId: string;
  allow4AxleModules: boolean;
  allow5AxleModules: boolean;
  allow6AxleModules: boolean;
  limitModuleAvailability: boolean;
  available4AxleModules: number;
  available5AxleModules: number;
  available6AxleModules: number;
  minimumTrains: number;
  maximumTrains: number;
  maximumAxleLinesPerTrain: number;
  preferredCentreSpacingM: number;
  minimumClearanceM: number;
  maximumFormationWidthM: number;
  enforceMaximumFormationWidth: boolean;
  searchMaximumFormationWidthM: number;
  limitFormationWidthToCargo: boolean;
  spacingSamples: number;
  spacingToleranceM: number;
  ppuPosition: ArrangementPpuPosition;
  /**
   * The automatic arrangement solver may verify both supported hydraulic
   * systems from the same formation.  Keeping this on BOTH prevents an
   * inherited project setting from silently excluding a viable arrangement.
   */
  hydraulicSearchMode: ArrangementHydraulicSearchMode;
  formationMode: ArrangementFormationMode;
  maximumLongitudinalStaggerM: number;
  longitudinalStaggerSamples: number;
  allowReducedEnvironmentalActions: boolean;
  reducedEnvironmentalActionsAccepted: boolean;
  searchWindSpeedMps: number;
  searchLongitudinalAccelerationMps2: number;
  searchTransverseAccelerationMps2: number;
}

export interface ArrangementDescriptor {
  trailerDefinitionId: string;
  trainCount: number;
  axleLinesPerTrain: number;
  totalAxleLines: number;
  modules4: number;
  modules5: number;
  modules6: number;
  moduleCountPerTrain: number;
  pitchM: number;
  clearanceM: number;
  overallWidthM: number;
  ppuPosition: ArrangementPpuPosition;
  /** The hydraulic system used for this exact evaluated formation. */
  hydraulicSystemMode?: HydraulicSystemMode;
  formationMode: "INLINE" | "STAGGERED";
  longitudinalOffsetsM: number[];
  longitudinalSpanM: number;
}

export interface ProjectModel {
  schemaVersion: 3;
  longitudinalOrientation: "REAR_LEFT_FRONT_RIGHT";
  sourceWorkbook: string;
  engineeringDegree: EngineeringDegree;
  weightCogReference: string;
  referencePoint: string;
  cargo: CargoInput;
  packing: PackingInput;
  trailerDeckHeightM: number;
  trailers: TrailerInput[];
  groupings: HydraulicGrouping[];
  hydraulicSystemMode: HydraulicSystemMode;
  supports: CargoSupport[];
  environment: EnvironmentInput;
  roadTransport: RoadTransportInput;
  optimiser: OptimiserSettings;
  arrangementOptimiser: ArrangementOptimiserSettings;
  catalogue: TrailerDefinition[];
  analysedTrailer: number;
  spineLoadCase: SpineLoadCase;
  spineMeshSizeM: number;
  loosePacking: LoosePacking[];
}

export interface AxlePoint {
  trailerId: string;
  trailerIndex: number;
  axleLine: number;
  group: number;
  pinned: boolean;
  point: Point2;
  capacityT: number;
  tareT: number;
  loadT: number;
  utilisation: number;
}

export interface GroupResult {
  group: number;
  point: Point2;
  axleCount: number;
  loadT: number;
  reactionFraction: number;
}

export interface SupportResult extends CargoSupport {
  reactionT: number;
  geometricallyAllowed: boolean;
  reactionState:
    | "COMPRESSION"
    | "ZERO"
    | "TENSION_RESTRAINED"
    | "INACTIVE"
    | "UNAVAILABLE";
  disableReason:
    | ""
    | "NOT_ALLOWED"
    | "OUTSIDE_TRAILER"
    | "NEGATIVE_REACTION"
    | "UNDEFINED_REACTION";
}

export interface SupportSettlementReaction {
  supportId: string;
  allowed: boolean;
  geometricallyAllowed: boolean;
  positiveConnectionToDeck: boolean;
  activeBefore: boolean;
  reactionT: number | null;
  outcome:
    | "COMPRESSION"
    | "ZERO"
    | "TENSION_RESTRAINED"
    | "NEGATIVE_REACTION"
    | "UNDEFINED_REACTION"
    | "NOT_CALCULATED"
    | "INACTIVE";
}

export interface SupportStateTransition {
  supportId: string;
  fromActive: boolean;
  toActive: boolean;
  reason:
    | "RESET_ELIGIBLE"
    | "NOT_ALLOWED"
    | "OUTSIDE_TRAILER"
    | "NEGATIVE_REACTION"
    | "UNDEFINED_REACTION";
  reactionT: number | null;
}

export interface SupportSettlementStep {
  iteration: number;
  stage: "RESET" | "REACTION" | "FAILED";
  activeSupportIdsBefore: string[];
  reactions: SupportSettlementReaction[];
  transitions: SupportStateTransition[];
  activeSupportIdsAfter: string[];
}

export interface SupportSettlementTrace {
  reactionToleranceT: number;
  converged: boolean;
  outcome: "SETTLED" | "INSUFFICIENT_SUPPORTS" | "SOLVER_FAILED" | "NOT_RUN";
  calculationCount: number;
  calculationTimeMs: number;
  steps: SupportSettlementStep[];
}

export interface BeamPoint {
  xM: number;
  shearKN: number;
  momentKNm: number;
  deflectionMm: number;
}

export interface BeamMetrics {
  points: BeamPoint[];
  shearMinKN: number;
  shearMinXM: number;
  shearMaxKN: number;
  shearMaxXM: number;
  bendingMinKNm: number;
  bendingMinXM: number;
  bendingMaxKNm: number;
  bendingMaxXM: number;
  deflectionDownMm: number;
  deflectionDownXM: number;
  deflectionUpMm: number;
  deflectionUpXM: number;
  absoluteDeflectionMm: number;
  deflectionPeakXM: number;
  shearUtilisation: number;
  bendingUtilisation: number;
  localBendingAbsKNm: number;
  localBendingUtilisation: number;
}

export interface MetricValue {
  value: number | null;
  active: boolean;
  status: "OK" | "NOK" | "N/A";
}

export interface CaseMetrics {
  basicUtil: MetricValue;
  slopeUtil: MetricValue;
  dynamicUtil: MetricValue;
  spineUtil: MetricValue;
  basicAngle: MetricValue;
  slopeAngle: MetricValue;
  dynamicAngle: MetricValue;
  dynamicRatio: MetricValue;
  shearUtil: MetricValue;
  bendingUtil: MetricValue;
  deflection: MetricValue;
  localBendingUtil: MetricValue;
  axleLinesUsed: MetricValue;
}

export interface StabilityReferenceChecks {
  cargoBasicAngle: MetricValue;
  cargoSlopeAngle: MetricValue;
  cargoDynamicAngle: MetricValue;
  cargoOnlyPass: boolean;
  combinedCogRequired: boolean;
  combinedCogPassOnly: boolean;
}

export interface ComponentCogs {
  cargo: Point3;
  packing: Point3;
  load: Point3;
  ppu: Point3 | null;
  trailerSelfWeight: Point3 | null;
  transporter: Point3 | null;
  cargoPackingPpu: Point3;
  allInclusive: Point3;
}

export interface StabilityAnalysisSummary {
  slopeShift: Point2;
  windShift: Point2;
  accelerationShift: Point2;
  dynamicShift: Point2;
  controllingMode: "basic" | "slope" | "dynamic";
  controllingCaseIndex: number;
  controllingPoint: Point2;
  controllingEdgeIndex: number;
  controllingEdge: [Point2, Point2] | null;
  controllingDistanceM: number | null;
  controllingAngleDeg: number | null;
  controllingGroup: number | null;
  maximumGroupLoadT: number | null;
  maximumAxleLoadT: number | null;
  groupLoadContributions: Array<{
    group: number;
    neutralLoadT: number;
    slopeLoadT: number;
    dynamicLoadT: number;
    slopeDeltaT: number;
    combinedDynamicDeltaT: number;
  }>;
}

/**
 * Hydraulic group reactions retained for exact optimiser bounds. The case
 * order matches `CalculationResult.casePoints`; values are tonnes per group.
 */
export interface StabilityLoadCases {
  neutral: number[];
  basic: number[][];
  slope: number[][];
  dynamic: number[][];
}

export interface GroundBearingGroupResult {
  group: number;
  activeBogies: number;
  activeAxleLines: number;
  neutralGroupLoadT: number;
  maximumEnvelopeGroupLoadT: number;
  neutralAxleLineLoadT: number | null;
  maximumEnvelopeAxleLineLoadT: number | null;
  maximumUtilisation: number | null;
  contactAreaM2: number;
  pressureTPerM2: number | null;
}

export interface GroundBearingResult {
  totalActiveBogies: number;
  totalActiveAxleLines: number;
  totalContactAreaM2: number;
  overallTPerM2: number | null;
  maximumGroupTPerM2: number | null;
  groups: GroundBearingGroupResult[];
}

export interface TrailerOverlap {
  firstTrailerId: string;
  firstTrailerIndex: number;
  secondTrailerId: string;
  secondTrailerIndex: number;
  overlapXM: number;
  overlapYM: number;
}

export interface HydraulicGroupingQuality {
  triangleAreaM2: number;
  polygonAreaM2: number;
  populatedGroupCount: number;
  boundaryPointCount: number;
  minimumAltitudeM: number;
  minimumEdgeM: number;
  maximumEdgeM: number;
  aspectRatio: number;
  narrow: boolean;
  dispersedGroups: number[];
}

export interface RoadTransportResult {
  enabled: boolean;
  surface: RoadSurface;
  condition: RoadSurfaceCondition;
  frictionCoefficient: number;
  rollingResistanceCoefficient: number;
  speedKph: number;
  moduleCount: number;
  totalBogieCount: number;
  drivenBogieCount: number;
  brakedBogieCount: number;
  ppuDrivenBogieLimit: number;
  rollingResistanceKN: number;
  gradeForceKN: number;
  accelerationForceKN: number;
  brakingForceKN: number;
  tractionDemandKN: number;
  tractionCapacityKN: number;
  tractionAdhesionLimitKN: number;
  tractionMechanicalLimitKN: number;
  tractionUtilisation: number | null;
  brakingDemandKN: number;
  brakingCapacityKN: number;
  brakingAdhesionLimitKN: number;
  brakingMechanicalLimitKN: number;
  brakingUtilisation: number | null;
  maximumClimbGradeDeg: number | null;
  maximumDescentGradeDeg: number | null;
  status: "OK" | "NOK" | "N/A";
  source: string;
  warnings: string[];
}

export interface CalculationResult {
  status: "PASS" | "NOK_FAIL" | "SUPPORT_FAIL" | "GEOMETRY_FAIL" | "ERROR";
  failClass: string;
  failDetail: string;
  combinedCog: Point3;
  loadCog: Point3;
  totalMassT: number;
  groups: GroupResult[];
  axlePoints: AxlePoint[];
  spineAxlePoints: AxlePoint[];
  supports: SupportResult[];
  supportIterations: number;
  supportSettlement: SupportSettlementTrace;
  activeSupportCount: number;
  minimumActiveSupports: number;
  trailerOverlaps: TrailerOverlap[];
  groupingQuality: HydraulicGroupingQuality;
  roadTransport: RoadTransportResult;
  stabilityPolygon: Point2[];
  casePoints: {
    basic: Point2[];
    slope: Point2[];
    dynamic: Point2[];
    spineLoadCase: SpineLoadCase;
  };
  componentCogs: ComponentCogs;
  stabilityReferences: StabilityReferenceChecks;
  analysis: StabilityAnalysisSummary;
  stabilityLoads: StabilityLoadCases;
  groundBearing: GroundBearingResult;
  resolvedTrailers: Array<{
    id: string;
    index: number;
    name: string;
    startXM: number;
    centreYM: number;
    lengthM: number;
    widthM: number;
    ppuLeftLengthM: number;
    ppuRightLengthM: number;
  }>;
  beam: BeamMetrics;
  metrics: CaseMetrics;
  warnings: string[];
  calculationMs: number;
}

export interface PassResult {
  id: string;
  runReference: string;
  caseReference: string;
  phase: RunPhase;
  sequence: number;
  c89: number;
  d138: number;
  e89: number;
  pinnedAxleLines: number[];
  result: CalculationResult;
  lowerRank: number | null;
  higherRank: number | null;
  rating: number | null;
  overallRank: number | null;
  startedAt: string;
  durationMs: number;
  progressPercent: number;
  completedWork: number;
  plannedWork: number;
  elapsedMs: number;
  calculationMode: CalculationMode;
  arrangement?: ArrangementDescriptor;
}

export interface ActivityEvent {
  id: number;
  timestamp: string;
  elapsedMs: number;
  phase: RunPhase | "SYSTEM";
  caseReference: string;
  stage: string;
  message: string;
  detail: string;
  level: "INFO" | "PASS" | "WARN" | "ERROR" | "BEST";
  progress: number;
}

export interface ProgressState {
  runState: RunState;
  phase: RunPhase;
  overallCompleted: number;
  overallPlanned: number;
  phaseCompleted: number;
  phasePlanned: number;
  overallPercent: number;
  phasePercent: number;
  elapsedMs: number;
  currentEtaMs: number | null;
  overallEtaMs: number | null;
  estimatedFinish: string | null;
  reference: string;
}

export interface OptimiserRun {
  runReference: string;
  state: RunState;
  progress: ProgressState;
  passes: PassResult[];
  events: ActivityEvent[];
  bestPassId: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}
