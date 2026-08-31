import assert from "node:assert/strict";
import { createDefaultModel, hydrateProjectModel } from "../app/data/default-model";
import { calculateProject } from "../app/engine/core";
import { runArrangementOptimiser } from "../app/engine/arrangement-optimiser";
import { passToProject } from "../app/engine/optimiser";
import { applyBedLayout, bedsFromModel, splitAxleModules } from "../app/engine/bed-layout";
import { localToWorld, worldToLocal, trailerFootprint, polygonsOverlap, supportOnTrailer } from "../app/engine/placement";
import { deckPpuWind, validateDeckPpus } from "../app/engine/deck-ppus";
import { assertLegacyPlacementSupported } from "../app/engine/placement-export";
import { buildAutocadDxfExport } from "../app/engine/autocad-dxf-export";
import { buildAutocadCompactExport } from "../app/engine/autocad-compact-export";
import { applyArrangementDescriptor, bestModuleComposition, createArrangementDescriptor, trainAngleCandidates, validateArrangementPlacement } from "../app/engine/arrangement";
import { collectSetupIssues } from "../app/engine/setup";
import { buildCaseTextExport } from "../app/engine/case-text-export";
import { appendBedAtSelectedTrainFront, bedTrainKeys, groupAndAlignBeds, nextTrainName } from "../app/engine/formation-editor";
import type { BedPlacement, DeckPpu, ProjectModel } from "../app/engine/types";

const close = (actual: number, expected: number, tolerance = 1e-7) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
const base = createDefaultModel();
const def = base.catalogue.find(d => d.name === "K2400 ST")!;
assert.ok(def);
for (let count = 4; count <= 99; count++) {
  const build = splitAxleModules(count);
  if (count === 7) assert.equal(build, null);
  else assert.equal(build?.reduce((sum, al) => sum + al, 0), count);
}
assert.equal(splitAxleModules(Infinity), null);
const placement = { startXM: 3, centreYM: 5, yawDeg: 15, lengthM: 12, widthM: 2.43 };
const local = worldToLocal(placement, localToWorld(placement, 7, -.725));
close(local.x, 7); close(local.y, -.725);
assert.equal(polygonsOverlap(trailerFootprint(placement), trailerFootprint({ ...placement, centreYM: 20 })), false);
assert.equal(polygonsOverlap(trailerFootprint(placement), trailerFootprint(placement)), true);
assert.equal(supportOnTrailer(placement, { xM: 3, widthM: .5 }).fits, false);

function specimen(mode: ProjectModel["hydraulicSystemMode"]): ProjectModel {
  const model = createDefaultModel();
  model.cargo = { ...model.cargo, lengthM: 12, widthM: 4, heightM: 4, massT: 100, extremeX: 0, extremeY: 0, cog: { x: 6, y: 2, z: 2 } };
  model.packing = { ...model.packing, heightM: .5, massT: 10, cog: { x: 6, y: 2, z: .25 } };
  model.trailerDeckHeightM = 1.5;
  model.hydraulicSystemMode = mode;
  model.trailers = [{ ...model.trailers[0], id: "T1", definitionId: def.id, axleLines: 12, xM: -2, yM: 2, yawDeg: 0, placementReference: "ABSOLUTE", ppuLeft: false, ppuRight: false }];
  model.groupings = [{ splitAfterAxleLine: 6, groups: [], pinnedAxleLines: [], cornerGroups: mode === "FOUR_POINT" ? { rearLeft: 1, rearRight: 2, frontLeft: 3, frontRight: 4 } : { rearLeft: 1, rearRight: 2, frontLeft: 3, frontRight: 2 } }];
  model.supports = [1, 4, 8, 11].map((xM, index) => ({ ...model.supports[0], id: `S${index + 1}`, xM, widthM: .5, allowed: true, active: true }));
  model.analysedTrailer = 1;
  model.optimiser.minimumActiveSupports = 2;
  model.spineLoadCase = "Neutral";
  model.spineMeshSizeM = .1;
  return model;
}

