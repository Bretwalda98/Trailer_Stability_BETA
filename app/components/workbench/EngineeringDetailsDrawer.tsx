"use client";

import {
  IconChevronDown,
  IconChevronUp,
  IconCopy,
  IconDownload,
  IconSearch,
  IconTable,
} from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { downloadText } from "../../engine/workbook";
import type { ProjectModel, SpineLoadCase } from "../../engine/types";
import {
  buildEngineeringDetailRows,
  engineeringDetailsCsv,
  type EngineeringDetailRow,
} from "../../geometry/details";
import type { CalculationResult } from "../../engine/types";
import { formatCompact } from "../../geometry/format";
import { updateModelField } from "./model-update";

const SPINE_CASES: SpineLoadCase[] = [
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
];

interface EngineeringDetailsDrawerProps {
  model: ProjectModel;
  result: CalculationResult;
  open: boolean;
  onOpenChange(open: boolean): void;
  onModelChange(model: ProjectModel): void;
}

function EditableValue({
  row,
  onChange,
}: {
  row: EngineeringDetailRow;
  onChange(value: string | number | boolean | null): void;
}) {
  if (!row.editable || !row.fieldKey) {
    return <span>{typeof row.value === "number" ? formatCompact(row.value, 6) : String(row.value ?? "—")}</span>;
  }
  if (row.valueType === "select") {
    const options =
      row.fieldKey === "engineeringDegree"
        ? ["First", "Second", "Third"]
        : row.fieldKey === "spineLoadCase"
          ? SPINE_CASES
          : [String(row.value ?? "")];
    return (
      <select value={String(row.value ?? "")} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option}>{option}</option>)}
      </select>
    );
  }
  if (row.valueType === "boolean") {
    return (
      <input
        type="checkbox"
        checked={Boolean(row.value)}
        onChange={(event) => onChange(event.target.checked)}
      />
    );
  }
  if (row.valueType === "text") {
    return <input type="text" value={String(row.value ?? "")} onChange={(event) => onChange(event.target.value)} />;
  }
  return (
    <input
      type="number"
      step="any"
      value={typeof row.value === "number" ? row.value : ""}
      onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))}
    />
  );
}

export function EngineeringDetailsDrawer({
  model,
  result,
  open,
  onOpenChange,
  onModelChange,
}: EngineeringDetailsDrawerProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [copied, setCopied] = useState(false);
  const rows = useMemo(() => buildEngineeringDetailRows(model, result), [model, result]);
  const categories = useMemo(() => [...new Set(rows.map((row) => row.category))], [rows]);
  const filtered = useMemo(() => {
    const wanted = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (category !== "ALL" && row.category !== category) return false;
      if (status !== "ALL" && (row.status ?? "N/A") !== status) return false;
      if (!wanted) return true;
      return [row.category, row.label, row.value, row.unit, row.source, row.validation]
        .some((value) => String(value ?? "").toLowerCase().includes(wanted));
    });
  }, [rows, category, status, query]);

  const copyRows = async () => {
    await navigator.clipboard.writeText(engineeringDetailsCsv(filtered));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <section className={`engineering-details-drawer${open ? " open" : ""}`}>
      <button className="drawer-handle" onClick={() => onOpenChange(!open)} aria-expanded={open}>
        <span><IconTable size={15} /> Engineering details</span>
        <span>{rows.length} values · {result.warnings.length} warnings</span>
        {open ? <IconChevronDown size={15} /> : <IconChevronUp size={15} />}
      </button>
      {open && (
        <div className="details-content">
          <div className="details-toolbar">
            <label className="search-field">
              <IconSearch size={14} />
              <input
                type="search"
                value={query}
                placeholder="Search values, sources or warnings"
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <select aria-label="Filter detail category" value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="ALL">All categories</option>
              {categories.map((item) => <option key={item}>{item}</option>)}
            </select>
            <select aria-label="Filter detail status" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="ALL">All statuses</option>
              <option value="OK">OK</option>
              <option value="NOK">NOK</option>
              <option value="WARN">Warnings</option>
              <option value="N/A">Not available</option>
            </select>
            <span className="row-count">{filtered.length} / {rows.length}</span>
            <button className="toolbar-action" onClick={copyRows}><IconCopy size={14} /> {copied ? "Copied" : "Copy CSV"}</button>
            <button
              className="toolbar-action"
              onClick={() =>
                downloadText(
                  engineeringDetailsCsv(filtered),
                  `Trailer_Stability_Engineering_Details_${new Date().toISOString().slice(0, 10)}.csv`,
                )
              }
            >
              <IconDownload size={14} /> Export
            </button>
          </div>
          <div className="details-table-scroll">
            <table className="engineering-table details-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Engineering value</th>
                  <th>Value</th>
                  <th>Unit</th>
                  <th>Source / mapping</th>
                  <th>Validation</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr
                    key={row.id}
                    className={`${row.editable ? "editable-row" : "calculated-row"}${
                      row.status ? ` row-${row.status.toLowerCase().replace("/", "-")}` : ""
                    }`}
                  >
                    <td>{row.category}</td>
                    <td>{row.label}</td>
                    <td className="detail-value">
                      <EditableValue
                        row={row}
                        onChange={(value) => {
                          if (!row.fieldKey) return;
                          onModelChange(updateModelField(model, row.fieldKey, value));
                        }}
                      />
                    </td>
                    <td>{row.unit}</td>
                    <td className="source-cell">{row.source}</td>
                    <td>{row.validation ?? row.status ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
