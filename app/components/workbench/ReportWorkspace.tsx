"use client";

import { IconAlertTriangle, IconCheck, IconDownload, IconFileReport } from "@tabler/icons-react";
import type { ProjectModel } from "../../engine/types";
import { downloadText } from "../../engine/workbook";
import { engineeringDetailsCsv, buildEngineeringDetailRows } from "../../geometry/details";
import { formatEngineering, statusLabel } from "../../geometry/format";
import type { GeometryViewModel } from "../../geometry/types";

export function ReportWorkspace({
  model,
  vm,
}: {
  model: ProjectModel;
  vm: GeometryViewModel;
}) {
  const result = vm.project.result;
  const rows = buildEngineeringDetailRows(model, result);
  return (
    <section className="report-workspace">
      <header className="workspace-titlebar">
        <div>
          <span>REPORT</span>
          <h1>{model.cargo.name}</h1>
          <p>{model.cargo.clientReference} · {model.cargo.ownerReference} · {model.engineeringDegree} degree verification</p>
        </div>
        <div className={`report-verdict verdict-${result.status.toLowerCase()}`}>
          {result.status === "PASS" ? <IconCheck size={20} /> : <IconAlertTriangle size={20} />}
          <span>ENGINEERING RESULT</span>
          <b>{statusLabel(result.status)}</b>
        </div>
      </header>
      <div className="report-actions">
        <button onClick={() => downloadText(engineeringDetailsCsv(rows), `${model.cargo.name || "trailer-stability"}-engineering-report.csv`)}>
          <IconDownload size={14} /> Export detailed CSV
        </button>
        <button onClick={() => downloadText(JSON.stringify({ model, result }, null, 2), `${model.cargo.name || "trailer-stability"}-calculation.json`, "application/json")}>
          <IconDownload size={14} /> Export calculation JSON
        </button>
      </div>
      <div className="report-grid">
        <section>
          <header><IconFileReport size={15} /><b>Case definition</b></header>
          <dl>
            <div><dt>Reference point</dt><dd>{model.referencePoint}</dd></div>
            <div><dt>Weight / COG reference</dt><dd>{model.weightCogReference}</dd></div>
            <div><dt>Cargo dimensions</dt><dd>{model.cargo.lengthM.toFixed(3)} × {model.cargo.widthM.toFixed(3)} × {model.cargo.heightM.toFixed(3)} m</dd></div>
            <div><dt>Cargo mass</dt><dd>{formatEngineering(model.cargo.massT, "t")}</dd></div>
            <div><dt>All-inclusive mass</dt><dd>{formatEngineering(result.totalMassT, "t")}</dd></div>
            <div><dt>Trailer units</dt><dd>{model.trailers.length}</dd></div>
            <div><dt>Active supports</dt><dd>{result.activeSupportCount} / {model.supports.length}</dd></div>
          </dl>
        </section>
        <section>
          <header><b>Stability and capacity checks</b></header>
          <table className="engineering-table">
            <thead><tr><th>Check</th><th>Result</th><th>Direction</th><th>Status</th></tr></thead>
            <tbody>
              {vm.checks.map((check) => (
                <tr key={check.id}>
                  <td>{check.selection.title}</td>
                  <td>{formatEngineering(check.value, check.unit)}</td>
                  <td>{check.direction === "lower" ? "Lower is better" : "Higher is better"}</td>
                  <td className={check.status === "NOK" ? "status-nok" : check.status === "OK" ? "status-ok" : ""}>{check.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section>
          <header><b>Controlling condition</b></header>
          <dl>
            <div><dt>Mode</dt><dd>{result.analysis.controllingMode}</dd></div>
            <div><dt>Case index</dt><dd>{result.analysis.controllingCaseIndex}</dd></div>
            <div><dt>Hydraulic group</dt><dd>G{result.analysis.controllingGroup ?? "—"}</dd></div>
            <div><dt>Tipping edge</dt><dd>{result.analysis.controllingEdgeIndex + 1}</dd></div>
            <div><dt>Distance to edge</dt><dd>{formatEngineering(result.analysis.controllingDistanceM, "m")}</dd></div>
            <div><dt>Tipping angle</dt><dd>{formatEngineering(result.analysis.controllingAngleDeg, "°")}</dd></div>
            <div><dt>Maximum group load</dt><dd>{formatEngineering(result.analysis.maximumGroupLoadT, "t")}</dd></div>
            <div><dt>Maximum axle load</dt><dd>{formatEngineering(result.analysis.maximumAxleLoadT, "t")}</dd></div>
          </dl>
        </section>
        <section>
          <header><b>Spine beam</b></header>
          <dl>
            <div><dt>Analysed trailer</dt><dd>T{model.analysedTrailer}</dd></div>
            <div><dt>Load case</dt><dd>{model.spineLoadCase}</dd></div>
            <div><dt>Maximum shear</dt><dd>{formatEngineering(result.beam.shearMaxKN, "kN")} at {formatEngineering(result.beam.shearMaxXM, "m")}</dd></div>
            <div><dt>Maximum bending</dt><dd>{formatEngineering(result.beam.bendingMaxKNm, "kNm")} at {formatEngineering(result.beam.bendingMaxXM, "m")}</dd></div>
            <div><dt>Absolute deflection</dt><dd>{formatEngineering(result.beam.absoluteDeflectionMm, "mm")} at {formatEngineering(result.beam.deflectionPeakXM, "m")}</dd></div>
            <div><dt>Calculation time</dt><dd>{result.calculationMs.toFixed(2)} ms</dd></div>
          </dl>
        </section>
        <section className="report-notes">
          <header><b>Notes, warnings and unresolved display data</b></header>
          {[...result.warnings, ...vm.unresolvedData].map((item) => <p key={item}>{item}</p>)}
          {!result.warnings.length && <p>No calculation warnings were returned for this case.</p>}
        </section>
      </div>
    </section>
  );
}
