"use client";

// Preserved as a reference while the CAD/CAE workspace supersedes this dashboard.
import { useEffect, useMemo, useRef, useState } from "react";
import { createDefaultModel, hydrateProjectModel } from "../data/default-model";
import { trailerPropertyColumns } from "../data/trailers";
import {
  applySharedAxleLines,
  applySharedPins,
  applySharedSplit,
  applySharedX,
  calculateProject,
  validateCatalogue,
} from "../engine/core";
import {
  createEmptyRun,
  exportAxlesCsv,
  exportBeamPointsCsv,
  exportEventsCsv,
  exportPassesCsv,
  passToProject,
  runOptimiser,
  weightsForPreset,
} from "../engine/optimiser";
import type {
  CargoSupport,
  HydraulicGrouping,
  OptimiserRun,
  OptimiserWeights,
  PassResult,
  ProjectModel,
  SpineLoadCase,
  TrailerDefinition,
  TrailerInput,
  WeightPreset,
} from "../engine/types";
import {
  downloadBytes,
  downloadText,
  exportVerificationWorkbook,
  importWorkbook,
} from "../engine/workbook";
import { assetPath } from "../site-path";
import {
  AxleLoadChart,
  BeamChart,
  BeamLoadChart,
  ElevationChart,
  LoadPlanChart,
  ProgressBar,
  StabilityChart,
} from "./Charts";

type Tab = "analysis" | "setup" | "optimiser" | "logs" | "catalogue" | "verification";
type BeamChannel = "momentKNm" | "shearKN" | "deflectionMm";

const navItems: Array<{ id: Tab; label: string; short: string; icon: string }> = [
  { id: "analysis", label: "Live analysis", short: "Analysis", icon: "◉" },
  { id: "setup", label: "Load & trailer setup", short: "Setup", icon: "⌘" },
  { id: "optimiser", label: "Optimiser", short: "Optimise", icon: "↗" },
  { id: "logs", label: "Cases & activity", short: "Logs", icon: "≡" },
  { id: "catalogue", label: "Trailer catalogue", short: "Trailers", icon: "▦" },
  { id: "verification", label: "Import & verify", short: "Verify", icon: "⇄" },
];

const metricLabels: Record<string, { label: string; unit: string; lower: boolean }> = {
  basicUtil: { label: "Basic static utilisation", unit: "%", lower: true },
  slopeUtil: { label: "Static incl. slopes", unit: "%", lower: true },
  dynamicUtil: { label: "Dynamic utilisation", unit: "%", lower: true },
  spineUtil: { label: "Spine-beam utilisation", unit: "%", lower: true },
  basicAngle: { label: "Basic tipping angle", unit: "°", lower: false },
  slopeAngle: { label: "Angle incl. slopes", unit: "°", lower: false },
  dynamicAngle: { label: "Dynamic tipping angle", unit: "°", lower: false },
  dynamicRatio: { label: "Dynamic / static ratio", unit: "", lower: false },
  shearUtil: { label: "Shear utilisation", unit: "%", lower: true },
  bendingUtil: { label: "Bending utilisation", unit: "%", lower: true },
  deflection: { label: "Absolute deflection", unit: "mm", lower: true },
  localBendingUtil: { label: "Local bending utilisation", unit: "%", lower: true },
  axleLinesUsed: { label: "Axle lines used", unit: "", lower: true },
};

function format(value: number | null | undefined, digits = 2): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "—";
}

function formatDuration(milliseconds: number | null): string {
  if (milliseconds === null || !Number.isFinite(milliseconds)) return "Estimating…";
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

function humanStatus(status: string): string {
  return status.replaceAll("_", " ");
}

function NumberField({
  label,
  value,
  onChange,
  unit,
  step = "any",
  min,
  max,
  hint,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  unit?: string;
  step?: number | "any";
  min?: number;
  max?: number;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="input-with-unit">
        <input
          type="number"
          value={Number.isFinite(value) ? value : ""}
          step={step}
          min={min}
          max={max}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        {unit && <em>{unit}</em>}
      </div>
      {hint && <small>{hint}</small>}
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  children,
  hint,
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>{children}</select>
      {hint && <small>{hint}</small>}
    </label>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  detail,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  detail?: string;
}) {
  return (
    <label className="toggle-row">
      <span className={`toggle${checked ? " checked" : ""}`}>
        <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
        <i />
      </span>
      <span><strong>{label}</strong>{detail && <small>{detail}</small>}</span>
    </label>
  );
}

function SectionTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="section-title">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}

function MetricCard({
  name,
  value,
  status,
}: {
  name: keyof typeof metricLabels;
  value: number | null;
  status: "OK" | "NOK" | "N/A";
}) {
  const meta = metricLabels[name];
  const display =
    meta.unit === "%" && value !== null ? `${format(value * 100, 1)}%` : `${format(value, name === "dynamicRatio" ? 2 : 1)}${meta.unit}`;
  return (
    <article className={`metric-card status-${status.toLowerCase().replace("/", "")}`}>
      <div className="metric-top"><span>{meta.lower ? "↓" : "↑"} {meta.lower ? "lower" : "higher"} is better</span><b>{status}</b></div>
      <strong className="metric-value">{display}</strong>
      <p>{meta.label}</p>
    </article>
  );
}

function StatusPill({ status }: { status: string }) {
  const key = status.includes("PASS") || status === "OK" || status === "COMPLETE" ? "ok" : status.includes("NOK") || status.includes("FAIL") || status === "ERROR" ? "bad" : "neutral";
  return <span className={`status-pill ${key}`}>{humanStatus(status)}</span>;
}

function AnalysisTab({
  model,
  result,
  beamChannel,
  setBeamChannel,
  onGoSetup,
}: {
  model: ProjectModel;
  result: ReturnType<typeof calculateProject>;
  beamChannel: BeamChannel;
  setBeamChannel: (channel: BeamChannel) => void;
  onGoSetup: () => void;
}) {
  const metrics = result.metrics;
  return (
    <div className="page-stack">
      <SectionTitle
        eyebrow="Live calculation"
        title="Engineering overview"
        description="Every displayed value is recalculated after each input change. The same result object feeds the checks, diagrams, optimiser and logs."
        action={<button className="button secondary" onClick={onGoSetup}>Edit setup</button>}
      />
      <div className="hero-status-grid">
        <article className={`result-banner ${result.status === "PASS" ? "pass" : "fail"}`}>
          <div>
            <span className="result-signal">{result.status === "PASS" ? "✓" : "!"}</span>
            <div><p>Current engineering result</p><h2>{humanStatus(result.status)}</h2></div>
          </div>
          <p>{result.failDetail || "All active checks pass for the current setup."}</p>
        </article>
        <article className="summary-card">
          <span>All-inclusive mass</span><strong>{format(result.totalMassT, 1)} t</strong><small>including load, packing, trailers and PPUs</small>
        </article>
        <article className="summary-card">
          <span>Active transfer supports</span><strong>{result.activeSupportCount} / {model.supports.length}</strong><small>minimum allowed {result.minimumActiveSupports}</small>
        </article>
        <article className="summary-card">
          <span>Calculation time</span><strong suppressHydrationWarning>{format(result.calculationMs, 1)} ms</strong><small>native in-browser pass</small>
        </article>
      </div>
      <div className="metrics-grid">
        {(["basicUtil", "slopeUtil", "dynamicUtil", "spineUtil", "basicAngle", "slopeAngle", "dynamicAngle", "dynamicRatio"] as const).map((key) => (
          <MetricCard key={key} name={key} value={metrics[key].value} status={metrics[key].status} />
        ))}
      </div>
      <div className="two-column charts-grid">
        <StabilityChart result={result} />
        <LoadPlanChart model={model} result={result} />
        <ElevationChart model={model} result={result} />
        <AxleLoadChart result={result} />
      </div>
      <BeamLoadChart model={model} result={result} />
      <section className="card">
        <div className="segmented chart-tabs">
          <button className={beamChannel === "momentKNm" ? "active" : ""} onClick={() => setBeamChannel("momentKNm")}>Bending moment</button>
          <button className={beamChannel === "shearKN" ? "active" : ""} onClick={() => setBeamChannel("shearKN")}>Shear force</button>
          <button className={beamChannel === "deflectionMm" ? "active" : ""} onClick={() => setBeamChannel("deflectionMm")}>Deflection</button>
        </div>
        <BeamChart result={result} channel={beamChannel} />
        <div className="beam-summary">
          <span><b>{format(result.beam.bendingMinKNm, 1)}</b> min kNm at {format(result.beam.bendingMinXM)} m</span>
          <span><b>{format(result.beam.bendingMaxKNm, 1)}</b> max kNm at {format(result.beam.bendingMaxXM)} m</span>
          <span><b>{format(result.beam.shearMinKN, 1)}</b> min kN</span>
          <span><b>{format(result.beam.shearMaxKN, 1)}</b> max kN</span>
          <span><b>{format(result.beam.absoluteDeflectionMm, 3)}</b> max |deflection| mm</span>
        </div>
      </section>
      {(result.warnings.length > 0 || result.supports.some((support) => !support.active)) && (
        <section className="card warning-card">
          <SectionTitle eyebrow="Calculation notes" title="Items requiring attention" />
          <ul>
            {result.warnings.map((warning, index) => <li key={index}>{warning}</li>)}
            {result.supports.filter((support) => !support.active).map((support) => (
              <li key={support.id}>{support.id} was set to No: {humanStatus(support.disableReason)}.</li>
            ))}
          </ul>
        </section>
      )}
      <section className="card explanation-card">
        <div className="explanation-icon">i</div>
        <div>
          <h3>How the result is formed</h3>
          <p>The load and packing COG are combined with trailer tare and PPU masses. Hydraulic group centres form the stability triangle. Static envelope, slope and dynamic shifts are each checked, then the analysed trailer beam supplies shear, bending and deflection metrics.</p>
        </div>
      </section>
    </div>
  );
}

