import { calculateProject } from "./core";
import type { CalculationResult, HydraulicGrouping, ProjectModel } from "./types";

export const AUTOCAD_COMPACT_FORMAT = "SARTD-CAD";
export const AUTOCAD_COMPACT_VERSION = 1;

function finiteNumber(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new Error(`AutoCAD export cannot write ${label}: the value is not finite.`);
  return Object.is(value, -0) ? 0 : value;
}

function numericField(value: number, label = "numeric field"): string {
  const fixed = finiteNumber(value, label).toFixed(6);
  return fixed.replace(/0+$/, "").replace(/\.$/, "");
}

function textField(value: string | null | undefined): string {
  return String(value ?? "")
    .replaceAll("%", "%25")
    .replaceAll("|", "%7C")
    .replaceAll("\r", "%0D")
    .replaceAll("\n", "%0A");
}

function boolField(value: boolean): string {
  return value ? "1" : "0";
}

function line(...fields: Array<string | number | boolean>): string {
  return fields.map((field) => {
    if (typeof field === "number") return numericField(field);
    if (typeof field === "boolean") return boolField(field);
    return field;
  }).join("|");
}

function cornerGroups(grouping: HydraulicGrouping): {
  rearLeft: number;
  frontLeft: number;
  rearRight: number;
  frontRight: number;
} {
  if (grouping.cornerGroups) return grouping.cornerGroups;
  const populated = grouping.groups.filter((group) => Number.isFinite(group) && group > 0);
  const first = populated[0] ?? 1;
  const last = populated.at(-1) ?? first;
  return { rearLeft: first, rearRight: first, frontLeft: last, frontRight: last };
}

function hydraulicPressureBar(loadT: number, bogieCount: number, factor: number | null, massBelowCylinderT: number | null): number {
  if (!(bogieCount > 0) || factor === null || !(factor > 0)) return 0;
  return Math.max(0, loadT / bogieCount - Math.max(0, massBelowCylinderT ?? 0)) * factor;
}

/**
 * Builds the deliberately small, line-oriented interchange consumed directly
 * by SARENS_TRAILERDRAFTSMAN v1.20. It mirrors the drafting engine's retained
 * data object and omits browser-only state, diagrams and catalogue rows that
 * the AutoLISP renderer never reads.
 *
 * Units are fixed: millimetres, tonnes, kN and degrees. Text uses a tiny
 * percent escape for pipes and line breaks, so parsing needs no JSON or
 * PowerShell helper.
 */
