import type { CargoInput, ProjectModel } from "./types";

export const CARGO_COG_ENVELOPE_FACTOR = 0.02;

export function derivedCargoCogEnvelopeInputs(
  cargo: CargoInput,
): Pick<CargoInput, "envelopeX" | "envelopeY"> {
  const lengthM = Number.isFinite(cargo.lengthM) && cargo.lengthM > 0 ? cargo.lengthM : 0;
  const widthM = Number.isFinite(cargo.widthM) && cargo.widthM > 0 ? cargo.widthM : 0;
  return {
    envelopeX: lengthM * CARGO_COG_ENVELOPE_FACTOR,
    envelopeY: widthM * CARGO_COG_ENVELOPE_FACTOR,
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