function CargoSetup({
  model,
  setModel,
}: {
  model: ProjectModel;
  setModel: React.Dispatch<React.SetStateAction<ProjectModel>>;
}) {
  const updateCargo = <K extends keyof ProjectModel["cargo"]>(key: K, value: ProjectModel["cargo"][K]) =>
    setModel((current) => ({ ...current, cargo: { ...current.cargo, [key]: value } }));
  const updateCog = (key: "x" | "y" | "z", value: number) =>
    setModel((current) => ({ ...current, cargo: { ...current.cargo, cog: { ...current.cargo.cog, [key]: value } } }));
  return (
    <section className="card form-card">
      <SectionTitle eyebrow="1 · Load definition" title="Cargo geometry, mass &amp; COG" description="The yellow workbook inputs are grouped here by engineering purpose." />
      <div className="form-grid three">
        <TextField label="Cargo name" value={model.cargo.name} onChange={(value) => updateCargo("name", value)} />
        <TextField label="Client reference" value={model.cargo.clientReference} onChange={(value) => updateCargo("clientReference", value)} />
        <TextField label="Owner reference" value={model.cargo.ownerReference} onChange={(value) => updateCargo("ownerReference", value)} />
        <SelectField label="Engineering verification degree (F17)" value={model.engineeringDegree} onChange={(value) => setModel((current) => ({ ...current, engineeringDegree: value as ProjectModel["engineeringDegree"] }))}>
          <option value="First">First</option>
          <option value="Second">Second</option>
          <option value="Third">Third</option>
        </SelectField>
        <TextField label="Weight / COG information reference (J22)" value={model.weightCogReference} onChange={(value) => setModel((current) => ({ ...current, weightCogReference: value }))} />
        <TextField label="Load datum / reference point (D48)" value={model.referencePoint} onChange={(value) => setModel((current) => ({ ...current, referencePoint: value }))} />
      </div>
      <h3 className="subsection-title">Envelope and dimensions</h3>
      <div className="form-grid four">
        <NumberField label="Length" value={model.cargo.lengthM} unit="m" min={0} onChange={(value) => updateCargo("lengthM", value)} />
        <NumberField label="Width" value={model.cargo.widthM} unit="m" min={0} onChange={(value) => updateCargo("widthM", value)} />
        <NumberField label="Height" value={model.cargo.heightM} unit="m" min={0} onChange={(value) => updateCargo("heightM", value)} />
        <NumberField label="Cargo mass" value={model.cargo.massT} unit="t" min={0} onChange={(value) => updateCargo("massT", value)} />
        <NumberField label="Extreme −X" value={model.cargo.extremeX} unit="m" onChange={(value) => updateCargo("extremeX", value)} />
        <NumberField label="Extreme −Y" value={model.cargo.extremeY} unit="m" onChange={(value) => updateCargo("extremeY", value)} />
        <NumberField label="COG envelope X ±" value={model.cargo.envelopeX} unit="m" min={0} onChange={(value) => updateCargo("envelopeX", value)} />
        <NumberField label="COG envelope Y ±" value={model.cargo.envelopeY} unit="m" min={0} onChange={(value) => updateCargo("envelopeY", value)} />
      </div>
      <h3 className="subsection-title">Cargo COG from the load datum</h3>
      <div className="form-grid three">
        <NumberField label="COG X" value={model.cargo.cog.x} unit="m" onChange={(value) => updateCog("x", value)} />
        <NumberField label="COG Y" value={model.cargo.cog.y} unit="m" onChange={(value) => updateCog("y", value)} />
        <NumberField label="COG Z" value={model.cargo.cog.z} unit="m" onChange={(value) => updateCog("z", value)} />
      </div>
      <h3 className="subsection-title">Wind properties</h3>
      <div className="form-grid three">
        <NumberField label="Side wind area" value={model.cargo.sideWindAreaM2} unit="m²" min={0} onChange={(value) => updateCargo("sideWindAreaM2", value)} />
        <NumberField label="Side drag coefficient" value={model.cargo.sideDragCoefficient} unit="-" min={0} onChange={(value) => updateCargo("sideDragCoefficient", value)} />
        <NumberField label="Side force height" value={model.cargo.sideWindHeightM} unit="m" min={0} onChange={(value) => updateCargo("sideWindHeightM", value)} />
        <NumberField label="Front wind area" value={model.cargo.frontWindAreaM2} unit="m²" min={0} onChange={(value) => updateCargo("frontWindAreaM2", value)} />
        <NumberField label="Front drag coefficient" value={model.cargo.frontDragCoefficient} unit="-" min={0} onChange={(value) => updateCargo("frontDragCoefficient", value)} />
        <NumberField label="Front force height" value={model.cargo.frontWindHeightM} unit="m" min={0} onChange={(value) => updateCargo("frontWindHeightM", value)} />
      </div>
      <details className="help-details">
        <summary>Workbook explanation</summary>
        <p>COG Z is entered at its highest credible elevation. X and Y envelopes shift only the cargo portion of the all-inclusive COG, matching the workbook’s A/B/C/D envelope cases.</p>
      </details>
    </section>
  );
}

