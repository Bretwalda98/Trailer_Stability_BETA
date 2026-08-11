import type { BeamMetrics, BeamPoint } from "./types";

export interface BeamSegmentInput {
  endM: number;
  eiKNm2: number;
}

export interface BeamSupportInput {
  id: string;
  xM: number;
  widthM?: number;
  active?: boolean;
  prescribedDeflectionM?: number;
}

export interface BeamPointLoadInput {
  xM: number;
  forceKN: number;
  momentKNm?: number;
}

export interface BeamDistributedLoadInput {
  startM: number;
  endM: number;
  startKNPerM: number;
  endKNPerM: number;
}

export interface ContinuousBeamInput {
  lengthM: number;
  segments: BeamSegmentInput[];
  supports: BeamSupportInput[];
  pointLoads: BeamPointLoadInput[];
  distributedLoads?: BeamDistributedLoadInput[];
  outputStepM?: number;
  applySupportSpreading?: boolean;
}

export interface ContinuousBeamResult {
  points: BeamPoint[];
  reactions: Array<{ id: string; xM: number; reactionKN: number }>;
  stable: boolean;
  warning: string;
}

const EPS = 1e-9;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function uniqueSorted(values: number[]): number[] {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const result: number[] = [];
  for (const value of sorted) {
    if (!result.length || Math.abs(value - result[result.length - 1]) > 1e-8) result.push(value);
  }
  return result;
}

function segmentEiAt(segments: BeamSegmentInput[], xM: number): number {
  for (const segment of segments) {
    if (xM <= segment.endM + EPS) return Math.max(segment.eiKNm2, EPS);
  }
  return Math.max(segments.at(-1)?.eiKNm2 ?? 1, EPS);
}

function distributedAt(load: BeamDistributedLoadInput, xM: number): number {
  if (xM < load.startM - EPS || xM > load.endM + EPS) return 0;
  const length = load.endM - load.startM;
  if (Math.abs(length) < EPS) return load.startKNPerM;
  const ratio = clamp((xM - load.startM) / length, 0, 1);
  return load.startKNPerM + ratio * (load.endKNPerM - load.startKNPerM);
}

function addMatrix(target: number[][], indexes: number[], source: number[][]): void {
  for (let row = 0; row < indexes.length; row += 1) {
    for (let column = 0; column < indexes.length; column += 1) {
      target[indexes[row]][indexes[column]] += source[row][column];
    }
  }
}

function addVector(target: number[], indexes: number[], source: number[]): void {
  for (let index = 0; index < indexes.length; index += 1) target[indexes[index]] += source[index];
}

function solveLinear(matrix: number[][], rhs: number[]): number[] {
  const n = rhs.length;
  if (!n) return [];

  // Euler-Bernoulli beam assembly is symmetric and narrowly banded. Solving the
  // full matrix with Gauss-Jordan made runtime grow cubically with every output
  // station. LDL-transpose retains the same numerical system while only visiting its
  // non-zero band.
  let bandwidth = 0;
  const scales = Array(n).fill(0);
  for (let row = 0; row < n; row += 1) {
    const diagonal = matrix[row][row];
    if (!Number.isFinite(diagonal) || diagonal <= 0) throw new Error("Beam stiffness matrix is singular.");
    // Symmetric diagonal equilibration keeps translational and rotational
    // degrees of freedom on comparable numerical scales. Without it, a long
    // SPMT spine containing short feature elements can be falsely classified
    // as singular even though two or more valid supports restrain the beam.
    scales[row] = Math.sqrt(diagonal);
    for (let column = 0; column < row; column += 1) {
      if (matrix[row][column] !== 0) bandwidth = Math.max(bandwidth, row - column);
    }
  }
  const lower = Array.from({ length: n }, () => Array(bandwidth + 1).fill(0));
  const diagonal = Array(n).fill(0);
  const tolerance = 1e-14;
  const scaledValue = (row: number, column: number): number =>
    matrix[row][column] / (scales[row] * scales[column]);

  for (let row = 0; row < n; row += 1) {
    const firstColumn = Math.max(0, row - bandwidth);
    for (let column = firstColumn; column < row; column += 1) {
      let value = scaledValue(row, column);
      const firstShared = Math.max(0, row - bandwidth, column - bandwidth);
      for (let shared = firstShared; shared < column; shared += 1) {
        value -=
          lower[row][row - shared] *
          diagonal[shared] *
          lower[column][column - shared];
      }
      if (Math.abs(diagonal[column]) < tolerance) throw new Error("Beam stiffness matrix is singular.");
      lower[row][row - column] = value / diagonal[column];
    }
    let pivot = scaledValue(row, row);
    for (let shared = firstColumn; shared < row; shared += 1) {
      const factor = lower[row][row - shared];
      pivot -= factor * factor * diagonal[shared];
    }
    if (!Number.isFinite(pivot) || pivot <= tolerance) throw new Error("Beam stiffness matrix is singular.");
    diagonal[row] = pivot;
    lower[row][0] = 1;
  }

  const forward = Array(n).fill(0);
  for (let row = 0; row < n; row += 1) {
    let value = rhs[row] / scales[row];
    for (let column = Math.max(0, row - bandwidth); column < row; column += 1) {
      value -= lower[row][row - column] * forward[column];
    }
    forward[row] = value;
  }
  const diagonalSolved = forward.map((value, index) => value / diagonal[index]);
  const result = Array(n).fill(0);
  for (let row = n - 1; row >= 0; row -= 1) {
    let value = diagonalSolved[row];
    for (let column = row + 1; column <= Math.min(n - 1, row + bandwidth); column += 1) {
      value -= lower[column][column - row] * result[column];
    }
    result[row] = value;
  }
  return result.map((value, index) => value / scales[index]);
}

