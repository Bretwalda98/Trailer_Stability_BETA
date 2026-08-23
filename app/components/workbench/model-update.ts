import type { ProjectModel } from "../../engine/types";
import { applyAutomaticProjectCargoCogEnvelopeInputs } from "../../engine/cargo-envelope";

export function updateModelField(
  model: ProjectModel,
  path: string,
  value: string | number | boolean | null,
): ProjectModel {
  const clone = structuredClone(model) as unknown as Record<string, unknown>;
  const parts = path.split(".");
  let cursor = clone;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index];
    const next = cursor[key];
    if (!next || typeof next !== "object") return model;
    cursor = next as Record<string, unknown>;
  }
  cursor[parts.at(-1) ?? ""] = value;
  return applyAutomaticProjectCargoCogEnvelopeInputs(clone as unknown as ProjectModel);
}

export function numberInput(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function cycleGroup(current: number): number {
  return current >= 3 ? 1 : current + 1;
}

