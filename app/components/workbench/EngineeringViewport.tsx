"use client";

import {
  IconArrowsMaximize,
  IconGridDots,
  IconLayersSubtract,
  IconMinus,
  IconPlus,
  IconRefresh,
  IconRuler2,
} from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Point2, ProjectModel } from "../../engine/types";
import {
  createViewportTransform,
  stabilityFocusBounds,
} from "../../geometry/transform";
import type { GeometryViewModel } from "../../geometry/types";
import type { ViewId, ViewPreferences } from "./types";
import { EndView } from "./views/EndView";
import { HydraulicsView } from "./views/HydraulicsView";
import { PlanView } from "./views/PlanView";
import { SideView } from "./views/SideView";
import { SpineBeamView } from "./views/SpineBeamView";
import { StabilityView } from "./views/StabilityView";

const VIEW_TABS: Array<{ id: ViewId; label: string }> = [
  { id: "plan", label: "Plan" },
  { id: "end", label: "End" },
  { id: "side", label: "Side" },
  { id: "hydraulics", label: "Hydraulics" },
  { id: "stability", label: "Stability" },
  { id: "beam", label: "Spine beam" },
];

interface EngineeringViewportProps {
  vm: GeometryViewModel;
  view: ViewId;
  preferences: ViewPreferences;
  selectedId: string;
  onViewChange(view: ViewId): void;
  onPreferencesChange(preferences: ViewPreferences): void;
  onSelect(id: string): void;
  onModelChange(model: ProjectModel): void;
}