for (const mode of ["THREE_POINT", "FOUR_POINT"] as const) {
  const model = specimen(mode);
  const plain = calculateProject(model);
  const beds = bedsFromModel(model, plain);
  assert.deepEqual(beds.map(b => b.axleLines), [6, 6]);
  const compiled = applyBedLayout(model, beds);
  assert.deepEqual(compiled.errors, []);
  const same = calculateProject(compiled.model);
  close(same.totalMassT, plain.totalMassT);
  close(same.metrics.dynamicUtil.value!, plain.metrics.dynamicUtil.value!);
  const ppu: DeckPpu = { id: "PPU-free", hostId: beds[0].id, xM: 2, yM: 2, yawDeg: 10, lengthM: 1.2, widthM: 1, heightM: .4, cogZM: .2, massT: 20, secured: true, dragCoefficient: 1.2 };
  const mounted = { ...compiled.model, deckPpus: [ppu] };
  assert.deepEqual(validateDeckPpus(mounted), []);
  const loaded = calculateProject(mounted);
  close(loaded.totalMassT, plain.totalMassT + 20);
  close(loaded.combinedCog.x, (plain.totalMassT * plain.combinedCog.x + 40) / loaded.totalMassT);
  close(loaded.combinedCog.z, (plain.totalMassT * plain.combinedCog.z + 20 * 1.7) / loaded.totalMassT);
  close(loaded.groups.reduce((sum, group) => sum + group.loadT, 0), loaded.totalMassT);
  assert.equal(loaded.trailerChecks?.length, 1);
  assert.ok(loaded.beam.points.length > 0);
  assert.ok(deckPpuWind(mounted).frontMoment > 0);
  const a = ppu.yawDeg * Math.PI / 180;
  close(deckPpuWind(mounted).frontMoment, ppu.heightM * (Math.cos(a) * ppu.widthM + Math.sin(a) * ppu.lengthM) * ppu.dragCoefficient * (mounted.trailerDeckHeightM + ppu.heightM / 2));
  assert.notEqual(loaded.analysis.accelerationShift.x, plain.analysis.accelerationShift.x);
  const powered = calculateProject({ ...mounted, roadTransport: { ...mounted.roadTransport, enabled: true }, deckPpus: [{ ...ppu, suppliesHydraulics: true }] });
  close(powered.roadTransport.accelerationForceKN, loaded.totalMassT * mounted.roadTransport.driveAccelerationMps2);
  assert.ok(powered.roadTransport.ppuDrivenBogieLimit > 0);
  assert.match(buildCaseTextExport(mounted, loaded), /DECK-MOUNTED PPUS/);
  const moved = calculateProject({ ...mounted, deckPpus: [{ ...ppu, xM: 5.5 }] });
  assert.ok(moved.combinedCog.x > loaded.combinedCog.x);
  assert.notEqual(moved.beam.bendingMaxKNm, loaded.beam.bendingMaxKNm);
  const bad = calculateProject({ ...mounted, deckPpus: [{ ...ppu, xM: 100 }] });
  assert.equal(bad.failClass, "PLACEMENT");
  assert.match(bad.failDetail, /footprint/);
  assert.equal(calculateProject({ ...mounted, deckPpus: [{ ...ppu, secured: false }] }).failClass, "PLACEMENT");
  assert.match(calculateProject({ ...mounted, deckPpus: [{ ...ppu, heightM: 2 }] }).failDetail, /cargo envelope/);
  assert.match(validateDeckPpus({ ...mounted, deckPpus: [ppu, ppu] }).join(" "), /unique/);
  assert.throws(() => bedsFromModel({ ...model, trailers: [{ ...model.trailers[0], singleFile: true }] }, plain), /single-file/);
  assert.throws(() => assertLegacyPlacementSupported(mounted), /cannot represent/);
  assert.match(buildAutocadDxfExport(mounted, loaded), /PPU-free/);
  const cad = buildAutocadCompactExport(mounted, loaded).split(/\r?\n/).map(line => line.split("|"));
  assert.deepEqual(cad[0], ["SARTD-CAD", "2", "MM-T-KN-DEG", "REAR-LOW-X"]);
  assert.equal(cad.filter(row => row[0] === "BED").length, 2);
  assert.equal(cad.find(row => row[0] === "DECKPPU")?.[9], "20");
  assert.equal(Number(cad.find(row => row[0] === "SUMMARY")?.[2]), 20);
  assert.equal(Number(cad.find(row => row[0] === "END")?.[3]), 1);
  assert.equal(cad.filter(row => row[0] === "BOUNDARY").length, mode === "FOUR_POINT" ? 4 : 3);
  for (const view of ["PLAN", "SIDE", "END"]) assert.ok(cad.some(row => row[0] === "VIEWPATH" && row[1] === view && row[2] === "SARTD-PPU"));
  const roundTrip = hydrateProjectModel(JSON.parse(JSON.stringify(mounted)));
  close(calculateProject(roundTrip).totalMassT, loaded.totalMassT);
  assert.deepEqual(roundTrip.bedLayout, mounted.bedLayout);
  const disconnected = structuredClone(beds);
  disconnected[1].xM += 1;
  assert.match(applyBedLayout(model, disconnected).errors.join(" "), /not joined/);
  assert.equal(calculateProject({ ...model, bedLayout: disconnected }).failClass, "PLACEMENT");
  const rotated = beds.map(bed => {
    const p = localToWorld({ startXM: beds[0].xM, centreYM: beds[0].yM, yawDeg: 5 }, bed.xM - beds[0].xM);
    return { ...bed, xM: p.x, yM: p.y, yawDeg: 5 };
  });
  const rotatedModel = applyBedLayout(model, rotated).model;
  const angled = calculateProject(rotatedModel);
  assert.notEqual(angled.failClass, "PLACEMENT");
  assert.ok(angled.axlePoints.every(axle => Number.isFinite(axle.point.x) && Number.isFinite(axle.point.y)));
  close(angled.totalMassT, plain.totalMassT);
  assert.equal(angled.resolvedTrailers[0].yawDeg, 5);
  assert.equal(angled.resolvedTrailers[0].footprint?.length, 4);
  assert.equal(angled.groups.length, mode === "THREE_POINT" ? 3 : 4);
  assert.ok(angled.trailerChecks?.length);
  assert.throws(() => assertLegacyPlacementSupported(rotatedModel), /cannot represent/);
}
const mixedBase = specimen("FOUR_POINT");
const mixedBeds: BedPlacement[] = [
  { id: "B1", train: "T1", definitionId: def.id, axleLines: 4, xM: 0, yM: 0, yawDeg: 0, ppuRear: false, ppuFront: false },
  { id: "B2", train: "T2", definitionId: def.id, axleLines: 6, xM: 0, yM: 4, yawDeg: 0, ppuRear: false, ppuFront: false },
];
const mixed = applyBedLayout(mixedBase, mixedBeds).model;
const shorterTrainCheck = calculateProject({ ...mixed, analysedTrailer: 2, supports: [1, 3, 5, 7].map((xM, index) => ({ ...mixed.supports[0], id: `M${index}`, xM, widthM: .5, allowed: true, active: true })) });
assert.equal(shorterTrainCheck.trailerChecks?.length, 2, "Every manual train must be checked, including unequal parallel trains with the same rear X.");
assert.equal(shorterTrainCheck.trailerChecks?.find(check => check.trailerIndex === 0)?.passed, false);
assert.match(shorterTrainCheck.trailerChecks?.find(check => check.trailerIndex === 0)?.detail ?? "", /bearing strip/);
assert.notEqual(shorterTrainCheck.status, "PASS");
assert.ok(!collectSetupIssues(mixed, calculateProject(mixed)).some(issue => ["trailer-shared-axles-1", "shared-split-1", "shared-pins-1"].includes(issue.id)));
assert.throws(() => assertLegacyPlacementSupported(mixed), /unequal/);

