"use client";

import {
  IconChevronDown,
  IconDownload,
  IconFileImport,
  IconHelpCircle,
  IconPlayerPlay,
  IconPlayerStop,
  IconRefresh,
  IconSettings,
  IconUpload,
} from "@tabler/icons-react";
import { useRef, useState } from "react";
import type { OptimiserRun, ProjectModel } from "../../engine/types";

interface CaseHeaderProps {
  model: ProjectModel;
  run: OptimiserRun;
  calculating: boolean;
  saved: boolean;
  busy: boolean;
  onImport(file: File): void;
  onSetup(): void;
  onExportWorkbook(): void;
  onExportProject(): void;
  onImportProject(file: File): void;
  onHelp(): void;
  onRun(): void;
  onStop(): void;
  onReset(): void;
}

export function CaseHeader({
  model,
  run,
  calculating,
  saved,
  busy,
  onImport,
  onSetup,
  onExportWorkbook,
  onExportProject,
  onImportProject,
  onHelp,
  onRun,
  onStop,
  onReset,
}: CaseHeaderProps) {
  const workbookInput = useRef<HTMLInputElement>(null);
  const projectInput = useRef<HTMLInputElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const running = run.state === "RUNNING" || run.state === "PLANNING";
  return (
    <header className="case-header">
      <div className="product-title">
        <b>Trailer Stability</b>
        <span>v0.7 web engine</span>
      </div>
      <div className="case-identity">
        <span>Project</span>
        <b>{model.cargo.clientReference || "No client reference"}</b>
        <i />
        <span>Case</span>
        <b>{model.cargo.name || "Untitled case"}</b>
        <IconChevronDown size={13} />
      </div>
      <div className="save-state">
        <i className={saved ? "saved" : "saving"} />
        <span>{saved ? "Saved locally" : "Saving…"}</span>
        {calculating && <em>Calculating</em>}
      </div>
      <div className="header-actions">
        <input
          ref={workbookInput}
          hidden
          type="file"
          accept=".xlsm,.xlsx"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onImport(file);
            event.currentTarget.value = "";
          }}
        />
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
        <button className="setup-action" aria-label="Set up case" disabled={busy} onClick={onSetup}>
          <IconSettings size={15} /> <span>Set up case</span>
        </button>
        <button className="mobile-optional" aria-label="Import verification data" disabled={busy} onClick={() => workbookInput.current?.click()}>
          <IconUpload size={15} /> <span>Import</span>
        </button>
        <button className="mobile-optional" aria-label="Export verification data" disabled={busy} onClick={onExportWorkbook}>
          <IconDownload size={15} /> <span>Export verification</span>
        </button>
        <button className="help-action" aria-label="Open help and user guide" onClick={onHelp}>
          <IconHelpCircle size={15} /> <span>Help</span>
        </button>
        <button
          className={running ? "run-action running" : "run-action"}
          aria-label={running ? "Stop optimisation" : "Run optimisation"}
          disabled={busy}
          onClick={running ? onStop : onRun}
        >
          {running ? <IconPlayerStop size={15} /> : <IconPlayerPlay size={15} />}
          <span>{running ? "Stop optimisation" : "Run optimisation"}</span>
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
              <button onClick={() => { workbookInput.current?.click(); setMenuOpen(false); }}><IconUpload size={14} /> Import verification data</button>
              <button onClick={() => { onExportWorkbook(); setMenuOpen(false); }}><IconDownload size={14} /> Export verification data</button>
              <button onClick={() => { onHelp(); setMenuOpen(false); }}><IconHelpCircle size={14} /> Help and user guide</button>
              <button onClick={() => { onExportProject(); setMenuOpen(false); }}><IconDownload size={14} /> Export project JSON</button>
              <button onClick={() => { projectInput.current?.click(); setMenuOpen(false); }}><IconFileImport size={14} /> Import project JSON</button>
              <button onClick={() => { onReset(); setMenuOpen(false); }}><IconRefresh size={14} /> Reset example</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
