# Cargo COG Envelope Rule

The standalone calculation uses independent X and Y cargo COG uncertainty
half-widths. New cases enable automatic mode by default.

For a positive cargo dimension, the automatic value is:

```text
envelope = max(2.5% × cargo dimension, 0.100 m)
```

X uses cargo length and Y uses cargo width. A zero or incomplete dimension
temporarily produces a zero envelope until the cargo geometry is entered.

The advised manual minimum is 2% of the corresponding dimension. Manual mode
may accept a smaller value because an engineer may hold project-specific COG
evidence, but the interface marks the field amber and records a warning. Any
manual value below 0.100 m is an explicit not-advised override requiring an
independent justification.

The effective values are calculation inputs and export directly to workbook
cells `E64:E65`. Automatic mode is resolved before calculation and export, so
the website result and verification workbook receive the same values.
