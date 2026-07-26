"use client";

import { engineeringLimitsFor } from "../../../engine/core";
import { GROUP_COLOURS } from "../../../geometry/buildGeometryViewModel";
import { closestPointOnSegment } from "../../../geometry/transform";
import { CogMarker, ViewGrid } from "../svg-primitives";
import { pointPath, type EngineeringViewProps } from "./view-types";

const CASE_COLOURS = {
  basic: "#38bdf8",
  slope: "#f59e0b",
  dynamic: "#f472b6",
  comparison: "#ffffff",
} as const;

export function StabilityView(props: EngineeringViewProps) {
  const { vm, transform, width, height, preferences, selectedId, onSelect } = props;
  const svgHeight = Math.max(300, Math.floor(height * 0.66));
  const result = vm.project.result;
  const limits = engineeringLimitsFor(vm.project.model.engineeringDegree);
  const caseDefinitions =
    preferences.loadCase === "comparison"
      ? vm.loadCases.filter((item) => item.mode !== "comparison")
      : vm.loadCases.filter((item) => item.mode === preferences.loadCase);
  const criticalEdge = vm.tippingEdges.find((edge) => edge.critical);
  const foot = criticalEdge
    ? closestPointOnSegment(
        result.analysis.controllingPoint,
        criticalEdge.start,
        criticalEdge.end,
      )
    : null;
  const contributionMax = Math.max(
    1,
    ...result.analysis.groupLoadContributions.flatMap((item) => [
      Math.abs(item.neutralLoadT),
      Math.abs(item.slopeDeltaT),
      Math.abs(item.combinedDynamicDeltaT),
    ]),
  );
  const requiredAngle =
    preferences.loadCase === "basic"
      ? limits.basicAngle
      : preferences.loadCase === "slope"
        ? limits.slopeAngle
        : limits.dynamicAngle;

  return (
    <div className="stability-workspace">
      <div className="stability-canvas">
        <svg
          className="engineering-svg stability-view"
          viewBox={`0 0 ${width} ${svgHeight}`}
          role="img"
          aria-label="Stability polygon, COG envelopes and controlling tipping construction"
          onPointerDown={props.onBackgroundPointerDown}
          onPointerMove={props.onBackgroundPointerMove}
          onPointerUp={props.onBackgroundPointerUp}
          onPointerCancel={props.onBackgroundPointerUp}
          onWheel={props.onWheel}
        >
          <rect className="viewport-hit-area" x={0} y={0} width={width} height={svgHeight} />
          <ViewGrid width={width} height={svgHeight} visible={preferences.grid} />

          <path
            className="stability-polygon"
            d={pointPath(transform, vm.stabilityBoundary.points, true)}
          />
          {vm.tippingEdges.map((edge) => {
            const start = transform.toScreen(edge.start);
            const end = transform.toScreen(edge.end);
            return (
              <g
                key={edge.id}
                className={`svg-selectable tipping-edge-group${
                  selectedId === edge.id ? " is-selected" : ""
                }`}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect(edge.id);
                }}
              >
                <line
                  className={`tipping-edge${edge.critical ? " critical" : ""}`}
                  x1={start.x}
                  y1={start.y}
                  x2={end.x}
                  y2={end.y}
                />
                <text x={(start.x + end.x) / 2} y={(start.y + end.y) / 2 - 7} textAnchor="middle">
                  EDGE {edge.edgeIndex + 1}
                </text>
              </g>
            );
          })}

          {caseDefinitions.map((loadCase) => (
            <g key={loadCase.id} className={`case-envelope case-${loadCase.mode}`}>
              <path
                d={pointPath(transform, loadCase.points, true)}
                style={{ stroke: CASE_COLOURS[loadCase.mode] }}
              />
              {loadCase.points.map((point, index) => {
                const screen = transform.toScreen(point);
                return (
                  <g key={index}>
                    <circle cx={screen.x} cy={screen.y} r={3.5} />
                    {index === 0 && <text x={screen.x + 6} y={screen.y - 6}>N</text>}
                    <desc>
                      {loadCase.mode} case point{" "}
                      {index === 0 ? "N" : ["A", "B", "C", "D"][index - 1] ?? index}
                    </desc>
                  </g>
                );
              })}
            </g>
          ))}

          {vm.envelopes
            .filter(
              (envelope) =>
                envelope.envelopeType === "cargo" ||
                preferences.loadCase === "comparison" ||
                envelope.envelopeType === preferences.loadCase,
            )
            .map((envelope) => (
              <path
                key={envelope.id}
                className={`cog-envelope envelope-${envelope.envelopeType}`}
                style={{ stroke: envelope.colour }}
                d={pointPath(transform, envelope.points, true)}
              />
            ))}

          {vm.groupCentres.map((centre) => {
            const screen = transform.toScreen(centre.point);
            return (
              <g
                key={centre.id}
                className="group-centre"
                style={{ color: GROUP_COLOURS[centre.groupId] }}
              >
                <circle cx={screen.x} cy={screen.y} r={5} />
                <text x={screen.x + 9} y={screen.y - 7}>
                  G{centre.groupId} · {centre.loadT.toFixed(1)} t
                </text>
              </g>
            );
          })}

          {vm.cogs
            .filter(
              (item) =>
                item.available &&
                preferences.visibleCogs[item.cogType] &&
                [
                  "cargo",
                  "load",
                  "all-inclusive",
                  "slope-shifted",
                  "dynamic-shifted",
                  "worst-case",
                ].includes(item.cogType),
            )
            .map((item) => {
              const point = transform.toScreen(item.point);
              return (
                <CogMarker
                  key={item.id}
                  x={point.x}
                  y={point.y}
                  item={item}
                  selected={selectedId === item.id}
                  onSelect={onSelect}
                />
              );
            })}

          {vm.shifts.map((shift) => {
            const start = transform.toScreen(shift.start);
            const end = transform.toScreen(shift.end);
            return (
              <g key={shift.id} className={`shift-arrow shift-${shift.shiftType}`}>
                <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} />
                <circle cx={end.x} cy={end.y} r={2.5} />
                {(shift.shiftType === "combined-dynamic" ||
                  (shift.shiftType === "slope" && preferences.loadCase === "slope")) && (
                  <text x={end.x + 6} y={end.y - 5}>
                    {shift.shiftType.toUpperCase()}
                  </text>
                )}
                <desc>{shift.selection.title}</desc>
              </g>
            );
          })}

          {criticalEdge && foot && (
            <g className="tipping-construction">
              <line
                x1={transform.toScreen(result.analysis.controllingPoint).x}
                y1={transform.toScreen(result.analysis.controllingPoint).y}
                x2={transform.toScreen(foot).x}
                y2={transform.toScreen(foot).y}
              />
              <circle cx={transform.toScreen(foot).x} cy={transform.toScreen(foot).y} r={3} />
              <text
                x={
                  (transform.toScreen(result.analysis.controllingPoint).x +
                    transform.toScreen(foot).x) /
                    2 +
                  7
                }
                y={
                  (transform.toScreen(result.analysis.controllingPoint).y +
                    transform.toScreen(foot).y) /
                  2
                }
              >
                {result.analysis.controllingDistanceM?.toFixed(3) ?? "—"} m ·{" "}
                {result.analysis.controllingAngleDeg?.toFixed(2) ?? "—"}°
              </text>
            </g>
          )}

          <g className="stability-callout" transform={`translate(${Math.max(16, width - 250)} 24)`}>
            <rect width={226} height={160} />
            <text x={12} y={20} className="callout-heading">
              CONTROLLING CONSTRUCTION
            </text>
            <text x={12} y={44}>
              Mode · {result.analysis.controllingMode.toUpperCase()}
            </text>
            <text x={12} y={64}>
              Group · G{result.analysis.controllingGroup ?? "—"}
            </text>
            <text x={12} y={84}>
              Edge · {result.analysis.controllingEdgeIndex + 1}
            </text>
            <text x={12} y={104}>
              Required angle · {requiredAngle.toFixed(1)}°
            </text>
            <text x={12} y={124}>
              Triangle area · {result.groupingQuality.triangleAreaM2.toFixed(3)} m²
            </text>
            <text x={12} y={144}>
              Min. altitude · {result.groupingQuality.minimumAltitudeM.toFixed(3)} m ·{" "}
              {result.groupingQuality.narrow ? "NARROW" : "BROAD"}
            </text>
          </g>
        </svg>
      </div>

      <div className="stability-breakdown">
        <div className="breakdown-heading">
          <div>
            <b>Hydraulic group load contribution</b>
            <span>Authoritative neutral, slope and combined dynamic increments</span>
          </div>
          <span className="unresolved-tag">Wind / acceleration split unavailable</span>
        </div>
        <div className="contribution-chart">
          {result.analysis.groupLoadContributions.map((item) => (
            <div key={item.group} className="contribution-row">
              <b style={{ color: GROUP_COLOURS[item.group] }}>G{item.group}</b>
              <div className="contribution-bars">
                <div
                  className="contribution-bar neutral"
                  style={{ width: `${(Math.abs(item.neutralLoadT) / contributionMax) * 100}%` }}
                  title={`Neutral ${item.neutralLoadT.toFixed(2)} t`}
                />
                <div
                  className={`contribution-bar slope${item.slopeDeltaT < 0 ? " negative" : ""}`}
                  style={{ width: `${(Math.abs(item.slopeDeltaT) / contributionMax) * 100}%` }}
                  title={`Slope delta ${item.slopeDeltaT.toFixed(2)} t`}
                />
                <div
                  className={`contribution-bar dynamic${
                    item.combinedDynamicDeltaT < 0 ? " negative" : ""
                  }`}
                  style={{
                    width: `${(Math.abs(item.combinedDynamicDeltaT) / contributionMax) * 100}%`,
                  }}
                  title={`Combined dynamic delta ${item.combinedDynamicDeltaT.toFixed(2)} t`}
                />
              </div>
              <span>{item.neutralLoadT.toFixed(2)} t</span>
              <span>{item.slopeDeltaT >= 0 ? "+" : ""}{item.slopeDeltaT.toFixed(2)} t</span>
              <span>
                {item.combinedDynamicDeltaT >= 0 ? "+" : ""}
                {item.combinedDynamicDeltaT.toFixed(2)} t
              </span>
            </div>
          ))}
          <div className="contribution-legend">
            <span><i className="neutral" /> Neutral</span>
            <span><i className="slope" /> Slope delta</span>
            <span><i className="dynamic" /> Wind + acceleration delta</span>
          </div>
        </div>
      </div>
    </div>
  );
}
