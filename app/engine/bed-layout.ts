import { localToWorld, MAX_TRAILER_YAW_DEG, worldToLocal } from "./placement";
import type { BedPlacement, CalculationResult, HydraulicGrouping, ProjectModel, TrailerInput } from "./types";

export function splitAxleModules(total: number): Array<4 | 5 | 6> | null {
  if (!Number.isInteger(total) || total < 4 || total > 99) return null;
  for (let count = Math.ceil(total / 6); count <= Math.floor(total / 4); count += 1) {
    for (let six = count; six >= 0; six -= 1) {
      const five = total - 4 * count - 2 * six;
      const four = count - six - five;
      if (five >= 0 && four >= 0) return [...Array<6>(six).fill(6), ...Array<5>(five).fill(5), ...Array<4>(four).fill(4)];
    }
  }
  return null;
}

export function bedsFromModel(model: ProjectModel, result: CalculationResult): BedPlacement[] {
  if (model.bedLayout) return structuredClone(model.bedLayout);
  return model.trailers.filter(t => t.enabled).flatMap(trailer => {
    if (trailer.singleFile) throw new Error(`Trailer ${trailer.id}: single-file bogies cannot be converted to standard double-file beds without changing the equipment.`);
    const resolved = result.resolvedTrailers.find(t => t.id === trailer.id);
    const definition = model.catalogue.find(d => d.id === trailer.definitionId);
    const sizes = splitAxleModules(trailer.axleLines);
    if (!resolved || !definition || !sizes) throw new Error(`Trailer ${trailer.id}: ${trailer.axleLines} AL cannot be represented by 4/5/6-AL beds.`);
    let station = 0;
    return sizes.map((axleLines, index) => {
      const p = localToWorld(resolved, station);
      station += axleLines * definition.axleSpacingM;
      return { id: `${trailer.id}-bed-${index + 1}`, train: trailer.id, definitionId: trailer.definitionId, axleLines, xM: p.x, yM: p.y, yawDeg: trailer.yawDeg ?? 0, ppuRear: index === 0 && trailer.ppuLeft, ppuFront: index === sizes.length - 1 && trailer.ppuRight };
    });
  });
}

/** Never infer a structural connection from visual proximity: the train key is explicit. */
export function applyBedLayout(model: ProjectModel, beds: BedPlacement[]): { model: ProjectModel; errors: string[] } {
  const errors: string[] = [];
  if (!Array.isArray(beds) || beds.some(bed => !bed || typeof bed.id !== "string" || typeof bed.train !== "string" || typeof bed.definitionId !== "string")) return { model: { ...model, bedLayout: undefined, trailers: [] }, errors: ["The bed matrix contains malformed rows."] };
  if (new Set(beds.map(bed => bed.id)).size !== beds.length) errors.push("Each bed must have a unique ID.");
  const groups = new Map<string, BedPlacement[]>();
  for (const bed of beds) {
    if (!bed.train.trim()) errors.push(`${bed.id}: enter a train connection group.`);
    if (![4, 5, 6].includes(bed.axleLines) || ![bed.xM, bed.yM, bed.yawDeg].every(Number.isFinite) || Math.abs(bed.yawDeg) > MAX_TRAILER_YAW_DEG) errors.push(`${bed.id}: use 4, 5 or 6 AL and finite coordinates/rotation within ±${MAX_TRAILER_YAW_DEG}°.`);
    groups.set(bed.train, [...groups.get(bed.train) ?? [], bed]);
  }
  if (groups.size > 12) errors.push("A formation supports at most 12 independent trains.");
  const trailers: TrailerInput[] = [];
  const groupings: HydraulicGrouping[] = [];
  for (const [train, members] of groups) {
    const reference = members[0];
    const origin = { startXM: reference.xM, centreYM: reference.yM, yawDeg: reference.yawDeg };
    const sorted = [...members].sort((a, b) => worldToLocal(origin, { x: a.xM, y: a.yM }).x - worldToLocal(origin, { x: b.xM, y: b.yM }).x);
    const first = sorted[0];
    let station = 0;
    const definition = model.catalogue.find(d => d.id === first.definitionId);
    if (!definition) { errors.push(`${train}: select a catalogue model.`); continue; }
    for (const [index, bed] of sorted.entries()) {
      const expected = localToWorld({ startXM: first.xM, centreYM: first.yM, yawDeg: first.yawDeg }, station);
      if (bed.definitionId !== first.definitionId || Math.abs(bed.yawDeg - first.yawDeg) > 1e-6 || Math.hypot(bed.xM - expected.x, bed.yM - expected.y) > 0.001) errors.push(`${train}: bed ${bed.id} is not joined end-to-end. Align it or give it a separate train group.`);
      if ((bed.ppuRear && index > 0) || (bed.ppuFront && index < sorted.length - 1)) errors.push(`${train}: a PPU can attach only to the outer front/rear end of the joined train.`);
      station += definition.axleSpacingM * bed.axleLines;
    }
    const axleLines = sorted.reduce((sum, b) => sum + b.axleLines, 0);
    if (axleLines > 99) errors.push(`${train}: the joined train exceeds 99 axle lines.`);
    const oldIndex = model.trailers.findIndex(t => t.id === train);
    trailers.push({ id: train, definitionId: first.definitionId, axleLines, singleFile: false, xM: first.xM, yM: first.yM, yawDeg: first.yawDeg, formationOffsetXM: first.xM - (beds[0]?.xM ?? 0), placementReference: "ABSOLUTE", offsetFromReference: { x: 0, y: 0 }, enabled: true, ppuLeft: first.ppuRear, ppuRight: sorted.at(-1)!.ppuFront });
    const existing = model.groupings[oldIndex];
    groupings.push(existing ? { ...existing, splitAfterAxleLine: Math.min(existing.splitAfterAxleLine, axleLines - 1), pinnedAxleLines: existing.pinnedAxleLines.filter(value => value <= axleLines) } : { splitAfterAxleLine: Math.max(1, Math.floor(axleLines / 2)), groups: [], pinnedAxleLines: [], cornerGroups: model.hydraulicSystemMode === "FOUR_POINT" ? { rearLeft: 1, rearRight: 2, frontLeft: 3, frontRight: 4 } : { rearLeft: 2, rearRight: 1, frontLeft: 3, frontRight: 1 } });
  }
  return { model: { ...model, bedLayout: beds, trailers, groupings, analysedTrailer: Math.min(Math.max(1, model.analysedTrailer), Math.max(1, trailers.length)) }, errors: [...new Set(errors)] };
}
