"use client";

import {
  IconChevronDown,
  IconDownload,
  IconFileImport,
  IconPlayerPlay,
  IconPlayerStop,
  IconRefresh,
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
  onExportWorkbook(): void;
  onExportProject(): void;
  onImportProject(file: File): void;
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
  onExportWorkbook,
  onExportProject,
  onImportProject,
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
      <div className="source-name" title={model.sourceWorkbook}>
        {model.sourceWorkbook}
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
        <button disabled={busy} onClick={() => workbookInput.current?.click()}>
          <IconUpload size={15} /> Import
        </button>
        <button disabled={busy} onClick={onExportWorkbook}>
          <IconDownload size={15} /> Export XLSM
        </button>
        <button
          className={running ? "run-action running" : "run-action"}
          disabled={busy}
          onClick={running ? onStop : onRun}
        >
          {running ? <IconPlayerStop size={15} /> : <IconPlayerPlay size={15} />}
          {running ? "Stop optimisation" : "Run optimisation"}
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
