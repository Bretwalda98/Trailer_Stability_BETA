# SARTD-CAD compact exchange v1

The website emits UTF-8, line-oriented records separated by `|`. The first record is:

```text
SARTD-CAD|1|MM-T-KN-DEG|REAR-LOW-X
```

Record types are `CASE`, `LOAD`, `PACKING`, `DECK`, `TRAILER`, `HYDRAULIC`, `PINS`, `SUPPORT`, `GROUP`, `BOUNDARY`, `RESULT`, and final `END`. Repeated records are allowed where the case contains multiple trailers, supports, hydraulic groups, pins, or polygon points.

Text fields use percent escaping: `%25` for `%`, `%7C` for `|`, `%0A` for a line break, and `%0D` for a carriage return. Numeric fields use invariant decimal notation. Units are millimetres, tonnes, kN, and degrees.

Coordinates use the controlled transport datum: lower X/left is rear; higher X/right is front. `TRAILER` records contain authoritative resolved geometry and PPU states. `HYDRAULIC` records contain the selected routing for each trailer. `GROUP` records contain settled bogie counts, loads, utilisation and hydraulic pressure cases used to populate official drawing tables. `BOUNDARY` records retain the ordered authoritative stability-polygon points for validation and attributes; the drafting program does not draw a duplicate free-standing result polygon or result label.

AutoLISP must reject an unsupported header version or a missing required record before deleting or drawing existing geometry. Unknown future record tags may be logged and ignored for forward compatibility.
