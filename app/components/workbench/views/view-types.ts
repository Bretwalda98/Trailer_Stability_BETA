import type { Point2 } from "../../../engine/types";
import type { GeometryViewModel, ViewportTransform } from "../../../geometry/types";
import type { ViewPreferences } from "../types";

export interface EngineeringViewProps {
  vm: GeometryViewModel;
  transform: ViewportTransform;
  width: number;
  height: number;
  preferences: ViewPreferences;
  selectedId: string;
  compact?: boolean;
  onSelect(id: string): void;
  onBackgroundPointerDown?(event: React.PointerEvent<SVGSVGElement>): void;
  onBackgroundPointerMove?(event: React.PointerEvent<SVGSVGElement>): void;
  onBackgroundPointerUp?(event: React.PointerEvent<SVGSVGElement>): void;
  onWheel?(event: React.WheelEvent<SVGSVGElement>): void;
}

export function pointPath(transform: ViewportTransform, points: Point2[], closed = false): string {
  if (!points.length) return "";
  const path = points
    .map((point, index) => {
      const screen = transform.toScreen(point);
      return `${index ? "L" : "M"} ${screen.x.toFixed(2)} ${screen.y.toFixed(2)}`;
    })
    .join(" ");
  return closed ? `${path} Z` : path;
}
