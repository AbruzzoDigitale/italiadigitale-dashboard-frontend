import { useKpiData } from "../KpiDataContext";
import { BarsH } from "../charts/primitives";
import { ChartFrame } from "./ChartFrame";
import { EntityComparePicker } from "./EntityComparePicker";
import { useWidgetHost } from "./WidgetHostContext";
import type { WidgetInstance } from "./types";

export type BreakdownDimension = "operator" | "area" | "client";

const DIM: Record<BreakdownDimension, { key: string; type: string; subtitle: string }> = {
  operator: { key: "by_operator", type: "kpi-by-operator", subtitle: "Per operatore" },
  area: { key: "by_area", type: "kpi-by-area", subtitle: "Per area" },
  client: { key: "by_client", type: "kpi-by-client", subtitle: "Per cliente" },
};

/** Legge le entità selezionate salvate nel config del widget. */
function configSelectedIds(instance: WidgetInstance): number[] {
  const raw = instance.config.selectedIds;
  return Array.isArray(raw) ? raw.map(Number).filter((n) => !Number.isNaN(n)) : [];
}

/**
 * Widget di confronto: una barra per entità (operatore/area/cliente) dal breakdown.
 * La selezione è PER-WIDGET (salvata nel config): scegli quali entità confrontare.
 * Vuota → ripiega sul filtro globale, altrimenti mostra tutte (top 12).
 */
export function KpiBreakdownWidget({
  instance,
  dimension,
}: {
  instance: WidgetInstance;
  dimension: BreakdownDimension;
}) {
  const { values, catalog, userName, areaName, clientName, filter, privileged } = useKpiData();
  const { editing, updateConfig } = useWidgetHost();
  const kpiId = String(instance.config.kpiId ?? "");
  const meta = catalog.find((c) => c.id === kpiId);
  const value = values[kpiId];
  const cfg = DIM[dimension];

  // I confronti tra OPERATORI e AREE sono solo per admin/PM. Il "per cliente" resta
  // consentito all'operatore: mostra le SUE lavorazioni ripartite per cliente (il
  // breakdown live è già scopato a lui dal backend).
  if (!privileged && dimension !== "client") {
    return (
      <ChartFrame type={cfg.type} title={meta?.label ?? kpiId} subtitle={cfg.subtitle}>
        <div className="flex h-full items-center justify-center px-3 text-center text-[11px] text-muted dark:text-[#9999a0]">
          Confronto disponibile solo per admin/PM
        </div>
      </ChartFrame>
    );
  }

  const breakdown = (value?.breakdown as Record<string, Record<string, number>> | null | undefined) ?? {};
  const raw = breakdown[cfg.key] ?? {};

  const nameOf = dimension === "operator" ? userName : dimension === "area" ? areaName : clientName;
  const perWidget = configSelectedIds(instance);
  const globalSel =
    dimension === "operator" ? filter.operatorIds : dimension === "area" ? filter.workAreaIds : filter.clientIds;
  // Precedenza: selezione del widget, poi filtro globale, poi tutte.
  const selected = perWidget.length ? perWidget : globalSel;
  const selectedSet = new Set(selected.map(String));

  let items = Object.entries(raw).map(([id, count]) => ({
    id,
    label: nameOf(Number(id)),
    value: Number(count),
  }));
  if (selectedSet.size > 0) items = items.filter((it) => selectedSet.has(it.id));
  items.sort((a, b) => b.value - a.value);

  // Il selettore entità serve solo a chi può confrontare (admin/PM): per l'operatore il
  // "per cliente" mostra semplicemente tutti i suoi clienti, senza picker.
  const toolbar =
    editing && privileged ? (
      <EntityComparePicker
        dimension={dimension}
        value={perWidget}
        onChange={(ids) => updateConfig({ selectedIds: ids })}
      />
    ) : undefined;

  return (
    <ChartFrame type={cfg.type} title={meta?.label ?? kpiId} subtitle={cfg.subtitle} toolbar={toolbar}>
      <BarsH items={items.slice(0, 12).map(({ label, value: v }) => ({ label, value: v }))} />
    </ChartFrame>
  );
}
