"use client";

import type { ReactNode } from "react";
import type { COGPoint } from "../../geometry/types";

export function CogMarker({
  x,
  y,
  item,
  selected,
  onSelect,
}: {
  x: number;
  y: number;
  item: COGPoint;
  selected: boolean;
  onSelect(id: string): void;
}) {
  const size = selected ? 8 : 6;
  const common = {
    stroke: item.colour,
    strokeWidth: selected ? 2 : 1.4,
    fill: "#050505",
    vectorEffect: "non-scaling-stroke" as const,
  };
  let shape: ReactNode;
  switch (item.marker) {
    case "diamond":
      shape = <path d={`M ${x} ${y - size} L ${x + size} ${y} L ${x} ${y + size} L ${x - size} ${y} Z`} {...common} />;
      break;
    case "square":
      shape = <rect x={x - size} y={y - size} width={size * 2} height={size * 2} {...common} />;
      break;
    case "triangle":
      shape = <path d={`M ${x} ${y - size} L ${x + size} ${y + size} L ${x - size} ${y + size} Z`} {...common} />;
      break;
    case "target":
      shape = (
        <>
          <circle cx={x} cy={y} r={size} {...common} />
          <line x1={x - size - 4} y1={y} x2={x + size + 4} y2={y} {...common} />
          <line x1={x} y1={y - size - 4} x2={x} y2={y + size + 4} {...common} />
        </>
      );
      break;
    case "cross":
      shape = (
        <>
          <line x1={x - size} y1={y - size} x2={x + size} y2={y + size} {...common} />
          <line x1={x + size} y1={y - size} x2={x - size} y2={y + size} {...common} />
        </>
      );
      break;
    default:
      shape = <circle cx={x} cy={y} r={size} {...common} />;
  }
  return (
    <g
      className={`svg-selectable cog-marker${selected ? " is-selected" : ""}`}
      role="button"
      tabIndex={0}
      aria-label={item.selection.title}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(item.id);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onSelect(item.id);
      }}
    >
      {shape}
      <desc>
        {item.selection.title}: X {item.point.x.toFixed(3)} m, Y {item.point.y.toFixed(3)} m, Z{" "}
        {item.point.z.toFixed(3)} m
      </desc>
    </g>
  );
}

export function DimensionLine({
  x1,
  y1,
  x2,
  y2,
  label,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label: string;
}) {
  const vertical = Math.abs(x2 - x1) < Math.abs(y2 - y1);
  const tick = 5;
  return (
    <g className="dimension-line">
      <line x1={x1} y1={y1} x2={x2} y2={y2} />
      <line
        x1={x1 - (vertical ? tick : 0)}
        y1={y1 - (vertical ? 0 : tick)}
        x2={x1 + (vertical ? tick : 0)}
        y2={y1 + (vertical ? 0 : tick)}
      />
      <line
        x1={x2 - (vertical ? tick : 0)}
        y1={y2 - (vertical ? 0 : tick)}
        x2={x2 + (vertical ? tick : 0)}
        y2={y2 + (vertical ? 0 : tick)}
      />
      <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 7} textAnchor="middle">
        {label}
      </text>
    </g>
  );
}

export function AxisGlyph({ x = 24, y = 28 }: { x?: number; y?: number }) {
  return (
    <g className="axis-glyph" transform={`translate(${x} ${y})`}>
      <line x1={0} y1={22} x2={28} y2={22} />
      <line x1={0} y1={22} x2={0} y2={-6} />
      <path d="M 28 22 l -5 -3 l 0 6 z" />
      <path d="M 0 -6 l -3 5 l 6 0 z" />
      <text x={34} y={26}>X</text>
      <text x={-4} y={-12}>Y</text>
    </g>
  );
}

export function ViewGrid({
  width,
  height,
  visible,
}: {
  width: number;
  height: number;
  visible: boolean;
}) {
  if (!visible) return null;
  return (
    <g className="view-grid" aria-hidden="true">
      {Array.from({ length: Math.ceil(width / 32) + 1 }, (_, index) => (
        <line key={`x-${index}`} x1={index * 32} y1={0} x2={index * 32} y2={height} />
      ))}
      {Array.from({ length: Math.ceil(height / 32) + 1 }, (_, index) => (
        <line key={`y-${index}`} x1={0} y1={index * 32} x2={width} y2={index * 32} />
      ))}
    </g>
  );
}
