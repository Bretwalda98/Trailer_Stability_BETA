"""Build the macro-enabled four-point extension workbook from the retained v0.7 template.

The v0.7 workbook is intentionally left untouched.  This builder uses Excel COM so that
the existing VBA project, native formulas, drawings and embedded charts remain intact
while the v0.8 four-corner hydraulic calculation module and workspaces are added.
"""

from __future__ import annotations

import argparse
from pathlib import Path
from textwrap import dedent

import win32com.client as win32


XL_OPEN_XML_WORKBOOK_MACRO_ENABLED = 52
XL_CALCULATION_MANUAL = -4135
XL_CALCULATION_AUTOMATIC = -4105
XL_CHART_XY_SCATTER_LINES_NO_MARKERS = 74
XL_CHART_COLUMN_CLUSTERED = 51
XL_LEGEND_POSITION_BOTTOM = -4107
XL_MARKER_STYLE_CIRCLE = 8
MSO_FALSE = 0


VBA_MODULE = r'''
Option Explicit

' Trailer Stability Optimiser v0.8 - four-point hydraulic stability engine.
'
' This module deliberately does not alter v0.7's protected three-group engine.
' A four-point reaction has one free degree after force and two-moment equilibrium.
' TS4P_Reactions resolves it by minimising group load-per-active-bogie deviation
' from the neutral bogie-proportional target while retaining exact equilibrium.

Private Const TS4P_SHEET As String = "4 Point Hydraulics"
Private Const TS4P_MAIN_SHEET As String = "Load and Stability Calculation"
Private Const TS4P_LOG_SHEET As String = "TS_4POINT_LOG"
Private Const TS4P_EPS As Double = 0.000000001

Public Sub TS4P_OPEN()
    ThisWorkbook.Worksheets(TS4P_SHEET).Activate
End Sub

Public Sub TS4P_INITIALISE()
    TS4P_AutoGeometry
    TS4P_RUN_CASE
End Sub

Public Sub TS4P_RUN_CASE()
    On Error GoTo Failed
    Dim ws As Worksheet
    Set ws = ThisWorkbook.Worksheets(TS4P_SHEET)
    Application.Calculate
    If UCase$(Trim$(CStr(ws.Range("B4").Value2))) <> "MANUAL" Then TS4P_AutoGeometry
    ' A normal workbook calculation updates every dependent 4-point formula
    ' without forcing the legacy workbook's complete formula graph each time.
    Application.Calculate
    ws.Range("B57").Value = Now
    If TS4P_BOOL(ws.Range("F55").Value2) Then
        ws.Range("B58").Value = "PASS"
    Else
        ws.Range("B58").Value = "NOK"
    End If
    Exit Sub
Failed:
    ws.Range("B58").Value = "ERROR: " & Err.Description
End Sub

Public Sub TS4P_AutoGeometry()
    Dim ws As Worksheet, mainWs As Worksheet
    Dim r As Long, axleLines As Long, splitLine As Long
    Dim countRear As Double, countFront As Double
    Dim sumRearX As Double, sumFrontX As Double
    Dim sumRearRightY As Double, sumRearLeftY As Double
    Dim sumFrontRightY As Double, sumFrontLeftY As Double
    Dim capRear As Double, capFront As Double
    Dim trailerName As String, pitch As Double, startX As Double, centreY As Double
    Dim crossSpacing As Double, capacity As Double, lookupValue As Variant
    Dim groupWidth As Double

    Set ws = ThisWorkbook.Worksheets(TS4P_SHEET)
    Set mainWs = ThisWorkbook.Worksheets(TS4P_MAIN_SHEET)
    If UCase$(Trim$(CStr(ws.Range("B4").Value2))) = "MANUAL" Then
        ws.Range("B5").Value = "Manual group geometry retained. Use Auto geometry to rebuild it from the live trailer inputs."
        Exit Sub
    End If

    splitLine = TS4P_Long(mainWs.Range("D138").Value2, 1)
    For r = 89 To 100
        trailerName = Trim$(CStr(mainWs.Cells(r, "B").Value2))
        axleLines = TS4P_Long(mainWs.Cells(r, "C").Value2, 0)
        If Len(trailerName) > 0 And axleLines > 1 Then
            pitch = TS4P_Dbl(mainWs.Cells(r, "G").Value2, 0#)
            startX = TS4P_Dbl(mainWs.Cells(r, "E").Value2, 0#)
            centreY = TS4P_Dbl(mainWs.Cells(r, "F").Value2, 0#)
            capacity = TS4P_VLookupNumber(trailerName, 6)
            crossSpacing = TS4P_VLookupNumber(trailerName, 4)
            If crossSpacing <= TS4P_EPS Then
                groupWidth = TS4P_Dbl(mainWs.Cells(r, "I").Value2, 0#)
                crossSpacing = groupWidth * 0.6
            End If
            If pitch <= TS4P_EPS Or crossSpacing <= TS4P_EPS Or capacity <= TS4P_EPS Then GoTo ContinueTrailer
            If splitLine < 1 Then splitLine = 1
            If splitLine >= axleLines Then splitLine = axleLines - 1

            countRear = countRear + splitLine
            countFront = countFront + axleLines - splitLine
            sumRearX = sumRearX + (startX + splitLine * pitch / 2#) * splitLine
            sumFrontX = sumFrontX + (startX + (splitLine + axleLines) * pitch / 2#) * (axleLines - splitLine)
            sumRearRightY = sumRearRightY + (centreY - crossSpacing / 2#) * splitLine
            sumRearLeftY = sumRearLeftY + (centreY + crossSpacing / 2#) * splitLine
            sumFrontRightY = sumFrontRightY + (centreY - crossSpacing / 2#) * (axleLines - splitLine)
            sumFrontLeftY = sumFrontLeftY + (centreY + crossSpacing / 2#) * (axleLines - splitLine)
            capRear = capRear + splitLine * capacity / 2#
            capFront = capFront + (axleLines - splitLine) * capacity / 2#
        End If
ContinueTrailer:
    Next r

    If countRear <= TS4P_EPS Or countFront <= TS4P_EPS Then
        ws.Range("B5").Value = "Cannot derive four corners: select trailer(s), C89 > 1 and a D138 split strictly inside the axle-line count."
        Exit Sub
    End If

    ' Clockwise boundary: rear-right, rear-left, front-left, front-right.
    ws.Range("C9").Value = sumRearX / countRear
    ws.Range("D9").Value = sumRearRightY / countRear
    ws.Range("E9").Value = countRear
    ws.Range("F9").Value = capRear
    ws.Range("C10").Value = sumRearX / countRear
    ws.Range("D10").Value = sumRearLeftY / countRear
    ws.Range("E10").Value = countRear
    ws.Range("F10").Value = capRear
    ws.Range("C11").Value = sumFrontX / countFront
    ws.Range("D11").Value = sumFrontLeftY / countFront
    ws.Range("E11").Value = countFront
    ws.Range("F11").Value = capFront
    ws.Range("C12").Value = sumFrontX / countFront
    ws.Range("D12").Value = sumFrontRightY / countFront
    ws.Range("E12").Value = countFront
    ws.Range("F12").Value = capFront
    ws.Range("B5").Value = "Auto geometry rebuilt from all selected trailers. Rear is lower X; front is higher X. Group order is clockwise."
End Sub

Public Function TS4P_REACTION(ByVal groupIndex As Long, ByVal cogX As Double, ByVal cogY As Double, _
    ByVal x1 As Double, ByVal y1 As Double, ByVal n1 As Double, _
    ByVal x2 As Double, ByVal y2 As Double, ByVal n2 As Double, _
    ByVal x3 As Double, ByVal y3 As Double, ByVal n3 As Double, _
    ByVal x4 As Double, ByVal y4 As Double, ByVal n4 As Double) As Variant
    Dim reactions As Variant
    reactions = TS4P_Reactions(cogX, cogY, x1, y1, n1, x2, y2, n2, x3, y3, n3, x4, y4, n4)
    If IsEmpty(reactions) Then
        TS4P_REACTION = CVErr(xlErrNum)
    ElseIf groupIndex < 1 Or groupIndex > 4 Then
        TS4P_REACTION = CVErr(xlErrValue)
    Else
        TS4P_REACTION = reactions(groupIndex)
    End If
End Function

Private Function TS4P_Reactions(ByVal cogX As Double, ByVal cogY As Double, _
    ByVal x1 As Double, ByVal y1 As Double, ByVal n1 As Double, _
    ByVal x2 As Double, ByVal y2 As Double, ByVal n2 As Double, _
    ByVal x3 As Double, ByVal y3 As Double, ByVal n3 As Double, _
    ByVal x4 As Double, ByVal y4 As Double, ByVal n4 As Double) As Variant
    Dim x(1 To 4) As Double, y(1 To 4) As Double, n(1 To 4) As Double
    Dim target(1 To 4) As Double, weight(1 To 4) As Double, lambda(1 To 3) As Double
    Dim matrix(1 To 3, 1 To 3) As Double, rhs(1 To 3) As Double, rowValue(1 To 3, 1 To 4) As Double
    Dim result(1 To 4) As Double, total As Double, targetMoment(1 To 3) As Double
    Dim i As Long, j As Long, k As Long

    x(1) = x1: y(1) = y1: n(1) = n1
    x(2) = x2: y(2) = y2: n(2) = n2
    x(3) = x3: y(3) = y3: n(3) = n3
    x(4) = x4: y(4) = y4: n(4) = n4
    For i = 1 To 4
        If n(i) <= TS4P_EPS Then Exit Function
        total = total + n(i)
        rowValue(1, i) = x(i)
        rowValue(2, i) = y(i)
        rowValue(3, i) = 1#
    Next i
    If total <= TS4P_EPS Then Exit Function
    For i = 1 To 4
        target(i) = n(i) / total
        weight(i) = n(i) * n(i)
    Next i
    For i = 1 To 3
        For k = 1 To 4
            targetMoment(i) = targetMoment(i) + rowValue(i, k) * target(k)
        Next k
    Next i
    rhs(1) = cogX - targetMoment(1)
    rhs(2) = cogY - targetMoment(2)
    rhs(3) = 1# - targetMoment(3)
    For i = 1 To 3
        For j = 1 To 3
            For k = 1 To 4
                matrix(i, j) = matrix(i, j) + weight(k) * rowValue(i, k) * rowValue(j, k)
            Next k
        Next j
    Next i
    If Not TS4P_Solve3(matrix, rhs, lambda) Then Exit Function
    For i = 1 To 4
        result(i) = target(i) + weight(i) * (x(i) * lambda(1) + y(i) * lambda(2) + lambda(3))
    Next i
    TS4P_Reactions = result
End Function

Private Function TS4P_Solve3(ByRef matrix() As Double, ByRef rhs() As Double, ByRef result() As Double) As Boolean
    Dim a(1 To 3, 1 To 4) As Double, pivot As Long, row As Long, col As Long, best As Double, factor As Double, temp As Double
    For row = 1 To 3
        For col = 1 To 3: a(row, col) = matrix(row, col): Next col
        a(row, 4) = rhs(row)
    Next row
    For col = 1 To 3
        pivot = col: best = Abs(a(col, col))
        For row = col + 1 To 3
            If Abs(a(row, col)) > best Then pivot = row: best = Abs(a(row, col))
        Next row
        If best <= TS4P_EPS Then Exit Function
        If pivot <> col Then
            For row = col To 4
                temp = a(col, row): a(col, row) = a(pivot, row): a(pivot, row) = temp
            Next row
        End If
        factor = a(col, col)
        For row = col To 4: a(col, row) = a(col, row) / factor: Next row
        For row = 1 To 3
            If row <> col Then
                factor = a(row, col)
                For pivot = col To 4: a(row, pivot) = a(row, pivot) - factor * a(col, pivot): Next pivot
            End If
        Next row
    Next col
    For row = 1 To 3: result(row) = a(row, 4): Next row
    TS4P_Solve3 = True
End Function

Public Function TS4P_POLYGONVALID(ByVal x1 As Double, ByVal y1 As Double, ByVal x2 As Double, ByVal y2 As Double, _
    ByVal x3 As Double, ByVal y3 As Double, ByVal x4 As Double, ByVal y4 As Double) As Boolean
    Dim x(1 To 4) As Double, y(1 To 4) As Double, i As Long, nextI As Long, next2 As Long, signValue As Double, baseSign As Double
    x(1) = x1: y(1) = y1: x(2) = x2: y(2) = y2: x(3) = x3: y(3) = y3: x(4) = x4: y(4) = y4
    For i = 1 To 4
        nextI = i Mod 4 + 1: next2 = nextI Mod 4 + 1
        signValue = TS4P_Cross(x(i), y(i), x(nextI), y(nextI), x(next2), y(next2))
        If Abs(signValue) <= TS4P_EPS Then Exit Function
        If baseSign = 0# Then baseSign = Sgn(signValue) Else If Sgn(signValue) <> Sgn(baseSign) Then Exit Function
    Next i
    TS4P_POLYGONVALID = True
End Function

Public Function TS4P_INSIDE(ByVal px As Double, ByVal py As Double, ByVal x1 As Double, ByVal y1 As Double, _
    ByVal x2 As Double, ByVal y2 As Double, ByVal x3 As Double, ByVal y3 As Double, ByVal x4 As Double, ByVal y4 As Double) As Boolean
    Dim x(1 To 4) As Double, y(1 To 4) As Double, i As Long, j As Long, value As Double, signValue As Double
    x(1) = x1: y(1) = y1: x(2) = x2: y(2) = y2: x(3) = x3: y(3) = y3: x(4) = x4: y(4) = y4
    If Not TS4P_POLYGONVALID(x1, y1, x2, y2, x3, y3, x4, y4) Then Exit Function
    For i = 1 To 4
        j = i Mod 4 + 1
        value = TS4P_Cross(x(i), y(i), x(j), y(j), px, py)
        If Abs(value) > TS4P_EPS Then
            If signValue = 0# Then signValue = Sgn(value) Else If Sgn(value) <> Sgn(signValue) Then Exit Function
        End If
    Next i
    TS4P_INSIDE = True
End Function

Public Function TS4P_MINANGLE(ByVal px As Double, ByVal py As Double, ByVal cogHeight As Double, _
    ByVal x1 As Double, ByVal y1 As Double, ByVal x2 As Double, ByVal y2 As Double, _
    ByVal x3 As Double, ByVal y3 As Double, ByVal x4 As Double, ByVal y4 As Double) As Variant
    Dim x(1 To 4) As Double, y(1 To 4) As Double, i As Long, j As Long, distance As Double, minDistance As Double, angleValue As Double
    If cogHeight <= TS4P_EPS Or Not TS4P_POLYGONVALID(x1, y1, x2, y2, x3, y3, x4, y4) Then
        TS4P_MINANGLE = CVErr(xlErrNum)
        Exit Function
    End If
    x(1) = x1: y(1) = y1: x(2) = x2: y(2) = y2: x(3) = x3: y(3) = y3: x(4) = x4: y(4) = y4
    For i = 1 To 4
        j = i Mod 4 + 1
        distance = Abs(TS4P_Cross(x(i), y(i), x(j), y(j), px, py)) / Sqr((x(j) - x(i)) ^ 2 + (y(j) - y(i)) ^ 2)
        If i = 1 Or distance < minDistance Then minDistance = distance
    Next i
    angleValue = Atn(minDistance / cogHeight) * 180# / 3.14159265358979#
    If TS4P_INSIDE(px, py, x1, y1, x2, y2, x3, y3, x4, y4) Then TS4P_MINANGLE = angleValue Else TS4P_MINANGLE = -angleValue
End Function

Private Function TS4P_Cross(ByVal ax As Double, ByVal ay As Double, ByVal bx As Double, ByVal by As Double, ByVal px As Double, ByVal py As Double) As Double
    TS4P_Cross = (bx - ax) * (py - ay) - (by - ay) * (px - ax)
End Function

Private Function TS4P_Dbl(ByVal value As Variant, Optional ByVal fallback As Double = 0#) As Double
    If IsError(value) Or Len(Trim$(CStr(value))) = 0 Or Not IsNumeric(value) Then TS4P_Dbl = fallback Else TS4P_Dbl = CDbl(value)
End Function

Private Function TS4P_Long(ByVal value As Variant, Optional ByVal fallback As Long = 0) As Long
    TS4P_Long = CLng(Fix(TS4P_Dbl(value, CDbl(fallback))))
End Function

Private Function TS4P_BOOL(ByVal value As Variant) As Boolean
    If IsError(value) Then Exit Function
    TS4P_BOOL = UCase$(Trim$(CStr(value))) = "PASS" Or UCase$(Trim$(CStr(value))) = "OK" Or value = True
End Function

Private Function TS4P_VLookupNumber(ByVal trailerName As String, ByVal indexNo As Long) As Double
    On Error GoTo Done
    TS4P_VLookupNumber = CDbl(Application.VLookup(trailerName, ThisWorkbook.Names("TrailerDataLookup").RefersToRange, indexNo, False))
Done:
End Function

Public Sub TS4P_RUN_OPTIMISER()
    Dim ws As Worksheet, mainWs As Worksheet, logWs As Worksheet
    Dim cStart As Long, cMax As Long, cStep As Long, dStart As Long, dStep As Long
    Dim eStart As Double, eMax As Double, eStep As Double, cValue As Long, dValue As Long, eValue As Double
    Dim rowOut As Long, tested As Long, oldC As Variant, oldD As Variant, oldE As Variant
    Dim basicAngle As Double, slopeAngle As Double, dynamicAngle As Double, dynamicUtil As Double, rating As Double, passText As String
    On Error GoTo Failed
    Set ws = ThisWorkbook.Worksheets(TS4P_SHEET): Set mainWs = ThisWorkbook.Worksheets(TS4P_MAIN_SHEET): Set logWs = ThisWorkbook.Worksheets(TS4P_LOG_SHEET)
    oldC = mainWs.Range("C89").Value2: oldD = mainWs.Range("D138").Value2: oldE = mainWs.Range("E89").Value2
    cStart = TS4P_Long(ws.Range("B65").Value2, TS4P_Long(oldC, 1)): cMax = TS4P_Long(ws.Range("D65").Value2, cStart): cStep = TS4P_Long(ws.Range("F65").Value2, 1)
    dStart = TS4P_Long(ws.Range("B66").Value2, 1): dStep = TS4P_Long(ws.Range("D66").Value2, 1)
    eStart = TS4P_Dbl(ws.Range("B67").Value2, TS4P_Dbl(oldE, 0#)): eMax = TS4P_Dbl(ws.Range("D67").Value2, eStart): eStep = TS4P_Dbl(ws.Range("F67").Value2, 1#)
    If cStart < 2 Or cMax < cStart Or cStep < 1 Or dStart < 1 Or dStep < 1 Or eStep <= 0# Then Err.Raise 5, , "Correct the v0.8 optimiser bounds before running."
    logWs.Rows("2:" & logWs.Rows.Count).ClearContents
    rowOut = 2
    Application.ScreenUpdating = False
    For cValue = cStart To cMax Step cStep
        For dValue = dStart To cValue - 1 Step dStep
            For eValue = eStart To eMax + TS4P_EPS Step eStep
                mainWs.Range("C89").Value = cValue
                mainWs.Range("D138").Value = dValue
                mainWs.Range("E89").Value = eValue
                TS4P_AutoGeometry
                Application.Calculate
                basicAngle = TS4P_Dbl(ws.Range("B52").Value2, -999#)
                slopeAngle = TS4P_Dbl(ws.Range("B53").Value2, -999#)
                dynamicAngle = TS4P_Dbl(ws.Range("B54").Value2, -999#)
                dynamicUtil = TS4P_Dbl(ws.Range("H54").Value2, 999#)
                passText = CStr(ws.Range("F55").Value2)
                rating = dynamicUtil - 0.01 * (basicAngle + slopeAngle + dynamicAngle) + 0.0001 * cValue
                logWs.Cells(rowOut, 1).Resize(1, 11).Value = Array(Now, tested + 1, cValue, dValue, eValue, basicAngle, slopeAngle, dynamicAngle, dynamicUtil, passText, rating)
                rowOut = rowOut + 1: tested = tested + 1
                DoEvents
            Next eValue
        Next dValue
    Next cValue
    logWs.Range("A1:K" & rowOut - 1).Sort Key1:=logWs.Range("K2"), Order1:=1, Header:=1
    ws.Range("B69").Value = tested & " four-point cases checked. Best PASS is first in TS_4POINT_LOG."
CleanUp:
    mainWs.Range("C89").Value = oldC: mainWs.Range("D138").Value = oldD: mainWs.Range("E89").Value = oldE
    TS4P_AutoGeometry: Application.Calculate
    Application.ScreenUpdating = True
    Exit Sub
Failed:
    ws.Range("B69").Value = "Optimiser stopped: " & Err.Description
    Resume CleanUp
End Sub
'''


