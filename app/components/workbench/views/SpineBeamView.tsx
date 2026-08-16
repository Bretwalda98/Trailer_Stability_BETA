"use client";

import { GROUP_COLOURS } from "../../../geometry/buildGeometryViewModel";
import type { BeamPoint, ProjectModel, SpineLoadCase } from "../../../engine/types";
import { useEffect, useRef, useState } from "react";
import { ViewGrid } from "../svg-primitives";
import type { EngineeringViewProps } from "./view-types";

interface SpineBeamViewProps extends EngineeringViewProps {
  onModelChange(model: ProjectModel): void;
}

const SPINE_CASES: SpineLoadCase[] = [
  "Neutral",
  "A",
  "B",
  "C",
  "D",
  "A1",
  "A2",
  "A3",
  "B1",
  "B2",
  "B3",
  "C1",
  "C2",
  "C3",
  "D1",
  "D2",
  "D3",
];

function SeriesDiagram({
  title,
  unit,
  points,
  value,
  colour,
}: {
  title: string;
  unit: string;
  points: BeamPoint[];
  value(point: BeamPoint): number;
  colour: string;
}) {
  const width = 820;
  const height = 92;
  const margin = { left: 44, right: 12, top: 18, bottom: 18 };
  const finitePoints = points.filter(
    (point) => Number.isFinite(point.xM) && Number.isFinite(value(point)),
  );
  const xMin = Math.min(...finitePoints.map((point) => point.xM), 0);
  const xMax = Math.max(...finitePoints.map((point) => point.xM), 1);
  const values = finitePoints.map(value);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const maximum = Math.max(1e-9, ...values.map((item) => Math.abs(item)));
  const x = (item: number) =>
    margin.left + ((item - xMin) / Math.max(1e-9, xMax - xMin)) * (width - margin.left - margin.right);
  const y = (item: number) =>
    height / 2 - (item / maximum) * (height / 2 - margin.top);
  const path = finitePoints
    .map((point, index) => `${index ? "L" : "M"} ${x(point.xM).toFixed(2)} ${y(value(point)).toFixed(2)}`)
    .join(" ");
  const minimumValue = values.length ? Math.min(...values) : null;
  const maximumValue = values.length ? Math.max(...values) : null;
  const formatExtrema = (item: number | null) =>
    item === null ? "—" : item.toFixed(2);
  const activePoint = activeIndex === null ? null : finitePoints[activeIndex] ?? null;
  const queueActiveIndex = (index: number) => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      setActiveIndex(index);
      frameRef.current = null;
    });
  };
  const inspectPointer = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!finitePoints.length) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const pointerX = ((event.clientX - rect.left) / Math.max(1, rect.width)) * width;
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    finitePoints.forEach((point, index) => {
      const distance = Math.abs(x(point.xM) - pointerX);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });
    queueActiveIndex(nearestIndex);
  };

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  const activeValue = activePoint ? value(activePoint) : null;
  return (
    <div className="beam-diagram">
      <div className="beam-diagram-title">
        <b>{title}</b>
        <span>MIN {formatExtrema(minimumValue)} {unit}</span>
        <span>MAX {formatExtrema(maximumValue)} {unit}</span>
      </div>
      <div className="beam-diagram-readout" aria-live="polite">
        {activePoint && activeValue !== null
          ? `X ${activePoint.xM.toFixed(3)} m | ${activeValue.toFixed(2)} ${unit}`
          : "Point or touch to inspect"}
      </div>
      <svg
        className="interactive-beam-series"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        tabIndex={0}
        aria-label={`${title} diagram. Use the pointer, touch, or left and right arrow keys to inspect values.`}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          inspectPointer(event);
        }}
        onPointerMove={inspectPointer}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          inspectPointer(event);
        }}
        onPointerCancel={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse" && event.buttons === 0) setActiveIndex(null);
        }}
        onFocus={() => {
          if (activeIndex === null && finitePoints.length) setActiveIndex(0);
        }}
        onKeyDown={(event) => {
          if (!finitePoints.length) return;
          const current = activeIndex ?? 0;
          if (event.key === "ArrowLeft") {
            setActiveIndex(Math.max(0, current - 1));
          } else if (event.key === "ArrowRight") {
            setActiveIndex(Math.min(finitePoints.length - 1, current + 1));
          } else if (event.key === "Home") {
            setActiveIndex(0);
          } else if (event.key === "End") {
            setActiveIndex(finitePoints.length - 1);
          } else {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        <line x1={margin.left} y1={height / 2} x2={width - margin.right} y2={height / 2} />
        <line x1={margin.left} y1={margin.top} x2={margin.left} y2={height - margin.bottom} />
        {path && <path d={path} style={{ stroke: colour }} />}
        {activePoint && activeValue !== null && (
          <g className="beam-series-inspector" style={{ color: colour }}>
            <line
              x1={x(activePoint.xM)}
              y1={margin.top}
              x2={x(activePoint.xM)}
              y2={height - margin.bottom}
            />
            <circle cx={x(activePoint.xM)} cy={y(activeValue)} r={4} />
          </g>
        )}
        <text x={margin.left} y={height - 3}>REAR · 0</text>
        <text x={width - margin.right} y={height - 3} textAnchor="end">
          FRONT · {xMax.toFixed(2)} m
        </text>
      </svg>
    </div>
  );
}

export function SpineBeamView(props: SpineBeamViewProps) {
  const { vm, width, height, preferences, selectedId, onSelect, onModelChange } = props;
  const model = vm.project.model;
  const result = vm.project.result;
  const trailer = vm.trailers[Math.max(0, model.analysedTrailer - 1)] ?? vm.trailers[0];
  const xMinimum = trailer?.startXM ?? vm.bounds.minX;
  const xMaximum = trailer ? trailer.startXM + trailer.lengthM : vm.bounds.maxX;
  const schematicWidth = Math.max(720, width - 24);
  const xScale = (xM: number) =>
    40 + ((xM - xMinimum) / Math.max(1e-9, xMaximum - xMinimum)) * (schematicWidth - 80);

  const setField = <K extends keyof ProjectModel>(key: K, value: ProjectModel[K]) => {
    onModelChange({ ...model, [key]: value });
  };
  const selectFromKeyboard = (
    event: React.KeyboardEvent<SVGGElement>,
    id: string,
  ) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
    onSelect(id);
  };

  return (
    <div className="beam-workspace" style={{ height }}>
      <div className="beam-toolbar">
        <label className="technical-field inline">
          <span>Analysed trailer</span>
          <select
            value={model.analysedTrailer}
            onChange={(event) => setField("analysedTrailer", Number(event.target.value))}
          >
            {vm.trailers.map((item) => (
              <option key={item.id} value={item.index + 1}>
                T{item.index + 1} · {item.definitionName}
              </option>
            ))}
          </select>
        </label>
        <label className="technical-field inline">
          <span>Load case</span>
          <select
            value={model.spineLoadCase}
            onChange={(event) => setField("spineLoadCase", event.target.value as SpineLoadCase)}
          >
            {SPINE_CASES.map((loadCase) => (
              <option key={loadCase}>{loadCase}</option>
            ))}
          </select>
        </label>
        <label className="technical-field inline">
          <span>Mesh size</span>
          <input
            type="number"
            min={0.001}
            step={0.001}
            value={model.spineMeshSizeM}
            onChange={(event) => setField("spineMeshSizeM", Number(event.target.value))}
          />
          <em>m</em>
        </label>
        <span className="beam-unavailable">Slope diagram unavailable from native engine</span>
      </div>

      <div className="beam-scroll">
        <section className="beam-schematic-panel">
          <header>
            <b>Spine-beam load schematic</b>
            <span>
              T{model.analysedTrailer} · {model.spineLoadCase} · calculation mesh{" "}
              {model.spineMeshSizeM.toFixed(3)} m
            </span>
          </header>
          <svg
            className="beam-schematic"
            viewBox={`0 0 ${schematicWidth} 190`}
            role="img"
            aria-label="Spine beam loads, supports and support spreading"
          >
            <ViewGrid width={schematicWidth} height={190} visible={preferences.grid} />
            <line x1={40} y1={82} x2={schematicWidth - 40} y2={82} className="beam-axis" />
            <rect x={40} y={75} width={schematicWidth - 80} height={14} className="beam-member" />
            {result.spineAxlePoints
              .filter((axle) => axle.trailerIndex === model.analysedTrailer - 1)
              .map((axle, index) => {
                const x = xScale(axle.point.x);
                return (
                  <g
                    key={`${axle.trailerId}-${axle.axleLine}-${index}`}
                    className={`beam-load svg-selectable${
                      selectedId === `axle-line:${axle.trailerId}:${axle.axleLine}` ? " is-selected" : ""
                    }`}
                    style={{ color: GROUP_COLOURS[axle.group] }}
                    role="button"
                    tabIndex={0}
                    aria-label={`Select axle line ${axle.axleLine}, load ${axle.loadT.toFixed(1)} tonnes`}
                    onClick={() => onSelect(`axle-line:${axle.trailerId}:${axle.axleLine}`)}
                    onKeyDown={(event) =>
                      selectFromKeyboard(event, `axle-line:${axle.trailerId}:${axle.axleLine}`)
                    }
                  >
                    <line x1={x} y1={28} x2={x} y2={72} />
                    <path d={`M ${x} 72 l -5 -8 l 10 0 z`} />
                    <text x={x} y={20} textAnchor="middle">
                      AL{axle.axleLine}
                    </text>
                    <text x={x} y={112} textAnchor="middle">
                      {axle.loadT.toFixed(1)} t
                    </text>
                  </g>
                );
              })}
            {vm.supports.map((support) => {
              const x = xScale(support.xM);
              const halfSpread = Math.max(2, (support.widthM / Math.max(1e-9, xMaximum - xMinimum)) * (schematicWidth - 80) / 2);
              return (
                <g
                  key={support.id}
                  className={`beam-support svg-selectable${support.active ? "" : " inactive"}${
                    selectedId === support.id ? " is-selected" : ""
                  }`}
                  role="button"
                  tabIndex={0}
                  aria-label={`Select support ${support.supportIndex + 1}, reaction ${support.reactionT.toFixed(1)} tonnes`}
                  onClick={() => onSelect(support.id)}
                  onKeyDown={(event) => selectFromKeyboard(event, support.id)}
                >
                  <line x1={x} y1={89} x2={x} y2={142} />
                  <path d={`M ${x} 90 l -8 14 h 16 z`} />
                  <line x1={x - halfSpread} y1={148} x2={x + halfSpread} y2={148} />
                  <text x={x} y={164} textAnchor="middle">
                    S{support.supportIndex + 1} · {support.reactionT.toFixed(1)} t
                  </text>
                </g>
              );
            })}
            {vm.powerPacks
              .filter((ppu) => ppu.trailerIndex === model.analysedTrailer - 1)
              .map((ppu) => (
                <g key={ppu.id} className="beam-distributed-load">
                  <rect
                    x={xScale(ppu.startXM)}
                    y={50}
                    width={Math.max(2, xScale(ppu.endXM) - xScale(ppu.startXM))}
                    height={18}
                  />
                  <text
                    x={(xScale(ppu.startXM) + xScale(ppu.endXM)) / 2}
                    y={45}
                    textAnchor="middle"
                  >
                    PPU
                  </text>
                </g>
              ))}
            {vm.loosePacking
              .filter((item) => item.sourceTrailerId === trailer?.sourceTrailerId)
              .map((item) => (
                <g key={item.id} className="beam-distributed-load packing">
                  <rect
                    x={xScale(item.startXM)}
                    y={54}
                    width={Math.max(2, xScale(item.endXM) - xScale(item.startXM))}
                    height={14}
                  />
                  <text
                    x={(xScale(item.startXM) + xScale(item.endXM)) / 2}
                    y={48}
                    textAnchor="middle"
                  >
                    {item.type} · {item.massT.toFixed(1)} t
                  </text>
                </g>
              ))}
          </svg>
        </section>

        <section className="beam-diagrams-panel">
          <SeriesDiagram
            title="Shear force"
            unit="kN"
            points={result.beam.points}
            value={(point) => point.shearKN}
            colour="#22d3ee"
          />
          <SeriesDiagram
            title="Bending moment"
            unit="kNm"
            points={result.beam.points}
            value={(point) => point.momentKNm}
            colour="#f59e0b"
          />
          <SeriesDiagram
            title="Deflection"
            unit="mm"
            points={result.beam.points}
            value={(point) => point.deflectionMm}
            colour="#f472b6"
          />
        </section>

        <section className="beam-result-table">
          <table className="engineering-table">
            <thead>
              <tr>
                <th>Result</th>
                <th>Minimum</th>
                <th>X at min (m)</th>
                <th>Maximum</th>
                <th>X at max (m)</th>
                <th>Utilisation</th>
                <th>Check</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Shear force</td>
                <td>{result.beam.shearMinKN.toFixed(2)} kN</td>
                <td>{result.beam.shearMinXM.toFixed(3)}</td>
                <td>{result.beam.shearMaxKN.toFixed(2)} kN</td>
                <td>{result.beam.shearMaxXM.toFixed(3)}</td>
                <td>{(result.beam.shearUtilisation * 100).toFixed(1)}%</td>
                <td className={result.metrics.shearUtil.status === "NOK" ? "status-nok" : "status-ok"}>
                  {result.metrics.shearUtil.status}
                </td>
              </tr>
              <tr>
                <td>Bending moment</td>
                <td>{result.beam.bendingMinKNm.toFixed(2)} kNm</td>
                <td>{result.beam.bendingMinXM.toFixed(3)}</td>
                <td>{result.beam.bendingMaxKNm.toFixed(2)} kNm</td>
                <td>{result.beam.bendingMaxXM.toFixed(3)}</td>
                <td>{(result.beam.bendingUtilisation * 100).toFixed(1)}%</td>
                <td className={result.metrics.bendingUtil.status === "NOK" ? "status-nok" : "status-ok"}>
                  {result.metrics.bendingUtil.status}
                </td>
              </tr>
              <tr>
                <td>Deflection</td>
                <td>{result.beam.deflectionUpMm.toFixed(3)} mm</td>
                <td>{result.beam.deflectionUpXM.toFixed(3)}</td>
                <td>{result.beam.deflectionDownMm.toFixed(3)} mm</td>
                <td>{result.beam.deflectionDownXM.toFixed(3)}</td>
                <td>{result.beam.absoluteDeflectionMm.toFixed(3)} mm absolute</td>
                <td className={result.metrics.deflection.status === "NOK" ? "status-nok" : "status-ok"}>
                  {result.metrics.deflection.status}
                </td>
              </tr>
              <tr>
                <td>Local bending at target</td>
                <td colSpan={2}>{result.beam.localBendingAbsKNm.toFixed(2)} kNm</td>
                <td colSpan={2}>{(result.beam.localBendingUtilisation * 100).toFixed(1)}%</td>
                <td>{model.engineeringDegree} degree</td>
                <td className={result.metrics.localBendingUtil.status === "NOK" ? "status-nok" : "status-ok"}>
                  {result.metrics.localBendingUtil.status}
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
