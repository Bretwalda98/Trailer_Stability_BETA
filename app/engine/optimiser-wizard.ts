import type {
  CalculationResult,
  OptimiserSettings,
  OptimiserWeights,
  ProjectModel,
} from "./types";

export type OptimiserStepId =
  | "goal"
  | "coarse"
  | "acceptance"
  | "pins"
  | "refinement"
  | "weighting"
  | "review";

export interface OptimiserWizardIssue {
  id: string;
  step: OptimiserStepId;
  severity: "blocking" | "warning";
  title: string;
  detail: string;
}

export interface OptimiserPlanEstimate {
  axleLineValues: number;
  splitValues: number;
  trailerXValuesPerSplit: number;
  coarseCases: number;
  pinCasesUpper: number;
  refinementCasesUpper: number;
  totalCasesUpper: number;
  isApproximate: boolean;
}

export interface OptimiserWizardDraftPayload {
  version: 1;
  step: OptimiserStepId;
  settings: OptimiserSettings;
  updatedAt: string;
}

export const OPTIMISER_WIZARD_DRAFT_VERSION = 1;
export const OPTIMISER_WIZARD_DRAFT_STORAGE_KEY =
  "trailer-stability-optimiser-draft-v1";

export const OPTIMISER_STEPS: Array<{
  id: OptimiserStepId;
  label: string;
  shortLabel: string;
  description: string;
}> = [
  {
    id: "goal",
    label: "Goal & method",
    shortLabel: "Goal",
    description: "Choose the optimisation objective and search strategy",
  },
  {
    id: "coarse",
    label: "Search range",
    shortLabel: "Range",
    description: "Set axle-line, split-line and trailer-position limits",
  },
  {
    id: "acceptance",
    label: "Pass rules",
    shortLabel: "Rules",
    description: "Define support, axle and deflection acceptance",
  },
  {
    id: "pins",
    label: "Pin search",
    shortLabel: "Pins",
    description: "Control pinned-axle exploration and local targets",
  },
  {
    id: "refinement",
    label: "Refinement",
    shortLabel: "Refine",
    description: "Configure the fine trailer-position search",
  },
  {
    id: "weighting",
    label: "Pass weighting",
    shortLabel: "Weight",
    description: "Set how valid passes are ranked against one another",
  },
  {
    id: "review",
    label: "Review & run",
    shortLabel: "Review",
    description: "Check the plan and start the authoritative optimiser",
  },
];

const STEP_IDS = new Set(OPTIMISER_STEPS.map((step) => step.id));
const WEIGHT_KEYS: Array<keyof OptimiserWeights> = [
  "basicUtil",
  "slopeUtil",
  "dynamicUtil",
  "spineUtil",
  "basicAngle",
  "slopeAngle",
  "dynamicAngle",
  "dynamicRatio",
  "shearUtil",
  "bendingUtil",
  "deflection",
  "localBendingUtil",
  "axleLinesUsed",
];

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function countRange(start: number, end: number, step: number): number {
  if (![start, end, step].every(finite) || step <= 0) return 0;
  return Math.floor(Math.abs(end - start) / step + 1e-10) + 1;
}

function issue(
  id: string,
  step: OptimiserStepId,
  severity: OptimiserWizardIssue["severity"],
  title: string,
  detail: string,
): OptimiserWizardIssue {
  return { id, step, severity, title, detail };
}

