import { createDefaultModel, hydrateProjectModel } from "../data/default-model";
import { validateCatalogue } from "./core";
import { derivedCargoCogEnvelopeInputs } from "./cargo-envelope";
import { derivedCargoWindInputs } from "./wind";
import type {
  CalculationResult,
  PlacementReference,
  ProjectModel,
  TrailerInput,
} from "./types";

export type SetupStepId =
  | "case"
  | "cargo"
  | "packing"
  | "trailers"
  | "hydraulics"
  | "supports"
  | "review";

export type SetupSourceType = "CURRENT" | "BLANK" | "XLSM" | "JSON";

export interface SetupIssue {
  id: string;
  step: SetupStepId;
  severity: "blocking" | "warning";
  title: string;
  detail: string;
  entityId?: string;
}

export interface WizardDraftPayload {
  version: 1;
  step: SetupStepId;
  model: ProjectModel;
  sourceType: SetupSourceType;
  updatedAt: string;
}

export const WIZARD_DRAFT_VERSION = 1;
export const WIZARD_DRAFT_STORAGE_KEY = "trailer-stability-setup-draft-v1";

export const SETUP_STEPS: Array<{
  id: SetupStepId;
  shortLabel: string;
  label: string;
  description: string;
}> = [
  { id: "case", shortLabel: "Case", label: "Case basics", description: "References, datum and starting source" },
  { id: "cargo", shortLabel: "Cargo", label: "Cargo", description: "Envelope, mass, COG and wind inputs" },
  { id: "packing", shortLabel: "Packing", label: "Packing", description: "Mass, height, COG and visual footprint" },
  { id: "trailers", shortLabel: "Trailers", label: "Trailers", description: "Catalogue models and physical placement" },
  { id: "hydraulics", shortLabel: "Hydraulics", label: "Hydraulics", description: "Three-group triangle, split and pinned axles" },
  { id: "supports", shortLabel: "Checks", label: "Supports & checks", description: "Settled supports and route actions" },
  { id: "review", shortLabel: "Review", label: "Review & finish", description: "Preflight and live engineering result" },
];

const STEP_IDS = new Set<SetupStepId>(SETUP_STEPS.map((step) => step.id));
const SOURCE_TYPES = new Set<SetupSourceType>(["CURRENT", "BLANK", "XLSM", "JSON"]);

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function issue(
  id: string,
  step: SetupStepId,
  severity: SetupIssue["severity"],
  title: string,
  detail: string,
  entityId?: string,
): SetupIssue {
  return { id, step, severity, title, detail, entityId };
}

function definitionFor(model: ProjectModel, trailer: TrailerInput) {
  return model.catalogue.find((definition) => definition.id === trailer.definitionId);
}

function referencePoint(
  reference: PlacementReference,
  result: CalculationResult,
): { x: number; y: number } {
  if (reference === "LOAD_COG") return result.loadCog;
  if (reference === "ALL_INCLUSIVE_COG") return result.combinedCog;
  return { x: 0, y: 0 };
}

export function createBlankSetupModel(): ProjectModel {
  const model = createDefaultModel();
  return {
    ...model,
    sourceWorkbook: "New standalone case",
    cargo: {
      ...model.cargo,
      name: "",
      clientReference: "",
      ownerReference: "",
      lengthM: 0,
      widthM: 0,
      heightM: 0,
      extremeX: 0,
      extremeY: 0,
      massT: 0,
      cog: { x: 0, y: 0, z: 0 },
      autoCogEnvelopeFromCargo: true,
      autoWindFromCargo: true,
      ...derivedCargoWindInputs({
        ...model.cargo,
        lengthM: 0,
        widthM: 0,
        heightM: 0,
      }),
      ...derivedCargoCogEnvelopeInputs({
        ...model.cargo,
        lengthM: 0,
        widthM: 0,
      }),
    },
    packing: {
      ...model.packing,
      massT: 0,
      heightM: 0,
      cog: { x: 0, y: 0, z: 0 },
      footprint: {
        ...model.packing.footprint,
        lengthM: 0,
        widthM: 0,
        extremeX: 0,
        extremeY: 0,
      },
    },
    trailerDeckHeightM: 0,
    trailers: [],
    groupings: [],
    supports: [],
    analysedTrailer: 1,
  };
}

