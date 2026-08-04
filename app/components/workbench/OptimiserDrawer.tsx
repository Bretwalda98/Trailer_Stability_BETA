"use client";

import {
  IconCopy,
  IconArrowBackUp,
  IconChevronDown,
  IconChevronUp,
  IconDownload,
  IconPlayerStop,
  IconTargetArrow,
} from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";
import {
  exportBeamPointsCsv,
  exportEventsCsv,
  exportPassesCsv,
} from "../../engine/optimiser";
import type { OptimiserRun, PassResult, ProjectModel } from "../../engine/types";
import { downloadText } from "../../engine/workbook";
import { formatDuration } from "../../geometry/format";

const MAX_VISIBLE_TERMINAL_EVENTS = 240;

type CandidateSortKey =
  | "rank" | "passRef" | "trains" | "axleLines" | "totalAxleLines" | "pitch"
  | "width" | "modules" | "split" | "x" | "pins" | "supports"
  | "dynamicUtil" | "dynamicAngle" | "deflection" | "rating";
type SortDirection = "asc" | "desc";

function terminalEventText(event: OptimiserRun["events"][number]): string {
  const caseLabel = event.caseReference ? ` case=${event.caseReference}` : "";
  return [
    `[${formatDuration(event.elapsedMs)}] [${event.level}] [${event.phase}/${event.stage}]${caseLabel} ${event.message}`,
    event.detail,
  ].join("\n");
}

function diagnosticText(events: OptimiserRun["events"]): string {
  return [...events].reverse().map(terminalEventText).join("\n\n");
}

async function copyDiagnosticText(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const area = document.createElement("textarea");
    area.value = value;
    area.setAttribute("readonly", "true");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
}

interface OptimiserDrawerProps {
  run: OptimiserRun;
  open: boolean;
  startModel: ProjectModel | null;
  canUndo: boolean;
  onOpenChange(open: boolean): void;
  onCancel(): void;
  onApply(pass: PassResult): void;
  onUndo(): void;
}

