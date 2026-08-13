import { calculateProject } from "./core";
import { currentEngineeringValues, ENGINEERING_REFERENCE } from "./engineering-reference";
import type { CalculationResult, ProjectModel } from "./types";

export const AUTOCAD_EXPORT_KEY_ID = "TS-CAD-KEY-1";

/**
 * The payload deliberately uses stable short field codes. The companion key
 * is the public schema contract for AutoLISP, Python, or any other reader.
 * Keeping codes stable makes the drawing interface independent of the UI.
 */
export const AUTOCAD_EXPORT_KEY = {
  keyId: AUTOCAD_EXPORT_KEY_ID,
  version: 1,
  format: "TRAILER-STABILITY-CAD-DATA",
  conventions: {
    orientation: "X increases from rear to front; the rear is the lower-X/left end and the front is the higher-X/right end.",
    coordinates: "All positions are absolute metres from the case datum unless a field explicitly says offset.",
    masses: "tonnes",
    angles: "degrees",
    forces: "kN",
    payload: "Read document.data using the section and field codes below. Unknown fields must be ignored for forward compatibility.",
  },
  sections: [
    { code: "c", name: "case", fields: { id: "case/cargo identifier", cr: "client reference", or: "owner reference", er: "engineering degree", wr: "weight/COG reference", rp: "datum/reference point", ox: "longitudinal orientation" } },
    { code: "cg", name: "cargo", fields: { n: "name", l: "lengthM", w: "widthM", h: "heightM", ex: "extremeX", ey: "extremeY", m: "massT", x: "COG x", y: "COG y", z: "COG z", exn: "envelopeX", eyn: "envelopeY", sa: "side wind area", sc: "side drag coefficient", sh: "side wind application height", fa: "front wind area", fc: "front drag coefficient", fh: "front wind application height" } },
    { code: "pk", name: "packing", fields: { en: "enabled", m: "massT", h: "heightM", x: "COG x", y: "COG y", z: "COG z", fp: "visual footprint" } },
    { code: "tr", name: "trailers", fields: { id: "stable trailer id", n: "catalogue name", al: "axle lines", sf: "single-file", x: "resolved start X", y: "resolved centre Y", xr: "input X", yr: "input Y", pr: "placement reference", ox: "X offset", oy: "Y offset", rb: "rear PPU", ff: "front PPU", w: "catalogue width", ap: "axle pitch", ah: "axle capacity", dh: "deck/neutral height", tw: "tyre width", wd: "wheel diameter", pl: "rear PPU length", fl: "front PPU length" } },
    { code: "hy", name: "hydraulics", fields: { md: "three/four point mode", g: "group definitions and centres", sp: "split after axle line", pi: "pinned axle lines" } },
    { code: "su", name: "supports", fields: { id: "support id", x: "X position", w: "width", al: "allowed", ac: "active input", ra: "settled active", rt: "reaction", dr: "disable reason" } },
    { code: "en", name: "environment", fields: { rls: "route longitudinal slope", rts: "route transverse slope", rlsr: "residual longitudinal slope", rtsr: "residual transverse slope", cf: "combination factor", ws: "wind speed", la: "longitudinal acceleration", ta: "transverse acceleration" } },
    { code: "sp", name: "spine beam", fields: { at: "analysed trailer", lc: "load case", ms: "mesh size" } },
    { code: "cat", name: "catalogue", fields: { all: "catalogue records used by the case" } },
    { code: "r", name: "calculation result", fields: { st: "status", fc: "fail class", fd: "fail detail", tm: "total mass", lc: "load COG", cc: "combined COG", gp: "hydraulic groups", ax: "axle points", sx: "spine axle points", ss: "settled supports", ov: "overlap pairs", gq: "grouping quality", pg: "stability polygon", cp: "basic/slope/dynamic case points", sr: "stability references", an: "controlling analysis", rt: "road transport result", bm: "beam metrics", mt: "all metric values", ws: "warnings", ms: "calculation milliseconds", rv: "resolved trailer geometry used by the authoritative result" } },
    { code: "eng", name: "engineering reference", fields: { iv: "current input/output values", methods: "calculation methods and equations" } },
  ],
} as const;

export interface AutocadExportDocument {
  format: typeof AUTOCAD_EXPORT_KEY.format;
  version: 1;
  keyId: typeof AUTOCAD_EXPORT_KEY_ID;
  generatedAt: string;
  data: Record<string, unknown>;
}