export function resolvedTrailerPosition(
  model: ProjectModel,
  result: CalculationResult,
  trailerIndex: number,
): { x: number; y: number } {
  const resolved = result.resolvedTrailers.find((trailer) => trailer.index === trailerIndex);
  const input = model.trailers[trailerIndex];
  return {
    x: resolved?.startXM ?? input?.xM ?? 0,
    y: resolved?.centreYM ?? input?.yM ?? 0,
  };
}

/**
 * Switches all selected trailers to one placement reference while keeping the
 * currently resolved physical positions unchanged.
 */
export function setSharedPlacementReference(
  model: ProjectModel,
  result: CalculationResult,
  placementReference: PlacementReference,
): ProjectModel {
  const firstResolvedX = resolvedTrailerPosition(model, result, 0).x;
  return {
    ...model,
    trailers: model.trailers.map((trailer, index) => {
      const resolved = resolvedTrailerPosition(model, result, index);
      const formationOffsetXM = resolved.x - firstResolvedX;
      if (placementReference === "ABSOLUTE") {
        return {
          ...trailer,
          placementReference,
          xM: resolved.x,
          yM: resolved.y,
          formationOffsetXM,
        };
      }
      const reference = referencePoint(placementReference, result);
      return {
        ...trailer,
        placementReference,
        formationOffsetXM,
        offsetFromReference: {
          x: resolved.x - reference.x,
          y: resolved.y - reference.y,
        },
      };
    }),
  };
}

/**
 * Applies the workbook-compatible shared longitudinal value. Absolute mode
 * edits E89 directly; relative modes edit the shared X offset.
 */
export function applySharedLongitudinalPlacement(
  model: ProjectModel,
  value: number,
): ProjectModel {
  if (!finite(value)) return model;
  const relative = model.trailers[0]?.placementReference !== "ABSOLUTE";
  return {
    ...model,
    trailers: model.trailers.map((trailer) =>
      relative
        ? {
            ...trailer,
            offsetFromReference: {
              ...trailer.offsetFromReference,
              x: value + (trailer.formationOffsetXM ?? 0),
            },
          }
        : { ...trailer, xM: value + (trailer.formationOffsetXM ?? 0) },
    ),
  };
}

export function applyTrailerTransversePlacement(
  model: ProjectModel,
  trailerIndex: number,
  value: number,
): ProjectModel {
  if (!finite(value)) return model;
  return {
    ...model,
    trailers: model.trailers.map((trailer, index) => {
      if (index !== trailerIndex) return trailer;
      return trailer.placementReference === "ABSOLUTE"
        ? { ...trailer, yM: value }
        : {
            ...trailer,
            offsetFromReference: { ...trailer.offsetFromReference, y: value },
          };
    }),
  };
}

/**
 * Places enabled trailers side-by-side with their actual catalogue widths.
 * The complete formation is centred around the selected placement reference.
 */
export function autoSpaceTrailers(
  model: ProjectModel,
  clearanceM = 0.05,
): ProjectModel {
  const trailers = model.trailers.filter((trailer) => trailer.enabled);
  if (!trailers.length) return model;
  const gap = Math.max(0, finite(clearanceM) ? clearanceM : 0.05);
  const widths = trailers.map((trailer) => Math.max(0, definitionFor(model, trailer)?.trailerWidthM ?? 0));
  const totalWidth = widths.reduce((sum, width) => sum + width, 0) + gap * Math.max(0, widths.length - 1);
  const absoluteCentre = model.cargo.extremeY + model.cargo.widthM / 2;
  let cursor = -totalWidth / 2;
  const placements = new Map<string, number>();
  trailers.forEach((trailer, index) => {
    const width = widths[index];
    const localCentre = cursor + width / 2;
    const target = trailer.placementReference === "ABSOLUTE"
      ? absoluteCentre + localCentre
      : localCentre;
    placements.set(trailer.id, target);
    cursor += width + gap;
  });
  return {
    ...model,
    trailers: model.trailers.map((trailer) => {
      const value = placements.get(trailer.id);
      if (value === undefined) return trailer;
      return trailer.placementReference === "ABSOLUTE"
        ? { ...trailer, yM: value }
        : {
            ...trailer,
            offsetFromReference: { ...trailer.offsetFromReference, y: value },
          };
    }),
  };
}

