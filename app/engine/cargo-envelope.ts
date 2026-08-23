import type { CargoInput, ProjectModel } from "./types";

export const CARGO_COG_ENVELOPE_FACTOR = 0.025;
export const CARGO_COG_ENVELOPE_ADVISED_MINIMUM_FACTOR = 0.02;
export const CARGO_COG_ENVELOPE_ABSOLUTE_MINIMUM_M = 0.1;

export interface CargoCogEnvelopeAxisGuidance {
  axis: "X" | "Y";
  dimensionLabel: "length" | "width";
  dimensionM: number;
  defaultPercentageM: number;
  advisedMinimumM: number;
  automaticM: number;
  automaticMinimumApplied: boolean;
  currentM: number;
  belowAdvisedMinimum: boolean;
  belowAbsoluteMinimum: boolean;
}

export interface CargoCogEnvelopeGuidance {
  x: CargoCogEnvelopeAxisGuidance;
  y: CargoCogEnvelopeAxisGuidance;
  warnings: string[];
}

function positiveDimension(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function automaticEnvelopeM(dimensionM: number): number {
  return dimensionM > 0
    ? Math.max(
        dimensionM * CARGO_COG_ENVELOPE_FACTOR,
        CARGO_COG_ENVELOPE_ABSOLUTE_MINIMUM_M,
      )
    : 0;
}

function axisGuidance(
  cargo: CargoInput,
  axis: "X" | "Y",
): CargoCogEnvelopeAxisGuidance {
  const dimensionLabel = axis === "X" ? "length" : "width";
  const dimensionM = positiveDimension(axis === "X" ? cargo.lengthM : cargo.widthM);
  const currentM = axis === "X" ? cargo.envelopeX : cargo.envelopeY;
  const defaultPercentageM = dimensionM * CARGO_COG_ENVELOPE_FACTOR;
  const advisedMinimumM = dimensionM * CARGO_COG_ENVELOPE_ADVISED_MINIMUM_FACTOR;
  return {
    axis,
    dimensionLabel,
    dimensionM,
    defaultPercentageM,
    advisedMinimumM,
    automaticM: automaticEnvelopeM(dimensionM),
    automaticMinimumApplied:
      dimensionM > 0 && defaultPercentageM < CARGO_COG_ENVELOPE_ABSOLUTE_MINIMUM_M,
    currentM,
    belowAdvisedMinimum:
      dimensionM > 0 && Number.isFinite(currentM) && currentM < advisedMinimumM,
    belowAbsoluteMinimum:
      dimensionM > 0 && Number.isFinite(currentM) && currentM < CARGO_COG_ENVELOPE_ABSOLUTE_MINIMUM_M,
  };
}

export function cargoCogEnvelopeGuidance(cargo: CargoInput): CargoCogEnvelopeGuidance {
  const x = axisGuidance(cargo, "X");
  const y = axisGuidance(cargo, "Y");
  const warnings: string[] = [];
  for (const item of [x, y]) {
    if (cargo.autoCogEnvelopeFromCargo && item.automaticMinimumApplied) {
      warnings.push(
        `Automatic ${item.axis} COG envelope uses the 0.100 m minimum because 2.5% of cargo ${item.dimensionLabel} is ${item.defaultPercentageM.toFixed(3)} m.`,
      );
      continue;
    }
    if (cargo.autoCogEnvelopeFromCargo) continue;
    if (item.belowAbsoluteMinimum) {
      warnings.push(
        `Manual ${item.axis} COG envelope ${item.currentM.toFixed(3)} m is below the 0.100 m minimum. This explicit override is not advised and must be independently justified.`,
      );
    } else if (item.belowAdvisedMinimum) {
      warnings.push(
        `Manual ${item.axis} COG envelope ${item.currentM.toFixed(3)} m is below the advised 2% of cargo ${item.dimensionLabel} (${item.advisedMinimumM.toFixed(3)} m).`,
      );
    }
  }
  return { x, y, warnings };
}

export function derivedCargoCogEnvelopeInputs(
  cargo: CargoInput,
): Pick<CargoInput, "envelopeX" | "envelopeY"> {
  const lengthM = Number.isFinite(cargo.lengthM) && cargo.lengthM > 0 ? cargo.lengthM : 0;
  const widthM = Number.isFinite(cargo.widthM) && cargo.widthM > 0 ? cargo.widthM : 0;
  return {
    envelopeX: automaticEnvelopeM(lengthM),
    envelopeY: automaticEnvelopeM(widthM),
  };
}

export function applyAutomaticCargoCogEnvelopeInputs(cargo: CargoInput): CargoInput {
  return cargo.autoCogEnvelopeFromCargo
    ? { ...cargo, ...derivedCargoCogEnvelopeInputs(cargo) }
    : cargo;
}

export function applyAutomaticProjectCargoCogEnvelopeInputs(model: ProjectModel): ProjectModel {
  const cargo = applyAutomaticCargoCogEnvelopeInputs(model.cargo);
  return cargo === model.cargo ? model : { ...model, cargo };
}
