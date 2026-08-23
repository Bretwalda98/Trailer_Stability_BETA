from __future__ import annotations

import os
import re
import shutil
from pathlib import Path

import pythoncom
import win32com.client


ROOT = Path(__file__).resolve().parents[2]
# The v0.8 template is the in-place four-point baseline.  Rebuild it in place
# so the website and the delivered verification workbook use one asset.
SOURCE = ROOT / "public" / "templates" / "Trailer_Stability_Verification_Template_v0.8_4Point_InPlace.xlsm"
OUTPUT = Path(__file__).resolve().parent / "outputs" / "Trailer_Stability_Calculator_Optimiser_v0.8_4Point_InPlace.xlsm"

XL_UP = -4162
XL_TO_LEFT = -4159
XL_VALIDATE_LIST = 3
XL_VALID_ALERT_STOP = 1
XL_BETWEEN = 1
XL_CALC_MANUAL = -4135
XL_CALC_AUTOMATIC = -4105
XL_OPEN_XML_WORKBOOK_MACRO_ENABLED = 52
MSO_AUTOMATION_SECURITY_FORCE_DISABLE = 3
MSO_AUTOMATION_SECURITY_LOW = 1

# The web arrangement engine permits up to 99 axle lines on a train.  The
# original workbook grid stopped at 66 (E:BR), silently omitting AL 67 onward
# from group, load and spine-beam calculations.  Keep one explicit source of
# truth for every connected workbook range.
MAX_AXLE_LINES = 99
AXLE_GROUP_FIRST_COL = 5  # E
AXLE_GROUP_LAST_COL = AXLE_GROUP_FIRST_COL + MAX_AXLE_LINES - 1  # CY
AXLE_EXISTENCE_FIRST_COL = 4  # D
AXLE_EXISTENCE_LAST_COL = AXLE_EXISTENCE_FIRST_COL + MAX_AXLE_LINES - 1  # CX
AXLE_LOAD_FIRST_COL = 3  # C
AXLE_LOAD_LAST_COL = AXLE_LOAD_FIRST_COL + MAX_AXLE_LINES - 1  # CW
LEGACY_AXLE_GROUP_LAST_COL = 70  # BR / AL 66
LEGACY_AXLE_EXISTENCE_LAST_COL = 69  # BQ / AL 66
LEGACY_AXLE_LOAD_LAST_COL = 68  # BP / AL 66
SPINE_PLOT_FIRST_COL = 7  # G
SPINE_PLOT_LAST_COL = SPINE_PLOT_FIRST_COL + MAX_AXLE_LINES * 3 - 1  # KQ


