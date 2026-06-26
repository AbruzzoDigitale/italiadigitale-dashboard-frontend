import type { DragEvent as ReactDragEvent, PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../ui/Icon";
import { Avatar } from "../ui/Avatar";
import { RightSidebarPanel } from "../ui/RightSidebarPanel";
import { formatHours, type WorkloadTrayItem } from "./calendarUtils";

export type { WorkloadTrayItem };
export type WorkloadTrayLayout = "sidebar" | "dock";
export type WorkloadTrayTab = "reassign" | "unsched" | "unassigned";

/** Un operatore con i suoi due bucket di task "da pianificare". */
export interface WorkloadTrayGroup {
  userId: number;
  name: string;
  avatarUrl: string | null;
  reassign: WorkloadTrayItem[];
  unscheduled: WorkloadTrayItem[];
}

interface WorkloadTrayProps {
  /** Operatori (1 = solo se stesso; >1 = vista azienda admin), già raggruppati. */
  groups: WorkloadTrayGroup[];
  /** Task senza alcun operatore (scheda "Da assegnare"): lista piatta, non per operatore. */
  unassignedItems?: WorkloadTrayItem[];
  layout: WorkloadTrayLayout;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tab: WorkloadTrayTab;
  onTab: (tab: WorkloadTrayTab) => void;
  onCardClick: (id: number) => void;
  /** Drag pointer-based (vista calendario). */
  onCardPointerDown?: (event: ReactPointerEvent<HTMLElement>, item: WorkloadTrayItem) => void;
  /** Drag HTML5 (viste accordion/completa/heatmap): rende la scheda `draggable`. */
  onCardDragStart?: (event: ReactDragEvent<HTMLElement>, item: WorkloadTrayItem) => void;
  onCardDragEnd?: () => void;
  draggingId?: number | null;
  /** Toggle "Solo le mie": se presente, mostra il bottone di filtro. */
  onlyMine?: boolean;
  onOnlyMineChange?: (value: boolean) => void;
  hint?: string;
}

/**
 * Tray "Da pianificare" condivisa da tutte le view del Workload.
 * Raggruppa le task per operatore (utile per admin/PM, che le vedono tutte per azienda);
 * con un solo operatore l'intestazione viene omessa.
 */
export function WorkloadTray({
  groups,
  unassignedItems = [],
  layout,
  open,
  onOpenChange,
  tab,
  onTab,
  onCardClick,
  onCardPointerDown,
  onCardDragStart,
  onCardDragEnd,
  draggingId,
  onlyMine = false,
  onOnlyMineChange,
  hint = "Trascina una scheda sulla timeline per assegnarle un orario.",
}: WorkloadTrayProps) {
  const reassignTotal = groups.reduce((s, g) => s + g.reassign.length, 0);
  const unschedTotal = groups.reduce((s, g) => s + g.unscheduled.length, 0);
  const unassignedTotal = unassignedItems.length;
  const total = reassignTotal + unschedTotal + unassignedTotal;
  const showOpHeader = groups.length > 1;

  const itemsOf = (g: WorkloadTrayGroup) => (tab === "reassign" ? g.reassign : g.unscheduled);
  const visibleGroups = tab === "unassigned" ? [] : groups.filter((g) => itemsOf(g).length > 0);

  const renderCard = (item: WorkloadTrayItem) => (
    <div
      key={item.id}
      className={`wlcal-tcard ${draggingId === item.id ? "is-dragging" : ""}`}
      style={item.areaColor ? ({ ["--area" as string]: item.areaColor } as React.CSSProperties) : undefined}
      draggable={onCardDragStart ? true : undefined}
      onPointerDown={onCardPointerDown ? (event) => onCardPointerDown(event, item) : undefined}
      onDragStart={onCardDragStart ? (event) => onCardDragStart(event, item) : undefined}
      onDragEnd={onCardDragEnd}
      onClick={() => onCardClick(item.id)}
      title={onCardPointerDown || onCardDragStart ? "Trascina per assegnare/spostare" : "Apri lavorazione"}
    >
      <div className="wlcal-tc-client">{item.client}</div>
      <div className="wlcal-tc-type">{item.type}</div>
      <div className="wlcal-tc-foot">
        <span className="wlcal-tc-dur">
          <i />
          {formatHours(item.durationMinutes / 60)}
        </span>
        {item.overflowHours != null && item.overflowHours > 0 && (
          <span className="wlcal-tc-over">+{formatHours(item.overflowHours)} oltre limite</span>
        )}
      </div>
    </div>
  );

  // Tabs + nota + lista (raggruppata per operatore): condivisi tra sidebar e drawer dock.
  const body = (
    <>
      {onOnlyMineChange && (
        <div className="wlcal-tray-filterbar">
          <button
            type="button"
            className={`wlcal-tray-mine ${onlyMine ? "is-on" : ""}`}
            onClick={() => onOnlyMineChange(!onlyMine)}
            aria-pressed={onlyMine}
          >
            <Icon name="users" className="h-3.5 w-3.5" />
            Solo le mie
          </button>
        </div>
      )}

      <div className="wlcal-tray-tabs">
        <button type="button" className={tab === "reassign" ? "on" : ""} onClick={() => onTab("reassign")}>
          Da riprogrammare <span className="b">{reassignTotal}</span>
        </button>
        <button type="button" className={tab === "unsched" ? "on" : ""} onClick={() => onTab("unsched")}>
          Senza orario <span className="b">{unschedTotal}</span>
        </button>
        <button type="button" className={tab === "unassigned" ? "on" : ""} onClick={() => onTab("unassigned")}>
          Da assegnare <span className="b">{unassignedTotal}</span>
        </button>
      </div>

      {tab === "reassign" && reassignTotal > 0 && (
        <div className="wlcal-tray-note">
          <Icon name="alert-triangle" className="h-4 w-4 shrink-0" />
          <span>
            <b>Oltre capacità.</b> Queste lavorazioni non rientrano nella giornata pianificata. Riportale in un altro giorno
            trascinandole sul calendario.
          </span>
        </div>
      )}

      {tab === "unassigned" && unassignedTotal > 0 && (
        <div className="wlcal-tray-note">
          <Icon name="alert-triangle" className="h-4 w-4 shrink-0" />
          <span>
            <b>Senza operatore.</b> Lavorazioni da distribuire: trascinale su un operatore per assegnarle.
          </span>
        </div>
      )}

      <div className="wlcal-tray-list">
        {tab === "unassigned" ? (
          unassignedTotal === 0 ? (
            <div className="wlcal-tray-empty">
              Tutto assegnato.
              <br />
              Nessuna lavorazione da distribuire.
            </div>
          ) : (
            <div className="wlcal-tray-group">{unassignedItems.map(renderCard)}</div>
          )
        ) : visibleGroups.length === 0 ? (
          <div className="wlcal-tray-empty">
            Tutto pianificato.
            <br />
            Nessuna scheda in coda.
          </div>
        ) : (
          visibleGroups.map((g) => (
            <div key={g.userId} className="wlcal-tray-group">
              {showOpHeader && (
                <div className="wlcal-tray-ophead">
                  <Avatar name={g.name} src={g.avatarUrl} size="sm" className="h-6 w-6 text-[10px]" />
                  <span className="wlcal-tray-opname">{g.name}</span>
                  <span className="wlcal-tray-opcnt">{itemsOf(g).length}</span>
                </div>
              )}
              {itemsOf(g).map(renderCard)}
            </div>
          ))
        )}
      </div>
    </>
  );

  if (layout === "sidebar") {
    return (
      <aside className="wlcal-tray">
        <div className="wlcal-tray-head">
          <div className="wlcal-tray-tt">
            <Icon name="list" className="h-4 w-4 text-[#E91E8A]" />
            <h3>Da pianificare</h3>
            <span className="wlcal-tray-cnt">{total} schede</span>
          </div>
          <p>{hint}</p>
        </div>
        {body}
      </aside>
    );
  }

  // Dock: bottone flottante + drawer overlay (stesso componente dei filtri Lavorazioni).
  return (
    <>
      {!open && createPortal(
        <button type="button" className="wl-dockbtn" onClick={() => onOpenChange(true)}>
          <Icon name="list" className="h-[18px] w-[18px]" />
          Da pianificare
          <span className="n">{total}</span>
        </button>,
        document.body,
      )}
      <RightSidebarPanel
        open={open}
        onClose={() => onOpenChange(false)}
        title={`Da pianificare · ${total}`}
        widthClassName="w-full max-w-sm"
      >
        <div className="wlcal-tray wlcal-tray--drawer">{body}</div>
      </RightSidebarPanel>
    </>
  );
}
