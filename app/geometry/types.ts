import type {
  CalculationResult,
  CaseMetrics,
  Point2,
  Point3,
  ProjectModel,
  SpineLoadCase,
} from "../engine/types";

export type EngineeringView = "plan" | "end" | "side" | "hydraulics" | "stability" | "beam";
export type LoadCaseMode = "basic" | "slope" | "dynamic" | "comparison";
export type GeometryKind =
  | "project"
  | "cargo"
  | "packing"
  | "loose-packing"
  | "trailer"
  | "axle-line"
  | "bogie"
  | "hydraulic-group"
  | "group-centre"
  | "pinned-axle-line"
  | "power-pack"
  | "support"
  | "support-spread"
  | "cog"
  | "cog-envelope"
  | "load-case"
  | "virtual-shift"
  | "stability-boundary"
  | "tipping-edge"
  | "group-load"
  | "axle-load"
  | "spine-beam"
  | "engineering-check";

export interface DisplayCoordinates {
  plan?: Point2;
  end?: Point2;
  side?: Point2;
}

export interface SelectionMetadata {
  kind: GeometryKind;
  title: string;
  subtitle?: string;
  inspectorGroup: string;
  editable: boolean;
}

export interface LabelData {
  short: string;
  long: string;
  unit?: string;
  value?: string;
}

export interface VisualEntityBase {
  id: string;
  kind: GeometryKind;
  sourceTrailerId: string | null;
  engineeringCoordinates: Point3;
  displayCoordinates: DisplayCoordinates;
  visible: boolean;
  active: boolean;
  selection: SelectionMetadata;
  label: LabelData;
  sourceDataReference: string | null;
}

export interface ProjectCase extends VisualEntityBase {
  model: ProjectModel;
  result: CalculationResult;
  loadCase: LoadCaseMode;
  status: CalculationResult["status"];
}

export interface CargoGeometry extends VisualEntityBase {
  lengthM: number;
  widthM: number;
  heightM: number;
  extremeX: number;
  extremeY: number;
  bottomZM: number;
}

export interface PackingItem extends VisualEntityBase {
  massT: number;
  heightM: number;
  footprintDefined: boolean;
}

export interface LoosePackingItem extends VisualEntityBase {
  type: string;
  massT: number;
  startXM: number;
  endXM: number;
  widthM: number | null;
}

export interface TrailerUnit extends VisualEntityBase {
  index: number;
  definitionId: string;
  definitionName: string;
  startXM: number;
  centreYM: number;
  lengthM: number;
  widthM: number;
  deckHeightM: number;
  axleLines: number;
  singleFile: boolean;
  frontAt: "negative-x";
  ppuLeftLengthM: number;
  ppuRightLengthM: number;
  colliding: boolean;
}

export interface AxleLine extends VisualEntityBase {
  trailerIndex: number;
  axleLine: number;
  xM: number;
  centreYM: number;
  groupIds: number[];
  pinned: boolean;
  capacityT: number;
  loadT: number;
  utilisation: number;
}

export interface Bogie extends VisualEntityBase {
  trailerIndex: number;
  axleLine: number;
  groupId: number;
  xM: number;
  yM: number;
  tyreWidthM: number;
  wheelDiameterM: number;
  loadT: number;
  capacityT: number;
  utilisation: number;
  pinned: boolean;
}

export interface HydraulicGroup extends VisualEntityBase {
  groupId: number;
  colour: string;
  axleLineIds: string[];
  bogieIds: string[];
  centreId: string | null;
  activeAxleLineCount: number;
  activeBogieCount: number;
  netStaticLoadT: number;
}

export interface HydraulicGroupCentre extends VisualEntityBase {
  groupId: number;
  point: Point2;
  axleCount: number;
  loadT: number;
  reactionFraction: number;
}

export interface PinnedAxleLine extends VisualEntityBase {
  trailerIndex: number;
  axleLine: number;
  axleLineId: string;
}

export interface PowerPack extends VisualEntityBase {
  trailerIndex: number;
  end: "front" | "rear";
  startXM: number;
  endXM: number;
  centreYM: number;
  widthM: number;
  massT: number | null;
}

