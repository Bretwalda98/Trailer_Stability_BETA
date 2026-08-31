import { currentEngineeringValues, ENGINEERING_REFERENCE } from "./engineering-reference";
import { applyAutomaticProjectCargoCogEnvelopeInputs } from "./cargo-envelope";
import type { CalculationResult, ProjectModel } from "./types";

function number(value: number | null | undefined, precision = 3): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(precision) : "not available";
}

function point(label: string, value: { x: number; y: number; z?: number }): string {
  return `${label}: X ${number(value.x)} m, Y ${number(value.y)} m${typeof value.z === "number" ? `, Z ${number(value.z)} m` : ""}`;
}

/** A plain-text calculation record intended for a job pack, review or support request. */
export function buildCaseTextExport(model: ProjectModel, result: CalculationResult, generatedAt = new Date().toISOString()): string {
  model = applyAutomaticProjectCargoCogEnvelopeInputs(model);
  const metrics = Object.entries(result.metrics).map(([id, metric]) =>
    `${id}: ${number(metric.value, 4)} (${metric.status}${metric.active ? "" : ", inactive"})`,
  );
  const engineering = currentEngineeringValues(model, result);
  const trailerRows = result.resolvedTrailers.map((trailer, index) => {
    const input = model.trailers[index];
    return `  ${index + 1}. ${trailer.name}; ${input?.axleLines ?? 0} AL; rear X ${number(trailer.startXM)} m; centre Y ${number(trailer.centreYM)} m; rotation ${number(trailer.yawDeg ?? 0)} deg; ${number(trailer.lengthM)} m x ${number(trailer.widthM)} m; PPU rear/front ${number(trailer.ppuLeftLengthM)} / ${number(trailer.ppuRightLengthM)} m`;
  });
  const supportRows = result.supports.map((support, index) =>
    `  ${index + 1}. ${support.id}; X ${number(support.xM)} m; width ${number(support.widthM)} m; reaction ${number(support.reactionT)} t; ${support.active ? "active" : "inactive"}; ${support.reactionState}; positive connection ${support.positiveConnectionToDeck ? "yes" : "no"}${support.disableReason ? ` (${support.disableReason})` : ""}`,
  );
  const groupRows = result.groups.map((group) =>
    `  G${group.group}; X ${number(group.point.x)} m; Y ${number(group.point.y)} m; ${group.axleCount} AL; reaction ${number(group.loadT)} t (${number(group.reactionFraction * 100, 2)}%)`,
  );
  const road = result.roadTransport;

  return [
    "TRAILER STABILITY — CASE RECORD",
    `Generated: ${generatedAt}`,
    "",
    "CASE",
    `Name: ${model.cargo.name || "Untitled case"}`,
    `Client reference: ${model.cargo.clientReference || "not supplied"}`,
    `Owner reference: ${model.cargo.ownerReference || "not supplied"}`,
    `Engineering degree: ${model.engineeringDegree}`,
    `Datum/reference point: ${model.referencePoint || "not supplied"}`,
    `Orientation: rear is lower X/left; front is higher X/right.`,
    "",
    "RESULT",
    `Status: ${result.status}`,
    `Failure class: ${result.failClass || "none"}`,
    `Failure detail: ${result.failDetail || "none"}`,
    ...result.warnings.map(warning => `Warning: ${warning}`),
    `Calculation time: ${number(result.calculationMs, 2)} ms`,
    `Total all-inclusive mass: ${number(result.totalMassT)} t`,
    point("Load COG", result.loadCog),
    point("Combined COG", result.combinedCog),
    `Cargo-only stability: ${result.stabilityReferences.cargoOnlyPass ? "PASS" : "FAIL"}`,
    `Combined COG required: ${result.stabilityReferences.combinedCogRequired ? "yes" : "no"}`,
    `Combined-COG-pass-only condition: ${result.stabilityReferences.combinedCogPassOnly ? "yes" : "no"}`,
    "",
    "CARGO",
    `Dimensions: ${number(model.cargo.lengthM)} m L x ${number(model.cargo.widthM)} m W x ${number(model.cargo.heightM)} m H`,
    `Mass: ${number(model.cargo.massT)} t`,
    point("Cargo COG", model.cargo.cog),
    `COG envelope: +/- ${number(model.cargo.envelopeX)} m X, +/- ${number(model.cargo.envelopeY)} m Y${model.cargo.autoCogEnvelopeFromCargo ? " (automatic: 2.5% with 0.100 m minimum)" : " (manual; advised minimum 2% and 0.100 m)"}`,
    `Wind: ${number(model.cargo.sideWindAreaM2)} m2 side at ${number(model.cargo.sideWindHeightM)} m; ${number(model.cargo.frontWindAreaM2)} m2 front at ${number(model.cargo.frontWindHeightM)} m${model.cargo.autoWindFromCargo ? " (automatic)" : ""}`,
    "",
    "PACKING",
    `Mass: ${number(model.packing.massT)} t; height: ${number(model.packing.heightM)} m`,
    point("Packing COG", model.packing.cog),
    "",
    "RESOLVED TRAILERS",
    ...(trailerRows.length ? trailerRows : ["  No trailers configured."]),
    "BED CONNECTION MATRIX",
    ...(model.bedLayout ?? []).map(bed => `  ${bed.id}; train ${bed.train}; ${bed.axleLines} AL; rear (${number(bed.xM)}, ${number(bed.yM)}) m; rotation ${number(bed.yawDeg)} deg`),
    "DECK-MOUNTED PPUS",
    ...(model.deckPpus ?? []).map(ppu => `  ${ppu.id}; host ${ppu.hostId}; ${number(ppu.massT)} t; centre (${number(ppu.xM)}, ${number(ppu.yM)}) m; COG Z above deck ${number(ppu.cogZM)} m; rotation ${number(ppu.yawDeg)} deg; dimensions ${number(ppu.lengthM)} x ${number(ppu.widthM)} x ${number(ppu.heightM)} m; secured ${ppu.secured}; traction power ${ppu.suppliesHydraulics ?? false}; Cd ${number(ppu.dragCoefficient)}`),
    "INDEPENDENT TRAIN BEAM CHECKS",
    ...(result.trailerChecks ?? []).flatMap(check => [`  T${check.trailerIndex + 1}: ${check.detail}; active supports ${check.activeSupportCount}; shear utilisation ${number(check.beam.shearUtilisation)}; bending utilisation ${number(check.beam.bendingUtilisation)}`, ...check.supports.map(support => `    ${support.id}: ${number(support.reactionT)} t; ${support.reactionState}`)]),
    "",
    `HYDRAULICS — ${model.hydraulicSystemMode === "FOUR_POINT" ? "four-point" : "three-point"}`,
    `Stability-boundary points: ${result.stabilityPolygon.length}`,
    ...groupRows,
    "",
    `SUPPORTS — ${result.activeSupportCount}/${result.supports.length} active; minimum required ${result.minimumActiveSupports}`,
    `Settlement: ${result.supportSettlement.outcome}; converged ${result.supportSettlement.converged ? "yes" : "no"}; ${result.supportSettlement.calculationCount} exact reaction calculation(s); ${number(result.supportSettlement.calculationTimeMs)} ms`,
    ...(supportRows.length ? supportRows : ["  No supports configured."]),
    "Support settlement trace:",
    JSON.stringify(result.supportSettlement, null, 2),
    "",
    "ENVIRONMENT",
    `Route slopes: longitudinal ${number(model.environment.routeLongitudinalSlopeDeg)} deg; transverse ${number(model.environment.routeTransverseSlopeDeg)} deg`,
    `Residual slopes: longitudinal ${number(model.environment.longitudinalSlopeDeg)} deg; transverse ${number(model.environment.transverseSlopeDeg)} deg`,
    `Wind speed: ${number(model.environment.windSpeedMps)} m/s; longitudinal acceleration ${number(model.environment.longitudinalAccelerationMps2)} m/s2; transverse acceleration ${number(model.environment.transverseAccelerationMps2)} m/s2`,
    "",
    "STABILITY AND STRUCTURAL METRICS",
    ...metrics.map((line) => `  ${line}`),
    "",
    "ROAD TRANSPORT",
    `Status: ${road.status}; surface ${road.surface} ${road.condition}; friction ${number(road.frictionCoefficient, 3)}; rolling resistance ${number(road.rollingResistanceCoefficient, 3)}`,
    `Traction: demand ${number(road.tractionDemandKN)} kN; capacity ${number(road.tractionCapacityKN)} kN; utilisation ${number(road.tractionUtilisation, 2)}%`,
    `Braking: demand ${number(road.brakingDemandKN)} kN; capacity ${number(road.brakingCapacityKN)} kN; utilisation ${number(road.brakingUtilisation, 2)}%`,
    "",
    "CALCULATION REFERENCE",
    `Reference: ${ENGINEERING_REFERENCE.id} — ${ENGINEERING_REFERENCE.title}`,
    ...ENGINEERING_REFERENCE.calculations.map((item) => `  ${item.title}: ${item.formula}. ${item.detail}`),
    "",
    "MACHINE-READABLE SNAPSHOT",
    JSON.stringify(engineering, null, 2),
    "",
  ].join("\n");
}
