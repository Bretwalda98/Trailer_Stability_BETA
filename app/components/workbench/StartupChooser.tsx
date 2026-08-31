"use client";

import { useEffect, useRef, useState } from "react";
import { IconArrowRight, IconFileImport, IconRestore, IconRuler2, IconTargetArrow } from "@tabler/icons-react";

interface StartupChooserProps {
  open: boolean;
  busy: boolean;
  hasLocalProject: boolean;
  onManualArrangement(): void;
  onFastArrangement(): void;
  onResumeManual(): void;
  onResumeAutomatic(): void;
  onOpenFile(file: File): Promise<boolean>;
  onContinue(): void;
}

export function StartupChooser({ open, busy, hasLocalProject, onManualArrangement, onFastArrangement, onResumeManual, onResumeAutomatic, onOpenFile, onContinue }: StartupChooserProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && !dialog?.open) dialog?.showModal();
    if (!open && dialog?.open) dialog.close();
  }, [open]);
  return <dialog ref={dialogRef} className="arrangement-home" aria-labelledby="arrangement-home-title" onCancel={event => { event.preventDefault(); if (hasLocalProject) onContinue(); }}>
    <header className="arrangement-home-bar"><b>TS / Trailer Stability</b><span>Engineering workbench</span>{hasLocalProject && <button onClick={onContinue} aria-label="Close start screen">×</button>}</header>
    <div className="arrangement-home-content">
      <p className="arrangement-home-kicker">NEW TRANSPORT CASE</p>
      <h1 id="arrangement-home-title">How will you arrange the transport?</h1>
      <p>Choose your starting point. Both routes use the same calculation engine and engineering views.</p>
      <div className="arrangement-home-routes">
        <section><IconRuler2 size={28} /><span className="arrangement-home-kicker">01 / MANUAL</span><h2>Build your own arrangement</h2><p>Place individual beds and PPUs. Set train connections, X / Y coordinates and orientation, then check the arrangement.</p><ol><li>Define cargo, road conditions and packing</li><li>Place 4, 5 and 6-AL beds and PPUs</li><li>Set hydraulics and review checks</li></ol><button disabled={busy} onClick={onManualArrangement}>Build your own arrangement <IconArrowRight size={18} /></button></section>
        <section><IconTargetArrow size={28} /><span className="arrangement-home-kicker">02 / AUTOMATIC</span><h2>Automatically find an arrangement</h2><p>Define the cargo, trailer stock and search limits. Compare verified candidates before applying a result.</p><ol><li>Define the load and available equipment</li><li>Choose spacing, stagger and angle limits</li><li>Search, compare and apply a candidate</li></ol><button disabled={busy} onClick={onFastArrangement}>Automatically find an arrangement <IconArrowRight size={18} /></button></section>
      </div>
      <div className="arrangement-home-existing">
        <button disabled={busy} onClick={() => fileInput.current?.click()}><IconFileImport size={18} /> Open saved project</button>
        {hasLocalProject && <button disabled={busy} onClick={onContinue}><IconRestore size={18} /> Continue current case</button>}
        <button disabled={busy} onClick={onResumeManual}>Resume manual draft</button>
        <button disabled={busy} onClick={onResumeAutomatic}>Resume automatic draft</button>
      </div>
      <input ref={fileInput} hidden type="file" accept=".json" onChange={async event => { const file = event.target.files?.[0]; event.currentTarget.value = ""; if (!file) return; try { if (!await onOpenFile(file)) setNotice("The project could not be opened. Check the file and try again."); } catch (error) { setNotice(String(error)); } }} />
      {notice && <p role="alert">{notice}</p>}
      <footer>New cases start without an assumed arrangement. Applying a wizard replaces the active case; closing it retains a separate draft.</footer>
    </div>
  </dialog>;
}
