"use client";

import { IconChartLine, IconGeometry, IconHierarchy2 } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createDefaultModel, hydrateProjectModel } from "../data/default-model";
import { passToProject } from "../engine/optimiser";
import { WIZARD_DRAFT_STORAGE_KEY, type SetupSourceType } from "../engine/setup";
import type { PassResult, ProjectModel } from "../engine/types";
import {
  downloadBytes,
  downloadText,
  exportVerificationWorkbook,
  importWorkbook,
} from "../engine/workbook";
import { buildGeometryViewModel } from "../geometry/buildGeometryViewModel";
import { useEngineeringEngine } from "../hooks/useEngineeringEngine";
import { assetPath } from "../site-path";
import { CaseHeader } from "./workbench/CaseHeader";
import { EngineeringDetailsDrawer } from "./workbench/EngineeringDetailsDrawer";
import { EngineeringViewport } from "./workbench/EngineeringViewport";
import { HelpGuide } from "./workbench/HelpGuide";
import { ModelTree } from "./workbench/ModelTree";
import { OptimisationWorkspace } from "./workbench/OptimisationWorkspace";
import { OptimiserDrawer } from "./workbench/OptimiserDrawer";
import { ReportWorkspace } from "./workbench/ReportWorkspace";
import { ResultsInspector } from "./workbench/ResultsInspector";
import { SetupWizard } from "./workbench/SetupWizard";
import { StartupChooser } from "./workbench/StartupChooser";
import {
  DEFAULT_COG_VISIBILITY,
  DEFAULT_LAYERS,
  type ViewId,
  type ViewPreferences,
  type WorkspaceId,
} from "./workbench/types";

