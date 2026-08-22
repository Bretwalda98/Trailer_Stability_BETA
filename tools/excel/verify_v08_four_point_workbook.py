"""Open the generated v0.8 xlsm in Excel and exercise the four-point calculation path."""

import argparse
from pathlib import Path

import win32com.client as win32


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("workbook", nargs="?", default="outputs/Trailer_Stability_Calculator_Optimiser_v0.8_4Point_Final.xlsm")
    parser.add_argument("--writable", action="store_true", help="Open a disposable copy with write access; never saves it.")
    workbook_path = Path(parser.parse_args().workbook).resolve()
    excel = win32.DispatchEx("Excel.Application")
    excel.Visible = False
    excel.DisplayAlerts = False
    excel.AutomationSecurity = 1
    workbook = excel.Workbooks.Open(str(workbook_path), UpdateLinks=0, ReadOnly=not parser.parse_args().writable)
    try:
        excel.Run(f"'{workbook.Name}'!TS4P_INITIALISE")
        excel.Calculate()
        sheet = workbook.Worksheets("4 Point Hydraulics")
        main_sheet = workbook.Worksheets("Load and Stability Calculation")
        print("charts", sheet.ChartObjects().Count)
        print("case-state", sheet.Range("B58").Value2)
        print("overall", sheet.Range("F55").Value2)
        print("summary", sheet.Range("A51:H55").Value)
        angle_errors = [sheet.Cells(row, 6).Value2 for row in range(19, 48) if isinstance(sheet.Cells(row, 6).Value2, int) and sheet.Cells(row, 6).Value2 < 0]
        print("angle-errors", angle_errors)
        before = sheet.Range("C9:F12").Value
        old_values = (main_sheet.Range("C89").Value2, main_sheet.Range("D138").Value2, main_sheet.Range("E89").Value2)
        main_sheet.Range("C89").Value = 30
        main_sheet.Range("D138").Value = 9
        main_sheet.Range("E89").Value = -8
        excel.Run(f"'{workbook.Name}'!TS4P_RUN_CASE")
        excel.Calculate()
        after = sheet.Range("C9:F12").Value
        print("auto-geometry-updated", before != after)
        print("changed-case-state", sheet.Range("B58").Value2)
        print("changed-overall", sheet.Range("F55").Value2)
        main_sheet.Range("C89").Value, main_sheet.Range("D138").Value, main_sheet.Range("E89").Value = old_values
        excel.Run(f"'{workbook.Name}'!TS4P_RUN_CASE")
        excel.Calculate()
        sheet.Range("B65").Value, sheet.Range("D65").Value, sheet.Range("F65").Value = (30, 30, 1)
        sheet.Range("B66").Value, sheet.Range("D66").Value = (9, 1)
        sheet.Range("B67").Value, sheet.Range("D67").Value, sheet.Range("F67").Value = (-8, -8, 1)
        excel.Run(f"'{workbook.Name}'!TS4P_RUN_OPTIMISER")
        four_point_log = workbook.Worksheets("TS_4POINT_LOG")
        print("optimiser-status", sheet.Range("B69").Value2)
        print("optimiser-log", four_point_log.Range("A2:K2").Value)
    finally:
        workbook.Close(SaveChanges=False)
        excel.Quit()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
