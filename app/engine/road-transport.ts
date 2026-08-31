import type {
  AxlePoint,
  ProjectModel,
  RoadSurface,
  RoadTransportResult,
} from "./types";

import { worldToLocal } from "./placement";

const GRAVITY = 9.80665;
const TRACTION_PER_DRIVEN_BOGIE_KN = 60;
const BRAKING_PER_BRAKED_BOGIE_KN = 55;

export interface RoadSurfaceData {
  id: RoadSurface;
  label: string;
  dryFriction: number;
  wetFriction: number;
  rollingResistance: number;
}

/**
 * Validated road-surface and module traction values. Rolling resistance is
 * dimensionless and friction is tyre/surface adhesion.
 */
export const ROAD_SURFACES: RoadSurfaceData[] = [
  { id: "ASPHALT", label: "Asphalt", dryFriction: 0.8, wetFriction: 0.55, rollingResistance: 0.01 },
  { id: "CONCRETE", label: "Concrete", dryFriction: 0.8, wetFriction: 0.55, rollingResistance: 0.015 },
  { id: "SOIL_EARTH", label: "Soil / earth", dryFriction: 0.68, wetFriction: 0.55, rollingResistance: 0.06 },
  { id: "GRAVEL", label: "Gravel", dryFriction: 0.6, wetFriction: 0.6, rollingResistance: 0.15 },
  { id: "SAND", label: "Sand", dryFriction: 0.6, wetFriction: 0.6, rollingResistance: 0.3 },
  { id: "STEEL", label: "Steel", dryFriction: 0.5, wetFriction: 0.1, rollingResistance: 0.013 },
];

const DRIVE_INDEXES: Record<4 | 5 | 6, number[]> = {
  4: [1, 2, 5, 6],
  5: [1, 3, 6, 8],
  6: [1, 4, 7, 10],
};

interface ModuleBuild {
  sizes: Array<4 | 5 | 6>;
  moduleCount: number;
}

function moduleBuild(axleLines: number): ModuleBuild | null {
  const target = Math.max(0, Math.round(axleLines));
  let best: ModuleBuild | null = null;
  for (let six = 0; six <= Math.floor(target / 6); six += 1) {
    for (let five = 0; five <= Math.floor(target / 5); five += 1) {
      for (let four = 0; four <= Math.floor(target / 4); four += 1) {
        if (six * 6 + five * 5 + four * 4 !== target) continue;
        const sizes: Array<4 | 5 | 6> = [
          ...Array.from({ length: six }, () => 6 as const),
          ...Array.from({ length: five }, () => 5 as const),
          ...Array.from({ length: four }, () => 4 as const),
        ];
        const candidate = { sizes, moduleCount: sizes.length };
        if (!best || candidate.moduleCount < best.moduleCount) best = candidate;
      }
    }
  }
  return best;
}

function ppuDriveLimit(model: ProjectModel): number {
  const ppuCount = model.trailers
    .filter((trailer) => trailer.enabled)
    .reduce(
      (sum, trailer) => sum + (trailer.ppuLeft ? 1 : 0) + (trailer.ppuRight ? 1 : 0),
      0,
    );
  const perPpu = model.roadTransport.ppuCapacity === "ALASKA_32"
    ? 32
    : model.roadTransport.ppuCapacity === "CUSTOM"
      ? Math.max(0, Math.round(model.roadTransport.customDrivenBogieLimit))
      : 26;
  return (ppuCount + (model.deckPpus ?? []).filter(ppu => ppu.secured === true && ppu.suppliesHydraulics === true).length) * perPpu;
}

function emptyRoadResult(model: ProjectModel, warning = "Road transport analysis is disabled."): RoadTransportResult {
  const surface = ROAD_SURFACES.find((item) => item.id === model.roadTransport.surface)
    ?? ROAD_SURFACES[0];
  return {
    enabled: model.roadTransport.enabled,
    surface: surface.id,
    condition: model.roadTransport.condition,
    frictionCoefficient:
      model.roadTransport.condition === "WET" ? surface.wetFriction : surface.dryFriction,
    rollingResistanceCoefficient: surface.rollingResistance,
    speedKph: model.roadTransport.speedKph,
    moduleCount: 0,
    totalBogieCount: 0,
    drivenBogieCount: 0,
    brakedBogieCount: 0,
    ppuDrivenBogieLimit: ppuDriveLimit(model),
    rollingResistanceKN: 0,
    gradeForceKN: 0,
    accelerationForceKN: 0,
    brakingForceKN: 0,
    tractionDemandKN: 0,
    tractionCapacityKN: 0,
    tractionAdhesionLimitKN: 0,
    tractionMechanicalLimitKN: 0,
    tractionUtilisation: null,
    brakingDemandKN: 0,
    brakingCapacityKN: 0,
    brakingAdhesionLimitKN: 0,
    brakingMechanicalLimitKN: 0,
    brakingUtilisation: null,
    maximumClimbGradeDeg: null,
    maximumDescentGradeDeg: null,
    status: "N/A",
    source: "Validated road-surface and module traction/braking tables",
    warnings: warning ? [warning] : [],
  };
}

