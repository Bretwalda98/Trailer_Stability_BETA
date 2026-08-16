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
  IconTruck,
  IconX,
} from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";

export const HELP_GUIDE_REVISION = "Professional workbench revision 0.9.1 · reviewed 16 August 2026";

const GUIDE_SECTIONS = [
  {
    id: "quick-start",
    label: "Quick start",
    icon: IconSettings,
    title: "Set up a calculation-ready case",
    intro: "Every new case starts in the arrangement-search wizard. Existing cases can be opened from a saved project JSON file.",
    steps: [
      "Choose New arrangement search to start blank, Open case to load a file, or Continue case on this device to resume local work.",
      "Work through Cargo & case, Packing & supports, Trailer & PPU, Search limits, then Check & run.",
      "A new case contains no trailer formation. The search builds geometry only after the required inputs are entered and a result is applied.",
      "Resolve each blocking finding before moving on. Warnings remain visible and do not silently change engineering inputs.",
      "Select Run arrangement search on the final step. Progress, ranked candidates and the complete activity log open below the workbench.",
      "Use Edit inputs in the top bar after setup when you need direct access to every retained case input.",
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
    intro: "The left navigator combines the analysis workspace selector and the active model tree.",
    steps: [
      "Use Model navigator to collapse the whole left panel when the drawing needs more room; the compact analysis icons remain available.",
      "Select WORKSPACE to choose Arrangement, Hydraulics, Load cases, Stability, Spine beam or Report.",
      "Use the model tree to select cargo, trailers, axle lines, supports and hydraulic groups.",
      "In any engineering drawing, click or tap geometry to inspect it. Drag a clear area to pan; use the mouse wheel or a two-finger pinch to zoom around the pointer position.",
      "Hold Shift or the middle mouse button to pan from over selectable geometry. A completed drag or pinch is suppressed so it cannot accidentally activate the item underneath.",
      "With the drawing focused, use the arrow keys to pan, + and - to zoom, and 0 or Home to fit the model.",
      "Use Fit model or Reset view to recover the complete drawing. Double-clicking a clear desktop drawing area also fits the model.",
      "In Spine beam, point, touch or use the left and right arrow keys on each chart to inspect the exact X position and result value.",
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
      "Choose three- or four-point hydraulics. Every selected group must be populated as a local cluster and form a non-degenerate convex stability boundary.",
      "Use Individual X stagger in the trailer editor when parallel trains must not share the same rear/front line.",
    ],
  },
  {
    id: "road",
    label: "Road transport",
    icon: IconTruck,
    title: "Check traction, braking and route resistance",
    intro: "Road transport analysis is optional and uses the selected surface, friction, rolling-resistance and module traction values shown in the case.",
    steps: [
      "Enable Road transport analysis in Supports & checks or in the mathematical arrangement wizard.",
      "Select asphalt, concrete, soil/earth, gravel, sand or steel and choose dry or wet condition. The result shows the exact friction and rolling-resistance values used.",
      "Select Standard (26 driven bogies per PPU), Alaska (32) or a separately verified custom PPU drive limit.",
      "The engine maps exact 4/5/6-AL SPMT module builds to the configured driven/braked bogie patterns and limits them to 60 kN traction and 55 kN braking per applicable bogie.",
      "Both mechanical force and tyre/surface adhesion are checked. Route grade, rolling resistance, drive acceleration and brake deceleration are included in demand.",
      "If the enabled road analysis is NOK, the overall engineering case is NOK. An unbuildable module pattern is reported as unavailable rather than estimated silently.",
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
    id: "arrangement",
    label: "Arrangement search",
    icon: IconPlayerPlay,
    title: "Find the minimum constructible SPMT arrangement",
    intro: "This is the product's single optimisation workflow. It designs in-line or bounded staggered train formations and verifies every retained case with the engineering engine.",
    steps: [
      "Choose New arrangement search on the start screen or Find arrangement in the top bar.",
      "Enter the cargo, cargo COG, packing, trailer deck height and packing supports. New mathematical-search cases begin blank and do not insert a trailer arrangement before the search finishes.",
      "Choose the trailer family, PPU location (none, rear, front or both ends) and available 4-, 5- and 6-axle-line modules.",
      "Set train-count, stock and formation limits. A per-train axle count is eligible only when it is exactly constructible from the enabled module sizes.",
      "Train Y positions are placed at equal offsets from the all-inclusive COG. The standard preferred spacing is 2.9 m centre-to-centre and can be changed.",
      "Longitudinal formation can retain legacy in-line trains or test bounded mirrored stagger templates. In-line is checked first, followed by increasing stagger, avoiding an independent X grid for every train.",
      "Choose three- or four-point hydraulics. Four-point reactions satisfy total force and both moments exactly while balancing load per active bogie; stability uses the convex four-corner boundary.",
      "Project wind and acceleration remain authoritative by default. If Search-only wind and acceleration is enabled and any value is reduced, the applied case is explicitly changed to Third-degree verification and the reduction is logged.",
      "Road transport analysis can be included so a retained arrangement must also pass its powered traction and braking checks.",
      "Optional cargo-width limiting keeps the complete trailer formation between the cargo left and right edges; the switch is off by default so existing searches retain their current behaviour.",
      "The hard decision order is engineering PASS, minimum total axle lines, minimum train count when total AL is equal, closest valid preferred spacing, then the selected engineering weighting.",
      "Mathematical branch-and-bound calculates the payload capacity lower bound, rejects unbuildable 4/5/6-AL totals, and derives the minimum hydraulic Y span from the all-inclusive COG height, COG envelope, dynamic shifts and required tipping angles.",
      "The fast search tests the capacity lower and upper axle-line bounds, bisects a passing range, removes trailer-X positions that cannot contain the minimum support footprints, and restores exact legacy-step cases inside mathematically feasible intervals when the reduced probes find no pass.",
      "The widest allowable pitch establishes the feasibility bound, then the preferred 2.9 m pitch is checked. If needed, the solver brackets and bisects the closest passing boundary instead of stepping through every spacing.",
      "The winning formation then receives a complete legacy-grid engineering search, including support settling, split, X, pin and refinement logic, before it can be ranked first.",
      "A multi-train formation with fewer total axle lines beats a one-train formation with more AL. Both three-point and four-point hydraulic systems are checked by default; every retained candidate still runs the exact support-settling, stability, spine-beam and pin logic.",
      "Choose Legacy full grid search inside the wizard whenever exhaustive non-monotonic checking of every configured axle, split, X and spacing step is required.",
      "Review the train, module, pitch and width columns in the results drawer, then apply the selected result to rebuild and recalculate the active case.",
    ],
  },
  {
    id: "exchange",
    label: "Data exchange",
    icon: IconFileImport,
    title: "Exchange project and drawing data",
    intro: "Project JSON keeps the complete case portable. The AutoCAD export is a coded, versioned drawing-data interchange.",
    steps: [
      "Use Open case or Import project JSON to resume a saved calculation-ready case.",
      "Export to AutoCAD downloads one numbered case-data JSON containing resolved trailer geometry, axle points, hydraulic groups, supports, catalogue values and the authoritative result.",
      "In AutoCAD run SARTDJSON and select the numbered trailer-stability-autocad-######.json file. The versioned decoding key is supplied separately with the AutoCAD reader package and is not downloaded for every case.",
      "The AutoCAD action does not require a bridge, a running desktop application or a particular drawing command; AutoLISP or another reader can consume the JSON directly.",
      "Project JSON saves the complete standalone web model and is available from the More menu.",
      "Visual-only packing footprint geometry stays in the web project and does not alter the engineering calculation.",
    ],
  },
  {
    id: "engineering-reference",
    label: "Methods and values",
    icon: IconTable,
    title: "Understand the values used by the engine",
    intro: "The engineering reference lists the active inputs, constants, equations, pass gates and result fields. It is maintained with the calculation engine and is also embedded in AutoCAD exports.",
    steps: [
      "Mass and COG values are combined using a mass-weighted average of cargo, packing, trailer, PPU and transporter components.",
      "The basic, slope and dynamic cases use the hydraulic stability polygon and the minimum angle from the COG projection to each controlling edge.",
      "Slope, wind and acceleration are applied as COG-envelope shifts. The end and side drawings do not add a second sloped ground line.",
      "Axle reactions satisfy total force and both horizontal moments. Pinned axle lines, support settlement and minimum active-support rules are applied before a case can pass.",
      "Road traction capacity is the lower of surface adhesion and the mechanical driven-bogie limit; braking is checked independently with its own adhesion and mechanical limits.",
      "Spine-beam shear, bending, deflection and local bending are calculated from settled support reactions and the selected load case.",
      "Open Engineering details for the current numeric values, or read the engineering reference in the AutoCAD JSON for the equations and field meanings.",
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
      "Setup and arrangement-search forms stack into one scrollable input pane with fixed navigation. Use Expand preview to inspect the live engineering view full screen, then Return to inputs.",
      "Engineering-detail records, report checks and hydraulic circuit rows become labelled mobile records so values and controls do not rely on a clipped desktop table.",
      "In landscape, the preview becomes shorter and the input pane receives more working height; all primary actions remain visible at the bottom.",
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

        <label className="help-topic-picker">
          <span>Help topic</span>
          <select
            value={section.id}
            onChange={(event) => setActiveSection(event.target.value as GuideSectionId)}
          >
            {GUIDE_SECTIONS.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>

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
          <span>Guide coverage: setup · wind · hydraulics · road transport · results · arrangement search · exchange · phone</span>
        </footer>
      </div>
    </dialog>
  );
}