function catalogueIssues(model: ProjectModel): SetupIssue[] {
  return validateCatalogue(model.catalogue).map((detail, index) =>
    issue(`catalogue-${index}`, "trailers", "blocking", "Trailer catalogue preflight failed", detail),
  );
}

function caseIssues(model: ProjectModel): SetupIssue[] {
  const result: SetupIssue[] = [];
  if (!model.cargo.name.trim()) {
    result.push(issue("case-name", "case", "blocking", "Case name is required", "Enter a cargo or case name before continuing.", "cargo"));
  }
  if (!model.weightCogReference.trim()) {
    result.push(issue("weight-reference", "case", "blocking", "Weight / COG reference is required", "Define the engineering weight and COG reference."));
  }
  if (!model.referencePoint.trim()) {
    result.push(issue("datum-reference", "case", "blocking", "Load datum is required", "Define the coordinate origin used by the calculation and verification export."));
  }
  return result;
}

function cargoIssues(model: ProjectModel): SetupIssue[] {
  const cargo = model.cargo;
  const result: SetupIssue[] = [];
  const positive: Array<[string, number, string]> = [
    ["length", cargo.lengthM, "Cargo length"],
    ["width", cargo.widthM, "Cargo width"],
    ["height", cargo.heightM, "Cargo height"],
    ["mass", cargo.massT, "Cargo mass"],
  ];
  for (const [key, value, label] of positive) {
    if (!finite(value) || value <= 0) {
      result.push(issue(`cargo-${key}`, "cargo", "blocking", `${label} must be positive`, "Enter a finite value greater than zero.", "cargo"));
    }
  }
  const numeric: Array<[string, number]> = [
    ["X extreme", cargo.extremeX],
    ["Y extreme", cargo.extremeY],
    ["COG X", cargo.cog.x],
    ["COG Y", cargo.cog.y],
    ["COG Z", cargo.cog.z],
    ["X envelope", cargo.envelopeX],
    ["Y envelope", cargo.envelopeY],
    ["Side wind area", cargo.sideWindAreaM2],
    ["Front wind area", cargo.frontWindAreaM2],
  ];
  for (const [label, value] of numeric) {
    if (!finite(value)) {
      result.push(issue(`cargo-number-${label}`, "cargo", "blocking", `${label} is invalid`, "Enter a finite numeric value.", "cargo"));
    }
  }
  if (
    cargo.lengthM > 0 &&
    cargo.widthM > 0 &&
    cargo.heightM > 0 &&
    (
      cargo.cog.x < cargo.extremeX ||
      cargo.cog.x > cargo.extremeX + cargo.lengthM ||
      cargo.cog.y < cargo.extremeY ||
      cargo.cog.y > cargo.extremeY + cargo.widthM ||
      cargo.cog.z < 0 ||
      cargo.cog.z > cargo.heightM
    )
  ) {
    result.push(issue("cargo-cog-envelope", "cargo", "blocking", "Cargo COG is outside the cargo envelope", "Move the COG inside the defined X, Y and Z cargo limits.", "cog:cargo"));
  }
  return result;
}

