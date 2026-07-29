import type { WorkSheet } from "xlsx";
import { assetPath } from "../site-path";
import type {
  EngineeringDegree,
  ProjectModel,
  SpineLoadCase,
  TrailerDefinition,
} from "./types";
import { calculateProject } from "./core";
import { applyAutomaticProjectCargoCogEnvelopeInputs } from "./cargo-envelope";
import { applyAutomaticProjectWindInputs } from "./wind";
import { LONGITUDINAL_ORIENTATION_ID } from "./orientation";

export interface WorkbookImportResult {
  model: ProjectModel;
  warnings: string[];
  workbookName: string;
  sourceBytes: ArrayBuffer;
}

const MAIN = "Load and Stability Calculation";
const DATABASE = "Database";
const CONTROL = "TS_CONTROL";

function numberValue(sheet: WorkSheet, address: string, fallback: number): number {
  const value = sheet[address]?.v;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function textValue(sheet: WorkSheet, address: string, fallback = ""): string {
  const value = sheet[address]?.v;
  return value === undefined || value === null ? fallback : String(value).trim();
}

function yes(value: unknown): boolean {
  return ["YES", "Y", "TRUE", "1", "OK"].includes(String(value ?? "").trim().toUpperCase());
}

function engineeringDegree(value: string, fallback: EngineeringDegree): EngineeringDegree {
  const normalised = value.trim().toLowerCase();
  if (normalised.startsWith("first")) return "First";
  if (normalised.startsWith("third")) return "Third";
  if (normalised.startsWith("second")) return "Second";
  return fallback;
}

const SPINE_CASES = new Set<SpineLoadCase>([
  "Neutral",
  "A",
  "B",
  "C",
  "D",
  "A1",
  "A2",
  "A3",
  "B1",
  "B2",
  "B3",
  "C1",
  "C2",
  "C3",
  "D1",
  "D2",
  "D3",
]);

function spineLoadCase(value: string, fallback: SpineLoadCase): SpineLoadCase {
  const wanted = value.trim().toUpperCase();
  const matched = [...SPINE_CASES].find((item) => item.toUpperCase() === wanted);
  return matched ?? fallback;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function encodeColumn(index: number): string {
  let value = Math.max(0, Math.floor(index)) + 1;
  let result = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

function encodeCell(rowIndex: number, columnIndex: number): string {
  return `${encodeColumn(columnIndex)}${Math.max(0, Math.floor(rowIndex)) + 1}`;
}

function nullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function catalogueFromSheet(sheet: WorkSheet): TrailerDefinition[] {
  const result: TrailerDefinition[] = [];
  for (let row = 4; row <= 250; row += 1) {
    const name = textValue(sheet, `A${row}`);
    if (!name) {
      if (row > 18) break;
      continue;
    }
    if (name.toUpperCase() === "ALTERNATIVE") continue;
    const crossSpacingValue = sheet[`D${row}`]?.v;
    result.push({
      id: slug(name),
      name,
      axleSpacingM: numberValue(sheet, `B${row}`, 0),
      trailerWidthM: numberValue(sheet, `C${row}`, 0),
      crossBogieSpacingM:
        typeof crossSpacingValue === "string" && crossSpacingValue.toLowerCase().startsWith("var")
          ? null
          : nullableNumber(crossSpacingValue),
      axleWeightT: numberValue(sheet, `E${row}`, 0),
      axleCapacityT: numberValue(sheet, `F${row}`, 0),
      ppuLengthM: nullableNumber(sheet[`G${row}`]?.v),
      ppuWeightT: nullableNumber(sheet[`H${row}`]?.v),
      neutralHeightM: numberValue(sheet, `I${row}`, 0),
      tyreWidthM: numberValue(sheet, `J${row}`, 0),
      wheelDiameterM: numberValue(sheet, `K${row}`, 0),
      strokeMaxM: numberValue(sheet, `L${row}`, 0),
      strokePracticalM: numberValue(sheet, `M${row}`, 0),
      secondMomentCm4: numberValue(sheet, `N${row}`, 0),
      momentMaxKNm: numberValue(sheet, `O${row}`, 0),
      momentMinKNm: numberValue(sheet, `P${row}`, 0),
      shearMaxKN: numberValue(sheet, `Q${row}`, 0),
      shearMinKN: numberValue(sheet, `R${row}`, 0),
      liftRatio: nullableNumber(sheet[`S${row}`]?.v),
      cylinderDiameterMm: nullableNumber(sheet[`T${row}`]?.v),
      factor: nullableNumber(sheet[`U${row}`]?.v),
      massBelowCylinderT: nullableNumber(sheet[`V${row}`]?.v),
      category: textValue(sheet, `W${row}`, row >= 17 ? "Alternative" : "Standard"),
    });
  }
  return result;
}

export async function importWorkbook(file: File, fallback: ProjectModel): Promise<WorkbookImportResult> {
  const XLSX = await import("xlsx");
  const bytes = await file.arrayBuffer();
  const workbook = XLSX.read(bytes, {
    type: "array",
    bookVBA: true,
    cellFormula: true,
    cellStyles: true,
    cellNF: true,
  });
  const main = workbook.Sheets[MAIN];
  const database = workbook.Sheets[DATABASE];
  if (!main || !database) throw new Error("The verification file is missing required calculation or catalogue data.");
  const warnings: string[] = [];
  const catalogue = catalogueFromSheet(database);
  if (!catalogue.length) throw new Error("No valid trailer rows were found in the Database sheet.");
  const model: ProjectModel = JSON.parse(JSON.stringify(fallback)) as ProjectModel;
  model.sourceWorkbook = file.name;
  model.longitudinalOrientation = LONGITUDINAL_ORIENTATION_ID;
  model.catalogue = catalogue;
  model.engineeringDegree = engineeringDegree(
    textValue(main, "F17", model.engineeringDegree),
    model.engineeringDegree,
  );
  model.weightCogReference = textValue(main, "J22", model.weightCogReference);
  model.referencePoint = textValue(main, "D48", model.referencePoint);
  model.cargo = {
    ...model.cargo,
    // Imported verification files retain their recorded wind inputs unless a
    // user explicitly enables the automatic cargo-derived setting afterwards.
    autoWindFromCargo: false,
    autoCogEnvelopeFromCargo: false,
    name: textValue(main, "D21", model.cargo.name),
    clientReference: textValue(main, "J21", model.cargo.clientReference),
    ownerReference: textValue(main, "D22", model.cargo.ownerReference),
    lengthM: numberValue(main, "C52", model.cargo.lengthM),
    widthM: numberValue(main, "C53", model.cargo.widthM),
    extremeX: numberValue(main, "C54", model.cargo.extremeX),
    extremeY: numberValue(main, "C55", model.cargo.extremeY),
    heightM: numberValue(main, "C56", model.cargo.heightM),
    sideWindAreaM2: numberValue(main, "C57", model.cargo.sideWindAreaM2),
    sideDragCoefficient: numberValue(main, "C58", model.cargo.sideDragCoefficient),
    frontWindAreaM2: numberValue(main, "C59", model.cargo.frontWindAreaM2),
    frontDragCoefficient: numberValue(main, "C60", model.cargo.frontDragCoefficient),
    massT: numberValue(main, "C63", model.cargo.massT),
    cog: {
      x: numberValue(main, "C64", model.cargo.cog.x),
      y: numberValue(main, "C65", model.cargo.cog.y),
      z: numberValue(main, "C66", model.cargo.cog.z),
    },
    envelopeX: numberValue(main, "E64", model.cargo.envelopeX),
    envelopeY: numberValue(main, "E65", model.cargo.envelopeY),
    sideWindHeightM: numberValue(main, "F57", model.cargo.sideWindHeightM),
    frontWindHeightM: numberValue(main, "F59", model.cargo.frontWindHeightM),
  };
  model.packing = {
    ...model.packing,
    massT: numberValue(main, "C70", model.packing.massT),
    heightM: numberValue(main, "C71", model.packing.heightM),
    cog: {
      x: numberValue(main, "C72", model.packing.cog.x),
      y: numberValue(main, "C73", model.packing.cog.y),
      z: numberValue(main, "C74", model.packing.cog.z),
    },
  };
  model.trailerDeckHeightM = numberValue(main, "C85", model.trailerDeckHeightM);
  const trailers = [];
  const groupings = [];
  const missingSelections: string[] = [];
  const sharedAxles = Math.max(1, Math.round(numberValue(main, "C89", 1)));
  const sharedX = numberValue(main, "E89", 0);
  const sharedSplit = Math.max(1, Math.round(numberValue(main, "D138", 1)));
  const pins = Array.from({ length: 8 }, (_, index) => Math.round(numberValue(main, `${String.fromCharCode(71 + index)}136`, 0))).filter(
    (value) => value > 0,
  );
  for (let index = 0; index < 12; index += 1) {
    const row = 89 + index;
    const name = textValue(main, `B${row}`);
    if (!name) continue;
    const definition = catalogue.find((item) => item.name.toLowerCase() === name.toLowerCase());
    if (!definition) {
      missingSelections.push(`row ${row}: "${name}"`);
      continue;
    }
    trailers.push({
      id: `trailer-${index + 1}`,
      definitionId: definition.id,
      axleLines: sharedAxles,
      singleFile: yes(main[`D${row}`]?.v),
      xM: sharedX,
      yM: numberValue(main, `F${row}`, 0),
      placementReference: "ABSOLUTE" as const,
      offsetFromReference: { x: sharedX, y: 0 },
      ppuLeft: yes(main[`J${row}`]?.v),
      ppuRight: yes(main[`K${row}`]?.v),
      enabled: true,
    });
    const firstBogieRow = 138 + index * 2;
    const secondBogieRow = firstBogieRow + 1;
    groupings.push({
      splitAfterAxleLine: sharedSplit,
      groups: Array.from({ length: sharedAxles }, () => 1),
      cornerGroups: {
        rearLeft: Math.max(1, Math.round(numberValue(main, `B${firstBogieRow}`, 2))),
        frontLeft: Math.max(1, Math.round(numberValue(main, `C${firstBogieRow}`, 1))),
        rearRight: Math.max(1, Math.round(numberValue(main, `B${secondBogieRow}`, 2))),
        frontRight: Math.max(1, Math.round(numberValue(main, `C${secondBogieRow}`, 1))),
      },
      pinnedAxleLines: [...pins],
    });
  }
  if (missingSelections.length) {
    throw new Error(
      `Verification import failed. The following selected model(s) are absent from the trailer catalogue: ${missingSelections.join(", ")}.`,
    );
  }
  if (!trailers.length) throw new Error("Verification import failed. No trailer model is selected.");
  model.trailers = trailers;
  model.groupings = groupings;
  model.supports = Array.from({ length: 10 }, (_, index) => {
    const row = 446 + index;
    const position = numberValue(main, `C${row}`, numberValue(main, `E${71 + index}`, Number.NaN));
    if (!Number.isFinite(position)) return null;
    return {
      id: `support-${index + 1}`,
      xM: position,
      widthM: numberValue(main, `D${row}`, 0.5),
      allowed: !["NO", "NOK"].includes(textValue(main, `F${row}`).toUpperCase()),
      active: yes(main[`I${row}`]?.v),
      optionalWeightT: nullableNumber(main[`F${71 + index}`]?.v) ?? undefined,
    };
  }).filter((item): item is NonNullable<typeof item> => item !== null);
  model.environment = {
    ...model.environment,
    routeLongitudinalSlopeDeg: numberValue(
      main,
      "D291",
      model.environment.routeLongitudinalSlopeDeg,
    ),
    longitudinalSlopeDeg: numberValue(main, "E291", model.environment.longitudinalSlopeDeg),
    routeTransverseSlopeDeg: numberValue(
      main,
      "D292",
      model.environment.routeTransverseSlopeDeg,
    ),
    transverseSlopeDeg: numberValue(main, "E292", model.environment.transverseSlopeDeg),
    combinationFactor: numberValue(main, "D293", model.environment.combinationFactor),
    longitudinalAccelerationMps2: numberValue(main, "E354", model.environment.longitudinalAccelerationMps2),
    transverseAccelerationMps2: numberValue(main, "E355", model.environment.transverseAccelerationMps2),
    windSpeedMps: numberValue(main, "E353", model.environment.windSpeedMps),
  };
  model.analysedTrailer = Math.max(
    1,
    Math.min(12, Math.round(numberValue(main, "F433", model.analysedTrailer))),
  );
  model.spineLoadCase = spineLoadCase(
    textValue(main, "F434", model.spineLoadCase),
    model.spineLoadCase,
  );
  model.spineMeshSizeM = Math.max(
    0.001,
    numberValue(main, "F435", model.spineMeshSizeM),
  );
  model.loosePacking = Array.from({ length: 4 }, (_, index) => {
    const row = 439 + index;
    const type = textValue(main, `B${row}`);
    const massT = nullableNumber(main[`D${row}`]?.v);
    const startXM = nullableNumber(main[`E${row}`]?.v);
    const endXM = nullableNumber(main[`F${row}`]?.v);
    if (!type && massT === null && startXM === null && endXM === null) return null;
    return {
      id: `loose-packing-${index + 1}`,
      type: type || `Loose packing ${index + 1}`,
      massT: massT ?? 0,
      startXM: startXM ?? 0,
      endXM: endXM ?? 0,
    };
  }).filter((item): item is NonNullable<typeof item> => item !== null);
  const control = workbook.Sheets[CONTROL];
  if (control) {
    const maximumAxleText = textValue(control, "B51", "AUTO");
    const maximumAxleNumber = Number(maximumAxleText);
    model.optimiser = {
      ...model.optimiser,
      c89Start: numberValue(control, "B8", model.optimiser.c89Start),
      c89Maximum: numberValue(control, "B7", model.optimiser.c89Maximum),
      c89Step: numberValue(control, "B9", model.optimiser.c89Step),
      e89Step: numberValue(control, "B6", model.optimiser.e89Step),
      e89RangeMode: textValue(control, "B11", model.optimiser.e89RangeMode).toUpperCase().startsWith("MANUAL")
        ? "MANUAL"
        : "AUTO_GROUP_CENTRES",
      e89Minimum: numberValue(control, "B12", model.optimiser.e89Minimum),
      e89Maximum: numberValue(control, "B13", model.optimiser.e89Maximum),
      d138MaximumFraction: numberValue(control, "B15", model.optimiser.d138MaximumFraction),
      overrideD138Limit: yes(control["B16"]?.v),
      boundaryToleranceM: numberValue(control, "B22", model.optimiser.boundaryToleranceM),
      stopAtFirstPass: yes(control["B24"]?.v),
      d138Start: numberValue(control, "B26", model.optimiser.d138Start),
      d138Step: numberValue(control, "B27", model.optimiser.d138Step),
      fineFirstPassReference: textValue(control, "B28", model.optimiser.fineFirstPassReference),
      fineSecondPassReference: textValue(control, "B29", model.optimiser.fineSecondPassReference),
      fineE89Step: numberValue(control, "B30", model.optimiser.fineE89Step),
      minimumActiveSupports: numberValue(control, "B64", model.optimiser.minimumActiveSupports),
      deflectionCheck: textValue(control, "B45", "OFF").toUpperCase() === "REQUIRED" ? "REQUIRED" : "OFF",
      deflectionLimitMm: numberValue(control, "B46", model.optimiser.deflectionLimitMm),
      pinSearchMode: (["OFF", "FAST", "THOROUGH"].includes(textValue(control, "B47", "").toUpperCase())
        ? textValue(control, "B47").toUpperCase()
        : model.optimiser.pinSearchMode) as ProjectModel["optimiser"]["pinSearchMode"],
      pinStopRule: (textValue(control, "B48", "").toUpperCase() === "FIRST_IMPROVEMENT"
        ? "FIRST_IMPROVEMENT"
        : "CONTINUE_IMPROVING"),
      existingPinsPolicy: textValue(control, "B49", "").toUpperCase() === "KEEP" ? "KEEP" : "REARRANGE",
      maximumPins: numberValue(control, "B50", model.optimiser.maximumPins),
      maximumAxleUtilisation: Number.isFinite(maximumAxleNumber) ? maximumAxleNumber : "AUTO",
      minimumDeflectionImprovementMm: numberValue(control, "B52", model.optimiser.minimumDeflectionImprovementMm),
      localStructuralTargetMode: textValue(control, "B53", "").toUpperCase() === "MANUAL_X"
        ? "MANUAL_X"
        : "AUTO_AT_DEFLECTION_PEAK",
      manualLocalTargetXM: nullableNumber(control["B54"]?.v),
      pinCaseBudget: numberValue(control, "B65", model.optimiser.pinCaseBudget),
      detailedWeighting: yes(control["B55"]?.v),
      f506Policy: textValue(control, "B56", "").toUpperCase() === "REPLACE" ? "REPLACE" : "KEEP",
      fineE89PinMode: textValue(control, "B57", "").toUpperCase() === "KEEP_BETTER_PASS"
        ? "KEEP_BETTER_PASS"
        : "REOPTIMISE_EACH_CASE",
      optimiserStrategy: textValue(control, "B63", "").toUpperCase() === "EXHAUSTIVE"
        ? "EXHAUSTIVE"
        : "STAGED_ADAPTIVE",
      thoroughFinalistCount: numberValue(control, "B66", model.optimiser.thoroughFinalistCount),
      deflectionToleranceMm: numberValue(control, "B67", model.optimiser.deflectionToleranceMm),
      afterFirstPass: textValue(control, "B68", "").toUpperCase() === "STOP" ? "STOP" : "CONTINUE_SCAN",
      calculationMode: textValue(control, "B70", "").toUpperCase().includes("LEGACY")
        ? "WORKBOOK_PARITY"
        : "NATIVE_VERIFIED",
      progressRefreshSeconds: numberValue(control, "B71", model.optimiser.progressRefreshSeconds),
      liveRefreshSeconds: numberValue(control, "B72", model.optimiser.liveRefreshSeconds),
      weightPreset: (textValue(control, "B34", "BALANCED").toUpperCase() || "BALANCED") as ProjectModel["optimiser"]["weightPreset"],
      weights: {
        ...model.optimiser.weights,
        basicUtil: numberValue(control, "B35", model.optimiser.weights.basicUtil),
        slopeUtil: numberValue(control, "B36", model.optimiser.weights.slopeUtil),
        dynamicUtil: numberValue(control, "B37", model.optimiser.weights.dynamicUtil),
        spineUtil: numberValue(control, "B38", model.optimiser.weights.spineUtil),
        basicAngle: numberValue(control, "B39", model.optimiser.weights.basicAngle),
        slopeAngle: numberValue(control, "B40", model.optimiser.weights.slopeAngle),
        dynamicAngle: numberValue(control, "B41", model.optimiser.weights.dynamicAngle),
        dynamicRatio: numberValue(control, "B42", model.optimiser.weights.dynamicRatio),
        shearUtil: numberValue(control, "B58", model.optimiser.weights.shearUtil),
        bendingUtil: numberValue(control, "B59", model.optimiser.weights.bendingUtil),
        deflection: numberValue(control, "B60", model.optimiser.weights.deflection),
        localBendingUtil: numberValue(control, "B61", model.optimiser.weights.localBendingUtil),
        axleLinesUsed: numberValue(control, "B73", model.optimiser.weights.axleLinesUsed),
      },
    };
  }
  return { model, warnings, workbookName: file.name, sourceBytes: bytes };
}

type CellValue = string | number | boolean | null;

interface XmlCellPatch {
  value: CellValue;
  formula?: string;
}

interface XmlPatchSheet {
  name: string;
  cells: Map<string, XmlCellPatch>;
}

function createPatchSheet(name: string): XmlPatchSheet {
  return { name, cells: new Map<string, XmlCellPatch>() };
}

function setValue(sheet: XmlPatchSheet, address: string, value: CellValue): void {
  sheet.cells.set(address.toUpperCase(), { value });
}

function setFormula(sheet: XmlPatchSheet, address: string, formula: string, cachedValue: string | number = ""): void {
  sheet.cells.set(address.toUpperCase(), {
    value: cachedValue,
    formula: formula.startsWith("=") ? formula.slice(1) : formula,
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function unescapeXml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

function xmlAttribute(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\s${escapeRegExp(name)}="([^"]*)"`));
  return match ? unescapeXml(match[1]) : null;
}

function worksheetPaths(archive: Record<string, Uint8Array>, decoder: TextDecoder): Map<string, string> {
  const workbookXml = archive["xl/workbook.xml"];
  const relationshipsXml = archive["xl/_rels/workbook.xml.rels"];
  if (!workbookXml || !relationshipsXml) throw new Error("The verification package is missing required relationships.");
  const relationships = new Map<string, string>();
  const relationshipText = decoder.decode(relationshipsXml);
  for (const match of relationshipText.matchAll(/<Relationship\b[^>]*\/?>/g)) {
    const id = xmlAttribute(match[0], "Id");
    const target = xmlAttribute(match[0], "Target");
    if (!id || !target || !target.toLowerCase().includes("worksheets/")) continue;
    const normalized = target.replace(/\\/g, "/").replace(/^\/+/, "");
    relationships.set(id, normalized.startsWith("xl/") ? normalized : `xl/${normalized}`);
  }
  const result = new Map<string, string>();
  const workbookText = decoder.decode(workbookXml);
  for (const match of workbookText.matchAll(/<sheet\b[^>]*\/?>/g)) {
    const name = xmlAttribute(match[0], "name");
    const relationshipId = xmlAttribute(match[0], "r:id");
    const target = relationshipId ? relationships.get(relationshipId) : undefined;
    if (name && target) result.set(name, target);
  }
  return result;
}

function cellColumn(address: string): number {
  const letters = address.match(/^[A-Z]+/)?.[0] ?? "A";
  let result = 0;
  for (const letter of letters) result = result * 26 + letter.charCodeAt(0) - 64;
  return result;
}

function cellRow(address: string): number {
  return Number(address.match(/\d+$/)?.[0] ?? 1);
}

function styleAttribute(cellXml: string | undefined): string {
  const style = cellXml ? xmlAttribute(cellXml.match(/^<c\b[^>]*>/)?.[0] ?? cellXml, "s") : null;
  return style === null ? "" : ` s="${escapeXml(style)}"`;
}

function renderCell(address: string, patch: XmlCellPatch, style = ""): string {
  const reference = ` r="${address}"${style}`;
  if (patch.value === null || (patch.value === "" && !patch.formula)) return `<c${reference}/>`;
  if (patch.formula !== undefined) {
    const formula = `<f>${escapeXml(patch.formula)}</f>`;
    if (typeof patch.value === "number") return `<c${reference}>${formula}<v>${patch.value}</v></c>`;
    if (typeof patch.value === "boolean")
      return `<c${reference} t="b">${formula}<v>${patch.value ? 1 : 0}</v></c>`;
    return `<c${reference} t="str">${formula}<v>${escapeXml(String(patch.value ?? ""))}</v></c>`;
  }
  if (typeof patch.value === "number") return `<c${reference}><v>${patch.value}</v></c>`;
  if (typeof patch.value === "boolean") return `<c${reference} t="b"><v>${patch.value ? 1 : 0}</v></c>`;
  return `<c${reference} t="inlineStr"><is><t xml:space="preserve">${escapeXml(patch.value)}</t></is></c>`;
}

function fallbackColumnStyle(xml: string, address: string): string {
  const column = address.match(/^[A-Z]+/)?.[0];
  if (!column) return "";
  const match = xml.match(new RegExp(`<c\\b(?=[^>]*\\br="${column}\\d+")[^>]*(?:\\/?>)`));
  return styleAttribute(match?.[0]);
}

function insertCellIntoRow(rowXml: string, address: string, cellXml: string): string {
  if (/\/>\s*$/.test(rowXml)) return rowXml.replace(/\/>\s*$/, `>${cellXml}</row>`);
  const targetColumn = cellColumn(address);
  for (const match of rowXml.matchAll(/<c\b[^>]*\br="([A-Z]+\d+)"[^>]*(?:\/>|>[\s\S]*?<\/c>)/g)) {
    if (cellColumn(match[1]) > targetColumn) {
      const index = match.index ?? rowXml.length;
      return `${rowXml.slice(0, index)}${cellXml}${rowXml.slice(index)}`;
    }
  }
  return rowXml.replace("</row>", `${cellXml}</row>`);
}

function setXmlCell(xml: string, address: string, patch: XmlCellPatch): string {
  const cellPattern = new RegExp(
    `<c\\b(?=[^>]*\\br="${escapeRegExp(address)}")[^>]*(?:\\/>|>[\\s\\S]*?<\\/c>)`,
  );
  const existing = xml.match(cellPattern)?.[0];
  const rendered = renderCell(address, patch, existing ? styleAttribute(existing) : fallbackColumnStyle(xml, address));
  if (existing) return xml.replace(cellPattern, rendered);

  const rowNumber = cellRow(address);
  const rowPattern = new RegExp(
    `<row\\b(?=[^>]*\\br="${rowNumber}")[^>]*(?:\\/>|>[\\s\\S]*?<\\/row>)`,
  );
  const existingRow = xml.match(rowPattern)?.[0];
  if (existingRow) return xml.replace(rowPattern, insertCellIntoRow(existingRow, address, rendered));

  const sheetData = xml.match(/<sheetData\b[^>]*>[\s\S]*?<\/sheetData>/)?.[0];
  if (!sheetData) throw new Error("Worksheet has no sheetData section.");
  let insertionIndex = sheetData.lastIndexOf("</sheetData>");
  for (const match of sheetData.matchAll(/<row\b[^>]*\br="(\d+)"[^>]*(?:\/>|>[\s\S]*?<\/row>)/g)) {
    if (Number(match[1]) > rowNumber) {
      insertionIndex = match.index ?? insertionIndex;
      break;
    }
  }
  const rowXml = `<row r="${rowNumber}">${rendered}</row>`;
  const updatedSheetData = `${sheetData.slice(0, insertionIndex)}${rowXml}${sheetData.slice(insertionIndex)}`;
  return xml.replace(sheetData, updatedSheetData);
}

function patchWorksheet(xml: string, sheet: XmlPatchSheet): string {
  let result = xml;
  const patches = [...sheet.cells.entries()].sort((left, right) => {
    const rowDifference = cellRow(left[0]) - cellRow(right[0]);
    return rowDifference || cellColumn(left[0]) - cellColumn(right[0]);
  });
  for (const [address, patch] of patches) result = setXmlCell(result, address, patch);
  return result;
}

async function patchWorkbookPackage(
  bytes: Uint8Array,
  catalogueRows: number,
  sheets: XmlPatchSheet[],
): Promise<Uint8Array> {
  const { unzipSync, zipSync } = await import("fflate");
  const archive = unzipSync(bytes);
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const paths = worksheetPaths(archive, decoder);
  for (const sheet of sheets) {
    const path = paths.get(sheet.name);
    if (!path || !archive[path]) throw new Error(`The verification package is missing the required "${sheet.name}" data section.`);
    let xml = patchWorksheet(decoder.decode(archive[path]), sheet);
    if (sheet.name === DATABASE) {
      const endRow = 3 + catalogueRows;
      xml = xml.replace(/<dimension\b[^>]*\bref="([A-Z]+\d+):([A-Z]+)(\d+)"[^>]*\/>/, (tag, start, endColumn, row) =>
        tag.replace(`${start}:${endColumn}${row}`, `${start}:${endColumn}${Math.max(Number(row), endRow)}`),
      );
    }
    archive[path] = encoder.encode(xml);
  }
  const endRow = 3 + catalogueRows;
  for (const [path, payload] of Object.entries(archive)) {
    if (!path.startsWith("xl/tables/") || !path.endsWith(".xml")) continue;
    let xml = decoder.decode(payload);
    if (!xml.includes('name="tblTrailerData"')) continue;
    xml = xml
      .replace(/ref="A3:W\d+"/g, `ref="A3:W${endRow}"`)
      .replace(/<autoFilter ref="A3:W\d+"/g, `<autoFilter ref="A3:W${endRow}"`);
    archive[path] = encoder.encode(xml);
  }
  const workbookPath = "xl/workbook.xml";
  if (archive[workbookPath]) {
    let xml = decoder.decode(archive[workbookPath]);
    if (/<calcPr\b/.test(xml)) {
      xml = xml.replace(/<calcPr\b([^>]*)\/>/, (_match, attributes: string) => {
        const cleaned = attributes
          .replace(/\sfullCalcOnLoad="[^"]*"/g, "")
          .replace(/\sforceFullCalc="[^"]*"/g, "")
          .replace(/\scalcMode="[^"]*"/g, "");
        return `<calcPr${cleaned} calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/>`;
      });
    } else {
      xml = xml.replace("</workbook>", '<calcPr calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>');
    }
    archive[workbookPath] = encoder.encode(xml);
  }
  return zipSync(archive, { level: 6 });
}

export async function exportVerificationWorkbook(
  model: ProjectModel,
  templateBytes?: ArrayBuffer,
): Promise<Uint8Array> {
  model = applyAutomaticProjectCargoCogEnvelopeInputs(model);
  model = applyAutomaticProjectWindInputs(model);
  let source: ArrayBuffer;
  if (templateBytes) {
    source = templateBytes;
  } else {
    const response = await fetch(assetPath("/templates/Trailer_Stability_Verification_Template_v0.7.xlsm"));
    if (!response.ok) throw new Error("The verification template could not be loaded.");
    source = await response.arrayBuffer();
  }
  const main = createPatchSheet(MAIN);
  const database = createPatchSheet(DATABASE);
  const control = createPatchSheet(CONTROL);
  const resolvedResult = calculateProject(model);
  setValue(main, "F17", model.engineeringDegree);
  setValue(main, "D21", model.cargo.name);
  setValue(main, "J21", model.cargo.clientReference);
  setValue(main, "D22", model.cargo.ownerReference);
  setValue(main, "J22", model.weightCogReference);
  setValue(main, "D48", model.referencePoint);
  setValue(main, "C52", model.cargo.lengthM);
  setValue(main, "C53", model.cargo.widthM);
  setValue(main, "C54", model.cargo.extremeX);
  setValue(main, "C55", model.cargo.extremeY);
  setValue(main, "C56", model.cargo.heightM);
  setValue(main, "C57", model.cargo.sideWindAreaM2);
  setValue(main, "C58", model.cargo.sideDragCoefficient);
  setValue(main, "F57", model.cargo.sideWindHeightM);
  setValue(main, "C59", model.cargo.frontWindAreaM2);
  setValue(main, "C60", model.cargo.frontDragCoefficient);
  setValue(main, "F59", model.cargo.frontWindHeightM);
  setValue(main, "C63", model.cargo.massT);
  setValue(main, "C64", model.cargo.cog.x);
  setValue(main, "C65", model.cargo.cog.y);
  setValue(main, "C66", model.cargo.cog.z);
  setValue(main, "E64", model.cargo.envelopeX);
  setValue(main, "E65", model.cargo.envelopeY);
  setValue(main, "C70", model.packing.massT);
  setValue(main, "C71", model.packing.heightM);
  setValue(main, "C72", model.packing.cog.x);
  setValue(main, "C73", model.packing.cog.y);
  setValue(main, "C74", model.packing.cog.z);
  setValue(main, "C85", model.trailerDeckHeightM);
  const sharedAxles = model.trailers[0]?.axleLines ?? 1;
  const sharedX = resolvedResult.resolvedTrailers.find((item) => item.index === 0)?.startXM
    ?? model.trailers[0]?.xM
    ?? 0;
  const sharedSplit = model.groupings[0]?.splitAfterAxleLine ?? 1;
  for (let index = 0; index < 12; index += 1) {
    const row = 89 + index;
    const trailer = model.trailers[index];
    const definition = trailer ? model.catalogue.find((item) => item.id === trailer.definitionId) : undefined;
    setValue(main, `B${row}`, definition?.name ?? null);
    if (index === 0) {
      setValue(main, `C${row}`, sharedAxles);
      setValue(main, `E${row}`, sharedX);
    } else {
      setFormula(main, `C${row}`, "$C$89", sharedAxles);
      setFormula(main, `E${row}`, "$E$89", sharedX);
    }
    setValue(main, `D${row}`, trailer?.singleFile ? "yes" : "no");
    setValue(
      main,
      `F${row}`,
      trailer
        ? resolvedResult.resolvedTrailers.find((item) => item.index === index)?.centreYM ?? trailer.yM
        : null,
    );
    setValue(main, `J${row}`, trailer?.ppuLeft ? "yes" : "no");
    setValue(main, `K${row}`, trailer?.ppuRight ? "yes" : "no");
  }
  setValue(main, "D138", sharedSplit);
  for (let row = 139; row <= 161; row += 1) setFormula(main, `D${row}`, "$D$138", sharedSplit);
  for (let index = 0; index < 12; index += 1) {
    const grouping = model.groupings[index];
    const firstBogieRow = 138 + index * 2;
    const secondBogieRow = firstBogieRow + 1;
    setValue(main, `B${firstBogieRow}`, grouping?.cornerGroups?.rearLeft ?? null);
    setValue(main, `C${firstBogieRow}`, grouping?.cornerGroups?.frontLeft ?? null);
    setValue(main, `B${secondBogieRow}`, grouping?.cornerGroups?.rearRight ?? null);
    setValue(main, `C${secondBogieRow}`, grouping?.cornerGroups?.frontRight ?? null);
  }
  const pins = model.groupings[0]?.pinnedAxleLines ?? [];
  for (let column = 7; column <= 14; column += 1) {
    const address = encodeCell(135, column - 1);
    setValue(main, address, pins[column - 7] ?? null);
    for (let row = 137; row <= 147; row += 1) {
      const target = encodeCell(row - 1, column - 1);
      setFormula(main, target, `$${encodeColumn(column - 1)}$136`, pins[column - 7] ?? "");
    }
  }
  for (let index = 0; index < 10; index += 1) {
    const support = model.supports[index];
    setValue(main, `E${71 + index}`, support?.xM ?? null);
    setValue(main, `F${71 + index}`, support?.optionalWeightT ?? null);
    setValue(main, `D${446 + index}`, support?.widthM ?? null);
    setValue(main, `F${446 + index}`, support?.allowed ? "yes" : "no");
    setValue(main, `I${446 + index}`, support?.active && support.allowed ? "yes" : "no");
  }
  setValue(main, "D291", model.environment.routeLongitudinalSlopeDeg);
  setValue(main, "E291", model.environment.longitudinalSlopeDeg);
  setValue(main, "D292", model.environment.routeTransverseSlopeDeg);
  setValue(main, "E292", model.environment.transverseSlopeDeg);
  setValue(main, "D293", model.environment.combinationFactor);
  setValue(main, "E354", model.environment.longitudinalAccelerationMps2);
  setValue(main, "E355", model.environment.transverseAccelerationMps2);
  setValue(main, "E353", model.environment.windSpeedMps);
  setValue(main, "F433", model.analysedTrailer);
  setValue(main, "F434", model.spineLoadCase);
  setValue(main, "F435", model.spineMeshSizeM);
  for (let index = 0; index < 4; index += 1) {
    const row = 439 + index;
    const item = model.loosePacking[index];
    setValue(main, `B${row}`, item?.type ?? null);
    setValue(main, `D${row}`, item?.massT ?? null);
    setValue(main, `E${row}`, item?.startXM ?? null);
    setValue(main, `F${row}`, item?.endXM ?? null);
  }
  setValue(control, "B2", "STOP");
  setValue(control, "B6", model.optimiser.e89Step);
  setValue(control, "B7", model.optimiser.c89Maximum);
  setValue(control, "B8", model.optimiser.c89Start);
  setValue(control, "B9", model.optimiser.c89Step);
  setValue(control, "B11", model.optimiser.e89RangeMode);
  setValue(control, "B12", model.optimiser.e89Minimum);
  setValue(control, "B13", model.optimiser.e89Maximum);
  setValue(control, "B15", model.optimiser.d138MaximumFraction);
  setValue(control, "B16", model.optimiser.overrideD138Limit ? "YES" : "NO");
  setValue(control, "B22", model.optimiser.boundaryToleranceM);
  setValue(control, "B24", model.optimiser.stopAtFirstPass ? "YES" : "NO");
  setValue(control, "B26", model.optimiser.d138Start);
  setValue(control, "B27", model.optimiser.d138Step);
  setValue(control, "B28", model.optimiser.fineFirstPassReference);
  setValue(control, "B29", model.optimiser.fineSecondPassReference);
  setValue(control, "B30", model.optimiser.fineE89Step);
  setValue(control, "B34", model.optimiser.weightPreset);
  setValue(control, "B35", model.optimiser.weights.basicUtil);
  setValue(control, "B36", model.optimiser.weights.slopeUtil);
  setValue(control, "B37", model.optimiser.weights.dynamicUtil);
  setValue(control, "B38", model.optimiser.weights.spineUtil);
  setValue(control, "B39", model.optimiser.weights.basicAngle);
  setValue(control, "B40", model.optimiser.weights.slopeAngle);
  setValue(control, "B41", model.optimiser.weights.dynamicAngle);
  setValue(control, "B42", model.optimiser.weights.dynamicRatio);
  setValue(control, "B45", model.optimiser.deflectionCheck);
  setValue(control, "B46", model.optimiser.deflectionLimitMm);
  setValue(control, "B47", model.optimiser.pinSearchMode);
  setValue(control, "B48", model.optimiser.pinStopRule);
  setValue(control, "B49", model.optimiser.existingPinsPolicy);
  setValue(control, "B50", model.optimiser.maximumPins);
  setValue(control, "B51", model.optimiser.maximumAxleUtilisation);
  setValue(control, "B52", model.optimiser.minimumDeflectionImprovementMm);
  setValue(control, "B53", model.optimiser.localStructuralTargetMode);
  setValue(control, "B54", model.optimiser.manualLocalTargetXM);
  setValue(control, "B55", model.optimiser.detailedWeighting ? "YES" : "NO");
  setValue(control, "B56", model.optimiser.f506Policy);
  setValue(control, "B57", model.optimiser.fineE89PinMode);
  setValue(control, "B58", model.optimiser.weights.shearUtil);
  setValue(control, "B59", model.optimiser.weights.bendingUtil);
  setValue(control, "B60", model.optimiser.weights.deflection);
  setValue(control, "B61", model.optimiser.weights.localBendingUtil);
  setValue(control, "B63", model.optimiser.optimiserStrategy);
  setValue(control, "B64", model.optimiser.minimumActiveSupports);
  setValue(control, "B65", model.optimiser.pinCaseBudget);
  setValue(control, "B66", model.optimiser.thoroughFinalistCount);
  setValue(control, "B67", model.optimiser.deflectionToleranceMm);
  setValue(control, "B68", model.optimiser.afterFirstPass);
  setValue(control, "B70", model.optimiser.calculationMode === "WORKBOOK_PARITY" ? "SAFE_LEGACY" : "ACCELERATED_VERIFIED");
  setValue(control, "B71", model.optimiser.progressRefreshSeconds);
  setValue(control, "B72", model.optimiser.liveRefreshSeconds);
  setValue(control, "B73", model.optimiser.weights.axleLinesUsed);
  for (let index = 0; index < model.catalogue.length; index += 1) {
    const row = 4 + index;
    const item = model.catalogue[index];
    const values: Array<string | number | null> = [
      item.name,
      item.axleSpacingM,
      item.trailerWidthM,
      item.crossBogieSpacingM,
      item.axleWeightT,
      item.axleCapacityT,
      item.ppuLengthM,
      item.ppuWeightT,
      item.neutralHeightM,
      item.tyreWidthM,
      item.wheelDiameterM,
      item.strokeMaxM,
      item.strokePracticalM,
      item.secondMomentCm4,
      item.momentMaxKNm,
      item.momentMinKNm,
      item.shearMaxKN,
      item.shearMinKN,
      item.liftRatio,
      item.cylinderDiameterMm,
      item.factor,
      item.massBelowCylinderT,
      item.category,
    ];
    values.forEach((value, column) => setValue(database, encodeCell(row - 1, column), value));
  }
  return patchWorkbookPackage(new Uint8Array(source), model.catalogue.length, [main, database, control]);
}

export function downloadBytes(bytes: Uint8Array, filename: string, mime = "application/octet-stream"): void {
  const blob = new Blob([bytes as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(content: string, filename: string, mime = "text/plain;charset=utf-8"): void {
  downloadBytes(new TextEncoder().encode(content), filename, mime);
}
