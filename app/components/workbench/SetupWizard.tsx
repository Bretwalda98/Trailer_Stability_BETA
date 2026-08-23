"use client";

import {
  IconAlertTriangle,
  IconArrowsMaximize,
  IconArrowsMinimize,
  IconBox,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconFileImport,
  IconLayersSubtract,
  IconLoader2,
  IconPlus,
  IconRefresh,
  IconRuler2,
  IconSettings,
  IconTargetArrow,
  IconTrash,
  IconTruck,
  IconX,
} from "@tabler/icons-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createDefaultModel, hydrateProjectModel } from "../../data/default-model";
import {
  applyAutomaticCargoCogEnvelopeInputs,
  derivedCargoCogEnvelopeInputs,
} from "../../engine/cargo-envelope";
import {
  applySharedAxleLines,
  applySharedPins,
  applySharedSplit,
} from "../../engine/core";
import {
  applySharedLongitudinalPlacement,
  applyTrailerTransversePlacement,
  autoSpaceTrailers,
  canFinishSetup,
  collectSetupIssues,
  createBlankSetupModel,
  createWizardDraftPayload,
  hydrateWizardDraftPayload,
  issuesForStep,
  resolvedTrailerPosition,
  SETUP_STEPS,
  setSharedPlacementReference,
  stepCanContinue,
  WIZARD_DRAFT_STORAGE_KEY,
  type SetupIssue,
  type SetupSourceType,
  type SetupStepId,
} from "../../engine/setup";
import type {
  CargoSupport,
  HydraulicGrouping,
  PackingInput,
  PlacementReference,
  ProjectModel,
  TrailerInput,
} from "../../engine/types";
import { ROAD_SURFACES } from "../../engine/road-transport";
import { applyAutomaticCargoWindInputs, derivedCargoWindInputs } from "../../engine/wind";
import { buildGeometryViewModel } from "../../geometry/buildGeometryViewModel";
import { useEngineeringEngine } from "../../hooks/useEngineeringEngine";
import { EngineeringViewport } from "./EngineeringViewport";
import {
  DEFAULT_COG_VISIBILITY,
  DEFAULT_LAYERS,
  type ViewId,
  type ViewPreferences,
} from "./types";

type CornerKey = keyof NonNullable<HydraulicGrouping["cornerGroups"]>;

interface SetupWizardProps {
  activeModel: ProjectModel;
  initialSourceType?: Extract<SetupSourceType, "CURRENT" | "BLANK">;
  onApply(model: ProjectModel, runOptimisation: boolean): void;
  onClose(): void;
}

const STEP_ICONS: Record<SetupStepId, ReactNode> = {
  case: <IconSettings size={17} />,
  cargo: <IconBox size={17} />,
  packing: <IconLayersSubtract size={17} />,
  trailers: <IconTruck size={17} />,
  hydraulics: <IconRuler2 size={17} />,
  supports: <IconRefresh size={17} />,
  review: <IconCheck size={17} />,
};

const STEP_VIEWS: Record<SetupStepId, ViewId> = {
  case: "plan",
  cargo: "end",
  packing: "side",
  trailers: "plan",
  hydraulics: "hydraulics",
  supports: "side",
  review: "plan",
};

const AVAILABLE_VIEWS: ViewId[] = ["plan", "end", "side", "hydraulics"];

function cloneModel(model: ProjectModel): ProjectModel {
  return structuredClone(model);
}

function uniqueId(prefix: string): string {
  const suffix = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function NumberField({
  label,
  value,
  unit,
  step = "any",
  min,
  max,
  hint,
  disabled,
  highlight,
  validation,
  onChange,
}: {
  label: string;
  value: number;
  unit?: string;
  step?: number | "any";
  min?: number;
  max?: number;
  hint?: string;
  disabled?: boolean;
  highlight?(): void;
  /** Green means the value is acceptable; amber needs correction. */
  validation?: "valid" | "invalid" | "neutral";
  onChange(value: number): void;
}) {
  const [text, setText] = useState(() => String(value));
  useEffect(() => setText(String(value)), [value]);
  const parsed = Number(text);
  const inferredValidation =
    !text.trim() || !Number.isFinite(parsed) || (min !== undefined && parsed < min) || (max !== undefined && parsed > max)
      ? "invalid"
      : "valid";
  const fieldValidation = disabled ? validation ?? "valid" : validation ?? inferredValidation;
  return (
    <label className={`wizard-field ${fieldValidation === "neutral" ? "" : `is-${fieldValidation}`}`} onFocus={highlight} onClick={highlight}>
      <span>{label}</span>
      <div className="wizard-input-unit">
        <input
          type="number"
          inputMode="decimal"
          value={text}
          step={step}
          min={min}
          max={max}
          disabled={disabled}
          onChange={(event) => {
            const next = event.target.value;
            setText(next);
            if (!next.trim()) return;
            const parsed = Number(next);
            if (Number.isFinite(parsed)) onChange(parsed);
          }}
          onBlur={() => {
            if (!text.trim() || !Number.isFinite(Number(text))) setText(String(value));
          }}
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
  hint,
  placeholder,
  highlight,
  onChange,
}: {
  label: string;
  value: string;
  hint?: string;
  placeholder?: string;
  highlight?(): void;
  onChange(value: string): void;
}) {
  return (
    <label className="wizard-field" onFocus={highlight} onClick={highlight}>
      <span>{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint && <small>{hint}</small>}
    </label>
  );
}

function SelectField({
  label,
  value,
  hint,
  highlight,
  children,
  onChange,
}: {
  label: string;
  value: string | number;
  hint?: string;
  highlight?(): void;
  children: ReactNode;
  onChange(value: string): void;
}) {
  return (
    <label className="wizard-field" onFocus={highlight} onClick={highlight}>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
      {hint && <small>{hint}</small>}
    </label>
  );
}

function ToggleField({
  label,
  checked,
  hint,
  onChange,
}: {
  label: string;
  checked: boolean;
  hint?: string;
  onChange(value: boolean): void;
}) {
  return (
    <label className="wizard-toggle">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>
        <b>{label}</b>
        {hint && <small>{hint}</small>}
      </span>
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
      <header>
        <h3>{title}</h3>
        {description && <p>{description}</p>}
      </header>
      {children}
    </section>
  );
}

function IssueList({
  issues,
  compact = false,
  onSelect,
}: {
  issues: SetupIssue[];
  compact?: boolean;
  onSelect?(issue: SetupIssue): void;
}) {
  if (!issues.length) {
    return (
      <div className="wizard-valid-note">
        <IconCheck size={15} /> No preflight findings in this section.
      </div>
    );
  }
  return (
    <div className={`wizard-issue-list${compact ? " compact" : ""}`}>
      {issues.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`wizard-issue ${item.severity}`}
          onClick={() => onSelect?.(item)}
        >
          {item.severity === "blocking" ? <IconX size={14} /> : <IconAlertTriangle size={14} />}
          <span>
            <b>{item.title}</b>
            {!compact && <small>{item.detail}</small>}
          </span>
        </button>
      ))}
    </div>
  );
}

function metric(
  value: number | null,
  unit: string,
  multiplier = 1,
  digits = 1,
): string {
  return value === null || !Number.isFinite(value)
    ? "—"
    : `${(value * multiplier).toFixed(digits)}${unit}`;
}

function createTrailer(model: ProjectModel): { trailer: TrailerInput; grouping: HydraulicGrouping } {
  const sourceTrailer = model.trailers[0] ?? createDefaultModel().trailers[0];
  const sourceGrouping = model.groupings[0] ?? createDefaultModel().groupings[0];
  return {
    trailer: {
      ...structuredClone(sourceTrailer),
      id: uniqueId("trailer"),
      ppuLeft: false,
      ppuRight: false,
      enabled: true,
    },
    grouping: structuredClone(sourceGrouping),
  };
}

