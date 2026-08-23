# Support Reaction Settlement

## Authoritative sequence

Every exact case starts from a clean state. Up to ten finite support rows are
processed in their configured order. A support is initially active only when it
is marked Allowed and its full spread width lies on the analysed trailer deck.

The engine then repeats the workbook-compatible sequence:

1. Solve the exact continuous spine-beam system for the current active set.
2. Convert each solver reaction to the workbook `Rstatic` sign convention.
3. In one deterministic batch, deactivate every active support whose reaction
   is unavailable or less than `-1e-7 t`.
4. Recalculate after the batch and repeat until no state changes.

The case fails support settlement when fewer than two supports remain or the
beam solver cannot form a stable system. A converged set must also meet the
user-configured minimum active-support count.

## Positive connection exception

`positiveConnectionToDeck` is off by default. Enabling it for an individual
support permits that support to remain active with a negative `Rstatic`. The
reaction is retained as `TENSION_RESTRAINED` and a prominent warning states the
required tensile design action. It must not be interpreted as compression or
ordinary bearing support.

## Audit record

`CalculationResult.supportSettlement` contains the reset, every reaction table,
every active-state transition, the final outcome, exact calculation count and
settlement time. The same record is included in optimiser activity, permanent
pass CSV, case text, engineering JSON and the AutoCAD JSON result section.
Disabled supports retain the reaction that caused their deactivation.

## Verification and benchmark

Run:

```powershell
pnpm run benchmark:supports
```

The benchmark settles a known two-pass case, independently solves its retained
active set, and requires reactions, shear, bending and deflection to agree
within `1e-8`. It then reports 100-run mean, P50 and P95 timings without using a
machine-dependent pass/fail time threshold.
