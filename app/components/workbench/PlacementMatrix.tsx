"use client";

import { useEffect, useRef, useState } from "react";
import { applyBedLayout, bedsFromModel } from "../../engine/bed-layout";
import { validateDeckPpus } from "../../engine/deck-ppus";
import { appendBedAtSelectedTrainFront, bedTrainKeys, groupAndAlignBeds, nextTrainName } from "../../engine/formation-editor";
import { localToWorld, worldToLocal } from "../../engine/placement";
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

function keyFor(kind: "bed" | "ppu", id: string) { return `${kind}:${id}`; }

export function PlacementMatrix({ model, result, selectedId, onChange, onSelect }: Props) {
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState("");
  const [undo, setUndo] = useState<ProjectModel[]>([]);
  const [redo, setRedo] = useState<ProjectModel[]>([]);
  const [definitionId, setDefinitionId] = useState(model.trailers[0]?.definitionId ?? model.catalogue[0]?.id ?? "");
  const publishedSelection = useRef("");
  const beds = model.bedLayout ?? [];
  const errors = [...(model.bedLayout ? applyBedLayout(model, beds).errors : []), ...validateDeckPpus(model)];
  const selectedBedIds = [...selection].filter(key => key.startsWith("bed:")).map(key => key.slice(4));
  const selectedPpuIds = [...selection].filter(key => key.startsWith("ppu:")).map(key => key.slice(4));
  const activeBedId = selectedBedIds.at(-1) ?? (selectedId.startsWith("bed:") ? selectedId.slice(4) : "");
  const activeBed = beds.find(bed => bed.id === activeBedId);
  const selectedTrains = bedTrainKeys(beds, selectedBedIds, model.deckPpus ?? [], selectedPpuIds);
  const trainGroups = [...new Map(beds.map(bed => [bed.train, beds.filter(item => item.train === bed.train)])).entries()];

  useEffect(() => {
    if (!selectedId.startsWith("bed:") && !selectedId.startsWith("ppu:")) return;
    if (selectedId === publishedSelection.current) return;
    setSelection(new Set([selectedId]));
  }, [selectedId]);

  const commit = (next: ProjectModel) => {
    setUndo(values => [...values.slice(-29), structuredClone(model)]);
    setRedo([]);
    onChange(next);
  };
  const changeBeds = (next: BedPlacement[], ppus = model.deckPpus) => commit(applyBedLayout({ ...model, deckPpus: ppus }, next).model);
  const publish = (key: string) => { publishedSelection.current = key; onSelect(key); };
  const chooseBed = (id: string, additive = false) => {
    const key = keyFor("bed", id);
    setSelection(current => {
      const next = additive ? new Set(current) : new Set<string>();
      if (additive && next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
    publish(key);
  };
  const choosePpu = (id: string, additive = false) => {
    const key = keyFor("ppu", id);
    setSelection(current => {
      const next = additive ? new Set(current) : new Set<string>();
      if (additive && next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
    publish(key);
  };
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
  const addIndependent = (axleLines: 4 | 5 | 6) => {
    const definition = model.catalogue.find(item => item.id === definitionId);
    if (!definition) return;
    const bed: BedPlacement = {
      id: `B-${crypto.randomUUID().slice(0, 8)}`,
      train: nextTrainName(beds),
      definitionId: definition.id,
      axleLines,
      xM: model.cargo.extremeX,
      yM: model.cargo.extremeY + definition.trailerWidthM / 2 + beds.length * (definition.trailerWidthM + .47),
      yawDeg: 0,
      ppuRear: false,
      ppuFront: false,
    };
    changeBeds([...beds, bed]);
    chooseBed(bed.id);
  };
  const toggleTrain = (train: string, checked: boolean) => {
    const keys = beds.filter(bed => bed.train === train).map(bed => keyFor("bed", bed.id));
    setSelection(current => {
      const next = new Set(current);
      keys.forEach(key => checked ? next.add(key) : next.delete(key));
      return next;
    });
  };
  const groupSelection = () => {
    const grouped = groupAndAlignBeds(model, beds, model.deckPpus ?? [], selectedBedIds);
    if (grouped.error) { setNotice(grouped.error); return; }
    changeBeds(grouped.beds, grouped.ppus);
    setSelection(new Set(grouped.beds.filter(bed => bed.train === grouped.train).map(bed => keyFor("bed", bed.id))));
    setNotice(`${grouped.train} created and aligned from ${selectedBedIds.length} selected beds.`);
  };
  const appendToSelection = (axleLines: 4 | 5 | 6) => {
    const next = appendBedAtSelectedTrainFront(model, beds, model.deckPpus ?? [], selectedTrains, axleLines, () => `B-${crypto.randomUUID().slice(0, 8)}`);
    if (next.error) { setNotice(next.error); return; }
    changeBeds(next.beds, next.ppus);
    setSelection(new Set((next.addedBedIds ?? []).map(id => keyFor("bed", id))));
    if (next.addedBedIds?.[0]) publish(keyFor("bed", next.addedBedIds[0]));
    setNotice(`${axleLines} AL added at the front of ${selectedTrains.length} selected ${selectedTrains.length === 1 ? "train" : "trains"}.`);
  };
  const alignActiveTrain = () => {
    if (!activeBed) { setNotice("Select a bed before aligning a connected train."); return; }
    const members = beds.filter(bed => bed.train === activeBed.train);
    const definition = model.catalogue.find(item => item.id === activeBed.definitionId);
    if (!definition) return;
    let station = 0;
    const aligned = members.map((bed, index) => {
      const point = localToWorld({ startXM: activeBed.xM, centreYM: activeBed.yM, yawDeg: activeBed.yawDeg }, station);
      station += bed.axleLines * definition.axleSpacingM;
      return { ...bed, xM: point.x, yM: point.y, yawDeg: activeBed.yawDeg, definitionId: activeBed.definitionId, ppuRear: index === 0 && members.some(item => item.ppuRear), ppuFront: index === members.length - 1 && members.some(item => item.ppuFront) };
    });
    let ppus = model.deckPpus ?? [];
    for (const old of members) {
      const next = aligned.find(item => item.id === old.id)!;
      ppus = ppus.map(ppu => {
        if (ppu.hostId !== old.id) return ppu;
        const local = worldToLocal({ startXM: old.xM, centreYM: old.yM, yawDeg: old.yawDeg }, { x: ppu.xM, y: ppu.yM });
        const point = localToWorld({ startXM: next.xM, centreYM: next.yM, yawDeg: next.yawDeg }, local.x, local.y);
        return { ...ppu, xM: point.x, yM: point.y, yawDeg: ppu.yawDeg + next.yawDeg - old.yawDeg };
      });
    }
    changeBeds(beds.map(bed => aligned.find(item => item.id === bed.id) ?? bed), ppus);
    setNotice(`${activeBed.train} aligned from the selected bed's rear datum.`);
  };
  const addPpu = () => {
    const bed = activeBed ?? beds[0];
    if (!bed) return;
    const definition = model.catalogue.find(item => item.id === bed.definitionId)!;
    const point = localToWorld({ startXM: bed.xM, centreYM: bed.yM, yawDeg: bed.yawDeg }, bed.axleLines * definition.axleSpacingM / 2);
    const ppu: DeckPpu = { id: `PPU-${crypto.randomUUID().slice(0, 8)}`, hostId: bed.id, xM: point.x, yM: point.y, yawDeg: bed.yawDeg, lengthM: definition.ppuLengthM ?? 0, widthM: definition.trailerWidthM, heightM: 0, massT: definition.ppuWeightT ?? 0, cogZM: 0, secured: false, dragCoefficient: model.cargo.frontDragCoefficient };
    commit({ ...model, deckPpus: [...model.deckPpus ?? [], ppu] });
    choosePpu(ppu.id);
  };
  const updatePpu = (id: string, patch: Partial<DeckPpu>) => commit({ ...model, deckPpus: model.deckPpus?.map(ppu => ppu.id === id ? { ...ppu, ...patch } : ppu) });

  return <section className="placement-editor" aria-label="Bed and PPU placement editor">
    <header><div><h3>Formation editor</h3><p>Create and select logical trains, then inspect the individual bed that needs changing. Rear is lower X; the front is higher X. Positive rotation turns the front towards +Y.</p></div>
      <div className="placement-actions"><button type="button" disabled={!undo.length} onClick={() => { setRedo(values => [...values, structuredClone(model)]); onChange(undo.at(-1)!); setUndo(values => values.slice(0, -1)); }}>Undo</button><button type="button" disabled={!redo.length} onClick={() => { setUndo(values => [...values, structuredClone(model)]); onChange(redo.at(-1)!); setRedo(values => values.slice(0, -1)); }}>Redo</button></div>
    </header>
    {!model.bedLayout && model.trailers.length > 0 ? <div className="placement-intro"><p>Convert current trailers into individual 4 / 5 / 6-AL beds, retaining their resolved positions and connected trains.</p><button type="button" onClick={() => { try { changeBeds(bedsFromModel(model, result)); setNotice(""); } catch (error) { setNotice(String(error)); } }}>Edit individual beds</button></div> : <>
      <section className="placement-command-panel" aria-label="Formation actions">
        <div className="placement-add-bed"><label>Bed model<select aria-label="New bed model" value={definitionId} onChange={event => setDefinitionId(event.target.value)}>{model.catalogue.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><span>New independent train</span>{([4, 5, 6] as const).map(size => <button type="button" key={size} onClick={() => addIndependent(size)}>+ {size} AL</button>)}</div>
        <div className="placement-batch-actions">
          <div><b>{selectedTrains.length ? `${selectedTrains.length} ${selectedTrains.length === 1 ? "train" : "trains"} selected` : "Select beds or mounted PPUs"}</b><span>{selection.size} item{selection.size === 1 ? "" : "s"} · a selected PPU acts through its supporting train</span></div>
          <div className="placement-action-buttons">
            <button type="button" disabled={!selectedTrains.length} onClick={() => appendToSelection(4)}>Join 4 AL at front</button>
            <button type="button" disabled={!selectedTrains.length} onClick={() => appendToSelection(5)}>Join 5 AL at front</button>
            <button type="button" disabled={!selectedTrains.length} onClick={() => appendToSelection(6)}>Join 6 AL at front</button>
            <button type="button" disabled={selectedBedIds.length < 2} onClick={groupSelection}>Create {nextTrainName(beds)} and align</button>
            <button type="button" disabled={!activeBed} onClick={alignActiveTrain}>Align selected train</button>
            <button type="button" disabled={!selection.size} onClick={() => { setSelection(new Set()); setNotice(""); }}>Clear selection</button>
          </div>
        </div>
      </section>
      {!beds.length ? <p className="placement-intro">No beds placed. Add a bed to begin; no arrangement is assumed.</p> : <>
        <section className="formation-list" aria-label="High-level train list">
          <header><div><h3>Trains</h3><p>Select a whole train or individual beds. Grouping selected beds creates the next numbered train and physically aligns its beds.</p></div><span className="formation-count">{trainGroups.length} train{trainGroups.length === 1 ? "" : "s"} · {beds.length} bed{beds.length === 1 ? "" : "s"}</span></header>
          {trainGroups.map(([train, members]) => {
            const keys = members.map(bed => keyFor("bed", bed.id));
            const checked = keys.every(key => selection.has(key));
            const partlyChecked = !checked && keys.some(key => selection.has(key));
            const totalAl = members.reduce((sum, bed) => sum + bed.axleLines, 0);
            return <article className="formation-train" key={train} data-selected={checked || partlyChecked}>
              <header><label className="formation-select"><input aria-label={`Select ${train}`} type="checkbox" checked={checked} ref={input => { if (input) input.indeterminate = partlyChecked; }} onChange={event => toggleTrain(train, event.target.checked)} /><span>{train}</span></label><span>{totalAl} AL · {members.length} bed{members.length === 1 ? "" : "s"}</span><small>{members[0] && model.catalogue.find(item => item.id === members[0].definitionId)?.name}</small></header>
              <div className="formation-bed-list">{members.map(bed => {
                const index = beds.indexOf(bed) + 1;
                const key = keyFor("bed", bed.id);
                const invalid = errors.some(error => error.includes(bed.id) || error.startsWith(`${bed.train}:`));
                return <div key={bed.id} className={`formation-bed-row ${activeBedId === bed.id ? "active" : ""}`} data-invalid={invalid}><label><input aria-label={`Include B${index} in batch selection`} type="checkbox" checked={selection.has(key)} onChange={() => chooseBed(bed.id, true)} /></label><button type="button" onClick={event => chooseBed(bed.id, event.ctrlKey || event.metaKey || event.shiftKey)}><b>B{index}</b><span>{bed.axleLines} AL</span><span>X {bed.xM.toFixed(2)} m</span><span>Y {bed.yM.toFixed(2)} m</span><span>{bed.yawDeg.toFixed(1)}°</span></button></div>;
              })}</div>
            </article>;
          })}
        </section>
        {activeBed && <section className="bed-inspector" aria-label={`B${beds.indexOf(activeBed) + 1} details`}>
          <header><div><h3>B{beds.indexOf(activeBed) + 1} details</h3><p>{activeBed.train} · edit one bed without losing the formation overview.</p></div><button type="button" onClick={() => { if (confirm(`Remove B${beds.indexOf(activeBed) + 1}?`)) changeBeds(beds.filter(item => item.id !== activeBed.id)); }}>Remove bed</button></header>
          <div className="bed-inspector-fields">
            <label>Connected train<input aria-label={`B${beds.indexOf(activeBed) + 1} train`} value={activeBed.train} onChange={event => update(activeBed.id, { train: event.target.value })} /></label>
            <label>Axle lines<select aria-label={`B${beds.indexOf(activeBed) + 1} axle lines`} value={activeBed.axleLines} onChange={event => update(activeBed.id, { axleLines: Number(event.target.value) as 4 | 5 | 6 })}>{[4, 5, 6].map(size => <option key={size}>{size}</option>)}</select></label>
            <label>Rear X (m)<Numeric label={`B${beds.indexOf(activeBed) + 1} X`} value={activeBed.xM} onChange={xM => update(activeBed.id, { xM })} /></label>
            <label>Centre Y (m)<Numeric label={`B${beds.indexOf(activeBed) + 1} Y`} value={activeBed.yM} onChange={yM => update(activeBed.id, { yM })} /></label>
            <label>Rotation (°)<Numeric label={`B${beds.indexOf(activeBed) + 1} rotation`} value={activeBed.yawDeg} step={1} onChange={yawDeg => update(activeBed.id, { yawDeg })} /></label>
            <label className="placement-checkbox"><input aria-label={`B${beds.indexOf(activeBed) + 1} rear PPU`} type="checkbox" checked={activeBed.ppuRear} onChange={event => update(activeBed.id, { ppuRear: event.target.checked })} /> Rear PPU</label>
            <label className="placement-checkbox"><input aria-label={`B${beds.indexOf(activeBed) + 1} front PPU`} type="checkbox" checked={activeBed.ppuFront} onChange={event => update(activeBed.id, { ppuFront: event.target.checked })} /> Front PPU</label>
          </div>
        </section>}
      </>}
      <header className="ppu-heading"><div><h3>Deck-mounted PPUs</h3><p>These are independently positioned on a selected bed. Selecting one includes its supporting train in batch front additions; it stays on its host bed.</p></div><button type="button" disabled={!beds.length} onClick={addPpu}>+ Deck-mounted PPU</button></header>
      {(model.deckPpus ?? []).map((ppu, index) => <fieldset key={ppu.id} data-invalid={errors.some(error => error.includes(ppu.id))} className="placement-ppu"><legend><label><input aria-label={`Include PPU ${index + 1} in batch selection`} type="checkbox" checked={selection.has(keyFor("ppu", ppu.id))} onChange={() => choosePpu(ppu.id, true)} /> PPU {index + 1}</label></legend>
        <label>Supporting bed<select value={ppu.hostId} onChange={event => updatePpu(ppu.id, { hostId: event.target.value })}><option value="">Select bed</option>{beds.map((bed, bedIndex) => <option value={bed.id} key={bed.id}>B{bedIndex + 1} · {bed.train}</option>)}</select></label>
        {(["xM", "yM", "yawDeg", "lengthM", "widthM", "heightM", "massT", "cogZM", "dragCoefficient"] as const).map((key, fieldIndex) => <label key={key}>{["Centre X (m)", "Centre Y (m)", "Rotation (°)", "Length (m)", "Width (m)", "Height (m)", "Mass (t)", "COG above deck (m)", "Wind drag coefficient"][fieldIndex]}<Numeric label={`PPU ${index + 1} ${key}`} value={ppu[key]} onChange={value => updatePpu(ppu.id, { [key]: value })} /></label>)}
        <label className="placement-checkbox"><input type="checkbox" checked={ppu.secured} onChange={event => updatePpu(ppu.id, { secured: event.target.checked })} /> Positively secured to bed</label>
        <label className="placement-checkbox"><input type="checkbox" checked={ppu.suppliesHydraulics ?? false} onChange={event => updatePpu(ppu.id, { suppliesHydraulics: event.target.checked })} /> Connected and available for traction power</label>
        <button type="button" onClick={() => { if (confirm(`Remove PPU ${index + 1}?`)) commit({ ...model, deckPpus: model.deckPpus?.filter(item => item.id !== ppu.id) }); }}>Remove PPU</button>
      </fieldset>)}
      <p>Connected beds must be end-to-end, use the same model and have the same rotation. Batch extension is atomic: if any selected train would exceed 99 AL or is not aligned, no new beds are added. Attached front PPUs move to the new outer front. Deck-mounted PPUs remain on their selected host bed.</p>
    </>}
    {notice && <p className="placement-notice" role="status">{notice}</p>}
    {errors.length > 0 && <div className="placement-errors" role="alert"><b>Resolve before applying</b><ul>{errors.map(error => <li key={error}>{error}</li>)}</ul></div>}
  </section>;
}
