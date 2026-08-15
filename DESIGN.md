# Design System: Trailer Stability Engineering Workbench

This file is the visual and interaction source of truth for all Trailer Stability screens, generated views, wizards, reports, and future design prompts. Preserve the calculation logic and engineering drawings while applying these rules.

## 1. Visual Theme & Atmosphere

Create a restrained, high-density engineering cockpit: **Density 9/10, Variance 2/10, Motion 2/10**. The interface should feel like professional transport-engineering software—precise, calm, information-rich, and built for prolonged use. Use black technical canvases, white linework, compact controls, rigid alignment, and clear state changes. Decoration must never compete with geometry, dimensions, warnings, or results.

The viewport is the dominant working surface. Navigation, inputs, results, logs, and engineering details frame it as compact instruments. Prefer dividers, grouped rows, and negative space over floating cards. No marketing hero patterns belong inside the application.

## 2. Color Palette & Roles

- **Technical Canvas** (`#050607`) — application background.
- **Drawing Field** (`#030405`) — engineering SVG and graph background.
- **Instrument Panel** (`#080A0C`) — navigation, inspectors, toolbars, and drawers.
- **Input Well** (`#0D1013`) — editable fields and table inputs.
- **Structural Line** (`#252A2F`) — standard 1 px separators and grids.
- **Strong Line** (`#505860`) — selected boundaries and high-emphasis dividers.
- **Primary Ink** (`#F1F3F5`) — titles, values, and primary linework.
- **Secondary Ink** (`#AEB5BC`) — labels and supporting copy.
- **Faint Ink** (`#737D86`) — metadata and disabled context; never essential information.
- **Engineering Blue** (`#2F81F7`) — the only interaction accent: primary actions, active tabs, selection, and focus.
- **Pass Green** (`#2FC47C`) — valid input and PASS only.
- **Caution Amber** (`#E9A23B`) — incomplete, constrained, or warning states only.
- **Failure Red** (`#F05A61`) — blocking errors and NOK only.
- **Trace Cyan** (`#22C7DF`) — calculated vectors or hydraulic plot series, never a CTA.

Hydraulic groups may use distinct plot colours, but every group must also carry a visible `G1`–`G4` label, line pattern, or symbol. Never communicate engineering meaning through colour alone. Avoid gradients, neon glows, pure black, and decorative colour.

## 3. Typography & Data Hierarchy

- **Interface:** `IBM Plex Sans Variable`, with `Segoe UI Variable` and `Segoe UI` as fallbacks.
- **Engineering data:** `IBM Plex Mono`, with `Cascadia Mono` and `Consolas` as fallbacks.
- **Primary values:** 12–14 px, weight 650, tabular numerals.
- **Control labels:** 10–11 px, weight 550–650.
- **Section labels:** 9–10 px uppercase, tracking `0.045em`.
- **Dialog titles:** 18–22 px, weight 700, tight tracking.
- **Body/help text:** 12–14 px, line-height 1.45, maximum 65 characters per line where practical.

Use sentence case for actions and headings. Always show units beside values. Align comparable numbers by decimal position. Do not use serif type, `Inter`, oversized headings, or typography as decoration.

## 4. Layout Architecture

Use a full-height `100dvh` grid with no page-level scrolling on desktop:

1. **Command bar:** 36 px high; identity left, case state centre, actions right.
2. **Work area:** collapsible model tree (218 px), fluid central viewport, results inspector (294 px).
3. **Resizable detail drawer:** collapsed, user-sized, or full workspace.
4. **Status strip:** 22 px high for current load case and calculation state.

Keep the central viewport largest at every size. Desktop panels collapse to 44 px rails before the viewport becomes cramped. Use CSS Grid for structural layout; do not use percentage-width arithmetic or overlapping absolute-positioned panels.

Wizards use a compact step rail, a form column, and a dominant live preview. The preview changes by step but retains Plan, End, Side, Hydraulics, Stability, and Spine beam switches. A selected form row highlights the corresponding geometry.

## 5. Component Rules

### Command bars and navigation

Use square geometry with 0–2 px corner radii. Desktop controls are 28–36 px high; mobile targets are at least 44 px. Active items use a blue edge or underline plus stronger text—not a filled glowing pill. Collapse secondary actions into a labelled overflow menu before clipping.

### Buttons

Use one solid blue primary action per context. Secondary actions are dark with structural borders; destructive actions use red only after intent is clear. On press, translate by 1 px or reduce brightness. Never use pill buttons, gradient fills, or outer glows.

### Inputs and validation

Place labels above inputs and helper/error text below. Numeric inputs use tabular figures and display their unit outside the editable value. Correct entries receive a restrained green border/edge; invalid or incomplete entries receive amber, becoming red only when blocking. Preserve the entered value so the user can correct it. No floating labels.

### Tables and logs

