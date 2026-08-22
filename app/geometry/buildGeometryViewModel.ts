import type {
  CalculationResult,
  MetricValue,
  Point2,
  Point3,
  ProjectModel,
  TrailerDefinition,
} from "../engine/types";
import { engineeringLimitsFor } from "../engine/core";
import { engineeringRectPoints, expandBounds, finiteBounds } from "./transform";
import type {
  AxleLine,
  AxleLoad,
  Bogie,
  COGEnvelope,
  COGPoint,
  EngineeringCheck,
  GeometryViewModel,
  GroupLoad,
  HydraulicGroup,
  HydraulicGroupCentre,
  LabelData,
  LoadCase,
  LoadCaseMode,
  LoosePackingItem,
  PackingItem,
  PinnedAxleLine,
  PowerPack,
  ProjectCase,
  SelectionMetadata,
  SpineBeamResult,
  StabilityBoundary,
  Support,
  SupportSpread,
  TippingEdge,
  TrailerUnit,
  VirtualCOGShift,
  VisualEntityBase,
  CargoGeometry,
  GeometryKind,
} from "./types";

export const GROUP_COLOURS: Record<number, string> = {
  1: "#22d3ee",
  2: "#f59e0b",
  3: "#a78bfa",
  4: "#34d399",
};

export const COG_COLOURS = {
  cargo: "#facc15",
  packing: "#94a3b8",
  load: "#38bdf8",
  ppu: "#fb923c",
  trailer: "#cbd5e1",
  combined: "#ffffff",
  slope: "#fbbf24",
  dynamic: "#f472b6",
  worst: "#ef4444",
} as const;

function displayCoordinates(point: Point3) {
  return {
    plan: { x: point.x, y: point.y },
    end: { x: point.y, y: point.z },
    side: { x: point.x, y: point.z },
  };
}

function selection(
  kind: GeometryKind,
  title: string,
  inspectorGroup: string,
  editable = false,
  subtitle?: string,
): SelectionMetadata {
  return { kind, title, subtitle, inspectorGroup, editable };
}

function label(short: string, long = short, unit?: string, value?: string): LabelData {
  return { short, long, unit, value };
}

function base(
  id: string,
  kind: GeometryKind,
  point: Point3,
  options: {
    sourceTrailerId?: string | null;
    visible?: boolean;
    active?: boolean;
    selection: SelectionMetadata;
    label: LabelData;
    source?: string | null;
  },
): VisualEntityBase {
  return {
    id,
    kind,
    sourceTrailerId: options.sourceTrailerId ?? null,
    engineeringCoordinates: point,
    displayCoordinates: displayCoordinates(point),
    visible: options.visible ?? true,
    active: options.active ?? true,
    selection: options.selection,
    label: options.label,
    sourceDataReference: options.source ?? null,
  };
}

function definitionFor(model: ProjectModel, definitionId: string): TrailerDefinition | undefined {
  return model.catalogue.find((item) => item.id === definitionId);
}

function metricUnit(key: keyof CalculationResult["metrics"]): string {
  if (key.includes("Angle")) return "°";
  if (key === "deflection") return "mm";
  if (key === "axleLinesUsed") return "AL";
  return key.includes("Util") || key === "dynamicRatio" || key === "localBendingUtil" ? "%" : "";
}

function checkDirection(key: keyof CalculationResult["metrics"]): "lower" | "higher" {
  return key.includes("Angle") || key === "dynamicRatio" ? "higher" : "lower";
}

function metricLabel(key: keyof CalculationResult["metrics"]): string {
  const labels: Record<keyof CalculationResult["metrics"], string> = {
    basicUtil: "Basic static utilisation",
    slopeUtil: "Static utilisation incl. slopes",
    dynamicUtil: "Dynamic utilisation",
    spineUtil: "Spine-beam utilisation",
    basicAngle: "Basic static tipping angle",
    slopeAngle: "Static tipping angle incl. slopes",
    dynamicAngle: "Dynamic tipping angle",
    dynamicRatio: "Minimum dynamic / static group-load ratio",
    shearUtil: "Shear utilisation",
    bendingUtil: "Bending-moment utilisation",
    deflection: "Maximum absolute deflection",
    localBendingUtil: "Local bending utilisation",
    axleLinesUsed: "Axle lines used",
  };
  return labels[key];
}

function normalisedMetricValue(key: keyof CalculationResult["metrics"], metric: MetricValue): number | null {
  if (metric.value === null) return null;
  if (key.includes("Util") || key === "dynamicRatio" || key === "localBendingUtil") return metric.value * 100;
  return metric.value;
}

