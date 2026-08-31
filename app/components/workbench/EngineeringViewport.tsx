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
import { useEffect, useId, useMemo, useRef, useState } from "react";
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
  availableViews?: ViewId[];
  compact?: boolean;
  minimumWidth?: number;
  minimumHeight?: number;
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
  availableViews,
  compact = false,
  minimumWidth = 520,
  minimumHeight = 360,
}: EngineeringViewportProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; start: Point2; pan: Point2 } | null>(null);
  const pointersRef = useRef(new Map<number, Point2>());
  const suppressClickRef = useRef(false);
  const pinchRef = useRef<{
    distance: number;
    midpoint: Point2;
    zoom: number;
    pan: Point2;
  } | null>(null);
  const [size, setSize] = useState({ width: 980, height: 620 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point2>({ x: 0, y: 0 });
  const [layersOpen, setLayersOpen] = useState(false);
  const [gesture, setGesture] = useState<"idle" | "panning" | "pinching">("idle");
  const gestureHintId = useId();

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const update = () => {
      const rect = host.getBoundingClientRect();
      setSize({
        width: Math.max(minimumWidth, Math.floor(rect.width)),
        height: Math.max(minimumHeight, Math.floor(rect.height)),
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    return () => observer.disconnect();
  }, [minimumHeight, minimumWidth]);

  useEffect(() => {
    // Switching engineering views intentionally restores a neutral viewport.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [view]);

  const toolbarHeight = 42;
  const drawableHeight = Math.max(300, size.height - toolbarHeight);
  const transformHeight =
    view === "hydraulics"
      ? compact
        ? drawableHeight
        : Math.max(250, Math.floor(drawableHeight * 0.58))
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

  const zoomBy = (factor: number) => {
    setZoom((currentZoom) => {
      const nextZoom = Math.max(0.35, Math.min(6, currentZoom * factor));
      const ratio = nextZoom / currentZoom;
      setPan((currentPan) => ({
        x: currentPan.x * ratio,
        y: currentPan.y * ratio,
      }));
      return nextZoom;
    });
  };

  const pointerPair = () => Array.from(pointersRef.current.values()).slice(0, 2);
  const pairGeometry = (points: Point2[]) => {
    const [first, second] = points;
    if (!first || !second) return null;
    return {
      distance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
      midpoint: {
        x: (first.x + second.x) / 2,
        y: (first.y + second.y) / 2,
      },
    };
  };

  const pointerInViewBox = (event: React.PointerEvent<SVGSVGElement>): Point2 => {
    const rect = event.currentTarget.getBoundingClientRect();
    const viewBox = event.currentTarget.viewBox.baseVal;
    return {
      x: ((event.clientX - rect.left) / Math.max(1, rect.width)) * viewBox.width,
      y: ((event.clientY - rect.top) / Math.max(1, rect.height)) * viewBox.height,
    };
  };

  const beginPinch = () => {
    const geometry = pairGeometry(pointerPair());
    if (!geometry) return;
    pinchRef.current = { ...geometry, zoom, pan };
    dragRef.current = null;
    suppressClickRef.current = true;
    setGesture("pinching");
  };

  const pointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 && event.button !== 1) return;
    if (pointersRef.current.size === 0) suppressClickRef.current = false;
    if (event.button === 1) event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const pointer = pointerInViewBox(event);
    pointersRef.current.set(event.pointerId, pointer);
    if (pointersRef.current.size >= 2) {
      beginPinch();
      return;
    }
    if (
      event.button === 0 &&
      !event.shiftKey &&
      (event.target as Element).closest(".svg-selectable")
    ) return;
    dragRef.current = {
      pointerId: event.pointerId,
      start: pointer,
      pan,
    };
  };
  const pointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    const pointer = pointerInViewBox(event);
    pointersRef.current.set(event.pointerId, pointer);
    if (pointersRef.current.size >= 2) {
      if (!pinchRef.current) beginPinch();
      const pinch = pinchRef.current;
      const geometry = pairGeometry(pointerPair());
      if (!pinch || !geometry) return;
      const nextZoom = Math.max(
        0.35,
        Math.min(6, pinch.zoom * (geometry.distance / pinch.distance)),
      );
      const ratio = nextZoom / pinch.zoom;
      const centre = { x: size.width / 2, y: drawableHeight / 2 };
      setZoom(nextZoom);
      setPan({
        x:
          geometry.midpoint.x -
          centre.x -
          (pinch.midpoint.x - centre.x - pinch.pan.x) * ratio,
        y:
          geometry.midpoint.y -
          centre.y -
          (pinch.midpoint.y - centre.y - pinch.pan.y) * ratio,
      });
      setGesture("pinching");
      return;
    }
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (Math.hypot(pointer.x - drag.start.x, pointer.y - drag.start.y) > 2) {
      suppressClickRef.current = true;
      setGesture("panning");
    }
    setPan({
      x: drag.pan.x + pointer.x - drag.start.x,
      y: drag.pan.y + pointer.y - drag.start.y,
    });
  };
  const pointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    pointersRef.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (pointersRef.current.size === 0) setGesture("idle");
  };
  const wheel = (event: React.WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const viewBox = event.currentTarget.viewBox.baseVal;
    const cursor = {
      x: ((event.clientX - rect.left) / Math.max(1, rect.width)) * viewBox.width,
      y: ((event.clientY - rect.top) / Math.max(1, rect.height)) * viewBox.height,
    };
    const centre = { x: viewBox.width / 2, y: viewBox.height / 2 };
    const factor = Math.max(0.82, Math.min(1.18, Math.exp(-event.deltaY * 0.0015)));
    setZoom((currentZoom) => {
      const nextZoom = Math.max(0.35, Math.min(6, currentZoom * factor));
      const ratio = nextZoom / currentZoom;
      setPan((currentPan) => ({
        x: cursor.x - centre.x - (cursor.x - centre.x - currentPan.x) * ratio,
        y: cursor.y - centre.y - (cursor.y - centre.y - currentPan.y) * ratio,
      }));
      return nextZoom;
    });
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
    compact,
  };

  const keyboardNavigate = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if ((event.target as Element).closest("button, input, select, textarea")) return;
    const distance = event.shiftKey ? 72 : 24;
    switch (event.key) {
      case "ArrowLeft":
        setPan((current) => ({ ...current, x: current.x - distance }));
        break;
      case "ArrowRight":
        setPan((current) => ({ ...current, x: current.x + distance }));
        break;
      case "ArrowUp":
        setPan((current) => ({ ...current, y: current.y - distance }));
        break;
      case "ArrowDown":
        setPan((current) => ({ ...current, y: current.y + distance }));
        break;
      case "+":
      case "=":
        zoomBy(1.2);
        break;
      case "-":
      case "_":
        zoomBy(1 / 1.2);
        break;
      case "0":
      case "Home":
        resetView();
        break;
      default:
        return;
    }
    event.preventDefault();
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
    <section
      className={`engineering-viewport${compact ? " compact-viewport" : ""}`}
      aria-label="Interactive engineering viewport"
    >
      <div className="viewport-toolbar">
        <div className="view-tabs" role="tablist" aria-label="Engineering view">
          {VIEW_TABS.filter((tab) => !availableViews || availableViews.includes(tab.id)).map((tab) => (
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
            onClick={() => zoomBy(1 / 1.2)}
          >
            <IconMinus size={16} />
          </button>
          <span className="zoom-readout">{Math.round(zoom * 100)}%</span>
          <button
            className="icon-button"
            title="Zoom in"
            aria-label="Zoom in"
            onClick={() => zoomBy(1.2)}
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
      <div
        className={`viewport-stage gesture-${gesture}`}
        ref={hostRef}
        role="group"
        tabIndex={0}
        aria-label="Engineering drawing interaction area"
        aria-describedby={!compact ? gestureHintId : undefined}
        aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown + - 0 Home"
        onKeyDown={keyboardNavigate}
        onClickCapture={(event) => {
          if (!suppressClickRef.current) return;
          event.preventDefault();
          event.stopPropagation();
          suppressClickRef.current = false;
        }}
        onDoubleClick={(event) => {
          if (!(event.target as Element).closest(".svg-selectable")) resetView();
        }}
      >
        {renderedView}
        {!compact && (
          <div id={gestureHintId} className="viewport-gesture-hint">
            <span className="mouse-instruction">Mouse: drag to pan, wheel to zoom</span>
            <span className="touch-instruction">Touch: drag to pan, pinch to zoom</span>
            <span>Tap geometry for details</span>
            <span className="keyboard-instruction">Keys: arrows, +, -, 0</span>
          </div>
        )}
        {preferences.legend && (view === "plan" || view === "end" || view === "side") && (
          <div className="viewport-legend">
            <span><i className="line axle" /> Axle line</span>
            <span><i className="line support" /> Support / spread</span>
            <span><i className="line g1" /> G1</span>
            <span><i className="line g2" /> G2</span>
            <span><i className="line g3" /> G3</span>
            {vm.project.model.hydraulicSystemMode === "FOUR_POINT" && <span><i className="line g4" /> G4</span>}
            <span><i className="line polygon" /> Stability boundary</span>
            <span><i className="cog" /> COG</span>
          </div>
        )}
      </div>
    </section>
  );
}
