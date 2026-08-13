"use client";

import {
  IconAdjustments,
  IconAlertTriangle,
  IconArrowsHorizontal,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconFilterCheck,
  IconGitCompare,
  IconLoader2,
  IconPlayerPlay,
  IconRefresh,
  IconScale,
  IconStack2,
  IconTargetArrow,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { weightsForPreset } from "../../engine/optimiser";
import {
  canRunOptimiserWizard,
  collectOptimiserWizardIssues,
  createOptimiserWizardDraftPayload,
  estimateOptimiserPlan,
  hydrateOptimiserWizardDraftPayload,
  OPTIMISER_STEPS,
  OPTIMISER_WIZARD_DRAFT_STORAGE_KEY,
  optimiserIssuesForStep,
  optimiserStepCanContinue,
  type OptimiserStepId,
  type OptimiserWizardIssue,
} from "../../engine/optimiser-wizard";
import type {
  CalculationResult,
  OptimiserSettings,
  OptimiserWeights,
  ProjectModel,
  WeightPreset,
} from "../../engine/types";

interface OptimiserWizardProps {
  activeModel: ProjectModel;
  result: CalculationResult;
  calculating: boolean;
  onApply(settings: OptimiserSettings, run: boolean): void;
  onFindArrangement(): void;
  onClose(): void;
}

const STEP_ICONS: Record<OptimiserStepId, ReactNode> = {
  goal: <IconTargetArrow size={17} />,
  coarse: <IconArrowsHorizontal size={17} />,
  acceptance: <IconFilterCheck size={17} />,
  pins: <IconGitCompare size={17} />,
  refinement: <IconAdjustments size={17} />,
  weighting: <IconScale size={17} />,
  review: <IconCheck size={17} />,
};

const PRESET_OPTIONS: Array<{
  value: WeightPreset;
  label: string;
  detail: string;
}> = [
  { value: "BALANCED", label: "Balanced", detail: "Equal emphasis across active stability and utilisation checks." },
  { value: "UTILISATION_PRIORITY", label: "Capacity", detail: "Prioritises lower axle, dynamic and spine utilisation." },
  { value: "STABILITY_PRIORITY", label: "Stability", detail: "Prioritises larger basic, slope and dynamic tipping angles." },
  { value: "DYNAMIC_PRIORITY", label: "Dynamic", detail: "Focuses on dynamic utilisation, angle and static ratio." },
  { value: "SPINE_BEAM_PRIORITY", label: "Spine beam", detail: "Prioritises beam demand and detailed structural metrics." },
  { value: "LOCAL_DEFLECTION_PRIORITY", label: "Deflection", detail: "Prioritises lower peak and localised deformation." },
  { value: "LOCAL_BENDING_PRIORITY", label: "Local bending", detail: "Prioritises lower local bending demand." },
  { value: "CUSTOM", label: "Custom", detail: "Use your own weighting for every ranked metric." },
];

const WEIGHT_FIELDS: Array<{
  key: keyof OptimiserWeights;
  label: string;
  direction: "Lower is better" | "Higher is better";
  structural?: boolean;
}> = [
  { key: "basicUtil", label: "Basic static utilisation", direction: "Lower is better" },
  { key: "slopeUtil", label: "Static utilisation incl. slopes", direction: "Lower is better" },
  { key: "dynamicUtil", label: "Dynamic utilisation", direction: "Lower is better" },
  { key: "spineUtil", label: "Spine-beam utilisation", direction: "Lower is better" },
  { key: "basicAngle", label: "Basic tipping angle", direction: "Higher is better" },
  { key: "slopeAngle", label: "Slope tipping angle", direction: "Higher is better" },
  { key: "dynamicAngle", label: "Dynamic tipping angle", direction: "Higher is better" },
  { key: "dynamicRatio", label: "Dynamic / static ratio", direction: "Higher is better" },
  { key: "shearUtil", label: "Shear utilisation", direction: "Lower is better", structural: true },
  { key: "bendingUtil", label: "Bending utilisation", direction: "Lower is better", structural: true },
  { key: "deflection", label: "Maximum deflection", direction: "Lower is better", structural: true },
  { key: "localBendingUtil", label: "Local bending utilisation", direction: "Lower is better", structural: true },
  { key: "axleLinesUsed", label: "Axle lines used", direction: "Lower is better" },
];

function NumberField({
  label,
  value,
  unit,
  hint,
  step = "any",
  min,
  max,
  disabled,
  validation,
  onChange,
}: {
  label: string;
  value: number;
  unit?: string;
  hint?: string;
  step?: number | "any";
  min?: number;
  max?: number;
  disabled?: boolean;
  validation?: "valid" | "invalid";
  onChange(value: number): void;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const parsed = Number(text);
  const inferredValid =
    text.trim() !== "" &&
    Number.isFinite(parsed) &&
    (min === undefined || parsed >= min) &&
    (max === undefined || parsed <= max);
  const valid = validation ? validation === "valid" : inferredValid;
  return (
    <label className={`wizard-field is-${valid ? "valid" : "invalid"}`}>
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
            const next = event.target.value;
            setText(next);
            const nextNumber = Number(next);
            if (next.trim() && Number.isFinite(nextNumber)) onChange(nextNumber);
          }}
          onBlur={() => {
            if (!inferredValid) setText(String(value));
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
  onChange,
}: {
  label: string;
  value: string;
  hint?: string;
  placeholder?: string;
  onChange(value: string): void;
}) {
  return (
    <label className="wizard-field">
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
  children,
  onChange,
}: {
  label: string;
  value: string | number;
  hint?: string;
  children: ReactNode;
  onChange(value: string): void;
}) {
  return (
    <label className="wizard-field is-valid">
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
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
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
}: {
  issues: OptimiserWizardIssue[];
}) {
  if (!issues.length) {
    return (
      <div className="wizard-valid-note">
        <IconCheck size={14} /> No blocking checks in this section.
      </div>
    );
  }
  return (
    <div className="wizard-issue-list compact">
      {issues.map((entry) => (
        <div key={entry.id} className={`wizard-issue ${entry.severity}`}>
          {entry.severity === "blocking" ? (
            <IconX size={14} />
          ) : (
            <IconAlertTriangle size={14} />
          )}
          <span>
            <b>{entry.title}</b>
            <small>{entry.detail}</small>
          </span>
        </div>
      ))}
    </div>
  );
}

function metric(
  value: number | null,
  unit: string,
  multiplier = 1,
): string {
  return value === null || !Number.isFinite(value)
    ? "—"
    : `${(value * multiplier).toFixed(unit === "%" ? 1 : 2)}${unit}`;
}

export function OptimiserWizard({
  activeModel,
  result,
  calculating,
  onApply,
  onFindArrangement,
  onClose,
}: OptimiserWizardProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [settings, setSettings] = useState<OptimiserSettings>(() =>
    structuredClone(activeModel.optimiser),
  );
  const [step, setStep] = useState<OptimiserStepId>("goal");
  const [notice, setNotice] = useState<string | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [initialised, setInitialised] = useState(false);

  const update = (patch: Partial<OptimiserSettings>) =>
    setSettings((current) => ({ ...current, ...patch }));
  const issues = useMemo(
    () => collectOptimiserWizardIssues(activeModel, settings, result),
    [activeModel, result, settings],
  );
  const plan = useMemo(
    () => estimateOptimiserPlan(activeModel, settings),
    [activeModel, settings],
  );
  const stepIndex = OPTIMISER_STEPS.findIndex((item) => item.id === step);
  const currentStep = OPTIMISER_STEPS[stepIndex];
  const stepIssues = optimiserIssuesForStep(issues, step);
  const blockingCount = issues.filter(
    (item) => item.severity === "blocking",
  ).length;
  const warningCount = issues.filter(
    (item) => item.severity === "warning",
  ).length;
  const canContinue = optimiserStepCanContinue(issues, step);
  const canRun = canRunOptimiserWizard(issues) && !calculating;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(
        OPTIMISER_WIZARD_DRAFT_STORAGE_KEY,
      );
      const hydrated = stored
        ? hydrateOptimiserWizardDraftPayload(
            JSON.parse(stored),
            activeModel.optimiser,
          )
        : null;
      if (hydrated) {
        setSettings(hydrated.settings);
        setStep(hydrated.step);
        setDraftSavedAt(hydrated.updatedAt);
      }
    } catch {
      setNotice(
        "The unfinished optimiser draft could not be read. Current settings were loaded.",
      );
    } finally {
      setInitialised(true);
    }
  }, [activeModel.optimiser]);

  useEffect(() => {
    if (!initialised) return;
    const timer = window.setTimeout(() => {
      try {
        const payload = createOptimiserWizardDraftPayload(step, settings);
        localStorage.setItem(
          OPTIMISER_WIZARD_DRAFT_STORAGE_KEY,
          JSON.stringify(payload),
        );
        setDraftSavedAt(payload.updatedAt);
      } catch {
        setNotice("This browser could not autosave the optimiser draft.");
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [initialised, settings, step]);

  const selectPreset = (preset: WeightPreset) => {
    setSettings((current) => ({
      ...current,
      weightPreset: preset,
      weights:
        preset === "CUSTOM"
          ? current.weights
          : weightsForPreset(
              preset,
              current.weights,
              current.detailedWeighting,
              current.f506Policy,
            ),
    }));
  };

  const resetToCurrent = () => {
    setSettings(structuredClone(activeModel.optimiser));
    setStep("goal");
    setNotice("Current optimiser settings restored.");
  };

  const saveDraftAndClose = () => {
    try {
      const payload = createOptimiserWizardDraftPayload(step, settings);
      localStorage.setItem(
        OPTIMISER_WIZARD_DRAFT_STORAGE_KEY,
        JSON.stringify(payload),
      );
    } catch {
      // The mounted draft remains intact if local storage is unavailable.
    }
    onClose();
  };

  const discard = () => {
    if (
      !window.confirm(
        "Discard this optimiser draft and keep the active settings unchanged?",
      )
    ) {
      return;
    }
    localStorage.removeItem(OPTIMISER_WIZARD_DRAFT_STORAGE_KEY);
    onClose();
  };

  const apply = (run: boolean) => {
    if (run && !canRun) return;
    localStorage.removeItem(OPTIMISER_WIZARD_DRAFT_STORAGE_KEY);
    onApply(structuredClone(settings), run);
  };

  const next = () => {
    if (!canContinue) {
      setNotice("Resolve the blocking checks in this step before continuing.");
      return;
    }
    setNotice(null);
    setStep(
      OPTIMISER_STEPS[
        Math.min(OPTIMISER_STEPS.length - 1, stepIndex + 1)
      ].id,
    );
  };

  const previous = () => {
    setNotice(null);
    setStep(OPTIMISER_STEPS[Math.max(0, stepIndex - 1)].id);
  };

  const renderGoal = () => (
    <>
      <FormSection
        title="Choose the optimisation task"
        description="Keep the current trailer layout, or let the optimiser design the minimum constructible SPMT formation first."
      >
        <div className="optimiser-workflow-grid">
          <div className="selected">
            <IconTargetArrow size={17} />
            <span><b>Optimise current arrangement</b><small>Adjust shared axle lines, hydraulic split, longitudinal position and pins on the trailers already placed.</small></span>
          </div>
          <button type="button" onClick={onFindArrangement}>
            <IconStack2 size={17} />
            <span><b>Find minimum trailer arrangement</b><small>Choose 4-, 5- and 6-AL module stock, then search both hydraulic systems and the minimum total axle lines around the all-inclusive COG.</small></span>
          </button>
        </div>
      </FormSection>
      <FormSection
        title="What should the optimiser favour?"
        description="A preset changes ranking only; every retained case still receives the complete engineering calculation."
      >
        <div className="optimiser-preset-grid">
          {PRESET_OPTIONS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              className={
                settings.weightPreset === preset.value ? "selected" : ""
              }
              onClick={() => selectPreset(preset.value)}
            >
              <IconTargetArrow size={15} />
              <span>
                <b>{preset.label}</b>
                <small>{preset.detail}</small>
              </span>
            </button>
          ))}
        </div>
      </FormSection>
      <FormSection
        title="Search method"
        description="Native verified is the normal browser mode. Verification parity preserves the alternative sequencing option."
      >
        <div className="wizard-field-grid two">
          <SelectField
            label="Calculation mode"
            value={settings.calculationMode}
            onChange={(value) =>
              update({
                calculationMode:
                  value as OptimiserSettings["calculationMode"],
              })
            }
          >
            <option value="NATIVE_VERIFIED">Native verified</option>
            <option value="WORKBOOK_PARITY">Legacy sequencing</option>
          </SelectField>
          <SelectField
            label="Optimiser strategy"
            value={settings.optimiserStrategy}
            onChange={(value) =>
              update({
                optimiserStrategy:
                  value as OptimiserSettings["optimiserStrategy"],
              })
            }
          >
            <option value="STAGED_ADAPTIVE">Staged adaptive</option>
            <option value="EXHAUSTIVE">Exhaustive</option>
          </SelectField>
        </div>
      </FormSection>
    </>
  );

  const renderCoarse = () => (
    <>
      <FormSection
        title="Axle-line and split-line range"
        description="The shared axle-line count and split-after line are applied across every selected trailer for each case."
      >
        <div className="wizard-field-grid three">
          <NumberField
            label="Axle lines start"
            value={settings.c89Start}
            min={2}
            step={1}
            validation={
              Number.isInteger(settings.c89Start) &&
              settings.c89Start >= 2 &&
              settings.c89Start <= settings.c89Maximum
                ? "valid"
                : "invalid"
            }
            onChange={(c89Start) => update({ c89Start: Math.round(c89Start) })}
          />
          <NumberField
            label="Axle lines maximum"
            value={settings.c89Maximum}
            min={2}
            step={1}
            validation={
              Number.isInteger(settings.c89Maximum) &&
              settings.c89Maximum >= settings.c89Start
                ? "valid"
                : "invalid"
            }
            onChange={(c89Maximum) =>
              update({ c89Maximum: Math.round(c89Maximum) })
            }
          />
          <NumberField
            label="Axle lines step"
            value={settings.c89Step}
            min={1}
            step={1}
            onChange={(c89Step) => update({ c89Step: Math.round(c89Step) })}
          />
          <NumberField
            label="Split start"
            value={settings.d138Start}
            min={1}
            step={1}
            validation={
              Number.isInteger(settings.d138Start) &&
              settings.d138Start >= 1 &&
              settings.d138Start < settings.c89Maximum
                ? "valid"
                : "invalid"
            }
            onChange={(d138Start) =>
              update({ d138Start: Math.round(d138Start) })
            }
          />
          <NumberField
            label="Split step"
            value={settings.d138Step}
            min={1}
            step={1}
            onChange={(d138Step) => update({ d138Step: Math.round(d138Step) })}
          />
          <NumberField
            label="Maximum split fraction"
            value={settings.d138MaximumFraction}
            min={0.1}
            max={1}
            step={0.05}
            onChange={(d138MaximumFraction) =>
              update({ d138MaximumFraction })
            }
          />
        </div>
        <div className="wizard-toggle-grid optimisation-toggle-row">
          <ToggleField
            label="Override split limit"
            checked={settings.overrideD138Limit}
            hint="Allow every split below the axle-line count."
            onChange={(overrideD138Limit) => update({ overrideD138Limit })}
          />
        </div>
      </FormSection>
      <FormSection
        title="Trailer longitudinal search"
        description="Automatic mode probes the feasible hydraulic-group-centre range. Manual mode uses your exact limits."
      >
        <div className="wizard-segmented">
          <button
            type="button"
            className={
              settings.e89RangeMode === "AUTO_GROUP_CENTRES" ? "active" : ""
            }
            onClick={() => update({ e89RangeMode: "AUTO_GROUP_CENTRES" })}
          >
            Automatic group centres
          </button>
          <button
            type="button"
            className={settings.e89RangeMode === "MANUAL" ? "active" : ""}
            onClick={() => update({ e89RangeMode: "MANUAL" })}
          >
            Manual range
          </button>
        </div>
        <div className="wizard-field-grid three">
          <NumberField
            label="Trailer X minimum"
            value={settings.e89Minimum}
            unit="m"
            disabled={settings.e89RangeMode !== "MANUAL"}
            validation={
              settings.e89RangeMode !== "MANUAL" ||
              settings.e89Minimum <= settings.e89Maximum
                ? "valid"
                : "invalid"
            }
            onChange={(e89Minimum) => update({ e89Minimum })}
          />
          <NumberField
            label="Trailer X maximum"
            value={settings.e89Maximum}
            unit="m"
            disabled={settings.e89RangeMode !== "MANUAL"}
            validation={
              settings.e89RangeMode !== "MANUAL" ||
              settings.e89Maximum >= settings.e89Minimum
                ? "valid"
                : "invalid"
            }
            onChange={(e89Maximum) => update({ e89Maximum })}
          />
          <NumberField
            label="Coarse trailer X step"
            value={settings.e89Step}
            unit="m"
            min={0.001}
            onChange={(e89Step) => update({ e89Step })}
          />
        </div>
      </FormSection>
    </>
  );

  const renderAcceptance = () => (
    <>
      <FormSection
        title="Physical pass requirements"
        description="These checks determine whether a calculated case can enter the valid-pass ranking."
      >
        <div className="wizard-field-grid two">
          <NumberField
            label="Minimum active supports"
            value={settings.minimumActiveSupports}
            hint={`${activeModel.supports.filter((support) => support.allowed).length} supports currently allowed`}
            min={2}
            max={10}
            step={1}
            onChange={(minimumActiveSupports) =>
              update({
                minimumActiveSupports: Math.round(minimumActiveSupports),
              })
            }
          />
          <SelectField
            label="Deflection check"
            value={settings.deflectionCheck}
            onChange={(value) =>
              update({
                deflectionCheck:
                  value as OptimiserSettings["deflectionCheck"],
              })
            }
          >
            <option value="OFF">Not required for pass</option>
            <option value="REQUIRED">Required for pass</option>
          </SelectField>
          <NumberField
            label="Deflection limit"
            value={settings.deflectionLimitMm}
            unit="mm"
            min={0.001}
            disabled={settings.deflectionCheck !== "REQUIRED"}
            onChange={(deflectionLimitMm) => update({ deflectionLimitMm })}
          />
          <NumberField
            label="Deflection tolerance"
            value={settings.deflectionToleranceMm}
            unit="mm"
            min={0}
            onChange={(deflectionToleranceMm) =>
              update({ deflectionToleranceMm })
            }
          />
        </div>
      </FormSection>
      <FormSection
        title="Axle utilisation and stop behaviour"
        description="AUTO uses the engineering pass status. A manual ratio adds a separate maximum axle utilisation gate."
      >
        <div className="wizard-segmented">
          <button
            type="button"
            className={
              settings.maximumAxleUtilisation === "AUTO" ? "active" : ""
            }
            onClick={() => update({ maximumAxleUtilisation: "AUTO" })}
          >
            Automatic
          </button>
          <button
            type="button"
            className={
              settings.maximumAxleUtilisation !== "AUTO" ? "active" : ""
            }
            onClick={() =>
              update({
                maximumAxleUtilisation:
                  settings.maximumAxleUtilisation === "AUTO"
                    ? 1
                    : settings.maximumAxleUtilisation,
              })
            }
          >
            Manual limit
          </button>
        </div>
        <div className="wizard-field-grid two">
          <NumberField
            label="Maximum axle utilisation"
            value={
              settings.maximumAxleUtilisation === "AUTO"
                ? 1
                : settings.maximumAxleUtilisation
            }
            hint="Ratio: 1.00 equals 100%"
            min={0.01}
            disabled={settings.maximumAxleUtilisation === "AUTO"}
            onChange={(maximumAxleUtilisation) =>
              update({ maximumAxleUtilisation })
            }
          />
          <SelectField
            label="After first valid pass"
            value={settings.stopAtFirstPass ? "STOP" : "CONTINUE_SCAN"}
            onChange={(value) =>
              update({
                stopAtFirstPass: value === "STOP",
                afterFirstPass:
                  value === "STOP" ? "STOP" : "CONTINUE_SCAN",
              })
            }
          >
            <option value="CONTINUE_SCAN">Continue and rank all passes</option>
            <option value="STOP">Stop at first pass</option>
          </SelectField>
        </div>
      </FormSection>
    </>
  );

  const renderPins = () => (
    <>
      <FormSection
        title="Pinned-axle search"
        description="Pinning is explored only after coarse valid candidates are known."
      >
        <div className="wizard-field-grid two">
          <SelectField
            label="Pin search mode"
            value={settings.pinSearchMode}
            onChange={(value) =>
              update({
                pinSearchMode:
                  value as OptimiserSettings["pinSearchMode"],
              })
            }
          >
            <option value="OFF">Off</option>
            <option value="FAST">Fast · best coarse candidate</option>
            <option value="THOROUGH">Thorough · selected finalists</option>
          </SelectField>
          <SelectField
            label="Existing pins"
            value={settings.existingPinsPolicy}
            onChange={(value) =>
              update({
                existingPinsPolicy:
                  value as OptimiserSettings["existingPinsPolicy"],
              })
            }
          >
            <option value="REARRANGE">Allow rearrangement</option>
            <option value="KEEP">Keep existing pins</option>
          </SelectField>
          <NumberField
            label="Maximum pinned axle lines"
            value={settings.maximumPins}
            min={0}
            max={8}
            step={1}
            disabled={settings.pinSearchMode === "OFF"}
            onChange={(maximumPins) =>
              update({ maximumPins: Math.round(maximumPins) })
            }
          />
          <NumberField
            label="Pin case budget"
            value={settings.pinCaseBudget}
            min={1}
            step={1}
            disabled={settings.pinSearchMode === "OFF"}
            onChange={(pinCaseBudget) =>
              update({ pinCaseBudget: Math.round(pinCaseBudget) })
            }
          />
          <SelectField
            label="Pin stop rule"
            value={settings.pinStopRule}
            onChange={(value) =>
              update({
                pinStopRule:
                  value as OptimiserSettings["pinStopRule"],
              })
            }
          >
            <option value="CONTINUE_IMPROVING">Continue while improving</option>
            <option value="FIRST_IMPROVEMENT">Stop at first improvement</option>
          </SelectField>
          <NumberField
            label="Minimum deflection improvement"
            value={settings.minimumDeflectionImprovementMm}
            unit="mm"
            min={0}
            disabled={settings.pinSearchMode === "OFF"}
            onChange={(minimumDeflectionImprovementMm) =>
              update({ minimumDeflectionImprovementMm })
            }
          />
        </div>
      </FormSection>
      <FormSection
        title="Local structural target"
        description="The optimiser can target the calculated deflection peak or a fixed spine-beam X location."
      >
        <div className="wizard-field-grid two">
          <SelectField
            label="Target location"
            value={settings.localStructuralTargetMode}
            onChange={(value) =>
              update({
                localStructuralTargetMode:
                  value as OptimiserSettings["localStructuralTargetMode"],
              })
            }
          >
            <option value="AUTO_AT_DEFLECTION_PEAK">
              Automatic at deflection peak
            </option>
            <option value="MANUAL_X">Manual X location</option>
          </SelectField>
          <NumberField
            label="Manual target X"
            value={settings.manualLocalTargetXM ?? 0}
            unit="m"
            disabled={
              settings.localStructuralTargetMode !== "MANUAL_X"
            }
            onChange={(manualLocalTargetXM) =>
              update({ manualLocalTargetXM })
            }
          />
        </div>
      </FormSection>
    </>
  );

  const renderRefinement = () => (
    <>
      <FormSection
        title="Fine trailer-position search"
        description="By default the optimiser refines between the best and second-best valid pass. Enter pass references only when you want to override that pair."
      >
        <div className="wizard-field-grid two">
          <NumberField
            label="Fine trailer X step"
            value={settings.fineE89Step}
            unit="m"
            min={0.001}
            onChange={(fineE89Step) => update({ fineE89Step })}
          />
          <NumberField
            label="Boundary tolerance"
            value={settings.boundaryToleranceM}
            unit="m"
            min={0}
            onChange={(boundaryToleranceM) =>
              update({ boundaryToleranceM })
            }
          />
          <TextField
            label="First pass reference"
            value={settings.fineFirstPassReference}
            placeholder="Default: best pass"
            onChange={(fineFirstPassReference) =>
              update({ fineFirstPassReference })
            }
          />
          <TextField
            label="Second pass reference"
            value={settings.fineSecondPassReference}
            placeholder="Default: second-best pass"
            onChange={(fineSecondPassReference) =>
              update({ fineSecondPassReference })
            }
          />
        </div>
      </FormSection>
      <FormSection
        title="Finalist and pin handling"
        description="Thorough mode can refine several candidates. Re-optimising pins at each fine position increases work."
      >
        <div className="wizard-field-grid two">
          <NumberField
            label="Thorough finalist count"
            value={settings.thoroughFinalistCount}
            min={1}
            step={1}
            onChange={(thoroughFinalistCount) =>
              update({
                thoroughFinalistCount: Math.round(
                  thoroughFinalistCount,
                ),
              })
            }
          />
          <SelectField
            label="Fine-search pin mode"
            value={settings.fineE89PinMode}
            onChange={(value) =>
              update({
                fineE89PinMode:
                  value as OptimiserSettings["fineE89PinMode"],
              })
            }
          >
            <option value="KEEP_BETTER_PASS">
              Keep pins from better selected pass
            </option>
            <option value="REOPTIMISE_EACH_CASE">
              Re-optimise pins at each position
            </option>
          </SelectField>
        </div>
      </FormSection>
    </>
  );

  const renderWeighting = () => (
    <>
      <FormSection
        title="Weighting controls"
        description="A zero weight excludes a metric. Metrics unavailable or inactive for a corresponding pass are not included in its weighting."
      >
        <div className="wizard-toggle-grid optimisation-toggle-row">
          <ToggleField
            label="Use detailed structural weighting"
            checked={settings.detailedWeighting}
            hint="Adds shear, bending, deflection and local bending."
            onChange={(detailedWeighting) =>
              setSettings((current) => ({
                ...current,
                detailedWeighting,
                weights:
                  current.weightPreset === "CUSTOM"
                    ? current.weights
                    : weightsForPreset(
                        current.weightPreset,
                        current.weights,
                        detailedWeighting,
                        current.f506Policy,
                      ),
              }))
            }
          />
          <ToggleField
            label="Replace spine metric"
            checked={settings.f506Policy === "REPLACE"}
            hint="Use detailed structural metrics instead of spine utilisation."
            onChange={(replace) =>
              setSettings((current) => ({
                ...current,
                f506Policy: replace ? "REPLACE" : "KEEP",
                weights:
                  current.weightPreset === "CUSTOM"
                    ? current.weights
                    : weightsForPreset(
                        current.weightPreset,
                        current.weights,
                        current.detailedWeighting,
                        replace ? "REPLACE" : "KEEP",
                      ),
              }))
            }
          />
        </div>
      </FormSection>
      <FormSection
        title={`${settings.weightPreset.replaceAll("_", " ")} weights`}
        description="Editing any value switches the preset to Custom."
      >
        <div className="optimiser-weight-grid">
          {WEIGHT_FIELDS.map((field) => {
            const inactive =
              field.structural && !settings.detailedWeighting;
            return (
              <label
                key={field.key}
                className={`optimiser-weight-field${inactive ? " inactive" : ""}`}
              >
                <span>
                  <b>{field.label}</b>
                  <small>{inactive ? "Inactive" : field.direction}</small>
                </span>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  disabled={inactive}
                  value={settings.weights[field.key]}
                  onChange={(event) =>
                    update({
                      weightPreset: "CUSTOM",
                      weights: {
                        ...settings.weights,
                        [field.key]: Number(event.target.value),
                      },
                    })
                  }
                />
              </label>
            );
          })}
        </div>
      </FormSection>
    </>
  );

  const renderReview = () => (
    <>
      <section
        className={`optimiser-review-status${blockingCount ? " blocked" : ""}`}
      >
        <div>
          <span>OPTIMISER PREFLIGHT</span>
          <h3>
            {blockingCount
              ? `${blockingCount} blocking check${blockingCount === 1 ? "" : "s"}`
              : "Ready to run"}
          </h3>
          <p>
            {blockingCount
              ? "Return to the marked steps and correct the plan."
              : "The wizard will apply these settings, recalculate the active case and start the existing engineering worker."}
          </p>
        </div>
        <div>
          <b>{plan.totalCasesUpper.toLocaleString()}</b>
          <small>{plan.isApproximate ? "upper estimate" : "planned work units"}</small>
        </div>
      </section>
      <FormSection
        title="Configuration summary"
        description="The run keeps a complete event and case log, then ranks only valid passes."
      >
        <dl className="optimiser-review-grid">
          <div><dt>Objective</dt><dd>{settings.weightPreset.replaceAll("_", " ")}</dd></div>
          <div><dt>Axle lines</dt><dd>{settings.c89Start}–{settings.c89Maximum} · step {settings.c89Step}</dd></div>
          <div><dt>Split search</dt><dd>from AL {settings.d138Start} · step {settings.d138Step}</dd></div>
          <div><dt>Trailer X</dt><dd>{settings.e89RangeMode === "MANUAL" ? `${settings.e89Minimum}–${settings.e89Maximum} m` : "automatic group centres"}</dd></div>
          <div><dt>Supports</dt><dd>minimum {settings.minimumActiveSupports} active</dd></div>
          <div><dt>Pin search</dt><dd>{settings.pinSearchMode.toLowerCase()} · max {settings.maximumPins}</dd></div>
          <div><dt>Fine step</dt><dd>{settings.fineE89Step} m</dd></div>
          <div><dt>Stop rule</dt><dd>{settings.stopAtFirstPass ? "first valid pass" : "complete scan"}</dd></div>
        </dl>
      </FormSection>
      <FormSection title="Full preflight">
        <IssueList issues={issues} />
      </FormSection>
    </>
  );

  const form = (() => {
    switch (step) {
      case "coarse":
        return renderCoarse();
      case "acceptance":
        return renderAcceptance();
      case "pins":
        return renderPins();
      case "refinement":
        return renderRefinement();
      case "weighting":
        return renderWeighting();
      case "review":
        return renderReview();
      default:
        return renderGoal();
    }
  })();

  const phaseRows = [
    { label: "Coarse scan", count: plan.coarseCases, tone: "cyan" },
    { label: "Pin search", count: plan.pinCasesUpper, tone: "amber" },
    { label: "Refinement", count: plan.refinementCasesUpper, tone: "violet" },
    { label: "Final verification", count: 1, tone: "green" },
  ];
  const maxPhase = Math.max(1, ...phaseRows.map((item) => item.count));

  return (
    <dialog
      ref={dialogRef}
      className="setup-wizard-dialog optimiser-wizard-dialog"
      aria-labelledby="optimiser-wizard-title"
      onCancel={(event) => {
        event.preventDefault();
        saveDraftAndClose();
      }}
    >
      <div className="setup-wizard-shell optimiser-wizard-shell">
        <header className="setup-wizard-header">
          <div>
            <span>GUIDED OPTIMISER SETUP</span>
            <h2 id="optimiser-wizard-title">{currentStep.label}</h2>
          </div>
          <div className="setup-wizard-mobile-progress">
            <span>Step {stepIndex + 1} of {OPTIMISER_STEPS.length}</span>
            <div>
              <i
                style={{
                  width: `${((stepIndex + 1) / OPTIMISER_STEPS.length) * 100}%`,
                }}
              />
            </div>
          </div>
          <button
            type="button"
            className="icon-button"
            title="Save draft and close"
            onClick={saveDraftAndClose}
          >
            <IconX size={17} />
          </button>
        </header>

        <nav className="setup-wizard-rail" aria-label="Optimiser setup steps">
          <div className="setup-wizard-rail-title">
            <span>OPTIMISE CASE</span>
            <small>{settings.weightPreset.toLowerCase().replaceAll("_", " ")}</small>
          </div>
          <ol>
            {OPTIMISER_STEPS.map((item, index) => {
              const itemIssues = optimiserIssuesForStep(issues, item.id);
              const hasBlocker = itemIssues.some(
                (entry) => entry.severity === "blocking",
              );
              const hasWarning = itemIssues.some(
                (entry) => entry.severity === "warning",
              );
              const state =
                item.id === step
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
                  <button
                    type="button"
                    className={state}
                    aria-current={item.id === step ? "step" : undefined}
                    onClick={() => {
                      setStep(item.id);
                      setNotice(null);
                    }}
                  >
                    <i>
                      {state === "complete" ? (
                        <IconCheck size={15} />
                      ) : (
                        STEP_ICONS[item.id]
                      )}
                    </i>
                    <span>
                      <b>{index + 1}. {item.label}</b>
                      <small>{item.description}</small>
                    </span>
                    {hasBlocker ? (
                      <em>
                        {
                          itemIssues.filter(
                            (entry) => entry.severity === "blocking",
                          ).length
                        }
                      </em>
                    ) : hasWarning ? (
                      <IconAlertTriangle size={13} />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="setup-wizard-rail-footer">
            <span>
              <i className="ok" /> Existing calculation engine
            </span>
            <span>
              {draftSavedAt
                ? `Draft saved ${new Date(draftSavedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                : "Draft autosave pending"}
            </span>
          </div>
        </nav>

        <section
          className="setup-wizard-form-pane"
          aria-label={`${currentStep.label} inputs`}
        >
          <div className="setup-wizard-form-heading">
            <span>STEP {stepIndex + 1} / {OPTIMISER_STEPS.length}</span>
            <h2>{currentStep.label}</h2>
            <p>{currentStep.description}</p>
          </div>
          {notice && (
            <div className="wizard-notice">
              <IconAlertTriangle size={15} />
              <span>{notice}</span>
              <button
                type="button"
                className="icon-button"
                onClick={() => setNotice(null)}
              >
                <IconX size={13} />
              </button>
            </div>
          )}
          {form}
          {step !== "review" && (
            <FormSection title="Step preflight">
              <IssueList issues={stepIssues} />
            </FormSection>
          )}
        </section>

        <section
          className="setup-wizard-preview optimiser-wizard-preview"
          aria-label="Live optimiser plan preview"
        >
          <div className="setup-wizard-preview-status">
            <div>
              <span>LIVE SEARCH PLAN</span>
              <b>{activeModel.cargo.name || "Untitled case"}</b>
            </div>
            <div className={calculating ? "working" : "ready"}>
              {calculating && <IconLoader2 size={14} />}
              <span>
                {calculating
                  ? "Current case updating"
                  : "Authoritative result available"}
              </span>
            </div>
          </div>

          <div className="optimiser-plan-preview">
            <header>
              <span>PLANNED ENGINEERING WORK</span>
              <b>{plan.totalCasesUpper.toLocaleString()}</b>
              <small>
                {plan.isApproximate
                  ? "upper estimate · exact total adapts during the run"
                  : "estimated calculation cases"}
              </small>
            </header>
            <div className="optimiser-phase-plan">
              {phaseRows.map((phase, index) => (
                <div key={phase.label} className={phase.tone}>
                  <span>
                    <i>{index + 1}</i>
                    <b>{phase.label}</b>
                    <em>{phase.count.toLocaleString()}</em>
                  </span>
                  <div>
                    <i
                      style={{
                        width: `${Math.max(
                          phase.count ? 4 : 0,
                          (phase.count / maxPhase) * 100,
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <dl className="optimiser-plan-facts">
              <div><dt>Axle-line values</dt><dd>{plan.axleLineValues}</dd></div>
              <div><dt>Valid split values</dt><dd>{plan.splitValues}</dd></div>
              <div><dt>X probes / split</dt><dd>{plan.trailerXValuesPerSplit}{settings.e89RangeMode === "AUTO_GROUP_CENTRES" ? " est." : ""}</dd></div>
              <div><dt>Logging</dt><dd>Every retained case</dd></div>
            </dl>
          </div>

          <div className="optimiser-current-snapshot">
            <header>
              <span>CURRENT CASE SNAPSHOT</span>
              <b className={result.status === "PASS" ? "ok" : "nok"}>
                {result.status.replaceAll("_", " ")}
              </b>
            </header>
            <div>
              <span><small>Dynamic utilisation</small><b>{metric(result.metrics.dynamicUtil.value, "%", 100)}</b></span>
              <span><small>Dynamic tipping angle</small><b>{metric(result.metrics.dynamicAngle.value, "°")}</b></span>
              <span><small>Spine utilisation</small><b>{metric(result.metrics.spineUtil.value, "%", 100)}</b></span>
              <span><small>Active supports</small><b>{result.activeSupportCount}/{activeModel.supports.length}</b></span>
              <span><small>Deflection</small><b>{result.beam.absoluteDeflectionMm.toFixed(2)} mm</b></span>
              <span><small>Axle lines used</small><b>{result.metrics.axleLinesUsed.value?.toFixed(0) ?? "—"}</b></span>
            </div>
          </div>

          <div className="setup-wizard-preview-findings">
            {blockingCount ? (
              <span className="blocking">
                <IconX size={13} /> {blockingCount} blocking
              </span>
            ) : (
              <span className="valid">
                <IconCheck size={13} /> Plan valid
              </span>
            )}
            {warningCount ? (
              <span className="warning">
                <IconAlertTriangle size={13} /> {warningCount} warning
                {warningCount === 1 ? "" : "s"}
              </span>
            ) : null}
          </div>
        </section>

        <footer className="setup-wizard-footer">
          <div className="setup-wizard-footer-secondary">
            <button
              type="button"
              className="wizard-discard"
              onClick={discard}
            >
              <IconTrash size={14} /> Discard
            </button>
            <button type="button" onClick={resetToCurrent}>
              <IconRefresh size={14} /> Reset to current
            </button>
            <button
              type="button"
              disabled={blockingCount > 0}
              onClick={() => apply(false)}
            >
              Save settings & close
            </button>
          </div>
          <div className="setup-wizard-footer-primary">
            {stepIndex > 0 && (
              <button type="button" onClick={previous}>
                <IconChevronLeft size={15} /> Back
              </button>
            )}
            {step !== "review" ? (
              <button
                type="button"
                className="wizard-primary"
                disabled={!canContinue}
                onClick={next}
              >
                Next <IconChevronRight size={15} />
              </button>
            ) : (
              <button
                type="button"
                className="wizard-primary optimiser-start-action"
                disabled={!canRun}
                onClick={() => apply(true)}
              >
                <IconPlayerPlay size={15} /> Apply & start optimisation
              </button>
            )}
          </div>
        </footer>
      </div>
    </dialog>
  );
}