VBA_HYDRAULICS = r'''Option Explicit

Private Const TSH_EPS As Double = 0.00000001
Private Const TSH_PI As Double = 3.14159265358979

Private Function TSH_Dbl(ByVal value As Variant, Optional ByVal fallback As Double = 0#) As Double
    On Error GoTo Failed
    If IsError(value) Or IsEmpty(value) Or Not IsNumeric(value) Then GoTo Failed
    TSH_Dbl = CDbl(value)
    Exit Function
Failed:
    TSH_Dbl = fallback
End Function

Private Function TSH_ModeCount(ByVal modeValue As Variant) As Long
    If InStr(1, UCase$(Trim$(CStr(modeValue))), "4", vbTextCompare) > 0 Then
        TSH_ModeCount = 4
    Else
        TSH_ModeCount = 3
    End If
End Function

Private Function TSH_Angle(ByVal y As Double, ByVal x As Double) As Double
    If Abs(x) <= TSH_EPS Then
        If y >= 0# Then TSH_Angle = TSH_PI / 2# Else TSH_Angle = -TSH_PI / 2#
    Else
        TSH_Angle = Atn(y / x)
        If x < 0# Then
            If y >= 0# Then TSH_Angle = TSH_Angle + TSH_PI Else TSH_Angle = TSH_Angle - TSH_PI
        End If
    End If
End Function

Private Function TSH_Cross(ByVal ax As Double, ByVal ay As Double, ByVal bx As Double, ByVal by As Double, ByVal px As Double, ByVal py As Double) As Double
    TSH_Cross = (bx - ax) * (py - ay) - (by - ay) * (px - ax)
End Function

Private Sub TSH_LoadSortedPoints(ByRef x() As Double, ByRef y() As Double, ByRef ids() As Long, ByVal modeValue As Variant, _
    ByVal x1 As Variant, ByVal y1 As Variant, ByVal x2 As Variant, ByVal y2 As Variant, _
    ByVal x3 As Variant, ByVal y3 As Variant, ByVal x4 As Variant, ByVal y4 As Variant, ByRef pointCount As Long)
    Dim cx As Double, cy As Double, a(1 To 4) As Double
    Dim i As Long, j As Long, tx As Double, ty As Double, ta As Double, ti As Long
    pointCount = TSH_ModeCount(modeValue)
    x(1) = TSH_Dbl(x1): y(1) = TSH_Dbl(y1): ids(1) = 1
    x(2) = TSH_Dbl(x2): y(2) = TSH_Dbl(y2): ids(2) = 2
    x(3) = TSH_Dbl(x3): y(3) = TSH_Dbl(y3): ids(3) = 3
    If pointCount = 4 Then x(4) = TSH_Dbl(x4): y(4) = TSH_Dbl(y4): ids(4) = 4
    For i = 1 To pointCount: cx = cx + x(i): cy = cy + y(i): Next i
    cx = cx / pointCount: cy = cy / pointCount
    For i = 1 To pointCount: a(i) = TSH_Angle(y(i) - cy, x(i) - cx): Next i
    For i = 1 To pointCount - 1
        For j = i + 1 To pointCount
            If a(j) < a(i) Then
                ta = a(i): a(i) = a(j): a(j) = ta
                tx = x(i): x(i) = x(j): x(j) = tx
                ty = y(i): y(i) = y(j): y(j) = ty
                ti = ids(i): ids(i) = ids(j): ids(j) = ti
            End If
        Next j
    Next i
End Sub

Private Function TSH_Solve3(ByRef matrix() As Double, ByRef rhs() As Double, ByRef result() As Double) As Boolean
    Dim a(1 To 3, 1 To 4) As Double, pivot As Long, r As Long, c As Long
    Dim best As Double, factor As Double, temp As Double, k As Long
    For r = 1 To 3
        For c = 1 To 3: a(r, c) = matrix(r, c): Next c
        a(r, 4) = rhs(r)
    Next r
    For c = 1 To 3
        pivot = c: best = Abs(a(c, c))
        For r = c + 1 To 3
            If Abs(a(r, c)) > best Then pivot = r: best = Abs(a(r, c))
        Next r
        If best <= TSH_EPS Then Exit Function
        If pivot <> c Then
            For k = c To 4
                temp = a(c, k): a(c, k) = a(pivot, k): a(pivot, k) = temp
            Next k
        End If
        factor = a(c, c)
        For k = c To 4: a(c, k) = a(c, k) / factor: Next k
        For r = 1 To 3
            If r <> c Then
                factor = a(r, c)
                For k = c To 4: a(r, k) = a(r, k) - factor * a(c, k): Next k
            End If
        Next r
    Next c
    For r = 1 To 3: result(r) = a(r, 4): Next r
    TSH_Solve3 = True
End Function

Private Function TSH_Reactions(ByVal cogX As Double, ByVal cogY As Double, ByRef x() As Double, ByRef y() As Double, ByRef n() As Double, ByVal pointCount As Long) As Variant
    Dim target(1 To 4) As Double, weight(1 To 4) As Double, lambda(1 To 3) As Double
    Dim matrix(1 To 3, 1 To 3) As Double, rhs(1 To 3) As Double, rv(1 To 3, 1 To 4) As Double
    Dim result(1 To 4) As Double, moment(1 To 3) As Double, total As Double
    Dim i As Long, j As Long, k As Long
    For i = 1 To pointCount
        If n(i) <= TSH_EPS Then Exit Function
        total = total + n(i)
        rv(1, i) = x(i): rv(2, i) = y(i): rv(3, i) = 1#
    Next i
    If total <= TSH_EPS Then Exit Function
    For i = 1 To pointCount
        target(i) = n(i) / total
        weight(i) = n(i) * n(i)
    Next i
    For i = 1 To 3
        For k = 1 To pointCount: moment(i) = moment(i) + rv(i, k) * target(k): Next k
    Next i
    rhs(1) = cogX - moment(1): rhs(2) = cogY - moment(2): rhs(3) = 1# - moment(3)
    For i = 1 To 3
        For j = 1 To 3
            For k = 1 To pointCount: matrix(i, j) = matrix(i, j) + weight(k) * rv(i, k) * rv(j, k): Next k
        Next j
    Next i
    If Not TSH_Solve3(matrix, rhs, lambda) Then Exit Function
    For i = 1 To pointCount
        result(i) = target(i) + weight(i) * (x(i) * lambda(1) + y(i) * lambda(2) + lambda(3))
    Next i
    TSH_Reactions = result
End Function

Public Function TS_HYD_GROUP_COUNT(ByVal groupIndex As Variant, ByVal groupsRange As Range, ByVal coordinateRange As Range) As Variant
    Dim r As Long, c As Long, countValue As Long
    If groupsRange.Rows.count <> coordinateRange.Rows.count Or groupsRange.Columns.count <> coordinateRange.Columns.count Then
        TS_HYD_GROUP_COUNT = CVErr(xlErrRef): Exit Function
    End If
    For r = 1 To groupsRange.Rows.count
        For c = 1 To groupsRange.Columns.count
            If TSH_Dbl(groupsRange.Cells(r, c).Value2, -999#) = TSH_Dbl(groupIndex, -998#) Then
                If Not IsError(coordinateRange.Cells(r, c).Value2) And IsNumeric(coordinateRange.Cells(r, c).Value2) Then countValue = countValue + 1
            End If
        Next c
    Next r
    TS_HYD_GROUP_COUNT = countValue
End Function

Public Function TS_HYD_GROUP_CENTRE(ByVal groupIndex As Variant, ByVal groupsRange As Range, ByVal coordinateRange As Range) As Variant
    Dim r As Long, c As Long, countValue As Long, totalValue As Double, v As Variant
    If groupsRange.Rows.count <> coordinateRange.Rows.count Or groupsRange.Columns.count <> coordinateRange.Columns.count Then
        TS_HYD_GROUP_CENTRE = CVErr(xlErrRef): Exit Function
    End If
    For r = 1 To groupsRange.Rows.count
        For c = 1 To groupsRange.Columns.count
            If TSH_Dbl(groupsRange.Cells(r, c).Value2, -999#) = TSH_Dbl(groupIndex, -998#) Then
                v = coordinateRange.Cells(r, c).Value2
                If Not IsError(v) And IsNumeric(v) Then totalValue = totalValue + CDbl(v): countValue = countValue + 1
            End If
        Next c
    Next r
    If countValue = 0 Then TS_HYD_GROUP_CENTRE = CVErr(xlErrNA) Else TS_HYD_GROUP_CENTRE = totalValue / countValue
End Function

Public Function TS_HYD_REACTION(ByVal groupIndex As Variant, ByVal cogX As Variant, ByVal cogY As Variant, _
    ByVal x1 As Variant, ByVal y1 As Variant, ByVal n1 As Variant, ByVal x2 As Variant, ByVal y2 As Variant, ByVal n2 As Variant, _
    ByVal x3 As Variant, ByVal y3 As Variant, ByVal n3 As Variant, ByVal x4 As Variant, ByVal y4 As Variant, ByVal n4 As Variant, ByVal modeValue As Variant) As Variant
    Dim x(1 To 4) As Double, y(1 To 4) As Double, n(1 To 4) As Double, reactions As Variant, m As Long, idx As Long
    m = TSH_ModeCount(modeValue): idx = CLng(TSH_Dbl(groupIndex))
    x(1) = TSH_Dbl(x1): y(1) = TSH_Dbl(y1): n(1) = TSH_Dbl(n1)
    x(2) = TSH_Dbl(x2): y(2) = TSH_Dbl(y2): n(2) = TSH_Dbl(n2)
    x(3) = TSH_Dbl(x3): y(3) = TSH_Dbl(y3): n(3) = TSH_Dbl(n3)
    If m = 4 Then x(4) = TSH_Dbl(x4): y(4) = TSH_Dbl(y4): n(4) = TSH_Dbl(n4)
    If idx < 1 Or idx > m Then TS_HYD_REACTION = CVErr(xlErrNA): Exit Function
    reactions = TSH_Reactions(TSH_Dbl(cogX), TSH_Dbl(cogY), x, y, n, m)
    If IsEmpty(reactions) Then TS_HYD_REACTION = CVErr(xlErrNum) Else TS_HYD_REACTION = reactions(idx)
End Function

Public Function TS_HYD_POLYGON_VALID(ByVal x1 As Variant, ByVal y1 As Variant, ByVal x2 As Variant, ByVal y2 As Variant, _
    ByVal x3 As Variant, ByVal y3 As Variant, ByVal x4 As Variant, ByVal y4 As Variant, ByVal modeValue As Variant) As Boolean
    Dim x(1 To 4) As Double, y(1 To 4) As Double, ids(1 To 4) As Long, m As Long, i As Long, j As Long, area2 As Double
    TSH_LoadSortedPoints x, y, ids, modeValue, x1, y1, x2, y2, x3, y3, x4, y4, m
    For i = 1 To m: j = i Mod m + 1: area2 = area2 + x(i) * y(j) - x(j) * y(i): Next i
    TS_HYD_POLYGON_VALID = Abs(area2) > TSH_EPS
End Function

Public Function TS_HYD_INSIDE(ByVal px As Variant, ByVal py As Variant, ByVal x1 As Variant, ByVal y1 As Variant, _
    ByVal x2 As Variant, ByVal y2 As Variant, ByVal x3 As Variant, ByVal y3 As Variant, _
    ByVal x4 As Variant, ByVal y4 As Variant, ByVal modeValue As Variant) As Boolean
    Dim x(1 To 4) As Double, y(1 To 4) As Double, ids(1 To 4) As Long, m As Long, i As Long, j As Long
    Dim crossValue As Double, signValue As Double, qx As Double, qy As Double
    TSH_LoadSortedPoints x, y, ids, modeValue, x1, y1, x2, y2, x3, y3, x4, y4, m
    If Not TS_HYD_POLYGON_VALID(x1, y1, x2, y2, x3, y3, x4, y4, modeValue) Then Exit Function
    qx = TSH_Dbl(px): qy = TSH_Dbl(py)
    For i = 1 To m
        j = i Mod m + 1: crossValue = TSH_Cross(x(i), y(i), x(j), y(j), qx, qy)
        If Abs(crossValue) > TSH_EPS Then
            If signValue = 0# Then signValue = Sgn(crossValue) Else If Sgn(crossValue) <> Sgn(signValue) Then Exit Function
        End If
    Next i
    TS_HYD_INSIDE = True
End Function

Public Function TS_HYD_EDGE_DISTANCE(ByVal edgeIndex As Variant, ByVal px As Variant, ByVal py As Variant, _
    ByVal x1 As Variant, ByVal y1 As Variant, ByVal x2 As Variant, ByVal y2 As Variant, ByVal x3 As Variant, ByVal y3 As Variant, _
    ByVal x4 As Variant, ByVal y4 As Variant, ByVal modeValue As Variant) As Variant
    Dim x(1 To 4) As Double, y(1 To 4) As Double, ids(1 To 4) As Long, m As Long, i As Long, j As Long, den As Double
    TSH_LoadSortedPoints x, y, ids, modeValue, x1, y1, x2, y2, x3, y3, x4, y4, m
    i = CLng(TSH_Dbl(edgeIndex)): If i < 1 Or i > m Then TS_HYD_EDGE_DISTANCE = CVErr(xlErrNA): Exit Function
    j = i Mod m + 1: den = Sqr((x(j) - x(i)) ^ 2 + (y(j) - y(i)) ^ 2)
    If den <= TSH_EPS Then TS_HYD_EDGE_DISTANCE = CVErr(xlErrNum) Else TS_HYD_EDGE_DISTANCE = Abs(TSH_Cross(x(i), y(i), x(j), y(j), TSH_Dbl(px), TSH_Dbl(py))) / den
End Function

Public Function TS_HYD_MIN_DISTANCE(ByVal px As Variant, ByVal py As Variant, ByVal x1 As Variant, ByVal y1 As Variant, _
    ByVal x2 As Variant, ByVal y2 As Variant, ByVal x3 As Variant, ByVal y3 As Variant, _
    ByVal x4 As Variant, ByVal y4 As Variant, ByVal modeValue As Variant) As Variant
    Dim i As Long, m As Long, d As Variant, minimum As Double
    m = TSH_ModeCount(modeValue)
    For i = 1 To m
        d = TS_HYD_EDGE_DISTANCE(i, px, py, x1, y1, x2, y2, x3, y3, x4, y4, modeValue)
        If IsError(d) Then TS_HYD_MIN_DISTANCE = d: Exit Function
        If i = 1 Or CDbl(d) < minimum Then minimum = CDbl(d)
    Next i
    If TS_HYD_INSIDE(px, py, x1, y1, x2, y2, x3, y3, x4, y4, modeValue) Then TS_HYD_MIN_DISTANCE = minimum Else TS_HYD_MIN_DISTANCE = -minimum
End Function

Public Function TS_HYD_BOUNDARY_X(ByVal sequenceIndex As Variant, ByVal x1 As Variant, ByVal y1 As Variant, _
    ByVal x2 As Variant, ByVal y2 As Variant, ByVal x3 As Variant, ByVal y3 As Variant, _
    ByVal x4 As Variant, ByVal y4 As Variant, ByVal modeValue As Variant) As Variant
    Dim x(1 To 4) As Double, y(1 To 4) As Double, ids(1 To 4) As Long, m As Long, i As Long
    TSH_LoadSortedPoints x, y, ids, modeValue, x1, y1, x2, y2, x3, y3, x4, y4, m
    i = CLng(TSH_Dbl(sequenceIndex)): If i = m + 1 Then i = 1
    If i < 1 Or i > m Then TS_HYD_BOUNDARY_X = CVErr(xlErrNA) Else TS_HYD_BOUNDARY_X = x(i)
End Function

Public Function TS_HYD_BOUNDARY_Y(ByVal sequenceIndex As Variant, ByVal x1 As Variant, ByVal y1 As Variant, _
    ByVal x2 As Variant, ByVal y2 As Variant, ByVal x3 As Variant, ByVal y3 As Variant, _
    ByVal x4 As Variant, ByVal y4 As Variant, ByVal modeValue As Variant) As Variant
    Dim x(1 To 4) As Double, y(1 To 4) As Double, ids(1 To 4) As Long, m As Long, i As Long
    TSH_LoadSortedPoints x, y, ids, modeValue, x1, y1, x2, y2, x3, y3, x4, y4, m
    i = CLng(TSH_Dbl(sequenceIndex)): If i = m + 1 Then i = 1
    If i < 1 Or i > m Then TS_HYD_BOUNDARY_Y = CVErr(xlErrNA) Else TS_HYD_BOUNDARY_Y = y(i)
End Function

Private Function TSH_XSection(ByVal wantRight As Boolean, ByVal targetY As Double, ByVal x1 As Variant, ByVal y1 As Variant, _
    ByVal x2 As Variant, ByVal y2 As Variant, ByVal x3 As Variant, ByVal y3 As Variant, _
    ByVal x4 As Variant, ByVal y4 As Variant, ByVal modeValue As Variant) As Variant
    Dim x(1 To 4) As Double, y(1 To 4) As Double, ids(1 To 4) As Long, hits(1 To 8) As Double
    Dim m As Long, i As Long, j As Long, k As Long, hitCount As Long, t As Double, xi As Double, duplicate As Boolean
    TSH_LoadSortedPoints x, y, ids, modeValue, x1, y1, x2, y2, x3, y3, x4, y4, m
    For i = 1 To m
        j = i Mod m + 1
        If Abs(y(j) - y(i)) <= TSH_EPS Then
            If Abs(targetY - y(i)) <= TSH_EPS Then
                hits(hitCount + 1) = x(i): hitCount = hitCount + 1
                hits(hitCount + 1) = x(j): hitCount = hitCount + 1
            End If
        ElseIf targetY >= Application.Min(y(i), y(j)) - TSH_EPS And targetY <= Application.Max(y(i), y(j)) + TSH_EPS Then
            t = (targetY - y(i)) / (y(j) - y(i))
            If t >= -TSH_EPS And t <= 1# + TSH_EPS Then
                xi = x(i) + t * (x(j) - x(i)): duplicate = False
                For k = 1 To hitCount: If Abs(hits(k) - xi) <= TSH_EPS Then duplicate = True
                Next k
                If Not duplicate Then hitCount = hitCount + 1: hits(hitCount) = xi
            End If
        End If
    Next i
    If hitCount < 2 Then TSH_XSection = CVErr(xlErrNA): Exit Function
    xi = hits(1)
    For i = 2 To hitCount
        If wantRight Then
            If hits(i) > xi Then xi = hits(i)
        Else
            If hits(i) < xi Then xi = hits(i)
        End If
    Next i
    TSH_XSection = xi
End Function

Public Function TS_HYD_XSECTION_LEFT(ByVal targetY As Variant, ByVal x1 As Variant, ByVal y1 As Variant, _
    ByVal x2 As Variant, ByVal y2 As Variant, ByVal x3 As Variant, ByVal y3 As Variant, _
    ByVal x4 As Variant, ByVal y4 As Variant, ByVal modeValue As Variant) As Variant
    TS_HYD_XSECTION_LEFT = TSH_XSection(False, TSH_Dbl(targetY), x1, y1, x2, y2, x3, y3, x4, y4, modeValue)
End Function

Public Function TS_HYD_XSECTION_RIGHT(ByVal targetY As Variant, ByVal x1 As Variant, ByVal y1 As Variant, _
    ByVal x2 As Variant, ByVal y2 As Variant, ByVal x3 As Variant, ByVal y3 As Variant, _
    ByVal x4 As Variant, ByVal y4 As Variant, ByVal modeValue As Variant) As Variant
    TS_HYD_XSECTION_RIGHT = TSH_XSection(True, TSH_Dbl(targetY), x1, y1, x2, y2, x3, y3, x4, y4, modeValue)
End Function

Public Function PlotAxleLoadsG4(PLoads As Variant, Groups As Variant) As Variant
    Dim PlotData() As Variant, PldRows As Long, GRows As Long, i As Long, j As Long, count4 As Long, position4 As Long, PlotRows As Long
    PLoads = EndDown(PLoads, PldRows): Groups = EndDown(Groups, GRows)
    For i = 1 To GRows: If Groups(i, 1) = 4 Then count4 = count4 + 1
    Next i
    PlotRows = Application.Max(3, 3 * count4): ReDim PlotData(1 To PlotRows, 1 To 2)
    For i = 1 To PldRows
        If Groups(i, 1) = 4 Then
            position4 = position4 + 1: j = (position4 - 1) * 3
            PlotData(j + 1, 1) = PLoads(i, 1): PlotData(j + 1, 2) = 0
            PlotData(j + 2, 1) = PLoads(i, 1): PlotData(j + 2, 2) = PLoads(i, 2)
            PlotData(j + 3, 1) = PLoads(i, 1): PlotData(j + 3, 2) = 0
        End If
    Next i
    For i = 3 * position4 + 1 To PlotRows
        If IsEmpty(PlotData(i, 1)) Then PlotData(i, 1) = CVErr(xlErrNA): PlotData(i, 2) = CVErr(xlErrNA)
    Next i
    PlotAxleLoadsG4 = PlotData
End Function
'''


