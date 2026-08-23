import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { unzipSync, zipSync } from "fflate";
import * as XLSX from "xlsx";
import { createDefaultModel, hydrateProjectModel } from "../app/data/default-model";
import { solveContinuousBeam } from "../app/engine/beam";
import {
  LONGITUDINAL_ORIENTATION_ID,
  longitudinalEndForAxleLine,
} from "../app/engine/orientation";
import {
  applySharedAxleLines,
  applySharedPins,
  applySharedSplit,
  applySharedX,
  calculateProject,
  calculateStabilityProbe,
  engineeringLimitsFor,
  validateCatalogue,
} from "../app/engine/core";
import {
  cargoCogEnvelopeGuidance,
  derivedCargoCogEnvelopeInputs,
} from "../app/engine/cargo-envelope";
import {
  applyArrangementDescriptor,
  applyArrangementEnvironmentalActions,
  bestModuleComposition,
  collectArrangementIssues,
  createArrangementDescriptor,
  effectiveMaximumFormationWidth,
  formationPitchBounds,
  mathematicalPitchSeeds,
  MINIMUM_TRAIN_CLEARANCE_M,
  minimumTotalAxleLines,
  longitudinalOffsetCandidates,
  moduleCompositions,
  payloadCogX,
  recommendedPackingSupports,
  spacingCandidates,
  validAxleLineValues,
} from "../app/engine/arrangement";
import { quickArrangementRecommendations } from "../app/engine/arrangement-recommendations";
import { arrangementComparisons } from "../app/engine/arrangement-comparison";
import {
  optimiserDiagnosticJson,
  optimiserDiagnosticMarkdown,
} from "../app/engine/optimiser-diagnostics";
import { ROAD_SURFACES } from "../app/engine/road-transport";
import {
  deriveHydraulicYPitchBound,
  arrangementHydraulicModes,
  rankArrangementPasses,
  requiredHydraulicGroupYSpan,
  runArrangementOptimiser,
} from "../app/engine/arrangement-optimiser";
import {
  deriveEngineeringXInterval,
  deriveStabilityXInterval,
  deriveSupportXInterval,
  passToProject,
  runOptimiser,
} from "../app/engine/optimiser";
import {
  canRunOptimiserWizard,
  collectOptimiserWizardIssues,
  createOptimiserWizardDraftPayload,
  estimateOptimiserPlan,
  hydrateOptimiserWizardDraftPayload,
  optimiserStepCanContinue,
} from "../app/engine/optimiser-wizard";
import {
  applySharedLongitudinalPlacement,
  applyTrailerTransversePlacement,
  autoSpaceTrailers,
  canFinishSetup,
  collectSetupIssues,
  createBlankSetupModel,
  createWizardDraftPayload,
  hydrateWizardDraftPayload,
  setSharedPlacementReference,
  stepCanContinue,
} from "../app/engine/setup";
import { derivedCargoWindInputs } from "../app/engine/wind";
import type { ProjectModel } from "../app/engine/types";
import {
  exportVerificationWorkbook,
  importWorkbook,
  VERIFICATION_EXPORT_CONTRACT_VERSION,
  VERIFICATION_TEMPLATE_ASSET,
} from "../app/engine/workbook";
import { AUTOCAD_EXPORT_KEY, buildAutocadExport } from "../app/engine/autocad-export";
import { AUTOCAD_COMPACT_FORMAT, buildAutocadCompactExport } from "../app/engine/autocad-compact-export";
import { buildAutocadDxfExport } from "../app/engine/autocad-dxf-export";
import { buildCaseTextExport } from "../app/engine/case-text-export";
import { buildHandCalculation } from "../app/engine/hand-calculation";
import { updateModelField } from "../app/components/workbench/model-update";

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
  assert.equal(model.schemaVersion, 3);
  assert.deepEqual(arrangementHydraulicModes(model), ["THREE_POINT", "FOUR_POINT"]);
  assert.equal(model.longitudinalOrientation, LONGITUDINAL_ORIENTATION_ID);
  assert.equal(model.hydraulicSystemMode, "THREE_POINT");
  assert.equal(ROAD_SURFACES.find((item) => item.id === "ASPHALT")?.dryFriction, 0.8);
  assert.equal(ROAD_SURFACES.find((item) => item.id === "STEEL")?.wetFriction, 0.1);
  assert.equal(ROAD_SURFACES.find((item) => item.id === "SAND")?.rollingResistance, 0.3);

  const reducedActionModel = structuredClone(model);
  reducedActionModel.arrangementOptimiser.allowReducedEnvironmentalActions = true;
  reducedActionModel.arrangementOptimiser.searchWindSpeedMps = 10;
  reducedActionModel.arrangementOptimiser.searchLongitudinalAccelerationMps2 = 0.3;
  reducedActionModel.arrangementOptimiser.searchTransverseAccelerationMps2 = 0.1;
  const reducedActions = applyArrangementEnvironmentalActions(reducedActionModel);
  assert.equal(reducedActions.reduced, true);
  assert.equal(reducedActions.model.engineeringDegree, "Third");
  assert.equal(reducedActions.model.environment.windSpeedMps, 10);

  const roadModel = structuredClone(model);
  roadModel.roadTransport.enabled = true;
  const roadResult = calculateProject(roadModel).roadTransport;
  assert.equal(roadResult.enabled, true);
  assert.equal(roadResult.frictionCoefficient, 0.8);
  assert.equal(roadResult.rollingResistanceCoefficient, 0.01);
  assert.equal(roadResult.moduleCount, 4);
  assert.ok(roadResult.tractionMechanicalLimitKN > 0);
  assert.ok(roadResult.brakingMechanicalLimitKN > 0);
  assert.match(roadResult.source, /validated road-surface/i);

  const fourPointModel = structuredClone(model);
  fourPointModel.hydraulicSystemMode = "FOUR_POINT";
  fourPointModel.cargo.massT = 100;
  fourPointModel.cargo.heightM = 5;
  fourPointModel.cargo.cog.z = 2.5;
  fourPointModel.trailers[0].yM = 1;
  fourPointModel.trailers[1].yM = 4.5;
  fourPointModel.groupings[0].cornerGroups = {
    rearLeft: 1, rearRight: 1, frontLeft: 3, frontRight: 3,
  };
  fourPointModel.groupings[1].cornerGroups = {
    rearLeft: 2, rearRight: 2, frontLeft: 4, frontRight: 4,
  };
  const fourPointResult = calculateProject(fourPointModel);
  assert.deepEqual(fourPointResult.groups.map((group) => group.group), [1, 2, 3, 4]);
  assert.equal(fourPointResult.groupingQuality.boundaryPointCount, 4);
  assert.ok(fourPointResult.groupingQuality.polygonAreaM2 > 0);
  assert.ok(Math.abs(fourPointResult.groups.reduce((sum, group) => sum + group.loadT, 0) - fourPointResult.totalMassT) < 1e-7);
  assert.ok(Math.abs(fourPointResult.groups.reduce((sum, group) => sum + group.loadT * group.point.x, 0) - fourPointResult.totalMassT * fourPointResult.combinedCog.x) < 1e-6);
  assert.ok(Math.abs(fourPointResult.groups.reduce((sum, group) => sum + group.loadT * group.point.y, 0) - fourPointResult.totalMassT * fourPointResult.combinedCog.y) < 1e-6);
  assert.equal(fourPointResult.stabilityReferences.cargoOnlyPass, false);
  assert.equal(fourPointResult.stabilityReferences.combinedCogPassOnly, true);
  assert.ok(fourPointResult.warnings.some((warning) => warning.startsWith("COMBINED COG PASS ONLY:")));
  assert.equal(fourPointResult.groundBearing.groups.length, 4);
  assert.ok(fourPointResult.groundBearing.groups.every((group) =>
    group.activeBogies > 0 && group.activeAxleLines > 0 && (group.pressureTPerM2 ?? 0) > 0));

  const packingDatumModel = structuredClone(model);
  packingDatumModel.trailerDeckHeightM = 1.5;
  packingDatumModel.packing.heightM = 0.6;
  packingDatumModel.packing.cog.z = 0.3;
  packingDatumModel.cargo.cog.z = 2;
  const packingDatumResult = calculateProject(packingDatumModel);
  assert.equal(packingDatumResult.componentCogs.packing.z, 1.8);
  assert.equal(packingDatumResult.componentCogs.cargo.z, 4.1);

  const cadExport = buildAutocadExport(model, calculateProject(model), "2026-08-13T00:00:00.000Z");
  assert.equal(cadExport.format, "TRAILER-STABILITY-CAD-DATA");
  assert.equal(cadExport.keyId, AUTOCAD_EXPORT_KEY.keyId);
  assert.equal(cadExport.data.c && typeof cadExport.data.c, "object");
  assert.equal((cadExport.data.en as { ws: number }).ws, model.environment.windSpeedMps);
  assert.equal((cadExport.data.r as { st: string }).st, calculateProject(model).status);
  const cadResultData = cadExport.data.r as {
    gb: { g: Array<{ g: number; p: number }>; o: number };
    hp: Array<{ g: number; n: number; a: number; b: number; c: number; e: number }>;
    sm: { tsw: number; ppw: number; ab: number; gbp: number };
  };
  assert.equal(cadResultData.gb.g.length, calculateProject(model).groups.length);
  assert.ok(cadResultData.gb.o > 0);
  assert.equal(cadResultData.hp.length, calculateProject(model).groups.length);
  assert.ok(cadResultData.sm.tsw > 0);
  assert.ok(cadResultData.sm.ppw > 0);
  assert.equal(cadResultData.sm.ab, calculateProject(model).groundBearing.totalActiveBogies);
  assert.equal(cadResultData.sm.gbp, calculateProject(model).groundBearing.overallTPerM2);
  const cadResolvedTrailers = (cadExport.data.r as { rv: Array<{ startXM: number; centreYM: number; lengthM: number; widthM: number }> }).rv;
  assert.equal(cadResolvedTrailers.length, model.trailers.length);
  assert.ok(cadResolvedTrailers.every((trailer) => trailer.lengthM > 0 && trailer.widthM > 0 && Number.isFinite(trailer.startXM) && Number.isFinite(trailer.centreYM)));
  assert.ok((cadExport.data.eng as { methods: unknown[] }).methods.length >= 10);
  const directDxf = buildAutocadDxfExport(model, calculateProject(model));
  assert.match(directDxf, /^0\nSECTION\n2\nHEADER\n/);
  assert.match(directDxf, /TS_TRAILERS/);
  assert.match(directDxf, /Trailer Stability/);
  assert.match(directDxf, /0\nEOF\n$/);
  const compactResult = calculateProject(model);
  const compactCad = buildAutocadCompactExport(model, compactResult, "2026-08-21T09:30:00.000Z");
  const compactCadLines = compactCad.trim().split(/\r?\n/);
  assert.equal(compactCadLines[0], `${AUTOCAD_COMPACT_FORMAT}|1|MM-T-KN-DEG|REAR-LOW-X`);
  assert.equal(compactCadLines.filter((item) => item.startsWith("TRAILER|")).length, compactResult.resolvedTrailers.length);
  assert.equal(compactCadLines.filter((item) => item.startsWith("HYDRAULIC|")).length, compactResult.resolvedTrailers.length);
  assert.equal(compactCadLines.filter((item) => item.startsWith("GROUP|")).length, compactResult.groups.length);
  assert.equal(compactCadLines.filter((item) => item.startsWith("BOUNDARY|")).length, compactResult.stabilityPolygon.length);
  const loadFields = compactCadLines.find((item) => item.startsWith("LOAD|"))!.split("|");
  assert.equal(Number(loadFields[9]), model.cargo.cog.z * 1000);
  const resultFields = compactCadLines.find((item) => item.startsWith("RESULT|"))!.split("|");
  assert.equal(Number(resultFields[5]), Number(loadFields[10]));
  assert.equal(Number(resultFields[6]), Number(loadFields[11]));
  const firstGroupFields = compactCadLines.find((item) => item.startsWith("GROUP|"))!.split("|");
  const pressureDefinition = model.catalogue.find((item) => item.id === model.trailers[compactResult.resolvedTrailers[0].index].definitionId)!;
  assert.ok(pressureDefinition.massBelowCylinderT !== null && pressureDefinition.factor !== null);
  const expectedWorkbookPressure = Math.max(
    0,
    compactResult.stabilityLoads.neutral[0] / compactResult.groups[0].axleCount - pressureDefinition.massBelowCylinderT,
  ) * pressureDefinition.factor;
  assert.ok(Math.abs(Number(firstGroupFields[4]) - expectedWorkbookPressure) < 1e-6);
  const expectedCaseAPressure = Math.max(
    0,
    compactResult.stabilityLoads.basic[1][0] / compactResult.groups[0].axleCount - pressureDefinition.massBelowCylinderT,
  ) * pressureDefinition.factor;
  assert.ok(Math.abs(Number(firstGroupFields[5]) - expectedCaseAPressure) < 1e-6);
  assert.ok(Math.abs(Number(firstGroupFields[9]) - compactResult.groundBearing.groups[0].maximumEnvelopeAxleLineLoadT!) < 1e-6);
  assert.ok(Math.abs(Number(firstGroupFields[11]) - compactResult.groundBearing.groups[0].neutralAxleLineLoadT!) < 1e-6);
  assert.ok(Math.abs(Number(firstGroupFields[13]) - compactResult.groundBearing.groups[0].pressureTPerM2!) < 1e-6);
  const summaryFields = compactCadLines.find((item) => item.startsWith("SUMMARY|"))!.split("|");
  assert.equal(Number(summaryFields[3]), compactResult.groundBearing.totalActiveBogies);
  assert.ok(Math.abs(Number(summaryFields[7]) - compactResult.groundBearing.overallTPerM2!) < 1e-6);
  const firstDefinition = model.catalogue.find((item) => item.id === model.trailers[0].definitionId)!;
  const expectedOverallGbp = compactResult.totalMassT /
    (compactResult.groundBearing.totalActiveBogies * firstDefinition.trailerWidthM * firstDefinition.axleSpacingM / 2);
  assert.ok(Math.abs(compactResult.groundBearing.overallTPerM2! - expectedOverallGbp) < 1e-10);

  const fourPointCompactCad = buildAutocadCompactExport(fourPointModel, fourPointResult, "2026-08-21T09:30:00.000Z");
  assert.equal(fourPointCompactCad.split(/\r?\n/).filter((item) => item.startsWith("GROUP|")).length, 4);
  assert.equal(fourPointCompactCad.split(/\r?\n/).filter((item) => item.startsWith("BOUNDARY|")).length, 4);
  assert.match(compactCadLines.at(-1) ?? "", /^END\|/);
  assert.doesNotMatch(compactCad, /[{}\[\]"]/);
  const caseText = buildCaseTextExport(model, calculateProject(model), "2026-08-14T12:00:00.000Z");
  assert.match(caseText, /TRAILER STABILITY — CASE RECORD/);
  assert.match(caseText, /RESOLVED TRAILERS/);
  assert.match(caseText, /CALCULATION REFERENCE/);

  // TS-012: every case starts from all eligible supports active, removes the
  // full deterministic batch of prohibited reactions, recalculates, and
  // retains the raw reaction and complete state-transition evidence.
  const supportSettlementModel = createDefaultModel();
  const supportLocations = [
    2.0384396372828633,
    2.4475483012385664,
    6.2395687701180576,
    7.109401272190734,
  ];
  supportSettlementModel.supports = supportLocations.map((xM, index) => ({
    id: `settle-support-${index + 1}`,
    xM,
    widthM: 0.5,
    allowed: true,
    active: index !== 0,
    positiveConnectionToDeck: false,
  }));
  const settled = calculateProject(supportSettlementModel);
  assert.equal(settled.supportSettlement.converged, true);
  assert.equal(settled.supportSettlement.outcome, "SETTLED");
  assert.equal(settled.supportSettlement.calculationCount, 2);
  assert.equal(settled.supportIterations, 2);
  assert.equal(settled.activeSupportCount, 2);
  assert.deepEqual(
    settled.supportSettlement.steps[0].transitions.map((transition) => [transition.supportId, transition.reason]),
    [["settle-support-1", "RESET_ELIGIBLE"]],
  );
  assert.ok(settled.supportSettlement.steps[0].reactions.every((reaction) =>
    reaction.reactionT === null && reaction.outcome === "NOT_CALCULATED"));
  assert.deepEqual(
    settled.supportSettlement.steps[1].transitions.map((transition) => transition.supportId),
    ["settle-support-1", "settle-support-3"],
  );
  assert.equal(settled.supportSettlement.steps[2].transitions.length, 0);
  assert.deepEqual(
    settled.supportSettlement.steps[2].activeSupportIdsAfter,
    ["settle-support-2", "settle-support-4"],
  );
  const disabledByReaction = settled.supports.filter((support) => support.disableReason === "NEGATIVE_REACTION");
  assert.deepEqual(disabledByReaction.map((support) => support.id), ["settle-support-1", "settle-support-3"]);
  assert.ok(disabledByReaction.every((support) => !support.active && support.reactionT < 0));
  assert.ok(settled.supports.filter((support) => support.active).every((support) => support.reactionT >= -settled.supportSettlement.reactionToleranceT));
  const settledAgain = calculateProject(structuredClone(supportSettlementModel));
  assert.deepEqual(
    settledAgain.supportSettlement.steps.map((step) => ({
      stage: step.stage,
      before: step.activeSupportIdsBefore,
      transitions: step.transitions,
      after: step.activeSupportIdsAfter,
    })),
    settled.supportSettlement.steps.map((step) => ({
      stage: step.stage,
      before: step.activeSupportIdsBefore,
      transitions: step.transitions,
      after: step.activeSupportIdsAfter,
    })),
  );

  const retainedTensionModel = structuredClone(supportSettlementModel);
  retainedTensionModel.supports = retainedTensionModel.supports.map((support, index) => ({
    ...support,
    positiveConnectionToDeck: index === 0 || index === 2,
  }));
  const retainedTension = calculateProject(retainedTensionModel);
  assert.equal(retainedTension.supportSettlement.converged, true);
  assert.equal(retainedTension.supportIterations, 1);
  assert.equal(retainedTension.activeSupportCount, 4);
  assert.deepEqual(
    retainedTension.supports.filter((support) => support.reactionState === "TENSION_RESTRAINED").map((support) => support.id),
    ["settle-support-1", "settle-support-3"],
  );
  assert.ok(retainedTension.supports.filter((support) => support.reactionState === "TENSION_RESTRAINED").every((support) => support.reactionT < 0 && support.positiveConnectionToDeck));
  assert.ok(retainedTension.warnings.some((warning) => warning.startsWith("POSITIVE CONNECTION REQUIRED:")));
  assert.ok(collectSetupIssues(retainedTensionModel, retainedTension).some((item) => item.id === "positive-support-connections" && item.severity === "warning"));
  retainedTensionModel.optimiser.minimumActiveSupports = 5;
  assert.equal(calculateProject(retainedTensionModel).supportSettlement.outcome, "INSUFFICIENT_SUPPORTS");

  const supportCad = buildAutocadExport(retainedTensionModel, retainedTension, "2026-08-23T12:00:00.000Z");
  const supportCadInputs = supportCad.data.su as Array<{ pc: boolean; rs: string; rt: number }>;
  const supportCadResult = supportCad.data.r as { se: typeof retainedTension.supportSettlement };
  assert.equal(supportCadInputs[0].pc, true);
  assert.equal(supportCadInputs[0].rs, "TENSION_RESTRAINED");
  assert.ok(supportCadInputs[0].rt < 0);
  assert.deepEqual(supportCadResult.se.steps, retainedTension.supportSettlement.steps);
  const supportCompact = buildAutocadCompactExport(retainedTensionModel, retainedTension, "2026-08-23T12:00:00.000Z");
  const supportCompactFields = supportCompact.split(/\r?\n/).find((line) => line.startsWith("SUPPORT|1|"))!.split("|");
  assert.equal(supportCompactFields[7], "1");
  assert.equal(supportCompactFields[8], "TENSION_RESTRAINED");
  assert.equal(supportCompactFields[9], "");
  const supportCaseText = buildCaseTextExport(retainedTensionModel, retainedTension, "2026-08-23T12:00:00.000Z");
  assert.match(supportCaseText, /Support settlement trace:/);
  assert.match(supportCaseText, /TENSION_RESTRAINED/);

  const staggerTemplates = longitudinalOffsetCandidates(
    { ...model.arrangementOptimiser, formationMode: "ALLOW_STAGGERED", maximumLongitudinalStaggerM: 4, longitudinalStaggerSamples: 1 },
    2,
  );
  assert.deepEqual(staggerTemplates[0], [0, 0]);
  assert.ok(staggerTemplates.some((offsets) => Math.abs(offsets[1] - offsets[0]) === 4));
  const staggerDefinition = model.catalogue.find((item) => item.id === model.arrangementOptimiser.trailerDefinitionId)!;
  const staggerComposition = bestModuleComposition(8, model.arrangementOptimiser, 2)!;
  const staggerDescriptor = createArrangementDescriptor(
    staggerDefinition,
    model.arrangementOptimiser,
    2,
    staggerComposition,
    3,
    [-2, 2],
  );
  assert.equal(staggerDescriptor.formationMode, "STAGGERED");
  const staggeredModel = applySharedX(applyArrangementDescriptor(model, staggerDescriptor), 10);
  assert.equal(staggeredModel.trailers[1].xM - staggeredModel.trailers[0].xM, 4);
  assert.equal(longitudinalEndForAxleLine(1, 2), "rear");
  assert.equal(longitudinalEndForAxleLine(3, 2), "front");
  const migratedV1 = hydrateProjectModel({
    ...structuredClone(model),
    schemaVersion: 1,
    packing: {
      massT: model.packing.massT,
      heightM: model.packing.heightM,
      cog: model.packing.cog,
    },
  });
  assert.equal(migratedV1.schemaVersion, 3);
  assert.equal(migratedV1.packing.footprint.mode, "CARGO_ESTIMATE");
  assert.equal(migratedV1.packing.footprint.lengthM, model.cargo.lengthM);
  const legacyOrientation = structuredClone(model) as Partial<typeof model>;
  delete legacyOrientation.longitudinalOrientation;
  const legacyRearGroup = model.groupings[0].cornerGroups?.rearLeft;
  legacyOrientation.groupings![0].cornerGroups = {
    frontLeft: legacyRearGroup ?? 1,
    frontRight: model.groupings[0].cornerGroups?.rearRight ?? 1,
    rearLeft: model.groupings[0].cornerGroups?.frontLeft ?? 1,
    rearRight: model.groupings[0].cornerGroups?.frontRight ?? 1,
  };
  const migratedOrientation = hydrateProjectModel(legacyOrientation);
  assert.equal(
    migratedOrientation.groupings[0].cornerGroups?.rearLeft,
    model.groupings[0].cornerGroups?.rearLeft,
  );
  assert.equal(
    migratedOrientation.groupings[0].cornerGroups?.frontLeft,
    model.groupings[0].cornerGroups?.frontLeft,
  );
  const draftPayload = createWizardDraftPayload("packing", migratedV1, "CURRENT", "2026-07-28T12:00:00.000Z");
  const hydratedDraft = hydrateWizardDraftPayload(JSON.parse(JSON.stringify(draftPayload)));
  assert.ok(hydratedDraft);
  assert.equal(hydratedDraft.step, "packing");
  assert.equal(hydratedDraft.model.schemaVersion, 3);
  assert.equal(hydratedDraft.updatedAt, "2026-07-28T12:00:00.000Z");
  assert.deepEqual(validateCatalogue(model.catalogue), []);
  assert.equal(model.catalogue.length, 15);
  assert.ok(model.catalogue.some((item) => item.name === "PEKZ G4"));
  assert.ok(model.catalogue.some((item) => item.name === "PEKZ G4 M78 X24 D24 TL24"));
  assert.equal(model.cargo.autoWindFromCargo, true);
  assert.equal(model.cargo.autoCogEnvelopeFromCargo, true);
  assert.deepEqual(derivedCargoCogEnvelopeInputs(model.cargo), {
    envelopeX: model.cargo.lengthM * 0.025,
    envelopeY: model.cargo.widthM * 0.025,
  });
  assert.equal(model.cargo.envelopeX, model.cargo.lengthM * 0.025);
  assert.equal(model.cargo.envelopeY, model.cargo.widthM * 0.025);

  const smallEnvelopeCargo = {
    ...model.cargo,
    lengthM: 3.99,
    widthM: 4,
    envelopeX: 0,
    envelopeY: 0,
  };
  assert.deepEqual(derivedCargoCogEnvelopeInputs(smallEnvelopeCargo), {
    envelopeX: 0.1,
    envelopeY: 0.1,
  });
  const smallEnvelopeGuidance = cargoCogEnvelopeGuidance({
    ...smallEnvelopeCargo,
    ...derivedCargoCogEnvelopeInputs(smallEnvelopeCargo),
  });
  assert.equal(smallEnvelopeGuidance.x.automaticMinimumApplied, true);
  assert.equal(smallEnvelopeGuidance.y.automaticMinimumApplied, false);
  assert.equal(smallEnvelopeGuidance.warnings.length, 1);
  assert.match(smallEnvelopeGuidance.warnings[0], /0\.100 m minimum/);

  const largeEnvelopeCargo = {
    ...model.cargo,
    lengthM: 30,
    widthM: 40,
    envelopeX: 0,
    envelopeY: 0,
  };
  assert.deepEqual(derivedCargoCogEnvelopeInputs(largeEnvelopeCargo), {
    envelopeX: 0.75,
    envelopeY: 1,
  });
  const manualBelowAdvised = {
    ...largeEnvelopeCargo,
    autoCogEnvelopeFromCargo: false,
    envelopeX: 0.59,
    envelopeY: 0.79,
  };
  assert.equal(cargoCogEnvelopeGuidance(manualBelowAdvised).warnings.length, 2);
  const manualEnvelopeModel = structuredClone(model);
  manualEnvelopeModel.cargo = manualBelowAdvised;
  assert.ok(collectSetupIssues(manualEnvelopeModel, calculateProject(manualEnvelopeModel)).some((item) => item.id.startsWith("cargo-envelope-guidance-") && item.severity === "warning"));
  assert.ok(collectArrangementIssues(manualEnvelopeModel, manualEnvelopeModel.arrangementOptimiser).some((item) => item.id.startsWith("cargo-envelope-guidance-") && item.severity === "warning"));

  const manualBelowAbsolute = structuredClone(manualEnvelopeModel);
  manualBelowAbsolute.cargo.envelopeX = 0.05;
  manualBelowAbsolute.cargo.envelopeY = 0.09;
  const belowAbsoluteGuidance = cargoCogEnvelopeGuidance(manualBelowAbsolute.cargo);
  assert.equal(belowAbsoluteGuidance.warnings.length, 2);
  assert.ok(belowAbsoluteGuidance.warnings.every((warning) => /explicit override is not advised/.test(warning)));
  assert.ok(calculateProject(manualBelowAbsolute).warnings.some((warning) => /below the 0\.100 m minimum/.test(warning)));

  const negativeEnvelope = structuredClone(manualEnvelopeModel);
  negativeEnvelope.cargo.envelopeX = -0.01;
  assert.ok(collectSetupIssues(negativeEnvelope, calculateProject(negativeEnvelope)).some((item) => item.id === "cargo-envelope-negative" && item.severity === "blocking"));
  assert.ok(collectArrangementIssues(negativeEnvelope, negativeEnvelope.arrangementOptimiser).some((item) => item.id === "cargo-envelope-negative" && item.severity === "blocking"));

  const automaticFloorModel = structuredClone(model);
  automaticFloorModel.cargo.lengthM = 3.99;
  automaticFloorModel.cargo.widthM = 4;
  automaticFloorModel.cargo.cog = { x: 1.995, y: 2, z: 2 };
  automaticFloorModel.cargo.envelopeX = 999;
  automaticFloorModel.cargo.envelopeY = 999;
  assert.ok(calculateProject(automaticFloorModel).warnings.some((warning) => /Automatic X COG envelope uses the 0\.100 m minimum/.test(warning)));
  const detailEditedAutomatic = updateModelField(model, "cargo.lengthM", 20);
  assert.equal(detailEditedAutomatic.cargo.envelopeX, 0.5);
  const detailManualMode = updateModelField(model, "cargo.autoCogEnvelopeFromCargo", false);
  const detailEditedManual = updateModelField(detailManualMode, "cargo.envelopeX", 0.08);
  assert.equal(detailEditedManual.cargo.envelopeX, 0.08);
  assert.equal(model.arrangementOptimiser.preferredCentreSpacingM, 2.9);
  assert.equal(model.arrangementOptimiser.minimumClearanceM, MINIMUM_TRAIN_CLEARANCE_M);
  assert.equal(model.arrangementOptimiser.searchMode, "MATHEMATICAL_BRANCH_BOUND");
  assert.equal(model.arrangementOptimiser.enforceMaximumFormationWidth, false);
  assert.equal(model.arrangementOptimiser.searchMaximumFormationWidthM, 30);
  assert.equal(model.arrangementOptimiser.limitFormationWidthToCargo, false);
  assert.deepEqual(derivedCargoWindInputs(model.cargo), {
    sideWindAreaM2: model.cargo.lengthM * model.cargo.heightM,
    frontWindAreaM2: model.cargo.widthM * model.cargo.heightM,
    sideWindHeightM: model.cargo.heightM / 2,
    frontWindHeightM: model.cargo.heightM / 2,
  });

  const arrangementSettings = structuredClone(model.arrangementOptimiser);
  arrangementSettings.maximumAxleLinesPerTrain = 20;
  assert.equal(bestModuleComposition(7, arrangementSettings), null);
  assert.deepEqual(bestModuleComposition(8, arrangementSettings), {
    modules4: 2,
    modules5: 0,
    modules6: 0,
    axleLines: 8,
    moduleCount: 2,
  });
  assert.equal(moduleCompositions(9, arrangementSettings)[0]?.modules4, 1);
  assert.equal(moduleCompositions(9, arrangementSettings)[0]?.modules5, 1);
  assert.deepEqual(
    validAxleLineValues(arrangementSettings, 1, 4).slice(0, 6).map((item) => item.axleLines),
    [4, 5, 6, 8, 9, 10],
  );
  const selectedArrangementDefinition = model.catalogue.find(
    (item) => item.id === arrangementSettings.trailerDefinitionId,
  )!;
  const preferredPitches = spacingCandidates(selectedArrangementDefinition, arrangementSettings, 2);
  assert.ok(Math.abs(preferredPitches[0] - 2.9) < 1e-9);
  assert.ok(preferredPitches.some((value) => Math.abs(value - 2.9) < 1e-9));
  assert.ok(preferredPitches.some((value) => Math.abs(value - 2.9) > 1e-9));
  const pitchBounds = formationPitchBounds(selectedArrangementDefinition, arrangementSettings, 2);
  assert.ok(pitchBounds);
  assert.ok(Math.abs(pitchBounds.minimumPitchM - (selectedArrangementDefinition.trailerWidthM + MINIMUM_TRAIN_CLEARANCE_M)) < 1e-9);
  assert.ok(Math.abs(pitchBounds.preferredPitchM - 2.9) < 1e-9);
  assert.equal(pitchBounds.effectiveMaximumFormationWidthM, 30);
  assert.equal(effectiveMaximumFormationWidth(arrangementSettings, 9), Number.POSITIVE_INFINITY);
  const pitchSeeds = mathematicalPitchSeeds(selectedArrangementDefinition, arrangementSettings, 2);
  assert.equal(pitchSeeds.length, 2);
  assert.ok(Math.abs(pitchSeeds[0] - pitchBounds.preferredPitchM) < 1e-9);
  assert.ok(Math.abs(pitchSeeds[1] - pitchBounds.maximumPitchM) < 1e-9);
  const cargoLimitedSettings = {
    ...arrangementSettings,
    limitFormationWidthToCargo: true,
    maximumFormationWidthM: 15,
  };
  assert.equal(effectiveMaximumFormationWidth(cargoLimitedSettings, 9), 9);
  const cargoLimitedBounds = formationPitchBounds(
    selectedArrangementDefinition,
    cargoLimitedSettings,
    2,
    9,
  );
  assert.ok(cargoLimitedBounds);
  assert.equal(cargoLimitedBounds.effectiveMaximumFormationWidthM, 9);
  assert.ok(
    selectedArrangementDefinition.trailerWidthM + cargoLimitedBounds.maximumPitchM <=
      9 + 1e-9,
  );
  assert.equal(
    formationPitchBounds(
      selectedArrangementDefinition,
      cargoLimitedSettings,
      2,
      model.cargo.widthM,
    ),
    null,
  );
  assert.ok(
    collectArrangementIssues(
      {
        ...model,
        arrangementOptimiser: {
          ...model.arrangementOptimiser,
          limitFormationWidthToCargo: true,
          minimumTrains: 2,
        },
      },
      {
        ...model.arrangementOptimiser,
        limitFormationWidthToCargo: true,
        minimumTrains: 2,
      },
    ).some((issue) => issue.id === "minimum-formation-width"),
  );
  const capacityBoundModel = structuredClone(model);
  capacityBoundModel.cargo.massT = 100;
  capacityBoundModel.packing.massT = 10;
  capacityBoundModel.loosePacking = [{ id: "capacity-packing", type: "Packing", massT: 5, startXM: 0, endXM: 1 }];
  capacityBoundModel.optimiser.maximumAxleUtilisation = 0.8;
  arrangementSettings.ppuPosition = "FRONT";
  const expectedCapacityBound = Math.max(
    4,
    Math.ceil(
      (115 + 2 * (selectedArrangementDefinition.ppuWeightT ?? 0)) /
        (selectedArrangementDefinition.axleCapacityT * 0.8 - selectedArrangementDefinition.axleWeightT),
    ),
  );
  assert.equal(minimumTotalAxleLines(capacityBoundModel, arrangementSettings, 2), expectedCapacityBound);
  arrangementSettings.ppuPosition = "BOTH";
  const expectedBothPpuCapacityBound = Math.max(
    4,
    Math.ceil(
      (115 + 4 * (selectedArrangementDefinition.ppuWeightT ?? 0)) /
        (selectedArrangementDefinition.axleCapacityT * 0.8 - selectedArrangementDefinition.axleWeightT),
    ),
  );
  assert.equal(minimumTotalAxleLines(capacityBoundModel, arrangementSettings, 2), expectedBothPpuCapacityBound);
  const referenceRecommendationModel = createDefaultModel();
  const referenceDefinition = referenceRecommendationModel.catalogue.find(
    (item) => item.id === referenceRecommendationModel.arrangementOptimiser.trailerDefinitionId,
  )!;
  const referenceNetCapacityT =
    referenceDefinition.axleCapacityT - referenceDefinition.axleWeightT;
  referenceRecommendationModel.cargo.massT = referenceNetCapacityT * 186.5;
  referenceRecommendationModel.cargo.lengthM = 30;
  referenceRecommendationModel.cargo.widthM = 40;
  referenceRecommendationModel.cargo.heightM = 60;
  referenceRecommendationModel.cargo.cog = { x: 15, y: 20, z: 30 };
  referenceRecommendationModel.packing.massT = 0;
  referenceRecommendationModel.loosePacking = [];
  referenceRecommendationModel.optimiser.maximumAxleUtilisation = 1;
  referenceRecommendationModel.arrangementOptimiser = {
    ...referenceRecommendationModel.arrangementOptimiser,
    minimumTrains: 4,
    maximumTrains: 4,
    maximumAxleLinesPerTrain: 99,
    limitModuleAvailability: false,
    ppuPosition: "NONE",
  };
  const referenceRecommendations = quickArrangementRecommendations(referenceRecommendationModel);
  assert.equal(referenceRecommendations.payloadMassT, referenceRecommendationModel.cargo.massT);
  assert.equal(
    referenceRecommendations.payloadOnlyLowerBoundAL,
    Math.max(4, Math.ceil(referenceRecommendationModel.cargo.massT / referenceDefinition.axleCapacityT)),
  );
  assert.equal(referenceRecommendations.capacityLowerBoundAL, 187);
  assert.equal(referenceRecommendations.firstBuildableTotalAL, 188);
  assert.deepEqual(referenceRecommendations.capacityRecommendation && {
    trains: referenceRecommendations.capacityRecommendation.trainCount,
    axleLinesPerTrain: referenceRecommendations.capacityRecommendation.axleLinesPerTrain,
    totalAxleLines: referenceRecommendations.capacityRecommendation.totalAxleLines,
  }, { trains: 4, axleLinesPerTrain: 47, totalAxleLines: 188 });
  assert.equal(referenceRecommendations.exactVerificationRequired, true);
  assert.deepEqual(
    referenceRecommendations.recommendations.map((item) => item.kind),
    ["AL_FIRST", "TRAIN_FIRST", "BALANCED"],
  );
  assert.ok(referenceRecommendations.screenedCandidateCount > 0);
  arrangementSettings.limitModuleAvailability = true;
  arrangementSettings.available4AxleModules = 3;
  arrangementSettings.available5AxleModules = 0;
  arrangementSettings.available6AxleModules = 0;
  assert.equal(bestModuleComposition(8, arrangementSettings, 2), null);
  arrangementSettings.limitModuleAvailability = false;
  arrangementSettings.ppuPosition = "BOTH";
  const descriptor = createArrangementDescriptor(
    selectedArrangementDefinition,
    arrangementSettings,
    3,
    bestModuleComposition(8, arrangementSettings, 3)!,
    2.9,
  );
  const arrangedModel = applyArrangementDescriptor(model, descriptor);
  assert.equal(arrangedModel.trailers.length, 3);
  assert.equal(arrangedModel.groupings.length, 3);
  assert.deepEqual(
    arrangedModel.trailers.map((trailer) => trailer.offsetFromReference.y),
    [-2.9, 0, 2.9],
  );
  assert.ok(arrangedModel.trailers.every((trailer) => trailer.axleLines === 8));
  assert.ok(arrangedModel.trailers.every((trailer) => trailer.placementReference === "ALL_INCLUSIVE_COG"));
  assert.ok(arrangedModel.trailers.every((trailer) => trailer.ppuLeft && trailer.ppuRight));
  assert.equal(collectArrangementIssues(model, model.arrangementOptimiser).length, 0);

  const offsetSupportModel = createDefaultModel();
  offsetSupportModel.cargo.lengthM = 16;
  offsetSupportModel.cargo.massT = 300;
  offsetSupportModel.cargo.cog.x = 15;
  offsetSupportModel.packing.massT = 0;
  offsetSupportModel.supports = [2.4, 4.8, 7.2, 9.6].map((xM, index) => ({
    id: `offset-support-${index + 1}`,
    xM,
    widthM: 0.5,
    allowed: true,
    active: true,
  }));
  assert.equal(payloadCogX(offsetSupportModel), 15);
  assert.ok(
    collectArrangementIssues(offsetSupportModel, offsetSupportModel.arrangementOptimiser)
      .some((item) => item.id === "support-cog-bracketing"),
  );
  const recommendedSupports = recommendedPackingSupports(offsetSupportModel);
  assert.equal(recommendedSupports.length, 4);
  assert.ok(Math.min(...recommendedSupports.map((item) => item.xM)) < payloadCogX(offsetSupportModel));
  assert.ok(Math.max(...recommendedSupports.map((item) => item.xM)) > payloadCogX(offsetSupportModel));
  offsetSupportModel.supports = recommendedSupports;
  assert.ok(
    !collectArrangementIssues(offsetSupportModel, offsetSupportModel.arrangementOptimiser)
      .some((item) => item.id === "support-cog-bracketing"),
  );
  const sixRecommendedSupports = recommendedPackingSupports(offsetSupportModel, 0.5, 6);
  assert.equal(sixRecommendedSupports.length, 6);
  assert.ok(sixRecommendedSupports.every((support, index, supports) => index === 0 || support.xM > supports[index - 1].xM));

  const compactArrangementSearch = createDefaultModel();
  compactArrangementSearch.cargo.massT = 20;
  compactArrangementSearch.packing.massT = 0;
  compactArrangementSearch.loosePacking = [];
  compactArrangementSearch.supports = [
    { id: "arrangement-support-1", xM: 5.0, widthM: 0.5, allowed: true, active: true },
    { id: "arrangement-support-2", xM: 5.7, widthM: 0.5, allowed: true, active: true },
    { id: "arrangement-support-3", xM: 6.4, widthM: 0.5, allowed: true, active: true },
    { id: "arrangement-support-4", xM: 7.1, widthM: 0.5, allowed: true, active: true },
  ];
  compactArrangementSearch.environment = {
    ...compactArrangementSearch.environment,
    routeLongitudinalSlopeDeg: 0,
    routeTransverseSlopeDeg: 0,
    longitudinalSlopeDeg: 0,
    transverseSlopeDeg: 0,
    longitudinalAccelerationMps2: 0,
    transverseAccelerationMps2: 0,
    windSpeedMps: 0,
  };
  compactArrangementSearch.arrangementOptimiser = {
    ...compactArrangementSearch.arrangementOptimiser,
    limitFormationWidthToCargo: true,
    minimumTrains: 2,
    maximumTrains: 2,
    maximumAxleLinesPerTrain: 4,
    maximumFormationWidthM: 15,
    spacingSamples: 2,
  };
  compactArrangementSearch.cargo.widthM = 9;
  compactArrangementSearch.cargo.cog.y = 4.5;
  compactArrangementSearch.cargo.envelopeY = 0.18;
  compactArrangementSearch.optimiser = {
    ...compactArrangementSearch.optimiser,
    d138Start: 1,
    d138Step: 1,
    d138MaximumFraction: 0.25,
    e89Step: 0.5,
    pinSearchMode: "OFF",
    deflectionCheck: "OFF",
    minimumActiveSupports: 1,
  };
  const compactRecommendations = quickArrangementRecommendations(compactArrangementSearch);
  assert.equal(compactRecommendations.exactVerificationRequired, true);
  assert.ok(compactRecommendations.recommendations.every((item) => item.candidate));
  compactRecommendations.recommendations.forEach((item) => {
    const recommendation = item.candidate!;
    const descriptor = recommendation.descriptor;
    assert.equal(
      descriptor.modules4 * 4 + descriptor.modules5 * 5 + descriptor.modules6 * 6,
      descriptor.axleLinesPerTrain,
    );
    assert.equal(descriptor.axleLinesPerTrain * descriptor.trainCount, descriptor.totalAxleLines);
    assert.equal(recommendation.provisionalPass, true);
  });
  const arrangementRun = await runArrangementOptimiser(compactArrangementSearch);
  assert.equal(arrangementRun.state, "COMPLETE");
  assert.ok(arrangementRun.passes.length > 0);
  assert.ok(arrangementRun.passes.every((pass) => pass.arrangement?.trainCount === 2));
  assert.ok(arrangementRun.passes.every((pass) => pass.arrangement?.axleLinesPerTrain === 4));
  assert.ok(
    arrangementRun.passes.every(
      (pass) => !pass.arrangement || pass.arrangement.overallWidthM <= compactArrangementSearch.cargo.widthM + 1e-9,
    ),
  );
  assert.ok(arrangementRun.events.some((item) => item.detail.includes("Mathematical branch-and-bound")));
  assert.ok(arrangementRun.events.some((item) => item.message === "Hydraulic systems scheduled"));
  assert.deepEqual(
    [...new Set(arrangementRun.passes.map((pass) => pass.arrangement?.hydraulicSystemMode).filter(Boolean))].sort(),
    ["FOUR_POINT", "THREE_POINT"],
    "The default automatic arrangement search evaluates both hydraulic systems.",
  );
  assert.ok(arrangementRun.events.some((item) => item.message === "Winning formation fully verified"));
  const mathematicalBest = arrangementRun.passes.find((pass) => pass.overallRank === 1);
  assert.ok(mathematicalBest?.arrangement);
  assert.ok(
    arrangementRun.passes
      .filter((pass) => pass.result.status === "PASS")
      .every((pass) => pass.result.beam.points.length > 0),
    "A stability-only planning probe must never be retained as an authoritative PASS.",
  );
  assert.equal(mathematicalBest.arrangement.trainCount, 2);
  assert.equal(mathematicalBest.arrangement.totalAxleLines, 8);
  const comparisonSearch = structuredClone(compactArrangementSearch);
  comparisonSearch.arrangementOptimiser.maximumTrains = 5;
  comparisonSearch.arrangementOptimiser.limitFormationWidthToCargo = false;
  comparisonSearch.arrangementOptimiser.maximumFormationWidthM = 20;
  comparisonSearch.arrangementOptimiser.searchMaximumFormationWidthM = 20;
  const comparisonRun = await runArrangementOptimiser(comparisonSearch);
  const comparisonTrainCounts = [...new Set(
    comparisonRun.passes
      .filter((pass) => pass.result.status === "PASS" && pass.arrangement)
      .map((pass) => pass.arrangement!.trainCount),
  )].sort((left, right) => left - right);
  assert.deepEqual(
    comparisonTrainCounts,
    [2, 3, 4, 5],
    "A mathematical search should retain one exact alternative for four permitted train counts.",
  );
  const comparisonBest = comparisonRun.passes.find((pass) => pass.overallRank === 1);
  assert.ok(comparisonBest?.arrangement);
  assert.equal(
    comparisonBest.arrangement.totalAxleLines,
    Math.min(...comparisonRun.passes
      .filter((pass) => pass.result.status === "PASS" && pass.arrangement)
      .map((pass) => pass.arrangement!.totalAxleLines)),
    "Total axle lines must remain the primary arrangement objective.",
  );
  const appliedFourPointPass = arrangementRun.passes.find(
    (pass) => pass.arrangement?.hydraulicSystemMode === "FOUR_POINT",
  );
  assert.ok(appliedFourPointPass);
  assert.equal(
    passToProject(compactArrangementSearch, appliedFourPointPass).hydraulicSystemMode,
    "FOUR_POINT",
    "Applying a four-point result must also apply its hydraulic mode.",
  );
  const compactFourPointSearch = structuredClone(compactArrangementSearch);
  compactFourPointSearch.hydraulicSystemMode = "FOUR_POINT";
  compactFourPointSearch.arrangementOptimiser.hydraulicSearchMode = "FOUR_POINT";
  const fourPointArrangementRun = await runArrangementOptimiser(compactFourPointSearch);
  const fourPointArrangementBest = fourPointArrangementRun.passes.find((pass) => pass.overallRank === 1);
  assert.equal(fourPointArrangementRun.state, "COMPLETE");
  assert.ok(fourPointArrangementRun.passes.length > 0);
  assert.ok(fourPointArrangementBest);
  assert.equal(fourPointArrangementBest.result.stabilityPolygon.length, 4);
  assert.equal(fourPointArrangementBest.result.groups.length, 4);
  const legacyArrangementSearch = structuredClone(compactArrangementSearch);
  legacyArrangementSearch.arrangementOptimiser.searchMode = "LEGACY_GRID";
  const legacyArrangementRun = await runArrangementOptimiser(legacyArrangementSearch);
  assert.equal(legacyArrangementRun.state, "COMPLETE");
  assert.ok(legacyArrangementRun.passes.length > 0);
  assert.ok(legacyArrangementRun.events.some((item) => item.detail.includes("Legacy grid search")));
  const legacyBest = legacyArrangementRun.passes.find((pass) => pass.overallRank === 1);
  assert.ok(arrangementRun.passes.length < legacyArrangementRun.passes.length);
  assert.equal(mathematicalBest.arrangement.trainCount, legacyBest?.arrangement?.trainCount);
  assert.equal(mathematicalBest.arrangement.totalAxleLines, legacyBest?.arrangement?.totalAxleLines);
  const intervalProbe = applyArrangementDescriptor(compactArrangementSearch, mathematicalBest.arrangement);
  const splitProbe = applySharedSplit(intervalProbe, mathematicalBest.d138);
  const fullProbe0 = calculateProject(applySharedX(splitProbe, 0));
  const fullProbe1 = calculateProject(applySharedX(splitProbe, 1));
  const stabilityProbe0 = calculateStabilityProbe(applySharedX(splitProbe, 0));
  const stabilityProbe1 = calculateStabilityProbe(applySharedX(splitProbe, 1));
  assert.deepEqual(stabilityProbe0.stabilityLoads, fullProbe0.stabilityLoads);
  assert.deepEqual(stabilityProbe1.stabilityLoads, fullProbe1.stabilityLoads);
  for (const key of [
    "basicUtil",
    "slopeUtil",
    "dynamicUtil",
    "basicAngle",
    "slopeAngle",
    "dynamicAngle",
    "dynamicRatio",
  ] as const) {
    assert.equal(stabilityProbe0.metrics[key].value, fullProbe0.metrics[key].value);
    assert.equal(stabilityProbe1.metrics[key].value, fullProbe1.metrics[key].value);
  }
  assert.equal(stabilityProbe0.beam.points.length, 0);
  const interval = deriveStabilityXInterval(stabilityProbe0, stabilityProbe1);
  assert.ok(interval);
  assert.ok(interval.minimumM <= interval.maximumM);
  const supportInterval = deriveSupportXInterval(
    compactArrangementSearch,
    stabilityProbe0,
    stabilityProbe1,
  );
  assert.ok(supportInterval);
  assert.ok(supportInterval.minimumM <= supportInterval.maximumM);
  const engineeringInterval = deriveEngineeringXInterval(
    compactArrangementSearch,
    stabilityProbe0,
    stabilityProbe1,
  );
  assert.ok(engineeringInterval);
  assert.ok(engineeringInterval.minimumM <= engineeringInterval.maximumM);
  const appliedArrangement = passToProject(compactArrangementSearch, arrangementRun.passes[0]);
  assert.equal(appliedArrangement.trailers.length, 2);
  assert.ok(appliedArrangement.trailers.every((trailer) => trailer.axleLines === 4));
  assert.ok(appliedArrangement.trailers.every((trailer) => trailer.placementReference === "ALL_INCLUSIVE_COG"));

  const longSpineModel = createDefaultModel();
  longSpineModel.cargo = {
    ...longSpineModel.cargo,
    lengthM: 25,
    widthM: 16,
    heightM: 16,
    massT: 100,
    cog: { x: 12.5, y: 8, z: 8 },
  };
  longSpineModel.packing.massT = 0;
  longSpineModel.supports = recommendedPackingSupports(longSpineModel);
  longSpineModel.arrangementOptimiser = {
    ...longSpineModel.arrangementOptimiser,
    trailerDefinitionId: "k2400-st",
    ppuPosition: "REAR",
  };
  const longSpineDefinition = longSpineModel.catalogue.find((item) => item.id === "k2400-st")!;
  const longSpineComposition = bestModuleComposition(14, longSpineModel.arrangementOptimiser, 2)!;
  let longSpineArranged = applyArrangementDescriptor(
    longSpineModel,
    createArrangementDescriptor(
      longSpineDefinition,
      longSpineModel.arrangementOptimiser,
      2,
      longSpineComposition,
      27.57,
    ),
  );
  longSpineArranged = applySharedSplit(longSpineArranged, 5);
  longSpineArranged = applySharedX(longSpineArranged, -8.81);
  const longSpineResult = calculateProject(longSpineArranged);
  assert.ok(!longSpineResult.warnings.some((warning) => warning.includes("stiffness matrix is singular")));
  assert.ok(longSpineResult.supportIterations > 0);
  assert.ok(longSpineResult.beam.points.length > 0);
  const preferredCandidate = structuredClone(arrangementRun.passes[0]);
  preferredCandidate.sequence = 2;
  preferredCandidate.result.status = "PASS";
  preferredCandidate.arrangement!.pitchM = 2.9;
  const widerCandidate = structuredClone(preferredCandidate);
  widerCandidate.id = `${preferredCandidate.id}-WIDE`;
  widerCandidate.sequence = 1;
  widerCandidate.arrangement!.pitchM = 3.5;
  rankArrangementPasses([widerCandidate, preferredCandidate], compactArrangementSearch);
  assert.equal(preferredCandidate.overallRank, 1);
  assert.equal(widerCandidate.overallRank, 2);

  const fewerAxlesAcrossTrains = structuredClone(preferredCandidate);
  fewerAxlesAcrossTrains.id = `${preferredCandidate.id}-TWO-TRAIN-8-AL`;
  fewerAxlesAcrossTrains.sequence = 1;
  fewerAxlesAcrossTrains.arrangement = {
    ...fewerAxlesAcrossTrains.arrangement!,
    trainCount: 2,
    axleLinesPerTrain: 4,
    totalAxleLines: 8,
  };
  const oneTrainMoreAxles = structuredClone(fewerAxlesAcrossTrains);
  oneTrainMoreAxles.id = `${preferredCandidate.id}-ONE-TRAIN-12-AL`;
  oneTrainMoreAxles.sequence = 2;
  oneTrainMoreAxles.arrangement = {
    ...oneTrainMoreAxles.arrangement!,
    trainCount: 1,
    axleLinesPerTrain: 12,
    totalAxleLines: 12,
    pitchM: 0,
  };
  rankArrangementPasses([oneTrainMoreAxles, fewerAxlesAcrossTrains], compactArrangementSearch);
  assert.equal(
    fewerAxlesAcrossTrains.overallRank,
    1,
    "A multi-train formation with fewer total axle lines must beat a one-train formation with more axle lines.",
  );
  assert.equal(oneTrainMoreAxles.overallRank, 2);

  const cargoOnlyCandidate = structuredClone(preferredCandidate);
  cargoOnlyCandidate.id = `${preferredCandidate.id}-CARGO-ONLY`;
  cargoOnlyCandidate.sequence = 2;
  cargoOnlyCandidate.result.stabilityReferences.cargoOnlyPass = true;
  cargoOnlyCandidate.result.stabilityReferences.combinedCogRequired = false;
  cargoOnlyCandidate.result.stabilityReferences.combinedCogPassOnly = false;
  const combinedOnlyCandidate = structuredClone(cargoOnlyCandidate);
  combinedOnlyCandidate.id = `${preferredCandidate.id}-COMBINED-ONLY`;
  combinedOnlyCandidate.sequence = 1;
  combinedOnlyCandidate.result.stabilityReferences.cargoOnlyPass = false;
  combinedOnlyCandidate.result.stabilityReferences.combinedCogRequired = true;
  combinedOnlyCandidate.result.stabilityReferences.combinedCogPassOnly = true;
  rankArrangementPasses([combinedOnlyCandidate, cargoOnlyCandidate], compactArrangementSearch);
  assert.equal(cargoOnlyCandidate.overallRank, 1, "A cargo-only pass is preferred at equal train and axle counts.");
  assert.equal(combinedOnlyCandidate.overallRank, 2);

  const trainFirstModel = structuredClone(compactArrangementSearch);
  trainFirstModel.arrangementOptimiser.objectivePresetName = "Minimum fleet";
  trainFirstModel.arrangementOptimiser.objectiveOrder = [
    "MIN_TRAINS",
    "MIN_TOTAL_AXLE_LINES",
    ...trainFirstModel.arrangementOptimiser.objectiveOrder.filter((objective) => objective !== "MIN_TRAINS" && objective !== "MIN_TOTAL_AXLE_LINES"),
  ];
  rankArrangementPasses([oneTrainMoreAxles, fewerAxlesAcrossTrains], trainFirstModel);
  assert.equal(oneTrainMoreAxles.overallRank, 1, "A saved train-first objective order must be authoritative between exact PASS candidates.");
  const comparisons = arrangementComparisons([oneTrainMoreAxles, fewerAxlesAcrossTrains], trainFirstModel);
  assert.equal(comparisons.length, 3);
  assert.equal(comparisons.find((item) => item.kind === "AL_FIRST")?.pass.id, fewerAxlesAcrossTrains.id);
  assert.equal(comparisons.find((item) => item.kind === "TRAIN_FIRST")?.pass.id, oneTrainMoreAxles.id);
  const failedComparison = structuredClone(oneTrainMoreAxles);
  failedComparison.id = "FAILED-CANNOT-RANK";
  failedComparison.result.status = "NOK_FAIL";
  failedComparison.arrangement!.totalAxleLines = 4;
  assert.ok(arrangementComparisons([failedComparison, fewerAxlesAcrossTrains], trainFirstModel).every((item) => item.pass.id !== failedComparison.id), "Engineering failures must never enter Pareto comparisons.");

  const diagnosticMarkdown = optimiserDiagnosticMarkdown(comparisonRun, comparisonSearch);
  const diagnosticJson = JSON.parse(optimiserDiagnosticJson(comparisonRun, comparisonSearch)) as { format: string; startModel: ProjectModel; run: typeof comparisonRun };
  assert.match(diagnosticMarkdown, /# Arrangement search audit/);
  assert.match(diagnosticMarkdown, /## Chronological activity/);
  assert.match(diagnosticMarkdown, /Objective order:/);
  assert.equal(diagnosticJson.format, "trailer-stability-optimiser-audit");
  assert.equal(diagnosticJson.run.events.length, comparisonRun.events.length);
  assert.equal(diagnosticJson.run.passes.length, comparisonRun.passes.length);
  assert.equal(diagnosticJson.startModel.supports.length, comparisonSearch.supports.length);

  const largeCargoSearch = createDefaultModel();
  largeCargoSearch.cargo = {
    ...largeCargoSearch.cargo,
    name: "25 m x 16 m x 16 m overhanging cargo",
    lengthM: 25,
    widthM: 16,
    heightM: 16,
    extremeX: 0,
    extremeY: 0,
    massT: 100,
    cog: { x: 12.5, y: 8, z: 8 },
    autoWindFromCargo: true,
    sideWindAreaM2: 400,
    frontWindAreaM2: 256,
    sideWindHeightM: 8,
    frontWindHeightM: 8,
    autoCogEnvelopeFromCargo: true,
    envelopeX: 0.5,
    envelopeY: 0.32,
  };
  largeCargoSearch.packing.massT = 0;
  largeCargoSearch.loosePacking = [];
  // This is the retained 15 s mathematical-bound benchmark. The separate
  // compact search above verifies the default BOTH hydraulic policy; fixing
  // this benchmark to one explicit system keeps its historical runtime target
  // comparable while still exercising the same bound path.
  largeCargoSearch.arrangementOptimiser.hydraulicSearchMode = "THREE_POINT";
  largeCargoSearch.supports = largeCargoSearch.supports.map((support, index) => ({
    ...support,
    xM: 5 * (index + 1),
    allowed: true,
  }));
  assert.equal(
    collectArrangementIssues(
      largeCargoSearch,
      largeCargoSearch.arrangementOptimiser,
    ).some((issue) => issue.severity === "blocking"),
    false,
    "Cargo may legitimately overhang the selected trailer formation in X and Y.",
  );
  const largeDefinition = largeCargoSearch.catalogue.find(
    (item) => item.id === largeCargoSearch.arrangementOptimiser.trailerDefinitionId,
  )!;
  const largeComposition = bestModuleComposition(
    44,
    largeCargoSearch.arrangementOptimiser,
    1,
  )!;
  const singleTrainBounds = formationPitchBounds(
    largeDefinition,
    largeCargoSearch.arrangementOptimiser,
    1,
  )!;
  const singleTrainResult = calculateProject(
    applyArrangementDescriptor(
      largeCargoSearch,
      createArrangementDescriptor(
        largeDefinition,
        largeCargoSearch.arrangementOptimiser,
        1,
        largeComposition,
        0,
      ),
    ),
  );
  const singleTrainYBound = deriveHydraulicYPitchBound(
    largeCargoSearch,
    singleTrainBounds.minimumPitchM,
    singleTrainBounds.maximumPitchM,
    singleTrainResult,
    singleTrainResult,
  );
  assert.ok(requiredHydraulicGroupYSpan(largeCargoSearch, singleTrainResult) > 0);
  assert.equal(singleTrainYBound.feasible, false);
  assert.ok(singleTrainYBound.requiredSpanM > singleTrainYBound.maximumAvailableSpanM);
  const largeSearchStarted = performance.now();
  const largeCargoRun = await runArrangementOptimiser(largeCargoSearch);
  const largeSearchDurationMs = performance.now() - largeSearchStarted;
  assert.equal(largeCargoRun.state, "COMPLETE");
  assert.ok(largeSearchDurationMs < 15_000);
  // Exact pitch-boundary convergence intentionally adds a small number of
  // fully logged cases after the independent seeds; it must remain bounded.
  assert.ok(largeCargoRun.passes.length < 1_500);
  assert.ok(
    largeCargoRun.events.some(
      (item) => item.message === "Nearest passing pitch converged",
    ),
  );
  assert.ok(
    largeCargoRun.events.some(
      (item) => item.message === "Hydraulic Y-span bound rejected formation",
    ),
  );
  assert.ok(
    largeCargoRun.events.some(
      (item) => item.message === "Maximum axle formation failed necessary gates",
    ),
  );
  assert.equal(
    largeCargoRun.events.some(
      (item) => item.message === "Reduced probes found no pass",
    ),
    false,
  );
  const rejectedLargeCases = largeCargoRun.passes.filter(
    (pass) => pass.result.status !== "PASS",
  );
  const compactRejectedProbes = rejectedLargeCases.filter(
    (pass) =>
      pass.result.beam.points.length === 0 &&
      pass.result.axlePoints.length === 0 &&
      pass.result.spineAxlePoints.length === 0,
  );
  const detailedRejectedCases = rejectedLargeCases.length - compactRejectedProbes.length;
  // Exact load-ratio/capacity intervals may now remove all compact rejected
  // probes before evaluation. Any retained detailed failures must stay small.
  assert.ok(detailedRejectedCases < 200);

  const blankSetup = createBlankSetupModel();
  assert.equal(blankSetup.trailers.length, 0);
  assert.equal(blankSetup.groupings.length, 0);
  assert.equal(blankSetup.supports.length, 0);
  assert.equal(blankSetup.cargo.lengthM, 0);
  assert.equal(blankSetup.cargo.autoWindFromCargo, true);
  assert.equal(blankSetup.cargo.autoCogEnvelopeFromCargo, true);
  assert.equal(blankSetup.cargo.envelopeX, 0);
  assert.equal(blankSetup.cargo.envelopeY, 0);
  assert.equal(calculateProject(blankSetup).status, "ERROR");
  const hydratedBlankSetup = hydrateProjectModel(blankSetup);
  assert.equal(hydratedBlankSetup.trailers.length, 0);
  assert.equal(hydratedBlankSetup.groupings.length, 0);
  assert.equal(hydratedBlankSetup.supports.length, 0);

  const autoWind = createDefaultModel();
  autoWind.cargo.lengthM = 12;
  autoWind.cargo.widthM = 5;
  autoWind.cargo.heightM = 4;
  autoWind.cargo.sideWindAreaM2 = 999;
  autoWind.cargo.frontWindAreaM2 = 999;
  autoWind.cargo.sideWindHeightM = 999;
  autoWind.cargo.frontWindHeightM = 999;
  const autoWindResult = calculateProject(autoWind);
  const manualWind = structuredClone(autoWind);
  manualWind.cargo.autoWindFromCargo = false;
  Object.assign(manualWind.cargo, derivedCargoWindInputs(manualWind.cargo));
  const manualWindResult = calculateProject(manualWind);
  assert.ok(Math.abs(autoWindResult.analysis.windShift.x - manualWindResult.analysis.windShift.x) < 1e-12);
  assert.ok(Math.abs(autoWindResult.analysis.windShift.y - manualWindResult.analysis.windShift.y) < 1e-12);

  const autoEnvelope = createDefaultModel();
  autoEnvelope.cargo.lengthM = 12;
  autoEnvelope.cargo.widthM = 5;
  autoEnvelope.cargo.envelopeX = 999;
  autoEnvelope.cargo.envelopeY = 999;
  const autoEnvelopeResult = calculateProject(autoEnvelope);
  const manualEnvelope = structuredClone(autoEnvelope);
  manualEnvelope.cargo.autoCogEnvelopeFromCargo = false;
  Object.assign(manualEnvelope.cargo, derivedCargoCogEnvelopeInputs(manualEnvelope.cargo));
  const manualEnvelopeResult = calculateProject(manualEnvelope);
  assert.deepEqual(autoEnvelopeResult.casePoints.basic, manualEnvelopeResult.casePoints.basic);
  const automaticEnvelopeValues = derivedCargoCogEnvelopeInputs(autoEnvelope.cargo);
  const automaticEnvelopeCad = buildAutocadExport(autoEnvelope, autoEnvelopeResult, "2026-08-23T12:00:00.000Z");
  const automaticEnvelopeCadCargo = automaticEnvelopeCad.data.cg as { exn: number; eyn: number };
  assert.equal(automaticEnvelopeCadCargo.exn, automaticEnvelopeValues.envelopeX);
  assert.equal(automaticEnvelopeCadCargo.eyn, automaticEnvelopeValues.envelopeY);
  const automaticEnvelopeCompactLoad = buildAutocadCompactExport(autoEnvelope, autoEnvelopeResult, "2026-08-23T12:00:00.000Z")
    .split(/\r?\n/)
    .find((line) => line.startsWith("LOAD|"))!
    .split("|");
  assert.ok(Math.abs(Number(automaticEnvelopeCompactLoad[10]) - automaticEnvelopeValues.envelopeX * 1000) < 1e-9);
  assert.ok(Math.abs(Number(automaticEnvelopeCompactLoad[11]) - automaticEnvelopeValues.envelopeY * 1000) < 1e-9);
  const automaticEnvelopeText = buildCaseTextExport(autoEnvelope, autoEnvelopeResult, "2026-08-23T12:00:00.000Z");
  assert.match(automaticEnvelopeText, /COG envelope: \+\/- 0\.300 m X, \+\/- 0\.125 m Y \(automatic: 2\.5% with 0\.100 m minimum\)/);
  assert.doesNotMatch(automaticEnvelopeText, /999\.000 m/);

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
  assert.equal(
    result.metrics.axleLinesUsed.value,
    model.trailers.filter((trailer) => trailer.enabled).reduce((sum, trailer) => sum + trailer.axleLines, 0),
  );
  assert.ok(result.supportIterations >= 1);
  assert.equal(result.stabilityReferences.cargoDynamicAngle.active, true);
  assert.equal(
    result.stabilityReferences.cargoOnlyPass,
    [
      result.stabilityReferences.cargoBasicAngle,
      result.stabilityReferences.cargoSlopeAngle,
      result.stabilityReferences.cargoDynamicAngle,
    ].every((item) => item.status === "OK"),
  );
  assert.equal(result.stabilityReferences.combinedCogRequired, !result.stabilityReferences.cargoOnlyPass);
  const handCalculation = buildHandCalculation(model, result, "2026-08-21T12:00:00.000Z");
  assert.deepEqual(
    handCalculation.sections.map((section) => section.id),
    ["basis", "mass-cog", "actions", "hydraulics", "stability", "supports", "beam", "traction", "conclusion"],
  );
  assert.match(handCalculation.latex, /^\\documentclass\[11pt,a4paper\]\{article\}/);
  assert.match(handCalculation.latex, /Spine-beam shear, bending and deflection/);
  assert.match(handCalculation.latex, /Road-transport traction and braking/);
  assert.match(handCalculation.latex, /\\frac\{\\sum_i m_i x_i\}/);
  assert.doesNotMatch(handCalculation.latex, /(?:NaN|Infinity)/);
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
    rearLeft: 1,
    rearRight: 1,
    frontLeft: 2,
    frontRight: 2,
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

  const spaced = autoSpaceTrailers(createDefaultModel(), 0.05);
  const spacedResult = calculateProject(spaced);
  assert.equal(spacedResult.trailerOverlaps.length, 0);
  const firstWidth = spaced.catalogue.find(
    (definition) => definition.id === spaced.trailers[0].definitionId,
  )?.trailerWidthM ?? 0;
  const secondWidth = spaced.catalogue.find(
    (definition) => definition.id === spaced.trailers[1].definitionId,
  )?.trailerWidthM ?? 0;
  assert.ok(
    Math.abs(
      Math.abs(spaced.trailers[1].yM - spaced.trailers[0].yM) -
        (firstWidth / 2 + secondWidth / 2 + 0.05),
    ) < 1e-10,
  );
  const touching = autoSpaceTrailers(createDefaultModel(), 0);
  assert.equal(calculateProject(touching).trailerOverlaps.length, 0);

  const absolutePositions = spacedResult.resolvedTrailers.map((trailer) => ({
    index: trailer.index,
    x: trailer.startXM,
    y: trailer.centreYM,
  }));
  const allInclusiveRelative = setSharedPlacementReference(
    spaced,
    spacedResult,
    "ALL_INCLUSIVE_COG",
  );
  assert.ok(allInclusiveRelative.trailers.every((trailer) => trailer.placementReference === "ALL_INCLUSIVE_COG"));
  const allInclusiveResult = calculateProject(allInclusiveRelative);
  for (const expected of absolutePositions) {
    const actual = allInclusiveResult.resolvedTrailers.find((trailer) => trailer.index === expected.index);
    assert.ok(actual);
    assert.ok(Math.abs(actual.startXM - expected.x) < 1e-8);
    assert.ok(Math.abs(actual.centreYM - expected.y) < 1e-8);
  }
  const relativeMoved = applyTrailerTransversePlacement(
    applySharedLongitudinalPlacement(allInclusiveRelative, -3.25),
    1,
    2.5,
  );
  assert.ok(relativeMoved.trailers.every((trailer) => trailer.offsetFromReference.x === -3.25));
  assert.equal(relativeMoved.trailers[1].offsetFromReference.y, 2.5);

  const setupIssues = collectSetupIssues(spaced, spacedResult);
  assert.equal(setupIssues.filter((item) => item.severity === "blocking").length, 0);
  assert.equal(canFinishSetup(setupIssues), true);
  assert.equal(stepCanContinue(setupIssues, "trailers"), true);
  const oneGroup = structuredClone(spaced);
  oneGroup.groupings = oneGroup.groupings.map((grouping) => ({
    ...grouping,
    cornerGroups: { frontLeft: 1, frontRight: 1, rearLeft: 1, rearRight: 1 },
  }));
  const oneGroupIssues = collectSetupIssues(oneGroup, calculateProject(oneGroup));
  assert.ok(oneGroupIssues.some((item) => item.id === "triangle" && item.severity === "blocking"));
  const tooFewSupports = structuredClone(spaced);
  tooFewSupports.optimiser.minimumActiveSupports = 5;
  const tooFewSupportIssues = collectSetupIssues(tooFewSupports, calculateProject(tooFewSupports));
  assert.ok(tooFewSupportIssues.some((item) => item.id === "settled-supports"));

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

  const optimiserWizardModel = createDefaultModel();
  const optimiserWizardResult = calculateProject(optimiserWizardModel);
  const optimiserWizardPlan = estimateOptimiserPlan(optimiserWizardModel);
  assert.ok(optimiserWizardPlan.axleLineValues > 0);
  assert.ok(optimiserWizardPlan.splitValues > 0);
  assert.ok(optimiserWizardPlan.coarseCases > 0);
  assert.ok(
    optimiserWizardPlan.totalCasesUpper >= optimiserWizardPlan.coarseCases,
  );
  const optimiserWizardIssues = collectOptimiserWizardIssues(
    optimiserWizardModel,
    optimiserWizardModel.optimiser,
    optimiserWizardResult,
  );
  assert.equal(
    optimiserStepCanContinue(optimiserWizardIssues, "coarse"),
    true,
  );
  assert.equal(canRunOptimiserWizard(optimiserWizardIssues), true);
  const optimiserWizardDraft = createOptimiserWizardDraftPayload(
    "pins",
    optimiserWizardModel.optimiser,
    "2026-07-29T12:00:00.000Z",
  );
  const hydratedOptimiserWizardDraft =
    hydrateOptimiserWizardDraftPayload(
      optimiserWizardDraft,
      createDefaultModel().optimiser,
    );
  assert.equal(hydratedOptimiserWizardDraft?.step, "pins");
  assert.equal(
    hydratedOptimiserWizardDraft?.settings.pinSearchMode,
    optimiserWizardModel.optimiser.pinSearchMode,
  );
  const invalidOptimiserSettings = structuredClone(
    optimiserWizardModel.optimiser,
  );
  invalidOptimiserSettings.c89Maximum = invalidOptimiserSettings.c89Start - 1;
  const invalidOptimiserIssues = collectOptimiserWizardIssues(
    optimiserWizardModel,
    invalidOptimiserSettings,
    optimiserWizardResult,
  );
  assert.equal(
    optimiserStepCanContinue(invalidOptimiserIssues, "coarse"),
    false,
  );
  assert.equal(canRunOptimiserWizard(invalidOptimiserIssues), false);

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
  assert.ok(run.events.length >= 8);
  assert.ok(run.events.some((item) => item.message === "Complete run input snapshot captured"));
  assert.ok(run.events.some((item) => item.message === "Case inputs applied"));
  assert.ok(run.events.some((item) => item.message === "Calculation started"));
  assert.ok(run.events.some((item) => item.message === "Support settlement recorded"));
  assert.ok(run.events.some((item) => item.message === "Complete engineering result recorded"));
  assert.ok(run.events.some((item) => item.detail.includes("combinedCOG=")));

  const templatePath = path.join(
    root,
    "public",
    "templates",
    "Trailer_Stability_Verification_Template_v0.8_4Point_InPlace.xlsm",
  );
  assert.equal(
    VERIFICATION_TEMPLATE_ASSET,
    "/templates/Trailer_Stability_Verification_Template_v0.8_4Point_InPlace.xlsm",
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
  assert.equal(imported.model.longitudinalOrientation, LONGITUDINAL_ORIENTATION_ID);
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
  const incompatibleArchive = unzipSync(template);
  for (const [archivePath, payload] of Object.entries(incompatibleArchive)) {
    if (!archivePath.startsWith("xl/worksheets/") || !archivePath.endsWith(".xml")) continue;
    const xml = text(payload);
    if (!xml.includes("TS_HYD_REACTION(4")) continue;
    incompatibleArchive[archivePath] = new TextEncoder().encode(
      xml.replaceAll("TS_HYD_REACTION(4", "TS_HYD_REACTION_LEGACY(4"),
    );
  }
  await assert.rejects(
    exportVerificationWorkbook(fourPointModel, arrayBuffer(zipSync(incompatibleArchive))),
    /incompatible.*missing direct Group 4 reaction formulas.*latest four-point in-place workbook/i,
  );
  const fourPointVerificationBytes = await exportVerificationWorkbook(
    fourPointModel,
    arrayBuffer(template),
  );
  const fourPointVerificationWorkbook = XLSX.read(fourPointVerificationBytes, {
    type: "array",
    cellFormula: true,
  });
  assert.equal(
    fourPointVerificationWorkbook.Sheets["Load and Stability Calculation"].D133.v,
    "4-point",
  );
  const reimportedFourPointVerification = await importWorkbook(
    new File([arrayBuffer(fourPointVerificationBytes)], "four-point-roundtrip.xlsm", {
      type: "application/vnd.ms-excel.sheet.macroEnabled.12",
    }),
    createDefaultModel(),
  );
  assert.equal(reimportedFourPointVerification.model.hydraulicSystemMode, "FOUR_POINT");
  assert.ok(reimportedFourPointVerification.model.groupings.some((grouping) =>
    Object.values(grouping.cornerGroups ?? {}).includes(4)));
  assert.equal(reimportedFourPointVerification.model.cargo.lengthM, fourPointModel.cargo.lengthM);
  assert.equal(reimportedFourPointVerification.model.cargo.widthM, fourPointModel.cargo.widthM);
  assert.equal(reimportedFourPointVerification.model.cargo.massT, fourPointModel.cargo.massT);
  assert.deepEqual(reimportedFourPointVerification.model.cargo.cog, fourPointModel.cargo.cog);
  assert.deepEqual(reimportedFourPointVerification.model.packing.cog, fourPointModel.packing.cog);
  assert.equal(reimportedFourPointVerification.model.packing.massT, fourPointModel.packing.massT);
  assert.equal(
    reimportedFourPointVerification.model.environment.windSpeedMps,
    fourPointModel.environment.windSpeedMps,
  );
  assert.equal(reimportedFourPointVerification.model.trailers.length, fourPointModel.trailers.length);
  assert.deepEqual(
    reimportedFourPointVerification.model.trailers.map((trailer) => trailer.axleLines),
    fourPointModel.trailers.map((trailer) => trailer.axleLines),
  );
  assert.deepEqual(
    reimportedFourPointVerification.model.supports
      .slice(0, fourPointModel.supports.length)
      .map((support) => [support.allowed, support.active]),
    fourPointModel.supports.map((support) => [support.allowed, support.active]),
  );
  assert.ok(reimportedFourPointVerification.model.supports
    .slice(fourPointModel.supports.length)
    .every((support) => !support.allowed && !support.active));
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
    /verification import failed/i,
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

  const customPackingFootprint = structuredClone(imported.model);
  customPackingFootprint.packing.footprint = {
    mode: "CUSTOM",
    lengthM: 3.4,
    widthM: 1.8,
    extremeX: 4.2,
    extremeY: 8.1,
  };
  const customPackingFootprintResult = calculateProject(customPackingFootprint);
  assert.deepEqual(customPackingFootprintResult.combinedCog, importedNativeResult.combinedCog);
  assert.equal(
    customPackingFootprintResult.beam.bendingMaxKNm,
    importedNativeResult.beam.bendingMaxKNm,
  );

  const relativeVerificationResult = calculateProject(relativeMoved);
  const relativeVerificationBytes = await exportVerificationWorkbook(
    relativeMoved,
    arrayBuffer(template),
  );
  const relativeVerificationWorkbook = XLSX.read(relativeVerificationBytes, {
    type: "array",
    cellFormula: true,
  });
  const relativeVerificationSheet =
    relativeVerificationWorkbook.Sheets["Load and Stability Calculation"];
  assert.ok(
    Math.abs(
      Number(relativeVerificationSheet.E89.v) -
        relativeVerificationResult.resolvedTrailers[0].startXM,
    ) < 1e-8,
  );
  for (const resolved of relativeVerificationResult.resolvedTrailers) {
    assert.ok(
      Math.abs(Number(relativeVerificationSheet[`F${89 + resolved.index}`].v) - resolved.centreYM) <
        1e-8,
    );
  }

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
  const fourPointOutputPath = path.join(
    outputDirectory,
    "Trailer_Stability_Verification_FourPoint.xlsm",
  );
  await writeFile(outputPath, exported);
  await writeFile(fourPointOutputPath, fourPointVerificationBytes);

  const sourceArchive = unzipSync(template);
  const outputArchive = unzipSync(exported);
  assert.deepEqual(
    Object.keys(outputArchive).sort(),
    Object.keys(sourceArchive).filter((archivePath) => archivePath !== "xl/calcChain.xml").sort(),
  );
  assert.equal(outputArchive["xl/calcChain.xml"], undefined);
  assert.doesNotMatch(text(outputArchive["[Content_Types].xml"]), /calcChain/i);
  assert.doesNotMatch(text(outputArchive["xl/_rels/workbook.xml.rels"]), /calcChain/i);
  for (const [archivePath, payload] of Object.entries(outputArchive)) {
    if (!archivePath.startsWith("xl/worksheets/") || !archivePath.endsWith(".xml")) continue;
    const xml = text(payload);
    for (const row of xml.matchAll(/<row\b[^>]*\br="(\d+)"[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g)) {
      const rowNumber = row[1];
      const cellReferences = [...row[0].matchAll(/<c\b[^>]*\br="([A-Z]+\d+)"/g)].map(
        (match) => match[1],
      );
      assert.ok(
        cellReferences.every((reference) => reference.endsWith(rowNumber)),
        `${archivePath} row ${rowNumber} contains a cell from another row: ${cellReferences.join(", ")}`,
      );
    }
  }
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
  assert.equal(mainSheet.E64.v, derivedCargoCogEnvelopeInputs(exportModel.cargo).envelopeX);
  assert.equal(mainSheet.E65.v, derivedCargoCogEnvelopeInputs(exportModel.cargo).envelopeY);
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
  assert.match(formula(workbook, "Load and Stability Calculation", "F446"), /IF\(ISNUMBER\(C446\)/i);
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
  assert.equal(mainSheet.C70.v, exportModel.packing.massT);
  assert.equal(mainSheet.C71.v, exportModel.packing.heightM);
  assert.equal(mainSheet.C72.v, exportModel.packing.cog.x);
  assert.equal(mainSheet.C73.v, exportModel.packing.cog.y);
  assert.equal(mainSheet.C74.v, exportModel.packing.cog.z);
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
  assert.equal(controlSheet.A102.v, "Web export contract");
  assert.equal(controlSheet.B102.v, VERIFICATION_EXPORT_CONTRACT_VERSION);
  assert.match(String(controlSheet.C102.v), /lower X is rear and higher X is front/i);
  assert.equal(controlSheet.D102.v, "Support ID");
  assert.equal(controlSheet.E103.v, "no");
  assert.equal(controlSheet.F103.v, "no");
  const exportedEngineeringResult = calculateProject(exportModel);
  for (let index = 0; index < 10; index += 1) {
    const support = exportModel.supports[index];
    const settled = support
      ? exportedEngineeringResult.supports.find((candidate) => candidate.id === support.id)
      : undefined;
    assert.equal(
      mainSheet[`I${446 + index}`].v,
      settled?.active && settled.allowed && settled.geometricallyAllowed ? "yes" : "no",
    );
  }
  assert.equal(workbook.Sheets.Database.A16.v, "PEKZ G4");
  assert.equal(workbook.Sheets.Database.A18.v, "PEKZ G4 M78 X24 D24 TL24");
  assert.equal(workbook.Sheets.Database.A19.v, "CUSTOM VERIFICATION TRAILER");
  assert.equal(
    formula(workbook, "Database", "U4"),
    formula(sourceWorkbook, "Database", "U4"),
  );
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
        fourPointWorkbookOutput: fourPointOutputPath,
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