export function OptimiserDrawer({
  run,
  open,
  startModel,
  canUndo,
  onOpenChange,
  onCancel,
  onApply,
  onUndo,
}: OptimiserDrawerProps) {
  const arrangementRun = useMemo(() => run.passes.some((pass) => Boolean(pass.arrangement)), [run.passes]);
  const [candidateSort, setCandidateSort] = useState<{ key: CandidateSortKey; direction: SortDirection }>({ key: "rank", direction: "asc" });
  const sortValue = (pass: PassResult, key: CandidateSortKey): number | string | null => {
    switch (key) {
      case "rank": return pass.overallRank;
      case "passRef": return pass.id;
      case "trains": return pass.arrangement?.trainCount ?? null;
      case "axleLines": return pass.arrangement?.axleLinesPerTrain ?? pass.c89;
      case "totalAxleLines": return pass.arrangement?.totalAxleLines ?? null;
      case "pitch": return pass.arrangement?.pitchM ?? null;
      case "width": return pass.arrangement?.overallWidthM ?? null;
      case "modules": return pass.arrangement ? [pass.arrangement.modules6 && `${pass.arrangement.modules6}×6`, pass.arrangement.modules5 && `${pass.arrangement.modules5}×5`, pass.arrangement.modules4 && `${pass.arrangement.modules4}×4`].filter(Boolean).join(" + ") : null;
      case "split": return pass.d138;
      case "x": return pass.e89;
      case "pins": return pass.pinnedAxleLines.length;
      case "supports": return pass.result.activeSupportCount;
      case "dynamicUtil": return pass.result.metrics.dynamicUtil.value;
      case "dynamicAngle": return pass.result.metrics.dynamicAngle.value;
      case "deflection": return pass.result.beam.absoluteDeflectionMm;
      case "rating": return pass.rating;
    }
  };
  const sortableHeaders = (label: string, key: CandidateSortKey) => {
    const active = candidateSort.key === key;
    return (
      <th aria-sort={active ? (candidateSort.direction === "asc" ? "ascending" : "descending") : "none"}>
        <button
          type="button"
          className="candidate-sort-header"
          onClick={() => setCandidateSort((current) => current.key === key ? { key, direction: current.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" })}
          title={`Sort ${label} ${active ? (candidateSort.direction === "asc" ? "ascending" : "descending") : "ascending"}`}
        >
          <span>{label}</span><span className="candidate-sort-indicator" aria-hidden="true">{active ? (candidateSort.direction === "asc" ? "↑" : "↓") : "↕"}</span>
        </button>
      </th>
    );
  };
  const ranked = useMemo(
    () => [...run.passes].filter((pass) => pass.overallRank !== null).sort((a, b) => {
      const left = sortValue(a, candidateSort.key);
      const right = sortValue(b, candidateSort.key);
      if (left === null && right !== null) return 1;
      if (left !== null && right === null) return -1;
      if (left === null || right === null) return (a.overallRank ?? Infinity) - (b.overallRank ?? Infinity);
      const comparison = typeof left === "number" && typeof right === "number"
        ? left - right
        : String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: "base" });
      return (comparison || (a.overallRank ?? Infinity) - (b.overallRank ?? Infinity)) * (candidateSort.direction === "asc" ? 1 : -1);
    }),
    [run.passes, candidateSort],
  );
  const [selectedPassId, setSelectedPassId] = useState("");
  useEffect(() => {
    if (!ranked.length) return;
    if (!ranked.some((pass) => pass.id === selectedPassId)) setSelectedPassId(ranked[0].id);
  }, [ranked, selectedPassId]);
  const selected = ranked.find((pass) => pass.id === selectedPassId) ?? null;
  const running = run.state === "RUNNING" || run.state === "PLANNING";
  const [copiedLog, setCopiedLog] = useState<"visible" | "full" | null>(null);
  const visibleTerminalEvents = run.events.slice(0, MAX_VISIBLE_TERMINAL_EVENTS).reverse();
  const visibleTerminalText = diagnosticText(visibleTerminalEvents);
  const fullTerminalText = diagnosticText(run.events);
  const copyTerminal = async (scope: "visible" | "full") => {
    await copyDiagnosticText(scope === "visible" ? visibleTerminalText : fullTerminalText);
    setCopiedLog(scope);
    window.setTimeout(() => setCopiedLog(null), 1600);
  };
  const visible = run.state !== "IDLE" || canUndo;
  if (!visible) return null;

  return (
    <section className={`optimiser-drawer${open ? " open" : ""}`}>
      <button className="drawer-handle" onClick={() => onOpenChange(!open)} aria-expanded={open}>
        <span><IconTargetArrow size={15} /> {arrangementRun ? "Automatic arrangement" : "Optimisation"} · {run.state}</span>
        <span>
          {run.progress.reference || "No active case"} · {run.passes.length} evaluated ·{" "}
          {ranked.length} valid
        </span>
        <span>{run.progress.overallPercent.toFixed(1)}%</span>
        {open ? <IconChevronDown size={15} /> : <IconChevronUp size={15} />}
      </button>
      {open && (
        <div className="optimiser-drawer-content">
          <div className="optimiser-progress-grid">
            <div className="progress-block">
              <header><b>Overall run</b><span>{run.progress.overallCompleted} / {run.progress.overallPlanned}</span></header>
              <div className="technical-progress"><i style={{ width: `${Math.min(100, run.progress.overallPercent)}%` }} /></div>
              <footer><span>Elapsed {formatDuration(run.progress.elapsedMs)}</span><span>ETA {running ? formatDuration(run.progress.overallEtaMs) : run.state}</span></footer>
            </div>
            <div className="progress-block">
              <header><b>{run.progress.phase}</b><span>{run.progress.phaseCompleted} / {run.progress.phasePlanned}</span></header>
              <div className="technical-progress phase"><i style={{ width: `${Math.min(100, run.progress.phasePercent)}%` }} /></div>
              <footer><span>{run.progress.reference}</span><span>Phase ETA {formatDuration(run.progress.currentEtaMs)}</span></footer>
            </div>
            <div className="optimiser-live-stats">
              <span><small>CASES</small><b>{run.passes.length}</b></span>
              <span><small>VALID</small><b>{ranked.length}</b></span>
              <span><small>BEST</small><b>{ranked[0]?.id ?? "—"}</b></span>
              {running && <button className="stop-action" onClick={onCancel}><IconPlayerStop size={14} /> Cancel</button>}
              {!running && canUndo && <button className="secondary-action" onClick={onUndo}><IconArrowBackUp size={14} /> Undo applied result</button>}
            </div>
          </div>

          <div className="optimiser-results-grid">
            <div className="candidate-table-wrap">
              <header>
                <b>Ranked candidates</b>
                <div>
                  <button onClick={() => downloadText(exportPassesCsv(run.passes), `${run.runReference || "optimiser"}-passes.csv`)}><IconDownload size={13} /> Passes</button>
                  <button onClick={() => downloadText(exportEventsCsv(run.events), `${run.runReference || "optimiser"}-activity.csv`)}><IconDownload size={13} /> Activity</button>
                  <button onClick={() => downloadText(exportBeamPointsCsv(run.passes), `${run.runReference || "optimiser"}-beam.csv`)}><IconDownload size={13} /> Beam</button>
                </div>
              </header>
              <div className="table-scroll">
                <table className="engineering-table">
                  <thead>
                    <tr>
                      {sortableHeaders("Rank", "rank")}{sortableHeaders("Pass ref", "passRef")}
                      {arrangementRun && <>{sortableHeaders("Trains", "trains")}{sortableHeaders("AL/train", "axleLines")}{sortableHeaders("Total AL", "totalAxleLines")}{sortableHeaders("Pitch", "pitch")}{sortableHeaders("Width", "width")}{sortableHeaders("Modules/train", "modules")}</>}
                      {!arrangementRun && sortableHeaders("AL", "axleLines")}
                      {sortableHeaders("Split", "split")}{sortableHeaders("X (m)", "x")}{sortableHeaders("Pins", "pins")}{sortableHeaders("Supports", "supports")}{sortableHeaders("Dyn. util.", "dynamicUtil")}{sortableHeaders("Dyn. angle", "dynamicAngle")}{sortableHeaders("Defl.", "deflection")}{sortableHeaders("Rating", "rating")}
                    </tr>
                  </thead>
                  <tbody>
                    {ranked.map((pass) => (
                      <tr key={pass.id} className={selectedPassId === pass.id ? "is-selected" : ""} onClick={() => setSelectedPassId(pass.id)}>
                        <td>{pass.overallRank}</td>
                        <td>{pass.id}</td>
                        {arrangementRun ? (
                          <>
                            <td>{pass.arrangement?.trainCount ?? "—"}</td>
                            <td>{pass.arrangement?.axleLinesPerTrain ?? pass.c89}</td>
                            <td>{pass.arrangement?.totalAxleLines ?? "—"}</td>
                            <td>{pass.arrangement ? `${pass.arrangement.pitchM.toFixed(3)} m` : "—"}</td>
                            <td>{pass.arrangement ? `${pass.arrangement.overallWidthM.toFixed(3)} m` : "—"}</td>
                            <td>{pass.arrangement ? [pass.arrangement.modules6 && `${pass.arrangement.modules6}×6`, pass.arrangement.modules5 && `${pass.arrangement.modules5}×5`, pass.arrangement.modules4 && `${pass.arrangement.modules4}×4`].filter(Boolean).join(" + ") : "—"}</td>
                          </>
                        ) : <td>{pass.c89}</td>}
                        <td>{pass.d138}</td>
                        <td>{pass.e89.toFixed(3)}</td>
                        <td>{pass.pinnedAxleLines.join(", ") || "—"}</td>
                        <td>{pass.result.activeSupportCount}</td>
                        <td>{pass.result.metrics.dynamicUtil.value === null ? "—" : `${(pass.result.metrics.dynamicUtil.value * 100).toFixed(1)}%`}</td>
                        <td>{pass.result.metrics.dynamicAngle.value?.toFixed(2) ?? "—"}°</td>
                        <td>{pass.result.beam.absoluteDeflectionMm.toFixed(3)} mm</td>
                        <td>{pass.rating?.toFixed(3) ?? "—"}</td>
                      </tr>
                    ))}
                    {!ranked.length && <tr><td colSpan={arrangementRun ? 16 : 11}>No valid ranked passes yet.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            <aside className="candidate-compare">
              <header><b>Selected candidate</b><span>{selected?.id ?? "—"}</span></header>
              {selected ? (
                <>
                  <dl>
                    {selected.arrangement && (
                      <>
                        <div><dt>Parallel trains</dt><dd><b>{selected.arrangement.trainCount}</b></dd></div>
                        <div><dt>Constructible axle lines</dt><dd><b>{selected.arrangement.axleLinesPerTrain} AL/train · {selected.arrangement.totalAxleLines} total</b></dd></div>
                        <div><dt>Module build per train</dt><dd><b>{[selected.arrangement.modules6 && `${selected.arrangement.modules6}×6`, selected.arrangement.modules5 && `${selected.arrangement.modules5}×5`, selected.arrangement.modules4 && `${selected.arrangement.modules4}×4`].filter(Boolean).join(" + ")}</b></dd></div>
                        <div><dt>Equal centre spacing</dt><dd><b>{selected.arrangement.pitchM.toFixed(3)} m</b></dd></div>
                        <div><dt>Overall formation width</dt><dd><b>{selected.arrangement.overallWidthM.toFixed(3)} m</b></dd></div>
                      </>
                    )}
                    <div><dt>Axle lines</dt><dd>{startModel?.trailers[0]?.axleLines ?? "—"} → <b>{selected.c89}</b></dd></div>
                    <div><dt>Split after</dt><dd>{startModel?.groupings[0]?.splitAfterAxleLine ?? "—"} → <b>{selected.d138}</b></dd></div>
                    <div><dt>Trailer X</dt><dd>{startModel?.trailers[0]?.xM.toFixed(3) ?? "—"} → <b>{selected.e89.toFixed(3)} m</b></dd></div>
                    <div><dt>Pinned lines</dt><dd>{startModel?.groupings[0]?.pinnedAxleLines.join(", ") || "none"} → <b>{selected.pinnedAxleLines.join(", ") || "none"}</b></dd></div>
                    <div><dt>Active supports</dt><dd><b>{selected.result.activeSupportCount}</b></dd></div>
                    <div><dt>Dynamic utilisation</dt><dd><b>{selected.result.metrics.dynamicUtil.value === null ? "—" : `${(selected.result.metrics.dynamicUtil.value * 100).toFixed(1)}%`}</b></dd></div>
                    <div><dt>Dynamic tipping angle</dt><dd><b>{selected.result.metrics.dynamicAngle.value?.toFixed(2) ?? "—"}°</b></dd></div>
                    <div><dt>All-inclusive COG</dt><dd><b>{selected.result.combinedCog.x.toFixed(3)}, {selected.result.combinedCog.y.toFixed(3)}</b></dd></div>
                  </dl>
                  <button className="primary-action apply-result" onClick={() => onApply(selected)}>
                    Apply result
                  </button>
                </>
              ) : <p>Select a ranked valid pass to compare it with the starting configuration.</p>}
            </aside>
          </div>

          <div className="optimiser-log terminal-log">
            <header>
              <div className="terminal-heading"><b>Live activity terminal</b><span>Showing {visibleTerminalEvents.length} of {run.events.length} diagnostic events</span></div>
              <div className="terminal-actions">
                <button onClick={() => void copyTerminal("visible")} disabled={!visibleTerminalText}><IconCopy size={13} /> {copiedLog === "visible" ? "Copied" : "Copy visible"}</button>
                <button onClick={() => void copyTerminal("full")} disabled={!fullTerminalText}><IconCopy size={13} /> {copiedLog === "full" ? "Copied" : "Copy complete log"}</button>
                <button onClick={() => downloadText(fullTerminalText, `${run.runReference || "optimiser"}-diagnostic.log`, "text/plain;charset=utf-8")} disabled={!fullTerminalText}><IconDownload size={13} /> Save log</button>
              </div>
            </header>
            <div className="terminal-output" role="log" aria-live="polite" aria-label="Detailed optimiser diagnostic terminal">
              {visibleTerminalEvents.map((event) => (
                <pre key={event.id} className={`terminal-entry terminal-${event.level.toLowerCase()}`}>{terminalEventText(event)}</pre>
              ))}
              {!visibleTerminalEvents.length && <pre className="terminal-empty">No diagnostic activity has been recorded.</pre>}
            </div>
            <footer className="terminal-footer">The display is limited to the latest {MAX_VISIBLE_TERMINAL_EVENTS} events for responsiveness. Copy complete log includes the full chronological run.</footer>
          </div>
        </div>
      )}
    </section>
  );
}