def col_letter(n: int) -> str:
    out = ""
    while n:
        n, rem = divmod(n - 1, 26)
        out = chr(65 + rem) + out
    return out


def module_text(component) -> str:
    cm = component.CodeModule
    return cm.Lines(1, cm.CountOfLines) if cm.CountOfLines else ""


def set_module_text(component, text: str) -> None:
    cm = component.CodeModule
    if cm.CountOfLines:
        cm.DeleteLines(1, cm.CountOfLines)
    cm.AddFromString(text)


def replace_function(text: str, function_name: str, replacement: str) -> str:
    pattern = re.compile(
        rf"(?ims)^\s*(?:Private\s+|Public\s+)?Function\s+{re.escape(function_name)}\b.*?^\s*End\s+Function\s*$"
    )
    new_text, count = pattern.subn(replacement.strip(), text, count=1)
    if count != 1:
        raise RuntimeError(f"Could not uniquely replace VBA function {function_name}; matches={count}")
    return new_text


LEGACY_OPTIMISER_SHEETS = (
    "TS_COMMAND_CENTER",
    "TS_CONTROL",
    "TS_OPTIMISER_LOG",
    "TS_LIVE_FEED",
    "TS_RUN_ACTIVITY_LOG",
)

LEGACY_OPTIMISER_MODULES = (
    "modTS_Common",
    "modTS_Acceleration",
    "modTS_Progress",
    "modTS_BeamOptimiser",
    "modTS_CommandCenter",
    "modTS_Setup",
    "modTS_Optimiser",
    "modTS_Spinebeam",
)


