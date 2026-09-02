import { useEffect, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { apriNotifica } from "./openNotificationTarget";
import { communicationLink } from "./communicationLink";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
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
  /** Schede da nascondere (es. "contratti" per gli operatori). */
  hiddenTabs?: NotifTabKey[];
}

// Scheda attiva: le 4 categorie + l'Archivio.
type ViewKey = NotifTabKey | "archivio";

interface RowActions {
  onActivate: (item: NotifItem) => void;
  onToggleRead: (item: NotifItem) => void;
  onArchive: (item: NotifItem) => void;
  onRestore: (item: NotifItem) => void;
  archivedView: boolean;
  isSelected: (id: number) => boolean;
  toggleSelect: (id: number) => void;
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
  const [dx, setDx] = useState(0); // posizione A RIPOSO (dopo lo snap)
  const [fullSide, setFullSide] = useState<"left" | "right" | null>(null);
  const dxRef = useRef(0); // posizione LIVE durante il trascinamento
  const fullRef = useRef<"left" | "right" | null>(null);
  const dragging = useRef(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const baseDx = useRef(0);
  const horiz = useRef(false);
  const didDrag = useRef(false);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const rowW = useRef(420); // larghezza riga, misurata al pointer-down

  // Soglia "full swipe" (stile WhatsApp): oltre questa, al rilascio parte
  // direttamente l'azione più esterna invece di aprire il pannello.
  const fullAt = (actW: number) => Math.max(actW + 60, rowW.current * 0.55);

  // Trascinamento: trasformazione scritta direttamente nel DOM, senza passare da
  // React (nessun re-render per frame → gesto fluido).
  const paint = (v: number) => {
    dxRef.current = v;
    const el = contentRef.current;
    if (el) el.style.transform = `translateX(${v}px)`;
  };
  // Snap: qui serve React, così la transizione CSS anima fino al valore.
  const settle = (v: number) => {
    dxRef.current = v;
    dragging.current = false;
    setDx(v);
  };

  const onDown = (e: React.PointerEvent) => {
    start.current = { x: e.clientX, y: e.clientY };
    baseDx.current = dxRef.current; // posizione da cui parte questo drag
    rowW.current = rowRef.current?.offsetWidth || rowW.current;
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
      dragging.current = true;
      // Transizione spenta per tutto il gesto: la riga segue il puntatore 1:1.
      if (contentRef.current) contentRef.current.style.transition = "none";
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    }
    didDrag.current = true;
    // Accumula dall'apertura corrente: da una riga già aperta il drag opposto la
    // riporta PRIMA al centro (chiusa) e non salta direttamente all'altro lato.
    const maxD = rowW.current * 0.92; // si può trascinare fin quasi a tutta la riga
    let v = baseDx.current + ddx;
    if (baseDx.current > 0)
      v = Math.max(0, Math.min(maxD, v)); // aperta a sinistra → chiude, oppure prosegue fino al full
    else if (baseDx.current < 0)
      v = Math.max(-maxD, Math.min(0, v)); // aperta a destra → chiude, oppure prosegue fino al full
    else {
      if (v > 0 && !leftW) v = 0;
      if (v < 0 && !rightW) v = 0;
      v = Math.max(-maxD, Math.min(maxD, v)); // chiusa → range pieno su entrambi i lati
    }
    paint(v);
    // Unico re-render possibile durante il gesto: entrata/uscita dalla zona full.
    const next: "left" | "right" | null =
      v > 0 && leftW > 0 && v >= fullAt(leftW)
        ? "left"
        : v < 0 && rightW > 0 && -v >= fullAt(rightW)
          ? "right"
          : null;
    if (next !== fullRef.current) {
      fullRef.current = next;
      setFullSide(next);
    }
  };
  const onUp = () => {
    if (!start.current) return;
    start.current = null;
    const v = dxRef.current;
    const wasFull = fullRef.current;
    fullRef.current = null;
    setFullSide(null);
    // Full swipe → esegue subito l'azione più esterna nella direzione del gesto:
    // a destra la prima a sinistra, a sinistra l'ultima a destra.
    if (wasFull === "left" && left.length) {
      runAction(left[0]);
      return;
    }
    if (wasFull === "right" && right.length) {
      runAction(right[right.length - 1]);
      return;
    }
    if (leftW && v >= THRESH) settle(leftW);
    else if (rightW && v <= -THRESH) settle(-rightW);
    else settle(0);
  };
  const onContentClick = () => {
    if (didDrag.current) {
      didDrag.current = false;
      return; // era uno swipe, non un tap
    }
    if (dxRef.current !== 0) {
      settle(0); // era aperta: chiudi
      return;
    }
    onTap();
  };
  const runAction = (a: SwipeAction) => {
    a.run();
    settle(0);
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
  const fullBtn = (a: SwipeAction, side: "left" | "right") => (
    <button
      type="button"
      className={`nt-swipe-act full ${side} tone-${a.tone}`}
      onClick={() => runAction(a)}
      tabIndex={-1}
    >
      <Icon name={a.icon} className="h-[18px] w-[18px]" />
      <span>{a.label}</span>
    </button>
  );

  return (
    <div className={`nt-swipe${dx !== 0 ? " open" : ""}`} ref={rowRef}>
      {/* Strisce azioni a larghezza piena: stanno SOTTO al contenuto e si scoprono
          man mano che scorre, quindi non serve animarne la larghezza (che a ogni
          frame costringerebbe a un ricalcolo del layout). */}
      {leftW > 0 && (
        <div className="nt-swipe-side left full-w">
          {fullSide === "left" ? fullBtn(left[0], "left") : left.map(actionBtn)}
        </div>
      )}
      {rightW > 0 && (
        <div className="nt-swipe-side right full-w">
          {fullSide === "right" ? fullBtn(right[right.length - 1], "right") : right.map(actionBtn)}
        </div>
      )}
      <div
        ref={contentRef}
        className={className}
        style={{
          // A riposo comanda lo stato (con transizione); durante il gesto comanda
          // il ref, così un re-render esterno non fa saltare la riga.
          transform: `translateX(${dragging.current ? dxRef.current : dx}px)`,
          transition: dragging.current ? "none" : undefined,
          willChange: "transform",
        }}
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
  const selected = actions.isSelected(item.id);
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
      <button
        type="button"
        className={`nt-ic nt-ic-sel${selected ? " sel" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          actions.toggleSelect(item.id);
        }}
        aria-pressed={selected}
        aria-label={selected ? "Deseleziona" : "Seleziona"}
        title={selected ? "Deseleziona" : "Seleziona"}
      >
        <Icon name={meta.icon} className="nt-ic-glyph h-4 w-4" />
        <Icon name="check" className="nt-ic-check h-4 w-4" />
      </button>
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
function routeForItem(item: NotifItem, isManager: boolean): string | null {
  // Avviso monitoraggio social senza task collegata: fallback per ruolo.
  // (Con task collegata la notifica ha entity_type "work_item" → apre la task.)
  if (
    (item.type === "social_inactivity" ||
      item.type === "social_below_target" ||
      item.type === "social_monitor_error") &&
    item.entity_type === "social_monitor"
  ) {
    if (isManager) return item.entity_id != null ? `/monitoraggio-social?monitor=${item.entity_id}` : "/monitoraggio-social";
    // Operatore: pagina social con le pagine incriminate espanse (scope = id profilo).
    return item.scope ? `/profili-social?only=${item.scope}` : "/profili-social";
  }
  const isTask = item.tab === "task" || item.entity_type === "work_item";
  if (isTask && item.entity_id != null) {
    // Notifica di revisione (commento, rimando, approvazione, invio al cliente…):
    // si apre direttamente sulla scheda Revisione, dov'è il commento che l'ha
    // generata. Senza `review=1` il modal userebbe lo stato della task per
    // decidere, e un commento su una task rimandata indietro o già approvata
    // atterrerebbe su Dettagli, con il thread invisibile.
    // `revisione_commento` (nuovo commento) e `revisione` (rimando, approvazione…)
    // qui portano allo stesso posto: sul desktop il thread dei commenti vive dentro
    // la scheda Revisione. Sul mobile invece sono due destinazioni diverse.
    const review = item.type === "revisione" || item.type === "revisione_commento" ? "&review=1" : "";
    return `/work-items?task=${item.entity_id}${review}`;
  }
  // Richiesta: apre direttamente l'editor di QUELLA richiesta, non la lista.
  if (item.tab === "richieste") return item.entity_id != null ? `/requests/edit?quote_id=${item.entity_id}` : "/requests";
  if (item.tab === "contratti") return "/contracts-pipeline";
  // Prenotazione sala: la pagina porta al giorno giusto e apre la scheda.
  if (item.tab === "sale") {
    return item.entity_id != null
      ? `/prenotazione-sale?booking=${item.entity_id}`
      : "/prenotazione-sale";
  }
  // Rimborso trasferte: la pagina apre la scheda della trasferta.
  if (item.tab === "rimborsi" || item.entity_type === "expense_trip") {
    return item.entity_id != null ? `/rimborsi?trasferta=${item.entity_id}` : "/rimborsi";
  }
  // Comunicazione: si apre nel modal, da qualunque pagina e per qualunque ruolo
  // (la rotta /comunicazioni è riservata ad admin e PM).
  if (item.tab === "comunicazioni") {
    return item.entity_id != null ? communicationLink(item.entity_id) : "/comunicazioni";
  }
  return null;
}

export function NotificationCenter({ open, onClose, notifications, onOpenPreferences, hiddenTabs = [] }: NotificationCenterProps) {
  const visibleTabs = NOTIF_TABS.filter((tb) => !hiddenTabs.includes(tb.key));
  const {
    counts,
    itemsByTab,
    archived,
    loadArchived,
    markRead,
    markUnread,
    markAllRead,
    archive,
    unarchive,
    markManyRead,
    markManyUnread,
    archiveMany,
    unarchiveMany,
  } = notifications;
  const navigate = useNavigate();
  const { permissions } = useAuth();
  const isMonitorManager = !!permissions?.is_admin || !!permissions?.is_project_manager;
  const [tab, setTabState] = useState<ViewKey>("task");
  const [comFilter, setComFilter] = useState<string>("all");
  const [expanded, setExpanded] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const panelRef = useRef<HTMLDivElement>(null);

  // Cambiando scheda si azzera la selezione (ogni vista è a sé: es. l'Archivio ha
  // "Ripristina" invece di "Archivia").
  const setTab = (k: ViewKey) => {
    setSelected(new Set());
    setTabState(k);
  };
  const clearSel = () => setSelected(new Set());
  const toggleSelect = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const runBulk = (fn: (ids: number[]) => void) => {
    const ids = [...selected];
    if (!ids.length) return;
    fn(ids);
    clearSel();
  };

  // Entrando nella scheda Archivio, carica le archiviate (fetch dedicato).
  useEffect(() => {
    if (open && tab === "archivio") void loadArchived();
  }, [open, tab, loadArchived]);

  // Chiudendo il centro, azzera la selezione multipla.
  useEffect(() => {
    if (!open) setSelected(new Set());
  }, [open]);

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
  // Dove aprirla (questa scheda / nuova scheda / chiedi) è la stessa preferenza
  // del clic sulla notifica push: vedi openNotificationTarget.
  const handleActivate = (item: NotifItem) => {
    if (!item.archived) markRead(item.id);
    const to = routeForItem(item, isMonitorManager);
    if (!to) return;
    onClose();
    apriNotifica(to, (url) => navigate(url));
  };

  const rowActions: RowActions = {
    onActivate: handleActivate,
    onToggleRead: (item) => (item.unread ? markRead(item.id) : markUnread(item.id)),
    onArchive: (item) => archive(item.id),
    onRestore: (item) => unarchive(item.id),
    archivedView: tab === "archivio",
    isSelected: (id) => selected.has(id),
    toggleSelect,
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
            {visibleTabs.map((tb) => (
              <button
                key={tb.key}
                type="button"
                title={tb.label}
                className={`nt-tab${tab === tb.key ? " on" : ""}`}
                onClick={() => setTab(tb.key)}
              >
                <Icon name={tb.icon} className="h-[15px] w-[15px]" />
                <span className="nt-tab-label">{tb.label}</span>
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

        {selected.size > 0 && (
          <div className="nt-selbar">
            <button type="button" className="nt-selbar-x" onClick={clearSel} aria-label="Annulla selezione" title="Annulla">
              <Icon name="x" className="h-4 w-4" />
            </button>
            <span className="nt-selbar-count">{selected.size} selezionate</span>
            <div className="nt-selbar-acts">
              <button
                type="button"
                className="nt-selact tone-mint"
                onClick={() => runBulk(markManyRead)}
                aria-label="Segna come lette"
                title="Segna come lette"
              >
                <Icon name="check" className="h-[15px] w-[15px]" />
              </button>
              <button
                type="button"
                className="nt-selact tone-amber"
                onClick={() => runBulk(markManyUnread)}
                aria-label="Segna come da leggere"
                title="Segna come da leggere"
              >
                <Icon name="mail" className="h-[15px] w-[15px]" />
              </button>
              {isArchivio ? (
                <button
                  type="button"
                  className="nt-selact tone-slate"
                  onClick={() => runBulk(unarchiveMany)}
                  aria-label="Ripristina"
                  title="Ripristina"
                >
                  <Icon name="refresh-cw" className="h-[15px] w-[15px]" />
                </button>
              ) : (
                <button
                  type="button"
                  className="nt-selact tone-slate"
                  onClick={() => runBulk(archiveMany)}
                  aria-label="Archivia"
                  title="Archivia"
                >
                  <Icon name="download" className="h-[15px] w-[15px]" />
                </button>
              )}
            </div>
          </div>
        )}

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
          {tab === "monitoraggi" && (
            <FlatList items={itemsByTab("monitoraggi")} actions={rowActions} emptyLabel="Nessun avviso di monitoraggio" />
          )}
          {tab === "sale" && (
            <FlatList items={itemsByTab("sale")} actions={rowActions} emptyLabel="Nessuna prenotazione sala" />
          )}
          {tab === "rimborsi" && (
            <FlatList items={itemsByTab("rimborsi")} actions={rowActions} emptyLabel="Nessuna trasferta da approvare" />
          )}
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