function packingIssues(model: ProjectModel): SetupIssue[] {
  const packing = model.packing;
  const result: SetupIssue[] = [];
  if (!finite(packing.massT) || packing.massT <= 0) {
    result.push(issue("packing-mass", "packing", "blocking", "Packing mass must be positive", "Enter the total packing mass used by the calculation.", "packing"));
  }
  if (!finite(packing.heightM) || packing.heightM < 0) {
    result.push(issue("packing-height", "packing", "blocking", "Packing height is invalid", "Packing height must be zero or greater.", "packing"));
  }
  if (![packing.cog.x, packing.cog.y, packing.cog.z].every(finite)) {
    result.push(issue("packing-cog", "packing", "blocking", "Packing COG is invalid", "Enter finite X, Y and Z coordinates.", "packing"));
  }
  if (
    packing.footprint.mode === "CUSTOM" &&
    (!(packing.footprint.lengthM > 0) || !(packing.footprint.widthM > 0))
  ) {
    result.push(issue("packing-footprint", "packing", "blocking", "Custom packing footprint is invalid", "Custom length and width must both be greater than zero.", "packing"));
  }
  for (const [index, item] of model.loosePacking.entries()) {
    if (!(item.massT >= 0) || !finite(item.startXM) || !finite(item.endXM) || item.endXM < item.startXM) {
      result.push(issue(`loose-packing-${index}`, "packing", "blocking", `Loose packing row ${index + 1} is invalid`, "Use a non-negative mass and an end X at or after the start X.", `loose-packing:${item.id}`));
    }
  }
  return result;
}

function trailerIssues(model: ProjectModel, calculation: CalculationResult): SetupIssue[] {
  const result = catalogueIssues(model);
  if (model.trailers.length < 1 || model.trailers.length > 12) {
    result.push(issue("trailer-count", "trailers", "blocking", "Use between 1 and 12 trailers", "Add or remove trailers until the formation is within the supported range."));
  }
  const sharedAxles = model.trailers[0]?.axleLines;
  const sharedReference = model.trailers[0]?.placementReference;
  for (const [index, trailer] of model.trailers.entries()) {
    if (!trailer.enabled) continue;
    const definition = definitionFor(model, trailer);
    if (!definition) {
      result.push(issue(`trailer-model-${index}`, "trailers", "blocking", `Trailer ${index + 1} has no catalogue model`, "Select an available trailer model.", `trailer:${trailer.id}`));
    }
    if (!Number.isInteger(trailer.axleLines) || trailer.axleLines < 1) {
      result.push(issue(`trailer-axles-${index}`, "trailers", "blocking", `Trailer ${index + 1} axle count is invalid`, "Axle-line count must be a positive whole number.", `trailer:${trailer.id}`));
    }
    if (sharedAxles !== undefined && trailer.axleLines !== sharedAxles) {
      result.push(issue(`trailer-shared-axles-${index}`, "trailers", "blocking", "Axle-line count must be shared", "All selected trailers must use the same axle-line count."));
    }
    if (sharedReference && trailer.placementReference !== sharedReference) {
      result.push(issue(`trailer-shared-reference-${index}`, "trailers", "blocking", "Placement reference must be shared", "All trailers must use the same absolute or COG-relative placement rule."));
    }
  }
  for (const overlap of calculation.trailerOverlaps) {
    result.push(issue(
      `trailer-overlap-${overlap.firstTrailerId}-${overlap.secondTrailerId}`,
      "trailers",
      "blocking",
      `Trailers ${overlap.firstTrailerIndex + 1} and ${overlap.secondTrailerIndex + 1} overlap`,
      `Separate the trailers by at least ${(Math.min(overlap.overlapYM, overlap.overlapXM) * 1000).toFixed(0)} mm. Touching edges are permitted.`,
      `trailer:${overlap.secondTrailerId}`,
    ));
  }
  return result;
}

