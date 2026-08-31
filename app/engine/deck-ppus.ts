import { polygonsOverlap, trailerFootprint, worldToLocal } from "./placement";
import type { DeckPpu, Point3, ProjectModel } from "./types";

export function deckPpuTrainId(model: ProjectModel, ppu: DeckPpu): string {
  return model.bedLayout?.find(bed => bed.id === ppu.hostId)?.train ?? ppu.hostId;
}

export function deckPpuMassItems(model: ProjectModel): Array<{ mass: number; point: Point3 }> {
  return (model.deckPpus ?? []).map(ppu => ({
    mass: ppu.massT,
    point: { x: ppu.xM, y: ppu.yM, z: model.trailerDeckHeightM + ppu.cogZM },
  }));
}

export function deckPpuFootprint(ppu: DeckPpu) {
  const radians = ppu.yawDeg * Math.PI / 180;
  return trailerFootprint({ startXM: ppu.xM - ppu.lengthM * Math.cos(radians) / 2, centreYM: ppu.yM - ppu.lengthM * Math.sin(radians) / 2, yawDeg: ppu.yawDeg, lengthM: ppu.lengthM, widthM: ppu.widthM });
}

/** Conservative unshielded projected areas; chassis yaw is relative to global X. */
export function deckPpuWind(model: ProjectModel) {
  return (model.deckPpus ?? []).reduce((sum, ppu) => {
    const a = ppu.yawDeg * Math.PI / 180;
    const front = ppu.heightM * (Math.abs(Math.cos(a)) * ppu.widthM + Math.abs(Math.sin(a)) * ppu.lengthM) * ppu.dragCoefficient;
    const side = ppu.heightM * (Math.abs(Math.cos(a)) * ppu.lengthM + Math.abs(Math.sin(a)) * ppu.widthM) * ppu.dragCoefficient;
    const z = model.trailerDeckHeightM + ppu.heightM / 2;
    return { front: sum.front + front, side: sum.side + side, frontMoment: sum.frontMoment + front * z, sideMoment: sum.sideMoment + side * z };
  }, { front: 0, side: 0, frontMoment: 0, sideMoment: 0 });
}

export function validateDeckPpus(model: ProjectModel): string[] {
  if (model.deckPpus && (!Array.isArray(model.deckPpus) || model.deckPpus.some(ppu => !ppu || typeof ppu.hostId !== "string" || typeof ppu.id !== "string" || !ppu.id.trim()))) return ["The deck-mounted PPU list contains malformed rows."];
  if (new Set((model.deckPpus ?? []).map(ppu => ppu.id)).size !== (model.deckPpus ?? []).length) return ["Each deck-mounted PPU must have a unique ID."];
  return (model.deckPpus ?? []).flatMap(ppu => {
    const errors: string[] = [];
    if (![ppu.xM, ppu.yM, ppu.yawDeg, ppu.lengthM, ppu.widthM, ppu.heightM, ppu.massT, ppu.cogZM, ppu.dragCoefficient].every(Number.isFinite) || ppu.dragCoefficient < 0 ||
        Math.min(ppu.lengthM, ppu.widthM, ppu.heightM, ppu.massT) <= 0 || ppu.cogZM < 0 || ppu.cogZM > ppu.heightM) {
      return [`${ppu.id}: enter positive dimensions/mass and a COG height inside the PPU.`];
    }
    if (ppu.secured !== true) errors.push(`${ppu.id}: confirm the PPU is positively secured to the supporting bed; lashing design is a separate check.`);
    const bed = model.bedLayout?.find(item => item.id === ppu.hostId);
    const train = model.trailers.find(item => item.id === ppu.hostId && item.enabled);
    const host = bed ?? train;
    const def = host && model.catalogue.find(item => item.id === host.definitionId);
    if (!host || !def) return [...errors, `${ppu.id}: select a supporting bed or train.`];
    if (train && train.placementReference !== "ABSOLUTE") return [...errors, `${ppu.id}: convert the supporting train to absolute bed placement first.`];
    const origin = { startXM: host.xM, centreYM: host.yM, yawDeg: host.yawDeg };
    const corners = deckPpuFootprint(ppu).map(point => worldToLocal(origin, point));
    if (corners.some(p => p.x < -1e-6 || p.x > host.axleLines * def.axleSpacingM + 1e-6 || Math.abs(p.y) > def.trailerWidthM / 2 + 1e-6)) errors.push(`${ppu.id}: the complete PPU footprint must be on its selected bed.`);
    const footprint = deckPpuFootprint(ppu);
    const cargo = trailerFootprint({ startXM: model.cargo.extremeX, centreYM: model.cargo.extremeY + model.cargo.widthM / 2, lengthM: model.cargo.lengthM, widthM: model.cargo.widthM, yawDeg: 0 });
    if (ppu.heightM > model.packing.heightM + 1e-6 && polygonsOverlap(footprint, cargo)) errors.push(`${ppu.id}: the PPU intersects the cargo envelope; move it clear or provide sufficient vertical clearance.`);
    if ((model.deckPpus ?? []).some(other => other.id !== ppu.id && polygonsOverlap(footprint, deckPpuFootprint(other)))) errors.push(`${ppu.id}: deck-mounted PPU footprints overlap.`);
    return errors;
  });
}
