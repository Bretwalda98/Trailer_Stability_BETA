"use client";

import {
  IconAlertTriangle,
  IconArrowsMaximize,
  IconArrowsMinimize,
  IconBox,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconGauge,
  IconLoader2,
  IconPlayerPlay,
  IconPlus,
  IconRoute,
  IconTargetArrow,
  IconTrash,
  IconTruck,
  IconX,
} from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  applyAutomaticCargoCogEnvelopeInputs,
  cargoCogEnvelopeGuidance,
  derivedCargoCogEnvelopeInputs,
} from "../../engine/cargo-envelope";
import {
  applyArrangementEnvironmentalActions,
  collectArrangementIssues,
  longitudinalOffsetCandidates,
  minimumTotalAxleLines,
  MINIMUM_TRAIN_CLEARANCE_M,
  recommendedPackingSupports,
  spacingCandidates,
  validAxleLineValues,
} from "../../engine/arrangement";
import { ROAD_SURFACES } from "../../engine/road-transport";
import { createBlankSetupModel } from "../../engine/setup";
import type {
  ArrangementOptimiserSettings,
  PackingInput,
  ProjectModel,
} from "../../engine/types";
import { applyAutomaticCargoWindInputs, derivedCargoWindInputs } from "../../engine/wind";
import { hydrateProjectModel } from "../../data/default-model";

export const ARRANGEMENT_WIZARD_DRAFT_KEY = "trailer-stability-arrangement-wizard-v2";
type StepId = "cargo" | "packing" | "trailer" | "search" | "review";
type InitialSource = "CURRENT" | "BLANK";
type LoadPreviewView = "PLAN" | "SIDE" | "REAR";

const STEPS: Array<{ id: StepId; label: string; description: string; icon: ReactNode }> = [
  { id: "cargo", label: "Cargo & case", description: "Envelope, mass and COG", icon: <IconBox size={17} /> },
  { id: "packing", label: "Packing & supports", description: "Packing, deck and load supports", icon: <IconGauge size={17} /> },
  { id: "trailer", label: "Trailer & PPU", description: "Model, modules and PPU", icon: <IconTruck size={17} /> },
  { id: "search", label: "Search limits", description: "Bounds, spacing and method", icon: <IconRoute size={17} /> },
  { id: "review", label: "Check & run", description: "Preflight and start", icon: <IconCheck size={17} /> },
];