export function EngineeringViewport({
  vm,
  view,
  preferences,
  selectedId,
  onViewChange,
  onPreferencesChange,
  onSelect,
  onModelChange,
}: EngineeringViewportProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; start: Point2; pan: Point2 } | null>(null);
  const [size, setSize] = useState({ width: 980, height: 620 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point2>({ x: 0, y: 0 });
  const [layersOpen, setLayersOpen] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const update = () => {
      const rect = host.getBoundingClientRect();
      setSize({
        width: Math.max(520, Math.floor(rect.width)),
        height: Math.max(360, Math.floor(rect.height)),
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [view]);

  const toolbarHeight = 42;
  const drawableHeight = Math.max(300, size.height - toolbarHeight);
  const transformHeight =
    view === "hydraulics"
      ? Math.max(250, Math.floor(drawableHeight * 0.58))
      : view === "stability"
        ? Math.max(300, Math.floor(drawableHeight * 0.66))
        : drawableHeight;
  const activeBounds = useMemo(
    () => (view === "stability" ? stabilityFocusBounds(vm) : vm.bounds),
    [view, vm],
  );
  const transform = useMemo(
    () =>
      createViewportTransform(
        view,
        activeBounds,
        size.width,
        transformHeight,
        view === "plan" ? 70 : 54,
        zoom,
        pan,
      ),
    [view, activeBounds, size.width, transformHeight, zoom, pan],
  );

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const pointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    if ((event.target as Element).closest(".svg-selectable")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      pan,
    };
  };
  const pointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPan({
      x: drag.pan.x + event.clientX - drag.start.x,
      y: drag.pan.y + event.clientY - drag.start.y,
    });
  };
  const pointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };
  const wheel = (event: React.WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    setZoom((current) => Math.max(0.35, Math.min(6, current * (event.deltaY > 0 ? 0.9 : 1.1))));
  };

  const viewProps = {
    vm,
    transform,
    width: size.width,
    height: drawableHeight,
    preferences,
    selectedId,
    onSelect,
    onBackgroundPointerDown: pointerDown,
    onBackgroundPointerMove: pointerMove,
    onBackgroundPointerUp: pointerUp,
    onWheel: wheel,
  };

  const renderedView = (() => {
    switch (view) {
      case "end":
        return <EndView {...viewProps} />;
      case "side":
        return <SideView {...viewProps} />;
      case "hydraulics":
        return <HydraulicsView {...viewProps} onModelChange={onModelChange} />;
      case "stability":
        return <StabilityView {...viewProps} />;
      case "beam":
        return <SpineBeamView {...viewProps} onModelChange={onModelChange} />;
      default:
        return <PlanView {...viewProps} />;
    }
  })();

  return (
    <section className="engineering-viewport" aria-label="Interactive engineering viewport">
      <div className="viewport-toolbar">
        <div className="view-tabs" role="tablist" aria-label="Engineering view">
          {VIEW_TABS.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={view === tab.id}
              className={view === tab.id ? "active" : ""}
              onClick={() => onViewChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="viewport-actions">
          <button
            className="icon-button"
            title="Zoom out"
            aria-label="Zoom out"
            onClick={() => setZoom((current) => Math.max(0.35, current / 1.2))}
          >
            <IconMinus size={16} />
          </button>
          <span className="zoom-readout">{Math.round(zoom * 100)}%</span>
          <button
            className="icon-button"
            title="Zoom in"
            aria-label="Zoom in"
            onClick={() => setZoom((current) => Math.min(6, current * 1.2))}
          >
            <IconPlus size={16} />
          </button>
          <button className="icon-button" title="Fit model" aria-label="Fit model" onClick={resetView}>
            <IconArrowsMaximize size={16} />
          </button>
          <button className="icon-button" title="Reset view" aria-label="Reset view" onClick={resetView}>
            <IconRefresh size={16} />
          </button>
          <button
            className={`icon-button${preferences.dimensions ? " active" : ""}`}
            title="Toggle dimensions"
            aria-label="Toggle dimensions"
            onClick={() =>
              onPreferencesChange({ ...preferences, dimensions: !preferences.dimensions })
            }
          >
            <IconRuler2 size={16} />
          </button>
          <button
            className={`icon-button${preferences.grid ? " active" : ""}`}
            title="Toggle grid"
            aria-label="Toggle grid"
            onClick={() => onPreferencesChange({ ...preferences, grid: !preferences.grid })}
          >
            <IconGridDots size={16} />
          </button>
          <div className="layer-control">
            <button
              className={`icon-button${layersOpen ? " active" : ""}`}
              title="Layers"
              aria-label="Open layer controls"
              aria-expanded={layersOpen}
              onClick={() => setLayersOpen((current) => !current)}
            >
              <IconLayersSubtract size={16} />
            </button>
            {layersOpen && (
              <div className="layer-menu">
                <header>
                  <b>Visible geometry</b>
                  <button onClick={() => setLayersOpen(false)}>Close</button>
                </header>
                {Object.entries(preferences.layers).map(([key, enabled]) => (
                  <label key={key}>
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(event) =>
                        onPreferencesChange({
                          ...preferences,
                          layers: {
                            ...preferences.layers,
                            [key]: event.target.checked,
                          },
                        })
                      }
                    />
                    <span>{key.replaceAll("-", " ")}</span>
                  </label>
                ))}
                <div className="layer-menu-subheading">COG markers</div>
                {vm.cogs.map((cog) => (
                  <label key={cog.cogType} title={cog.unavailableReason}>
                    <input
                      type="checkbox"
                      checked={preferences.visibleCogs[cog.cogType]}
                      disabled={!cog.available}
                      onChange={(event) =>
                        onPreferencesChange({
                          ...preferences,
                          visibleCogs: {
                            ...preferences.visibleCogs,
                            [cog.cogType]: event.target.checked,
                          },
                        })
                      }
                    />
                    <span>{cog.selection.title}</span>
                  </label>
                ))}
                <label>
                  <input
                    type="checkbox"
                    checked={preferences.legend}
                    onChange={(event) =>
                      onPreferencesChange({ ...preferences, legend: event.target.checked })
                    }
                  />
                  <span>legend</span>
                </label>
              </div>
            )}
          </div>
          {(view === "plan" || view === "stability") && (
            <select
              className="load-case-select"
              aria-label="Displayed load-case mode"
              value={preferences.loadCase}
              onChange={(event) =>
                onPreferencesChange({
                  ...preferences,
                  loadCase: event.target.value as ViewPreferences["loadCase"],
                })
              }
            >
              <option value="basic">Basic static</option>
              <option value="slope">Static incl. slopes</option>
              <option value="dynamic">Dynamic</option>
              <option value="comparison">Comparison</option>
            </select>
          )}
        </div>
      </div>
      <div className="viewport-stage" ref={hostRef}>
        {renderedView}
        {preferences.legend && (view === "plan" || view === "end" || view === "side") && (
          <div className="viewport-legend">
            <span><i className="line axle" /> Axle line</span>
            <span><i className="line support" /> Support / spread</span>
            <span><i className="line g1" /> G1</span>
            <span><i className="line g2" /> G2</span>
            <span><i className="line g3" /> G3</span>
            <span><i className="line polygon" /> Stability boundary</span>
            <span><i className="cog" /> COG</span>
          </div>
        )}
      </div>
    </section>
  );
}