function hydraulicIssues(model: ProjectModel, calculation: CalculationResult): SetupIssue[] {
  const result: SetupIssue[] = [];
  const expectedGroupCount = model.hydraulicSystemMode === "FOUR_POINT" ? 4 : 3;
  const validGroupIds = Array.from({ length: expectedGroupCount }, (_, index) => index + 1);
  if (model.groupings.length < model.trailers.length) {
    result.push(issue("grouping-count", "hydraulics", "blocking", "Every trailer needs a hydraulic grouping", "Add the missing trailer hydraulic rows."));
  }
  const sharedSplit = model.groupings[0]?.splitAfterAxleLine;
  const sharedPins = JSON.stringify(model.groupings[0]?.pinnedAxleLines ?? []);
  for (const [index, trailer] of model.trailers.entries()) {
    const grouping = model.groupings[index];
    if (!grouping) continue;
    if (
      !Number.isInteger(grouping.splitAfterAxleLine) ||
      grouping.splitAfterAxleLine < 1 ||
      grouping.splitAfterAxleLine >= trailer.axleLines
    ) {
      result.push(issue(`split-${index}`, "hydraulics", "blocking", "Split line is outside the axle formation", `Split after an axle line from 1 to ${Math.max(1, trailer.axleLines - 1)}.`, `trailer:${trailer.id}`));
    }
    if (sharedSplit !== undefined && grouping.splitAfterAxleLine !== sharedSplit) {
      result.push(issue(`shared-split-${index}`, "hydraulics", "blocking", "Split line must be shared", "All selected trailers must follow the same split-after axle line."));
    }
    const pins = grouping.pinnedAxleLines;
    if (pins.length > 8 || pins.some((pin) => !Number.isInteger(pin) || pin < 1 || pin > trailer.axleLines)) {
      result.push(issue(`pins-${index}`, "hydraulics", "blocking", "Pinned axle selection is invalid", "Use up to eight unique axle-line numbers within the active formation."));
    }
    if (JSON.stringify(pins) !== sharedPins) {
      result.push(issue(`shared-pins-${index}`, "hydraulics", "blocking", "Pinned axle lines must be shared", "Every selected trailer must use the same pinned axle lines."));
    }
    const corners = grouping.cornerGroups;
    const values = corners
      ? [corners.frontLeft, corners.frontRight, corners.rearLeft, corners.rearRight]
      : grouping.groups;
    if (values.some((group) => !validGroupIds.includes(group))) {
      result.push(issue(`group-id-${index}`, "hydraulics", "blocking", `Hydraulic groups must be G1–G${expectedGroupCount}`, `Choose one of the ${expectedGroupCount} supported groups for every active circuit.`));
    }
  }
  const populated = new Set(calculation.groups.map((group) => group.group));
  if (
    populated.size !== expectedGroupCount ||
    calculation.groupingQuality.boundaryPointCount !== expectedGroupCount ||
    calculation.groupingQuality.polygonAreaM2 <= 1e-8
  ) {
    result.push(issue(
      "triangle",
      "hydraulics",
      "blocking",
      `A valid ${expectedGroupCount}-point stability polygon is required`,
      `Populate ${validGroupIds.map((group) => `G${group}`).join(", ")} with unpinned axle bogies whose centres form ${expectedGroupCount} non-degenerate convex boundary corners.`,
      "stability-boundary",
    ));
  } else if (calculation.groupingQuality.narrow) {
    result.push(issue("triangle-narrow", "hydraulics", "warning", "The hydraulic stability polygon is narrow", "The setup is editable, but wider local group centres generally improve the stability boundary.", "stability-boundary"));
  }
  if (calculation.groupingQuality.dispersedGroups.length) {
    result.push(issue("groups-dispersed", "hydraulics", "warning", "One or more hydraulic groups are dispersed", `Review ${calculation.groupingQuality.dispersedGroups.map((group) => `G${group}`).join(", ")}; grouping distant bogies can create a narrow or unintuitive stability polygon.`));
  }
  return result;
}

