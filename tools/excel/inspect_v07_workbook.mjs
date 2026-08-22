import XLSX from "xlsx";
import { readFileSync } from "node:fs";
import { unzipSync } from "fflate";

const source = process.argv[2] ?? "public/templates/Trailer_Stability_Verification_Template_v0.7.xlsm";
const workbook = XLSX.readFile(source, { cellFormula: true, cellText: false });

function printable(cell) {
  return cell.f ? `=${cell.f}` : cell.v;
}

function dump(sheetName, range) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`Missing sheet: ${sheetName}`);
  console.log(`\n## ${sheetName} ${range}`);
  const decoded = XLSX.utils.decode_range(range);
  for (let row = decoded.s.r; row <= decoded.e.r; row += 1) {
    const cells = [];
    for (let column = decoded.s.c; column <= decoded.e.c; column += 1) {
      const address = XLSX.utils.encode_cell({ r: row, c: column });
      const cell = sheet[address];
      if (cell) cells.push(`${address}=${JSON.stringify(printable(cell))}`);
    }
    if (cells.length) console.log(cells.join(" | "));
  }
}

dump("Load and Stability Calculation", "A136:O165");
dump("Load and Stability Calculation", "A440:J460");
dump("Load and Stability Calculation", "A495:N510");
dump("TS_CONTROL", "A1:C100");

const bytes = new Uint8Array(readFileSync(source));
const files = unzipSync(bytes);
const decoder = new TextDecoder();
console.log("\n## Chart formula references");
for (const path of Object.keys(files).filter((file) => /^xl\/charts\/chart\d+\.xml$/.test(file))) {
  const xml = decoder.decode(files[path]);
  const refs = [...xml.matchAll(/<c:f>(.*?)<\/c:f>/g)].map((match) => match[1]);
  console.log(`${path}: ${refs.join(" | ")}`);
}
