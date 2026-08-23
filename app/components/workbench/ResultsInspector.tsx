"use client";

import { IconAlertTriangle, IconCheck, IconExternalLink, IconFileDescription, IconTrash } from "@tabler/icons-react";
import {
  applySharedAxleLines,
  applySharedPins,
  applySharedX,
} from "../../engine/core";
import type { CalculationResult, ProjectModel } from "../../engine/types";
import { formatEngineering, statusLabel } from "../../geometry/format";
import type {
  AxleLine,
  COGPoint,
  GeometryViewModel,
  HydraulicGroup,
  Support,
  TrailerUnit,
  VisualEntityBase,
} from "../../geometry/types";
import type { WorkspaceId } from "./types";
import { EngineeringResultPanels } from "./EngineeringResultPanels";

interface ResultsInspectorProps {
  model: ProjectModel;
  result: CalculationResult;
  vm: GeometryViewModel;
  selectedId: string;
  calculating: boolean;
  workerReady: boolean;
  workerError: string | null;
  onModelChange(model: ProjectModel): void;
  onSelect(id: string): void;
  onNavigate(workspace: WorkspaceId): void;
  onOpenHandCalculation(): void;
}

const RESULT_KEYS: Array<{
  key: keyof CalculationResult["metrics"];
  label: string;
  unit: string;
  scale: number;
}> = [
  { key: "basicUtil", label: "Basic static utilisation", unit: "%", scale: 100 },
  { key: "slopeUtil", label: "Static incl. slopes", unit: "%", scale: 100 },
  { key: "dynamicUtil", label: "Dynamic utilisation", unit: "%", scale: 100 },
  { key: "spineUtil", label: "Spine-beam utilisation", unit: "%", scale: 100 },
  { key: "basicAngle", label: "Basic tipping angle", unit: "°", scale: 1 },
  { key: "slopeAngle", label: "Slope tipping angle", unit: "°", scale: 1 },
  { key: "dynamicAngle", label: "Dynamic tipping angle", unit: "°", scale: 1 },
  { key: "dynamicRatio", label: "Dynamic / static ratio", unit: "%", scale: 100 },
];

function NumericField({
  label,
  value,
  unit,
  step = 0.01,
  onChange,
}: {
  label: string;
  value: number;
  unit?: string;
  step?: number;
  onChange(value: number): void;
}) {
  return (
    <label className="inspector-field">
      <span>{label}</span>
      <div>
        <input
          type="number"
          value={Number.isFinite(value) ? value : 0}
          step={step}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        {unit && <em>{unit}</em>}
      </div>
    </label>
  );
}

function entityCoordinates(entity: VisualEntityBase) {
  const point = entity.engineeringCoordinates;
  return (
    <dl className="coordinate-list">
      <div><dt>X</dt><dd>{formatEngineering(point.x, "m")}</dd></div>
      <div><dt>Y</dt><dd>{formatEngineering(point.y, "m")}</dd></div>
      <div><dt>Z</dt><dd>{formatEngineering(point.z, "m")}</dd></div>
    </dl>
  );
}

