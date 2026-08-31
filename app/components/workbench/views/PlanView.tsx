"use client";

import { GROUP_COLOURS } from "../../../geometry/buildGeometryViewModel";
import { buildHydraulicRouteSegments } from "../../../geometry/hydraulic-routes";
import { engineeringRectPoints } from "../../../geometry/transform";
import { localToWorld, trailerFootprint } from "../../../engine/placement";
import { deckPpuFootprint } from "../../../engine/deck-ppus";
import {
  AxisGlyph,
  CogMarker,
  DimensionLine,
  LongitudinalOrientation,
  ViewGrid,
} from "../svg-primitives";
import { pointPath, type EngineeringViewProps } from "./view-types";

export function PlanView(props: EngineeringViewProps) {
  const { vm, transform, width, height, preferences, selectedId, onSelect } = props;
  const cargoPoints = engineeringRectPoints(
    vm.cargo.extremeX,
    vm.cargo.extremeY + vm.cargo.widthM / 2,
    vm.cargo.lengthM,
    vm.cargo.widthM,
  );
  const cargoPath = pointPath(
    transform,
    cargoPoints.map(({ x, y }) => ({ x, y })),
    true,
  );
  const cargoStart = transform.toScreen({ x: vm.cargo.extremeX, y: vm.cargo.extremeY });
  const cargoEnd = transform.toScreen({
    x: vm.cargo.extremeX + vm.cargo.lengthM,
    y: vm.cargo.extremeY + vm.cargo.widthM,
  });
  const routeSegments = buildHydraulicRouteSegments(vm);

  return (
    <svg
      className="engineering-svg plan-view"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Orthographic plan of the trailer transport arrangement"
      onPointerDown={props.onBackgroundPointerDown}
      onPointerMove={props.onBackgroundPointerMove}
      onPointerUp={props.onBackgroundPointerUp}
      onPointerCancel={props.onBackgroundPointerUp}
      onWheel={props.onWheel}
    >
      <rect className="viewport-hit-area" x={0} y={0} width={width} height={height} />
      <ViewGrid width={width} height={height} visible={preferences.grid} />
      <LongitudinalOrientation width={width} />

      {preferences.layers.stability && (
        <g className="stability-geometry">
          <path
            className="stability-polygon"
            d={pointPath(transform, vm.stabilityBoundary.points, true)}
          />
          {vm.tippingEdges.map((edge) => {
            const start = transform.toScreen(edge.start);
            const end = transform.toScreen(edge.end);
            return (
              <line
                key={edge.id}
                className={`tipping-edge${edge.critical ? " critical" : ""}`}
                x1={start.x}
                y1={start.y}
                x2={end.x}
                y2={end.y}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect(edge.id);
                }}
              >
                <desc>
                  {edge.selection.title}
                  {edge.distanceM !== null ? ` · distance ${edge.distanceM.toFixed(3)} m` : ""}
                </desc>
              </line>
            );
          })}
        </g>
      )}

      {preferences.layers.envelopes && (
        <g className="cog-envelopes">
          {vm.envelopes
            .filter(
              (envelope) =>
                preferences.loadCase === "comparison" ||
                envelope.envelopeType === "cargo" ||
                envelope.envelopeType === preferences.loadCase,
            )
            .map((envelope) => (
              <path
                key={envelope.id}
                className={`cog-envelope envelope-${envelope.envelopeType}`}
                style={{ stroke: envelope.colour }}
                d={pointPath(transform, envelope.points, true)}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect(envelope.id);
                }}
              >
                <desc>{envelope.selection.title}</desc>
              </path>
            ))}
        </g>
      )}

      {preferences.layers.supports && (
        <g className="supports-layer">
          {vm.supportSpreads.map((spread) => {
            const support = vm.supports.find((item) => item.id === spread.supportId);
            const centreY = vm.cargo.extremeY + vm.cargo.widthM / 2;
            const start = transform.toScreen({ x: spread.startXM, y: centreY });
            const end = transform.toScreen({ x: spread.endXM, y: centreY });
            return (
              <line
                key={spread.id}
                className={`support-spread${support?.active ? "" : " inactive"}`}
                x1={start.x}
                x2={end.x}
                y1={start.y}
                y2={end.y}
              />
            );
          })}
          {vm.supports.map((support) => {
            const minY = transform.toScreen({ x: support.xM, y: vm.bounds.minY });
            const maxY = transform.toScreen({ x: support.xM, y: vm.bounds.maxY });
            return (
              <g
                key={support.id}
                className={`support-marker svg-selectable${support.active ? "" : " inactive"}${
                  selectedId === support.id ? " is-selected" : ""
                }`}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect(support.id);
                }}
              >
                <line x1={minY.x} y1={minY.y} x2={maxY.x} y2={maxY.y} />
                <text x={minY.x + 5} y={Math.min(minY.y, maxY.y) + 12}>
                  S{support.supportIndex + 1}
                </text>
                <desc>
                  Support {support.supportIndex + 1}: {support.reactionT.toFixed(2)} t ·{" "}
                  {support.active ? "active" : support.disableReason || "inactive"}
                </desc>
              </g>
            );
          })}
        </g>
      )}

      {preferences.layers.trailers && (
        <g className="trailer-layer">
          {vm.trailers.map((trailer) => {
            const points = trailer.footprint;
            const centreStart = transform.toScreen({
              x: trailer.startXM,
              y: trailer.centreYM,
            });
            const centreEnd = transform.toScreen(localToWorld(trailer, trailer.lengthM));
            const labelAt = transform.toScreen(localToWorld(trailer, trailer.lengthM / 2));
            return (
              <g
                key={trailer.id}
                data-placement-id={trailer.id}
                className={`trailer-unit svg-selectable${
                  trailer.colliding ? " colliding" : ""
                }${selectedId === trailer.id ? " is-selected" : ""}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect(trailer.id);
                }}
              >
                <path
                  d={pointPath(
                    transform,
                    points.map(({ x, y }) => ({ x, y })),
                    true,
                  )}
                />
                <line
                  className="centreline"
                  x1={centreStart.x}
                  y1={centreStart.y}
                  x2={centreEnd.x}
                  y2={centreEnd.y}
                />
                <path
                  className="orientation-arrow"
                  transform={`rotate(${-trailer.yawDeg} ${centreEnd.x} ${centreEnd.y})`}
                  d={`M ${centreEnd.x - 16} ${centreEnd.y} l -12 -6 l 0 12 z`}
                />
                <text x={labelAt.x} y={labelAt.y - 9} textAnchor="middle">
                  T{trailer.index + 1} · {trailer.definitionName}{trailer.yawDeg ? ` · ${trailer.yawDeg.toFixed(1)}°` : ""}
                </text>
                <desc>
                  Trailer {trailer.index + 1}: {trailer.definitionName}, rear at lower X and front at higher X
                </desc>
              </g>
            );
          })}
          {vm.powerPacks.map((ppu) => {
            const points = ppu.footprint;
            const labelAt = transform.toScreen(ppu.engineeringCoordinates);
            return (
              <g
                key={ppu.id}
                className={`power-pack svg-selectable${selectedId === ppu.id ? " is-selected" : ""}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect(ppu.id);
                }}
              >
                <path
                  d={pointPath(
                    transform,
                    points.map(({ x, y }) => ({ x, y })),
                    true,
                  )}
                />
                <text x={labelAt.x} y={labelAt.y + 4} textAnchor="middle">
                  PPU
                </text>
                <desc>{ppu.selection.title}</desc>
              </g>
            );
          })}
        </g>
      )}

      {preferences.layers.axles && (
        <g className="axle-layer">
          {vm.axleLines.map((axle) => {
            const trailer = vm.trailers.find(
              (item) => item.sourceTrailerId === axle.sourceTrailerId,
            );
            if (!trailer) return null;
            const station = (axle.axleLine - 0.5) * trailer.lengthM / trailer.axleLines;
            const start = transform.toScreen(localToWorld(trailer, station, -trailer.widthM / 2));
            const end = transform.toScreen(localToWorld(trailer, station, trailer.widthM / 2));
            return (
              <g
                key={axle.id}
                className={`axle-line svg-selectable${axle.pinned ? " pinned" : ""}${
                  axle.active ? "" : " inactive"
                }${selectedId === axle.id ? " is-selected" : ""}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect(axle.id);
                }}
              >
                <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} />
                {axle.pinned && (
                  <text x={start.x + 3} y={(start.y + end.y) / 2} className="pin-label">
                    PIN
                  </text>
                )}
                <desc>
                  {axle.selection.title}: {axle.loadT.toFixed(2)} t / {axle.capacityT.toFixed(2)} t
                </desc>
              </g>
            );
          })}
          {vm.bogies.map((bogie) => {
            const point = transform.toScreen(bogie.engineeringCoordinates);
            const groupColour = GROUP_COLOURS[bogie.groupId] ?? "#ffffff";
            return (
              <rect
                key={bogie.id}
                transform={`rotate(${-(vm.trailers.find(item => item.index === bogie.trailerIndex)?.yawDeg ?? 0)} ${point.x} ${point.y})`}
                className={`bogie svg-selectable${bogie.pinned ? " pinned" : ""}${
                  selectedId === bogie.id ? " is-selected" : ""
                }`}
                x={point.x - 7}
                y={point.y - 3}
                width={14}
                height={6}
                style={{ stroke: groupColour }}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect(bogie.id);
                }}
              >
                <desc>
                  {bogie.selection.title}: {bogie.loadT.toFixed(2)} t,{" "}
                  {(bogie.utilisation * 100).toFixed(1)}%
                </desc>
              </rect>
            );
          })}
        </g>
      )}

      {preferences.layers.hydraulics && (
        <g className="hydraulic-routes">
          {routeSegments.map((segment) => {
            return (
              <path
                key={segment.id}
                className="hydraulic-route"
                style={{ stroke: GROUP_COLOURS[segment.groupId] ?? "#ffffff" }}
                d={pointPath(transform, segment.points)}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect(`hydraulic-group:${segment.groupId}`);
                }}
              >
                <desc>
                  Hydraulic group G{segment.groupId} · trailer {segment.trailerIndex + 1} ·{" "}
                  {segment.side} circuit
                </desc>
              </path>
            );
          })}
          {vm.groupCentres.map((centre) => {
            const point = transform.toScreen(centre.point);
            return (
              <g
                key={centre.id}
                className={`group-centre svg-selectable${
                  selectedId === centre.id ? " is-selected" : ""
                }`}
                style={{ color: GROUP_COLOURS[centre.groupId] }}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect(centre.id);
                }}
              >
                <circle cx={point.x} cy={point.y} r={5} />
                <line x1={point.x - 9} y1={point.y} x2={point.x + 9} y2={point.y} />
                <line x1={point.x} y1={point.y - 9} x2={point.x} y2={point.y + 9} />
                <text
                  x={point.x + 9}
                  y={point.y - 7 + (centre.groupId - 2) * 14}
                >
                  G{centre.groupId} · {centre.loadT.toFixed(1)} t
                </text>
                <desc>
                  G{centre.groupId} centre: X {centre.point.x.toFixed(3)} m, Y{" "}
                  {centre.point.y.toFixed(3)} m
                </desc>
              </g>
            );
          })}
        </g>
      )}

      {preferences.layers.packing && (
        <g className="packing-layer">
          <path
            className={`packing-footprint svg-selectable${
              vm.packing.footprintDefined ? " custom" : " estimated"
            }${selectedId === vm.packing.id ? " is-selected" : ""}`}
            d={pointPath(
              transform,
              engineeringRectPoints(
                vm.packing.extremeX,
                vm.packing.extremeY + vm.packing.widthM / 2,
                vm.packing.lengthM,
                vm.packing.widthM,
              ).map(({ x, y }) => ({ x, y })),
              true,
            )}
            onClick={(event) => {
              event.stopPropagation();
              onSelect(vm.packing.id);
            }}
          >
            <desc>
              Packing visual footprint: {vm.packing.lengthM.toFixed(3)} m ×{" "}
              {vm.packing.widthM.toFixed(3)} m
            </desc>
          </path>
          {vm.loosePacking.map((item) => {
            const trailer = vm.trailers.find(
              (candidate) => candidate.sourceTrailerId === item.sourceTrailerId,
            );
            if (!trailer || item.widthM === null) return null;
            const points = engineeringRectPoints(
              item.startXM,
              trailer.centreYM,
              item.endXM - item.startXM,
              item.widthM,
            );
            return (
              <path
                key={item.id}
                className="loose-packing svg-selectable"
                d={pointPath(
                  transform,
                  points.map(({ x, y }) => ({ x, y })),
                  true,
                )}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect(item.id);
                }}
              >
                <desc>
                  {item.type}: {item.massT.toFixed(2)} t
                </desc>
              </path>
            );
          })}
        </g>
      )}

      {preferences.layers.cargo && (
        <g
          className={`cargo-footprint svg-selectable${
            selectedId === vm.cargo.id ? " is-selected" : ""
          }`}
          onClick={(event) => {
            event.stopPropagation();
            onSelect(vm.cargo.id);
          }}
        >
          <path d={cargoPath} />
          <line
            className="centreline"
            x1={transform.toScreen({
              x: vm.cargo.extremeX,
              y: vm.cargo.extremeY + vm.cargo.widthM / 2,
            }).x}
            y1={transform.toScreen({
              x: vm.cargo.extremeX,
              y: vm.cargo.extremeY + vm.cargo.widthM / 2,
            }).y}
            x2={transform.toScreen({
              x: vm.cargo.extremeX + vm.cargo.lengthM,
              y: vm.cargo.extremeY + vm.cargo.widthM / 2,
            }).x}
            y2={transform.toScreen({
              x: vm.cargo.extremeX + vm.cargo.lengthM,
              y: vm.cargo.extremeY + vm.cargo.widthM / 2,
            }).y}
          />
          <text
            x={(cargoStart.x + cargoEnd.x) / 2}
            y={(cargoStart.y + cargoEnd.y) / 2 - 10}
            textAnchor="middle"
          >
            {vm.project.model.cargo.name}
          </text>
          <desc>
            Cargo: {vm.cargo.lengthM.toFixed(3)} × {vm.cargo.widthM.toFixed(3)} m
          </desc>
        </g>
      )}

      {preferences.layers.cogs && (
        <g className="cog-layer">
          {vm.cogs
            .filter((item) => item.available && preferences.visibleCogs[item.cogType])
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
        </g>
      )}

      {preferences.layers.stability && (
        <g className="shift-arrows">
          {vm.shifts.map((shift) => {
            const start = transform.toScreen(shift.start);
            const end = transform.toScreen(shift.end);
            return (
              <g key={shift.id} className={`shift-arrow shift-${shift.shiftType}`}>
                <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} />
                <circle cx={end.x} cy={end.y} r={2.5} />
              </g>
            );
          })}
        </g>
      )}

      {preferences.dimensions && (
        <g className="dimensions-layer">
          <DimensionLine
            x1={transform.toScreen({ x: vm.cargo.extremeX, y: vm.bounds.maxY }).x}
            y1={transform.toScreen({ x: vm.cargo.extremeX, y: vm.bounds.maxY }).y - 12}
            x2={
              transform.toScreen({
                x: vm.cargo.extremeX + vm.cargo.lengthM,
                y: vm.bounds.maxY,
              }).x
            }
            y2={
              transform.toScreen({
                x: vm.cargo.extremeX + vm.cargo.lengthM,
                y: vm.bounds.maxY,
              }).y - 12
            }
            label={`${vm.cargo.lengthM.toFixed(3)} m`}
          />
          <DimensionLine
            x1={cargoEnd.x + 18}
            y1={cargoStart.y}
            x2={cargoEnd.x + 18}
            y2={cargoEnd.y}
            label={`${vm.cargo.widthM.toFixed(3)} m`}
          />
        </g>
      )}
      {preferences.layers.trailers && (vm.project.model.bedLayout ?? []).map((bed, index) => {
        const definition = vm.project.model.catalogue.find(item => item.id === bed.definitionId);
        if (!definition) return null;
        const footprint = trailerFootprint({ startXM: bed.xM, centreYM: bed.yM, yawDeg: bed.yawDeg, lengthM: bed.axleLines * definition.axleSpacingM, widthM: definition.trailerWidthM });
        const centre = transform.toScreen(localToWorld({ startXM: bed.xM, centreYM: bed.yM, yawDeg: bed.yawDeg }, bed.axleLines * definition.axleSpacingM / 2));
        return <g key={bed.id} role="button" tabIndex={0} aria-label={`Select bed B${index + 1}`} onClick={event => { event.stopPropagation(); onSelect(`bed:${bed.id}`); }} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(`bed:${bed.id}`); } }}><path className={`bed-outline${selectedId === `bed:${bed.id}` ? " selected" : ""}`} d={pointPath(transform, footprint, true)} /><text className="view-label" x={centre.x} y={centre.y - 16} textAnchor="middle">B{index + 1} · {bed.axleLines} AL · {bed.yawDeg}°</text></g>;
      })}
      {preferences.layers.trailers && (vm.project.model.deckPpus ?? []).map((ppu, index) => {
        const point = transform.toScreen({ x: ppu.xM, y: ppu.yM });
        return <g key={ppu.id} role="button" tabIndex={0} aria-label={`Select deck PPU ${index + 1}`} onClick={event => { event.stopPropagation(); onSelect(`deck-ppu:${ppu.id}`); }} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(`deck-ppu:${ppu.id}`); } }}><path className="deck-ppu-outline" d={pointPath(transform, deckPpuFootprint(ppu), true)} /><text className="view-label" x={point.x} y={point.y} textAnchor="middle">PPU {index + 1} · {ppu.massT} t</text></g>;
      })}

      <AxisGlyph />
    </svg>
  );
}
