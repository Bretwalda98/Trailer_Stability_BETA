import type { CalculationResult, Point2 } from "../engine/types";

const EPSILON = 1e-12;

export type EndTippingMode = "basic" | "slope" | "dynamic";
export type EndTippingMetricKey = "basicAngle" | "slopeAngle" | "dynamicAngle";

export interface NearestStabilityEdge {
  edgeIndex: number;
  edgeStart: Point2;
  edgeEnd: Point2;
  foot: Point2;
  distanceM: number;
}

export interface EndTippingConstruction extends NearestStabilityEdge {
  mode: EndTippingMode;
  metricKey: EndTippingMetricKey;
  angleDeg: number;
  casePointIndex: number;
  cogPoint: Point2;
  side: "LEFT" | "RIGHT";
  outwardDirectionY: -1 | 1;
}

const CASES: Array<{
  mode: EndTippingMode;
  metricKey: EndTippingMetricKey;
}> = [
  { mode: "basic", metricKey: "basicAngle" },
  { mode: "slope", metricKey: "slopeAngle" },
  { mode: "dynamic", metricKey: "dynamicAngle" },
];

function projectPointToLine(point: Point2, start: Point2, end: Point2): Point2 {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= EPSILON) return { ...start };
  const position = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared;
  return {
    x: start.x + position * dx,
    y: start.y + position * dy,
  };
}

/**
 * Return the supporting polygon edge used by the engine's distance-to-line
 * tipping-angle calculation. The projection deliberately targets the
 * infinite supporting line rather than clamping to the segment, matching the
 * stability engine exactly.
 */
export function nearestStabilityEdge(
  point: Point2,
  polygon: Point2[],
): NearestStabilityEdge | null {
  if (polygon.length < 3) return null;
  let nearest: NearestStabilityEdge | null = null;
  polygon.forEach((edgeStart, edgeIndex) => {
    const edgeEnd = polygon[(edgeIndex + 1) % polygon.length];
    const foot = projectPointToLine(point, edgeStart, edgeEnd);
    const distanceM = Math.hypot(point.x - foot.x, point.y - foot.y);
    if (!nearest || distanceM < nearest.distanceM - EPSILON) {
      nearest = { edgeIndex, edgeStart, edgeEnd, foot, distanceM };
    }
  });
  return nearest;
}

/**
 * Find the actual worst COG-envelope point and its own controlling edge for
 * each displayed end-view load case. This keeps the drawing on the inside of
 * the boundary and prevents basic, slope and dynamic rays from inheriting a
 * different case's edge.
 */
export function buildEndTippingConstructions(
  result: CalculationResult,
): EndTippingConstruction[] {
  if (result.stabilityPolygon.length < 3 || result.combinedCog.z <= 0) return [];
  const centroidY = result.stabilityPolygon.reduce((sum, point) => sum + point.y, 0) /
    result.stabilityPolygon.length;

  return CASES.flatMap(({ mode, metricKey }) => {
    const angleDeg = result.metrics[metricKey].value;
    if (angleDeg === null || angleDeg < 0) return [];
    let controlling: (NearestStabilityEdge & { casePointIndex: number; cogPoint: Point2 }) | null = null;
    result.casePoints[mode].forEach((cogPoint, casePointIndex) => {
      const nearest = nearestStabilityEdge(cogPoint, result.stabilityPolygon);
      if (!nearest) return;
      if (!controlling || nearest.distanceM < controlling.distanceM - EPSILON) {
        controlling = { ...nearest, casePointIndex, cogPoint };
      }
    });
    if (!controlling) return [];
    const resolved = controlling as NearestStabilityEdge & { casePointIndex: number; cogPoint: Point2 };
    const outwardDirectionY: -1 | 1 = resolved.foot.y >= centroidY ? 1 : -1;
    return [{
      ...resolved,
      mode,
      metricKey,
      angleDeg,
      side: outwardDirectionY < 0 ? "RIGHT" : "LEFT",
      outwardDirectionY,
    }];
  });
}