function TrailerCard({
  index,
  trailer,
  model,
  setModel,
  remove,
}: {
  index: number;
  trailer: TrailerInput;
  model: ProjectModel;
  setModel: React.Dispatch<React.SetStateAction<ProjectModel>>;
  remove: () => void;
}) {
  const definition = model.catalogue.find((item) => item.id === trailer.definitionId);
  const update = <K extends keyof TrailerInput>(key: K, value: TrailerInput[K]) =>
    setModel((current) => ({
      ...current,
      trailers: current.trailers.map((item) => (item.id === trailer.id ? { ...item, [key]: value } : item)),
    }));
  const updateOffset = (key: "x" | "y", value: number) =>
    update("offsetFromReference", { ...trailer.offsetFromReference, [key]: value });
  return (
    <article className="trailer-card">
      <div className="trailer-card-head">
        <div className="trailer-number">{index + 1}</div>
        <div><strong>{definition?.name ?? "Unknown trailer"}</strong><span>{definition?.category ?? "Catalogue record missing"}</span></div>
        <button className="icon-button danger" onClick={remove} aria-label={`Remove trailer ${index + 1}`}>×</button>
      </div>
      <div className="form-grid three">
        <SelectField label="Trailer model" value={trailer.definitionId} onChange={(value) => update("definitionId", value)}>
          {model.catalogue.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </SelectField>
        <SelectField label="Placement reference" value={trailer.placementReference} onChange={(value) => update("placementReference", value as TrailerInput["placementReference"])}>
          <option value="ABSOLUTE">Load datum (absolute)</option>
          <option value="LOAD_COG">Relative to load COG</option>
          <option value="ALL_INCLUSIVE_COG">Relative to all-inclusive COG</option>
        </SelectField>
        {trailer.placementReference === "ABSOLUTE" && (
          <NumberField label="Y centre" value={trailer.yM} unit="m" onChange={(value) => update("yM", value)} />
        )}
      </div>
      {trailer.placementReference === "ABSOLUTE" ? (
        <p className="inline-note">X uses the shared E89 master below. Y remains independent for each trailer row.</p>
      ) : (
        <div className="form-grid two">
          <NumberField label="X offset from reference" value={trailer.offsetFromReference.x} unit="m" onChange={(value) => updateOffset("x", value)} />
          <NumberField label="Y offset from reference" value={trailer.offsetFromReference.y} unit="m" onChange={(value) => updateOffset("y", value)} />
        </div>
      )}
      <div className="toggle-grid">
        <Toggle checked={trailer.singleFile} onChange={(value) => update("singleFile", value)} label="Single-file trailer" />
        <Toggle checked={trailer.ppuLeft} onChange={(value) => update("ppuLeft", value)} label="Left PPU" />
        <Toggle checked={trailer.ppuRight} onChange={(value) => update("ppuRight", value)} label="Right PPU" />
      </div>
      {definition && (
        <div className="trailer-spec-strip">
          <span><b>{definition.axleSpacingM} m</b> axle spacing</span>
          <span><b>{definition.axleCapacityT} t</b> AL capacity</span>
          <span><b>{definition.axleWeightT} t</b> AL tare</span>
          <span><b>{definition.trailerWidthM} m</b> width</span>
        </div>
      )}
    </article>
  );
}

function GroupSelector({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
}) {
  return (
    <label className="mini-field">
      <span>{label}</span>
      <div className="group-buttons">
        {[1, 2, 3].map((group) => (
          <button key={group} className={`group-choice group-${group}${value === group ? " selected" : ""}`} onClick={() => onChange(group)} type="button">
            G{group}
          </button>
        ))}
      </div>
    </label>
  );
}

function AxleGroupingEditor({
  model,
  setModel,
}: {
  model: ProjectModel;
  setModel: React.Dispatch<React.SetStateAction<ProjectModel>>;
}) {
  const axleLines = model.trailers[0]?.axleLines ?? 1;
  const split = model.groupings[0]?.splitAfterAxleLine ?? 1;
  const pins = model.groupings[0]?.pinnedAxleLines ?? [];
  const togglePin = (line: number) => {
    const next = pins.includes(line) ? pins.filter((item) => item !== line) : [...pins, line];
    setModel((current) => applySharedPins(current, next));
  };
  const updateGrouping = (index: number, key: keyof NonNullable<HydraulicGrouping["cornerGroups"]>, value: number) =>
    setModel((current) => ({
      ...current,
      groupings: current.groupings.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              cornerGroups: {
                frontLeft: item.cornerGroups?.frontLeft ?? 2,
                frontRight: item.cornerGroups?.frontRight ?? 1,
                rearLeft: item.cornerGroups?.rearLeft ?? 3,
                rearRight: item.cornerGroups?.rearRight ?? 1,
                [key]: value,
              },
            }
          : item,
      ),
    }));
  return (
    <section className="card form-card">
      <SectionTitle eyebrow="3 · Hydraulic setup" title="Axle lines, split &amp; group routing" description="C89, D138 and the pin row are shared masters. Every trailer mirrors them exactly, as in the corrected workbook." />
      <div className="master-controls">
        <NumberField label="No. of Axle Lines Start (C89)" value={axleLines} min={2} max={99} step={1} onChange={(value) => setModel((current) => applySharedAxleLines(current, value))} />
        <NumberField label="Split after Axle Line (D138)" value={split} min={1} max={Math.max(1, axleLines - 1)} step={1} onChange={(value) => setModel((current) => applySharedSplit(current, value))} />
        <NumberField label="Trailer X Start (E89)" value={model.trailers[0]?.xM ?? 0} unit="m" onChange={(value) => setModel((current) => applySharedX(current, value))} />
      </div>
      <div className="axle-track-wrap">
        <div className="axle-track-label"><span>Front / start</span><span>Rear / end</span></div>
        <div className="axle-track" style={{ gridTemplateColumns: `repeat(${Math.min(axleLines, 44)}, minmax(28px, 1fr))` }}>
          {Array.from({ length: Math.min(axleLines, 44) }, (_, index) => {
            const line = index + 1;
            const pinned = pins.includes(line);
            return (
              <button
                key={line}
                type="button"
                className={`axle-chip${line === split ? " split" : ""}${pinned ? " pinned" : ""}`}
                onClick={() => togglePin(line)}
                title={pinned ? `Unpin axle line ${line}` : `Pin axle line ${line}`}
              >
                <span>{line}</span>{pinned && <i>PIN</i>}
              </button>
            );
          })}
        </div>
        {axleLines > 44 && <p className="inline-note">The visual track shows AL 1–44; the numerical master still applies {axleLines} lines to every trailer.</p>}
        <p className="inline-note">Click an axle line to pin/unpin it. Up to eight pins are written across G136:N136 and mirrored down every trailer row.</p>
      </div>
      <div className="group-routing-list">
        {model.trailers.map((trailer, index) => {
          const grouping = model.groupings[index] ?? model.groupings[0];
          const definition = model.catalogue.find((item) => item.id === trailer.definitionId);
          if (!grouping) return null;
          return (
            <article className="group-routing" key={trailer.id}>
              <div><span className="trailer-number small">{index + 1}</span><strong>{definition?.name ?? `Trailer ${index + 1}`}</strong></div>
              <div className="route-grid">
                <GroupSelector label={`AL 1–${split} left`} value={grouping.cornerGroups?.frontLeft ?? 2} onChange={(value) => updateGrouping(index, "frontLeft", value)} />
                <GroupSelector label={`AL 1–${split} right`} value={grouping.cornerGroups?.frontRight ?? 1} onChange={(value) => updateGrouping(index, "frontRight", value)} />
                <GroupSelector label={`AL ${split + 1}–${axleLines} left`} value={grouping.cornerGroups?.rearLeft ?? 3} onChange={(value) => updateGrouping(index, "rearLeft", value)} />
                <GroupSelector label={`AL ${split + 1}–${axleLines} right`} value={grouping.cornerGroups?.rearRight ?? 1} onChange={(value) => updateGrouping(index, "rearRight", value)} />
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function SupportsEditor({
  model,
  setModel,
  calculated,
}: {
  model: ProjectModel;
  setModel: React.Dispatch<React.SetStateAction<ProjectModel>>;
  calculated: ReturnType<typeof calculateProject>["supports"];
}) {
  const update = (id: string, patch: Partial<CargoSupport>) =>
    setModel((current) => ({ ...current, supports: current.supports.map((item) => (item.id === id ? { ...item, ...patch } : item)) }));
  const add = () =>
    setModel((current) => {
      if (current.supports.length >= 10) return current;
      const index = current.supports.length;
      return {
        ...current,
        supports: [
          ...current.supports,
          { id: `support-${Date.now()}`, xM: (current.cargo.lengthM * (index + 1)) / (index + 2), widthM: 0.5, allowed: true, active: true },
        ],
      };
    });
  return (
    <section className="card form-card">
      <SectionTitle
        eyebrow="4 · Load-transfer supports"
        title="Optional supports &amp; automatic settling"
        description="At every C89, D138, E89 or pin change, all defined and allowed supports start at Yes. Negative reactions are removed repeatedly until only positive reactions remain."
        action={<button className="button secondary" disabled={model.supports.length >= 10} onClick={add}>+ Add support</button>}
      />
      <div className="support-table">
        <div className="support-row header"><span>Support</span><span>X position</span><span>Width</span><span>Assigned wt.</span><span>Allowed</span><span>Rstatic</span><span>Final active</span><span /></div>
        {model.supports.map((support, index) => {
          const live = calculated.find((item) => item.id === support.id);
          return (
            <div className="support-row" key={support.id}>
              <strong>S{index + 1}</strong>
              <div className="compact-input"><input type="number" step="any" value={support.xM} onChange={(event) => update(support.id, { xM: Number(event.target.value) })} /><em>m</em></div>
              <div className="compact-input"><input type="number" min="0" step="any" value={support.widthM} onChange={(event) => update(support.id, { widthM: Number(event.target.value) })} /><em>m</em></div>
              <div className="compact-input"><input type="number" min="0" step="any" value={support.optionalWeightT ?? ""} onChange={(event) => update(support.id, { optionalWeightT: event.target.value === "" ? undefined : Number(event.target.value) })} /><em>t</em></div>
              <button className={`yes-no ${support.allowed ? "yes" : "no"}`} onClick={() => update(support.id, { allowed: !support.allowed })}>{support.allowed ? "Yes" : "No"}</button>
              <span className={(live?.reactionT ?? 0) < 0 ? "negative" : ""}>{format(live?.reactionT, 2)} t</span>
              <StatusPill status={live?.active ? "YES" : "NO"} />
              <button className="icon-button danger" onClick={() => setModel((current) => ({ ...current, supports: current.supports.filter((item) => item.id !== support.id) }))}>×</button>
            </div>
          );
        })}
        {!model.supports.length && <div className="empty-row">No transfer supports are defined. Add at least two to run the support stability gate.</div>}
      </div>
      <div className="support-rule">
        <b>Minimum active supports</b>
        <input type="number" min="2" max="10" step="1" value={model.optimiser.minimumActiveSupports} onChange={(event) => setModel((current) => ({ ...current, optimiser: { ...current.optimiser, minimumActiveSupports: Number(event.target.value) } }))} />
        <span>The case fails when the settled active count is below this value.</span>
      </div>
    </section>
  );
}

const spineLoadCases: SpineLoadCase[] = [
  "Neutral",
  "A",
  "B",
  "C",
  "D",
  "A1",
  "A2",
  "A3",
  "B1",
  "B2",
  "B3",
  "C1",
  "C2",
  "C3",
  "D1",
  "D2",
  "D3",
];

function SpineBeamSetup({
  model,
  setModel,
}: {
  model: ProjectModel;
  setModel: React.Dispatch<React.SetStateAction<ProjectModel>>;
}) {
  const addLoosePacking = () =>
    setModel((current) => {
      if (current.loosePacking.length >= 4) return current;
      return {
        ...current,
        loosePacking: [
          ...current.loosePacking,
          {
            id: `loose-packing-${Date.now()}`,
            type: `Loose packing ${current.loosePacking.length + 1}`,
            massT: 0,
            startXM: current.cargo.extremeX,
            endXM: current.cargo.extremeX + current.cargo.lengthM,
          },
        ],
      };
    });
  const updateLoose = (id: string, patch: Partial<ProjectModel["loosePacking"][number]>) =>
    setModel((current) => ({
      ...current,
      loosePacking: current.loosePacking.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }));
  return (
    <section className="card form-card">
      <SectionTitle
        eyebrow="5 · Spine-beam calculation"
        title="Exact beam case &amp; loose packing"
        description="Choose the workbook static load case used for support settling and beam verification. Loose packing is already included in the declared packing mass and is applied here only as a local beam load."
        action={<button className="button secondary" disabled={model.loosePacking.length >= 4} onClick={addLoosePacking}>+ Loose packing</button>}
      />
      <div className="form-grid three">
        <SelectField label="Analysed trailer (F433)" value={model.analysedTrailer} onChange={(value) => setModel((current) => ({ ...current, analysedTrailer: Number(value) }))}>
          {model.trailers.map((trailer, index) => {
            const definition = model.catalogue.find((item) => item.id === trailer.definitionId);
            return <option key={trailer.id} value={index + 1}>Trailer {index + 1} · {definition?.name ?? "Unknown"}</option>;
          })}
        </SelectField>
        <SelectField label="Static beam load case (F434)" value={model.spineLoadCase} onChange={(value) => setModel((current) => ({ ...current, spineLoadCase: value as SpineLoadCase }))}>
          {spineLoadCases.map((value) => <option key={value} value={value}>{value}</option>)}
        </SelectField>
        <NumberField label="Beam mesh size (F435)" value={model.spineMeshSizeM} unit="m" min={0.001} max={1} step={0.001} onChange={(value) => setModel((current) => ({ ...current, spineMeshSizeM: value }))} />
      </div>
      <div className="loose-packing-list">
        {model.loosePacking.map((item, index) => (
          <article className="loose-packing-row" key={item.id}>
            <strong>LP{index + 1}</strong>
            <TextField label="Type" value={item.type} onChange={(value) => updateLoose(item.id, { type: value })} />
            <NumberField label="Mass" value={item.massT} unit="t" min={0} onChange={(value) => updateLoose(item.id, { massT: value })} />
            <NumberField label="Absolute start X" value={item.startXM} unit="m" onChange={(value) => updateLoose(item.id, { startXM: value })} />
            <NumberField label="Absolute end X" value={item.endXM} unit="m" onChange={(value) => updateLoose(item.id, { endXM: value })} />
            <button className="icon-button danger" aria-label={`Remove loose packing ${index + 1}`} onClick={() => setModel((current) => ({ ...current, loosePacking: current.loosePacking.filter((candidate) => candidate.id !== item.id) }))}>×</button>
          </article>
        ))}
        {!model.loosePacking.length && <div className="empty-row">No loose beam-only packing is defined.</div>}
      </div>
      <details className="help-details">
        <summary>Workbook explanation</summary>
        <p>Neutral and A–D use the basic static cases. A1–D3 use the twelve slope-envelope cases. Start and end X are absolute coordinates, exactly as in rows 439–442 of the workbook.</p>
      </details>
    </section>
  );
}

function SetupTab({
  model,
  setModel,
  result,
}: {
  model: ProjectModel;
  setModel: React.Dispatch<React.SetStateAction<ProjectModel>>;
  result: ReturnType<typeof calculateProject>;
}) {
  const addTrailer = () =>
    setModel((current) => {
      if (current.trailers.length >= 12) return current;
      const index = current.trailers.length;
      const source = current.trailers[0];
      const trailer: TrailerInput = {
        ...(source ?? {
          definitionId: current.catalogue[0]?.id ?? "",
          axleLines: 4,
          singleFile: false,
          xM: 0,
          yM: 0,
          placementReference: "ABSOLUTE",
          offsetFromReference: { x: 0, y: 0 },
          ppuLeft: false,
          ppuRight: false,
          enabled: true,
        }),
        id: `trailer-${Date.now()}`,
        yM: (source?.yM ?? 0) + index * 1.5,
      };
      const grouping: HydraulicGrouping = {
        splitAfterAxleLine: current.groupings[0]?.splitAfterAxleLine ?? 1,
        groups: [...(current.groupings[0]?.groups ?? [])],
        cornerGroups: { ...(current.groupings[0]?.cornerGroups ?? { frontLeft: 2, frontRight: 1, rearLeft: 3, rearRight: 1 }) },
        pinnedAxleLines: [...(current.groupings[0]?.pinnedAxleLines ?? [])],
      };
      return { ...current, trailers: [...current.trailers, trailer], groupings: [...current.groupings, grouping] };
    });
  return (
    <div className="page-stack">
      <SectionTitle eyebrow="Calculation inputs" title="Load &amp; transport arrangement" description="A clearer interface over the workbook’s yellow cells, with shared masters enforced automatically." />
      <CargoSetup model={model} setModel={setModel} />
      <section className="card form-card">
        <SectionTitle
          eyebrow="2 · Trailer arrangement"
          title="Selected trailer modules"
          description="Catalogue properties are read by model name, including both PEKZ alternatives. No fixed Database row limit is used."
          action={<button className="button secondary" disabled={model.trailers.length >= 12} onClick={addTrailer}>+ Add trailer</button>}
        />
        <div className="form-grid three deck-controls">
          <NumberField label="Trailer deck height" value={model.trailerDeckHeightM} unit="m" min={0} onChange={(value) => setModel((current) => ({ ...current, trailerDeckHeightM: value }))} />
          <NumberField label="Packing mass" value={model.packing.massT} unit="t" min={0} onChange={(value) => setModel((current) => ({ ...current, packing: { ...current.packing, massT: value } }))} />
          <NumberField label="Packing height" value={model.packing.heightM} unit="m" min={0} onChange={(value) => setModel((current) => ({ ...current, packing: { ...current.packing, heightM: value } }))} />
          <NumberField label="Packing COG X" value={model.packing.cog.x} unit="m" onChange={(value) => setModel((current) => ({ ...current, packing: { ...current.packing, cog: { ...current.packing.cog, x: value } } }))} />
          <NumberField label="Packing COG Y" value={model.packing.cog.y} unit="m" onChange={(value) => setModel((current) => ({ ...current, packing: { ...current.packing, cog: { ...current.packing.cog, y: value } } }))} />
          <NumberField label="Packing COG Z" value={model.packing.cog.z} unit="m" onChange={(value) => setModel((current) => ({ ...current, packing: { ...current.packing, cog: { ...current.packing.cog, z: value } } }))} />
        </div>
        <div className="trailer-list">
          {model.trailers.map((trailer, index) => (
            <TrailerCard
              key={trailer.id}
              index={index}
              trailer={trailer}
              model={model}
              setModel={setModel}
              remove={() =>
                setModel((current) => ({
                  ...current,
                  trailers: current.trailers.filter((item) => item.id !== trailer.id),
                  groupings: current.groupings.filter((_, groupIndex) => groupIndex !== index),
                }))
              }
            />
          ))}
        </div>
        <details className="help-details">
          <summary>How COG-relative placement works</summary>
          <p>Load COG mode offsets the trailer from cargo-plus-packing COG. All-inclusive mode iterates trailer position and total COG together until the position changes by less than 1×10⁻¹⁰ m, recalculating tare and PPU mass on every iteration.</p>
        </details>
      </section>
      <AxleGroupingEditor model={model} setModel={setModel} />
      <SupportsEditor model={model} setModel={setModel} calculated={result.supports} />
      <SpineBeamSetup model={model} setModel={setModel} />
      <section className="card form-card">
        <SectionTitle eyebrow="6 · Environment" title="Slope, acceleration &amp; wind" description="Route and residual slopes remain separate, matching all four yellow workbook slope inputs." />
        <div className="form-grid five">
          <NumberField label="Route longitudinal slope" value={model.environment.routeLongitudinalSlopeDeg} unit="°" onChange={(value) => setModel((current) => ({ ...current, environment: { ...current.environment, routeLongitudinalSlopeDeg: value } }))} />
          <NumberField label="Residual longitudinal slope" value={model.environment.longitudinalSlopeDeg} unit="°" onChange={(value) => setModel((current) => ({ ...current, environment: { ...current.environment, longitudinalSlopeDeg: value } }))} />
          <NumberField label="Route transverse slope" value={model.environment.routeTransverseSlopeDeg} unit="°" onChange={(value) => setModel((current) => ({ ...current, environment: { ...current.environment, routeTransverseSlopeDeg: value } }))} />
          <NumberField label="Residual transverse slope" value={model.environment.transverseSlopeDeg} unit="°" onChange={(value) => setModel((current) => ({ ...current, environment: { ...current.environment, transverseSlopeDeg: value } }))} />
          <NumberField label="Combination factor" value={model.environment.combinationFactor} unit="-" min={0} max={1} step={0.05} onChange={(value) => setModel((current) => ({ ...current, environment: { ...current.environment, combinationFactor: value } }))} />
          <NumberField label="Longitudinal acceleration" value={model.environment.longitudinalAccelerationMps2} unit="m/s²" onChange={(value) => setModel((current) => ({ ...current, environment: { ...current.environment, longitudinalAccelerationMps2: value } }))} />
          <NumberField label="Transverse acceleration" value={model.environment.transverseAccelerationMps2} unit="m/s²" onChange={(value) => setModel((current) => ({ ...current, environment: { ...current.environment, transverseAccelerationMps2: value } }))} />
          <NumberField label="Wind speed" value={model.environment.windSpeedMps} unit="m/s" min={0} onChange={(value) => setModel((current) => ({ ...current, environment: { ...current.environment, windSpeedMps: value } }))} />
        </div>
      </section>
    </div>
  );
}

function WeightEditor({
  weights,
  onChange,
}: {
  weights: OptimiserWeights;
  onChange: (weights: OptimiserWeights) => void;
}) {
  return (
    <div className="weight-grid">
      {(Object.keys(weights) as Array<keyof OptimiserWeights>).map((key) => (
        <label key={key}>
          <span>{metricLabels[key].label}</span>
          <input type="number" min="0" step="0.5" value={weights[key]} onChange={(event) => onChange({ ...weights, [key]: Number(event.target.value) })} />
        </label>
      ))}
    </div>
  );
}

function OptimiserTab({
  model,
  setModel,
  run,
  onRun,
  onStop,
  onApply,
}: {
  model: ProjectModel;
  setModel: React.Dispatch<React.SetStateAction<ProjectModel>>;
  run: OptimiserRun;
  onRun: () => void;
  onStop: () => void;
  onApply: (pass: PassResult) => void;
}) {
  const running = run.state === "RUNNING" || run.state === "PLANNING";
  const settings = model.optimiser;
  const update = <K extends keyof ProjectModel["optimiser"]>(key: K, value: ProjectModel["optimiser"][K]) =>
    setModel((current) => ({ ...current, optimiser: { ...current.optimiser, [key]: value } }));
  const ranked = [...run.passes].filter((pass) => pass.overallRank !== null).sort((a, b) => (a.overallRank ?? 9999) - (b.overallRank ?? 9999));
  const estimatedCases = Math.max(
    1,
    Math.ceil((settings.c89Maximum - settings.c89Start) / Math.max(1, settings.c89Step) + 1) *
      Math.ceil(settings.c89Maximum * settings.d138MaximumFraction / Math.max(1, settings.d138Step)) *
      Math.ceil((settings.e89Maximum - settings.e89Minimum) / Math.max(0.01, settings.e89Step) + 1),
  );
  return (
    <div className="page-stack">
      <SectionTitle
        eyebrow="Search & rank"
        title="Trailer stability optimiser"
        description="Every candidate performs the full support reset/settling sequence before its metrics are logged and ranked."
        action={
          <div className="button-row">
            {running ? <button className="button danger" onClick={onStop}>■ Stop</button> : <button className="button primary" onClick={onRun}>▶ Run optimiser</button>}
          </div>
        }
      />
      <div className="two-column optimiser-top">
        <section className="card form-card">
          <SectionTitle eyebrow="Coarse scan" title="Iteration controls" />
          <div className="form-grid three">
            <NumberField label="No. of Axle Lines Start (C89)" value={settings.c89Start} min={2} step={1} onChange={(value) => update("c89Start", value)} />
            <NumberField label="No. of Axle Lines Maximum (C89)" value={settings.c89Maximum} min={settings.c89Start} step={1} onChange={(value) => update("c89Maximum", value)} />
            <NumberField label="C89 increment" value={settings.c89Step} min={1} step={1} onChange={(value) => update("c89Step", value)} />
            <NumberField label="Hydraulic Split Start (D138)" value={settings.d138Start} min={1} step={1} onChange={(value) => update("d138Start", value)} />
            <NumberField label="D138 increment" value={settings.d138Step} min={1} step={1} onChange={(value) => update("d138Step", value)} />
            <NumberField label="D138 maximum / C89" value={settings.d138MaximumFraction} min={0.05} max={0.95} step={0.05} onChange={(value) => update("d138MaximumFraction", value)} />
            <NumberField label="Trailer X Minimum (E89)" value={settings.e89Minimum} unit="m" onChange={(value) => update("e89Minimum", value)} />
            <NumberField label="Trailer X Maximum (E89)" value={settings.e89Maximum} unit="m" onChange={(value) => update("e89Maximum", value)} />
            <NumberField label="E89 increment" value={settings.e89Step} unit="m" min={0.01} onChange={(value) => update("e89Step", value)} />
            <NumberField label="Boundary tolerance" value={settings.boundaryToleranceM} unit="m" min={0} onChange={(value) => update("boundaryToleranceM", value)} />
          </div>
          <div className="form-grid two">
            <SelectField label="E89 range mode" value={settings.e89RangeMode} onChange={(value) => update("e89RangeMode", value as typeof settings.e89RangeMode)}>
              <option value="AUTO_GROUP_CENTRES">Automatic group-centre geometry</option>
              <option value="MANUAL">Manual minimum / maximum</option>
            </SelectField>
            <SelectField label="After first verified pass" value={settings.afterFirstPass} onChange={(value) => update("afterFirstPass", value as typeof settings.afterFirstPass)}>
              <option value="CONTINUE_SCAN">Continue and rank all</option>
              <option value="STOP">Stop at first pass</option>
            </SelectField>
            <SelectField label="Optimiser strategy" value={settings.optimiserStrategy} onChange={(value) => update("optimiserStrategy", value as typeof settings.optimiserStrategy)}>
              <option value="STAGED_ADAPTIVE">Staged adaptive</option>
              <option value="EXHAUSTIVE">Exhaustive</option>
            </SelectField>
            <SelectField label="Calculation mode" value={settings.calculationMode} onChange={(value) => update("calculationMode", value as typeof settings.calculationMode)}>
              <option value="NATIVE_VERIFIED">Native verified</option>
              <option value="WORKBOOK_PARITY">Workbook-parity sequence</option>
            </SelectField>
          </div>
          <div className="toggle-grid">
            <Toggle checked={settings.overrideD138Limit} onChange={(value) => update("overrideD138Limit", value)} label="Override D138 fraction limit" detail="Allows the split through C89 − 1." />
            <Toggle checked={settings.stopAtFirstPass} onChange={(value) => update("stopAtFirstPass", value)} label="Legacy stop-at-first-pass switch" />
          </div>
          <p className="estimate-note">Configured upper estimate: <b>{estimatedCases.toLocaleString()}</b> coarse work units before automatic pruning and refinement.</p>
        </section>
        <section className="card run-status-card">
          <div className="run-status-head">
            <div><p className="eyebrow">Run status</p><h2>{run.state === "IDLE" ? "Ready" : humanStatus(run.state)}</h2></div>
            <StatusPill status={run.state} />
          </div>
          <ProgressBar value={run.progress.overallPercent} label="Overall run" detail={`${run.progress.overallCompleted} of ${run.progress.overallPlanned} planned units`} />
          <ProgressBar value={run.progress.phasePercent} label={humanStatus(run.progress.phase)} detail={run.progress.reference} />
          <div className="eta-grid">
            <span><small>Elapsed</small><b>{formatDuration(run.progress.elapsedMs)}</b></span>
            <span><small>Current phase ETA</small><b>{running ? formatDuration(run.progress.currentEtaMs) : run.state === "STOPPED" ? "Stopped" : "—"}</b></span>
            <span><small>Overall ETA</small><b>{running ? formatDuration(run.progress.overallEtaMs) : run.state === "FAILED" ? "Failed" : "—"}</b></span>
            <span><small>Valid passes</small><b>{run.passes.filter((pass) => pass.result.status === "PASS").length}</b></span>
          </div>
        </section>
      </div>
      <div className="two-column">
        <section className="card form-card">
          <SectionTitle eyebrow="Structural search" title="Deflection, pins &amp; support gate" />
          <div className="form-grid three">
            <SelectField label="Deflection check" value={settings.deflectionCheck} onChange={(value) => update("deflectionCheck", value as typeof settings.deflectionCheck)}>
              <option value="OFF">Optional / weighting only</option><option value="REQUIRED">Required pass check</option>
            </SelectField>
            <NumberField label="Deflection limit" value={settings.deflectionLimitMm} unit="mm" min={0.001} onChange={(value) => update("deflectionLimitMm", value)} />
            <NumberField label="Minimum active supports" value={settings.minimumActiveSupports} min={2} max={10} step={1} onChange={(value) => update("minimumActiveSupports", value)} />
            <SelectField label="Pin search mode" value={settings.pinSearchMode} onChange={(value) => update("pinSearchMode", value as typeof settings.pinSearchMode)}>
              <option value="OFF">Off</option><option value="FAST">Fast physics-guided</option><option value="THOROUGH">Thorough finalists</option>
            </SelectField>
            <NumberField label="Maximum pinned axle lines" value={settings.maximumPins} min={0} max={8} step={1} onChange={(value) => update("maximumPins", value)} />
            <NumberField label="Pin-case budget" value={settings.pinCaseBudget} min={1} step={1} onChange={(value) => update("pinCaseBudget", value)} />
            <NumberField label="THOROUGH finalists" value={settings.thoroughFinalistCount} min={1} step={1} onChange={(value) => update("thoroughFinalistCount", value)} />
            <NumberField label="Minimum deflection improvement" value={settings.minimumDeflectionImprovementMm} unit="mm" min={0} onChange={(value) => update("minimumDeflectionImprovementMm", value)} />
            <NumberField label="Comparison tolerance" value={settings.deflectionToleranceMm} unit="mm" min={0} onChange={(value) => update("deflectionToleranceMm", value)} />
            <SelectField label="Pin search stop rule" value={settings.pinStopRule} onChange={(value) => update("pinStopRule", value as typeof settings.pinStopRule)}>
              <option value="CONTINUE_IMPROVING">Continue improving</option>
              <option value="FIRST_IMPROVEMENT">Stop after first improvement</option>
            </SelectField>
            <SelectField label="Existing pins" value={settings.existingPinsPolicy} onChange={(value) => update("existingPinsPolicy", value as typeof settings.existingPinsPolicy)}>
              <option value="REARRANGE">Rearrange</option>
              <option value="KEEP">Keep existing</option>
            </SelectField>
            <SelectField label="Local target" value={settings.localStructuralTargetMode} onChange={(value) => update("localStructuralTargetMode", value as typeof settings.localStructuralTargetMode)}>
              <option value="AUTO_AT_DEFLECTION_PEAK">Automatic at deflection peak</option>
              <option value="MANUAL_X">Manual beam X</option>
            </SelectField>
            {settings.localStructuralTargetMode === "MANUAL_X" && (
              <NumberField label="Manual local target X" value={settings.manualLocalTargetXM ?? 0} unit="m" onChange={(value) => update("manualLocalTargetXM", value)} />
            )}
          </div>
          <div className="form-grid two">
            <TextField label="Maximum axle utilisation (AUTO or ratio)" value={String(settings.maximumAxleUtilisation)} onChange={(value) => {
              const parsed = Number(value);
              update("maximumAxleUtilisation", value.trim().toUpperCase() === "AUTO" || !Number.isFinite(parsed) ? "AUTO" : parsed);
            }} />
            <SelectField label="Fine E89 pin mode" value={settings.fineE89PinMode} onChange={(value) => update("fineE89PinMode", value as typeof settings.fineE89PinMode)}>
              <option value="KEEP_BETTER_PASS">Keep better pass pins</option>
              <option value="REOPTIMISE_EACH_CASE">Re-optimise each case</option>
            </SelectField>
          </div>
          <Toggle checked={settings.detailedWeighting} onChange={(value) => update("detailedWeighting", value)} label="Use detailed structural weighting" detail="Adds shear, bending, absolute deflection and local bending." />
          <SelectField label="F506 policy with detailed metrics" value={settings.f506Policy} onChange={(value) => update("f506Policy", value as typeof settings.f506Policy)}>
            <option value="KEEP">Keep spine utilisation weight</option>
            <option value="REPLACE">Replace with detailed structural metrics</option>
          </SelectField>
        </section>
        <section className="card form-card">
          <SectionTitle eyebrow="Pass rating" title="Weighting profile" description="Lower utilisation, structural values and axle count are better. Higher stability angles and dynamic/static ratio are better." />
          <SelectField label="Preset case" value={settings.weightPreset} onChange={(value) => {
            const preset = value as WeightPreset;
            update("weightPreset", preset);
            if (preset !== "CUSTOM") update("weights", weightsForPreset(preset, settings.weights, settings.detailedWeighting, settings.f506Policy));
          }}>
            {["BALANCED", "UTILISATION_PRIORITY", "STABILITY_PRIORITY", "STATIC_PRIORITY", "DYNAMIC_PRIORITY", "SPINE_BEAM_PRIORITY", "STRUCTURAL_BALANCED", "LOCAL_DEFLECTION_PRIORITY", "LOCAL_BENDING_PRIORITY", "CUSTOM"].map((value) => <option key={value}>{value}</option>)}
          </SelectField>
          <WeightEditor weights={settings.weights} onChange={(weights) => {
            update("weightPreset", "CUSTOM");
            update("weights", weights);
          }} />
          <p className="inline-note">A metric marked N/A is excluded from that pass’s denominator. Axle lines used has a default weight of 0.5 and is lower-is-better.</p>
        </section>
      </div>
      <section className="card form-card">
        <SectionTitle eyebrow="Fine E89" title="Refine between two ranked passes" description="Defaults to the best and second-best verified passes. Select explicit stable pass references when you want to control the interval." />
        <div className="form-grid three">
          <SelectField label="First pass reference (B28)" value={settings.fineFirstPassReference} onChange={(value) => update("fineFirstPassReference", value)}>
            <option value="">Automatic best</option>
            {settings.fineFirstPassReference && !ranked.some((pass) => pass.id === settings.fineFirstPassReference || pass.caseReference === settings.fineFirstPassReference) && <option value={settings.fineFirstPassReference}>{settings.fineFirstPassReference} (imported)</option>}
            {ranked.map((pass) => <option key={`fine-a-${pass.id}`} value={pass.id}>#{pass.overallRank} · {pass.id} · E89 {format(pass.e89, 3)}</option>)}
          </SelectField>
          <SelectField label="Second pass reference (B29)" value={settings.fineSecondPassReference} onChange={(value) => update("fineSecondPassReference", value)}>
            <option value="">Automatic second-best</option>
            {settings.fineSecondPassReference && !ranked.some((pass) => pass.id === settings.fineSecondPassReference || pass.caseReference === settings.fineSecondPassReference) && <option value={settings.fineSecondPassReference}>{settings.fineSecondPassReference} (imported)</option>}
            {ranked.map((pass) => <option key={`fine-b-${pass.id}`} value={pass.id}>#{pass.overallRank} · {pass.id} · E89 {format(pass.e89, 3)}</option>)}
          </SelectField>
          <NumberField label="Fine E89 step (B30)" value={settings.fineE89Step} unit="m" min={0.001} onChange={(value) => update("fineE89Step", value)} />
        </div>
      </section>
      <section className="card">
        <SectionTitle eyebrow="Ranked valid passes" title="Best configurations" description="Pass references remain stable and can be reapplied or selected for later fine-E89 work." />
        <div className="data-table-wrap">
          <table className="data-table ranked-table">
            <thead><tr><th>Rank</th><th>Pass ref</th><th>C89</th><th>D138</th><th>E89</th><th>Pins</th><th>Supports</th><th>Worst util.</th><th>Min angle</th><th>Deflection</th><th>Rating</th><th /></tr></thead>
            <tbody>
              {ranked.slice(0, 50).map((pass) => (
                <tr key={pass.id} className={pass.overallRank === 1 ? "best-row" : ""}>
                  <td><span className="rank-badge">{pass.overallRank}</span></td>
                  <td><b>{pass.id}</b><small>{pass.phase}</small></td>
                  <td>{pass.c89}</td><td>{pass.d138}</td><td>{format(pass.e89, 3)}</td>
                  <td>{pass.pinnedAxleLines.join(", ") || "—"}</td>
                  <td>{pass.result.activeSupportCount}</td>
                  <td>{format(Math.max(pass.result.metrics.basicUtil.value ?? 0, pass.result.metrics.slopeUtil.value ?? 0, pass.result.metrics.dynamicUtil.value ?? 0) * 100, 1)}%</td>
                  <td>{format(Math.min(pass.result.metrics.basicAngle.value ?? Infinity, pass.result.metrics.slopeAngle.value ?? Infinity, pass.result.metrics.dynamicAngle.value ?? Infinity), 1)}°</td>
                  <td>{format(pass.result.beam.absoluteDeflectionMm, 3)} mm</td>
                  <td><b>{format(pass.rating, 3)}</b></td>
                  <td><button className="button tiny" onClick={() => onApply(pass)}>Apply</button></td>
                </tr>
              ))}
              {!ranked.length && <tr><td colSpan={12} className="empty-cell">Run the optimiser to populate ranked verified passes.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      <section className="card">
        <SectionTitle eyebrow="Live activity" title="Latest optimiser events" />
        <div className="activity-list">
          {run.events.slice(0, 10).map((item) => (
            <article key={item.id} className={`activity-item level-${item.level.toLowerCase()}`}>
              <span>{item.stage}</span><div><strong>{item.message}</strong><p>{item.detail}</p></div><time>{item.caseReference || item.phase}</time>
            </article>
          ))}
          {!run.events.length && <div className="empty-row">No run activity yet.</div>}
        </div>
      </section>
    </div>
  );
}

function LogsTab({ run }: { run: OptimiserRun }) {
  return (
    <div className="page-stack">
      <SectionTitle
        eyebrow="Permanent run record"
        title="Cases &amp; activity"
        description="Every change and metric occupies its own CSV column. Errors are retained and the run continues whenever the next case is safe."
        action={
          <div className="button-row">
            <button className="button secondary" disabled={!run.passes.length} onClick={() => downloadText(exportPassesCsv(run.passes), `${run.runReference || "trailer-stability"}_cases_full.csv`, "text/csv;charset=utf-8")}>Export full cases CSV</button>
            <button className="button secondary" disabled={!run.passes.length} onClick={() => downloadText(exportAxlesCsv(run.passes), `${run.runReference || "trailer-stability"}_axles.csv`, "text/csv;charset=utf-8")}>Export axle details</button>
            <button className="button secondary" disabled={!run.passes.length} onClick={() => downloadText(exportBeamPointsCsv(run.passes), `${run.runReference || "trailer-stability"}_beam_points.csv`, "text/csv;charset=utf-8")}>Export beam mesh</button>
            <button className="button secondary" disabled={!run.events.length} onClick={() => downloadText(exportEventsCsv(run.events), `${run.runReference || "trailer-stability"}_activity.csv`, "text/csv;charset=utf-8")}>Export activity CSV</button>
          </div>
        }
      />
      <section className="card">
        <div className="log-summary">
          <span><small>Run reference</small><b>{run.runReference || "Not started"}</b></span>
          <span><small>Total cases</small><b>{run.passes.length}</b></span>
          <span><small>Verified passes</small><b>{run.passes.filter((pass) => pass.result.status === "PASS").length}</b></span>
          <span><small>Errors</small><b>{run.passes.filter((pass) => pass.result.status === "ERROR").length}</b></span>
          <span><small>Final duration</small><b>{formatDuration(run.progress.elapsedMs)}</b></span>
        </div>
      </section>
      <section className="card">
        <SectionTitle eyebrow="Case log" title="All evaluated configurations" />
        <div className="data-table-wrap tall">
          <table className="data-table">
            <thead><tr><th>#</th><th>Case</th><th>Phase</th><th>Result</th><th>C89</th><th>D138</th><th>E89</th><th>Pins</th><th>Supports</th><th>Basic UC</th><th>Slope UC</th><th>Dynamic UC</th><th>Basic angle</th><th>Dynamic angle</th><th>Deflection</th><th>Duration</th><th>Detail</th></tr></thead>
            <tbody>
              {run.passes.map((pass) => (
                <tr key={pass.id}>
                  <td>{pass.sequence}</td><td><b>{pass.caseReference}</b></td><td>{pass.phase}</td><td><StatusPill status={pass.result.status} /></td>
                  <td>{pass.c89}</td><td>{pass.d138}</td><td>{format(pass.e89, 3)}</td><td>{pass.pinnedAxleLines.join(",") || "—"}</td><td>{pass.result.activeSupportCount}</td>
                  <td>{format((pass.result.metrics.basicUtil.value ?? 0) * 100, 1)}%</td><td>{format((pass.result.metrics.slopeUtil.value ?? 0) * 100, 1)}%</td><td>{format((pass.result.metrics.dynamicUtil.value ?? 0) * 100, 1)}%</td>
                  <td>{format(pass.result.metrics.basicAngle.value, 2)}°</td><td>{format(pass.result.metrics.dynamicAngle.value, 2)}°</td><td>{format(pass.result.beam.absoluteDeflectionMm, 3)} mm</td>
                  <td>{format(pass.durationMs, 1)} ms</td><td className="detail-cell">{pass.result.failDetail || "Verified"}</td>
                </tr>
              ))}
              {!run.passes.length && <tr><td colSpan={17} className="empty-cell">No cases have been evaluated in an optimiser run.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      <section className="card">
        <SectionTitle eyebrow="Activity log" title="Every process event" />
        <div className="activity-list full">
          {run.events.map((item) => (
            <article key={item.id} className={`activity-item level-${item.level.toLowerCase()}`}>
              <span>{item.stage}</span><div><strong>{item.message}</strong><p>{item.detail}</p></div><time>{new Date(item.timestamp).toLocaleTimeString()} · {item.caseReference || item.phase}</time>
            </article>
          ))}
          {!run.events.length && <div className="empty-row">No activity has been recorded.</div>}
        </div>
      </section>
    </div>
  );
}

function CatalogueTab({
  model,
  setModel,
}: {
  model: ProjectModel;
  setModel: React.Dispatch<React.SetStateAction<ProjectModel>>;
}) {
  const [selectedId, setSelectedId] = useState(model.catalogue[0]?.id ?? "");
  const selected = model.catalogue.find((item) => item.id === selectedId) ?? model.catalogue[0];
  const errors = validateCatalogue(model.catalogue);
  const update = (patch: Partial<TrailerDefinition>) =>
    selected && setModel((current) => ({ ...current, catalogue: current.catalogue.map((item) => (item.id === selected.id ? { ...item, ...patch } : item)) }));
  const addCustom = () => {
    const source = model.catalogue[0];
    if (!source) return;
    const id = `custom-${Date.now()}`;
    setModel((current) => ({ ...current, catalogue: [...current.catalogue, { ...source, id, name: "Custom trailer", category: "Custom" }] }));
    setSelectedId(id);
  };
  return (
    <div className="page-stack">
      <SectionTitle
        eyebrow="Dynamic trailer data"
        title="Trailer catalogue"
        description="Selectors use this contiguous catalogue, not a fixed row range. New records become immediately available to every trailer selector."
        action={<button className="button primary" onClick={addCustom}>+ Custom trailer</button>}
      />
      {errors.length > 0 && <div className="validation-banner"><b>Catalogue preflight found {errors.length} issue(s).</b><span>{errors[0]}</span></div>}
      <div className="catalogue-layout">
        <section className="card catalogue-list">
          <div className="catalogue-search"><span>⌕</span><input placeholder="Search trailer models" onChange={(event) => {
            const value = event.target.value.toLowerCase();
            const first = model.catalogue.find((item) => item.name.toLowerCase().includes(value));
            if (first) setSelectedId(first.id);
          }} /></div>
          {["Standard", "Alternative", "Custom"].map((category) => {
            const items = model.catalogue.filter((item) => item.category.toLowerCase() === category.toLowerCase());
            if (!items.length) return null;
            return (
              <div className="catalogue-group" key={category}>
                <h3>{category}</h3>
                {items.map((item) => (
                  <button key={item.id} className={item.id === selected?.id ? "selected" : ""} onClick={() => setSelectedId(item.id)}>
                    <span>{item.name}</span><small>{item.axleCapacityT} t · {item.axleSpacingM} m</small>
                  </button>
                ))}
              </div>
            );
          })}
        </section>
        {selected && (
          <section className="card form-card catalogue-detail">
            <div className="catalogue-detail-head">
              <div><p className="eyebrow">{selected.category}</p><h2>{selected.name}</h2></div>
              {selected.category === "Custom" && <button className="button danger ghost" onClick={() => {
                setModel((current) => ({ ...current, catalogue: current.catalogue.filter((item) => item.id !== selected.id) }));
                setSelectedId(model.catalogue[0]?.id ?? "");
              }}>Delete</button>}
            </div>
            <div className="form-grid two">
              <TextField label="Trailer type / selector name" value={selected.name} onChange={(value) => update({ name: value })} />
              <TextField label="Category" value={selected.category} onChange={(value) => update({ category: value })} />
              {trailerPropertyColumns.map((column) => (
                <NumberField
                  key={column.key}
                  label={column.label}
                  unit={column.unit}
                  value={typeof selected[column.key] === "number" ? (selected[column.key] as number) : 0}
                  onChange={(value) => update({ [column.key]: value } as Partial<TrailerDefinition>)}
                />
              ))}
            </div>
            <details className="help-details" open>
              <summary>Catalogue preflight</summary>
              <p>Required: unique name, axle spacing, trailer width, axle capacity and second moment of area. Selected models absent from the catalogue are blocked during workbook import.</p>
            </details>
          </section>
        )}
      </div>
    </div>
  );
}

function VerificationTab({
  model,
  setModel,
  sourceBytes,
  setSourceBytes,
  showToast,
}: {
  model: ProjectModel;
  setModel: React.Dispatch<React.SetStateAction<ProjectModel>>;
  sourceBytes: ArrayBuffer | null;
  setSourceBytes: (bytes: ArrayBuffer | null) => void;
  showToast: (message: string, type?: "ok" | "error") => void;
}) {
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<string[]>([]);
  const importRef = useRef<HTMLInputElement>(null);
  const handleImport = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      const imported = await importWorkbook(file, model);
      setModel(imported.model);
      setSourceBytes(imported.sourceBytes);
      setMessages(imported.warnings);
      showToast(`${file.name} imported. ${imported.model.trailers.length} trailers and ${imported.model.catalogue.length} catalogue records loaded.`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), "error");
    } finally {
      setBusy(false);
      if (importRef.current) importRef.current.value = "";
    }
  };
  const exportWorkbook = async () => {
    setBusy(true);
    try {
      const bytes = await exportVerificationWorkbook(model, sourceBytes ?? undefined);
      downloadBytes(bytes, `Trailer_Stability_Verification_${new Date().toISOString().slice(0, 10)}.xlsm`, "application/vnd.ms-excel.sheet.macroEnabled.12");
      showToast("Verification XLSM exported with full calculation forced on open.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="page-stack">
      <SectionTitle eyebrow="Workbook bridge" title="Import, export &amp; parity verification" description="The browser engine is independent. XLSM files are only used to exchange inputs, trailer data and a recalculation-ready verification copy." />
      <div className="verification-grid">
        <section className="card verification-action">
          <span className="large-icon">⇧</span><div><h2>Import workbook inputs</h2><p>Reads the yellow input cells, selected trailers, hydraulic groups, supports, optimiser controls and the complete Database catalogue.</p></div>
          <input ref={importRef} type="file" accept=".xlsm,.xlsx" hidden onChange={(event) => handleImport(event.target.files?.[0])} />
          <button className="button primary" disabled={busy} onClick={() => importRef.current?.click()}>{busy ? "Working…" : "Choose XLSM"}</button>
        </section>
        <section className="card verification-action">
          <span className="large-icon">⇩</span><div><h2>Export verification workbook</h2><p>Writes shared C89, D138, E89 and pin masters, every load input, supports and the trailer catalogue into a macro-enabled copy.</p></div>
          <button className="button primary" disabled={busy} onClick={exportWorkbook}>{busy ? "Working…" : "Export recalculation XLSM"}</button>
        </section>
        <section className="card verification-action">
          <span className="large-icon">{`{}`}</span><div><h2>Portable project package</h2><p>JSON contains every standalone input and custom trailer record for phones, desktops and debug reproduction.</p></div>
          <div className="button-row">
            <button className="button secondary" onClick={() => downloadText(JSON.stringify(model, null, 2), "trailer-stability-project.json", "application/json")}>Export JSON</button>
            <label className="button secondary file-label">Import JSON<input type="file" accept=".json" onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              try {
                const project = JSON.parse(await file.text()) as ProjectModel;
                if (project.schemaVersion !== 1) throw new Error("Unsupported project schema.");
                setModel(hydrateProjectModel(project));
                setSourceBytes(null);
                showToast("Standalone project imported.");
              } catch (error) {
                showToast(error instanceof Error ? error.message : String(error), "error");
              }
            }} /></label>
          </div>
        </section>
      </div>
      <section className="card parity-card">
        <SectionTitle eyebrow="Parity chain" title="What is preserved" />
        <div className="parity-steps">
          <article className="complete"><span>1</span><div><b>Trailer catalogue</b><p>Dynamic table, PEKZ alternatives and required-property checks.</p></div></article>
          <article className="complete"><span>2</span><div><b>Shared input rules</b><p>C89, D138, E89 and G136:N136 are applied to every dependent row.</p></div></article>
          <article className="complete"><span>3</span><div><b>Recovered solver logic</b><p>Continuous-beam, support spreading and optimiser rules are native modules.</p></div></article>
          <article className="active"><span>4</span><div><b>Verification round trip</b><p>Open the exported XLSM to force Excel’s full calculation and compare its detailed outputs.</p></div></article>
        </div>
        {messages.length > 0 && <div className="import-messages"><b>Import notes</b>{messages.map((message, index) => <p key={index}>{message}</p>)}</div>}
        <div className="source-strip"><span>Current source</span><b>{model.sourceWorkbook}</b><em>{sourceBytes ? "Imported workbook retained for export" : "Bundled v0.7 verification template"}</em></div>
      </section>
    </div>
  );
}

export default function TrailerWorkbench() {
  const [model, setModel] = useState<ProjectModel>(() => createDefaultModel());
  const [activeTab, setActiveTab] = useState<Tab>("analysis");
  const [beamChannel, setBeamChannel] = useState<BeamChannel>("momentKNm");
  const [run, setRun] = useState<OptimiserRun>(() => createEmptyRun());
  const [sourceBytes, setSourceBytes] = useState<ArrayBuffer | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "ok" | "error" } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const calculation = useMemo(() => calculateProject(model), [model]);

  useEffect(() => {
    if ("serviceWorker" in navigator && window.isSecureContext) {
      navigator.serviceWorker.register(assetPath("/sw.js")).catch(() => {
        // Installation remains optional when a browser or host blocks workers.
      });
    }
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("trailer-stability-project-v1");
      if (stored) setModel(hydrateProjectModel(JSON.parse(stored)));
    } catch {
      // A corrupt local draft must never block the calculator.
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem("trailer-stability-project-v1", JSON.stringify(model));
      } catch {
        // Storage is optional (private browsing and embedded contexts can deny it).
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [model]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  const showToast = (message: string, type: "ok" | "error" = "ok") => setToast({ message, type });
  const startRun = async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setActiveTab("optimiser");
    const finished = await runOptimiser(model, {
      signal: controller.signal,
      onUpdate: (next) => setRun({ ...next, passes: [...next.passes], events: [...next.events] }),
    });
    setRun(finished);
    showToast(finished.state === "COMPLETE" ? "Optimiser run complete." : finished.state === "STOPPED" ? "Run stopped; completed cases retained." : "Optimiser run failed.", finished.state === "FAILED" ? "error" : "ok");
  };
  const stopRun = () => abortRef.current?.abort();
  const applyPass = (pass: PassResult) => {
    setModel((current) => passToProject(current, pass));
    setActiveTab("analysis");
    showToast(`${pass.id} applied and recalculated.`);
  };
  const reset = () => {
    if (!window.confirm("Reset the current standalone project to the bundled example?")) return;
    setModel(createDefaultModel());
    setRun(createEmptyRun());
    setSourceBytes(null);
  };
  const renderTab = () => {
    switch (activeTab) {
      case "setup":
        return <SetupTab model={model} setModel={setModel} result={calculation} />;
      case "optimiser":
        return <OptimiserTab model={model} setModel={setModel} run={run} onRun={startRun} onStop={stopRun} onApply={applyPass} />;
      case "logs":
        return <LogsTab run={run} />;
      case "catalogue":
        return <CatalogueTab model={model} setModel={setModel} />;
      case "verification":
        return <VerificationTab model={model} setModel={setModel} sourceBytes={sourceBytes} setSourceBytes={setSourceBytes} showToast={showToast} />;
      default:
        return <AnalysisTab model={model} result={calculation} beamChannel={beamChannel} setBeamChannel={setBeamChannel} onGoSetup={() => setActiveTab("setup")} />;
    }
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar${sidebarOpen ? " open" : ""}`}>
        <div className="brand">
          <div className="brand-mark"><span>TS</span><i /></div>
          <div><strong>Trailer Stability</strong><small>Native engineering suite</small></div>
          <button className="mobile-close" onClick={() => setSidebarOpen(false)}>×</button>
        </div>
        <nav>
          {navItems.map((item) => (
            <button key={item.id} className={activeTab === item.id ? "active" : ""} onClick={() => { setActiveTab(item.id); setSidebarOpen(false); }}>
              <span>{item.icon}</span><b>{item.label}</b>
              {item.id === "logs" && run.passes.length > 0 && <em>{run.passes.length}</em>}
            </button>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <div className="engine-card">
          <div><span className="pulse-dot" /><b>Native engine</b></div>
          <p>Inputs recalculate locally. No Excel process or network connection is required.</p>
          <small>Source logic: workbook v0.7</small>
        </div>
        <button className="sidebar-reset" onClick={reset}>↻ Reset example</button>
      </aside>
      {sidebarOpen && <button className="sidebar-scrim" onClick={() => setSidebarOpen(false)} aria-label="Close menu" />}
      <div className="main-shell">
        <header className="topbar">
          <button className="menu-button" onClick={() => setSidebarOpen(true)}>☰</button>
          <div className="project-title">
            <span>{model.cargo.name || "Untitled load"}</span>
            <small>{model.cargo.clientReference || "No client reference"} · {model.trailers.length} trailer{model.trailers.length === 1 ? "" : "s"}</small>
          </div>
          <div className="topbar-actions">
            <div className="save-state"><span>✓</span><div><b>Saved locally</b><small>{model.sourceWorkbook}</small></div></div>
            <StatusPill status={calculation.status} />
            <button className="button secondary compact" onClick={() => setActiveTab("verification")}>⇄ Import / export</button>
          </div>
        </header>
        <main>{renderTab()}</main>
        <nav className="mobile-nav">
          {navItems.slice(0, 5).map((item) => (
            <button key={item.id} className={activeTab === item.id ? "active" : ""} onClick={() => setActiveTab(item.id)}>
              <span>{item.icon}</span><small>{item.short}</small>
            </button>
          ))}
        </nav>
      </div>
      {toast && <div className={`toast ${toast.type}`}><span>{toast.type === "ok" ? "✓" : "!"}</span>{toast.message}</div>}
    </div>
  );
}
