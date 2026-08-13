"use client";

import { IconInfoCircle, IconSearch, IconSettings } from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { weightsForPreset } from "../../engine/optimiser";
import type {
  OptimiserSettings,
  ProjectModel,
  WeightPreset,
} from "../../engine/types";

interface OptimisationWorkspaceProps {
  model: ProjectModel;
  onModelChange(model: ProjectModel): void;
}

function Field({
  label,
  description,
  children,
  query,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
  query: string;
}) {
  if (
    query &&
    !`${label} ${description ?? ""}`.toLowerCase().includes(query.toLowerCase())
  ) {
    return null;
  }
  return (
    <label className="optimiser-field">
      <span><b>{label}</b>{description && <small>{description}</small>}</span>
      {children}
    </label>
  );
}

export function OptimisationWorkspace({
  model,
  onModelChange,
}: OptimisationWorkspaceProps) {
  const [query, setQuery] = useState("");
  const settings = model.optimiser;
  const update = (patch: Partial<OptimiserSettings>) =>
    onModelChange({ ...model, optimiser: { ...settings, ...patch } });
  const estimatedCoarseCases = useMemo(() => {
    const cCount =
      Math.floor(
        Math.abs(settings.c89Maximum - settings.c89Start) /
          Math.max(1e-9, Math.abs(settings.c89Step)),
      ) + 1;
    const eCount =
      settings.e89RangeMode === "MANUAL"
        ? Math.floor(
            Math.abs(settings.e89Maximum - settings.e89Minimum) /
              Math.max(1e-9, Math.abs(settings.e89Step)),
          ) + 1
        : 3;
    return Math.max(1, cCount * eCount);
  }, [settings]);

  const setPreset = (preset: WeightPreset) => {
    update({
      weightPreset: preset,
      weights:
        preset === "CUSTOM"
          ? settings.weights
          : weightsForPreset(
              preset,
              settings.weights,
              settings.detailedWeighting,
              settings.f506Policy,
            ),
    });
  };

  return (
    <section className="optimisation-settings-workspace">
      <header className="workspace-titlebar">
        <div>
          <span>OPTIMISATION</span>
          <h1>Search configuration</h1>
          <p>Configure the search here, then use the single Run optimisation action in the application header.</p>
        </div>
        <div className="plan-estimate">
          <span>COARSE PLAN ESTIMATE</span>
          <b>{estimatedCoarseCases}</b>
          <em>cases before pin and refinement work</em>
        </div>
      </header>

      <div className="optimiser-search-row">
        <IconSearch size={15} />
        <input
          type="search"
          placeholder="Search optimisation settings"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <span><IconInfoCircle size={14} /> Every retained case uses the full authoritative calculation and support-settling process.</span>
      </div>

      <div className="optimisation-settings-grid">
        <section>
          <header><IconSettings size={15} /><b>Coarse scan</b></header>
          <Field query={query} label="Calculation mode" description="Native worker-backed or verification-parity sequencing">
            <select value={settings.calculationMode} onChange={(event) => update({ calculationMode: event.target.value as OptimiserSettings["calculationMode"] })}>
              <option value="NATIVE_VERIFIED">Native verified</option>
              <option value="WORKBOOK_PARITY">Legacy sequencing</option>
            </select>
          </Field>
          <Field query={query} label="Axle lines start"><input type="number" value={settings.c89Start} onChange={(event) => update({ c89Start: Number(event.target.value) })} /></Field>
          <Field query={query} label="Axle lines maximum"><input type="number" value={settings.c89Maximum} onChange={(event) => update({ c89Maximum: Number(event.target.value) })} /></Field>
          <Field query={query} label="Axle lines step"><input type="number" min={1} value={settings.c89Step} onChange={(event) => update({ c89Step: Number(event.target.value) })} /></Field>
          <Field query={query} label="Split start"><input type="number" min={1} value={settings.d138Start} onChange={(event) => update({ d138Start: Number(event.target.value) })} /></Field>
          <Field query={query} label="Split step"><input type="number" min={1} value={settings.d138Step} onChange={(event) => update({ d138Step: Number(event.target.value) })} /></Field>
          <Field query={query} label="Maximum split fraction"><input type="number" min={0.1} max={1} step={0.05} value={settings.d138MaximumFraction} onChange={(event) => update({ d138MaximumFraction: Number(event.target.value) })} /></Field>
          <Field query={query} label="Trailer X range mode"><select value={settings.e89RangeMode} onChange={(event) => update({ e89RangeMode: event.target.value as OptimiserSettings["e89RangeMode"] })}><option value="AUTO_GROUP_CENTRES">Automatic group centres</option><option value="MANUAL">Manual range</option></select></Field>
          <Field query={query} label="Trailer X minimum"><input type="number" step="any" value={settings.e89Minimum} disabled={settings.e89RangeMode !== "MANUAL"} onChange={(event) => update({ e89Minimum: Number(event.target.value) })} /></Field>
          <Field query={query} label="Trailer X maximum"><input type="number" step="any" value={settings.e89Maximum} disabled={settings.e89RangeMode !== "MANUAL"} onChange={(event) => update({ e89Maximum: Number(event.target.value) })} /></Field>
          <Field query={query} label="Trailer X step"><input type="number" min={0.001} step="any" value={settings.e89Step} onChange={(event) => update({ e89Step: Number(event.target.value) })} /></Field>
        </section>

        <section>
          <header><IconSettings size={15} /><b>Acceptance and refinement</b></header>
          <Field query={query} label="Minimum active supports" description="Case fails after support settling if fewer remain active">
            <input type="number" min={0} max={10} value={settings.minimumActiveSupports} onChange={(event) => update({ minimumActiveSupports: Number(event.target.value) })} />
          </Field>
          <Field query={query} label="Stop at first pass"><input type="checkbox" checked={settings.stopAtFirstPass} onChange={(event) => update({ stopAtFirstPass: event.target.checked, afterFirstPass: event.target.checked ? "STOP" : "CONTINUE_SCAN" })} /></Field>
          <Field query={query} label="Boundary tolerance"><div className="value-with-unit"><input type="number" min={0.0001} step="any" value={settings.boundaryToleranceM} onChange={(event) => update({ boundaryToleranceM: Number(event.target.value) })} /><em>m</em></div></Field>
          <Field query={query} label="Fine trailer-X step"><div className="value-with-unit"><input type="number" min={0.001} step="any" value={settings.fineE89Step} onChange={(event) => update({ fineE89Step: Number(event.target.value) })} /><em>m</em></div></Field>
          <Field query={query} label="Fine pass reference 1"><input type="text" value={settings.fineFirstPassReference} placeholder="Default: best pass" onChange={(event) => update({ fineFirstPassReference: event.target.value })} /></Field>
          <Field query={query} label="Fine pass reference 2"><input type="text" value={settings.fineSecondPassReference} placeholder="Default: second best" onChange={(event) => update({ fineSecondPassReference: event.target.value })} /></Field>
          <Field query={query} label="Deflection check"><select value={settings.deflectionCheck} onChange={(event) => update({ deflectionCheck: event.target.value as OptimiserSettings["deflectionCheck"] })}><option value="OFF">Off</option><option value="REQUIRED">Required</option></select></Field>
          <Field query={query} label="Deflection limit"><div className="value-with-unit"><input type="number" min={0} step="any" value={settings.deflectionLimitMm} onChange={(event) => update({ deflectionLimitMm: Number(event.target.value) })} /><em>mm</em></div></Field>
          <Field query={query} label="Maximum axle utilisation"><input type="text" value={String(settings.maximumAxleUtilisation)} onChange={(event) => update({ maximumAxleUtilisation: event.target.value.toUpperCase() === "AUTO" ? "AUTO" : Number(event.target.value) })} /></Field>
          <Field query={query} label="Optimiser strategy"><select value={settings.optimiserStrategy} onChange={(event) => update({ optimiserStrategy: event.target.value as OptimiserSettings["optimiserStrategy"] })}><option value="STAGED_ADAPTIVE">Staged adaptive</option><option value="EXHAUSTIVE">Exhaustive</option></select></Field>
        </section>

        <section>
          <header><IconSettings size={15} /><b>Pin search</b></header>
          <Field query={query} label="Pin search mode"><select value={settings.pinSearchMode} onChange={(event) => update({ pinSearchMode: event.target.value as OptimiserSettings["pinSearchMode"] })}><option value="OFF">Off</option><option value="FAST">Fast</option><option value="THOROUGH">Thorough</option></select></Field>
          <Field query={query} label="Existing pins"><select value={settings.existingPinsPolicy} onChange={(event) => update({ existingPinsPolicy: event.target.value as OptimiserSettings["existingPinsPolicy"] })}><option value="REARRANGE">Allow rearrangement</option><option value="KEEP">Keep existing</option></select></Field>
          <Field query={query} label="Maximum pinned axle lines"><input type="number" min={0} max={8} value={settings.maximumPins} onChange={(event) => update({ maximumPins: Number(event.target.value) })} /></Field>
          <Field query={query} label="Pin case budget"><input type="number" min={1} value={settings.pinCaseBudget} onChange={(event) => update({ pinCaseBudget: Number(event.target.value) })} /></Field>
          <Field query={query} label="Pin stop rule"><select value={settings.pinStopRule} onChange={(event) => update({ pinStopRule: event.target.value as OptimiserSettings["pinStopRule"] })}><option value="CONTINUE_IMPROVING">Continue while improving</option><option value="FIRST_IMPROVEMENT">First improvement</option></select></Field>
          <Field query={query} label="Minimum deflection improvement"><div className="value-with-unit"><input type="number" step="any" value={settings.minimumDeflectionImprovementMm} onChange={(event) => update({ minimumDeflectionImprovementMm: Number(event.target.value) })} /><em>mm</em></div></Field>
          <Field query={query} label="Local structural target"><select value={settings.localStructuralTargetMode} onChange={(event) => update({ localStructuralTargetMode: event.target.value as OptimiserSettings["localStructuralTargetMode"] })}><option value="AUTO_AT_DEFLECTION_PEAK">At deflection peak</option><option value="MANUAL_X">Manual X</option></select></Field>
          <Field query={query} label="Manual local target X"><div className="value-with-unit"><input type="number" step="any" disabled={settings.localStructuralTargetMode !== "MANUAL_X"} value={settings.manualLocalTargetXM ?? ""} onChange={(event) => update({ manualLocalTargetXM: event.target.value === "" ? null : Number(event.target.value) })} /><em>m</em></div></Field>
        </section>

        <section className="weighting-section">
          <header><IconSettings size={15} /><b>Pass weighting</b></header>
          <Field query={query} label="Preset"><select value={settings.weightPreset} onChange={(event) => setPreset(event.target.value as WeightPreset)}>{["BALANCED","UTILISATION_PRIORITY","STABILITY_PRIORITY","STATIC_PRIORITY","DYNAMIC_PRIORITY","SPINE_BEAM_PRIORITY","STRUCTURAL_BALANCED","LOCAL_DEFLECTION_PRIORITY","LOCAL_BENDING_PRIORITY","CUSTOM"].map((preset) => <option key={preset}>{preset}</option>)}</select></Field>
          <div className="weighting-note">Lower is better for utilisation, structural demand, deflection and axle-line count. Higher is better for tipping angles and dynamic/static ratio.</div>
          {Object.entries(settings.weights).map(([key, value]) => (
            <Field key={key} query={query} label={key.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase())}>
              <input type="number" min={0} step={0.1} value={value} onChange={(event) => update({ weightPreset: "CUSTOM", weights: { ...settings.weights, [key]: Number(event.target.value) } })} />
            </Field>
          ))}
        </section>
      </div>
    </section>
  );
}