export function estimateOptimiserPlan(
  model: ProjectModel,
  settings = model.optimiser,
): OptimiserPlanEstimate {
  const axleLineValues = countRange(
    settings.c89Start,
    settings.c89Maximum,
    Math.abs(settings.c89Step),
  );
  let splitValues = 0;
  let coarseCases = 0;
  const trailerXValuesPerSplit =
    settings.e89RangeMode === "MANUAL"
      ? countRange(
          settings.e89Minimum,
          settings.e89Maximum,
          Math.abs(settings.e89Step),
        )
      : 3;

  if (axleLineValues > 0) {
    const direction = settings.c89Start <= settings.c89Maximum ? 1 : -1;
    for (let index = 0; index < axleLineValues; index += 1) {
      const axleLines = Math.round(
        settings.c89Start + direction * index * Math.abs(settings.c89Step),
      );
      const maximumSplit = Math.max(
        settings.d138Start,
        settings.overrideD138Limit
          ? axleLines - 1
          : Math.min(
              axleLines - 1,
              Math.floor(axleLines * settings.d138MaximumFraction),
            ),
      );
      const validSplitValues =
        settings.d138Start < axleLines
          ? countRange(
              settings.d138Start,
              maximumSplit,
              Math.abs(settings.d138Step),
            )
          : 0;
      splitValues += validSplitValues;
      coarseCases += validSplitValues * trailerXValuesPerSplit;
    }
  }

  const finalists =
    settings.pinSearchMode === "THOROUGH"
      ? Math.max(1, Math.round(settings.thoroughFinalistCount))
      : settings.pinSearchMode === "FAST"
        ? 1
        : 0;
  const pinCasesUpper =
    finalists > 0
      ? finalists * Math.max(1, Math.round(settings.pinCaseBudget))
      : 0;
  const finePositions = Math.max(
    1,
    countRange(
      0,
      Math.max(Math.abs(settings.e89Step) * 2, settings.fineE89Step),
      Math.max(0.001, Math.abs(settings.fineE89Step)),
    ),
  );
  const finePinCases =
    settings.fineE89PinMode === "REOPTIMISE_EACH_CASE" &&
    settings.pinSearchMode !== "OFF"
      ? Math.min(
          Math.max(1, Math.round(settings.pinCaseBudget)),
          Math.max(1, Math.round(settings.maximumPins) * 2),
        )
      : 0;
  const refinementCasesUpper = finePositions * (1 + finePinCases);

  return {
    axleLineValues,
    splitValues,
    trailerXValuesPerSplit,
    coarseCases,
    pinCasesUpper,
    refinementCasesUpper,
    totalCasesUpper:
      Math.max(0, coarseCases) +
      Math.max(0, pinCasesUpper) +
      Math.max(0, refinementCasesUpper) +
      1,
    isApproximate:
      settings.e89RangeMode === "AUTO_GROUP_CENTRES" ||
      settings.pinSearchMode !== "OFF",
  };
}

