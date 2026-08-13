"use client";

import { IconChartLine, IconGeometry, IconHierarchy2 } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createDefaultModel, hydrateProjectModel } from "../data/default-model";
import { passToProject } from "../engine/optimiser";
import type { SetupSourceType } from "../engine/setup";
import type { PassResult, ProjectModel } from "../engine/types";
import { downloadText } from "../engine/download";
import { buildAutocadExport } from "../engine/autocad-export";
import { buildGeometryViewModel } from "../geometry/buildGeometryViewModel";
import { useEngineeringEngine } from "../hooks/useEngineeringEngine";
import { assetPath } from "../site-path";
import { CaseHeader } from "./workbench/CaseHeader";
import {
  ARRANGEMENT_WIZARD_DRAFT_KEY,
  ArrangementWizard,
} from "./workbench/ArrangementWizard";
import { EngineeringDetailsDrawer } from "./workbench/EngineeringDetailsDrawer";
import { EngineeringViewport } from "./workbench/EngineeringViewport";
import { HelpGuide } from "./workbench/HelpGuide";
import { ModelTree } from "./workbench/ModelTree";
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
  { id: "geometry", label: "Arrangement" },
  { id: "hydraulics", label: "Hydraulics" },
  { id: "load-cases", label: "Load cases" },
  { id: "stability", label: "Stability" },
  { id: "spine-beam", label: "Spine beam" },
  { id: "report", label: "Report" },
];
type MobilePanel = "workspace" | "model" | "results";