export function buildAutocadExport(
  model: ProjectModel,
  authoritativeResult?: CalculationResult,
  generatedAt = new Date().toISOString(),
): AutocadExportDocument {
  const result = authoritativeResult ?? calculateProject(model);
  const resolvedByIndex = new Map(result.resolvedTrailers.map((item) => [item.index, item]));
  const selectedDefinitions = model.trailers.map((trailer) => model.catalogue.find((item) => item.id === trailer.definitionId)).filter(Boolean);

  return {
    format: AUTOCAD_EXPORT_KEY.format,
    version: 1,
    keyId: AUTOCAD_EXPORT_KEY_ID,
    generatedAt,
    data: {
      c: {
        id: model.cargo.name || "untitled-case",
        cr: model.cargo.clientReference,
        or: model.cargo.ownerReference,
        er: model.engineeringDegree,
        wr: model.weightCogReference,
        rp: model.referencePoint,
        ox: model.longitudinalOrientation,
      },
      cg: {
        n: model.cargo.name,
        l: model.cargo.lengthM,
        w: model.cargo.widthM,
        h: model.cargo.heightM,
        ex: model.cargo.extremeX,
        ey: model.cargo.extremeY,
        m: model.cargo.massT,
        x: model.cargo.cog.x,
        y: model.cargo.cog.y,
        z: model.cargo.cog.z,
        exn: model.cargo.envelopeX,
        eyn: model.cargo.envelopeY,
        sa: model.cargo.sideWindAreaM2,
        sc: model.cargo.sideDragCoefficient,
        sh: model.cargo.sideWindHeightM,
        fa: model.cargo.frontWindAreaM2,
        fc: model.cargo.frontDragCoefficient,
        fh: model.cargo.frontWindHeightM,
      },
      pk: {
        en: model.packing.massT > 0,
        m: model.packing.massT,
        h: model.packing.heightM,
        x: model.packing.cog.x,
        y: model.packing.cog.y,
        z: model.packing.cog.z,
        fp: model.packing.footprint,
      },
      tr: model.trailers.map((trailer, index) => {
        const definition = model.catalogue.find((item) => item.id === trailer.definitionId);
        const resolved = resolvedByIndex.get(index);
        return {
          id: trailer.id,
          n: definition?.name ?? "missing-definition",
          al: trailer.axleLines,
          sf: trailer.singleFile,
          x: resolved?.startXM ?? trailer.xM,
          y: resolved?.centreYM ?? trailer.yM,
          xr: trailer.xM,
          yr: trailer.yM,
          pr: trailer.placementReference,
          ox: trailer.offsetFromReference.x,
          oy: trailer.offsetFromReference.y,
          rb: trailer.ppuLeft,
          ff: trailer.ppuRight,
          w: definition?.trailerWidthM ?? null,
          ap: definition?.axleSpacingM ?? null,
          ah: definition?.axleCapacityT ?? null,
          dh: definition?.neutralHeightM ?? null,
          tw: definition?.tyreWidthM ?? null,
          wd: definition?.wheelDiameterM ?? null,
          pl: definition?.ppuLengthM ?? null,
          fl: definition?.ppuLengthM ?? null,
        };
      }),
      hy: {
        md: model.hydraulicSystemMode,
        g: model.groupings,
        sp: model.groupings[0]?.splitAfterAxleLine ?? null,
        pi: model.groupings[0]?.pinnedAxleLines ?? [],
      },
      su: model.supports.map((support, index) => {
        const settled = result.supports[index];
        return { id: support.id, x: support.xM, w: support.widthM, al: support.allowed, ac: support.active, ra: settled?.active ?? false, rt: settled?.reactionT ?? null, dr: settled?.disableReason ?? "" };
      }),
      en: {
        rls: model.environment.routeLongitudinalSlopeDeg,
        rts: model.environment.routeTransverseSlopeDeg,
        rlsr: model.environment.longitudinalSlopeDeg,
        rtsr: model.environment.transverseSlopeDeg,
        cf: model.environment.combinationFactor,
        ws: model.environment.windSpeedMps,
        la: model.environment.longitudinalAccelerationMps2,
        ta: model.environment.transverseAccelerationMps2,
      },
      sp: { at: model.analysedTrailer, lc: model.spineLoadCase, ms: model.spineMeshSizeM },
      cat: { all: selectedDefinitions },
      r: {
        st: result.status,
        fc: result.failClass,
        fd: result.failDetail,
        tm: result.totalMassT,
        lc: result.loadCog,
        cc: result.combinedCog,
        gp: result.groups,
        ax: result.axlePoints,
        sx: result.spineAxlePoints,
        ss: result.supports,
        ov: result.trailerOverlaps,
        gq: result.groupingQuality,
        pg: result.stabilityPolygon,
        cp: result.casePoints,
        sr: result.stabilityReferences,
        an: result.analysis,
        rt: result.roadTransport,
        bm: result.beam,
        mt: result.metrics,
        ws: result.warnings,
        ms: result.calculationMs,
        // Keep the geometry after placement resolution. The compact `tr` section
        // is annotation friendly; `rv` is authoritative for the actual drawing.
        rv: result.resolvedTrailers,
      },
      eng: {
        iv: currentEngineeringValues(model, result),
        methods: ENGINEERING_REFERENCE.calculations,
      },
    },
  };
}
