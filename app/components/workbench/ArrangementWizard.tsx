"use client";

import {
  IconAlertTriangle,
  IconBox,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconEdit,
  IconLoader2,
  IconPlayerPlay,
  IconRoute,
  IconTargetArrow,
  IconTrash,
  IconTruck,
  IconX,
} from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  collectArrangementIssues,
  minimumTotalAxleLines,
  spacingCandidates,
  validAxleLineValues,
} from "../../engine/arrangement";
import type {
  ArrangementOptimiserSettings,
  CalculationResult,
  ProjectModel,
} from "../../engine/types";

const DRAFT_KEY = "trailer-stability-arrangement-wizard-v1";
type StepId = "case" | "trailer" | "formation" | "review";

const STEPS: Array<{ id: StepId; label: string; description: string; icon: ReactNode }> = [
  { id: "case", label: "Case inputs", description: "Cargo, packing and supports", icon: <IconBox size={17} /> },
  { id: "trailer", label: "Trailer stock", description: "Model and 4/5/6-AL modules", icon: <IconTruck size={17} /> },
  { id: "formation", label: "Formation limits", description: "Train count, clearance and width", icon: <IconRoute size={17} /> },
  { id: "review", label: "Review & run", description: "Lexicographic search preflight", icon: <IconCheck size={17} /> },
];

interface ArrangementWizardProps {
  activeModel: ProjectModel;
  result: CalculationResult;
  calculating: boolean;
  onEditCase(): void;
  onApply(settings: ArrangementOptimiserSettings, run: boolean): void;
  onClose(): void;
}

function NumberField({
  label,
  value,
  unit,
  min,
  max,
  step = "any",
  disabled,
  valid,
  hint,
  onChange,
}: {
  label: string;
  value: number;
  unit?: string;
  min?: number;
  max?: number;
  step?: number | "any";
  disabled?: boolean;
  valid?: boolean;
  hint?: string;
  onChange(value: number): void;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const number = Number(text);
  const inferred =
    text.trim() !== "" &&
    Number.isFinite(number) &&
    (min === undefined || number >= min) &&
    (max === undefined || number <= max);
  const isValid = valid ?? inferred;
  return (
    <label className={`wizard-field is-${isValid ? "valid" : "invalid"}`}>
      <span>{label}</span>
      <div className="wizard-input-unit">
        <input
          type="number"
          inputMode="decimal"
          value={text}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onChange={(event) => {
            setText(event.target.value);
            const next = Number(event.target.value);
            if (event.target.value.trim() && Number.isFinite(next)) onChange(next);
          }}
          onBlur={() => {
            if (!inferred) setText(String(value));
          }}
        />
        {unit && <em>{unit}</em>}
      </div>
      {hint && <small>{hint}</small>}
    </label>
  );
}

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="wizard-form-section">
      <header><b>{title}</b>{description && <span>{description}</span>}</header>
      {children}
    </section>
  );
}

function moduleText(modules4: number, modules5: number, modules6: number): string {
  return [
    modules6 ? `${modules6}×6` : "",
    modules5 ? `${modules5}×5` : "",
    modules4 ? `${modules4}×4` : "",
  ].filter(Boolean).join(" + ") || "—";
}

function issueStep(id: string): StepId {
  if (["cargo", "supports"].includes(id)) return "case";
  if (["catalogue-model", "module-sizes", "module-availability"].includes(id)) return "trailer";
  return "formation";
}