function supportIssues(model: ProjectModel, calculation: CalculationResult): SetupIssue[] {
  const result: SetupIssue[] = [];
  if (model.supports.length > 10) {
    result.push(issue("support-count", "supports", "blocking", "A maximum of ten supports is allowed", "Remove supports beyond the supported limit."));
  }
  for (const [index, support] of model.supports.entries()) {
    if (!finite(support.xM) || !finite(support.widthM) || support.widthM <= 0) {
      result.push(issue(`support-${index}`, "supports", "blocking", `Support ${index + 1} is invalid`, "Enter a finite X position and a positive spread width.", `support:${support.id}`));
    }
  }
  if (
    !Number.isInteger(model.optimiser.minimumActiveSupports) ||
    model.optimiser.minimumActiveSupports < 2 ||
    model.optimiser.minimumActiveSupports > 10
  ) {
    result.push(issue("minimum-supports", "supports", "blocking", "Minimum active supports must be 2–10", "Choose the smallest settled support count that is physically acceptable."));
  } else if (calculation.activeSupportCount < model.optimiser.minimumActiveSupports) {
    result.push(issue("settled-supports", "supports", "blocking", "Too few supports remain active after settling", `${calculation.activeSupportCount} support(s) remain active; the case requires at least ${model.optimiser.minimumActiveSupports}.`, "project-case"));
  }
  const environmentNumbers = Object.values(model.environment);
  if (!environmentNumbers.every(finite)) {
    result.push(issue("environment", "supports", "blocking", "Route or dynamic input is invalid", "Every slope, acceleration, wind and combination field must contain a finite number."));
  }
  if (model.roadTransport.enabled) {
    const roadNumbers = [
      model.roadTransport.speedKph,
      model.roadTransport.driveAccelerationMps2,
      model.roadTransport.brakeDecelerationMps2,
      model.roadTransport.customDrivenBogieLimit,
    ];
    if (roadNumbers.some((value) => !finite(value) || value < 0)) {
      result.push(issue("road-inputs", "supports", "blocking", "Road transport inputs are invalid", "Speed, acceleration, deceleration and the optional PPU limit must be finite and non-negative."));
    } else if (calculation.roadTransport.status === "N/A") {
      result.push(issue("road-unavailable", "supports", "blocking", "Road transport analysis is unavailable", calculation.roadTransport.warnings.join(" ") || "Use an exact 4/5/6-AL SPMT module build and verified PPU data."));
    } else if (calculation.roadTransport.status === "NOK") {
      result.push(issue("road-nok", "supports", "warning", "Road transport traction or braking is NOK", "The case can be saved, but it cannot pass while the enabled road-motion check exceeds 100% utilisation."));
    }
  }
  return result;
}

export function collectSetupIssues(
  model: ProjectModel,
  calculation: CalculationResult,
): SetupIssue[] {
  const result = [
    ...caseIssues(model),
    ...cargoIssues(model),
    ...packingIssues(model),
    ...trailerIssues(model, calculation),
    ...hydraulicIssues(model, calculation),
    ...supportIssues(model, calculation),
  ];
  if (calculation.status === "ERROR") {
    result.push(issue("calculation-error", "review", "blocking", "The engineering calculation failed", calculation.failDetail || "Resolve the calculation error before finishing."));
  }
  return result;
}

export function issuesForStep(
  issues: SetupIssue[],
  step: SetupStepId,
): SetupIssue[] {
  if (step === "review") return issues;
  return issues.filter((item) => item.step === step);
}

export function stepCanContinue(
  issues: SetupIssue[],
  step: SetupStepId,
): boolean {
  return !issuesForStep(issues, step).some((item) => item.severity === "blocking");
}

export function canFinishSetup(issues: SetupIssue[]): boolean {
  return !issues.some((item) => item.severity === "blocking");
}

export function createWizardDraftPayload(
  step: SetupStepId,
  model: ProjectModel,
  sourceType: SetupSourceType,
  timestamp = new Date().toISOString(),
): WizardDraftPayload {
  return {
    version: WIZARD_DRAFT_VERSION,
    step,
    model: hydrateProjectModel(model),
    sourceType,
    updatedAt: timestamp,
  };
}

export function hydrateWizardDraftPayload(value: unknown): WizardDraftPayload | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<WizardDraftPayload>;
  if (source.version !== WIZARD_DRAFT_VERSION || !source.model) return null;
  const step = typeof source.step === "string" && STEP_IDS.has(source.step as SetupStepId)
    ? source.step as SetupStepId
    : "case";
  const sourceType = typeof source.sourceType === "string" && SOURCE_TYPES.has(source.sourceType as SetupSourceType)
    ? source.sourceType as SetupSourceType
    : "CURRENT";
  return {
    version: WIZARD_DRAFT_VERSION,
    step,
    model: hydrateProjectModel(source.model),
    sourceType,
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : new Date(0).toISOString(),
  };
}