export interface Support extends VisualEntityBase {
  supportIndex: number;
  xM: number;
  widthM: number;
  allowed: boolean;
  reactionT: number;
  disableReason: string;
  transverseExtentDefined: boolean;
}

export interface SupportSpread extends VisualEntityBase {
  supportId: string;
  startXM: number;
  endXM: number;
  transverseExtentDefined: boolean;
}

export type COGType =
  | "cargo"
  | "packing"
  | "load"
  | "cargo-packing-ppu"
  | "trailer-self-weight"
  | "transporter"
  | "all-inclusive"
  | "neutral"
  | "pinned-axle"
  | "selected-case"
  | "slope-shifted"
  | "dynamic-shifted"
  | "worst-case";

export interface COGPoint extends VisualEntityBase {
  cogType: COGType;
  point: Point3;
  marker: "cross" | "circle" | "diamond" | "square" | "triangle" | "target";
  colour: string;
  available: boolean;
  unavailableReason?: string;
}

export interface COGEnvelope extends VisualEntityBase {
  envelopeType: "cargo" | "basic" | "slope" | "dynamic";
  points: Point2[];
  closed: boolean;
  colour: string;
}

export interface LoadCase extends VisualEntityBase {
  mode: LoadCaseMode;
  spineLoadCase: SpineLoadCase;
  points: Point2[];
  metrics: CaseMetrics;
}

export interface VirtualCOGShift extends VisualEntityBase {
  shiftType: "slope" | "wind" | "acceleration" | "combined-dynamic";
  vector: Point2;
  start: Point2;
  end: Point2;
}

export interface StabilityBoundary extends VisualEntityBase {
  points: Point2[];
  closed: boolean;
}

export interface TippingEdge extends VisualEntityBase {
  edgeIndex: number;
  start: Point2;
  end: Point2;
  critical: boolean;
  distanceM: number | null;
  tippingAngleDeg: number | null;
}

export interface GroupLoad extends VisualEntityBase {
  groupId: number;
  loadT: number;
  reactionFraction: number;
  axleCount: number;
  caseMode: LoadCaseMode;
}

export interface AxleLoad extends VisualEntityBase {
  axleLineId: string;
  loadT: number;
  capacityT: number;
  utilisation: number;
}

export interface SpineBeamResult extends VisualEntityBase {
  points: CalculationResult["beam"]["points"];
  metrics: CalculationResult["beam"];
  analysedTrailer: number;
  loadCase: SpineLoadCase;
}

export interface EngineeringCheck extends VisualEntityBase {
  checkKey: keyof CaseMetrics;
  value: number | null;
  unit: string;
  status: "OK" | "NOK" | "N/A";
  direction: "lower" | "higher";
}

export interface EngineeringBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

export interface GeometryViewModel {
  project: ProjectCase;
  cargo: CargoGeometry;
  packing: PackingItem;
  loosePacking: LoosePackingItem[];
  trailers: TrailerUnit[];
  axleLines: AxleLine[];
  bogies: Bogie[];
  groups: HydraulicGroup[];
  groupCentres: HydraulicGroupCentre[];
  pinnedAxleLines: PinnedAxleLine[];
  powerPacks: PowerPack[];
  supports: Support[];
  supportSpreads: SupportSpread[];
  cogs: COGPoint[];
  envelopes: COGEnvelope[];
  loadCases: LoadCase[];
  shifts: VirtualCOGShift[];
  stabilityBoundary: StabilityBoundary;
  tippingEdges: TippingEdge[];
  groupLoads: GroupLoad[];
  axleLoads: AxleLoad[];
  spineBeam: SpineBeamResult;
  checks: EngineeringCheck[];
  bounds: EngineeringBounds;
  unresolvedData: string[];
  entityById: Map<string, VisualEntityBase>;
}

export interface ViewportTransform {
  view: EngineeringView;
  width: number;
  height: number;
  padding: number;
  scale: number;
  offsetX: number;
  offsetY: number;
  toScreen(point: Point3 | Point2): Point2;
  toEngineering(point: Point2): Point3;
}
