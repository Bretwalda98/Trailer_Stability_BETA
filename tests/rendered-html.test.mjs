import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
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
  assert.match(html, /<title>Trailer Stability \| Native Engineering Suite<\/title>/i);
  assert.match(html, /Interactive engineering viewport/);
  assert.match(html, /Orthographic plan of the trailer transport arrangement/);
  assert.match(html, /Hydraulics/);
  assert.match(html, /Stability/);
  assert.match(html, /Spine beam/);
  assert.match(html, /Engineering details/);
  assert.match(html, /Run optimisation/);
  assert.match(html, /Results and selected item inspector/);
  assert.match(html, /manifest\.webmanifest/);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site/);
});

test("keeps phone, offline and workbook-verification capabilities wired", async () => {
  const [page, layout, manifest, workbench, engineHook, worker, planView, css, serviceWorker] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
    readFile(new URL("../app/components/TrailerWorkbench.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/hooks/useEngineeringEngine.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/workers/engineering.worker.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/components/workbench/views/PlanView.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
  ]);
  assert.match(page, /<TrailerWorkbench \/>/);
  assert.match(layout, /Trailer Stability \| Native Engineering Suite/);
  assert.match(manifest, /"display": "standalone"/);
  assert.match(workbench, /assetPath\("\/sw\.js"\)/);
  assert.match(workbench, /exportVerificationWorkbook/);
  assert.match(workbench, /importWorkbook/);
  assert.match(workbench, /aria-label="Mobile workspace"/);
  assert.match(engineHook, /deterministicInitialCalculation/);
  assert.match(engineHook, /new Worker\(new URL\("\.\.\/workers\/engineering\.worker\.ts"/);
  assert.match(worker, /calculateProject/);
  assert.match(worker, /runOptimiser/);
  assert.match(planView, /buildHydraulicRouteSegments/);
  assert.match(planView, /stabilityBoundary/);
  assert.match(css, /--bg:\s*#050505/);
  assert.match(css, /@media \(max-width:\s*780px\)/);
  assert.match(css, /@media \(max-width:\s*450px\)/);
  assert.match(css, /\.mobile-workspace-nav/);
  assert.match(serviceWorker, /Trailer_Stability_Verification_Template_v0\.7\.xlsm/);
  assert.match(serviceWorker, /caches\.match/);
});
