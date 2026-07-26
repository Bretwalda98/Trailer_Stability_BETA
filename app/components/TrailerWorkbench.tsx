"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createDefaultModel, hydrateProjectModel } from "../data/default-model";
import { passToProject } from "../engine/optimiser";
import type { PassResult, ProjectModel } from "../engine/types";
import {
  downloadBytes,
  downloadText,
  exportVerificationWorkbook,
  importWorkbook,
} from "../engine/workbook";
import { buildGeometryViewModel } from "../geometry/buildGeometryViewModel";
import { useEngineeringEngine } from "../hooks/useEngineeringEngine";
import { CaseHeader } from "./workbench/CaseHeader";
import { EngineeringDetailsDrawer } from "./workbench/EngineeringDetailsDrawer";
import { EngineeringViewport } from "./workbench/EngineeringViewport";
import { ModelTree } from "./workbench/ModelTree";
import { OptimisationWorkspace } from "./workbench/OptimisationWorkspace";
import { OptimiserDrawer } from "./workbench/OptimiserDrawer";
import { ReportWorkspace } from "./workbench/ReportWorkspace";
import { ResultsInspector } from "./workbench/ResultsInspector";
import {
  DEFAULT_COG_VISIBILITY,
  DEFAULT_LAYERS,
  type ViewId,
  type ViewPreferences,
  type WorkspaceId,
} from "./workbench/types";

const LOCAL_PROJECT_KEY = "trailer-stability-project-v1";
const MOBILE_WORKSPACES: Array<{ id: WorkspaceId; label: string }> = [
  { id: "model", label: "Model" },
  { id: "geometry", label: "Geometry" },
  { id: "hydraulics", label: "Hydraulics" },
  { id: "load-cases", label: "Load cases" },
  { id: "stability", label: "Stability" },
  { id: "spine-beam", label: "Spine beam" },
  { id: "optimise", label: "Optimise" },
  { id: "report", label: "Report" },
];