interface ArrangementWizardProps {
  activeModel: ProjectModel;
  calculating: boolean;
  initialSourceType?: InitialSource;
  onApply(model: ProjectModel, run: boolean): void;
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
  const [editing, setEditing] = useState(false);
  const displayedText = editing ? text : String(value);
  const number = Number(displayedText);
  const inferred =
    displayedText.trim() !== "" &&
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
          value={displayedText}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onFocus={() => {
            setText(String(value));
            setEditing(true);
          }}
          onChange={(event) => {
            setText(event.target.value);
            const next = Number(event.target.value);
            if (event.target.value.trim() && Number.isFinite(next)) onChange(next);
          }}
          onBlur={() => {
            setEditing(false);
            if (!inferred) setText(String(value));
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
  required,
  onChange,
}: {
  label: string;
  value: string;
  required?: boolean;
  onChange(value: string): void;
}) {
  const valid = !required || value.trim().length > 0;
  return (
    <label className={`wizard-field is-${valid ? "valid" : "invalid"}`}>
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} />
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

function ArrangementLoadPreview({ model, view }: { model: ProjectModel; view: LoadPreviewView }) {
  const cargo = model.cargo;
  const packingHeight = Math.max(0, model.packing.heightM);
  const deckHeight = Math.max(0, model.trailerDeckHeightM);
  const cargoLength = Math.max(0.001, cargo.lengthM);
  const cargoWidth = Math.max(0.001, cargo.widthM);
  const cargoHeight = Math.max(0.001, cargo.heightM);
  const pad = 54;
  const width = 720;
  const height = 420;
  const usableWidth = width - pad * 2;
  const usableHeight = height - pad * 2;
  const stroke = "#dbe7f3";
  const cargoStroke = "#2f9bff";
  const packingStroke = "#f0ad2c";
  const supportStroke = "#32d4c7";

  if (view === "PLAN") {
    const scale = Math.min(usableWidth / cargoLength, usableHeight / cargoWidth);
    const x = (width - cargoLength * scale) / 2;
    const y = (height - cargoWidth * scale) / 2;
    const cogX = x + Math.max(0, Math.min(cargoLength, cargo.cog.x)) * scale;
    const cogY = y + (cargoWidth - Math.max(0, Math.min(cargoWidth, cargo.cog.y))) * scale;
    return (
      <svg className="arrangement-load-preview-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Live plan view of cargo, packing supports and COG">
        <rect x={x} y={y} width={cargoLength * scale} height={cargoWidth * scale} fill="rgba(47,155,255,.08)" stroke={cargoStroke} strokeWidth="2" />
        <text x={x + 10} y={y + 22} fill={stroke}>CARGO · PLAN</text>
        {model.supports.map((support, index) => {
          const sx = x + Math.max(0, Math.min(cargoLength, support.xM - cargo.extremeX)) * scale;
          return <g key={support.id}><line x1={sx} y1={y} x2={sx} y2={y + cargoWidth * scale} stroke={supportStroke} strokeDasharray="5 4" /><text x={sx + 5} y={y + cargoWidth * scale - 8} fill={supportStroke}>S{index + 1}</text></g>;
        })}
        <circle cx={cogX} cy={cogY} r="7" fill="#050708" stroke="#ffd34e" strokeWidth="2" />
        <line x1={cogX - 13} y1={cogY} x2={cogX + 13} y2={cogY} stroke="#ffd34e" /><line x1={cogX} y1={cogY - 13} x2={cogX} y2={cogY + 13} stroke="#ffd34e" />
        <text x={cogX + 12} y={cogY - 12} fill="#ffd34e">COG</text>
      </svg>
    );
  }

  const horizontalSize = view === "SIDE" ? cargoLength : cargoWidth;
  const totalHeight = Math.max(0.001, deckHeight + packingHeight + cargoHeight);
  const scale = Math.min(usableWidth / horizontalSize, usableHeight / totalHeight);
  const x = (width - horizontalSize * scale) / 2;
  const groundY = height - pad;
  const deckY = groundY - deckHeight * scale;
  const packingY = deckY - packingHeight * scale;
  const cargoY = packingY - cargoHeight * scale;
  const cogHorizontal = view === "SIDE" ? cargo.cog.x : cargo.cog.y;
  const cogX = x + Math.max(0, Math.min(horizontalSize, cogHorizontal)) * scale;
  const cogY = packingY - Math.max(0, Math.min(cargoHeight, cargo.cog.z)) * scale;
  return (
    <svg className="arrangement-load-preview-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Live ${view === "SIDE" ? "side" : "rear"} view of cargo and packing stack`}>
      <line x1={pad / 2} y1={groundY} x2={width - pad / 2} y2={groundY} stroke="#61707d" />
      <rect x={x} y={deckY} width={horizontalSize * scale} height={Math.max(4, deckHeight * scale)} fill="rgba(219,231,243,.05)" stroke={stroke} />
      {packingHeight > 0 && <rect x={x} y={packingY} width={horizontalSize * scale} height={packingHeight * scale} fill="rgba(240,173,44,.12)" stroke={packingStroke} strokeWidth="2" />}
      <rect x={x} y={cargoY} width={horizontalSize * scale} height={cargoHeight * scale} fill="rgba(47,155,255,.08)" stroke={cargoStroke} strokeWidth="2" />
      <text x={x + 10} y={cargoY + 22} fill={stroke}>CARGO · {view}</text>
      {packingHeight > 0 && <text x={x + 10} y={packingY + 18} fill={packingStroke}>PACKING</text>}
      <circle cx={cogX} cy={cogY} r="7" fill="#050708" stroke="#ffd34e" strokeWidth="2" />
      <line x1={cogX - 13} y1={cogY} x2={cogX + 13} y2={cogY} stroke="#ffd34e" /><line x1={cogX} y1={cogY - 13} x2={cogX} y2={cogY + 13} stroke="#ffd34e" />
      <text x={cogX + 12} y={cogY - 12} fill="#ffd34e">COG</text>
    </svg>
  );
}

function moduleText(modules4: number, modules5: number, modules6: number): string {
  return [
    modules6 ? `${modules6}×6` : "",
    modules5 ? `${modules5}×5` : "",
    modules4 ? `${modules4}×4` : "",
  ].filter(Boolean).join(" + ") || "—";
}

function cargoPreviewSummary(model: ProjectModel): string {
  const cargo = model.cargo;
  return `${cargo.lengthM.toFixed(3)} × ${cargo.widthM.toFixed(3)} × ${cargo.heightM.toFixed(3)} m · ${cargo.massT.toFixed(2)} t`;
}

function issueStep(id: string): StepId {
  if (["cargo", "case-name", "cargo-cog"].includes(id)) return "cargo";
  if (["packing", "supports"].includes(id)) return "packing";
  if (["catalogue-model", "module-sizes", "module-availability", "ppu-data"].includes(id)) return "trailer";
  return "search";
}

function blankOrCurrent(activeModel: ProjectModel, source: InitialSource): ProjectModel {
  const model = source === "BLANK" ? createBlankSetupModel() : structuredClone(activeModel);
  return {
    ...model,
    arrangementOptimiser: {
      ...model.arrangementOptimiser,
      minimumClearanceM: MINIMUM_TRAIN_CLEARANCE_M,
      searchMode: source === "BLANK" ? "MATHEMATICAL_BRANCH_BOUND" : model.arrangementOptimiser.searchMode,
      trailerDefinitionId: source === "BLANK" ? "" : model.arrangementOptimiser.trailerDefinitionId,
      ppuPosition: source === "BLANK" ? "NONE" : model.arrangementOptimiser.ppuPosition,
    },
  };
}

function supportId(): string {
  return `support-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function ArrangementWizard({
  activeModel,
  calculating,
  initialSourceType = "CURRENT",
  onApply,
  onClose,
}: ArrangementWizardProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [draftModel, setDraftModel] = useState<ProjectModel>(() =>
    blankOrCurrent(activeModel, initialSourceType),
  );
  const [step, setStep] = useState<StepId>("cargo");
  const [initialised, setInitialised] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [loadPreviewView, setLoadPreviewView] = useState<LoadPreviewView>("PLAN");
  const [automaticSupportCount, setAutomaticSupportCount] = useState(4);

  const settings = draftModel.arrangementOptimiser;
  const environmentalSelection = useMemo(
    () => applyArrangementEnvironmentalActions(draftModel),
    [draftModel],
  );
  const cogEnvelopeGuidance = useMemo(
    () => cargoCogEnvelopeGuidance(draftModel.cargo),
    [draftModel.cargo],
  );
  const updateSettings = (patch: Partial<ArrangementOptimiserSettings>) =>
    setDraftModel((current) => ({
      ...current,
      arrangementOptimiser: { ...current.arrangementOptimiser, ...patch },
    }));
  const updateCargo = (patch: Partial<ProjectModel["cargo"]>) =>
    setDraftModel((current) => ({
      ...current,
      cargo: applyAutomaticCargoWindInputs(
        applyAutomaticCargoCogEnvelopeInputs({ ...current.cargo, ...patch }),
      ),
    }));
  const updatePacking = (patch: Partial<PackingInput>) =>
    setDraftModel((current) => ({
      ...current,
      packing: { ...current.packing, ...patch },
    }));

  const issues = useMemo(
    () => collectArrangementIssues(draftModel, settings),
    [draftModel, settings],
  );
  const blocking = issues.filter((item) => item.severity === "blocking");
  const stepIssues = issues.filter((item) => issueStep(item.id) === step);
  const stepIndex = STEPS.findIndex((item) => item.id === step);
  const definition = draftModel.catalogue.find((item) => item.id === settings.trailerDefinitionId);
  const planRows = useMemo(() => {
    if (!definition) return [];
    return Array.from(
      { length: Math.max(0, settings.maximumTrains - settings.minimumTrains + 1) },
      (_, offset) => settings.minimumTrains + offset,
    ).map((trainCount) => {
      const capacityLowerBound = minimumTotalAxleLines(draftModel, settings, trainCount);
      const minimumPerTrain = Math.ceil(capacityLowerBound / trainCount);
      const values = validAxleLineValues(settings, trainCount, minimumPerTrain);
      const first = values[0];
      const pitches = spacingCandidates(
        definition,
        settings,
        trainCount,
        draftModel.cargo.widthM,
      );
      return {
        trainCount,
        capacityLowerBound,
        first,
        pitches: pitches.length,
        formationTemplates: longitudinalOffsetCandidates(settings, trainCount).length,
        searches:
          values.length *
          pitches.length *
          longitudinalOffsetCandidates(settings, trainCount).length *
          (settings.hydraulicSearchMode === "BOTH" ? 2 : 1),
      };
    });
  }, [definition, draftModel, settings]);
  const plannedSearches = planRows.reduce((sum, row) => sum + row.searches, 0);
  const minimumCapacityStart = planRows.length
    ? Math.min(...planRows.map((row) => row.capacityLowerBound))
    : minimumTotalAxleLines(draftModel, settings);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = localStorage.getItem(ARRANGEMENT_WIZARD_DRAFT_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as {
            model?: ProjectModel;
            settings?: Partial<ArrangementOptimiserSettings>;
            step?: StepId;
            updatedAt?: string;
          };
          if (parsed.model) setDraftModel(hydrateProjectModel(parsed.model));
          else if (parsed.settings) {
            setDraftModel((current) => ({
              ...current,
              arrangementOptimiser: { ...current.arrangementOptimiser, ...parsed.settings },
            }));
          }
          if (STEPS.some((item) => item.id === parsed.step)) setStep(parsed.step!);
          if (parsed.updatedAt) setDraftSavedAt(parsed.updatedAt);
        }
      } catch {
        setNotice("The unfinished mathematical-search draft could not be read. Fresh values were loaded.");
      } finally {
        setInitialised(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!initialised) return;
    const timer = window.setTimeout(() => {
      try {
        const updatedAt = new Date().toISOString();
        localStorage.setItem(
          ARRANGEMENT_WIZARD_DRAFT_KEY,
          JSON.stringify({ version: 2, step, model: draftModel, updatedAt }),
        );
        setDraftSavedAt(updatedAt);
      } catch {
        setNotice("This browser could not autosave the mathematical-search draft.");
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [draftModel, initialised, step]);

  const canContinue = stepIssues.every((item) => item.severity !== "blocking");
  const canRun = blocking.length === 0 && plannedSearches > 0 && !calculating;
  const currentStep = STEPS[stepIndex];

  const centreCargoCog = () => updateCargo({
    cog: {
      x: draftModel.cargo.extremeX + draftModel.cargo.lengthM / 2,
      y: draftModel.cargo.extremeY + draftModel.cargo.widthM / 2,
      z: draftModel.cargo.heightM / 2,
    },
  });

  const createRecommendedSupports = () => {
    const supports = recommendedPackingSupports(draftModel, 0.5, automaticSupportCount).map((support) => ({
      ...support,
      id: supportId(),
    }));
    setDraftModel((current) => ({ ...current, supports }));
  };

  const renderCargo = () => (
    <>
      <FormSection title="Cargo case" description="Start with the load that the arrangement must support.">
        <div className="wizard-field-grid two">
          <TextField label="Case / cargo name" value={draftModel.cargo.name} required onChange={(name) => updateCargo({ name })} />
          <TextField label="Client reference" value={draftModel.cargo.clientReference} onChange={(clientReference) => updateCargo({ clientReference })} />
        </div>
      </FormSection>
      <FormSection title="Cargo geometry and mass" description="All coordinates use the rear-left load datum; rear is lower X and front is higher X.">
        <div className="wizard-field-grid three">
          <NumberField label="Length" value={draftModel.cargo.lengthM} unit="m" min={0} valid={draftModel.cargo.lengthM > 0} onChange={(lengthM) => updateCargo({ lengthM })} />
          <NumberField label="Width" value={draftModel.cargo.widthM} unit="m" min={0} valid={draftModel.cargo.widthM > 0} onChange={(widthM) => updateCargo({ widthM })} />
          <NumberField label="Height" value={draftModel.cargo.heightM} unit="m" min={0} valid={draftModel.cargo.heightM > 0} onChange={(heightM) => updateCargo({ heightM })} />
          <NumberField label="Rear X extreme" value={draftModel.cargo.extremeX} unit="m" onChange={(extremeX) => updateCargo({ extremeX })} />
          <NumberField label="Left Y extreme" value={draftModel.cargo.extremeY} unit="m" onChange={(extremeY) => updateCargo({ extremeY })} />
          <NumberField label="Cargo mass" value={draftModel.cargo.massT} unit="t" min={0} valid={draftModel.cargo.massT > 0} onChange={(massT) => updateCargo({ massT })} />
        </div>
      </FormSection>
      <FormSection title="Cargo COG">
        <div className="wizard-field-grid three">
          <NumberField label="COG X" value={draftModel.cargo.cog.x} unit="m" onChange={(x) => updateCargo({ cog: { ...draftModel.cargo.cog, x } })} />
          <NumberField label="COG Y" value={draftModel.cargo.cog.y} unit="m" onChange={(y) => updateCargo({ cog: { ...draftModel.cargo.cog, y } })} />
          <NumberField label="COG Z" value={draftModel.cargo.cog.z} unit="m" min={0} onChange={(z) => updateCargo({ cog: { ...draftModel.cargo.cog, z } })} />
        </div>
        <div className="arrangement-inline-actions">
          <button type="button" onClick={centreCargoCog}><IconTargetArrow size={14} /> Centre COG in cargo</button>
        </div>
      </FormSection>
      <FormSection title="Automatic load allowances" description="Both are enabled for a new mathematical-search case.">
        {cogEnvelopeGuidance.warnings.length > 0 && (
          <div className="wizard-notice warning">
            <IconAlertTriangle size={15} />
            <span>{cogEnvelopeGuidance.warnings.join(" ")}</span>
          </div>
        )}
        <label className="wizard-toggle">
          <input
            type="checkbox"
            checked={draftModel.cargo.autoCogEnvelopeFromCargo}
            onChange={(event) => updateCargo({
              autoCogEnvelopeFromCargo: event.target.checked,
              ...(event.target.checked ? derivedCargoCogEnvelopeInputs(draftModel.cargo) : {}),
            })}
          />
          <span><b>Auto-calculate COG envelope</b><small>±2.5% of cargo length/width, with a 0.100 m automatic minimum</small></span>
        </label>
        <div className="wizard-field-grid two">
          <NumberField
            label="Envelope X ±"
            value={draftModel.cargo.envelopeX}
            unit="m"
            min={0}
            disabled={draftModel.cargo.autoCogEnvelopeFromCargo}
            valid={draftModel.cargo.envelopeX >= 0 && (draftModel.cargo.autoCogEnvelopeFromCargo || (!cogEnvelopeGuidance.x.belowAdvisedMinimum && !cogEnvelopeGuidance.x.belowAbsoluteMinimum))}
            hint={draftModel.cargo.autoCogEnvelopeFromCargo ? `Automatic ${cogEnvelopeGuidance.x.automaticM.toFixed(3)} m` : `Manual; advised 2% = ${cogEnvelopeGuidance.x.advisedMinimumM.toFixed(3)} m; under 0.100 m not advised`}
            onChange={(envelopeX) => updateCargo({ envelopeX })}
          />
          <NumberField
            label="Envelope Y ±"
            value={draftModel.cargo.envelopeY}
            unit="m"
            min={0}
            disabled={draftModel.cargo.autoCogEnvelopeFromCargo}
            valid={draftModel.cargo.envelopeY >= 0 && (draftModel.cargo.autoCogEnvelopeFromCargo || (!cogEnvelopeGuidance.y.belowAdvisedMinimum && !cogEnvelopeGuidance.y.belowAbsoluteMinimum))}
            hint={draftModel.cargo.autoCogEnvelopeFromCargo ? `Automatic ${cogEnvelopeGuidance.y.automaticM.toFixed(3)} m` : `Manual; advised 2% = ${cogEnvelopeGuidance.y.advisedMinimumM.toFixed(3)} m; under 0.100 m not advised`}
            onChange={(envelopeY) => updateCargo({ envelopeY })}
          />
        </div>
        <label className="wizard-toggle">
          <input
            type="checkbox"
            checked={draftModel.cargo.autoWindFromCargo}
            onChange={(event) => updateCargo({
              autoWindFromCargo: event.target.checked,
              ...(event.target.checked ? derivedCargoWindInputs(draftModel.cargo) : {}),
            })}
          />
          <span><b>Auto-calculate wind areas</b><small>Cargo projected areas acting at half cargo height</small></span>
        </label>
      </FormSection>
    </>
  );

  const renderPacking = () => (
    <>
      <FormSection title="Packing and trailer deck" description="Packing mass and COG are included in the all-inclusive load calculation.">
        <div className="wizard-field-grid three">
          <NumberField label="Packing mass" value={draftModel.packing.massT} unit="t" min={0} onChange={(massT) => updatePacking({ massT })} />
          <NumberField label="Packing height" value={draftModel.packing.heightM} unit="m" min={0} onChange={(heightM) => updatePacking({ heightM })} />
          <NumberField label="Trailer deck height" value={draftModel.trailerDeckHeightM} unit="m" min={0.001} valid={draftModel.trailerDeckHeightM > 0} onChange={(trailerDeckHeightM) => setDraftModel((current) => ({ ...current, trailerDeckHeightM }))} />
          <NumberField label="Packing COG X" value={draftModel.packing.cog.x} unit="m" onChange={(x) => updatePacking({ cog: { ...draftModel.packing.cog, x } })} />
          <NumberField label="Packing COG Y" value={draftModel.packing.cog.y} unit="m" onChange={(y) => updatePacking({ cog: { ...draftModel.packing.cog, y } })} />
          <NumberField label="Packing COG Z" value={draftModel.packing.cog.z} unit="m" min={0} onChange={(z) => updatePacking({ cog: { ...draftModel.packing.cog, z } })} />
        </div>
      </FormSection>
      <FormSection title="Cargo packing supports" description="Support reactions are settled after every arrangement change. At least the configured minimum must remain active.">
        <div className="arrangement-inline-actions">
          <NumberField label="Equal support count" value={automaticSupportCount} min={2} max={10} step={1} valid={Number.isInteger(automaticSupportCount) && automaticSupportCount >= 2 && automaticSupportCount <= 10} onChange={(value) => setAutomaticSupportCount(Math.round(value))} />
          <button type="button" onClick={createRecommendedSupports}><IconTargetArrow size={14} /> Create {automaticSupportCount} equal supports</button>
          <button
            type="button"
            disabled={draftModel.supports.length >= 10}
            onClick={() => setDraftModel((current) => ({
              ...current,
              supports: [...current.supports, {
                id: supportId(),
                xM: current.cargo.extremeX + current.cargo.lengthM / 2,
                widthM: 0.5,
                allowed: true,
                active: true,
                positiveConnectionToDeck: false,
              }],
            }))}
          ><IconPlus size={14} /> Add support</button>
        </div>
        <div className="fast-support-list">
          {draftModel.supports.map((support, index) => (
            <div className="fast-support-row" key={support.id}>
              <b>S{index + 1}</b>
              <NumberField label="X location" value={support.xM} unit="m" onChange={(xM) => setDraftModel((current) => ({ ...current, supports: current.supports.map((item) => item.id === support.id ? { ...item, xM } : item) }))} />
              <NumberField label="Width" value={support.widthM} unit="m" min={0.001} valid={support.widthM > 0} onChange={(widthM) => setDraftModel((current) => ({ ...current, supports: current.supports.map((item) => item.id === support.id ? { ...item, widthM } : item) }))} />
              <label className="fast-support-allowed"><input type="checkbox" checked={support.allowed} onChange={(event) => setDraftModel((current) => ({ ...current, supports: current.supports.map((item) => item.id === support.id ? { ...item, allowed: event.target.checked, active: event.target.checked } : item) }))} /><span>Allowed</span></label>
              <label className="fast-support-allowed"><input type="checkbox" checked={support.positiveConnectionToDeck === true} onChange={(event) => setDraftModel((current) => ({ ...current, supports: current.supports.map((item) => item.id === support.id ? { ...item, positiveConnectionToDeck: event.target.checked } : item) }))} /><span>Positive connection</span></label>
              <button type="button" className="icon-button" aria-label={`Remove support ${index + 1}`} onClick={() => setDraftModel((current) => ({ ...current, supports: current.supports.filter((item) => item.id !== support.id) }))}><IconTrash size={14} /></button>
            </div>
          ))}
          {!draftModel.supports.length && <p className="fast-support-empty">No packing supports entered. Add them manually or create an equal support proposal spanning the cargo-and-packing COG.</p>}
        </div>
        {draftModel.supports.some((support) => support.positiveConnectionToDeck) && (
          <div className="wizard-notice warning"><IconAlertTriangle size={15} /><span>Positive support connection enabled. Retained negative reactions are tensile design actions and require a verified packing-to-deck or spine-beam connection.</span></div>
        )}
        <div className="wizard-field-grid two">
          <NumberField label="Minimum active supports" value={draftModel.optimiser.minimumActiveSupports} min={2} max={10} step={1} valid={Number.isInteger(draftModel.optimiser.minimumActiveSupports) && draftModel.optimiser.minimumActiveSupports >= 2 && draftModel.optimiser.minimumActiveSupports <= 10} onChange={(minimumActiveSupports) => setDraftModel((current) => ({ ...current, optimiser: { ...current.optimiser, minimumActiveSupports: Math.round(minimumActiveSupports) } }))} />
        </div>
      </FormSection>
    </>
  );

  const renderTrailer = () => (
    <>
      <FormSection title="Trailer family" description="Every generated parallel train uses the same selected catalogue model.">
        <label className={`wizard-field is-${definition ? "valid" : "invalid"}`}>
          <span>SPMT trailer model</span>
          <select value={settings.trailerDefinitionId} onChange={(event) => updateSettings({ trailerDefinitionId: event.target.value })}>
            <option value="">Select trailer…</option>
            {draftModel.catalogue.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.category}</option>)}
          </select>
          {definition && <small>{definition.axleCapacityT.toFixed(1)} t/AL capacity · {definition.trailerWidthM.toFixed(3)} m wide · {definition.axleSpacingM.toFixed(3)} m AL spacing</small>}
        </label>
        <NumberField label="Trailer deck height" value={draftModel.trailerDeckHeightM} unit="m" min={0.001} valid={draftModel.trailerDeckHeightM > 0} onChange={(trailerDeckHeightM) => setDraftModel((current) => ({ ...current, trailerDeckHeightM }))} />
      </FormSection>
      <FormSection title="Power-pack unit">
        <label className="wizard-field is-valid">
          <span>PPU location on every train</span>
          <select value={settings.ppuPosition} onChange={(event) => updateSettings({ ppuPosition: event.target.value as ArrangementOptimiserSettings["ppuPosition"] })}>
            <option value="NONE">No PPU included</option>
            <option value="REAR">Rear end · lower X · left in plan</option>
            <option value="FRONT">Front end · higher X · right in plan</option>
            <option value="BOTH">Both ends · rear and front PPU</option>
          </select>
          <small>The PPU mass is included in the minimum axle-line capacity bound.</small>
        </label>
      </FormSection>
      <FormSection title="Hydraulic suspension search" description="The solver can test both supported hydraulic systems against the same trailer formation.">
        <label className="wizard-field is-valid">
          <span>Hydraulic systems to search</span>
          <select
            value={settings.hydraulicSearchMode}
            onChange={(event) => updateSettings({
              hydraulicSearchMode: event.target.value as ArrangementOptimiserSettings["hydraulicSearchMode"],
            })}
          >
            <option value="BOTH">Both 3-point and 4-point (recommended)</option>
            <option value="THREE_POINT">Three-point only (stability triangle)</option>
            <option value="FOUR_POINT">Four-point only (convex stability polygon)</option>
          </select>
          <small>Both evaluates and records each viable triangle and four-corner polygon. Applying a pass also applies its hydraulic system.</small>
        </label>
      </FormSection>
      <FormSection title="Road transport analysis" description="Optional powered-traction and braking check using the configured surface and module data.">
        <label className="wizard-toggle">
          <input
            type="checkbox"
            checked={draftModel.roadTransport.enabled}
            onChange={(event) => setDraftModel((current) => ({
              ...current,
              roadTransport: { ...current.roadTransport, enabled: event.target.checked },
            }))}
          />
          <span><b>Check road transport traction and braking</b><small>Uses adhesion, rolling resistance, route grade, PPU drive limit and the recovered 60/55 kN bogie limits.</small></span>
        </label>
        <div className="wizard-field-grid three">
          <label className="wizard-field is-valid">
            <span>Road surface</span>
            <select
              disabled={!draftModel.roadTransport.enabled}
              value={draftModel.roadTransport.surface}
              onChange={(event) => setDraftModel((current) => ({
                ...current,
                roadTransport: { ...current.roadTransport, surface: event.target.value as ProjectModel["roadTransport"]["surface"] },
              }))}
            >
              {ROAD_SURFACES.map((surface) => <option key={surface.id} value={surface.id}>{surface.label}</option>)}
            </select>
          </label>
          <label className="wizard-field is-valid">
            <span>Surface condition</span>
            <select disabled={!draftModel.roadTransport.enabled} value={draftModel.roadTransport.condition} onChange={(event) => setDraftModel((current) => ({ ...current, roadTransport: { ...current.roadTransport, condition: event.target.value as ProjectModel["roadTransport"]["condition"] } }))}>
              <option value="DRY">Dry</option><option value="WET">Wet</option>
            </select>
          </label>
          <label className="wizard-field is-valid">
            <span>PPU drive capacity</span>
            <select disabled={!draftModel.roadTransport.enabled} value={draftModel.roadTransport.ppuCapacity} onChange={(event) => setDraftModel((current) => ({ ...current, roadTransport: { ...current.roadTransport, ppuCapacity: event.target.value as ProjectModel["roadTransport"]["ppuCapacity"] } }))}>
              <option value="STANDARD_26">Standard · 26 driven bogies/PPU</option>
              <option value="ALASKA_32">Alaska · 32 driven bogies/PPU</option>
              <option value="CUSTOM">Custom verified limit</option>
            </select>
          </label>
          <NumberField label="Transport speed" value={draftModel.roadTransport.speedKph} unit="km/h" min={0} disabled={!draftModel.roadTransport.enabled} onChange={(speedKph) => setDraftModel((current) => ({ ...current, roadTransport: { ...current.roadTransport, speedKph } }))} />
          <NumberField label="Drive acceleration" value={draftModel.roadTransport.driveAccelerationMps2} unit="m/s²" min={0} disabled={!draftModel.roadTransport.enabled} onChange={(driveAccelerationMps2) => setDraftModel((current) => ({ ...current, roadTransport: { ...current.roadTransport, driveAccelerationMps2 } }))} />
          <NumberField label="Brake deceleration" value={draftModel.roadTransport.brakeDecelerationMps2} unit="m/s²" min={0} disabled={!draftModel.roadTransport.enabled} onChange={(brakeDecelerationMps2) => setDraftModel((current) => ({ ...current, roadTransport: { ...current.roadTransport, brakeDecelerationMps2 } }))} />
          {draftModel.roadTransport.ppuCapacity === "CUSTOM" && <NumberField label="Driven bogies per PPU" value={draftModel.roadTransport.customDrivenBogieLimit} min={0} step={1} disabled={!draftModel.roadTransport.enabled} onChange={(customDrivenBogieLimit) => setDraftModel((current) => ({ ...current, roadTransport: { ...current.roadTransport, customDrivenBogieLimit: Math.round(customDrivenBogieLimit) } }))} />}
        </div>
      </FormSection>
      <FormSection title="Available 4/5/6-AL modules" description="Only axle-line totals that can be built exactly from these module sizes are searched.">
        <div className="arrangement-module-grid">
          {([4, 5, 6] as const).map((size) => {
            const allowedKey = `allow${size}AxleModules` as const;
            const availabilityKey = `available${size}AxleModules` as const;
            const allowed = settings[allowedKey];
            return (
              <div key={size} className={allowed ? "selected" : ""}>
                <label><input type="checkbox" checked={allowed} onChange={(event) => updateSettings({ [allowedKey]: event.target.checked })} /><span><b>{size} AL</b><small>SPMT module</small></span></label>
                <NumberField label="Available" value={settings[availabilityKey]} min={0} step={1} disabled={!settings.limitModuleAvailability || !allowed} valid={!settings.limitModuleAvailability || (Number.isInteger(settings[availabilityKey]) && settings[availabilityKey] >= 0)} onChange={(value) => updateSettings({ [availabilityKey]: Math.round(value) })} />
              </div>
            );
          })}
        </div>
        <label className="wizard-toggle arrangement-stock-toggle"><input type="checkbox" checked={settings.limitModuleAvailability} onChange={(event) => updateSettings({ limitModuleAvailability: event.target.checked })} /><span><b>Limit by available stock</b><small>When off, enabled module sizes are unlimited.</small></span></label>
      </FormSection>
    </>
  );

  const renderSearch = () => (
    <>
      <FormSection title="Search method" description="The mathematical solver removes impossible formations first, solves the allowable X/Y region, then verifies retained cases with the full engineering engine.">
        <label className="wizard-field is-valid">
          <span>Arrangement search method</span>
          <select value={settings.searchMode} onChange={(event) => updateSettings({ searchMode: event.target.value as ArrangementOptimiserSettings["searchMode"] })}>
            <option value="MATHEMATICAL_BRANCH_BOUND">Mathematical branch &amp; bound · recommended</option>
            <option value="ADAPTIVE_BOUNDED">Legacy fast bounded search</option>
            <option value="LEGACY_GRID">Legacy full grid search</option>
          </select>
          <small>{settings.searchMode === "MATHEMATICAL_BRANCH_BOUND"
            ? "Uses lower/upper axle bounds, the COG-height and dynamic hydraulic Y-span requirement, stability-feasible X limits and support-footprint pruning before converging on a passing pitch."
            : settings.searchMode === "ADAPTIVE_BOUNDED"
              ? "Retains the previous preferred-and-limiting-value bounded search."
              : "Retains the previous complete coarse sampling sequence."}</small>
        </label>
      </FormSection>
      <FormSection title="Economic bounds" description="Total axle lines are the first hard priority. Fewer trains are preferred only when two valid formations use the same total AL.">
        <div className="wizard-field-grid three">
          <NumberField label="Minimum trains" value={settings.minimumTrains} min={1} max={12} step={1} valid={Number.isInteger(settings.minimumTrains) && settings.minimumTrains >= 1 && settings.minimumTrains <= settings.maximumTrains} onChange={(value) => updateSettings({ minimumTrains: Math.round(value) })} />
          <NumberField label="Maximum trains" value={settings.maximumTrains} min={1} max={12} step={1} valid={Number.isInteger(settings.maximumTrains) && settings.maximumTrains >= settings.minimumTrains && settings.maximumTrains <= 12} onChange={(value) => updateSettings({ maximumTrains: Math.round(value) })} />
          <NumberField label="Maximum AL per train" value={settings.maximumAxleLinesPerTrain} min={4} max={99} step={1} valid={Number.isInteger(settings.maximumAxleLinesPerTrain) && settings.maximumAxleLinesPerTrain >= 4} onChange={(value) => updateSettings({ maximumAxleLinesPerTrain: Math.round(value) })} />
        </div>
      </FormSection>
      <FormSection title="Formation spacing" description="The preferred spacing is ranked first, but independent wider and narrower spacing candidates are also verified.">
        <div className="wizard-field-grid three">
          <NumberField label="Preferred centre spacing" value={settings.preferredCentreSpacingM} unit="m" min={0.1} step={0.1} valid={settings.preferredCentreSpacingM > 0} onChange={(preferredCentreSpacingM) => updateSettings({ preferredCentreSpacingM })} />
          <NumberField label="Minimum train clearance" value={MINIMUM_TRAIN_CLEARANCE_M} unit="m" disabled hint="Fixed engineering clearance between neighbouring trailer edges." onChange={() => undefined} />
          <NumberField label="Maximum overall width" value={settings.maximumFormationWidthM} unit="m" min={0.1} step={0.1} onChange={(maximumFormationWidthM) => updateSettings({ maximumFormationWidthM })} />
          <NumberField label="Search ceiling when width is off" value={settings.searchMaximumFormationWidthM} unit="m" min={0.1} step={0.1} valid={settings.searchMaximumFormationWidthM > 0} onChange={(searchMaximumFormationWidthM) => updateSettings({ searchMaximumFormationWidthM })} />
          <NumberField label="Spacing seed count" value={settings.spacingSamples} min={2} max={7} step={1} valid={Number.isInteger(settings.spacingSamples) && settings.spacingSamples >= 2 && settings.spacingSamples <= 7} onChange={(value) => updateSettings({ spacingSamples: Math.round(value) })} />
          <NumberField label="Convergence tolerance" value={settings.spacingToleranceM} unit="m" min={0.001} step={0.01} onChange={(spacingToleranceM) => updateSettings({ spacingToleranceM })} />
        </div>
        <label className="wizard-toggle">
          <input
            type="checkbox"
            checked={settings.enforceMaximumFormationWidth}
            onChange={(event) => updateSettings({ enforceMaximumFormationWidth: event.target.checked })}
          />
          <span>
            <b>Enforce maximum overall width</b>
            <small>
              Off by default. When off, the maximum overall width is not a pass/fail limit; the search ceiling only keeps the spacing search finite.
            </small>
          </span>
        </label>
        <label className="wizard-toggle">
          <input
            type="checkbox"
            checked={settings.limitFormationWidthToCargo}
            onChange={(event) => updateSettings({ limitFormationWidthToCargo: event.target.checked })}
          />
          <span>
            <b>Limit trailer outside edges to cargo width</b>
            <small>
              When on, generated train Y positions are rejected unless the full trailer formation fits between the cargo left and right edges.
            </small>
          </span>
        </label>
      </FormSection>
      <FormSection title="Longitudinal formation" description="Allow trains to be staggered in X without expanding an independent grid for every train.">
        <label className="wizard-field is-valid">
          <span>Formation templates</span>
          <select value={settings.formationMode} onChange={(event) => updateSettings({ formationMode: event.target.value as ArrangementOptimiserSettings["formationMode"] })}>
            <option value="ALLOW_STAGGERED">In-line plus bounded staggered templates · recommended</option>
            <option value="INLINE_ONLY">In-line trains only · legacy</option>
          </select>
          <small>Staggered mode checks mirrored linear X layouts in increasing complexity; the exact longitudinal solver then moves the complete formation.</small>
        </label>
        <div className="wizard-field-grid two">
          <NumberField label="Maximum end-to-end stagger" value={settings.maximumLongitudinalStaggerM} unit="m" min={0} disabled={settings.formationMode === "INLINE_ONLY"} onChange={(maximumLongitudinalStaggerM) => updateSettings({ maximumLongitudinalStaggerM })} />
          <NumberField label="Stagger template samples" value={settings.longitudinalStaggerSamples} min={1} max={7} step={1} disabled={settings.formationMode === "INLINE_ONLY"} onChange={(longitudinalStaggerSamples) => updateSettings({ longitudinalStaggerSamples: Math.round(longitudinalStaggerSamples) })} />
        </div>
      </FormSection>
      <FormSection title="Search-only wind and acceleration" description="The project design actions are retained unless this explicit override is enabled.">
        <label className="wizard-toggle">
          <input
            type="checkbox"
            checked={settings.allowReducedEnvironmentalActions}
            onChange={(event) => updateSettings({
              allowReducedEnvironmentalActions: event.target.checked,
              reducedEnvironmentalActionsAccepted: false,
              ...(event.target.checked ? {
                searchWindSpeedMps: draftModel.environment.windSpeedMps,
                searchLongitudinalAccelerationMps2: draftModel.environment.longitudinalAccelerationMps2,
                searchTransverseAccelerationMps2: draftModel.environment.transverseAccelerationMps2,
              } : {}),
            })}
          />
          <span><b>Allow alternative wind and acceleration values</b><small>Any reduction below the active project values changes the applied case to Third-degree verification.</small></span>
        </label>
        <div className="wizard-field-grid three">
          <NumberField label="Search wind speed" value={settings.searchWindSpeedMps} unit="m/s" min={0} disabled={!settings.allowReducedEnvironmentalActions} onChange={(searchWindSpeedMps) => updateSettings({ searchWindSpeedMps })} />
          <NumberField label="Search longitudinal acceleration" value={settings.searchLongitudinalAccelerationMps2} unit="m/s²" min={0} disabled={!settings.allowReducedEnvironmentalActions} onChange={(searchLongitudinalAccelerationMps2) => updateSettings({ searchLongitudinalAccelerationMps2 })} />
          <NumberField label="Search transverse acceleration" value={settings.searchTransverseAccelerationMps2} unit="m/s²" min={0} disabled={!settings.allowReducedEnvironmentalActions} onChange={(searchTransverseAccelerationMps2) => updateSettings({ searchTransverseAccelerationMps2 })} />
        </div>
        {settings.allowReducedEnvironmentalActions && (
          <div className={`wizard-notice${environmentalSelection.reduced ? " warning" : ""}`}>
            <IconAlertTriangle size={15} />
            <span>{environmentalSelection.detail}</span>
          </div>
        )}
      </FormSection>
      <FormSection title="Mathematical planner sequence">
        <ol className="arrangement-rule-list">
          <li><b>1</b><span>Calculate gross capacity bounds including packing, tare, PPU and configured axle utilisation.</span></li>
          <li><b>2</b><span>Generate only constructible 4/5/6-AL module combinations.</span></li>
          <li><b>3</b><span>Intersect the stability inequalities to solve the longitudinal X interval for every load-case COG point.</span></li>
          <li><b>4</b><span>Verify preferred and independent Y spacings across the enabled in-line and bounded staggered X templates.</span></li>
          <li><b>5</b><span>Run a complete final engineering, hydraulic, support and optional road-transport search on the winning formation.</span></li>
        </ol>
      </FormSection>
    </>
  );

  const renderReview = () => (
    <>
      <FormSection title="Mathematical arrangement preflight">
        {blocking.length ? (
          <div className="wizard-issue-list">{blocking.map((issue) => <div key={issue.id} className="blocking"><IconX size={14} /><span><b>{issue.title}</b><small>{issue.detail}</small></span></div>)}</div>
        ) : (
          <div className="arrangement-ready"><IconCheck size={18} /><span><b>Ready to search for the minimum SPMT arrangement</b><small>Every retained case still runs the complete engineering and iterative support-settling calculation.</small></span></div>
        )}
      </FormSection>
      <FormSection title="Hard objective order">
        <div className="arrangement-objectives">
          <span><i>1</i><b>Engineering PASS</b><small>All active checks and minimum supports</small></span>
          <span><i>2</i><b>Minimum trains</b><small>First feasible train-count level</small></span>
          <span><i>3</i><b>Minimum total AL</b><small>First buildable axle-count level</small></span>
          <span><i>4</i><b>Safety and support reserve</b><small>More active supports, stability margin and lower utilisation</small></span>
          <span><i>5</i><b>Physical quality</b><small>Lower deflection, stronger hydraulic altitude and balanced group loading</small></span>
          <span><i>6</i><b>Spacing and rating</b><small>Closest to {settings.preferredCentreSpacingM.toFixed(2)} m, then current engineering weighting</small></span>
        </div>
      </FormSection>
    </>
  );

  const form = step === "cargo"
    ? renderCargo()
    : step === "packing"
      ? renderPacking()
      : step === "trailer"
        ? renderTrailer()
        : step === "search"
          ? renderSearch()
          : renderReview();

  const discard = () => {
    if (!window.confirm("Discard this arrangement-search draft?")) return;
    localStorage.removeItem(ARRANGEMENT_WIZARD_DRAFT_KEY);
    onClose();
  };
  const reset = () => {
    setDraftModel(blankOrCurrent(activeModel, initialSourceType));
    setStep("cargo");
  };
  const apply = (run: boolean) => {
    if (blocking.length > 0 || (run && !canRun)) return;
    localStorage.removeItem(ARRANGEMENT_WIZARD_DRAFT_KEY);
    const selectedActions = applyArrangementEnvironmentalActions(structuredClone(draftModel));
    onApply(hydrateProjectModel(selectedActions.model), run);
  };

  return (
    <dialog ref={dialogRef} className="setup-wizard-dialog arrangement-wizard-dialog" aria-labelledby="arrangement-wizard-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <div className={`setup-wizard-shell optimiser-wizard-shell arrangement-wizard-shell${previewExpanded ? " preview-expanded" : ""}`}>
        <header className="setup-wizard-header">
          <div><span>ARRANGEMENT SEARCH</span><h2 id="arrangement-wizard-title">{currentStep.label}</h2></div>
          <div className="setup-wizard-mobile-progress"><span>{stepIndex + 1} / {STEPS.length} · {currentStep.label}</span><div><i style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }} /></div></div>
          <button type="button" className="icon-button" aria-label="Save draft and close" onClick={onClose}><IconX size={16} /></button>
        </header>
        <nav className="setup-wizard-rail" aria-label="Mathematical arrangement setup steps">
          <div className="setup-wizard-rail-title"><span>ARRANGEMENT SEARCH</span><b>Find minimum SPMT formation</b></div>
          <ol>{STEPS.map((item, index) => { const active = item.id === step; const complete = index < stepIndex; return <li key={item.id}><button type="button" className={`${active ? "active" : ""}${complete ? " complete" : ""}`} onClick={() => setStep(item.id)}><i>{complete ? <IconCheck size={13} /> : item.icon}</i><span><b>{item.label}</b><small>{item.description}</small></span></button></li>; })}</ol>
          <div className="setup-wizard-rail-footer"><span><i className="ok" /> Exact retained calculations</span><span>{draftSavedAt ? `Draft saved ${new Date(draftSavedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Draft autosave pending"}</span></div>
        </nav>
        <section className="setup-wizard-form-pane" aria-label={`${currentStep.label} inputs`}>
          <div className="setup-wizard-form-heading"><span>STEP {stepIndex + 1} / {STEPS.length}</span><h2>{currentStep.label}</h2><p>{currentStep.description}</p></div>
          {notice && <div className="wizard-notice"><IconAlertTriangle size={15} /><span>{notice}</span><button type="button" className="icon-button" onClick={() => setNotice(null)}><IconX size={13} /></button></div>}
          {form}
          {step !== "review" && stepIssues.length > 0 && <FormSection title="Step preflight"><div className="wizard-issue-list">{stepIssues.map((issue) => <div key={issue.id} className={issue.severity}><IconAlertTriangle size={14} /><span><b>{issue.title}</b><small>{issue.detail}</small></span></div>)}</div></FormSection>}
        </section>
        <section className="setup-wizard-preview arrangement-wizard-preview" aria-label="Mathematical arrangement plan">
          <div className="setup-wizard-preview-status"><div><span>SEARCH PLAN</span><b>{draftModel.cargo.name || "New arrangement case"}</b></div><div className="wizard-preview-status-actions"><div className={calculating ? "working" : "ready"}>{calculating && <IconLoader2 size={14} />}<span>{calculating ? "Active case updating" : "Inputs ready"}</span></div><button type="button" className="mobile-preview-toggle" onClick={() => setPreviewExpanded((current) => !current)} aria-expanded={previewExpanded} aria-label={previewExpanded ? "Return to inputs" : "Expand preview"}>{previewExpanded ? <IconArrowsMinimize size={14} /> : <IconArrowsMaximize size={14} />}<span>{previewExpanded ? "Return to inputs" : "Expand preview"}</span></button></div></div>
          {(step === "cargo" || step === "packing") && <div className="arrangement-load-preview">
            <nav aria-label="Cargo preview views">{(["PLAN", "SIDE", "REAR"] as LoadPreviewView[]).map((item) => <button type="button" key={item} className={loadPreviewView === item ? "active" : ""} onClick={() => setLoadPreviewView(item)}>{item === "REAR" ? "Rear" : item === "SIDE" ? "Side" : "Plan"}</button>)}</nav>
            <ArrangementLoadPreview model={draftModel} view={loadPreviewView} />
            <footer><span>{cargoPreviewSummary(draftModel)}</span><span>Rear = lower X · front = higher X</span></footer>
          </div>}
          {step !== "cargo" && step !== "packing" && <><div className="arrangement-preview-hero"><span>CAPACITY-DERIVED START</span><b>{minimumCapacityStart} <small>total AL</small></b><p>Gross load, trailer tare, selected PPU mass and the axle-utilisation limit are included before module rounding.</p></div>
          <div className="arrangement-plan-table">
            <header><b>First buildable candidates</b><span>{settings.searchMode === "MATHEMATICAL_BRANCH_BOUND" ? `${plannedSearches.toLocaleString()} bounded formation levels` : settings.searchMode === "ADAPTIVE_BOUNDED" ? `${plannedSearches.toLocaleString()} bounded seed cases` : `${plannedSearches.toLocaleString()} legacy formation searches`}</span></header>
            {planRows.map((row) => <div key={row.trainCount}><span><b>{row.trainCount}</b><small>train{row.trainCount === 1 ? "" : "s"}</small></span><span><b>{row.first?.axleLines ?? "—"} AL/train</b><small>{row.first ? moduleText(row.first.composition.modules4, row.first.composition.modules5, row.first.composition.modules6) : "No stock combination"}</small></span><span><b>{row.first ? row.first.axleLines * row.trainCount : "—"} total AL</b><small>{row.pitches} Y seed{row.pitches === 1 ? "" : "s"} · {row.formationTemplates} X template{row.formationTemplates === 1 ? "" : "s"}</small></span></div>)}
            {!planRows.length && <p className="fast-support-empty">Select a trailer and enter valid search bounds to create the plan.</p>}
          </div></>}
          <div className="arrangement-preview-facts"><span><small>Payload mass</small><b>{(draftModel.cargo.massT + draftModel.packing.massT + draftModel.loosePacking.reduce((sum, item) => sum + Math.max(0, item.massT), 0)).toFixed(2)} t</b></span><span><small>Selected trailer</small><b>{definition?.name ?? "Not selected"}</b></span><span><small>Deck height</small><b>{draftModel.trailerDeckHeightM.toFixed(3)} m</b></span><span><small>PPU</small><b>{settings.ppuPosition === "NONE" ? "None" : settings.ppuPosition === "REAR" ? "Rear" : settings.ppuPosition === "FRONT" ? "Front" : "Both ends"}</b></span><span><small>Hydraulics</small><b>{settings.hydraulicSearchMode === "BOTH" ? "3-point + 4-point" : settings.hydraulicSearchMode === "FOUR_POINT" ? "4-point only" : "3-point only"}</b></span><span><small>Formation</small><b>{settings.formationMode === "ALLOW_STAGGERED" ? "In-line + staggered" : "In-line only"}</b></span><span><small>Road check</small><b>{draftModel.roadTransport.enabled ? "Active" : "Off"}</b></span><span><small>Verification</small><b>{environmentalSelection.reduced ? "Third degree" : draftModel.engineeringDegree}</b></span></div>
          <div className="setup-wizard-preview-findings">{blocking.length ? <span className="blocking"><IconX size={13} /> {blocking.length} blocking</span> : <span className="valid"><IconCheck size={13} /> Search valid</span>}</div>
        </section>
        <footer className="setup-wizard-footer">
          <div className="setup-wizard-footer-secondary"><button type="button" className="wizard-discard" onClick={discard}><IconTrash size={14} /> Discard</button><button type="button" onClick={reset}><IconTargetArrow size={14} /> Reset {initialSourceType === "BLANK" ? "blank" : "current"}</button><button type="button" disabled={blocking.length > 0} onClick={() => apply(false)}>Save case & close</button></div>
          <div className="setup-wizard-footer-primary">{stepIndex > 0 && <button type="button" onClick={() => setStep(STEPS[stepIndex - 1].id)}><IconChevronLeft size={15} /> Back</button>}{step !== "review" ? <button type="button" className="wizard-primary" disabled={!canContinue} onClick={() => setStep(STEPS[Math.min(STEPS.length - 1, stepIndex + 1)].id)}>Next <IconChevronRight size={15} /></button> : <button type="button" className="wizard-primary optimiser-start-action" disabled={!canRun} onClick={() => apply(true)}><IconPlayerPlay size={15} /> Run arrangement search</button>}</div>
        </footer>
      </div>
    </dialog>
  );
}
