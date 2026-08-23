import type { ArrangementRankingObjective } from "./types";

export const DEFAULT_ARRANGEMENT_OBJECTIVE_ORDER: ArrangementRankingObjective[] = [
  "MIN_TOTAL_AXLE_LINES",
  "MIN_TRAINS",
  "CARGO_ONLY_STABILITY",
  "SUPPORT_RESERVE",
  "STABILITY_MARGIN",
  "PEAK_UTILISATION",
  "DEFLECTION",
  "HYDRAULIC_QUALITY",
  "GROUP_LOAD_BALANCE",
  "PREFERRED_SPACING",
  "RATING",
];

export const ARRANGEMENT_OBJECTIVE_LABELS: Record<ArrangementRankingObjective, { label: string; detail: string }> = {
  MIN_TOTAL_AXLE_LINES: { label: "Minimum total axle lines", detail: "Prefer the least total SPMT axle lines." },
  MIN_TRAINS: { label: "Minimum trains", detail: "Prefer fewer parallel trailer trains." },
  CARGO_ONLY_STABILITY: { label: "Cargo-only stability", detail: "Prefer arrangements that pass without relying on combined COG." },
  SUPPORT_RESERVE: { label: "Support reserve", detail: "Prefer more settled active supports above the minimum." },
  STABILITY_MARGIN: { label: "Stability margin", detail: "Prefer greater margin above the governing tipping-angle limits." },
  PEAK_UTILISATION: { label: "Peak utilisation", detail: "Prefer lower governing axle, stability and spine utilisation." },
  DEFLECTION: { label: "Deflection", detail: "Prefer lower maximum absolute spine-beam deflection." },
  HYDRAULIC_QUALITY: { label: "Hydraulic quality", detail: "Prefer a wider, stronger hydraulic stability polygon." },
  GROUP_LOAD_BALANCE: { label: "Group-load balance", detail: "Prefer a smaller spread between hydraulic group reactions." },
  PREFERRED_SPACING: { label: "Preferred spacing", detail: "Prefer centre pitch closest to the operator's target." },
  RATING: { label: "Engineering rating", detail: "Use the configured detailed weighting as the final quality measure." },
};

export function objectiveOrderSummary(order: ArrangementRankingObjective[]): string {
  return order.map((objective, index) => `${index + 1}. ${ARRANGEMENT_OBJECTIVE_LABELS[objective].label}`).join(" → ");
}