function SelectionEditor({
  model,
  vm,
  entity,
  onModelChange,
  onSelect,
  onNavigate,
}: {
  model: ProjectModel;
  vm: GeometryViewModel;
  entity: VisualEntityBase | null;
  onModelChange(model: ProjectModel): void;
  onSelect(id: string): void;
  onNavigate(workspace: WorkspaceId): void;
}) {
  if (!entity) {
    return (
      <div className="empty-selection">
        Select a trailer, axle, support, hydraulic group, cargo item or COG in the viewport.
      </div>
    );
  }

  if (entity.kind === "cargo") {
    return (
      <div className="inspector-form">
        <NumericField
          label="Length"
          value={model.cargo.lengthM}
          unit="m"
          onChange={(value) =>
            onModelChange({ ...model, cargo: { ...model.cargo, lengthM: value } })
          }
        />
        <NumericField
          label="Width"
          value={model.cargo.widthM}
          unit="m"
          onChange={(value) =>
            onModelChange({ ...model, cargo: { ...model.cargo, widthM: value } })
          }
        />
        <NumericField
          label="Height"
          value={model.cargo.heightM}
          unit="m"
          onChange={(value) =>
            onModelChange({ ...model, cargo: { ...model.cargo, heightM: value } })
          }
        />
        <NumericField
          label="X extreme"
          value={model.cargo.extremeX}
          unit="m"
          onChange={(value) =>
            onModelChange({ ...model, cargo: { ...model.cargo, extremeX: value } })
          }
        />
        <NumericField
          label="Y extreme"
          value={model.cargo.extremeY}
          unit="m"
          onChange={(value) =>
            onModelChange({ ...model, cargo: { ...model.cargo, extremeY: value } })
          }
        />
        <NumericField
          label="Mass"
          value={model.cargo.massT}
          unit="t"
          onChange={(value) =>
            onModelChange({ ...model, cargo: { ...model.cargo, massT: value } })
          }
        />
        <button className="text-action" onClick={() => onNavigate("model")}>
          Open all cargo inputs <IconExternalLink size={14} />
        </button>
      </div>
    );
  }

  if (entity.kind === "trailer") {
    const trailerEntity = entity as TrailerUnit;
    const index = trailerEntity.index;
    const input = model.trailers[index];
    if (!input) return entityCoordinates(entity);
    const update = (patch: Partial<typeof input>) => {
      const trailers = model.trailers.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      );
      onModelChange({ ...model, trailers });
    };
    return (
      <div className="inspector-form">
        <label className="inspector-field">
          <span>Trailer model</span>
          <select
            value={input.definitionId}
            onChange={(event) => update({ definitionId: event.target.value })}
          >
            {model.catalogue.map((definition) => (
              <option key={definition.id} value={definition.id}>
                {definition.name}
              </option>
            ))}
          </select>
        </label>
        <NumericField
          label="No. of axle lines"
          value={input.axleLines}
          step={1}
          onChange={(value) => onModelChange(applySharedAxleLines(model, value))}
        />
        <NumericField
          label="Shared X location"
          value={input.xM}
          unit="m"
          onChange={(value) => onModelChange(applySharedX(model, value))}
        />
        <NumericField
          label="Trailer Y location"
          value={input.yM}
          unit="m"
          onChange={(value) => update({ yM: value })}
        />
        <label className="inspector-field">
          <span>Placement reference</span>
          <select
            value={input.placementReference}
            onChange={(event) =>
              update({
                placementReference: event.target.value as typeof input.placementReference,
              })
            }
          >
            <option value="ABSOLUTE">Absolute datum</option>
            <option value="LOAD_COG">Load COG</option>
            <option value="ALL_INCLUSIVE_COG">All-inclusive COG</option>
          </select>
        </label>
        <div className="toggle-row">
          <label><input type="checkbox" checked={input.singleFile} onChange={(event) => update({ singleFile: event.target.checked })} /> Single file</label>
          <label><input type="checkbox" checked={input.ppuLeft} onChange={(event) => update({ ppuLeft: event.target.checked })} /> Rear PPU</label>
          <label><input type="checkbox" checked={input.ppuRight} onChange={(event) => update({ ppuRight: event.target.checked })} /> Front PPU</label>
        </div>
        <button
          className="danger-action"
          disabled={model.trailers.length <= 1}
          onClick={() => {
            const trailers = model.trailers.filter((_, itemIndex) => itemIndex !== index);
            const groupings = model.groupings.filter((_, itemIndex) => itemIndex !== index);
            onModelChange({
              ...model,
              trailers,
              groupings,
              analysedTrailer: Math.min(model.analysedTrailer, trailers.length),
            });
            onSelect("project-case");
          }}
        >
          <IconTrash size={14} /> Remove trailer
        </button>
      </div>
    );
  }

  if (entity.kind === "support") {
    const supportEntity = entity as Support;
    const index = supportEntity.supportIndex;
    const input = model.supports[index];
    if (!input) return entityCoordinates(entity);
    const update = (patch: Partial<typeof input>) =>
      onModelChange({
        ...model,
        supports: model.supports.map((item, itemIndex) =>
          itemIndex === index ? { ...item, ...patch } : item,
        ),
      });
    return (
      <div className="inspector-form">
        <NumericField label="X position" value={input.xM} unit="m" onChange={(value) => update({ xM: value })} />
        <NumericField label="Spread width" value={input.widthM} unit="m" onChange={(value) => update({ widthM: value })} />
        <NumericField
          label="Optional weight"
          value={input.optionalWeightT ?? 0}
          unit="t"
          onChange={(value) => update({ optionalWeightT: value })}
        />
        <div className="toggle-row">
          <label><input type="checkbox" checked={input.allowed} onChange={(event) => update({ allowed: event.target.checked, active: event.target.checked && input.active })} /> Allowed</label>
          <label><input type="checkbox" checked={input.active} disabled={!input.allowed} onChange={(event) => update({ active: event.target.checked })} /> Active input</label>
        </div>
        <dl className="selection-result-list">
          <div><dt>Settled active state</dt><dd>{supportEntity.active ? "YES" : "NO"}</dd></div>
          <div><dt>Static reaction</dt><dd>{formatEngineering(supportEntity.reactionT, "t")}</dd></div>
          <div><dt>Disable reason</dt><dd>{supportEntity.disableReason || "—"}</dd></div>
        </dl>
        <button
          className="danger-action"
          onClick={() => {
            onModelChange({
              ...model,
              supports: model.supports.filter((_, itemIndex) => itemIndex !== index),
            });
            onSelect("project-case");
          }}
        >
          <IconTrash size={14} /> Remove support
        </button>
      </div>
    );
  }

  if (entity.kind === "axle-line") {
    const axle = entity as AxleLine;
    const pins = model.groupings[0]?.pinnedAxleLines ?? [];
    const pinned = pins.includes(axle.axleLine);
    const nextPins = pinned
      ? pins.filter((line) => line !== axle.axleLine)
      : [...pins, axle.axleLine].sort((a, b) => a - b);
    return (
      <div className="inspector-form">
        {entityCoordinates(entity)}
        <dl className="selection-result-list">
          <div><dt>Load</dt><dd>{formatEngineering(axle.loadT, "t")}</dd></div>
          <div><dt>Capacity</dt><dd>{formatEngineering(axle.capacityT, "t")}</dd></div>
          <div><dt>Utilisation</dt><dd>{formatEngineering(axle.utilisation * 100, "%")}</dd></div>
          <div><dt>Groups</dt><dd>{axle.groupIds.map((group) => `G${group}`).join(" / ")}</dd></div>
        </dl>
        <button className="secondary-action" onClick={() => onModelChange(applySharedPins(model, nextPins))}>
          {pinned ? "Unpin axle line" : "Pin axle line"}
        </button>
      </div>
    );
  }

  if (entity.kind === "hydraulic-group") {
    const group = entity as HydraulicGroup;
    const centre = vm.groupCentres.find((item) => item.groupId === group.groupId);
    return (
      <div className="inspector-form">
        <dl className="selection-result-list">
          <div><dt>Group ID</dt><dd style={{ color: group.colour }}>G{group.groupId}</dd></div>
          <div><dt>Active axle lines</dt><dd>{group.activeAxleLineCount}</dd></div>
          <div><dt>Active bogies</dt><dd>{group.activeBogieCount}</dd></div>
          <div><dt>Net static load</dt><dd>{formatEngineering(group.netStaticLoadT, "t")}</dd></div>
          <div><dt>Centre X</dt><dd>{formatEngineering(centre?.point.x, "m")}</dd></div>
          <div><dt>Centre Y</dt><dd>{formatEngineering(centre?.point.y, "m")}</dd></div>
        </dl>
        <button className="text-action" onClick={() => onNavigate("hydraulics")}>
          Edit routing <IconExternalLink size={14} />
        </button>
      </div>
    );
  }

  if (entity.kind === "cog") {
    const cog = entity as COGPoint;
    return (
      <div className="inspector-form">
        {cog.available ? entityCoordinates(cog) : <p>{cog.unavailableReason}</p>}
        <dl className="selection-result-list">
          <div><dt>Marker</dt><dd>{cog.marker}</dd></div>
          <div><dt>COG type</dt><dd>{cog.cogType.replaceAll("-", " ")}</dd></div>
        </dl>
      </div>
    );
  }

  return (
    <div className="inspector-form">
      {entityCoordinates(entity)}
    </div>
  );
}