function multiply(matrix: number[][], vector: number[]): number[] {
  return matrix.map((row) => row.reduce((sum, value, column) => sum + value * vector[column], 0));
}

function elementStiffness(ei: number, length: number): number[][] {
  const scalar = ei / length ** 3;
  return [
    [12 * scalar, 6 * length * scalar, -12 * scalar, 6 * length * scalar],
    [6 * length * scalar, 4 * length ** 2 * scalar, -6 * length * scalar, 2 * length ** 2 * scalar],
    [-12 * scalar, -6 * length * scalar, 12 * scalar, -6 * length * scalar],
    [6 * length * scalar, 2 * length ** 2 * scalar, -6 * length * scalar, 4 * length ** 2 * scalar],
  ];
}

function equivalentLinearLoad(q1: number, q2: number, length: number): number[] {
  return [
    (length * (7 * q1 + 3 * q2)) / 20,
    (length ** 2 * (3 * q1 + 2 * q2)) / 60,
    (length * (3 * q1 + 7 * q2)) / 20,
    (-(length ** 2) * (2 * q1 + 3 * q2)) / 60,
  ];
}

function interpolateDeflection(
  displacements: number[],
  leftNode: number,
  rightNode: number,
  localX: number,
  length: number,
  ei: number,
  q1: number,
  q2: number,
): number {
  const ratio = clamp(localX / length, 0, 1);
  const ratio2 = ratio * ratio;
  const ratio3 = ratio2 * ratio;
  const n1 = 1 - 3 * ratio2 + 2 * ratio3;
  const n2 = length * (ratio - 2 * ratio2 + ratio3);
  const n3 = 3 * ratio2 - 2 * ratio3;
  const n4 = length * (-ratio2 + ratio3);
  const hermite =
    n1 * displacements[leftNode * 2] +
    n2 * displacements[leftNode * 2 + 1] +
    n3 * displacements[rightNode * 2] +
    n4 * displacements[rightNode * 2 + 1];
  const gradient = (q2 - q1) / length;
  const x2 = localX ** 2;
  const x3 = x2 * localX;
  const x4 = x3 * localX;
  const x5 = x4 * localX;
  const particularConstant = (q1 / ei) * (x4 / 24 - (length * x3) / 12 + (length ** 2 * x2) / 24);
  const particularLinear =
    (gradient / ei) * (x5 / 120 - (length ** 2 * x3) / 40 + (length ** 3 * x2) / 60);
  return hermite + particularConstant + particularLinear;
}

