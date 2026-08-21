# SARTD-CAD compact exchange v1

The website emits UTF-8, line-oriented records separated by `|`. The first record is:

```text
SARTD-CAD|1|MM-T-KN-DEG|REAR-LOW-X
```

Record types are `CASE`, `LOAD`, `PACKING`, `DECK`, `TRAILER`, `HYDRAULIC`, `PINS`, `SUPPORT`, `BOUNDARY`, `RESULT`, and final `END`. Repeated records are allowed where the case contains multiple trailers, supports, pins, or polygon points.

Text fields use percent escaping: `%25` for `%`, `%7C` for `|`, `%0A` for a line break, and `%0D` for a carriage return. Numeric fields use invariant decimal notation. Units are millimetres, tonnes, kN, and degrees.

Coordinates use the controlled transport datum: lower X/left is rear; higher X/right is front. `TRAILER` records contain authoritative resolved geometry and PPU states. `HYDRAULIC` records contain the selected routing for each trailer. `BOUNDARY` records are ordered authoritative stability-polygon points and must be drawn without changing their supplied point count.

AutoLISP must reject an unsupported header version or a missing required record before deleting or drawing existing geometry. Unknown future record tags may be logged and ignored for forward compatibility.
