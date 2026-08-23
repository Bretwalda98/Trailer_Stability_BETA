import { engineeringLimitsFor } from "./core";
import type { PassResult, ProjectModel } from "./types";

export type ArrangementComparisonKind = "AL_FIRST" | "TRAIN_FIRST" | "BALANCED";

export interface ArrangementComparison {
  kind: ArrangementComparisonKind;
  label: string;
  pass: PassResult;
  metrics: {
    totalAxleLines: number;
    trains: number;
    spacingM: number;
    widthM: number;
    peakUtilisation: number;
    stabilityMarginDeg: number;
    supportReserve: number;
    deflectionMm: number;
    rating: number;
  };
  dominated: boolean;
  dominatedBy: string[];
}

function finite(value: number | null | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function comparisonMetrics(pass: PassResult, model: ProjectModel): ArrangementComparison["metrics"] {
  const limits = engineeringLimitsFor(model.engineeringDegree);
  const result = pass.result;
  return {
    totalAxleLines: pass.arrangement!.totalAxleLines,
    trains: pass.arrangement!.trainCount,
    spacingM: pass.arrangement!.pitchM,
    widthM: pass.arrangement!.overallWidthM,
    peakUtilisation: Math.max(
      finite(result.metrics.basicUtil.value, Infinity),
      finite(result.metrics.slopeUtil.value, Infinity),
      finite(result.metrics.dynamicUtil.value, Infinity),
      finite(result.metrics.spineUtil.value, Infinity),
    ),
    stabilityMarginDeg: Math.min(
      finite(result.metrics.basicAngle.value, -Infinity) - limits.basicAngle,
      finite(result.metrics.slopeAngle.value, -Infinity) - limits.slopeAngle,
      finite(result.metrics.dynamicAngle.value, -Infinity) - limits.dynamicAngle,
    ),
    supportReserve: result.activeSupportCount - result.minimumActiveSupports,
    deflectionMm: finite(result.beam.absoluteDeflectionMm, Infinity),
    rating: finite(pass.rating, Infinity),
  };
}

function dominates(left: ArrangementComparison["metrics"], right: ArrangementComparison["metrics"], preferredSpacingM: number): boolean {
  const leftValues = [left.totalAxleLines, left.trains, Math.abs(left.spacingM - preferredSpacingM), left.widthM, left.peakUtilisation, -left.stabilityMarginDeg, -left.supportReserve, left.deflectionMm, left.rating];
  const rightValues = [right.totalAxleLines, right.trains, Math.abs(right.spacingM - preferredSpacingM), right.widthM, right.peakUtilisation, -right.stabilityMarginDeg, -right.supportReserve, right.deflectionMm, right.rating];
  return leftValues.every((value, index) => value <= rightValues[index]) && leftValues.some((value, index) => value < rightValues[index]);
}

export function arrangementComparisons(passes: PassResult[], model: ProjectModel): ArrangementComparison[] {
  const valid = passes.filter((pass) => pass.result.status === "PASS" && pass.arrangement && pass.rating !== null);
  if (!valid.length) return [];
  const byAl = [...valid].sort((a, b) => a.arrangement!.totalAxleLines - b.arrangement!.totalAxleLines || a.arrangement!.trainCount - b.arrangement!.trainCount || (a.overallRank ?? Infinity) - (b.overallRank ?? Infinity))[0];
  const byTrains = [...valid].sort((a, b) => a.arrangement!.trainCount - b.arrangement!.trainCount || a.arrangement!.totalAxleLines - b.arrangement!.totalAxleLines || (a.overallRank ?? Infinity) - (b.overallRank ?? Infinity))[0];
  const balanced = [...valid].sort((a, b) => (a.overallRank ?? Infinity) - (b.overallRank ?? Infinity) || a.sequence - b.sequence)[0];
  const selections: Array<[ArrangementComparisonKind, string, PassResult]> = [
    ["AL_FIRST", "AL-first", byAl],
    ["TRAIN_FIRST", "Train-first", byTrains],
    ["BALANCED", `Selected order`, balanced],
  ];
  return selections.map(([kind, label, pass]) => {
    const metrics = comparisonMetrics(pass, model);
    const dominatedBy = valid
      .filter((candidate) => candidate.id !== pass.id && dominates(comparisonMetrics(candidate, model), metrics, model.arrangementOptimiser.preferredCentreSpacingM))
      .map((candidate) => candidate.id);
    return { kind, label, pass, metrics, dominated: dominatedBy.length > 0, dominatedBy };
  });
}
