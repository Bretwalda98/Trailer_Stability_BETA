"use client";

import {
  IconArrowsMaximize,
  IconDeviceMobile,
  IconFileImport,
  IconHelpCircle,
  IconLayoutSidebarLeftCollapse,
  IconPlayerPlay,
  IconSettings,
  IconTable,
  IconX,
} from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";

export const HELP_GUIDE_REVISION = "Interface revision 0.7.6 · reviewed 1 August 2026";

const GUIDE_SECTIONS = [
  {
    id: "quick-start",
    label: "Quick start",
    icon: IconSettings,
    title: "Set up a calculation-ready case",
    intro: "Use the guided setup when creating, importing or revising a transport case.",
    steps: [
      "At startup, choose Start new setup or Open saved file. Continue saved case resumes the project stored on this device.",
      "Select Set up case in the top bar whenever you want to reopen the wizard.",
      "Blank case starts with no cargo, trailers, hydraulics or supports on the drawing. The arrangement appears only as you enter setup data.",
      "Work through case basics, cargo, packing, trailers, hydraulics, supports and review.",
      "Resolve blocking findings. Engineering-limit NOK results remain visible but do not prevent saving a geometrically valid setup.",
      "Choose Finish setup, or Finish & run optimisation when you are ready to search alternatives.",
    ],
  },
  {
    id: "wind",
    label: "Auto inputs",
    icon: IconSettings,
    title: "Calculate COG envelope and wind inputs from cargo",
    intro: "Automatic COG envelope and wind projection are enabled by default for new cases.",
    steps: [
      "With Auto-calculate COG envelope on, X uncertainty is 2% of cargo length and Y uncertainty is 2% of cargo width.",
      "With Auto-calculate wind areas on, side area is cargo length × height and front area is cargo width × height.",
      "Both wind forces act at half the cargo height; changing any cargo dimension updates these verification inputs and the COG envelope immediately.",
      "Switch automatic calculation off only when separately verified envelope, projected area or force height values are required.",
      "Green inputs are acceptable. Amber inputs require a value within the allowed engineering range before the wizard can continue.",
    ],
  },
  {
    id: "workspace",
    label: "Workspace",
    icon: IconLayoutSidebarLeftCollapse,
    title: "Navigate without losing the model tree",
    intro: "The left rail separates the application workspace from the objects in the active model.",
    steps: [
      "Select WORKSPACE to fold the workspace list open or closed.",
      "Use the model tree to select cargo, trailers, axle lines, supports and hydraulic groups.",
      "On a phone, use View, Model and Results to move between the drawing, model tree and result editor.",
      "The Plan, End, Side, Hydraulics, Stability and Spine beam views all use the current authoritative result.",
    ],
  },
  {
    id: "geometry",
    label: "Geometry",
    icon: IconSettings,
    title: "Build physically possible trailer geometry",
    intro: "Every valid input change is recalculated before the displayed result is replaced.",
    steps: [
      "Trailer edges may touch, but positive overlap is blocked.",
      "Auto-space uses each selected trailer width and applies a 50 mm clearance.",
      "Longitudinal convention: the left/lower-X end is REAR; the right/higher-X end is FRONT. Axle line 1 starts at the rear.",
      "Absolute placement edits X and Y directly. Relative placement stores offsets while showing resolved coordinates.",
      "Hydraulic groups must form three populated, non-degenerate local clusters around the stability triangle.",
    ],
  },
  {
    id: "details",
    label: "Engineering details",
    icon: IconTable,
    title: "Inspect and edit detailed values",
    intro: "Engineering Details is a working panel, not a fixed report.",
    steps: [
      "Drag the panel-height slider to enlarge or reduce the split view.",
      "Use Minimise to return space to the drawing.",
      "Use Full page for a focused table view, then Restore split to return.",
      "Search and filter values; editable rows recalculate the active case after a valid change.",
    ],
  },
  {
    id: "optimisation",
    label: "Optimisation",
    icon: IconPlayerPlay,
    title: "Run and review the optimiser",
    intro: "The optimiser keeps the engineering sequence and support-settling logic for every retained case.",
    steps: [
      "Select Run optimisation in the top bar to open the guided optimiser wizard.",
      "Work through goal, search range, pass rules, pin search, refinement, weighting and review. Amber fields or blocking findings must be corrected before the run can start.",
      "The live plan shows the coarse-case count and upper estimates for pin and refinement work. Automatic hydraulic-boundary searches finalise their exact total while running.",
      "Choose Apply & start optimisation. The settings are applied, the active case is recalculated, then progress, ETA, activity and ranked passes appear in the optimisation drawer.",
      "Experienced users can still choose Run with current optimiser settings from the top-bar More menu, or edit every field directly in the Optimise workspace.",
      "Stop retains completed work. Apply a ranked pass only when you want it to replace the active setup.",
      "The winning pass is recalculated and verified before the run reaches 100%.",
    ],
  },
  {
    id: "arrangement",
    label: "Auto arrangement",
    icon: IconPlayerPlay,
    title: "Find the minimum constructible SPMT arrangement",
    intro: "This separate optimiser designs parallel trains before applying the exact existing engineering search to each retained formation.",
    steps: [
      "Open Run optimisation, then choose Find minimum trailer arrangement. The same action is also available from the top-bar More menu.",
      "Confirm the authoritative cargo, packing, supports and route inputs, then choose the trailer family and available 4-, 5- and 6-axle-line modules.",
      "Set train-count, stock and formation limits. A per-train axle count is eligible only when it is exactly constructible from the enabled module sizes.",
      "Parallel trains are placed at equal offsets from the all-inclusive COG. The standard preferred spacing is 2.9 m centre-to-centre and can be changed.",
      "The hard decision order is engineering PASS, minimum train count, minimum total axle lines, closest valid preferred spacing, then the selected engineering weighting.",
      "A wider valid formation with fewer trains always beats adding another train. Every candidate still runs the exact support-settling, stability, spine-beam and pin logic.",
      "Review the train, module, pitch and width columns in the results drawer, then apply the selected result to rebuild and recalculate the active case.",
    ],
  },
  {
    id: "exchange",
    label: "Import and export",
    icon: IconFileImport,
    title: "Exchange verification data",
    intro: "The web engine remains standalone; exchange files are optional for importing data or external verification.",
    steps: [
      "Import reads case inputs and the embedded trailer catalogue.",
      "Export verification writes the resolved shared formation, supports, catalogue and mapped case values.",
      "Project JSON saves the complete standalone web model and is available from the More menu.",
      "Visual-only packing footprint geometry stays in the web project and does not alter the engineering calculation.",
    ],
  },
  {
    id: "mobile",
    label: "Phone use",
    icon: IconDeviceMobile,
    title: "Use the full tool on a small screen",
    intro: "The mobile shell keeps one primary task visible at a time instead of shrinking the desktop columns.",
    steps: [
      "View shows the active drawing or calculation workspace.",
      "Model shows the complete object tree and add actions.",
      "Results shows checks, selected-object values and editable fields.",
      "Engineering Details can be minimised, resized or opened full page on the phone.",
    ],
  },
] as const;

