"use client";

import { GROUP_COLOURS } from "../../../geometry/buildGeometryViewModel";
import {
  CogMarker,
  DimensionLine,
  LongitudinalOrientation,
  ViewGrid,
} from "../svg-primitives";
import type { EngineeringViewProps } from "./view-types";

export function SideView(props: EngineeringViewProps) {
  const { vm, transform, width, height, preferences, selectedId, onSelect } = props;
  const model = vm.project.model;
  const cargoBottomLeft = transform.toScreen({
    x: vm.cargo.extremeX,
    y: 0,
    z: vm.cargo.bottomZM,
  });
  const cargoTopRight = transform.toScreen({
    x: vm.cargo.extremeX + vm.cargo.lengthM,
    y: 0,
    z: vm.cargo.bottomZM + vm.cargo.heightM,
  });
  const cargoWidthPx = cargoTopRight.x - cargoBottomLeft.x;
  const cargoHeightPx = cargoBottomLeft.y - cargoTopRight.y;
  const packingBottomLeft = transform.toScreen({
    x: vm.packing.extremeX,
    y: 0,
    z: model.trailerDeckHeightM,
  });
  const packingTopRight = transform.toScreen({
    x: vm.packing.extremeX + vm.packing.lengthM,
    y: 0,
    z: model.trailerDeckHeightM + model.packing.heightM,
  });
  const groundStart = transform.toScreen({ x: vm.bounds.minX, y: 0, z: 0 });
  const groundEnd = transform.toScreen({
    x: vm.bounds.maxX,
    y: 0,
    z:
      Math.tan((model.environment.longitudinalSlopeDeg * Math.PI) / 180) *
      (vm.bounds.maxX - vm.bounds.minX),
  });

  return (
    <svg
      className="engineering-svg side-view"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Longitudinal side elevation of the trailer and cargo"
      onPointerDown={props.onBackgroundPointerDown}
      onPointerMove={props.onBackgroundPointerMove}
      onPointerUp={props.onBackgroundPointerUp}
      onPointerCancel={props.onBackgroundPointerUp}
      onWheel={props.onWheel}
    >
      <rect className="viewport-hit-area" x={0} y={0} width={width} height={height} />
      <ViewGrid width={width} height={height} visible={preferences.grid} />
      <LongitudinalOrientation width={width} />
      <line
        className="ground-line"
        x1={groundStart.x}
        y1={groundStart.y}
        x2={groundEnd.x}
        y2={groundEnd.y}
      />
      <text className="view-note" x={groundStart.x + 8} y={groundStart.y - 8}>
        Longitudinal slope {model.environment.longitudinalSlopeDeg.toFixed(2)}°
      </text>

      {preferences.layers.trailers &&
        vm.trailers.map((trailer) => {
          const deckStart = transform.toScreen({
            x: trailer.startXM,
            y: trailer.centreYM,
            z: trailer.deckHeightM,
          });
          const deckEnd = transform.toScreen({
            x: trailer.startXM + trailer.lengthM,
            y: trailer.centreYM,
            z: trailer.deckHeightM,
          });
          return (
            <g
              key={trailer.id}
              className={`side-trailer svg-selectable${
                selectedId === trailer.id ? " is-selected" : ""
              }`}
              onClick={(event) => {
                event.stopPropagation();
                onSelect(trailer.id);
              }}
            >
              <rect
                x={deckStart.x}
                y={deckStart.y - 5}
                width={deckEnd.x - deckStart.x}
                height={10}
              />
              <line
                className="centreline"
                x1={deckStart.x}
                y1={deckStart.y}
                x2={deckEnd.x}
                y2={deckEnd.y}
              />
              <text x={(deckStart.x + deckEnd.x) / 2} y={deckStart.y + 24} textAnchor="middle">
                T{trailer.index + 1} · {trailer.definitionName}
              </text>
            </g>
          );
        })}

      {preferences.layers.axles &&
        vm.axleLines.map((axle) => {
          const bogie = vm.bogies.find(
            (item) =>
              item.sourceTrailerId === axle.sourceTrailerId && item.axleLine === axle.axleLine,
          );
          const centre = transform.toScreen({
            x: axle.xM,
            y: axle.centreYM,
            z: Math.max(0.05, (bogie?.wheelDiameterM ?? 0.5) / 2),
          });
          const radius = Math.max(
            3,
            ((bogie?.wheelDiameterM ?? 0.5) * transform.scale) / 2,
          );
          const groupId = axle.groupIds[0] ?? 1;
          return (
            <g
              key={axle.id}
              className={`side-axle svg-selectable${axle.pinned ? " pinned" : ""}${
                selectedId === axle.id ? " is-selected" : ""
              }`}
              onClick={(event) => {
                event.stopPropagation();
                onSelect(axle.id);
              }}
            >
              <circle
                cx={centre.x}
                cy={centre.y}
                r={radius}
                style={{ stroke: GROUP_COLOURS[groupId] }}
              />
              <line x1={centre.x} y1={centre.y - radius} x2={centre.x} y2={centre.y - radius - 12} />
              <text x={centre.x} y={centre.y + radius + 12} textAnchor="middle">
                {axle.axleLine}
              </text>
              {axle.pinned && (
                <text className="pin-label" x={centre.x} y={centre.y - radius - 16} textAnchor="middle">
                  PIN
                </text>
              )}
              <desc>
                Axle line {axle.axleLine}, X {axle.xM.toFixed(3)} m, load{" "}
                {axle.loadT.toFixed(2)} t
              </desc>
            </g>
          );
        })}

      {preferences.layers.supports && (
        <g className="side-supports">
          {vm.supportSpreads.map((spread) => {
            const base = transform.toScreen({ x: spread.startXM, y: 0, z: 0 });
            const end = transform.toScreen({ x: spread.endXM, y: 0, z: 0 });
            const topY = transform.toScreen({
              x: spread.startXM,
              y: 0,
              z: vm.cargo.bottomZM,
            }).y;
            return (
              <rect
                key={spread.id}
                x={base.x}
                y={topY}
                width={Math.max(1, end.x - base.x)}
                height={base.y - topY}
                className="support-spread-block"
              />
            );
          })}
          {vm.supports.map((support) => {
            const bottom = transform.toScreen({ x: support.xM, y: 0, z: 0 });
            const top = transform.toScreen({
              x: support.xM,
              y: 0,
              z: vm.cargo.bottomZM,
            });
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
                <line x1={bottom.x} y1={bottom.y} x2={top.x} y2={top.y} />
                <text x={top.x + 5} y={top.y + 12}>
                  S{support.supportIndex + 1}
                </text>
                <desc>
                  Support {support.supportIndex + 1}: static reaction {support.reactionT.toFixed(2)} t
                </desc>
              </g>
            );
          })}
        </g>
      )}

      {preferences.layers.packing && (
        <g
          className={`side-packing svg-selectable${
            selectedId === vm.packing.id ? " is-selected" : ""
          }`}
          onClick={(event) => {
            event.stopPropagation();
            onSelect(vm.packing.id);
          }}
        >
          <rect
            className={vm.packing.footprintDefined ? "custom" : "estimated"}
            x={packingBottomLeft.x}
            y={packingTopRight.y}
            width={packingTopRight.x - packingBottomLeft.x}
            height={packingBottomLeft.y - packingTopRight.y}
          />
          <text
            x={(packingBottomLeft.x + packingTopRight.x) / 2}
            y={packingTopRight.y - 6}
            textAnchor="middle"
          >
            PACKING · {vm.packing.footprintDefined ? "custom footprint" : "cargo-sized estimate"}
          </text>
          {vm.loosePacking.map((item) => {
            const left = transform.toScreen({
              x: item.startXM,
              y: 0,
              z: model.trailerDeckHeightM,
            });
            const right = transform.toScreen({
              x: item.endXM,
              y: 0,
              z: model.trailerDeckHeightM + 0.35,
            });
            return (
              <g
                key={item.id}
                className={`loose-packing svg-selectable${
                  selectedId === item.id ? " is-selected" : ""
                }`}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect(item.id);
                }}
              >
                <rect x={left.x} y={right.y} width={right.x - left.x} height={left.y - right.y} />
                <text x={(left.x + right.x) / 2} y={right.y - 5} textAnchor="middle">
                  {item.type} · {item.massT.toFixed(1)} t
                </text>
              </g>
            );
          })}
        </g>
      )}

      {preferences.layers.trailers &&
        vm.powerPacks.map((ppu) => {
          const left = transform.toScreen({
            x: ppu.startXM,
            y: ppu.centreYM,
            z: model.trailerDeckHeightM,
          });
          const right = transform.toScreen({
            x: ppu.endXM,
            y: ppu.centreYM,
            z: model.trailerDeckHeightM + 0.5,
          });
          return (
            <g
              key={ppu.id}
              className={`power-pack svg-selectable${selectedId === ppu.id ? " is-selected" : ""}`}
              onClick={(event) => {
                event.stopPropagation();
                onSelect(ppu.id);
              }}
            >
              <rect x={left.x} y={right.y} width={right.x - left.x} height={left.y - right.y} />
              <text x={(left.x + right.x) / 2} y={right.y - 5} textAnchor="middle">
                PPU · {ppu.end.toUpperCase()}
              </text>
            </g>
          );
        })}

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
            x={cargoBottomLeft.x}
            y={cargoTopRight.y}
            width={cargoWidthPx}
            height={cargoHeightPx}
          />
          <line
            className="centreline"
            x1={cargoBottomLeft.x}
            y1={cargoTopRight.y + cargoHeightPx / 2}
            x2={cargoTopRight.x}
            y2={cargoTopRight.y + cargoHeightPx / 2}
          />
          <text
            x={cargoBottomLeft.x + cargoWidthPx / 2}
            y={cargoTopRight.y + cargoHeightPx / 2}
            textAnchor="middle"
          >
            {model.cargo.name}
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
                "cargo-packing-ppu",
                "transporter",
                "all-inclusive",
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
        <line x1={width - 90} y1={height * 0.35} x2={width - 155} y2={height * 0.35} className="wind-arrow" />
        <text x={width - 88} y={height * 0.35 - 8} textAnchor="end">
          WIND X · A {model.cargo.frontWindAreaM2.toFixed(2)} m²
        </text>
        <line x1={width - 90} y1={height * 0.48} x2={width - 155} y2={height * 0.48} className="acceleration-arrow" />
        <text x={width - 88} y={height * 0.48 - 8} textAnchor="end">
          aX {model.environment.longitudinalAccelerationMps2.toFixed(2)} m/s²
        </text>
      </g>

      {preferences.dimensions && (
        <g>
          <DimensionLine
            x1={cargoBottomLeft.x}
            y1={cargoBottomLeft.y + 28}
            x2={cargoTopRight.x}
            y2={cargoBottomLeft.y + 28}
            label={`${vm.cargo.lengthM.toFixed(3)} m`}
          />
          <DimensionLine
            x1={cargoTopRight.x + 24}
            y1={cargoBottomLeft.y}
            x2={cargoTopRight.x + 24}
            y2={cargoTopRight.y}
            label={`${vm.cargo.heightM.toFixed(3)} m`}
          />
          <DimensionLine
            x1={cargoBottomLeft.x - 28}
            y1={transform.toScreen({ x: 0, y: 0, z: 0 }).y}
            x2={cargoBottomLeft.x - 28}
            y2={transform.toScreen({ x: 0, y: 0, z: model.trailerDeckHeightM }).y}
            label={`Deck ${model.trailerDeckHeightM.toFixed(3)} m`}
          />
        </g>
      )}

      <g className="axis-glyph" transform="translate(28 32)">
        <line x1={0} y1={24} x2={28} y2={24} />
        <line x1={0} y1={24} x2={0} y2={-4} />
        <text x={34} y={28}>X</text>
        <text x={-4} y={-10}>Z</text>
      </g>
    </svg>
  );
}