def strip_legacy_optimiser_assets(workbook) -> None:
    """Remove the workbook-only optimiser; the web app owns optimisation.

    The retained workbook is a calculation/verification deliverable.  Keeping
    the old command centre and event logs made its purpose ambiguous and
    retained VBA paths that are no longer supported by the web export.
    """
    workbook.Worksheets("Load and Stability Calculation").Activate()
    for sheet_name in LEGACY_OPTIMISER_SHEETS:
        try:
            sheet = workbook.Worksheets(sheet_name)
            # Excel will not delete a hidden sheet directly in some builds.
            # Make it visible only for the deletion transaction.
            sheet.Visible = -1
            sheet.Delete()
        except Exception as error:
            # A missing sheet is harmless; a deletion failure is not.  Failing
            # here prevents accidental delivery of a workbook with legacy
            # optimiser UI/logging still embedded.
            if sheet_name in {workbook.Worksheets(i).Name for i in range(1, workbook.Worksheets.Count + 1)}:
                raise RuntimeError(f"Could not remove legacy optimiser sheet {sheet_name}: {error}") from error

    project = workbook.VBProject
    for module_name in LEGACY_OPTIMISER_MODULES:
        try:
            project.VBComponents.Remove(project.VBComponents(module_name))
        except Exception:
            pass


def add_hydraulic_module(workbook) -> None:
    project = workbook.VBProject
    try:
        project.VBComponents.Remove(project.VBComponents("modTS_HydraulicBoundary"))
    except Exception:
        pass
    component = project.VBComponents.Add(1)
    component.Name = "modTS_HydraulicBoundary"
    component.CodeModule.AddFromString(VBA_HYDRAULICS)


def hyd_reaction(group: int, x_cell: str, y_cell: str) -> str:
    return (
        f"TS_HYD_REACTION({group},{x_cell},{y_cell},"
        "$K$151,$M$151,$H$151,$K$152,$M$152,$H$152,$K$153,$M$153,$H$153,$K$154,$M$154,$H$154,$D$133)"
    )


def hyd_min_distance(x_cell: str, y_cell: str, main_prefix: str = "'Load and Stability Calculation'!") -> str:
    p = main_prefix
    return (
        f"TS_HYD_MIN_DISTANCE({x_cell},{y_cell},{p}$K$151,{p}$M$151,{p}$K$152,{p}$M$152,"
        f"{p}$K$153,{p}$M$153,{p}$K$154,{p}$M$154,{p}$D$133)"
    )


def qualify_main_refs(formula_fragment: str) -> str:
    return re.sub(r"(?<![A-Za-z0-9_!'])(\$[A-Z]+\$\d+)", r"'Load and Stability Calculation'!\1", formula_fragment)


def set_validation_list(cell, values: str) -> None:
    try:
        cell.Validation.Delete()
    except Exception:
        pass
    cell.Validation.Add(Type=XL_VALIDATE_LIST, AlertStyle=XL_VALID_ALERT_STOP, Operator=XL_BETWEEN, Formula1=values)
    cell.Validation.IgnoreBlank = False
    cell.Validation.InCellDropdown = True
    cell.Validation.ShowError = True


