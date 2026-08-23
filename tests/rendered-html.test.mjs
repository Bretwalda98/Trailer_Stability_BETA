import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  if (!worker || typeof worker.fetch !== "function") {
    const html = await readFile(new URL("../dist/client/index.html", import.meta.url), "utf8");
    return new Response(html, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the standalone engineering workbench", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, developmentPreviewMeta);
  assert.match(html, /<title>Trailer Stability \| SPMT Engineering Workbench<\/title>/i);
  assert.match(html, /Interactive engineering viewport/);
  assert.match(html, /Orthographic plan of the trailer transport arrangement/);
  assert.match(html, /Hydraulics/);
  assert.match(html, /Stability/);
  assert.match(html, /Spine beam/);
  assert.match(html, /Engineering details/);
  assert.match(html, /Find arrangement/);
  assert.match(html, /Find the minimum buildable SPMT formation/);
  assert.match(html, /Start arrangement search/);
  assert.match(html, /Open case/);
  assert.doesNotMatch(html, /Run optimisation/);
  assert.doesNotMatch(html, /Build an arrangement manually/);
  assert.match(html, /Results and selected item inspector/);
  assert.match(html, /manifest\.webmanifest/);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site/);
});

test("keeps phone, offline, interactive drawing and compact AutoCAD capabilities wired", async () => {
  const [page, layout, manifest, workbench, optimiserDrawer, engineeringViewport, handCalculation, engineHook, worker, planView, endView, sideView, css, professionalCss, serviceWorker, setupWizard, arrangementWizard, arrangementEngine, arrangementOptimiser, windEngine, envelopeEngine, resultPanels, comparisonEngine, diagnosticsEngine] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
    readFile(new URL("../app/components/TrailerWorkbench.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/workbench/OptimiserDrawer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/workbench/EngineeringViewport.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/workbench/HandCalculationDialog.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/hooks/useEngineeringEngine.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/workers/engineering.worker.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/components/workbench/views/PlanView.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/workbench/views/EndView.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/workbench/views/SideView.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/professional-workbench.css", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    readFile(new URL("../app/components/workbench/SetupWizard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/workbench/ArrangementWizard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/engine/arrangement.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/engine/arrangement-optimiser.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/engine/wind.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/engine/cargo-envelope.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/components/workbench/EngineeringResultPanels.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/engine/arrangement-comparison.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/engine/optimiser-diagnostics.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /<TrailerWorkbench \/>/);
  assert.match(layout, /Trailer Stability \| SPMT Engineering Workbench/);
  assert.match(layout, /professional-workbench\.css/);
  assert.match(manifest, /"display": "standalone"/);
  assert.match(workbench, /assetPath\("\/sw\.js"\)/);
  assert.match(workbench, /buildAutocadCompactExport/);
  assert.match(workbench, /\.sartd/);
  assert.match(workbench, /SARTDCAD/);
  assert.doesNotMatch(workbench, /AUTOCAD_EXPORT_KEY/);
  assert.doesNotMatch(workbench, /onExportWorkbook/);
  assert.match(workbench, /aria-label="Mobile workspace"/);
  assert.match(workbench, /StartupChooser/);
  assert.match(workbench, /HandCalculationDialog/);
  assert.match(handCalculation, /katex\.renderToString/);
  assert.match(handCalculation, /Download PDF/);
  assert.match(handCalculation, /\.latex/);
  assert.match(engineeringViewport, /onBackgroundPointerDown: pointerDown/);
  assert.match(engineeringViewport, /onBackgroundPointerMove: pointerMove/);
  assert.match(engineeringViewport, /onWheel: wheel/);
  assert.match(engineeringViewport, /pointersRef/);
  assert.match(engineeringViewport, /beginPinch/);
  assert.match(engineHook, /deterministicInitialCalculation/);
  assert.match(engineHook, /new Worker\(new URL\("\.\.\/workers\/engineering\.worker\.ts"/);
  assert.match(worker, /calculateProject/);
  assert.match(worker, /runOptimiser/);
  assert.match(worker, /runArrangementOptimiser/);
  assert.match(worker, /detailIncluded/);
  assert.match(engineHook, /message\.detailIncluded/);
  assert.match(planView, /buildHydraulicRouteSegments/);
  assert.match(planView, /stabilityBoundary/);
  assert.match(endView, /cross slope represented by shifted COG envelope/);
  assert.doesNotMatch(endView, /Math\.tan\(\(model\.environment\.transverseSlopeDeg/);
  assert.match(sideView, /longitudinal slope represented by shifted COG envelope/);
  assert.doesNotMatch(sideView, /Math\.tan\(\(model\.environment\.longitudinalSlopeDeg/);
  assert.match(css, /--bg:\s*#050505/);
  assert.match(css, /@media \(max-width:\s*780px\)/);
  assert.match(css, /@media \(max-width:\s*450px\)/);
  assert.match(css, /\.mobile-workspace-nav/);
  assert.match(professionalCss, /\.workbench-grid\.navigation-collapsed/);
  assert.match(professionalCss, /\.arrangement-wizard-shell\.preview-expanded/);
  assert.doesNotMatch(serviceWorker, /autocad-export-key-v1\.json/);
  assert.doesNotMatch(serviceWorker, /Verification_Template|xlsm|xlsx/);
  assert.match(serviceWorker, /caches\.match/);
  assert.match(setupWizard, /Auto-calculate wind areas/);
  assert.match(setupWizard, /Auto-calculate COG envelope/);
  assert.match(setupWizard, /2\.5% of cargo length\/width/);
  assert.match(setupWizard, /0\.100 m automatic minimum/);
  assert.match(setupWizard, /advised manual minimum is 2%/);
  assert.match(setupWizard, /Start with the cargo envelope/);
  assert.doesNotMatch(workbench, /OptimiserWizard/);
  assert.doesNotMatch(workbench, /OptimisationWorkspace/);
  assert.match(workbench, /ArrangementWizard/);
  assert.match(optimiserDrawer, /Search activity/);
  assert.match(optimiserDrawer, /Copy complete log/);
  assert.match(optimiserDrawer, /Arrangement trade-offs/);
  assert.match(optimiserDrawer, /Pareto/);
  assert.match(optimiserDrawer, /Audit Markdown/);
  assert.match(optimiserDrawer, /Lossless JSON/);
  assert.match(optimiserDrawer, /Failures only/);
  assert.match(arrangementWizard, /ARRANGEMENT SEARCH/);
  assert.match(arrangementWizard, /Run arrangement search/);
  assert.match(arrangementWizard, /Mathematical branch/);
  assert.match(arrangementWizard, /Trailer deck height/);
  assert.match(arrangementWizard, /PPU location on every train/);
  assert.match(arrangementWizard, /Preferred centre spacing/);
  assert.match(arrangementWizard, /Enforce maximum overall width/);
  assert.match(arrangementWizard, /Search ceiling when width is off/);
  assert.match(arrangementWizard, /Ranking objective order/);
  assert.match(arrangementWizard, /Restore engineering default/);
  assert.match(arrangementWizard, /Save custom preset/);
  assert.match(arrangementEngine, /settings\.preferredCentreSpacingM/);
  assert.match(arrangementEngine, /mathematicalPitchSeeds/);
  assert.match(arrangementEngine, /modules4 \* 4 \+ modules5 \* 5 \+ modules6 \* 6/);
  assert.match(arrangementOptimiser, /runOptimiser\(exactModel/);
  assert.match(arrangementOptimiser, /Preferred and independent spacings verified/);
  assert.match(arrangementOptimiser, /trainCount - rightArrangement\.trainCount/);
  assert.match(windEngine, /lengthM \* heightM/);
  assert.match(windEngine, /widthM \* heightM/);
  assert.match(envelopeEngine, /CARGO_COG_ENVELOPE_FACTOR = 0\.02/);
  assert.match(resultPanels, /Hydraulic suspension/);
  assert.match(resultPanels, /Road traction and transport/);
  assert.match(resultPanels, /Cargo only/);
  assert.match(resultPanels, /All-inclusive combined COG/);
  assert.match(comparisonEngine, /AL-first/);
  assert.match(comparisonEngine, /Train-first/);
  assert.match(comparisonEngine, /dominatedBy/);
  assert.match(diagnosticsEngine, /trailer-stability-optimiser-audit/);
  assert.match(diagnosticsEngine, /Chronological activity/);
});
