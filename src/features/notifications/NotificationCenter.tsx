import { useEffect, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Icon, type IconName } from "../../components/ui/Icon";
import {
  buildNotifGroups,
  NOTIF_COM_FILTERS,
  NOTIF_TABS,
  NOTIF_TYPES,
  type NotifGroup,
  type NotifItem,
  type NotifTabKey,
} from "./notificationsData";
import type { UseNotificationsReturn } from "./useNotifications";
import { RequestEditorModal } from "../../components/requests/RequestEditorModal";
import "./notifications.css";

interface NotificationCenterProps {
  open: boolean;
  onClose: () => void;
  notifications: UseNotificationsReturn;
  onOpenPreferences: () => void;
}

// Scheda attiva: le 4 categorie + l'Archivio.
type ViewKey = NotifTabKey | "archivio";

interface RowActions {
  onActivate: (item: NotifItem) => void;
  onToggleRead: (item: NotifItem) => void;
  onArchive: (item: NotifItem) => void;
  onRestore: (item: NotifItem) => void;
  archivedView: boolean;
}

type SwipeAction = { label: string; icon: IconName; tone: string; run: () => void };

const ACT_W = 84; // larghezza di un'azione swipe

// Riga con gesture stile iOS/WhatsApp: trascinando verso destra si scopre l'azione
// letta/da-leggere, verso sinistra le azioni (Apri, Archivia…). Un tap normale attiva.
function SwipeRow({
  className,
  left = [],
  right = [],
  onTap,
  children,
}: {
  className?: string;
  left?: SwipeAction[];
  right?: SwipeAction[];
  onTap: () => void;
  children: React.ReactNode;
}) {
  const THRESH = 44;
  const leftW = left.length * ACT_W;
  const rightW = right.length * ACT_W;
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const horiz = useRef(false);
  const didDrag = useRef(false);

  const onDown = (e: React.PointerEvent) => {
    start.current = { x: e.clientX, y: e.clientY };
    horiz.current = false;
    didDrag.current = false;
  };
  const onMove = (e: React.PointerEvent) => {
    const s = start.current;
    if (!s) return;
    const ddx = e.clientX - s.x;
    const ddy = e.clientY - s.y;
    if (!horiz.current) {
      if (Math.abs(ddx) < 6 || Math.abs(ddx) <= Math.abs(ddy)) return; // scroll verticale
      horiz.current = true;
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    }
    didDrag.current = true;
    let v = ddx;
    if (v > 0 && !leftW) v = 0;
    if (v < 0 && !rightW) v = 0;
    v = Math.max(-(rightW + 22), Math.min(leftW + 22, v));
    setDx(v);
  };
  const onUp = () => {
    if (!start.current) return;
    start.current = null;
    if (leftW && dx >= THRESH) setDx(leftW);
    else if (rightW && dx <= -THRESH) setDx(-rightW);
    else setDx(0);
  };
  const onContentClick = () => {
    if (didDrag.current) {
      didDrag.current = false;
      return; // era uno swipe, non un tap
    }
    if (dx !== 0) {
      setDx(0); // era aperta: chiudi
      return;
    }
    onTap();
  };
  const runAction = (a: SwipeAction) => {
    a.run();
    setDx(0);
  };

  const actionBtn = (a: SwipeAction, i: number) => (
    <button
      type="button"
      key={i}
      className={`nt-swipe-act tone-${a.tone}`}
      style={{ width: ACT_W }}
      onClick={() => runAction(a)}
      tabIndex={-1}
    >
      <Icon name={a.icon} className="h-[18px] w-[18px]" />
      <span>{a.label}</span>
    </button>
  );

  return (
    <div className={`nt-swipe${dx !== 0 ? " open" : ""}`}>
      {leftW > 0 && (
        <div className="nt-swipe-side left" style={{ width: leftW }}>
          {left.map(actionBtn)}
        </div>
      )}
      {rightW > 0 && (
        <div className="nt-swipe-side right" style={{ width: rightW }}>
          {right.map(actionBtn)}
        </div>
      )}
      <div
        className={className}
        style={{ transform: `translateX(${dx}px)`, transition: start.current ? "none" : undefined }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onClick={onContentClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") onTap();
        }}
      >
        {children}
      </div>
    </div>
  );
}

