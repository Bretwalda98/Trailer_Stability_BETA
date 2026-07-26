"use client";

import { GROUP_COLOURS } from "../../../geometry/buildGeometryViewModel";
import type { Bogie, COGPoint, TrailerUnit } from "../../../geometry/types";
import { CogMarker, DimensionLine, ViewGrid } from "../svg-primitives";
import type { EngineeringViewProps } from "./view-types";

const END_TIPPING_CASES = [
  { key: "basicAngle", cogType: "all-inclusive", label: "BASIC", colour: "#38bdf8" },
  { key: "slopeAngle", cogType: "slope-shifted", label: "SLOPE", colour: "#f59e0b" },
  { key: "dynamicAngle", cogType: "dynamic-shifted", label: "DYNAMIC", colour: "#f472b6" },
] as const;

function averageWheelDiameter(bogies: Bogie[]): number {
  if (!bogies.length) return 0.72;
  return bogies.reduce((total, bogie) => total + bogie.wheelDiameterM, 0) / bogies.length;
}

function nearestBogie(bogies: Bogie[], yM: number): Bogie | undefined {
  return bogies.reduce<Bogie | undefined>((nearest, candidate) => {
    if (!nearest || Math.abs(candidate.yM - yM) < Math.abs(nearest.yM - yM)) return candidate;
    return nearest;
  }, undefined);
}

