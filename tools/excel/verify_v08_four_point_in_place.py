from __future__ import annotations

import json
import math
from pathlib import Path

import pythoncom
import win32com.client


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "public" / "templates" / "Trailer_Stability_Verification_Template_v0.7.xlsm"
TARGET = Path(__file__).resolve().parent / "outputs" / "Trailer_Stability_Calculator_Optimiser_v0.8_4Point_InPlace.xlsm"
REPORT = Path(__file__).resolve().parent / "outputs" / "v08_4point_in_place_verification.json"

XL_CALC_AUTOMATIC = -4105
MSO_AUTOMATION_SECURITY_LOW = 1


def is_number(value) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(float(value))


def settle(app) -> None:
    app.CalculateFullRebuild()
    # The retained workbook contains iterative/volatile geometry chains. The
    # legacy source itself needs repeated smart calculations to reach its
    # stable value, so compare both files only after the same settle cycle.
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


def capture_baseline(path: Path) -> dict:
    app = open_excel()
    wb = None
    try:
        wb = app.Workbooks.Open(str(path), UpdateLinks=0, ReadOnly=True)
        app.Calculation = XL_CALC_AUTOMATIC
        settle(app)
        ws = wb.Worksheets("Load and Stability Calculation")
        cells = ["C223", "E238", "E239", "E296", "E297", "C306", "D404", "D429", "F503", "F504", "F505", "F506", "L503", "L504", "L505", "L506"]
        return {cell: ws.Range(cell).Value for cell in cells}
    finally:
        if wb is not None:
            wb.Close(False)
        app.Quit()


def verify_target(baseline: dict) -> dict:
    app = open_excel()
    wb = None
    result: dict = {}
    try:
        wb = app.Workbooks.Open(str(TARGET), UpdateLinks=0, ReadOnly=False)
        app.Calculation = XL_CALC_AUTOMATIC
        sheets = [wb.Worksheets(i).Name for i in range(1, wb.Worksheets.Count + 1)]
        result["sheet_count"] = len(sheets)
        result["forbidden_sheets_present"] = sorted(set(sheets) & {"4 Point Hydraulics", "TS_4POINT_LOG"})
        result["required_existing_sheets"] = {
            name: name in sheets for name in ("Load and Stability Calculation", "Export to DWG", "Slope effect COG", "Dynamic loading CombinedCOG", "Spinebeam calculation")
        }

        ws = wb.Worksheets("Load and Stability Calculation")
        original_groups = {
            address: ws.Range(address).Value
            for row in range(138, 162)
            for address in (f"B{row}", f"C{row}")
        }
        ws.Range("D133").Value = "3-point"
        settle(app)
        parity = {}
        for cell, source_value in baseline.items():
            target_value = ws.Range(cell).Value
            if is_number(source_value) and is_number(target_value):
                delta = abs(float(source_value) - float(target_value))
                parity[cell] = {"source": source_value, "target": target_value, "delta": delta, "pass": delta <= 1e-8}
            else:
                parity[cell] = {"source": source_value, "target": target_value, "pass": source_value == target_value}
        result["three_point_parity"] = parity
        result["three_point_parity_pass"] = all(item["pass"] for item in parity.values())

        # Four corners from the existing north/south and before/after-split controls.
        for row in range(138, 162, 2):
            ws.Range(f"B{row}").Value = 1
            ws.Range(f"C{row}").Value = 2
            ws.Range(f"B{row + 1}").Value = 4
            ws.Range(f"C{row + 1}").Value = 3
        ws.Range("D133").Value = "4-point"
        app.CalculateFullRebuild()

        centres = []
        group_loads = []
        for row in range(151, 155):
            centres.append((ws.Range(f"K{row}").Value, ws.Range(f"M{row}").Value))
            group_loads.append(ws.Range(f"I{row}").Value)
        total_load = sum(float(v) for v in group_loads if is_number(v))
        target_load = ws.Range("K158").Value
        target_x = ws.Range("L158").Value
        target_y = ws.Range("M158").Value
        reaction_x = sum(float(group_loads[i]) * float(centres[i][0]) for i in range(4)) / total_load
        reaction_y = sum(float(group_loads[i]) * float(centres[i][1]) for i in range(4)) / total_load
        result["four_point_equilibrium"] = {
            "centres": centres,
            "group_loads": group_loads,
            "total_group_load": total_load,
            "expected_total_load": target_load,
            "load_delta": abs(total_load - float(target_load)),
            "reaction_cog_x": reaction_x,
            "expected_cog_x": target_x,
            "x_delta": abs(reaction_x - float(target_x)),
            "reaction_cog_y": reaction_y,
            "expected_cog_y": target_y,
            "y_delta": abs(reaction_y - float(target_y)),
        }
        result["four_point_equilibrium_pass"] = (
            result["four_point_equilibrium"]["load_delta"] <= 1e-8
            and result["four_point_equilibrium"]["x_delta"] <= 1e-8
            and result["four_point_equilibrium"]["y_delta"] <= 1e-8
        )
        result["four_point_polygon_valid"] = bool(wb.Worksheets("Export to DWG").Range("C55").Value)
        result["four_point_active_bogies"] = ws.Range("H154").Value
        result["four_point_per_axle_loads"] = [ws.Range(f"N{row}").Value for row in range(163, 168)]
        result["four_point_static_outputs"] = {cell: ws.Range(cell).Value for cell in ("O249", "O256", "O258", "O262", "P262", "O265", "P265")}
        result["four_point_case_outputs"] = {cell: ws.Range(cell).Value for cell in ("I308", "N405", "L430", "C306", "D404", "D429")}
        export = wb.Worksheets("Export to DWG")
        result["dwg_export"] = {
            "mode": export.Range("C49").Value,
            "group4_x": export.Range("C54").Value,
            "group4_y": export.Range("D54").Value,
            "boundary_valid": export.Range("C55").Value,
            "group4_gross": export.Range("F38").Value,
            "group4_pressure": export.Range("F47").Value,
        }
        result["chart_counts"] = {
            "main": sum(wb.Worksheets("Load and Stability Calculation").ChartObjects(i).Chart.SeriesCollection().Count for i in range(1, wb.Worksheets("Load and Stability Calculation").ChartObjects().Count + 1)),
            "spinebeam": sum(wb.Worksheets("Spinebeam calculation").ChartObjects(i).Chart.SeriesCollection().Count for i in range(1, wb.Worksheets("Spinebeam calculation").ChartObjects().Count + 1)),
        }
        result["module_present"] = any(wb.VBProject.VBComponents(i).Name == "modTS_HydraulicBoundary" for i in range(1, wb.VBProject.VBComponents.Count + 1))

        # Restore and save the delivered workbook in its backward-compatible default mode.
        ws.Range("D133").Value = "3-point"
        for address, value in original_groups.items():
            ws.Range(address).Value = value
        app.CalculateFullRebuild()
        wb.Save()
        result["restored_default_mode"] = ws.Range("D133").Value
        return result
    finally:
        if wb is not None:
            wb.Close(False)
        app.Quit()


def main() -> None:
    pythoncom.CoInitialize()
    try:
        baseline = capture_baseline(SOURCE)
        result = verify_target(baseline)
        REPORT.write_text(json.dumps(result, indent=2, default=str), encoding="utf-8")
        print(json.dumps(result, indent=2, default=str))
    finally:
        pythoncom.CoUninitialize()


if __name__ == "__main__":
    main()
