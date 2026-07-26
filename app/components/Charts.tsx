"use client";

import type { BeamPoint, CalculationResult, Point2, ProjectModel } from "../engine/types";

function bounds(points: Point2[], padding = 0.8): { minX: number; maxX: number; minY: number; maxY: number } {
  if (!points.length) return { minX: -1, maxX: 1, minY: -1, maxY: 1 };
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  let minX = Math.min(...xs) - padding;
  let maxX = Math.max(...xs) + padding;
  let minY = Math.min(...ys) - padding;
  let maxY = Math.max(...ys) + padding;
  if (maxX - minX < 1) {
    minX -= 0.5;
    maxX += 0.5;
  }
  if (maxY - minY < 1) {
    minY -= 0.5;
    maxY += 0.5;
  }
  return { minX, maxX, minY, maxY };
}

function formatNumber(value: number, digits = 2): string {
  return Number.isFinite(value) ? value.toFixed(digits) : "—";
}

export function StabilityChart({ result }: { result: CalculationResult }) {
  const points = [
    ...result.stabilityPolygon,
    ...result.casePoints.basic,
    ...result.casePoints.slope,
    ...result.casePoints.dynamic,
    ...result.axlePoints.map((item) => item.point),
    { x: result.combinedCog.x, y: result.combinedCog.y },
    { x: result.loadCog.x, y: result.loadCog.y },
  ];
  const extent = bounds(points);
  const width = 760;
  const height = 410;
  const mapX = (value: number) => 44 + ((value - extent.minX) / (extent.maxX - extent.minX)) * (width - 88);
  const mapY = (value: number) => height - 38 - ((value - extent.minY) / (extent.maxY - extent.minY)) * (height - 76);
  const polygon = result.stabilityPolygon.map((point) => `${mapX(point.x)},${mapY(point.y)}`).join(" ");
  const slopeEnvelope = result.casePoints.slope.map((point) => `${mapX(point.x)},${mapY(point.y)}`).join(" ");
  const dynamicEnvelope = result.casePoints.dynamic.map((point) => `${mapX(point.x)},${mapY(point.y)}`).join(" ");
  return (
    <div className="chart-shell">
      <div className="chart-title-row">
        <div>
          <p className="eyebrow">Plan view</p>
          <h3>Stability triangle &amp; COG</h3>
        </div>
        <div className="chart-legend">
          <span><i className="legend-dot cog" />All-inclusive COG</span>
          <span><i className="legend-dot load" />Load COG</span>
          <span><i className="legend-dot axle" />Axle / bogie</span>
          <span><i className="legend-dot slope" />Slope envelope</span>
          <span><i className="legend-dot dynamic" />Dynamic envelope</span>
        </div>
      </div>
      <svg className="engineering-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Stability triangle plan">
        <defs>
          <pattern id="grid" width="38" height="38" patternUnits="userSpaceOnUse">
            <path d="M 38 0 L 0 0 0 38" fill="none" stroke="rgba(129,151,176,.16)" strokeWidth="1" />
          </pattern>
          <filter id="cogGlow">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <rect x="0" y="0" width={width} height={height} rx="14" fill="url(#grid)" />
        {result.stabilityPolygon.length === 3 && (
          <polygon points={polygon} className="stability-polygon" />
        )}
        {result.casePoints.slope.length > 2 && (
          <polygon points={slopeEnvelope} className="case-envelope slope-envelope" />
        )}
        {result.casePoints.dynamic.length > 2 && (
          <polygon points={dynamicEnvelope} className="case-envelope dynamic-envelope" />
        )}
        {result.casePoints.basic.slice(1).map((point, index) => (
          <circle key={`basic-${index}`} cx={mapX(point.x)} cy={mapY(point.y)} r="3.5" className="basic-case-point" />
        ))}
        {result.axlePoints.map((axle, index) => (
          <g key={`${axle.trailerId}-${axle.axleLine}-${index}`}>
            <circle
              cx={mapX(axle.point.x)}
              cy={mapY(axle.point.y)}
              r={axle.pinned ? 5.5 : 3.3}
              className={`axle-point group-${axle.group}${axle.pinned ? " pinned" : ""}`}
            />
          </g>
        ))}
        {result.groups.map((group) => (
          <g key={group.group}>
            <circle cx={mapX(group.point.x)} cy={mapY(group.point.y)} r="16" className={`group-centre group-${group.group}`} />
            <text x={mapX(group.point.x)} y={mapY(group.point.y) + 4} textAnchor="middle" className="group-label">
              G{group.group}
            </text>
          </g>
        ))}
        <g filter="url(#cogGlow)">
          <circle cx={mapX(result.combinedCog.x)} cy={mapY(result.combinedCog.y)} r="8" className="combined-cog" />
          <path
            d={`M${mapX(result.combinedCog.x) - 13},${mapY(result.combinedCog.y)}h26M${mapX(result.combinedCog.x)},${mapY(result.combinedCog.y) - 13}v26`}
            className="cog-cross"
          />
        </g>
        <circle cx={mapX(result.loadCog.x)} cy={mapY(result.loadCog.y)} r="6" className="load-cog" />
        <text x="20" y={height - 14} className="axis-label">X longitudinal (m)</text>
        <text x={width - 18} y="22" textAnchor="end" className="axis-label">Y transverse (m)</text>
      </svg>
      <div className="chart-footer">
        <span>Combined COG {formatNumber(result.combinedCog.x)} m, {formatNumber(result.combinedCog.y)} m</span>
        <span>COG height {formatNumber(result.combinedCog.z)} m</span>
      </div>
    </div>
  );
}