function SpmtEndModule({
  trailer,
  bogies,
  transform,
  selected,
  showStructure,
  showWheels,
  onSelect,
}: {
  trailer: TrailerUnit;
  bogies: Bogie[];
  transform: EngineeringViewProps["transform"];
  selected: boolean;
  showStructure: boolean;
  showWheels: boolean;
  onSelect(id: string): void;
}) {
  const diameter = averageWheelDiameter(bogies);
  const radius = diameter / 2;
  const deckThickness = Math.min(0.16, Math.max(0.08, diameter * 0.16));
  const wheelTrack = trailer.widthM * (trailer.singleFile ? 0.34 : 0.72);
  const wheelFactors = trailer.singleFile ? [-0.5, 0.5] : [-0.5, -0.17, 0.17, 0.5];
  const wheelPositions = wheelFactors.map((factor) => trailer.centreYM + factor * wheelTrack);
  const deckLeftY = trailer.centreYM - trailer.widthM / 2;
  const deckRightY = trailer.centreYM + trailer.widthM / 2;
  const suspensionTopZ = trailer.deckHeightM - deckThickness;
  const frameLowerZ = Math.max(radius * 1.18, trailer.deckHeightM * 0.43);
  const deckLeftTop = transform.toScreen({ x: trailer.startXM, y: deckLeftY, z: trailer.deckHeightM + deckThickness });
  const deckRightBottom = transform.toScreen({ x: trailer.startXM, y: deckRightY, z: suspensionTopZ });
  const framePoints = [
    { x: trailer.startXM, y: trailer.centreYM - trailer.widthM * 0.42, z: suspensionTopZ },
    { x: trailer.startXM, y: trailer.centreYM - trailer.widthM * 0.23, z: suspensionTopZ },
    { x: trailer.startXM, y: trailer.centreYM - trailer.widthM * 0.12, z: frameLowerZ },
    { x: trailer.startXM, y: trailer.centreYM + trailer.widthM * 0.12, z: frameLowerZ },
    { x: trailer.startXM, y: trailer.centreYM + trailer.widthM * 0.23, z: suspensionTopZ },
    { x: trailer.startXM, y: trailer.centreYM + trailer.widthM * 0.42, z: suspensionTopZ },
  ]
    .map((point) => transform.toScreen(point))
    .map((point, index) => `${index ? "L" : "M"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");

  return (
    <g
      className={`end-trailer end-spmt svg-selectable${selected ? " is-selected" : ""}${
        trailer.colliding ? " colliding" : ""
      }`}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(trailer.id);
      }}
    >
      {showStructure && (
        <>
          <rect
            className="spmt-deck"
            x={deckLeftTop.x}
            y={deckLeftTop.y}
            width={deckRightBottom.x - deckLeftTop.x}
            height={deckRightBottom.y - deckLeftTop.y}
          />
          <path className="spmt-subframe" d={`${framePoints} Z`} />
          <line
            className="spmt-centreline"
            x1={transform.toScreen({ x: trailer.startXM, y: trailer.centreYM, z: suspensionTopZ }).x}
            y1={transform.toScreen({ x: trailer.startXM, y: trailer.centreYM, z: suspensionTopZ }).y}
            x2={transform.toScreen({ x: trailer.startXM, y: trailer.centreYM, z: frameLowerZ }).x}
            y2={transform.toScreen({ x: trailer.startXM, y: trailer.centreYM, z: frameLowerZ }).y}
          />
        </>
      )}
      {showWheels &&
        wheelPositions.map((yM, index) => {
          const source = nearestBogie(bogies, yM);
          const wheelCentre = transform.toScreen({ x: trailer.startXM, y: yM, z: radius });
          const top = transform.toScreen({ x: trailer.startXM, y: yM, z: suspensionTopZ });
          const radiusPx = Math.max(3, radius * transform.scale);
          return (
            <g
              key={`${trailer.id}:wheel:${index}`}
              className={`spmt-wheel${source?.pinned ? " pinned" : ""}`}
              onClick={(event) => {
                if (!source) return;
                event.stopPropagation();
                onSelect(source.id);
              }}
            >
              <line className="spmt-suspension" x1={top.x} y1={top.y} x2={wheelCentre.x} y2={wheelCentre.y} />
              <circle
                className="wheel"
                style={{ stroke: GROUP_COLOURS[source?.groupId ?? 1] }}
                cx={wheelCentre.x}
                cy={wheelCentre.y}
                r={radiusPx}
              />
              <circle
                className="spmt-hub"
                style={{ stroke: GROUP_COLOURS[source?.groupId ?? 1] }}
                cx={wheelCentre.x}
                cy={wheelCentre.y}
                r={Math.max(2, radiusPx * 0.26)}
              />
            </g>
          );
        })}
      {showStructure && (
        <text
          className="spmt-label"
          x={(deckLeftTop.x + deckRightBottom.x) / 2}
          y={deckRightBottom.y + 18}
          textAnchor="middle"
        >
          T{trailer.index + 1} · SPMT · {trailer.widthM.toFixed(3)} m
        </text>
      )}
      <desc>
        Trailer {trailer.index + 1} SPMT end module: {trailer.widthM.toFixed(3)} m wide, deck at{" "}
        {trailer.deckHeightM.toFixed(3)} m.
      </desc>
    </g>
  );
}

export function EndView(props: EngineeringViewProps) {
  const { vm, transform, width, height, preferences, selectedId, onSelect } = props;
  const model = vm.project.model;
  const result = vm.project.result;
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
  const controllingEdgeY = controllingEdge
    ? (controllingEdge.start.y + controllingEdge.end.y) / 2
    : result.combinedCog.y;
  const controllingSide = controllingEdgeY < result.combinedCog.y ? "RIGHT" : "LEFT";
  const direction = controllingSide === "RIGHT" ? 1 : -1;
  const groundAtEdgeZ =
    Math.tan((model.environment.transverseSlopeDeg * Math.PI) / 180) *
    (controllingEdgeY - vm.bounds.minY);
  const tippingRays = END_TIPPING_CASES.flatMap((definition) => {
    const angleDeg = result.metrics[definition.key].value;
    const cog = vm.cogs.find((item) => item.cogType === definition.cogType) as COGPoint | undefined;
    const heightM = (cog?.point.z ?? result.combinedCog.z) - groundAtEdgeZ;
    if (angleDeg === null || angleDeg < 0 || heightM <= 0) return [];
    const distanceM = Math.tan((angleDeg * Math.PI) / 180) * heightM;
    return [{ ...definition, angleDeg, heightM, distanceM }];
  });

  return (
    <svg
      className="engineering-svg end-view"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Scaled SPMT end view with cargo and basic, slope and dynamic tipping-angle constructions"
      onPointerDown={props.onBackgroundPointerDown}
      onPointerMove={props.onBackgroundPointerMove}
      onPointerUp={props.onBackgroundPointerUp}
      onPointerCancel={props.onBackgroundPointerUp}
      onWheel={props.onWheel}
    >
      <rect className="viewport-hit-area" x={0} y={0} width={width} height={height} />
      <ViewGrid width={width} height={height} visible={preferences.grid} />
      <line className="ground-line" x1={groundStart.x} y1={groundStart.y} x2={groundEnd.x} y2={groundEnd.y} />
      <text className="view-note" x={groundStart.x + 8} y={groundStart.y - 8}>
        Cross slope {model.environment.transverseSlopeDeg.toFixed(2)}°
      </text>

      {vm.trailers.map((trailer) => (
        <SpmtEndModule
          key={trailer.id}
          trailer={trailer}
          bogies={vm.bogies.filter((bogie) => bogie.trailerIndex === trailer.index)}
          transform={transform}
          selected={selectedId === trailer.id}
          showStructure={preferences.layers.trailers}
          showWheels={preferences.layers.axles}
          onSelect={onSelect}
        />
      ))}

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

      {preferences.layers.stability && controllingEdge && (
        <g className="end-stability">
          {(() => {
            const pivot = transform.toScreen({ x: 0, y: controllingEdgeY, z: groundAtEdgeZ });
            const verticalTop = transform.toScreen({ x: 0, y: controllingEdgeY, z: result.combinedCog.z });
            return (
              <>
                <line className="stability-side-line" x1={pivot.x} y1={pivot.y} x2={verticalTop.x} y2={verticalTop.y} />
                <circle className="tipping-pivot" cx={pivot.x} cy={pivot.y} r={4} />
                <text className="critical-side-label" x={pivot.x + direction * 8} y={pivot.y - 10} textAnchor={direction > 0 ? "start" : "end"}>
                  EDGE {controllingEdge.edgeIndex + 1} · {controllingSide}
                </text>
                {tippingRays.map((ray, index) => {
                  const boundary = transform.toScreen({
                    x: 0,
                    y: controllingEdgeY + direction * ray.distanceM,
                    z: groundAtEdgeZ + ray.heightM,
                  });
                  const labelX = (pivot.x + boundary.x) / 2 + direction * 8;
                  const labelY = (pivot.y + boundary.y) / 2 - 8 - index * 12;
                  return (
                    <g key={ray.key} className="end-tipping-ray" style={{ color: ray.colour }}>
                      <line x1={pivot.x} y1={pivot.y} x2={boundary.x} y2={boundary.y} />
                      <circle cx={boundary.x} cy={boundary.y} r={3.2} />
                      <text x={labelX} y={labelY} textAnchor={direction > 0 ? "start" : "end"}>
                        {ray.label} {ray.angleDeg.toFixed(1)}°
                      </text>
                      <desc>
                        {ray.label} tipping angle construction from the controlling edge to the projected COG boundary.
                      </desc>
                    </g>
                  );
                })}
              </>
            );
          })()}
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
            y2={transform.toScreen({ x: 0, y: 0, z: result.combinedCog.z }).y}
            label={`COG Z ${result.combinedCog.z.toFixed(3)} m`}
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