function baseSolve(input: ContinuousBeamInput, extraPointLoads: BeamPointLoadInput[] = []): ContinuousBeamResult {
  const activeSupports = input.supports.filter((support) => support.active !== false);
  if (activeSupports.length < 2) {
    return { points: [], reactions: [], stable: false, warning: "At least two active supports are required." };
  }

  const distributedLoads = input.distributedLoads ?? [];
  const featurePoints = [
    0,
    input.lengthM,
    ...input.segments.map((item) => item.endM),
    ...activeSupports.map((item) => item.xM),
    ...input.pointLoads.map((item) => item.xM),
    ...extraPointLoads.map((item) => item.xM),
    ...distributedLoads.flatMap((item) => [item.startM, item.endM]),
  ].map((value) => clamp(value, 0, input.lengthM));

  const requestedStep = Math.max(input.outputStepM ?? input.lengthM / 180, input.lengthM / 20_000);
  const orderedSegments = [...input.segments].sort((a, b) => a.endM - b.endM);
  const nodes = uniqueSorted(featurePoints);
  const degrees = nodes.length * 2;
  const stiffness = Array.from({ length: degrees }, () => Array(degrees).fill(0));
  const loads = Array(degrees).fill(0);
  const elementLoads: number[][] = [];
  const elementMatrices: number[][][] = [];
  const elementDistributed: Array<{ q1: number; q2: number }> = [];
  const elementEi: number[] = [];

  for (let element = 0; element < nodes.length - 1; element += 1) {
    const x1 = nodes[element];
    const x2 = nodes[element + 1];
    const length = x2 - x1;
    const ei = segmentEiAt(orderedSegments, (x1 + x2) / 2);
    const localStiffness = elementStiffness(ei, length);
    // Every distributed-load boundary is already a feature node. Use the
    // element midpoint to decide whether that load belongs to this element,
    // then evaluate its exact values at the two ends. This avoids leaking a
    // boundary load into the neighbouring unloaded element.
    const midpoint = (x1 + x2) / 2;
    const elementLoadsHere = distributedLoads.filter(
      (item) => midpoint >= item.startM - EPS && midpoint <= item.endM + EPS,
    );
    const q1 = elementLoadsHere.reduce((sum, item) => sum + distributedAt(item, x1), 0);
    const q2 = elementLoadsHere.reduce((sum, item) => sum + distributedAt(item, x2), 0);
    const localLoad = equivalentLinearLoad(q1, q2, length);
    const indexes = [element * 2, element * 2 + 1, element * 2 + 2, element * 2 + 3];
    addMatrix(stiffness, indexes, localStiffness);
    addVector(loads, indexes, localLoad);
    elementMatrices.push(localStiffness);
    elementLoads.push(localLoad);
    elementDistributed.push({ q1, q2 });
    elementEi.push(ei);
  }

  for (const pointLoad of [...input.pointLoads, ...extraPointLoads]) {
    let node = 0;
    let nearest = Number.POSITIVE_INFINITY;
    for (let index = 0; index < nodes.length; index += 1) {
      const distance = Math.abs(nodes[index] - pointLoad.xM);
      if (distance < nearest) {
        nearest = distance;
        node = index;
      }
    }
    loads[node * 2] += pointLoad.forceKN;
    loads[node * 2 + 1] += pointLoad.momentKNm ?? 0;
  }

  const constrained = new Map<number, number>();
  const supportNodes: number[] = [];
  for (const support of activeSupports) {
    let node = 0;
    let nearest = Number.POSITIVE_INFINITY;
    for (let index = 0; index < nodes.length; index += 1) {
      const distance = Math.abs(nodes[index] - support.xM);
      if (distance < nearest) {
        nearest = distance;
        node = index;
      }
    }
    supportNodes.push(node);
    constrained.set(node * 2, support.prescribedDeflectionM ?? 0);
  }

  const free: number[] = [];
  for (let degree = 0; degree < degrees; degree += 1) if (!constrained.has(degree)) free.push(degree);
  const displacements = Array(degrees).fill(0);
  for (const [degree, value] of constrained) displacements[degree] = value;
  try {
    const reducedMatrix = free.map((row) => free.map((column) => stiffness[row][column]));
    const reducedLoads = free.map((row) => {
      let value = loads[row];
      for (const [column, displacement] of constrained) value -= stiffness[row][column] * displacement;
      return value;
    });
    const solved = solveLinear(reducedMatrix, reducedLoads);
    free.forEach((degree, index) => {
      displacements[degree] = solved[index];
    });
  } catch (error) {
    return {
      points: [],
      reactions: [],
      stable: false,
      warning: error instanceof Error ? error.message : "Beam solution failed.",
    };
  }

  const residual = multiply(stiffness, displacements).map((value, index) => value - loads[index]);
  const reactions = activeSupports.map((support, index) => ({
    id: support.id,
    xM: support.xM,
    reactionKN: residual[supportNodes[index] * 2],
  }));

  const elementActions: number[][] = [];
  for (let element = 0; element < nodes.length - 1; element += 1) {
    const indexes = [element * 2, element * 2 + 1, element * 2 + 2, element * 2 + 3];
    const localDisplacements = indexes.map((index) => displacements[index]);
    const localActions = multiply(elementMatrices[element], localDisplacements).map(
      (value, index) => value - elementLoads[element][index],
    );
    elementActions.push(localActions);
  }

  // ConBeam's OutPoints are created span-by-span between beam ends and
  // supports. Loads are part of the structural solution but do not create
  // extra output stations. Reproducing that distinction gives the same
  // extrema and chart coordinates as the workbook.
  const spanBoundaries = uniqueSorted([
    0,
    ...activeSupports.map((support) => clamp(support.xM, 0, input.lengthM)),
    input.lengthM,
  ]);
  const outputXs: number[] = [];
  for (let span = 0; span < spanBoundaries.length - 1; span += 1) {
    const start = spanBoundaries[span];
    const end = spanBoundaries[span + 1];
    const divisions = Math.max(1, Math.round((end - start) / requestedStep));
    for (let division = 0; division <= divisions; division += 1) {
      if (span > 0 && division === 0) continue;
      outputXs.push(start + ((end - start) * division) / divisions);
    }
  }

  const points: BeamPoint[] = [];
  let element = 0;
  for (const outputX of outputXs) {
    while (element < nodes.length - 2 && outputX >= nodes[element + 1] - EPS) element += 1;
    const x1 = nodes[element];
    const x2 = nodes[element + 1];
    const length = x2 - x1;
    const localX = clamp(outputX - x1, 0, length);
    const localActions = elementActions[element];
    const { q1, q2 } = elementDistributed[element];
    const gradient = (q2 - q1) / length;
    const localX2 = localX * localX;
    const localX3 = localX2 * localX;
    const shear = localActions[0] + q1 * localX + 0.5 * gradient * localX2;
    const moment =
      -localActions[1] +
      localActions[0] * localX +
      0.5 * q1 * localX2 +
      (gradient * localX3) / 6;
    const deflectionM = interpolateDeflection(
      displacements,
      element,
      element + 1,
      localX,
      length,
      elementEi[element],
      q1,
      q2,
    );
    points.push({ xM: outputX, shearKN: shear, momentKNm: moment, deflectionMm: deflectionM * 1000 });
  }

  return { points, reactions, stable: true, warning: "" };
}

