import type { ProjectModel } from "./types";

/** Old spreadsheet/LISP contracts cannot encode yaw or independent deck PPUs. */
export function assertLegacyPlacementSupported(model: ProjectModel): void {
  const active = model.trailers.filter(trailer => trailer.enabled);
  const unequal = model.bedLayout && (active.some(trailer => trailer.axleLines !== active[0]?.axleLines) || model.groupings.some(group => group.splitAfterAxleLine !== model.groupings[0]?.splitAfterAxleLine || JSON.stringify(group.pinnedAxleLines) !== JSON.stringify(model.groupings[0]?.pinnedAxleLines)));
  if (active.some(trailer => Math.abs(trailer.yawDeg ?? 0) > 1e-9) || model.deckPpus?.length || unequal) {
    throw new Error("This export format cannot represent rotated beds, independent deck-mounted PPUs or unequal manual train/split/pin layouts. Use Project JSON to retain all inputs, compact AutoCAD .sartd with LISP v1.23, or direct DXF for the scaled plan. No flattened or incomplete file was exported.");
  }
}
