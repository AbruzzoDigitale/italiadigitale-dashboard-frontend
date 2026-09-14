import { useKpiData } from "./KpiDataContext";
import { MultiSelect } from "../ui/MultiSelect";
import { Icon } from "../ui/Icon";

/**
 * Barra filtri della dashboard (solo admin/PM): operatore / area / cliente.
 * Gli operatori non la vedono — il backend forza comunque il loro scope a sé stessi.
 */
export function DashboardFilterBar() {
  const { privileged, filter, setFilter, options } = useKpiData();
  if (!privileged) return null;

  const active = filter.operatorIds.length + filter.workAreaIds.length + filter.clientIds.length;

  return (
    <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-line bg-paper p-3 dark:border-[#2a2a2e] dark:bg-[#131316]">
      <div className="min-w-[170px] flex-1">
        <MultiSelect
          label="Operatori"
          value={filter.operatorIds}
          onChange={(v) => setFilter({ ...filter, operatorIds: v })}
          options={options.operators}
          placeholder="Tutti"
        />
      </div>
      <div className="min-w-[170px] flex-1">
        <MultiSelect
          label="Aree"
          value={filter.workAreaIds}
          onChange={(v) => setFilter({ ...filter, workAreaIds: v })}
          options={options.areas}
          placeholder="Tutte"
        />
      </div>
      <div className="min-w-[170px] flex-1">
        <MultiSelect
          label="Clienti"
          value={filter.clientIds}
          onChange={(v) => setFilter({ ...filter, clientIds: v })}
          options={options.clients}
          placeholder="Tutti"
        />
      </div>
      {active > 0 && (
        <button
          type="button"
          onClick={() => setFilter({ operatorIds: [], workAreaIds: [], clientIds: [] })}
          className="inline-flex h-[42px] flex-shrink-0 items-center gap-1.5 rounded-md border border-line px-3 text-[12px] font-semibold text-muted transition-colors hover:text-danger dark:border-[#2a2a2e] dark:text-[#9999a0]"
          title="Azzera i filtri"
        >
          <Icon name="x" className="h-3.5 w-3.5" />
          Azzera
        </button>
      )}
    </div>
  );
}
