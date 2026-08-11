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
            <div><dt>Hydraulic system</dt><dd>{model.hydraulicSystemMode === "FOUR_POINT" ? "Four-point" : "Three-point"}</dd></div>
            <div><dt>Stability polygon area</dt><dd>{formatEngineering(result.groupingQuality.polygonAreaM2, "m²")}</dd></div>
            <div><dt>Active supports</dt><dd>{result.activeSupportCount} / {model.supports.length}</dd></div>
          </dl>
        </section>
        <section>
          <header><b>Stability and capacity checks</b></header>
          <table className="engineering-table report-checks-table">
            <thead><tr><th>Check</th><th>Result</th><th>Direction</th><th>Status</th></tr></thead>
            <tbody>
              {vm.checks.map((check) => (
                <tr key={check.id}>
                  <td data-label="Check">{check.selection.title}</td>
                  <td data-label="Result">{formatEngineering(check.value, check.unit)}</td>
                  <td data-label="Direction">{check.direction === "lower" ? "Lower is better" : "Higher is better"}</td>
                  <td data-label="Status" className={check.status === "NOK" ? "status-nok" : check.status === "OK" ? "status-ok" : ""}>{check.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section>
          <header><b>COG reference decision</b></header>
          <dl>
            <div><dt>Cargo-only basic tipping</dt><dd className={result.stabilityReferences.cargoBasicAngle.status === "NOK" ? "status-nok" : "status-ok"}>{formatEngineering(result.stabilityReferences.cargoBasicAngle.value, "Â°")}</dd></div>
            <div><dt>Cargo-only slope tipping</dt><dd className={result.stabilityReferences.cargoSlopeAngle.status === "NOK" ? "status-nok" : "status-ok"}>{formatEngineering(result.stabilityReferences.cargoSlopeAngle.value, "Â°")}</dd></div>
            <div><dt>Cargo-only dynamic tipping</dt><dd className={result.stabilityReferences.cargoDynamicAngle.status === "NOK" ? "status-nok" : "status-ok"}>{formatEngineering(result.stabilityReferences.cargoDynamicAngle.value, "°")}</dd></div>
            <div><dt>Cargo-only stability</dt><dd className={result.stabilityReferences.cargoOnlyPass ? "status-ok" : "status-nok"}>{result.stabilityReferences.cargoOnlyPass ? "PASS" : "FAIL"}</dd></div>
            <div><dt>Combined COG required</dt><dd className={result.stabilityReferences.combinedCogRequired ? "status-nok" : "status-ok"}>{result.stabilityReferences.combinedCogRequired ? "YES" : "NO"}</dd></div>
            <div><dt>COG pass basis</dt><dd className={result.stabilityReferences.combinedCogPassOnly ? "status-nok" : "status-ok"}>{result.stabilityReferences.combinedCogPassOnly ? "COMBINED COG PASS ONLY" : result.stabilityReferences.cargoOnlyPass ? "CARGO + COMBINED" : "NO COMPLETE ANGLE PASS"}</dd></div>
          </dl>
          {result.stabilityReferences.combinedCogPassOnly && <p className="report-cog-warning"><b>COMBINED COG PASS ONLY:</b> the cargo-only check fails; the arrangement meets all three stability-angle limits only on the all-inclusive combined COG basis.</p>}
          <p className="report-inline-note">Cargo-only basic, slope and dynamic checks are shown separately. Combined COG governs the arrangement when any cargo-only angle is below its engineering limit. Slope and dynamic results include the configured route/residual slopes, wind and acceleration shifts.</p>
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
        {result.roadTransport?.enabled && (
          <section>
            <header><b>Road transport analysis</b></header>
            <dl>
              <div><dt>Result</dt><dd className={result.roadTransport.status === "OK" ? "status-ok" : "status-nok"}>{result.roadTransport.status}</dd></div>
              <div><dt>Surface / condition</dt><dd>{result.roadTransport.surface.replaceAll("_", " ")} / {result.roadTransport.condition}</dd></div>
              <div><dt>Friction / rolling resistance</dt><dd>{result.roadTransport.frictionCoefficient.toFixed(3)} / {result.roadTransport.rollingResistanceCoefficient.toFixed(3)}</dd></div>
              <div><dt>Driven / braked bogies</dt><dd>{result.roadTransport.drivenBogieCount} / {result.roadTransport.brakedBogieCount}</dd></div>
              <div><dt>Traction demand / capacity</dt><dd>{formatEngineering(result.roadTransport.tractionDemandKN, "kN")} / {formatEngineering(result.roadTransport.tractionCapacityKN, "kN")}</dd></div>
              <div><dt>Traction utilisation</dt><dd>{result.roadTransport.tractionUtilisation === null ? "N/A" : formatEngineering(result.roadTransport.tractionUtilisation * 100, "%")}</dd></div>
              <div><dt>Braking demand / capacity</dt><dd>{formatEngineering(result.roadTransport.brakingDemandKN, "kN")} / {formatEngineering(result.roadTransport.brakingCapacityKN, "kN")}</dd></div>
              <div><dt>Braking utilisation</dt><dd>{result.roadTransport.brakingUtilisation === null ? "N/A" : formatEngineering(result.roadTransport.brakingUtilisation * 100, "%")}</dd></div>
              <div><dt>Maximum climb / descent</dt><dd>{formatEngineering(result.roadTransport.maximumClimbGradeDeg, "°")} / {formatEngineering(result.roadTransport.maximumDescentGradeDeg, "°")}</dd></div>
              <div><dt>Recovered data source</dt><dd>{result.roadTransport.source}</dd></div>
            </dl>
          </section>
        )}
        <section className="report-notes">
          <header><b>Notes, warnings and unresolved display data</b></header>
          {[...result.warnings, ...vm.unresolvedData].map((item) => <p key={item}>{item}</p>)}
          {!result.warnings.length && <p>No calculation warnings were returned for this case.</p>}
        </section>
      </div>
    </section>
  );
}