function NotifItemRow({ item, actions }: { item: NotifItem; actions: RowActions }) {
  const meta = NOTIF_TYPES[item.type] ?? { label: item.type, icon: "bell" as const, tone: "neutral" as const };
  const readAction: SwipeAction = item.unread
    ? { label: "Letta", icon: "check", tone: "mint", run: () => actions.onToggleRead(item) }
    : { label: "Da leggere", icon: "mail", tone: "amber", run: () => actions.onToggleRead(item) };
  const openAction: SwipeAction = { label: "Apri", icon: "chevron-right", tone: "indigo", run: () => actions.onActivate(item) };
  const archiveAction: SwipeAction = actions.archivedView
    ? { label: "Ripristina", icon: "refresh-cw", tone: "slate", run: () => actions.onRestore(item) }
    : { label: "Archivia", icon: "download", tone: "slate", run: () => actions.onArchive(item) };

  return (
    <SwipeRow
      className={`nt-item tone-${meta.tone}${item.unread ? " unread" : ""}`}
      left={[readAction]}
      right={[openAction, archiveAction]}
      onTap={() => actions.onActivate(item)}
    >
      <span className="nt-ic">
        <Icon name={meta.icon} className="h-4 w-4" />
      </span>
      <div className="nt-body">
        <div className="nt-line1">
          <span className="nt-title">{item.title}</span>
          {item.ref && <span className="nt-ref">{item.ref}</span>}
        </div>
        <div className="nt-line2">
          <span className={`nt-badge tone-${meta.tone}`}>{meta.label}</span>
          {item.who && <span className="nt-who">da {item.who}</span>}
          {item.scope && item.scope !== item.who && <span className="nt-who">{item.scope}</span>}
        </div>
        {item.note && <div className="nt-note">{item.note}</div>}
      </div>
      <div className="nt-meta">
        <span className="nt-time">{item.time}</span>
        {item.unread && <span className="nt-dot" />}
      </div>

      {/* Su desktop (mouse) le stesse azioni delle gesture sono anche pulsanti:
          compaiono al passaggio del mouse. Su touch restano le gesture. */}
      <div className="nt-actions">
        {[readAction, openAction, archiveAction].map((a) => (
          <button
            key={a.label}
            type="button"
            className={`nt-act tone-${a.tone}`}
            title={a.label}
            aria-label={a.label}
            onClick={(e) => {
              e.stopPropagation();
              a.run();
            }}
          >
            <Icon name={a.icon} className="h-[15px] w-[15px]" />
          </button>
        ))}
      </div>
    </SwipeRow>
  );
}