const LOCAL_PROJECT_KEY = "trailer-stability-project-v1";
const MOBILE_WORKSPACES: Array<{ id: WorkspaceId; label: string }> = [
  { id: "geometry", label: "Geometry" },
  { id: "hydraulics", label: "Hydraulics" },
  { id: "load-cases", label: "Load cases" },
  { id: "stability", label: "Stability" },
  { id: "spine-beam", label: "Spine beam" },
  { id: "optimise", label: "Optimise" },
  { id: "report", label: "Report" },
];
type MobilePanel = "workspace" | "model" | "results";

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
  const [detailsHeight, setDetailsHeight] = useState(245);
  const [detailsFullScreen, setDetailsFullScreen] = useState(false);
  const [optimiserOpen, setOptimiserOpen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("workspace");
  const [helpOpen, setHelpOpen] = useState(false);
  const [sourceBytes, setSourceBytes] = useState<ArrayBuffer | null>(null);
  const [optimiserStartModel, setOptimiserStartModel] = useState<ProjectModel | null>(null);
  const [undoModel, setUndoModel] = useState<ProjectModel | null>(null);
  const [saved, setSaved] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ text: string; type: "ok" | "error" } | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardInitialSource, setWizardInitialSource] = useState<
    Extract<SetupSourceType, "CURRENT" | "BLANK"> | undefined
  >(undefined);
  const [startupOpen, setStartupOpen] = useState(false);
  const [hasLocalProject, setHasLocalProject] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [persistActiveProject, setPersistActiveProject] = useState(false);
  const [optimiseAfterSetup, setOptimiseAfterSetup] = useState(false);
  const hydratedRef = useRef(false);

  const engine = useEngineeringEngine(model);
  const vm = useMemo(
    () => buildGeometryViewModel(engine.authoritativeModel, engine.result, preferences.loadCase),
    [engine.authoritativeModel, engine.result, preferences.loadCase],
  );

  useEffect(() => {
    if ("serviceWorker" in navigator && window.isSecureContext) {
      navigator.serviceWorker.register(assetPath("/sw.js")).catch(() => {
        // Offline installation is optional when a browser or host blocks service workers.
      });
    }
  }, []);

  useEffect(() => {
    if (window.matchMedia("(max-width: 900px)").matches) {
      setDetailsOpen(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (hydratedRef.current) return;
      hydratedRef.current = true;
      try {
        const stored = localStorage.getItem(LOCAL_PROJECT_KEY);
        if (stored) {
          setModel(hydrateProjectModel(JSON.parse(stored)));
          setPersistActiveProject(true);
          setHasLocalProject(true);
        }
      } catch {
        setToast({ text: "The saved local draft could not be read; the bundled case was loaded.", type: "error" });
        setHasLocalProject(false);
      } finally {
        setHydrated(true);
        setStartupOpen(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!hydrated || !persistActiveProject) return;
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
  }, [hydrated, model, persistActiveProject]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (engine.run.state !== "IDLE") setOptimiserOpen(true);
  }, [engine.run.state]);

  useEffect(() => {
    if (!optimiseAfterSetup || engine.authoritativeModel !== model || engine.calculating) return;
    setOptimiseAfterSetup(false);
    startOptimisation();
  }, [engine.authoritativeModel, engine.calculating, model, optimiseAfterSetup]);

  useEffect(() => {
    if (!vm.entityById.has(selectedId)) setSelectedId("project-case");
  }, [vm, selectedId]);

  const changeWorkspace = (next: WorkspaceId) => {
    setWorkspace(next);
    setMobilePanel("workspace");
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

  const handleImport = async (file: File): Promise<boolean> => {
    setBusy(true);
    try {
      const imported = await importWorkbook(file, model);
      setModel(imported.model);
      setPersistActiveProject(true);
      setHasLocalProject(true);
      setSourceBytes(imported.sourceBytes);
      setSelectedId("project-case");
      setWorkspace("geometry");
      setView("plan");
      setToast({
        text: `Verification data imported · ${imported.model.trailers.length} trailers · ${imported.model.catalogue.length} catalogue records.`,
        type: "ok",
      });
      return true;
    } catch (error) {
      setToast({ text: error instanceof Error ? error.message : String(error), type: "error" });
      return false;
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
      setToast({ text: "Verification data exported with a full recalculation requested on open.", type: "ok" });
    } catch (error) {
      setToast({ text: error instanceof Error ? error.message : String(error), type: "error" });
    } finally {
      setBusy(false);
    }
  };

  const handleImportProject = async (file: File): Promise<boolean> => {
    setBusy(true);
    try {
      const parsed = JSON.parse(await file.text());
      const hydrated = hydrateProjectModel(parsed);
      setModel(hydrated);
      setPersistActiveProject(true);
      setHasLocalProject(true);
      setSourceBytes(null);
      setToast({ text: "Standalone project imported.", type: "ok" });
      return true;
    } catch (error) {
      setToast({ text: error instanceof Error ? error.message : String(error), type: "error" });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleStartupFile = async (file: File): Promise<boolean> => {
    const opened = file.name.toLowerCase().endsWith(".json")
      ? await handleImportProject(file)
      : await handleImport(file);
    if (opened) setStartupOpen(false);
    return opened;
  };

  const startNewSetup = () => {
    localStorage.removeItem(WIZARD_DRAFT_STORAGE_KEY);
    setWizardInitialSource("BLANK");
    setStartupOpen(false);
    setWizardOpen(true);
  };

  const startOptimisation = () => {
    setOptimiserStartModel(structuredClone(model));
    setUndoModel(null);
    setDetailsOpen(false);
    setDetailsFullScreen(false);
    setOptimiserOpen(true);
    engine.resetRun();
    engine.startOptimisation();
  };

  const applyPass = (pass: PassResult) => {
    setPersistActiveProject(true);
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
    setPersistActiveProject(true);
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
        onSetup={() => {
          setWizardInitialSource(undefined);
          setWizardOpen(true);
        }}
        onHelp={() => setHelpOpen(true)}
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
      <StartupChooser
        open={startupOpen}
        busy={busy}
        hasLocalProject={hasLocalProject}
        onNewSetup={startNewSetup}
        onOpenFile={handleStartupFile}
        onContinue={() => setStartupOpen(false)}
      />
      <HelpGuide open={helpOpen} onClose={() => setHelpOpen(false)} />
      {wizardOpen && (
        <SetupWizard
          activeModel={model}
          activeSourceBytes={sourceBytes}
          initialSourceType={wizardInitialSource}
          onClose={() => {
            setWizardOpen(false);
            setWizardInitialSource(undefined);
          }}
          onApply={(nextModel, nextSourceBytes, runOptimisation) => {
            setModel(nextModel);
            setPersistActiveProject(true);
            setHasLocalProject(true);
            setSourceBytes(nextSourceBytes);
            setSelectedId("project-case");
            setWorkspace("geometry");
            setView("plan");
            setWizardOpen(false);
            setWizardInitialSource(undefined);
            setOptimiseAfterSetup(runOptimisation);
            setToast({
              text: runOptimisation
                ? "Setup applied. The authoritative case is recalculating before optimisation starts."
                : "Setup applied to the active case.",
              type: "ok",
            });
          }}
        />
      )}
      <div className={`workbench-grid mobile-panel-${mobilePanel}`}>
        <div className="mobile-workspace-nav">
          <label>
            <span>Workspace</span>
            <select
              aria-label="Mobile workspace"
              value={workspace === "model" ? "geometry" : workspace}
              onChange={(event) => changeWorkspace(event.target.value as WorkspaceId)}
            >
              {MOBILE_WORKSPACES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <div className="mobile-panel-switch" role="tablist" aria-label="Mobile workbench panel">
            <button
              role="tab"
              aria-label="View"
              aria-selected={mobilePanel === "workspace"}
              className={mobilePanel === "workspace" ? "active" : ""}
              onClick={() => setMobilePanel("workspace")}
            >
              <IconGeometry size={15} /> <span>View</span>
            </button>
            <button
              role="tab"
              aria-label="Model"
              aria-selected={mobilePanel === "model"}
              className={mobilePanel === "model" ? "active" : ""}
              onClick={() => setMobilePanel("model")}
            >
              <IconHierarchy2 size={15} /> <span>Model</span>
            </button>
            <button
              role="tab"
              aria-label="Results"
              aria-selected={mobilePanel === "results"}
              className={mobilePanel === "results" ? "active" : ""}
              onClick={() => setMobilePanel("results")}
            >
              <IconChartLine size={15} /> <span>Results</span>
            </button>
          </div>
        </div>
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
          height={detailsHeight}
          fullScreen={detailsFullScreen}
          onOpenChange={setDetailsOpen}
          onHeightChange={setDetailsHeight}
          onFullScreenChange={setDetailsFullScreen}
          onModelChange={setModel}
        />
      </div>
      <footer className="application-statusbar">
        <span>Load case · {preferences.loadCase}</span>
        <span>Engineering verification degree · {model.engineeringDegree}</span>
        <span>Weight / COG reference · {model.weightCogReference}</span>
        <span>Load datum / reference point · {model.referencePoint}</span>
      </footer>
      {toast && <div className={`toast toast-${toast.type}`}>{toast.text}</div>}
    </main>
  );
}