export function solveContinuousBeam(input: ContinuousBeamInput): ContinuousBeamResult {
  const firstPass = baseSolve(input);
  if (!firstPass.stable || input.applySupportSpreading === false) return firstPass;
  const spreadingLoads: BeamPointLoadInput[] = [];
  for (const reaction of firstPass.reactions) {
    const support = input.supports.find((item) => item.id === reaction.id);
    const width = support?.widthM ?? 0;
    if (width <= EPS) continue;
    spreadingLoads.push(
      { xM: clamp(reaction.xM - width / 2, 0, input.lengthM), forceKN: reaction.reactionKN / 2 },
      { xM: clamp(reaction.xM + width / 2, 0, input.lengthM), forceKN: reaction.reactionKN / 2 },
    );
  }
  if (!spreadingLoads.length) return firstPass;
  const spreadPass = baseSolve(input, spreadingLoads);
  return spreadPass.stable ? { ...spreadPass, reactions: firstPass.reactions } : firstPass;
}

function extrema(points: BeamPoint[], selector: (point: BeamPoint) => number): [number, number, number, number] {
  if (!points.length) return [0, 0, 0, 0];
  let minimum = points[0];
  let maximum = points[0];
  for (const point of points) {
    if (selector(point) < selector(minimum)) minimum = point;
    if (selector(point) > selector(maximum)) maximum = point;
  }
  return [selector(minimum), minimum.xM, selector(maximum), maximum.xM];
}