def rgb(red: int, green: int, blue: int) -> int:
    return red + (green << 8) + (blue << 16)


NAVY = rgb(31, 78, 121)
MID_BLUE = rgb(68, 114, 196)
PALE_BLUE = rgb(221, 235, 247)
INPUT_AMBER = rgb(255, 242, 204)
OUTPUT_GREEN = rgb(226, 239, 218)
LIGHT_GREY = rgb(242, 242, 242)
DARK_GREY = rgb(89, 89, 89)
WHITE = rgb(255, 255, 255)
RED = rgb(192, 0, 0)


def set_value(ws, address: str, value):
    ws.Range(address).Value = value


def set_formula(ws, address: str, formula: str):
    ws.Range(address).Formula = formula


def heading(ws, cell_range: str, title: str, fill=NAVY, font_color=WHITE, size=12):
    block = ws.Range(cell_range)
    block.Merge()
    block.Value = title
    block.Interior.Color = fill
    block.Font.Color = font_color
    block.Font.Bold = True
    block.Font.Size = size
    block.HorizontalAlignment = -4108
    block.VerticalAlignment = -4108


def label_row(ws, row: int, values):
    for column, value in enumerate(values, 1):
        ws.Cells(row, column).Value = value
    rng = ws.Range(ws.Cells(row, 1), ws.Cells(row, len(values)))
    rng.Interior.Color = MID_BLUE
    rng.Font.Color = WHITE
    rng.Font.Bold = True
    rng.HorizontalAlignment = -4108


