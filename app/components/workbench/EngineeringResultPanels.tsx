import { hydraulicPressureOutputs } from "../../engine/hydraulic-output";
import type { CalculationResult, MetricValue, ProjectModel } from "../../engine/types";
import { formatEngineering } from "../../geometry/format";
import type { ReactNode } from "react";

function MetricCell({ metric, unit, scale = 1 }: { metric: MetricValue; unit: string; scale?: number }) {
  return <td className={`result-value check-${metric.status.toLowerCase()}`}><b>{metric.value === null ? "N/A" : formatEngineering(metric.value * scale, unit)}</b><small>{metric.active ? metric.status : "INACTIVE"}</small></td>;
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return <section className="engineering-result-box"><header><b>{title}</b>{subtitle && <span>{subtitle}</span>}</header>{children}</section>;
}

export function EngineeringResultPanels({ model, result }: { model: ProjectModel; result: CalculationResult }) {
  const activeTrailers = model.trailers.filter((trailer) => trailer.enabled);
  const definitions = [...new Map(activeTrailers.map((trailer) => [trailer.definitionId, model.catalogue.find((item) => item.id === trailer.definitionId)])).values()].filter(Boolean);
  const totalAxleLines = activeTrailers.reduce((sum, trailer) => sum + trailer.axleLines, 0);
  const ppuCount = activeTrailers.reduce((sum, trailer) => sum + Number(trailer.ppuLeft) + Number(trailer.ppuRight), 0);
  const trailerTareT = activeTrailers.reduce((sum, trailer) => {
    const definition = model.catalogue.find((item) => item.id === trailer.definitionId);
    return sum + trailer.axleLines * (definition?.axleWeightT ?? 0);
  }, 0);
  const ppuMassT = activeTrailers.reduce((sum, trailer) => {
    const definition = model.catalogue.find((item) => item.id === trailer.definitionId);
    return sum + (Number(trailer.ppuLeft) + Number(trailer.ppuRight)) * (definition?.ppuWeightT ?? 0);
  }, 0);
  const pressures = hydraulicPressureOutputs(model, result);
  const pressureByGroup = new Map(pressures.map((pressure) => [pressure.group, pressure]));
  const groundByGroup = new Map(result.groundBearing.groups.map((group) => [group.group, group]));
  const groupIds = result.groups.map((group) => group.group);
  const road = result.roadTransport;

  return <div className="engineering-result-panels">
    <Panel title="Trailer specifications" subtitle={`${activeTrailers.length} train${activeTrailers.length === 1 ? "" : "s"}`}>
      <dl className="result-box-list">
        <div><dt>Model(s)</dt><dd>{definitions.map((definition) => definition!.name).join(" / ") || "N/A"}</dd></div>
        <div><dt>Gross AL capacity</dt><dd>{definitions.map((definition) => formatEngineering(definition!.axleCapacityT, "t")).join(" / ") || "N/A"}</dd></div>
        <div><dt>AL self-weight</dt><dd>{definitions.map((definition) => formatEngineering(definition!.axleWeightT, "t")).join(" / ") || "N/A"}</dd></div>
        <div><dt>Formation</dt><dd>{totalAxleLines} AL · {activeTrailers.length} train{activeTrailers.length === 1 ? "" : "s"}</dd></div>
        <div><dt>PPUs</dt><dd>{ppuCount} · {formatEngineering(ppuMassT, "t")}</dd></div>
        <div><dt>Deck height</dt><dd>{formatEngineering(model.trailerDeckHeightM, "m")}</dd></div>
      </dl>
    </Panel>

    <Panel title="Parameters" subtitle="Calculation inputs">
      <dl className="result-box-list">
        <div><dt>COG envelope X / Y</dt><dd>±{formatEngineering(model.cargo.envelopeX, "m")} / ±{formatEngineering(model.cargo.envelopeY, "m")}</dd></div>
        <div><dt>Route slope long. / trans.</dt><dd>±{formatEngineering(model.environment.routeLongitudinalSlopeDeg, "°")} / ±{formatEngineering(model.environment.routeTransverseSlopeDeg, "°")}</dd></div>
        <div><dt>Design wind</dt><dd>{formatEngineering(model.environment.windSpeedMps, "m/s")}</dd></div>
        <div><dt>Acceleration long. / trans.</dt><dd>{formatEngineering(model.environment.longitudinalAccelerationMps2, "m/s²")} / {formatEngineering(model.environment.transverseAccelerationMps2, "m/s²")}</dd></div>
        <div><dt>Hydraulic boundary</dt><dd>{model.hydraulicSystemMode === "FOUR_POINT" ? "4-point polygon" : "3-point triangle"}</dd></div>
        <div><dt>Minimum active supports</dt><dd>{result.minimumActiveSupports}</dd></div>
      </dl>
    </Panel>

    <Panel title="Trailer loading and capacity" subtitle="Neutral and COG-envelope cases">
      <dl className="result-box-list loading-overview">
        <div><dt>Cargo / packing</dt><dd>{formatEngineering(model.cargo.massT, "t")} / {formatEngineering(model.packing.massT, "t")}</dd></div>
        <div><dt>Trailer tare / PPU</dt><dd>{formatEngineering(trailerTareT, "t")} / {formatEngineering(ppuMassT, "t")}</dd></div>
        <div><dt>All-inclusive mass</dt><dd>{formatEngineering(result.totalMassT, "t")}</dd></div>
        <div><dt>Active supports</dt><dd className={result.activeSupportCount < result.minimumActiveSupports ? "status-nok" : "status-ok"}>{result.activeSupportCount} / {model.supports.length}</dd></div>
      </dl>
      <div className="result-table-scroll"><table className="result-box-table"><thead><tr><th>Load overview</th><th>Total</th>{groupIds.map((group) => <th key={group}>G{group}</th>)}</tr></thead><tbody>
        <tr><th>Active bogies</th><td>{result.groundBearing.totalActiveBogies}</td>{groupIds.map((group) => <td key={group}>{groundByGroup.get(group)?.activeBogies ?? "—"}</td>)}</tr>
        <tr><th>Neutral group load (t)</th><td>{formatEngineering(result.totalMassT, "t")}</td>{groupIds.map((group) => <td key={group}>{formatEngineering(groundByGroup.get(group)?.neutralGroupLoadT, "t")}</td>)}</tr>
        <tr><th>Neutral AL load (t)</th><td>—</td>{groupIds.map((group) => <td key={group}>{formatEngineering(groundByGroup.get(group)?.neutralAxleLineLoadT, "t")}</td>)}</tr>
        <tr><th>Max envelope AL load (t)</th><td>—</td>{groupIds.map((group) => <td key={group}>{formatEngineering(groundByGroup.get(group)?.maximumEnvelopeAxleLineLoadT, "t")}</td>)}</tr>
        <tr><th>Max utilisation</th><td>{formatEngineering(result.metrics.basicUtil.value === null ? null : result.metrics.basicUtil.value * 100, "%")}</td>{groupIds.map((group) => <td key={group}>{formatEngineering((groundByGroup.get(group)?.maximumUtilisation ?? NaN) * 100, "%")}</td>)}</tr>
        <tr><th>Ground bearing pressure</th><td>{formatEngineering(result.groundBearing.overallTPerM2, "t/m²")}</td>{groupIds.map((group) => <td key={group}>{formatEngineering(groundByGroup.get(group)?.pressureTPerM2, "t/m²")}</td>)}</tr>
      </tbody></table></div>
    </Panel>

    <Panel title="Hydraulic suspension" subtitle="bar · level ground at average deck height">
      <div className="result-table-scroll"><table className="result-box-table"><thead><tr><th>Case</th>{groupIds.map((group) => <th key={group}>G{group}</th>)}</tr></thead><tbody>
        {(["neutralBar", "aBar", "bBar", "cBar", "dBar"] as const).map((key, index) => <tr key={key}><th>{["Neutral", "A", "B", "C", "D"][index]}</th>{groupIds.map((group) => <td key={group}>{formatEngineering(pressureByGroup.get(group)?.[key], "bar")}</td>)}</tr>)}
      </tbody></table></div>
      {pressures.some((pressure) => pressure.mixedHydraulicProperties) && <p className="result-box-warning">Mixed hydraulic properties are present in one or more groups; verify the reference trailer data.</p>}
    </Panel>

    <Panel title="Trailer stability" subtitle="All applicable angle checks">
      <div className="result-table-scroll"><table className="result-box-table stability-angle-table"><thead><tr><th>Reference</th><th>Basic + envelope</th><th>Slope + route</th><th>Dynamic + wind/accel.</th></tr></thead><tbody>
        <tr><th>Cargo only</th><MetricCell metric={result.stabilityReferences.cargoBasicAngle} unit="°" /><MetricCell metric={result.stabilityReferences.cargoSlopeAngle} unit="°" /><MetricCell metric={result.stabilityReferences.cargoDynamicAngle} unit="°" /></tr>
        <tr><th>All-inclusive combined COG</th><MetricCell metric={result.metrics.basicAngle} unit="°" /><MetricCell metric={result.metrics.slopeAngle} unit="°" /><MetricCell metric={result.metrics.dynamicAngle} unit="°" /></tr>
      </tbody></table></div>
      <dl className="result-box-list">
        <div><dt>Governing angle</dt><dd className={result.status === "PASS" ? "status-ok" : "status-nok"}>{formatEngineering(result.analysis.controllingAngleDeg, "°")}</dd></div>
        <div><dt>Governing case / point</dt><dd>{result.analysis.controllingMode} · case {result.analysis.controllingCaseIndex + 1}</dd></div>
        <div><dt>Governing edge / group</dt><dd>Edge {result.analysis.controllingEdgeIndex + 1} · G{result.analysis.controllingGroup ?? "—"}</dd></div>
        <div><dt>COG basis</dt><dd className={result.stabilityReferences.combinedCogPassOnly ? "status-nok" : "status-ok"}>{result.stabilityReferences.combinedCogPassOnly ? "COMBINED COG PASS ONLY" : result.stabilityReferences.cargoOnlyPass ? "Cargo-only and combined pass" : "No complete angle pass"}</dd></div>
        <div><dt>Dynamic / static ratio</dt><dd className={`check-${result.metrics.dynamicRatio.status.toLowerCase()}`}>{result.metrics.dynamicRatio.value === null ? "N/A" : formatEngineering(result.metrics.dynamicRatio.value * 100, "%")} · {result.metrics.dynamicRatio.status}</dd></div>
      </dl>
    </Panel>

    <Panel title="Road traction and transport" subtitle={road.enabled ? `${road.surface.replaceAll("_", " ")} · ${road.condition}` : "Check disabled"}>
      {road.enabled ? <dl className="result-box-list">
        <div><dt>Overall status</dt><dd className={road.status === "OK" ? "status-ok" : "status-nok"}>{road.status}</dd></div>
        <div><dt>Friction / rolling resistance</dt><dd>{road.frictionCoefficient.toFixed(3)} / {road.rollingResistanceCoefficient.toFixed(3)}</dd></div>
        <div><dt>Traction demand / capacity</dt><dd>{formatEngineering(road.tractionDemandKN, "kN")} / {formatEngineering(road.tractionCapacityKN, "kN")}</dd></div>
        <div><dt>Traction utilisation</dt><dd className={(road.tractionUtilisation ?? 0) > 1 ? "status-nok" : "status-ok"}>{formatEngineering(road.tractionUtilisation === null ? null : road.tractionUtilisation * 100, "%")}</dd></div>
        <div><dt>Braking demand / capacity</dt><dd>{formatEngineering(road.brakingDemandKN, "kN")} / {formatEngineering(road.brakingCapacityKN, "kN")}</dd></div>
        <div><dt>Braking utilisation</dt><dd className={(road.brakingUtilisation ?? 0) > 1 ? "status-nok" : "status-ok"}>{formatEngineering(road.brakingUtilisation === null ? null : road.brakingUtilisation * 100, "%")}</dd></div>
        <div><dt>Driven / braked bogies</dt><dd>{road.drivenBogieCount} / {road.brakedBogieCount}</dd></div>
        <div><dt>Maximum climb / descent</dt><dd>{formatEngineering(road.maximumClimbGradeDeg, "°")} / {formatEngineering(road.maximumDescentGradeDeg, "°")}</dd></div>
      </dl> : <p className="result-box-empty">Enable the road-transport check in case setup to calculate traction, braking and grade limits.</p>}
    </Panel>
  </div>;
}
