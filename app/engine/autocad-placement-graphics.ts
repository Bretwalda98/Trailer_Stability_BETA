import { deckPpuFootprint } from "./deck-ppus";
import { localToWorld, polygonBounds, trailerFootprint } from "./placement";
import type { CalculationResult, Point2, ProjectModel } from "./types";

export type CadView = "PLAN" | "SIDE" | "END";
export type CadGraphic = { view: CadView; layer: string; points: Point2[]; text?: string; heightM?: number };

/** Pure geometry, in metres. No LISP expressions or executable data in the exchange. */
export function placementCadGraphics(model: ProjectModel, result: CalculationResult): CadGraphic[] {
  const output: CadGraphic[] = [];
  const path = (view: CadView, layer: string, points: Point2[], closed = false) => output.push({ view, layer, points: closed ? [...points, points[0]] : points });
  const label = (view: CadView, layer: string, at: Point2, text: string, heightM = .22) => output.push({ view, layer, points: [at], text, heightM });
  const rect = (view: CadView, layer: string, x: number, y: number, length: number, height: number) => path(view, layer, [{ x, y }, { x: x + length, y }, { x: x + length, y: y + height }, { x, y: y + height }], true);
  const { cargo, packing } = model;
  const deck = model.trailerDeckHeightM;
  const bottom = deck + packing.heightM;
  const textHeight = Math.max(.18, Math.min(cargo.lengthM, cargo.widthM) / 70);
  rect("PLAN", "SARTD-LOAD", cargo.extremeX, cargo.extremeY, cargo.lengthM, cargo.widthM);
  rect("SIDE", "SARTD-LOAD", cargo.extremeX, bottom, cargo.lengthM, cargo.heightM);
  rect("END", "SARTD-LOAD", cargo.extremeY, bottom, cargo.widthM, cargo.heightM);
  for (const support of result.supports) {
    const layer = support.active ? "SARTD-PACKING" : "SARTD-INACTIVE";
    rect("PLAN", layer, support.xM - support.widthM / 2, cargo.extremeY, support.widthM, cargo.widthM);
    rect("SIDE", layer, support.xM - support.widthM / 2, deck, support.widthM, packing.heightM);
    label("PLAN", layer, { x: support.xM, y: cargo.extremeY - 2 * textHeight }, `${support.id} ${support.active ? "ON" : "OFF"}`, textHeight);
  }
  if (packing.heightM > 0) rect("END", "SARTD-PACKING", cargo.extremeY, deck, cargo.widthM, packing.heightM);
  for (const trailer of result.resolvedTrailers) {
    const input = model.trailers[trailer.index];
    const definition = model.catalogue.find(item => item.id === input.definitionId)!;
    const footprint = trailerFootprint(trailer);
    path("PLAN", "SARTD-TRAILER", footprint, true);
    label("PLAN", "SARTD-TEXT", localToWorld(trailer, 0, -trailer.widthM / 2 - 2 * textHeight), `T${trailer.index + 1} ${trailer.name} ${input.axleLines} AL / ${trailer.yawDeg ?? 0} deg`, textHeight);
    const bounds = polygonBounds(footprint);
    // Orthographic projected equipment envelopes; not a fabricated 3D chassis model.
    path("SIDE", "SARTD-TRAILER", [{ x: bounds.minX, y: deck }, { x: bounds.maxX, y: deck }]);
    path("END", "SARTD-TRAILER", [{ x: bounds.minY, y: deck }, { x: bounds.maxY, y: deck }]);
    for (const end of ["rear", "front"] as const) {
      const lengthM = end === "rear" ? trailer.ppuLeftLengthM : trailer.ppuRightLengthM;
      if (!lengthM) continue;
      const p = localToWorld(trailer, end === "rear" ? -lengthM : trailer.lengthM);
      const pp = trailerFootprint({ ...trailer, startXM: p.x, centreYM: p.y, lengthM });
      path("PLAN", "SARTD-PPU", pp, true);
      label("PLAN", "SARTD-PPU", p, `${end} PPU`, textHeight);
      const b = polygonBounds(pp);
      path("SIDE", "SARTD-PPU", [{ x: b.minX, y: deck }, { x: b.maxX, y: deck }]);
      path("END", "SARTD-PPU", [{ x: b.minY, y: deck }, { x: b.maxY, y: deck }]);
    }
    const angle = (trailer.yawDeg ?? 0) * Math.PI / 180;
    const diameter = definition.wheelDiameterM;
    const tyreWidth = definition.tyreWidthM;
    if (!(diameter > 0 && tyreWidth > 0)) throw new Error(`${trailer.name}: catalogue tyre dimensions are required for CAD elevations.`);
    for (const axle of result.axlePoints.filter(item => item.trailerIndex === trailer.index)) {
      const layer = axle.pinned ? "SARTD-INACTIVE" : `SARTD-HYD-G${axle.group}`;
      // Bogie station marker and projected tyre envelope at each resolved bogie centre.
      const ends = [-tyreWidth / 2, tyreWidth / 2].map(offset => ({ x: axle.point.x - offset * Math.sin(angle), y: axle.point.y + offset * Math.cos(angle) }));
      path("PLAN", layer, ends);
      const sideWidth = Math.abs(Math.cos(angle)) * diameter + Math.abs(Math.sin(angle)) * tyreWidth;
      const endWidth = Math.abs(Math.sin(angle)) * diameter + Math.abs(Math.cos(angle)) * tyreWidth;
      rect("SIDE", layer, axle.point.x - sideWidth / 2, 0, sideWidth, diameter);
      rect("END", layer, axle.point.y - endWidth / 2, 0, endWidth, diameter);
      path("SIDE", layer, [{ x: axle.point.x, y: diameter }, { x: axle.point.x, y: deck }]);
      path("END", layer, [{ x: axle.point.y, y: diameter }, { x: axle.point.y, y: deck }]);
    }
  }
  for (const bed of model.bedLayout ?? []) {
    const definition = model.catalogue.find(item => item.id === bed.definitionId)!;
    path("PLAN", "SARTD-BED", trailerFootprint({ startXM: bed.xM, centreYM: bed.yM, yawDeg: bed.yawDeg, lengthM: bed.axleLines * definition.axleSpacingM, widthM: definition.trailerWidthM }), true);
    label("PLAN", "SARTD-BED", { x: bed.xM, y: bed.yM }, `${bed.id} / ${bed.axleLines} AL`, textHeight);
  }
  for (const ppu of model.deckPpus ?? []) {
    const footprint = deckPpuFootprint(ppu);
    const bounds = polygonBounds(footprint);
    path("PLAN", "SARTD-PPU", footprint, true);
    rect("SIDE", "SARTD-PPU", bounds.minX, deck, bounds.maxX - bounds.minX, ppu.heightM);
    rect("END", "SARTD-PPU", bounds.minY, deck, bounds.maxY - bounds.minY, ppu.heightM);
    label("PLAN", "SARTD-PPU", { x: ppu.xM, y: ppu.yM }, `${ppu.id} / ${ppu.massT} t / secured`, textHeight);
  }
  // The ordered engine boundary is authoritative for both three and four points.
  path("PLAN", "SARTD-STABILITY", result.stabilityPolygon, result.stabilityPolygon.length >= 3);
  for (const group of result.groups) label("PLAN", `SARTD-HYD-G${group.group}`, group.point, `G${group.group}: ${group.loadT.toFixed(2)} t`, textHeight);
  const cogs = [{ point: result.combinedCog, text: "COMBINED COG" }, { point: { x: cargo.extremeX + cargo.cog.x, y: cargo.extremeY + cargo.cog.y, z: bottom + cargo.cog.z }, text: "CARGO COG" }];
  for (const cog of cogs) for (const view of ["PLAN", "SIDE", "END"] as const) {
    const p = { x: view === "END" ? cog.point.y : cog.point.x, y: view === "PLAN" ? cog.point.y : cog.point.z };
    path(view, "SARTD-COG", [{ x: p.x - textHeight, y: p.y }, { x: p.x + textHeight, y: p.y }]);
    path(view, "SARTD-COG", [{ x: p.x, y: p.y - textHeight }, { x: p.x, y: p.y + textHeight }]);
    label(view, "SARTD-COG", { x: p.x + textHeight, y: p.y + textHeight }, cog.text, textHeight);
  }
  for (const view of ["PLAN", "SIDE", "END"] as const) {
    const bounds = polygonBounds(output.filter(item => item.view === view).flatMap(item => item.points));
    label(view, "SARTD-TEXT", { x: bounds.minX, y: bounds.maxY + 4 * textHeight }, `${view} / ${cargo.name} / ${result.status}`, 1.4 * textHeight);
    label(view, "SARTD-TEXT", { x: bounds.minX, y: bounds.maxY + 2 * textHeight }, view === "PLAN" ? "Rear = lower X; front = higher X. Dimensions in mm." : "Orthographic equipment envelopes; not manufacturer fabrication geometry.", textHeight);
  }
  return output;
}