def write_case_rows(ws, start_row: int, phase: str, center_x: str, center_y: str, shift_x: str, shift_y: str, count: int, factor: str):
    """Write the web-engine-equivalent 12 perimeter points, or the five basic points."""
    if count == 5:
        expressions = [
            ("Neutral", center_x, center_y),
            ("A", f"{center_x}-$G$15", f"{center_y}+$I$15"),
            ("B", f"{center_x}+$G$15", f"{center_y}+$I$15"),
            ("C", f"{center_x}-$G$15", f"{center_y}-$I$15"),
            ("D", f"{center_x}+$G$15", f"{center_y}-$I$15"),
        ]
    else:
        a_x, a_y = f"{center_x}-$G$15", f"{center_y}+$I$15"
        b_x, b_y = f"{center_x}+$G$15", f"{center_y}+$I$15"
        d_x, d_y = f"{center_x}+$G$15", f"{center_y}-$I$15"
        c_x, c_y = f"{center_x}-$G$15", f"{center_y}-$I$15"
        expressions = [
            ("A-X", f"{a_x}-{shift_x}", a_y),
            ("A-XY", f"{a_x}-{factor}*{shift_x}", f"{a_y}+{factor}*{shift_y}"),
            ("A-Y", a_x, f"{a_y}+{shift_y}"),
            ("B-Y", b_x, f"{b_y}+{shift_y}"),
            ("B-XY", f"{b_x}+{factor}*{shift_x}", f"{b_y}+{factor}*{shift_y}"),
            ("B-X", f"{b_x}+{shift_x}", b_y),
            ("D-X", f"{d_x}+{shift_x}", d_y),
            ("D-XY", f"{d_x}+{factor}*{shift_x}", f"{d_y}-{factor}*{shift_y}"),
            ("D-Y", d_x, f"{d_y}-{shift_y}"),
            ("C-Y", c_x, f"{c_y}-{shift_y}"),
            ("C-XY", f"{c_x}-{factor}*{shift_x}", f"{c_y}-{factor}*{shift_y}"),
            ("C-X", f"{c_x}-{shift_x}", c_y),
        ]
    for offset, (case_name, x_formula, y_formula) in enumerate(expressions):
        row = start_row + offset
        ws.Cells(row, 1).Value = phase
        ws.Cells(row, 2).Value = case_name
        ws.Cells(row, 3).Formula = f"={x_formula}"
        ws.Cells(row, 4).Formula = f"={y_formula}"
        ws.Cells(row, 5).Formula = "=TS4P_INSIDE(C{0},D{0},$C$9,$D$9,$C$10,$D$10,$C$11,$D$11,$C$12,$D$12)".format(row)
        ws.Cells(row, 6).Formula = "=TS4P_MINANGLE(C{0},D{0},$N$6,$C$9,$D$9,$C$10,$D$10,$C$11,$D$11,$C$12,$D$12)".format(row)
        for group in range(4):
            ws.Cells(row, 7 + group).Formula = (
                "=TS4P_REACTION({group},C{row},D{row},$C$9,$D$9,$E$9,$C$10,$D$10,$E$10,$C$11,$D$11,$E$11,$C$12,$D$12,$E$12)"
            ).format(group=group + 1, row=row)
        ws.Cells(row, 11).Formula = "=MAX(ABS(G{0}*$B$6/$F$9),ABS(H{0}*$B$6/$F$10),ABS(I{0}*$B$6/$F$11),ABS(J{0}*$B$6/$F$12))".format(row)
        ws.Cells(row, 12).Formula = "=IF(AND(E{0}=TRUE,MIN(G{0}:J{0})>=0),\"OK\",\"NOK\")".format(row)


