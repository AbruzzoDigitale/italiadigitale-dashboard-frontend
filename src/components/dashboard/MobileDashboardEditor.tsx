import { useRef, useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import { useDashboardLayout } from "../../hooks/useDashboardLayout";
import { KpiDataProvider } from "./KpiDataContext";
import { DashboardGrid } from "./grid/DashboardGrid";
import { AddWidgetModal } from "./AddWidgetModal";
import { findFreeSlot, reflow, type Rect } from "./grid/gridEngine";
import { getWidgetDef } from "./widgets/registry";
import type { WidgetInstance } from "./widgets/types";
import { StickyNotesLayer, type StickyNotesHandle } from "./StickyNotesLayer";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Spinner } from "../ui/Spinner";

// La dashboard mobile usa una griglia a 2 colonne (schermo stretto).
const MOBILE_COLS = 2;

/**
 * Editor del layout dashboard MOBILE, usato dal desktop (profilo personale).
 * Riusa lo stesso motore/griglia/note del desktop ma su 2 colonne e con
 * `platform="mobile"`, così il layout è indipendente da quello desktop.
 * Il salvataggio è per (utente × azienda × mobile).
 */
export function MobileDashboardEditor({ companyId }: { companyId: number | null }) {
  const { user } = useAuth();
  const isAdmin = !!(user?.is_admin || user?.access_level === "admin");
  const isPm = !isAdmin && user?.access_level === "project_manager";
  const privileged = isAdmin || isPm;
  const managedAreaIds = isPm ? (user?.work_area_ids ?? []) : null;

  return (
    <KpiDataProvider companyId={companyId} privileged={privileged} managedAreaIds={managedAreaIds}>
      <MobileEditorInner companyId={companyId} />
    </KpiDataProvider>
  );
}

function MobileEditorInner({ companyId }: { companyId: number | null }) {
  const { widgets, setWidgets, loaded } = useDashboardLayout(companyId, "mobile");
  const [editing, setEditing] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const notesRef = useRef<StickyNotesHandle>(null);
  const [notePreview, setNotePreview] = useState<WidgetInstance[] | null>(null);
  const [noteRects, setNoteRects] = useState<Rect[]>([]);

  const existing = widgets.map((w) => `${w.type}:${String(w.config.kpiId ?? "")}`);

  const handleAdd = (type: string, kpiId?: string) => {
    const size = getWidgetDef(type)?.defaultSize ?? { w: 2, h: 2 };
    const w = Math.min(size.w, MOBILE_COLS); // su mobile al massimo tutta la larghezza
    const slot = findFreeSlot([...widgets, ...noteRects], MOBILE_COLS, w, size.h);
    const widget: WidgetInstance = {
      id: crypto.randomUUID(),
      type,
      config: kpiId ? { kpiId } : {},
      x: slot.x,
      y: slot.y,
      w,
      h: size.h,
    };
    setWidgets([...widgets, widget]);
  };

  const handleRemove = (id: string) => {
    setWidgets(reflow(widgets.filter((w) => w.id !== id), MOBILE_COLS, undefined, noteRects));
  };

  const handleConfigChange = (id: string, patch: Record<string, unknown>) => {
    setWidgets(widgets.map((w) => (w.id === id ? { ...w, config: { ...w.config, ...patch } } : w)));
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setAddOpen(true)}
          leftIcon={<Icon name="plus" className="h-4 w-4" />}
        >
          Aggiungi widget
        </Button>
        {companyId != null && (
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
          {editing ? "Blocca" : "Modifica"}
        </Button>
      </div>

      {/* Cornice "telefono": larghezza fissa, la griglia misura questa larghezza. */}
      {/* Mockup iPhone 17 Pro Max: scocca titanio, Dynamic Island, home indicator */}
      <div className="flex justify-center">
        <div className="relative w-full max-w-[360px]" style={{ aspectRatio: "9 / 19.5" }}>
          {/* Tasti laterali */}
          <div className="absolute -left-[3px] top-[16%] h-9 w-[3px] rounded-l bg-[#3a3a40]" />
          <div className="absolute -left-[3px] top-[24%] h-14 w-[3px] rounded-l bg-[#3a3a40]" />
          <div className="absolute -left-[3px] top-[35%] h-14 w-[3px] rounded-l bg-[#3a3a40]" />
          <div className="absolute -right-[3px] top-[28%] h-20 w-[3px] rounded-r bg-[#3a3a40]" />

          {/* Scocca */}
          <div className="relative h-full w-full rounded-[56px] bg-[#1b1b1f] p-[11px] shadow-[0_20px_50px_-12px_rgba(0,0,0,0.55)] ring-1 ring-black/50">
            {/* Schermo */}
            <div className="relative h-full w-full overflow-hidden rounded-[46px] bg-cream dark:bg-[#0E0F0E]">
              {/* Dynamic Island */}
              <div className="absolute left-1/2 top-[9px] z-30 h-[26px] w-[92px] -translate-x-1/2 rounded-full bg-black" />
              {/* Home indicator */}
              <div className="absolute bottom-[7px] left-1/2 z-30 h-[4px] w-[34%] -translate-x-1/2 rounded-full bg-ink/25 dark:bg-white/40" />

              {/* Contenuto scrollabile senza scrollbar */}
              <div className="no-scrollbar h-full overflow-y-auto px-2.5 pb-8 pt-[46px]">
                {!loaded ? (
                  <div className="flex items-center justify-center py-24">
                    <Spinner size="md" />
                  </div>
                ) : widgets.length === 0 && noteRects.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
                    <div className="grid h-12 w-12 place-items-center rounded-full bg-paper text-muted dark:bg-[#1c1c20] dark:text-[#9999a0]">
                      <Icon name="grid" className="h-6 w-6" />
                    </div>
                    <p className="max-w-[220px] text-[13px] text-muted dark:text-[#9999a0]">
                      Aggiungi i widget e le note da mostrare sulla dashboard del telefono.
                    </p>
                  </div>
                ) : (
                  <div className="relative">
                    <DashboardGrid
                      items={notePreview ?? widgets}
                      editing={editing}
                      cols={MOBILE_COLS}
                      narrowCollapse={false}
                      minCol={1}
                      onLayoutChange={setWidgets}
                      onRemove={handleRemove}
                      onConfigChange={handleConfigChange}
                      reserved={noteRects}
                    />
                    {companyId != null && (
                      <StickyNotesLayer
                        ref={notesRef}
                        companyId={companyId}
                        editing={editing}
                        cols={MOBILE_COLS}
                        platform="mobile"
                        widgets={widgets}
                        onNoteRectsChange={setNoteRects}
                        onWidgetsPreview={setNotePreview}
                        onWidgetsCommit={(w) => { setNotePreview(null); setWidgets(w); }}
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <AddWidgetModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdd={handleAdd}
        existing={existing}
      />
    </div>
  );
}
