import { localToWorld, worldToLocal } from "./placement";
import type { BedPlacement, DeckPpu, ProjectModel } from "./types";

export type BedIdFactory = (train: string, index: number) => string;

export interface FormationEditResult {
  beds: BedPlacement[];
  ppus: DeckPpu[];
  train?: string;
  addedBedIds?: string[];
  error?: string;
}

export function nextTrainName(beds: BedPlacement[]): string {
  const largest = beds.reduce((maximum, bed) => {
    const match = /^Train\s+(\d+)$/i.exec(bed.train.trim());
    return match ? Math.max(maximum, Number(match[1])) : maximum;
  }, 0);
  return `Train ${largest + 1}`;
}

export function bedTrainKeys(beds: BedPlacement[], selectedBedIds: Iterable<string>, ppus: DeckPpu[] = [], selectedPpuIds: Iterable<string> = []): string[] {
  const selected = new Set(selectedBedIds);
  const selectedPpus = new Set(selectedPpuIds);
  for (const ppu of ppus) if (selectedPpus.has(ppu.id)) selected.add(ppu.hostId);
  return [...new Set(beds.filter(bed => selected.has(bed.id)).map(bed => bed.train))];
}

function moveHostedPpus(ppus: DeckPpu[], before: BedPlacement, after: BedPlacement): DeckPpu[] {
  return ppus.map(ppu => {
    if (ppu.hostId !== before.id) return ppu;
    const local = worldToLocal({ startXM: before.xM, centreYM: before.yM, yawDeg: before.yawDeg }, { x: ppu.xM, y: ppu.yM });
    const point = localToWorld({ startXM: after.xM, centreYM: after.yM, yawDeg: after.yawDeg }, local.x, local.y);
    return { ...ppu, xM: point.x, yM: point.y, yawDeg: ppu.yawDeg + after.yawDeg - before.yawDeg };
  });
}

function sortedTrainBeds(beds: BedPlacement[], train: string): BedPlacement[] {
  const members = beds.filter(bed => bed.train === train);
  const first = members[0];
  if (!first) return [];
  const origin = { startXM: first.xM, centreYM: first.yM, yawDeg: first.yawDeg };
  return [...members].sort((a, b) => worldToLocal(origin, { x: a.xM, y: a.yM }).x - worldToLocal(origin, { x: b.xM, y: b.yM }).x);
}

/** Create a named, physically connected train from beds in their current editor order. */
export function groupAndAlignBeds(model: ProjectModel, beds: BedPlacement[], ppus: DeckPpu[], selectedBedIds: Iterable<string>): FormationEditResult {
  const selected = new Set(selectedBedIds);
  const members = beds.filter(bed => selected.has(bed.id));
  if (members.length < 2) return { beds, ppus, error: "Select at least two beds to create a train." };
  const first = members[0];
  if (members.some(bed => bed.definitionId !== first.definitionId || Math.abs(bed.yawDeg - first.yawDeg) > 1e-6)) {
    return { beds, ppus, error: "Selected beds must use the same model and rotation before they can form one connected train." };
  }
  const rearPpus = members.filter(bed => bed.ppuRear).length;
  const frontPpus = members.filter(bed => bed.ppuFront).length;
  if (rearPpus > 1 || frontPpus > 1) return { beds, ppus, error: "A connected train can retain only one rear PPU and one front PPU. Correct the selected bed-end PPUs first." };
  const definition = model.catalogue.find(item => item.id === first.definitionId);
  if (!definition) return { beds, ppus, error: "The selected bed model is not available in the trailer catalogue." };
  const train = nextTrainName(beds);
  let stationM = 0;
  let movedPpus = ppus;
  const aligned = members.map((bed, index) => {
    const point = localToWorld({ startXM: first.xM, centreYM: first.yM, yawDeg: first.yawDeg }, stationM);
    stationM += bed.axleLines * definition.axleSpacingM;
    const next: BedPlacement = {
      ...bed,
      train,
      xM: point.x,
      yM: point.y,
      yawDeg: first.yawDeg,
      ppuRear: index === 0 && rearPpus === 1,
      ppuFront: index === members.length - 1 && frontPpus === 1,
    };
    movedPpus = moveHostedPpus(movedPpus, bed, next);
    return next;
  });
  return { beds: beds.map(bed => aligned.find(item => item.id === bed.id) ?? bed), ppus: movedPpus, train };
}

/** Append one physical bed to the front of every distinct selected train, atomically. */
export function appendBedAtSelectedTrainFront(model: ProjectModel, beds: BedPlacement[], ppus: DeckPpu[], trains: Iterable<string>, axleLines: 4 | 5 | 6, createId: BedIdFactory): FormationEditResult {
  const selectedTrains = [...new Set(trains)];
  if (!selectedTrains.length) return { beds, ppus, error: "Select one or more beds or mounted PPUs first." };
  const additions: BedPlacement[] = [];
  const clearedFronts = new Set<string>();
  for (const train of selectedTrains) {
    const members = sortedTrainBeds(beds, train);
    const first = members[0];
    const front = members.at(-1);
    if (!first || !front) return { beds, ppus, error: `${train}: no beds are available for this train.` };
    if (members.some(bed => bed.definitionId !== first.definitionId || Math.abs(bed.yawDeg - first.yawDeg) > 1e-6)) return { beds, ppus, error: `${train}: align the connected train before adding a bed.` };
    const totalAxleLines = members.reduce((sum, bed) => sum + bed.axleLines, 0);
    if (totalAxleLines + axleLines > 99) return { beds, ppus, error: `${train}: adding ${axleLines} AL would exceed the 99-AL train limit. No beds were added.` };
    const definition = model.catalogue.find(item => item.id === first.definitionId);
    if (!definition) return { beds, ppus, error: `${train}: its trailer model is no longer available.` };
    const point = localToWorld({ startXM: front.xM, centreYM: front.yM, yawDeg: front.yawDeg }, front.axleLines * definition.axleSpacingM);
    additions.push({ id: createId(train, additions.length), train, definitionId: first.definitionId, axleLines, xM: point.x, yM: point.y, yawDeg: first.yawDeg, ppuRear: false, ppuFront: front.ppuFront });
    if (front.ppuFront) clearedFronts.add(front.id);
  }
  return { beds: [...beds.map(bed => clearedFronts.has(bed.id) ? { ...bed, ppuFront: false } : bed), ...additions], ppus, addedBedIds: additions.map(bed => bed.id) };
}
