"use client";

import {
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
  const ranked = useMemo(
    () =>
      run.passes
        .filter((pass) => pass.overallRank !== null)
        .sort((a, b) => (a.overallRank ?? Number.MAX_SAFE_INTEGER) - (b.overallRank ?? Number.MAX_SAFE_INTEGER)),
    [run.passes],
  );
  const [selectedPassId, setSelectedPassId] = useState("");
  useEffect(() => {
    if (!ranked.length) return;
    if (!ranked.some((pass) => pass.id === selectedPassId)) setSelectedPassId(ranked[0].id);
  }, [ranked, selectedPassId]);
  const selected = ranked.find((pass) => pass.id === selectedPassId) ?? null;
  const arrangementRun = run.passes.some((pass) => Boolean(pass.arrangement));
  const running = run.state === "RUNNING" || run.state === "PLANNING";
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
                      <th>Rank</th><th>Pass ref</th>
                      {arrangementRun && <><th>Trains</th><th>AL/train</th><th>Total AL</th><th>Pitch</th><th>Width</th><th>Modules/train</th></>}
                      {!arrangementRun && <th>AL</th>}
                      <th>Split</th><th>X (m)</th><th>Pins</th><th>Supports</th><th>Dyn. util.</th><th>Dyn. angle</th><th>Defl.</th><th>Rating</th>
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

          <div className="optimiser-log">
            <header><b>Live activity</b><span>Latest {Math.min(8, run.events.length)} of {run.events.length}</span></header>
            {run.events.slice(-8).reverse().map((event) => (
              <div key={event.id} className={`log-${event.level.toLowerCase()}`}>
                <time>{formatDuration(event.elapsedMs)}</time>
                <span>{event.phase}</span>
                <b>{event.message}</b>
                <em>{event.detail}</em>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
