import type { CalculationResult, ProjectModel, TrailerDefinition } from "./types";

export interface HydraulicPressureOutput {
  group: number;
  referenceDefinitionId: string | null;
  mixedHydraulicProperties: boolean;
  neutralBar: number | null;
  aBar: number | null;
  bBar: number | null;
  cBar: number | null;
  dBar: number | null;
}

function pressureBar(
  groupLoadT: number,
  bogieCount: number,
  definition: TrailerDefinition | undefined,
): number | null {
  if (!(bogieCount > 0) || !definition || definition.factor === null || !(definition.factor > 0)) return null;
  const massBelowCylinderT = Math.max(0, definition.massBelowCylinderT ?? 0);
  return Math.max(0, groupLoadT / bogieCount - massBelowCylinderT) * definition.factor;
}

/**
 * Produces the neutral and A-D static hydraulic pressure cases used by the
 * calculation sheet's drawing table. A-D are the four cargo COG-envelope
 * corners (`stabilityLoads.basic[1..4]`), not the slope/dynamic cases.
 */
export function hydraulicPressureOutputs(
  model: ProjectModel,
  result: CalculationResult,
): HydraulicPressureOutput[] {
  return result.groups.map((group, groupIndex) => {
    const memberDefinitionIds = Array.from(new Set(
      result.axlePoints
        .filter((axle) => axle.group === group.group && !axle.pinned)
        .map((axle) => model.trailers[axle.trailerIndex]?.definitionId)
        .filter((definitionId): definitionId is string => Boolean(definitionId)),
    ));
    const referenceDefinitionId = memberDefinitionIds[0] ?? null;
    const definition = referenceDefinitionId
      ? model.catalogue.find((item) => item.id === referenceDefinitionId)
      : undefined;
    const neutralLoadT = result.stabilityLoads.neutral[groupIndex] ?? group.loadT;
    const envelopeLoads = Array.from({ length: 4 }, (_, caseIndex) =>
      result.stabilityLoads.basic[caseIndex + 1]?.[groupIndex] ?? neutralLoadT);
    const pressures = envelopeLoads.map((loadT) => pressureBar(loadT, group.axleCount, definition));
    return {
      group: group.group,
      referenceDefinitionId,
      mixedHydraulicProperties: memberDefinitionIds.length > 1,
      neutralBar: pressureBar(neutralLoadT, group.axleCount, definition),
      aBar: pressures[0],
      bBar: pressures[1],
      cBar: pressures[2],
      dBar: pressures[3],
    };
  });
}