type GuideSectionId = (typeof GUIDE_SECTIONS)[number]["id"];

export function HelpGuide({
  open,
  onClose,
}: {
  open: boolean;
  onClose(): void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [activeSection, setActiveSection] = useState<GuideSectionId>(
    GUIDE_SECTIONS[0].id,
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      window.setTimeout(() => closeRef.current?.focus(), 0);
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const section =
    GUIDE_SECTIONS.find((item) => item.id === activeSection) ?? GUIDE_SECTIONS[0];

  return (
    <dialog
      ref={dialogRef}
      className="help-guide-dialog"
      aria-labelledby="help-guide-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
    >
      <div className="help-guide-shell">
        <header>
          <div>
            <span><IconHelpCircle size={15} /> HELP AND USER GUIDE</span>
            <h2 id="help-guide-title">Trailer Stability</h2>
          </div>
          <button ref={closeRef} className="icon-button" aria-label="Close help" onClick={onClose}>
            <IconX size={17} />
          </button>
        </header>

        <nav aria-label="Help topics">
          {GUIDE_SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={section.id === id ? "active" : ""}
              aria-current={section.id === id ? "page" : undefined}
              onClick={() => setActiveSection(id)}
            >
              <Icon size={15} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <article>
          <span>HOW TO USE</span>
          <h3>{section.title}</h3>
          <p>{section.intro}</p>
          <ol>
            {section.steps.map((step) => <li key={step}>{step}</li>)}
          </ol>
          {section.id === "details" && (
            <aside>
              <IconArrowsMaximize size={16} />
              Full-page mode retains filters, editing, CSV export and the latest authoritative calculation.
            </aside>
          )}
        </article>

        <footer>
          <span>{HELP_GUIDE_REVISION}</span>
          <span>Guide coverage: setup · wind · model · results · details · optimisation · arrangement · phone</span>
        </footer>
      </div>
    </dialog>
  );
}
