/**
 * Canonical longitudinal convention used by the calculation engine, data
 * exchange, editors and drawings.
 *
 * Engineering X increases from left to right:
 *   lower X / screen left  = REAR
 *   higher X / screen right = FRONT
 */
export const LONGITUDINAL_ORIENTATION_ID = "REAR_LEFT_FRONT_RIGHT" as const;

export type LongitudinalEnd = "rear" | "front";
export type LateralCircuit = "left" | "right";
export type HydraulicCornerKey =
  | "rearLeft"
  | "rearRight"
  | "frontLeft"
  | "frontRight";

export const LONGITUDINAL_ORIENTATION = {
  id: LONGITUDINAL_ORIENTATION_ID,
  negativeX: "rear",
  positiveX: "front",
  screenLeft: "rear",
  screenRight: "front",
  axleLineOneEnd: "rear",
  ppuLeftEnd: "rear",
  ppuRightEnd: "front",
} as const;

export function longitudinalEndForAxleLine(
  axleLine: number,
  splitAfterAxleLine: number,
): LongitudinalEnd {
  return axleLine <= splitAfterAxleLine ? "rear" : "front";
}

export function hydraulicCornerForAxleLine(
  axleLine: number,
  splitAfterAxleLine: number,
  circuit: LateralCircuit,
): HydraulicCornerKey {
  const end = longitudinalEndForAxleLine(axleLine, splitAfterAxleLine);
  return `${end}${circuit === "left" ? "Left" : "Right"}` as HydraulicCornerKey;
}

export function swapLegacyLongitudinalCorners(corners: {
  frontLeft: number;
  frontRight: number;
  rearLeft: number;
  rearRight: number;
}): {
  frontLeft: number;
  frontRight: number;
  rearLeft: number;
  rearRight: number;
} {
  return {
    rearLeft: corners.frontLeft,
    rearRight: corners.frontRight,
    frontLeft: corners.rearLeft,
    frontRight: corners.rearRight,
  };
}
