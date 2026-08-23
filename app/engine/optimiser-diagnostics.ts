import type { ActivityEvent, OptimiserRun, ProjectModel } from "./types";

export interface DiagnosticEventSummary {
  failed: boolean;
  failedConstraint: string | null;
  summary: string;
}

export function diagnosticEventSummary(event: ActivityEvent): DiagnosticEventSummary {
  const text = `${event.message}\n${event.detail}`;
  const failDetail = text.match(/failDetail=([^;\n]+)/i)?.[1]?.trim();
  const failClass = text.match(/failClass=([^;\n]+)/i)?.[1]?.trim();
  const nokMetric = text.match(/([A-Za-z][A-Za-z0-9_. /-]*)=([^;\n]+)\s\[NOK(?:;|\])/i)?.[1]?.trim();
  const explicitFailure = /\b(NOK_FAIL|SUPPORT_FAIL|GEOMETRY_FAIL|ERROR|rejected|cannot|failed|failure)\b/i.test(text);
  const failed = event.level === "ERROR" || explicitFailure || Boolean(nokMetric);
  const failedConstraint = failDetail && failDetail !== "none"
    ? failDetail
    : failClass && failClass !== "none"
      ? failClass
      : nokMetric ?? (failed ? event.message : null);
  return {
    failed,
    failedConstraint,
    summary: failedConstraint ? `${event.message} — ${failedConstraint}` : event.message,
  };
}

export function optimiserDiagnosticJson(run: OptimiserRun, startModel: ProjectModel | null): string {
  return JSON.stringify({
    format: "trailer-stability-optimiser-audit",
    version: 1,
    generatedAt: new Date().toISOString(),
    orientation: "lower X / left is rear; higher X / right is front",
    startModel,
    run,
  }, null, 2);
}

function value(value: number | null | undefined, digits = 3): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "N/A";
}

export function optimiserDiagnosticMarkdown(run: OptimiserRun, startModel: ProjectModel | null): string {
  const chronological = [...run.events].reverse();
  const valid = run.passes.filter((pass) => pass.result.status === "PASS");
  const failed = run.passes.filter((pass) => pass.result.status !== "PASS");
  const lines = [
    `# Arrangement search audit — ${run.runReference || "unreferenced run"}`,
    "",
    `Generated: ${new Date().toISOString()}`,
    `State: ${run.state}`,
    `Orientation: lower X / left is rear; higher X / right is front`,
    `Cases evaluated: ${run.passes.length} (${valid.length} PASS, ${failed.length} failed)`,
    `Started: ${run.startedAt ?? "N/A"}; finished: ${run.finishedAt ?? "N/A"}`,
    "",
    "## Search inputs",
    "",
    `- Cargo: ${startModel?.cargo.name || "N/A"}; ${value(startModel?.cargo.massT)} t; ${value(startModel?.cargo.lengthM)} × ${value(startModel?.cargo.widthM)} × ${value(startModel?.cargo.heightM)} m`,
    `- Cargo COG: (${value(startModel?.cargo.cog.x)}, ${value(startModel?.cargo.cog.y)}, ${value(startModel?.cargo.cog.z)}) m`,
    `- Trailer: ${startModel?.arrangementOptimiser.trailerDefinitionId ?? "N/A"}; trains ${startModel?.arrangementOptimiser.minimumTrains ?? "N/A"}–${startModel?.arrangementOptimiser.maximumTrains ?? "N/A"}; maximum ${startModel?.arrangementOptimiser.maximumAxleLinesPerTrain ?? "N/A"} AL/train`,
    `- Hydraulics searched: ${startModel?.arrangementOptimiser.hydraulicSearchMode ?? "N/A"}`,
    `- Supports: ${startModel?.supports.length ?? 0}; minimum active ${startModel?.optimiser.minimumActiveSupports ?? "N/A"}`,
    `- Objective preset: ${startModel?.arrangementOptimiser.objectivePresetName ?? "N/A"}`,
    `- Objective order: ${startModel?.arrangementOptimiser.objectiveOrder.join(" > ") ?? "N/A"}`,
    "",
    "## Ranked valid candidates",
    "",
    "| Rank | Pass | Trains | AL/train | Total AL | Hydraulics | Pitch (m) | Width (m) | Active supports | Dynamic util. | Dynamic angle | Rating |",
    "|---:|---|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|",
    ...valid.sort((a, b) => (a.overallRank ?? Infinity) - (b.overallRank ?? Infinity)).map((pass) => `| ${pass.overallRank ?? "—"} | ${pass.id} | ${pass.arrangement?.trainCount ?? "—"} | ${pass.arrangement?.axleLinesPerTrain ?? pass.c89} | ${pass.arrangement?.totalAxleLines ?? "—"} | ${pass.arrangement?.hydraulicSystemMode ?? "—"} | ${value(pass.arrangement?.pitchM)} | ${value(pass.arrangement?.overallWidthM)} | ${pass.result.activeSupportCount} | ${value((pass.result.metrics.dynamicUtil.value ?? NaN) * 100, 1)}% | ${value(pass.result.metrics.dynamicAngle.value, 2)}° | ${value(pass.rating)} |`),
    "",
    "## Failed-case summary",
    "",
    ...(failed.length ? failed.map((pass) => `- **${pass.caseReference}** — ${pass.result.status}; ${pass.result.failClass || "unclassified"}; ${pass.result.failDetail || "no detail"}`) : ["No failed evaluated cases."]),
    "",
    "## Chronological activity",
    "",
    ...chronological.flatMap((event) => {
      const summary = diagnosticEventSummary(event);
      return [
        `### ${event.id}. [${event.level}] ${event.phase}/${event.stage}${event.caseReference ? ` — ${event.caseReference}` : ""}`,
        "",
        `${summary.failed ? "**FAILED CONSTRAINT:** " : ""}${summary.summary}`,
        "",
        "```text",
        event.detail || "No additional detail.",
        "```",
        "",
      ];
    }),
    "## Reproduction note",
    "",
    "The companion lossless JSON export contains the complete starting ProjectModel, every candidate result, all support-settling transitions and every activity event in machine-readable form.",
  ];
  return lines.join("\n");
}
