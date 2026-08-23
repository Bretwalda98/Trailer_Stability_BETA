"use client";

import {
  IconBox,
  IconChartLine,
  IconChevronDown,
  IconChevronRight,
  IconCirclePlus,
  IconFileReport,
  IconGeometry,
  IconLayoutGrid,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconRoute,
  IconSettings,
  IconSquarePlus,
  IconTruck,
} from "@tabler/icons-react";
import { useState } from "react";
import type { ProjectModel } from "../../engine/types";
import type { GeometryViewModel } from "../../geometry/types";
import type { WorkspaceId } from "./types";

const WORKSPACES: Array<{
  id: WorkspaceId;
  label: string;
  icon: React.ComponentType<{ size?: number; stroke?: number }>;
}> = [
  { id: "geometry", label: "Arrangement", icon: IconGeometry },
  { id: "hydraulics", label: "Hydraulics", icon: IconRoute },
  { id: "load-cases", label: "Load cases", icon: IconLayoutGrid },
  { id: "stability", label: "Stability", icon: IconChartLine },
  { id: "spine-beam", label: "Spine beam", icon: IconSettings },
  { id: "report", label: "Report", icon: IconFileReport },
];

interface ModelTreeProps {
  model: ProjectModel;
  vm: GeometryViewModel;
  workspace: WorkspaceId;
  selectedId: string;
  collapsed: boolean;
  onCollapsedChange(collapsed: boolean): void;
  onWorkspaceChange(workspace: WorkspaceId): void;
  onSelect(id: string): void;
  onModelChange(model: ProjectModel): void;
  onOpenDetails(): void;
}