export function ArrangementWizard({
  activeModel,
  result,
  calculating,
  onEditCase,
  onApply,
  onClose,
}: ArrangementWizardProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [settings, setSettings] = useState<ArrangementOptimiserSettings>(() =>
    structuredClone(activeModel.arrangementOptimiser),
  );
  const [step, setStep] = useState<StepId>("case");
  const [initialised, setInitialised] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);

  const update = (patch: Partial<ArrangementOptimiserSettings>) =>
    setSettings((current) => ({ ...current, ...patch }));
  const issues = useMemo(
    () => collectArrangementIssues(activeModel, settings),
    [activeModel, settings],
  );
  const blocking = issues.filter((item) => item.severity === "blocking");
  const stepIssues = issues.filter((item) => issueStep(item.id) === step);
  const stepIndex = STEPS.findIndex((item) => item.id === step);
  const definition = activeModel.catalogue.find((item) => item.id === settings.trailerDefinitionId);
  const capacityLowerBound = useMemo(
    () => minimumTotalAxleLines(activeModel, settings),
    [activeModel, settings],
  );
  const planRows = useMemo(() => {
    if (!definition) return [];
    return Array.from(
      { length: Math.max(0, settings.maximumTrains - settings.minimumTrains + 1) },
      (_, offset) => settings.minimumTrains + offset,
    ).map((trainCount) => {
      const minimumPerTrain = Math.ceil(capacityLowerBound / trainCount);
      const values = validAxleLineValues(settings, trainCount, minimumPerTrain);
      const first = values[0];
      const pitches = spacingCandidates(definition, settings, trainCount);
      return {
        trainCount,
        first,
        pitches: pitches.length,
        searches: values.length * pitches.length,
      };
    });
  }, [capacityLowerBound, definition, settings]);
  const plannedSearches = planRows.reduce((sum, row) => sum + row.searches, 0);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(DRAFT_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as {
          settings?: Partial<ArrangementOptimiserSettings>;
          step?: StepId;
          updatedAt?: string;
        };
        if (parsed.settings) {
          setSettings({ ...activeModel.arrangementOptimiser, ...parsed.settings });
        }
        if (STEPS.some((item) => item.id === parsed.step)) setStep(parsed.step!);
        if (parsed.updatedAt) setDraftSavedAt(parsed.updatedAt);
      }
    } catch {
      setNotice("The unfinished arrangement draft could not be read. Current settings were loaded.");
    } finally {
      setInitialised(true);
    }
  }, [activeModel.arrangementOptimiser]);

  useEffect(() => {
    if (!initialised) return;
    const timer = window.setTimeout(() => {
      try {
        const updatedAt = new Date().toISOString();
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ version: 1, step, settings, updatedAt }));
        setDraftSavedAt(updatedAt);
      } catch {
        setNotice("This browser could not autosave the arrangement draft.");
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [initialised, settings, step]);

  const canContinue = stepIssues.every((item) => item.severity !== "blocking");
  const canRun = blocking.length === 0 && plannedSearches > 0 && !calculating;
  const currentStep = STEPS[stepIndex];

  const renderCase = () => (
    <>
      <FormSection
        title="Authoritative load definition"
        description="The automatic arrangement uses the current cargo, packing, support and route inputs without replacing them."
      >
        <dl className="arrangement-case-summary">
          <div><dt>Cargo</dt><dd><b>{activeModel.cargo.name || "Untitled"}</b><span>{activeModel.cargo.massT.toFixed(2)} t</span></dd></div>
          <div><dt>Envelope</dt><dd><b>{activeModel.cargo.lengthM.toFixed(3)} × {activeModel.cargo.widthM.toFixed(3)} × {activeModel.cargo.heightM.toFixed(3)} m</b><span>COG {activeModel.cargo.cog.x.toFixed(3)}, {activeModel.cargo.cog.y.toFixed(3)}, {activeModel.cargo.cog.z.toFixed(3)}</span></dd></div>
          <div><dt>Packing</dt><dd><b>{activeModel.packing.massT.toFixed(2)} t · {activeModel.packing.heightM.toFixed(3)} m high</b><span>{activeModel.loosePacking.length} loose-packing row{activeModel.loosePacking.length === 1 ? "" : "s"}</span></dd></div>
          <div><dt>Supports</dt><dd><b>{activeModel.supports.filter((item) => item.allowed).length} allowed</b><span>Minimum {activeModel.optimiser.minimumActiveSupports} active after settling</span></dd></div>
        </dl>
        <button type="button" className="arrangement-edit-case" onClick={onEditCase}>
          <IconEdit size={15} /> Edit cargo, packing and supports
        </button>
      </FormSection>
      <FormSection title="Current engineering snapshot">
        <div className="arrangement-metric-strip">
          <span><small>All-inclusive mass</small><b>{result.totalMassT.toFixed(2)} t</b></span>
          <span><small>Load COG</small><b>{result.loadCog.x.toFixed(2)}, {result.loadCog.y.toFixed(2)}</b></span>
          <span><small>Current supports</small><b>{result.activeSupportCount}</b></span>
          <span><small>Current status</small><b className={result.status === "PASS" ? "ok" : "nok"}>{result.status.replaceAll("_", " ")}</b></span>
        </div>
      </FormSection>
    </>
  );

  const renderTrailer = () => (
    <>
      <FormSection
        title="Trailer family"
        description="Every automatically generated parallel train uses this same catalogue model."
      >
        <label className={`wizard-field is-${definition ? "valid" : "invalid"}`}>
          <span>SPMT trailer model</span>
          <select value={settings.trailerDefinitionId} onChange={(event) => update({ trailerDefinitionId: event.target.value })}>
            <option value="">Select trailer…</option>
            {activeModel.catalogue.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.category}</option>)}
          </select>
          {definition && <small>{definition.axleCapacityT.toFixed(1)} t/AL capacity · {definition.trailerWidthM.toFixed(3)} m wide · {definition.axleSpacingM.toFixed(3)} m pitch</small>}
        </label>
      </FormSection>
      <FormSection
        title="Available module sizes"
        description="A per-train axle-line value is considered only when it can be made exactly from enabled 4-, 5- and 6-AL modules."
      >
        <div className="arrangement-module-grid">
          {([4, 5, 6] as const).map((size) => {
            const allowedKey = `allow${size}AxleModules` as const;
            const availabilityKey = `available${size}AxleModules` as const;
            const allowed = settings[allowedKey];
            return (
              <div key={size} className={allowed ? "selected" : ""}>
                <label>
                  <input type="checkbox" checked={allowed} onChange={(event) => update({ [allowedKey]: event.target.checked })} />
                  <span><b>{size} AL</b><small>SPMT module</small></span>
                </label>
                <NumberField
                  label="Available"
                  value={settings[availabilityKey]}
                  min={0}
                  step={1}
                  disabled={!settings.limitModuleAvailability || !allowed}
                  valid={!settings.limitModuleAvailability || (Number.isInteger(settings[availabilityKey]) && settings[availabilityKey] >= 0)}
                  onChange={(value) => update({ [availabilityKey]: Math.round(value) })}
                />
              </div>
            );
          })}
        </div>
        <label className="wizard-toggle arrangement-stock-toggle">
          <input type="checkbox" checked={settings.limitModuleAvailability} onChange={(event) => update({ limitModuleAvailability: event.target.checked })} />
          <span><b>Limit by available stock</b><small>When off, enabled module sizes are treated as unlimited.</small></span>
        </label>
      </FormSection>
      <FormSection title="Power-pack arrangement">
        <label className="wizard-field is-valid">
          <span>PPU position on every train</span>
          <select value={settings.ppuPosition} onChange={(event) => update({ ppuPosition: event.target.value as ArrangementOptimiserSettings["ppuPosition"] })}>
            <option value="NONE">No PPU included</option>
            <option value="REAR">Rear end · left side in plan</option>
            <option value="FRONT">Front end · right side in plan</option>
          </select>
        </label>
      </FormSection>
    </>
  );

  const renderFormation = () => (
    <>
      <FormSection
        title="Economic search bounds"
        description="The optimiser stops at the first train-count and axle-count level that can produce a complete engineering PASS."
      >
        <div className="wizard-field-grid two">
          <NumberField label="Minimum trains" value={settings.minimumTrains} min={1} max={12} step={1} valid={Number.isInteger(settings.minimumTrains) && settings.minimumTrains >= 1 && settings.minimumTrains <= settings.maximumTrains} onChange={(value) => update({ minimumTrains: Math.round(value) })} />
          <NumberField label="Maximum trains" value={settings.maximumTrains} min={1} max={12} step={1} valid={Number.isInteger(settings.maximumTrains) && settings.maximumTrains >= settings.minimumTrains && settings.maximumTrains <= 12} onChange={(value) => update({ maximumTrains: Math.round(value) })} />
          <NumberField label="Maximum AL per train" value={settings.maximumAxleLinesPerTrain} min={4} max={99} step={1} valid={Number.isInteger(settings.maximumAxleLinesPerTrain) && settings.maximumAxleLinesPerTrain >= 4} onChange={(value) => update({ maximumAxleLinesPerTrain: Math.round(value) })} />
          <NumberField label="Equal-spacing samples" value={settings.spacingSamples} min={2} max={7} step={1} valid={Number.isInteger(settings.spacingSamples) && settings.spacingSamples >= 2 && settings.spacingSamples <= 7} onChange={(value) => update({ spacingSamples: Math.round(value) })} />
        </div>
      </FormSection>
      <FormSection
        title="Physical formation envelope"
        description="Actual catalogue widths are used. Touching is allowed only when clearance is set to zero; positive overlap is always rejected."
      >
        <div className="wizard-field-grid three">
          <NumberField label="Preferred centre spacing" value={settings.preferredCentreSpacingM} unit="m" min={0.1} step={0.1} valid={settings.preferredCentreSpacingM > 0} onChange={(preferredCentreSpacingM) => update({ preferredCentreSpacingM })} />
          <NumberField label="Minimum train clearance" value={settings.minimumClearanceM} unit="m" min={0} step={0.01} onChange={(minimumClearanceM) => update({ minimumClearanceM })} />
          <NumberField label="Maximum overall width" value={settings.maximumFormationWidthM} unit="m" min={0.1} step={0.1} onChange={(maximumFormationWidthM) => update({ maximumFormationWidthM })} />
          <NumberField label="Fine spacing tolerance" value={settings.spacingToleranceM} unit="m" min={0.001} step={0.01} onChange={(spacingToleranceM) => update({ spacingToleranceM })} />
        </div>
      </FormSection>
      <FormSection title="Search rules">
        <ol className="arrangement-rule-list">
          <li><b>1</b><span>Try train counts from {settings.minimumTrains} upward.</span></li>
          <li><b>2</b><span>For each count, try only constructible AL totals in ascending order.</span></li>
          <li><b>3</b><span>Place identical trains at equal offsets from the all-inclusive COG.</span></li>
          <li><b>4</b><span>Run exact split, X-position, support and pin logic for every retained case.</span></li>
        </ol>
      </FormSection>
    </>
  );

  const renderReview = () => (
    <>
      <FormSection title="Automatic arrangement preflight">
        {blocking.length ? (
          <div className="wizard-issue-list">
            {blocking.map((issue) => <div key={issue.id} className="blocking"><IconX size={14} /><span><b>{issue.title}</b><small>{issue.detail}</small></span></div>)}
          </div>
        ) : (
          <div className="arrangement-ready"><IconCheck size={18} /><span><b>Ready to find the minimum arrangement</b><small>Every recorded candidate will use the complete calculation and iterative support-settling process.</small></span></div>
        )}
      </FormSection>
      <FormSection title="Objective order" description="These priorities are hard ordered and cannot be reversed by pass weighting.">
        <div className="arrangement-objectives">
          <span><i>1</i><b>Engineering PASS</b><small>All active limits and support rules</small></span>
          <span><i>2</i><b>Minimum trains</b><small>First feasible train-count level</small></span>
          <span><i>3</i><b>Minimum total AL</b><small>First constructible axle-count level</small></span>
          <span><i>4</i><b>Preferred centre spacing</b><small>Closest valid pitch to {settings.preferredCentreSpacingM.toFixed(2)} m</small></span>
          <span><i>5</i><b>Best pass rating</b><small>Current engineering weighting</small></span>
        </div>
      </FormSection>
    </>
  );

  const form = step === "case" ? renderCase() : step === "trailer" ? renderTrailer() : step === "formation" ? renderFormation() : renderReview();

  const discard = () => {
    if (!window.confirm("Discard this automatic-arrangement draft?")) return;
    localStorage.removeItem(DRAFT_KEY);
    onClose();
  };
  const apply = (run: boolean) => {
    if (run && !canRun) return;
    localStorage.removeItem(DRAFT_KEY);
    onApply(structuredClone(settings), run);
  };

  return (
    <dialog ref={dialogRef} className="setup-wizard-dialog arrangement-wizard-dialog" aria-labelledby="arrangement-wizard-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <div className="setup-wizard-shell optimiser-wizard-shell arrangement-wizard-shell">
        <header className="setup-wizard-header">
          <div><span>AUTOMATIC TRAILER ARRANGEMENT</span><h2 id="arrangement-wizard-title">{currentStep.label}</h2></div>
          <div className="setup-wizard-mobile-progress"><span>{stepIndex + 1} / {STEPS.length} · {currentStep.label}</span><div><i style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }} /></div></div>
          <button type="button" className="icon-button" aria-label="Save draft and close" onClick={onClose}><IconX size={16} /></button>
        </header>
        <nav className="setup-wizard-rail" aria-label="Arrangement setup steps">
          <div className="setup-wizard-rail-title"><span>ARRANGEMENT</span><b>Find minimum SPMT formation</b></div>
          <ol>
            {STEPS.map((item, index) => {
              const active = item.id === step;
              const complete = index < stepIndex;
              return <li key={item.id}><button type="button" className={`${active ? "active" : ""}${complete ? " complete" : ""}`} onClick={() => setStep(item.id)}><i>{complete ? <IconCheck size={13} /> : item.icon}</i><span><b>{item.label}</b><small>{item.description}</small></span></button></li>;
            })}
          </ol>
          <div className="setup-wizard-rail-footer"><span><i className="ok" /> Existing engineering engine</span><span>{draftSavedAt ? `Draft saved ${new Date(draftSavedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Draft autosave pending"}</span></div>
        </nav>
        <section className="setup-wizard-form-pane" aria-label={`${currentStep.label} inputs`}>
          <div className="setup-wizard-form-heading"><span>STEP {stepIndex + 1} / {STEPS.length}</span><h2>{currentStep.label}</h2><p>{currentStep.description}</p></div>
          {notice && <div className="wizard-notice"><IconAlertTriangle size={15} /><span>{notice}</span><button type="button" className="icon-button" onClick={() => setNotice(null)}><IconX size={13} /></button></div>}
          {form}
          {step !== "review" && stepIssues.length > 0 && <FormSection title="Step preflight"><div className="wizard-issue-list">{stepIssues.map((issue) => <div key={issue.id} className={issue.severity}><IconAlertTriangle size={14} /><span><b>{issue.title}</b><small>{issue.detail}</small></span></div>)}</div></FormSection>}
        </section>
        <section className="setup-wizard-preview arrangement-wizard-preview" aria-label="Automatic arrangement plan">
          <div className="setup-wizard-preview-status"><div><span>LIVE ARRANGEMENT PLAN</span><b>{activeModel.cargo.name || "Untitled case"}</b></div><div className={calculating ? "working" : "ready"}>{calculating && <IconLoader2 size={14} />}<span>{calculating ? "Current case updating" : "Authoritative inputs ready"}</span></div></div>
          <div className="arrangement-preview-hero"><span>OPTIMISTIC CAPACITY START</span><b>{capacityLowerBound} <small>total AL</small></b><p>The exact search starts at the next module-constructible value for each train count.</p></div>
          <div className="arrangement-plan-table">
            <header><b>First constructible candidates</b><span>{plannedSearches.toLocaleString()} upper formation searches</span></header>
            {planRows.map((row) => <div key={row.trainCount}><span><b>{row.trainCount}</b><small>train{row.trainCount === 1 ? "" : "s"}</small></span><span><b>{row.first?.axleLines ?? "—"} AL/train</b><small>{row.first ? moduleText(row.first.composition.modules4, row.first.composition.modules5, row.first.composition.modules6) : "No stock combination"}</small></span><span><b>{row.first ? row.first.axleLines * row.trainCount : "—"} total AL</b><small>{row.pitches} equal-spacing sample{row.pitches === 1 ? "" : "s"}</small></span></div>)}
          </div>
          <div className="arrangement-preview-facts"><span><small>Selected trailer</small><b>{definition?.name ?? "Not selected"}</b></span><span><small>Preferred spacing</small><b>{settings.preferredCentreSpacingM.toFixed(2)} m centres</b></span><span><small>Maximum width</small><b>{settings.maximumFormationWidthM.toFixed(2)} m</b></span><span><small>Allowed modules</small><b>{[settings.allow4AxleModules && "4", settings.allow5AxleModules && "5", settings.allow6AxleModules && "6"].filter(Boolean).join(" / ") || "None"} AL</b></span><span><small>Centre reference</small><b>All-inclusive COG</b></span></div>
          <div className="setup-wizard-preview-findings">{blocking.length ? <span className="blocking"><IconX size={13} /> {blocking.length} blocking</span> : <span className="valid"><IconCheck size={13} /> Search valid</span>}</div>
        </section>
        <footer className="setup-wizard-footer">
          <div className="setup-wizard-footer-secondary"><button type="button" className="wizard-discard" onClick={discard}><IconTrash size={14} /> Discard</button><button type="button" onClick={() => { setSettings(structuredClone(activeModel.arrangementOptimiser)); setStep("case"); }}><IconTargetArrow size={14} /> Reset current</button><button type="button" disabled={blocking.length > 0} onClick={() => apply(false)}>Save settings & close</button></div>
          <div className="setup-wizard-footer-primary">{stepIndex > 0 && <button type="button" onClick={() => setStep(STEPS[stepIndex - 1].id)}><IconChevronLeft size={15} /> Back</button>}{step !== "review" ? <button type="button" className="wizard-primary" disabled={!canContinue} onClick={() => setStep(STEPS[Math.min(STEPS.length - 1, stepIndex + 1)].id)}>Next <IconChevronRight size={15} /></button> : <button type="button" className="wizard-primary optimiser-start-action" disabled={!canRun} onClick={() => apply(true)}><IconPlayerPlay size={15} /> Find minimum arrangement</button>}</div>
        </footer>
      </div>
    </dialog>
  );
}
