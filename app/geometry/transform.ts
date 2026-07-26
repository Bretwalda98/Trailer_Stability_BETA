import type { Point2, Point3 } from "../engine/types";
import type {
  EngineeringBounds,
  EngineeringView,
  GeometryViewModel,
  ViewportTransform,
} from "./types";

const EPSILON = 1e-9;

export function finiteBounds(points: Point3[], fallback: EngineeringBounds = {
  minX: -1,
  maxX: 1,
  minY: -1,
  maxY: 1,
  minZ: 0,
  maxZ: 2,
}): EngineeringBounds {
  const valid = points.filter(
    (point) => Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z),
  );
  if (!valid.length) return fallback;
  return {
    minX: Math.min(...valid.map((point) => point.x)),
    maxX: Math.max(...valid.map((point) => point.x)),
    minY: Math.min(...valid.map((point) => point.y)),
    maxY: Math.max(...valid.map((point) => point.y)),
    minZ: Math.min(...valid.map((point) => point.z)),
    maxZ: Math.max(...valid.map((point) => point.z)),
  };
}

export function expandBounds(bounds: EngineeringBounds, amount: number): EngineeringBounds {
  return {
    minX: bounds.minX - amount,
    maxX: bounds.maxX + amount,
    minY: bounds.minY - amount,
    maxY: bounds.maxY + amount,
    minZ: Math.min(0, bounds.minZ - amount),
    maxZ: bounds.maxZ + amount,
  };
}

export function stabilityFocusBounds(
  vm: Pick<
    GeometryViewModel,
    | "stabilityBoundary"
    | "loadCases"
    | "envelopes"
    | "groupCentres"
    | "shifts"
    | "project"
  >,
): EngineeringBounds {
  const points: Point3[] = [
    ...vm.stabilityBoundary.points,
    ...vm.loadCases.flatMap((loadCase) => loadCase.points),
    ...vm.envelopes.flatMap((envelope) => envelope.points),
    ...vm.groupCentres.map((centre) => centre.point),
    ...vm.shifts.flatMap((shift) => [shift.start, shift.end]),
    vm.project.result.analysis.controllingPoint,
  ].map((point) => ({ ...point, z: 0 }));
  const bounds = finiteBounds(points);
  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, 1);
  return expandBounds(bounds, Math.max(0.25, span * 0.1));
}

export function projectEngineeringPoint(view: EngineeringView, point: Point3 | Point2): Point2 {
  const z = "z" in point ? point.z : 0;
  if (view === "end") return { x: point.y, y: z };
  if (view === "side" || view === "beam") return { x: point.x, y: z };
  return { x: point.x, y: point.y };
}

export function viewBounds(view: EngineeringView, bounds: EngineeringBounds): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
} {
  if (view === "end") {
    return { minX: bounds.minY, maxX: bounds.maxY, minY: bounds.minZ, maxY: bounds.maxZ };
  }
  if (view === "side" || view === "beam") {
    return { minX: bounds.minX, maxX: bounds.maxX, minY: bounds.minZ, maxY: bounds.maxZ };
  }
  return { minX: bounds.minX, maxX: bounds.maxX, minY: bounds.minY, maxY: bounds.maxY };
}

export function createViewportTransform(
  view: EngineeringView,
  bounds: EngineeringBounds,
  width: number,
  height: number,
  padding = 36,
  zoom = 1,
  pan: Point2 = { x: 0, y: 0 },
): ViewportTransform {
  const projected = viewBounds(view, bounds);
  const rangeX = Math.max(EPSILON, projected.maxX - projected.minX);
  const rangeY = Math.max(EPSILON, projected.maxY - projected.minY);
  const availableWidth = Math.max(1, width - padding * 2);
  const availableHeight = Math.max(1, height - padding * 2);
  const fitScale = Math.min(availableWidth / rangeX, availableHeight / rangeY);
  const scale = fitScale * Math.max(0.1, zoom);
  const centreX = (projected.minX + projected.maxX) / 2;
  const centreY = (projected.minY + projected.maxY) / 2;
  const offsetX = width / 2 - centreX * scale + pan.x;
  const offsetY = height / 2 + centreY * scale + pan.y;

  return {
    view,
    width,
    height,
    padding,
    scale,
    offsetX,
    offsetY,
    toScreen(point) {
      const projectedPoint = projectEngineeringPoint(view, point);
      return {
        x: projectedPoint.x * scale + offsetX,
        y: -projectedPoint.y * scale + offsetY,
      };
    },
    toEngineering(point) {
      const horizontal = (point.x - offsetX) / scale;
      const vertical = -(point.y - offsetY) / scale;
      if (view === "end") return { x: 0, y: horizontal, z: vertical };
      if (view === "side" || view === "beam") return { x: horizontal, y: 0, z: vertical };
      return { x: horizontal, y: vertical, z: 0 };
    },
  };
}

export function engineeringRectPoints(
  startX: number,
  centreY: number,
  length: number,
  width: number,
  z = 0,
): Point3[] {
  const halfWidth = width / 2;
  return [
    { x: startX, y: centreY - halfWidth, z },
    { x: startX + length, y: centreY - halfWidth, z },
    { x: startX + length, y: centreY + halfWidth, z },
    { x: startX, y: centreY + halfWidth, z },
  ];
}

export function screenPolyline(
  transform: ViewportTransform,
  points: Array<Point3 | Point2>,
  closed = false,
): string {
  if (!points.length) return "";
  const path = points
    .map((point, index) => {
      const screen = transform.toScreen(point);
      return `${index ? "L" : "M"} ${screen.x.toFixed(2)} ${screen.y.toFixed(2)}`;
    })
    .join(" ");
  return closed ? `${path} Z` : path;
}

export function screenDistance(transform: ViewportTransform, metres: number): number {
  return Math.abs(metres * transform.scale);
}

export function closestPointOnSegment(point: Point2, start: Point2, end: Point2): Point2 {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= EPSILON) return { ...start };
  const projection = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared;
  const position = Math.max(0, Math.min(1, projection));
  return {
    x: start.x + position * dx,
    y: start.y + position * dy,
  };
}
