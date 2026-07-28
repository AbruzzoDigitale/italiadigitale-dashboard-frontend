import { useEffect, useState } from "react";
import {
  getWorkloadWeightsApi,
  updateWorkloadWeightsApi,
  type WorkloadWeightSituation,
  type WorkloadWeightsUpdate,
} from "../../api/workloadWeights";
import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Checkbox";
import { Icon } from "../ui/Icon";
import { Spinner } from "../ui/Spinner";
import { useToast } from "../../context/ToastContext";

interface Props {
  companyId: number;
  canEdit: boolean;
}

// Stato editabile per riga: percentuale (0-300) + lucchetto "permanente".
type RowState = { percent: string; locked: boolean };

function factorToPercent(factor: number): string {
  return String(Math.round(factor * 100));
}

function percentToFactor(percent: string): number {
  const n = Number(percent);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(3, n / 100));
}

export function WorkloadWeightsSection({ companyId, canEdit }: Props) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [situations, setSituations] = useState<WorkloadWeightSituation[]>([]);
  const [rows, setRows] = useState<Record<string, RowState>>({});

  const hydrate = (list: WorkloadWeightSituation[]) => {
    setSituations(list);
    const next: Record<string, RowState> = {};
    for (const s of list) next[s.key] = { percent: factorToPercent(s.factor), locked: s.locked };
    setRows(next);
  };

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    setLoading(true);
    getWorkloadWeightsApi(companyId)
      .then((cfg) => {
        if (!cancelled) hydrate(cfg.situations);
      })
      .catch((e) => {
        if (!cancelled) toast.error((e as Error).message || "Errore nel caricamento");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const setRow = (key: string, patch: Partial<RowState>) => {
    setRows((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  };

  const handleSave = async () => {
    if (!companyId) return;
    const payload: WorkloadWeightsUpdate = {};
    for (const s of situations) {
      const row = rows[s.key];
      if (!row) continue;
      payload[s.key] = { factor: percentToFactor(row.percent), locked: row.locked };
    }
    setSaving(true);
    try {
      const cfg = await updateWorkloadWeightsApi(companyId, payload);
      hydrate(cfg.situations);
      toast.success("Pesi del carico salvati");
    } catch (e) {
      toast.error((e as Error).message || "Errore nel salvataggio");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-paper dark:bg-[#131316] rounded-lg border border-line dark:border-[#2a2a2e] p-6 mb-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-5">
        <div>
          <h2
            className="font-display font-bold tracking-tight text-ink dark:text-[#f4f4f7] mb-1"
            style={{ fontSize: "17px" }}
          >
            Pesi del carico per situazione
          </h2>
          <p className="font-body text-[13px] text-muted dark:text-[#9999a0]">
            Peso di default (in % del carico normale) applicato in ogni situazione. Con{" "}
            <strong>Permanente</strong> il valore è vincolante e il PM non può cambiarlo sulla
            singola lavorazione.
          </p>
        </div>
        {canEdit && (
          <Button variant="primary" onClick={handleSave} loading={saving} disabled={loading}>
            Salva
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {situations.map((s) => {
            const row = rows[s.key] ?? { percent: factorToPercent(s.factor), locked: s.locked };
            const isDefault =
              Math.round(percentToFactor(row.percent) * 100) === Math.round(s.default_factor * 100);
            return (
              <div
                key={s.key}
                className="flex flex-col gap-2 rounded-lg border border-line dark:border-[#2a2a2e] p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-ink dark:text-[#f4f4f7]">{s.label}</div>
                  <div className="text-xs text-muted dark:text-[#9999a0]">{s.help}</div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      max={300}
                      step={5}
                      value={row.percent}
                      disabled={!canEdit}
                      onChange={(e) => setRow(s.key, { percent: e.target.value })}
                      className="w-20 rounded-md border border-line bg-paper px-2 py-1.5 text-right text-sm text-ink disabled:opacity-50 dark:border-[#2a2a2e] dark:bg-[#0E0F0E] dark:text-[#f4f4f7]"
                    />
                    <span className="text-sm text-muted dark:text-[#9999a0]">%</span>
                  </div>
                  <label className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-xs text-ink dark:text-[#f4f4f7]">
                    <Checkbox
                      checked={row.locked}
                      disabled={!canEdit}
                      onChange={(checked) => setRow(s.key, { locked: checked })}
                    />
                    <span className="inline-flex items-center gap-1">
                      {row.locked && <Icon name="shield-check" className="w-3 h-3" />}
                      Permanente
                    </span>
                  </label>
                  {canEdit && !isDefault && (
                    <button
                      type="button"
                      className="whitespace-nowrap text-xs text-muted hover:text-ink hover:underline dark:text-[#9999a0] dark:hover:text-[#f4f4f7]"
                      onClick={() => setRow(s.key, { percent: factorToPercent(s.default_factor) })}
                      title={`Default: ${Math.round(s.default_factor * 100)}%`}
                    >
                      Ripristina
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