function signedUtilisation(value: number, negativeAllowable: number, positiveAllowable: number): number {
  if (Math.abs(value) < EPS) return 0;
  const capacity = Math.abs(value < 0 ? negativeAllowable : positiveAllowable);
  // Workbook catalogues have historically mixed signed limits and positive
  // magnitudes. Either convention is accepted, but zero/missing resistance
  // must fail closed whenever demand exists.
  return capacity > EPS ? Math.abs(value) / capacity : Number.POSITIVE_INFINITY;
}

export function beamMetricsFromResult(
  result: ContinuousBeamResult,
  limits: {
    shearMinKN: number;
    shearMaxKN: number;
    momentMinKNm: number;
    momentMaxKNm: number;
    localTargetXM?: number;
    deflectionStartM?: number;
    deflectionEndM?: number;
  },
): BeamMetrics {
  const [shearMinKN, shearMinXM, shearMaxKN, shearMaxXM] = extrema(result.points, (point) => point.shearKN);
  const [bendingMinKNm, bendingMinXM, bendingMaxKNm, bendingMaxXM] = extrema(result.points, (point) => point.momentKNm);
  const deflectionPoints = result.points.filter(
    (point) =>
      point.xM >= (limits.deflectionStartM ?? Number.NEGATIVE_INFINITY) - EPS &&
      point.xM <= (limits.deflectionEndM ?? Number.POSITIVE_INFINITY) + EPS,
  );
  const [deflectionDownMm, deflectionDownXM, deflectionUpMm, deflectionUpXM] = extrema(
    deflectionPoints.length ? deflectionPoints : result.points,
    (point) => point.deflectionMm,
  );
  const downwardWins = Math.abs(deflectionDownMm) >= Math.abs(deflectionUpMm);
  const deflectionPeakXM = downwardWins ? deflectionDownXM : deflectionUpXM;
  const target = limits.localTargetXM ?? deflectionPeakXM;
  const targetIndex = result.points.reduce(
    (best, point, index) =>
      Math.abs(point.xM - target) < Math.abs(result.points[best]?.xM - target) ? index : best,
    0,
  );
  const sourceSign = Math.sign(result.points[targetIndex]?.momentKNm ?? 0);
  let left = targetIndex;
  let right = targetIndex;
  while (left > 0 && (!sourceSign || Math.sign(result.points[left - 1].momentKNm) === sourceSign)) left -= 1;
  while (
    right < result.points.length - 1 &&
    (!sourceSign || Math.sign(result.points[right + 1].momentKNm) === sourceSign)
  )
    right += 1;
  let localBendingAbsKNm = 0;
  for (let index = left; index <= right; index += 1) {
    localBendingAbsKNm = Math.max(localBendingAbsKNm, Math.abs(result.points[index].momentKNm));
  }
  const shearUtilisation = Math.max(
    signedUtilisation(shearMinKN, limits.shearMinKN, limits.shearMaxKN),
    signedUtilisation(shearMaxKN, limits.shearMinKN, limits.shearMaxKN),
  );
  const bendingUtilisation = Math.max(
    signedUtilisation(bendingMinKNm, limits.momentMinKNm, limits.momentMaxKNm),
    signedUtilisation(bendingMaxKNm, limits.momentMinKNm, limits.momentMaxKNm),
  );
  const localBendingUtilisation = Math.max(
    signedUtilisation(-localBendingAbsKNm, limits.momentMinKNm, limits.momentMaxKNm),
    signedUtilisation(localBendingAbsKNm, limits.momentMinKNm, limits.momentMaxKNm),
  );
  return {
    points: result.points,
    shearMinKN,
    shearMinXM,
    shearMaxKN,
    shearMaxXM,
    bendingMinKNm,
    bendingMinXM,
    bendingMaxKNm,
    bendingMaxXM,
    deflectionDownMm,
    deflectionDownXM,
    deflectionUpMm,
    deflectionUpXM,
    absoluteDeflectionMm: Math.max(Math.abs(deflectionDownMm), Math.abs(deflectionUpMm)),
    deflectionPeakXM,
    shearUtilisation,
    bendingUtilisation,
    localBendingAbsKNm,
    localBendingUtilisation,
  };
}
