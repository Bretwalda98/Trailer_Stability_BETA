import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";
import { strFromU8, unzipSync } from "fflate";

const inputPath = path.resolve(process.argv[2] ?? "");
const outputPath = process.argv[3] ? path.resolve(process.argv[3]) : null;

if (!inputPath || !fs.existsSync(inputPath)) {
  throw new Error("Usage: node scripts/audit-workbook.mjs <workbook.xlsm> [report.json]");
}

const fileBytes = fs.readFileSync(inputPath);
const workbook = XLSX.read(fileBytes, {
  type: "buffer",
  cellFormula: true,
  cellNF: true,
  cellStyles: true,
  cellDates: true,
});
const archive = unzipSync(new Uint8Array(fileBytes));

const text = (name) => {
  const entry = archive[name];
  return entry ? strFromU8(entry) : "";
};

const xmlEntries = Object.keys(archive).filter((name) => name.endsWith(".xml"));
const relationshipEntries = Object.keys(archive).filter((name) => name.endsWith(".rels"));

const decodeXml = (value) =>
  value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

const relationshipPathFor = (sourcePath) =>
  path.posix.join(path.posix.dirname(sourcePath), "_rels", `${path.posix.basename(sourcePath)}.rels`);

const readRelationships = (sourcePath) => {
  const xml = text(relationshipPathFor(sourcePath));
  return [...xml.matchAll(/<Relationship\b([^>]*)\/?>/g)].map((match) => {
    const attributes = Object.fromEntries(
      [...match[1].matchAll(/([A-Za-z:]+)="([^"]*)"/g)].map((attribute) => [
        attribute[1],
        decodeXml(attribute[2]),
      ]),
    );
    const target = attributes.Target ?? "";
    return {
      id: attributes.Id ?? null,
      type: attributes.Type?.split("/").at(-1) ?? null,
      target,
      resolvedTarget: target && !/^[a-z]+:/i.test(target)
        ? path.posix.normalize(path.posix.join(path.posix.dirname(sourcePath), target))
        : target,
      targetMode: attributes.TargetMode ?? null,
    };
  });
};

const tableDefinitions = xmlEntries
  .filter((name) => /^xl\/tables\/table\d+\.xml$/i.test(name))
  .map((name) => {
    const xml = text(name);
    const columns = [...xml.matchAll(/<tableColumn[^>]*name="([^"]*)"/g)].map((match) => match[1]);
    return {
      path: name,
      name: xml.match(/displayName="([^"]+)"/)?.[1] ?? null,
      reference: xml.match(/\bref="([^"]+)"/)?.[1] ?? null,
      columns,
    };
  });

const chartDefinitions = xmlEntries
  .filter((name) => /^xl\/charts\/chart\d+\.xml$/i.test(name))
  .map((name) => {
    const xml = text(name);
    const chartTypes = [
      "areaChart",
      "barChart",
      "bubbleChart",
      "doughnutChart",
      "lineChart",
      "pieChart",
      "radarChart",
      "scatterChart",
      "surfaceChart",
    ].filter((type) => xml.includes(`<c:${type}`));
    const title = [...xml.matchAll(/<a:t>([^<]+)<\/a:t>/g)].map((match) => match[1]).join(" ").trim();
    const series = [...xml.matchAll(/<c:ser>([\s\S]*?)<\/c:ser>/g)].map((match) => {
      const seriesXml = match[1];
      const formulas = [...seriesXml.matchAll(/<c:f>([^<]+)<\/c:f>/g)].map((formula) =>
        decodeXml(formula[1]),
      );
      const literalName =
        seriesXml.match(/<c:tx>[\s\S]*?<c:v>([^<]*)<\/c:v>[\s\S]*?<\/c:tx>/)?.[1] ?? null;
      return {
        literalName,
        formulas,
      };
    });
    return {
      path: name,
      types: chartTypes,
      title: title || null,
      seriesCount: series.length,
      series,
    };
  });

const drawingDefinitions = xmlEntries
  .filter((name) => /^xl\/drawings\/drawing\d+\.xml$/i.test(name))
  .map((name) => {
    const xml = text(name);
    return {
      path: name,
      twoCellAnchors: (xml.match(/<xdr:twoCellAnchor/g) ?? []).length,
      oneCellAnchors: (xml.match(/<xdr:oneCellAnchor/g) ?? []).length,
      pictures: (xml.match(/<xdr:pic>/g) ?? []).length,
      shapes: (xml.match(/<xdr:sp>/g) ?? []).length,
      graphicFrames: (xml.match(/<xdr:graphicFrame>/g) ?? []).length,
    };
  });

const definedNames = (workbook.Workbook?.Names ?? []).map((item) => ({
  name: item.Name,
  reference: item.Ref,
  sheetIndex: item.Sheet ?? null,
  hidden: Boolean(item.Hidden),
}));

