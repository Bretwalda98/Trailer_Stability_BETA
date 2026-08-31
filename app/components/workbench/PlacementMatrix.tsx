"use client";

import { useState } from "react";
import { applyBedLayout, bedsFromModel } from "../../engine/bed-layout";
import { validateDeckPpus } from "../../engine/deck-ppus";
import { localToWorld, MAX_TRAILER_YAW_DEG, worldToLocal } from "../../engine/placement";
import type { BedPlacement, CalculationResult, DeckPpu, ProjectModel } from "../../engine/types";

interface Props {
  model: ProjectModel;
  result: CalculationResult;
  selectedId: string;
  onChange(model: ProjectModel): void;
  onSelect(id: string): void;
}

function Numeric({ label, value, onChange, step = 0.1 }: { label: string; value: number; onChange(value: number): void; step?: number }) {
  const displayed = Number.isFinite(value) ? Number(value.toFixed(6)) : "";
  return <input key={value} aria-label={label} type="number" step={step} defaultValue={displayed} onBlur={event => {
    const next = event.currentTarget.valueAsNumber;
    if (Number.isFinite(next)) { if (next !== displayed) onChange(next); }
    else event.currentTarget.value = String(displayed);
  }} onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }} />;
}

export function PlacementMatrix({ model, result, selectedId, onChange, onSelect }: Props) {
  const [previousSelection, setSelected] = useState("");
  const selected = selectedId.startsWith("bed:") ? selectedId.slice(4) : previousSelection;
  const [notice, setNotice] = useState("");
  const [undo, setUndo] = useState<ProjectModel[]>([]);
  const [redo, setRedo] = useState<ProjectModel[]>([]);
  const [definitionId, setDefinitionId] = useState(model.trailers[0]?.definitionId ?? model.catalogue[0]?.id ?? "");
  const beds = model.bedLayout ?? [];
  const errors = [...(model.bedLayout ? applyBedLayout(model, beds).errors : []), ...validateDeckPpus(model)];
  const commit = (next: ProjectModel) => {
    setUndo(values => [...values.slice(-29), structuredClone(model)]);
    setRedo([]);
    onChange(next);
  };
  const changeBeds = (next: BedPlacement[], ppus = model.deckPpus) => commit(applyBedLayout({ ...model, deckPpus: ppus }, next).model);
  const choose = (id: string) => { setSelected(id); onSelect(`bed:${id}`); };
  const update = (id: string, patch: Partial<BedPlacement>) => {
    const old = beds.find(bed => bed.id === id)!;
    const next = { ...old, ...patch };
    const ppus = (model.deckPpus ?? []).map(ppu => {
      if (ppu.hostId !== id) return ppu;
      const local = worldToLocal({ startXM: old.xM, centreYM: old.yM, yawDeg: old.yawDeg }, { x: ppu.xM, y: ppu.yM });
      const point = localToWorld({ startXM: next.xM, centreYM: next.yM, yawDeg: next.yawDeg }, local.x, local.y);
      return { ...ppu, xM: point.x, yM: point.y, yawDeg: ppu.yawDeg + next.yawDeg - old.yawDeg };
    });
    changeBeds(beds.map(bed => bed.id === id ? next : bed), ppus);
  };
  const add = (axleLines: 4 | 5 | 6, joined = false) => {
    const previous = beds.find(bed => bed.id === selected);
    const definition = model.catalogue.find(d => d.id === (joined && previous ? previous.definitionId : definitionId));
    if (!definition) return;
    const id = `B-${crypto.randomUUID().slice(0, 8)}`;
    const point = joined && previous ? localToWorld({ startXM: previous.xM, centreYM: previous.yM, yawDeg: previous.yawDeg }, previous.axleLines * definition.axleSpacingM) : { x: model.cargo.extremeX, y: model.cargo.extremeY + definition.trailerWidthM / 2 + beds.length * (definition.trailerWidthM + 0.47) };
    const bed: BedPlacement = { id, train: joined && previous ? previous.train : id, definitionId: definition.id, axleLines, xM: point.x, yM: point.y, yawDeg: joined && previous ? previous.yawDeg : 0, ppuRear: false, ppuFront: joined && previous ? previous.ppuFront : false };
    changeBeds([...beds.map(item => joined && item.id === previous?.id ? { ...item, ppuFront: false } : item), bed]);
    choose(id);
  };
  const alignTrain = () => {
    const first = beds.find(bed => bed.id === selected);
    if (!first) return;
    const members = beds.filter(bed => bed.train === first.train);
    let station = 0;
    const aligned = members.map((bed, index) => {
      const point = localToWorld({ startXM: first.xM, centreYM: first.yM, yawDeg: first.yawDeg }, station);
      station += bed.axleLines * (model.catalogue.find(d => d.id === first.definitionId)?.axleSpacingM ?? 0);
      return { ...bed, xM: point.x, yM: point.y, yawDeg: first.yawDeg, definitionId: first.definitionId, ppuRear: index === 0 && members.some(m => m.ppuRear), ppuFront: index === members.length - 1 && members.some(m => m.ppuFront) };
    });
    const ppus = (model.deckPpus ?? []).map(ppu => {
      const old = members.find(bed => bed.id === ppu.hostId);
      const next = aligned.find(bed => bed.id === ppu.hostId);
      if (!old || !next) return ppu;
      const local = worldToLocal({ startXM: old.xM, centreYM: old.yM, yawDeg: old.yawDeg }, { x: ppu.xM, y: ppu.yM });
      const point = localToWorld({ startXM: next.xM, centreYM: next.yM, yawDeg: next.yawDeg }, local.x, local.y);
      return { ...ppu, xM: point.x, yM: point.y, yawDeg: ppu.yawDeg + next.yawDeg - old.yawDeg };
    });
    changeBeds(beds.map(bed => aligned.find(item => item.id === bed.id) ?? bed), ppus);
  };
  const addPpu = () => {
    const bed = beds.find(item => item.id === selected) ?? beds[0];
    if (!bed) return;
    const definition = model.catalogue.find(d => d.id === bed.definitionId)!;
    const point = localToWorld({ startXM: bed.xM, centreYM: bed.yM, yawDeg: bed.yawDeg }, bed.axleLines * definition.axleSpacingM / 2);
    const ppu: DeckPpu = { id: `PPU-${crypto.randomUUID().slice(0, 8)}`, hostId: bed.id, xM: point.x, yM: point.y, yawDeg: bed.yawDeg, lengthM: definition.ppuLengthM ?? 0, widthM: definition.trailerWidthM, heightM: 0, massT: definition.ppuWeightT ?? 0, cogZM: 0, secured: false, dragCoefficient: model.cargo.frontDragCoefficient };
    commit({ ...model, deckPpus: [...model.deckPpus ?? [], ppu] });
  };
  const updatePpu = (id: string, patch: Partial<DeckPpu>) => commit({ ...model, deckPpus: model.deckPpus?.map(ppu => ppu.id === id ? { ...ppu, ...patch } : ppu) });

  return <section className="placement-editor" aria-label="Bed and PPU placement matrix">
    <header><div><h3>Bed placement matrix</h3><p>Rear-centre X / Y in metres. Positive rotation turns the front towards +Y. Supported bed rotation: ±{MAX_TRAILER_YAW_DEG}°.</p></div>
      <div className="placement-actions">
        <button type="button" disabled={!undo.length} onClick={() => { setRedo(values => [...values, structuredClone(model)]); onChange(undo[undo.length - 1]); setUndo(values => values.slice(0, -1)); }}>Undo</button>
        <button type="button" disabled={!redo.length} onClick={() => { setUndo(values => [...values, structuredClone(model)]); onChange(redo[redo.length - 1]); setRedo(values => values.slice(0, -1)); }}>Redo</button>
      </div>
    </header>
    {!model.bedLayout && model.trailers.length > 0 ? <div className="placement-intro">
      <p>Convert the current trains into individual 4 / 5 / 6-AL beds while retaining their resolved positions and connections.</p>
      <button type="button" onClick={() => { try { changeBeds(bedsFromModel(model, result)); setNotice(""); } catch (error) { setNotice(String(error)); } }}>Edit individual beds</button>
    </div> : <>
      <div className="placement-actions">
        <label>Bed model<select aria-label="New bed model" value={definitionId} onChange={e => setDefinitionId(e.target.value)}>{model.catalogue.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
        {([4, 5, 6] as const).map(size => <button type="button" key={size} onClick={() => add(size)}>+ {size} AL bed</button>)}
      </div>
      <div className="placement-table-scroll" tabIndex={0} aria-label="Scrollable placement table">
        <table className="placement-table"><thead><tr><th>Bed</th><th>Connected train</th><th>AL</th><th>Rear X (m)</th><th>Centre Y (m)</th><th>Rotation (°)</th><th>Rear PPU</th><th>Front PPU</th><th>Remove</th></tr></thead>
          <tbody>{beds.map((bed, index) => <tr key={bed.id} data-invalid={errors.some(error => error.includes(bed.id) || error.startsWith(`${bed.train}:`))} className={selected === bed.id ? "selected" : ""} onFocus={() => choose(bed.id)}>
            <th><button type="button" onClick={() => choose(bed.id)}>B{index + 1}</button><small>{model.catalogue.find(d => d.id === bed.definitionId)?.name}</small></th>
            <td><input aria-label={`B${index + 1} train`} value={bed.train} onChange={e => update(bed.id, { train: e.target.value })} /></td>
            <td><select aria-label={`B${index + 1} axle lines`} value={bed.axleLines} onChange={e => update(bed.id, { axleLines: Number(e.target.value) as 4 | 5 | 6 })}>{[4, 5, 6].map(size => <option key={size}>{size}</option>)}</select></td>
            <td><Numeric label={`B${index + 1} X`} value={bed.xM} onChange={xM => update(bed.id, { xM })} /></td>
            <td><Numeric label={`B${index + 1} Y`} value={bed.yM} onChange={yM => update(bed.id, { yM })} /></td>
            <td><Numeric label={`B${index + 1} rotation`} value={bed.yawDeg} step={1} onChange={yawDeg => update(bed.id, { yawDeg })} /></td>
            <td><input aria-label={`B${index + 1} rear PPU`} type="checkbox" checked={bed.ppuRear} onChange={e => update(bed.id, { ppuRear: e.target.checked })} /></td>
            <td><input aria-label={`B${index + 1} front PPU`} type="checkbox" checked={bed.ppuFront} onChange={e => update(bed.id, { ppuFront: e.target.checked })} /></td>
            <td><button type="button" aria-label={`Remove B${index + 1}`} onClick={() => changeBeds(beds.filter(item => item.id !== bed.id))}>×</button></td>
          </tr>)}</tbody>
        </table>
      </div>
      {!beds.length && <p className="placement-intro">No beds placed. Add a bed to begin; no arrangement is assumed.</p>}
      <div className="placement-actions">
        {([4, 5, 6] as const).map(size => <button type="button" key={size} disabled={!selected} onClick={() => add(size, true)}>Join {size} AL at front</button>)}
        <button type="button" disabled={!selected} onClick={alignTrain}>Align connected train</button>
      </div>
      <p>Same train ID = a continuous, end-to-end connected beam. Different train IDs = independently positioned trains. “Align” rebuilds that train from the selected bed’s rear datum, in table order.</p>
      <header><div><h3>Deck-mounted PPUs</h3><p>Independent position and orientation, positively secured to the selected bed. X / Y is the PPU centre; COG Z is above deck. Height and COG must be confirmed from equipment data.</p></div><button type="button" disabled={!beds.length} onClick={addPpu}>+ Deck-mounted PPU</button></header>
      {(model.deckPpus ?? []).map((ppu, index) => <fieldset key={ppu.id} data-invalid={errors.some(error => error.includes(ppu.id))} className="placement-ppu"><legend>PPU {index + 1}</legend>
        <label>Supporting bed<select value={ppu.hostId} onChange={e => updatePpu(ppu.id, { hostId: e.target.value })}><option value="">Select bed</option>{beds.map((bed, i) => <option value={bed.id} key={bed.id}>B{i + 1} · {bed.train}</option>)}</select></label>
        {(["xM", "yM", "yawDeg", "lengthM", "widthM", "heightM", "massT", "cogZM", "dragCoefficient"] as const).map((key, i) => <label key={key}>{["Centre X (m)", "Centre Y (m)", "Rotation (°)", "Length (m)", "Width (m)", "Height (m)", "Mass (t)", "COG above deck (m)", "Wind drag coefficient"][i]}<Numeric label={`PPU ${index + 1} ${key}`} value={ppu[key]} onChange={value => updatePpu(ppu.id, { [key]: value })} /></label>)}
        <label className="placement-checkbox"><input type="checkbox" checked={ppu.secured} onChange={e => updatePpu(ppu.id, { secured: e.target.checked })} /> Positively secured to bed</label>
        <label className="placement-checkbox"><input type="checkbox" checked={ppu.suppliesHydraulics ?? false} onChange={e => updatePpu(ppu.id, { suppliesHydraulics: e.target.checked })} /> Connected and available for traction power</label>
        <button type="button" onClick={() => commit({ ...model, deckPpus: model.deckPpus?.filter(item => item.id !== ppu.id) })}>Remove PPU</button>
      </fieldset>)}
      <p>PPU mass, COG, inertial forces and unshielded wind areas enter the global checks. The supporting train receives a concentrated PPU load at its centre. Verify mounting footprint, local deck strength, torsion and lashings separately. Numeric edits apply on leaving the field or pressing Enter.</p>
    </>}
    {notice && <p role="alert">{notice}</p>}
    {errors.length > 0 && <div className="placement-errors" role="alert"><b>Resolve before applying</b><ul>{errors.map(error => <li key={error}>{error}</li>)}</ul></div>}
  </section>;
}