def patch_main_sheet(workbook) -> None:
    ws = workbook.Worksheets("Load and Stability Calculation")

    # Existing-sheet selector; no new calculation sheet is introduced.
    ws.Range("B133:C133").Merge()
    ws.Range("B133").Value = "Hydraulic stability system"
    ws.Range("B133:C133").Font.Bold = True
    ws.Range("D133").Value = "3-point"
    ws.Range("D138").Copy()
    ws.Range("D133").PasteSpecial(-4122)  # formats
    set_validation_list(ws.Range("D133"), "3-point,4-point")
    ws.Range("E133:H133").Merge()
    ws.Range("E133").Formula = '=IF($D$133="4-point",IF(AND(COUNTIF($B$138:$C$161,1)>0,COUNTIF($B$138:$C$161,2)>0,COUNTIF($B$138:$C$161,3)>0,COUNTIF($B$138:$C$161,4)>0,TS_HYD_POLYGON_VALID($K$151,$M$151,$K$152,$M$152,$K$153,$M$153,$K$154,$M$154,$D$133)),"Four-point boundary active","FOUR-POINT SETUP INCOMPLETE"),IF(COUNTIF($B$138:$C$161,4)>0,"GROUP 4 IGNORED IN 3-POINT MODE","Three-point boundary active"))'
    ws.Range("E133").Font.Bold = True
    ws.Range("E133").HorizontalAlignment = -4108
    for rng in ("B138:B161", "C138:C161"):
        set_validation_list(ws.Range(rng), "1,2,3,4")

    # Fourth group summary in the current group table.
    ws.Range("F153:N153").Copy()
    ws.Range("F154:N154").PasteSpecial(-4122)
    ws.Range("F154").Value = "Group 4"
    ws.Range("H154").Formula = '=IF($D$133="4-point",TS_HYD_GROUP_COUNT(4,\'Bogie Group\'!$E$3:$CY$26,\'Bogie coord-exist\'!$E$3:$CY$26),0)'
    ws.Range("G154").Formula = "=H154/2"
    ws.Range("K154").Formula = '=IF($D$133="4-point",TS_HYD_GROUP_CENTRE(4,\'Bogie Group\'!$E$3:$CY$26,\'Bogie coord-exist\'!$E$3:$CY$26),"")'
    ws.Range("M154").Formula = '=IF($D$133="4-point",TS_HYD_GROUP_CENTRE(4,\'Bogie Group\'!$E$3:$CY$26,\'Bogie coord-exist\'!$E$29:$CY$52),"")'
    ws.Range("I154").Formula = f'=IF($D$133="4-point",Mnettotpppin*{hyd_reaction(4,"$H$163","$I$163")},0)'
    ws.Range("N162").Value = "Group 4"
    ws.Range("M162").Copy()
    ws.Range("N162:N167").PasteSpecial(-4122)
    ws.Range("N162").Value = "Group 4"
    for row in range(163, 168):
        for group, col in enumerate(("K", "L", "M"), 1):
            old = ws.Range(f"{col}{row}").Formula
            ws.Range(f"{col}{row}").Formula = f'=IF($D$133="4-point",Mnettotpppin*{hyd_reaction(group,f"$H${row}",f"$I${row}")}/$G${150+group},{old[1:]})'
        ws.Range(f"N{row}").Formula = f'=IF($D$133="4-point",Mnettotpppin*{hyd_reaction(4,f"$H${row}",f"$I${row}")}/$G$154,"")'
    for group, row in enumerate(range(151, 154), 1):
        old = ws.Range(f"I{row}").Formula
        ws.Range(f"I{row}").Formula = f'=IF($D$133="4-point",Mnettotpppin*{hyd_reaction(group,"$H$163","$I$163")},{old[1:]})'
    ws.Range("J159").Formula = '=IF(TS_HYD_INSIDE($L$158,$M$158,$K$151,$M$151,$K$152,$M$152,$K$153,$M$153,$K$154,$M$154,$D$133),"","!! WARNING: NET COG FALLS OUTSIDE STABILITY BOUNDARY !!")'

    # Names used by legacy formulas and new four-point formulas.
    for name, ref in {"G4X": "K154", "G4Y": "M154", "bogies4": "H154"}.items():
        try:
            workbook.Names(name).Delete()
        except Exception:
            pass
        workbook.Names.Add(Name=name, RefersTo=f"='{ws.Name}'!${ref[0]}${ref[1:]}")

    # Static tipping: the existing tables calculate against the active sorted polygon.
    mode_args = "$K$151,$M$151,$K$152,$M$152,$K$153,$M$153,$K$154,$M$154,$D$133"
    for row in range(232, 237):
        cargo_x, cargo_y = f"$S${row+1}", f"$T${row+1}"
        combined_x, combined_y = f"$V${row+1}", f"$W${row+1}"
        old_cargo_angle = ws.Range(f"G{row}").Formula
        old_combined_angle = ws.Range(f"M{row}").Formula
        for edge, col in enumerate(("D", "E", "F"), 1):
            old_distance = ws.Range(f"{col}{row}").Formula
            ws.Range(f"{col}{row}").Formula = f'=IF($D$133="4-point",TS_HYD_EDGE_DISTANCE({edge},{cargo_x},{cargo_y},{mode_args}),{old_distance[1:]})'
        for edge, col in enumerate(("J", "K", "L"), 1):
            old_distance = ws.Range(f"{col}{row}").Formula
            ws.Range(f"{col}{row}").Formula = f'=IF($D$133="4-point",TS_HYD_EDGE_DISTANCE({edge},{combined_x},{combined_y},{mode_args}),{old_distance[1:]})'
        ws.Range(f"G{row}").Formula = f'=IF($D$133="4-point",DEGREES(ATAN2($F$229,ABS(TS_HYD_MIN_DISTANCE({cargo_x},{cargo_y},{mode_args})))),{old_cargo_angle[1:]})'
        ws.Range(f"M{row}").Formula = f'=IF($D$133="4-point",DEGREES(ATAN2($L$229,ABS(TS_HYD_MIN_DISTANCE({combined_x},{combined_y},{mode_args})))),{old_combined_angle[1:]})'
    for col, edge in zip(("D", "E", "F"), range(1, 4)):
        ws.Range(f"{col}231").Value = f"Edge {edge}"
    for col, edge in zip(("J", "K", "L"), range(1, 4)):
        ws.Range(f"{col}231").Value = f"Edge {edge}"

    # Static capacity overview: keep legacy columns and add G4 in the existing spare O:P/Q columns.
    for col in ("Q",):
        ws.Range(f"{col}247:{col}258").Copy(ws.Range("AA247"))
        ws.Range(f"{col}247:{col}258").ClearContents()
    ws.Range("O242:P266").ClearContents()
    ws.Range("I242:J266").Copy()
    ws.Range("O242:P266").PasteSpecial(-4122)
    ws.Range("O242").Value = "Group 4:"
    ws.Range("O243").Formula = '=IF($D$133="4-point",$B$89,"Inactive")'
    ws.Range("O244").Formula = '=IF($D$133="4-point",VLOOKUP(O243,TrailerDataLookup,6,FALSE),0)'
    ws.Range("O245").Formula = '=IF($D$133="4-point",O244/2,0)'
    ws.Range("O246").Formula = '=IF($D$133="4-point",VLOOKUP(O243,TrailerDataLookup,5,FALSE),0)'
    ws.Range("O249").Formula = '=IF($D$133="4-point",bogies4,0)'
    ws.Range("D249").Formula = "=SUM(H151:H154)"
    components = ((252, "Mcargo", "COGcargoX", "COGcargoY"), (253, "Mgrill", "COGgrillX", "COGgrillY"), (254, "Mpp", "COGppX", "COGppY"), (255, "Mnetpin", "COGnetpinX", "COGnetpinY"))
    legacy_cols = ((1, "E"), (2, "G"), (3, "I"))
    for row, mass, cx, cy in components:
        for group, col in legacy_cols:
            old = ws.Range(f"{col}{row}").Formula
            ws.Range(f"{col}{row}").Formula = f'=IF($D$133="4-point",{mass}*{hyd_reaction(group,cx,cy)},{old[1:]})'
        ws.Range(f"O{row}").Formula = f'=IF($D$133="4-point",{mass}*{hyd_reaction(4,cx,cy)},0)'
    ws.Range("O256").Formula = "=SUM(O252:O255)"
    ws.Range("O257").Formula = '=IF($D$133="4-point",O249*O246/2,0)'
    ws.Range("O258").Formula = "=I154+O257"
    ws.Range("O261").Value = "N"
    ws.Range("P261").Value = "MAX E"
    ws.Range("O262").Formula = '=IF($D$133="4-point",N163,"")'
    ws.Range("P262").Formula = '=IF($D$133="4-point",MAX(N163:N167),"")'
    ws.Range("O263").Formula = '=IF($D$133="4-point",O262+O246,"")'
    ws.Range("P263").Formula = '=IF($D$133="4-point",P262+O246,"")'
    ws.Range("O264").Formula = '=IF($D$133="4-point",O263/2,"")'
    ws.Range("P264").Formula = '=IF($D$133="4-point",P263/2,"")'
    ws.Range("O265").Formula = '=IF($D$133="4-point",O264/O245,"")'
    ws.Range("P265").Formula = '=IF($D$133="4-point",P264/O245,"")'
    ws.Range("O266").Formula = '=IF($D$133="4-point",IFERROR(I266*O263/I263,0),"")'
    ws.Range("Q261").Value = "Group 4"
    for idx, row in enumerate(range(262, 267), 163):
        ws.Range(f"Q{row}").Formula = f'=IF($D$133="4-point",((N{idx}+$O$246)/2-VLOOKUP($O$243,TrailerDataLookup,22,FALSE))*VLOOKUP($O$243,TrailerDataLookup,21,FALSE),"")'

    # Slope and dynamic result rows use existing result blocks and spare rows.
    slope = workbook.Worksheets("Slope effect COG")
    for row in list(range(58, 70)) + list(range(72, 84)) + list(range(87, 99)):
        old = slope.Range(f"H{row}").Formula
        slope.Range(f"H{row}").Formula = f'=IF(\'Load and Stability Calculation\'!$D$133="4-point",{hyd_min_distance(f"C{row}",f"D{row}")},{old[1:]})'
    slope.Range("W86").Formula = "=MAX(W87:W98)"
    slope.Range("X86").Formula = "=VLOOKUP(W86,W87:X98,2,FALSE)"
    slope.Range("Y86").Formula = "=VLOOKUP(X86,$B$87:$D$98,2,FALSE)"
    slope.Range("Z86").Formula = "=VLOOKUP(X86,$B$87:$D$98,3,FALSE)"
    slope.Range("W86").Offset(0, -1).Value = "G4 [t]"
    for row in range(87, 99):
        for group, col in enumerate(("N", "O", "P"), 1):
            old = slope.Range(f"{col}{row}").Formula
            call = qualify_main_refs(hyd_reaction(group, f"C{row}", f"D{row}"))
            slope.Range(f"{col}{row}").Formula = f'=IF(\'Load and Stability Calculation\'!$D$133="4-point",Mall*{call},{old[1:]})'
        call4 = qualify_main_refs(hyd_reaction(4, f"C{row}", f"D{row}"))
        slope.Range(f"W{row}").Formula = f'=IF(\'Load and Stability Calculation\'!$D$133="4-point",Mall*{call4},NA())'
        slope.Range(f"X{row}").Formula = f"=I{row}"
    ws.Range("B308:I308").ClearContents()
    ws.Range("B304:I304").Copy()
    ws.Range("B308:I308").PasteSpecial(-4122)
    ws.Range("B308").Formula = '=IF($D$133="4-point","Worst case group 4","")'
    ws.Range("C308").Formula = '=IF($D$133="4-point",\'Slope effect COG\'!Y86,"")'
    ws.Range("D308").Formula = '=IF($D$133="4-point",\'Slope effect COG\'!Z86,"")'
    ws.Range("E308").Formula = '=IF($D$133="4-point",\'Slope effect COG\'!W86,"")'
    ws.Range("F308").Formula = '=IF($D$133="4-point",E308/$O$249*2,"")'
    ws.Range("G308").Formula = '=IF($D$133="4-point",F308-P263,"")'
    ws.Range("H308").Formula = '=IF($D$133="4-point",IFERROR(G308/F308,0),"")'
    ws.Range("I308").Formula = '=IF($D$133="4-point",F308/$O$244,"")'
    ws.Range("C306").Formula = "=ROUND(MAX(I$302:$I$304,I308),2)"

    dynamic = workbook.Worksheets("Dynamic loading CombinedCOG")
    for row in list(range(77, 89)) + list(range(93, 105)):
        old = dynamic.Range(f"L{row}").Formula
        dynamic.Range(f"L{row}").Formula = f'=IF(\'Load and Stability Calculation\'!$D$133="4-point",{hyd_min_distance(f"G{row}",f"H{row}")},{old[1:]})'
        for group, col in enumerate(("R", "S", "T"), 1):
            old_load = dynamic.Range(f"{col}{row}").Formula
            call = qualify_main_refs(hyd_reaction(group, f"G{row}", f"H{row}"))
            dynamic.Range(f"{col}{row}").Formula = f'=IF(\'Load and Stability Calculation\'!$D$133="4-point",Mall*{call},{old_load[1:]})'
        call4 = qualify_main_refs(hyd_reaction(4, f"G{row}", f"H{row}"))
        dynamic.Range(f"W{row}").Formula = f'=IF(\'Load and Stability Calculation\'!$D$133="4-point",Mall*{call4},NA())'
        dynamic.Range(f"X{row}").Formula = f"=M{row}"
    dynamic.Range("W108").Formula = "=MAX(W93:W104)"
    dynamic.Range("W109").Formula = "=VLOOKUP(W108,W93:X104,2,FALSE)"
    dynamic.Range("W110").Formula = "=VLOOKUP(W109,$F$93:$H$104,2,FALSE)"
    dynamic.Range("W111").Formula = "=VLOOKUP(W109,$F$93:$H$104,3,FALSE)"
    dynamic.Range("W114").Formula = "=MIN(W93:W104)"
    dynamic.Range("W115").Formula = "=VLOOKUP(W114,W93:X104,2,FALSE)"
    dynamic.Range("W116").Formula = "=VLOOKUP(W115,$F$93:$H$104,2,FALSE)"
    dynamic.Range("W117").Formula = "=VLOOKUP(W115,$F$93:$H$104,3,FALSE)"
    ws.Range("B405").Formula = '=IF($D$133="4-point","Worst case group 4","")'
    ws.Range("C405").Formula = '=IF($D$133="4-point",\'Dynamic loading CombinedCOG\'!W110,"")'
    ws.Range("D405").Formula = '=IF($D$133="4-point",\'Dynamic loading CombinedCOG\'!W111,"")'
    ws.Range("E405").Formula = '=IF($D$133="4-point",\'Dynamic loading CombinedCOG\'!W108,"")'
    ws.Range("F405").Formula = '=IF($D$133="4-point",E405/$O$249*2,"")'
    ws.Range("N405").Formula = '=IF($D$133="4-point",F405/$O$244,"")'
    ws.Range("D404").Formula = "=ROUND(MAX($N$400:$N$402,$N$405),2)"
    ws.Range("B430").Formula = '=IF($D$133="4-point","Worst case group 4","")'
    ws.Range("D430").Formula = '=IF($D$133="4-point",\'Dynamic loading CombinedCOG\'!W116,"")'
    ws.Range("F430").Formula = '=IF($D$133="4-point",\'Dynamic loading CombinedCOG\'!W117,"")'
    ws.Range("H430").Formula = '=IF($D$133="4-point",\'Dynamic loading CombinedCOG\'!W114,"")'
    ws.Range("J430").Formula = '=IF($D$133="4-point",O258,"")'
    ws.Range("L430").Formula = '=IF($D$133="4-point",H430/J430,1E+99)'
    ws.Range("D429").Formula = "=ROUND(MIN(L425:L427,L430),2)"

    # Current output summary includes Group 4 without moving established output cells.
    ws.Range("C500").Value = "Group 4"
    ws.Range("E500").Formula = '=IF($D$133="4-point",O263,"")'
    ws.Range("G500").Formula = '=IF($D$133="4-point",P263,"")'
    ws.Range("J500").Formula = '=IF($D$133="4-point",F405,"")'

    # Existing stability-boundary chart source expands from triangle to polygon.
    ws.Range("AH138").Value = "Hydraulic Stability Boundary"
    for i, row in enumerate(range(140, 145), 1):
        args = "$K$151,$M$151,$K$152,$M$152,$K$153,$M$153,$K$154,$M$154,$D$133"
        ws.Range(f"AH{row}").Value = i
        ws.Range(f"AI{row}").Formula = f"=TS_HYD_BOUNDARY_X({i},{args})"
        ws.Range(f"AJ{row}").Formula = f"=TS_HYD_BOUNDARY_Y({i},{args})"


