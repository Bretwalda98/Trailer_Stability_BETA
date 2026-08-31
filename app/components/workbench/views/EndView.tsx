"use client";
import { DeckPpuElevation, PlacedTrainElevation } from "./PlacedElevation";

import { buildEndTippingConstructions } from "../../../geometry/end-tipping";
import type { Bogie, TrailerUnit } from "../../../geometry/types";
import { CogMarker, DimensionLine, ViewGrid } from "../svg-primitives";
import type { EngineeringViewProps } from "./view-types";

const END_TIPPING_CASES = [
  { mode: "basic", label: "BASIC", colour: "#38bdf8" },
  { mode: "slope", label: "SLOPE", colour: "#f59e0b" },
  { mode: "dynamic", label: "DYNAMIC", colour: "#f472b6" },
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
  const tyreHalfWidth = catalogueTyreWidth / 2;
  const deckBodyHeight = Math.max(
    catalogueTyreWidth * 0.8,
    Math.min(trailer.deckHeightM * 0.18, catalogueWheelDiameter * 0.35),
  );
  const deckTopZ = trailer.deckHeightM + deckBodyHeight / 2;
  const deckBottomZ = Math.max(catalogueWheelDiameter * 1.05, trailer.deckHeightM - deckBodyHeight / 2);
  const outerHalf = Math.max(tyreHalfWidth, trailer.widthM / 2 - tyreHalfWidth);
  const crossHalf = trailer.crossBogieSpacingM && trailer.crossBogieSpacingM > 0
    ? Math.min(outerHalf, trailer.crossBogieSpacingM / 2)
    : outerHalf;
  const transverseOffsets = trailer.singleFile
    ? [-outerHalf, outerHalf]
    : [-outerHalf, -crossHalf, crossHalf, outerHalf];
  const wheelPositions = [...new Set(transverseOffsets.map((offset) => trailer.centreYM + offset))];
  const deckLeftY = trailer.centreYM - trailer.widthM / 2;
  const deckRightY = trailer.centreYM + trailer.widthM / 2;
  const wheelTopZ = catalogueWheelDiameter;
  const wheelBottomZ = 0;
  const columnWidth = Math.max(catalogueTyreWidth * 0.26, catalogueWheelDiameter * 0.08);
  const columnTopZ = deckBottomZ;
  const columnBottomZ = wheelTopZ + catalogueWheelDiameter * 0.02;
  const upperLinkZ = catalogueWheelDiameter * 0.72;
  const lowerLinkZ = catalogueWheelDiameter * 0.30;
  const centralLinkZ = catalogueWheelDiameter * 0.46;
  const braceInset = Math.min(trailer.widthM * 0.12, crossHalf * 0.32);
  const innerLeftY = trailer.centreYM - crossHalf;
  const innerRightY = trailer.centreYM + crossHalf;
  const centralHalf = Math.min(Math.max(catalogueTyreWidth * 0.45, crossHalf * 0.18), trailer.widthM * 0.08);

  const screenPoint = (yM: number, zM: number) =>
    transform.toScreen({ x: trailer.startXM, y: yM, z: zM });
  const pointString = (yM: number, zM: number) => {
    const point = screenPoint(yM, zM);
    return `${point.x.toFixed(2)},${point.y.toFixed(2)}`;
  };
  const line = (y1: number, z1: number, y2: number, z2: number) => {
    const start = screenPoint(y1, z1);
    const end = screenPoint(y2, z2);
    return { start, end };
  };
  const deckPoints = [
    pointString(deckLeftY, deckTopZ),
    pointString(deckRightY, deckTopZ),
    pointString(deckRightY, deckBottomZ),
    pointString(deckLeftY, deckBottomZ),
  ].join(" ");
  const bracePath = [
    line(deckLeftY + braceInset, deckBottomZ, innerLeftY - tyreHalfWidth * 0.25, wheelTopZ + catalogueWheelDiameter * 0.02),
    line(deckRightY - braceInset, deckBottomZ, innerRightY + tyreHalfWidth * 0.25, wheelTopZ + catalogueWheelDiameter * 0.02),
  ];
  const centralBrace = [
    line(innerLeftY + tyreHalfWidth, centralLinkZ + catalogueTyreWidth * 0.2, trailer.centreYM - centralHalf, centralLinkZ),
    line(trailer.centreYM - centralHalf, centralLinkZ, trailer.centreYM + centralHalf, centralLinkZ),
    line(trailer.centreYM + centralHalf, centralLinkZ, innerRightY - tyreHalfWidth, centralLinkZ + catalogueTyreWidth * 0.2),
  ];

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
          <polygon
            className="spmt-deck"
            points={deckPoints}
          />
          {bracePath.map(({ start, end }, index) => (
            <line key={`brace:${index}`} className="spmt-frame" x1={start.x} y1={start.y} x2={end.x} y2={end.y} />
          ))}
          {wheelPositions.map((yM, index) => {
            const column = line(yM, columnTopZ, yM, columnBottomZ);
            return (
              <rect
                key={`column:${index}`}
                className="spmt-suspension-column"
                x={column.start.x - columnWidth * transform.scale / 2}
                y={column.start.y}
                width={columnWidth * transform.scale}
                height={Math.max(2, column.end.y - column.start.y)}
              />
            );
          })}
          {[upperLinkZ, lowerLinkZ].map((zM) => (
            <g key={`link:${zM}`}>
              {[[-outerHalf, -crossHalf], [crossHalf, outerHalf]].map(([left, right], index) => {
                const link = line(trailer.centreYM + left, zM, trailer.centreYM + right, zM);
                return <line key={`link:${zM}:${index}`} className="spmt-axle-link" x1={link.start.x} y1={link.start.y} x2={link.end.x} y2={link.end.y} />;
              })}
            </g>
          ))}
          {centralBrace.map(({ start, end }, index) => (
            <line key={`central:${index}`} className="spmt-frame" x1={start.x} y1={start.y} x2={end.x} y2={end.y} />
          ))}
          <line
            className="spmt-centreline"
            x1={screenPoint(trailer.centreYM, deckBottomZ).x}
            y1={screenPoint(trailer.centreYM, deckBottomZ).y}
            x2={screenPoint(trailer.centreYM, centralLinkZ).x}
            y2={screenPoint(trailer.centreYM, centralLinkZ).y}
          />
        </>
      )}
      {showWheels &&
        wheelPositions.map((yM, index) => {
          const source = nearestBogie(bogies, yM);
          const wheelCentre = screenPoint(yM, radius);
          const profileChamfer = Math.min(catalogueTyreWidth * 0.18, catalogueWheelDiameter * 0.08);
          const profilePoints = [
            pointString(yM - tyreHalfWidth + profileChamfer, wheelTopZ),
            pointString(yM + tyreHalfWidth - profileChamfer, wheelTopZ),
            pointString(yM + tyreHalfWidth, wheelTopZ - profileChamfer),
            pointString(yM + tyreHalfWidth, wheelBottomZ + profileChamfer),
            pointString(yM + tyreHalfWidth - profileChamfer, wheelBottomZ),
            pointString(yM - tyreHalfWidth + profileChamfer, wheelBottomZ),
            pointString(yM - tyreHalfWidth, wheelBottomZ + profileChamfer),
            pointString(yM - tyreHalfWidth, wheelTopZ - profileChamfer),
          ].join(" ");
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
              <polygon
                className="spmt-tyre-profile"
                points={profilePoints}
              />
              <rect
                className="spmt-hub-profile"
                x={wheelCentre.x - Math.max(2, catalogueTyreWidth * transform.scale * 0.28) / 2}
                y={wheelCentre.y - Math.max(3, catalogueWheelDiameter * transform.scale * 0.06) / 2}
                width={Math.max(2, catalogueTyreWidth * transform.scale * 0.28)}
                height={Math.max(3, catalogueWheelDiameter * transform.scale * 0.06)}
              />
            </g>
          );
        })}
      {showStructure && (
        <text
          className="spmt-label"
          x={(screenPoint(deckLeftY, deckBottomZ).x + screenPoint(deckRightY, deckBottomZ).x) / 2}
          y={screenPoint(deckRightY, deckBottomZ).y + 18}
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
  const groundEnd = transform.toScreen({ x: 0, y: vm.bounds.maxY, z: 0 });
  const tippingRays = buildEndTippingConstructions(result).map((construction) => ({
    ...construction,
    ...END_TIPPING_CASES.find((definition) => definition.mode === construction.mode)!,
  }));

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
        Datum Z = 0 · cross slope represented by shifted COG envelope
      </text>

      <DeckPpuElevation props={props} end />
      {vm.trailers.map((trailer) => Math.abs(trailer.yawDeg) > 1e-9 ? <PlacedTrainElevation key={trailer.id} trailer={trailer} props={props} end /> : (
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

      {preferences.layers.stability && tippingRays.length > 0 && (
        <g className="end-stability">
          {tippingRays.map((ray, index) => {
            const pivot = transform.toScreen({ x: 0, y: ray.foot.y, z: 0 });
            const cogRing = transform.toScreen({ x: 0, y: ray.cogPoint.y, z: result.combinedCog.z });
            const verticalTop = transform.toScreen({ x: 0, y: ray.foot.y, z: result.combinedCog.z });
            const inwardDirection = ray.outwardDirectionY * -1;
            const labelX = (pivot.x + cogRing.x) / 2 + inwardDirection * 8;
            const labelY = (pivot.y + cogRing.y) / 2 - 8 - index * 12;
            const firstRayForEdge = tippingRays.findIndex((candidate) => candidate.edgeIndex === ray.edgeIndex) === index;
            return (
              <g key={ray.metricKey} className="end-tipping-ray" style={{ color: ray.colour }}>
                {firstRayForEdge && (
                  <>
                    <line className="stability-side-line" x1={pivot.x} y1={pivot.y} x2={verticalTop.x} y2={verticalTop.y} />
                    <circle className="tipping-pivot" cx={pivot.x} cy={pivot.y} r={4} />
                    <text
                      className="critical-side-label"
                      x={pivot.x + inwardDirection * 8}
                      y={pivot.y - 10}
                      textAnchor={inwardDirection > 0 ? "start" : "end"}
                    >
                      EDGE {ray.edgeIndex + 1} · {ray.side}
                    </text>
                  </>
                )}
                <line x1={cogRing.x} y1={cogRing.y} x2={pivot.x} y2={pivot.y} />
                <circle cx={cogRing.x} cy={cogRing.y} r={3.2} />
                <text x={labelX} y={labelY} textAnchor={inwardDirection > 0 ? "start" : "end"}>
                  {ray.label} {ray.angleDeg.toFixed(1)}°
                </text>
                <desc>
                  {ray.label} tipping-angle construction from its controlling shifted COG-envelope ring to edge {ray.edgeIndex + 1}.
                </desc>
              </g>
            );
          })}
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
