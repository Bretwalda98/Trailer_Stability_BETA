import type { CalculationResult, ProjectModel } from "../engine/types";
import { formatCompact } from "./format";

export type DetailValueType = "text" | "number" | "boolean" | "select" | "calculated" | "unavailable";

export interface EngineeringDetailRow {
  id: string;
  category: string;
  label: string;
  value: string | number | boolean | null;
  unit: string;
  source: string;
  valueType: DetailValueType;
  editable: boolean;
  fieldKey?: string;
  status?: "OK" | "NOK" | "N/A" | "WARN";
  validation?: string;
}

const row = (
  id: string,
  category: string,
  label: string,
  value: EngineeringDetailRow["value"],
  unit: string,
  source: string,
  options: Partial<Pick<EngineeringDetailRow, "valueType" | "editable" | "fieldKey" | "status" | "validation">> = {},
): EngineeringDetailRow => ({
  id,
  category,
  label,
  value,
  unit,
  source,
  valueType: options.valueType ?? (options.editable ? "number" : "calculated"),
  editable: options.editable ?? false,
  fieldKey: options.fieldKey,
  status: options.status,
  validation: options.validation,
});

export function buildEngineeringDetailRows(
  model: ProjectModel,
  result: CalculationResult,
): EngineeringDetailRow[] {
  const rows: EngineeringDetailRow[] = [
    row("project-degree", "Project and references", "Engineering verification degree", model.engineeringDegree, "", "F17", {
      editable: true,
      fieldKey: "engineeringDegree",
      valueType: "select",
    }),
    row("project-cargo", "Project and references", "Cargo / project name", model.cargo.name, "", "D21", {
      editable: true,
      fieldKey: "cargo.name",
      valueType: "text",
    }),
    row("project-client", "Project and references", "Client reference", model.cargo.clientReference, "", "J21", {
      editable: true,
      fieldKey: "cargo.clientReference",
      valueType: "text",
    }),
    row("project-owner", "Project and references", "Owner reference", model.cargo.ownerReference, "", "D22", {
      editable: true,
      fieldKey: "cargo.ownerReference",
      valueType: "text",
    }),
    row("project-weight-cog", "Project and references", "Weight / COG information reference", model.weightCogReference, "", "J22", {
      editable: true,
      fieldKey: "weightCogReference",
      valueType: "text",
    }),
    row("project-datum", "Project and references", "Load datum / reference point", model.referencePoint, "", "D48", {
      editable: true,
      fieldKey: "referencePoint",
      valueType: "text",
    }),
    row("cargo-length", "Cargo dimensions and position", "Cargo length", model.cargo.lengthM, "m", "C52", {
      editable: true,
      fieldKey: "cargo.lengthM",
    }),
    row("cargo-width", "Cargo dimensions and position", "Cargo width", model.cargo.widthM, "m", "C53", {
      editable: true,
      fieldKey: "cargo.widthM",
    }),
    row("cargo-extreme-x", "Cargo dimensions and position", "Cargo extreme X", model.cargo.extremeX, "m", "C54", {
      editable: true,
      fieldKey: "cargo.extremeX",
    }),
    row("cargo-extreme-y", "Cargo dimensions and position", "Cargo extreme Y", model.cargo.extremeY, "m", "C55", {
      editable: true,
      fieldKey: "cargo.extremeY",
    }),
    row("cargo-height", "Cargo dimensions and position", "Cargo height", model.cargo.heightM, "m", "C56", {
      editable: true,
      fieldKey: "cargo.heightM",
    }),
    row("cargo-mass", "Cargo weight and COG", "Cargo mass", model.cargo.massT, "t", "C63", {
      editable: true,
      fieldKey: "cargo.massT",
    }),
    row("cargo-cog-x", "Cargo weight and COG", "Cargo COG X from datum", model.cargo.cog.x, "m", "C64", {
      editable: true,
      fieldKey: "cargo.cog.x",
    }),
    row("cargo-cog-y", "Cargo weight and COG", "Cargo COG Y from datum", model.cargo.cog.y, "m", "C65", {
      editable: true,
      fieldKey: "cargo.cog.y",
    }),
    row("cargo-cog-z", "Cargo weight and COG", "Cargo COG Z from cargo bottom", model.cargo.cog.z, "m", "C66", {
      editable: true,
      fieldKey: "cargo.cog.z",
    }),
    row("cargo-envelope-x", "COG envelopes", "Cargo COG envelope X ±", model.cargo.envelopeX, "m", "E64", {
      editable: true,
      fieldKey: "cargo.envelopeX",
    }),
    row("cargo-envelope-y", "COG envelopes", "Cargo COG envelope Y ±", model.cargo.envelopeY, "m", "E65", {
      editable: true,
      fieldKey: "cargo.envelopeY",
    }),
    row("packing-mass", "Packing", "Packing mass", model.packing.massT, "t", "C70", {
      editable: true,
      fieldKey: "packing.massT",
    }),
    row("packing-height", "Packing", "Packing height", model.packing.heightM, "m", "C71", {
      editable: true,
      fieldKey: "packing.heightM",
    }),
    row("packing-cog-x", "Packing", "Packing COG X", model.packing.cog.x, "m", "C72", {
      editable: true,
      fieldKey: "packing.cog.x",
    }),
    row("packing-cog-y", "Packing", "Packing COG Y", model.packing.cog.y, "m", "C73", {
      editable: true,
      fieldKey: "packing.cog.y",
    }),
    row("packing-cog-z", "Packing", "Packing COG Z", model.packing.cog.z, "m", "C74", {
      editable: true,
      fieldKey: "packing.cog.z",
    }),
    row(
      "packing-footprint",
      "Packing",
      "Packing footprint",
      "Not defined by ProjectModel",
      "",
      "Native model",
      { valueType: "unavailable", status: "N/A", validation: "Only packing mass, height and COG are available." },
    ),
    row("deck-height", "Trailer definitions", "Trailer deck height", model.trailerDeckHeightM, "m", "C85", {
      editable: true,
      fieldKey: "trailerDeckHeightM",
    }),
  ];

  model.trailers.forEach((trailer, index) => {
    const definition = model.catalogue.find((item) => item.id === trailer.definitionId);
    const sourceRow = 89 + index;
    const category = `Trailer ${index + 1}`;
    rows.push(
      row(`trailer-${index}-model`, category, "Trailer model", definition?.name ?? "Missing catalogue record", "", `B${sourceRow}`, {
        editable: true,
        fieldKey: `trailers.${index}.definitionId`,
        valueType: "select",
        status: definition ? undefined : "NOK",
      }),
      row(`trailer-${index}-axles`, category, "Number of axle lines", trailer.axleLines, "AL", `C${sourceRow}`, {
        editable: true,
        fieldKey: `trailers.${index}.axleLines`,
      }),
      row(`trailer-${index}-single`, category, "One-file configuration", trailer.singleFile, "", `D${sourceRow}`, {
        editable: true,
        fieldKey: `trailers.${index}.singleFile`,
        valueType: "boolean",
      }),
      row(`trailer-${index}-x`, category, "Trailer X position", trailer.xM, "m", `E${sourceRow}`, {
        editable: true,
        fieldKey: `trailers.${index}.xM`,
      }),
      row(`trailer-${index}-y`, category, "Trailer Y position", trailer.yM, "m", `F${sourceRow}`, {
        editable: true,
        fieldKey: `trailers.${index}.yM`,
      }),
      row(`trailer-${index}-reference`, category, "Placement reference", trailer.placementReference, "", "Native model", {
        editable: true,
        fieldKey: `trailers.${index}.placementReference`,
        valueType: "select",
      }),
      row(`trailer-${index}-ppu-left`, category, "PPU at front / left", trailer.ppuLeft, "", `J${sourceRow}`, {
        editable: true,
        fieldKey: `trailers.${index}.ppuLeft`,
        valueType: "boolean",
      }),
      row(`trailer-${index}-ppu-right`, category, "PPU at rear / right", trailer.ppuRight, "", `K${sourceRow}`, {
        editable: true,
        fieldKey: `trailers.${index}.ppuRight`,
        valueType: "boolean",
      }),
    );
    if (definition) {
      rows.push(
        row(`trailer-${index}-spacing`, "Trailer definitions", `${definition.name} axle spacing`, definition.axleSpacingM, "m", "tblTrailerData[axle spacing]"),
        row(`trailer-${index}-width`, "Trailer definitions", `${definition.name} width`, definition.trailerWidthM, "m", "tblTrailerData[trailer width]"),
        row(`trailer-${index}-capacity`, "Trailer definitions", `${definition.name} axle-line capacity`, definition.axleCapacityT, "t", "tblTrailerData[axle capacity]"),
        row(`trailer-${index}-ppu-length`, "PPU definitions", `${definition.name} PPU length`, definition.ppuLengthM, "m", "tblTrailerData[PPU length]"),
        row(`trailer-${index}-ppu-mass`, "PPU definitions", `${definition.name} PPU mass`, definition.ppuWeightT, "t", "tblTrailerData[PPU weight]"),
      );
    }
  });

  model.groupings.forEach((grouping, index) => {
    const category = `Hydraulic grouping · Trailer ${index + 1}`;
    const firstRow = 138 + index * 2;
    rows.push(
      row(`grouping-${index}-split`, category, "Split after axle line", grouping.splitAfterAxleLine, "AL", `D${firstRow}`, {
        editable: true,
        fieldKey: `groupings.${index}.splitAfterAxleLine`,
      }),
      row(`grouping-${index}-front-left`, category, "Front left circuit group", grouping.cornerGroups?.frontLeft ?? null, "", `B${firstRow}`, {
        editable: true,
        fieldKey: `groupings.${index}.cornerGroups.frontLeft`,
        valueType: "select",
      }),
      row(`grouping-${index}-front-right`, category, "Front right circuit group", grouping.cornerGroups?.frontRight ?? null, "", `B${firstRow + 1}`, {
        editable: true,
        fieldKey: `groupings.${index}.cornerGroups.frontRight`,
        valueType: "select",
      }),
      row(`grouping-${index}-rear-left`, category, "Rear left circuit group", grouping.cornerGroups?.rearLeft ?? null, "", `C${firstRow}`, {
        editable: true,
        fieldKey: `groupings.${index}.cornerGroups.rearLeft`,
        valueType: "select",
      }),
      row(`grouping-${index}-rear-right`, category, "Rear right circuit group", grouping.cornerGroups?.rearRight ?? null, "", `C${firstRow + 1}`, {
        editable: true,
        fieldKey: `groupings.${index}.cornerGroups.rearRight`,
        valueType: "select",
      }),
      row(`grouping-${index}-pins`, "Pinned axle lines", `Trailer ${index + 1} pinned axle lines`, grouping.pinnedAxleLines.join(", ") || "None", "AL", "G136:N147", {
        editable: true,
        fieldKey: `groupings.${index}.pinnedAxleLines`,
        valueType: "text",
      }),
    );
  });

  result.groups.forEach((group) => {
    rows.push(
      row(`group-${group.group}-x`, "Group centres", `G${group.group} centre X`, group.point.x, "m", `K${150 + group.group}`),
      row(`group-${group.group}-y`, "Group centres", `G${group.group} centre Y`, group.point.y, "m", `M${150 + group.group}`),
      row(`group-${group.group}-load`, "Neutral group loads", `G${group.group} neutral load`, group.loadT, "t", "Engine groups[].loadT"),
      row(`group-${group.group}-fraction`, "Neutral group loads", `G${group.group} reaction fraction`, group.reactionFraction * 100, "%", "Engine groups[].reactionFraction"),
      row(`group-${group.group}-axles`, "Neutral group loads", `G${group.group} active bogie count`, group.axleCount, "", "Engine groups[].axleCount"),
    );
  });

  model.supports.forEach((support, index) => {
    const calculated = result.supports.find((item) => item.id === support.id);
    const category = "Supports";
    rows.push(
      row(`support-${index}-x`, category, `Support ${index + 1} X`, support.xM, "m", `C${446 + index}`, {
        editable: true,
        fieldKey: `supports.${index}.xM`,
      }),
      row(`support-${index}-width`, category, `Support ${index + 1} spread width`, support.widthM, "m", `D${446 + index}`, {
        editable: true,
        fieldKey: `supports.${index}.widthM`,
      }),
      row(`support-${index}-allowed`, category, `Support ${index + 1} allowed`, support.allowed, "", `F${446 + index}`, {
        editable: true,
        fieldKey: `supports.${index}.allowed`,
        valueType: "boolean",
      }),
      row(`support-${index}-active`, category, `Support ${index + 1} active`, calculated?.active ?? support.active, "", `I${446 + index}`, {
        valueType: "calculated",
        status: calculated?.active ? "OK" : "WARN",
        validation: calculated?.disableReason || undefined,
      }),
      row(`support-${index}-reaction`, category, `Support ${index + 1} Rstatic`, calculated?.reactionT ?? null, "t", `G${446 + index}`, {
        status: (calculated?.reactionT ?? 0) < 0 ? "NOK" : "OK",
      }),
      row(`support-${index}-weight`, category, `Support ${index + 1} optional weight`, support.optionalWeightT ?? null, "t", `F${71 + index}`, {
        editable: true,
        fieldKey: `supports.${index}.optionalWeightT`,
      }),
    );
  });

  model.loosePacking.forEach((item, index) => {
    rows.push(
      row(`loose-${index}-type`, "Loose packing", `Loose item ${index + 1} type`, item.type, "", `B${439 + index}`, {
        editable: true,
        fieldKey: `loosePacking.${index}.type`,
        valueType: "text",
      }),
      row(`loose-${index}-mass`, "Loose packing", `Loose item ${index + 1} mass`, item.massT, "t", `D${439 + index}`, {
        editable: true,
        fieldKey: `loosePacking.${index}.massT`,
      }),
      row(`loose-${index}-start`, "Loose packing", `Loose item ${index + 1} start X`, item.startXM, "m", `E${439 + index}`, {
        editable: true,
        fieldKey: `loosePacking.${index}.startXM`,
      }),
      row(`loose-${index}-end`, "Loose packing", `Loose item ${index + 1} end X`, item.endXM, "m", `F${439 + index}`, {
        editable: true,
        fieldKey: `loosePacking.${index}.endXM`,
      }),
    );
  });

  rows.push(
    row("slope-route-long", "Slope inputs and effects", "Route longitudinal slope", model.environment.routeLongitudinalSlopeDeg, "°", "D291", {
      editable: true,
      fieldKey: "environment.routeLongitudinalSlopeDeg",
    }),
    row("slope-long", "Slope inputs and effects", "Residual longitudinal slope", model.environment.longitudinalSlopeDeg, "°", "E291", {
      editable: true,
      fieldKey: "environment.longitudinalSlopeDeg",
    }),
    row("slope-route-trans", "Slope inputs and effects", "Route transverse slope", model.environment.routeTransverseSlopeDeg, "°", "D292", {
      editable: true,
      fieldKey: "environment.routeTransverseSlopeDeg",
    }),
    row("slope-trans", "Slope inputs and effects", "Residual transverse slope", model.environment.transverseSlopeDeg, "°", "E292", {
      editable: true,
      fieldKey: "environment.transverseSlopeDeg",
    }),
    row("slope-combination", "Slope inputs and effects", "Combination factor", model.environment.combinationFactor, "", "D293", {
      editable: true,
      fieldKey: "environment.combinationFactor",
    }),
    row("wind-speed", "Dynamic environment", "Design wind speed", model.environment.windSpeedMps, "m/s", "E353", {
      editable: true,
      fieldKey: "environment.windSpeedMps",
    }),
    row("acc-long", "Dynamic environment", "Longitudinal acceleration", model.environment.longitudinalAccelerationMps2, "m/s²", "E354", {
      editable: true,
      fieldKey: "environment.longitudinalAccelerationMps2",
    }),
    row("acc-trans", "Dynamic environment", "Transverse acceleration", model.environment.transverseAccelerationMps2, "m/s²", "E355", {
      editable: true,
      fieldKey: "environment.transverseAccelerationMps2",
    }),
    row("wind-side-area", "Wind and acceleration effects", "Side wind area", model.cargo.sideWindAreaM2, "m²", "C57", {
      editable: true,
      fieldKey: "cargo.sideWindAreaM2",
    }),
    row("wind-side-height", "Wind and acceleration effects", "Side wind application height", model.cargo.sideWindHeightM, "m", "F57", {
      editable: true,
      fieldKey: "cargo.sideWindHeightM",
    }),
    row("wind-front-area", "Wind and acceleration effects", "Front wind area", model.cargo.frontWindAreaM2, "m²", "C59", {
      editable: true,
      fieldKey: "cargo.frontWindAreaM2",
    }),
    row("wind-front-height", "Wind and acceleration effects", "Front wind application height", model.cargo.frontWindHeightM, "m", "F59", {
      editable: true,
      fieldKey: "cargo.frontWindHeightM",
    }),
    row("spine-trailer", "Spine-beam inputs", "Analysed trailer", model.analysedTrailer, "", "F433", {
      editable: true,
      fieldKey: "analysedTrailer",
    }),
    row("spine-case", "Spine-beam inputs", "Spine-beam load case", model.spineLoadCase, "", "F434", {
      editable: true,
      fieldKey: "spineLoadCase",
      valueType: "select",
    }),
    row("spine-mesh", "Spine-beam inputs", "Mesh size", model.spineMeshSizeM, "m", "F435", {
      editable: true,
      fieldKey: "spineMeshSizeM",
    }),
    row("beam-shear-min", "Spine-beam results", "Minimum shear force", result.beam.shearMinKN, "kN", "Spinebeam calculation!E80"),
    row("beam-shear-min-x", "Spine-beam results", "Minimum shear force X", result.beam.shearMinXM, "m", "Spinebeam calculation!F80"),
    row("beam-shear-max", "Spine-beam results", "Maximum shear force", result.beam.shearMaxKN, "kN", "Spinebeam calculation!G80"),
    row("beam-shear-max-x", "Spine-beam results", "Maximum shear force X", result.beam.shearMaxXM, "m", "Spinebeam calculation!H80"),
    row("beam-moment-min", "Spine-beam results", "Minimum bending moment", result.beam.bendingMinKNm, "kNm", "Spinebeam calculation!E81"),
    row("beam-moment-min-x", "Spine-beam results", "Minimum bending moment X", result.beam.bendingMinXM, "m", "Spinebeam calculation!F81"),
    row("beam-moment-max", "Spine-beam results", "Maximum bending moment", result.beam.bendingMaxKNm, "kNm", "Spinebeam calculation!G81"),
    row("beam-moment-max-x", "Spine-beam results", "Maximum bending moment X", result.beam.bendingMaxXM, "m", "Spinebeam calculation!H81"),
    row("beam-deflection", "Spine-beam results", "Maximum absolute deflection", result.beam.absoluteDeflectionMm, "mm", "Load and Stability Calculation!E482"),
    row("beam-deflection-x", "Spine-beam results", "Deflection peak X", result.beam.deflectionPeakXM, "m", "Load and Stability Calculation!F482"),
    row("beam-shear-util", "Spine-beam results", "Shear utilisation", result.beam.shearUtilisation * 100, "%", "Load and Stability Calculation!F479"),
    row("beam-bending-util", "Spine-beam results", "Bending utilisation", result.beam.bendingUtilisation * 100, "%", "Load and Stability Calculation!F480"),
    row("beam-slope-unavailable", "Spine-beam results", "Beam slope diagram", "Not exposed by the native engine", "", "Unavailable", {
      valueType: "unavailable",
      status: "N/A",
    }),
    row("ground-bearing", "Ground-bearing pressure", "Ground-bearing pressure", "Workbook-only; not calculated by the native engine", "", "Load and Stability Calculation!B268:M281", {
      valueType: "unavailable",
      status: "N/A",
    }),
  );

  rows.push(
    row(
      "trailer-overlap-count",
      "Geometry validation",
      "Overlapping trailer pairs",
      result.trailerOverlaps.length,
      "",
      "Engine trailerOverlaps",
      { status: result.trailerOverlaps.length ? "NOK" : "OK" },
    ),
    row(
      "hydraulic-triangle-area",
      "Geometry validation",
      "Hydraulic triangle area",
      result.groupingQuality.triangleAreaM2,
      "m²",
      "Engine groupingQuality",
      { status: result.groups.length === 3 ? "OK" : "NOK" },
    ),
    row(
      "hydraulic-triangle-altitude",
      "Geometry validation",
      "Hydraulic triangle minimum altitude",
      result.groupingQuality.minimumAltitudeM,
      "m",
      "Engine groupingQuality",
      { status: result.groupingQuality.narrow ? "WARN" : "OK" },
    ),
    row(
      "hydraulic-triangle-aspect",
      "Geometry validation",
      "Hydraulic triangle altitude / longest edge",
      result.groupingQuality.aspectRatio,
      "",
      "Engine groupingQuality",
      { status: result.groupingQuality.narrow ? "WARN" : "OK" },
    ),
    row(
      "hydraulic-group-locality",
      "Geometry validation",
      "Local hydraulic group clusters",
      result.groupingQuality.dispersedGroups.length
        ? `Check ${result.groupingQuality.dispersedGroups.map((group) => `G${group}`).join(", ")}`
        : "All populated groups are local",
      "",
      "Engine groupingQuality",
      {
        status: result.groupingQuality.dispersedGroups.length ? "WARN" : "OK",
        valueType: "text",
      },
    ),
  );

  result.trailerOverlaps.forEach((overlap, index) => {
    rows.push(
      row(
        `trailer-overlap-${index + 1}`,
        "Geometry validation",
        `Trailer ${overlap.firstTrailerIndex + 1} / Trailer ${overlap.secondTrailerIndex + 1} overlap`,
        `${overlap.overlapXM.toFixed(3)} m longitudinal × ${overlap.overlapYM.toFixed(3)} m transverse`,
        "",
        "Engine trailerOverlaps",
        { status: "NOK", valueType: "text" },
      ),
    );
  });

  (Object.keys(result.metrics) as Array<keyof CalculationResult["metrics"]>).forEach((key) => {
    const metric = result.metrics[key];
    const percent = key.includes("Util") || key === "dynamicRatio" || key === "localBendingUtil";
    rows.push(
      row(
        `check-${key}`,
        "Final checks",
        key,
        metric.value === null ? null : percent ? metric.value * 100 : metric.value,
        percent ? "%" : key.includes("Angle") ? "°" : key === "deflection" ? "mm" : "",
        ["basicUtil", "slopeUtil", "dynamicUtil", "spineUtil"].includes(key)
          ? `Load and Stability Calculation!F${503 + ["basicUtil", "slopeUtil", "dynamicUtil", "spineUtil"].indexOf(key)}`
          : "Engine metrics",
        { status: metric.status },
      ),
    );
  });

  result.analysis.groupLoadContributions.forEach((contribution) => {
    rows.push(
      row(`contribution-${contribution.group}-neutral`, "Dynamic axle loads", `G${contribution.group} neutral load`, contribution.neutralLoadT, "t", "Engine analysis.groupLoadContributions"),
      row(`contribution-${contribution.group}-slope`, "Slope-adjusted axle loads", `G${contribution.group} worst slope load`, contribution.slopeLoadT, "t", "Engine analysis.groupLoadContributions"),
      row(`contribution-${contribution.group}-dynamic`, "Dynamic axle loads", `G${contribution.group} worst dynamic load`, contribution.dynamicLoadT, "t", "Engine analysis.groupLoadContributions"),
      row(`contribution-${contribution.group}-combined`, "Wind and acceleration effects", `G${contribution.group} combined wind + acceleration increment`, contribution.combinedDynamicDeltaT, "t", "Engine analysis.groupLoadContributions"),
    );
  });

  rows.push(
    row("support-count", "Final checks", "Active supports", result.activeSupportCount, "", "Engine activeSupportCount", {
      status: result.activeSupportCount >= result.minimumActiveSupports ? "OK" : "NOK",
    }),
    row("support-min", "Final checks", "Minimum active supports", result.minimumActiveSupports, "", "TS_CONTROL!B64"),
    row("calc-duration", "Final checks", "Calculation duration", result.calculationMs, "ms", "Engine calculationMs"),
    row("result-status", "Final checks", "Overall calculation state", result.status, "", "Engine status", {
      status: result.status === "PASS" ? "OK" : "NOK",
      valueType: "text",
    }),
    row("result-detail", "Notes and warnings", "Failure detail", result.failDetail || "No blocking failure", "", "Engine failDetail", {
      status: result.failDetail ? "NOK" : "OK",
      valueType: "text",
    }),
  );

  result.warnings.forEach((warning, index) => {
    rows.push(
      row(`warning-${index}`, "Notes and warnings", `Warning ${index + 1}`, warning, "", "Engine warnings", {
        valueType: "text",
        status: "WARN",
      }),
    );
  });

  return rows.map((item) => ({
    ...item,
    value: typeof item.value === "number" && !Number.isFinite(item.value) ? null : item.value,
    validation:
      item.validation ??
      (item.value === null && item.valueType !== "unavailable" ? "Value is not available for this case." : undefined),
  }));
}

export function engineeringDetailsCsv(rows: EngineeringDetailRow[]): string {
  const header = ["Category", "Label", "Value", "Unit", "Source", "Editable", "Status"];
  const lines = rows.map((item) => [
    item.category,
    item.label,
    typeof item.value === "number" ? formatCompact(item.value, 8) : item.value ?? "",
    item.unit,
    item.source,
    item.editable ? "yes" : "no",
    item.status ?? "",
  ]);
  return [header, ...lines]
    .map((values) => values.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))
    .join("\n");
}