def create_four_point_sheet(workbook):
    try:
        workbook.Worksheets("4 Point Hydraulics").Delete()
    except Exception:
        pass
    ws = workbook.Worksheets.Add(After=workbook.Worksheets(workbook.Worksheets.Count))
    ws.Name = "4 Point Hydraulics"
    ws.Tab.Color = MID_BLUE
    ws.Cells.Font.Name = "Aptos"
    ws.Cells.Font.Size = 10
    ws.Rows.RowHeight = 17
    for column, width in enumerate([16, 17, 14, 14, 12, 15, 13, 13, 13, 13, 14, 12, 14, 14, 14, 14], 1):
        ws.Columns(column).ColumnWidth = width
    ws.Columns("A:P").VerticalAlignment = -4108

    heading(ws, "A1:P1", "TRAILER STABILITY OPTIMISER — V0.8 FOUR-POINT HYDRAULIC CALCULATION", size=15)
    heading(ws, "A3:P3", "Four-point mode uses an ordered convex quadrilateral: rear-right → rear-left → front-left → front-right. Rear is lower X; front is higher X.", fill=DARK_GREY, size=10)

    set_value(ws, "A4", "Geometry mode")
    set_value(ws, "B4", "AUTO")
    set_value(ws, "A5", "Status")
    set_value(ws, "B5", "Press Refresh four-point case to derive the four corners from selected trailers.")
    set_value(ws, "A6", "Combined mass (t)")
    set_formula(ws, "B6", "='Load and Stability Calculation'!$H$230")
    set_value(ws, "C6", "Combined COG X (m)")
    set_formula(ws, "D6", "='Load and Stability Calculation'!$J$229")
    set_value(ws, "E6", "Combined COG Y (m)")
    set_formula(ws, "F6", "='Load and Stability Calculation'!$K$229")
    set_value(ws, "G6", "Combined COG Z (m)")
    set_formula(ws, "H6", "='Load and Stability Calculation'!$L$229")
    set_value(ws, "I6", "Use COG X")
    set_formula(ws, "J6", "=D6")
    set_value(ws, "K6", "Use COG Y")
    set_formula(ws, "L6", "=F6")
    set_value(ws, "M6", "Use COG Z")
    set_formula(ws, "N6", "=H6")
    ws.Range("A4:N6").Borders.LineStyle = 1
    ws.Range("B4").Interior.Color = INPUT_AMBER
    ws.Range("B4").Validation.Delete()
    ws.Range("B4").Validation.Add(3, 1, 1, "AUTO,MANUAL")
    ws.Range("B6,D6,F6,H6,J6,L6,N6").Interior.Color = OUTPUT_GREEN
    ws.Range("A5:P5").Font.Italic = True

    label_row(ws, 8, ["Group", "Corner", "Centre X (m)", "Centre Y (m)", "Active bogies", "Gross capacity (t)", "Reaction", "Group load (t)", "Utilisation", "State"])
    labels = [("G1", "Rear / right"), ("G2", "Rear / left"), ("G3", "Front / left"), ("G4", "Front / right")]
    for row, (group, position) in enumerate(labels, 9):
        ws.Cells(row, 1).Value = group
        ws.Cells(row, 2).Value = position
        ws.Cells(row, 7).Formula = f"=TS4P_REACTION(ROW()-8,$J$6,$L$6,$C$9,$D$9,$E$9,$C$10,$D$10,$E$10,$C$11,$D$11,$E$11,$C$12,$D$12,$E$12)"
        ws.Cells(row, 8).Formula = f"=IFERROR(G{row}*$B$6,NA())"
        ws.Cells(row, 9).Formula = f"=IFERROR(H{row}/F{row},NA())"
        ws.Cells(row, 10).Formula = f"=IF(AND($B$4<>\"\",TS4P_POLYGONVALID($C$9,$D$9,$C$10,$D$10,$C$11,$D$11,$C$12,$D$12),G{row}>=0),\"OK\",\"NOK\")"
    ws.Range("C9:F12").Interior.Color = INPUT_AMBER
    ws.Range("G9:J12").Interior.Color = OUTPUT_GREEN
    ws.Range("A8:J12").Borders.LineStyle = 1
    ws.Range("G9:I12").NumberFormat = "0.000"

    set_value(ws, "F15", "Envelope X (m)")
    set_formula(ws, "G15", "='Load and Stability Calculation'!$M$249*'Load and Stability Calculation'!$B$230/'Load and Stability Calculation'!$H$230")
    set_value(ws, "H15", "Envelope Y (m)")
    set_formula(ws, "I15", "='Load and Stability Calculation'!$M$250*'Load and Stability Calculation'!$B$230/'Load and Stability Calculation'!$H$230")
    set_value(ws, "J15", "Combination factor")
    set_formula(ws, "K15", "='Load and Stability Calculation'!$D$293")
    set_value(ws, "F16", "Slope ΔX (m)")
    set_formula(ws, "G16", "=TAN(RADIANS('Load and Stability Calculation'!$H$291))*$N$6")
    set_value(ws, "H16", "Slope ΔY (m)")
    set_formula(ws, "I16", "=TAN(RADIANS('Load and Stability Calculation'!$H$292))*$N$6")
    set_value(ws, "F17", "Dynamic ΔX (m)")
    set_formula(ws, "G17", "=SUM('Load and Stability Calculation'!$J$356:$J$357)/('Load and Stability Calculation'!$H$230*9.81)")
    set_value(ws, "H17", "Dynamic ΔY (m)")
    set_formula(ws, "I17", "=SUM('Load and Stability Calculation'!$M$356:$M$357)/('Load and Stability Calculation'!$H$230*9.81)")
    ws.Range("F15:K17").Borders.LineStyle = 1
    ws.Range("G15:K17").Interior.Color = OUTPUT_GREEN
    ws.Range("G15:K17").NumberFormat = "0.000"

    label_row(ws, 18, ["Phase", "Case", "COG X (m)", "COG Y (m)", "Inside polygon", "Tipping angle (°)", "G1 reaction", "G2 reaction", "G3 reaction", "G4 reaction", "Worst axle util.", "State"])
    write_case_rows(ws, 19, "Basic", "$J$6", "$L$6", "$G$16", "$I$16", 5, "$K$15")
    write_case_rows(ws, 24, "Slope", "$J$6", "$L$6", "$G$16", "$I$16", 12, "$K$15")
    write_case_rows(ws, 36, "Dynamic", "$J$6", "$L$6", "($G$16+$G$17)", "($I$16+$I$17)", 12, "$K$15")
    ws.Range("A18:L47").Borders.LineStyle = 1
    ws.Range("C19:D47,F19:K47").NumberFormat = "0.000"

    heading(ws, "A50:H50", "COMBINED-COG FOUR-POINT CHECKS", fill=NAVY)
    label_row(ws, 51, ["Check", "Minimum angle (°)", "Required (°)", "Angle state", "Maximum utilisation", "Utilisation limit", "Utilisation state", "Overall state"])
    summary = [(52, "Basic", "F19:F23", "K19:K23", "'Load and Stability Calculation'!$J$238", "'Load and Stability Calculation'!$H$223"),
               (53, "Slope", "F24:F35", "K24:K35", "'Load and Stability Calculation'!$J$296", "'Load and Stability Calculation'!$H$306"),
               (54, "Dynamic", "F36:F47", "K36:K47", "'Load and Stability Calculation'!$L$360", "'Load and Stability Calculation'!$K$404")]
    for row, name, angle_range, util_range, required_angle, util_limit in summary:
        ws.Cells(row, 1).Value = name
        ws.Cells(row, 2).Formula = f"=MIN({angle_range})"
        ws.Cells(row, 3).Formula = f"={required_angle}"
        ws.Cells(row, 4).Formula = f"=IF(B{row}>=C{row},\"OK\",\"NOK\")"
        ws.Cells(row, 5).Formula = f"=MAX({util_range})"
        ws.Cells(row, 6).Formula = f"={util_limit}"
        ws.Cells(row, 7).Formula = f"=IF(E{row}<=F{row},\"OK\",\"NOK\")"
        ws.Cells(row, 8).Formula = f"=IF(AND(D{row}=\"OK\",G{row}=\"OK\"),\"PASS\",\"NOK\")"
    set_value(ws, "A55", "Four-point geometry")
    set_formula(ws, "B55", "=TS4P_POLYGONVALID($C$9,$D$9,$C$10,$D$10,$C$11,$D$11,$C$12,$D$12)")
    set_value(ws, "D55", "Combined overall")
    set_formula(ws, "F55", "=IF(AND(B55=TRUE,H52=\"PASS\",H53=\"PASS\",H54=\"PASS\"),\"PASS\",\"NOK\")")
    set_value(ws, "A57", "Last refresh")
    set_value(ws, "A58", "Case state")
    set_value(ws, "B58", "Not yet calculated")
    ws.Range("A51:H58").Borders.LineStyle = 1
    ws.Range("B52:H55").Interior.Color = OUTPUT_GREEN
    ws.Range("B52:C54,E52:F54").NumberFormat = "0.0"
    ws.Range("B57:B58").Interior.Color = OUTPUT_GREEN

    heading(ws, "A60:H60", "V0.8 FOUR-POINT OPTIMISER", fill=NAVY)
    set_value(ws, "A61", "This optimiser evaluates the same C89, D138 and E89 master inputs as v0.7, automatically rebuilds all four corners, then ranks valid four-point cases.")
    ws.Range("A61:H61").Merge()
    set_value(ws, "A65", "C89 start")
    set_formula(ws, "B65", "=TS_CONTROL!$B$8")
    set_value(ws, "C65", "C89 maximum")
    set_formula(ws, "D65", "=TS_CONTROL!$B$7")
    set_value(ws, "E65", "C89 step")
    set_formula(ws, "F65", "=TS_CONTROL!$B$9")
    set_value(ws, "A66", "D138 start")
    set_formula(ws, "B66", "=TS_CONTROL!$B$26")
    set_value(ws, "C66", "D138 step")
    set_formula(ws, "D66", "=TS_CONTROL!$B$27")
    set_value(ws, "A67", "E89 start")
    set_formula(ws, "B67", "=TS_CONTROL!$B$12")
    set_value(ws, "C67", "E89 maximum")
    set_formula(ws, "D67", "=TS_CONTROL!$B$13")
    set_value(ws, "E67", "E89 step")
    set_formula(ws, "F67", "=TS_CONTROL!$B$6")
    set_value(ws, "A69", "Run status")
    set_value(ws, "B69", "Ready")
    ws.Range("A65:F69").Borders.LineStyle = 1
    ws.Range("B65:F67").Interior.Color = INPUT_AMBER
    ws.Range("B69").Interior.Color = OUTPUT_GREEN

    # Buttons are shapes because this work is deployed as xlsm and must not depend on an add-in.
    for name, text, left, top, macro, color in [
        ("TS4P_RefreshButton", "REFRESH FOUR-POINT CASE", 620, 70, "TS4P_RUN_CASE", MID_BLUE),
        ("TS4P_AutoButton", "BUILD AUTO GEOMETRY", 620, 105, "TS4P_AutoGeometry", NAVY),
        ("TS4P_OptimiseButton", "RUN FOUR-POINT OPTIMISER", 620, 740, "TS4P_RUN_OPTIMISER", MID_BLUE),
    ]:
        shape = ws.Shapes.AddShape(1, left, top, 230, 27)
        shape.Name = name
        shape.TextFrame2.TextRange.Characters.Text = text
        shape.TextFrame2.TextRange.Font.Size = 9
        shape.TextFrame2.TextRange.Font.Bold = True
        shape.TextFrame2.TextRange.Font.Fill.ForeColor.RGB = WHITE
        shape.Fill.ForeColor.RGB = color
        shape.Line.ForeColor.RGB = WHITE
        shape.OnAction = macro

    ws.Range("A4:B4").Validation.Delete()
    ws.Range("B4").Validation.Add(3, 1, 1, "AUTO,MANUAL")
    ws.Range("A1:P70").HorizontalAlignment = -4131
    ws.Range("A1:P70").VerticalAlignment = -4108
    ws.Application.ActiveWindow.SplitRow = 3
    ws.Application.ActiveWindow.FreezePanes = True
    return ws


