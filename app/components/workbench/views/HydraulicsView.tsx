"use client";

import { IconPin, IconPinnedOff } from "@tabler/icons-react";
import type { HydraulicGrouping, ProjectModel } from "../../../engine/types";
import { GROUP_COLOURS } from "../../../geometry/buildGeometryViewModel";
import { buildHydraulicRouteSegments } from "../../../geometry/hydraulic-routes";
import { ViewGrid } from "../svg-primitives";
import { pointPath, type EngineeringViewProps } from "./view-types";

type CornerKey = keyof NonNullable<HydraulicGrouping["cornerGroups"]>;

interface HydraulicsViewProps extends EngineeringViewProps {
  onModelChange(model: ProjectModel): void;
}

function cornerFor(
  trailerIndex: number,
  axleLine: number,
  yM: number,
  vm: EngineeringViewProps["vm"],
): CornerKey {
  const trailer = vm.trailers.find((item) => item.index === trailerIndex);
  const grouping = vm.project.model.groupings[trailerIndex];
  const front = axleLine <= (grouping?.splitAfterAxleLine ?? 1);
  const left = yM <= (trailer?.centreYM ?? 0);
  if (front && left) return "frontLeft";
  if (front) return "frontRight";
  if (left) return "rearLeft";
  return "rearRight";
}

function setCorner(
  model: ProjectModel,
  trailerIndex: number,
  key: CornerKey,
  group: number,
): ProjectModel {
  const next = structuredClone(model);
  const grouping = next.groupings[trailerIndex];
  if (!grouping) return model;
  grouping.cornerGroups = {
    frontLeft: grouping.cornerGroups?.frontLeft ?? 1,
    frontRight: grouping.cornerGroups?.frontRight ?? 2,
    rearLeft: grouping.cornerGroups?.rearLeft ?? 3,
    rearRight: grouping.cornerGroups?.rearRight ?? 3,
    [key]: group,
  };
  return next;
}

