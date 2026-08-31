import { polygonBounds } from "../../../engine/placement";
import { deckPpuFootprint } from "../../../engine/deck-ppus";
import type { TrailerUnit } from "../../../geometry/types";
import type { EngineeringViewProps } from "./view-types";

/** Global orthographic projection for a yawed chassis. */
export function PlacedTrainElevation({ trailer, props, end = false }: { trailer: TrailerUnit; props: EngineeringViewProps; end?: boolean }) {
  const { transform, vm, onSelect, preferences } = props;
  const bounds = polygonBounds(trailer.footprint);
  const low = end ? bounds.minY : bounds.minX;
  const high = end ? bounds.maxY : bounds.maxX;
  const screen = (u: number, z: number) => transform.toScreen(end ? { x: 0, y: u, z } : { x: u, y: 0, z });
  const wheel = trailer.wheelDiameterM;
  const top = screen(low, trailer.deckHeightM);
  const bottom = screen(high, trailer.deckHeightM - wheel * 0.2);
  const bogies = vm.bogies.filter(bogie => bogie.trailerIndex === trailer.index);
  const angle = trailer.yawDeg * Math.PI / 180;
  const wheelWidth = end ? Math.abs(Math.sin(angle)) * wheel + Math.abs(Math.cos(angle)) * trailer.tyreWidthM : Math.abs(Math.cos(angle)) * wheel + Math.abs(Math.sin(angle)) * trailer.tyreWidthM;
  return <g className="spmt-placed-elevation" onClick={() => onSelect(trailer.id)}>
    {preferences.layers.trailers && <rect x={Math.min(top.x, bottom.x)} y={top.y} width={Math.abs(bottom.x - top.x)} height={Math.abs(bottom.y - top.y)} fill="#202b32" stroke="#d0d8de" />}
    {preferences.layers.axles && bogies.map(bogie => {
      const u = end ? bogie.yM : bogie.xM;
      const a = screen(u - wheelWidth / 2, wheel);
      const b = screen(u + wheelWidth / 2, 0);
      const suspension = screen(u, trailer.deckHeightM - wheel * 0.2);
      return <g key={bogie.id}><line x1={suspension.x} y1={suspension.y} x2={(a.x + b.x) / 2} y2={a.y} stroke="#aabcc8" /><rect x={Math.min(a.x, b.x)} y={a.y} width={Math.abs(b.x - a.x)} height={Math.abs(b.y - a.y)} rx={Math.min(8, Math.abs(b.x - a.x) * .2)} fill="#202b32" stroke="#c4d0d7" /></g>;
    })}
    <text className="view-label" x={top.x} y={top.y - 8}>T{trailer.index + 1} · {trailer.yawDeg}° global projection</text>
  </g>;
}

export function DeckPpuElevation({ props, end = false }: { props: EngineeringViewProps; end?: boolean }) {
  const { vm, transform } = props;
  if (!props.preferences.layers.trailers) return null;
  return <>{(vm.project.model.deckPpus ?? []).map((ppu, index) => {
    const bounds = polygonBounds(deckPpuFootprint(ppu));
    const a = transform.toScreen({ x: bounds.minX, y: bounds.minY, z: vm.project.model.trailerDeckHeightM + ppu.heightM });
    const b = transform.toScreen({ x: bounds.maxX, y: bounds.maxY, z: vm.project.model.trailerDeckHeightM });
    return <g key={ppu.id} aria-label={`Deck-mounted PPU ${index + 1} ${end ? "end" : "side"}`}><rect className="deck-ppu-outline" x={Math.min(a.x, b.x)} y={a.y} width={Math.abs(b.x - a.x)} height={Math.abs(b.y - a.y)} /><text className="view-label" x={(a.x + b.x) / 2} y={a.y - 8} textAnchor="middle">PPU {index + 1}</text></g>;
  })}</>;
}
