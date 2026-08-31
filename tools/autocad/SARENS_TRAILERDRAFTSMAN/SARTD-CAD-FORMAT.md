# SARTD-CAD compact exchange v1

## Version 2 extension (reader package v1.23)

Extended bed/yaw/deck-PPU cases use `SARTD-CAD|2|MM-T-KN-DEG|REAR-LOW-X`. Older readers reject version 2 instead of flattening its geometry. All v1 input/result records remain present. The v2 additions are:

| Record | Fields after tag |
|---|---|
| `TRAILER` | Existing fields followed by 17 yaw degrees |
| `BED` | 1 stable ID; 2 resolved trailer index; 3 AL (4/5/6); 4 rear X mm; 5 rear-centre Y mm; 6 yaw degrees; 7 length mm; 8 width mm |
| `DECKPPU` | 1 ID; 2 resolved host-trailer index; 3 centre X mm; 4 centre Y mm; 5 yaw; 6 length mm; 7 width mm; 8 height mm; 9 mass t; 10 COG above deck mm; 11 secured; 12 drag coefficient; 13 available traction power; 14 host bed/train ID |
| `VIEWPATH` | 1 PLAN/SIDE/END; 2 allowlisted SARTD layer; 3 semicolon-separated `x,y` pairs in mm; closed paths repeat the first point |
| `VIEWTEXT` | 1 view; 2 layer; 3 X mm; 4 Y mm; 5 positive text height mm; 6 escaped plain text |
| `END` | Existing fields followed by 6 BED count; 7 DECKPPU count; 8 combined VIEWPATH/VIEWTEXT count |

All geometry coordinates are local to their named orthographic view, using the case datum. The importer only translates the three view envelopes to non-overlapping drawing locations; it does not rotate, scale or recalculate individual equipment. Side/end views show projected equipment envelopes and bogie stations, not a fabricated detailed chassis. Attached PPUs have a known plan footprint/deck-top line; no undocumented attached-PPU height is invented. Independent PPUs use their entered dimensions and deck-relative COG.

`SUMMARY[2]` and `END[3]` include attached and independent PPUs exactly once. Positive and negative bed yaw, every independent support-strip location, and the authoritative three-/four-point boundary are retained. V2 validates units, counts, numeric geometry, bed/PPU fields and securing before drawing; it never evaluates code from the file. Legacy Excel/coded-JSON import is unchanged and does not support these extensions.

The website emits UTF-8, line-oriented records separated by `|`. The first record is:

```text
SARTD-CAD|1|MM-T-KN-DEG|REAR-LOW-X
```

Record types are `CASE`, `LOAD`, `PACKING`, `DECK`, `TRAILER`, `HYDRAULIC`, `PINS`, `SUPPORT`, `GROUP`, `SUMMARY`, `BOUNDARY`, `RESULT`, and final `END`. Repeated records are allowed where the case contains multiple trailers, supports, hydraulic groups, pins, or polygon points.

Text fields use percent escaping: `%25` for `%`, `%7C` for `|`, `%0A` for a line break, and `%0D` for a carriage return. Numeric fields use invariant decimal notation. Units are millimetres, tonnes, kN, and degrees.

Coordinates use the controlled transport datum: lower X/left is rear; higher X/right is front. Cargo COG X/Y are absolute plan coordinates, while cargo COG Z is relative to the cargo bottom; the drafting program adds deck and packing height exactly once. `TRAILER` records contain authoritative resolved geometry, PPU states and separated trailer/PPU masses. `HYDRAULIC` records contain the selected routing for each trailer. `GROUP` records contain settled bogie counts, neutral and A-D static-envelope pressures, neutral/maximum gross axle-line loads, utilisation, active shadow area and group ground-bearing pressure. `SUMMARY` contains drawing-table totals, including separated trailer/PPU mass, total active bogies, overall axle-line loads and GBP. `BOUNDARY` records retain the ordered authoritative stability-polygon points for validation and attributes; the drafting program does not draw a duplicate free-standing result polygon or result label.

AutoLISP must reject an unsupported header version or a missing required record before deleting or drawing existing geometry. Unknown future record tags may be logged and ignored for forward compatibility.

## Positional record contract

Field zero is the record tag. The indexes below are the pipe-separated field
indexes used by the v1.22 reader. Blank optional values are retained as empty
fields; a producer must not remove a field and shift later indexes.

| Record | Required fields after tag |
|---|---|
| `CASE` | 1 name; 2 client ref; 3 owner ref; 4 engineering degree; 5 weight/COG ref; 6 datum; 7 date; 8 status |
| `LOAD` | 1 length mm; 2 width mm; 3 height mm; 4 rear-X extreme mm; 5 lower-Y extreme mm; 6 cargo t; 7 absolute COG X mm; 8 absolute COG Y mm; 9 cargo-bottom-relative COG Z mm; 10 X envelope mm; 11 Y envelope mm |
| `PACKING` | 1 mass t; 2 height mm; 3 absolute COG X mm; 4 absolute COG Y mm; 5 packing-bottom-relative COG Z mm |
| `DECK` | 1 deck-top height mm |
| `TRAILER` | 1 index; 2 catalogue name; 3 AL; 4 resolved start X mm; 5 centre Y mm; 6 axle pitch mm; 7 resolved length mm; 8 width mm; 9 rear PPU; 10 front PPU; 11 rear PPU length mm; 12 front PPU length mm; 13 rear PPU t; 14 front PPU t; 15 trailer tare t; 16 AL capacity t |
| `HYDRAULIC` | 1 trailer index; 2 `THREE_POINT`/`FOUR_POINT`; 3 split AL; 4 rear-left group; 5 front-left group; 6 rear-right group; 7 front-right group |
| `PINS` | 1 trailer index; 2 comma-separated pinned AL numbers |
| `SUPPORT` | 1 index; 2 X mm; 3 width mm; 4 allowed; 5 settled active; 6 reaction t; 7 positive connection to deck/spine beam; 8 reaction state; 9 disable reason |
| `GROUP` | 1 group; 2 active bogies; 3 neutral group t; 4 neutral bar; 5–8 A–D bar; 9 maximum gross AL t; 10 utilisation %; 11 neutral gross AL t; 12 maximum gross AL t; 13 GBP t/m²; 14 active AL; 15 contact area m² |
| `SUMMARY` | 1 trailer tare t; 2 PPU t; 3 active bogies; 4 average gross AL t; 5 maximum gross AL t; 6 maximum utilisation %; 7 overall GBP t/m²; 8 maximum group GBP t/m²; 9 AL self-weight t |
| `BOUNDARY` | 1 ordered point index; 2 X mm; 3 Y mm |
| `RESULT` | 1 total t; 2 combined COG X mm; 3 combined COG Y mm; 4 combined COG Z mm; 5 repeated X envelope mm; 6 repeated Y envelope mm; 7 AL capacity t; 8 longitudinal slope °; 9 transverse slope °; 10 wind m/s; 11 longitudinal acceleration m/s²; 12 basic angle °; 13 dynamic angle °; 14 status |
| `END` | 1 trailer count; 2 total AL; 3 PPU count; 4 support count; 5 boundary-point count |

`LOAD[10:11]` is the authoritative COG envelope. `RESULT[5:6]` repeats those
values for retained readers and must be identical in millimetres. Four-point
cases require four populated `GROUP` and four ordered `BOUNDARY` records; no
reader may collapse them to a triangle.
