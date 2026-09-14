import { listCommercialPipelineApi } from "../../../api/contracts";
import { useAuth } from "../../../hooks/useAuth";
import { QuickListFrame, useQuickData } from "./QuickListFrame";

const STAGE_ORDER = [
  "bozza", "inviato", "in_trattativa", "accettato", "contratto_inviato", "firmato", "in_produzione", "completato", "perso",
];
const STAGE_LABELS: Record<string, string> = {
  bozza: "Bozza",
  inviato: "Inviato",
  in_trattativa: "In trattativa",
  accettato: "Accettato",
  contratto_inviato: "Contratto inviato",
  firmato: "Firmato",
  in_produzione: "In produzione",
  completato: "Completato",
  perso: "Perso",
};

export function PipelineWidget() {
  const { activeCompanyId } = useAuth();
  const { data, loading } = useQuickData(
    () => listCommercialPipelineApi({ company_id: activeCompanyId ?? undefined }),
    [activeCompanyId],
  );
  const items = data ?? [];
  const counts: Record<string, number> = {};
  for (const it of items) counts[it.commercial_stage] = (counts[it.commercial_stage] ?? 0) + 1;
  const stages = STAGE_ORDER.filter((s) => (counts[s] ?? 0) > 0);

  return (
    <QuickListFrame
      title="Pipeline commerciale"
      icon="target"
      to="/contracts-pipeline"
      count={items.length}
      loading={loading}
      empty={items.length === 0}
      emptyText="Pipeline vuota"
    >
      <div className="flex flex-col gap-1.5 py-1">
        {stages.map((s) => (
          <div key={s} className="flex items-center gap-2 text-[12px]">
            <span className="min-w-0 flex-1 truncate text-muted dark:text-[#9999a0]">{STAGE_LABELS[s] ?? s}</span>
            <span className="font-bold text-ink dark:text-[#f4f4f7]">{counts[s]}</span>
          </div>
        ))}
      </div>
    </QuickListFrame>
  );
}
