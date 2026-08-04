import { beamMetricsFromResult, solveContinuousBeam } from "./beam";
import { applyAutomaticProjectCargoCogEnvelopeInputs } from "./cargo-envelope";
import { hydraulicCornerForAxleLine } from "./orientation";
import type {
  AxlePoint,
  BeamMetrics,
  CalculationResult,
  CargoSupport,
  EngineeringDegree,
  GroupResult,
  HydraulicGroupingQuality,
  HydraulicGrouping,
  MetricValue,
  Point2,
  Point3,
  ProjectModel,
  SupportResult,
  SpineLoadCase,
  TrailerOverlap,
  TrailerDefinition,
  TrailerInput,
} from "./types";
import { applyAutomaticProjectWindInputs } from "./wind";

const GRAVITY = 9.81;
const EPS = 1e-9;

export interface EngineeringLimits {
  basicUtil: number;
  basicAngle: number;
  slopeUtil: number;
  slopeAngle: number;
  dynamicUtil: number;
  dynamicAngle: number;
  spineUtil: number;
  dynamicRatio: number;
}

const ENGINEERING_LIMITS: Record<EngineeringDegree, EngineeringLimits> = {
  First: {
    basicUtil: 0.7,
    basicAngle: 9,
    slopeUtil: 0.85,
    slopeAngle: 7,
    dynamicUtil: 0.9,
    dynamicAngle: 7,
    spineUtil: 0.75,
    dynamicRatio: 0.6,
  },
  Second: {
    basicUtil: 0.9,
    basicAngle: 7,
    slopeUtil: 0.9,
    slopeAngle: 5,
    dynamicUtil: 1,
    dynamicAngle: 5,
    spineUtil: 0.85,
    dynamicRatio: 0.6,
  },
  Third: {
    basicUtil: 1,
    basicAngle: 3,
    slopeUtil: 1,
    slopeAngle: 3,
    dynamicUtil: 1,
    dynamicAngle: 3,
    spineUtil: 1,
    dynamicRatio: 0.4,
  },
};

export function engineeringLimitsFor(degree: EngineeringDegree): EngineeringLimits {
  return ENGINEERING_LIMITS[degree] ?? ENGINEERING_LIMITS.Second;
}

interface ResolvedTrailer {
  input: TrailerInput;
  definition: TrailerDefinition;
  index: number;
  xM: number;
  yM: number;
  localCogX: number;
  tareMassT: number;
  ppuMassT: number;
}

interface StabilityState {
  fractions: number[];
  inside: boolean;
  minimumAngleDeg: number;
  edgeDistances: number[];
}

