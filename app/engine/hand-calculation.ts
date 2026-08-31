import { engineeringLimitsFor } from "./core";
import { deckPpuWind } from "./deck-ppus";
import { applyAutomaticProjectCargoCogEnvelopeInputs } from "./cargo-envelope";
import type { CalculationResult, ProjectModel, TrailerDefinition } from "./types";

export interface HandCalculationEquation {
  label: string;
  latex: string;
}

export interface HandCalculationFact {
  label: string;
  value: string;
}

export interface HandCalculationSection {
  id: string;
  title: string;
  explanation: string[];
  equations: HandCalculationEquation[];
  facts: HandCalculationFact[];
}

export interface HandCalculationDocument {
  title: string;
  subtitle: string;
  generatedAt: string;
  status: CalculationResult["status"];
  sections: HandCalculationSection[];
  latex: string;
}

function finite(value: number | null | undefined, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function n(value: number | null | undefined, digits = 3): string {
  return finite(value).toFixed(digits);
}

function percent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "not available";
  return `${(finite(value) * 100).toFixed(digits)}%`;
}

function texEscape(value: string): string {
  const replacements: Record<string, string> = {
    "\\": "\\textbackslash{}",
    "&": "\\&",
    "%": "\\%",
    "$": "\\$",
    "#": "\\#",
    "_": "\\_",
    "{": "\\{",
    "}": "\\}",
    "~": "\\textasciitilde{}",
    "^": "\\textasciicircum{}",
  };
  return Array.from(value, (character) => replacements[character] ?? character).join("");
}

function definitionForAnalysedTrailer(model: ProjectModel): TrailerDefinition | null {
  const trailer = model.trailers[Math.max(0, model.analysedTrailer - 1)] ?? model.trailers[0];
  return trailer ? model.catalogue.find((item) => item.id === trailer.definitionId) ?? null : null;
}

function fact(label: string, value: string): HandCalculationFact {
  return { label, value };
}

function equation(label: string, latex: string): HandCalculationEquation {
  return { label, latex };
}

function buildLatex(
  title: string,
  subtitle: string,
  generatedAt: string,
  status: CalculationResult["status"],
  sections: HandCalculationSection[],
): string {
  const body = sections.map((section) => [
    `\\section{${texEscape(section.title)}}`,
    ...section.explanation.map((paragraph) => texEscape(paragraph)),
    ...section.equations.flatMap((item) => [
      `\\paragraph{${texEscape(item.label)}}`,
      `\\begin{equation*}\n${item.latex}\n\\end{equation*}`,
    ]),
    ...(section.facts.length
      ? [
          "\\begin{longtable}{@{}p{0.43\\linewidth}p{0.52\\linewidth}@{}}",
          "\\toprule",
          "Quantity & Calculated value \\\\",
          "\\midrule",
          "\\endhead",
          ...section.facts.map((item) => `${texEscape(item.label)} & ${texEscape(item.value)} \\\\`),
          "\\bottomrule",
          "\\end{longtable}",
        ]
      : []),
  ].join("\n\n")).join("\n\n");

  return [
    "\\documentclass[11pt,a4paper]{article}",
    "\\usepackage[margin=18mm]{geometry}",
    "\\usepackage{amsmath,amssymb,booktabs,longtable,siunitx,xcolor,hyperref}",
    "\\sisetup{detect-all}",
    "\\definecolor{passgreen}{RGB}{14,128,77}",
    "\\definecolor{failred}{RGB}{184,37,50}",
    `\\title{${texEscape(title)}}`,
    `\\author{Trailer Stability Engineering Workbench}`,
    `\\date{${texEscape(generatedAt)}}`,
    "\\begin{document}",
    "\\maketitle",
    `\\noindent\\textbf{Case:} ${texEscape(subtitle)}\\hfill\\textbf{Result:} ${texEscape(status)}`,
    "\\tableofcontents",
    "\\newpage",
    body,
    "\\section{Engineering-use statement}",
    "This calculation record reproduces the numerical inputs, equations and authoritative outputs used by the current browser calculation. It is intended to support engineering review; project-specific approval, independent checking and applicable procedures remain required.",
    "\\end{document}",
    "",
  ].join("\n");
}

/**
 * Creates the human-readable and compilable LaTeX calculation from the same
 * authoritative model/result pair shown in the workbench. Calculated results
 * are reported, not independently approximated, so the reader cannot drift
 * from the active engineering case.
 */
