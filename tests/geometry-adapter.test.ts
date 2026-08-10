import assert from "node:assert/strict";
import { createDefaultModel } from "../app/data/default-model";
import {
  applySharedPins,
  applySharedSplit,
  calculateProject,
} from "../app/engine/core";
import { passToProject, runOptimiser } from "../app/engine/optimiser";
import { buildGeometryViewModel } from "../app/geometry/buildGeometryViewModel";
import { buildEngineeringDetailRows } from "../app/geometry/details";
import { buildEndTippingConstructions, nearestStabilityEdge } from "../app/geometry/end-tipping";
import { buildHydraulicRouteSegments } from "../app/geometry/hydraulic-routes";
import {
  closestPointOnSegment,
  createViewportTransform,
  finiteBounds,
  projectEngineeringPoint,
  stabilityFocusBounds,
  viewBounds,
} from "../app/geometry/transform";

function nearlyEqual(actual: number, expected: number, tolerance = 1e-9): void {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} was not within ${tolerance} of ${expected}`);
}

async function main(): Promise<void> {
  const model = createDefaultModel();
  const result = calculateProject(model);
  const vm = buildGeometryViewModel(model, result, "dynamic");

  // Multiple trailers, packing, PPUs, support geometry and stable selection IDs.
  assert.equal(vm.trailers.length, 2);
  assert.equal(vm.axleLines.length, 16);
  assert.equal(vm.bogies.length, 32);
  assert.equal(vm.packing.massT, model.packing.massT);
  assert.equal(vm.powerPacks.length, 1);
  assert.equal(vm.supports.length, model.supports.length);
  assert.equal(vm.entityById.get(vm.trailers[0].id), vm.trailers[0]);
  assert.equal(vm.entityById.get(vm.axleLines[0].id), vm.axleLines[0]);
  assert.ok(vm.trailers.every((trailer) => trailer.colliding));
  assert.ok(buildEngineeringDetailRows(model, result).length > 120);

  // Trailer footprints may touch but cannot overlap. Separating the trailers
  // also produces three local clusters around a broad stability triangle.
  const touchingTrailers = createDefaultModel();
  const trailerWidth =
    touchingTrailers.catalogue.find(
      (definition) => definition.id === touchingTrailers.trailers[0].definitionId,
    )?.trailerWidthM ?? 0;
  touchingTrailers.trailers[1].yM = touchingTrailers.trailers[0].yM + trailerWidth;
  const touchingResult = calculateProject(touchingTrailers);
  assert.equal(touchingResult.trailerOverlaps.length, 0);

  const localGroups = structuredClone(touchingTrailers);
  localGroups.trailers[1].yM += 0.57;
  localGroups.groupings[0].cornerGroups = {
    rearLeft: 1,
    rearRight: 1,
    frontLeft: 2,
    frontRight: 2,
  };
  const localGroupResult = calculateProject(localGroups);
  assert.equal(localGroupResult.trailerOverlaps.length, 0);
  assert.equal(localGroupResult.groups.length, 3);
  assert.equal(localGroupResult.groupingQuality.narrow, false);
  assert.deepEqual(localGroupResult.groupingQuality.dispersedGroups, []);

  // Hydraulic G1/G2/G3 routing is separated into independent left/right circuits.
  assert.deepEqual(vm.groups.map((group) => group.groupId), [1, 2, 3]);
  const routes = buildHydraulicRouteSegments(vm);
  assert.ok(routes.some((route) => route.groupId === 1 && route.side === "left"));
  assert.ok(routes.some((route) => route.groupId === 1 && route.side === "right"));
  assert.ok(routes.every((route) => new Set(route.points.map((point) => point.y)).size === 1));

  // One trailer and single-file arrangements retain the configured orientation.
  const oneTrailer = createDefaultModel();
  oneTrailer.trailers = oneTrailer.trailers.slice(0, 1);
  oneTrailer.groupings = oneTrailer.groupings.slice(0, 1);
  oneTrailer.trailers[0].singleFile = true;
  const oneResult = calculateProject(oneTrailer);
  const oneVm = buildGeometryViewModel(oneTrailer, oneResult);
  assert.equal(oneVm.trailers.length, 1);
  assert.equal(oneVm.trailers[0].frontAt, "positive-x");
  assert.equal(oneVm.bogies.length, oneTrailer.trailers[0].axleLines);

  const multiFile = structuredClone(oneTrailer);
  multiFile.trailers[0].singleFile = false;
  const multiVm = buildGeometryViewModel(multiFile, calculateProject(multiFile));
  assert.equal(multiVm.bogies.length, multiFile.trailers[0].axleLines * 2);

  // Split and shared pin states stay synchronised with geometry.
  const splitModel = applySharedSplit(createDefaultModel(), 4);
  assert.ok(splitModel.groupings.every((grouping) => grouping.splitAfterAxleLine === 4));
  const pinnedModel = applySharedPins(splitModel, [1, 4, 7]);
  const pinnedVm = buildGeometryViewModel(pinnedModel, calculateProject(pinnedModel));
  assert.deepEqual(
    [...new Set(pinnedVm.pinnedAxleLines.map((pin) => pin.axleLine))].sort((a, b) => a - b),
    [1, 4, 7],
  );
  const noPins = applySharedPins(pinnedModel, []);
  assert.equal(
    buildGeometryViewModel(noPins, calculateProject(noPins)).pinnedAxleLines.length,
    0,
  );

  // Active/inactive support settling and a genuine zero-support invalid case.
  const disabledSupport = createDefaultModel();
  disabledSupport.supports[0].allowed = false;
  disabledSupport.supports[0].active = false;
  const disabledVm = buildGeometryViewModel(disabledSupport, calculateProject(disabledSupport));
  assert.equal(disabledVm.supports[0].active, false);
  const zeroSupport = createDefaultModel();
  zeroSupport.supports = [];
  const zeroResult = calculateProject(zeroSupport);
  assert.ok(["SUPPORT_FAIL", "GEOMETRY_FAIL"].includes(zeroResult.status));
  assert.equal(zeroResult.activeSupportCount, 0);

  // Loose packing and PPUs at either end are represented without inventing a footprint.
  const optionalItems = createDefaultModel();
  optionalItems.loosePacking = [
    { id: "loose-test", type: "Counterweight", massT: 12, startXM: 2, endXM: 4 },
  ];
  optionalItems.trailers[0].ppuLeft = true;
  optionalItems.trailers[0].ppuRight = true;
  const optionalVm = buildGeometryViewModel(optionalItems, calculateProject(optionalItems));
  assert.equal(optionalVm.loosePacking.length, 1);
  assert.ok(optionalVm.powerPacks.some((ppu) => ppu.end === "front"));
  assert.ok(optionalVm.powerPacks.some((ppu) => ppu.end === "rear"));
  assert.equal(
    optionalVm.powerPacks.find((ppu) => ppu.end === "rear")?.startXM,
    optionalVm.trailers[0].startXM - optionalVm.trailers[0].ppuLeftLengthM,
  );
  assert.equal(
    optionalVm.powerPacks.find((ppu) => ppu.end === "front")?.startXM,
    optionalVm.trailers[0].startXM + optionalVm.trailers[0].lengthM,
  );
  assert.equal(optionalVm.packing.footprintDefined, false);
  assert.equal(optionalVm.packing.lengthM, optionalItems.cargo.lengthM);
  const customPacking = structuredClone(optionalItems);
  customPacking.packing.footprint = {
    mode: "CUSTOM",
    lengthM: 4.5,
    widthM: 2.25,
    extremeX: 1.1,
    extremeY: -0.4,
  };
  const customPackingVm = buildGeometryViewModel(customPacking, calculateProject(customPacking));
  assert.equal(customPackingVm.packing.footprintDefined, true);
  assert.equal(customPackingVm.packing.lengthM, 4.5);
  assert.equal(customPackingVm.packing.widthM, 2.25);
  assert.equal(customPackingVm.packing.extremeX, 1.1);
  assert.equal(customPackingVm.packing.extremeY, -0.4);

  // Cargo offset, COG envelope, slopes, wind and both acceleration directions.
  const environment = createDefaultModel();
  environment.cargo.extremeX = 1.25;
  environment.cargo.extremeY = -0.75;
  environment.environment.longitudinalSlopeDeg = 3;
  environment.environment.transverseSlopeDeg = 2;
  environment.environment.windSpeedMps = 18;
  environment.environment.longitudinalAccelerationMps2 = 0.6;
  environment.environment.transverseAccelerationMps2 = 0.4;
  const environmentResult = calculateProject(environment);
  const environmentVm = buildGeometryViewModel(environment, environmentResult, "comparison");
  assert.equal(environmentVm.cargo.extremeX, 1.25);
  assert.equal(environmentVm.cargo.extremeY, -0.75);
  assert.equal(environmentVm.envelopes.find((item) => item.envelopeType === "cargo")?.points.length, 4);
  assert.notDeepEqual(environmentResult.analysis.slopeShift, { x: 0, y: 0 });
  assert.notDeepEqual(environmentResult.analysis.windShift, { x: 0, y: 0 });
  assert.notDeepEqual(environmentResult.analysis.accelerationShift, { x: 0, y: 0 });
  assert.ok(environmentVm.shifts.some((shift) => shift.shiftType === "wind"));
  assert.ok(environmentVm.shifts.some((shift) => shift.shiftType === "acceleration"));

  // Static/dynamic results and the complete spine-beam view data are authoritative.
  assert.ok(result.metrics.basicUtil.value !== null);
  assert.ok(result.metrics.dynamicUtil.value !== null);
  assert.ok(vm.spineBeam.points.length > 20);
  assert.equal(vm.spineBeam.points, result.beam.points);
  assert.equal(vm.spineBeam.loadCase, model.spineLoadCase);

  // Coordinate orientation, COG positions, group centres and fit-to-view bounds.
  assert.deepEqual(projectEngineeringPoint("plan", { x: 2, y: 3, z: 4 }), { x: 2, y: 3 });
  assert.deepEqual(projectEngineeringPoint("end", { x: 2, y: 3, z: 4 }), { x: 3, y: 4 });
  assert.deepEqual(projectEngineeringPoint("side", { x: 2, y: 3, z: 4 }), { x: 2, y: 4 });
  const transform = createViewportTransform("plan", vm.bounds, 1000, 600, 40);
  const cog = vm.cogs.find((item) => item.cogType === "all-inclusive");
  assert.ok(cog);
  const screenCog = transform.toScreen(cog!.point);
  const roundTripCog = transform.toEngineering(screenCog);
  nearlyEqual(roundTripCog.x, cog!.point.x);
  nearlyEqual(roundTripCog.y, cog!.point.y);
  assert.ok(screenCog.x >= 40 && screenCog.x <= 960);
  assert.ok(screenCog.y >= 40 && screenCog.y <= 560);
  assert.deepEqual(vm.groupCentres.map((item) => item.point), result.groups.map((item) => item.point));
  assert.deepEqual(vm.stabilityBoundary.points, result.stabilityPolygon);
  assert.equal(vm.tippingEdges.length, result.stabilityPolygon.length);
  assert.equal(
    vm.tippingEdges.find((edge) => edge.critical)?.edgeIndex,
    result.analysis.controllingEdgeIndex,
  );

  // Four-point systems must expose all four perimeter edges. In particular,
  // there must be no legacy diagonal from boundary point 2 back to point 0.
  const fourPoint = createDefaultModel();
  fourPoint.hydraulicSystemMode = "FOUR_POINT";
  fourPoint.trailers[0].yM = 1;
  fourPoint.trailers[1].yM = 4.5;
  fourPoint.groupings[0].cornerGroups = {
    rearLeft: 1,
    rearRight: 1,
    frontLeft: 3,
    frontRight: 3,
  };
  fourPoint.groupings[1].cornerGroups = {
    rearLeft: 2,
    rearRight: 2,
    frontLeft: 4,
    frontRight: 4,
  };
  const fourPointResult = calculateProject(fourPoint);
  const fourPointVm = buildGeometryViewModel(fourPoint, fourPointResult);
  assert.equal(fourPointVm.stabilityBoundary.active, true);
  assert.equal(fourPointVm.stabilityBoundary.points.length, 4);
  assert.equal(fourPointVm.stabilityBoundary.label.short, "Stability polygon");
  assert.equal(fourPointVm.tippingEdges.length, 4);
  fourPointVm.tippingEdges.forEach((edge, index) => {
    assert.deepEqual(edge.start, fourPointResult.stabilityPolygon[index]);
    assert.deepEqual(edge.end, fourPointResult.stabilityPolygon[(index + 1) % 4]);
  });
  const fourPointEndConstructions = buildEndTippingConstructions(fourPointResult);
  assert.equal(fourPointEndConstructions.length, 3);
  fourPointEndConstructions.forEach((construction) => {
    assert.deepEqual(
      construction.cogPoint,
      fourPointResult.casePoints[construction.mode][construction.casePointIndex],
    );
    // The shifted COG ring must remain on the polygon-interior side of the
    // selected edge; the previous renderer added the distance in the outward
    // direction and mirrored every ray across the tipping edge.
    assert.ok(
      (construction.cogPoint.y - construction.foot.y) * construction.outwardDirectionY <= 1e-9,
    );
    nearlyEqual(
      Math.atan2(construction.distanceM, fourPointResult.combinedCog.z) * 180 / Math.PI,
      construction.angleDeg,
      1e-8,
    );
  });

  const rectangularBoundary = [
    { x: -2, y: -1 },
    { x: 2, y: -1 },
    { x: 2, y: 1 },
    { x: -2, y: 1 },
  ];
  const rightEdge = nearestStabilityEdge({ x: 0, y: -0.8 }, rectangularBoundary);
  const leftEdge = nearestStabilityEdge({ x: 0, y: 0.8 }, rectangularBoundary);
  assert.ok(rightEdge && leftEdge);
  assert.equal(rightEdge.foot.y, -1);
  assert.equal(leftEdge.foot.y, 1);
  assert.ok(0 - rightEdge.foot.y > 0);
  assert.ok(0 - leftEdge.foot.y < 0);
  const projectedBounds = viewBounds("end", vm.bounds);
  assert.equal(projectedBounds.minX, vm.bounds.minY);
  assert.equal(projectedBounds.maxY, vm.bounds.maxZ);
  const stabilityBounds = stabilityFocusBounds(vm);
  assert.ok(stabilityBounds.minX <= Math.min(...result.stabilityPolygon.map((point) => point.x)));
  assert.ok(stabilityBounds.maxX >= Math.max(...result.stabilityPolygon.map((point) => point.x)));
  assert.ok(stabilityBounds.minY <= Math.min(...result.stabilityPolygon.map((point) => point.y)));
  assert.ok(stabilityBounds.maxY >= Math.max(...result.stabilityPolygon.map((point) => point.y)));
  assert.ok(stabilityBounds.maxX - stabilityBounds.minX < vm.bounds.maxX - vm.bounds.minX);
  const bounds = finiteBounds([
    { x: -2, y: -3, z: 0 },
    { x: 5, y: 7, z: 9 },
  ]);
  assert.deepEqual(bounds, { minX: -2, maxX: 5, minY: -3, maxY: 7, minZ: 0, maxZ: 9 });
  assert.deepEqual(
    closestPointOnSegment({ x: 2, y: 3 }, { x: 0, y: 0 }, { x: 4, y: 0 }),
    { x: 2, y: 0 },
  );

  // Deleting trailers/supports leaves a valid adapter model with no stale entities.
  const deleted = createDefaultModel();
  const removedTrailerId = deleted.trailers[1].id;
  deleted.trailers.splice(1, 1);
  deleted.groupings.splice(1, 1);
  const removedSupportId = deleted.supports[3].id;
  deleted.supports.splice(3, 1);
  const deletedVm = buildGeometryViewModel(deleted, calculateProject(deleted));
  assert.ok(!deletedVm.trailers.some((trailer) => trailer.sourceTrailerId === removedTrailerId));
  assert.ok(!deletedVm.supports.some((support) => support.id === removedSupportId));

  // Optimiser result application reproduces the candidate's shared inputs.
  const optimiserModel = createDefaultModel();
  optimiserModel.optimiser.c89Start = 5;
  optimiserModel.optimiser.c89Maximum = 5;
  optimiserModel.optimiser.d138Start = 1;
  optimiserModel.optimiser.d138MaximumFraction = 0.2;
  optimiserModel.optimiser.e89RangeMode = "MANUAL";
  optimiserModel.optimiser.e89Minimum = 0;
  optimiserModel.optimiser.e89Maximum = 0;
  optimiserModel.optimiser.pinSearchMode = "OFF";
  const run = await runOptimiser(optimiserModel);
  const applied = passToProject(optimiserModel, run.passes[0]);
  assert.ok(applied.trailers.every((trailer) => trailer.axleLines === run.passes[0].c89));
  assert.ok(applied.groupings.every((grouping) => grouping.splitAfterAxleLine === run.passes[0].d138));
  assert.ok(applied.trailers.every((trailer) => trailer.xM === run.passes[0].e89));

  process.stdout.write(
    JSON.stringify(
      {
        geometryEntities: vm.entityById.size,
        routeSegments: routes.length,
        engineeringDetailRows: buildEngineeringDetailRows(model, result).length,
        testedViews: ["plan", "end", "side", "hydraulics", "stability", "beam"],
      },
      null,
      2,
    ) + "\n",
  );
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
