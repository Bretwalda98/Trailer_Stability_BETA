"use client";

import { useGSAP } from "@gsap/react";
import {
  IconArrowRight,
  IconBox,
  IconChevronLeft,
  IconChevronRight,
  IconFileImport,
  IconFolderOpen,
  IconJson,
  IconLoader2,
  IconRestore,
  IconRoute,
  IconTargetArrow,
  IconVectorTriangle,
} from "@tabler/icons-react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useEffect, useRef, useState } from "react";

if (typeof window !== "undefined") {
  gsap.registerPlugin(useGSAP, ScrollTrigger);
}

interface StartupChooserProps {
  open: boolean;
  busy: boolean;
  hasLocalProject: boolean;
  onFastArrangement(): void;
  onOpenFile(file: File): Promise<boolean>;
  onContinue(): void;
}

const capabilities = [
  {
    title: "Define the transport case",
    detail: "Road conditions, cargo, packing, supports, trailer stock and PPU positions are captured in one guided sequence.",
    icon: IconRoute,
  },
  {
    title: "Search buildable formations",
    detail: "The solver prioritises fewer axle lines, then fewer trains, while testing three- and four-point hydraulic arrangements.",
    icon: IconTargetArrow,
  },
  {
    title: "Verify governing checks",
    detail: "Inspect stability, axle utilisation, traction, support settling, spine-beam response and the complete decision log.",
    icon: IconVectorTriangle,
  },
] as const;

const assuranceItems = [
  {
    title: "Calculation remains local",
    detail: "Case data and engineering calculations stay on this device unless you export a file.",
  },
  {
    title: "Search decisions remain traceable",
    detail: "Candidate inputs, changes, failures and governing metrics are retained in the activity log.",
  },
  {
    title: "Engineering geometry remains explicit",
    detail: "Plan, end, side, hydraulic, stability and spine-beam views are derived from the active case.",
  },
] as const;

const processStatement =
  "The search narrows the formation space with capacity and geometry bounds before exact engineering checks decide which arrangement governs.";