def extend_axle_grids(workbook) -> None:
    """Extend the inherited 66-AL grids to the web engine's 99-AL limit.

    Formula extensions use Excel FillRight so relative references retain the
    original per-axle mapping.  Formats are copied from the final legacy axle
    column before formulas are seeded, preserving the established workbook
    presentation and number formats.
    """
    grids = (
        ("Bogie coordinates", AXLE_GROUP_FIRST_COL, AXLE_GROUP_LAST_COL, (2, 26)),
        ("Bogie existance", AXLE_EXISTENCE_FIRST_COL, AXLE_EXISTENCE_LAST_COL, (2, 26)),
        ("Bogie Group", AXLE_GROUP_FIRST_COL, AXLE_GROUP_LAST_COL, (2, 26)),
        ("Bogie coord-exist", AXLE_GROUP_FIRST_COL, AXLE_GROUP_LAST_COL, (2, 52)),
        ("Bogie Group 1", AXLE_GROUP_FIRST_COL, AXLE_GROUP_LAST_COL, (2, 26)),
        ("Bogie Group 2", AXLE_GROUP_FIRST_COL, AXLE_GROUP_LAST_COL, (2, 26)),
        ("Bogie Group 3", AXLE_GROUP_FIRST_COL, AXLE_GROUP_LAST_COL, (2, 26)),
    )
    for sheet_name, first_col, last_col, (first_row, last_row) in grids:
        ws = workbook.Worksheets(sheet_name)
        legacy_last = LEGACY_AXLE_GROUP_LAST_COL if first_col == AXLE_GROUP_FIRST_COL else LEGACY_AXLE_EXISTENCE_LAST_COL
        ws.Range(ws.Cells(first_row, legacy_last), ws.Cells(last_row, legacy_last)).Copy()
        ws.Range(ws.Cells(first_row, legacy_last + 1), ws.Cells(last_row, last_col)).PasteSpecial(-4122)
        ws.Range(ws.Cells(first_row, legacy_last), ws.Cells(last_row, last_col)).FillRight()
        # The inherited header cells are cached literals rather than formulas,
        # so FillRight would repeat 66.  Write the real AL sequence explicitly.
        for axle_line, column in enumerate(range(first_col, last_col + 1), 1):
            ws.Cells(2, column).Value = axle_line

    # The raw bogie-load blocks originally occupied C:BP.  Their adjacent
    # summary panel begins at BQ, so relocate it to CX:DD before extending.
    for sheet_name in (
        "Bogie Load Neutral", "Bogie Load A", "Bogie Load B", "Bogie Load C", "Bogie Load D"
    ):
        ws = workbook.Worksheets(sheet_name)
        ws.Range("BQ1:BW30").Copy(ws.Range("CX1"))
        ws.Range("BQ1:BW30").ClearContents()
        ws.Range(ws.Cells(1, LEGACY_AXLE_LOAD_LAST_COL), ws.Cells(30, LEGACY_AXLE_LOAD_LAST_COL)).Copy()
        ws.Range(ws.Cells(1, LEGACY_AXLE_LOAD_LAST_COL + 1), ws.Cells(30, AXLE_LOAD_LAST_COL)).PasteSpecial(-4122)

    # Spine-beam loads use C:BP and can safely extend to C:CW.
    spine_loads = workbook.Worksheets("Bogie Load Spinebeam Calc")
    spine_loads.Range(spine_loads.Cells(29, LEGACY_AXLE_LOAD_LAST_COL), spine_loads.Cells(52, LEGACY_AXLE_LOAD_LAST_COL)).Copy()
    spine_loads.Range(spine_loads.Cells(29, LEGACY_AXLE_LOAD_LAST_COL + 1), spine_loads.Cells(52, AXLE_LOAD_LAST_COL)).PasteSpecial(-4122)
    spine_loads.Range(spine_loads.Cells(29, AXLE_LOAD_FIRST_COL), spine_loads.Cells(52, AXLE_LOAD_LAST_COL)).FillRight()

    spine = workbook.Worksheets("Spinebeam calculation")
    spine.Range(spine.Cells(70, LEGACY_AXLE_EXISTENCE_LAST_COL), spine.Cells(73, LEGACY_AXLE_EXISTENCE_LAST_COL)).Copy()
    spine.Range(spine.Cells(70, LEGACY_AXLE_EXISTENCE_LAST_COL + 1), spine.Cells(73, AXLE_EXISTENCE_LAST_COL)).PasteSpecial(-4122)
    spine.Range(spine.Cells(70, LEGACY_AXLE_EXISTENCE_LAST_COL), spine.Cells(73, AXLE_EXISTENCE_LAST_COL)).FillRight()
    for axle_line, column in enumerate(range(AXLE_EXISTENCE_FIRST_COL, AXLE_EXISTENCE_LAST_COL + 1), 1):
        spine.Cells(70, column).Value = axle_line