Tables are dense, ruled, and sortable. Keep headers visible, indicate sort direction, and right-align numeric columns. The live activity view behaves like a copyable terminal: monospaced, timestamped, filterable, and detailed enough to reproduce each solver decision. Large tables scroll inside their own region, never the page.

### Results and status

Show `PASS`, `NOK`, `WARNING`, or `CALCULATING` in words with an icon and colour. Keep the last authoritative result visible while a new calculation is running. Present controlling case, edge, hydraulic group, utilisation, angle, active supports, and calculation time near the viewport.

### Engineering drawings

Draw geometry to scale from selected catalogue data. Use crisp 1 px structural lines and slightly stronger selected/controlling lines. Dimensions, COGs, envelopes, forces, support reactions, hydraulic boundaries, and tipping constructions must remain readable at zoom. Rear/lower X is always screen left; front/higher X is always screen right. Three-point mode draws a triangle; four-point mode draws the authoritative four-corner polygon. End-view tyres use vertical profiles, never circles.

All engineering drawings are directly operable with mouse and touch. Click or tap geometry to select it, drag a clear region to pan, use the mouse wheel or two-finger pinch to zoom around the pointer or gesture midpoint, and provide explicit Fit model and Reset view controls. Large translucent cargo and packing envelopes may be selected at their outlines but must not intercept selection of equipment beneath them. Every gesture retains an equivalent labelled control or model-tree action.

### Dialogs, empty states, and loading

Dialogs are bounded work surfaces, not floating promotional cards. Empty states explain the next valid action and show no invented arrangement. Use layout-matched skeletons for delayed content. A small calculation pulse may indicate active work; avoid generic full-screen spinners.

## 6. Responsive Behaviour

- **Above 1280 px:** full three-panel workbench.
- **900–1279 px:** collapse navigation first; allow the inspector to become a drawer.
- **Below 900 px:** viewport first, with model, inputs, results, and details in accessible sheets or accordions.
- **Below 768 px:** all wizard columns become one column; preview remains sticky only when it leaves enough room for the active field.
- **At 390 × 844 and smaller:** fixed Back/Next controls, 44 px targets, no clipped labels, and no horizontal page overflow.

Do not merely scale the desktop interface. Reorder it around the current task. Wide engineering tables may scroll within labelled containers. Preserve safe-area insets and test portrait and landscape layouts.

## 7. Motion & Feedback

Use 100–160 ms transitions for borders, colour, opacity, and panel movement. Animate only `transform` and `opacity`; never animate engineering geometry while values are being assessed. Calculation responses must be request-ordered so stale results cannot replace newer ones. Progress may pulse subtly and continuously while active, then stop immediately on completion. Honour `prefers-reduced-motion` and never use bouncing, floating, parallax, or cinematic entrance effects.

## 8. Content Language

Write direct engineering language: “Split after axle line”, “Minimum active supports”, “Combined COG pass only”, and “Four-point hydraulic boundary invalid”. State what failed, why it matters, and what value or action can resolve it. Avoid vague copy such as “Something went wrong”, and ban promotional clichés including “seamless”, “next-generation”, “unlock”, “elevate”, and “revolutionary”. Use real case terminology rather than generic placeholder names.

## 9. Accessibility & Safety

Maintain WCAG AA contrast for text and controls. Every canvas interaction must have an equivalent labelled control. Provide visible keyboard focus, logical tab order, accessible names, and non-colour status cues. Confirm destructive actions. Do not hide warnings behind hover. Engineering results must always identify their units, source/mode, and whether they apply to cargo-only or combined COG analysis.

## 10. Anti-Patterns (Never Use)

- No emojis, mascots, stock photography, or decorative illustration.
- No pure black, neon effects, glassmorphism, gradients, or oversized shadows.
- No rounded “AI dashboard” card collections or three equal-card feature rows.
- No pill-shaped controls unless the domain requires a binary segmented switch.
- No excessive empty space, giant headings, or centred marketing layouts.
- No overlapping text, controls, plots, annotations, or absolute-positioned content stacks.
- No hidden units, unexplained abbreviations, fake precision, or fabricated results.
- No desktop-only controls, clipped input boxes, or inaccessible canvas-only editing.
- No silent recalculation, stale result flashes, or colour-only PASS/NOK indicators.
- No visual change that alters the meaning, scale, or orientation of an engineering drawing.

## 11. Review Checklist

Before merging a visual change, verify 1440 × 1024, 900 px wide, 390 × 844, and landscape-phone layouts. Confirm keyboard access, focus visibility, reduced motion, no page overflow, no clipped controls, and readable chart labels. Exercise blank, valid, warning, failure, calculating, stopped, and empty states. For drawing changes, test multiple trailer types plus three- and four-point hydraulics and confirm rear-left/front-right orientation remains correct.