export function buildAutocadCompactExport(
  model: ProjectModel,
  authoritativeResult?: CalculationResult,
  generatedAt = new Date().toISOString(),
): string {
  const result = authoritativeResult ?? calculateProject(model);
  const lines: string[] = [
    line(AUTOCAD_COMPACT_FORMAT, AUTOCAD_COMPACT_VERSION, "MM-T-KN-DEG", "REAR-LOW-X"),
    line(
      "CASE",
      textField(model.cargo.name || "Untitled case"),
      textField(model.cargo.clientReference),
      textField(model.cargo.ownerReference),
      textField(model.engineeringDegree),
      textField(model.weightCogReference),
      textField(model.referencePoint),
      textField(generatedAt.slice(0, 10)),
      textField(result.status),
    ),
    line(
      "LOAD",
      model.cargo.lengthM * 1000,
      model.cargo.widthM * 1000,
      model.cargo.heightM * 1000,
      model.cargo.extremeX * 1000,
      model.cargo.extremeY * 1000,
      model.cargo.massT,
      (model.cargo.extremeX + model.cargo.cog.x) * 1000,
      (model.cargo.extremeY + model.cargo.cog.y) * 1000,
      (model.trailerDeckHeightM + model.packing.heightM + model.cargo.cog.z) * 1000,
      model.cargo.envelopeX * 1000,
      model.cargo.envelopeY * 1000,
    ),
    line(
      "PACKING",
      model.packing.massT,
      model.packing.heightM * 1000,
      (model.cargo.extremeX + model.packing.cog.x) * 1000,
      (model.cargo.extremeY + model.packing.cog.y) * 1000,
      model.packing.cog.z * 1000,
    ),
    line("DECK", model.trailerDeckHeightM * 1000),
  ];

  if (!result.resolvedTrailers.length) {
    throw new Error("AutoCAD export requires at least one enabled trailer with a valid catalogue definition.");
  }

  let totalPowerpacks = 0;
  let totalAxleLines = 0;
  result.resolvedTrailers.forEach((resolved, outputIndex) => {
    const input = model.trailers[resolved.index];
    const definition = input && model.catalogue.find((item) => item.id === input.definitionId);
    if (!input || !definition) {
      throw new Error(`AutoCAD export cannot resolve trailer ${resolved.index + 1} against the selected catalogue.`);
    }
    const trailerIndex = outputIndex + 1;
    const rearPpuWeight = input.ppuLeft ? definition.ppuWeightT ?? 0 : 0;
    const frontPpuWeight = input.ppuRight ? definition.ppuWeightT ?? 0 : 0;
    totalPowerpacks += Number(input.ppuLeft) + Number(input.ppuRight);
    totalAxleLines += input.axleLines;
    lines.push(line(
      "TRAILER",
      trailerIndex,
      textField(definition.name),
      input.axleLines,
      resolved.startXM * 1000,
      resolved.centreYM * 1000,
      definition.axleSpacingM * 1000,
      resolved.lengthM * 1000,
      resolved.widthM * 1000,
      input.ppuLeft,
      input.ppuRight,
      resolved.ppuLeftLengthM * 1000,
      resolved.ppuRightLengthM * 1000,
      rearPpuWeight,
      frontPpuWeight,
      definition.axleWeightT * input.axleLines,
      definition.axleCapacityT,
    ));

    const grouping = model.groupings[resolved.index] ?? {
      splitAfterAxleLine: 1,
      groups: [],
      pinnedAxleLines: [],
    };
    const corners = cornerGroups(grouping);
    lines.push(line(
      "HYDRAULIC",
      trailerIndex,
      model.hydraulicSystemMode,
      grouping.splitAfterAxleLine,
      corners.rearLeft,
      corners.frontLeft,
      corners.rearRight,
      corners.frontRight,
    ));
    lines.push(line(
      "PINS",
      trailerIndex,
      grouping.pinnedAxleLines
        .filter((axleLine) => Number.isFinite(axleLine) && axleLine > 0)
        .map((axleLine) => Math.round(axleLine))
        .join(","),
    ));
  });

  model.supports.forEach((support, index) => {
    const settled = result.supports[index];
    lines.push(line(
      "SUPPORT",
      index + 1,
      support.xM * 1000,
      support.widthM * 1000,
      support.allowed,
      settled?.active ?? false,
      settled?.reactionT ?? support.optionalWeightT ?? 0,
    ));
  });

  const pressureDefinition = model.catalogue.find((item) => item.id === model.trailers[result.resolvedTrailers[0]?.index]?.definitionId);
  result.groups.forEach((group, groupIndex) => {
    const groupAxles = result.axlePoints.filter((axle) => axle.group === group.group);
    const neutralLoadT = result.stabilityLoads.neutral[groupIndex] ?? group.loadT;
    const caseLoadsT = Array.from({ length: 4 }, (_, caseIndex) =>
      result.stabilityLoads.dynamic[caseIndex]?.[groupIndex] ?? neutralLoadT);
    const maximumAxleLoadT = groupAxles.length ? Math.max(...groupAxles.map((axle) => axle.loadT)) : 0;
    const maximumUtilisation = groupAxles.length ? Math.max(...groupAxles.map((axle) => axle.utilisation)) : 0;
    lines.push(line(
      "GROUP",
      group.group,
      group.axleCount,
      neutralLoadT,
      hydraulicPressureBar(neutralLoadT, group.axleCount, pressureDefinition?.factor ?? null, pressureDefinition?.massBelowCylinderT ?? null),
      ...caseLoadsT.map((loadT) => hydraulicPressureBar(loadT, group.axleCount, pressureDefinition?.factor ?? null, pressureDefinition?.massBelowCylinderT ?? null)),
      maximumAxleLoadT,
      maximumUtilisation * 100,
    ));
  });

  result.stabilityPolygon.forEach((point, index) => {
    lines.push(line("BOUNDARY", index + 1, point.x * 1000, point.y * 1000));
  });

  const firstResolved = result.resolvedTrailers[0];
  const firstInput = model.trailers[firstResolved.index];
  const firstDefinition = model.catalogue.find((item) => item.id === firstInput.definitionId);
  lines.push(line(
    "RESULT",
    result.totalMassT,
    result.combinedCog.x * 1000,
    result.combinedCog.y * 1000,
    result.combinedCog.z * 1000,
    result.combinedCog.x,
    result.combinedCog.y,
    firstDefinition?.axleCapacityT ?? 0,
    model.environment.routeLongitudinalSlopeDeg,
    model.environment.routeTransverseSlopeDeg,
    model.environment.windSpeedMps,
    model.environment.longitudinalAccelerationMps2,
    result.metrics.basicAngle.value ?? 0,
    result.metrics.dynamicAngle.value ?? 0,
    textField(result.status),
  ));
  lines.push(line(
    "END",
    result.resolvedTrailers.length,
    totalAxleLines,
    totalPowerpacks,
    model.supports.length,
    result.stabilityPolygon.length,
  ));
  return `${lines.join("\r\n")}\r\n`;
}
