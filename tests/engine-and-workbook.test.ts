import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { unzipSync } from "fflate";
import * as XLSX from "xlsx";
import { createDefaultModel, hydrateProjectModel } from "../app/data/default-model";
import { solveContinuousBeam } from "../app/engine/beam";
import {
  applySharedAxleLines,
  applySharedPins,
  applySharedSplit,
  applySharedX,
  calculateProject,
  engineeringLimitsFor,
  validateCatalogue,
} from "../app/engine/core";
import { runOptimiser } from "../app/engine/optimiser";
import { exportVerificationWorkbook, importWorkbook } from "../app/engine/workbook";

function arrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function formula(workbook: XLSX.WorkBook, sheetName: string, address: string): string {
  return String(workbook.Sheets[sheetName]?.[address]?.f ?? "");
}

function text(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

async function main(): Promise<void> {
  const root = process.cwd();
  const model = createDefaultModel();
  assert.deepEqual(validateCatalogue(model.catalogue), []);
  assert.equal(model.catalogue.length, 15);
  assert.ok(model.catalogue.some((item) => item.name === "PEKZ G4"));
  assert.ok(model.catalogue.some((item) => item.name === "PEKZ G4 M78 X24 D24 TL24"));

  const result = calculateProject(model);
  assert.ok(Number.isFinite(result.totalMassT) && result.totalMassT > model.cargo.massT);
  assert.equal(result.groups.length, 3);
  assert.ok(result.axlePoints.length > 0);
  assert.ok(result.beam.points.length > 20);
  assert.equal(result.status, "GEOMETRY_FAIL");
  assert.equal(result.failClass, "TRAILER_OVERLAP");
  assert.equal(result.trailerOverlaps.length, 1);
  assert.ok(result.groupingQuality.triangleAreaM2 > 0);
  assert.ok(result.groupingQuality.narrow || result.groupingQuality.dispersedGroups.length > 0);
  assert.notEqual(result.status, "ERROR");
  assert.equal(result.metrics.axleLinesUsed.value, model.trailers[0].axleLines);
  assert.ok(result.supportIterations >= 1);
  assert.deepEqual(engineeringLimitsFor("First"), {
    basicUtil: 0.7,
    basicAngle: 9,
    slopeUtil: 0.85,
    slopeAngle: 7,
    dynamicUtil: 0.9,
    dynamicAngle: 7,
    spineUtil: 0.75,
    dynamicRatio: 0.6,
  });
  assert.equal(engineeringLimitsFor("Second").spineUtil, 0.85);
  assert.equal(engineeringLimitsFor("Third").dynamicRatio, 0.4);

  const outsideTriangle = createDefaultModel();
  outsideTriangle.cargo.extremeY += 50;
  outsideTriangle.cargo.envelopeX = 0;
  outsideTriangle.cargo.envelopeY = 0;
  outsideTriangle.environment.longitudinalSlopeDeg = 0;
  outsideTriangle.environment.transverseSlopeDeg = 0;
  outsideTriangle.environment.longitudinalAccelerationMps2 = 0;
  outsideTriangle.environment.transverseAccelerationMps2 = 0;
  outsideTriangle.environment.windSpeedMps = 0;
  outsideTriangle.optimiser.detailedWeighting = false;
  outsideTriangle.optimiser.deflectionCheck = "OFF";
  const outsideTriangleResult = calculateProject(outsideTriangle);
  assert.equal(outsideTriangleResult.status, "GEOMETRY_FAIL");
  assert.ok(outsideTriangleResult.metrics.basicAngle.value! < 0);
  assert.ok(outsideTriangleResult.warnings.some((warning) => warning.includes("outside")));

  const missingResistance = createDefaultModel();
  const selectedTrailerWidth =
    missingResistance.catalogue.find(
      (definition) => definition.id === missingResistance.trailers[0].definitionId,
    )?.trailerWidthM ?? 0;
  missingResistance.trailers[1].yM =
    missingResistance.trailers[0].yM + selectedTrailerWidth + 0.1;
  missingResistance.groupings[0].cornerGroups = {
    frontLeft: 1,
    frontRight: 1,
    rearLeft: 2,
    rearRight: 2,
  };
  missingResistance.cargo.envelopeX = 0;
  missingResistance.cargo.envelopeY = 0;
  missingResistance.environment.longitudinalSlopeDeg = 0;
  missingResistance.environment.transverseSlopeDeg = 0;
  missingResistance.environment.longitudinalAccelerationMps2 = 0;
  missingResistance.environment.transverseAccelerationMps2 = 0;
  missingResistance.environment.windSpeedMps = 0;
  const selectedDefinitions = new Set(missingResistance.trailers.map((trailer) => trailer.definitionId));
  missingResistance.catalogue = missingResistance.catalogue.map((definition) =>
    selectedDefinitions.has(definition.id)
      ? {
          ...definition,
          momentMinKNm: 0,
          momentMaxKNm: 0,
          shearMinKN: 0,
          shearMaxKN: 0,
        }
      : definition,
  );
  const missingResistanceErrors = validateCatalogue(
    missingResistance.catalogue.filter((definition) => selectedDefinitions.has(definition.id)),
  );
  assert.ok(missingResistanceErrors.some((error) => error.includes("bending moment capacity")));
  assert.ok(missingResistanceErrors.some((error) => error.includes("shear capacity")));
  const missingResistanceResult = calculateProject(missingResistance);
  assert.equal(missingResistanceResult.status, "NOK_FAIL");
  assert.equal(missingResistanceResult.metrics.spineUtil.status, "NOK");

  const malformedHydrated = hydrateProjectModel({
    ...createDefaultModel(),
    trailers: [null],
    groupings: [null],
    supports: [null],
    catalogue: [null],
  });
  assert.doesNotThrow(() => calculateProject(malformedHydrated));

  const simplySupportedUniform = solveContinuousBeam({
    lengthM: 10,
    segments: [{ endM: 10, eiKNm2: 200_000 }],
    supports: [
      { id: "left", xM: 0, active: true },
      { id: "right", xM: 10, active: true },
    ],
    pointLoads: [],
    distributedLoads: [{ startM: 0, endM: 10, startKNPerM: -10, endKNPerM: -10 }],
    outputStepM: 0.05,
    applySupportSpreading: false,
  });
  assert.equal(simplySupportedUniform.stable, true);
  assert.ok(Math.abs(simplySupportedUniform.reactions[0].reactionKN - 50) < 1e-8);
  assert.ok(Math.abs(simplySupportedUniform.reactions[1].reactionKN - 50) < 1e-8);
  assert.ok(
    Math.abs(Math.max(...simplySupportedUniform.points.map((point) => Math.abs(point.momentKNm))) - 125) <
      1e-8,
  );
  assert.ok(
    Math.abs(
      Math.max(...simplySupportedUniform.points.map((point) => Math.abs(point.deflectionMm))) -
        6.510416666666667,
    ) < 1e-8,
  );

  const simplySupportedPoint = solveContinuousBeam({
    lengthM: 10,
    segments: [{ endM: 10, eiKNm2: 200_000 }],
    supports: [
      { id: "left", xM: 0, active: true },
      { id: "right", xM: 10, active: true },
    ],
    pointLoads: [{ xM: 5, forceKN: -100 }],
    outputStepM: 0.05,
    applySupportSpreading: false,
  });
  assert.equal(simplySupportedPoint.stable, true);
  assert.ok(Math.abs(simplySupportedPoint.reactions[0].reactionKN - 50) < 1e-8);
  assert.ok(Math.abs(simplySupportedPoint.reactions[1].reactionKN - 50) < 1e-8);
  assert.ok(
    Math.abs(Math.max(...simplySupportedPoint.points.map((point) => Math.abs(point.momentKNm))) - 250) <
      1e-8,
  );
  assert.ok(
    Math.abs(
      Math.max(...simplySupportedPoint.points.map((point) => Math.abs(point.deflectionMm))) -
        10.416666666666666,
    ) < 1e-8,
  );

  const changed = applySharedPins(
    applySharedX(applySharedSplit(applySharedAxleLines(model, 12), 4), 2.75),
    [3, 6],
  );
  assert.ok(changed.trailers.every((trailer) => trailer.axleLines === 12));
  assert.ok(changed.trailers.every((trailer) => trailer.xM === 2.75));
  assert.ok(changed.groupings.every((grouping) => grouping.splitAfterAxleLine === 4));
  assert.ok(changed.groupings.every((grouping) => grouping.pinnedAxleLines.join(",") === "3,6"));

  const relativeModel = createDefaultModel();
  relativeModel.trailers[0].placementReference = "ALL_INCLUSIVE_COG";
  relativeModel.trailers[0].offsetFromReference = { x: -2, y: -1 };
  const relativeResult = calculateProject(relativeModel);
  assert.ok(Number.isFinite(relativeResult.combinedCog.x));
  assert.ok(Number.isFinite(relativeResult.combinedCog.y));
  assert.notEqual(relativeResult.status, "ERROR");

  const optimiserModel = createDefaultModel();
  optimiserModel.optimiser.c89Start = 5;
  optimiserModel.optimiser.c89Maximum = 5;
  optimiserModel.optimiser.c89Step = 1;
  optimiserModel.optimiser.d138Start = 1;
  optimiserModel.optimiser.d138Step = 1;
  optimiserModel.optimiser.d138MaximumFraction = 0.2;
  optimiserModel.optimiser.e89RangeMode = "MANUAL";
  optimiserModel.optimiser.e89Minimum = 0;
  optimiserModel.optimiser.e89Maximum = 0;
  optimiserModel.optimiser.e89Step = 1;
  optimiserModel.optimiser.pinSearchMode = "OFF";
  const run = await runOptimiser(optimiserModel);
  assert.equal(run.state, "COMPLETE");
  assert.equal(run.progress.overallPercent, 100);
  assert.equal(run.passes.length, 1);
  assert.ok(run.events.length >= 3);

  const templatePath = path.join(
    root,
    "public",
    "templates",
    "Trailer_Stability_Verification_Template_v0.7.xlsm",
  );
  const template = new Uint8Array(await readFile(templatePath));
  const imported = await importWorkbook(
    new File([template], path.basename(templatePath), {
      type: "application/vnd.ms-excel.sheet.macroEnabled.12",
    }),
    createDefaultModel(),
  );
  assert.equal(imported.model.catalogue.length, 15);
  assert.ok(imported.model.catalogue.some((item) => item.name === "PEKZ G4"));
  assert.ok(imported.model.trailers.length > 0);
  assert.equal(imported.model.optimiser.c89Start, 30);
  assert.equal(imported.model.optimiser.c89Maximum, 36);
  assert.equal(imported.model.optimiser.c89Step, 2);
  assert.equal(imported.model.optimiser.e89Step, 2);
  assert.equal(imported.model.optimiser.e89RangeMode, "AUTO_GROUP_CENTRES");
  assert.equal(imported.model.optimiser.fineFirstPassReference, "R001-P006");
  assert.equal(imported.model.optimiser.fineSecondPassReference, "R001-P010");
  assert.equal(imported.model.optimiser.fineE89Step, 0.25);
  assert.equal(imported.model.optimiser.weights.axleLinesUsed, 0.5);
  const importedNativeResult = calculateProject(imported.model);
  assert.notEqual(importedNativeResult.status, "GEOMETRY_FAIL");
  assert.notEqual(importedNativeResult.status, "ERROR");
  const sourceWorkbook = XLSX.read(template, { type: "array", cellFormula: true });
  const missingSelectionWorkbook = XLSX.read(template, {
    type: "array",
    bookVBA: true,
    cellFormula: true,
  });
  missingSelectionWorkbook.Sheets["Load and Stability Calculation"].B89 = {
    t: "s",
    v: "MISSING TRAILER MODEL",
  };
  const missingSelectionBytes = XLSX.write(missingSelectionWorkbook, {
    type: "array",
    bookType: "xlsm",
    bookVBA: true,
  }) as ArrayBuffer;
  await assert.rejects(
    importWorkbook(
      new File([missingSelectionBytes], "missing-trailer.xlsm", {
        type: "application/vnd.ms-excel.sheet.macroEnabled.12",
      }),
      createDefaultModel(),
    ),
    /trailer preflight failed/i,
  );
  const sourceMain = sourceWorkbook.Sheets["Load and Stability Calculation"];
  const parityMetrics = {
    basicUtil: { workbook: Number(sourceMain.F503?.v), native: importedNativeResult.metrics.basicUtil.value },
    slopeUtil: { workbook: Number(sourceMain.F504?.v), native: importedNativeResult.metrics.slopeUtil.value },
    dynamicUtil: { workbook: Number(sourceMain.F505?.v), native: importedNativeResult.metrics.dynamicUtil.value },
    spineUtil: { workbook: Number(sourceMain.F506?.v), native: importedNativeResult.metrics.spineUtil.value },
    basicAngle: { workbook: Number(sourceMain.L503?.v), native: importedNativeResult.metrics.basicAngle.value },
    slopeAngle: { workbook: Number(sourceMain.L504?.v), native: importedNativeResult.metrics.slopeAngle.value },
    dynamicAngle: { workbook: Number(sourceMain.L505?.v), native: importedNativeResult.metrics.dynamicAngle.value },
    dynamicRatio: { workbook: Number(sourceMain.L506?.v), native: importedNativeResult.metrics.dynamicRatio.value },
  };
  assert.ok(Math.abs(Math.round((importedNativeResult.metrics.basicUtil.value ?? 0) * 100) / 100 - parityMetrics.basicUtil.workbook) < 1e-12);
  assert.ok(Math.abs(Math.round((importedNativeResult.metrics.slopeUtil.value ?? 0) * 100) / 100 - parityMetrics.slopeUtil.workbook) < 1e-12);
  assert.ok(Math.abs(Math.round((importedNativeResult.metrics.dynamicUtil.value ?? 0) * 100) / 100 - parityMetrics.dynamicUtil.workbook) < 1e-12);
  assert.ok(Math.abs((importedNativeResult.metrics.spineUtil.value ?? 0) - parityMetrics.spineUtil.workbook) < 1e-8);
  assert.ok(Math.abs((importedNativeResult.metrics.basicAngle.value ?? 0) - parityMetrics.basicAngle.workbook) < 1e-6);
  assert.ok(Math.abs(Math.round((importedNativeResult.metrics.slopeAngle.value ?? 0) * 10) / 10 - parityMetrics.slopeAngle.workbook) < 1e-12);
  assert.ok(Math.abs(Math.round((importedNativeResult.metrics.dynamicAngle.value ?? 0) * 10) / 10 - parityMetrics.dynamicAngle.workbook) < 1e-12);
  assert.ok(Math.abs(Math.round((importedNativeResult.metrics.dynamicRatio.value ?? 0) * 100) / 100 - parityMetrics.dynamicRatio.workbook) < 1e-12);
  assert.equal(importedNativeResult.supports[8]?.active, false);

  const alternateSpineCase = structuredClone(imported.model);
  alternateSpineCase.spineLoadCase = "A1";
  const alternateSpineResult = calculateProject(alternateSpineCase);
  assert.notEqual(alternateSpineResult.beam.bendingMaxKNm, importedNativeResult.beam.bendingMaxKNm);

  const loosePackingModel = structuredClone(imported.model);
  loosePackingModel.loosePacking = [
    { id: "loose-test", type: "Test slab", massT: 20, startXM: 5, endXM: 7 },
  ];
  const loosePackingResult = calculateProject(loosePackingModel);
  assert.notEqual(loosePackingResult.beam.bendingMaxKNm, importedNativeResult.beam.bendingMaxKNm);

  const exportModel = structuredClone(changed);
  exportModel.supports[0].allowed = false;
  exportModel.supports[0].active = false;
  exportModel.engineeringDegree = "Third";
  exportModel.weightCogReference = "WEIGHT-COG-REF-42";
  exportModel.referencePoint = "Rear-right datum";
  exportModel.environment.routeLongitudinalSlopeDeg = 4.5;
  exportModel.environment.longitudinalSlopeDeg = 1.25;
  exportModel.environment.routeTransverseSlopeDeg = 3.5;
  exportModel.environment.transverseSlopeDeg = 0.75;
  exportModel.analysedTrailer = 2;
  exportModel.spineLoadCase = "C2";
  exportModel.spineMeshSizeM = 0.031;
  exportModel.loosePacking = [
    { id: "lp-export", type: "Powerpack", massT: 12.5, startXM: 1.2, endXM: 3.8 },
  ];
  exportModel.catalogue.push({
    ...exportModel.catalogue[0],
    id: "custom-verification-trailer",
    name: "CUSTOM VERIFICATION TRAILER",
    category: "Custom",
  });
  const exported = await exportVerificationWorkbook(exportModel, arrayBuffer(template));
  const outputDirectory = path.join(root, "test-output");
  await mkdir(outputDirectory, { recursive: true });
  const outputPath = path.join(outputDirectory, "Trailer_Stability_Verification_Roundtrip.xlsm");
  await writeFile(outputPath, exported);

  const sourceArchive = unzipSync(template);
  const outputArchive = unzipSync(exported);
  assert.deepEqual(Object.keys(outputArchive).sort(), Object.keys(sourceArchive).sort());
  assert.ok(sourceArchive["xl/vbaProject.bin"]);
  assert.ok(outputArchive["xl/vbaProject.bin"]);
  assert.deepEqual(outputArchive["xl/vbaProject.bin"], sourceArchive["xl/vbaProject.bin"]);
  assert.match(text(outputArchive["xl/workbook.xml"]), /calcMode="auto"/);
  assert.match(text(outputArchive["xl/workbook.xml"]), /fullCalcOnLoad="1"/);
  const trailerTable = Object.entries(outputArchive)
    .filter(([name]) => name.startsWith("xl/tables/"))
    .map(([, value]) => text(value))
    .find((xml) => xml.includes('name="tblTrailerData"'));
  assert.ok(trailerTable);
  assert.match(trailerTable, /ref="A3:W19"/);

  const workbook = XLSX.read(exported, {
    type: "array",
    bookVBA: true,
    cellFormula: true,
    cellStyles: true,
  });
  const mainSheet = workbook.Sheets["Load and Stability Calculation"];
  assert.equal(mainSheet.F17.v, "Third");
  assert.equal(mainSheet.J22.v, "WEIGHT-COG-REF-42");
  assert.equal(mainSheet.D48.v, "Rear-right datum");
  assert.equal(mainSheet.C89.v, 12);
  assert.equal(formula(workbook, "Load and Stability Calculation", "C90"), "$C$89");
  assert.equal(mainSheet.D138.v, 4);
  assert.equal(formula(workbook, "Load and Stability Calculation", "D139"), "$D$138");
  assert.equal(mainSheet.E89.v, 2.75);
  assert.equal(formula(workbook, "Load and Stability Calculation", "E90"), "$E$89");
  assert.equal(mainSheet.G136.v, 3);
  assert.equal(mainSheet.H136.v, 6);
  assert.equal(formula(workbook, "Load and Stability Calculation", "G137"), "$G$136");
  assert.equal(formula(workbook, "Load and Stability Calculation", "H147"), "$H$136");
  assert.equal(mainSheet.F446.v, "no");
  assert.equal(mainSheet.I446.v, "no");
  assert.equal(mainSheet.D291.v, 4.5);
  assert.equal(mainSheet.E291.v, 1.25);
  assert.equal(mainSheet.D292.v, 3.5);
  assert.equal(mainSheet.E292.v, 0.75);
  assert.equal(mainSheet.F433.v, 2);
  assert.equal(mainSheet.F434.v, "C2");
  assert.equal(mainSheet.F435.v, 0.031);
  assert.equal(mainSheet.B439.v, "Powerpack");
  assert.equal(mainSheet.D439.v, 12.5);
  assert.equal(mainSheet.E439.v, 1.2);
  assert.equal(mainSheet.F439.v, 3.8);
  const controlSheet = workbook.Sheets.TS_CONTROL;
  assert.equal(controlSheet.B2.v, "STOP");
  assert.equal(controlSheet.B6.v, exportModel.optimiser.e89Step);
  assert.equal(controlSheet.B7.v, exportModel.optimiser.c89Maximum);
  assert.equal(controlSheet.B8.v, exportModel.optimiser.c89Start);
  assert.equal(controlSheet.B9.v, exportModel.optimiser.c89Step);
  assert.equal(controlSheet.B11.v, exportModel.optimiser.e89RangeMode);
  assert.equal(controlSheet.B35.v, exportModel.optimiser.weights.basicUtil);
  assert.equal(controlSheet.B42.v, exportModel.optimiser.weights.dynamicRatio);
  assert.equal(controlSheet.B58.v, exportModel.optimiser.weights.shearUtil);
  assert.equal(controlSheet.B73.v, exportModel.optimiser.weights.axleLinesUsed);
  assert.equal(workbook.Sheets.Database.A16.v, "PEKZ G4");
  assert.equal(workbook.Sheets.Database.A18.v, "PEKZ G4 M78 X24 D24 TL24");
  assert.equal(workbook.Sheets.Database.A19.v, "CUSTOM VERIFICATION TRAILER");
  assert.ok(workbook.vbaraw && workbook.vbaraw.byteLength > 0);
  const reimportedExport = await importWorkbook(
    new File([arrayBuffer(exported)], "Trailer_Stability_Verification_Roundtrip.xlsm", {
      type: "application/vnd.ms-excel.sheet.macroEnabled.12",
    }),
    createDefaultModel(),
  );
  assert.equal(reimportedExport.model.catalogue.length, 16);
  assert.equal(reimportedExport.model.engineeringDegree, "Third");
  assert.equal(reimportedExport.model.weightCogReference, "WEIGHT-COG-REF-42");
  assert.equal(reimportedExport.model.referencePoint, "Rear-right datum");
  assert.equal(reimportedExport.model.environment.routeLongitudinalSlopeDeg, 4.5);
  assert.equal(reimportedExport.model.environment.longitudinalSlopeDeg, 1.25);
  assert.equal(reimportedExport.model.environment.routeTransverseSlopeDeg, 3.5);
  assert.equal(reimportedExport.model.environment.transverseSlopeDeg, 0.75);
  assert.equal(reimportedExport.model.analysedTrailer, 2);
  assert.equal(reimportedExport.model.spineLoadCase, "C2");
  assert.equal(reimportedExport.model.spineMeshSizeM, 0.031);
  assert.equal(reimportedExport.model.supports[0].allowed, false);
  assert.equal(reimportedExport.model.supports[0].active, false);
  assert.deepEqual(reimportedExport.model.loosePacking[0], {
    id: "loose-packing-1",
    type: "Powerpack",
    massT: 12.5,
    startXM: 1.2,
    endXM: 3.8,
  });
  const staleTrailerLookups: Array<{ sheet: string; address: string; formula: string }> = [];
  for (const [sheetName, sheet] of Object.entries(workbook.Sheets)) {
    for (const [address, cell] of Object.entries(sheet)) {
      if (address.startsWith("!")) continue;
      const formulaText = typeof cell?.f === "string" ? cell.f : "";
      if (/Database!/i.test(formulaText) && /Database!.*\$(?:17|23|30|50)(?!\d)/i.test(formulaText)) {
        staleTrailerLookups.push({ sheet: sheetName, address, formula: formulaText });
      }
    }
  }
  assert.deepEqual(staleTrailerLookups, []);
  const workbookNames = new Map(
    (workbook.Workbook?.Names ?? []).map((item) => [String(item.Name), String(item.Ref)]),
  );
  assert.match(workbookNames.get("TrailerDataLookup") ?? "", /tblTrailerData/i);
  assert.match(workbookNames.get("TrailerTypeList") ?? "", /tblTrailerData/i);

  process.stdout.write(
    JSON.stringify(
      {
        engineStatus: result.status,
        totalMassT: result.totalMassT,
        groups: result.groups.length,
        axlePoints: result.axlePoints.length,
        beamPoints: result.beam.points.length,
        supportIterations: result.supportIterations,
        optimiserPasses: run.passes.length,
        catalogueRows: imported.model.catalogue.length,
        importedNativeStatus: importedNativeResult.status,
        importedNativeMassT: importedNativeResult.totalMassT,
        importedNativeCog: importedNativeResult.combinedCog,
        importedNativeGroups: importedNativeResult.groups.map((group) => ({
          group: group.group,
          x: group.point.x,
          y: group.point.y,
          axleCount: group.axleCount,
        })),
        parityMetrics,
        workbookOutput: outputPath,
        vbaBytes: workbook.vbaraw.byteLength,
      },
      null,
      2,
    ) + "\n",
  );
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
