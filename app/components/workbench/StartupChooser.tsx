"use client";

import {
  IconFileImport,
  IconFolderOpen,
  IconLoader2,
  IconPlus,
  IconRestore,
  IconTargetArrow,
} from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";

interface StartupChooserProps {
  open: boolean;
  busy: boolean;
  hasLocalProject: boolean;
  onFastArrangement(): void;
  onNewSetup(): void;
  onOpenFile(file: File): Promise<boolean>;
  onContinue(): void;
}

export function StartupChooser({
  open,
  busy,
  hasLocalProject,
  onFastArrangement,
  onNewSetup,
  onOpenFile,
  onContinue,
}: StartupChooserProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const newSetupRef = useRef<HTMLButtonElement>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setNotice(null);
      dialog.showModal();
      window.setTimeout(() => newSetupRef.current?.focus(), 0);
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const chooseFile = async (file: File | undefined) => {
    if (!file) return;
    setNotice(null);
    const opened = await onOpenFile(file);
    if (!opened) {
      setNotice("That file could not be opened. Check that it is a valid saved project or verification export.");
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="startup-choice-dialog"
      aria-labelledby="startup-choice-title"
      onCancel={(event) => event.preventDefault()}
    >
      <div className="startup-choice-shell">
        <header>
          <span>TRAILER STABILITY</span>
          <h2 id="startup-choice-title">How would you like to start?</h2>
          <p>Start a guided setup or open a case you saved earlier.</p>
        </header>

        <div className="startup-choice-options">
          <button ref={newSetupRef} className="startup-primary startup-fast-arrangement" disabled={busy} onClick={onFastArrangement}>
            <IconTargetArrow size={22} />
            <span>
              <b>Mathematical arrangement optimiser</b>
              <small>Find the fewest trains and axle lines using capacity bounds, exact module rules, COG-height stability spacing and solved X/Y limits.</small>
            </span>
          </button>

          <button disabled={busy} onClick={onNewSetup}>
            <IconPlus size={22} />
            <span>
              <b>Build an arrangement manually</b>
              <small>Use the complete legacy seven-step case, trailer and hydraulics setup.</small>
            </span>
          </button>

          <button disabled={busy} onClick={() => fileInputRef.current?.click()}>
            {busy ? <IconLoader2 className="spin" size={22} /> : <IconFolderOpen size={22} />}
            <span>
              <b>{busy ? "Opening file…" : "Open saved file"}</b>
              <small>Load a standalone project or an exported verification file.</small>
            </span>
          </button>
        </div>

        {hasLocalProject && (
          <button className="startup-continue" disabled={busy} onClick={onContinue}>
            <IconRestore size={17} />
            <span>
              <b>Continue saved case</b>
              <small>Resume the case stored on this device.</small>
            </span>
          </button>
        )}

        {notice && <p className="startup-choice-notice" role="alert">{notice}</p>}

        <footer>
          <IconFileImport size={14} />
          Files and engineering calculations stay local in this browser. Legacy optimiser controls remain available after opening a case.
        </footer>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.xlsm,.xlsx"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            void chooseFile(file);
          }}
        />
      </div>
    </dialog>
  );
}