export function collectOptimiserWizardIssues(
  model: ProjectModel,
  settings: OptimiserSettings,
  calculation?: CalculationResult,
): OptimiserWizardIssue[] {
  const result: OptimiserWizardIssue[] = [];

  if (!["NATIVE_VERIFIED", "WORKBOOK_PARITY"].includes(settings.calculationMode)) {
    result.push(
      issue(
        "calculation-mode",
        "goal",
        "blocking",
        "Calculation mode is invalid",
        "Choose Native verified or Verification parity.",
      ),
    );
  }
  if (!["STAGED_ADAPTIVE", "EXHAUSTIVE"].includes(settings.optimiserStrategy)) {
    result.push(
      issue(
        "strategy",
        "goal",
        "blocking",
        "Optimiser strategy is invalid",
        "Choose staged adaptive or exhaustive.",
      ),
    );
  }

  if (
    !Number.isInteger(settings.c89Start) ||
    !Number.isInteger(settings.c89Maximum) ||
    settings.c89Start < 2 ||
    settings.c89Maximum < settings.c89Start
  ) {
    result.push(
      issue(
        "axle-range",
        "coarse",
        "blocking",
        "Axle-line range is invalid",
        "Use whole numbers of at least two, with maximum not below start.",
      ),
    );
  }
  if (!Number.isInteger(settings.c89Step) || settings.c89Step < 1) {
    result.push(
      issue(
        "axle-step",
        "coarse",
        "blocking",
        "Axle-line step is invalid",
        "Use a positive whole-number step.",
      ),
    );
  }
  if (
    !Number.isInteger(settings.d138Start) ||
    settings.d138Start < 1 ||
    settings.d138Start >= settings.c89Maximum
  ) {
    result.push(
      issue(
        "split-start",
        "coarse",
        "blocking",
        "Split start is outside the axle formation",
        "Start after axle line 1 or greater, below the maximum axle-line count.",
      ),
    );
  }
  if (!Number.isInteger(settings.d138Step) || settings.d138Step < 1) {
    result.push(
      issue(
        "split-step",
        "coarse",
        "blocking",
        "Split step is invalid",
        "Use a positive whole-number step.",
      ),
    );
  }
  if (
    !finite(settings.d138MaximumFraction) ||
    settings.d138MaximumFraction < 0.1 ||
    settings.d138MaximumFraction > 1
  ) {
    result.push(
      issue(
        "split-fraction",
        "coarse",
        "blocking",
        "Maximum split fraction is invalid",
        "Use a value from 0.10 to 1.00.",
      ),
    );
  }
  if (!finite(settings.e89Step) || settings.e89Step <= 0) {
    result.push(
      issue(
        "trailer-x-step",
        "coarse",
        "blocking",
        "Trailer-position step is invalid",
        "Use a positive distance.",
      ),
    );
  }
  if (
    settings.e89RangeMode === "MANUAL" &&
    (!finite(settings.e89Minimum) ||
      !finite(settings.e89Maximum) ||
      settings.e89Maximum < settings.e89Minimum)
  ) {
    result.push(
      issue(
        "trailer-x-range",
        "coarse",
        "blocking",
        "Manual trailer-position range is invalid",
        "Enter finite limits with maximum not below minimum.",
      ),
    );
  }

  const availableSupports = model.supports.filter(
    (support) => support.allowed,
  ).length;
  if (
    !Number.isInteger(settings.minimumActiveSupports) ||
    settings.minimumActiveSupports < 2 ||
    settings.minimumActiveSupports > 10
  ) {
    result.push(
      issue(
        "minimum-supports",
        "acceptance",
        "blocking",
        "Minimum active supports must be 2–10",
        "Choose a physically acceptable whole-number minimum.",
      ),
    );
  } else if (availableSupports < settings.minimumActiveSupports) {
    result.push(
      issue(
        "available-supports",
        "acceptance",
        "blocking",
        "Too few supports are allowed",
        `${availableSupports} support(s) are currently allowed, below the configured minimum of ${settings.minimumActiveSupports}.`,
      ),
    );
  } else if (
    calculation &&
    calculation.activeSupportCount < settings.minimumActiveSupports
  ) {
    result.push(
      issue(
        "current-supports",
        "acceptance",
        "warning",
        "The current arrangement settles below the support minimum",
        `The optimiser may still find a valid arrangement, but the current case has ${calculation.activeSupportCount} active support(s).`,
      ),
    );
  }
  if (
    settings.maximumAxleUtilisation !== "AUTO" &&
    (!finite(settings.maximumAxleUtilisation) ||
      settings.maximumAxleUtilisation <= 0)
  ) {
    result.push(
      issue(
        "maximum-axle-utilisation",
        "acceptance",
        "blocking",
        "Maximum axle utilisation is invalid",
        "Use AUTO or a positive ratio such as 1.00.",
      ),
    );
  }
  if (
    settings.deflectionCheck === "REQUIRED" &&
    (!finite(settings.deflectionLimitMm) || settings.deflectionLimitMm <= 0)
  ) {
    result.push(
      issue(
        "deflection-limit",
        "acceptance",
        "blocking",
        "Deflection limit is invalid",
        "A required deflection check needs a positive millimetre limit.",
      ),
    );
  }

  if (
    !Number.isInteger(settings.maximumPins) ||
    settings.maximumPins < 0 ||
    settings.maximumPins > 8
  ) {
    result.push(
      issue(
        "maximum-pins",
        "pins",
        "blocking",
        "Maximum pinned axle lines must be 0–8",
        "Use a whole number within the supported range.",
      ),
    );
  }
  if (
    settings.pinSearchMode !== "OFF" &&
    (!Number.isInteger(settings.pinCaseBudget) || settings.pinCaseBudget < 1)
  ) {
    result.push(
      issue(
        "pin-budget",
        "pins",
        "blocking",
        "Pin-search case budget is invalid",
        "Use at least one candidate case.",
      ),
    );
  }
  if (
    settings.localStructuralTargetMode === "MANUAL_X" &&
    !finite(settings.manualLocalTargetXM)
  ) {
    result.push(
      issue(
        "manual-target",
        "pins",
        "blocking",
        "Manual structural target is missing",
        "Enter the X location to target.",
      ),
    );
  }
  if (
    !finite(settings.minimumDeflectionImprovementMm) ||
    settings.minimumDeflectionImprovementMm < 0
  ) {
    result.push(
      issue(
        "minimum-improvement",
        "pins",
        "blocking",
        "Minimum deflection improvement is invalid",
        "Use zero or a positive millimetre improvement.",
      ),
    );
  }

  if (!finite(settings.fineE89Step) || settings.fineE89Step <= 0) {
    result.push(
      issue(
        "fine-step",
        "refinement",
        "blocking",
        "Fine trailer-position step is invalid",
        "Use a positive distance.",
      ),
    );
  } else if (
    finite(settings.e89Step) &&
    settings.fineE89Step >= settings.e89Step
  ) {
    result.push(
      issue(
        "fine-step-size",
        "refinement",
        "warning",
        "Fine step is not finer than the coarse step",
        "Use a smaller fine step to gain extra resolution.",
      ),
    );
  }
  if (
    !Number.isInteger(settings.thoroughFinalistCount) ||
    settings.thoroughFinalistCount < 1
  ) {
    result.push(
      issue(
        "finalist-count",
        "refinement",
        "blocking",
        "Finalist count is invalid",
        "Use at least one finalist.",
      ),
    );
  }
  if (
    !finite(settings.boundaryToleranceM) ||
    settings.boundaryToleranceM < 0
  ) {
    result.push(
      issue(
        "boundary-tolerance",
        "refinement",
        "blocking",
        "Boundary tolerance is invalid",
        "Use zero or a positive distance.",
      ),
    );
  }

  for (const key of WEIGHT_KEYS) {
    if (!finite(settings.weights[key]) || settings.weights[key] < 0) {
      result.push(
        issue(
          `weight-${key}`,
          "weighting",
          "blocking",
          "A pass weight is invalid",
          "Every weight must be zero or greater.",
        ),
      );
      break;
    }
  }
  const activeWeightTotal = WEIGHT_KEYS.reduce(
    (sum, key) => sum + Math.max(0, settings.weights[key] || 0),
    0,
  );
  if (activeWeightTotal <= 0) {
    result.push(
      issue(
        "weight-total",
        "weighting",
        "blocking",
        "At least one pass weight is required",
        "Give one or more ranked metrics a positive weight.",
      ),
    );
  }

  const plan = estimateOptimiserPlan(model, settings);
  if (plan.coarseCases <= 0) {
    result.push(
      issue(
        "empty-plan",
        "review",
        "blocking",
        "The coarse search has no valid cases",
        "Adjust the axle-line, split-line or trailer-position range.",
      ),
    );
  } else if (plan.totalCasesUpper > 5000) {
    result.push(
      issue(
        "large-plan",
        "review",
        "warning",
        "This is a large optimisation plan",
        `The configured upper estimate is ${plan.totalCasesUpper.toLocaleString()} cases. Consider a larger coarse step or staged search.`,
      ),
    );
  }

  if (!model.trailers.length || !model.groupings.length) {
    result.push(
      issue(
        "missing-arrangement",
        "review",
        "blocking",
        "The case has no trailer arrangement",
        "Complete case setup before running optimisation.",
      ),
    );
  }
  if (calculation?.status === "ERROR") {
    result.push(
      issue(
        "calculation-error",
        "review",
        "blocking",
        "The current engineering calculation failed",
        calculation.failDetail || "Resolve the case error before running.",
      ),
    );
  }

  return result;
}