function GroupedList({ groups, actions }: { groups: NotifGroup[]; actions: RowActions }) {
  if (groups.length === 0) return <EmptyState />;
  return (
    <div className="nt-groups">
      {groups.map((g) => {
        const unread = g.items.filter((i) => i.unread).length;
        return (
          <div className="nt-group" key={g.key}>
            <div className="nt-group-head">
              <span className="nt-group-name">{g.label}</span>
              <span className="nt-group-count">{g.items.length}</span>
              {unread > 0 && <span className="nt-group-unread">{unread} nuove</span>}
            </div>
            <div className="nt-group-items">
              {g.items.map((it) => (
                <NotifItemRow key={it.id} item={it} actions={actions} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FlatList({ items, actions, emptyLabel }: { items: NotifItem[]; actions: RowActions; emptyLabel?: string }) {
  if (items.length === 0) return <EmptyState label={emptyLabel} />;
  return (
    <div className="nt-group-items flat">
      {items.map((it) => (
        <NotifItemRow key={it.id} item={it} actions={actions} />
      ))}
    </div>
  );
}

function EmptyState({ label }: { label?: string }) {
  return (
    <div className="nt-empty">
      <Icon name="check-circle" className="h-5 w-5" />
      {label ?? "Nessuna notifica"}
    </div>
  );
}

// Rotta di destinazione per una notifica (dove "entrare" al click).
function routeForItem(item: NotifItem): string | null {
  const isTask = item.tab === "task" || item.entity_type === "work_item";
  if (isTask && item.entity_id != null) return `/work-items?open=${item.entity_id}`;
  // Richiesta: apre direttamente l'editor di QUELLA richiesta, non la lista.
  if (item.tab === "richieste") return item.entity_id != null ? `/requests/edit?quote_id=${item.entity_id}` : "/requests";
  if (item.tab === "contratti") return "/contracts-pipeline";
  if (item.tab === "comunicazioni") return "/comunicazioni";
  return null;
}

export function NotificationCenter({ open, onClose, notifications, onOpenPreferences }: NotificationCenterProps) {
  const { counts, itemsByTab, archived, loadArchived, markRead, markUnread, markAllRead, archive, unarchive } =
    notifications;
  const navigate = useNavigate();
  const [tab, setTab] = useState<ViewKey>("task");
  const [comFilter, setComFilter] = useState<string>("all");
  const [expanded, setExpanded] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Entrando nella scheda Archivio, carica le archiviate (fetch dedicato).
  useEffect(() => {
    if (open && tab === "archivio") void loadArchived();
  }, [open, tab, loadArchived]);

  if (!open) return null;

  // Espansione tendina ↔ modal centrale con morphing FLIP (misuro prima/dopo e
  // animo il delta): resa fluida senza librerie di animazione.
  const toggleExpanded = () => {
    const el = panelRef.current;
    if (!el || typeof el.animate !== "function") {
      setExpanded((v) => !v);
      return;
    }
    const first = el.getBoundingClientRect();
    flushSync(() => setExpanded((v) => !v));
    const last = el.getBoundingClientRect();
    const dx = first.left - last.left;
    const dy = first.top - last.top;
    const sx = Math.max(0.01, first.width / last.width);
    const sy = Math.max(0.01, first.height / last.height);
    el.animate(
      [
        { transformOrigin: "top left", transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, opacity: 0.85 },
        { transformOrigin: "top left", transform: "none", opacity: 1 },
      ],
      { duration: 380, easing: "cubic-bezier(.22, 1, .36, 1)" },
    );
  };

  // Click su una notifica: la segna letta e "entra" nella richiesta/task/ecc.
  const handleActivate = (item: NotifItem) => {
    if (!item.archived) markRead(item.id);
    const to = routeForItem(item);
    if (to) {
      onClose();
      navigate(to);
    }
  };

  const rowActions: RowActions = {
    onActivate: handleActivate,
    onToggleRead: (item) => (item.unread ? markRead(item.id) : markUnread(item.id)),
    onArchive: (item) => archive(item.id),
    onRestore: (item) => unarchive(item.id),
    archivedView: tab === "archivio",
  };

  const comItems = itemsByTab("comunicazioni").filter((m) => comFilter === "all" || m.type === comFilter);
  const isArchivio = tab === "archivio";

  return createPortal(
    <>
      <div className="nt-scrim" onClick={onClose} />
      <div
        ref={panelRef}
        className={`nt-panel${expanded ? " nt-panel--modal" : ""}`}
        role="dialog"
        aria-label="Centro notifiche"
      >
        <div className="nt-head">
          <div className="nt-head-top">
            <h3>
              <Icon name="bell" className="h-[17px] w-[17px]" /> Centro notifiche
            </h3>
            <div className="nt-head-actions">
              <button
                type="button"
                className="nt-close"
                onClick={toggleExpanded}
                aria-label={expanded ? "Riduci" : "Espandi a schermo"}
                title={expanded ? "Riduci a tendina" : "Espandi a modal"}
              >
                <Icon name={expanded ? "minimize" : "maximize"} className="h-4 w-4" />
              </button>
              <button type="button" className="nt-close" onClick={onClose} aria-label="Chiudi">
                <Icon name="x" className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="nt-tabs">
            {NOTIF_TABS.map((tb) => (
              <button
                key={tb.key}
                type="button"
                className={`nt-tab${tab === tb.key ? " on" : ""}`}
                onClick={() => setTab(tb.key)}
              >
                <Icon name={tb.icon} className="h-[15px] w-[15px]" /> {tb.label}
                {counts[tb.key] > 0 && <span className="nt-tab-badge">{counts[tb.key]}</span>}
              </button>
            ))}
            <button
              type="button"
              className={`nt-tab nt-tab-icon${isArchivio ? " on" : ""}`}
              onClick={() => setTab("archivio")}
              aria-label="Archivio"
              title="Archivio"
            >
              <Icon name="download" className="h-[15px] w-[15px]" />
            </button>
          </div>
        </div>

        <div className="nt-toolbar">
          {isArchivio ? (
            <span className="nt-hint">
              {archived.length} archiviate <span className="nt-hint-swipe">· trascina per ripristinare</span>
            </span>
          ) : tab === "comunicazioni" ? (
            <div className="nt-comfilters">
              {NOTIF_COM_FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  className={`nt-chip${comFilter === f.key ? " on" : ""}${f.tone ? ` tone-${f.tone}` : ""}`}
                  onClick={() => setComFilter(f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          ) : (
            <span className="nt-hint">
              {counts[tab as NotifTabKey]} non lette{" "}
              <span className="nt-hint-swipe">· trascina una riga per le azioni</span>
            </span>
          )}
          {tab === "richieste" && (
            <button type="button" className="nt-readall nt-create-req" onClick={() => setCreateOpen(true)}>
              <Icon name="plus" className="h-3.5 w-3.5" /> Nuova richiesta
            </button>
          )}
          {!isArchivio && (
            <button type="button" className="nt-readall" onClick={() => markAllRead(tab as NotifTabKey)}>
              <Icon name="check-circle" className="h-3.5 w-3.5" /> Segna tutte lette
            </button>
          )}
        </div>

        <div className="nt-scroll">
          {tab === "task" && <GroupedList groups={buildNotifGroups("task", itemsByTab("task"))} actions={rowActions} />}
          {tab === "richieste" && <FlatList items={itemsByTab("richieste")} actions={rowActions} />}
          {tab === "contratti" && (
            <GroupedList groups={buildNotifGroups("contratti", itemsByTab("contratti"))} actions={rowActions} />
          )}
          {tab === "comunicazioni" && <FlatList items={comItems} actions={rowActions} />}
          {isArchivio && <FlatList items={archived} actions={rowActions} emptyLabel="Nessuna notifica archiviata" />}
        </div>

        <div className="nt-foot">
          <button type="button" className="nt-foot-btn" onClick={onOpenPreferences}>
            <Icon name="settings" className="h-3.5 w-3.5" /> Preferenze notifiche
          </button>
        </div>
      </div>

      <RequestEditorModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </>,
    document.body,
  );
}
