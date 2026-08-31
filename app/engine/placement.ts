import type { CargoSupport, Point2 } from "./types";

/** Rear centre is the pivot. Positive yaw turns the front towards positive Y. */
export interface PlanPlacement {
  startXM: number;
  centreYM: number;
  yawDeg?: number;
  lengthM: number;
  widthM: number;
}

export const MAX_TRAILER_YAW_DEG = 45;

export function localToWorld(placement: Pick<PlanPlacement, "startXM" | "centreYM" | "yawDeg">, x: number, y = 0): Point2 {
  const angle = ((placement.yawDeg ?? 0) * Math.PI) / 180;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: placement.startXM + x * c - y * s, y: placement.centreYM + x * s + y * c };
}

export function worldToLocal(placement: Pick<PlanPlacement, "startXM" | "centreYM" | "yawDeg">, point: Point2): Point2 {
  const angle = ((placement.yawDeg ?? 0) * Math.PI) / 180;
  const x = point.x - placement.startXM;
  const y = point.y - placement.centreYM;
  return { x: x * Math.cos(angle) + y * Math.sin(angle), y: -x * Math.sin(angle) + y * Math.cos(angle) };
}

export function trailerFootprint(placement: PlanPlacement, rearExtensionM = 0, frontExtensionM = 0): Point2[] {
  return [
    localToWorld(placement, -rearExtensionM, -placement.widthM / 2),
    localToWorld(placement, placement.lengthM + frontExtensionM, -placement.widthM / 2),
    localToWorld(placement, placement.lengthM + frontExtensionM, placement.widthM / 2),
    localToWorld(placement, -rearExtensionM, placement.widthM / 2),
  ];
}

export function polygonBounds(points: Point2[]) {
  return { minX: Math.min(...points.map(p => p.x)), maxX: Math.max(...points.map(p => p.x)), minY: Math.min(...points.map(p => p.y)), maxY: Math.max(...points.map(p => p.y)) };
}

export function polygonsOverlap(a: Point2[], b: Point2[]): boolean {
  for (const polygon of [a, b]) {
    for (let i = 0; i < polygon.length; i += 1) {
      const next = polygon[(i + 1) % polygon.length];
      const edge = { x: next.x - polygon[i].x, y: next.y - polygon[i].y };
      const length = Math.hypot(edge.x, edge.y);
      if (length < 1e-12) continue;
      const project = (p: Point2) => (-edge.y * p.x + edge.x * p.y) / length;
      const pa = a.map(project);
      const pb = b.map(project);
      if (Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb)) <= 1e-6) return false;
    }
  }
  return true;
}

export function polygonClearance(a: Point2[], b: Point2[]): number {
  if (polygonsOverlap(a, b)) return 0;
  const distance = (p: Point2, u: Point2, v: Point2) => {
    const dx = v.x - u.x;
    const dy = v.y - u.y;
    const t = Math.max(0, Math.min(1, ((p.x - u.x) * dx + (p.y - u.y) * dy) / Math.max(1e-20, dx * dx + dy * dy)));
    return Math.hypot(p.x - u.x - t * dx, p.y - u.y - t * dy);
  };
  return Math.min(...a.flatMap(p => b.map((u, i) => distance(p, u, b[(i + 1) % b.length]))), ...b.flatMap(p => a.map((u, i) => distance(p, u, a[(i + 1) % a.length]))));
}

/** A support is a transverse strip at global X. Return its centreline beam station. */
export function supportOnTrailer(placement: PlanPlacement, support: Pick<CargoSupport, "xM" | "widthM">) {
  const angle = ((placement.yawDeg ?? 0) * Math.PI) / 180;
  const c = Math.cos(angle);
  const valid = Number.isFinite(c) && c > 0 && Math.abs(placement.yawDeg ?? 0) <= MAX_TRAILER_YAW_DEG;
  const stationM = (support.xM - placement.startXM) / c;
  const widthM = support.widthM / c;
  // Include both deck sides when checking that the complete bearing strip fits.
  const marginM = (support.widthM + placement.widthM * Math.abs(Math.sin(angle))) / (2 * c);
  return { stationM, widthM, fits: valid && stationM - marginM >= -1e-9 && stationM + marginM <= placement.lengthM + 1e-9 };
}

export function supportXBounds(placement: PlanPlacement) {
  const angle = ((placement.yawDeg ?? 0) * Math.PI) / 180;
  const inset = placement.widthM * Math.abs(Math.sin(angle)) / 2;
  return { startM: placement.startXM + inset, endM: placement.startXM + placement.lengthM * Math.cos(angle) - inset };
}