export default function TrailerWorkbench() {
  const [model, setModel] = useState<ProjectModel>(() => createDefaultModel());
  const [workspace, setWorkspace] = useState<WorkspaceId>("geometry");
  const [view, setView] = useState<ViewId>("plan");
  const [preferences, setPreferences] = useState<ViewPreferences>({
    layers: { ...DEFAULT_LAYERS },
    visibleCogs: { ...DEFAULT_COG_VISIBILITY },
    dimensions: true,
    legend: true,
    grid: true,
    loadCase: "dynamic",
  });
  const [selectedId, setSelectedId] = useState("project-case");
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [optimiserOpen, setOptimiserOpen] = useState(false);
  const [sourceBytes, setSourceBytes] = useState<ArrayBuffer | null>(null);
  const [optimiserStartModel, setOptimiserStartModel] = useState<ProjectModel | null>(null);
  const [undoModel, setUndoModel] = useState<ProjectModel | null>(null);
  const [saved, setSaved] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ text: string; type: "ok" | "error" } | null>(null);
  const hydratedRef = useRef(false);

  const engine = useEngineeringEngine(model);
  const vm = useMemo(
    () => buildGeometryViewModel(model, engine.result, preferences.loadCase),
    [model, engine.result, preferences.loadCase],
  );

  useEffect(() => {
    if ("serviceWorker" in navigator && window.isSecureContext) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Offline installation is optional when a browser or host blocks service workers.
      });
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (hydratedRef.current) return;
      hydratedRef.current = true;
      try {
        const stored = localStorage.getItem(LOCAL_PROJECT_KEY);
        if (stored) setModel(hydrateProjectModel(JSON.parse(stored)));
      } catch {
        setToast({ text: "The saved local draft could not be read; the bundled case was loaded.", type: "error" });
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    setSaved(false);
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(LOCAL_PROJECT_KEY, JSON.stringify(model));
        setSaved(true);
      } catch {
        setSaved(false);
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [model]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (engine.run.state !== "IDLE") setOptimiserOpen(true);
  }, [engine.run.state]);

  useEffect(() => {
    if (!vm.entityById.has(selectedId)) setSelectedId("project-case");
  }, [vm, selectedId]);

  const changeWorkspace = (next: WorkspaceId) => {
    setWorkspace(next);
    if (next === "model") {
      setView("plan");
      setDetailsOpen(true);
    } else if (next === "geometry") {
      setView("plan");
    } else if (next === "hydraulics") {
      setView("hydraulics");
    } else if (next === "load-cases" || next === "stability") {
      setView("stability");
    } else if (next === "spine-beam") {
      setView("beam");
    }
  };

  const changeView = (next: ViewId) => {
    setView(next);
    if (next === "hydraulics") setWorkspace("hydraulics");
    else if (next === "stability") setWorkspace("stability");
    else if (next === "beam") setWorkspace("spine-beam");
    else setWorkspace("geometry");
  };

  const handleImport = async (file: File) => {
    setBusy(true);
    try {
      const imported = await importWorkbook(file, model);
      setModel(imported.model);
      setSourceBytes(imported.sourceBytes);
      setSelectedId("project-case");
      setWorkspace("geometry");
      setView("plan");
      setToast({
        text: `${file.name} imported · ${imported.model.trailers.length} trailers · ${imported.model.catalogue.length} catalogue records.`,
        type: "ok",
      });
    } catch (error) {
      setToast({ text: error instanceof Error ? error.message : String(error), type: "error" });
    } finally {
      setBusy(false);
    }
  };

  const handleExportWorkbook = async () => {
    setBusy(true);
    try {
      const bytes = await exportVerificationWorkbook(model, sourceBytes ?? undefined);
      downloadBytes(
        bytes,
        `Trailer_Stability_Verification_${new Date().toISOString().slice(0, 10)}.xlsm`,
        "application/vnd.ms-excel.sheet.macroEnabled.12",
      );
      setToast({ text: "Verification XLSM exported with a full recalculation requested on open.", type: "ok" });
    } catch (error) {
      setToast({ text: error instanceof Error ? error.message : String(error), type: "error" });
    } finally {
      setBusy(false);
    }
  };

  const handleImportProject = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text());
      const hydrated = hydrateProjectModel(parsed);
      setModel(hydrated);
      setSourceBytes(null);
      setToast({ text: "Standalone project imported.", type: "ok" });
    } catch (error) {
      setToast({ text: error instanceof Error ? error.message : String(error), type: "error" });
    }
  };

  const startOptimisation = () => {
    setOptimiserStartModel(structuredClone(model));
    setUndoModel(null);
    setDetailsOpen(false);
    setOptimiserOpen(true);
    engine.resetRun();
    engine.startOptimisation();
  };

  const applyPass = (pass: PassResult) => {
    setUndoModel(structuredClone(model));
    setModel(passToProject(model, pass));
    setWorkspace("geometry");
    setView("plan");
    setSelectedId("project-case");
    setToast({ text: `${pass.id} applied. The complete case is recalculating in the engineering worker.`, type: "ok" });
  };

  const undoAppliedPass = () => {
    if (!undoModel) return;
    setModel(undoModel);
    setUndoModel(null);
    setToast({ text: "The pre-optimisation configuration was restored.", type: "ok" });
  };

  const reset = () => {
    if (!window.confirm("Reset the current case to the bundled v0.7 example?")) return;
    setModel(createDefaultModel());
    setSourceBytes(null);
    setOptimiserStartModel(null);
    setUndoModel(null);
    engine.resetRun();
    setSelectedId("project-case");
    setWorkspace("geometry");
    setView("plan");
  };

  const centralWorkspace =
    workspace === "optimise" ? (
      <OptimisationWorkspace model={model} onModelChange={setModel} />
    ) : workspace === "report" ? (
      <ReportWorkspace model={model} vm={vm} />
    ) : (
      <EngineeringViewport
        vm={vm}
        view={view}
        preferences={preferences}
        selectedId={selectedId}
        onViewChange={changeView}
        onPreferencesChange={setPreferences}
        onSelect={setSelectedId}
        onModelChange={setModel}
      />
    );

  return (
    <main className="trailer-stability-app">
      <CaseHeader
        model={model}
        run={engine.run}
        calculating={engine.calculating}
        saved={saved}
        busy={busy}
        onImport={handleImport}
        onExportWorkbook={handleExportWorkbook}
        onExportProject={() =>
          downloadText(
            JSON.stringify(model, null, 2),
            `Trailer_Stability_Project_${new Date().toISOString().slice(0, 10)}.json`,
            "application/json",
          )
        }
        onImportProject={handleImportProject}
        onRun={startOptimisation}
        onStop={engine.cancelOptimisation}
        onReset={reset}
      />
      <div className="workbench-grid">
        <label className="mobile-workspace-nav">
          <span>Workspace</span>
          <select
            aria-label="Mobile workspace"
            value={workspace}
            onChange={(event) => changeWorkspace(event.target.value as WorkspaceId)}
          >
            {MOBILE_WORKSPACES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <ModelTree
          model={model}
          vm={vm}
          workspace={workspace}
          selectedId={selectedId}
          onWorkspaceChange={changeWorkspace}
          onSelect={setSelectedId}
          onModelChange={setModel}
          onOpenDetails={() => setDetailsOpen(true)}
        />
        <div className="central-workspace">{centralWorkspace}</div>
        <ResultsInspector
          model={model}
          result={engine.result}
          vm={vm}
          selectedId={selectedId}
          calculating={engine.calculating}
          workerReady={engine.workerReady}
          workerError={engine.error}
          onModelChange={setModel}
          onSelect={setSelectedId}
          onNavigate={changeWorkspace}
        />
      </div>
      <div className="lower-drawers">
        <OptimiserDrawer
          run={engine.run}
          open={optimiserOpen}
          startModel={optimiserStartModel}
          canUndo={Boolean(undoModel)}
          onOpenChange={setOptimiserOpen}
          onCancel={engine.cancelOptimisation}
          onApply={applyPass}
          onUndo={undoAppliedPass}
        />
        <EngineeringDetailsDrawer
          model={model}
          result={engine.result}
          open={detailsOpen}
          onOpenChange={setDetailsOpen}
          onModelChange={setModel}
        />
      </div>
      <footer className="application-statusbar">
        <span>Load case · {preferences.loadCase}</span>
        <span>Engineering verification degree (F17) · {model.engineeringDegree}</span>
        <span>Weight / COG reference (J22) · {model.weightCogReference}</span>
        <span>Load datum / reference point (D48) · {model.referencePoint}</span>
      </footer>
      {toast && <div className={`toast toast-${toast.type}`}>{toast.text}</div>}
    </main>
  );
}
