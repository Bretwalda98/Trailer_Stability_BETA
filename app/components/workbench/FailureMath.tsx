import type { CalculationResult, ProjectModel } from "../../engine/types";
import { formatEngineering } from "../../geometry/format";

type FailureRow = { title: string; calculation: string; conclusion: string };

function finite(value: number): string {
  return Number.isFinite(value) ? formatEngineering(value, "kN") : "0.000 kN";
}

/** Explains a failed engineering result from retained calculation values. */
export function failureMath(model: ProjectModel, result: CalculationResult): FailureRow[] {
  const rows: FailureRow[] = [];
  const road = result.roadTransport;
  if (road.enabled && road.status === "NOK") {
    if (road.tractionUtilisation === null || road.tractionUtilisation > 1) {
      const deficit = Math.max(0, road.tractionDemandKN - road.tractionCapacityKN);
      rows.push({
        title: "Traction capacity exceeded",
        calculation: `Demand = rolling ${finite(road.rollingResistanceKN)} + uphill grade ${finite(Math.max(0, road.gradeForceKN))} + acceleration ${finite(road.accelerationForceKN)} = ${finite(road.tractionDemandKN)}. Available = min(adhesion ${finite(road.tractionAdhesionLimitKN)}, mechanical ${finite(road.tractionMechanicalLimitKN)}) = ${finite(road.tractionCapacityKN)}.`,
        conclusion: `${finite(deficit)} shortfall. ${road.tractionCapacityKN <= 0 ? "No driven bogie capacity was credited: add a connected, hydraulically supplied PPU or turn the optional road check off only when road transport is out of scope." : "Reduce uphill grade/acceleration, improve the surface condition, or increase credited driven bogies/PPU capacity."}`,
      });
    }
    if (road.brakingUtilisation === null || road.brakingUtilisation > 1) {
      const deficit = Math.max(0, road.brakingDemandKN - road.brakingCapacityKN);
      rows.push({
        title: "Braking capacity exceeded",
        calculation: `Demand = downhill grade ${finite(Math.max(0, -road.gradeForceKN))} + braking ${finite(road.brakingForceKN)} − rolling ${finite(road.rollingResistanceKN)} = ${finite(road.brakingDemandKN)}. Available = min(adhesion ${finite(road.brakingAdhesionLimitKN)}, mechanical ${finite(road.brakingMechanicalLimitKN)}) = ${finite(road.brakingCapacityKN)}.`,
        conclusion: `${finite(deficit)} shortfall. Reduce descent/brake deceleration, improve adhesion, or increase credited braked bogies.`,
      });
    }
    road.warnings.forEach((warning) => rows.push({ title: "Road-transport input", calculation: warning, conclusion: "Correct the module/PPU configuration before relying on a road result." }));
  }

  const utilisationMetrics = [
    ["Basic static utilisation", result.metrics.basicUtil.value],
    ["Slope utilisation", result.metrics.slopeUtil.value],
    ["Dynamic utilisation", result.metrics.dynamicUtil.value],
    ["Spine-beam utilisation", result.metrics.spineUtil.value],
    ["Shear utilisation", result.metrics.shearUtil.value],
    ["Bending utilisation", result.metrics.bendingUtil.value],
    ["Local bending utilisation", result.metrics.localBendingUtil.value],
  ] as const;
  utilisationMetrics.forEach(([title, value]) => {
    if (value !== null && value > 1) rows.push({
      title,
      calculation: `Utilisation = calculated demand ÷ allowable capacity = ${(value * 100).toFixed(1)}% ÷ 100.0%.`,
      conclusion: `The retained demand exceeds the allowable capacity by ${((value - 1) * 100).toFixed(1)} percentage points. Add capacity or reduce the governing demand.`,
    });
  });

  if (result.status !== "ERROR" && result.activeSupportCount < result.minimumActiveSupports) rows.push({
    title: "Insufficient active supports",
    calculation: `Settled active supports = ${result.activeSupportCount}; required minimum = ${result.minimumActiveSupports}.`,
    conclusion: `${result.minimumActiveSupports - result.activeSupportCount} additional support${result.minimumActiveSupports - result.activeSupportCount === 1 ? " is" : "s are"} needed after reactions settle. Reposition/add supports or specify a verified positive deck connection where tensile restraint is designed.`,
  });
  if (result.metrics.dynamicAngle.status === "NOK" || result.metrics.slopeAngle.status === "NOK" || result.metrics.basicAngle.status === "NOK") rows.push({
    title: "Stability footprint exceeded",
    calculation: `Governing ${result.analysis.controllingMode} COG point is ${result.analysis.controllingDistanceM === null ? "outside the support boundary" : `${result.analysis.controllingDistanceM.toFixed(3)} m from edge ${result.analysis.controllingEdgeIndex + 1}`}; calculated tipping angle = ${result.analysis.controllingAngleDeg === null ? "N/A" : `${result.analysis.controllingAngleDeg.toFixed(2)}°`}.`,
    conclusion: "Increase the support polygon, reduce COG height/envelope or environmental action, or change the trailer formation. The current governing COG basis and edge are retained in the stability table.",
  });
  if (!rows.length && result.status !== "PASS") rows.push({
    title: result.failClass || "Engineering check failed",
    calculation: result.failDetail || "The calculation did not retain a single scalar governing value.",
    conclusion: "Use the named failure and the Engineering details drawer to correct the invalid geometry or input before recalculating.",
  });
  return rows;
}

export function FailureMath({ model, result, compact = false }: { model: ProjectModel; result: CalculationResult; compact?: boolean }) {
  const rows = failureMath(model, result);
  if (!rows.length) return null;
  return <section className={`failure-math${compact ? " compact" : ""}`} aria-label="Mathematical failure explanation">
    <header><b>Why this check fails</b><span>Retained engineering values</span></header>
    {rows.map((row) => <article key={`${row.title}-${row.calculation}`}>
      <b>{row.title}</b><p>{row.calculation}</p><small>{row.conclusion}</small>
    </article>)}
  </section>;
}