def patch_bogie_loads(workbook) -> None:
    cases = {"Bogie Load Neutral": 163, "Bogie Load A": 164, "Bogie Load B": 165, "Bogie Load C": 166, "Bogie Load D": 167}
    main = "'Load and Stability Calculation'"
    for sheet_name, case_row in cases.items():
        ws = workbook.Worksheets(sheet_name)
        for out_row in range(6, 30):
            group_row = out_row - 3
            for out_col in range(AXLE_LOAD_FIRST_COL, AXLE_LOAD_LAST_COL + 1):  # C:CW maps E:CY
                group_col = out_col + 2
                exist_col = out_col + 1
                gc = f"'Bogie Group'!{col_letter(group_col)}{group_row}"
                ec = f"'Bogie existance'!{col_letter(exist_col)}{group_row}"
                ws.Cells(out_row, out_col).Formula = (
                    f"=IF(AND({gc}>=1,{gc}<=4,{ec}),CHOOSE({gc},{main}!$K${case_row}/2,{main}!$L${case_row}/2,"
                    f"{main}!$M${case_row}/2,{main}!$N${case_row}/2),IF({gc},\"Pinned up\",NA()))"
                )

        # Summary panel was deliberately moved clear of AL 67:99.  Recreate
        # its formulas against the complete AL span so the maximum local load
        # and utilisation include every web-exported axle line.
        ws.Range("CX5").Value = "MAX"
        ws.Range("DA2").Value = "Net capacity per bogie"
        ws.Range("DB4").Value = "Max UC:"
        ws.Range("DC4").Value = "in trailer:"
        ws.Range("DD4").Value = "AL cap"
        for out_row in range(6, 30):
            ws.Range(f"CX{out_row}").FormulaArray = f"=MAX(IF(ISERROR(C{out_row}:CW{out_row}),0,C{out_row}:CW{out_row}))"
            ws.Range(f"CY{out_row}").Value = (out_row - 5 + 1) // 2
            ws.Range(f"CZ{out_row}").Formula = f"=VLOOKUP(CY{out_row},{main}!$A$89:$B$100,2,FALSE)"
            ws.Range(f"DA{out_row}").Formula = f"=(VLOOKUP(CZ{out_row},TrailerDataLookup,6,FALSE)-VLOOKUP(CZ{out_row},TrailerDataLookup,5,FALSE))/2"
            ws.Range(f"DB{out_row}").Formula = f"=CX{out_row}/DA{out_row}"
            ws.Range(f"DC{out_row}").Value = (out_row - 5 + 1) // 2
        ws.Range("DB5").FormulaArray = "=MAX(IF(ISERROR(DB6:DB29),0,DB6:DB29))"
        ws.Range("DC5").Formula = "=VLOOKUP(DB5,DB6:DC29,2,FALSE)"
        ws.Range("DD5").Formula = "=VLOOKUP(DC5,CY6:DA29,3,FALSE)*2"


def retarget_bogie_load_summaries(workbook) -> None:
    """Point all retained capacity checks at the relocated MAX column.

    `BQ` was the old per-bogie maximum after 66 AL columns (C:BP).  It is now
    an active AL 67 column, while `CX` is the relocated maximum after C:CW.
    Leaving a BQ reference behind silently compares capacity with one axle
    instead of the governing bogie load.
    """
    for ws_index in range(1, workbook.Worksheets.Count + 1):
        ws = workbook.Worksheets(ws_index)
        for case_name in (
            "Bogie Load Neutral",
            "Bogie Load A",
            "Bogie Load B",
            "Bogie Load C",
            "Bogie Load D",
        ):
            ws.UsedRange.Replace(
                What=f"'{case_name}'!BQ",
                Replacement=f"'{case_name}'!CX",
                LookAt=2,
                SearchOrder=1,
                MatchCase=False,
            )
            ws.UsedRange.Replace(
                What=f"'{case_name}'!$BQ$",
                Replacement=f"'{case_name}'!$CX$",
                LookAt=2,
                SearchOrder=1,
                MatchCase=False,
            )
    # Excel adjusts a moved single-column range as BQ:CX.  Within the capacity
    # overview that is never intended: both endpoints are the relocated MAX
    # summary, so normalise the retained formulas to CX:CX.
    workbook.Worksheets("Load and Stability Calculation").Range("B149:Q266").Replace(
        What="BQ",
        Replacement="CX",
        LookAt=2,
        SearchOrder=1,
        MatchCase=False,
    )


def patch_group4_chart_helper(workbook) -> None:
    ws = workbook.Worksheets("Bogie Group")
    # Existing blank helper rows are used; no Group 4 worksheet is added.
    total_cols = 24 * MAX_AXLE_LINES
    for idx in range(total_cols):
        src_row = idx // MAX_AXLE_LINES + 3
        src_col = idx % MAX_AXLE_LINES + AXLE_GROUP_FIRST_COL
        dst_col = idx + 5
        group_addr = f"{col_letter(src_col)}{src_row}"
        x_addr = f"'Bogie coord-exist'!{col_letter(src_col)}{src_row}"
        y_addr = f"'Bogie coord-exist'!{col_letter(src_col)}{src_row + 26}"
        ws.Cells(28, dst_col).Formula = f"=IF({group_addr}=4,{x_addr},NA())"
        ws.Cells(29, dst_col).Formula = f"=IF({group_addr}=4,{y_addr},NA())"


def patch_spinebeam(workbook) -> None:
    ws = workbook.Worksheets("Spinebeam calculation")

    # The original plotting / calculation chain stopped at AL 66.  Retarget
    # it before adding the G4 series so bending, shear and deflection use the
    # same 99-AL input span as the web calculation.
    ws.Range("D56").Formula = "=IF(ISNUMBER(C56),INDEX($D$71:$CX$71,1,MATCH(C56,$D$70:$CX$70,0))-$C$12/2,0)"
    ws.Range("P55:Y55").FormulaArray = '=IF(ISNUMBER(SMALL(IF(D72:CX72=0,COLUMN(D70:CX70)-3),ROW(1:10))),SMALL(IF(D72:CX72=0,COLUMN(D70:CX70)-3),ROW(1:10)),"")'
    ws.Range("D71").Formula = '=IF(ISNUMBER(D72),INDEX(\'Bogie coordinates\'!$E$3:$CY$26,MATCH($C$3,\'Bogie coordinates\'!$A$3:$A$26,0),D70)-$C$28,"")'
    ws.Range("D72").Formula = '=IF(ISNA(VLOOKUP($C$3,\'Bogie Load Spinebeam Calc\'!$A$29:$CW$52,D70+2,FALSE)),"",IF(ISNUMBER(VLOOKUP($C$3,\'Bogie Load Spinebeam Calc\'!$A$29:$CW$52,D70+2,FALSE)),(INDEX(\'Bogie Load Spinebeam Calc\'!$C$29:$CW$52,MATCH($C$3,\'Bogie Load Spinebeam Calc\'!$A$29:$A$52,0),D70)+INDEX(\'Bogie Load Spinebeam Calc\'!$C$29:$CW$52,MATCH($C$3,\'Bogie Load Spinebeam Calc\'!$A$29:$A$52,0)+1,D70))*$C$8,0))'
    ws.Range("D71:CX73").FillRight()

    # Source templates may already contain the extended calculation array.
    # Clear the complete current CSE array rather than a fixed legacy subset.
    ws.Range("G117").CurrentArray.ClearContents()
    ws.Range("HV117:HV122").Copy()
    ws.Range(f"HW117:{col_letter(SPINE_PLOT_LAST_COL)}122").PasteSpecial(-4122)
    group_formula = "=TRANSPOSE(plotAxleLoads(TRANSPOSE(D71:CX73),TRANSPOSE(INDEX('Bogie Group'!$E$3:$CY$26,MATCH($C$3,'Bogie Group'!$A$3:$A$26,0)+1,'Bogie Group'!$E$2:$CY$2))))+D117:D122"
    ws.Range(f"G117:{col_letter(SPINE_PLOT_LAST_COL)}122").FormulaArray = group_formula

    ws.Range("B125:F126").ClearContents()
    ws.Range("B121:F122").Copy()
    ws.Range("B125:F126").PasteSpecial(-4122)
    ws.Range("B125").Value = "Axle loads G4"
    ws.Range("C125").Value = "X (GCS)"
    ws.Range("C126").Value = "Load"
    ws.Range("D125").Formula = "=$C$28"
    ws.Range("D126").Value = 0
    formula = "=TRANSPOSE(PlotAxleLoadsG4(TRANSPOSE(D71:CX73),TRANSPOSE(INDEX('Bogie Group'!$E$3:$CY$26,MATCH($C$3,'Bogie Group'!$A$3:$A$26,0)+1,'Bogie Group'!$E$2:$CY$2))))+D125:D126"
    ws.Range("G125").CurrentArray.ClearContents()
    ws.Range("HV125:HV126").Copy()
    ws.Range(f"HW125:{col_letter(SPINE_PLOT_LAST_COL)}126").PasteSpecial(-4122)
    ws.Range(f"G125:{col_letter(SPINE_PLOT_LAST_COL)}126").FormulaArray = formula
    ws.Range("E126").FormulaArray = f"=MIN(IF(NOT(ISNA(G126:{col_letter(SPINE_PLOT_LAST_COL)}126)),G126:{col_letter(SPINE_PLOT_LAST_COL)}126))"
    ws.Range("F126").FormulaArray = f"=MAX(IF(NOT(ISNA(G126:{col_letter(SPINE_PLOT_LAST_COL)}126)),G126:{col_letter(SPINE_PLOT_LAST_COL)}126))"
    # The existing support/distributed-load plotting ranges are left untouched.
    # The G4 axle-load series uses its own rows 125:126 and therefore cannot
    # disturb the legacy array formulas in rows 105:124.