export function HydraulicsView(props: HydraulicsViewProps) {
  const { vm, transform, width, height, preferences, selectedId, onSelect, onModelChange } = props;
  const svgHeight = Math.max(250, Math.floor(height * 0.58));
  const model = vm.project.model;
  const sharedPins = model.groupings[0]?.pinnedAxleLines ?? [];
  const routeSegments = buildHydraulicRouteSegments(vm);

  const setSplit = (value: number) => {
    const next = structuredClone(model);
    next.groupings = next.groupings.map((grouping, index) => ({
      ...grouping,
      splitAfterAxleLine: Math.max(
        1,
        Math.min(Math.max(1, (next.trailers[index]?.axleLines ?? 2) - 1), Math.round(value)),
      ),
    }));
    onModelChange(next);
  };

  const togglePin = (line: number) => {
    const pins = sharedPins.includes(line)
      ? sharedPins.filter((value) => value !== line)
      : [...sharedPins, line].sort((a, b) => a - b);
    const next = structuredClone(model);
    next.groupings = next.groupings.map((grouping) => ({
      ...grouping,
      pinnedAxleLines: [...pins],
    }));
    onModelChange(next);
  };

  return (
    <div className="hydraulics-workspace">
      <div className="hydraulic-canvas">
        <svg
          className="engineering-svg hydraulics-view"
          viewBox={`0 0 ${width} ${svgHeight}`}
          role="img"
          aria-label="Interactive hydraulic routing plan"
          onPointerDown={props.onBackgroundPointerDown}
          onPointerMove={props.onBackgroundPointerMove}
          onPointerUp={props.onBackgroundPointerUp}
          onPointerCancel={props.onBackgroundPointerUp}
          onWheel={props.onWheel}
        >
          <rect className="viewport-hit-area" x={0} y={0} width={width} height={svgHeight} />
          <ViewGrid width={width} height={svgHeight} visible={preferences.grid} />
          {vm.trailers.map((trailer) => {
            const start = transform.toScreen({
              x: trailer.startXM,
              y: trailer.centreYM - trailer.widthM / 2,
            });
            const end = transform.toScreen({
              x: trailer.startXM + trailer.lengthM,
              y: trailer.centreYM + trailer.widthM / 2,
            });
            return (
              <g
                key={trailer.id}
                className={`hydraulic-deck${trailer.colliding ? " colliding" : ""}`}
              >
                <rect
                  x={start.x}
                  y={end.y}
                  width={end.x - start.x}
                  height={start.y - end.y}
                />
                <text x={(start.x + end.x) / 2} y={end.y + 16} textAnchor="middle">
                  TRAILER {trailer.index + 1}
                </text>
              </g>
            );
          })}

          {routeSegments.map((segment) => {
            return (
              <path
                key={segment.id}
                className="hydraulic-route"
                style={{ stroke: GROUP_COLOURS[segment.groupId] }}
                d={pointPath(transform, segment.points)}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect(`hydraulic-group:${segment.groupId}`);
                }}
              >
                <desc>
                  G{segment.groupId} · T{segment.trailerIndex + 1} · {segment.side} circuit
                </desc>
              </path>
            );
          })}

          {vm.bogies.map((bogie) => {
            const point = transform.toScreen(bogie.engineeringCoordinates);
            const corner = cornerFor(bogie.trailerIndex, bogie.axleLine, bogie.yM, vm);
            return (
              <g
                key={bogie.id}
                className={`hydraulic-node svg-selectable${bogie.pinned ? " pinned" : ""}${
                  selectedId === bogie.id ? " is-selected" : ""
                }`}
                style={{ color: GROUP_COLOURS[bogie.groupId] }}
                onClick={(event) => {
                  event.stopPropagation();
                  if (bogie.pinned) {
                    onSelect(bogie.id);
                    return;
                  }
                  const nextGroup = bogie.groupId >= 3 ? 1 : bogie.groupId + 1;
                  onModelChange(
                    setCorner(model, bogie.trailerIndex, corner, nextGroup),
                  );
                  onSelect(bogie.id);
                }}
              >
                <rect x={point.x - 8} y={point.y - 5} width={16} height={10} />
                {bogie.pinned && (
                  <text x={point.x} y={point.y - 9} textAnchor="middle">
                    PIN
                  </text>
                )}
                <desc>
                  Click to cycle this {corner.replace(/([A-Z])/g, " $1").toLowerCase()} circuit.
                </desc>
              </g>
            );
          })}

          {vm.groupCentres.map((centre) => {
            const point = transform.toScreen(centre.point);
            return (
              <g
                key={centre.id}
                className="group-centre"
                style={{ color: GROUP_COLOURS[centre.groupId] }}
              >
                <circle cx={point.x} cy={point.y} r={6} />
                <line x1={point.x - 11} y1={point.y} x2={point.x + 11} y2={point.y} />
                <line x1={point.x} y1={point.y - 11} x2={point.x} y2={point.y + 11} />
                <text
                  x={point.x + 12}
                  y={point.y - 8 + (centre.groupId - 2) * 14}
                >
                  G{centre.groupId}
                </text>
                <desc>
                  G{centre.groupId} centre: X {centre.point.x.toFixed(3)} m, Y{" "}
                  {centre.point.y.toFixed(3)} m
                </desc>
              </g>
            );
          })}

          {vm.trailers.map((trailer) => {
            const grouping = model.groupings[trailer.index];
            const splitAxle = vm.axleLines.find(
              (axle) =>
                axle.trailerIndex === trailer.index &&
                axle.axleLine === grouping?.splitAfterAxleLine,
            );
            if (!splitAxle) return null;
            const split = transform.toScreen({
              x: splitAxle.xM,
              y: trailer.centreYM,
            });
            return (
              <g key={`split-${trailer.id}`} className="split-marker">
                <line x1={split.x} y1={0} x2={split.x} y2={svgHeight} />
                <text x={split.x + 5} y={22}>
                  SPLIT AFTER AL {grouping.splitAfterAxleLine}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="hydraulic-editor">
        <div className="hydraulic-summary">
          {[1, 2, 3].map((groupId) => {
            const group = vm.groups.find((item) => item.groupId === groupId);
            const centre = vm.groupCentres.find((item) => item.groupId === groupId);
            return (
              <div key={groupId} className="hydraulic-summary-cell">
                <span style={{ color: GROUP_COLOURS[groupId] }}>G{groupId}</span>
                <b>{group?.netStaticLoadT.toFixed(2) ?? "—"} t</b>
                <small>
                  {group?.activeAxleLineCount ?? 0} AL · {group?.activeBogieCount ?? 0} bogies
                </small>
                <small>
                  X {centre?.point.x.toFixed(3) ?? "—"} · Y {centre?.point.y.toFixed(3) ?? "—"}
                </small>
              </div>
            );
          })}
          <label className="technical-field">
            <span>Split after axle line</span>
            <input
              type="number"
              min={1}
              max={Math.max(1, (model.trailers[0]?.axleLines ?? 2) - 1)}
              value={model.groupings[0]?.splitAfterAxleLine ?? 1}
              onChange={(event) => setSplit(Number(event.target.value))}
            />
          </label>
          <div
            className={`hydraulic-quality${
              vm.project.result.groupingQuality.narrow ||
              vm.project.result.groupingQuality.dispersedGroups.length
                ? " warning"
                : ""
            }`}
          >
            <b>
              {vm.project.result.groups.length !== 3
                ? "INVALID GROUPING"
                : vm.project.result.groupingQuality.narrow
                  ? "NARROW TRIANGLE"
                  : vm.project.result.groupingQuality.dispersedGroups.length
                    ? "DISPERSED GROUP"
                    : "THREE LOCAL GROUPS"}
            </b>
            <span>
              Triangle area {vm.project.result.groupingQuality.triangleAreaM2.toFixed(3)} m²
              {" · "}minimum altitude{" "}
              {vm.project.result.groupingQuality.minimumAltitudeM.toFixed(3)} m
              {vm.project.result.groupingQuality.dispersedGroups.length
                ? ` · check ${vm.project.result.groupingQuality.dispersedGroups
                    .map((group) => `G${group}`)
                    .join(", ")}`
                : ""}
            </span>
          </div>
        </div>

        <div className="table-scroll">
          <table className="engineering-table hydraulic-table">
            <thead>
              <tr>
                <th>Trailer</th>
                <th>AL</th>
                <th>X (m)</th>
                <th>Left circuit</th>
                <th>Right circuit</th>
                <th>Pinned</th>
                <th>Load (t)</th>
                <th>Util.</th>
              </tr>
            </thead>
            <tbody>
              {vm.axleLines.map((axle) => {
                const bogies = vm.bogies.filter(
                  (bogie) =>
                    bogie.trailerIndex === axle.trailerIndex &&
                    bogie.axleLine === axle.axleLine,
                );
                const trailer = vm.trailers.find(
                  (item) => item.index === axle.trailerIndex,
                );
                const left = bogies
                  .filter((bogie) => bogie.yM <= (trailer?.centreYM ?? 0))
                  .sort((a, b) => a.yM - b.yM)[0];
                const right = bogies
                  .filter((bogie) => bogie.yM > (trailer?.centreYM ?? 0))
                  .sort((a, b) => b.yM - a.yM)[0];
                const leftCorner = left
                  ? cornerFor(left.trailerIndex, left.axleLine, left.yM, vm)
                  : null;
                const rightCorner = right
                  ? cornerFor(right.trailerIndex, right.axleLine, right.yM, vm)
                  : null;
                return (
                  <tr
                    key={axle.id}
                    className={selectedId === axle.id ? "is-selected" : ""}
                    onClick={() => onSelect(axle.id)}
                  >
                    <td>T{axle.trailerIndex + 1}</td>
                    <td>{axle.axleLine}</td>
                    <td>{axle.xM.toFixed(3)}</td>
                    <td>
                      {left && leftCorner ? (
                        <select
                          aria-label={`Trailer ${axle.trailerIndex + 1} axle ${axle.axleLine} left circuit`}
                          value={left.groupId}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) =>
                            onModelChange(
                              setCorner(
                                model,
                                axle.trailerIndex,
                                leftCorner,
                                Number(event.target.value),
                              ),
                            )
                          }
                        >
                          <option value={1}>G1</option>
                          <option value={2}>G2</option>
                          <option value={3}>G3</option>
                        </select>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      {right && rightCorner ? (
                        <select
                          aria-label={`Trailer ${axle.trailerIndex + 1} axle ${axle.axleLine} right circuit`}
                          value={right.groupId}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) =>
                            onModelChange(
                              setCorner(
                                model,
                                axle.trailerIndex,
                                rightCorner,
                                Number(event.target.value),
                              ),
                            )
                          }
                        >
                          <option value={1}>G1</option>
                          <option value={2}>G2</option>
                          <option value={3}>G3</option>
                        </select>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <button
                        className={`icon-button pin-button${axle.pinned ? " active" : ""}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          togglePin(axle.axleLine);
                        }}
                        title={axle.pinned ? "Unpin axle line" : "Pin axle line"}
                      >
                        {axle.pinned ? <IconPin size={15} /> : <IconPinnedOff size={15} />}
                      </button>
                    </td>
                    <td>{axle.loadT.toFixed(2)}</td>
                    <td>{(axle.utilisation * 100).toFixed(1)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
