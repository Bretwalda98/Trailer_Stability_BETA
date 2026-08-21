"use client";

import {
  IconChevronDown,
  IconDownload,
  IconEdit,
  IconExternalLink,
  IconFileSpreadsheet,
  IconFileText,
  IconFileImport,
  IconHelpCircle,
  IconPlayerPlay,
  IconPlayerStop,
  IconRefresh,
  IconTargetArrow,
} from "@tabler/icons-react";
import { useRef, useState } from "react";
import type { OptimiserRun, ProjectModel } from "../../engine/types";

interface CaseHeaderProps {
  model: ProjectModel;
  run: OptimiserRun;
  calculating: boolean;
  saved: boolean;
  busy: boolean;
  onSetup(): void;
  onExportAutoCAD(): void;
  onExportAutoCADDxf(): void;
  onExportCaseText(): void;
  onExportExcel(): void;
  onExportProject(): void;
  onImportProject(file: File): void;
  onHelp(): void;
  onArrangementSetup(): void;
  onStop(): void;
  onReset(): void;
}

export function CaseHeader({
  model,
  run,
  calculating,
  saved,
  busy,
  onSetup,
  onExportAutoCAD,
  onExportAutoCADDxf,
  onExportCaseText,
  onExportExcel,
  onExportProject,
  onImportProject,
  onHelp,
  onArrangementSetup,
  onStop,
  onReset,
}: CaseHeaderProps) {
  const projectInput = useRef<HTMLInputElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const running = run.state === "RUNNING" || run.state === "PLANNING";
  return (
    <header className="case-header">
      <div className="product-title">
        <span className="product-mark" aria-hidden="true">TS</span>
        <div>
          <b>Trailer Stability</b>
          <span>Engineering workbench</span>
        </div>
      </div>
      <div className="case-identity">
        <div>
          <span>Client</span>
          <b>{model.cargo.clientReference || "No client reference"}</b>
        </div>
        <i />
        <div>
          <span>Case</span>
          <b>{model.cargo.name || "Untitled case"}</b>
        </div>
      </div>
      <div className="save-state" aria-live="polite">
        <i className={saved ? "saved" : "saving"} />
        <span>{saved ? "Saved on this device" : "Saving…"}</span>
        {calculating && <em>Recalculating</em>}
      </div>
      <div className="header-actions">
        <input
          ref={projectInput}
          hidden
          type="file"
          accept=".json"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onImportProject(file);
            event.currentTarget.value = "";
          }}
        />
        <button className="setup-action" aria-label="Edit case inputs" disabled={busy} onClick={onSetup}>
          <IconEdit size={15} /> <span>Edit inputs</span>
        </button>
        <button className="mobile-optional" aria-label="Open project JSON" disabled={busy} onClick={() => projectInput.current?.click()}>
          <IconFileImport size={15} /> <span>Open</span>
        </button>
        <button className="mobile-optional autocad-export-action" aria-label="Export to AutoCAD" disabled={busy} onClick={onExportAutoCAD}>
          <IconExternalLink size={15} /> <span>AutoCAD</span>
        </button>
        <button className="help-action" aria-label="Open help and user guide" onClick={onHelp}>
          <IconHelpCircle size={15} /> <span>Help</span>
        </button>
        <button
          className={running ? "run-action running" : "run-action"}
          aria-label={running ? "Stop arrangement search" : "Find a trailer arrangement"}
          disabled={busy}
          onClick={running ? onStop : onArrangementSetup}
        >
          {running ? <IconPlayerStop size={15} /> : <IconPlayerPlay size={15} />}
          <span>{running ? "Stop search" : "Find arrangement"}</span>
        </button>
        <div className="header-menu">
          <button
            className="menu-trigger"
            aria-label="More case actions"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((current) => !current)}
          >
            <IconChevronDown size={15} />
          </button>
          {menuOpen && (
            <div className="header-menu-popover">
              {!running && <button onClick={() => { onArrangementSetup(); setMenuOpen(false); }}><IconTargetArrow size={14} /> Find a trailer arrangement</button>}
              <button onClick={() => { onSetup(); setMenuOpen(false); }}><IconEdit size={14} /> Edit case inputs</button>
              <button onClick={() => { onExportAutoCAD(); setMenuOpen(false); }}><IconExternalLink size={14} /> AutoCAD compact case data</button>
              <button onClick={() => { onExportAutoCADDxf(); setMenuOpen(false); }}><IconExternalLink size={14} /> AutoCAD direct drawing (DXF)</button>
              <button onClick={() => { onExportExcel(); setMenuOpen(false); }}><IconFileSpreadsheet size={14} /> Export Excel calculation</button>
              <button onClick={() => { onExportCaseText(); setMenuOpen(false); }}><IconFileText size={14} /> Export detailed text record</button>
              <button onClick={() => { onExportProject(); setMenuOpen(false); }}><IconDownload size={14} /> Export project JSON</button>
              <button onClick={() => { projectInput.current?.click(); setMenuOpen(false); }}><IconFileImport size={14} /> Import project JSON</button>
              <button onClick={() => { onHelp(); setMenuOpen(false); }}><IconHelpCircle size={14} /> Help and user guide</button>
              <button onClick={() => { onReset(); setMenuOpen(false); }}><IconRefresh size={14} /> Reset example</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
