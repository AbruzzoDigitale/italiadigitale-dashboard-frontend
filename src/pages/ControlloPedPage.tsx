import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../components/ui/Icon";
import { PedStatusesModal } from "../components/ped/PedStatusesModal";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../hooks/useAuth";
import { useSelectedCompanyId } from "../hooks/useSelectedCompanyId";
import {
  getPedControlApi,
  getPedStatusesApi,
  upsertPedCellApi,
  type PedControlCell,
  type PedControlResponse,
  type PedStatus,
} from "../api/pedControl";
import "./controllo-ped.css";

const MONTH_NAMES = [
  "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
  "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
];

// Finestra dati caricata dal backend: ±18 mesi dal mese corrente.
const FETCH_SPAN = 18;
// Matrice: intervallo ampio (12 mesi indietro + 5 avanti ≈ 18 mesi).
const MATRICE_BEHIND = 12;
const MATRICE_AHEAD = 5;

type ViewMode = "calendario" | "matrice";
type SortBy = "sheet" | "az" | "za" | "state";

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function shiftYM(year: number, month: number, offset: number): { year: number; month: number } {
  const total = year * 12 + (month - 1) + offset;
  return { year: Math.floor(total / 12), month: (((total % 12) + 12) % 12) + 1 };
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

interface DisplayMonth {
  key: string;
  year: number;
  month: number;
  name: string;
}

interface EditState {
  clientId: number;
  clientName: string;
  monthKey: string;
  monthLabel: string;
  /** Task PED su cui impostare lo stato editoriale. */
  workItemId: number;
  currentStatusId: number | null;
  left: number;
  top: number;
}

export function ControlloPedPage() {
  const toast = useToast();
  const { user } = useAuth();
  const { selectedCompanyId } = useSelectedCompanyId(user?.company_id ?? null);

  const [statuses, setStatuses] = useState<PedStatus[]>([]);
  const [control, setControl] = useState<PedControlResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [view, setView] = useState<ViewMode>("calendario");
  const [behind, setBehind] = useState(1);
  const [ahead, setAhead] = useState(6);
  const [advOpen, setAdvOpen] = useState(false);
  const [legOpen, setLegOpen] = useState(false);
  const [sortBy, setSortBy] = useState<SortBy>("sheet");
  const [sortMonth, setSortMonth] = useState<string | null>(null);
  const [pick, setPick] = useState<string | null>(null);

  const [editing, setEditing] = useState<EditState | null>(null);
  const [statusesModalOpen, setStatusesModalOpen] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  const isAdmin = !!user?.is_admin;
  const [saving, setSaving] = useState(false);

  const today = useMemo(() => new Date(), []);
  const currentYear = today.getFullYear();
  const currentMonthNum = today.getMonth() + 1;
  const currentKey = monthKey(currentYear, currentMonthNum);

  // ── Caricamento dati ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedCompanyId) {
      setStatuses([]);
      setControl(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const from = shiftYM(currentYear, currentMonthNum, -FETCH_SPAN);
    const to = shiftYM(currentYear, currentMonthNum, FETCH_SPAN);

    Promise.all([
      getPedStatusesApi(selectedCompanyId),
      getPedControlApi({
        company_id: selectedCompanyId,
        from_year: from.year,
        from_month: from.month,
        to_year: to.year,
        to_month: to.month,
      }),
    ])
      .then(([statusesData, controlData]) => {
        if (cancelled) return;
        setStatuses(statusesData);
        setControl(controlData);
      })
      .catch((err) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Errore nel caricamento del controllo PED";
        setError(message);
        setStatuses([]);
        setControl(null);
        toast.error(message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompanyId, currentYear, currentMonthNum, reloadNonce]);

  const statusById = useMemo(() => {
    const map = new Map<number, PedStatus>();
    statuses.forEach((s) => map.set(s.id, s));
    return map;
  }, [statuses]);

  const sortedStatuses = useMemo(
    () => [...statuses].sort((a, b) => a.sort_order - b.sort_order),
    [statuses],
  );

  // Tutti i mesi caricati, indicizzati per chiave.
  const monthByKey = useMemo(() => {
    const map = new Map<string, DisplayMonth>();
    (control?.months ?? []).forEach((m) => {
      map.set(monthKey(m.year, m.month), {
        key: monthKey(m.year, m.month),
        year: m.year,
        month: m.month,
        name: MONTH_NAMES[m.month - 1] ?? "",
      });
    });
    return map;
  }, [control]);

  // Mesi visualizzati in base alla vista.
  const displayMonths = useMemo<DisplayMonth[]>(() => {
    const range = view === "matrice"
      ? { from: -MATRICE_BEHIND, to: MATRICE_AHEAD }
      : { from: -behind, to: ahead };
    const out: DisplayMonth[] = [];
    for (let off = range.from; off <= range.to; off++) {
      const { year, month } = shiftYM(currentYear, currentMonthNum, off);
      const m = monthByKey.get(monthKey(year, month));
      if (m) out.push(m);
    }
    return out;
  }, [view, behind, ahead, currentYear, currentMonthNum, monthByKey]);

  const sortMonthKey = sortMonth ?? currentKey;

  // ── Righe filtrate + ordinate ───────────────────────────────────────────────
  const rows = useMemo(() => {
    const base = [...(control?.rows ?? [])];
    if (sortBy === "az") return base.sort((a, b) => a.client_name.localeCompare(b.client_name, "it"));
    if (sortBy === "za") return base.sort((a, b) => b.client_name.localeCompare(a.client_name, "it"));
    if (sortBy === "state") {
      return base.sort((a, b) => {
        const ca = a.cells[sortMonthKey];
        const cb = b.cells[sortMonthKey];
        const ra = ca?.ped_status_id != null ? statusById.get(ca.ped_status_id)?.sort_order ?? 900 : 999;
        const rb = cb?.ped_status_id != null ? statusById.get(cb.ped_status_id)?.sort_order ?? 900 : 999;
        return ra - rb || a.client_name.localeCompare(b.client_name, "it");
      });
    }
    return base;
  }, [control, sortBy, sortMonthKey, statusById]);

  const filteredRows = useMemo(
    () => rows.filter((r) => !q || r.client_name.toLowerCase().includes(q.toLowerCase())),
    [rows, q],
  );

  // ── Summary mese corrente ───────────────────────────────────────────────────
  const stats = useMemo(() => {
    const counts = new Map<number, number>();
    let planned = 0;
    (control?.rows ?? []).forEach((r) => {
      const cell = r.cells[currentKey];
      if (cell?.work_item_id) {
        planned++;
        if (cell.ped_status_id != null) {
          counts.set(cell.ped_status_id, (counts.get(cell.ped_status_id) ?? 0) + 1);
        }
      }
    });
    const total = control?.rows.length ?? 0;
    return { counts, planned, total, noPlan: total - planned };
  }, [control, currentKey]);

  const currentMonthLabel = useMemo(() => {
    const m = monthByKey.get(currentKey);
    return m ? `${m.name} ${m.year}` : `${MONTH_NAMES[currentMonthNum - 1]} ${currentYear}`;
  }, [monthByKey, currentKey, currentMonthNum, currentYear]);

  // ── Modifica cella (ottimistico) ────────────────────────────────────────────
  const applyLocalCell = useCallback((clientId: number, key: string, cell: PedControlCell) => {
    setControl((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        rows: prev.rows.map((r) =>
          r.client_id === clientId ? { ...r, cells: { ...r.cells, [key]: cell } } : r,
        ),
      };
    });
  }, []);

  const saveCell = useCallback(
    async (statusId: number | null) => {
      if (!editing || !selectedCompanyId) return;
      const { clientId, monthKey: key, workItemId } = editing;
      const prevCell = control?.rows.find((r) => r.client_id === clientId)?.cells[key];
      if (!prevCell) return;

      // Ottimistico: mantiene work_item_id/title/work_status, aggiorna solo lo stato PED.
      applyLocalCell(clientId, key, {
        ...prevCell,
        ped_status_id: statusId,
        status_slug: statusId != null ? statusById.get(statusId)?.slug ?? null : null,
      });
      setEditing(null);
      setSaving(true);

      try {
        const res = await upsertPedCellApi({
          company_id: selectedCompanyId,
          work_item_id: workItemId,
          ped_status_id: statusId,
        });
        applyLocalCell(clientId, key, {
          ...prevCell,
          ped_status_id: res.ped_status_id,
          status_slug: res.status_slug,
        });
      } catch (err) {
        applyLocalCell(clientId, key, prevCell);
        toast.error(err instanceof Error ? err.message : "Impossibile aggiornare la cella");
      } finally {
        setSaving(false);
      }
    },
    [editing, selectedCompanyId, control, statusById, applyLocalCell, toast],
  );

  const openEditor = useCallback(
    (
      row: { client_id: number; client_name: string; cells: Record<string, PedControlCell> },
      month: DisplayMonth,
      event: React.MouseEvent,
    ) => {
      const cell = row.cells[month.key];
      // Le celle senza task PED non sono modificabili (lo stato vive sulla task).
      if (!cell?.work_item_id) {
        toast.info("Nessuna task PED per questo cliente in questo mese");
        return;
      }
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      const width = 250;
      const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
      const top = Math.min(rect.bottom + 6, window.innerHeight - 320);
      setEditing({
        clientId: row.client_id,
        clientName: row.client_name,
        monthKey: month.key,
        monthLabel: `${month.name} ${month.year}`,
        workItemId: cell.work_item_id,
        currentStatusId: cell.ped_status_id ?? null,
        left,
        top,
      });
    },
    [toast],
  );

  // ── Export CSV ──────────────────────────────────────────────────────────────
  const onExport = useCallback(() => {
    if (!control) return;
    const header = ["Cliente", ...displayMonths.map((m) => `${m.name} ${m.year}`)];
    const lines = [header];
    filteredRows.forEach((r) => {
      const cols = displayMonths.map((m) => {
        const cell = r.cells[m.key];
        if (cell?.ped_status_id == null) return "";
        return statusById.get(cell.ped_status_id)?.label ?? cell.status_slug ?? "";
      });
      lines.push([r.client_name, ...cols]);
    });
    const csv = lines
      .map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `controllo-ped-${currentKey}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [control, displayMonths, filteredRows, statusById, currentKey]);

  const gridTemplate = `200px repeat(${displayMonths.length}, minmax(108px, 1fr))`;
  const sortArrow = sortBy === "az" ? "↓" : sortBy === "za" ? "↑" : "⇅";

  const highlightKey = sortBy === "state" ? sortMonthKey : null;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="ped-root flex h-full min-h-0 w-full flex-col overflow-hidden px-6 py-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="section-eyebrow">
            <Icon name="calendar" className="w-3.5 h-3.5" /> Operativo · Editoriale
          </div>
          <h1 className="section-title">Controllo PED</h1>
          <p className="section-lead max-w-xl">
            Stato dei piani editoriali mensili per cliente. Vista calendario dal mese corrente, o
            matrice dell'intero storico.
          </p>
        </div>

        {/* Legenda + gestione stati */}
        <div className="flex items-center gap-2">
        {isAdmin && (
          <button
            type="button"
            className="ped-tbtn"
            onClick={() => setStatusesModalOpen(true)}
            title="Crea, modifica o elimina gli stati PED"
          >
            <Icon name="settings" className="w-4 h-4" /> Gestisci stati
          </button>
        )}
        <div className="ped-legbox">
          <button
            type="button"
            className={`ped-tbtn${legOpen ? " on" : ""}`}
            onClick={() => setLegOpen((v) => !v)}
            title="Legenda stati"
          >
            <Icon name="grid" className="w-4 h-4" /> Legenda
          </button>
          {legOpen && (
            <>
              <div className="ped-leg-back" onClick={() => setLegOpen(false)} />
              <div className="ped-leg-menu">
                <div className="ped-leg-h">Stati PED</div>
                {sortedStatuses.map((s) => (
                  <span className="ped-leg" key={s.id}>
                    <i className="dot" style={{ background: s.color }} />
                    {s.label}
                  </span>
                ))}
                {sortedStatuses.length === 0 && (
                  <span className="ped-leg" style={{ opacity: 0.6 }}>Nessuno stato configurato</span>
                )}
              </div>
            </>
          )}
        </div>
        </div>
      </div>

      {!selectedCompanyId ? (
        <div className="ped-empty mt-6">
          <Icon name="building" className="w-6 h-6" />
          Seleziona una company per visualizzare il controllo PED.
        </div>
      ) : loading ? (
        <div className="ped-empty mt-6">Caricamento del controllo PED…</div>
      ) : error ? (
        <div className="ped-empty mt-6">{error}</div>
      ) : (
        <>
          {/* Summary mese corrente */}
          <div className="ped-summary mt-5">
            <div className="ped-sum-cur">
              <span className="ped-sum-l">Mese corrente</span>
              <b>{currentMonthLabel}</b>
            </div>
            <span className="ped-sum-sep" />
            <div className="ped-sum big">
              <b>{stats.planned}</b>
              <span>clienti con PED</span>
            </div>
            {sortedStatuses.slice(0, 5).map((s) => (
              <div className="ped-sum" key={s.id}>
                <b style={{ color: s.color }}>{stats.counts.get(s.id) ?? 0}</b>
                <span>{s.label.toLowerCase()}</span>
              </div>
            ))}
            <div className="ped-sum warn">
              <b>{stats.noPlan}</b>
              <span>senza PED</span>
            </div>
          </div>

          {/* Toolbar */}
          {!pick && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <div className="ped-search">
                <Icon name="search" className="w-4 h-4" />
                <input
                  placeholder="Cerca cliente…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>

              {/* Vista */}
              <div className="ped-seg">
                <button
                  type="button"
                  className={view === "calendario" ? "on" : ""}
                  onClick={() => setView("calendario")}
                >
                  <Icon name="calendar" className="w-3.5 h-3.5" /> Calendario
                </button>
                <button
                  type="button"
                  className={view === "matrice" ? "on" : ""}
                  onClick={() => setView("matrice")}
                >
                  <Icon name="grid" className="w-3.5 h-3.5" /> Matrice
                </button>
              </div>

              {/* Avanzate (solo calendario) */}
              {view === "calendario" && (
                <div className="ped-adv">
                  <button
                    type="button"
                    className={`ped-tbtn${advOpen ? " on" : ""}`}
                    onClick={() => setAdvOpen((v) => !v)}
                  >
                    <Icon name="settings" className="w-4 h-4" /> Avanzate
                    <Icon name="chevron-down" className="w-3.5 h-3.5" />
                  </button>
                  {advOpen && (
                    <>
                      <div className="ped-adv-back" onClick={() => setAdvOpen(false)} />
                      <div className="ped-adv-menu">
                        <div className="ped-adv-h">Finestra calendario</div>
                        <div className="ped-adv-row">
                          <span>Mesi lasciati dietro</span>
                          <div className="ped-stepper">
                            <button type="button" onClick={() => setBehind((n) => Math.max(0, n - 1))} disabled={behind <= 0}>−</button>
                            <b>{behind}</b>
                            <button type="button" onClick={() => setBehind((n) => Math.min(12, n + 1))}>+</button>
                          </div>
                        </div>
                        <div className="ped-adv-row">
                          <span>Mesi successivi</span>
                          <div className="ped-stepper">
                            <button type="button" onClick={() => setAhead((n) => Math.max(1, n - 1))} disabled={ahead <= 1}>−</button>
                            <b>{ahead}</b>
                            <button type="button" onClick={() => setAhead((n) => Math.min(18, n + 1))}>+</button>
                          </div>
                        </div>
                        <div className="ped-adv-note">
                          Il calendario riparte sempre dal mese corrente ({currentMonthLabel}).
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Ordina per stato di un mese */}
              <div className={`ped-statesort${sortBy === "state" ? " on" : ""}`}>
                <button
                  type="button"
                  className="ped-statesort-btn"
                  onClick={() => setSortBy(sortBy === "state" ? "sheet" : "state")}
                >
                  <Icon name="list" className="w-3.5 h-3.5" /> Per stato
                </button>
                <select
                  value={sortMonthKey}
                  onChange={(e) => {
                    setSortMonth(e.target.value);
                    setSortBy("state");
                  }}
                >
                  {displayMonths.map((m) => (
                    <option key={m.key} value={m.key}>{`${m.name} ${m.year}`}</option>
                  ))}
                </select>
              </div>

              <span className="flex-1" />
              <button type="button" className="ped-tbtn" onClick={onExport} disabled={filteredRows.length === 0}>
                <Icon name="download" className="w-4 h-4" /> Esporta
              </button>
            </div>
          )}

          {/* Contenuto */}
          {pick ? (
            <PedMonth
              monthKeyValue={pick}
              monthLabel={(() => {
                const m = monthByKey.get(pick);
                return m ? `${m.name} ${m.year}` : pick;
              })()}
              rows={filteredRows}
              statuses={sortedStatuses}
              statusById={statusById}
              onBack={() => setPick(null)}
            />
          ) : (
            <div className="ped-matrix-wrap mt-4 mb-2">
              <div className="ped-matrix" style={{ gridTemplateColumns: gridTemplate }}>
                {/* Header cliente */}
                <div
                  className={`ped-h ped-h-client sortable${sortBy === "az" || sortBy === "za" ? " on" : ""}`}
                  onClick={() => setSortBy((s) => (s === "az" ? "za" : s === "za" ? "sheet" : "az"))}
                  title="Ordina clienti A→Z / Z→A"
                >
                  Cliente
                  <span className="ped-sort-ar">{sortArrow}</span>
                </div>
                {/* Header mesi */}
                {displayMonths.map((m) => (
                  <div
                    key={m.key}
                    className={`ped-h${m.key === currentKey ? " cur" : ""}${m.key === highlightKey ? " hl" : ""}`}
                    onClick={() => setPick(m.key)}
                    title="Apri dettaglio mese"
                  >
                    <span className="ped-h-mn">{m.name}</span>
                    <span className="ped-h-yr">{m.year}</span>
                  </div>
                ))}
                {/* Righe */}
                {filteredRows.map((r) => (
                  <Fragment key={r.client_id}>
                    <div className="ped-client">
                      <span className="ped-client-av">{initials(r.client_name)}</span>
                      <span className="ped-client-n">{r.client_name}</span>
                    </div>
                    {displayMonths.map((m) => {
                      const cell = r.cells[m.key];
                      const hasTask = !!cell?.work_item_id;
                      const status = cell?.ped_status_id != null ? statusById.get(cell.ped_status_id) : undefined;
                      const classes = `ped-cell${!hasTask ? " empty" : ""}${hasTask && !status ? " unset" : ""}${m.key === currentKey ? " cur" : ""}${m.key === highlightKey ? " hl" : ""}`;
                      const style = status ? { background: `${status.color}22` } : undefined;
                      const title = hasTask
                        ? `${cell?.title ?? "PED"}${status ? ` · ${status.label}` : " · stato da assegnare"}`
                        : "Nessuna task PED";
                      return (
                        <div
                          key={m.key}
                          className={classes}
                          style={style}
                          title={title}
                          onClick={(e) => openEditor(r, m, e)}
                        >
                          {status ? (
                            <span className="ped-cell-t" style={{ color: status.color }}>
                              {status.short_label}
                            </span>
                          ) : hasTask ? (
                            <span className="ped-cell-t ped-cell-unset">PED</span>
                          ) : null}
                        </div>
                      );
                    })}
                  </Fragment>
                ))}
              </div>
            </div>
          )}

          {filteredRows.length === 0 && !pick && (
            <div className="ped-empty">Nessun cliente corrisponde alla ricerca.</div>
          )}
        </>
      )}

      {/* Popover modifica cella — in portal su body per evitare che il transform di
          `animate-fadeIn` sull'ancestor renda il position:fixed relativo al contenitore. */}
      {editing && createPortal(
        <>
          <div className="ped-edit-back" onClick={() => setEditing(null)} />
          <div className="ped-edit" style={{ left: editing.left, top: editing.top }}>
            <div className="ped-edit-h">
              {editing.monthLabel}
              <b>{editing.clientName}</b>
            </div>
            <div className="ped-edit-list">
              {sortedStatuses.map((s) => (
                <button
                  type="button"
                  key={s.id}
                  className={`ped-edit-opt${s.id === editing.currentStatusId ? " on" : ""}`}
                  disabled={saving}
                  onClick={() => saveCell(s.id)}
                >
                  <i className="dot" style={{ background: s.color }} />
                  {s.label}
                </button>
              ))}
              <button
                type="button"
                className="ped-edit-opt clear"
                disabled={saving}
                onClick={() => saveCell(null)}
              >
                <Icon name="x" className="w-3.5 h-3.5" /> Svuota
              </button>
            </div>
          </div>
        </>,
        document.body,
      )}

      {isAdmin && selectedCompanyId != null && (
        <PedStatusesModal
          open={statusesModalOpen}
          onClose={() => setStatusesModalOpen(false)}
          companyId={selectedCompanyId}
          statuses={statuses}
          onChanged={() => setReloadNonce((n) => n + 1)}
        />
      )}
    </div>
  );
}

// ── Dettaglio mese (kanban per stato) ──────────────────────────────────────────
interface PedMonthProps {
  monthKeyValue: string;
  monthLabel: string;
  rows: { client_id: number; client_name: string; cells: Record<string, PedControlCell> }[];
  statuses: PedStatus[];
  statusById: Map<number, PedStatus>;
  onBack: () => void;
}

function PedMonth({ monthKeyValue, monthLabel, rows, statuses, statusById, onBack }: PedMonthProps) {
  const groups = useMemo(() => {
    const map = new Map<number, { client: string; title: string | null }[]>();
    statuses.forEach((s) => map.set(s.id, []));
    let planned = 0;
    let noPlan = 0;
    rows.forEach((r) => {
      const cell = r.cells[monthKeyValue];
      if (cell?.ped_status_id != null && map.has(cell.ped_status_id)) {
        map.get(cell.ped_status_id)!.push({ client: r.client_name, title: cell.title });
        planned++;
      } else {
        noPlan++;
      }
    });
    return { map, planned, noPlan };
  }, [rows, monthKeyValue, statuses]);

  const activeStatuses = statuses.filter((s) => (groups.map.get(s.id)?.length ?? 0) > 0);

  return (
    <div className="mt-4 mb-2">
      <div className="ped-month-bar">
        <button type="button" className="ped-tbtn" onClick={onBack}>
          <span aria-hidden>←</span> Tutti i mesi
        </button>
        <div className="ped-month-title">{monthLabel}</div>
        <div className="ped-month-stat">
          {groups.planned} clienti pianificati · {groups.noPlan} senza PED
        </div>
      </div>
      <div className="ped-month-cols">
        {activeStatuses.map((s) => {
          const items = groups.map.get(s.id) ?? [];
          const status = statusById.get(s.id);
          return (
            <div className="ped-mcol" key={s.id}>
              <div
                className="ped-mcol-head"
                style={{
                  background: `${status?.color ?? s.color}22`,
                  color: status?.color ?? s.color,
                  borderBottom: `1px solid ${status?.color ?? s.color}44`,
                }}
              >
                <span>{s.label}</span>
                <b>{items.length}</b>
              </div>
              <div className="ped-mcol-body">
                {items.map((it, i) => (
                  <div className="ped-mcard" key={`${it.client}-${i}`}>
                    <span className="ped-mcard-av">{initials(it.client)}</span>
                    <div className="ped-mcard-b">
                      <span className="ped-mcard-n">{it.client}</span>
                      {it.title && it.title !== it.client && <span className="ped-mcard-note">{it.title}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {activeStatuses.length === 0 && (
          <div className="ped-empty" style={{ flex: 1 }}>Nessun PED pianificato per questo mese.</div>
        )}
      </div>
    </div>
  );
}
