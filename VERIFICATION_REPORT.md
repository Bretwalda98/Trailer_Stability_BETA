# Standalone v0.7 verification report

## Final result

- Production build, TypeScript checks, analytical beam tests, workbook
  round-trip tests and rendered-application tests pass.
- Desktop production rendering and a 390 × 844 phone layout were visually
  checked. Both had zero horizontal overflow; the final production load had no
  browser errors.
- The verification XLSM keeps the original VBA binary and all OOXML package
  parts.

## Workbook parity case

The bundled v0.7 workbook was imported and recalculated by the native engine.

| Output | Workbook | Native |
|---|---:|---:|
| Basic utilisation | 0.17 | 0.166785829690 |
| Slope utilisation | 0.17 | 0.173999094941 |
| Dynamic utilisation | 0.19 | 0.192277044245 |
| Spine utilisation | 0.058371171287 | 0.058371172015 |
| Basic angle | 21.727171648° | 21.727171706° |
| Slope angle | 20.7° | 20.738141713° |
| Dynamic angle | 18.2° | 18.174201945° |
| Dynamic/static ratio | 0.73 | 0.729923491 |

The workbook-rounded outputs match. The exact spine utilisation difference is
below `1e-8`, and the basic-angle difference is below `1e-6` degrees.

Detailed beam extrema also match the workbook mesh, including support 9 being
removed by the repeated negative-reaction settling rule.

## Performance

Representative imported v0.7 optimiser profile:

- C89: 30 to 36, step 2.
- E89: automatic group-centre range, step 2 m.
- Pin search: FAST.
- Cases fully calculated and retained: 1,135.
- Valid passes: 80.
- Total native run: 7,815.95 ms.
- Average: 6.886 ms per logged case.

The previous workbook run was reported at 43–44 seconds. The native result is
about 5.5× faster and below the nine-second target while retaining support
settling, beam diagrams, extrema, deformation, utilisation, ranking and logs
for every case.