function finite(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function weightedPoint(items: Array<{ mass: number; point: Point3 }>): { mass: number; point: Point3 } {
  const mass = items.reduce((sum, item) => sum + Math.max(0, item.mass), 0);
  if (mass <= EPS) return { mass: 0, point: { x: 0, y: 0, z: 0 } };
  return {
    mass,
    point: {
      x: items.reduce((sum, item) => sum + item.mass * item.point.x, 0) / mass,
      y: items.reduce((sum, item) => sum + item.mass * item.point.y, 0) / mass,
      z: items.reduce((sum, item) => sum + item.mass * item.point.z, 0) / mass,
    },
  };
}

function cargoCogPoint(model: ProjectModel): Point3 {
  return {
    x: model.cargo.extremeX + model.cargo.cog.x,
    y: model.cargo.extremeY + model.cargo.cog.y,
    z: model.trailerDeckHeightM + model.packing.heightM + model.cargo.cog.z,
  };
}

function packingCogPoint(model: ProjectModel): Point3 {
  return {
    x: model.cargo.extremeX + model.packing.cog.x,
    y: model.cargo.extremeY + model.packing.cog.y,
    z: model.trailerDeckHeightM + model.packing.cog.z,
  };
}

function loadCog(model: ProjectModel): { mass: number; point: Point3 } {
  const cargoPoint = cargoCogPoint(model);
  const packingPoint = packingCogPoint(model);
  return weightedPoint([
    { mass: model.cargo.massT, point: cargoPoint },
    { mass: model.packing.massT, point: packingPoint },
  ]);
}

function definitionFor(model: ProjectModel, input: TrailerInput): TrailerDefinition | undefined {
  return model.catalogue.find((item) => item.id === input.definitionId);
}

function trailerMassItems(
  model: ProjectModel,
  trailer: ResolvedTrailer,
): Array<{ mass: number; point: Point3 }> {
  const moduleLength = trailer.definition.axleSpacingM * trailer.input.axleLines;
  const items: Array<{ mass: number; point: Point3 }> = [
    {
      mass: trailer.tareMassT,
      point: { x: trailer.xM + moduleLength / 2, y: trailer.yM, z: model.trailerDeckHeightM },
    },
  ];
  const ppuWeight = trailer.definition.ppuWeightT ?? 0;
  const ppuLength = trailer.definition.ppuLengthM ?? 0;
  if (trailer.input.ppuLeft && ppuWeight > 0) {
    items.push({
      mass: ppuWeight,
      point: {
        x: trailer.xM - ppuLength / 2,
        y: trailer.yM,
        z: model.trailerDeckHeightM,
      },
    });
  }
  if (trailer.input.ppuRight && ppuWeight > 0) {
    items.push({
      mass: ppuWeight,
      point: {
        x: trailer.xM + moduleLength + ppuLength / 2,
        y: trailer.yM,
        z: model.trailerDeckHeightM,
      },
    });
  }
  return items;
}

function resolvedComponentCogs(
  model: ProjectModel,
  trailers: ResolvedTrailer[],
  load: { mass: number; point: Point3 },
): {
  ppu: Point3 | null;
  trailerSelfWeight: Point3 | null;
  transporter: Point3 | null;
  cargoPackingPpu: Point3;
} {
  const trailerItems: Array<{ mass: number; point: Point3 }> = [];
  const ppuItems: Array<{ mass: number; point: Point3 }> = [];
  for (const trailer of trailers) {
    const moduleLength = trailer.definition.axleSpacingM * trailer.input.axleLines;
    trailerItems.push({
      mass: trailer.tareMassT,
      point: {
        x: trailer.xM + moduleLength / 2,
        y: trailer.yM,
        z: model.trailerDeckHeightM,
      },
    });
    const ppuWeight = trailer.definition.ppuWeightT ?? 0;
    const ppuLength = trailer.definition.ppuLengthM ?? 0;
    if (trailer.input.ppuLeft && ppuWeight > 0) {
      ppuItems.push({
        mass: ppuWeight,
        point: {
          x: trailer.xM - ppuLength / 2,
          y: trailer.yM,
          z: model.trailerDeckHeightM,
        },
      });
    }
    if (trailer.input.ppuRight && ppuWeight > 0) {
      ppuItems.push({
        mass: ppuWeight,
        point: {
          x: trailer.xM + moduleLength + ppuLength / 2,
          y: trailer.yM,
          z: model.trailerDeckHeightM,
        },
      });
    }
  }
  const trailerCog = trailerItems.length ? weightedPoint(trailerItems).point : null;
  const ppuCog = ppuItems.length ? weightedPoint(ppuItems).point : null;
  const transporterItems = [...trailerItems, ...ppuItems];
  const transporterCog = transporterItems.length ? weightedPoint(transporterItems).point : null;
  const cargoPackingPpu = weightedPoint([{ mass: load.mass, point: load.point }, ...ppuItems]).point;
  return {
    ppu: ppuCog,
    trailerSelfWeight: trailerCog,
    transporter: transporterCog,
    cargoPackingPpu,
  };
}

function resolveTrailers(model: ProjectModel, baseLoadCog: Point3): { trailers: ResolvedTrailer[]; combined: Point3; mass: number } {
  const valid = model.trailers
    .map((input, index) => ({ input, index, definition: definitionFor(model, input) }))
    .filter(
      (item): item is { input: TrailerInput; index: number; definition: TrailerDefinition } =>
        item.input.enabled && Boolean(item.definition) && item.input.axleLines > 0,
    );
  let allInclusiveReference = { x: baseLoadCog.x, y: baseLoadCog.y };
  let resolved: ResolvedTrailer[] = [];
  let result = { mass: 0, point: { x: baseLoadCog.x, y: baseLoadCog.y, z: baseLoadCog.z } };
  const load = loadCog(model);

  for (let iteration = 0; iteration < 80; iteration += 1) {
    resolved = valid.map(({ input, definition, index }) => {
      const reference =
        input.placementReference === "LOAD_COG"
          ? baseLoadCog
          : input.placementReference === "ALL_INCLUSIVE_COG"
            ? allInclusiveReference
            : { x: input.xM, y: input.yM };
      const xM =
        input.placementReference === "ABSOLUTE" ? input.xM : reference.x + input.offsetFromReference.x;
      const yM =
        input.placementReference === "ABSOLUTE" ? input.yM : reference.y + input.offsetFromReference.y;
      const tareMassT = definition.axleWeightT * input.axleLines;
      const ppuMassT = (input.ppuLeft ? definition.ppuWeightT ?? 0 : 0) + (input.ppuRight ? definition.ppuWeightT ?? 0 : 0);
      return {
        input,
        definition,
        index,
        xM,
        yM,
        localCogX: (definition.axleSpacingM * input.axleLines) / 2,
        tareMassT,
        ppuMassT,
      };
    });
    const items = [{ mass: load.mass, point: load.point }, ...resolved.flatMap((item) => trailerMassItems(model, item))];
    result = weightedPoint(items);
    const delta = Math.hypot(result.point.x - allInclusiveReference.x, result.point.y - allInclusiveReference.y);
    allInclusiveReference = { x: result.point.x, y: result.point.y };
    if (delta < 1e-10) break;
  }
  return { trailers: resolved, combined: result.point, mass: result.mass };
}

function groupingFor(model: ProjectModel, trailerIndex: number): HydraulicGrouping {
  return (
    model.groupings[trailerIndex] ?? {
      splitAfterAxleLine: 1,
      groups: [],
      cornerGroups: { rearLeft: 2, rearRight: 1, frontLeft: 3, frontRight: 1 },
      pinnedAxleLines: [],
    }
  );
}

function buildAxles(model: ProjectModel, trailers: ResolvedTrailer[]): AxlePoint[] {
  const result: AxlePoint[] = [];
  for (const trailer of trailers) {
    const grouping = groupingFor(model, trailer.index);
    const pinSet = new Set(grouping.pinnedAxleLines.map((value) => Math.round(value)));
    const crossSpacing =
      trailer.definition.crossBogieSpacingM ?? Math.max(0, trailer.definition.trailerWidthM - trailer.definition.tyreWidthM);
    for (let axleLine = 1; axleLine <= trailer.input.axleLines; axleLine += 1) {
      const x = trailer.xM + (axleLine - 0.5) * trailer.definition.axleSpacingM;
      const split = clamp(grouping.splitAfterAxleLine, 1, trailer.input.axleLines);
      const leftGroup = grouping.cornerGroups
        ? grouping.cornerGroups[
            hydraulicCornerForAxleLine(axleLine, split, "left")
          ]
        : grouping.groups[axleLine - 1] ?? 2;
      const rightGroup = grouping.cornerGroups
        ? grouping.cornerGroups[
            hydraulicCornerForAxleLine(axleLine, split, "right")
          ]
        : grouping.groups[axleLine - 1] ?? 1;
      const pinned = pinSet.has(axleLine);
      if (trailer.input.singleFile) {
        result.push({
          trailerId: trailer.input.id,
          trailerIndex: trailer.index,
          axleLine,
          group: leftGroup,
          pinned,
          point: { x, y: trailer.yM },
          capacityT: trailer.definition.axleCapacityT,
          tareT: trailer.definition.axleWeightT,
          loadT: 0,
          utilisation: 0,
        });
      } else {
        result.push(
          {
            trailerId: trailer.input.id,
            trailerIndex: trailer.index,
            axleLine,
            group: leftGroup,
            pinned,
            point: { x, y: trailer.yM - crossSpacing / 2 },
            capacityT: trailer.definition.axleCapacityT / 2,
            tareT: trailer.definition.axleWeightT / 2,
            loadT: 0,
            utilisation: 0,
          },
          {
            trailerId: trailer.input.id,
            trailerIndex: trailer.index,
            axleLine,
            group: rightGroup,
            pinned,
            point: { x, y: trailer.yM + crossSpacing / 2 },
            capacityT: trailer.definition.axleCapacityT / 2,
            tareT: trailer.definition.axleWeightT / 2,
            loadT: 0,
            utilisation: 0,
          },
        );
      }
    }
  }
  return result;
}

function groupCentres(axles: AxlePoint[]): GroupResult[] {
  const groups: GroupResult[] = [];
  for (const group of [1, 2, 3]) {
    const members = axles.filter((item) => item.group === group && !item.pinned);
    if (!members.length) continue;
    groups.push({
      group,
      point: {
        x: members.reduce((sum, item) => sum + item.point.x, 0) / members.length,
        y: members.reduce((sum, item) => sum + item.point.y, 0) / members.length,
      },
      axleCount: members.length,
      loadT: 0,
      reactionFraction: 0,
    });
  }
  return groups;
}

function findTrailerOverlaps(trailers: ResolvedTrailer[]): TrailerOverlap[] {
  const footprints = trailers.map((trailer) => {
    const moduleLength = trailer.definition.axleSpacingM * trailer.input.axleLines;
    const ppuLength = trailer.definition.ppuLengthM ?? 0;
    return {
      trailer,
      minX: trailer.xM - (trailer.input.ppuLeft ? ppuLength : 0),
      maxX: trailer.xM + moduleLength + (trailer.input.ppuRight ? ppuLength : 0),
      minY: trailer.yM - trailer.definition.trailerWidthM / 2,
      maxY: trailer.yM + trailer.definition.trailerWidthM / 2,
    };
  });
  const overlaps: TrailerOverlap[] = [];
  for (let first = 0; first < footprints.length; first += 1) {
    for (let second = first + 1; second < footprints.length; second += 1) {
      const a = footprints[first];
      const b = footprints[second];
      const overlapXM = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
      const overlapYM = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
      // Touching edges are permissible; a positive overlap in both axes is a
      // physically impossible trailer collision.
      if (overlapXM > 1e-6 && overlapYM > 1e-6) {
        overlaps.push({
          firstTrailerId: a.trailer.input.id,
          firstTrailerIndex: a.trailer.index,
          secondTrailerId: b.trailer.input.id,
          secondTrailerIndex: b.trailer.index,
          overlapXM,
          overlapYM,
        });
      }
    }
  }
  return overlaps;
}

function hydraulicGroupingQuality(
  axles: AxlePoint[],
  groups: GroupResult[],
): HydraulicGroupingQuality {
  if (groups.length !== 3) {
    return {
      triangleAreaM2: 0,
      minimumAltitudeM: 0,
      minimumEdgeM: 0,
      maximumEdgeM: 0,
      aspectRatio: 0,
      narrow: true,
      dispersedGroups: [],
    };
  }
  const [a, b, c] = groups.map((group) => group.point);
  const triangleAreaM2 =
    Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2;
  const edgeLengths = [
    Math.hypot(b.x - a.x, b.y - a.y),
    Math.hypot(c.x - b.x, c.y - b.y),
    Math.hypot(a.x - c.x, a.y - c.y),
  ];
  const minimumEdgeM = Math.min(...edgeLengths);
  const maximumEdgeM = Math.max(...edgeLengths);
  const minimumAltitudeM = maximumEdgeM > EPS ? (2 * triangleAreaM2) / maximumEdgeM : 0;
  const aspectRatio = maximumEdgeM > EPS ? minimumAltitudeM / maximumEdgeM : 0;

  const dispersedGroups = groups
    .filter((group) => {
      const members = axles.filter((axle) => axle.group === group.group);
      if (members.length < 2) return false;
      const connected = (first: AxlePoint, second: AxlePoint): boolean => {
        if (first.trailerId === second.trailerId) {
          if (first.axleLine === second.axleLine) return true;
          return (
            Math.abs(first.axleLine - second.axleLine) === 1 &&
            Math.abs(first.point.y - second.point.y) < 1e-6
          );
        }
        // Matching transverse files on adjacent trailers are one local
        // hydraulic region when their longitudinal locations align.
        return Math.abs(first.point.x - second.point.x) <= 0.25;
      };
      const visited = new Set<number>();
      let componentCount = 0;
      for (let start = 0; start < members.length; start += 1) {
        if (visited.has(start)) continue;
        componentCount += 1;
        const pending = [start];
        visited.add(start);
        while (pending.length) {
          const current = pending.pop()!;
          for (let candidate = 0; candidate < members.length; candidate += 1) {
            if (visited.has(candidate) || !connected(members[current], members[candidate])) continue;
            visited.add(candidate);
            pending.push(candidate);
          }
        }
      }
      return componentCount > 1;
    })
    .map((group) => group.group);

  return {
    triangleAreaM2,
    minimumAltitudeM,
    minimumEdgeM,
    maximumEdgeM,
    aspectRatio,
    narrow: minimumAltitudeM < 0.25 || aspectRatio < 0.12,
    dispersedGroups,
  };
}

function barycentric(point: Point2, triangle: Point2[]): number[] {
  if (triangle.length !== 3) return [];
  const [a, b, c] = triangle;
  const denominator = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
  if (Math.abs(denominator) < EPS) return [];
  const l1 = ((b.y - c.y) * (point.x - c.x) + (c.x - b.x) * (point.y - c.y)) / denominator;
  const l2 = ((c.y - a.y) * (point.x - c.x) + (a.x - c.x) * (point.y - c.y)) / denominator;
  return [l1, l2, 1 - l1 - l2];
}

function distanceToLine(point: Point2, a: Point2, b: Point2): number {
  const denominator = Math.hypot(b.y - a.y, b.x - a.x);
  if (denominator < EPS) return 0;
  return Math.abs((b.y - a.y) * point.x - (b.x - a.x) * point.y + b.x * a.y - b.y * a.x) / denominator;
}

function stabilityState(point: Point2, cogHeightM: number, polygon: Point2[]): StabilityState {
  if (polygon.length !== 3) return { fractions: [], inside: false, minimumAngleDeg: 0, edgeDistances: [] };
  const fractions = barycentric(point, polygon);
  const inside = fractions.length === 3 && fractions.every((value) => value >= -1e-9);
  const edgeDistances = [
    distanceToLine(point, polygon[0], polygon[1]),
    distanceToLine(point, polygon[1], polygon[2]),
    distanceToLine(point, polygon[2], polygon[0]),
  ];
  const unsignedAngleDeg =
    (Math.atan2(Math.min(...edgeDistances), Math.max(cogHeightM, EPS)) * 180) / Math.PI;
  return {
    fractions,
    inside,
    // A distance-to-line magnitude alone cannot distinguish an inside point
    // from an outside point. Keep the useful magnitude, but make it negative
    // outside the support triangle so an invalid case can never look safer.
    minimumAngleDeg: inside ? unsignedAngleDeg : -unsignedAngleDeg,
    edgeDistances,
  };
}

function metric(value: number | null, limit: number, higherIsBetter = false, active = true): MetricValue {
  if (!active || value === null) return { value: null, active: false, status: "N/A" };
  // Non-finite engineering demand is a failed active check, not an omitted
  // check. This also fails closed when a required capacity is unavailable.
  if (!Number.isFinite(value)) return { value: null, active: true, status: "NOK" };
  const ok = higherIsBetter ? value >= limit : value <= limit;
  return { value, active: true, status: ok ? "OK" : "NOK" };
}

function applyLoadsToAxles(
  axles: AxlePoint[],
  groups: GroupResult[],
  fractions: number[],
  totalMassT: number,
): { axles: AxlePoint[]; maximumUtilisation: number; groupLoads: number[] } {
  const groupLoads = groups.map((_, index) => totalMassT * (fractions[index] ?? -1));
  const groupIndexes = new Map(groups.map((group, index) => [group.group, index]));
  const memberCounts = new Map<number, number>();
  for (const axle of axles) {
    if (!axle.pinned) memberCounts.set(axle.group, (memberCounts.get(axle.group) ?? 0) + 1);
  }
  const mapped = axles.map((axle) => {
    if (axle.pinned) return { ...axle, loadT: axle.tareT, utilisation: axle.capacityT ? axle.tareT / axle.capacityT : 0 };
    const groupIndex = groupIndexes.get(axle.group) ?? -1;
    const members = memberCounts.get(axle.group) ?? 0;
    const loadT = members > 0 ? (groupLoads[groupIndex] ?? 0) / members : 0;
    return { ...axle, loadT, utilisation: axle.capacityT > 0 ? loadT / axle.capacityT : 0 };
  });
  return {
    axles: mapped,
    // A negative hydraulic reaction is loss of contact. Use the magnitude for
    // utilisation as a second fail-safe; geometry validity is checked below.
    maximumUtilisation: mapped.reduce((maximum, item) => Math.max(maximum, Math.abs(item.utilisation)), 0),
    groupLoads,
  };
}

interface SpineSystem {
  result: ReturnType<typeof solveContinuousBeam>;
  trailerStartM: number;
  trailerEndM: number;
  beamStartM: number;
  beamEndM: number;
  trailer: ResolvedTrailer | null;
}

function solveSpineSystem(
  model: ProjectModel,
  trailers: ResolvedTrailer[],
  axles: AxlePoint[],
  supports: CargoSupport[],
): SpineSystem {
  const analysedIndex = clamp(Math.round(model.analysedTrailer) - 1, 0, Math.max(0, trailers.length - 1));
  const trailer = trailers.find((item) => item.index === analysedIndex) ?? trailers[0] ?? null;
  if (!trailer) {
    return {
      result: {
        points: [],
        reactions: [],
        stable: false,
        warning: "No analysed trailer is available.",
      },
      trailerStartM: 0,
      trailerEndM: 0,
      beamStartM: 0,
      beamEndM: 0,
      trailer: null,
    };
  }

  const spacing = trailer.definition.axleSpacingM;
  const moduleLength = spacing * trailer.input.axleLines;
  const ppuLength = Math.max(0, trailer.definition.ppuLengthM ?? 0);
  const ppuWeight = Math.max(0, trailer.definition.ppuWeightT ?? 0);
  const trailerStartM = trailer.xM;
  const trailerEndM = trailerStartM + moduleLength;
  const beamStartM = trailerStartM - (trailer.input.ppuLeft ? ppuLength : 0);
  const beamEndM = trailerEndM + (trailer.input.ppuRight ? ppuLength : 0);
  const beamLength = Math.max(beamEndM - beamStartM, 0.2);

  const activeSupports = supports
    .filter((support) => support.active !== false && support.allowed)
    .filter(
      (support) =>
        Number.isFinite(support.xM) &&
        support.xM - support.widthM / 2 >= trailerStartM - EPS &&
        support.xM + support.widthM / 2 <= trailerEndM + EPS,
    )
    .slice(0, 10);

  const trailerAxles = axles.filter((item) => item.trailerId === trailer.input.id);
  const axleLineLoads = new Map<number, { xM: number; forceKN: number }>();
  for (const axle of trailerAxles) {
    if (axle.pinned) continue;
    const current = axleLineLoads.get(axle.axleLine) ?? {
      xM: axle.point.x - beamStartM,
      forceKN: 0,
    };
    // The workbook's spine-beam load is the hydraulic axle reaction less the
    // axle-line self weight. The two bogies on an axle line are then summed.
    current.forceKN += (axle.loadT - axle.tareT) * GRAVITY;
    axleLineLoads.set(axle.axleLine, current);
  }

  const distributedLoads: Array<{
    startM: number;
    endM: number;
    startKNPerM: number;
    endKNPerM: number;
  }> = [];
  if (trailer.input.ppuLeft && ppuLength > EPS && ppuWeight > EPS) {
    const intensity = -(ppuWeight * GRAVITY) / ppuLength;
    distributedLoads.push({ startM: 0, endM: ppuLength, startKNPerM: intensity, endKNPerM: intensity });
  }
  if (trailer.input.ppuRight && ppuLength > EPS && ppuWeight > EPS) {
    const intensity = -(ppuWeight * GRAVITY) / ppuLength;
    distributedLoads.push({
      startM: beamLength - ppuLength,
      endM: beamLength,
      startKNPerM: intensity,
      endKNPerM: intensity,
    });
  }
  for (const axleLine of new Set(trailerAxles.filter((item) => item.pinned).map((item) => item.axleLine))) {
    const centreM = trailerStartM + (axleLine - 0.5) * spacing - beamStartM;
    const intensity = -(trailer.definition.axleWeightT * GRAVITY) / spacing;
    distributedLoads.push({
      startM: clamp(centreM - spacing / 2, 0, beamLength),
      endM: clamp(centreM + spacing / 2, 0, beamLength),
      startKNPerM: intensity,
      endKNPerM: intensity,
    });
  }
  for (const item of model.loosePacking.slice(0, 4)) {
    const startM = item.startXM - beamStartM;
    const endM = item.endXM - beamStartM;
    if (!(item.massT > 0) || !(endM - startM > EPS)) continue;
    const clippedStart = clamp(startM, 0, beamLength);
    const clippedEnd = clamp(endM, 0, beamLength);
    if (!(clippedEnd - clippedStart > EPS)) continue;
    const intensity = -(item.massT * GRAVITY) / (endM - startM);
    distributedLoads.push({
      startM: clippedStart,
      endM: clippedEnd,
      startKNPerM: intensity,
      endKNPerM: intensity,
    });
  }

  const ei = Math.max(1, 210e6 * trailer.definition.secondMomentCm4 * 1e-8);
  const result = solveContinuousBeam({
    lengthM: beamLength,
    segments: [
      { endM: trailer.input.ppuLeft ? ppuLength : 0, eiKNm2: ei },
      { endM: trailerEndM - beamStartM, eiKNm2: ei },
      { endM: beamLength, eiKNm2: ei },
    ],
    supports: activeSupports.map((support) => ({
      id: support.id,
      xM: support.xM - beamStartM,
      widthM: support.widthM,
      active: true,
    })),
    pointLoads: [...axleLineLoads.values()],
    distributedLoads,
    outputStepM: clamp(finite(model.spineMeshSizeM, 0.023), 0.001, 1),
    applySupportSpreading: true,
  });
  return { result, trailerStartM, trailerEndM, beamStartM, beamEndM, trailer };
}

function cargoSupportBeam(
  model: ProjectModel,
  trailers: ResolvedTrailer[],
  axles: AxlePoint[],
  supports: CargoSupport[],
): {
  supportResults: SupportResult[];
  iterations: number;
  converged: boolean;
  warning: string;
  settledSystem: SpineSystem | null;
} {
  const analysedIndex = clamp(Math.round(model.analysedTrailer) - 1, 0, Math.max(0, trailers.length - 1));
  const trailer = trailers.find((item) => item.index === analysedIndex) ?? trailers[0];
  if (!trailer) {
    return {
      supportResults: [],
      iterations: 0,
      converged: false,
      warning: "No analysed trailer is available.",
      settledSystem: null,
    };
  }
  const trailerStartM = trailer.xM;
  const trailerEndM = trailerStartM + trailer.definition.axleSpacingM * trailer.input.axleLines;
  const defined = supports
    .filter((support) => Number.isFinite(support.xM))
    .slice(0, 10)
    .map((support) => {
      const geometricallyAllowed =
        support.xM - support.widthM / 2 >= trailerStartM - EPS &&
        support.xM + support.widthM / 2 <= trailerEndM + EPS;
      const allowed = support.allowed && geometricallyAllowed;
      return { ...support, allowed, active: allowed };
    });
  let iterations = 0;
  let warning = "";
  let converged = false;
  let reactions = new Map<string, number>();
  let settledSystem: SpineSystem | null = null;
  for (let pass = 0; pass < 12; pass += 1) {
    iterations += 1;
    const active = defined.filter((support) => support.active);
    if (active.length < 2) {
      warning = "Support settling left fewer than two active supports.";
      break;
    }
    const beam = solveSpineSystem(model, trailers, axles, defined);
    if (!beam.result.stable) {
      warning = beam.result.warning;
      break;
    }
    // ConBeam reports the beam-on-support reaction. Rstatic in the workbook is
    // its opposite sign, so only a negative Rstatic disables a support.
    reactions = new Map(
      beam.result.reactions.map((reaction) => [reaction.id, -reaction.reactionKN / GRAVITY]),
    );
    const negative = active.filter((support) => (reactions.get(support.id) ?? 0) < -1e-7);
    if (!negative.length) {
      converged = true;
      settledSystem = beam;
      break;
    }
    for (const support of defined) {
      if (negative.some((candidate) => candidate.id === support.id)) support.active = false;
    }
  }
  const supportResults = defined.map<SupportResult>((support) => ({
    ...support,
    reactionT: support.active ? reactions.get(support.id) ?? 0 : 0,
    disableReason: !support.allowed ? "NOT_ALLOWED" : support.active ? "" : "NEGATIVE_REACTION",
  }));
  return { supportResults, iterations, converged, warning, settledSystem };
}

function emptyBeamMetrics(): BeamMetrics {
  return {
    points: [],
    shearMinKN: 0,
    shearMinXM: 0,
    shearMaxKN: 0,
    shearMaxXM: 0,
    bendingMinKNm: 0,
    bendingMinXM: 0,
    bendingMaxKNm: 0,
    bendingMaxXM: 0,
    deflectionDownMm: 0,
    deflectionDownXM: 0,
    deflectionUpMm: 0,
    deflectionUpXM: 0,
    absoluteDeflectionMm: 0,
    deflectionPeakXM: 0,
    shearUtilisation: 0,
    bendingUtilisation: 0,
    localBendingAbsKNm: 0,
    localBendingUtilisation: 0,
  };
}

function spineBeam(
  model: ProjectModel,
  trailers: ResolvedTrailer[],
  axles: AxlePoint[],
  supportResults: SupportResult[],
  settledSystem: SpineSystem | null = null,
): { metrics: BeamMetrics; warning: string } {
  const system = settledSystem ?? solveSpineSystem(model, trailers, axles, supportResults);
  if (!system.result.stable || !system.trailer) {
    return { metrics: emptyBeamMetrics(), warning: system.result.warning };
  }
  const result = {
    ...system.result,
    points: system.result.points.map((point) => ({ ...point, xM: point.xM + system.beamStartM })),
    reactions: system.result.reactions.map((reaction) => ({
      ...reaction,
      xM: reaction.xM + system.beamStartM,
    })),
  };
  const trailer = system.trailer;
  return {
    metrics: beamMetricsFromResult(result, {
      shearMinKN: trailer.definition.shearMinKN,
      shearMaxKN: trailer.definition.shearMaxKN,
      momentMinKNm: trailer.definition.momentMinKNm,
      momentMaxKNm: trailer.definition.momentMaxKNm,
      deflectionStartM: system.trailerStartM,
      deflectionEndM: system.trailerEndM,
    }),
    warning: result.warning,
  };
}

function utilisationForPoint(
  point: Point2,
  cogHeightM: number,
  polygon: Point2[],
  groups: GroupResult[],
  axles: AxlePoint[],
  totalMassT: number,
): { state: StabilityState; utilisation: number; loads: number[]; axles: AxlePoint[] } {
  const state = stabilityState(point, cogHeightM, polygon);
  if (!state.fractions.length) return { state, utilisation: Number.POSITIVE_INFINITY, loads: [], axles };
  const applied = applyLoadsToAxles(axles, groups, state.fractions, totalMassT);
  return { state, utilisation: applied.maximumUtilisation, loads: applied.groupLoads, axles: applied.axles };
}

function worstOf(values: number[]): number {
  const finiteValues = values.filter(Number.isFinite);
  return finiteValues.length ? Math.max(...finiteValues) : Number.POSITIVE_INFINITY;
}

function minimumOf(values: number[]): number {
  const finiteValues = values.filter(Number.isFinite);
  return finiteValues.length ? Math.min(...finiteValues) : 0;
}

function perimeterCases(
  centre: Point2,
  envelopeX: number,
  envelopeY: number,
  shiftX: number,
  shiftY: number,
  combinationFactor: number,
): Point2[] {
  const factor = clamp(finite(combinationFactor, 0.7), 0, 1);
  const a = { x: centre.x - envelopeX, y: centre.y + envelopeY };
  const b = { x: centre.x + envelopeX, y: centre.y + envelopeY };
  const d = { x: centre.x + envelopeX, y: centre.y - envelopeY };
  const c = { x: centre.x - envelopeX, y: centre.y - envelopeY };
  return [
    { x: a.x - shiftX, y: a.y },
    { x: a.x - factor * shiftX, y: a.y + factor * shiftY },
    { x: a.x, y: a.y + shiftY },
    { x: b.x, y: b.y + shiftY },
    { x: b.x + factor * shiftX, y: b.y + factor * shiftY },
    { x: b.x + shiftX, y: b.y },
    { x: d.x + shiftX, y: d.y },
    { x: d.x + factor * shiftX, y: d.y - factor * shiftY },
    { x: d.x, y: d.y - shiftY },
    { x: c.x, y: c.y - shiftY },
    { x: c.x - factor * shiftX, y: c.y - factor * shiftY },
    { x: c.x - shiftX, y: c.y },
  ];
}

function staticCaseAxles(
  selected: SpineLoadCase,
  basicCases: Array<ReturnType<typeof utilisationForPoint>>,
  slopeCases: Array<ReturnType<typeof utilisationForPoint>>,
  fallback: AxlePoint[],
): AxlePoint[] {
  const basicIndex: Partial<Record<SpineLoadCase, number>> = {
    Neutral: 0,
    A: 1,
    B: 2,
    C: 3,
    D: 4,
  };
  const slopeIndex: Partial<Record<SpineLoadCase, number>> = {
    A1: 0,
    A2: 1,
    A3: 2,
    B1: 3,
    B2: 4,
    B3: 5,
    D1: 6,
    D2: 7,
    D3: 8,
    C1: 9,
    C2: 10,
    C3: 11,
  };
  const basic = basicIndex[selected];
  if (basic !== undefined) return basicCases[basic]?.axles ?? fallback;
  const slope = slopeIndex[selected];
  return slope === undefined ? fallback : slopeCases[slope]?.axles ?? fallback;
}

function emptyAnalysis(point: Point2): CalculationResult["analysis"] {
  return {
    slopeShift: { x: 0, y: 0 },
    windShift: { x: 0, y: 0 },
    accelerationShift: { x: 0, y: 0 },
    dynamicShift: { x: 0, y: 0 },
    controllingMode: "basic",
    controllingCaseIndex: 0,
    controllingPoint: point,
    controllingEdgeIndex: -1,
    controllingEdge: null,
    controllingDistanceM: null,
    controllingAngleDeg: null,
    controllingGroup: null,
    maximumGroupLoadT: null,
    maximumAxleLoadT: null,
    groupLoadContributions: [],
  };
}

function analysisSummary(
  groups: GroupResult[],
  polygon: Point2[],
  basicPoints: Point2[],
  slopePoints: Point2[],
  dynamicPoints: Point2[],
  basicCases: Array<ReturnType<typeof utilisationForPoint>>,
  slopeCases: Array<ReturnType<typeof utilisationForPoint>>,
  dynamicCases: Array<ReturnType<typeof utilisationForPoint>>,
  slopeShift: Point2,
  windShift: Point2,
  accelerationShift: Point2,
  dynamicShift: Point2,
): CalculationResult["analysis"] {
  const sources = [
    { mode: "basic" as const, points: basicPoints, cases: basicCases },
    { mode: "slope" as const, points: slopePoints, cases: slopeCases },
    { mode: "dynamic" as const, points: dynamicPoints, cases: dynamicCases },
  ];
  const candidates = sources.flatMap((source) =>
    source.cases.map((item, index) => ({
      mode: source.mode,
      point: source.points[index] ?? source.points[0] ?? { x: 0, y: 0 },
      item,
      index,
    })),
  );
  const controlling =
    candidates
      .filter(({ item }) => Number.isFinite(item.state.minimumAngleDeg))
      .sort((left, right) => left.item.state.minimumAngleDeg - right.item.state.minimumAngleDeg)[0] ??
    candidates[0];
  if (!controlling) return emptyAnalysis({ x: 0, y: 0 });
  const edgeDistances = controlling.item.state.edgeDistances;
  const controllingEdgeIndex = edgeDistances.length
    ? edgeDistances.reduce(
        (bestIndex, distance, index) => (distance < edgeDistances[bestIndex] ? index : bestIndex),
        0,
      )
    : -1;
  const edgeIndexes: Array<[number, number]> = [[0, 1], [1, 2], [2, 0]];
  const edgePair = edgeIndexes[controllingEdgeIndex];
  const controllingEdge =
    edgePair && polygon[edgePair[0]] && polygon[edgePair[1]]
      ? ([polygon[edgePair[0]], polygon[edgePair[1]]] as [Point2, Point2])
      : null;
  const maximumGroupIndex = controlling.item.loads.length
    ? controlling.item.loads.reduce(
        (bestIndex, load, index) => (load > controlling.item.loads[bestIndex] ? index : bestIndex),
        0,
      )
    : -1;
  const maximumAxleLoadT = controlling.item.axles.length
    ? Math.max(...controlling.item.axles.map((axle) => axle.loadT))
    : null;
  const groupLoadContributions = groups.map((group, groupIndex) => {
    const neutralLoadT = basicCases[0]?.loads[groupIndex] ?? 0;
    const slopeLoadT = slopeCases.length
      ? Math.max(...slopeCases.map((item) => item.loads[groupIndex] ?? Number.NEGATIVE_INFINITY))
      : neutralLoadT;
    const dynamicLoadT = dynamicCases.length
      ? Math.max(...dynamicCases.map((item) => item.loads[groupIndex] ?? Number.NEGATIVE_INFINITY))
      : slopeLoadT;
    return {
      group: group.group,
      neutralLoadT,
      slopeLoadT,
      dynamicLoadT,
      slopeDeltaT: slopeLoadT - neutralLoadT,
      combinedDynamicDeltaT: dynamicLoadT - slopeLoadT,
    };
  });
  return {
    slopeShift,
    windShift,
    accelerationShift,
    dynamicShift,
    controllingMode: controlling.mode,
    controllingCaseIndex: controlling.index,
    controllingPoint: controlling.point,
    controllingEdgeIndex,
    controllingEdge,
    controllingDistanceM:
      controllingEdgeIndex >= 0 ? edgeDistances[controllingEdgeIndex] ?? null : null,
    controllingAngleDeg: controlling.item.state.minimumAngleDeg,
    controllingGroup: maximumGroupIndex >= 0 ? groups[maximumGroupIndex]?.group ?? null : null,
    maximumGroupLoadT:
      maximumGroupIndex >= 0 ? controlling.item.loads[maximumGroupIndex] ?? null : null,
    maximumAxleLoadT,
    groupLoadContributions,
  };
}

export function calculateProject(model: ProjectModel): CalculationResult {
  model = applyAutomaticProjectCargoCogEnvelopeInputs(model);
  model = applyAutomaticProjectWindInputs(model);
  const started = performance.now();
  const warnings: string[] = [];
  const baseLoad = loadCog(model);
  const resolved = resolveTrailers(model, baseLoad.point);
  if (!resolved.trailers.length) {
    return {
      status: "ERROR",
      failClass: "TRAILER_CATALOGUE",
      failDetail: "No enabled trailer has a valid catalogue record.",
      combinedCog: baseLoad.point,
      loadCog: baseLoad.point,
      totalMassT: baseLoad.mass,
      groups: [],
      axlePoints: [],
      spineAxlePoints: [],
      supports: [],
      supportIterations: 0,
      activeSupportCount: 0,
      minimumActiveSupports: model.optimiser.minimumActiveSupports,
      trailerOverlaps: [],
      groupingQuality: {
        triangleAreaM2: 0,
        minimumAltitudeM: 0,
        minimumEdgeM: 0,
        maximumEdgeM: 0,
        aspectRatio: 0,
        narrow: true,
        dispersedGroups: [],
      },
      stabilityPolygon: [],
      casePoints: { basic: [], slope: [], dynamic: [], spineLoadCase: model.spineLoadCase },
      componentCogs: {
        cargo: cargoCogPoint(model),
        packing: packingCogPoint(model),
        load: baseLoad.point,
        ppu: null,
        trailerSelfWeight: null,
        transporter: null,
        cargoPackingPpu: baseLoad.point,
        allInclusive: baseLoad.point,
      },
      analysis: emptyAnalysis(baseLoad.point),
      resolvedTrailers: [],
      beam: emptyBeamMetrics(),
      metrics: {
        basicUtil: metric(null, 1, false, false),
        slopeUtil: metric(null, 1, false, false),
        dynamicUtil: metric(null, 1, false, false),
        spineUtil: metric(null, 1, false, false),
        basicAngle: metric(null, 0, true, false),
        slopeAngle: metric(null, 0, true, false),
        dynamicAngle: metric(null, 0, true, false),
        dynamicRatio: metric(null, 0, true, false),
        shearUtil: metric(null, 1, false, false),
        bendingUtil: metric(null, 1, false, false),
        deflection: metric(null, model.optimiser.deflectionLimitMm, false, false),
        localBendingUtil: metric(null, 1, false, false),
        axleLinesUsed: metric(null, 0, false, false),
      },
      warnings: ["Select at least one valid trailer."],
      calculationMs: performance.now() - started,
    };
  }

  const axleBase = buildAxles(model, resolved.trailers);
  const groups = groupCentres(axleBase);
  const trailerOverlaps = findTrailerOverlaps(resolved.trailers);
  const groupingQuality = hydraulicGroupingQuality(axleBase, groups);
  const polygon = groups.map((group) => group.point);
  if (groups.length !== 3) warnings.push("Three populated hydraulic groups are required to form the stability triangle.");
  trailerOverlaps.forEach((overlap) => {
    warnings.push(
      `Trailer ${overlap.firstTrailerIndex + 1} and Trailer ${overlap.secondTrailerIndex + 1} overlap by ${overlap.overlapXM.toFixed(3)} m longitudinally and ${overlap.overlapYM.toFixed(3)} m transversely.`,
    );
  });
  if (groups.length === 3 && groupingQuality.narrow) {
    warnings.push(
      `The hydraulic group centres form a narrow stability triangle (minimum altitude ${groupingQuality.minimumAltitudeM.toFixed(3)} m). Keep each group local and separate the three group centres where practical.`,
    );
  }
  if (groupingQuality.dispersedGroups.length) {
    warnings.push(
      `Hydraulic ${groupingQuality.dispersedGroups.map((group) => `G${group}`).join(", ")} ${groupingQuality.dispersedGroups.length === 1 ? "is" : "are"} spread across distant axle regions. Each group should be a local cluster around one triangle corner.`,
    );
  }

  const cargoMassFraction = resolved.mass > EPS ? model.cargo.massT / resolved.mass : 0;
  const envelopeX = model.cargo.envelopeX * cargoMassFraction;
  const envelopeY = model.cargo.envelopeY * cargoMassFraction;
  const basicPoints = [
    { x: resolved.combined.x, y: resolved.combined.y },
    { x: resolved.combined.x - envelopeX, y: resolved.combined.y + envelopeY },
    { x: resolved.combined.x + envelopeX, y: resolved.combined.y + envelopeY },
    { x: resolved.combined.x - envelopeX, y: resolved.combined.y - envelopeY },
    { x: resolved.combined.x + envelopeX, y: resolved.combined.y - envelopeY },
  ];
  const slopeShift = {
    x: resolved.combined.z * Math.tan((model.environment.longitudinalSlopeDeg * Math.PI) / 180),
    y: resolved.combined.z * Math.tan((model.environment.transverseSlopeDeg * Math.PI) / 180),
  };
  const windPressureKNPerM2 = (model.environment.windSpeedMps ** 2 / 1.6) / 1000;
  const windLeverArmXM =
    model.cargo.frontWindHeightM + model.packing.heightM + model.trailerDeckHeightM;
  const windLeverArmYM =
    model.cargo.sideWindHeightM + model.packing.heightM + model.trailerDeckHeightM;
  const windShiftX =
    resolved.mass > EPS
      ? (windPressureKNPerM2 * model.cargo.frontWindAreaM2 * model.cargo.frontDragCoefficient * windLeverArmXM) /
        (resolved.mass * GRAVITY)
      : 0;
  const windShiftY =
    resolved.mass > EPS
      ? (windPressureKNPerM2 * model.cargo.sideWindAreaM2 * model.cargo.sideDragCoefficient * windLeverArmYM) /
        (resolved.mass * GRAVITY)
      : 0;
  const windShift = { x: windShiftX, y: windShiftY };
  const accelerationShift = {
    x: (resolved.combined.z * model.environment.longitudinalAccelerationMps2) / GRAVITY,
    y: (resolved.combined.z * model.environment.transverseAccelerationMps2) / GRAVITY,
  };
  const dynamicShift = {
    x: accelerationShift.x + windShift.x,
    y: accelerationShift.y + windShift.y,
  };
  const slopePoints = perimeterCases(
    resolved.combined,
    envelopeX,
    envelopeY,
    slopeShift.x,
    slopeShift.y,
    model.environment.combinationFactor,
  );
  const dynamicPoints = perimeterCases(
    resolved.combined,
    envelopeX,
    envelopeY,
    slopeShift.x + dynamicShift.x,
    slopeShift.y + dynamicShift.y,
    model.environment.combinationFactor,
  );
  const basicCases = basicPoints.map((point) =>
    utilisationForPoint(point, resolved.combined.z, polygon, groups, axleBase, resolved.mass),
  );
  const slopeCases = slopePoints.map((point) =>
    utilisationForPoint(point, resolved.combined.z, polygon, groups, axleBase, resolved.mass),
  );
  const dynamicCases = dynamicPoints.map((point) =>
    utilisationForPoint(point, resolved.combined.z, polygon, groups, axleBase, resolved.mass),
  );
  const neutral = basicCases[0];
  const axlePoints = neutral?.axles ?? axleBase;
  const spineAxlePoints = staticCaseAxles(
    model.spineLoadCase,
    basicCases,
    slopeCases,
    axlePoints,
  );
  groups.forEach((group, index) => {
    group.loadT = neutral?.loads[index] ?? 0;
    group.reactionFraction = neutral?.state.fractions[index] ?? 0;
  });
  const supportSettle = cargoSupportBeam(model, resolved.trailers, spineAxlePoints, model.supports);
  if (supportSettle.warning) warnings.push(supportSettle.warning);
  const activeSupportCount = supportSettle.supportResults.filter((item) => item.active).length;
  const analysedTrailerIndex = clamp(
    Math.round(model.analysedTrailer) - 1,
    0,
    Math.max(0, resolved.trailers.length - 1),
  );
  const analysedTrailer = resolved.trailers[analysedTrailerIndex] ?? resolved.trailers[0];
  const supportsOutsideTrailer = analysedTrailer
    ? model.supports
        .filter((support) => support.allowed)
        .slice(0, 10)
        .some(
          (support) =>
            support.xM - support.widthM / 2 < analysedTrailer.xM - EPS ||
            support.xM + support.widthM / 2 >
              analysedTrailer.xM + analysedTrailer.definition.axleSpacingM * analysedTrailer.input.axleLines + EPS,
        )
    : true;
  const allSupportsOnTrailer = !supportsOutsideTrailer;
  const supportGatePass =
    allSupportsOnTrailer &&
    supportSettle.converged &&
    activeSupportCount >= clamp(model.optimiser.minimumActiveSupports, 2, 10);

  const basicUtil = worstOf(basicCases.map((item) => item.utilisation));
  const slopeUtil = worstOf(slopeCases.map((item) => item.utilisation));
  const dynamicUtil = worstOf(dynamicCases.map((item) => item.utilisation));
  const basicAngle = minimumOf(basicCases.map((item) => item.state.minimumAngleDeg));
  const slopeAngle = minimumOf(slopeCases.map((item) => item.state.minimumAngleDeg));
  const dynamicAngle = minimumOf(dynamicCases.map((item) => item.state.minimumAngleDeg));
  const ratios: number[] = [];
  const staticLoads = neutral?.loads ?? [];
  for (const dynamicCase of dynamicCases) {
    for (let index = 0; index < Math.min(staticLoads.length, dynamicCase.loads.length); index += 1) {
      if (staticLoads[index] > EPS) ratios.push(dynamicCase.loads[index] / staticLoads[index]);
    }
  }
  const dynamicRatio = ratios.length ? Math.min(...ratios) : 0;
  const beamResult = spineBeam(
    model,
    resolved.trailers,
    spineAxlePoints,
    supportSettle.supportResults,
    supportSettle.settledSystem,
  );
  if (beamResult.warning) warnings.push(beamResult.warning);
  const beam = beamResult.metrics;
  const spineUtil = Math.max(beam.shearUtilisation, beam.bendingUtilisation);
  // Resource use is the total across the complete formation. Using only the
  // largest individual train would allow multi-train arrangements to avoid the
  // lower-is-better axle-line weighting.
  const axleLinesUsed = resolved.trailers.reduce(
    (sum, item) => sum + item.input.axleLines,
    0,
  );
  const detailed = model.optimiser.detailedWeighting;
  const limits = engineeringLimitsFor(model.engineeringDegree);
  const metrics = {
    basicUtil: metric(basicUtil, limits.basicUtil),
    slopeUtil: metric(slopeUtil, limits.slopeUtil),
    dynamicUtil: metric(dynamicUtil, limits.dynamicUtil),
    spineUtil: metric(spineUtil, limits.spineUtil, false, beam.points.length > 0),
    basicAngle: metric(basicAngle, limits.basicAngle, true),
    slopeAngle: metric(slopeAngle, limits.slopeAngle, true),
    dynamicAngle: metric(dynamicAngle, limits.dynamicAngle, true),
    dynamicRatio: metric(dynamicRatio, limits.dynamicRatio, true),
    shearUtil: metric(beam.shearUtilisation, 1, false, detailed && beam.points.length > 0),
    bendingUtil: metric(beam.bendingUtilisation, 1, false, detailed && beam.points.length > 0),
    deflection: metric(
      beam.absoluteDeflectionMm,
      model.optimiser.deflectionLimitMm,
      false,
      detailed || model.optimiser.deflectionCheck === "REQUIRED",
    ),
    localBendingUtil: metric(beam.localBendingUtilisation, 1, false, detailed && beam.points.length > 0),
    axleLinesUsed: metric(axleLinesUsed, Number.POSITIVE_INFINITY),
  };
  const geometryPass =
    groups.length === 3 &&
    [...basicCases, ...slopeCases, ...dynamicCases].every(
      (item) => item.state.fractions.length === 3 && item.state.inside,
    );
  const requiredMetrics = Object.values(metrics).filter((item) => item.active);
  const engineeringPass = requiredMetrics.every((item) => item.status === "OK");
  let status: CalculationResult["status"] = "PASS";
  let failClass = "";
  let failDetail = "";
  if (trailerOverlaps.length) {
    const overlap = trailerOverlaps[0];
    status = "GEOMETRY_FAIL";
    failClass = "TRAILER_OVERLAP";
    failDetail = `Trailer ${overlap.firstTrailerIndex + 1} and Trailer ${overlap.secondTrailerIndex + 1} footprints overlap. Reposition them before continuing; trailers cannot occupy the same physical space.`;
  } else if (!geometryPass) {
    status = "GEOMETRY_FAIL";
    failClass = "STABILITY_TRIANGLE";
    failDetail = "The active hydraulic groups do not form a valid stability triangle.";
  } else if (!allSupportsOnTrailer) {
    status = "SUPPORT_FAIL";
    failClass = "SUPPORT_OUTSIDE_TRAILER";
    failDetail = "Every allowed support must be fully within the analysed trailer deck footprint.";
  } else if (!supportGatePass) {
    status = "SUPPORT_FAIL";
    failClass = "MINIMUM_ACTIVE_SUPPORTS";
    failDetail = `Only ${activeSupportCount} supports remain active; the configured minimum is ${model.optimiser.minimumActiveSupports}.`;
  } else if (!engineeringPass) {
    status = "NOK_FAIL";
    failClass = "ENGINEERING_LIMIT";
    failDetail = Object.entries(metrics)
      .filter(([, value]) => value.active && value.status === "NOK")
      .map(([name]) => name)
      .join(", ");
  }
  if (basicCases.some((item) => !item.state.inside)) warnings.push("One or more static COG envelope points fall outside the stability triangle.");
  if (dynamicCases.some((item) => !item.state.inside)) warnings.push("One or more dynamic COG points fall outside the stability triangle.");
  const componentMassCogs = resolvedComponentCogs(model, resolved.trailers, baseLoad);
  const analysis = analysisSummary(
    groups,
    polygon,
    basicPoints,
    slopePoints,
    dynamicPoints,
    basicCases,
    slopeCases,
    dynamicCases,
    slopeShift,
    windShift,
    accelerationShift,
    dynamicShift,
  );

  return {
    status,
    failClass,
    failDetail,
    combinedCog: resolved.combined,
    loadCog: baseLoad.point,
    totalMassT: resolved.mass,
    groups,
    axlePoints,
    spineAxlePoints,
    supports: supportSettle.supportResults,
    supportIterations: supportSettle.iterations,
    activeSupportCount,
    minimumActiveSupports: model.optimiser.minimumActiveSupports,
    trailerOverlaps,
    groupingQuality,
    stabilityPolygon: polygon,
    casePoints: {
      basic: basicPoints,
      slope: slopePoints,
      dynamic: dynamicPoints,
      spineLoadCase: model.spineLoadCase,
    },
    componentCogs: {
      cargo: cargoCogPoint(model),
      packing: packingCogPoint(model),
      load: baseLoad.point,
      ppu: componentMassCogs.ppu,
      trailerSelfWeight: componentMassCogs.trailerSelfWeight,
      transporter: componentMassCogs.transporter,
      cargoPackingPpu: componentMassCogs.cargoPackingPpu,
      allInclusive: resolved.combined,
    },
    analysis,
    resolvedTrailers: resolved.trailers.map((item) => ({
      id: item.input.id,
      index: item.index,
      name: item.definition.name,
      startXM: item.xM,
      centreYM: item.yM,
      lengthM: item.definition.axleSpacingM * item.input.axleLines,
      widthM: item.definition.trailerWidthM,
      ppuLeftLengthM: item.input.ppuLeft ? item.definition.ppuLengthM ?? 0 : 0,
      ppuRightLengthM: item.input.ppuRight ? item.definition.ppuLengthM ?? 0 : 0,
    })),
    beam,
    metrics,
    warnings,
    calculationMs: performance.now() - started,
  };
}

export function applySharedAxleLines(model: ProjectModel, axleLines: number): ProjectModel {
  const count = clamp(Math.round(finite(axleLines, 1)), 1, 99);
  return {
    ...model,
    trailers: model.trailers.map((trailer) => ({ ...trailer, axleLines: count })),
    groupings: model.groupings.map((grouping) => ({
      ...grouping,
      splitAfterAxleLine: clamp(grouping.splitAfterAxleLine, 1, Math.max(1, count - 1)),
      groups: Array.from({ length: count }, (_, index) => grouping.groups[index] ?? grouping.groups.at(-1) ?? 1),
      pinnedAxleLines: grouping.pinnedAxleLines.filter((line) => line <= count),
    })),
  };
}

export function applySharedSplit(model: ProjectModel, splitAfter: number): ProjectModel {
  const maximum = Math.max(1, Math.max(...model.trailers.map((item) => item.axleLines)) - 1);
  const value = clamp(Math.round(finite(splitAfter, 1)), 1, maximum);
  return { ...model, groupings: model.groupings.map((grouping) => ({ ...grouping, splitAfterAxleLine: value })) };
}

export function applySharedX(model: ProjectModel, xM: number): ProjectModel {
  const value = finite(xM);
  return {
    ...model,
    trailers: model.trailers.map((trailer) => ({
      ...trailer,
      xM: value,
      offsetFromReference: { ...trailer.offsetFromReference, x: value },
    })),
  };
}

export function applySharedPins(model: ProjectModel, pinnedAxleLines: number[]): ProjectModel {
  const normalised = [...new Set(pinnedAxleLines.map(Math.round).filter((value) => value > 0))]
    .sort((a, b) => a - b)
    .slice(0, 8);
  return {
    ...model,
    groupings: model.groupings.map((grouping) => ({ ...grouping, pinnedAxleLines: normalised })),
  };
}

export function validateCatalogue(catalogue: TrailerDefinition[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const item of catalogue) {
    const key = item.name.trim().toLowerCase();
    if (!key) errors.push("A trailer catalogue row has no name.");
    if (seen.has(key)) errors.push(`Duplicate trailer name: ${item.name}`);
    seen.add(key);
    if (!(item.axleSpacingM > 0)) errors.push(`${item.name}: axle spacing is missing or invalid.`);
    if (!(item.trailerWidthM > 0)) errors.push(`${item.name}: trailer width is missing or invalid.`);
    if (!(item.axleWeightT >= 0)) errors.push(`${item.name}: axle-line tare is missing or invalid.`);
    if (!(item.axleCapacityT > 0)) errors.push(`${item.name}: axle capacity is missing or invalid.`);
    if (!(item.neutralHeightM > 0)) errors.push(`${item.name}: neutral height is missing or invalid.`);
    if (!(item.secondMomentCm4 > 0)) errors.push(`${item.name}: second moment of area is missing or invalid.`);
    if (!(Math.abs(item.momentMinKNm) > 0 || Math.abs(item.momentMaxKNm) > 0)) {
      errors.push(`${item.name}: bending moment capacity is missing or invalid.`);
    }
    if (!(Math.abs(item.shearMinKN) > 0 || Math.abs(item.shearMaxKN) > 0)) {
      errors.push(`${item.name}: shear capacity is missing or invalid.`);
    }
  }
  return errors;
}
