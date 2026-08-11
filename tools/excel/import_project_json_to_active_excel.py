#!/usr/bin/env python3
"""Import a Trailer Stability project JSON file into the active Excel workbook.

The cell map mirrors app/engine/workbook.ts.  The script deliberately attaches
to the already-running Excel instance and never opens, closes, or saves a
workbook unless --save is supplied.

Examples:
    python import_project_json_to_active_excel.py project.json --plan-only
    python import_project_json_to_active_excel.py project.json
    python import_project_json_to_active_excel.py project.json --save

Requires pywin32 for a live import:
    py -m pip install pywin32
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable


MAIN_SHEET = "Load and Stability Calculation"
CONTROL_SHEET = "TS_CONTROL"
SUPPORTED_SCHEMA_VERSIONS = {1, 2, 3}


@dataclass(frozen=True)
class CellWrite:
    sheet: str
    address: str
    value: Any
    label: str
    formula: bool = False


@dataclass(frozen=True)
class ImportPlan:
    writes: tuple[CellWrite, ...]
    warnings: tuple[str, ...]
    unsupported: tuple[str, ...]


def nested(data: dict[str, Any], path: str, default: Any = None) -> Any:
    value: Any = data
    for key in path.split("."):
        if not isinstance(value, dict) or key not in value:
            return default
        value = value[key]
    return value


def finite_number(value: Any, path: str, *, allow_none: bool = False) -> float | int | None:
    if value is None and allow_none:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(float(value)):
        raise ValueError(f"{path} must be a finite number; received {value!r}.")
    return value


def yes_no(value: Any) -> str:
    return "yes" if bool(value) else "no"


def control_yes_no(value: Any) -> str:
    return "YES" if bool(value) else "NO"


def trailer_name(project: dict[str, Any], definition_id: str) -> str:
    for item in project.get("catalogue", []):
        if isinstance(item, dict) and item.get("id") == definition_id:
            name = str(item.get("name", "")).strip()
            if name:
                return name
    raise ValueError(f'Trailer definition "{definition_id}" is absent from the JSON catalogue.')


def trailer_definition(project: dict[str, Any], definition_id: str) -> dict[str, Any]:
    for item in project.get("catalogue", []):
        if isinstance(item, dict) and item.get("id") == definition_id:
            return item
    raise ValueError(f'Trailer definition "{definition_id}" is absent from the JSON catalogue.')


def weighted_point(items: list[tuple[float, tuple[float, float, float]]]) -> tuple[float, float, float]:
    mass = sum(max(0.0, item[0]) for item in items)
    if mass <= 1e-12:
        return (0.0, 0.0, 0.0)
    return tuple(sum(item_mass * point[axis] for item_mass, point in items) / mass for axis in range(3))  # type: ignore[return-value]


def resolve_trailer_coordinates(
    project: dict[str, Any], trailers: list[dict[str, Any]]
) -> list[tuple[float, float]]:
    """Mirror core.ts resolveTrailers for workbook-ready absolute X/Y values."""
    cargo = project.get("cargo") or {}
    packing = project.get("packing") or {}
    deck_height = float(project.get("trailerDeckHeightM", 0))
    extreme_x = float(cargo.get("extremeX", 0))
    extreme_y = float(cargo.get("extremeY", 0))
    cargo_point = (
        extreme_x + float(nested(cargo, "cog.x", 0)),
        extreme_y + float(nested(cargo, "cog.y", 0)),
        deck_height + float(packing.get("heightM", 0)) + float(nested(cargo, "cog.z", 0)),
    )
    packing_point = (
        extreme_x + float(nested(packing, "cog.x", 0)),
        extreme_y + float(nested(packing, "cog.y", 0)),
        deck_height + float(nested(packing, "cog.z", 0)),
    )
    load_items = [
        (float(cargo.get("massT", 0)), cargo_point),
        (float(packing.get("massT", 0)), packing_point),
    ]
    base_load_cog = weighted_point(load_items)
    all_inclusive_reference = (base_load_cog[0], base_load_cog[1])
    resolved: list[tuple[float, float]] = []

    for _ in range(80):
        resolved = []
        mass_items = list(load_items)
        for trailer in trailers:
            definition = trailer_definition(project, str(trailer.get("definitionId")))
            reference_mode = trailer.get("placementReference", "ABSOLUTE")
            offset = trailer.get("offsetFromReference") or {}
            if reference_mode == "LOAD_COG":
                reference = (base_load_cog[0], base_load_cog[1])
            elif reference_mode == "ALL_INCLUSIVE_COG":
                reference = all_inclusive_reference
            else:
                reference = (float(trailer.get("xM", 0)), float(trailer.get("yM", 0)))
            if reference_mode == "ABSOLUTE":
                x_value, y_value = reference
            else:
                x_value = reference[0] + float(offset.get("x", 0))
                y_value = reference[1] + float(offset.get("y", 0))
            resolved.append((x_value, y_value))

            axle_lines = float(trailer.get("axleLines", 0))
            axle_spacing = float(definition.get("axleSpacingM", 0))
            module_length = axle_spacing * axle_lines
            tare_mass = float(definition.get("axleWeightT", 0)) * axle_lines
            mass_items.append((tare_mass, (x_value + module_length / 2, y_value, deck_height)))
            ppu_mass = float(definition.get("ppuWeightT") or 0)
            ppu_length = float(definition.get("ppuLengthM") or 0)
            if trailer.get("ppuLeft") and ppu_mass > 0:
                mass_items.append((ppu_mass, (x_value - ppu_length / 2, y_value, deck_height)))
            if trailer.get("ppuRight") and ppu_mass > 0:
                mass_items.append((ppu_mass, (x_value + module_length + ppu_length / 2, y_value, deck_height)))

        combined = weighted_point(mass_items)
        delta = math.hypot(combined[0] - all_inclusive_reference[0], combined[1] - all_inclusive_reference[1])
        all_inclusive_reference = (combined[0], combined[1])
        if delta < 1e-10:
            break
    return resolved


def append_value(writes: list[CellWrite], sheet: str, address: str, value: Any, label: str) -> None:
    writes.append(CellWrite(sheet, address, value, label))


def append_formula(writes: list[CellWrite], sheet: str, address: str, formula: str, label: str) -> None:
    writes.append(CellWrite(sheet, address, formula, label, formula=True))


def build_import_plan(project: dict[str, Any]) -> ImportPlan:
    schema = project.get("schemaVersion")
    if schema not in SUPPORTED_SCHEMA_VERSIONS:
        raise ValueError(
            f"Unsupported project schemaVersion {schema!r}; supported versions are "
            f"{sorted(SUPPORTED_SCHEMA_VERSIONS)}."
        )

    writes: list[CellWrite] = []
    warnings: list[str] = []
    unsupported: list[str] = []

    orientation = project.get("longitudinalOrientation")
    if orientation and orientation != "REAR_LEFT_FRONT_RIGHT":
        warnings.append(
            f"JSON orientation is {orientation!r}; the workbook map assumes rear/low-X on the left "
            "and front/high-X on the right."
        )

    cargo = project.get("cargo") or {}
    packing = project.get("packing") or {}
    environment = project.get("environment") or {}
    optimiser = project.get("optimiser") or {}
    weights = optimiser.get("weights") or {}

    main_values = (
        ("F17", project.get("engineeringDegree"), "Engineering verification degree"),
        ("D21", cargo.get("name"), "Cargo / project name"),
        ("J21", cargo.get("clientReference"), "Client reference"),
        ("D22", cargo.get("ownerReference"), "Owner reference"),
        ("J22", project.get("weightCogReference"), "Weight / COG reference"),
        ("D48", project.get("referencePoint"), "Load datum / reference point"),
        ("C52", finite_number(cargo.get("lengthM"), "cargo.lengthM"), "Cargo length"),
        ("C53", finite_number(cargo.get("widthM"), "cargo.widthM"), "Cargo width"),
        ("C54", finite_number(cargo.get("extremeX"), "cargo.extremeX"), "Cargo rear X extreme"),
        ("C55", finite_number(cargo.get("extremeY"), "cargo.extremeY"), "Cargo left Y extreme"),
        ("C56", finite_number(cargo.get("heightM"), "cargo.heightM"), "Cargo height"),
        ("C57", finite_number(cargo.get("sideWindAreaM2"), "cargo.sideWindAreaM2"), "Side wind area"),
        ("C58", finite_number(cargo.get("sideDragCoefficient"), "cargo.sideDragCoefficient"), "Side drag coefficient"),
        ("F57", finite_number(cargo.get("sideWindHeightM"), "cargo.sideWindHeightM"), "Side wind application height"),
        ("C59", finite_number(cargo.get("frontWindAreaM2"), "cargo.frontWindAreaM2"), "Front wind area"),
        ("C60", finite_number(cargo.get("frontDragCoefficient"), "cargo.frontDragCoefficient"), "Front drag coefficient"),
        ("F59", finite_number(cargo.get("frontWindHeightM"), "cargo.frontWindHeightM"), "Front wind application height"),
        ("C63", finite_number(cargo.get("massT"), "cargo.massT"), "Cargo mass"),
        ("C64", finite_number(nested(cargo, "cog.x"), "cargo.cog.x"), "Cargo COG X"),
        ("C65", finite_number(nested(cargo, "cog.y"), "cargo.cog.y"), "Cargo COG Y"),
        ("C66", finite_number(nested(cargo, "cog.z"), "cargo.cog.z"), "Cargo COG Z"),
        ("E64", finite_number(cargo.get("envelopeX"), "cargo.envelopeX"), "Cargo COG X envelope"),
        ("E65", finite_number(cargo.get("envelopeY"), "cargo.envelopeY"), "Cargo COG Y envelope"),
        ("C70", finite_number(packing.get("massT", 0), "packing.massT"), "Packing mass"),
        ("C71", finite_number(packing.get("heightM", 0), "packing.heightM"), "Packing height"),
        ("C72", finite_number(nested(packing, "cog.x", 0), "packing.cog.x"), "Packing COG X"),
        ("C73", finite_number(nested(packing, "cog.y", 0), "packing.cog.y"), "Packing COG Y"),
        ("C74", finite_number(nested(packing, "cog.z", 0), "packing.cog.z"), "Packing COG Z"),
        ("C85", finite_number(project.get("trailerDeckHeightM"), "trailerDeckHeightM"), "Trailer deck height"),
    )
    for address, value, label in main_values:
        append_value(writes, MAIN_SHEET, address, value, label)

    trailers = [item for item in project.get("trailers", []) if isinstance(item, dict) and item.get("enabled", True)]
    if not trailers:
        raise ValueError("The project contains no enabled trailers.")
    if len(trailers) > 12:
        warnings.append(f"Only the first 12 of {len(trailers)} enabled trailers can be imported.")
    trailers = trailers[:12]
    resolved_coordinates = resolve_trailer_coordinates(project, trailers)
    shared_axles = int(round(finite_number(trailers[0].get("axleLines"), "trailers[0].axleLines")))
    shared_x = resolved_coordinates[0][0]
    if any(int(round(float(item.get("axleLines", shared_axles)))) != shared_axles for item in trailers[1:]):
        warnings.append("Trailer axle-line counts differ; workbook-compatible shared C89 uses the first trailer value.")
    if any(abs(item[0] - float(shared_x)) > 1e-9 for item in resolved_coordinates[1:]):
        warnings.append("Trailer longitudinal X values differ; workbook-compatible shared E89 uses the first trailer value.")
    if any(item.get("placementReference", "ABSOLUTE") != "ABSOLUTE" for item in trailers):
        warnings.append(
            "Relative trailer placement modes are calculation-neutral metadata in Excel. Their iterative load/all-inclusive "
            "COG positions were resolved and written as absolute workbook-compatible E89/F89:F100 coordinates."
        )

    for index in range(12):
        row = 89 + index
        trailer = trailers[index] if index < len(trailers) else None
        append_value(
            writes,
            MAIN_SHEET,
            f"B{row}",
            trailer_name(project, str(trailer.get("definitionId"))) if trailer else None,
            f"Trailer {index + 1} catalogue model",
        )
        if index == 0:
            append_value(writes, MAIN_SHEET, f"C{row}", shared_axles, "Shared number of axle lines")
            append_value(writes, MAIN_SHEET, f"E{row}", shared_x, "Shared trailer X location")
        else:
            append_formula(writes, MAIN_SHEET, f"C{row}", "=$C$89", "Shared number of axle lines formula")
            append_formula(writes, MAIN_SHEET, f"E{row}", "=$E$89", "Shared trailer X location formula")
        append_value(writes, MAIN_SHEET, f"D{row}", yes_no(trailer.get("singleFile")) if trailer else None, f"Trailer {index + 1} single-file setting")
        append_value(writes, MAIN_SHEET, f"F{row}", resolved_coordinates[index][1] if trailer else None, f"Trailer {index + 1} Y location")
        append_value(writes, MAIN_SHEET, f"J{row}", yes_no(trailer.get("ppuLeft")) if trailer else None, f"Trailer {index + 1} rear PPU")
        append_value(writes, MAIN_SHEET, f"K{row}", yes_no(trailer.get("ppuRight")) if trailer else None, f"Trailer {index + 1} front PPU")

    groupings = [item for item in project.get("groupings", []) if isinstance(item, dict)]
    first_grouping = groupings[0] if groupings else {}
    shared_split = int(round(finite_number(first_grouping.get("splitAfterAxleLine", 1), "groupings[0].splitAfterAxleLine")))
    append_value(writes, MAIN_SHEET, "D138", shared_split, "Shared split-after axle line")
    for row in range(139, 162):
        append_formula(writes, MAIN_SHEET, f"D{row}", "=$D$138", "Shared split-after axle line formula")

    for index in range(12):
        grouping = groupings[index] if index < len(groupings) else {}
        corners = grouping.get("cornerGroups") or {}
        first_row = 138 + index * 2
        second_row = first_row + 1
        append_value(writes, MAIN_SHEET, f"B{first_row}", corners.get("rearLeft"), f"Trailer {index + 1} rear-left hydraulic group")
        append_value(writes, MAIN_SHEET, f"C{first_row}", corners.get("frontLeft"), f"Trailer {index + 1} front-left hydraulic group")
        append_value(writes, MAIN_SHEET, f"B{second_row}", corners.get("rearRight"), f"Trailer {index + 1} rear-right hydraulic group")
        append_value(writes, MAIN_SHEET, f"C{second_row}", corners.get("frontRight"), f"Trailer {index + 1} front-right hydraulic group")

    pins = list(first_grouping.get("pinnedAxleLines") or [])[:8]
    if any(list(item.get("pinnedAxleLines") or [])[:8] != pins for item in groupings[1:]):
        warnings.append("Pinned axle lines differ between trailers; workbook-compatible shared pin row uses the first grouping.")
    for offset, column in enumerate("GHIJKLMN"):
        pin = int(round(finite_number(pins[offset], f"groupings[0].pinnedAxleLines[{offset}]"))) if offset < len(pins) else None
        append_value(writes, MAIN_SHEET, f"{column}136", pin, f"Shared pinned axle line {offset + 1}")
        for row in range(137, 148):
            append_formula(writes, MAIN_SHEET, f"{column}{row}", f"=${column}$136", f"Pinned axle line {offset + 1} formula")

    supports = [item for item in project.get("supports", []) if isinstance(item, dict)]
    if len(supports) > 10:
        warnings.append(f"Only the first 10 of {len(supports)} supports can be imported.")
    for index in range(10):
        support = supports[index] if index < len(supports) else None
        position = finite_number(support.get("xM"), f"supports[{index}].xM") if support else None
        weight = finite_number(support.get("optionalWeightT"), f"supports[{index}].optionalWeightT", allow_none=True) if support else None
        width = finite_number(support.get("widthM"), f"supports[{index}].widthM") if support else None
        allowed = bool(support.get("allowed", True)) if support else False
        active = bool(support.get("active", True)) if support else False
        append_value(writes, MAIN_SHEET, f"E{71 + index}", position, f"Support {index + 1} X location")
        append_value(writes, MAIN_SHEET, f"F{71 + index}", weight, f"Support {index + 1} optional weight")
        append_value(writes, MAIN_SHEET, f"D{446 + index}", width, f"Support {index + 1} width")
        append_value(writes, MAIN_SHEET, f"F{446 + index}", yes_no(allowed), f"Support {index + 1} allowed")
        append_value(writes, MAIN_SHEET, f"I{446 + index}", yes_no(active and allowed), f"Support {index + 1} initial active state")

    environment_values = (
        ("D291", "routeLongitudinalSlopeDeg", "Route longitudinal slope"),
        ("E291", "longitudinalSlopeDeg", "Calculation longitudinal slope"),
        ("D292", "routeTransverseSlopeDeg", "Route transverse slope"),
        ("E292", "transverseSlopeDeg", "Calculation transverse slope"),
        ("D293", "combinationFactor", "Slope combination factor"),
        ("E353", "windSpeedMps", "Wind speed"),
        ("E354", "longitudinalAccelerationMps2", "Longitudinal acceleration"),
        ("E355", "transverseAccelerationMps2", "Transverse acceleration"),
    )
    for address, key, label in environment_values:
        append_value(writes, MAIN_SHEET, address, finite_number(environment.get(key), f"environment.{key}"), label)

    append_value(writes, MAIN_SHEET, "F433", project.get("analysedTrailer", 1), "Analysed trailer")
    append_value(writes, MAIN_SHEET, "F434", project.get("spineLoadCase", "Neutral"), "Spine-beam load case")
    append_value(writes, MAIN_SHEET, "F435", project.get("spineMeshSizeM", 0.02), "Spine-beam mesh size")
    loose_packing = [item for item in project.get("loosePacking", []) if isinstance(item, dict)]
    if len(loose_packing) > 4:
        warnings.append(f"Only the first 4 of {len(loose_packing)} loose-packing rows can be imported.")
    for index in range(4):
        row = 439 + index
        item = loose_packing[index] if index < len(loose_packing) else None
        append_value(writes, MAIN_SHEET, f"B{row}", item.get("type") if item else None, f"Loose packing {index + 1} type")
        append_value(writes, MAIN_SHEET, f"D{row}", item.get("massT") if item else None, f"Loose packing {index + 1} mass")
        append_value(writes, MAIN_SHEET, f"E{row}", item.get("startXM") if item else None, f"Loose packing {index + 1} start X")
        append_value(writes, MAIN_SHEET, f"F{row}", item.get("endXM") if item else None, f"Loose packing {index + 1} end X")

    control_map = (
        ("B2", "STOP", "Optimiser run state"),
        ("B6", optimiser.get("e89Step"), "Trailer X step"),
        ("B7", optimiser.get("c89Maximum"), "Maximum axle lines"),
        ("B8", optimiser.get("c89Start"), "Starting axle lines"),
        ("B9", optimiser.get("c89Step"), "Axle-line step"),
        ("B11", optimiser.get("e89RangeMode"), "Trailer X range mode"),
        ("B12", optimiser.get("e89Minimum"), "Trailer X minimum"),
        ("B13", optimiser.get("e89Maximum"), "Trailer X maximum"),
        ("B15", optimiser.get("d138MaximumFraction"), "Maximum split fraction"),
        ("B16", control_yes_no(optimiser.get("overrideD138Limit")), "Override split limit"),
        ("B22", optimiser.get("boundaryToleranceM"), "Boundary tolerance"),
        ("B24", control_yes_no(optimiser.get("stopAtFirstPass")), "Stop at first pass"),
        ("B26", optimiser.get("d138Start"), "Starting split line"),
        ("B27", optimiser.get("d138Step"), "Split-line step"),
        ("B28", optimiser.get("fineFirstPassReference"), "Fine-search first pass"),
        ("B29", optimiser.get("fineSecondPassReference"), "Fine-search second pass"),
        ("B30", optimiser.get("fineE89Step"), "Fine trailer X step"),
        ("B34", optimiser.get("weightPreset"), "Weight preset"),
        ("B35", weights.get("basicUtil"), "Basic utilisation weight"),
        ("B36", weights.get("slopeUtil"), "Slope utilisation weight"),
        ("B37", weights.get("dynamicUtil"), "Dynamic utilisation weight"),
        ("B38", weights.get("spineUtil"), "Spine utilisation weight"),
        ("B39", weights.get("basicAngle"), "Basic angle weight"),
        ("B40", weights.get("slopeAngle"), "Slope angle weight"),
        ("B41", weights.get("dynamicAngle"), "Dynamic angle weight"),
        ("B42", weights.get("dynamicRatio"), "Dynamic/static ratio weight"),
        ("B45", optimiser.get("deflectionCheck"), "Deflection check mode"),
        ("B46", optimiser.get("deflectionLimitMm"), "Deflection limit"),
        ("B47", optimiser.get("pinSearchMode"), "Pin search mode"),
        ("B48", optimiser.get("pinStopRule"), "Pin stop rule"),
        ("B49", optimiser.get("existingPinsPolicy"), "Existing pins policy"),
        ("B50", optimiser.get("maximumPins"), "Maximum pins"),
        ("B51", optimiser.get("maximumAxleUtilisation"), "Maximum axle utilisation"),
        ("B52", optimiser.get("minimumDeflectionImprovementMm"), "Minimum deflection improvement"),
        ("B53", optimiser.get("localStructuralTargetMode"), "Local structural target mode"),
        ("B54", optimiser.get("manualLocalTargetXM"), "Manual local target X"),
        ("B55", control_yes_no(optimiser.get("detailedWeighting")), "Detailed weighting"),
        ("B56", optimiser.get("f506Policy"), "F506 weighting policy"),
        ("B57", optimiser.get("fineE89PinMode"), "Fine-search pin mode"),
        ("B58", weights.get("shearUtil"), "Shear utilisation weight"),
        ("B59", weights.get("bendingUtil"), "Bending utilisation weight"),
        ("B60", weights.get("deflection"), "Deflection weight"),
        ("B61", weights.get("localBendingUtil"), "Local bending weight"),
        ("B63", optimiser.get("optimiserStrategy"), "Optimiser strategy"),
        ("B64", optimiser.get("minimumActiveSupports"), "Minimum active supports"),
        ("B65", optimiser.get("pinCaseBudget"), "Pin case budget"),
        ("B66", optimiser.get("thoroughFinalistCount"), "Thorough finalist count"),
        ("B67", optimiser.get("deflectionToleranceMm"), "Deflection tolerance"),
        ("B68", optimiser.get("afterFirstPass"), "After-first-pass action"),
        ("B70", "SAFE_LEGACY" if optimiser.get("calculationMode") == "WORKBOOK_PARITY" else "ACCELERATED_VERIFIED", "Calculation mode"),
        ("B71", optimiser.get("progressRefreshSeconds"), "Progress refresh interval"),
        ("B72", optimiser.get("liveRefreshSeconds"), "Live feed refresh interval"),
        ("B73", weights.get("axleLinesUsed"), "Axle lines used weight"),
    )
    for address, value, label in control_map:
        append_value(writes, CONTROL_SHEET, address, value, label)

    footprint = nested(packing, "footprint")
    if footprint:
        unsupported.append("packing.footprint (web-only visual geometry; calculation-neutral)")
    if project.get("roadTransport"):
        unsupported.append("roadTransport (no cells in the v0.7 calculation workbook export map)")
    if project.get("arrangementOptimiser"):
        unsupported.append("arrangementOptimiser (web mathematical-search settings; no workbook cell map)")
    if project.get("catalogue"):
        unsupported.append("catalogue updates (case import validates names but does not rewrite the active Database sheet)")
    if cargo.get("autoCogEnvelopeFromCargo"):
        warnings.append("Automatic COG-envelope mode is web metadata; calculated envelope values E64:E65 are imported.")
    if cargo.get("autoWindFromCargo"):
        warnings.append("Automatic wind mode is web metadata; calculated wind areas and application heights are imported.")

    return ImportPlan(tuple(writes), tuple(warnings), tuple(unsupported))


def print_plan(plan: ImportPlan, *, verbose: bool = False) -> None:
    by_sheet: dict[str, list[CellWrite]] = {}
    for write in plan.writes:
        by_sheet.setdefault(write.sheet, []).append(write)
    print("Trailer Stability JSON -> Excel import plan")
    print(f"  Planned writes: {len(plan.writes)}")
    for sheet, writes in by_sheet.items():
        print(f"  {sheet}: {len(writes)} cells")
    if plan.warnings:
        print("\nWarnings:")
        for warning in plan.warnings:
            print(f"  - {warning}")
    if plan.unsupported:
        print("\nNot mapped to the current workbook:")
        for item in plan.unsupported:
            print(f"  - {item}")
    if verbose:
        print("\nCell plan:")
        for write in plan.writes:
            marker = "FORMULA" if write.formula else "VALUE"
            print(f"  {write.sheet}!{write.address:<6} {marker:<7} {write.value!r}  # {write.label}")


def get_excel_application() -> Any:
    try:
        import pythoncom  # type: ignore[import-not-found]
        import win32com.client  # type: ignore[import-not-found]
    except ImportError as exc:
        raise RuntimeError(
            "Live Excel import requires pywin32. Install it with: py -m pip install pywin32"
        ) from exc
    pythoncom.CoInitialize()
    try:
        return win32com.client.GetActiveObject("Excel.Application")
    except Exception as exc:
        raise RuntimeError("No running Microsoft Excel instance was found. Open Excel and activate the target workbook first.") from exc


def get_sheet(workbook: Any, name: str) -> Any:
    try:
        return workbook.Worksheets(name)
    except Exception as exc:
        raise RuntimeError(f'Active workbook "{workbook.Name}" is missing required sheet "{name}".') from exc


def try_get_sheet(workbook: Any, name: str) -> Any | None:
    try:
        return workbook.Worksheets(name)
    except Exception:
        return None


def merged_area(cell: Any) -> Any:
    try:
        return cell.MergeArea if bool(cell.MergeCells) else cell
    except Exception:
        return cell


def top_left_cell(cell: Any) -> Any:
    area = merged_area(cell)
    try:
        return area.Cells(1, 1)
    except Exception:
        return cell


def read_formula(cell: Any) -> Any:
    cell = top_left_cell(cell)
    try:
        return cell.Formula2
    except Exception:
        return cell.Formula


def write_cell(cell: Any, write: CellWrite) -> None:
    if write.value is None or write.value == "":
        # ClearContents is rejected by some protected calculation sheets even
        # when the intended input cell is unlocked. Assigning an empty value to
        # the merged area's top-left input cell is protection-compatible and
        # retains validation/formatting.
        top_left_cell(cell).Value2 = ""
    elif write.formula:
        cell = top_left_cell(cell)
        try:
            cell.Formula2 = write.value
        except Exception:
            cell.Formula = write.value
    else:
        cell = top_left_cell(cell)
        cell.Value2 = write.value


def apply_plan(
    plan: ImportPlan,
    *,
    expected_workbook_name: str | None,
    save: bool,
    calculate: bool,
    strict: bool,
) -> tuple[str, int, tuple[str, ...]]:
    operation = "connecting to Microsoft Excel"
    excel = get_excel_application()
    operation = "reading the active workbook"
    workbook = excel.ActiveWorkbook
    if workbook is None:
        raise RuntimeError("Excel is running but has no active workbook.")
    if expected_workbook_name and str(workbook.Name).lower() != expected_workbook_name.lower():
        raise RuntimeError(
            f'Active workbook is "{workbook.Name}", not the required "{expected_workbook_name}". '
            "Activate the correct workbook and run again."
        )

    operation = f'locating worksheet "{MAIN_SHEET}"'
    main_sheet = get_sheet(workbook, MAIN_SHEET)
    control_sheet = try_get_sheet(workbook, CONTROL_SHEET)
    sheets = {MAIN_SHEET: main_sheet}
    if control_sheet is not None:
        sheets[CONTROL_SHEET] = control_sheet

    eligible_writes: list[CellWrite] = []
    skipped: list[str] = []
    for write in plan.writes:
        operation = f"checking {write.sheet}!{write.address} ({write.label})"
        sheet = sheets.get(write.sheet)
        if sheet is None:
            skipped.append(f"{write.sheet}!{write.address}: sheet is not present ({write.label})")
            continue
        cell = sheet.Range(write.address)
        existing = read_formula(cell)
        if write.value in (None, "") and existing in (None, ""):
            skipped.append(f"{write.sheet}!{write.address}: already blank ({write.label})")
            continue
        if bool(sheet.ProtectContents) and bool(cell.Locked):
            if write.formula and str(existing).replace(" ", "").upper() == str(write.value).replace(" ", "").upper():
                skipped.append(f"{write.sheet}!{write.address}: protected formula already matches ({write.label})")
            else:
                skipped.append(f"{write.sheet}!{write.address}: protected/locked cell preserved ({write.label})")
            continue
        eligible_writes.append(write)

    if strict and skipped:
        preview = "; ".join(skipped[:8])
        remainder = len(skipped) - 8
        suffix = f"; and {remainder} more" if remainder > 0 else ""
        raise RuntimeError(f"Strict import cannot continue because mapped targets would be skipped: {preview}{suffix}.")
    if not any(write.sheet == MAIN_SHEET for write in eligible_writes):
        raise RuntimeError(
            f'No writable mapped inputs were found on protected sheet "{MAIN_SHEET}". '
            "The script does not bypass workbook passwords; the workbook must expose its intended input cells as unlocked."
        )

    old_calculation = excel.Calculation
    old_screen_updating = excel.ScreenUpdating
    old_enable_events = excel.EnableEvents
    backups: list[tuple[Any, Any]] = []
    written = 0
    try:
        operation = "temporarily pausing Excel screen updates, events and automatic calculation"
        excel.ScreenUpdating = False
        excel.EnableEvents = False
        excel.Calculation = -4135  # xlCalculationManual
        for write in eligible_writes:
            operation = f"writing {write.sheet}!{write.address} ({write.label})"
            cell = sheets[write.sheet].Range(write.address)
            backups.append((cell, read_formula(cell)))
            write_cell(cell, write)
            written += 1
        excel.Calculation = old_calculation
        excel.EnableEvents = old_enable_events
        if calculate:
            operation = "performing Excel CalculateFullRebuild"
            excel.CalculateFullRebuild()
        operation = f'activating worksheet "{MAIN_SHEET}"'
        sheets[MAIN_SHEET].Activate()
        if save:
            operation = f'saving workbook "{workbook.Name}"'
            workbook.Save()
    except Exception as exc:
        for cell, old_formula in reversed(backups):
            try:
                if old_formula in (None, ""):
                    top_left_cell(cell).Value2 = ""
                else:
                    cell = top_left_cell(cell)
                    try:
                        cell.Formula2 = old_formula
                    except Exception:
                        cell.Formula = old_formula
            except Exception:
                pass
        raise RuntimeError(f"Excel failed while {operation}: {exc}") from exc
    finally:
        try:
            excel.Calculation = old_calculation
            excel.EnableEvents = old_enable_events
            excel.ScreenUpdating = old_screen_updating
        except Exception:
            pass
    return str(workbook.Name), written, tuple(skipped)


def load_project(path: Path) -> dict[str, Any]:
    try:
        with path.open("r", encoding="utf-8-sig") as handle:
            project = json.load(handle)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid JSON at line {exc.lineno}, column {exc.colno}: {exc.msg}") from exc
    if not isinstance(project, dict):
        raise ValueError("The project JSON root must be an object.")
    return project


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(
        description="Write a Trailer Stability project JSON case into the active Excel calculation workbook."
    )
    result.add_argument("json_file", type=Path, help="Trailer Stability project JSON file")
    result.add_argument("--plan-only", action="store_true", help="Validate and print the mapping without connecting to Excel")
    result.add_argument("--verbose", action="store_true", help="Print every mapped cell and value")
    result.add_argument("--workbook-name", help="Require this exact active workbook name before writing")
    result.add_argument("--save", action="store_true", help="Save the active workbook after a successful import")
    result.add_argument("--no-calculate", action="store_true", help="Do not run Excel CalculateFullRebuild after writing")
    result.add_argument(
        "--strict",
        action="store_true",
        help="Fail instead of preserving locked cells or skipping workbook sheets that are not present",
    )
    return result


def main(argv: Iterable[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        path = args.json_file.expanduser().resolve(strict=True)
        project = load_project(path)
        plan = build_import_plan(project)
        print(f"Project: {path}")
        print_plan(plan, verbose=args.verbose)
        if args.plan_only:
            print("\nPLAN ONLY: no Excel cells were changed.")
            return 0
        workbook_name, count, skipped = apply_plan(
            plan,
            expected_workbook_name=args.workbook_name,
            save=args.save,
            calculate=not args.no_calculate,
            strict=args.strict,
        )
        print(f'\nImported {count} mapped cells into active workbook "{workbook_name}".')
        if skipped:
            missing_control = sum(item.startswith(f"{CONTROL_SHEET}!") for item in skipped)
            already_blank = sum(": already blank" in item for item in skipped)
            matching_formula = sum(": protected formula already matches" in item for item in skipped)
            protected_locked = sum(": protected/locked cell preserved" in item for item in skipped)
            if missing_control:
                print(
                    f"Skipped {missing_control} optimiser-control cells because this calculation-only workbook "
                    f'does not contain "{CONTROL_SHEET}".'
                )
            if protected_locked:
                print(f"Preserved {protected_locked} protected/locked cells without attempting to bypass workbook protection.")
            if matching_formula:
                print(f"Retained {matching_formula} protected formulas that already matched the required shared-input logic.")
            if already_blank:
                print(f"Left {already_blank} already-empty optional cells unchanged.")
            if args.verbose:
                print("Skipped targets:")
                for item in skipped:
                    print(f"  - {item}")
        print("Excel performed a full calculation rebuild." if not args.no_calculate else "Calculation was skipped by request.")
        print("Workbook saved." if args.save else "Workbook was not saved; review it in Excel and save when ready.")
        return 0
    except (OSError, ValueError, RuntimeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"ERROR: unexpected {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