export function buildHandCalculation(
  model: ProjectModel,
  result: CalculationResult,
  generatedAt = new Date().toISOString(),
): HandCalculationDocument {
  model = applyAutomaticProjectCargoCogEnvelopeInputs(model);
  const limits = engineeringLimitsFor(model.engineeringDegree);
  const definition = definitionForAnalysedTrailer(model);
  const loosePackingMass = model.loosePacking.reduce((sum, item) => sum + Math.max(0, item.massT), 0);
  const loadMass = model.cargo.massT + model.packing.massT + loosePackingMass;
  const transporterMass = Math.max(0, result.totalMassT - loadMass);
  const cargoMassFraction = result.totalMassT > 0 ? model.cargo.massT / result.totalMassT : 0;
  const combinedEnvelopeX = model.cargo.envelopeX * cargoMassFraction;
  const combinedEnvelopeY = model.cargo.envelopeY * cargoMassFraction;
  const windPressure = model.environment.windSpeedMps ** 2 / 1.6 / 1000;
  const deckWind = deckPpuWind(model);
  const frontWindForce = windPressure * (model.cargo.frontWindAreaM2 * model.cargo.frontDragCoefficient + deckWind.front);
  const sideWindForce = windPressure * (model.cargo.sideWindAreaM2 * model.cargo.sideDragCoefficient + deckWind.side);
  const frontWindLever = model.cargo.frontWindHeightM + model.packing.heightM + model.trailerDeckHeightM;
  const sideWindLever = model.cargo.sideWindHeightM + model.packing.heightM + model.trailerDeckHeightM;
  const axleMax = result.axlePoints.reduce(
    (best, axle) => axle.loadT > (best?.loadT ?? Number.NEGATIVE_INFINITY) ? axle : best,
    result.axlePoints[0],
  );
  const groupFacts = result.groups.flatMap((group) => {
    const ground = result.groundBearing.groups.find((item) => item.group === group.group);
    return [
      fact(`Hydraulic group G${group.group}`, `${n(group.loadT)} t at X ${n(group.point.x)} m, Y ${n(group.point.y)} m`),
      fact(`G${group.group} reaction / active bogies`, `${percent(group.reactionFraction, 2)} / ${group.axleCount}`),
      fact(`G${group.group} maximum A-D axle-line load / GBP`, `${n(ground?.maximumEnvelopeAxleLineLoadT)} t/AL / ${n(ground?.pressureTPerM2)} t/m²`),
    ];
  });
  const trailerFacts = result.resolvedTrailers.map((trailer) => {
    const input = model.trailers[trailer.index];
    return fact(
      `Trailer ${trailer.index + 1}: ${trailer.name}`,
      `${input?.axleLines ?? 0} AL; rear X ${n(trailer.startXM)} m; centre Y ${n(trailer.centreYM)} m; ${n(trailer.lengthM)} m × ${n(trailer.widthM)} m`,
    );
  });
  const supportFacts = result.supports.map((support, index) =>
    fact(
      `Support ${index + 1} (${support.id})`,
      `${support.active ? "ACTIVE" : "INACTIVE"}; X ${n(support.xM)} m; spread ${n(support.widthM)} m; reaction ${n(support.reactionT)} t; ${support.reactionState}${support.positiveConnectionToDeck ? "; POSITIVE CONNECTION TO DECK/SPINE BEAM" : ""}${support.disableReason ? `; ${support.disableReason}` : ""}`,
    ),
  );
  const settlementFacts = result.supportSettlement.steps.map((step) => fact(
    `Settlement step ${step.iteration} (${step.stage})`,
    `active before [${step.activeSupportIdsBefore.join(", ") || "none"}]; reactions ${step.reactions.map((reaction) => `${reaction.supportId}=${n(reaction.reactionT)} t (${reaction.outcome})`).join(", ") || "none"}; transitions ${step.transitions.map((transition) => `${transition.supportId} ${transition.fromActive ? "ON" : "OFF"}->${transition.toActive ? "ON" : "OFF"} (${transition.reason})`).join(", ") || "none"}; active after [${step.activeSupportIdsAfter.join(", ") || "none"}]`,
  ));
  const beamI = definition ? definition.secondMomentCm4 * 1e-8 : 0;
  const beamEI = 210e6 * beamI;
  const road = result.roadTransport;

  const sections: HandCalculationSection[] = [
    {
      id: "basis",
      title: "Calculation basis and geometry",
      explanation: [
        "The longitudinal datum increases from rear to front: rear is lower X and left in plan; front is higher X and right in plan. All dimensions below are resolved absolute values after any load-COG or all-inclusive-COG placement iteration.",
        `The ${model.engineeringDegree.toLowerCase()}-degree engineering limits are applied to the current load case. The hydraulic boundary is the convex ${model.hydraulicSystemMode === "FOUR_POINT" ? "four-point polygon" : "three-point triangle"} formed by the active group centres.`,
      ],
      equations: [
        equation("Resolved trailer length", "L_t=n_{AL}\\,p_{AL}"),
        equation("Formation resource measure", "N_{AL,\\,total}=\\sum_{j=1}^{n_t}N_{AL,j}"),
      ],
      facts: [
        fact("Case / client reference", `${model.cargo.name || "Untitled"} / ${model.cargo.clientReference || "not supplied"}`),
        fact("Engineering degree", model.engineeringDegree),
        fact("Cargo dimensions", `${n(model.cargo.lengthM)} m × ${n(model.cargo.widthM)} m × ${n(model.cargo.heightM)} m`),
        fact("Cargo datum extremes", `rear X ${n(model.cargo.extremeX)} m; left Y ${n(model.cargo.extremeY)} m`),
        fact("Hydraulic system", model.hydraulicSystemMode === "FOUR_POINT" ? "Four-point stability polygon" : "Three-point stability triangle"),
        fact("Hydraulic boundary area / minimum width", `${n(result.groupingQuality.polygonAreaM2)} m² / ${n(result.groupingQuality.minimumAltitudeM)} m`),
        ...trailerFacts,
      ],
    },
    {
      id: "mass-cog",
      title: "Mass schedule and centres of gravity",
      explanation: [
        "Each component COG is combined by first moment of mass. Packing, loose packing, trailer self-weight and PPU mass are retained in the same all-inclusive result used for stability and axle loading.",
        "Cargo uncertainty is scaled by the cargo fraction of all-inclusive mass before it is applied to the combined COG; the cargo-only check retains the full cargo envelope.",
      ],
      equations: [
        equation("All-inclusive mass", `m_A=\\sum_i m_i=${n(result.totalMassT)}\\ \\mathrm{t}`),
        equation("All-inclusive COG", "x_A=\\frac{\\sum_i m_i x_i}{\\sum_i m_i},\\quad y_A=\\frac{\\sum_i m_i y_i}{\\sum_i m_i},\\quad z_A=\\frac{\\sum_i m_i z_i}{\\sum_i m_i}"),
        equation("Combined COG envelope", `e_{x,A}=e_{x,c}\\frac{m_c}{m_A}=${n(combinedEnvelopeX)}\\ \\mathrm{m},\\quad e_{y,A}=e_{y,c}\\frac{m_c}{m_A}=${n(combinedEnvelopeY)}\\ \\mathrm{m}`),
      ],
      facts: [
        fact("Cargo mass and COG", `${n(model.cargo.massT)} t at (${n(result.componentCogs.cargo.x)}, ${n(result.componentCogs.cargo.y)}, ${n(result.componentCogs.cargo.z)}) m`),
        fact("Packing + loose packing mass", `${n(model.packing.massT + loosePackingMass)} t`),
        fact("Payload mass and load COG", `${n(loadMass)} t at (${n(result.loadCog.x)}, ${n(result.loadCog.y)}, ${n(result.loadCog.z)}) m`),
        fact("Transporter / PPU mass included", `${n(transporterMass)} t`),
        fact("All-inclusive COG", `(${n(result.combinedCog.x)}, ${n(result.combinedCog.y)}, ${n(result.combinedCog.z)}) m`),
        fact("Cargo COG envelope", `±${n(model.cargo.envelopeX)} m X; ±${n(model.cargo.envelopeY)} m Y`),
      ],
    },
    {
      id: "actions",
      title: "Slope, wind and dynamic COG shifts",
      explanation: [
        "Road slope is represented as an equivalent horizontal COG translation. Wind pressure follows the current calculation method q = V² / 1.6 and acts at the configured projected-area height above the trailer deck and packing. Inertial translation is z a / g.",
        "The basic cloud contains the nominal combined COG and four envelope corners. Slope and dynamic perimeter clouds apply the configured combination factor to the concurrent X/Y extremes; the authoritative worst point is then checked against every stability edge.",
      ],
      equations: [
        equation("Slope shift", "\\Delta x_s=z_A\\tan\\theta_x,\\qquad \\Delta y_s=z_A\\tan\\theta_y"),
        equation("Wind pressure", `q=\\frac{V^2}{1.6\\times1000}=\\frac{${n(model.environment.windSpeedMps)}^2}{1600}=${n(windPressure, 5)}\\ \\mathrm{kN/m^2}`),
        equation("Wind actions", `F_{w,x}=q(A_fC_{d,f}+A_{PPU,x}C_d)=${n(frontWindForce)}\\ \\mathrm{kN},\\quad F_{w,y}=q(A_sC_{d,s}+A_{PPU,y}C_d)=${n(sideWindForce)}\\ \\mathrm{kN}`),
        equation("Wind COG shift", "\\Delta x_w=\\frac{(qA_fC_{d,f}h_{w,x}+M_{PPU,x})}{m_Ag},\\qquad \\Delta y_w=\\frac{(qA_sC_{d,s}h_{w,y}+M_{PPU,y})}{m_Ag}"),
        equation("Acceleration shift", "\\Delta x_a=\\frac{z_Aa_x}{g},\\qquad \\Delta y_a=\\frac{z_Aa_y}{g}"),
        equation("Dynamic shift", "\\boldsymbol{\\Delta}_{dyn}=\\boldsymbol{\\Delta}_{s}+\\boldsymbol{\\Delta}_{w}+\\boldsymbol{\\Delta}_{a}"),
      ],
      facts: [
        fact("Residual slopes", `${n(model.environment.longitudinalSlopeDeg)}° longitudinal; ${n(model.environment.transverseSlopeDeg)}° transverse`),
        fact("Slope shift", `X ${n(result.analysis.slopeShift.x)} m; Y ${n(result.analysis.slopeShift.y)} m`),
        fact("Wind areas / levers", `front ${n(model.cargo.frontWindAreaM2)} m² at ${n(frontWindLever)} m; side ${n(model.cargo.sideWindAreaM2)} m² at ${n(sideWindLever)} m`),
        fact("Deck PPU wind moments", `front ${n(windPressure * deckWind.frontMoment)} kNm; side ${n(windPressure * deckWind.sideMoment)} kNm; unshielded rectangular projections`),
        fact("Wind shift", `X ${n(result.analysis.windShift.x)} m; Y ${n(result.analysis.windShift.y)} m`),
        fact("Accelerations", `X ${n(model.environment.longitudinalAccelerationMps2)} m/s²; Y ${n(model.environment.transverseAccelerationMps2)} m/s²`),
        fact("Acceleration shift", `X ${n(result.analysis.accelerationShift.x)} m; Y ${n(result.analysis.accelerationShift.y)} m`),
        fact("Combined dynamic translation", `X ${n(result.analysis.dynamicShift.x)} m; Y ${n(result.analysis.dynamicShift.y)} m`),
        fact("Combination factor", n(model.environment.combinationFactor)),
      ],
    },
    {
      id: "hydraulics",
      title: "Hydraulic reactions and axle loading",
      explanation: [
        model.hydraulicSystemMode === "FOUR_POINT"
          ? "Four independent hydraulic group reactions satisfy vertical force and two moment equilibria. The remaining statically indeterminate degree of freedom is resolved by the engine's minimum-variance non-negative allocation, then each COG case is checked against the four-point polygon."
          : "Three hydraulic group reactions are the barycentric coordinates of the COG within the stability triangle. Multiplying each fraction by the all-inclusive mass gives the exact group load while satisfying vertical force and both plan-moment equilibria.",
        "Each group load is distributed over its active, unpinned bogies. The individual bogie capacity comes from the selected trailer catalogue; the maximum reported utilisation is the controlling axle-loading check.",
        "Ground-bearing pressure uses the same geometric shadow-area method as the calculation sheet. Each active bogie contributes trailer width × axle pitch divided by the number of bogies on its axle line; group pressure uses the maximum A-D cargo-envelope reaction.",
      ],
      equations: [
        equation("Vertical and plan-moment equilibrium", "\\sum_iR_i=W,\\qquad \\sum_iR_ix_i=Wx_c,\\qquad \\sum_iR_iy_i=Wy_c"),
        equation("Group and bogie load", "R_i=\\lambda_i m_A,\\qquad P_{i,b}=\\frac{R_i}{n_{i,b}}"),
        equation("Axle utilisation", "U_{axle}=\\max_b\\left(\\frac{P_b}{P_{allow,b}}\\right)"),
        equation("Ground-bearing pressure", "GBP_i=\\frac{\\max(R_{i,N},R_{i,A},R_{i,B},R_{i,C},R_{i,D})}{\\sum_b A_{shadow,b}},\\qquad A_{shadow,b}=\\frac{w_b p_b}{n_{bogies/AL,b}}"),
      ],
      facts: [
        ...groupFacts,
        fact("Maximum calculated axle load", `${n(result.analysis.maximumAxleLoadT ?? axleMax?.loadT)} t`),
        fact("Controlling group", result.analysis.controllingGroup ? `G${result.analysis.controllingGroup}` : "not available"),
        fact("Peak axle utilisation", percent(Math.max(0, ...result.axlePoints.map((axle) => axle.utilisation)))),
        fact("Total axle lines used", `${n(result.metrics.axleLinesUsed.value, 0)} AL`),
        fact("Overall neutral ground-bearing pressure", `${n(result.groundBearing.overallTPerM2)} t/m²`),
        fact("Maximum group ground-bearing pressure", `${n(result.groundBearing.maximumGroupTPerM2)} t/m²`),
      ],
    },
    {
      id: "stability",
      title: "Stability polygon and tipping angles",
      explanation: [
        "For every basic, slope and dynamic COG point, the perpendicular distance to every hydraulic boundary edge is calculated. A point outside any edge fails geometry. For an inside point, the tipping angle is the arctangent of horizontal edge reserve divided by the relevant COG height.",
        "Cargo-only angles are evaluated separately. If cargo-only fails but all-inclusive stability passes, the result is explicitly classified as COMBINED COG PASS ONLY; it is never presented as an independent cargo pass.",
      ],
      equations: [
        equation("Signed edge distance", "d_e=\\frac{(B_x-A_x)(P_y-A_y)-(B_y-A_y)(P_x-A_x)}{\\lVert B-A\\rVert}"),
        equation("Tipping angle", "\\alpha_e=\\tan^{-1}\\left(\\frac{d_e}{z_{COG}}\\right),\\qquad \\alpha_{case}=\\min_e\\alpha_e"),
      ],
      facts: [
        fact("Basic utilisation / angle / limit", `${percent(result.metrics.basicUtil.value)} / ${n(result.metrics.basicAngle.value)}° / ≥${n(limits.basicAngle)}°`),
        fact("Slope utilisation / angle / limit", `${percent(result.metrics.slopeUtil.value)} / ${n(result.metrics.slopeAngle.value)}° / ≥${n(limits.slopeAngle)}°`),
        fact("Dynamic utilisation / angle / limit", `${percent(result.metrics.dynamicUtil.value)} / ${n(result.metrics.dynamicAngle.value)}° / ≥${n(limits.dynamicAngle)}°`),
        fact("Dynamic / static group-load ratio", `${percent(result.metrics.dynamicRatio.value)}; limit ≥${percent(limits.dynamicRatio)}`),
        fact("Controlling mode / edge", `${result.analysis.controllingMode}; edge ${result.analysis.controllingEdgeIndex + 1}`),
        fact("Controlling COG point", `(${n(result.analysis.controllingPoint.x)}, ${n(result.analysis.controllingPoint.y)}) m`),
        fact("Controlling edge reserve / angle", `${n(result.analysis.controllingDistanceM)} m / ${n(result.analysis.controllingAngleDeg)}°`),
        fact("Cargo-only basic / slope / dynamic", `${n(result.stabilityReferences.cargoBasicAngle.value)}° / ${n(result.stabilityReferences.cargoSlopeAngle.value)}° / ${n(result.stabilityReferences.cargoDynamicAngle.value)}°`),
        fact("COG pass basis", result.stabilityReferences.cargoOnlyPass ? "Cargo and all-inclusive COG pass" : result.stabilityReferences.combinedCogPassOnly ? "COMBINED COG PASS ONLY" : "No complete angle pass"),
      ],
    },
    {
      id: "supports",
      title: "Cargo supports and reaction settlement",
      explanation: [
        "Every eligible support is first activated. The exact continuous-beam reaction solution is calculated, then disallowed, undefined or negative-reaction supports are switched off as one deterministic batch. The beam is recalculated repeatedly until no additional prohibited negative reaction remains. The settled active count must meet the configured minimum.",
        "A support may retain a tensile reaction only when Positive connection to deck / spine beam is explicitly enabled. This is off by default and the retained negative Rstatic is a connection design action, not a compression bearing reaction.",
        "Support spreading is represented by two equal forces at the outer edges of each support width after the first reaction pass, matching the engineering load-spreading method used by the structural solver.",
      ],
      equations: [
        equation("Support acceptance", "R_j\\ge-\\varepsilon\\;\\land\\;allowed_j\\;\\Longrightarrow\\;active_j"),
        equation("Restrained tension exception", "R_j<-\\varepsilon\\;\\land\\;positiveConnection_j\\;\\Longrightarrow\\;active_j\\;\\text{ with tension warning}"),
        equation("Minimum support gate", `N_{active}\\ge N_{minimum}=${result.minimumActiveSupports}`),
      ],
      facts: [
        fact("Settlement iterations", String(result.supportIterations)),
        fact("Settlement outcome", `${result.supportSettlement.outcome}; converged=${result.supportSettlement.converged}; exact calculations=${result.supportSettlement.calculationCount}; ${n(result.supportSettlement.calculationTimeMs)} ms`),
        fact("Active support check", `${result.activeSupportCount} active / ${result.minimumActiveSupports} minimum`),
        ...settlementFacts,
        ...supportFacts,
      ],
    },
    {
      id: "beam",
      title: "Spine-beam shear, bending and deflection",
      explanation: [
        "The analysed trailer spine is solved as a continuous Euler–Bernoulli beam. Feature nodes are placed at beam ends, stiffness boundaries, supports, axle-line point loads and distributed-load boundaries. Translational displacement is constrained at active supports; rotations remain free.",
        "The assembled stiffness system is solved with symmetric banded LDLᵀ factorisation. Exact element end actions and distributed-load polynomials produce the reported shear, bending moment and deflection diagrams. Signed positive/negative catalogue capacities are respected independently.",
      ],
      equations: [
        equation("Beam differential relations", "EI\\,v''''(x)=w(x),\\qquad M(x)=EI\\,v''(x),\\qquad V(x)=\\frac{dM}{dx}"),
        equation("Finite-element equilibrium", "[K]\\{d\\}=\\{F\\},\\qquad [K_e]=\\frac{EI}{L_e^3}\\begin{bmatrix}12&6L_e&-12&6L_e\\\\6L_e&4L_e^2&-6L_e&2L_e^2\\\\-12&-6L_e&12&-6L_e\\\\6L_e&2L_e^2&-6L_e&4L_e^2\\end{bmatrix}"),
        equation("Section stiffness", `I=${n(beamI, 8)}\\ \\mathrm{m^4},\\qquad EI=${n(beamEI, 1)}\\ \\mathrm{kN\\,m^2}`),
        equation("Signed utilisation", "U=\\max\\left(\\frac{|S_{min}|}{|S_{allow,-}|},\\frac{|S_{max}|}{|S_{allow,+}|}\\right)"),
      ],
      facts: [
        fact("Analysed trailer / load case", `${definition?.name ?? "not available"} / ${model.spineLoadCase}`),
        fact("Output mesh", `${n(model.spineMeshSizeM, 4)} m; ${result.beam.points.length} stations`),
        fact("Shear extrema", `${n(result.beam.shearMinKN)} kN at X ${n(result.beam.shearMinXM)} m; ${n(result.beam.shearMaxKN)} kN at X ${n(result.beam.shearMaxXM)} m`),
        fact("Shear capacities / utilisation", `${n(definition?.shearMinKN)} / ${n(definition?.shearMaxKN)} kN; ${percent(result.beam.shearUtilisation)}`),
        fact("Bending extrema", `${n(result.beam.bendingMinKNm)} kNm at X ${n(result.beam.bendingMinXM)} m; ${n(result.beam.bendingMaxKNm)} kNm at X ${n(result.beam.bendingMaxXM)} m`),
        fact("Moment capacities / utilisation", `${n(definition?.momentMinKNm)} / ${n(definition?.momentMaxKNm)} kNm; ${percent(result.beam.bendingUtilisation)}`),
        fact("Maximum absolute deflection", `${n(result.beam.absoluteDeflectionMm)} mm at X ${n(result.beam.deflectionPeakXM)} m`),
        fact("Deflection criterion", `${model.optimiser.deflectionCheck === "REQUIRED" ? "active" : "advisory"}; limit ${n(model.optimiser.deflectionLimitMm)} mm`),
        fact("Local bending demand / utilisation", `${n(result.beam.localBendingAbsKNm)} kNm / ${percent(result.beam.localBendingUtilisation)}`),
      ],
    },
    {
      id: "traction",
      title: "Road-transport traction and braking",
      explanation: [
        road.enabled
          ? "Driven and braked bogies are selected from the exact 4-, 5- and 6-axle module patterns. Available force is the lesser of tyre/surface adhesion and the configured mechanical bogie limit; driven bogies are also capped by the selected PPU capacity."
          : "Road-transport analysis is disabled for this case. The equations are retained below so the calculation basis is explicit, but no traction or braking acceptance is claimed.",
        "Climbing demand combines rolling resistance, positive grade and drive acceleration. Descending braking demand combines downhill grade and braking deceleration, with rolling resistance acting as a beneficial opposing force.",
      ],
      equations: [
        equation("Rolling and grade forces", "F_{rr}=mgc_{rr}\\cos\\theta,\\qquad F_g=mg\\sin\\theta"),
        equation("Traction demand", "F_{tr,d}=F_{rr}+\\max(0,F_g)+ma_{drive}"),
        equation("Traction capacity", "F_{tr,c}=\\min(\\mu\\sum N_{driven},\\;60n_{driven})"),
        equation("Braking demand and capacity", "F_{br,d}=\\max(0,\\max(0,-F_g)+ma_{brake}-F_{rr}),\\qquad F_{br,c}=\\min(\\mu\\sum N_{braked},\\;55n_{braked})"),
      ],
      facts: [
        fact("Road analysis status", road.enabled ? road.status : "N/A — disabled"),
        fact("Surface / condition", `${road.surface.replaceAll("_", " ")} / ${road.condition}`),
        fact("Friction / rolling coefficient", `${n(road.frictionCoefficient)} / ${n(road.rollingResistanceCoefficient)}`),
        fact("Driven / braked bogies", `${road.drivenBogieCount} / ${road.brakedBogieCount}; PPU drive limit ${road.ppuDrivenBogieLimit}`),
        fact("Rolling / grade / acceleration", `${n(road.rollingResistanceKN)} / ${n(road.gradeForceKN)} / ${n(road.accelerationForceKN)} kN`),
        fact("Traction demand / capacity / utilisation", `${n(road.tractionDemandKN)} / ${n(road.tractionCapacityKN)} kN / ${percent(road.tractionUtilisation)}`),
        fact("Traction adhesion / mechanical limits", `${n(road.tractionAdhesionLimitKN)} / ${n(road.tractionMechanicalLimitKN)} kN`),
        fact("Braking demand / capacity / utilisation", `${n(road.brakingDemandKN)} / ${n(road.brakingCapacityKN)} kN / ${percent(road.brakingUtilisation)}`),
        fact("Maximum climb / descent", `${n(road.maximumClimbGradeDeg)}° / ${n(road.maximumDescentGradeDeg)}°`),
      ],
    },
    {
      id: "conclusion",
      title: "Result and engineering conclusion",
      explanation: [
        `The authoritative calculation status is ${result.status}. ${result.failDetail || "All active geometry, support, stability, structural and road-transport acceptance gates are satisfied."}`,
        result.stabilityReferences.combinedCogPassOnly
          ? "Important: this is a COMBINED COG PASS ONLY arrangement. The cargo-only angle check does not pass independently."
          : result.stabilityReferences.cargoOnlyPass
            ? "The cargo-only and all-inclusive COG angle checks both pass."
            : "The cargo-only stability check does not pass.",
      ],
      equations: [],
      facts: [
        fact("Overall result", result.status),
        fact("Failure class", result.failClass || "none"),
        fact("Failure detail", result.failDetail || "none"),
        fact("Active warnings", result.warnings.length ? result.warnings.join(" | ") : "none"),
        fact("Calculation duration", `${n(result.calculationMs, 2)} ms`),
      ],
    },
  ];

  const title = "Trailer Stability — Detailed Hand Calculation";
  const subtitle = `${model.cargo.name || "Untitled case"} · ${model.cargo.clientReference || "no client reference"}`;
  return {
    title,
    subtitle,
    generatedAt,
    status: result.status,
    sections,
    latex: buildLatex(title, subtitle, generatedAt, result.status, sections),
  };
}
