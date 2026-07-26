import type { COGType, LoadCaseMode, VisualEntityBase } from "../../geometry/types";

export type WorkspaceId =
  | "model"
  | "geometry"
  | "hydraulics"
  | "load-cases"
  | "stability"
  | "spine-beam"
  | "optimise"
  | "report";

export type ViewId = "plan" | "end" | "side" | "hydraulics" | "stability" | "beam";

export interface ViewLayerState {
  trailers: boolean;
  cargo: boolean;
  packing: boolean;
  axles: boolean;
  hydraulics: boolean;
  supports: boolean;
  cogs: boolean;
  envelopes: boolean;
  stability: boolean;
  loads: boolean;
}

export interface WorkbenchSelection {
  id: string;
  entity: VisualEntityBase | null;
}

export interface ViewPreferences {
  layers: ViewLayerState;
  visibleCogs: Record<COGType, boolean>;
  dimensions: boolean;
  legend: boolean;
  grid: boolean;
  loadCase: LoadCaseMode;
}

export const DEFAULT_LAYERS: ViewLayerState = {
  trailers: true,
  cargo: true,
  packing: true,
  axles: true,
  hydraulics: true,
  supports: true,
  cogs: true,
  envelopes: true,
  stability: true,
  loads: true,
};

export const DEFAULT_COG_VISIBILITY: Record<COGType, boolean> = {
  cargo: true,
  packing: false,
  load: true,
  "cargo-packing-ppu": false,
  "trailer-self-weight": false,
  transporter: false,
  "all-inclusive": true,
  neutral: false,
  "pinned-axle": false,
  "selected-case": false,
  "slope-shifted": false,
  "dynamic-shifted": false,
  "worst-case": false,
};
