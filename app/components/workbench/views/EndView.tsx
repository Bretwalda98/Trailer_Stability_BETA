"use client";

import { GROUP_COLOURS } from "../../../geometry/buildGeometryViewModel";
import { CogMarker, DimensionLine, ViewGrid } from "../svg-primitives";
import type { EngineeringViewProps } from "./view-types";

export function EndView(props: EngineeringViewProps) {
  const { vm, transform, width, height, preferences, selectedId, onSelect } = props;
  const model = vm.project.model;
  const cargoLeft = transform.toScreen({
    x: 0,
    y: vm.cargo.extremeY,
    z: vm.cargo.bottomZM,
  });
  const cargoRightTop = transform.toScreen({
    x: 0,
    y: vm.cargo.extremeY + vm.cargo.widthM,
    z: vm.cargo.bottomZM + vm.cargo.heightM,
  });
  const cargoWidthPx = cargoRightTop.x - cargoLeft.x;
  const cargoHeightPx = cargoLeft.y - cargoRightTop.y;
  const groundStart = transform.toScreen({ x: 0, y: vm.bounds.minY, z: 0 });
  const groundEnd = transform.toScreen({
    x: 0,
    y: vm.bounds.maxY,
    z:
      Math.tan((model.environment.transverseSlopeDeg * Math.PI) / 180) *
      (vm.bounds.maxY - vm.bounds.minY),
  });
  const controllingEdge = vm.tippingEdges.find((edge) => edge.critical);
  const controllingSide =
    controllingEdge &&
    (controllingEdge.start.y + controllingEdge.end.y) / 2 < vm.project.result.combinedCog.y
      ? "LEFT"
      : "RIGHT";

  return (
    <svg
      className="engineering-svg end-view"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Cross-sectional end view of the trailer and cargo"
      onPointerDown={props.onBackgroundPointerDown}
      onPointerMove={props.onBackgroundPointerMove}
      onPointerUp={props.onBackgroundPointerUp}
      onPointerCancel={props.onBackgroundPointerUp}
      onWheel={props.onWheel}
    >
      <rect className="viewport-hit-area" x={0} y={0} width={width} height={height} />
      <ViewGrid width={width} height={height} visible={preferences.grid} />
      <line
        className="ground-line"
        x1={groundStart.x}
        y1={groundStart.y}
        x2={groundEnd.x}
        y2={groundEnd.y}
      />
      <text className="view-note" x={groundStart.x + 8} y={groundStart.y - 8}>
        Cross slope {model.environment.transverseSlopeDeg.toFixed(2)}°
      </text>

      {preferences.layers.trailers &&
        vm.trailers.map((trailer) => {
          const left = transform.toScreen({
            x: trailer.startXM,
            y: trailer.centreYM - trailer.widthM / 2,
            z: trailer.deckHeightM,
          });
          const right = transform.toScreen({
            x: trailer.startXM,
            y: trailer.centreYM + trailer.widthM / 2,
            z: trailer.deckHeightM,
          });
          return (
            <g
              key={trailer.id}
              className={`end-trailer svg-selectable${
                selectedId === trailer.id ? " is-selected" : ""
              }`}
              onClick={(event) => {
                event.stopPropagation();
                onSelect(trailer.id);
              }}
            >
              <line x1={left.x} y1={left.y} x2={right.x} y2={right.y} />
              <rect x={left.x} y={left.y - 5} width={right.x - left.x} height={10} />
              <text x={(left.x + right.x) / 2} y={left.y - 10} textAnchor="middle">
                T{trailer.index + 1}
              </text>
            </g>
          );
        })}

      {preferences.layers.axles &&
        vm.bogies.map((bogie) => {
          const centre = transform.toScreen({
            x: bogie.xM,
            y: bogie.yM,
            z: Math.max(0.05, bogie.wheelDiameterM / 2),
          });
          const radius = Math.max(3, (bogie.wheelDiameterM * transform.scale) / 2);
          return (
            <circle
              key={bogie.id}
              className={`wheel svg-selectable${bogie.pinned ? " pinned" : ""}${
                selectedId === bogie.id ? " is-selected" : ""
              }`}
              style={{ stroke: GROUP_COLOURS[bogie.groupId] }}
              cx={centre.x}
              cy={centre.y}
              r={radius}
              onClick={(event) => {
                event.stopPropagation();
                onSelect(bogie.id);
              }}
            >
              <desc>
                Bogie G{bogie.groupId}: Y {bogie.yM.toFixed(3)} m, load{" "}
                {bogie.loadT.toFixed(2)} t
              </desc>
            </circle>
          );
        })}

      {preferences.layers.packing && (
        <g className="packing-section">
          <rect
            x={cargoLeft.x}
            y={transform.toScreen({ x: 0, y: 0, z: vm.cargo.bottomZM }).y}
            width={cargoWidthPx}
            height={Math.max(2, model.packing.heightM * transform.scale)}
          />
          <text
            x={cargoLeft.x + cargoWidthPx / 2}
            y={transform.toScreen({ x: 0, y: 0, z: vm.cargo.bottomZM }).y - 6}
            textAnchor="middle"
          >
            PACKING · footprint extent not defined
          </text>
        </g>
      )}

      {preferences.layers.cargo && (
        <g
          className={`cargo-section svg-selectable${
            selectedId === vm.cargo.id ? " is-selected" : ""
          }`}
          onClick={(event) => {
            event.stopPropagation();
            onSelect(vm.cargo.id);
          }}
        >
          <rect
            x={cargoLeft.x}
            y={cargoRightTop.y}
            width={cargoWidthPx}
            height={cargoHeightPx}
          />
          <line
            className="centreline"
            x1={cargoLeft.x + cargoWidthPx / 2}
            y1={cargoRightTop.y}
            x2={cargoLeft.x + cargoWidthPx / 2}
            y2={cargoLeft.y}
          />
          <text
            x={cargoLeft.x + cargoWidthPx / 2}
            y={cargoRightTop.y + cargoHeightPx / 2}
            textAnchor="middle"
          >
            {model.cargo.name}
          </text>
        </g>
      )}

      {preferences.layers.stability && (
        <g className="end-stability">
          {vm.stabilityBoundary.points.map((point, index) => {
            const base = transform.toScreen({ x: point.x, y: point.y, z: 0 });
            const top = transform.toScreen({
              x: point.x,
              y: point.y,
              z: vm.project.result.combinedCog.z,
            });
            return (
              <line
                key={index}
                className="stability-side-line"
                x1={base.x}
                y1={base.y}
                x2={top.x}
                y2={top.y}
              />
            );
          })}
          <text className="critical-side-label" x={width - 145} y={36}>
            CONTROLLING SIDE · {controllingSide}
          </text>
        </g>
      )}

      {preferences.layers.cogs &&
        vm.cogs
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

      <g className="force-arrows">
        <line
          x1={width - 94}
          y1={height * 0.38}
          x2={width - 150}
          y2={height * 0.38}
          className="wind-arrow"
        />
        <text x={width - 90} y={height * 0.38 - 8} textAnchor="end">
          WIND {model.environment.windSpeedMps.toFixed(1)} m/s
        </text>
        <line
          x1={width - 94}
          y1={height * 0.5}
          x2={width - 150}
          y2={height * 0.5}
          className="acceleration-arrow"
        />
        <text x={width - 90} y={height * 0.5 - 8} textAnchor="end">
          aY {model.environment.transverseAccelerationMps2.toFixed(2)} m/s²
        </text>
      </g>

      {preferences.dimensions && (
        <g>
          <DimensionLine
            x1={cargoLeft.x}
            y1={cargoLeft.y + 25}
            x2={cargoRightTop.x}
            y2={cargoLeft.y + 25}
            label={`${vm.cargo.widthM.toFixed(3)} m`}
          />
          <DimensionLine
            x1={cargoRightTop.x + 25}
            y1={cargoLeft.y}
            x2={cargoRightTop.x + 25}
            y2={cargoRightTop.y}
            label={`${vm.cargo.heightM.toFixed(3)} m`}
          />
          <DimensionLine
            x1={cargoLeft.x - 26}
            y1={transform.toScreen({ x: 0, y: 0, z: 0 }).y}
            x2={cargoLeft.x - 26}
            y2={transform.toScreen({ x: 0, y: 0, z: vm.project.result.combinedCog.z }).y}
            label={`COG Z ${vm.project.result.combinedCog.z.toFixed(3)} m`}
          />
        </g>
      )}

      <g className="axis-glyph" transform="translate(28 32)">
        <line x1={0} y1={24} x2={28} y2={24} />
        <line x1={0} y1={24} x2={0} y2={-4} />
        <text x={34} y={28}>Y</text>
        <text x={-4} y={-10}>Z</text>
      </g>
    </svg>
  );
}