def create_log_sheet(workbook):
    try:
        workbook.Worksheets("TS_4POINT_LOG").Delete()
    except Exception:
        pass
    ws = workbook.Worksheets.Add(After=workbook.Worksheets(workbook.Worksheets.Count))
    ws.Name = "TS_4POINT_LOG"
    ws.Tab.Color = MID_BLUE
    headers = ["Timestamp", "Case No.", "C89 axle lines", "D138 split", "E89 trailer X", "Basic angle °", "Slope angle °", "Dynamic angle °", "Dynamic utilisation", "Result", "Rating"]
    for column, value in enumerate(headers, 1):
        ws.Cells(1, column).Value = value
    ws.Range("A1:K1").Interior.Color = NAVY
    ws.Range("A1:K1").Font.Color = WHITE
    ws.Range("A1:K1").Font.Bold = True
    ws.Range("A1:K1").Borders.LineStyle = 1
    ws.Range("A:K").ColumnWidth = 18
    ws.Range("A:A").ColumnWidth = 22
    ws.Rows(1).RowHeight = 22
    ws.Application.ActiveWindow.SplitRow = 1
    ws.Application.ActiveWindow.FreezePanes = True
    return ws


def add_charts(ws):
    # Four-corner outline and combined COG marker.
    data = ws.Range("C9:D12")
    ws.Range("O8").Value = "Plot X"
    ws.Range("P8").Value = "Plot Y"
    for index, source_row in enumerate([9, 10, 11, 12, 9], 9):
        ws.Cells(index, 15).Formula = f"=C{source_row}"
        ws.Cells(index, 16).Formula = f"=D{source_row}"
    chart = ws.Shapes.AddChart2(-1, XL_CHART_XY_SCATTER_LINES_NO_MARKERS, 940, 70, 420, 240).Chart
    chart.HasTitle = True
    chart.ChartTitle.Text = "Four-point hydraulic stability boundary"
    series = chart.SeriesCollection().NewSeries()
    series.Name = "Stability boundary"
    series.XValues = "='4 Point Hydraulics'!$O$9:$O$13"
    series.Values = "='4 Point Hydraulics'!$P$9:$P$13"
    series.Format.Line.ForeColor.RGB = MID_BLUE
    series.Format.Line.Weight = 2.5
    cog = chart.SeriesCollection().NewSeries()
    cog.Name = "=\"Combined COG\""
    cog.XValues = "='4 Point Hydraulics'!$J$6"
    cog.Values = "='4 Point Hydraulics'!$L$6"
    cog.MarkerStyle = XL_MARKER_STYLE_CIRCLE
    cog.MarkerSize = 10
    cog.Format.Line.Visible = MSO_FALSE

    reaction_chart = ws.Shapes.AddChart2(-1, XL_CHART_COLUMN_CLUSTERED, 940, 330, 420, 210).Chart
    reaction_chart.HasTitle = True
    reaction_chart.ChartTitle.Text = "Neutral four-point group load"
    reaction_chart.SetSourceData(ws.Range("A8:A12,H8:H12"))
    reaction_chart.HasLegend = False

    stability_chart = ws.Shapes.AddChart2(-1, XL_CHART_COLUMN_CLUSTERED, 940, 560, 420, 210).Chart
    stability_chart.HasTitle = True
    stability_chart.ChartTitle.Text = "Minimum stability angle against requirement"
    stability_chart.SetSourceData(ws.Range("A51:C54"))
    stability_chart.HasLegend = True
    stability_chart.Legend.Position = XL_LEGEND_POSITION_BOTTOM