const editorBeds: BedPlacement[] = [
  { id: "B1", train: "Train 1", definitionId: def.id, axleLines: 4, xM: 0, yM: 0, yawDeg: 0, ppuRear: false, ppuFront: false },
  { id: "B2", train: "legacy", definitionId: def.id, axleLines: 5, xM: 25, yM: 0, yawDeg: 0, ppuRear: false, ppuFront: true },
  { id: "B3", train: "Train 1", definitionId: def.id, axleLines: 6, xM: 9, yM: 0, yawDeg: 0, ppuRear: false, ppuFront: false },
];
assert.equal(nextTrainName(editorBeds), "Train 2");
const editorPpu: DeckPpu = { id: "PPU-editor", hostId: "B2", xM: 27, yM: 0, yawDeg: 0, lengthM: 1, widthM: 1, heightM: .4, massT: 4, cogZM: .2, secured: true, dragCoefficient: 1.2 };
assert.deepEqual(bedTrainKeys(editorBeds, ["B1"], [editorPpu], ["PPU-editor"]).sort(), ["Train 1", "legacy"]);
const groupedEditor = groupAndAlignBeds(mixedBase, editorBeds, [editorPpu], ["B1", "B2"]);
assert.equal(groupedEditor.error, undefined);
assert.equal(groupedEditor.train, "Train 2");
assert.equal(groupedEditor.beds.filter(bed => bed.train === "Train 2").length, 2);
close(groupedEditor.beds.find(bed => bed.id === "B2")!.xM, def.axleSpacingM * 4);
close(groupedEditor.ppus[0].xM, def.axleSpacingM * 4 + 2);
const batchEditor = appendBedAtSelectedTrainFront(mixedBase, groupedEditor.beds, groupedEditor.ppus, ["Train 1", "Train 2"], 5, (train, index) => `new-${train}-${index}`);
assert.equal(batchEditor.error, undefined);
assert.deepEqual(batchEditor.addedBedIds?.sort(), ["new-Train 1-0", "new-Train 2-1"]);
assert.equal(batchEditor.beds.find(bed => bed.id === "B2")!.ppuFront, false);
assert.equal(batchEditor.beds.find(bed => bed.id === "new-Train 2-1")!.ppuFront, true);
const blockedBatch = appendBedAtSelectedTrainFront(mixedBase, [{ ...editorBeds[0], axleLines: 6 }, ...Array.from({ length: 15 }, (_, index) => ({ ...editorBeds[0], id: `B-limit-${index}`, axleLines: 6 as const, xM: (index + 1) * def.axleSpacingM * 6 }))], [], ["Train 1"], 4, () => "must-not-add");
assert.match(blockedBatch.error ?? "", /99-AL/);
const settings = { ...base.arrangementOptimiser, trailerDefinitionId: def.id, allowAngledFormations: true, maximumTrainAngleDeg: 10, trainAngleSamples: 2 };
const angles = trainAngleCandidates(settings, 2);
assert.ok(angles.some(list => list.every(angle => angle === 0)));
assert.ok(angles.some(list => list[0] === -list[1] && list[0] !== 0));
const descriptor = createArrangementDescriptor(def, settings, 2, bestModuleComposition(12, settings, 2)!, 8, [0, 2], "FOUR_POINT", [5, -5]);
const placed = applyArrangementDescriptor(base, descriptor);
assert.deepEqual(placed.trailers.map(t => t.yawDeg), [5, -5]);
assert.equal(placed.bedLayout, undefined);
assert.equal(descriptor.formationMode, "ANGLED");
assert.equal(calculateProject({ ...base, bedLayout: [{}] as BedPlacement[] }).failClass, "PLACEMENT");
console.log("Bed matrix, rotated geometry, 3/4-point loads, mounted PPU COG/beam/wind, export safeguards and round-trip checks passed.");

