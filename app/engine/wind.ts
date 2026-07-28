import type { CargoInput, ProjectModel } from "./types";

/**
 * The cargo is treated as the projected wind body when automatic wind inputs
 * are enabled.  The side projection is longitudinal length x height, while
 * the front projection is transverse width x height.  Both forces act at the
 * mid-height of the cargo.
 */
export function derivedCargoWindInputs(cargo: CargoInput): Pick<
  CargoInput,
  "sideWindAreaM2" | "frontWindAreaM2" | "sideWindHeightM" | "frontWindHeightM"
> {
  const lengthM = Number.isFinite(cargo.lengthM) && cargo.lengthM > 0 ? cargo.lengthM : 0;
  const widthM = Number.isFinite(cargo.widthM) && cargo.widthM > 0 ? cargo.widthM : 0;
  const heightM = Number.isFinite(cargo.heightM) && cargo.heightM > 0 ? cargo.heightM : 0;
  return {
    sideWindAreaM2: lengthM * heightM,
    frontWindAreaM2: widthM * heightM,
    sideWindHeightM: heightM / 2,
    frontWindHeightM: heightM / 2,
  };
}

export function applyAutomaticCargoWindInputs(cargo: CargoInput): CargoInput {
  return cargo.autoWindFromCargo
    ? { ...cargo, ...derivedCargoWindInputs(cargo) }
    : cargo;
}

/** Keeps persistence and verification exports in step with automatic wind mode. */
export function applyAutomaticProjectWindInputs(model: ProjectModel): ProjectModel {
  const cargo = applyAutomaticCargoWindInputs(model.cargo);
  return cargo === model.cargo ? model : { ...model, cargo };
}
