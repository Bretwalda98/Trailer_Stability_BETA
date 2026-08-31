import type { CalculationResult, Point2, ProjectModel } from "./types";
import { localToWorld, trailerFootprint } from "./placement";
import { deckPpuFootprint } from "./deck-ppus";

function value(number: number): string {
  return Number.isFinite(number) ? number.toFixed(6) : "0";
}

function dxfPair(code: number, content: string | number): string {
  return `${code}\n${content}\n`;
}

function line(layer: string, from: Point2, to: Point2): string {
  return [dxfPair(0, "LINE"), dxfPair(8, layer), dxfPair(10, value(from.x)), dxfPair(20, value(from.y)), dxfPair(30, 0), dxfPair(11, value(to.x)), dxfPair(21, value(to.y)), dxfPair(31, 0)].join("");
}

function polyline(layer: string, points: Point2[], closed = false): string {
  if (points.length < 2) return "";
  const vertices = points.flatMap((point) => [dxfPair(0, "VERTEX"), dxfPair(8, layer), dxfPair(10, value(point.x)), dxfPair(20, value(point.y)), dxfPair(30, 0)]).join("");
  return [dxfPair(0, "POLYLINE"), dxfPair(8, layer), dxfPair(66, 1), dxfPair(70, closed ? 1 : 0), vertices, dxfPair(0, "SEQEND")].join("");
}

function text(layer: string, at: Point2, label: string, height = 0.18): string {
  return [dxfPair(0, "TEXT"), dxfPair(8, layer), dxfPair(10, value(at.x)), dxfPair(20, value(at.y)), dxfPair(30, 0), dxfPair(40, value(height)), dxfPair(1, label.replace(/[\r\n]+/g, " ").slice(0, 240)), dxfPair(7, "STANDARD")].join("");
}

function rectangle(layer: string, x: number, y: number, length: number, width: number): string {
  return polyline(layer, [
    { x, y: y - width / 2 },
    { x: x + length, y: y - width / 2 },
    { x: x + length, y: y + width / 2 },
    { x, y: y + width / 2 },
  ], true);
}

/**
 * Direct AutoCAD DXF exchange. It is deliberately independent of AutoLISP:
 * opening the generated .dxf in AutoCAD produces a scaled plan drawing even
 * when the SARTD reader package is not installed.
 */
export function buildAutocadDxfExport(model: ProjectModel, result: CalculationResult): string {
  const layers = ["TS_CARGO", "TS_TRAILERS", "TS_AXLES", "TS_HYDRAULICS", "TS_SUPPORTS", "TS_COG", "TS_TEXT"];
  const tables = [
    dxfPair(0, "SECTION"), dxfPair(2, "TABLES"),
    dxfPair(0, "TABLE"), dxfPair(2, "LAYER"), dxfPair(70, layers.length),
    ...layers.map((layer, index) => [dxfPair(0, "LAYER"), dxfPair(2, layer), dxfPair(70, 0), dxfPair(62, 1 + (index % 6)), dxfPair(6, "CONTINUOUS")].join("")),
    dxfPair(0, "ENDTAB"), dxfPair(0, "ENDSEC"),
  ].join("");
  const cargo = rectangle("TS_CARGO", model.cargo.extremeX, model.cargo.extremeY + model.cargo.widthM / 2, model.cargo.lengthM, model.cargo.widthM);
  const trailerGeometry = result.resolvedTrailers.flatMap((trailer) => {
    const outline = polyline("TS_TRAILERS", trailer.footprint ?? trailerFootprint(trailer), true);
    const ppus = (["rear", "front"] as const).map(end => {
      const lengthM = end === "rear" ? trailer.ppuLeftLengthM : trailer.ppuRightLengthM;
      if (!lengthM) return "";
      const start = localToWorld(trailer, end === "rear" ? -lengthM : trailer.lengthM);
      return polyline("TS_TRAILERS", trailerFootprint({ ...trailer, startXM: start.x, centreYM: start.y, lengthM }), true);
    }).join("");
    const label = text("TS_TEXT", { x: trailer.startXM, y: trailer.centreYM + trailer.widthM / 2 + 0.22 }, `${trailer.name} — ${model.trailers[trailer.index]?.axleLines ?? 0} AL`);
    return [outline, ppus, label];
  }).join("");
  const axleGeometry = result.axlePoints.map((axle) => {
    const half = 0.14;
    return line("TS_AXLES", { x: axle.point.x, y: axle.point.y - half }, { x: axle.point.x, y: axle.point.y + half });
  }).join("");
  const hydraulic = polyline("TS_HYDRAULICS", result.stabilityPolygon, result.stabilityPolygon.length >= 3)
    + result.groups.map((group) => text("TS_HYDRAULICS", group.point, `G${group.group}: ${group.loadT.toFixed(1)} t`)).join("");
  const supports = result.supports.map((support) => {
    const points = [{ x: support.xM, y: -0.12 }, { x: support.xM, y: 0.12 }];
    return line("TS_SUPPORTS", points[0], points[1]) + text("TS_SUPPORTS", { x: support.xM, y: -0.35 }, `${support.id} ${support.active ? "ON" : "OFF"}`);
  }).join("");
  const cogs = [
    text("TS_COG", result.loadCog, "LOAD COG"),
    text("TS_COG", result.combinedCog, "COMBINED COG"),
  ].join("");
  const notes = [
    text("TS_TEXT", { x: model.cargo.extremeX, y: model.cargo.extremeY + model.cargo.widthM + 0.6 }, `Trailer Stability — ${model.cargo.name || "untitled case"}`, 0.25),
    text("TS_TEXT", { x: model.cargo.extremeX, y: model.cargo.extremeY + model.cargo.widthM + 0.3 }, `Result: ${result.status}; total mass ${result.totalMassT.toFixed(2)} t; rear = lower X / left, front = higher X / right.`),
  ].join("");
  const bedSeams = (model.bedLayout ?? []).map(bed => {
    const definition = model.catalogue.find(d => d.id === bed.definitionId);
    return definition ? polyline("TS_TRAILERS", trailerFootprint({ startXM: bed.xM, centreYM: bed.yM, yawDeg: bed.yawDeg, lengthM: bed.axleLines * definition.axleSpacingM, widthM: definition.trailerWidthM }), true) : "";
  }).join("");
  const deckPpus = (model.deckPpus ?? []).map(ppu => polyline("TS_TRAILERS", deckPpuFootprint(ppu), true) + text("TS_TEXT", { x: ppu.xM, y: ppu.yM }, `${ppu.id} ${ppu.massT} t`)).join("");
  const entities = [cargo, trailerGeometry, bedSeams, deckPpus, axleGeometry, hydraulic, supports, cogs, notes].join("");
  return [
    dxfPair(0, "SECTION"), dxfPair(2, "HEADER"), dxfPair(9, "$ACADVER"), dxfPair(1, "AC1009"), dxfPair(0, "ENDSEC"),
    tables,
    dxfPair(0, "SECTION"), dxfPair(2, "ENTITIES"), entities, dxfPair(0, "ENDSEC"), dxfPair(0, "EOF"),
  ].join("");
}