export function SetupWizard({
  activeModel,
  initialSourceType,
  onApply,
  onClose,
}: SetupWizardProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const [draftModel, setDraftModel] = useState<ProjectModel>(() =>
    initialSourceType === "BLANK" ? createBlankSetupModel() : cloneModel(activeModel),
  );
  const [sourceType, setSourceType] = useState<SetupSourceType>(
    initialSourceType ?? "CURRENT",
  );
  const [step, setStep] = useState<SetupStepId>("case");
  const [view, setView] = useState<ViewId>("plan");
  const [selectedId, setSelectedId] = useState("project-case");
  const [selectedTrailerIndex, setSelectedTrailerIndex] = useState(0);
  const [pinEntry, setPinEntry] = useState(1);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [initialised, setInitialised] = useState(false);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [preferences, setPreferences] = useState<ViewPreferences>({
    layers: { ...DEFAULT_LAYERS },
    visibleCogs: { ...DEFAULT_COG_VISIBILITY, packing: true },
    dimensions: true,
    legend: true,
    grid: true,
    loadCase: "dynamic",
  });

  const engine = useEngineeringEngine(draftModel);
  const previewModel = engine.authoritativeModel;
  const calculationCurrent = previewModel === draftModel && !engine.calculating;
  const vm = useMemo(
    () => buildGeometryViewModel(previewModel, engine.result, preferences.loadCase),
    [engine.result, preferences.loadCase, previewModel],
  );
  const issues = useMemo(
    () => collectSetupIssues(draftModel, engine.result),
    [draftModel, engine.result],
  );
  const stepIssues = issuesForStep(issues, step);
  const stepIndex = SETUP_STEPS.findIndex((item) => item.id === step);
  const blockingCount = issues.filter((item) => item.severity === "blocking").length;
  const warningCount = issues.filter((item) => item.severity === "warning").length;
  const setupValidEngineeringNok =
    blockingCount === 0 && engine.result.status === "GEOMETRY_FAIL";
  const hasPreviewGeometry =
    draftModel.cargo.lengthM > 0 &&
    draftModel.cargo.widthM > 0 &&
    draftModel.cargo.heightM > 0 &&
    draftModel.trailers.length > 0;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  useEffect(() => {
    if (initialSourceType === "BLANK") {
      setInitialised(true);
      return;
    }
    try {
      const stored = localStorage.getItem(WIZARD_DRAFT_STORAGE_KEY);
      const hydrated = stored ? hydrateWizardDraftPayload(JSON.parse(stored)) : null;
      if (hydrated) {
        setDraftModel(hydrated.model);
        setSourceType(hydrated.sourceType);
        setStep(hydrated.step);
        setView(STEP_VIEWS[hydrated.step]);
        setDraftSavedAt(hydrated.updatedAt);
      }
    } catch {
      setNotice("The unfinished setup draft could not be read. Current case values were loaded.");
    } finally {
      setInitialised(true);
    }
  }, [initialSourceType]);

  useEffect(() => {
    if (!initialised) return;
    const timer = window.setTimeout(() => {
      try {
        const payload = createWizardDraftPayload(step, draftModel, sourceType);
        localStorage.setItem(WIZARD_DRAFT_STORAGE_KEY, JSON.stringify(payload));
        setDraftSavedAt(payload.updatedAt);
      } catch {
        setNotice("This browser could not autosave the setup draft.");
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [draftModel, initialised, sourceType, step]);

  useEffect(() => {
    setView(STEP_VIEWS[step]);
    const firstEntity: Partial<Record<SetupStepId, string>> = {
      cargo: "cargo",
      packing: "packing",
      trailers: draftModel.trailers[0] ? `trailer:${draftModel.trailers[0].id}` : "project-case",
      hydraulics: "stability-boundary",
      supports: draftModel.supports[0] ? `support:${draftModel.supports[0].id}` : "project-case",
      review: "project-case",
    };
    setSelectedId(firstEntity[step] ?? "project-case");
  }, [step]);

  useEffect(() => {
    setSelectedTrailerIndex((current) => Math.min(current, Math.max(0, draftModel.trailers.length - 1)));
  }, [draftModel.trailers.length]);

  const saveDraftNow = () => {
    const payload = createWizardDraftPayload(step, draftModel, sourceType);
    localStorage.setItem(WIZARD_DRAFT_STORAGE_KEY, JSON.stringify(payload));
    setDraftSavedAt(payload.updatedAt);
  };

  const saveAndClose = () => {
    try {
      saveDraftNow();
    } catch {
      // The model remains in this mounted session even if local persistence is unavailable.
    }
    onClose();
  };

  const discard = () => {
    if (!window.confirm("Discard this setup draft and keep the active case unchanged?")) return;
    localStorage.removeItem(WIZARD_DRAFT_STORAGE_KEY);
    onClose();
  };

  const finish = (runOptimisation: boolean) => {
    if (!calculationCurrent || engine.error || !canFinishSetup(issues)) return;
    localStorage.removeItem(WIZARD_DRAFT_STORAGE_KEY);
    onApply(hydrateProjectModel(draftModel), runOptimisation);
  };

  const changeStep = (next: SetupStepId) => {
    setStep(next);
    setNotice(null);
  };

  const next = () => {
    if (!calculationCurrent || !stepCanContinue(issues, step)) {
      setNotice("Resolve the blocking checks in this step before continuing.");
      return;
    }
    const nextStep = SETUP_STEPS[Math.min(SETUP_STEPS.length - 1, stepIndex + 1)];
    changeStep(nextStep.id);
  };

  const previous = () => {
    const previousStep = SETUP_STEPS[Math.max(0, stepIndex - 1)];
    changeStep(previousStep.id);
  };

  const selectSource = (next: "CURRENT" | "BLANK") => {
    if (next === "CURRENT") {
      setDraftModel(cloneModel(activeModel));
      setSourceType("CURRENT");
    } else {
      setDraftModel(createBlankSetupModel());
      setSourceType("BLANK");
    }
    setSelectedTrailerIndex(0);
    setNotice(null);
  };

  const importJson = async (file: File) => {
    setBusy(true);
    try {
      setDraftModel(hydrateProjectModel(JSON.parse(await file.text())));
      setSourceType("JSON");
      setNotice(`${file.name} imported as a version-2 standalone project.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const updateCargo = (patch: Partial<ProjectModel["cargo"]>) =>
    setDraftModel((current) => ({
      ...current,
      cargo: applyAutomaticCargoWindInputs(
        applyAutomaticCargoCogEnvelopeInputs({ ...current.cargo, ...patch }),
      ),
    }));
  const updatePacking = (patch: Partial<PackingInput>) =>
    setDraftModel((current) => ({ ...current, packing: { ...current.packing, ...patch } }));
  const updateTrailer = (index: number, patch: Partial<TrailerInput>) =>
    setDraftModel((current) => ({
      ...current,
      trailers: current.trailers.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    }));

  const addTrailer = () => {
    if (draftModel.trailers.length >= 12) return;
    setDraftModel((current) => {
      const created = createTrailer(current);
      return autoSpaceTrailers({
        ...current,
        trailers: [...current.trailers, created.trailer],
        groupings: [...current.groupings, created.grouping],
      });
    });
    setSelectedTrailerIndex(draftModel.trailers.length);
  };

  const removeTrailer = (index: number) => {
    if (draftModel.trailers.length <= 1) return;
    setDraftModel((current) =>
      autoSpaceTrailers({
        ...current,
        trailers: current.trailers.filter((_, itemIndex) => itemIndex !== index),
        groupings: current.groupings.filter((_, itemIndex) => itemIndex !== index),
        analysedTrailer: Math.min(current.analysedTrailer, current.trailers.length - 1),
      }),
    );
  };

  const updateCorner = (trailerIndex: number, key: CornerKey, value: number) => {
    setDraftModel((current) => {
      const next = cloneModel(current);
      const grouping = next.groupings[trailerIndex];
      if (!grouping) return current;
      grouping.cornerGroups = {
        rearLeft: grouping.cornerGroups?.rearLeft ?? 1,
        rearRight: grouping.cornerGroups?.rearRight ?? 2,
        frontLeft: grouping.cornerGroups?.frontLeft ?? 3,
        frontRight: grouping.cornerGroups?.frontRight ?? 3,
        [key]: value,
      };
      return next;
    });
  };

  const addSupport = () => {
    if (draftModel.supports.length >= 10) return;
    setDraftModel((current) => {
      const last = current.supports.at(-1);
      const support: CargoSupport = {
        id: uniqueId("support"),
        xM: (last?.xM ?? 0) + 1,
        widthM: last?.widthM ?? 0.5,
        allowed: true,
        active: true,
        positiveConnectionToDeck: false,
      };
      return { ...current, supports: [...current.supports, support] };
    });
  };

  const renderCase = () => (
    <>
      <FormSection
        title="Choose a starting point"
        description="The active case is untouched until you finish setup."
      >
        <div className="wizard-source-grid">
          <button
            type="button"
            className={sourceType === "CURRENT" ? "selected" : ""}
            onClick={() => selectSource("CURRENT")}
          >
            <IconRefresh size={18} />
            <span><b>Current case</b><small>Reopen with the values already in the workbench.</small></span>
          </button>
          <button
            type="button"
            className={sourceType === "BLANK" ? "selected" : ""}
            onClick={() => selectSource("BLANK")}
          >
            <IconPlus size={18} />
            <span><b>Blank case</b><small>Start with an empty canvas and build the arrangement as you go.</small></span>
          </button>
          <button
            type="button"
            className={sourceType === "JSON" ? "selected" : ""}
            disabled={busy}
            onClick={() => jsonInputRef.current?.click()}
          >
            <IconFileImport size={18} />
            <span><b>Import JSON</b><small>Resume a standalone project file.</small></span>
          </button>
        </div>
      </FormSection>
      <FormSection title="Case references">
        <div className="wizard-field-grid">
          <TextField label="Case / cargo name" value={draftModel.cargo.name} highlight={() => setSelectedId("cargo")} onChange={(name) => updateCargo({ name })} />
          <TextField label="Client reference" value={draftModel.cargo.clientReference} onChange={(clientReference) => updateCargo({ clientReference })} />
          <TextField label="Owner reference" value={draftModel.cargo.ownerReference} onChange={(ownerReference) => updateCargo({ ownerReference })} />
          <SelectField
            label="Engineering verification degree"
            value={draftModel.engineeringDegree}
            onChange={(engineeringDegree) => setDraftModel((current) => ({ ...current, engineeringDegree: engineeringDegree as ProjectModel["engineeringDegree"] }))}
          >
            <option value="First">First</option>
            <option value="Second">Second</option>
            <option value="Third">Third</option>
          </SelectField>
          <TextField label="Weight / COG reference" value={draftModel.weightCogReference} onChange={(weightCogReference) => setDraftModel((current) => ({ ...current, weightCogReference }))} />
          <TextField label="Load datum / reference point" value={draftModel.referencePoint} hint="Coordinate origin used by the calculation." onChange={(referencePoint) => setDraftModel((current) => ({ ...current, referencePoint }))} />
        </div>
      </FormSection>
    </>
  );

  const renderCargo = () => (
    <>
      <FormSection title="Cargo geometry" description="Coordinates use the selected load datum. COG Z is measured from the cargo bottom.">
        <div className="wizard-field-grid two">
          <NumberField label="Length" value={draftModel.cargo.lengthM} unit="m" min={0} validation={draftModel.cargo.lengthM > 0 ? "valid" : "invalid"} highlight={() => setSelectedId("cargo")} onChange={(lengthM) => updateCargo({ lengthM })} />
          <NumberField label="Width" value={draftModel.cargo.widthM} unit="m" min={0} validation={draftModel.cargo.widthM > 0 ? "valid" : "invalid"} highlight={() => setSelectedId("cargo")} onChange={(widthM) => updateCargo({ widthM })} />
          <NumberField label="Height" value={draftModel.cargo.heightM} unit="m" min={0} validation={draftModel.cargo.heightM > 0 ? "valid" : "invalid"} highlight={() => setSelectedId("cargo")} onChange={(heightM) => updateCargo({ heightM })} />
          <NumberField label="X extreme" value={draftModel.cargo.extremeX} unit="m" highlight={() => setSelectedId("cargo")} onChange={(extremeX) => updateCargo({ extremeX })} />
          <NumberField label="Y extreme" value={draftModel.cargo.extremeY} unit="m" highlight={() => setSelectedId("cargo")} onChange={(extremeY) => updateCargo({ extremeY })} />
          <NumberField label="Mass" value={draftModel.cargo.massT} unit="t" min={0} validation={draftModel.cargo.massT > 0 ? "valid" : "invalid"} highlight={() => setSelectedId("cog:cargo")} onChange={(massT) => updateCargo({ massT })} />
        </div>
      </FormSection>
      <FormSection title="Cargo COG and uncertainty envelope">
        <div className="wizard-toggle-grid">
          <ToggleField
            label="Auto-calculate COG envelope"
            checked={draftModel.cargo.autoCogEnvelopeFromCargo}
            hint="Default: X is 2% of cargo length; Y is 2% of cargo width."
            onChange={(autoCogEnvelopeFromCargo) => updateCargo({
              autoCogEnvelopeFromCargo,
              ...(autoCogEnvelopeFromCargo ? derivedCargoCogEnvelopeInputs(draftModel.cargo) : {}),
            })}
          />
        </div>
        <div className="wizard-field-grid two">
          <NumberField label="COG X" value={draftModel.cargo.cog.x} unit="m" highlight={() => setSelectedId("cog:cargo")} onChange={(x) => updateCargo({ cog: { ...draftModel.cargo.cog, x } })} />
          <NumberField label="COG Y" value={draftModel.cargo.cog.y} unit="m" highlight={() => setSelectedId("cog:cargo")} onChange={(y) => updateCargo({ cog: { ...draftModel.cargo.cog, y } })} />
          <NumberField label="COG Z" value={draftModel.cargo.cog.z} unit="m" highlight={() => setSelectedId("cog:cargo")} onChange={(z) => updateCargo({ cog: { ...draftModel.cargo.cog, z } })} />
          <NumberField label="Envelope X ±" value={draftModel.cargo.envelopeX} unit="m" min={0} disabled={draftModel.cargo.autoCogEnvelopeFromCargo} validation={draftModel.cargo.envelopeX >= 0 ? "valid" : "invalid"} hint={draftModel.cargo.autoCogEnvelopeFromCargo ? "2% of cargo length" : "Manual X uncertainty"} highlight={() => setSelectedId("envelope:cargo")} onChange={(envelopeX) => updateCargo({ envelopeX })} />
          <NumberField label="Envelope Y ±" value={draftModel.cargo.envelopeY} unit="m" min={0} disabled={draftModel.cargo.autoCogEnvelopeFromCargo} validation={draftModel.cargo.envelopeY >= 0 ? "valid" : "invalid"} hint={draftModel.cargo.autoCogEnvelopeFromCargo ? "2% of cargo width" : "Manual Y uncertainty"} highlight={() => setSelectedId("envelope:cargo")} onChange={(envelopeY) => updateCargo({ envelopeY })} />
        </div>
      </FormSection>
      <details className="wizard-advanced" open>
        <summary>Wind projection and advanced inputs</summary>
        <div className="wizard-toggle-grid">
          <ToggleField
            label="Auto-calculate wind areas"
            checked={draftModel.cargo.autoWindFromCargo}
            hint="Default: cargo side/front projections; force acts at half cargo height."
            onChange={(autoWindFromCargo) => updateCargo({
              autoWindFromCargo,
              ...(autoWindFromCargo ? derivedCargoWindInputs(draftModel.cargo) : {}),
            })}
          />
        </div>
        <div className="wizard-field-grid two">
          <NumberField label="Side wind area" value={draftModel.cargo.sideWindAreaM2} unit="m²" min={0} disabled={draftModel.cargo.autoWindFromCargo} validation={draftModel.cargo.sideWindAreaM2 > 0 ? "valid" : "invalid"} hint={draftModel.cargo.autoWindFromCargo ? "Length × height" : "Manual projected side area"} onChange={(sideWindAreaM2) => updateCargo({ sideWindAreaM2 })} />
          <NumberField label="Side drag coefficient" value={draftModel.cargo.sideDragCoefficient} min={0} onChange={(sideDragCoefficient) => updateCargo({ sideDragCoefficient })} />
          <NumberField label="Side wind height" value={draftModel.cargo.sideWindHeightM} unit="m" min={0} disabled={draftModel.cargo.autoWindFromCargo} validation={draftModel.cargo.sideWindHeightM > 0 ? "valid" : "invalid"} hint={draftModel.cargo.autoWindFromCargo ? "Half cargo height" : "Manual force height"} onChange={(sideWindHeightM) => updateCargo({ sideWindHeightM })} />
          <NumberField label="Front wind area" value={draftModel.cargo.frontWindAreaM2} unit="m²" min={0} disabled={draftModel.cargo.autoWindFromCargo} validation={draftModel.cargo.frontWindAreaM2 > 0 ? "valid" : "invalid"} hint={draftModel.cargo.autoWindFromCargo ? "Width × height" : "Manual projected front area"} onChange={(frontWindAreaM2) => updateCargo({ frontWindAreaM2 })} />
          <NumberField label="Front drag coefficient" value={draftModel.cargo.frontDragCoefficient} min={0} onChange={(frontDragCoefficient) => updateCargo({ frontDragCoefficient })} />
          <NumberField label="Front wind height" value={draftModel.cargo.frontWindHeightM} unit="m" min={0} disabled={draftModel.cargo.autoWindFromCargo} validation={draftModel.cargo.frontWindHeightM > 0 ? "valid" : "invalid"} hint={draftModel.cargo.autoWindFromCargo ? "Half cargo height" : "Manual force height"} onChange={(frontWindHeightM) => updateCargo({ frontWindHeightM })} />
        </div>
      </details>
    </>
  );

  const renderPacking = () => (
    <>
      <FormSection title="Packing calculation inputs" description="Mass, height and COG are included in verification exports.">
        <div className="wizard-field-grid two">
          <NumberField label="Packing mass" value={draftModel.packing.massT} unit="t" min={0} highlight={() => setSelectedId("packing")} onChange={(massT) => updatePacking({ massT })} />
          <NumberField label="Packing height" value={draftModel.packing.heightM} unit="m" min={0} highlight={() => setSelectedId("packing")} onChange={(heightM) => updatePacking({ heightM })} />
          <NumberField label="Trailer deck height" value={draftModel.trailerDeckHeightM} unit="m" min={0} highlight={() => setSelectedId("packing")} onChange={(trailerDeckHeightM) => setDraftModel((current) => ({ ...current, trailerDeckHeightM }))} />
          <NumberField label="Packing COG X" value={draftModel.packing.cog.x} unit="m" highlight={() => setSelectedId("cog:packing")} onChange={(x) => updatePacking({ cog: { ...draftModel.packing.cog, x } })} />
          <NumberField label="Packing COG Y" value={draftModel.packing.cog.y} unit="m" highlight={() => setSelectedId("cog:packing")} onChange={(y) => updatePacking({ cog: { ...draftModel.packing.cog, y } })} />
          <NumberField label="Packing COG Z" value={draftModel.packing.cog.z} unit="m" highlight={() => setSelectedId("cog:packing")} onChange={(z) => updatePacking({ cog: { ...draftModel.packing.cog, z } })} />
        </div>
      </FormSection>
      <FormSection title="Visual footprint" description="Geometry for the live views; it does not alter the engineering calculation or exported case values.">
        <div className="wizard-segmented">
          <button
            type="button"
            className={draftModel.packing.footprint.mode === "CARGO_ESTIMATE" ? "active" : ""}
            onClick={() => updatePacking({ footprint: { ...draftModel.packing.footprint, mode: "CARGO_ESTIMATE" } })}
          >
            Cargo estimate
          </button>
          <button
            type="button"
            className={draftModel.packing.footprint.mode === "CUSTOM" ? "active" : ""}
            onClick={() => updatePacking({ footprint: { ...draftModel.packing.footprint, mode: "CUSTOM" } })}
          >
            Custom footprint
          </button>
        </div>
        {draftModel.packing.footprint.mode === "CUSTOM" && (
          <div className="wizard-field-grid two">
            <NumberField label="Footprint length" value={draftModel.packing.footprint.lengthM} unit="m" min={0} highlight={() => setSelectedId("packing")} onChange={(lengthM) => updatePacking({ footprint: { ...draftModel.packing.footprint, lengthM } })} />
            <NumberField label="Footprint width" value={draftModel.packing.footprint.widthM} unit="m" min={0} highlight={() => setSelectedId("packing")} onChange={(widthM) => updatePacking({ footprint: { ...draftModel.packing.footprint, widthM } })} />
            <NumberField label="X extreme" value={draftModel.packing.footprint.extremeX} unit="m" highlight={() => setSelectedId("packing")} onChange={(extremeX) => updatePacking({ footprint: { ...draftModel.packing.footprint, extremeX } })} />
            <NumberField label="Y extreme" value={draftModel.packing.footprint.extremeY} unit="m" highlight={() => setSelectedId("packing")} onChange={(extremeY) => updatePacking({ footprint: { ...draftModel.packing.footprint, extremeY } })} />
          </div>
        )}
      </FormSection>
      <FormSection title="Loose packing rows" description="Up to four local line items.">
        <div className="wizard-record-list">
          {draftModel.loosePacking.map((item, index) => (
            <article key={item.id} className="wizard-record" onFocus={() => setSelectedId(`loose-packing:${item.id}`)}>
              <header><b>Row {index + 1}</b><button type="button" className="icon-button" title="Remove loose packing row" onClick={() => setDraftModel((current) => ({ ...current, loosePacking: current.loosePacking.filter((_, itemIndex) => itemIndex !== index) }))}><IconTrash size={14} /></button></header>
              <TextField label="Type" value={item.type} onChange={(type) => setDraftModel((current) => ({ ...current, loosePacking: current.loosePacking.map((entry, itemIndex) => itemIndex === index ? { ...entry, type } : entry) }))} />
              <div className="wizard-field-grid three">
                <NumberField label="Mass" value={item.massT} unit="t" min={0} onChange={(massT) => setDraftModel((current) => ({ ...current, loosePacking: current.loosePacking.map((entry, itemIndex) => itemIndex === index ? { ...entry, massT } : entry) }))} />
                <NumberField label="Start X" value={item.startXM} unit="m" onChange={(startXM) => setDraftModel((current) => ({ ...current, loosePacking: current.loosePacking.map((entry, itemIndex) => itemIndex === index ? { ...entry, startXM } : entry) }))} />
                <NumberField label="End X" value={item.endXM} unit="m" onChange={(endXM) => setDraftModel((current) => ({ ...current, loosePacking: current.loosePacking.map((entry, itemIndex) => itemIndex === index ? { ...entry, endXM } : entry) }))} />
              </div>
            </article>
          ))}
          <button
            type="button"
            className="wizard-add-record"
            disabled={draftModel.loosePacking.length >= 4}
            onClick={() => setDraftModel((current) => ({
              ...current,
              loosePacking: [...current.loosePacking, { id: uniqueId("loose-packing"), type: "Packing", massT: 0, startXM: 0, endXM: 1 }],
            }))}
          >
            <IconPlus size={15} /> Add loose packing row
          </button>
        </div>
      </FormSection>
    </>
  );

  const renderTrailers = () => {
    const selected = draftModel.trailers[selectedTrailerIndex];
    const placementReference = draftModel.trailers[0]?.placementReference ?? "ABSOLUTE";
    const sharedLongitudinal = placementReference === "ABSOLUTE"
      ? draftModel.trailers[0]?.xM ?? 0
      : draftModel.trailers[0]?.offsetFromReference.x ?? 0;
    return (
      <>
        <FormSection title="Shared formation controls" description="These values are applied consistently to every selected trailer.">
          <div className="wizard-field-grid two">
            <NumberField label="No. of axle lines" value={draftModel.trailers[0]?.axleLines ?? 1} step={1} min={1} highlight={() => selected && setSelectedId(`trailer:${selected.id}`)} onChange={(value) => setDraftModel((current) => applySharedAxleLines(current, value))} />
            <SelectField
              label="Longitudinal placement"
              value={placementReference}
              onChange={(value) => setDraftModel((current) => setSharedPlacementReference(current, engine.result, value as PlacementReference))}
            >
              <option value="ABSOLUTE">Absolute datum</option>
              <option value="LOAD_COG">Relative to load COG</option>
              <option value="ALL_INCLUSIVE_COG">Relative to all-inclusive COG</option>
            </SelectField>
            <NumberField
              label={placementReference === "ABSOLUTE" ? "Shared X start" : "Shared X offset"}
              value={sharedLongitudinal}
              unit="m"
              highlight={() => selected && setSelectedId(`trailer:${selected.id}`)}
              onChange={(value) => setDraftModel((current) => applySharedLongitudinalPlacement(current, value))}
            />
            <button type="button" className="wizard-auto-space" onClick={() => setDraftModel((current) => autoSpaceTrailers(current, 0.05))}>
              <IconRuler2 size={15} /> Auto-space at 50 mm
            </button>
          </div>
        </FormSection>
        <FormSection title={`Trailers · ${draftModel.trailers.length}/12`} description="Select a row to edit its catalogue model and transverse placement.">
          <div className="wizard-trailer-strip">
            {draftModel.trailers.map((trailer, index) => {
              const definition = draftModel.catalogue.find((item) => item.id === trailer.definitionId);
              const resolved = resolvedTrailerPosition(draftModel, engine.result, index);
              const colliding = engine.result.trailerOverlaps.some((overlap) => overlap.firstTrailerId === trailer.id || overlap.secondTrailerId === trailer.id);
              return (
                <button
                  type="button"
                  key={trailer.id}
                  className={`${index === selectedTrailerIndex ? "selected" : ""}${colliding ? " colliding" : ""}`}
                  onClick={() => {
                    setSelectedTrailerIndex(index);
                    setSelectedId(`trailer:${trailer.id}`);
                  }}
                >
                  <span>T{index + 1}</span>
                  <b>{definition?.name ?? "Missing model"}</b>
                  <small>Y {resolved.y.toFixed(3)} m · {definition?.trailerWidthM.toFixed(3) ?? "—"} m wide</small>
                </button>
              );
            })}
            <button type="button" className="add" disabled={draftModel.trailers.length >= 12} onClick={addTrailer}><IconPlus size={16} /> Add</button>
          </div>
          {selected && (
            <article className="wizard-selected-editor">
              <header>
                <div><b>Trailer {selectedTrailerIndex + 1}</b><small>Resolved X/Y always shown for verification export.</small></div>
                <button type="button" className="icon-button" title="Remove trailer" disabled={draftModel.trailers.length <= 1} onClick={() => removeTrailer(selectedTrailerIndex)}><IconTrash size={15} /></button>
              </header>
              <SelectField label="Catalogue model" value={selected.definitionId} highlight={() => setSelectedId(`trailer:${selected.id}`)} onChange={(definitionId) => updateTrailer(selectedTrailerIndex, { definitionId })}>
                {draftModel.catalogue.map((definition) => <option key={definition.id} value={definition.id}>{definition.name} · {definition.category}</option>)}
              </SelectField>
              <NumberField
                label="Individual X stagger"
                value={selected.formationOffsetXM ?? 0}
                unit="m"
                hint="0 keeps this train in-line; positive moves it toward the front and negative toward the rear."
                highlight={() => setSelectedId(`trailer:${selected.id}`)}
                onChange={(formationOffsetXM) => updateTrailer(selectedTrailerIndex, {
                  formationOffsetXM,
                  xM: sharedLongitudinal + formationOffsetXM,
                  offsetFromReference: {
                    ...selected.offsetFromReference,
                    x: sharedLongitudinal + formationOffsetXM,
                  },
                })}
              />
              <NumberField
                label={selected.placementReference === "ABSOLUTE" ? "Centre Y" : "Y offset"}
                value={selected.placementReference === "ABSOLUTE" ? selected.yM : selected.offsetFromReference.y}
                unit="m"
                highlight={() => setSelectedId(`trailer:${selected.id}`)}
                onChange={(value) => setDraftModel((current) => applyTrailerTransversePlacement(current, selectedTrailerIndex, value))}
              />
              <div className="wizard-resolved-position">
                <span>Resolved absolute</span>
                <b>X {resolvedTrailerPosition(draftModel, engine.result, selectedTrailerIndex).x.toFixed(3)} m</b>
                <b>Y {resolvedTrailerPosition(draftModel, engine.result, selectedTrailerIndex).y.toFixed(3)} m</b>
              </div>
              <div className="wizard-toggle-grid">
                <ToggleField label="Single file" checked={selected.singleFile} onChange={(singleFile) => updateTrailer(selectedTrailerIndex, { singleFile })} />
                <ToggleField label="Rear PPU" checked={selected.ppuLeft} onChange={(ppuLeft) => updateTrailer(selectedTrailerIndex, { ppuLeft })} />
                <ToggleField label="Front PPU" checked={selected.ppuRight} onChange={(ppuRight) => updateTrailer(selectedTrailerIndex, { ppuRight })} />
              </div>
            </article>
          )}
        </FormSection>
      </>
    );
  };

  const renderHydraulics = () => {
    const pins = draftModel.groupings[0]?.pinnedAxleLines ?? [];
    const hydraulicGroupIds = draftModel.hydraulicSystemMode === "FOUR_POINT"
      ? [1, 2, 3, 4]
      : [1, 2, 3];
    return (
      <>
        <FormSection title="Hydraulic suspension system" description="Three-point uses a stability triangle. Four-point uses the active convex polygon and exact four-reaction equilibrium.">
          <SelectField
            label="Hydraulic system"
            value={draftModel.hydraulicSystemMode}
            onChange={(hydraulicSystemMode) => setDraftModel((current) => ({
              ...current,
              hydraulicSystemMode: hydraulicSystemMode as ProjectModel["hydraulicSystemMode"],
            }))}
          >
            <option value="THREE_POINT">Three-point suspension</option>
            <option value="FOUR_POINT">Four-point suspension</option>
          </SelectField>
        </FormSection>
        <FormSection title="Shared split and pinned axles" description="Changes are applied consistently across every trailer.">
          <div className="wizard-field-grid two">
            <NumberField label="Split after axle line" value={draftModel.groupings[0]?.splitAfterAxleLine ?? 1} step={1} min={1} max={Math.max(1, (draftModel.trailers[0]?.axleLines ?? 2) - 1)} highlight={() => setSelectedId("stability-boundary")} onChange={(value) => setDraftModel((current) => applySharedSplit(current, value))} />
            <div className="wizard-pin-entry">
              <NumberField label="Pin axle line" value={pinEntry} step={1} min={1} max={draftModel.trailers[0]?.axleLines ?? 1} onChange={setPinEntry} />
              <button type="button" disabled={pins.length >= 8 || pins.includes(Math.round(pinEntry))} onClick={() => setDraftModel((current) => applySharedPins(current, [...pins, Math.round(pinEntry)]))}><IconPlus size={14} /> Add pin</button>
            </div>
          </div>
          <div className="wizard-pin-list" aria-label="Shared pinned axle lines">
            {pins.length ? pins.map((pin) => (
              <button type="button" key={pin} onClick={() => setDraftModel((current) => applySharedPins(current, pins.filter((value) => value !== pin)))}>AL {pin}<IconX size={12} /></button>
            )) : <span>No axle lines pinned</span>}
          </div>
        </FormSection>
        <FormSection title="Manual hydraulic grouping table" description={`The interactive drawing and these labelled controls edit the same ${hydraulicGroupIds.length}-group model.`}>
          <div className="wizard-hydraulic-groups">
            {hydraulicGroupIds.map((groupId) => {
              const centre = engine.result.groups.find((group) => group.group === groupId);
              return (
                <div key={groupId} className={`g${groupId}`}>
                  <span>G{groupId}</span>
                  <b>{centre ? `${centre.loadT.toFixed(1)} t` : "Unpopulated"}</b>
                  <small>{centre ? `${centre.axleCount} bogies · X ${centre.point.x.toFixed(2)} · Y ${centre.point.y.toFixed(2)}` : "Assign at least one active circuit"}</small>
                </div>
              );
            })}
          </div>
          <div className="wizard-hydraulic-table-wrap">
            <table className="wizard-hydraulic-table">
              <thead><tr><th>Trailer</th><th>Rear L</th><th>Rear R</th><th>Front L</th><th>Front R</th></tr></thead>
              <tbody>
                {draftModel.trailers.map((trailer, index) => {
                  const corners = draftModel.groupings[index]?.cornerGroups ?? { rearLeft: 1, rearRight: 2, frontLeft: 3, frontRight: 3 };
                  const cell = (key: CornerKey) => (
                    <select aria-label={`Trailer ${index + 1} ${key} hydraulic group`} value={corners[key]} onChange={(event) => updateCorner(index, key, Number(event.target.value))}>
                      {hydraulicGroupIds.map((groupId) => <option key={groupId} value={groupId}>G{groupId}</option>)}
                    </select>
                  );
                  return (
                    <tr key={trailer.id} onClick={() => setSelectedId(`trailer:${trailer.id}`)}>
                      <th>T{index + 1}</th>
                      <td>{cell("rearLeft")}</td>
                      <td>{cell("rearRight")}</td>
                      <td>{cell("frontLeft")}</td>
                      <td>{cell("frontRight")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <dl className="wizard-quality">
            <div><dt>Stability polygon area</dt><dd>{engine.result.groupingQuality.polygonAreaM2.toFixed(3)} m²</dd></div>
            <div><dt>Minimum polygon width</dt><dd>{engine.result.groupingQuality.minimumAltitudeM.toFixed(3)} m</dd></div>
            <div><dt>Aspect ratio</dt><dd>{engine.result.groupingQuality.aspectRatio.toFixed(3)}</dd></div>
          </dl>
        </FormSection>
      </>
    );
  };

  const renderSupports = () => (
    <>
      <FormSection title="Support settling" description="Negative or disallowed reactions settle out before the minimum-active-support gate is checked.">
        {draftModel.supports.some((support) => support.positiveConnectionToDeck) && (
          <div className="wizard-notice warning">
            <IconAlertTriangle size={15} />
            <span>Positive support connection enabled. Any retained negative reaction is a tensile design action that must be verified for the packing, deck and spine-beam connection.</span>
          </div>
        )}
        <div className="wizard-support-summary">
          <div><span>Settled active</span><b>{engine.result.activeSupportCount}/{draftModel.supports.length}</b></div>
          <NumberField label="Minimum active supports" value={draftModel.optimiser.minimumActiveSupports} step={1} min={2} max={10} highlight={() => setSelectedId("project-case")} onChange={(minimumActiveSupports) => setDraftModel((current) => ({ ...current, optimiser: { ...current.optimiser, minimumActiveSupports: Math.round(minimumActiveSupports) } }))} />
        </div>
        <div className="wizard-record-list">
          {draftModel.supports.map((support, index) => {
            const settled = engine.result.supports.find((item) => item.id === support.id);
            return (
              <article key={support.id} className={`wizard-record support${settled?.active ? " active" : " inactive"}`} onClick={() => setSelectedId(`support:${support.id}`)}>
                <header>
                  <div><b>Support {index + 1}</b><small>{settled?.active ? "Settled active" : settled?.disableReason || "Inactive"}</small></div>
                  <span className={settled && settled.reactionT < 0 ? "nok" : ""}>{settled ? `${settled.reactionT.toFixed(2)} t` : "—"}</span>
                  <button type="button" className="icon-button" title="Remove support" onClick={(event) => { event.stopPropagation(); setDraftModel((current) => ({ ...current, supports: current.supports.filter((_, itemIndex) => itemIndex !== index) })); }}><IconTrash size={14} /></button>
                </header>
                <div className="wizard-field-grid two">
                  <NumberField label="X position" value={support.xM} unit="m" onChange={(xM) => setDraftModel((current) => ({ ...current, supports: current.supports.map((item, itemIndex) => itemIndex === index ? { ...item, xM } : item) }))} />
                  <NumberField label="Spread width" value={support.widthM} unit="m" min={0} onChange={(widthM) => setDraftModel((current) => ({ ...current, supports: current.supports.map((item, itemIndex) => itemIndex === index ? { ...item, widthM } : item) }))} />
                  <NumberField label="Optional weight" value={support.optionalWeightT ?? 0} unit="t" min={0} onChange={(optionalWeightT) => setDraftModel((current) => ({ ...current, supports: current.supports.map((item, itemIndex) => itemIndex === index ? { ...item, optionalWeightT } : item) }))} />
                  <ToggleField label="Allowed" checked={support.allowed} onChange={(allowed) => setDraftModel((current) => ({ ...current, supports: current.supports.map((item, itemIndex) => itemIndex === index ? { ...item, allowed, active: allowed && item.active } : item) }))} />
                  <ToggleField label="Positive connection to deck / spine beam" checked={support.positiveConnectionToDeck === true} onChange={(positiveConnectionToDeck) => setDraftModel((current) => ({ ...current, supports: current.supports.map((item, itemIndex) => itemIndex === index ? { ...item, positiveConnectionToDeck } : item) }))} />
                </div>
              </article>
            );
          })}
          <button type="button" className="wizard-add-record" disabled={draftModel.supports.length >= 10} onClick={addSupport}><IconPlus size={15} /> Add support</button>
        </div>
      </FormSection>
      <FormSection title="Route and dynamic checks">
        <div className="wizard-field-grid two">
          <NumberField label="Route longitudinal slope" value={draftModel.environment.routeLongitudinalSlopeDeg} unit="°" onChange={(routeLongitudinalSlopeDeg) => setDraftModel((current) => ({ ...current, environment: { ...current.environment, routeLongitudinalSlopeDeg } }))} />
          <NumberField label="Applied longitudinal slope" value={draftModel.environment.longitudinalSlopeDeg} unit="°" onChange={(longitudinalSlopeDeg) => setDraftModel((current) => ({ ...current, environment: { ...current.environment, longitudinalSlopeDeg } }))} />
          <NumberField label="Route transverse slope" value={draftModel.environment.routeTransverseSlopeDeg} unit="°" onChange={(routeTransverseSlopeDeg) => setDraftModel((current) => ({ ...current, environment: { ...current.environment, routeTransverseSlopeDeg } }))} />
          <NumberField label="Applied transverse slope" value={draftModel.environment.transverseSlopeDeg} unit="°" onChange={(transverseSlopeDeg) => setDraftModel((current) => ({ ...current, environment: { ...current.environment, transverseSlopeDeg } }))} />
          <NumberField label="Combination factor" value={draftModel.environment.combinationFactor} min={0} onChange={(combinationFactor) => setDraftModel((current) => ({ ...current, environment: { ...current.environment, combinationFactor } }))} />
          <NumberField label="Wind speed" value={draftModel.environment.windSpeedMps} unit="m/s" min={0} onChange={(windSpeedMps) => setDraftModel((current) => ({ ...current, environment: { ...current.environment, windSpeedMps } }))} />
          <NumberField label="Longitudinal acceleration" value={draftModel.environment.longitudinalAccelerationMps2} unit="m/s²" onChange={(longitudinalAccelerationMps2) => setDraftModel((current) => ({ ...current, environment: { ...current.environment, longitudinalAccelerationMps2 } }))} />
          <NumberField label="Transverse acceleration" value={draftModel.environment.transverseAccelerationMps2} unit="m/s²" onChange={(transverseAccelerationMps2) => setDraftModel((current) => ({ ...current, environment: { ...current.environment, transverseAccelerationMps2 } }))} />
          <NumberField label="Analysed trailer" value={draftModel.analysedTrailer} step={1} min={1} max={draftModel.trailers.length} onChange={(analysedTrailer) => setDraftModel((current) => ({ ...current, analysedTrailer: Math.round(analysedTrailer) }))} />
        </div>
      </FormSection>
        <FormSection title="Road transport traction and braking" description="Uses the configured friction, rolling-resistance, driven-bogie and brake-force data.">
        <ToggleField
          label="Enable road transport analysis"
          checked={draftModel.roadTransport.enabled}
          hint="When enabled, a failed traction or braking check makes the engineering result NOK."
          onChange={(enabled) => setDraftModel((current) => ({
            ...current,
            roadTransport: { ...current.roadTransport, enabled },
          }))}
        />
        <div className="wizard-field-grid three">
          <SelectField label="Road surface" value={draftModel.roadTransport.surface} onChange={(surface) => setDraftModel((current) => ({ ...current, roadTransport: { ...current.roadTransport, surface: surface as ProjectModel["roadTransport"]["surface"] } }))}>
            {ROAD_SURFACES.map((surface) => <option key={surface.id} value={surface.id}>{surface.label}</option>)}
          </SelectField>
          <SelectField label="Surface condition" value={draftModel.roadTransport.condition} onChange={(condition) => setDraftModel((current) => ({ ...current, roadTransport: { ...current.roadTransport, condition: condition as ProjectModel["roadTransport"]["condition"] } }))}>
            <option value="DRY">Dry</option><option value="WET">Wet</option>
          </SelectField>
          <SelectField label="PPU drive capacity" value={draftModel.roadTransport.ppuCapacity} onChange={(ppuCapacity) => setDraftModel((current) => ({ ...current, roadTransport: { ...current.roadTransport, ppuCapacity: ppuCapacity as ProjectModel["roadTransport"]["ppuCapacity"] } }))}>
            <option value="STANDARD_26">Standard · 26 driven bogies/PPU</option>
            <option value="ALASKA_32">Alaska · 32 driven bogies/PPU</option>
            <option value="CUSTOM">Custom verified limit</option>
          </SelectField>
          <NumberField label="Transport speed" value={draftModel.roadTransport.speedKph} unit="km/h" min={0} onChange={(speedKph) => setDraftModel((current) => ({ ...current, roadTransport: { ...current.roadTransport, speedKph } }))} />
          <NumberField label="Drive acceleration" value={draftModel.roadTransport.driveAccelerationMps2} unit="m/s²" min={0} onChange={(driveAccelerationMps2) => setDraftModel((current) => ({ ...current, roadTransport: { ...current.roadTransport, driveAccelerationMps2 } }))} />
          <NumberField label="Brake deceleration" value={draftModel.roadTransport.brakeDecelerationMps2} unit="m/s²" min={0} onChange={(brakeDecelerationMps2) => setDraftModel((current) => ({ ...current, roadTransport: { ...current.roadTransport, brakeDecelerationMps2 } }))} />
          {draftModel.roadTransport.ppuCapacity === "CUSTOM" && <NumberField label="Driven bogies per PPU" value={draftModel.roadTransport.customDrivenBogieLimit} min={0} step={1} onChange={(customDrivenBogieLimit) => setDraftModel((current) => ({ ...current, roadTransport: { ...current.roadTransport, customDrivenBogieLimit: Math.round(customDrivenBogieLimit) } }))} />}
        </div>
        {draftModel.roadTransport.enabled && engine.result.roadTransport && (
          <dl className="wizard-quality">
            <div><dt>Traction</dt><dd>{engine.result.roadTransport.tractionUtilisation === null ? "N/A" : `${(engine.result.roadTransport.tractionUtilisation * 100).toFixed(1)}%`}</dd></div>
            <div><dt>Braking</dt><dd>{engine.result.roadTransport.brakingUtilisation === null ? "N/A" : `${(engine.result.roadTransport.brakingUtilisation * 100).toFixed(1)}%`}</dd></div>
            <div><dt>Road result</dt><dd>{engine.result.roadTransport.status}</dd></div>
          </dl>
        )}
      </FormSection>
    </>
  );

  const renderReview = () => (
    <>
      <section className={`wizard-review-status ${engine.result.status === "PASS" ? "pass" : "nok"}`}>
        <div>
          <span>Authoritative engineering result</span>
          <h3>
            {calculationCurrent
              ? setupValidEngineeringNok
                ? "ENGINEERING NOK"
                : engine.result.status.replaceAll("_", " ")
              : "UPDATING"}
          </h3>
          <p>
            {setupValidEngineeringNok
              ? `The ${draftModel.hydraulicSystemMode === "FOUR_POINT" ? "four" : "three"}-group setup is valid, but the current load case is outside an engineering limit. It can still be saved.`
              : engine.result.failDetail || "The setup is calculation-ready."}
          </p>
        </div>
        <div className="wizard-review-counts">
          <span><b>{blockingCount}</b> blocking</span>
          <span><b>{warningCount}</b> warnings</span>
        </div>
      </section>
      <div className="wizard-metric-grid">
        <div><span>Basic utilisation</span><b>{metric(engine.result.metrics.basicUtil.value, "%", 100)}</b><small>{engine.result.metrics.basicUtil.status}</small></div>
        <div><span>Dynamic utilisation</span><b>{metric(engine.result.metrics.dynamicUtil.value, "%", 100)}</b><small>{engine.result.metrics.dynamicUtil.status}</small></div>
        <div><span>Basic tipping</span><b>{metric(engine.result.metrics.basicAngle.value, "°")}</b><small>{engine.result.metrics.basicAngle.status}</small></div>
        <div><span>Dynamic tipping</span><b>{metric(engine.result.metrics.dynamicAngle.value, "°")}</b><small>{engine.result.metrics.dynamicAngle.status}</small></div>
        <div><span>Cargo-only basic</span><b>{metric(engine.result.stabilityReferences.cargoBasicAngle.value, "°")}</b><small>{engine.result.stabilityReferences.cargoBasicAngle.status}</small></div>
        <div><span>Cargo-only slope</span><b>{metric(engine.result.stabilityReferences.cargoSlopeAngle.value, "°")}</b><small>{engine.result.stabilityReferences.cargoSlopeAngle.status}</small></div>
        <div><span>Cargo-only dynamic</span><b>{metric(engine.result.stabilityReferences.cargoDynamicAngle.value, "°")}</b><small>{engine.result.stabilityReferences.cargoDynamicAngle.status}</small></div>
        <div><span>COG pass basis</span><b>{engine.result.stabilityReferences.combinedCogPassOnly ? "COMBINED ONLY" : engine.result.stabilityReferences.cargoOnlyPass ? "CARGO + COMBINED" : "NO ANGLE PASS"}</b><small>{engine.result.stabilityReferences.combinedCogPassOnly ? "Cargo-only stability fails" : engine.result.stabilityReferences.cargoOnlyPass ? "Cargo-only limits met" : "Combined limits also incomplete"}</small></div>
        <div><span>Spine beam</span><b>{metric(engine.result.metrics.spineUtil.value, "%", 100)}</b><small>{engine.result.metrics.spineUtil.status}</small></div>
        <div><span>Active supports</span><b>{engine.result.activeSupportCount}</b><small>minimum {draftModel.optimiser.minimumActiveSupports}</small></div>
      </div>
      <FormSection title="Configuration preflight" description="Engineering-limit NOK results remain visible but do not block saving a geometrically valid setup.">
        <IssueList
          issues={issues}
          onSelect={(item) => {
            if (item.entityId) setSelectedId(item.entityId);
            if (item.step !== "review") changeStep(item.step);
          }}
        />
      </FormSection>
      <aside className="wizard-export-note">
        <IconFileImport size={17} />
        <div>
          <b>AutoCAD interchange</b>
          <p>The AutoCAD action downloads one compact numbered <code>.sartd</code> case file containing the resolved cargo, trailer, hydraulic, support, stability-boundary and drawing-result values used by the drafting program. Run <code>SARTDCAD</code>, or choose CAD in <code>SARTDRUN</code>, then select that single file.</p>
        </div>
      </aside>
    </>
  );

  const form = (() => {
    switch (step) {
      case "cargo": return renderCargo();
      case "packing": return renderPacking();
      case "trailers": return renderTrailers();
      case "hydraulics": return renderHydraulics();
      case "supports": return renderSupports();
      case "review": return renderReview();
      default: return renderCase();
    }
  })();

  const currentStep = SETUP_STEPS[stepIndex];
  const canContinue = calculationCurrent && stepCanContinue(issues, step) && !engine.error;
  const finishReady = calculationCurrent && !engine.error && canFinishSetup(issues);

  return (
    <dialog
      ref={dialogRef}
      className="setup-wizard-dialog"
      aria-labelledby="setup-wizard-title"
      onCancel={(event) => {
        event.preventDefault();
        saveAndClose();
      }}
    >
      <input
        ref={jsonInputRef}
        hidden
        type="file"
        accept=".json"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) void importJson(file);
          event.currentTarget.value = "";
        }}
      />
      <div className={`setup-wizard-shell${previewExpanded ? " preview-expanded" : ""}`}>
        <header className="setup-wizard-header">
          <div>
            <span>GUIDED CASE SETUP</span>
            <h2 id="setup-wizard-title">{currentStep.label}</h2>
          </div>
          <div className="setup-wizard-mobile-progress">
            <span>Step {stepIndex + 1} of {SETUP_STEPS.length}</span>
            <div><i style={{ width: `${((stepIndex + 1) / SETUP_STEPS.length) * 100}%` }} /></div>
          </div>
          <button type="button" className="icon-button" title="Save draft and close" onClick={saveAndClose}><IconX size={17} /></button>
        </header>

        <nav className="setup-wizard-rail" aria-label="Setup steps">
          <div className="setup-wizard-rail-title">
            <span>SET UP CASE</span>
            <small>{sourceType.toLowerCase()} source</small>
          </div>
          <ol>
            {SETUP_STEPS.map((item, index) => {
              const itemIssues = issuesForStep(issues, item.id);
              const hasBlocker = itemIssues.some((entry) => entry.severity === "blocking");
              const hasWarning = itemIssues.some((entry) => entry.severity === "warning");
              const state = item.id === step
                ? "active"
                : hasBlocker
                  ? "blocked"
                  : hasWarning
                    ? "warning"
                    : index < stepIndex
                      ? "complete"
                      : "ready";
              return (
                <li key={item.id}>
                  <button type="button" className={state} aria-current={item.id === step ? "step" : undefined} onClick={() => changeStep(item.id)}>
                    <i>{state === "complete" ? <IconCheck size={15} /> : STEP_ICONS[item.id]}</i>
                    <span><b>{index + 1}. {item.label}</b><small>{item.description}</small></span>
                    {hasBlocker ? <em>{itemIssues.filter((entry) => entry.severity === "blocking").length}</em> : hasWarning ? <IconAlertTriangle size={13} /> : null}
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="setup-wizard-rail-footer">
            <span><i className={calculationCurrent ? "ok" : "working"} /> {calculationCurrent ? `Calculated · ${engine.result.calculationMs.toFixed(1)} ms` : "Calculating latest change…"}</span>
            <span>{draftSavedAt ? `Draft saved ${new Date(draftSavedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Draft autosave pending"}</span>
          </div>
        </nav>

        <section className="setup-wizard-form-pane" aria-label={`${currentStep.label} inputs`}>
          <div className="setup-wizard-form-heading">
            <span>STEP {stepIndex + 1} / {SETUP_STEPS.length}</span>
            <h2>{currentStep.label}</h2>
            <p>{currentStep.description}</p>
          </div>
          {notice && <div className="wizard-notice"><IconAlertTriangle size={15} /><span>{notice}</span><button type="button" className="icon-button" onClick={() => setNotice(null)}><IconX size={13} /></button></div>}
          {form}
          {step !== "review" && (
            <FormSection title="Step preflight">
              <IssueList issues={stepIssues} compact onSelect={(item) => item.entityId && setSelectedId(item.entityId)} />
            </FormSection>
          )}
        </section>

        <section className="setup-wizard-preview" aria-label="Live engineering preview">
          <div className="setup-wizard-preview-status">
            <div>
              <span>LIVE {view.toUpperCase()} PREVIEW</span>
              <b>{draftModel.cargo.name || "Untitled case"}</b>
            </div>
            <div className="wizard-preview-status-actions">
              <div className={calculationCurrent ? "ready" : "working"}>
                {!calculationCurrent && <IconLoader2 size={14} />}
                <span>{calculationCurrent ? "Authoritative result" : "Updating · previous result retained"}</span>
              </div>
              <button
                type="button"
                className="mobile-preview-toggle"
                onClick={() => setPreviewExpanded((current) => !current)}
                aria-expanded={previewExpanded}
                aria-label={previewExpanded ? "Return to inputs" : "Expand preview"}
              >
                {previewExpanded ? <IconArrowsMinimize size={16} /> : <IconArrowsMaximize size={16} />}
                <span>{previewExpanded ? "Return to inputs" : "Expand preview"}</span>
              </button>
            </div>
          </div>
          {hasPreviewGeometry ? (
            <EngineeringViewport
              vm={vm}
              view={view}
              availableViews={AVAILABLE_VIEWS}
              compact
              minimumWidth={300}
              minimumHeight={240}
              preferences={preferences}
              selectedId={selectedId}
              onViewChange={setView}
              onPreferencesChange={setPreferences}
              onSelect={setSelectedId}
              onModelChange={setDraftModel}
            />
          ) : (
            <div className="setup-wizard-empty-preview">
              <IconBox size={28} />
              <b>Start with the cargo envelope</b>
              <p>Enter cargo dimensions, then add a trailer. The live arrangement will appear here as you build it.</p>
            </div>
          )}
          <div className="setup-wizard-preview-metrics">
            <div><span>Overall</span><b className={engine.result.status === "PASS" ? "ok" : "nok"}>{engine.result.status.replaceAll("_", " ")}</b></div>
            <div><span>Dynamic util.</span><b>{metric(engine.result.metrics.dynamicUtil.value, "%", 100)}</b></div>
            <div><span>Dynamic angle</span><b>{metric(engine.result.metrics.dynamicAngle.value, "°")}</b></div>
            <div><span>Active supports</span><b>{engine.result.activeSupportCount}/{draftModel.supports.length}</b></div>
            <div><span>Hydraulic boundary</span><b>{engine.result.groupingQuality.polygonAreaM2.toFixed(2)} m²</b></div>
          </div>
          <div className="setup-wizard-preview-findings">
            {blockingCount ? <span className="blocking"><IconX size={13} /> {blockingCount} blocking</span> : <span className="valid"><IconCheck size={13} /> Setup geometry valid</span>}
            {warningCount ? <span className="warning"><IconAlertTriangle size={13} /> {warningCount} warning{warningCount === 1 ? "" : "s"}</span> : null}
          </div>
        </section>

        <footer className="setup-wizard-footer">
          <div className="setup-wizard-footer-secondary">
            <button type="button" className="wizard-discard" onClick={discard}><IconTrash size={14} /> Discard</button>
            <button type="button" onClick={saveAndClose}>Save & close</button>
          </div>
          <div className="setup-wizard-footer-primary">
            {stepIndex > 0 && <button type="button" onClick={previous}><IconChevronLeft size={15} /> Back</button>}
            {step !== "review" ? (
              <button type="button" className="wizard-primary" disabled={!canContinue} onClick={next}>Next <IconChevronRight size={15} /></button>
            ) : (
              <>
                <button type="button" className="wizard-run-finish" disabled={!finishReady} onClick={() => finish(true)}><IconTargetArrow size={15} /> Finish & define search</button>
                <button type="button" className="wizard-primary" disabled={!finishReady} onClick={() => finish(false)}><IconCheck size={15} /> Finish setup</button>
              </>
            )}
          </div>
        </footer>
      </div>
    </dialog>
  );
}
