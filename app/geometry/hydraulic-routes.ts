import type { Point2 } from "../engine/types";
import type { GeometryViewModel } from "./types";

export interface HydraulicRouteSegment {
  id: string;
  groupId: number;
  trailerId: string;
  trailerIndex: number;
  side: "left" | "right";
  points: Point2[];
  bogieIds: string[];
}

/**
 * Display-only route aggregation. It separates left and right circuits while
 * retaining the authoritative bogie group IDs and coordinates from the engine.
 */
export function buildHydraulicRouteSegments(vm: GeometryViewModel): HydraulicRouteSegment[] {
  const segments: HydraulicRouteSegment[] = [];
  for (const trailer of vm.trailers) {
    for (const side of ["left", "right"] as const) {
      for (const groupId of vm.groups.map((group) => group.groupId)) {
        const members = vm.bogies
          .filter(
            (bogie) =>
              bogie.sourceTrailerId === trailer.sourceTrailerId &&
              bogie.groupId === groupId &&
              !bogie.pinned &&
              (side === "left"
                ? bogie.yM <= trailer.centreYM
                : bogie.yM > trailer.centreYM),
          )
          .sort((a, b) => a.xM - b.xM);
        if (!members.length) continue;
        segments.push({
          id: `route:${trailer.sourceTrailerId}:${side}:g${groupId}`,
          groupId,
          trailerId: trailer.sourceTrailerId ?? trailer.id,
          trailerIndex: trailer.index,
          side,
          points: members.map((bogie) => ({ x: bogie.xM, y: bogie.yM })),
          bogieIds: members.map((bogie) => bogie.id),
        });
      }
    }
  }
  return segments;
}
