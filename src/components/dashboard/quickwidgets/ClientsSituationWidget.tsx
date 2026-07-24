import { getPostSalesSituationApi } from "../../../api/clients";
import { useAuth } from "../../../hooks/useAuth";
import { QuickListFrame, QuickRow, useQuickData } from "./QuickListFrame";
import { ContractStageBadge } from "./badges";

/** Stato "dominante" del cliente: la fase con più contratti nel riepilogo. */
function dominantStage(summary: unknown): string | null {
  if (!summary) return null;
  const counts: Record<string, number> = {};
  if (Array.isArray(summary)) {
    for (const s of summary as Array<Record<string, unknown>>) {
      const name = (s.name ?? s.stage) as string | undefined;
      const cnt = Number(s.count ?? 1);
      if (name) counts[name] = (counts[name] ?? 0) + cnt;
    }
  } else if (typeof summary === "object") {
    for (const [k, v] of Object.entries(summary as Record<string, unknown>)) counts[k] = Number(v) || 0;
  }
  let best: string | null = null;
  let bestN = 0;
  for (const [k, n] of Object.entries(counts)) {
    if (n > bestN) {
      best = k;
      bestN = n;
    }
  }
  return best;
}

export function ClientsSituationWidget() {
  const { activeCompanyId } = useAuth();
  const { data, loading } = useQuickData(
    () => getPostSalesSituationApi({ company_id: activeCompanyId ?? undefined, per_page: 12 }),
    [activeCompanyId],
  );
  const items = data?.data ?? [];

  return (
    <QuickListFrame
      title="Situazioni clienti"
      icon="activity"
      to="/clients-situation"
      count={data?.total}
      loading={loading}
      empty={items.length === 0}
      emptyText="Nessuna situazione"
    >
      {items.map((c) => {
        const stage = dominantStage(c.contract_status_summary);
        return (
          <QuickRow
            key={c.id}
            title={c.name}
            sub={`${c.active_contract_count} contratti attivi`}
            right={stage ? <ContractStageBadge stage={stage} /> : undefined}
          />
        );
      })}
    </QuickListFrame>
  );
}