export function ResultsInspector({
  model,
  result,
  vm,
  selectedId,
  calculating,
  workerReady,
  workerError,
  onModelChange,
  onSelect,
  onNavigate,
  onOpenHandCalculation,
}: ResultsInspectorProps) {
  const selected = vm.entityById.get(selectedId) ?? null;
  const blockingInvalid = ["GEOMETRY_FAIL", "SUPPORT_FAIL", "ERROR"].includes(result.status);

  return (
    <aside className="results-inspector" aria-label="Results and selected item inspector">
      {workerError && (
        <section className="invalid-panel">
          <IconAlertTriangle size={18} />
          <div><b>CALCULATION WORKER ERROR</b><p>{workerError}</p></div>
        </section>
      )}
      {blockingInvalid ? (
        <section className="invalid-panel">
          <IconAlertTriangle size={18} />
          <div>
            <b>{statusLabel(result.status)}</b>
            <p>{result.failDetail || result.failClass || "The current case cannot be evaluated."}</p>
            {result.warnings.slice(0, 4).map((warning) => <span key={warning}>{warning}</span>)}
          </div>
        </section>
      ) : (
        <section className={`result-state result-${result.status.toLowerCase()}`}>
          <div>
            <span>{calculating ? "CALCULATING" : "CURRENT ENGINEERING RESULT"}</span>
            <b>{calculating ? "UPDATING…" : statusLabel(result.status)}</b>
          </div>
          <IconCheck size={20} />
        </section>
      )}
      {result.stabilityReferences.combinedCogPassOnly && (
        <section className="combined-cog-warning" role="status">
          <IconAlertTriangle size={18} />
          <div>
            <b>COMBINED COG PASS ONLY</b>
            <p>The cargo-only stability check fails. The basic, slope and dynamic angle checks pass only when the all-inclusive combined COG is used.</p>
          </div>
        </section>
      )}

      <section className="inspector-section result-summary">
        <header className="result-summary-header">
          <div><b>Results</b><span>{workerReady ? "Worker active" : "Safe fallback"}</span></div>
          <button type="button" onClick={onOpenHandCalculation}>
            <IconFileDescription size={14} /> Hand calculation
          </button>
        </header>
        <dl className="primary-results">
              {RESULT_KEYS.map(({ key, label, unit, scale }) => {
                const metric = result.metrics[key];
                if (!metric.active || metric.value === null) return null;
                return (
                  <div key={key}>
                    <dt>{label}</dt>
                    <dd>
                      <b>{formatEngineering(metric.value * scale, unit)}</b>
                      <span className={`check-${metric.status.toLowerCase()}`}>{metric.status}</span>
                    </dd>
                  </div>
                );
              })}
        </dl>
        <dl className="secondary-results">
              <div><dt>All-inclusive mass</dt><dd>{formatEngineering(result.totalMassT, "t")}</dd></div>
              <div><dt>Active supports</dt><dd>{result.activeSupportCount} / {model.supports.length}</dd></div>
              <div><dt>Controlling group</dt><dd>G{result.analysis.controllingGroup ?? "—"}</dd></div>
              <div><dt>Controlling case</dt><dd>{result.analysis.controllingMode}</dd></div>
              <div><dt>Controlling edge</dt><dd>{result.analysis.controllingEdgeIndex + 1}</dd></div>
              <div><dt>Trailer overlaps</dt><dd>{result.trailerOverlaps.length || "none"}</dd></div>
              <div><dt>Hydraulic system</dt><dd>{model.hydraulicSystemMode === "FOUR_POINT" ? "4-point" : "3-point"}</dd></div>
              <div><dt>Cargo-only stability</dt><dd className={result.stabilityReferences.cargoOnlyPass ? "status-ok" : "status-nok"}>{result.stabilityReferences.cargoOnlyPass ? "PASS" : "FAIL"}</dd></div>
              <div><dt>COG pass basis</dt><dd className={result.stabilityReferences.combinedCogPassOnly ? "status-nok" : "status-ok"}>{result.stabilityReferences.combinedCogPassOnly ? "COMBINED ONLY" : result.stabilityReferences.cargoOnlyPass ? "CARGO + COMBINED" : "NO ANGLE PASS"}</dd></div>
              <div><dt>Polygon minimum width</dt><dd>{result.groupingQuality.minimumAltitudeM.toFixed(3)} m</dd></div>
              <div><dt>Calculation time</dt><dd>{result.calculationMs.toFixed(2)} ms</dd></div>
        </dl>
        {result.roadTransport?.enabled && (
          <dl className="secondary-results road-transport-results">
            <div><dt>Road transport</dt><dd>{result.roadTransport.status}</dd></div>
            <div><dt>Surface</dt><dd>{result.roadTransport.surface.replaceAll("_", " ").toLowerCase()} · {result.roadTransport.condition.toLowerCase()}</dd></div>
            <div><dt>Traction utilisation</dt><dd>{result.roadTransport.tractionUtilisation === null ? "N/A" : formatEngineering(result.roadTransport.tractionUtilisation * 100, "%")}</dd></div>
            <div><dt>Braking utilisation</dt><dd>{result.roadTransport.brakingUtilisation === null ? "N/A" : formatEngineering(result.roadTransport.brakingUtilisation * 100, "%")}</dd></div>
            <div><dt>Driven / braked bogies</dt><dd>{result.roadTransport.drivenBogieCount} / {result.roadTransport.brakedBogieCount}</dd></div>
            <div><dt>Maximum climb</dt><dd>{result.roadTransport.maximumClimbGradeDeg === null ? "N/A" : formatEngineering(result.roadTransport.maximumClimbGradeDeg, "°")}</dd></div>
          </dl>
        )}
        <EngineeringResultPanels model={model} result={result} />
      </section>

      <section className="inspector-section selected-section">
        <header>
          <div>
            <span>SELECTED · {selected?.kind.replaceAll("-", " ").toUpperCase() ?? "NONE"}</span>
            <b>{selected?.selection.title ?? "No selection"}</b>
          </div>
          {selected?.selection.subtitle && <em>{selected.selection.subtitle}</em>}
        </header>
        <SelectionEditor
          model={model}
          vm={vm}
          entity={selected}
          onModelChange={onModelChange}
          onSelect={onSelect}
          onNavigate={onNavigate}
        />
      </section>
    </aside>
  );
}
