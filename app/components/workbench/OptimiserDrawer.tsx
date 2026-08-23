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
import { downloadText } from "../../engine/download";
import { arrangementComparisons } from "../../engine/arrangement-comparison";
import {
  diagnosticEventSummary,
  optimiserDiagnosticJson,
  optimiserDiagnosticMarkdown,
} from "../../engine/optimiser-diagnostics";
import { formatDuration } from "../../geometry/format";

const MAX_VISIBLE_TERMINAL_EVENTS = 240;

type CandidateSortKey =
  | "rank" | "passRef" | "trains" | "axleLines" | "totalAxleLines" | "pitch"
  | "width" | "modules" | "hydraulics" | "split" | "x" | "pins" | "supports"
  | "cargoOnly" | "dynamicUtil" | "dynamicAngle" | "deflection" | "rating";
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
      case "hydraulics": return pass.arrangement?.hydraulicSystemMode === "FOUR_POINT" ? 4 : pass.arrangement ? 3 : null;
      case "split": return pass.d138;
      case "x": return pass.e89;
      case "pins": return pass.pinnedAxleLines.length;
      case "supports": return pass.result.activeSupportCount;
      case "cargoOnly": return pass.result.stabilityReferences.cargoOnlyPass ? 0 : 1;
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
  const trainCountComparisons = useMemo(() => {
    const bestByTrainCount = new Map<number, PassResult>();
    [...run.passes]
      .filter((pass) => pass.overallRank !== null && pass.arrangement)
      .sort((left, right) => (left.overallRank ?? Infinity) - (right.overallRank ?? Infinity))
      .forEach((pass) => {
        const trainCount = pass.arrangement!.trainCount;
        if (!bestByTrainCount.has(trainCount)) bestByTrainCount.set(trainCount, pass);
      });
    return [...bestByTrainCount.values()].sort(
      (left, right) => left.arrangement!.trainCount - right.arrangement!.trainCount,
    );
  }, [run.passes]);
  const paretoComparisons = useMemo(
    () => arrangementRun && startModel ? arrangementComparisons(run.passes, startModel) : [],
    [arrangementRun, run.passes, startModel],
  );
  const [selectedPassId, setSelectedPassId] = useState("");
  const effectiveSelectedPassId = ranked.some((pass) => pass.id === selectedPassId)
    ? selectedPassId
    : (ranked[0]?.id ?? "");
  const selected = ranked.find((pass) => pass.id === effectiveSelectedPassId) ?? null;
  const running = run.state === "RUNNING" || run.state === "PLANNING";
  const [copiedLog, setCopiedLog] = useState<"visible" | "full" | null>(null);
  const [logSearch, setLogSearch] = useState("");
  const [logLevel, setLogLevel] = useState<"ALL" | OptimiserRun["events"][number]["level"]>("ALL");
  const [logPhase, setLogPhase] = useState("ALL");
  const [failuresOnly, setFailuresOnly] = useState(false);
  const [candidateMenu, setCandidateMenu] = useState<{ passId: string; x: number; y: number } | null>(null);
  useEffect(() => {
    if (!candidateMenu) return;
    const close = () => setCandidateMenu(null);
    window.addEventListener("pointerdown", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("blur", close);
    };
  }, [candidateMenu]);
  const logPhases = [...new Set(run.events.map((event) => event.phase))];
  const filteredTerminalEvents = run.events.filter((event) => {
    const summary = diagnosticEventSummary(event);
    const matchesText = !logSearch.trim() || `${event.caseReference} ${event.stage} ${event.message} ${event.detail}`.toLowerCase().includes(logSearch.trim().toLowerCase());
    return matchesText && (logLevel === "ALL" || event.level === logLevel) && (logPhase === "ALL" || event.phase === logPhase) && (!failuresOnly || summary.failed);
  });
  const visibleTerminalEvents = filteredTerminalEvents.slice(0, MAX_VISIBLE_TERMINAL_EVENTS).reverse();
  const visibleTerminalText = diagnosticText(visibleTerminalEvents);
  const fullTerminalText = diagnosticText(run.events);
  const diagnosticMarkdown = optimiserDiagnosticMarkdown(run, startModel);
  const diagnosticJson = optimiserDiagnosticJson(run, startModel);
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
        <span><IconTargetArrow size={15} /> Arrangement search · {run.state}</span>
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
              {!running && selected && <button className="primary-action optimiser-apply-selected" onClick={() => onApply(selected)}><IconTargetArrow size={14} /> Apply selected</button>}
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
              {paretoComparisons.length > 0 && (
                <section className="pareto-comparison" aria-labelledby="pareto-comparison-title">
                  <header><span><b id="pareto-comparison-title">Arrangement trade-offs</b><small>Only exact engineering PASS candidates are eligible</small></span><em>Selected objective order: {startModel?.arrangementOptimiser.objectivePresetName}</em></header>
                  <div>
                    {paretoComparisons.map((comparison) => (
                      <button type="button" key={comparison.kind} className={`${effectiveSelectedPassId === comparison.pass.id ? "is-selected " : ""}${comparison.dominated ? "is-dominated" : "is-pareto"}`} onClick={() => setSelectedPassId(comparison.pass.id)}>
                        <span><b>{comparison.label}</b><small>{comparison.pass.id}</small></span>
                        <strong>{comparison.metrics.totalAxleLines} AL · {comparison.metrics.trains} train{comparison.metrics.trains === 1 ? "" : "s"}</strong>
                        <dl>
                          <div><dt>Pitch / width</dt><dd>{comparison.metrics.spacingM.toFixed(2)} / {comparison.metrics.widthM.toFixed(2)} m</dd></div>
                          <div><dt>Peak util.</dt><dd>{(comparison.metrics.peakUtilisation * 100).toFixed(1)}%</dd></div>
                          <div><dt>Stability margin</dt><dd>{comparison.metrics.stabilityMarginDeg.toFixed(2)}°</dd></div>
                          <div><dt>Support reserve</dt><dd>+{comparison.metrics.supportReserve}</dd></div>
                          <div><dt>Deflection</dt><dd>{comparison.metrics.deflectionMm.toFixed(2)} mm</dd></div>
                          <div><dt>Rating</dt><dd>{comparison.metrics.rating.toFixed(3)}</dd></div>
                        </dl>
                        <small className="pareto-status">{comparison.dominated ? `Dominated by ${comparison.dominatedBy.slice(0, 2).join(", ")}` : "Pareto candidate"}</small>
                      </button>
                    ))}
                  </div>
                </section>
              )}
              {arrangementRun && trainCountComparisons.length > 0 && (
                <nav className="train-count-comparisons" aria-label="Best arrangement by train count">
                  <span>Best by train count</span>
                  <div>
                    {trainCountComparisons.map((pass) => (
                      <button
                        type="button"
                        key={pass.id}
                        className={effectiveSelectedPassId === pass.id ? "is-selected" : ""}
                        onClick={() => setSelectedPassId(pass.id)}
                        title={`Select ${pass.arrangement!.trainCount}-train comparison result ${pass.id}`}
                      >
                        <b>{pass.arrangement!.trainCount}T</b>
                        <span>{pass.arrangement!.totalAxleLines} AL</span>
                        <small>#{pass.overallRank}</small>
                      </button>
                    ))}
                  </div>
                </nav>
              )}
              <div className="table-scroll">
                <table className="engineering-table">
                  <thead>
                    <tr>
                      {sortableHeaders("Rank", "rank")}{sortableHeaders("Pass ref", "passRef")}
                      {arrangementRun && <>{sortableHeaders("Trains", "trains")}{sortableHeaders("AL/train", "axleLines")}{sortableHeaders("Total AL", "totalAxleLines")}{sortableHeaders("Hydraulics", "hydraulics")}{sortableHeaders("Pitch", "pitch")}{sortableHeaders("Width", "width")}{sortableHeaders("Modules/train", "modules")}</>}
                      {!arrangementRun && sortableHeaders("AL", "axleLines")}
                      {sortableHeaders("Split", "split")}{sortableHeaders("X (m)", "x")}{sortableHeaders("Pins", "pins")}{sortableHeaders("Supports", "supports")}{sortableHeaders("Cargo-only", "cargoOnly")}{sortableHeaders("Dyn. util.", "dynamicUtil")}{sortableHeaders("Dyn. angle", "dynamicAngle")}{sortableHeaders("Defl.", "deflection")}{sortableHeaders("Rating", "rating")}
                    </tr>
                  </thead>
                  <tbody>
                    {ranked.map((pass) => (
                      <tr
                        key={pass.id}
                        className={effectiveSelectedPassId === pass.id ? "is-selected" : ""}
                        tabIndex={0}
                        onClick={() => setSelectedPassId(pass.id)}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          setSelectedPassId(pass.id);
                          setCandidateMenu({ passId: pass.id, x: event.clientX, y: event.clientY });
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
                            event.preventDefault();
                            const bounds = event.currentTarget.getBoundingClientRect();
                            setSelectedPassId(pass.id);
                            setCandidateMenu({ passId: pass.id, x: bounds.left + 24, y: bounds.top + 24 });
                          }
                        }}
                      >
                        <td>{pass.overallRank}</td>
                        <td>{pass.id}</td>
                        {arrangementRun ? (
                          <>
                            <td>{pass.arrangement?.trainCount ?? "—"}</td>
                            <td>{pass.arrangement?.axleLinesPerTrain ?? pass.c89}</td>
                            <td>{pass.arrangement?.totalAxleLines ?? "—"}</td>
                            <td>{pass.arrangement ? pass.arrangement.hydraulicSystemMode === "FOUR_POINT" ? "4-point" : "3-point" : "—"}</td>
                            <td>{pass.arrangement ? `${pass.arrangement.pitchM.toFixed(3)} m` : "—"}</td>
                            <td>{pass.arrangement ? `${pass.arrangement.overallWidthM.toFixed(3)} m` : "—"}</td>
                            <td>{pass.arrangement ? [pass.arrangement.modules6 && `${pass.arrangement.modules6}×6`, pass.arrangement.modules5 && `${pass.arrangement.modules5}×5`, pass.arrangement.modules4 && `${pass.arrangement.modules4}×4`].filter(Boolean).join(" + ") : "—"}</td>
                          </>
                        ) : <td>{pass.c89}</td>}
                        <td>{pass.d138}</td>
                        <td>{pass.e89.toFixed(3)}</td>
                        <td>{pass.pinnedAxleLines.join(", ") || "—"}</td>
                        <td>{pass.result.activeSupportCount}</td>
                        <td className={pass.result.stabilityReferences.cargoOnlyPass ? "status-ok" : "status-nok"}>{pass.result.stabilityReferences.cargoOnlyPass ? "PASS" : pass.result.stabilityReferences.combinedCogPassOnly ? "COMBINED ONLY" : "FAIL"}</td>
                        <td>{pass.result.metrics.dynamicUtil.value === null ? "—" : `${(pass.result.metrics.dynamicUtil.value * 100).toFixed(1)}%`}</td>
                        <td>{pass.result.metrics.dynamicAngle.value?.toFixed(2) ?? "—"}°</td>
                        <td>{pass.result.beam.absoluteDeflectionMm.toFixed(3)} mm</td>
                        <td>{pass.rating?.toFixed(3) ?? "—"}</td>
                      </tr>
                    ))}
                    {!ranked.length && <tr><td colSpan={arrangementRun ? 18 : 12}>No valid ranked passes yet.</td></tr>}
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
                        <div><dt>Hydraulic system</dt><dd><b>{selected.arrangement.hydraulicSystemMode === "FOUR_POINT" ? "Four-point polygon" : "Three-point triangle"}</b></dd></div>
                        <div><dt>Module build per train</dt><dd><b>{[selected.arrangement.modules6 && `${selected.arrangement.modules6}×6`, selected.arrangement.modules5 && `${selected.arrangement.modules5}×5`, selected.arrangement.modules4 && `${selected.arrangement.modules4}×4`].filter(Boolean).join(" + ")}</b></dd></div>
                        <div><dt>Equal centre spacing</dt><dd><b>{selected.arrangement.pitchM.toFixed(3)} m</b></dd></div>
                        <div><dt>Overall formation width</dt><dd><b>{selected.arrangement.overallWidthM.toFixed(3)} m</b></dd></div>
                        <div><dt>Longitudinal formation</dt><dd><b>{selected.arrangement.formationMode === "STAGGERED" ? `${selected.arrangement.longitudinalSpanM.toFixed(3)} m stagger` : "In-line"}</b></dd></div>
                        {selected.arrangement.formationMode === "STAGGERED" && <div><dt>Train X offsets</dt><dd><b>{selected.arrangement.longitudinalOffsetsM.map((value) => value.toFixed(3)).join(" / ")} m</b></dd></div>}
                      </>
                    )}
                    <div><dt>Axle lines</dt><dd>{startModel?.trailers[0]?.axleLines ?? "—"} → <b>{selected.c89}</b></dd></div>
                    <div><dt>Split after</dt><dd>{startModel?.groupings[0]?.splitAfterAxleLine ?? "—"} → <b>{selected.d138}</b></dd></div>
                    <div><dt>Trailer X</dt><dd>{startModel?.trailers[0]?.xM.toFixed(3) ?? "—"} → <b>{selected.e89.toFixed(3)} m</b></dd></div>
                    <div><dt>Pinned lines</dt><dd>{startModel?.groupings[0]?.pinnedAxleLines.join(", ") || "none"} → <b>{selected.pinnedAxleLines.join(", ") || "none"}</b></dd></div>
                    <div><dt>Active supports</dt><dd><b>{selected.result.activeSupportCount}</b></dd></div>
                    <div><dt>Cargo-only stability</dt><dd><b className={selected.result.stabilityReferences.cargoOnlyPass ? "status-ok" : "status-nok"}>{selected.result.stabilityReferences.cargoOnlyPass ? "PASS" : selected.result.stabilityReferences.combinedCogPassOnly ? "COMBINED COG PASS ONLY" : "FAIL"}</b></dd></div>
                    {selected.result.roadTransport.enabled && <div><dt>Road transport</dt><dd><b>{selected.result.roadTransport.status} · traction {selected.result.roadTransport.tractionUtilisation === null ? "N/A" : `${(selected.result.roadTransport.tractionUtilisation * 100).toFixed(1)}%`} · braking {selected.result.roadTransport.brakingUtilisation === null ? "N/A" : `${(selected.result.roadTransport.brakingUtilisation * 100).toFixed(1)}%`}</b></dd></div>}
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

          {candidateMenu && (() => {
            const pass = ranked.find((item) => item.id === candidateMenu.passId);
            return pass ? <div className="candidate-context-menu" role="menu" style={{ left: candidateMenu.x, top: candidateMenu.y }} onPointerDown={(event) => event.stopPropagation()}>
              <header><span>ARRANGEMENT</span><b>{pass.id}</b></header>
              <button type="button" role="menuitem" onClick={() => { setCandidateMenu(null); onApply(pass); }}><IconTargetArrow size={15} /> Apply this result</button>
            </div> : null;
          })()}

          <div className="optimiser-log terminal-log">
            <header>
              <div className="terminal-heading"><b>Search activity</b><span>Showing {visibleTerminalEvents.length} of {filteredTerminalEvents.length} matching · {run.events.length} recorded</span></div>
              <div className="terminal-actions">
                <button onClick={() => void copyTerminal("visible")} disabled={!visibleTerminalText}><IconCopy size={13} /> {copiedLog === "visible" ? "Copied" : "Copy visible"}</button>
                <button onClick={() => void copyTerminal("full")} disabled={!fullTerminalText}><IconCopy size={13} /> {copiedLog === "full" ? "Copied" : "Copy complete log"}</button>
                <button onClick={() => downloadText(diagnosticMarkdown, `${run.runReference || "optimiser"}-audit.md`, "text/markdown;charset=utf-8")} disabled={!run.events.length}><IconDownload size={13} /> Audit Markdown</button>
                <button onClick={() => downloadText(diagnosticJson, `${run.runReference || "optimiser"}-audit.json`, "application/json;charset=utf-8")} disabled={!run.events.length}><IconDownload size={13} /> Lossless JSON</button>
              </div>
            </header>
            <div className="terminal-filters" aria-label="Search activity filters">
              <label><span>Find</span><input type="search" value={logSearch} onChange={(event) => setLogSearch(event.target.value)} placeholder="Case, stage, metric or reason" /></label>
              <label><span>Level</span><select value={logLevel} onChange={(event) => setLogLevel(event.target.value as typeof logLevel)}><option value="ALL">All levels</option>{(["INFO", "PASS", "WARN", "ERROR", "BEST"] as const).map((level) => <option key={level} value={level}>{level}</option>)}</select></label>
              <label><span>Phase</span><select value={logPhase} onChange={(event) => setLogPhase(event.target.value)}><option value="ALL">All phases</option>{logPhases.map((phase) => <option key={phase} value={phase}>{phase}</option>)}</select></label>
              <label className="terminal-failure-toggle"><input type="checkbox" checked={failuresOnly} onChange={(event) => setFailuresOnly(event.target.checked)} /><span>Failures only</span></label>
            </div>
            <div className="terminal-output" role="log" aria-live="polite" aria-label="Detailed arrangement-search activity log">
              {visibleTerminalEvents.map((event) => {
                const summary = diagnosticEventSummary(event);
                return <article key={event.id} className={`terminal-entry terminal-${event.level.toLowerCase()}${summary.failed ? " terminal-failed" : ""}`}>
                  <header><span>[{formatDuration(event.elapsedMs)}] <b>{event.level}</b> · {event.phase}/{event.stage}</span><em>{event.caseReference || "RUN"}</em></header>
                  <p>{event.message}</p>
                  {summary.failedConstraint && <strong>Failed constraint · {summary.failedConstraint}</strong>}
                  {event.detail && <pre>{event.detail}</pre>}
                </article>;
              })}
              {!visibleTerminalEvents.length && <pre className="terminal-empty">No search activity has been recorded.</pre>}
            </div>
            <footer className="terminal-footer">The display is limited to the latest {MAX_VISIBLE_TERMINAL_EVENTS} matching events. Markdown is human-readable; JSON retains the full starting model, candidates, metrics, support transitions and chronology.</footer>
          </div>
        </div>
      )}
    </section>
  );
}
