"""Recalculate and verify a website-exported four-point workbook in Excel."""

from __future__ import annotations

import argparse
import json
import math
import re
from pathlib import Path

import pythoncom
import win32com.client


CONTRACT_VERSION = "TS-XLSM-4P-2"
REQUIRED_SHEETS = (
    "Load and Stability Calculation",
    "Database",
    "Export to DWG",
    "Slope effect COG",
    "Dynamic loading CombinedCOG",
    "Spinebeam calculation",
)
REMOVED_OPTIMISER_SHEETS = (
    "TS_COMMAND_CENTER",
    "TS_CONTROL",
    "TS_OPTIMISER_LOG",
    "TS_LIVE_FEED",
    "TS_RUN_ACTIVITY_LOG",
)
KEY_RANGES = {
    "Load and Stability Calculation": (
        "B149:Q266",
        "B291:N430",
        "B446:I455",
        "B496:M506",
    ),
    "Export to DWG": ("C9:J47", "C49:F55"),
}
XL_CALC_AUTOMATIC = -4105
MSO_AUTOMATION_SECURITY_LOW = 1


def is_number(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(float(value))


def error_cells(sheet, address: str) -> list[dict]:
    errors: list[dict] = []
    source = sheet.Range(address)
    for row in range(1, source.Rows.Count + 1):
        for column in range(1, source.Columns.Count + 1):
            cell = source.Cells(row, column)
            value = cell.Value
            is_error = isinstance(value, int) and value < -2_000_000_000
            is_error = is_error or (
                isinstance(value, str)
                and value.upper().startswith(("#REF!", "#VALUE!", "#NAME?", "#DIV/0!", "#N/A"))
            )
            if not is_error:
                continue
            errors.append(
                {
                    "address": str(cell.Address),
                    "value": str(value),
                    "formula": str(cell.Formula or ""),
                }
            )
    return errors


def is_expected_inactive_trailer_na(main, error: dict) -> bool:
    if error["value"] not in ("-2146826246", "#N/A"):
        return False
    match = re.search(r"VLOOKUP\(\$B\$?(\d+)", error["formula"], re.IGNORECASE)
    if not match:
        match = re.search(r"VLOOKUP\(\$B(\d+)", error["formula"], re.IGNORECASE)
    if not match:
        return False
    trailer_row = int(match.group(1))
    return 89 <= trailer_row <= 100 and not str(main.Range(f"B{trailer_row}").Value or "").strip()


def settle(app) -> None:
    app.CalculateFullRebuild()
    for _ in range(100):
        app.Calculate()


def open_excel():
    app = win32com.client.DispatchEx("Excel.Application")
    app.Visible = False
    app.DisplayAlerts = False
    app.EnableEvents = False
    app.ScreenUpdating = False
    app.AutomationSecurity = MSO_AUTOMATION_SECURITY_LOW
    return app


def verify(workbook_path: Path) -> dict:
    app = open_excel()
    workbook = None
    result: dict = {"workbook": str(workbook_path), "checks": {}, "issues": []}
    issues: list[str] = result["issues"]
    try:
        try:
            workbook = app.Workbooks.Open(str(workbook_path), UpdateLinks=0, ReadOnly=False)
            result["checks"]["openedWithoutRepair"] = True
        except Exception as error:
            result["checks"]["openedWithoutRepair"] = False
            issues.append(f"Excel could not open the export without repair: {error}")
            workbook = app.Workbooks.Open(
                str(workbook_path), UpdateLinks=0, ReadOnly=False, CorruptLoad=1
            )
        app.Calculation = XL_CALC_AUTOMATIC
        sheet_names = [workbook.Worksheets(i).Name for i in range(1, workbook.Worksheets.Count + 1)]
        missing = [name for name in REQUIRED_SHEETS if name not in sheet_names]
        if missing:
            issues.append(f"Missing required sheet(s): {', '.join(missing)}")
            return result

        removed = [name for name in REMOVED_OPTIMISER_SHEETS if name in sheet_names]
        if removed:
            issues.append(f"Retired Excel optimiser sheet(s) still present: {', '.join(removed)}")

        main = workbook.Worksheets("Load and Stability Calculation")
        dwg = workbook.Worksheets("Export to DWG")
        settle(app)

        mode = str(main.Range("D133").Value or "")
        result["checks"]["contract"] = CONTRACT_VERSION
        result["checks"]["mode"] = mode
        if "4" not in mode:
            issues.append(f"Expected four-point mode in D133; found {mode or 'blank'}.")

        formula_checks = {
            "N163": "TS_HYD_REACTION(4",
            "K154": "TS_HYD_GROUP_CENTRE(4",
            "M154": "TS_HYD_GROUP_CENTRE(4",
        }
        for cell, signature in formula_checks.items():
            formula = str(main.Range(cell).Formula or "")
            if signature not in formula:
                issues.append(f"{cell} does not contain direct Group 4 formula {signature}.")
        if "TS_HYD_POLYGON_VALID" not in str(dwg.Range("C55").Formula or ""):
            issues.append("Export to DWG C55 does not contain four-point polygon validation.")
        for cell in ("H154", "K154", "M154"):
            formula = str(main.Range(cell).Formula or "")
            if "$CY$26" not in formula:
                issues.append(f"{cell} does not use the 99-AL E:CY range.")

        long_grid_checks = {
            "Bogie Group!CY2": workbook.Worksheets("Bogie Group").Range("CY2").Value,
            "Bogie Load Neutral!CW6": workbook.Worksheets("Bogie Load Neutral").Range("CW6").Formula,
            "Spinebeam calculation!CX72": workbook.Worksheets("Spinebeam calculation").Range("CX72").Formula,
        }
        result["checks"]["99AxleGrid"] = long_grid_checks
        if long_grid_checks["Bogie Group!CY2"] != 99:
            issues.append("Bogie Group does not expose axle line 99 in CY2.")
        if "$CW$52" not in str(long_grid_checks["Spinebeam calculation!CX72"] or ""):
            issues.append("Spinebeam calculation does not use the extended C:CW load grid.")

        group_loads = [main.Range(f"I{row}").Value for row in range(151, 155)]
        group_x = [main.Range(f"K{row}").Value for row in range(151, 155)]
        group_y = [main.Range(f"M{row}").Value for row in range(151, 155)]
        active_bogies = main.Range("H154").Value
        if not all(is_number(value) for value in (*group_loads, *group_x, *group_y)):
            issues.append("Group 1–4 loads or centres are not all numeric after recalculation.")
        elif float(active_bogies or 0) <= 0:
            issues.append("Group 4 has no active bogies after recalculation.")
        else:
            total = sum(float(value) for value in group_loads)
            target_total = float(main.Range("K158").Value)
            reaction_x = sum(float(group_loads[i]) * float(group_x[i]) for i in range(4)) / total
            reaction_y = sum(float(group_loads[i]) * float(group_y[i]) for i in range(4)) / total
            target_x = float(main.Range("L158").Value)
            target_y = float(main.Range("M158").Value)
            equilibrium = {
                "loadDelta": abs(total - target_total),
                "xDelta": abs(reaction_x - target_x),
                "yDelta": abs(reaction_y - target_y),
            }
            result["checks"]["fourPointEquilibrium"] = equilibrium
            if any(delta > 1e-8 for delta in equilibrium.values()):
                issues.append(f"Four-point force/moment equilibrium exceeds 1e-8: {equilibrium}")

        dwg_values = {
            "mode": dwg.Range("C49").Value,
            "group4X": dwg.Range("C54").Value,
            "group4Y": dwg.Range("D54").Value,
            "boundaryValid": bool(dwg.Range("C55").Value),
            "group4Gross": dwg.Range("F38").Value,
            "group4GBP": dwg.Range("F47").Value,
        }
        result["checks"]["dwgFourPoint"] = dwg_values
        if "4" not in str(dwg_values["mode"] or "") or not dwg_values["boundaryValid"]:
            issues.append("Export to DWG did not retain a valid four-point boundary.")
        for field in ("group4X", "group4Y", "group4Gross", "group4GBP"):
            if not is_number(dwg_values[field]):
                issues.append(f"Export to DWG {field} is not numeric after recalculation.")

        support_reactions = []
        for row in range(446, 456):
            active = str(main.Range(f"I{row}").Value or "").strip().lower() == "yes"
            reaction = main.Range(f"G{row}").Value
            support_reactions.append({"row": row, "active": active, "reactionT": reaction})
            if active and (not is_number(reaction) or float(reaction) < -1e-8):
                issues.append(f"Active support row {row} has invalid/negative reaction {reaction!r}.")
        result["checks"]["supports"] = support_reactions

        formula_errors = {}
        expected_inactive_errors = {}
        for sheet_name, ranges in KEY_RANGES.items():
            sheet = workbook.Worksheets(sheet_name)
            for address in ranges:
                found = error_cells(sheet, address)
                unexpected = []
                expected = []
                for error in found:
                    if sheet_name == "Load and Stability Calculation" and is_expected_inactive_trailer_na(main, error):
                        expected.append(error)
                    else:
                        unexpected.append(error)
                if unexpected:
                    formula_errors[f"{sheet_name}!{address}"] = unexpected
                if expected:
                    expected_inactive_errors[f"{sheet_name}!{address}"] = expected
        result["checks"]["formulaErrors"] = formula_errors
        result["checks"]["expectedInactiveTrailerPlaceholders"] = expected_inactive_errors
        if formula_errors:
            issues.append(f"Formula errors remain in key output ranges: {', '.join(formula_errors)}")

        module_names = [
            workbook.VBProject.VBComponents(i).Name
            for i in range(1, workbook.VBProject.VBComponents.Count + 1)
        ]
        result["checks"]["vbaModules"] = module_names
        if "modTS_HydraulicBoundary" not in module_names:
            issues.append("Four-point VBA module modTS_HydraulicBoundary is missing.")
        legacy_modules = [name for name in module_names if name.startswith("modTS_") and name != "modTS_HydraulicBoundary"]
        if legacy_modules:
            issues.append(f"Retired Excel optimiser VBA module(s) still present: {', '.join(legacy_modules)}")

        workbook.Save()
        workbook.Close(False)
        workbook = app.Workbooks.Open(str(workbook_path), UpdateLinks=0, ReadOnly=True)
        if "4" not in str(workbook.Worksheets("Load and Stability Calculation").Range("D133").Value or ""):
            issues.append("Four-point mode was not retained after save/reopen.")
        result["passed"] = not issues
        return result
    finally:
        if workbook is not None:
            workbook.Close(False)
        app.Quit()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "workbook",
        type=Path,
        nargs="?",
        default=Path("test-output/Trailer_Stability_Verification_FourPoint.xlsm"),
    )
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    workbook_path = args.workbook.resolve()
    if not workbook_path.exists():
        raise SystemExit(f"Workbook does not exist: {workbook_path}")
    report_path = (args.report or workbook_path.with_suffix(".verification.json")).resolve()

    pythoncom.CoInitialize()
    try:
        result = verify(workbook_path)
    finally:
        pythoncom.CoUninitialize()
    report_path.write_text(json.dumps(result, indent=2, default=str), encoding="utf-8")
    print(json.dumps(result, indent=2, default=str))
    return 0 if result.get("passed") else 1


if __name__ == "__main__":
    raise SystemExit(main())
