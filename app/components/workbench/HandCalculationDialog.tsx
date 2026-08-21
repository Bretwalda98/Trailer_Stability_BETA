"use client";

import {
  IconBraces,
  IconDownload,
  IconFileTypePdf,
  IconLoader2,
  IconX,
} from "@tabler/icons-react";
import katex from "katex";
import { useEffect, useMemo, useRef, useState } from "react";
import { downloadText } from "../../engine/download";
import { buildHandCalculation } from "../../engine/hand-calculation";
import type { CalculationResult, ProjectModel } from "../../engine/types";

interface HandCalculationDialogProps {
  open: boolean;
  model: ProjectModel;
  result: CalculationResult;
  onClose(): void;
}

function safeFilename(value: string): string {
  return value
    .trim()
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "trailer-stability-case";
}

export function HandCalculationDialog({
  open,
  model,
  result,
  onClose,
}: HandCalculationDialogProps) {
  const reportRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const generatedAt = useMemo(() => new Date().toISOString(), []);
  const calculation = useMemo(
    () => buildHandCalculation(model, result, generatedAt),
    [generatedAt, model, result],
  );
  const filename = `${safeFilename(model.cargo.name)}-hand-calculation`;

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose, open]);

  if (!open) return null;

  const downloadLatex = () => {
    downloadText(
      calculation.latex,
      `${filename}.latex`,
      "application/x-latex;charset=utf-8",
    );
  };

  const downloadPdf = async () => {
    if (!reportRef.current || exportingPdf) return;
    setPdfError(null);
    setExportingPdf(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      const canvas = await html2canvas(reportRef.current, {
        backgroundColor: "#ffffff",
        scale: Math.min(2, Math.max(1.35, window.devicePixelRatio || 1)),
        useCORS: true,
        logging: false,
        windowWidth: Math.max(980, reportRef.current.scrollWidth),
      });
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
      const margin = 10;
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const printableWidth = pageWidth - margin * 2;
      const printableHeight = pageHeight - margin * 2;
      const renderedHeight = (canvas.height * printableWidth) / canvas.width;
      const image = canvas.toDataURL("image/jpeg", 0.94);
      let remaining = renderedHeight;
      let offset = margin;

      pdf.addImage(image, "JPEG", margin, offset, printableWidth, renderedHeight, undefined, "FAST");
      remaining -= printableHeight;
      while (remaining > 0.5) {
        pdf.addPage();
        offset = margin - (renderedHeight - remaining);
        pdf.addImage(image, "JPEG", margin, offset, printableWidth, renderedHeight, undefined, "FAST");
        remaining -= printableHeight;
      }
      pdf.save(`${filename}.pdf`);
    } catch (error) {
      setPdfError(error instanceof Error ? error.message : "The PDF could not be generated on this device.");
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div
      className="hand-calculation-backdrop"
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="hand-calculation-shell"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hand-calculation-title"
      >
        <header className="hand-calculation-toolbar">
          <div>
            <span>CALCULATION RECORD</span>
            <b id="hand-calculation-title">Detailed hand calculation</b>
          </div>
          <nav aria-label="Hand calculation actions">
            <button type="button" onClick={downloadLatex}>
              <IconBraces size={15} /> <span>LaTeX source</span>
            </button>
            <button type="button" disabled={exportingPdf} onClick={() => void downloadPdf()}>
              {exportingPdf ? <IconLoader2 className="spin" size={15} /> : <IconFileTypePdf size={15} />}
              <span>{exportingPdf ? "Building PDF…" : "Download PDF"}</span>
            </button>
            <button
              ref={closeRef}
              type="button"
              className="hand-calculation-close"
              aria-label="Close hand calculation"
              onClick={onClose}
            >
              <IconX size={17} />
            </button>
          </nav>
          {pdfError && <p className="hand-calculation-export-error" role="alert">PDF export failed: {pdfError}</p>}
        </header>

        <div className="hand-calculation-layout">
          <aside className="hand-calculation-contents" aria-label="Calculation contents">
            <span>CONTENTS</span>
            <nav>
              {calculation.sections.map((section, index) => (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => document.getElementById(`hand-calc-${section.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
                >
                  <small>{String(index + 1).padStart(2, "0")}</small>
                  <b>{section.title}</b>
                </button>
              ))}
            </nav>
            <div className="hand-calculation-assurance">
              <IconDownload size={14} />
              <p>The report uses the same authoritative model and result currently displayed in the workbench.</p>
            </div>
          </aside>

          <div className="hand-calculation-reader">
            <article ref={reportRef} className="hand-calculation-paper">
              <header>
                <span>TRAILER STABILITY ENGINEERING WORKBENCH</span>
                <h1>{calculation.title}</h1>
                <p>{calculation.subtitle}</p>
                <dl>
                  <div><dt>Result</dt><dd className={`hand-calc-status status-${calculation.status.toLowerCase()}`}>{calculation.status}</dd></div>
                  <div><dt>Generated</dt><dd>{new Date(calculation.generatedAt).toLocaleString()}</dd></div>
                  <div><dt>Orientation</dt><dd>Rear = lower X · Front = higher X</dd></div>
                </dl>
              </header>

              {calculation.sections.map((section, index) => (
                <section key={section.id} id={`hand-calc-${section.id}`} className="hand-calculation-section">
                  <div className="hand-calculation-section-title">
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <h2>{section.title}</h2>
                  </div>
                  {section.explanation.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                  {section.equations.map((item) => (
                    <figure key={`${section.id}-${item.label}`} className="hand-calculation-equation">
                      <figcaption>{item.label}</figcaption>
                      <div
                        className="hand-calculation-katex"
                        dangerouslySetInnerHTML={{
                          __html: katex.renderToString(item.latex, {
                            displayMode: true,
                            throwOnError: false,
                            strict: "warn",
                            output: "htmlAndMathml",
                          }),
                        }}
                      />
                      <details>
                        <summary>Show equation source</summary>
                        <code>{item.latex}</code>
                      </details>
                    </figure>
                  ))}
                  {section.facts.length > 0 && (
                    <table>
                      <thead><tr><th>Quantity</th><th>Calculated value</th></tr></thead>
                      <tbody>
                        {section.facts.map((item) => (
                          <tr key={`${section.id}-${item.label}`}><th>{item.label}</th><td>{item.value}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </section>
              ))}

              <footer>
                This calculation reproduces the current browser engine inputs, equations and outputs for engineering review. Independent checking and project-specific approval remain required.
              </footer>
            </article>
          </div>
        </div>
      </section>
    </div>
  );
}