async function verifyAngledSearch() {
  const model = createDefaultModel();
  model.cargo.massT = 20;
  model.cargo.widthM = 9;
  model.cargo.cog.y = 4.5;
  model.packing.massT = 0;
  model.loosePacking = [];
  model.supports = [5, 5.7, 6.4, 7.1].map((xM, index) => ({ id: `S${index}`, xM, widthM: .5, allowed: true, active: true }));
  model.environment = { ...model.environment, routeLongitudinalSlopeDeg: 0, routeTransverseSlopeDeg: 0, longitudinalSlopeDeg: 0, transverseSlopeDeg: 0, longitudinalAccelerationMps2: 0, transverseAccelerationMps2: 0, windSpeedMps: 0 };
  model.arrangementOptimiser = { ...model.arrangementOptimiser, minimumTrains: 2, maximumTrains: 2, maximumAxleLinesPerTrain: 4, maximumFormationWidthM: 9, limitFormationWidthToCargo: true, spacingSamples: 2, allowAngledFormations: true, maximumTrainAngleDeg: 5, trainAngleSamples: 1, hydraulicSearchMode: "BOTH" };
  model.optimiser = { ...model.optimiser, d138Start: 1, d138Step: 1, d138MaximumFraction: .25, e89Step: .5, pinSearchMode: "OFF", deflectionCheck: "OFF", minimumActiveSupports: 2 };
  const run = await runArrangementOptimiser(model);
  assert.equal(run.state, "COMPLETE");
  const passing = run.passes.filter(pass => pass.result.status === "PASS");
  const angled = passing.filter(pass => pass.arrangement?.formationMode === "ANGLED");
  if (!angled.length) console.log(JSON.stringify({ rejectedAngleCases: run.passes.filter(pass => pass.arrangement?.formationMode === "ANGLED").slice(0, 10).map(pass => ({ status: pass.result.status, reason: pass.result.failDetail })), angleEvents: run.events.filter(event => event.detail.includes("angles") && ["Formation removed before calculation", "No valid pass"].includes(event.message)).slice(0, 10).map(event => ({ message: event.message, detail: event.detail.slice(0, 300) })) }));
  assert.ok(angled.length > 0, "A real bounded search must find and retain an angled PASS, not just create angle descriptors.");
  assert.ok(passing.some(pass => pass.arrangement?.formationMode !== "ANGLED"), "Straight alternatives remain in the search.");
  assert.deepEqual([...new Set(angled.map(pass => pass.arrangement?.hydraulicSystemMode))].sort(), ["FOUR_POINT", "THREE_POINT"]);
  for (const pass of angled) {
    const reapplied = calculateProject(passToProject(model, pass));
    assert.equal(reapplied.status, "PASS");
    close(reapplied.metrics.dynamicUtil.value!, pass.result.metrics.dynamicUtil.value!);
    assert.equal(reapplied.trailerChecks?.length, 2);
    assert.ok(reapplied.trailerChecks?.every(check => check.passed));
    assert.equal(validateArrangementPlacement(passToProject(model, pass), reapplied).status, "PASS");
  }
  const escaped = structuredClone(angled[0].result);
  escaped.resolvedTrailers = escaped.resolvedTrailers.map(trailer => ({ ...trailer, centreYM: trailer.centreYM + 100 }));
  assert.equal(validateArrangementPlacement(model, escaped).failClass, "FORMATION_BOUNDS");
  console.log(JSON.stringify({ angledSearch: { evaluated: run.passes.length, passing: passing.length, angled: angled.length, hydraulicModes: [...new Set(angled.map(pass => pass.arrangement?.hydraulicSystemMode))] } }));
}
verifyAngledSearch().catch(error => { console.error(error); process.exitCode = 1; });