def patch_export_sheet(workbook) -> None:
    ws = workbook.Worksheets("Export to DWG")
    ws.Range("H2:I26").Copy()
    ws.Range("J2:K26").PasteSpecial(-4122)
    ws.Range("J2").Formula = "='Load and Stability Calculation'!O242"
    for row, main_row in ((3, 243), (4, 244), (5, 245), (6, 246), (9, 249), (12, 252), (13, 253), (14, 254), (15, 255), (16, 256), (17, 257), (18, 258)):
        ws.Range(f"J{row}").Formula = f"='Load and Stability Calculation'!O{main_row}"
    for row, main_row in ((21, 261), (22, 262), (23, 263), (24, 264), (25, 265), (26, 266)):
        ws.Range(f"J{row}").Formula = f"='Load and Stability Calculation'!O{main_row}"
        ws.Range(f"K{row}").Formula = f"='Load and Stability Calculation'!P{main_row}"
    for export_row, main_row in zip(range(33, 39), range(253, 259)):
        ws.Range(f"F{export_row}").Formula = f"='Load and Stability Calculation'!O{main_row}"
    for export_row, main_row in zip(range(42, 48), range(261, 267)):
        ws.Range(f"F{export_row}").Formula = f"='Load and Stability Calculation'!Q{main_row}"
    ws.Range("A49").Value = "Hydraulic stability system"
    ws.Range("C49").Formula = "='Load and Stability Calculation'!D133"
    ws.Range("A50").Value = "Boundary point"
    ws.Range("C50").Value = "X (m)"
    ws.Range("D50").Value = "Y (m)"
    for group, row in enumerate(range(51, 55), 1):
        ws.Range(f"A{row}").Value = f"Group {group}"
        ws.Range(f"C{row}").Formula = f"='Load and Stability Calculation'!K{150+group}"
        ws.Range(f"D{row}").Formula = f"='Load and Stability Calculation'!M{150+group}"
    ws.Range("A55").Value = "Boundary valid"
    ws.Range("C55").Formula = "=TS_HYD_POLYGON_VALID(C51,D51,C52,D52,C53,D53,C54,D54,C49)"
    ws.Range("A49:D55").Borders.LineStyle = 1
    ws.Range("A49:D50").Font.Bold = True
    ws.PageSetup.PrintArea = "$A$1:$K$55"


def patch_charts(workbook) -> None:
    main = workbook.Worksheets("Load and Stability Calculation")
    for chart_obj in main.ChartObjects():
        chart = chart_obj.Chart
        for idx in range(1, chart.SeriesCollection().Count + 1):
            series = chart.SeriesCollection(idx)
            formula = series.Formula
            if "$AI$140:$AI$143" in formula or "$AJ$140:$AJ$143" in formula:
                series.Formula = formula.replace("$AI$140:$AI$143", "$AI$140:$AI$144").replace("$AJ$140:$AJ$143", "$AJ$140:$AJ$144")
        names = []
        all_series_formulas = []
        for idx in range(1, chart.SeriesCollection().Count + 1):
            try:
                names.append(str(chart.SeriesCollection(idx).Name))
                all_series_formulas.append(str(chart.SeriesCollection(idx).Formula))
            except Exception:
                names.append("")
        if any("Group 3" in n for n in names) and any("Grouping" in n or "Boundary" in n for n in names):
            if not any("Group 4" in n for n in names):
                s = chart.SeriesCollection().NewSeries()
                s.Name = "Group 4"
                helper_last = col_letter(AXLE_GROUP_FIRST_COL + 24 * MAX_AXLE_LINES - 1)
                s.XValues = f"='Bogie Group'!$E$28:${helper_last}$28"
                s.Values = f"='Bogie Group'!$E$29:${helper_last}$29"
                try:
                    s.Format.Line.ForeColor.RGB = 3394611
                except Exception:
                    pass
        # Existing slope/dynamic stability plots receive the fourth worst-case marker.
        if any("Worst case group 3" in n for n in names) and not any("Worst case group 4" in n for n in names):
            s = chart.SeriesCollection().NewSeries()
            if any("Dynamic loading CombinedCOG" in formula for formula in all_series_formulas):
                s.Name = "='Load and Stability Calculation'!$B$405"
                s.XValues = "='Dynamic loading CombinedCOG'!$W$110"
                s.Values = "='Dynamic loading CombinedCOG'!$W$111"
            else:
                s.Name = "='Load and Stability Calculation'!$B$308"
                s.XValues = "='Load and Stability Calculation'!$C$308"
                s.Values = "='Load and Stability Calculation'!$D$308"

    spine = workbook.Worksheets("Spinebeam calculation")
    for chart_obj in spine.ChartObjects():
        chart = chart_obj.Chart
        names = [str(chart.SeriesCollection(i).Name) for i in range(1, chart.SeriesCollection().Count + 1)]
        if any("Axle loads G3" in n for n in names) and not any("Axle loads G4" in n for n in names):
            s = chart.SeriesCollection().NewSeries()
            s.Name = "='Spinebeam calculation'!$B$125"
            s.XValues = f"='Spinebeam calculation'!$G$125:${col_letter(SPINE_PLOT_LAST_COL)}$125"
            s.Values = f"='Spinebeam calculation'!$G$126:${col_letter(SPINE_PLOT_LAST_COL)}$126"


def build() -> Path:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    if OUTPUT.exists():
        OUTPUT.unlink()
    shutil.copy2(SOURCE, OUTPUT)

    pythoncom.CoInitialize()
    excel = win32com.client.DispatchEx("Excel.Application")
    excel.Visible = False
    excel.DisplayAlerts = False
    excel.EnableEvents = False
    excel.ScreenUpdating = False
    excel.AutomationSecurity = MSO_AUTOMATION_SECURITY_FORCE_DISABLE
    workbook = None
    try:
        workbook = excel.Workbooks.Open(str(OUTPUT), UpdateLinks=0, ReadOnly=False)
        excel.Calculation = XL_CALC_MANUAL
        strip_legacy_optimiser_assets(workbook)
        add_hydraulic_module(workbook)
        patch_main_sheet(workbook)
        extend_axle_grids(workbook)
        patch_bogie_loads(workbook)
        retarget_bogie_load_summaries(workbook)
        patch_group4_chart_helper(workbook)
        patch_spinebeam(workbook)
        patch_export_sheet(workbook)
        patch_charts(workbook)

        forbidden = {"4 Point Hydraulics", "TS_4POINT_LOG", *LEGACY_OPTIMISER_SHEETS}
        actual = {workbook.Worksheets(i).Name for i in range(1, workbook.Worksheets.Count + 1)}
        if actual & forbidden:
            raise RuntimeError(f"Forbidden separate four-point worksheets exist: {sorted(actual & forbidden)}")

        workbook.Worksheets("Load and Stability Calculation").Range("D133").Value = "3-point"
        excel.Calculation = XL_CALC_AUTOMATIC
        excel.CalculateFullRebuild()
        # Full rebuild is authoritative; a small settle loop is enough to
        # populate cached values without making the 99-AL template build wait
        # on 100 redundant complete recalculations.
        for _ in range(3):
            excel.Calculate()
        workbook.Save()
        workbook.Close(SaveChanges=True)
        workbook = None
        # Reopen with VBA enabled so the new engineering UDFs calculate and
        # valid cached results are stored in the delivered macro workbook.
        excel.AutomationSecurity = MSO_AUTOMATION_SECURITY_LOW
        workbook = excel.Workbooks.Open(str(OUTPUT), UpdateLinks=0, ReadOnly=False)
        excel.Calculation = XL_CALC_AUTOMATIC
        excel.CalculateFullRebuild()
        workbook.Save()
        workbook.Close(SaveChanges=True)
        workbook = None
    finally:
        if workbook is not None:
            workbook.Close(SaveChanges=False)
        excel.Quit()
        pythoncom.CoUninitialize()
    return OUTPUT


if __name__ == "__main__":
    result = build()
    print(result)
