const PRECISION_BY_UNIT: Record<string, number> = {
  m: 3,
  mm: 3,
  t: 2,
  kN: 1,
  kNm: 1,
  "%": 1,
  "°": 1,
  "m/s": 2,
  "m/s²": 2,
  s: 2,
};

export function formatEngineering(
  value: number | null | undefined,
  unit = "",
  precision = PRECISION_BY_UNIT[unit] ?? 3,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Not available";
  const number = new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
    useGrouping: true,
  }).format(value);
  return unit ? `${number} ${unit}` : number;
}

export function formatCompact(value: number | null | undefined, precision = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return value.toFixed(precision);
}

export function formatDuration(milliseconds: number | null | undefined): string {
  if (milliseconds === null || milliseconds === undefined || !Number.isFinite(milliseconds)) return "Estimating…";
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    PASS: "PASS",
    NOK_FAIL: "NOK FAIL",
    SUPPORT_FAIL: "SUPPORT FAIL",
    GEOMETRY_FAIL: "INVALID GEOMETRY",
    ERROR: "CALCULATION ERROR",
    IDLE: "Idle",
    PLANNING: "Planning",
    RUNNING: "Running",
    STOPPED: "Stopped",
    FAILED: "Failed",
    COMPLETE: "Complete",
  };
  return labels[status] ?? status.replaceAll("_", " ");
}

export function sourceLabel(source: string | null | undefined): string {
  return source?.trim() || "Native model";
}

export function csvEscape(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}
