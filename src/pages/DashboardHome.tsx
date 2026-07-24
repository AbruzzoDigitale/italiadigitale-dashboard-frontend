import { useMemo, useRef, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { useDashboardLayout } from "../hooks/useDashboardLayout";
import { KpiDataProvider, useKpiData } from "../components/dashboard/KpiDataContext";
import { DashboardGrid } from "../components/dashboard/grid/DashboardGrid";
import { DashboardFilterBar } from "../components/dashboard/DashboardFilterBar";
import { DashboardPeriodPicker } from "../components/dashboard/DashboardPeriodPicker";
import { AddWidgetModal } from "../components/dashboard/AddWidgetModal";
import { DEFAULT_COLS, findFreeSlot, reflow, type Rect } from "../components/dashboard/grid/gridEngine";
import { getWidgetDef } from "../components/dashboard/widgets/registry";
import type { WidgetInstance } from "../components/dashboard/widgets/types";
import { StickyNotesLayer, type StickyNotesHandle } from "../components/dashboard/StickyNotesLayer";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { Spinner } from "../components/ui/Spinner";

/** KPI mostrate di default finché l'utente non personalizza la dashboard. */
const DEFAULT_KPI_IDS = [
  "wi_completed",
  "wi_open",
  "wi_overdue",
  "wi_on_time_rate",
  "wi_cycle_time_avg",
  "wi_wip_load",
  "wi_rework_rate",
  "wi_estimate_accuracy",
];

function buildDefaultWidgets(): WidgetInstance[] {
  // 4 tessere per riga (3 colonne ciascuna su una griglia da 12), alte 2 righe.
  return DEFAULT_KPI_IDS.map((id, i) => ({
    id: `seed-${id}`,
    type: "kpi-stat",
    config: { kpiId: id },
    x: (i % 4) * 3,
    y: Math.floor(i / 4) * 2,
    w: 3,
    h: 2,
  }));
}

export function DashboardHome() {
  const { activeCompanyId, user } = useAuth();
  const privileged = !!(
    user?.is_admin ||
    user?.access_level === "project_manager" ||
    user?.access_level === "admin"
  );
  return (
    <KpiDataProvider companyId={activeCompanyId} privileged={privileged} selfUserId={user?.id ?? null}>
      <DashboardInner />
    </KpiDataProvider>
  );
}

function DashboardInner() {
  const { user, activeCompanyId } = useAuth();
  const { widgets, setWidgets, loaded, initialized } = useDashboardLayout(activeCompanyId);
  const { reload, loading: kpiLoading } = useKpiData();
  const [editing, setEditing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const notesRef = useRef<StickyNotesHandle>(null);
  // Anteprima del layout widget mentre si trascina una nota (i widget si spostano).
  const [notePreview, setNotePreview] = useState<WidgetInstance[] | null>(null);
  // Rettangoli delle note: ostacoli fissi da evitare nel reflow dei widget.
  const [noteRects, setNoteRects] = useState<Rect[]>([]);

  const defaults = useMemo(() => buildDefaultWidgets(), []);
  const showDefaults = !initialized && widgets.length === 0;
  const effective = showDefaults ? defaults : widgets;

  const existing = effective.map((w) => `${w.type}:${String(w.config.kpiId ?? "")}`);

  const handleAdd = (type: string, kpiId?: string) => {
    const size = getWidgetDef(type)?.defaultSize ?? { w: 3, h: 2 };
    // Evita sia i widget esistenti sia le note.
    const slot = findFreeSlot([...effective, ...noteRects], DEFAULT_COLS, size.w, size.h);
    const widget: WidgetInstance = {
      id: crypto.randomUUID(),
      type,
      config: kpiId ? { kpiId } : {},
      x: slot.x,
      y: slot.y,
      w: size.w,
      h: size.h,
    };
    setWidgets([...effective, widget]);
  };

  const handleRemove = (id: string) => {
    setWidgets(reflow(effective.filter((w) => w.id !== id), DEFAULT_COLS, undefined, noteRects));
  };

  const handleConfigChange = (id: string, patch: Record<string, unknown>) => {
    setWidgets(effective.map((w) => (w.id === id ? { ...w, config: { ...w.config, ...patch } } : w)));
  };

  const firstName = user?.full_name?.split(" ")[0] ?? user?.username;

  return (
    <div className="mx-auto w-full px-6 py-8 pb-20">
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 animate-fadeIn">
        <div>
          <h1 className="section-title">
            Ciao, <span style={{ color: "#c41284" }}>{firstName}</span>
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <DashboardPeriodPicker />
          <Button
            variant="ghost"
            size="sm"
            onClick={reload}
            title="Ricarica i dati"
            leftIcon={<Icon name="refresh-cw" className={`h-4 w-4 ${kpiLoading ? "animate-spin" : ""}`} />}
          >
            Aggiorna
          </Button>
          {editing && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setAddOpen(true)}
              leftIcon={<Icon name="plus" className="h-4 w-4" />}
            >
              Aggiungi widget
            </Button>
          )}
          {activeCompanyId != null && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => notesRef.current?.addNote()}
              leftIcon={<Icon name="plus" className="h-4 w-4" />}
            >
              Nota
            </Button>
          )}
          <Button
            variant={editing ? "primary" : "secondary"}
            size="sm"
            onClick={() => setEditing((v) => !v)}
            leftIcon={<Icon name={editing ? "check" : "settings"} className="h-4 w-4" />}
          >
            {editing ? "Fine" : "Personalizza"}
          </Button>
        </div>
      </div>

      {/* ── Filtri (admin/PM) ───────────────────────────────── */}
      <DashboardFilterBar />

      {/* ── Corpo ───────────────────────────────────────────── */}
      {!loaded ? (
        <div className="flex items-center justify-center py-24">
          <Spinner size="lg" />
        </div>
      ) : effective.length === 0 ? (
        <EmptyState
          onAdd={() => {
            setEditing(true);
            setAddOpen(true);
          }}
        />
      ) : (
        <div className="relative">
          <DashboardGrid
            items={notePreview ?? effective}
            editing={editing}
            onLayoutChange={setWidgets}
            onRemove={handleRemove}
            onConfigChange={handleConfigChange}
            reserved={noteRects}
          />
          {activeCompanyId != null && (
            <StickyNotesLayer
              ref={notesRef}
              companyId={activeCompanyId}
              editing={editing}
              widgets={effective}
              onNoteRectsChange={setNoteRects}
              onWidgetsPreview={setNotePreview}
              onWidgetsCommit={(w) => { setNotePreview(null); setWidgets(w); }}
            />
          )}
        </div>
      )}

      <AddWidgetModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdd={handleAdd}
        existing={existing}
      />
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-line py-24 text-center dark:border-[#2a2a2e]">
      <div className="grid h-14 w-14 place-items-center rounded-full bg-paper text-muted dark:bg-[#1c1c20] dark:text-[#9999a0]">
        <Icon name="grid" className="h-7 w-7" />
      </div>
      <p className="font-display text-[17px] font-bold tracking-tight text-ink dark:text-[#f4f4f7]">
        Dashboard vuota
      </p>
      <p className="max-w-sm text-[13px] text-muted dark:text-[#9999a0]">
        Aggiungi i widget KPI che vuoi tenere sott'occhio: potrai spostarli e ridimensionarli a piacere.
      </p>
      <Button variant="primary" size="sm" onClick={onAdd} leftIcon={<Icon name="plus" className="h-4 w-4" />}>
        Aggiungi widget
      </Button>
    </div>
  );
}
