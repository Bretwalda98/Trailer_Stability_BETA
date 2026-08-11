"use client";

import {
  IconFileImport,
  IconFolderOpen,
  IconLoader2,
  IconRestore,
  IconTargetArrow,
} from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";

interface StartupChooserProps {
  open: boolean;
  busy: boolean;
  hasLocalProject: boolean;
  onFastArrangement(): void;
  onOpenFile(file: File): Promise<boolean>;
  onContinue(): void;
}

export function StartupChooser({
  open,
  busy,
  hasLocalProject,
  onFastArrangement,
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
          <span>SPMT ARRANGEMENT AND STABILITY</span>
          <h2 id="startup-choice-title">Start a case</h2>
          <p>Create a new arrangement search or open existing case data.</p>
        </header>

        <div className="startup-choice-options">
          <button ref={newSetupRef} className="startup-primary startup-fast-arrangement" disabled={busy} onClick={onFastArrangement}>
            <IconTargetArrow size={22} />
            <span>
              <b>New arrangement search</b>
              <small>Define route conditions, cargo, packing, supports and available SPMT stock, then find the minimum buildable formation.</small>
            </span>
          </button>

          <button disabled={busy} onClick={() => fileInputRef.current?.click()}>
            {busy ? <IconLoader2 className="spin" size={22} /> : <IconFolderOpen size={22} />}
            <span>
              <b>{busy ? "Opening file…" : "Open case"}</b>
              <small>Open project JSON or a verification workbook from this device.</small>
            </span>
          </button>
        </div>

        {hasLocalProject && (
          <button className="startup-continue" disabled={busy} onClick={onContinue}>
            <IconRestore size={17} />
            <span>
              <b>Continue case on this device</b>
              <small>Resume the last locally saved project.</small>
            </span>
          </button>
        )}

        {notice && <p className="startup-choice-notice" role="alert">{notice}</p>}

        <footer>
          <IconFileImport size={14} />
          Project data and engineering calculations remain on this device unless you export a file.
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
