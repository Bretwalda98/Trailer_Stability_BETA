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
  const catalogueTyreWidth = trailer.tyreWidthM > 0 ? trailer.tyreWidthM : Math.max(...bogies.map((bogie) => bogie.tyreWidthM), 0);
  const catalogueWheelDiameter = trailer.wheelDiameterM > 0 ? trailer.wheelDiameterM : Math.max(...bogies.map((bogie) => bogie.wheelDiameterM), 0);
  if (catalogueTyreWidth <= 0 || catalogueWheelDiameter <= 0 || trailer.widthM <= 0) {
    return null;
  }
  const radius = catalogueWheelDiameter / 2;
  const deckThickness = Math.max(catalogueTyreWidth * 0.4, Math.min(trailer.deckHeightM * 0.12, catalogueWheelDiameter * 0.16));
  const outerHalf = Math.max(catalogueTyreWidth / 2, trailer.widthM / 2 - catalogueTyreWidth / 2);
  const crossHalf = trailer.crossBogieSpacingM && trailer.crossBogieSpacingM > 0
    ? Math.min(outerHalf, trailer.crossBogieSpacingM / 2)
    : outerHalf;
  const transverseOffsets = trailer.singleFile
    ? [-outerHalf, outerHalf]
    : [-outerHalf, -crossHalf, crossHalf, outerHalf];
  const wheelPositions = [...new Set(transverseOffsets.map((offset) => trailer.centreYM + offset))];
  const deckLeftY = trailer.centreYM - trailer.widthM / 2;
  const deckRightY = trailer.centreYM + trailer.widthM / 2;
  const suspensionTopZ = trailer.deckHeightM - deckThickness;
  const frameLowerZ = Math.max(catalogueWheelDiameter * 0.9, trailer.deckHeightM * 0.42);
  const deckLeftTop = transform.toScreen({ x: trailer.startXM, y: deckLeftY, z: trailer.deckHeightM + deckThickness });
  const deckRightBottom = transform.toScreen({ x: trailer.startXM, y: deckRightY, z: suspensionTopZ });
  const framePoints = [
    { x: trailer.startXM, y: trailer.centreYM - trailer.widthM * 0.44, z: suspensionTopZ },
    { x: trailer.startXM, y: trailer.centreYM - trailer.widthM * 0.22, z: suspensionTopZ },
    { x: trailer.startXM, y: trailer.centreYM - trailer.widthM * 0.12, z: frameLowerZ },
    { x: trailer.startXM, y: trailer.centreYM + trailer.widthM * 0.12, z: frameLowerZ },
    { x: trailer.startXM, y: trailer.centreYM + trailer.widthM * 0.22, z: suspensionTopZ },
    { x: trailer.startXM, y: trailer.centreYM + trailer.widthM * 0.44, z: suspensionTopZ },
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
          const wheelTop = transform.toScreen({ x: trailer.startXM, y: yM, z: catalogueWheelDiameter });
          const wheelBottom = transform.toScreen({ x: trailer.startXM, y: yM, z: 0 });
          const suspensionBottom = transform.toScreen({ x: trailer.startXM, y: yM, z: catalogueWheelDiameter });
          const suspensionTop = transform.toScreen({ x: trailer.startXM, y: yM, z: suspensionTopZ });
          const tyreWidthPx = Math.max(3, catalogueTyreWidth * transform.scale);
          const tyreHeightPx = Math.max(6, wheelBottom.y - wheelTop.y);
          const columnWidthPx = Math.max(2, tyreWidthPx * 0.34);
          const colour = GROUP_COLOURS[source?.groupId ?? 1];
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
              <line className="spmt-suspension" x1={suspensionTop.x} y1={suspensionTop.y} x2={suspensionBottom.x} y2={suspensionBottom.y} />
              <rect
                className="spmt-suspension-column"
                x={wheelCentre.x - columnWidthPx / 2}
                y={suspensionTop.y}
                width={columnWidthPx}
                height={Math.max(2, suspensionBottom.y - suspensionTop.y)}
              />
              <rect
                className="spmt-tyre-profile"
                style={{ stroke: colour }}
                x={wheelCentre.x - tyreWidthPx / 2}
                y={wheelTop.y}
                width={tyreWidthPx}
                height={tyreHeightPx}
                rx={Math.max(1, tyreWidthPx * 0.08)}
              />
              <rect
                className="spmt-hub-profile"
                style={{ stroke: colour }}
                x={wheelCentre.x - Math.max(1.5, columnWidthPx * 0.45) / 2}
                y={wheelCentre.y - Math.max(3, tyreHeightPx * 0.18) / 2}
                width={Math.max(1.5, columnWidthPx * 0.45)}
                height={Math.max(3, tyreHeightPx * 0.18)}
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
  const packingLeft = transform.toScreen({
    x: 0,
    y: vm.packing.extremeY,
    z: model.trailerDeckHeightM,
  });
  const packingRightTop = transform.toScreen({
    x: 0,
    y: vm.packing.extremeY + vm.packing.widthM,
    z: model.trailerDeckHeightM + model.packing.heightM,
  });
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
  const hydraulicCentroidY = result.stabilityPolygon.length === 3
    ? result.stabilityPolygon.reduce((sum, point) => sum + point.y, 0) / result.stabilityPolygon.length
    : result.combinedCog.y;
  // The construction must leave the triangle from the selected edge. Using
  // the COG alone can point the ray back through the triangle when the COG is
  // close to, or outside, the controlling edge.
  const direction = controllingEdgeY >= hydraulicCentroidY ? 1 : -1;
  const controllingSide = direction < 0 ? "RIGHT" : "LEFT";
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
        <g
          className={`packing-section svg-selectable${
            selectedId === vm.packing.id ? " is-selected" : ""
          }`}
          onClick={(event) => {
            event.stopPropagation();
            onSelect(vm.packing.id);
          }}
        >
          <rect
            className={vm.packing.footprintDefined ? "custom" : "estimated"}
            x={packingLeft.x}
            y={packingRightTop.y}
            width={packingRightTop.x - packingLeft.x}
            height={packingLeft.y - packingRightTop.y}
          />
          <text
            x={(packingLeft.x + packingRightTop.x) / 2}
            y={packingRightTop.y - 6}
            textAnchor="middle"
          >
            PACKING · {vm.packing.footprintDefined ? "custom footprint" : "cargo-sized estimate"}
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