def add_command_center_link(workbook):
    try:
        ws = workbook.Worksheets("TS_COMMAND_CENTER")
        shape = ws.Shapes.AddShape(1, 18, 430, 250, 25)
        shape.Name = "TS4P_CommandCenterButton"
        shape.TextFrame2.TextRange.Characters.Text = "OPEN FOUR-POINT HYDRAULICS"
        shape.TextFrame2.TextRange.Font.Size = 9
        shape.TextFrame2.TextRange.Font.Bold = True
        shape.TextFrame2.TextRange.Font.Fill.ForeColor.RGB = WHITE
        shape.Fill.ForeColor.RGB = MID_BLUE
        shape.Line.ForeColor.RGB = WHITE
        shape.OnAction = "TS4P_OPEN"
    except Exception:
        # The dedicated worksheet remains fully usable even if a protected legacy dashboard rejects a new shape.
        pass


def add_control_rows(workbook):
    ws = workbook.Worksheets("TS_CONTROL")
    entries = [
        (102, "Four-point hydraulic system", "AVAILABLE", "v0.8 adds a four-corner convex stability polygon while retaining v0.7 three-point calculations unchanged."),
        (103, "Four-point geometry mode", "AUTO", "AUTO derives rear/right, rear/left, front/left and front/right centres from selected trailer geometry, C89 and D138. MANUAL permits engineering-defined corners."),
        (104, "Four-point reaction method", "EXACT EQUILIBRIUM / BOGIE BALANCED", "The solver satisfies total force and both plan moments exactly, then minimises deviation from active-bogie-proportional reaction share."),
        (105, "Four-point graph workspace", "4 Point Hydraulics", "Contains the hydraulic boundary, COG-case evaluation table, group reaction chart, capacity outputs and four-point optimiser."),
        (106, "Four-point optimiser log", "TS_4POINT_LOG", "Keeps four-point cases separate from the retained v0.7 optimiser log."),
    ]
    for row, left, middle, right in entries:
        ws.Cells(row, 1).Value = left
        ws.Cells(row, 2).Value = middle
        ws.Cells(row, 3).Value = right
    ws.Range("A102:C106").WrapText = True
    ws.Range("A102:C106").Borders.LineStyle = 1
    ws.Range("A102:A106").Font.Bold = True
    ws.Range("A102:C106").Interior.Color = PALE_BLUE
    ws.Rows("102:106").RowHeight = 34