function createAutoCADTransferCode(): string {
  const values = new Uint32Array(1);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(values);
    return String(values[0] % 1_000_000).padStart(6, "0");
  }
  return String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
}

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
  const [optimiserStartModel, setOptimiserStartModel] = useState<ProjectModel | null>(null);
  const [undoModel, setUndoModel] = useState<ProjectModel | null>(null);
  const [saved, setSaved] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ text: string; type: "ok" | "error" } | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [arrangementWizardOpen, setArrangementWizardOpen] = useState(false);
  const [arrangementWizardInitialSource, setArrangementWizardInitialSource] = useState<
    "CURRENT" | "BLANK"
  >("CURRENT");
  const [wizardInitialSource, setWizardInitialSource] = useState<
    Extract<SetupSourceType, "CURRENT" | "BLANK"> | undefined
  >(undefined);
  const [startupOpen, setStartupOpen] = useState(false);
  const [hasLocalProject, setHasLocalProject] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [persistActiveProject, setPersistActiveProject] = useState(false);
  const [optimiseAfterSetup, setOptimiseAfterSetup] = useState(false);
  const [navigationCollapsed, setNavigationCollapsed] = useState(false);
  const hydratedRef = useRef(false);

  const engine = useEngineeringEngine(model);
  const vm = useMemo(
    () => buildGeometryViewModel(engine.authoritativeModel, engine.result, preferences.loadCase),
    [engine.authoritativeModel, engine.result, preferences.loadCase],
  );

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
    if (process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register(assetPath("/sw.js")).catch(() => {
        // Offline installation is optional when a browser or host blocks service workers.
      });
      return;
    }
    // A production service worker can otherwise keep serving cached modules
    // after the same origin is reopened with the local development server.
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations
        .filter((registration) => registration.scope.startsWith(window.location.origin))
        .forEach((registration) => void registration.unregister());
    }).catch(() => undefined);
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

  const handleExportAutoCAD = async () => {
    setBusy(true);
    const code = createAutoCADTransferCode();
    try {
      const payload = buildAutocadExport(model, engine.result, new Date().toISOString());
      const payloadFilename = `trailer-stability-autocad-${code}.json`;
      downloadText(JSON.stringify(payload, null, 2), payloadFilename, "application/json");
      setToast({
        text: `AutoCAD case exported as ${payloadFilename}. In AutoCAD run SARTDJSON and select this numbered case file.`,
        type: "ok",
      });
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
    const opened = await handleImportProject(file);
    if (opened) setStartupOpen(false);
    return opened;
  };

  const startNewFastArrangement = () => {
    localStorage.removeItem(ARRANGEMENT_WIZARD_DRAFT_KEY);
    setArrangementWizardInitialSource("BLANK");
    setStartupOpen(false);
    setArrangementWizardOpen(true);
  };

  const startArrangementOptimisation = () => {
    setOptimiserStartModel(structuredClone(model));
    setUndoModel(null);
    setDetailsOpen(false);
    setDetailsFullScreen(false);
    setOptimiserOpen(true);
    engine.resetRun();
    engine.startArrangementOptimisation();
  };

  useEffect(() => {
    if (!optimiseAfterSetup || engine.authoritativeModel !== model || engine.calculating) return;
    setOptimiseAfterSetup(false);
    startArrangementOptimisation();
  }, [engine.authoritativeModel, engine.calculating, model, optimiseAfterSetup]);

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
    setOptimiserStartModel(null);
    setUndoModel(null);
    engine.resetRun();
    setSelectedId("project-case");
    setWorkspace("geometry");
    setView("plan");
  };

  const centralWorkspace =
    workspace === "report" ? (
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
        onArrangementSetup={() => {
          setArrangementWizardInitialSource("CURRENT");
          setArrangementWizardOpen(true);
        }}
        onExportAutoCAD={handleExportAutoCAD}
        onExportProject={() =>
          downloadText(
            JSON.stringify(model, null, 2),
            `Trailer_Stability_Project_${new Date().toISOString().slice(0, 10)}.json`,
            "application/json",
          )
        }
        onImportProject={handleImportProject}
        onStop={engine.cancelOptimisation}
        onReset={reset}
      />
      <StartupChooser
        open={startupOpen}
        busy={busy}
        hasLocalProject={hasLocalProject}
        onFastArrangement={startNewFastArrangement}
        onOpenFile={handleStartupFile}
        onContinue={() => setStartupOpen(false)}
      />
      <HelpGuide open={helpOpen} onClose={() => setHelpOpen(false)} />
      {wizardOpen && (
        <SetupWizard
          activeModel={model}
          initialSourceType={wizardInitialSource}
          onClose={() => {
            setWizardOpen(false);
            setWizardInitialSource(undefined);
          }}
          onApply={(nextModel, runOptimisation) => {
            setModel(nextModel);
            setPersistActiveProject(true);
            setHasLocalProject(true);
            setSelectedId("project-case");
            setWorkspace("geometry");
            setView("plan");
            setWizardOpen(false);
            setWizardInitialSource(undefined);
            if (runOptimisation) {
              setArrangementWizardInitialSource("CURRENT");
              setArrangementWizardOpen(true);
            }
            setToast({
              text: runOptimisation
                ? "Case inputs applied. Review the arrangement-search limits before starting."
                : "Setup applied to the active case.",
              type: "ok",
            });
          }}
        />
      )}
      {arrangementWizardOpen && (
        <ArrangementWizard
          activeModel={model}
          calculating={engine.calculating}
          initialSourceType={arrangementWizardInitialSource}
          onClose={() => {
            setArrangementWizardOpen(false);
            setArrangementWizardInitialSource("CURRENT");
          }}
          onApply={(nextModel, runOptimisation) => {
            setModel(nextModel);
            setPersistActiveProject(true);
            setHasLocalProject(true);
            setArrangementWizardOpen(false);
            setArrangementWizardInitialSource("CURRENT");
            if (runOptimisation) {
              setOptimiseAfterSetup(true);
              setToast({
                text: "Search inputs applied. The authoritative case is recalculating before the arrangement search starts.",
                type: "ok",
              });
            } else {
              setWorkspace("geometry");
              setView("plan");
              setToast({ text: "Arrangement-search inputs saved to the active case.", type: "ok" });
            }
          }}
        />
      )}
      <div className={`workbench-grid mobile-panel-${mobilePanel}${navigationCollapsed ? " navigation-collapsed" : ""}`}>
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
          collapsed={navigationCollapsed}
          onCollapsedChange={setNavigationCollapsed}
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
        <span>Load case Â· {preferences.loadCase}</span>
        <span>Engineering verification degree Â· {model.engineeringDegree}</span>
        <span>Weight / COG reference Â· {model.weightCogReference}</span>
        <span>Load datum / reference point Â· {model.referencePoint}</span>
      </footer>
      {toast && <div className={`toast toast-${toast.type}`}>{toast.text}</div>}
    </main>
  );
}
