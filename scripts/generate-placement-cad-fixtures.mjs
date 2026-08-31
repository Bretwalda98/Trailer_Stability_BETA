import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
const require = createRequire(import.meta.url);
const { createDefaultModel } = require("../test-output/cjs/app/data/default-model.js");
const { calculateProject } = require("../test-output/cjs/app/engine/core.js");
const { applyBedLayout } = require("../test-output/cjs/app/engine/bed-layout.js");
const { localToWorld } = require("../test-output/cjs/app/engine/placement.js");
const { buildAutocadCompactExport } = require("../test-output/cjs/app/engine/autocad-compact-export.js");
const output = new URL("../test-output/cad-placement/", import.meta.url);
await mkdir(output, { recursive: true });
for (const mode of ["THREE_POINT", "FOUR_POINT"]) {
  let model = createDefaultModel();
  const definition = model.catalogue.find(item => item.name === "K2400 ST");
  model.cargo = { ...model.cargo, name: `CAD placement ${mode}`, lengthM: 12, widthM: 10, heightM: 4, massT: 100, extremeX: 0, extremeY: 0, cog: { x: 6, y: 5, z: 2 } };
  model.packing = { ...model.packing, massT: 10, heightM: .5, cog: { x: 6, y: 5, z: .25 } };
  model.trailerDeckHeightM = 1.5;
  model.hydraulicSystemMode = mode;
  model.trailers = [];
  model.groupings = [];
  model.loosePacking = [];
  model.supports = [2, 4, 6, 8].map((xM, i) => ({ id: `S${i + 1}`, xM, widthM: .5, allowed: true, active: true }));
  const p = localToWorld({ startXM: -2, centreYM: 2, yawDeg: 10 }, 6 * definition.axleSpacingM);
  const beds = [
    { id: "B1", train: "T1", definitionId: definition.id, axleLines: 6, xM: -2, yM: 2, yawDeg: 10, ppuRear: true, ppuFront: false },
    { id: "B2", train: "T1", definitionId: definition.id, axleLines: 6, xM: p.x, yM: p.y, yawDeg: 10, ppuRear: false, ppuFront: false },
    { id: "B3", train: "T2", definitionId: definition.id, axleLines: 5, xM: 2, yM: 8, yawDeg: -5, ppuRear: false, ppuFront: false },
  ];
  model = applyBedLayout(model, beds).model;
  const centre = localToWorld({ startXM: -2, centreYM: 2, yawDeg: 10 }, 4);
  model.deckPpus = [{ id: "PPU1", hostId: "B1", xM: centre.x, yM: centre.y, yawDeg: 10, lengthM: 1.2, widthM: 1, heightM: .4, cogZM: .2, massT: 6.2, secured: true, dragCoefficient: 1.2, suppliesHydraulics: true }];
  const result = calculateProject(model);
  if (result.failClass === "PLACEMENT" || result.stabilityPolygon.length !== (mode === "FOUR_POINT" ? 4 : 3)) throw new Error(`Invalid fixture: ${result.failDetail}`);
  const cad = buildAutocadCompactExport(model, result, "2026-08-31T12:00:00Z");
  await writeFile(new URL(`${mode}.sartd`, output), cad);
  await writeFile(new URL(`${mode}.json`, output), JSON.stringify({ model, result }, null, 2));
  if (mode === "FOUR_POINT") {
    await writeFile(new URL("wrong-version.sartd", output), cad.replace("SARTD-CAD|2|", "SARTD-CAD|99|"));
    await writeFile(new URL("wrong-units.sartd", output), cad.replace("MM-T-KN-DEG", "M-T-KN-DEG"));
    await writeFile(new URL("missing-geometry.sartd", output), cad.split(/\r?\n/).filter(line => !line.startsWith("VIEW")).join("\r\n"));
    await writeFile(new URL("bad-coordinate.sartd", output), cad.replace(/(VIEWPATH\|[^|]+\|[^|]+\|)[^,]+/, "$1NOT-A-NUMBER"));
    await writeFile(new URL("bad-ppu.sartd", output), cad.split(/\r?\n/).map(line => { const fields = line.split("|"); if (fields[0] === "DECKPPU") fields[11] = "0"; return fields.join("|"); }).join("\r\n"));
  }
  console.log(JSON.stringify({ mode, mass: result.totalMassT, status: result.status, boundary: result.stabilityPolygon.length, beds: beds.length, graphics: cad.split(/\r?\n/).filter(line => line.startsWith("VIEW")).length }));
}
