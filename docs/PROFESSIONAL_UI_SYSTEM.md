# Trailer Stability professional UI system

This document defines the product language and interface rules for the active Trailer Stability web application. It is intended to keep future changes consistent with a professional engineering workbench rather than a marketing dashboard.

## Product model

- The primary user task is **Find arrangement**: define the transport condition and available SPMT stock, then calculate the minimum verified formation.
- The arrangement search is the only optimisation workflow exposed by the active interface.
- **Edit inputs** remains available for detailed engineering changes and verification work. It is not presented as a competing optimisation workflow.
- The established Plan, End, Side, Hydraulics, Stability and Spine beam renderers are protected engineering views. UI changes may resize or frame them, but must not silently change their geometry or calculation inputs.
- Detailed search activity, ranked cases, import, export, AutoCAD transfer and engineering values remain available as supporting tools.

## Visual language

- Use a black and graphite workbench with white primary text, grey secondary text and one restrained blue action colour.
- Use red, amber and green only for engineering state, validation and warnings.
- Use square corners, one-pixel separators and compact controls. Geometry should feel drawn and measured.
- Do not add decorative gradients, glass effects, floating blobs, oversized rounded cards, icon mosaics or ornamental hero sections.
- Give drawings and tabular engineering data most of the available space.
- Keep one visually dominant action in each context. In the application shell that action is **Find arrangement**.
- Use system UI typography for controls and tabular numerals for engineering values. Do not use display typography for decoration.
- Mobile controls must have a minimum 44 px touch target. Forms, preview and navigation may change layout, but not capability.

## Product language

Write short, literal, action-led labels in sentence case.

Preferred terms:

- Find arrangement
- Edit inputs
- Open case
- Export verification
- Run arrangement search
- Search activity
- Check and run
- Blocking issue
- Search valid
- Saved on this device

Avoid promotional or vague language such as:

- smart, seamless, powerful, revolutionary, intelligent
- unlock, supercharge, effortlessly, cutting-edge
- optimise now, magic, best-in-class
- generic headings such as “Your journey” or “Next-generation solution”

State what happened, what value is affected and what the user can do next. Engineering state labels must use the established vocabulary: **PASS**, **NOK**, **WARNING**, **UNAVAILABLE**, **STOPPED** and **FAILED**.

## Validation and data presentation

- Put field errors next to the field and retain the consolidated preflight before a search starts.
- Explain errors precisely; do not blame the user or use generic text such as “Something went wrong”.
- Keep quantities and units together and use consistent decimal precision.
- Dense result tables take precedence over cards. Column headings must remain sortable where ranking is useful.
- Toolbar actions belong directly above the data they affect.
- Do not hide a failed engineering result behind a neutral toast or decorative status indicator.

## Information architecture

1. Start a case: new arrangement search, open case, or continue locally saved work.
2. Define the case: road conditions, cargo, packing/supports, trailer/PPU stock and search limits.
3. Check and run: resolve blocking inputs, review calculated search bounds, then start.
4. Inspect: drawings, engineering results, ranked arrangements and complete terminal-style activity.
5. Verify or transfer: export the calculation workbook/project data or send the arrangement to AutoCAD.

The left navigator may collapse to icons so the model tree does not compete with the drawing. The engineering details panel may collapse, resize or fill the available workspace.

## Accessibility and interaction

- Every icon-only control needs a visible tooltip or accessible name.
- Canvas/SVG interactions require matching labelled controls.
- Do not rely on colour alone for group, pass or failure identification.
- Preserve keyboard focus visibility and logical tab order.
- Respect reduced-motion preferences.
- Retain the last authoritative calculation while a newer result is being calculated.

## Source principles

These rules adapt established guidance to this engineering application:

- [Stop the SLOP](https://www.slopless.design/) identifies repetitive AI-generated visual conventions such as generic gradients, decorative card grids and meaningless copy.
- [GOV.UK: Writing for user interfaces](https://www.gov.uk/service-manual/design/writing-for-user-interfaces) recommends concise language that uses the user's vocabulary and reduces cognitive load.
- [GOV.UK: Button](https://design-system.service.gov.uk/components/button/) recommends sentence-case, action-led labels and a clear primary action.
- [GOV.UK: Error message](https://design-system.service.gov.uk/components/error-message/) and [Error summary](https://design-system.service.gov.uk/components/error-summary/) provide the basis for field-level and consolidated preflight feedback.
- [Carbon: Data table](https://v10.carbondesignsystem.com/components/data-table/usage/) informs the dense, sortable table and attached-toolbar approach.

## Change checklist

Before merging a UI change:

- Confirm **Find arrangement** still opens the mathematical arrangement workflow directly.
- Confirm no legacy optimiser entry point is visible.
- Check desktop, narrow desktop, portrait phone and landscape phone without page-level horizontal overflow.
- Smoke-test Plan, End, Side, Hydraulics, Stability and Spine beam views.
- Confirm import, export, AutoCAD transfer, help, model navigation and engineering details remain reachable.
- Run type checking, engineering tests, rendered-HTML tests and the production build.
- Compare current screenshots with the previous accepted screenshots at matching viewports.