export function StartupChooser({
  open,
  busy,
  hasLocalProject,
  onFastArrangement,
  onOpenFile,
  onContinue,
}: StartupChooserProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const newSetupRef = useRef<HTMLButtonElement>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeCapability, setActiveCapability] = useState(0);
  const [assuranceIndex, setAssuranceIndex] = useState(0);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setNotice(null);
      dialog.showModal();
      dialog.scrollTop = 0;
      window.setTimeout(() => newSetupRef.current?.focus(), 0);
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useGSAP(
    () => {
      if (!open || !dialogRef.current) return;

      const media = gsap.matchMedia();
      media.add("(prefers-reduced-motion: no-preference)", () => {
        const introduction = gsap.timeline({ defaults: { ease: "power3.out" } });
        introduction
          .from(".startup-product-bar", { opacity: 0, y: -12, duration: 0.42 })
          .from(".startup-hero-copy > *", { opacity: 0, y: 18, duration: 0.46, stagger: 0.07 }, "-=0.18")
          .from(".startup-technical-stage", { opacity: 0, scale: 0.94, duration: 0.72 }, "-=0.48")
          .from(".startup-stage-trace", { strokeDashoffset: 260, duration: 1.1, stagger: 0.08 }, "-=0.62");

        gsap.to(".startup-stage-scan", {
          xPercent: 850,
          duration: 5.5,
          ease: "none",
          repeat: -1,
        });
      });

      media.add("(min-width: 901px) and (prefers-reduced-motion: no-preference)", () => {
        const scroller = dialogRef.current ?? undefined;
        ScrollTrigger.create({
          trigger: ".startup-process",
          scroller,
          start: "top 18%",
          end: "bottom 70%",
          pin: ".startup-process-copy",
          pinSpacing: false,
        });

        gsap.fromTo(
          ".startup-process-statement span",
          { opacity: 0.15 },
          {
            opacity: 1,
            stagger: 0.08,
            ease: "none",
            scrollTrigger: {
              trigger: ".startup-process",
              scroller,
              start: "top 62%",
              end: "bottom 72%",
              scrub: 0.5,
            },
          },
        );
      });

      return () => media.revert();
    },
    { scope: shellRef, dependencies: [open], revertOnUpdate: true },
  );

  const chooseFile = async (file: File | undefined) => {
    if (!file) return;
    setNotice(null);
    const opened = await onOpenFile(file);
    if (!opened) {
      setNotice("That file could not be opened. Check that it is a valid saved project JSON file.");
    }
  };

  const requestFile = () => fileInputRef.current?.click();

  return (
    <dialog
      ref={dialogRef}
      className="startup-choice-dialog startup-experience"
      aria-labelledby="startup-choice-title"
      onCancel={(event) => event.preventDefault()}
    >
      <div ref={shellRef} className="startup-choice-shell">
        <nav className="startup-product-bar" aria-label="Startup">
          <div className="startup-product-identity">
            <span aria-hidden="true">TS</span>
            <div>
              <b>Trailer Stability</b>
              <small>SPMT engineering workbench</small>
            </div>
          </div>
          <div className="startup-local-state">
            <i aria-hidden="true" />
            Local calculation
          </div>
        </nav>

        <main className="startup-choice-content">
          <section className="startup-choice-hero" aria-labelledby="startup-choice-title">
            <div className="startup-hero-copy">
              <p className="startup-kicker">Arrangement search and verification</p>
              <h2 id="startup-choice-title">Find the minimum buildable SPMT formation.</h2>
              <p className="startup-hero-intro">
                Define the transport case once. Search viable trailer geometry, hydraulic grouping and axle-line combinations, then inspect the governing result.
              </p>

              <div className="startup-hero-actions">
                <button
                  ref={newSetupRef}
                  className="startup-primary"
                  disabled={busy}
                  onClick={onFastArrangement}
                >
                  <IconTargetArrow size={18} />
                  <span>Start arrangement search</span>
                  <IconArrowRight className="startup-action-arrow" size={17} />
                </button>
                <button disabled={busy} onClick={requestFile}>
                  {busy ? <IconLoader2 className="spin" size={18} /> : <IconFolderOpen size={18} />}
                  <span>{busy ? "Opening case…" : "Open case"}</span>
                </button>
              </div>

              {hasLocalProject && (
                <button className="startup-continue" disabled={busy} onClick={onContinue}>
                  <IconRestore size={17} />
                  <span>
                    <b>Continue case on this device</b>
                    <small>Resume the most recently saved local project.</small>
                  </span>
                  <IconArrowRight size={16} />
                </button>
              )}

              {notice && <p className="startup-choice-notice" role="alert">{notice}</p>}
            </div>

            <div className="startup-technical-stage" aria-label="Illustrative SPMT arrangement preview">
              <header>
                <span>FORMATION PREVIEW</span>
                <b>Calculated geometry</b>
                <i>LIVE</i>
              </header>
              <svg viewBox="0 0 820 560" role="img" aria-label="Two SPMT trains supporting cargo inside a hydraulic stability boundary">
                <defs>
                  <pattern id="startup-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                    <path d="M 40 0 L 0 0 0 40" className="startup-stage-grid" />
                  </pattern>
                </defs>
                <rect width="820" height="560" fill="url(#startup-grid)" />
                <path className="startup-stage-axis" d="M70 476H750M98 505V54" />
                <text x="754" y="482">X · FRONT</text>
                <text x="70" y="42">Y</text>

                <rect className="startup-stage-cargo" x="245" y="86" width="368" height="356" />
                <text x="429" y="108" textAnchor="middle">CARGO ENVELOPE</text>

                <g className="startup-stage-trailer">
                  <rect x="126" y="188" width="568" height="74" />
                  <rect x="126" y="330" width="568" height="74" />
                  {[180, 252, 324, 396, 468, 540, 612].map((x) => (
                    <g key={x}>
                      <rect x={x - 16} y="202" width="32" height="18" />
                      <rect x={x - 16} y="232" width="32" height="18" />
                      <rect x={x - 16} y="344" width="32" height="18" />
                      <rect x={x - 16} y="374" width="32" height="18" />
                    </g>
                  ))}
                </g>

                <path className="startup-stage-boundary startup-stage-trace" pathLength="260" d="M180 202L612 202L612 392L180 392Z" />
                <path className="startup-stage-group group-one startup-stage-trace" pathLength="260" d="M180 211H324M180 353H324" />
                <path className="startup-stage-group group-two startup-stage-trace" pathLength="260" d="M324 241H540M324 383H540" />
                <path className="startup-stage-group group-three startup-stage-trace" pathLength="260" d="M540 211H612M540 353H612" />

                <g className="startup-stage-cog" transform="translate(430 296)">
                  <circle r="15" />
                  <path d="M-25 0H25M0-25V25" />
                </g>
                <text x="451" y="288">COMBINED COG</text>
                <text className="startup-stage-label group-one" x="194" y="185">G1</text>
                <text className="startup-stage-label group-two" x="414" y="425">G2</text>
                <text className="startup-stage-label group-three" x="570" y="185">G3</text>
                <rect className="startup-stage-scan" x="94" y="58" width="2" height="410" />
              </svg>
              <footer>
                <span><i className="ok" /> Geometry bounded</span>
                <span>Rear ← X → Front</span>
              </footer>
            </div>
          </section>

          <div className="startup-capability-marquee" aria-hidden="true">
            <div>
              <span>ARRANGEMENT SEARCH</span><i />
              <span>THREE- AND FOUR-POINT HYDRAULICS</span><i />
              <span>CARGO-ONLY AND COMBINED COG</span><i />
              <span>SUPPORT SETTLING</span><i />
              <span>SPINE-BEAM CHECKS</span><i />
              <span>TRACEABLE CASE LOG</span><i />
              <span>ARRANGEMENT SEARCH</span><i />
              <span>THREE- AND FOUR-POINT HYDRAULICS</span><i />
              <span>CARGO-ONLY AND COMBINED COG</span><i />
              <span>SUPPORT SETTLING</span><i />
              <span>SPINE-BEAM CHECKS</span><i />
              <span>TRACEABLE CASE LOG</span><i />
            </div>
          </div>

          <section className="startup-interest" aria-labelledby="startup-capabilities-title">
            <div className="startup-interest-lead">
              <IconBox size={20} />
              <h3 id="startup-capabilities-title">One controlled path from load definition to verified formation.</h3>
              <p>The interface keeps case setup, search evidence and engineering review connected without hiding the assumptions that control the answer.</p>
            </div>
            <div className="startup-horizontal-accordions">
              {capabilities.map((capability, index) => {
                const Icon = capability.icon;
                const active = activeCapability === index;
                return (
                  <button
                    key={capability.title}
                    className={active ? "active" : ""}
                    aria-expanded={active}
                    onClick={() => setActiveCapability(index)}
                    onFocus={() => setActiveCapability(index)}
                    onMouseEnter={() => setActiveCapability(index)}
                  >
                    <span className="startup-accordion-index">0{index + 1}</span>
                    <Icon size={21} />
                    <span className="startup-accordion-copy">
                      <b>{capability.title}</b>
                      <small>{capability.detail}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="startup-process" aria-labelledby="startup-process-title">
            <div className="startup-process-copy">
              <p>Bounded mathematical search</p>
              <h3 id="startup-process-title">Reduce the search space before exact checks begin.</h3>
              <p className="startup-process-statement">
                {processStatement.split(" ").map((word, index) => (
                  <span key={`${word}-${index}`}>{word}{" "}</span>
                ))}
              </p>
            </div>
            <ol className="startup-process-steps">
              <li><b>Route and verification conditions</b><span>Set slopes, accelerations, wind, friction, traction and the required engineering degree.</span></li>
              <li><b>Cargo, packing and supports</b><span>Define physical envelopes, COG allowances, wind areas and each load-transfer point.</span></li>
              <li><b>Available trailer stock</b><span>Select the catalogue model, module lengths, deck height, PPU arrangement and permitted formation bounds.</span></li>
              <li><b>Formation search</b><span>Screen capacity and geometry, then evaluate hydraulic grouping, stability and local structural response.</span></li>
              <li><b>Governing result</b><span>Review the best valid formation, alternatives, failed constraints and the complete activity record.</span></li>
            </ol>
          </section>

          <section className="startup-assurance" aria-live="polite">
            <div className="startup-assurance-copy">
              <span>Calculation assurance</span>
              <b>{assuranceItems[assuranceIndex].title}</b>
              <p>{assuranceItems[assuranceIndex].detail}</p>
            </div>
            <div className="startup-assurance-controls">
              <button
                aria-label="Previous assurance item"
                onClick={() => setAssuranceIndex((assuranceIndex - 1 + assuranceItems.length) % assuranceItems.length)}
              >
                <IconChevronLeft size={18} />
              </button>
              <span>{assuranceIndex + 1} / {assuranceItems.length}</span>
              <button
                aria-label="Next assurance item"
                onClick={() => setAssuranceIndex((assuranceIndex + 1) % assuranceItems.length)}
              >
                <IconChevronRight size={18} />
              </button>
            </div>
          </section>

          <section className="startup-final-action" aria-labelledby="startup-final-title">
            <div>
              <p>Start with the engineering inputs</p>
              <h3 id="startup-final-title">Build a case the solver can explain.</h3>
            </div>
            <div>
              <button className="startup-primary" disabled={busy} onClick={onFastArrangement}>
                <IconTargetArrow size={18} />
                Start arrangement search
                <IconArrowRight size={17} />
              </button>
              <button disabled={busy} onClick={requestFile}>
                <IconJson size={18} />
                Open saved case
              </button>
            </div>
          </section>
        </main>

        <footer className="startup-experience-footer">
          <IconFileImport size={14} />
          <span>Project data and engineering calculations remain on this device unless you export a file.</span>
        </footer>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
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
