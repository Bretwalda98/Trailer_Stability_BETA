import type { CalculationResult, ProjectModel } from "./types";
import { applyAutomaticProjectCargoCogEnvelopeInputs } from "./cargo-envelope";

/**
 * The calculation contract exposed to engineers and to interchange readers.
 * Keep this list in step with the native engine when an equation or limiting
 * value changes. It is intentionally plain data so it can be exported or
 * rendered without executing code.
 */
export const ENGINEERING_REFERENCE = {
  id: "TS-ENGINEERING-REFERENCE-1",
  title: "Trailer stability calculation reference",
  units: "SI units: m, t, kN, kN m, mm, degrees, m/s and m/s²",
  constants: [
    { id: "gravity", symbol: "g", value: 9.81, unit: "m/s²", meaning: "Acceleration used for mass-to-force conversion in stability and beam calculations." },
    { id: "road-gravity", symbol: "g-road", value: 9.80665, unit: "m/s²", meaning: "Acceleration used by the road traction and braking check." },
    { id: "traction-bogie-limit", symbol: "F-drive", value: 60, unit: "kN/bogie", meaning: "Mechanical traction limit per credited driven bogie." },
    { id: "braking-bogie-limit", symbol: "F-brake", value: 55, unit: "kN/bogie", meaning: "Mechanical braking limit per credited braked bogie." },
    { id: "cog-envelope-x", symbol: "eX", value: 0.025, unit: "of cargo length", meaning: "Default automatic longitudinal COG allowance, subject to a 0.100 m minimum." },
    { id: "cog-envelope-y", symbol: "eY", value: 0.025, unit: "of cargo width", meaning: "Default automatic transverse COG allowance, subject to a 0.100 m minimum." },
    { id: "cog-envelope-advised-minimum", symbol: "e-min", value: 0.02, unit: "of cargo dimension", meaning: "Advised minimum when a cargo COG envelope is entered manually." },
    { id: "cog-envelope-absolute-minimum", symbol: "e-abs", value: 0.1, unit: "m", meaning: "Automatic minimum; a smaller manual override is accepted only with a not-advised warning." },
  ],
  inputs: [
    { id: "cargo", values: "length, width, height, extreme X/Y, mass, COG X/Y/Z, COG envelope, projected wind areas, drag coefficients and wind application heights", purpose: "Defines the payload geometry, mass distribution and environmental force surfaces." },
    { id: "packing", values: "mass, height, COG X/Y/Z and visual footprint", purpose: "Adds packing mass and height to the load COG. The footprint is visual and calculation-neutral." },
    { id: "trailers", values: "catalogue definition, axle-line count, one-file flag, absolute or relative X/Y, PPU ends and enabled state", purpose: "Defines support coordinates, tare mass, PPU mass, axle capacity and beam properties." },
    { id: "hydraulics", values: "three- or four-point mode, split after axle line, corner groups and shared pinned axle lines", purpose: "Assigns axle reactions to the active hydraulic stability boundary." },
    { id: "supports", values: "support X, width, allowed state, optional positive connection to deck/spine beam and minimum active-support requirement", purpose: "Resets eligible supports, settles exact beam reactions and rejects arrangements with prohibited tension or too few active supports." },
    { id: "environment", values: "route and residual slopes, wind speed, longitudinal/transverse acceleration and combination factor", purpose: "Creates slope, wind and acceleration COG shifts for the applicable load cases." },
    { id: "road", values: "surface, wet/dry condition, speed, PPU drive limit, drive acceleration and brake deceleration", purpose: "Checks rolling resistance, grade, acceleration, traction adhesion and braking capacity." },
  ],
  calculations: [
    { id: "mass-cog", title: "Mass-weighted COG", formula: "COG = Σ(mᵢ × COGᵢ) / Σmᵢ", detail: "Cargo, packing, trailer tare, PPU and transporter components are combined using their positive masses and absolute coordinates." },
    { id: "wind-force", title: "Wind shift", formula: "q = v² / 1.6 / 1000; Δ = q × A × Cd × lever arm / (M × g)", detail: "Side and front projected areas act at their configured application heights. Automatic mode uses cargo length × height and cargo width × height, both at half cargo height." },
    { id: "slope-shift", title: "Slope shift", formula: "Δx = z × tan(longitudinal slope); Δy = z × tan(transverse slope)", detail: "The configured slope is represented by shifting the COG envelope; the drawing does not add a second sloping ground line." },
    { id: "acceleration-shift", title: "Acceleration shift", formula: "Δ = z × a / g", detail: "Longitudinal and transverse acceleration are added to the slope/wind case using the combined COG height." },
    { id: "stability-reaction", title: "Hydraulic reaction equilibrium", formula: "ΣR = W; Σ(Rx) = W × COGx; Σ(Ry) = W × COGy", detail: "Three-point and four-point systems solve the reaction fractions over their convex stability polygon. Negative or undefined reactions are not credited as active support." },
    { id: "stability-angle", title: "Tipping angle", formula: "angle = atan(distance from COG projection to controlling edge / COG height)", detail: "The minimum angle over the active polygon edges and each required basic, slope and dynamic perimeter case controls the result." },
    { id: "axle-load", title: "Axle and bogie load", formula: "axle load = group reaction × axle share, with tare and pinned-axle rules applied", detail: "Pinned axle lines carry their configured tare contribution while the remaining reactions are distributed across the unpinned axle lines." },
    { id: "ground-bearing", title: "Ground-bearing pressure", formula: "GBP = group gross load / Σ(active bogie shadow area); bogie shadow area = trailer width × axle pitch / bogies per axle line", detail: "The overall value uses neutral all-inclusive mass over the complete active shadow area. Each group value uses its maximum A-D cargo-envelope reaction and the actual width/pitch of every selected trailer represented in that group." },
    { id: "traction", title: "Road traction", formula: "capacity = min(μ × driven normal force, driven bogies × 60 kN); demand = rolling + uphill grade + acceleration", detail: "The active surface friction limits adhesion. The module pattern and PPU limit determine which driven bogies are credited." },
    { id: "braking", title: "Road braking", formula: "capacity = min(μ × braked normal force, braked bogies × 55 kN); demand = downhill grade + braking − rolling", detail: "Braking is checked independently from traction and both utilisations must be at or below 100% when road analysis is enabled." },
    { id: "beam", title: "Spine beam", formula: "continuous beam equilibrium with the selected mesh and settled support reactions", detail: "The engine records shear, bending moment, maximum absolute deflection, local bending and their utilisation values." },
    { id: "support-settlement", title: "Support reaction settlement", formula: "reset eligible supports; solve Rstatic; disable disallowed, undefined and negative rows; repeat until unchanged", detail: "Every exact reaction table and active-state transition is retained. A negative reaction remains active only through the explicit positive-connection option and is reported as a warned tensile design action." },
    { id: "pass", title: "Pass decision", formula: "geometry + support gate + required utilisation/angle/ratio checks + optional road check", detail: "A valid arrangement must form the selected hydraulic polygon, keep all required COG cases inside it, satisfy minimum active supports and meet the configured engineering degree limits." },
  ],
  resultFields: [
    { id: "stability", values: "basic, slope and dynamic utilisation; basic, slope and dynamic tipping angles; dynamic/static ratio", meaning: "Primary stability and capacity outputs." },
    { id: "structure", values: "shear, bending, deflection and local bending extrema/utilisations", meaning: "Spine-beam structural outputs." },
    { id: "road", values: "friction, rolling resistance, force demands, adhesion/mechanical capacities and utilisations", meaning: "Optional road movement outputs." },
    { id: "geometry", values: "resolved trailer positions, axle points, hydraulic groups, polygon, supports and overlap pairs", meaning: "Machine-readable arrangement geometry and diagnostics." },
    { id: "ground-bearing", values: "overall neutral pressure, per-group maximum A-D pressure, active contact area and equivalent axle-line counts", meaning: "Workbook-compatible loading pressure over the selected trailers' geometric shadow areas." },
  ],
} as const;

export function currentEngineeringValues(model: ProjectModel, result: CalculationResult) {
  model = applyAutomaticProjectCargoCogEnvelopeInputs(model);
  return {
    case: {
      degree: model.engineeringDegree,
      datum: model.referencePoint,
      orientation: model.longitudinalOrientation,
    },
    cargo: model.cargo,
    packing: model.packing,
    deckHeightM: model.trailerDeckHeightM,
    environment: model.environment,
    roadTransport: model.roadTransport,
    hydraulics: {
      mode: model.hydraulicSystemMode,
      groups: model.groupings,
      polygon: result.stabilityPolygon,
    },
    supportRequirement: {
      configuredMinimum: model.optimiser.minimumActiveSupports,
      settledActive: result.activeSupportCount,
      settledConverged: result.supportSettlement.converged,
      settlementOutcome: result.supportSettlement.outcome,
      settlementTrace: result.supportSettlement,
    },
    outputs: {
      status: result.status,
      metrics: result.metrics,
      stabilityReferences: result.stabilityReferences,
      analysis: result.analysis,
      beam: result.beam,
      roadTransport: result.roadTransport,
      groundBearing: result.groundBearing,
    },
  };
}
