# Manual beds, angled formations and deck-mounted PPUs

Implemented for TS-016/TS-017 on 2026-08-31. See the dated verification report in `reports/ts016-ts017-2026-08-31.md`.

## Entry and editing

Home offers **Build your own arrangement** and **Automatically find an arrangement**, with separate draft routes and a shared case model. Manual setup starts with road/case conditions, then cargo, optional packing/supports, trailer placement and review. Edit inputs reuses the manual placement editor. A new blank case has no invented trailer arrangement.

The manual matrix places individual 4-, 5- or 6-axle-line beds by rear-centre X, centre Y and yaw. Lower X is rear; positive yaw rotates the front toward positive Y. Beds with the same train ID form one continuous structural beam: they must be collinear, use the same catalogue definition, and touch end-to-end within 1 mm. Use a different train ID for an independently positioned bed. Join/align commands and undo/redo help edit connected beds. Attached PPUs belong only at the outer ends of a train.

Manual trains can use unequal axle counts. The present limits are 12 trains, 99 axle lines per train and yaw within ±45°. Supports remain global-X transverse strips, not an arbitrary three-dimensional support network.

## Secured independent PPUs

A deck-mounted PPU needs a host bed/train, position, orientation, length, width, height, mass, COG height above the deck, drag coefficient and securing confirmation. Its footprint must remain on its host and cannot intersect another PPU or the cargo volume. Moving/rotating the host through the editor carries the PPU with it.

The engine includes its mass and COG in hydraulic reactions, stability and inertial forces; wind uses conservative unshielded projected areas. The host spine beam receives a concentrated downward load at the PPU station. Available hydraulic power is credited to road-transport capacity only when explicitly enabled. PPU weight is counted once, separately from axle tare and attached PPUs.

This is **not** verification of lashings, deck-local strength, packing interference, torsion, steering compatibility or a full 3D structure. Those require separate engineering checks. The securing checkbox records an input assumption; it does not certify the connection.

## Automatic placement

The existing straight/staggered families are retained. Optional bounded parallel, fan and mirrored-angle families supplement them. Exact resolved width, clearances, support containment, three-/four-point hydraulics and per-train beam checks govern retained candidates. Angles default off. This bounded search does not prove a global optimum over arbitrary orientations.

Automatic search still uses equal axle counts per train and does not relocate independent PPUs. Remove these from the search draft, find/apply a formation, then add them in the manual editor and recalculate. Changing search hosts without remapping a PPU is blocked explicitly.

## Saving and AutoCAD

Project JSON retains the bed ledger and independent PPUs. Compact AutoCAD export (`.sartd`) uses `SARTD-CAD|2` for extended placement and retains v1 for ordinary cases. V2 adds BED, DECKPPU, VIEWPATH and VIEWTEXT records; coordinates are millimetres, mass tonnes and angles degrees. Pressure, group-load and GBP tables remain authoritative engine outputs. The export format is documented beside the LISP source.

Install **SARENS_TRAILERDRAFTSMAN v1.23** as a complete extracted folder. Keep `SARTD_Placement_v2.lsp` beside the main LISP and add that folder to AutoCAD's Support File Search Path/Trusted Locations. Load the main LISP, then use `SARTDCAD` and select the `.sartd` export. The common retained-import workflow continues through model space, Sarens/T.EN paper space and attributes. V2 draws correctly placed plan geometry and schematic orthographic equipment envelopes, not manufacturer fabrication drawings. It refuses missing companion geometry instead of flattening angles.

The older coded JSON/Excel paths cannot represent every new placement. Unsupported yaw, independent PPUs or unequal manual configurations are explicitly rejected there; they are not silently converted to a different arrangement. Use compact CAD, direct DXF or Project JSON for these cases.