function basicEnvelope(points: Point2[]): Point2[] {
  if (points.length < 5) return points;
  return [points[1], points[2], points[4], points[3]];
}

function cogEntity(
  id: string,
  cogType: COGPoint["cogType"],
  title: string,
  point: Point3,
  marker: COGPoint["marker"],
  colour: string,
  source: string,
  available = true,
  unavailableReason?: string,
): COGPoint {
  return {
    ...base(id, "cog", point, {
      active: available,
      visible: available,
      selection: selection("cog", title, "COG", false, cogType),
      label: label(title, title, "m"),
      source,
    }),
    cogType,
    point,
    marker,
    colour,
    available,
    unavailableReason,
  };
}

export function buildGeometryViewModel(
  model: ProjectModel,
  result: CalculationResult,
  loadCase: LoadCaseMode = "dynamic",
): GeometryViewModel {
  const projectPoint = result.combinedCog;
  const project: ProjectCase = {
    ...base("project-case", "project", projectPoint, {
      selection: selection("project", model.cargo.name || "Project case", "Project", true),
      label: label(model.cargo.name || "Project case"),
      source: "ProjectModel",
    }),
    model,
    result,
    loadCase,
    status: result.status,
  };

  const cargoBottomZ = model.trailerDeckHeightM + model.packing.heightM;
  const cargoCentre = {
    x: model.cargo.extremeX + model.cargo.lengthM / 2,
    y: model.cargo.extremeY + model.cargo.widthM / 2,
    z: cargoBottomZ + model.cargo.heightM / 2,
  };
  const cargo: CargoGeometry = {
    ...base("cargo", "cargo", cargoCentre, {
      selection: selection("cargo", model.cargo.name || "Cargo", "Cargo", true),
      label: label(model.cargo.name || "Cargo"),
      source: "Load and Stability Calculation!C52:C66",
    }),
    lengthM: model.cargo.lengthM,
    widthM: model.cargo.widthM,
    heightM: model.cargo.heightM,
    extremeX: model.cargo.extremeX,
    extremeY: model.cargo.extremeY,
    bottomZM: cargoBottomZ,
  };

  const packingFootprint = model.packing.footprint.mode === "CUSTOM"
    ? model.packing.footprint
    : {
        ...model.packing.footprint,
        lengthM: model.cargo.lengthM,
        widthM: model.cargo.widthM,
        extremeX: model.cargo.extremeX,
        extremeY: model.cargo.extremeY,
      };
  const packing: PackingItem = {
    ...base("packing", "packing", result.componentCogs.packing, {
      selection: selection("packing", "Packing", "Packing", true),
      label: label(
        "Packing",
        model.packing.footprint.mode === "CUSTOM"
          ? "Custom visual footprint"
          : "Cargo-sized visual estimate",
      ),
      source: "Load and Stability Calculation!C70:C74",
    }),
    massT: model.packing.massT,
    heightM: model.packing.heightM,
    footprintDefined: model.packing.footprint.mode === "CUSTOM",
    footprintMode: model.packing.footprint.mode,
    lengthM: packingFootprint.lengthM,
    widthM: packingFootprint.widthM,
    extremeX: packingFootprint.extremeX,
    extremeY: packingFootprint.extremeY,
  };

  const collidingTrailerIds = new Set(
    result.trailerOverlaps.flatMap((overlap) => [
      overlap.firstTrailerId,
      overlap.secondTrailerId,
    ]),
  );
  const trailers: TrailerUnit[] = result.resolvedTrailers.map((resolved) => {
    const input = model.trailers[resolved.index];
    const definition = input ? definitionFor(model, input.definitionId) : undefined;
    const point = {
      x: resolved.startXM + resolved.lengthM / 2,
      y: resolved.centreYM,
      z: model.trailerDeckHeightM,
    };
    return {
      ...base(`trailer:${resolved.id}`, "trailer", point, {
        sourceTrailerId: resolved.id,
        selection: selection(
          "trailer",
          `Trailer ${resolved.index + 1}`,
          "Trailer",
          true,
          resolved.name,
        ),
        label: label(`T${resolved.index + 1}`, resolved.name),
        source: `Load and Stability Calculation!B${89 + resolved.index}:K${89 + resolved.index}`,
      }),
      index: resolved.index,
      definitionId: input?.definitionId ?? "",
      definitionName: resolved.name,
      startXM: resolved.startXM,
      centreYM: resolved.centreYM,
      lengthM: resolved.lengthM,
      widthM: resolved.widthM,
      deckHeightM: model.trailerDeckHeightM,
      crossBogieSpacingM: definition?.crossBogieSpacingM ?? null,
      tyreWidthM: definition?.tyreWidthM ?? 0,
      wheelDiameterM: definition?.wheelDiameterM ?? 0,
      axleLines: input?.axleLines ?? 0,
      singleFile: input?.singleFile ?? false,
      frontAt: "positive-x",
      ppuLeftLengthM: resolved.ppuLeftLengthM,
      ppuRightLengthM: resolved.ppuRightLengthM,
      colliding: collidingTrailerIds.has(resolved.id),
    };
  });

  const bogies: Bogie[] = result.axlePoints.map((axle, index) => {
    const input = model.trailers[axle.trailerIndex];
    const definition = input ? definitionFor(model, input.definitionId) : undefined;
    const point = { x: axle.point.x, y: axle.point.y, z: Math.max(0, model.trailerDeckHeightM / 2) };
    return {
      ...base(`bogie:${axle.trailerId}:${axle.axleLine}:${index}`, "bogie", point, {
        sourceTrailerId: axle.trailerId,
        active: !axle.pinned,
        selection: selection(
          "bogie",
          `Bogie · AL ${axle.axleLine}`,
          "Axle load",
          false,
          `Group G${axle.group}`,
        ),
        label: label(`AL${axle.axleLine}`, `Axle line ${axle.axleLine}`, "t", axle.loadT.toFixed(2)),
        source: `Bogie coordinates / trailer ${axle.trailerIndex + 1}`,
      }),
      trailerIndex: axle.trailerIndex,
      axleLine: axle.axleLine,
      groupId: axle.group,
      xM: axle.point.x,
      yM: axle.point.y,
      tyreWidthM: definition?.tyreWidthM ?? 0,
      wheelDiameterM: definition?.wheelDiameterM ?? 0,
      loadT: axle.loadT,
      capacityT: axle.capacityT,
      utilisation: axle.utilisation,
      pinned: axle.pinned,
    };
  });

  const axleMap = new Map<string, typeof result.axlePoints>();
  for (const axle of result.axlePoints) {
    const key = `${axle.trailerId}:${axle.axleLine}`;
    axleMap.set(key, [...(axleMap.get(key) ?? []), axle]);
  }
  const axleLines: AxleLine[] = [...axleMap.entries()].map(([key, members]) => {
    const first = members[0];
    const centreY = members.reduce((sum, axle) => sum + axle.point.y, 0) / members.length;
    const point = { x: first.point.x, y: centreY, z: model.trailerDeckHeightM / 2 };
    const loadT = members.reduce((sum, axle) => sum + axle.loadT, 0);
    const capacityT = members.reduce((sum, axle) => sum + axle.capacityT, 0);
    return {
      ...base(`axle-line:${key}`, "axle-line", point, {
        sourceTrailerId: first.trailerId,
        active: !members.every((axle) => axle.pinned),
        selection: selection(
          "axle-line",
          `Axle line ${first.axleLine}`,
          "Axle line",
          true,
          `Trailer ${first.trailerIndex + 1}`,
        ),
        label: label(`AL ${first.axleLine}`, `Axle line ${first.axleLine}`, "t", loadT.toFixed(2)),
        source: `Load and Stability Calculation!C${89 + first.trailerIndex}`,
      }),
      trailerIndex: first.trailerIndex,
      axleLine: first.axleLine,
      xM: first.point.x,
      centreYM: centreY,
      groupIds: [...new Set(members.map((axle) => axle.group))],
      pinned: members.every((axle) => axle.pinned),
      capacityT,
      loadT,
      utilisation: capacityT > 0 ? loadT / capacityT : 0,
    };
  });

  const groupCentres: HydraulicGroupCentre[] = result.groups.map((group) => ({
    ...base(`group-centre:${group.group}`, "group-centre", { ...group.point, z: 0 }, {
      selection: selection(
        "group-centre",
        `Hydraulic Group G${group.group}`,
        "Hydraulics",
        false,
        "Group centre",
      ),
      label: label(`G${group.group}`, `Hydraulic group ${group.group}`, "t", group.loadT.toFixed(2)),
      source: `Load and Stability Calculation!K${150 + group.group}:M${150 + group.group}`,
    }),
    groupId: group.group,
    point: group.point,
    axleCount: group.axleCount,
    loadT: group.loadT,
    reactionFraction: group.reactionFraction,
  }));

  const groups: HydraulicGroup[] = Array.from(
    { length: model.hydraulicSystemMode === "FOUR_POINT" ? 4 : 3 },
    (_, index) => index + 1,
  ).map((groupId) => {
    const groupBogies = bogies.filter((bogie) => bogie.groupId === groupId);
    const groupAxles = axleLines.filter((axle) => axle.groupIds.includes(groupId));
    const centre = groupCentres.find((item) => item.groupId === groupId);
    const point = centre
      ? { ...centre.point, z: 0 }
      : { x: result.combinedCog.x, y: result.combinedCog.y, z: 0 };
    return {
      ...base(`hydraulic-group:${groupId}`, "hydraulic-group", point, {
        active: Boolean(centre),
        selection: selection(
          "hydraulic-group",
          `Hydraulic Group G${groupId}`,
          "Hydraulics",
          true,
        ),
        label: label(`G${groupId}`, `Hydraulic group ${groupId}`, "t", (centre?.loadT ?? 0).toFixed(2)),
        source: "Load and Stability Calculation!B138:D161",
      }),
      groupId,
      colour: GROUP_COLOURS[groupId],
      axleLineIds: groupAxles.map((item) => item.id),
      bogieIds: groupBogies.map((item) => item.id),
      centreId: centre?.id ?? null,
      activeAxleLineCount: groupAxles.filter((item) => !item.pinned).length,
      activeBogieCount: groupBogies.filter((item) => !item.pinned).length,
      netStaticLoadT: centre?.loadT ?? 0,
    };
  });

  const pinnedAxleLines: PinnedAxleLine[] = axleLines
    .filter((axle) => axle.pinned)
    .map((axle) => ({
      ...base(`pin:${axle.id}`, "pinned-axle-line", axle.engineeringCoordinates, {
        sourceTrailerId: axle.sourceTrailerId,
        selection: selection(
          "pinned-axle-line",
          `Pinned axle line ${axle.axleLine}`,
          "Hydraulics",
          true,
        ),
        label: label(`PIN ${axle.axleLine}`),
        source: "Load and Stability Calculation!G136:N147",
      }),
      trailerIndex: axle.trailerIndex,
      axleLine: axle.axleLine,
      axleLineId: axle.id,
    }));

  const powerPacks: PowerPack[] = trailers.flatMap((trailer) => {
    const input = model.trailers[trailer.index];
    const definition = input ? definitionFor(model, input.definitionId) : undefined;
    const packs: PowerPack[] = [];
    if (input?.ppuLeft && trailer.ppuLeftLengthM > 0) {
      const startXM = trailer.startXM - trailer.ppuLeftLengthM;
      const point = {
        x: startXM + trailer.ppuLeftLengthM / 2,
        y: trailer.centreYM,
        z: model.trailerDeckHeightM / 2,
      };
      packs.push({
        ...base(`ppu:${trailer.sourceTrailerId}:rear`, "power-pack", point, {
          sourceTrailerId: trailer.sourceTrailerId,
          selection: selection("power-pack", `PPU · Trailer ${trailer.index + 1} rear`, "PPU", true),
          label: label("PPU", "Rear power pack", "t", definition?.ppuWeightT?.toFixed(2)),
          source: `Load and Stability Calculation!J${89 + trailer.index}`,
        }),
        trailerIndex: trailer.index,
        end: "rear",
        startXM,
        endXM: trailer.startXM,
        centreYM: trailer.centreYM,
        widthM: trailer.widthM,
        massT: definition?.ppuWeightT ?? null,
      });
    }
    if (input?.ppuRight && trailer.ppuRightLengthM > 0) {
      const startXM = trailer.startXM + trailer.lengthM;
      const point = {
        x: startXM + trailer.ppuRightLengthM / 2,
        y: trailer.centreYM,
        z: model.trailerDeckHeightM / 2,
      };
      packs.push({
        ...base(`ppu:${trailer.sourceTrailerId}:front`, "power-pack", point, {
          sourceTrailerId: trailer.sourceTrailerId,
          selection: selection("power-pack", `PPU · Trailer ${trailer.index + 1} front`, "PPU", true),
          label: label("PPU", "Front power pack", "t", definition?.ppuWeightT?.toFixed(2)),
          source: `Load and Stability Calculation!K${89 + trailer.index}`,
        }),
        trailerIndex: trailer.index,
        end: "front",
        startXM,
        endXM: startXM + trailer.ppuRightLengthM,
        centreYM: trailer.centreYM,
        widthM: trailer.widthM,
        massT: definition?.ppuWeightT ?? null,
      });
    }
    return packs;
  });

  const supports: Support[] = result.supports.map((support, index) => ({
    ...base(`support:${support.id}`, "support", { x: support.xM, y: result.combinedCog.y, z: 0 }, {
      active: support.active,
      selection: selection("support", `Support S${index + 1}`, "Supports", true),
      label: label(`S${index + 1}`, `Support ${index + 1}`, "t", support.reactionT.toFixed(2)),
      source: `Load and Stability Calculation!D${446 + index}:I${446 + index}`,
    }),
    supportIndex: index,
    xM: support.xM,
    widthM: support.widthM,
    allowed: support.allowed,
    reactionT: support.reactionT,
    disableReason: support.disableReason,
    transverseExtentDefined: false,
  }));

  const supportSpreads: SupportSpread[] = supports.map((support) => ({
    ...base(`support-spread:${support.id}`, "support-spread", support.engineeringCoordinates, {
      active: support.active,
      selection: selection("support-spread", `${support.label.short} spread`, "Supports", false),
      label: label(`${support.label.short} spread`, "Support spreading width", "m", support.widthM.toFixed(3)),
      source: support.sourceDataReference,
    }),
    supportId: support.id,
    startXM: support.xM - support.widthM / 2,
    endXM: support.xM + support.widthM / 2,
    transverseExtentDefined: false,
  }));

  const loosePacking: LoosePackingItem[] = model.loosePacking.map((item, index) => {
    const trailer = trailers[Math.max(0, model.analysedTrailer - 1)] ?? trailers[0];
    const point = {
      x: (item.startXM + item.endXM) / 2,
      y: trailer?.centreYM ?? result.combinedCog.y,
      z: model.trailerDeckHeightM + model.packing.heightM / 2,
    };
    return {
      ...base(`loose-packing:${item.id}`, "loose-packing", point, {
        sourceTrailerId: trailer?.sourceTrailerId ?? null,
        selection: selection("loose-packing", item.type || `Loose packing ${index + 1}`, "Loose packing", true),
        label: label(item.type || `LP${index + 1}`, item.type, "t", item.massT.toFixed(2)),
        source: `Load and Stability Calculation!B${439 + index}:F${439 + index}`,
      }),
      type: item.type,
      massT: item.massT,
      startXM: item.startXM,
      endXM: item.endXM,
      widthM: trailer?.widthM ?? null,
    };
  });

  const cogs: COGPoint[] = [
    cogEntity(
      "cog:cargo",
      "cargo",
      "Cargo COG",
      result.componentCogs.cargo,
      "cross",
      COG_COLOURS.cargo,
      "Load and Stability Calculation!C64:C66",
    ),
    cogEntity(
      "cog:packing",
      "packing",
      "Packing COG",
      result.componentCogs.packing,
      "diamond",
      COG_COLOURS.packing,
      "Load and Stability Calculation!C72:C74",
    ),
    cogEntity(
      "cog:load",
      "load",
      "Cargo + packing COG",
      result.componentCogs.load,
      "circle",
      COG_COLOURS.load,
      "Engine: loadCog",
    ),
    cogEntity(
      "cog:cargo-packing-ppu",
      "cargo-packing-ppu",
      "Cargo + packing + PPU COG",
      result.componentCogs.cargoPackingPpu,
      "square",
      COG_COLOURS.ppu,
      "Engine: componentCogs.cargoPackingPpu",
    ),
    cogEntity(
      "cog:trailer-self-weight",
      "trailer-self-weight",
      "Trailer self-weight COG",
      result.componentCogs.trailerSelfWeight ?? result.combinedCog,
      "triangle",
      COG_COLOURS.trailer,
      "Engine: componentCogs.trailerSelfWeight",
      Boolean(result.componentCogs.trailerSelfWeight),
      "No active trailer self-weight mass.",
    ),
    cogEntity(
      "cog:transporter",
      "transporter",
      "Combined transporter COG",
      result.componentCogs.transporter ?? result.combinedCog,
      "diamond",
      "#e2e8f0",
      "Engine: componentCogs.transporter",
      Boolean(result.componentCogs.transporter),
      "No active transporter mass.",
    ),
    cogEntity(
      "cog:all-inclusive",
      "all-inclusive",
      "All-inclusive combined COG",
      result.componentCogs.allInclusive,
      "target",
      COG_COLOURS.combined,
      "Engine: combinedCog",
    ),
    cogEntity(
      "cog:neutral",
      "neutral",
      "Neutral-load COG",
      { ...result.componentCogs.allInclusive },
      "circle",
      "#7dd3fc",
      "Engine: casePoints.basic[0]",
    ),
    cogEntity(
      "cog:pinned-axle",
      "pinned-axle",
      "Pinned-axle COG",
      result.componentCogs.allInclusive,
      "square",
      "#64748b",
      "Unavailable",
      false,
      "The native model does not expose a defined pinned-axle COG.",
    ),
    cogEntity(
      "cog:selected-case",
      "selected-case",
      "Selected load-case COG",
      { ...result.analysis.controllingPoint, z: result.combinedCog.z },
      "target",
      "#60a5fa",
      "Engine: analysis.controllingPoint",
    ),
    cogEntity(
      "cog:slope",
      "slope-shifted",
      "Slope-shifted COG",
      {
        x: result.combinedCog.x + result.analysis.slopeShift.x,
        y: result.combinedCog.y + result.analysis.slopeShift.y,
        z: result.combinedCog.z,
      },
      "diamond",
      COG_COLOURS.slope,
      "Engine: analysis.slopeShift",
    ),
    cogEntity(
      "cog:dynamic",
      "dynamic-shifted",
      "Dynamically shifted COG",
      {
        x: result.combinedCog.x + result.analysis.slopeShift.x + result.analysis.dynamicShift.x,
        y: result.combinedCog.y + result.analysis.slopeShift.y + result.analysis.dynamicShift.y,
        z: result.combinedCog.z,
      },
      "triangle",
      COG_COLOURS.dynamic,
      "Engine: analysis.dynamicShift",
    ),
    cogEntity(
      "cog:worst",
      "worst-case",
      "Worst-case COG",
      { ...result.analysis.controllingPoint, z: result.combinedCog.z },
      "target",
      COG_COLOURS.worst,
      "Engine: analysis.controllingPoint",
    ),
  ];

  const cargoCog = result.componentCogs.cargo;
  const cargoEnvelopePoints = [
    { x: cargoCog.x - model.cargo.envelopeX, y: cargoCog.y + model.cargo.envelopeY },
    { x: cargoCog.x + model.cargo.envelopeX, y: cargoCog.y + model.cargo.envelopeY },
    { x: cargoCog.x + model.cargo.envelopeX, y: cargoCog.y - model.cargo.envelopeY },
    { x: cargoCog.x - model.cargo.envelopeX, y: cargoCog.y - model.cargo.envelopeY },
  ];
  const envelopeDefinitions: Array<{
    id: string;
    type: COGEnvelope["envelopeType"];
    title: string;
    points: Point2[];
    colour: string;
    source: string;
  }> = [
    {
      id: "envelope:cargo",
      type: "cargo",
      title: "Cargo COG envelope",
      points: cargoEnvelopePoints,
      colour: "#94a3b8",
      source: "Load and Stability Calculation!E64:E65",
    },
    {
      id: "envelope:basic",
      type: "basic",
      title: "Basic combined COG envelope",
      points: basicEnvelope(result.casePoints.basic),
      colour: "#60a5fa",
      source: "Engine: casePoints.basic",
    },
    {
      id: "envelope:slope",
      type: "slope",
      title: "Slope-shifted combined envelope",
      points: result.casePoints.slope,
      colour: "#f59e0b",
      source: "Engine: casePoints.slope",
    },
    {
      id: "envelope:dynamic",
      type: "dynamic",
      title: "Dynamic combined virtual envelope",
      points: result.casePoints.dynamic,
      colour: "#f472b6",
      source: "Engine: casePoints.dynamic",
    },
  ];
  const envelopes: COGEnvelope[] = envelopeDefinitions.map((definition) => ({
    ...base(definition.id, "cog-envelope", { ...definition.points[0] ?? result.combinedCog, z: result.combinedCog.z }, {
      selection: selection("cog-envelope", definition.title, "Stability", false),
      label: label(definition.title),
      source: definition.source,
    }),
    envelopeType: definition.type,
    points: definition.points,
    closed: true,
    colour: definition.colour,
  }));

  const loadCases: LoadCase[] = [
    { mode: "basic", points: result.casePoints.basic },
    { mode: "slope", points: result.casePoints.slope },
    { mode: "dynamic", points: result.casePoints.dynamic },
    {
      mode: "comparison",
      points: [...result.casePoints.basic, ...result.casePoints.slope, ...result.casePoints.dynamic],
    },
  ].map((item) => ({
    ...base(`load-case:${item.mode}`, "load-case", result.combinedCog, {
      active: item.mode === loadCase,
      selection: selection("load-case", `${item.mode} load case`, "Load cases", true),
      label: label(item.mode),
      source: `Engine: casePoints.${item.mode === "comparison" ? "all" : item.mode}`,
    }),
    mode: item.mode as LoadCaseMode,
    spineLoadCase: model.spineLoadCase,
    points: item.points,
    metrics: result.metrics,
  }));

  const shiftDefinitions: Array<{
    id: string;
    type: VirtualCOGShift["shiftType"];
    title: string;
    vector: Point2;
    colour: string;
  }> = [
    { id: "shift:slope", type: "slope", title: "Slope shift", vector: result.analysis.slopeShift, colour: "#f59e0b" },
    { id: "shift:wind", type: "wind", title: "Wind shift", vector: result.analysis.windShift, colour: "#38bdf8" },
    {
      id: "shift:acceleration",
      type: "acceleration",
      title: "Acceleration shift",
      vector: result.analysis.accelerationShift,
      colour: "#a78bfa",
    },
    {
      id: "shift:dynamic",
      type: "combined-dynamic",
      title: "Combined dynamic shift",
      vector: result.analysis.dynamicShift,
      colour: "#f472b6",
    },
  ];
  const shifts: VirtualCOGShift[] = shiftDefinitions.map((item) => {
    const start = { x: result.combinedCog.x, y: result.combinedCog.y };
    const end = { x: start.x + item.vector.x, y: start.y + item.vector.y };
    return {
      ...base(item.id, "virtual-shift", { ...end, z: result.combinedCog.z }, {
        selection: selection("virtual-shift", item.title, "Load cases", false),
        label: label(item.title),
        source: `Engine: analysis.${item.type}`,
      }),
      shiftType: item.type,
      vector: item.vector,
      start,
      end,
    };
  });

  const stabilityBoundaryName = result.stabilityPolygon.length === 3
    ? "Stability triangle"
    : "Stability polygon";
  const stabilityBoundary: StabilityBoundary = {
    ...base("stability-boundary", "stability-boundary", { ...result.stabilityPolygon[0] ?? result.combinedCog, z: 0 }, {
      active: result.stabilityPolygon.length >= 3,
      selection: selection("stability-boundary", stabilityBoundaryName, "Stability", false),
      label: label(stabilityBoundaryName),
      source: "Engine: stabilityPolygon",
    }),
    points: result.stabilityPolygon,
    closed: true,
  };

  // The engine returns the convex stability boundary in perimeter order. Build
  // every perimeter edge from that result so three-point systems close as a
  // triangle and four-point systems close as a quadrilateral. The previous
  // fixed 0-1, 1-2, 2-0 list drew a diagonal across four-point boundaries and
  // made the visual fall back to a triangle even though the engine had four
  // valid corners.
  const edgePairs: Array<[number, number]> = result.stabilityPolygon.map(
    (_point, index) => [index, (index + 1) % result.stabilityPolygon.length],
  );
  const tippingEdges: TippingEdge[] = edgePairs
    .filter(([start, end]) => result.stabilityPolygon[start] && result.stabilityPolygon[end])
    .map(([start, end], edgeIndex) => {
      const first = result.stabilityPolygon[start];
      const second = result.stabilityPolygon[end];
      return {
        ...base(
          `tipping-edge:${edgeIndex}`,
          "tipping-edge",
          { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2, z: 0 },
          {
            active: edgeIndex === result.analysis.controllingEdgeIndex,
            selection: selection("tipping-edge", `Tipping edge ${edgeIndex + 1}`, "Stability", false),
            label: label(`Edge ${edgeIndex + 1}`),
            source: "Engine: analysis.controllingEdge",
          },
        ),
        edgeIndex,
        start: first,
        end: second,
        critical: edgeIndex === result.analysis.controllingEdgeIndex,
        distanceM: edgeIndex === result.analysis.controllingEdgeIndex
          ? result.analysis.controllingDistanceM
          : null,
        tippingAngleDeg: edgeIndex === result.analysis.controllingEdgeIndex
          ? result.analysis.controllingAngleDeg
          : null,
      };
    });

  const groupLoads: GroupLoad[] = result.groups.map((group) => ({
    ...base(`group-load:${group.group}`, "group-load", { ...group.point, z: 0 }, {
      selection: selection("group-load", `G${group.group} neutral load`, "Group loads", false),
      label: label(`G${group.group}`, `Hydraulic group ${group.group}`, "t", group.loadT.toFixed(2)),
      source: "Engine: groups[].loadT",
    }),
    groupId: group.group,
    loadT: group.loadT,
    reactionFraction: group.reactionFraction,
    axleCount: group.axleCount,
    caseMode: "basic",
  }));

  const axleLoads: AxleLoad[] = axleLines.map((axle) => ({
    ...base(`axle-load:${axle.id}`, "axle-load", axle.engineeringCoordinates, {
      sourceTrailerId: axle.sourceTrailerId,
      active: axle.active,
      selection: selection("axle-load", `${axle.label.long} load`, "Axle loads", false),
      label: label(axle.label.short, axle.label.long, "t", axle.loadT.toFixed(2)),
      source: "Engine: axlePoints",
    }),
    axleLineId: axle.id,
    loadT: axle.loadT,
    capacityT: axle.capacityT,
    utilisation: axle.utilisation,
  }));

  const spineBeam: SpineBeamResult = {
    ...base("spine-beam", "spine-beam", {
      x: result.beam.deflectionPeakXM,
      y: trailers[Math.max(0, model.analysedTrailer - 1)]?.centreYM ?? 0,
      z: 0,
    }, {
      sourceTrailerId: trailers[Math.max(0, model.analysedTrailer - 1)]?.sourceTrailerId ?? null,
      active: result.beam.points.length > 0,
      selection: selection("spine-beam", "Spine-beam result", "Spine beam", false),
      label: label("Spine beam", "Spine-beam result"),
      source: "Spinebeam calculation!B75:L85",
    }),
    points: result.beam.points,
    metrics: result.beam,
    analysedTrailer: model.analysedTrailer,
    loadCase: model.spineLoadCase,
  };

  const limits = engineeringLimitsFor(model.engineeringDegree);
  const checks: EngineeringCheck[] = (Object.keys(result.metrics) as Array<keyof CalculationResult["metrics"]>).map(
    (key) => {
      const value = result.metrics[key];
      const unit = metricUnit(key);
      const displayValue = normalisedMetricValue(key, value);
      return {
        ...base(`check:${key}`, "engineering-check", result.combinedCog, {
          active: value.active,
          selection: selection("engineering-check", metricLabel(key), "Checks", false),
          label: label(metricLabel(key), metricLabel(key), unit, displayValue?.toFixed(3)),
          source: key in limits ? `Engineering limits: ${model.engineeringDegree}` : "Engine: metrics",
        }),
        checkKey: key,
        value: displayValue,
        unit,
        status: value.status,
        direction: checkDirection(key),
      };
    },
  );

  const extentPoints: Point3[] = [
    ...engineeringRectPoints(
      cargo.extremeX,
      cargo.extremeY + cargo.widthM / 2,
      cargo.lengthM,
      cargo.widthM,
      cargo.bottomZM + cargo.heightM,
    ),
    ...engineeringRectPoints(
      packing.extremeX,
      packing.extremeY + packing.widthM / 2,
      packing.lengthM,
      packing.widthM,
      model.trailerDeckHeightM + model.packing.heightM,
    ),
    ...trailers.flatMap((trailer) =>
      engineeringRectPoints(
        trailer.startXM - trailer.ppuLeftLengthM,
        trailer.centreYM,
        trailer.lengthM + trailer.ppuLeftLengthM + trailer.ppuRightLengthM,
        trailer.widthM,
        trailer.deckHeightM,
      ),
    ),
    ...cogs.filter((item) => item.available).map((item) => item.point),
    ...groupCentres.map((item) => ({ ...item.point, z: 0 })),
    ...supports.map((item) => item.engineeringCoordinates),
  ];
  const modelSpan = Math.max(
    1,
    ...trailers.map((trailer) => trailer.lengthM),
    cargo.lengthM,
    cargo.widthM,
    packing.lengthM,
    packing.widthM,
  );
  const bounds = expandBounds(finiteBounds(extentPoints), Math.max(0.8, modelSpan * 0.06));

  const entities: VisualEntityBase[] = [
    project,
    cargo,
    packing,
    ...loosePacking,
    ...trailers,
    ...axleLines,
    ...bogies,
    ...groups,
    ...groupCentres,
    ...pinnedAxleLines,
    ...powerPacks,
    ...supports,
    ...supportSpreads,
    ...cogs,
    ...envelopes,
    ...loadCases,
    ...shifts,
    stabilityBoundary,
    ...tippingEdges,
    ...groupLoads,
    ...axleLoads,
    spineBeam,
    ...checks,
  ];

  return {
    project,
    cargo,
    packing,
    loosePacking,
    trailers,
    axleLines,
    bogies,
    groups,
    groupCentres,
    pinnedAxleLines,
    powerPacks,
    supports,
    supportSpreads,
    cogs,
    envelopes,
    loadCases,
    shifts,
    stabilityBoundary,
    tippingEdges,
    groupLoads,
    axleLoads,
    spineBeam,
    checks,
    bounds,
    unresolvedData: [
      "Packing footprint dimensions are not defined by the current ProjectModel.",
      "Support transverse extents are not defined; only longitudinal position and spread width are authoritative.",
      "Pinned-axle COG is not exposed by the native engine.",
      "Beam slope is not exposed by the native engine.",
      "Separate wind and acceleration group-load contributions are not exposed; the combined dynamic increment is available.",
    ],
    entityById: new Map(entities.map((entity) => [entity.id, entity])),
  };
}