export function LoadPlanChart({ model, result }: { model: ProjectModel; result: CalculationResult }) {
  const trailerPoints = result.resolvedTrailers
    .flatMap((item) => [
      { x: item.startXM - item.ppuLeftLengthM, y: item.centreYM },
      { x: item.startXM + item.lengthM + item.ppuRightLengthM, y: item.centreYM },
    ]);
  const points = [
    { x: model.cargo.extremeX, y: model.cargo.extremeY },
    { x: model.cargo.extremeX + model.cargo.lengthM, y: model.cargo.extremeY + model.cargo.widthM },
    ...trailerPoints,
    ...result.supports.map((item) => ({ x: item.xM, y: model.cargo.extremeY + model.cargo.widthM / 2 })),
  ];
  const extent = bounds(points, 1);
  const width = 760;
  const height = 330;
  const mapX = (value: number) => 42 + ((value - extent.minX) / (extent.maxX - extent.minX)) * (width - 84);
  const mapY = (value: number) => height - 34 - ((value - extent.minY) / (extent.maxY - extent.minY)) * (height - 68);
  return (
    <div className="chart-shell">
      <div className="chart-title-row">
        <div>
          <p className="eyebrow">Geometry</p>
          <h3>Load, trailers &amp; transfer supports</h3>
        </div>
        <span className="chart-note">Rear-right load datum</span>
      </div>
      <svg className="engineering-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Load and trailer plan">
        <defs>
          <pattern id="planGrid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(129,151,176,.14)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width={width} height={height} rx="14" fill="url(#planGrid)" />
        <rect
          x={mapX(model.cargo.extremeX)}
          y={mapY(model.cargo.extremeY + model.cargo.widthM)}
          width={mapX(model.cargo.extremeX + model.cargo.lengthM) - mapX(model.cargo.extremeX)}
          height={mapY(model.cargo.extremeY) - mapY(model.cargo.extremeY + model.cargo.widthM)}
          rx="8"
          className="cargo-outline"
        />
        <text
          x={mapX(model.cargo.extremeX + model.cargo.lengthM / 2)}
          y={mapY(model.cargo.extremeY + model.cargo.widthM / 2)}
          textAnchor="middle"
          className="cargo-label"
        >
          {model.cargo.name || "LOAD"}
        </text>
        {result.resolvedTrailers.map((trailer, index) => {
          const top = trailer.centreYM + trailer.widthM / 2;
          const bottom = trailer.centreYM - trailer.widthM / 2;
          const axlePoints = result.axlePoints.filter((item) => item.trailerId === trailer.id);
          const axleCentres = [...new Set(axlePoints.map((item) => item.point.x))];
          return (
            <g key={trailer.id}>
              <rect
                x={mapX(trailer.startXM)}
                y={mapY(top)}
                width={mapX(trailer.startXM + trailer.lengthM) - mapX(trailer.startXM)}
                height={mapY(bottom) - mapY(top)}
                rx="5"
                className={`trailer-outline trailer-${index % 3}`}
              />
              {axleCentres.map((axleX, axle) => (
                <line
                  key={axle}
                  x1={mapX(axleX)}
                  x2={mapX(axleX)}
                  y1={mapY(top)}
                  y2={mapY(bottom)}
                  className="axle-line"
                />
              ))}
              <text x={mapX(trailer.startXM + trailer.lengthM / 2)} y={mapY(trailer.centreYM) + 4} textAnchor="middle" className="trailer-label">
                T{index + 1}
              </text>
            </g>
          );
        })}
        {result.supports.map((support, index) => (
          <g key={support.id} opacity={support.active ? 1 : 0.35}>
            <line
              x1={mapX(support.xM)}
              x2={mapX(support.xM)}
              y1={mapY(model.cargo.extremeY + model.cargo.widthM)}
              y2={mapY(model.cargo.extremeY)}
              className={support.active ? "support-line" : "support-line disabled"}
            />
            <text x={mapX(support.xM) + 5} y={mapY(model.cargo.extremeY) - 6} className="support-label">
              S{index + 1}
            </text>
          </g>
        ))}
        <circle cx={mapX(result.combinedCog.x)} cy={mapY(result.combinedCog.y)} r="7" className="combined-cog" />
      </svg>
    </div>
  );
}

export function ElevationChart({ model, result }: { model: ProjectModel; result: CalculationResult }) {
  const cargoStart = model.cargo.extremeX;
  const cargoEnd = cargoStart + model.cargo.lengthM;
  const trailerStart = Math.min(...result.resolvedTrailers.map((item) => item.startXM - item.ppuLeftLengthM), cargoStart);
  const trailerEnd = Math.max(
    ...result.resolvedTrailers.map((item) => item.startXM + item.lengthM + item.ppuRightLengthM),
    cargoEnd,
  );
  const minX = trailerStart - 1;
  const maxX = trailerEnd + 1;
  const cargoBase = model.trailerDeckHeightM + model.packing.heightM;
  const maxZ = Math.max(cargoBase + model.cargo.heightM, result.combinedCog.z + 1, 2);
  const width = 760;
  const height = 330;
  const mapX = (value: number) => 48 + ((value - minX) / Math.max(1e-9, maxX - minX)) * (width - 78);
  const mapZ = (value: number) => height - 38 - (value / maxZ) * (height - 66);
  return (
    <div className="chart-shell">
      <div className="chart-title-row">
        <div><p className="eyebrow">Elevation view</p><h3>Load height, packing &amp; COG</h3></div>
        <span className="chart-note">Reference: underside / load datum</span>
      </div>
      <svg className="engineering-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Load and trailer elevation">
        <rect width={width} height={height} rx="14" className="chart-background" />
        <line x1="42" x2={width - 22} y1={mapZ(0)} y2={mapZ(0)} className="zero-line" />
        {result.resolvedTrailers.map((trailer, index) => (
          <rect
            key={trailer.id}
            x={mapX(trailer.startXM - trailer.ppuLeftLengthM)}
            y={mapZ(model.trailerDeckHeightM)}
            width={mapX(trailer.startXM + trailer.lengthM + trailer.ppuRightLengthM) - mapX(trailer.startXM - trailer.ppuLeftLengthM)}
            height={Math.max(5, mapZ(Math.max(0, model.trailerDeckHeightM - 0.28)) - mapZ(model.trailerDeckHeightM))}
            rx="3"
            className={`trailer-outline trailer-${index % 3}`}
          />
        ))}
        <rect
          x={mapX(cargoStart)}
          y={mapZ(cargoBase)}
          width={mapX(cargoEnd) - mapX(cargoStart)}
          height={mapZ(model.trailerDeckHeightM) - mapZ(cargoBase)}
          className="packing-outline"
        />
        <rect
          x={mapX(cargoStart)}
          y={mapZ(cargoBase + model.cargo.heightM)}
          width={mapX(cargoEnd) - mapX(cargoStart)}
          height={mapZ(cargoBase) - mapZ(cargoBase + model.cargo.heightM)}
          rx="6"
          className="cargo-outline"
        />
        <circle cx={mapX(result.loadCog.x)} cy={mapZ(result.loadCog.z)} r="6" className="load-cog" />
        <circle cx={mapX(result.combinedCog.x)} cy={mapZ(result.combinedCog.z)} r="7" className="combined-cog" />
        <text x="16" y="22" className="axis-label">Z (m)</text>
        <text x={width - 22} y={height - 10} textAnchor="end" className="axis-label">X longitudinal (m)</text>
      </svg>
      <div className="chart-footer">
        <span>Load COG Z {formatNumber(result.loadCog.z)} m</span>
        <span>All-inclusive COG Z {formatNumber(result.combinedCog.z)} m</span>
      </div>
    </div>
  );
}

export function AxleLoadChart({ result }: { result: CalculationResult }) {
  const rows = new Map<string, { label: string; group: number; loadT: number; capacityT: number; pinned: boolean }>();
  for (const axle of result.axlePoints) {
    const key = `${axle.trailerId}-${axle.axleLine}`;
    const current = rows.get(key) ?? {
      label: `T${axle.trailerIndex + 1} · AL${axle.axleLine}`,
      group: axle.group,
      loadT: 0,
      capacityT: 0,
      pinned: axle.pinned,
    };
    current.loadT += axle.loadT;
    current.capacityT += axle.capacityT;
    current.pinned ||= axle.pinned;
    rows.set(key, current);
  }
  const items = [...rows.values()];
  const maximum = Math.max(1, ...items.map((item) => Math.max(item.capacityT, item.loadT)));
  const width = Math.max(760, items.length * 42 + 90);
  const height = 285;
  const baseline = 232;
  const barWidth = Math.max(12, Math.min(28, (width - 90) / Math.max(1, items.length) - 5));
  return (
    <div className="chart-shell">
      <div className="chart-title-row">
        <div><p className="eyebrow">Bogie loading</p><h3>Axle-line loads and capacities</h3></div>
        <span className="chart-note">Neutral static case · pinned lines marked</span>
      </div>
      <div className="engineering-chart-scroll">
        <svg className="engineering-chart axle-load-chart" viewBox={`0 0 ${width} ${height}`} style={{ minWidth: width }} role="img" aria-label="Axle line load chart">
          <rect width={width} height={height} rx="14" className="chart-background" />
          <line x1="45" x2={width - 20} y1={baseline} y2={baseline} className="zero-line" />
          {items.map((item, index) => {
            const x = 58 + index * ((width - 90) / Math.max(1, items.length));
            const capacityHeight = (item.capacityT / maximum) * 170;
            const loadHeight = (Math.max(0, item.loadT) / maximum) * 170;
            const utilisation = item.capacityT > 0 ? item.loadT / item.capacityT : 0;
            return (
              <g key={`${item.label}-${index}`}>
                <rect x={x} y={baseline - capacityHeight} width={barWidth} height={capacityHeight} className="capacity-bar" />
                <rect x={x + 3} y={baseline - loadHeight} width={Math.max(4, barWidth - 6)} height={loadHeight} className={utilisation > 1 ? "load-bar overload" : "load-bar"} />
                <text x={x + barWidth / 2} y={baseline + 16} textAnchor="middle" className="tiny-axis-label">{item.label}</text>
                <text x={x + barWidth / 2} y={baseline - loadHeight - 5} textAnchor="middle" className="tiny-axis-label">{(utilisation * 100).toFixed(0)}%</text>
                {item.pinned && <text x={x + barWidth / 2} y={baseline + 30} textAnchor="middle" className="pin-label">PIN</text>}
              </g>
            );
          })}
          <text x="14" y="24" className="axis-label">t</text>
        </svg>
      </div>
    </div>
  );
}

export function BeamLoadChart({ model, result }: { model: ProjectModel; result: CalculationResult }) {
  const beamPoints = result.beam.points;
  const analysed = result.resolvedTrailers.find((item) => item.index === Math.round(model.analysedTrailer) - 1)
    ?? result.resolvedTrailers[0];
  const minX = beamPoints[0]?.xM ?? (analysed?.startXM ?? 0);
  const maxX = beamPoints.at(-1)?.xM ?? ((analysed?.startXM ?? 0) + (analysed?.lengthM ?? 1));
  const axleLines = new Map<number, { xM: number; loadT: number; tareT: number }>();
  for (const axle of result.spineAxlePoints.filter((item) => !analysed || item.trailerId === analysed.id)) {
    const current = axleLines.get(axle.axleLine) ?? { xM: axle.point.x, loadT: 0, tareT: 0 };
    current.loadT += axle.loadT;
    current.tareT += axle.tareT;
    axleLines.set(axle.axleLine, current);
  }
  const loads = [...axleLines.entries()].map(([line, item]) => ({
    id: `AL${line}`,
    xM: item.xM,
    valueT: item.loadT - item.tareT,
    kind: "axle" as const,
  }));
  const reactions = result.supports.filter((item) => item.active).map((item, index) => ({
    id: `S${index + 1}`,
    xM: item.xM,
    valueT: -item.reactionT,
    kind: "support" as const,
  }));
  const all = [...loads, ...reactions];
  const maximum = Math.max(1, ...all.map((item) => Math.abs(item.valueT)));
  const width = 760;
  const height = 280;
  const baseline = 137;
  const mapX = (value: number) => 42 + ((value - minX) / Math.max(1e-9, maxX - minX)) * (width - 70);
  const scale = 92 / maximum;
  return (
    <div className="chart-shell">
      <div className="chart-title-row">
        <div><p className="eyebrow">Spine-beam load diagram</p><h3>Hydraulic reactions &amp; transfer loads</h3></div>
        <span className="chart-note">Static case {result.casePoints.spineLoadCase}</span>
      </div>
      <svg className="engineering-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Spine beam loads">
        <rect width={width} height={height} rx="14" className="chart-background" />
        <line x1="38" x2={width - 24} y1={baseline} y2={baseline} className="beam-axis" />
        {all.map((item) => {
          const y2 = baseline - item.valueT * scale;
          return (
            <g key={`${item.kind}-${item.id}-${item.xM}`}>
              <line x1={mapX(item.xM)} x2={mapX(item.xM)} y1={baseline} y2={y2} className={item.kind === "axle" ? "load-arrow axle-reaction" : "load-arrow support-load"} />
              <circle cx={mapX(item.xM)} cy={y2} r="3.5" className={item.kind === "axle" ? "load-head axle-reaction" : "load-head support-load"} />
              <text x={mapX(item.xM)} y={item.valueT >= 0 ? y2 - 7 : y2 + 15} textAnchor="middle" className="tiny-axis-label">{item.id}</text>
            </g>
          );
        })}
        {model.loosePacking.map((item) => (
          <g key={item.id}>
            <rect x={mapX(item.startXM)} y={baseline + 31} width={Math.max(2, mapX(item.endXM) - mapX(item.startXM))} height="17" className="loose-load-band" />
            <text x={(mapX(item.startXM) + mapX(item.endXM)) / 2} y={baseline + 44} textAnchor="middle" className="tiny-axis-label">{item.type}</text>
          </g>
        ))}
        <text x="18" y="22" className="axis-label">t</text>
        <text x={width - 24} y={height - 10} textAnchor="end" className="axis-label">beam X (m)</text>
      </svg>
    </div>
  );
}

type BeamChannel = "momentKNm" | "shearKN" | "deflectionMm";

function linePath(
  points: BeamPoint[],
  channel: BeamChannel,
  width: number,
  height: number,
): { path: string; zeroY: number; minimum: number; maximum: number } {
  if (!points.length) return { path: "", zeroY: height / 2, minimum: 0, maximum: 0 };
  const values = points.map((point) => point[channel]);
  let minimum = Math.min(...values, 0);
  let maximum = Math.max(...values, 0);
  if (Math.abs(maximum - minimum) < 1e-12) {
    minimum -= 1;
    maximum += 1;
  }
  const minX = points[0].xM;
  const maxX = points.at(-1)?.xM ?? minX + 1;
  const x = (value: number) => 38 + ((value - minX) / Math.max(1e-9, maxX - minX)) * (width - 64);
  const y = (value: number) => 18 + ((maximum - value) / (maximum - minimum)) * (height - 42);
  return {
    path: points.map((point, index) => `${index ? "L" : "M"}${x(point.xM).toFixed(2)},${y(point[channel]).toFixed(2)}`).join(" "),
    zeroY: y(0),
    minimum,
    maximum,
  };
}

export function BeamChart({ result, channel }: { result: CalculationResult; channel: BeamChannel }) {
  const width = 760;
  const height = 270;
  const line = linePath(result.beam.points, channel, width, height);
  const labels: Record<BeamChannel, { title: string; unit: string; colour: string }> = {
    momentKNm: { title: "Bending moment", unit: "kNm", colour: "#37c6a2" },
    shearKN: { title: "Shear force", unit: "kN", colour: "#ffb35c" },
    deflectionMm: { title: "Vertical deflection", unit: "mm", colour: "#7ea7ff" },
  };
  const label = labels[channel];
  return (
    <div className="chart-shell">
      <div className="chart-title-row">
        <div>
          <p className="eyebrow">Analysed trailer beam</p>
          <h3>{label.title}</h3>
        </div>
        <span className="chart-note">{formatNumber(line.minimum)} to {formatNumber(line.maximum)} {label.unit}</span>
      </div>
      {result.beam.points.length ? (
        <svg className="engineering-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label.title} chart`}>
          <defs>
            <linearGradient id={`fill-${channel}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={label.colour} stopOpacity=".32" />
              <stop offset="1" stopColor={label.colour} stopOpacity=".02" />
            </linearGradient>
          </defs>
          <line x1="38" x2={width - 26} y1={line.zeroY} y2={line.zeroY} className="zero-line" />
          <path d={`${line.path} L${width - 26},${line.zeroY} L38,${line.zeroY} Z`} fill={`url(#fill-${channel})`} />
          <path d={line.path} fill="none" stroke={label.colour} strokeWidth="3" strokeLinejoin="round" />
          <text x="18" y="22" className="axis-label">{label.unit}</text>
          <text x={width - 24} y={height - 10} textAnchor="end" className="axis-label">beam X (m)</text>
        </svg>
      ) : (
        <div className="empty-chart">
          <span className="empty-chart-icon">⌁</span>
          <p>The analysed trailer needs at least two effective beam supports.</p>
        </div>
      )}
    </div>
  );
}

export function ProgressBar({ value, label, detail }: { value: number; label: string; detail?: string }) {
  const safe = Math.max(0, Math.min(100, value));
  return (
    <div className="progress-block">
      <div className="progress-label">
        <span>{label}</span>
        <strong>{safe.toFixed(safe >= 10 ? 0 : 1)}%</strong>
      </div>
      <div className="progress-track"><span style={{ width: `${safe}%` }} /></div>
      {detail && <small>{detail}</small>}
    </div>
  );
}
