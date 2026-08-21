# Trailer Stability Native Web v0.7

A complete responsive trailer stability calculator and optimiser. The
engineering engine runs locally in a phone or desktop browser and keeps case
data on the user's device unless an export is explicitly requested.

## Included

- Native load, COG, hydraulic grouping, stability, support-settling,
  support-spreading and continuous spine-beam calculations.
- Recalculation after every C89, D138, E89, support or pinned-axle change.
- Absolute, load-COG-relative and all-inclusive-COG-relative trailer placement.
- Shared axle-line, split-line, X-location and pin controls with consistent
  propagation across the active formation.
- Up to 12 trailer rows, eight pinned axle lines and ten optional supports.
- Dynamic trailer catalogue with the PEKZ G4 records and editable custom rows.
- First/Second/Third engineering verification limits, route/residual slopes,
  selectable spine load cases and local loose-packing loads.
- Coarse scan, exact automatic E89 bounds, physics-guided pin search,
  selectable two-pass E89 refinement, 13-metric weighting, progress, ETA,
  stoppable runs and ranked pass application.
- Stability envelopes, plan, elevation, axle-line loading, beam-load, shear,
  bending and deflection charts.
- Permanent full-case, axle, beam-mesh and activity CSV logs plus project JSON.
- Versioned project JSON plus a single compact, line-oriented AutoCAD exchange
  containing the resolved geometry and drawing results consumed by the LISP.
- Installable PWA service worker for offline use after the first HTTPS/localhost
  load.

## Start on Windows

Requirements: Node.js 22.13 or newer and pnpm 9.10.

```powershell
.\Install-TrailerStability.ps1
.\Start-TrailerStability.ps1
```

The installer uses the locked dependency versions, builds the production app
and runs the complete verification suite. The launcher then opens
`http://127.0.0.1:3000`.

For a phone on the same Wi-Fi network, leave the launcher running and open:

```powershell
http://<computer-LAN-IP>:3000
```

Windows Firewall may ask once whether Node.js may accept private-network
connections.

## Developer mode

```powershell
pnpm dev --host 0.0.0.0
```

## Production build

```powershell
pnpm build
pnpm start --hostname 0.0.0.0
```

The production output is created in `dist/`.

## GitHub Pages beta

The repository deploys a static, browser-only build when changes are merged to
`main`. In the repository's **Settings → Pages**, set **Source** to
**GitHub Actions** once. The site will then be published at:

```
https://bretwalda98.github.io/Trailer_Stability_BETA/
```

The calculator, optimisation worker, local project storage, logs and JSON
exchange remain in the browser. GitHub Pages does not host the optional
Node/Cloudflare server shell used by the local desktop build.

## Verification

```powershell
pnpm test
```

The automated checks cover analytical beam cases, shared-control propagation,
COG-relative solving, engineering limits, support settling, loose packing,
selectable beam cases, optimiser execution, the trailer catalogue, responsive
server rendering and the compact AutoCAD interchange contract.

The supplied v0.7 profile completed 1,135 fully calculated/logged cases in
7.82 seconds in the final local benchmark (6.89 ms average per case), meeting
the nine-second target. See `VERIFICATION_REPORT.md`.

The Help and user guide includes the active calculation reference. Results also
provide a detailed hand calculation with rendered equations plus PDF and
LaTeX-source downloads.

## Data handling

Project autosave uses browser local storage. Project JSON, CSV and compact CAD
files are processed locally and downloaded directly by the browser; the app
does not need to upload engineering data to a server.