const workbookRelationships = readRelationships("xl/workbook.xml");
const workbookRelationshipById = new Map(workbookRelationships.map((relationship) => [relationship.id, relationship]));
const workbookXml = text("xl/workbook.xml");
const workbookSheetEntries = [...workbookXml.matchAll(/<sheet\b([^>]*)\/?>/g)].map((match) => {
  const attributes = Object.fromEntries(
    [...match[1].matchAll(/([A-Za-z:]+)="([^"]*)"/g)].map((attribute) => [
      attribute[1],
      decodeXml(attribute[2]),
    ]),
  );
  const relationship = workbookRelationshipById.get(attributes["r:id"]);
  return {
    name: attributes.name,
    sheetId: attributes.sheetId,
    sourcePath: relationship?.resolvedTarget ?? null,
  };
});

const sheetAssets = workbookSheetEntries.map((entry) => {
  const directRelationships = entry.sourcePath ? readRelationships(entry.sourcePath) : [];
  const drawings = directRelationships
    .filter((relationship) => relationship.type === "drawing")
    .map((relationship) => {
      const drawingRelationships = readRelationships(relationship.resolvedTarget);
      return {
        path: relationship.resolvedTarget,
        charts: drawingRelationships
          .filter((drawingRelationship) => drawingRelationship.type === "chart")
          .map((drawingRelationship) => drawingRelationship.resolvedTarget),
        images: drawingRelationships
          .filter((drawingRelationship) => drawingRelationship.type === "image")
          .map((drawingRelationship) => drawingRelationship.resolvedTarget),
      };
    });
  return {
    name: entry.name,
    sourcePath: entry.sourcePath,
    tables: directRelationships
      .filter((relationship) => relationship.type === "table")
      .map((relationship) => relationship.resolvedTarget),
    comments: directRelationships
      .filter((relationship) => relationship.type === "comments")
      .map((relationship) => relationship.resolvedTarget),
    drawings,
    externalLinks: directRelationships
      .filter((relationship) => relationship.targetMode === "External")
      .map((relationship) => relationship.target),
  };
});

const summarizeSheet = (sheetName) => {
  const sheet = workbook.Sheets[sheetName];
  const cells = Object.keys(sheet).filter((address) => !address.startsWith("!"));
  const formulaCells = cells.filter((address) => typeof sheet[address]?.f === "string");
  const numericCells = cells.filter((address) => typeof sheet[address]?.v === "number");
  const textCells = cells.filter((address) => typeof sheet[address]?.v === "string");
  const labels = textCells
    .map((address) => ({
      address,
      value: String(sheet[address].v).replace(/\s+/g, " ").trim(),
    }))
    .filter(({ value }) => value && value.length <= 160)
    .slice(0, 2500);

  return {
    name: sheetName,
    usedRange: sheet["!ref"] ?? null,
    nonEmptyCellCount: cells.length,
    formulaCellCount: formulaCells.length,
    numericCellCount: numericCells.length,
    textCellCount: textCells.length,
    mergedRangeCount: (sheet["!merges"] ?? []).length,
    rowMetadataCount: (sheet["!rows"] ?? []).length,
    columnMetadataCount: (sheet["!cols"] ?? []).length,
    labels,
  };
};

const report = {
  workbook: {
    path: inputPath,
    bytes: fileBytes.length,
    sheetCount: workbook.SheetNames.length,
    sheets: workbook.SheetNames,
    date1904: Boolean(workbook.Workbook?.WBProps?.date1904),
    calculationProperties: workbook.Workbook?.CalcPr ?? null,
  },
  sheets: workbook.SheetNames.map(summarizeSheet),
  sheetAssets,
  definedNames,
  archive: {
    tables: tableDefinitions,
    charts: chartDefinitions,
    drawings: drawingDefinitions,
    comments: xmlEntries.filter((name) => /comments\d+\.xml$/i.test(name)),
    media: Object.keys(archive).filter((name) => name.startsWith("xl/media/")),
    relationships: relationshipEntries,
    hasVbaProject: Boolean(archive["xl/vbaProject.bin"]),
    hasExternalLinks: Object.keys(archive).some((name) => name.startsWith("xl/externalLinks/")),
    hasCustomXml: Object.keys(archive).some((name) => name.startsWith("customXml/")),
  },
};

const serialized = JSON.stringify(report, null, 2);
if (outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${serialized}\n`, "utf8");
}

process.stdout.write(
  JSON.stringify(
    {
      workbook: report.workbook,
      sheets: report.sheets.map(({ name, usedRange, nonEmptyCellCount, formulaCellCount, mergedRangeCount }) => ({
        name,
        usedRange,
        nonEmptyCellCount,
        formulaCellCount,
        mergedRangeCount,
      })),
      sheetAssets: report.sheetAssets.filter(
        ({ tables, comments, drawings, externalLinks }) =>
          tables.length || comments.length || drawings.length || externalLinks.length,
      ),
      definedNameCount: report.definedNames.length,
      archive: report.archive,
      outputPath,
    },
    null,
    2,
  ),
);
