import type { DragEvent as ReactDragEvent, PointerEvent as ReactPointerEvent } from "react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../ui/Icon";
import { Avatar } from "../ui/Avatar";
import { RightSidebarPanel } from "../ui/RightSidebarPanel";
import { formatHours, type WorkloadTrayItem } from "./calendarUtils";

export type { WorkloadTrayItem };
export type WorkloadTrayLayout = "sidebar" | "dock";
export type WorkloadTrayTab = "reassign" | "unsched" | "overdue" | "review" | "unassigned";

/** Un operatore con i suoi bucket di task "da pianificare" + scadute + in revisione. */
export interface WorkloadTrayGroup {
  userId: number;
  name: string;
  avatarUrl: string | null;
  reassign: WorkloadTrayItem[];
  unscheduled: WorkloadTrayItem[];
  overdue: WorkloadTrayItem[];
  review: WorkloadTrayItem[];
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
  /** Toggle "Tutti gli operatori" (admin/PM): ignora la selezione operatori del calendario. */
  allOperators?: boolean;
  onAllOperatorsChange?: (value: boolean) => void;
  /**
   * Se valorizzato, solo queste schede restano inline (nell'ordine dato) e le
   * altre finiscono in un menu "···". Usato dalla vista operatore per tenere in
   * primo piano Scadute e In revisione. Se assente, la barra mostra tutte le
   * schede scrollando orizzontalmente (comportamento admin/PM).
   */
  priorityTabs?: WorkloadTrayTab[];
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
  allOperators = false,
  onAllOperatorsChange,
  priorityTabs,
  hint = "Trascina una scheda sulla timeline per assegnarle un orario.",
}: WorkloadTrayProps) {
  const reassignTotal = groups.reduce((s, g) => s + g.reassign.length, 0);
  const unschedTotal = groups.reduce((s, g) => s + g.unscheduled.length, 0);
  const overdueTotal = groups.reduce((s, g) => s + g.overdue.length, 0);
  const reviewTotal = groups.reduce((s, g) => s + g.review.length, 0);
  const unassignedTotal = unassignedItems.length;
  const total = reassignTotal + unschedTotal + overdueTotal + reviewTotal + unassignedTotal;
  const showOpHeader = groups.length > 1;

  // Schede: inline (in primo piano) + eventuale overflow nel menu "···".
  const allTabs: { key: WorkloadTrayTab; label: string; count: number }[] = [
    { key: "reassign", label: "Da riprogrammare", count: reassignTotal },
    { key: "unsched", label: "Senza orario", count: unschedTotal },
    { key: "overdue", label: "Scadute", count: overdueTotal },
    { key: "review", label: "In revisione", count: reviewTotal },
    { key: "unassigned", label: "Da assegnare", count: unassignedTotal },
  ];
  const inlineTabs = priorityTabs
    ? priorityTabs.map((k) => allTabs.find((t) => t.key === k)!).filter(Boolean)
    : allTabs;
  const overflowTabs = priorityTabs ? allTabs.filter((t) => !priorityTabs.includes(t.key)) : [];
  const activeOverflow = overflowTabs.find((t) => t.key === tab) ?? null;
  const [moreOpen, setMoreOpen] = useState(false);

  const itemsOf = (g: WorkloadTrayGroup) =>
    tab === "reassign" ? g.reassign
      : tab === "overdue" ? g.overdue
        : tab === "review" ? g.review
          : g.unscheduled;
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
      <div className="wlcal-tc-type">{item.type}</div>
      <div className="wlcal-tc-client">{item.client}</div>
      <div className="wlcal-tc-foot">
        <span className="wlcal-tc-dur">
          <i />
          {formatHours(item.durationMinutes / 60)}
        </span>
        {item.isOverdue && (
          <span className={`wlcal-tc-overdue ${item.nonDeferrable ? "is-hard" : ""}`}>
            <Icon name="alert-triangle" className="h-3 w-3 shrink-0" />
            {item.daysOverdue != null && item.daysOverdue > 0
              ? `scaduta da ${item.daysOverdue}g`
              : "scaduta"}
          </span>
        )}
        {item.isReview && (
          <span className="wlcal-tc-review">
            <Icon name="eye" className="h-3 w-3 shrink-0" />
            in revisione
          </span>
        )}
        {item.overflowHours != null && item.overflowHours > 0 && (
          <span className="wlcal-tc-over">+{formatHours(item.overflowHours)} oltre limite</span>
        )}
      </div>
    </div>
  );

  // Tabs + nota + lista (raggruppata per operatore): condivisi tra sidebar e drawer dock.
  const body = (
    <>
      {(onOnlyMineChange || onAllOperatorsChange) && (
        <div className="wlcal-tray-filterbar">
          {onAllOperatorsChange && (
            <button
              type="button"
              className={`wlcal-tray-mine ${allOperators ? "is-on" : ""}`}
              onClick={() => onAllOperatorsChange(!allOperators)}
              aria-pressed={allOperators}
              title="Mostra le task di tutti gli operatori, ignorando la selezione del calendario"
            >
              <Icon name="users" className="h-3.5 w-3.5" />
              Tutti gli operatori
            </button>
          )}
          {onOnlyMineChange && (
            <button
              type="button"
              className={`wlcal-tray-mine ${onlyMine ? "is-on" : ""}`}
              onClick={() => onOnlyMineChange(!onlyMine)}
              aria-pressed={onlyMine}
            >
              <Icon name="user-circle" className="h-3.5 w-3.5" />
              Solo le mie
            </button>
          )}
        </div>
      )}

      <div className={`wlcal-tray-tabs ${priorityTabs ? "wlcal-tray-tabs--priority" : ""}`}>
        {inlineTabs.map((t) => (
          <button key={t.key} type="button" className={tab === t.key ? "on" : ""} onClick={() => onTab(t.key)}>
            {t.label} <span className="b">{t.count}</span>
          </button>
        ))}

        {overflowTabs.length > 0 && (
          <div className="wlcal-tray-more">
            <button
              type="button"
              className={`wlcal-tray-more-btn ${activeOverflow ? "on" : ""}`}
              onClick={() => setMoreOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              title="Altre schede"
            >
              {activeOverflow ? (
                <>{activeOverflow.label} <span className="b">{activeOverflow.count}</span></>
              ) : (
                <span className="wlcal-tray-more-dots" aria-hidden>···</span>
              )}
            </button>
            {moreOpen && (
              <>
                <button
                  type="button"
                  className="wlcal-tray-more-backdrop"
                  aria-hidden
                  tabIndex={-1}
                  onClick={() => setMoreOpen(false)}
                />
                <div className="wlcal-tray-more-menu" role="menu">
                  {overflowTabs.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      role="menuitem"
                      className={tab === t.key ? "on" : ""}
                      onClick={() => { onTab(t.key); setMoreOpen(false); }}
                    >
                      <span>{t.label}</span>
                      <span className="b">{t.count}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
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

      {tab === "overdue" && overdueTotal > 0 && (
        <div className="wlcal-tray-note wlcal-tray-note--danger">
          <Icon name="alert-triangle" className="h-4 w-4 shrink-0" />
          <span>
            <b>Oltre la scadenza.</b> Queste lavorazioni hanno superato la data di scadenza. Riprogrammale o completale al più presto.
          </span>
        </div>
      )}

      {tab === "review" && reviewTotal > 0 && (
        <div className="wlcal-tray-note wlcal-tray-note--review">
          <Icon name="eye" className="h-4 w-4 shrink-0" />
          <span>
            <b>In revisione.</b> Lavorazioni consegnate e in attesa di revisione. Aprile per revisionarle o approvarle.
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
            {tab === "overdue" ? (
              <>
                Nessuna task scaduta.
                <br />
                Tutto entro i tempi.
              </>
            ) : tab === "review" ? (
              <>
                Nessuna task in revisione.
                <br />
                Niente in attesa di revisione.
              </>
            ) : (
              <>
                Tutto pianificato.
                <br />
                Nessuna scheda in coda.
              </>
            )}
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
