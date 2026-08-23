import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { createDefaultModel } from "../app/data/default-model";
import { calculateProject } from "../app/engine/core";

const RUNS = 100;
const TOLERANCE = 1e-8;
const SUPPORT_X = [
  2.0384396372828633,
  2.4475483012385664,
  6.2395687701180576,
  7.109401272190734,
];

function caseModel() {
  const model = createDefaultModel();
  model.supports = SUPPORT_X.map((xM, index) => ({
    id: `settle-support-${index + 1}`,
    xM,
    widthM: 0.5,
    allowed: true,
    active: true,
    positiveConnectionToDeck: false,
  }));
  return model;
}

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))] ?? 0;
}

function close(actual: number, expected: number, label: string): void {
  assert.ok(Math.abs(actual - expected) <= TOLERANCE, `${label}: ${actual} != ${expected}`);
}

const warmModel = caseModel();
for (let index = 0; index < 10; index += 1) calculateProject(warmModel);

const baseline = calculateProject(warmModel);
assert.equal(baseline.supportSettlement.converged, true);
assert.equal(baseline.supportSettlement.calculationCount, 2);
const disabledIds = new Set(
  baseline.supports
    .filter((support) => support.disableReason === "NEGATIVE_REACTION")
    .map((support) => support.id),
);
assert.deepEqual([...disabledIds], ["settle-support-1", "settle-support-3"]);

// Independent retained-set verification: make the settled-off rows unavailable
// from the start and run one exact solve. Final reactions and beam extrema must
// match the dependency-aware two-pass result.
const retainedSetModel = caseModel();
retainedSetModel.supports = retainedSetModel.supports.map((support) => ({
  ...support,
  allowed: !disabledIds.has(support.id),
  active: !disabledIds.has(support.id),
}));
const retainedSet = calculateProject(retainedSetModel);
assert.equal(retainedSet.supportSettlement.calculationCount, 1);
for (const support of baseline.supports.filter((item) => item.active)) {
  const verifier = retainedSet.supports.find((item) => item.id === support.id);
  assert.ok(verifier?.active);
  close(verifier.reactionT, support.reactionT, `${support.id} reaction`);
}
close(retainedSet.beam.shearMinKN, baseline.beam.shearMinKN, "minimum shear");
close(retainedSet.beam.shearMaxKN, baseline.beam.shearMaxKN, "maximum shear");
close(retainedSet.beam.bendingMinKNm, baseline.beam.bendingMinKNm, "minimum bending");
close(retainedSet.beam.bendingMaxKNm, baseline.beam.bendingMaxKNm, "maximum bending");
close(retainedSet.beam.absoluteDeflectionMm, baseline.beam.absoluteDeflectionMm, "absolute deflection");

const totalTimes: number[] = [];
const settlementTimes: number[] = [];
for (let index = 0; index < RUNS; index += 1) {
  const started = performance.now();
  const result = calculateProject(warmModel);
  totalTimes.push(performance.now() - started);
  settlementTimes.push(result.supportSettlement.calculationTimeMs);
  assert.equal(result.supportSettlement.calculationCount, 2);
  assert.ok(result.supports.filter((support) => support.active).every(
    (support) => support.reactionT >= -result.supportSettlement.reactionToleranceT,
  ));
}

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
console.log(JSON.stringify({
  runs: RUNS,
  exactVerificationTolerance: TOLERANCE,
  dependencyAwareCalculationsPerCase: baseline.supportSettlement.calculationCount,
  retainedSetVerificationCalculations: retainedSet.supportSettlement.calculationCount,
  finalActiveSupports: baseline.supports.filter((support) => support.active).map((support) => support.id),
  disabledNegativeSupports: baseline.supports.filter((support) => support.disableReason === "NEGATIVE_REACTION").map((support) => ({ id: support.id, reactionT: support.reactionT })),
  timingMs: {
    totalMean: mean(totalTimes),
    totalP50: percentile(totalTimes, 0.5),
    totalP95: percentile(totalTimes, 0.95),
    supportSettlementMean: mean(settlementTimes),
    supportSettlementP50: percentile(settlementTimes, 0.5),
    supportSettlementP95: percentile(settlementTimes, 0.95),
  },
}, null, 2));