export function optimiserIssuesForStep(
  issues: OptimiserWizardIssue[],
  step: OptimiserStepId,
): OptimiserWizardIssue[] {
  return step === "review"
    ? issues
    : issues.filter((item) => item.step === step);
}

export function optimiserStepCanContinue(
  issues: OptimiserWizardIssue[],
  step: OptimiserStepId,
): boolean {
  return !optimiserIssuesForStep(issues, step).some(
    (item) => item.severity === "blocking",
  );
}

export function canRunOptimiserWizard(
  issues: OptimiserWizardIssue[],
): boolean {
  return !issues.some((item) => item.severity === "blocking");
}

export function createOptimiserWizardDraftPayload(
  step: OptimiserStepId,
  settings: OptimiserSettings,
  timestamp = new Date().toISOString(),
): OptimiserWizardDraftPayload {
  return {
    version: OPTIMISER_WIZARD_DRAFT_VERSION,
    step,
    settings: structuredClone(settings),
    updatedAt: timestamp,
  };
}

export function hydrateOptimiserWizardDraftPayload(
  value: unknown,
  fallback: OptimiserSettings,
): OptimiserWizardDraftPayload | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<OptimiserWizardDraftPayload>;
  if (
    source.version !== OPTIMISER_WIZARD_DRAFT_VERSION ||
    !source.settings ||
    typeof source.settings !== "object"
  ) {
    return null;
  }
  const step =
    typeof source.step === "string" &&
    STEP_IDS.has(source.step as OptimiserStepId)
      ? (source.step as OptimiserStepId)
      : "goal";
  const settings = source.settings as Partial<OptimiserSettings>;
  return {
    version: OPTIMISER_WIZARD_DRAFT_VERSION,
    step,
    settings: {
      ...structuredClone(fallback),
      ...settings,
      weights: {
        ...fallback.weights,
        ...(settings.weights ?? {}),
      },
    },
    updatedAt:
      typeof source.updatedAt === "string"
        ? source.updatedAt
        : new Date(0).toISOString(),
  };
}