function capacityLimitedGrade(
  capacityKN: number,
  massT: number,
  rollingCoefficient: number,
  accelerationMps2: number,
  descending: boolean,
): number | null {
  if (!(massT > 0) || !(capacityKN > 0)) return null;
  let low = 0;
  let high = 45;
  for (let iteration = 0; iteration < 80; iteration += 1) {
    const angle = (low + high) / 2;
    const radians = (angle * Math.PI) / 180;
    const rolling = massT * GRAVITY * rollingCoefficient * Math.cos(radians);
    const grade = massT * GRAVITY * Math.sin(radians);
    const inertial = massT * Math.max(0, accelerationMps2);
    const demand = descending
      ? Math.max(0, grade + inertial - rolling)
      : rolling + grade + inertial;
    if (demand <= capacityKN) low = angle;
    else high = angle;
  }
  return low;
}

/**
 * Performs the road-motion check using the selected neutral bogie loads. The
 * driven/braked bogie patterns, 60 kN traction, 55 kN brake force and the PPU
 * drive limits are the configured engineering values. Each result is
 * limited by both mechanical force and tyre/surface adhesion.
 */
export function calculateRoadTransport(
  model: ProjectModel,
  neutralAxles: AxlePoint[],
  totalMassT: number,
): RoadTransportResult {
  if (!model.roadTransport.enabled) return emptyRoadResult(model);
  const surface = ROAD_SURFACES.find((item) => item.id === model.roadTransport.surface)
    ?? ROAD_SURFACES[0];
  const friction = model.roadTransport.condition === "WET"
    ? surface.wetFriction
    : surface.dryFriction;
  const warnings: string[] = [];
  const drivenCandidates: AxlePoint[] = [];
  const brakedCandidates: AxlePoint[] = [];
  let moduleCount = 0;

  for (const [trailerIndex, trailer] of model.trailers.entries()) {
    if (!trailer.enabled) continue;
    const beds = model.bedLayout?.filter(bed => bed.train === trailer.id).sort((a, b) =>
      worldToLocal({ startXM: trailer.xM, centreYM: trailer.yM, yawDeg: trailer.yawDeg }, { x: a.xM, y: a.yM }).x -
      worldToLocal({ startXM: trailer.xM, centreYM: trailer.yM, yawDeg: trailer.yawDeg }, { x: b.xM, y: b.yM }).x);
    const build = beds?.length ? { sizes: beds.map(bed => bed.axleLines), moduleCount: beds.length } : moduleBuild(trailer.axleLines);
    const bogies = neutralAxles
      .filter((axle) => axle.trailerIndex === trailerIndex)
      .sort((left, right) => left.axleLine - right.axleLine || left.point.y - right.point.y);
    if (!build || bogies.length !== trailer.axleLines * (trailer.singleFile ? 1 : 2)) {
      warnings.push(
        `Trailer ${trailerIndex + 1} cannot be mapped exactly to the 4/5/6-AL drive and brake patterns.`,
      );
      continue;
    }
    if (trailer.singleFile) {
      warnings.push(`Trailer ${trailerIndex + 1} is single-file; no end-view drive pattern is available.`);
      continue;
    }
    moduleCount += build.moduleCount;
    let bogieOffset = 0;
    for (const size of build.sizes) {
      const localCount = size * 2;
      const drives = new Set(DRIVE_INDEXES[size]);
      for (let localIndex = 0; localIndex < localCount; localIndex += 1) {
        const bogie = bogies[bogieOffset + localIndex];
        if (!bogie) continue;
        if (drives.has(localIndex)) drivenCandidates.push(bogie);
        else brakedCandidates.push(bogie);
      }
      bogieOffset += localCount;
    }
  }

  if (warnings.length || !moduleCount) {
    const result = emptyRoadResult(model, warnings.join(" ") || "No exact SPMT module build is available.");
    result.enabled = true;
    result.warnings = warnings.length ? warnings : result.warnings;
    return result;
  }

  const driveLimit = ppuDriveLimit(model);
  const driven = drivenCandidates.slice(0, driveLimit);
  if (driveLimit === 0) warnings.push("No PPU is included, so powered traction capacity is zero.");
  if (driveLimit < drivenCandidates.length) {
    warnings.push(
      `${drivenCandidates.length - driveLimit} driven bogies exceed the selected PPU drive limit and are not credited for traction.`,
    );
  }
  const drivenNormalKN = driven.reduce((sum, axle) => sum + Math.max(0, axle.loadT) * GRAVITY, 0);
  const brakedNormalKN = brakedCandidates.reduce((sum, axle) => sum + Math.max(0, axle.loadT) * GRAVITY, 0);
  const tractionAdhesionLimitKN = friction * drivenNormalKN;
  const tractionMechanicalLimitKN = driven.length * TRACTION_PER_DRIVEN_BOGIE_KN;
  const tractionCapacityKN = Math.min(tractionAdhesionLimitKN, tractionMechanicalLimitKN);
  const brakingAdhesionLimitKN = friction * brakedNormalKN;
  const brakingMechanicalLimitKN = brakedCandidates.length * BRAKING_PER_BRAKED_BOGIE_KN;
  const brakingCapacityKN = Math.min(brakingAdhesionLimitKN, brakingMechanicalLimitKN);

  const gradeRadians = (model.environment.routeLongitudinalSlopeDeg * Math.PI) / 180;
  const rollingResistanceKN = totalMassT * GRAVITY * surface.rollingResistance * Math.cos(gradeRadians);
  const gradeForceKN = totalMassT * GRAVITY * Math.sin(gradeRadians);
  const accelerationForceKN = totalMassT * Math.max(0, model.roadTransport.driveAccelerationMps2);
  const brakingForceKN = totalMassT * Math.max(0, model.roadTransport.brakeDecelerationMps2);
  const tractionDemandKN = rollingResistanceKN + Math.max(0, gradeForceKN) + accelerationForceKN;
  const brakingDemandKN = Math.max(0, Math.max(0, -gradeForceKN) + brakingForceKN - rollingResistanceKN);
  const tractionUtilisation = tractionCapacityKN > 0
    ? tractionDemandKN / tractionCapacityKN
    : tractionDemandKN > 0 ? Number.POSITIVE_INFINITY : 0;
  const brakingUtilisation = brakingCapacityKN > 0
    ? brakingDemandKN / brakingCapacityKN
    : brakingDemandKN > 0 ? Number.POSITIVE_INFINITY : 0;
  const status = tractionUtilisation <= 1 && brakingUtilisation <= 1 ? "OK" : "NOK";

  return {
    enabled: true,
    surface: surface.id,
    condition: model.roadTransport.condition,
    frictionCoefficient: friction,
    rollingResistanceCoefficient: surface.rollingResistance,
    speedKph: Math.max(0, model.roadTransport.speedKph),
    moduleCount,
    totalBogieCount: drivenCandidates.length + brakedCandidates.length,
    drivenBogieCount: driven.length,
    brakedBogieCount: brakedCandidates.length,
    ppuDrivenBogieLimit: driveLimit,
    rollingResistanceKN,
    gradeForceKN,
    accelerationForceKN,
    brakingForceKN,
    tractionDemandKN,
    tractionCapacityKN,
    tractionAdhesionLimitKN,
    tractionMechanicalLimitKN,
    tractionUtilisation,
    brakingDemandKN,
    brakingCapacityKN,
    brakingAdhesionLimitKN,
    brakingMechanicalLimitKN,
    brakingUtilisation,
    maximumClimbGradeDeg: capacityLimitedGrade(
      tractionCapacityKN,
      totalMassT,
      surface.rollingResistance,
      model.roadTransport.driveAccelerationMps2,
      false,
    ),
    maximumDescentGradeDeg: capacityLimitedGrade(
      brakingCapacityKN,
      totalMassT,
      surface.rollingResistance,
      model.roadTransport.brakeDecelerationMps2,
      true,
    ),
    status,
    source: "Validated road-surface and module traction/braking tables",
    warnings,
  };
}