def add_or_replace_vba_module(workbook):
    project = workbook.VBProject
    try:
        project.VBComponents.Remove(project.VBComponents("modTS_FourPoint"))
    except Exception:
        pass
    component = project.VBComponents.Add(1)
    component.Name = "modTS_FourPoint"
    component.CodeModule.AddFromString(VBA_MODULE)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=Path("public/templates/Trailer_Stability_Verification_Template_v0.7.xlsm"))
    parser.add_argument("--output", type=Path, default=Path("outputs/Trailer_Stability_Calculator_Optimiser_v0.8_4Point.xlsm"))
    args = parser.parse_args()
    source = args.source.resolve()
    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    if not source.exists():
        raise SystemExit(f"Source workbook does not exist: {source}")
    if output.exists():
        output.unlink()

    excel = win32.DispatchEx("Excel.Application")
    excel.Visible = False
    excel.DisplayAlerts = False
    excel.ScreenUpdating = False
    old_calculation = None
    workbook = None
    try:
        workbook = excel.Workbooks.Open(str(source), UpdateLinks=0, ReadOnly=False)
        old_calculation = excel.Calculation
        excel.Calculation = XL_CALCULATION_MANUAL
        add_or_replace_vba_module(workbook)
        ws = create_four_point_sheet(workbook)
        create_log_sheet(workbook)
        add_control_rows(workbook)
        add_command_center_link(workbook)
        add_charts(ws)
        excel.Calculation = XL_CALCULATION_AUTOMATIC
        excel.Run("TS4P_INITIALISE")
        excel.CalculateFull()
        workbook.SaveAs(str(output), FileFormat=XL_OPEN_XML_WORKBOOK_MACRO_ENABLED)
        print(f"Built {output}")
    finally:
        if old_calculation is not None:
            excel.Calculation = old_calculation
        if workbook is not None:
            workbook.Close(SaveChanges=False)
        excel.Quit()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