export function ModelTree({
  model,
  vm,
  workspace,
  selectedId,
  collapsed,
  onCollapsedChange,
  onWorkspaceChange,
  onSelect,
  onModelChange,
  onOpenDetails,
}: ModelTreeProps) {
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const currentWorkspace =
    WORKSPACES.find((item) => item.id === workspace)?.label ?? "Workspace";

  const addTrailer = () => {
    if (model.trailers.length >= 12) return;
    const source = model.trailers.at(-1) ?? model.trailers[0];
    const grouping = model.groupings.at(-1) ?? model.groupings[0];
    if (!source || !grouping) return;
    const trailer = {
      ...structuredClone(source),
      id: `trailer-${Date.now()}`,
      yM: source.yM + 2.8,
      ppuLeft: false,
      ppuRight: false,
    };
    const next = {
      ...model,
      trailers: [...model.trailers, trailer],
      groupings: [...model.groupings, structuredClone(grouping)],
    };
    onModelChange(next);
    onSelect(`trailer:${trailer.id}`);
  };

  const addSupport = () => {
    if (model.supports.length >= 10) return;
    const last = model.supports.at(-1);
    const support = {
      id: `support-${Date.now()}`,
      xM: (last?.xM ?? 0) + 1,
      widthM: last?.widthM ?? 0.5,
      allowed: true,
      active: true,
      positiveConnectionToDeck: false,
    };
    onModelChange({ ...model, supports: [...model.supports, support] });
    onSelect(support.id);
  };

  return (
    <aside className={`model-tree${collapsed ? " is-collapsed" : ""}`} aria-label="Workspace and model navigation">
      <button
        type="button"
        className="model-tree-collapse"
        aria-label={collapsed ? "Show model navigator" : "Hide model navigator"}
        title={collapsed ? "Show model navigator" : "Hide model navigator"}
        onClick={() => onCollapsedChange(!collapsed)}
      >
        {collapsed ? <IconLayoutSidebarLeftExpand size={16} /> : <IconLayoutSidebarLeftCollapse size={16} />}
        {!collapsed && <span>Model navigator</span>}
      </button>

      {collapsed ? (
        <nav className="workspace-shortcuts" aria-label="Analysis workspace">
          {WORKSPACES.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={workspace === id ? "active" : ""}
              aria-label={label}
              title={label}
              onClick={() => onWorkspaceChange(id)}
            >
              <Icon size={17} stroke={1.7} />
            </button>
          ))}
        </nav>
      ) : <>
      <div className={`workspace-navigation${workspaceOpen ? " open" : ""}`}>
        <button
          type="button"
          className="workspace-navigation-toggle"
          aria-expanded={workspaceOpen}
          aria-controls="workspace-navigation-items"
          onClick={() => setWorkspaceOpen((current) => !current)}
        >
          <span className="tree-heading">WORKSPACE</span>
          <b>{currentWorkspace}</b>
          <IconChevronDown size={14} />
        </button>
        <div id="workspace-navigation-items" className="workspace-navigation-items" hidden={!workspaceOpen}>
          {WORKSPACES.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={workspace === id ? "active" : ""}
              onClick={() => {
                onWorkspaceChange(id);
                setWorkspaceOpen(false);
              }}
            >
              <Icon size={15} stroke={1.7} />
              <span>{label}</span>
              <IconChevronRight size={12} className="nav-chevron" />
            </button>
          ))}
        </div>
      </div>

      <div className="object-tree">
        <span className="tree-heading">MODEL</span>
        <button
          className={`tree-root${selectedId === "project-case" ? " selected" : ""}`}
          onClick={() => onSelect("project-case")}
        >
          <IconBox size={14} />
          <b>{model.cargo.name || "Untitled case"}</b>
        </button>
        <details open>
          <summary><IconGeometry size={13} /> Geometry</summary>
          <button
            className={selectedId === vm.cargo.id ? "selected" : ""}
            onClick={() => onSelect(vm.cargo.id)}
          >
            Cargo
          </button>
          {vm.trailers.map((trailer) => (
            <button
              key={trailer.id}
              className={selectedId === trailer.id ? "selected" : ""}
              onClick={() => onSelect(trailer.id)}
            >
              <IconTruck size={12} /> T{trailer.index + 1} · {trailer.definitionName}
            </button>
          ))}
          <button onClick={() => onWorkspaceChange("geometry")}>
            Axle lines <span>{vm.axleLines.length}</span>
          </button>
          <button onClick={() => onWorkspaceChange("spine-beam")}>
            Supports <span>{vm.supports.length}</span>
          </button>
          <button onClick={() => onWorkspaceChange("geometry")}>
            Power packs <span>{vm.powerPacks.length}</span>
          </button>
        </details>
        <details open>
          <summary><IconRoute size={13} /> Hydraulics</summary>
          {vm.groups.map((group) => (
            <button
              key={group.id}
              className={selectedId === group.id ? "selected" : ""}
              onClick={() => {
                onSelect(group.id);
                onWorkspaceChange("hydraulics");
              }}
            >
              <i className={`group-dot g${group.groupId}`} />
              G{group.groupId}
              <span>{group.activeAxleLineCount} AL</span>
            </button>
          ))}
        </details>
        <details>
          <summary><IconLayoutGrid size={13} /> Load cases</summary>
          <button onClick={() => onWorkspaceChange("load-cases")}>Basic static</button>
          <button onClick={() => onWorkspaceChange("load-cases")}>Static incl. slopes</button>
          <button onClick={() => onWorkspaceChange("load-cases")}>Dynamic</button>
        </details>
      </div>

      <div className="tree-actions">
        <button title="Add trailer" disabled={model.trailers.length >= 12} onClick={addTrailer}>
          <IconCirclePlus size={15} /> Trailer
        </button>
        <button title="Add support" disabled={model.supports.length >= 10} onClick={addSupport}>
          <IconSquarePlus size={15} /> Support
        </button>
        <button onClick={onOpenDetails}>
          <IconFileReport size={15} /> Details
        </button>
      </div>

      <div className="units-reference">
        <b>Units</b>
        <span>Length <em>m</em></span>
        <span>Mass <em>t</em></span>
        <span>Force <em>kN</em></span>
        <span>Angle <em>°</em></span>
      </div>
      </>}
    </aside>
  );
}
