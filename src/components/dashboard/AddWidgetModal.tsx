import { Modal } from "../ui/Modal";
import { Icon } from "../ui/Icon";
import { useKpiData } from "./KpiDataContext";
import { WIDGET_TYPES } from "./widgets/widgetCatalog";
import { QUICK_WIDGETS } from "./widgets/quickWidgetCatalog";
import { WidgetTypeIcon } from "./widgets/WidgetTypeIcon";
import { useAuth } from "../../hooks/useAuth";
import { canAccessRoute } from "../../utils/access";

interface AddWidgetModalProps {
  open: boolean;
  onClose: () => void;
  onAdd: (type: string, kpiId?: string) => void;
  /** Chiavi già presenti nella forma `${type}:${kpiId}` (kpiId vuoto per i widget lista). */
  existing: string[];
}

export function AddWidgetModal({ open, onClose, onAdd, existing }: AddWidgetModalProps) {
  const { catalog } = useKpiData();
  const { permissions } = useAuth();
  const existingSet = new Set(existing);
  const quick = QUICK_WIDGETS.filter((q) => !q.requiresRoute || canAccessRoute(permissions, q.requiresRoute));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Aggiungi widget"
      description="Scegli il tipo di visualizzazione e la KPI. Puoi aggiungerne più d'una."
      icon={<Icon name="plus" className="h-5 w-5" />}
      size="2xl"
    >
      <div className="flex flex-col gap-6">
        {WIDGET_TYPES.map((wt) => {
          const kpis = catalog.filter((k) => wt.applies(k));
          if (kpis.length === 0) return null;
          return (
            <div key={wt.type}>
              <div className="mb-2 flex items-center gap-2">
                <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-md bg-cream text-brand-magenta dark:bg-[#1c1c20]">
                  <WidgetTypeIcon type={wt.type} className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] font-bold text-ink dark:text-[#f4f4f7]">{wt.label}</p>
                  <p className="text-[11px] text-muted dark:text-[#9999a0]">{wt.description}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {kpis.map((k) => {
                  const key = `${wt.type}:${k.id}`;
                  const added = existingSet.has(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={added}
                      onClick={() => onAdd(wt.type, k.id)}
                      className={`flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-left transition-colors ${
                        added
                          ? "cursor-default border-line/60 opacity-50 dark:border-[#2a2a2e]"
                          : "border-line hover:border-brand-magenta hover:bg-cream dark:border-[#2a2a2e] dark:hover:bg-[#1c1c20]"
                      }`}
                    >
                      <span className="min-w-0 truncate text-[12px] font-semibold text-ink dark:text-[#f4f4f7]">
                        {k.label}
                      </span>
                      {added ? (
                        <Icon name="check" className="h-4 w-4 flex-shrink-0 text-success" />
                      ) : (
                        <Icon name="plus" className="h-4 w-4 flex-shrink-0 text-brand-magenta" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        {quick.length > 0 && (
          <div>
            <div className="mb-2">
              <p className="text-[13px] font-bold text-ink dark:text-[#f4f4f7]">Visualizzazione rapida</p>
              <p className="text-[11px] text-muted dark:text-[#9999a0]">Liste e riepiloghi per vedere i dati al volo.</p>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {quick.map((q) => {
                const key = `${q.type}:`;
                const added = existingSet.has(key);
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={added}
                    onClick={() => onAdd(q.type)}
                    className={`flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-left transition-colors ${
                      added
                        ? "cursor-default border-line/60 opacity-50 dark:border-[#2a2a2e]"
                        : "border-line hover:border-brand-magenta hover:bg-cream dark:border-[#2a2a2e] dark:hover:bg-[#1c1c20]"
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Icon name={q.icon} className="h-4 w-4 flex-shrink-0 text-brand-magenta" />
                      <span className="min-w-0">
                        <span className="block truncate text-[12px] font-semibold text-ink dark:text-[#f4f4f7]">
                          {q.label}
                        </span>
                        <span className="block truncate text-[11px] text-muted dark:text-[#9999a0]">
                          {q.description}
                        </span>
                      </span>
                    </span>
                    {added ? (
                      <Icon name="check" className="h-4 w-4 flex-shrink-0 text-success" />
                    ) : (
                      <Icon name="plus" className="h-4 w-4 flex-shrink-0 text-brand-magenta" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {catalog.length === 0 && quick.length === 0 && (
          <p className="py-4 text-center text-sm text-muted dark:text-[#9999a0]">Nessun widget disponibile.</p>
        )}
      </div>
    </Modal>
  );
}
