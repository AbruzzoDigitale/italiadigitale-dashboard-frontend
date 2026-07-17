import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getContractBillingPlanApi,
  updateContractBillingPlanApi,
  releaseInstallmentApi,
  unreleaseInstallmentApi,
  CONTRACT_STAGE_ORDER,
  CONTRACT_STAGE_LABELS,
  type BillingPlan,
  type BillingInstallmentInput,
  type BillingTriggerType,
} from "../../api/contracts";
import { formatEur } from "../../api/quotes";
import { useToast } from "../../context/ToastContext";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Spinner } from "../ui/Spinner";

type QuotaMode = "percent" | "fixed";

interface DraftInstallment {
  key: string;
  id: number | null;
  label: string;
  mode: QuotaMode;
  percent: string;
  amountNet: string;
  triggerType: BillingTriggerType;
  triggerStage: string;
  triggerDate: string;
  dueOffsetDays: string;
}

const STAGE_OPTIONS = CONTRACT_STAGE_ORDER.filter((s) => s !== "perso");

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function toDraft(p: BillingPlan): DraftInstallment[] {
  return p.installments.map((i) => ({
    key: `srv-${i.id}`,
    id: i.id,
    label: i.label,
    mode: i.percent != null ? "percent" : "fixed",
    percent: i.percent != null ? String(i.percent) : "",
    amountNet: i.amount_net_input != null ? String(i.amount_net_input) : "",
    triggerType: i.trigger_type,
    triggerStage: i.trigger_stage ?? "in_produzione",
    triggerDate: i.trigger_date ?? "",
    dueOffsetDays: i.due_offset_days != null ? String(i.due_offset_days) : "",
  }));
}

function toPayloadInstallments(rows: DraftInstallment[]): BillingInstallmentInput[] {
  return rows.map((r, idx) => ({
    id: r.id ?? undefined,
    label: r.label.trim() || "Tranche",
    percent: r.mode === "percent" ? Number(r.percent) || 0 : null,
    amount_net: r.mode === "fixed" ? Number(r.amountNet) || 0 : null,
    trigger_type: r.triggerType,
    trigger_stage: r.triggerType === "stage" ? r.triggerStage : null,
    trigger_date: r.triggerType === "date" ? r.triggerDate || null : null,
    due_offset_days: r.dueOffsetDays.trim() ? Number(r.dueOffsetDays) : null,
    sort_order: idx,
  }));
}

export function BillingPlanSection({
  contractId,
  isAdmin,
  onChanged,
}: {
  contractId: number;
  isAdmin: boolean;
  onChanged?: () => void;
}) {
  const toast = useToast();
  const [plan, setPlan] = useState<BillingPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [mode, setMode] = useState<"per_lavorazione" | "piano">("per_lavorazione");
  const [baseNet, setBaseNet] = useState("");
  const [vatRate, setVatRate] = useState("22");
  const [rows, setRows] = useState<DraftInstallment[]>([]);
  const uid = useRef(0);
  const nextKey = () => `new-${uid.current++}`;

  const applyPlan = useCallback((p: BillingPlan) => {
    setPlan(p);
    setMode(p.billing_mode);
    setBaseNet(String(p.base_net || p.base_net_default || 0));
    setVatRate(String(p.vat_rate ?? 22));
    setRows(toDraft(p));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      applyPlan(await getContractBillingPlanApi(contractId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Impossibile caricare il piano di fatturazione");
    } finally {
      setLoading(false);
    }
  }, [contractId, applyPlan, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const baseNetNum = Number(baseNet) || 0;
  const vatNum = Number(vatRate) || 0;

  const computed = useMemo(() => {
    return rows.map((r) => {
      const net = r.mode === "percent" ? round2((baseNetNum * (Number(r.percent) || 0)) / 100) : round2(Number(r.amountNet) || 0);
      const vat = round2((net * vatNum) / 100);
      return { net, vat, gross: round2(net + vat) };
    });
  }, [rows, baseNetNum, vatNum]);

  const allocatedPct = rows.reduce((s, r) => s + (r.mode === "percent" ? Number(r.percent) || 0 : 0), 0);
  const allocatedNet = computed.reduce((s, c) => s + c.net, 0);
  const remainingPct = Math.max(0, round2(100 - allocatedPct));
  const overAllocated = allocatedPct - 100 > 0.001;

  // Confronto con lo stato salvato per capire se ci sono modifiche in sospeso.
  const dirty = useMemo(() => {
    if (!plan) return false;
    const cur = JSON.stringify({
      mode,
      base: baseNet === "" ? null : Number(baseNet),
      vat: vatRate === "" ? null : Number(vatRate),
      inst: toPayloadInstallments(rows),
    });
    const srv = JSON.stringify({
      mode: plan.billing_mode,
      base: plan.base_net,
      vat: plan.vat_rate,
      inst: toPayloadInstallments(toDraft(plan)),
    });
    return cur !== srv;
  }, [plan, mode, baseNet, vatRate, rows]);

  const serverById = useMemo(() => {
    const m = new Map<number, BillingPlan["installments"][number]>();
    plan?.installments.forEach((i) => m.set(i.id, i));
    return m;
  }, [plan]);

  const addRow = (preset?: Partial<DraftInstallment>) =>
    setRows((prev) => [
      ...prev,
      {
        key: nextKey(),
        id: null,
        label: "",
        mode: "percent",
        percent: "",
        amountNet: "",
        triggerType: "manual",
        triggerStage: "in_produzione",
        triggerDate: "",
        dueOffsetDays: "",
        ...preset,
      },
    ]);

  const applyPreset302020 = () => {
    setRows([
      { key: nextKey(), id: null, label: "Anticipo", mode: "percent", percent: "30", amountNet: "", triggerType: "stage", triggerStage: "in_produzione", triggerDate: "", dueOffsetDays: "" },
      { key: nextKey(), id: null, label: "Acconto", mode: "percent", percent: "50", amountNet: "", triggerType: "manual", triggerStage: "in_produzione", triggerDate: "", dueOffsetDays: "" },
      { key: nextKey(), id: null, label: "Saldo", mode: "percent", percent: "20", amountNet: "", triggerType: "stage", triggerStage: "completato", triggerDate: "", dueOffsetDays: "" },
    ]);
  };

  const patchRow = (key: string, patch: Partial<DraftInstallment>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const removeRow = (key: string) => setRows((prev) => prev.filter((r) => r.key !== key));

  const save = async () => {
    if (overAllocated) {
      toast.error("La somma delle percentuali supera il 100%");
      return;
    }
    setSaving(true);
    try {
      const updated = await updateContractBillingPlanApi(contractId, {
        billing_mode: mode,
        base_net: baseNet === "" ? null : Number(baseNet),
        vat_rate: vatRate === "" ? null : Number(vatRate),
        installments: toPayloadInstallments(rows),
      });
      applyPlan(updated);
      toast.success("Piano di fatturazione salvato");
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Impossibile salvare il piano");
    } finally {
      setSaving(false);
    }
  };

  const release = async (id: number) => {
    setBusyId(id);
    try {
      applyPlan(await releaseInstallmentApi(contractId, id));
      toast.success("Tranche inviata in fatturazione");
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Impossibile inviare la tranche");
    } finally {
      setBusyId(null);
    }
  };

  const unrelease = async (id: number) => {
    setBusyId(id);
    try {
      applyPlan(await unreleaseInstallmentApi(contractId, id));
      toast.info("Rilascio annullato");
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Impossibile annullare il rilascio");
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Spinner />
      </div>
    );
  }

  const inputCls =
    "w-full rounded-md border border-line dark:border-line-dark bg-paper dark:bg-ink-soft px-2 py-1.5 text-xs text-ink dark:text-paper focus:outline-none focus:ring-1 focus:ring-ink/30 disabled:opacity-60";

  return (
    <div className="space-y-4">
      {/* Modalità di fatturazione */}
      <div className="rounded-md border border-line dark:border-line-dark p-3">
        <div className="text-[11px] uppercase tracking-wider text-muted dark:text-muted-dark mb-2">Modalità di fatturazione</div>
        <div className="flex flex-col gap-2 sm:flex-row">
          {(["per_lavorazione", "piano"] as const).map((m) => (
            <button
              key={m}
              type="button"
              disabled={!isAdmin}
              onClick={() => setMode(m)}
              className={
                "flex-1 rounded-md border px-3 py-2 text-left text-xs transition-colors disabled:opacity-60 " +
                (mode === m
                  ? "border-ink bg-ink text-paper dark:border-paper dark:bg-paper dark:text-ink"
                  : "border-line dark:border-line-dark text-muted dark:text-muted-dark hover:bg-cream dark:hover:bg-[#1c1c20]")
              }
            >
              <div className="font-semibold">{m === "per_lavorazione" ? "A lavorazione" : "A piano (percentuali)"}</div>
              <div className={"mt-0.5 " + (mode === m ? "opacity-80" : "opacity-70")}>
                {m === "per_lavorazione"
                  ? "Si fattura ogni lavorazione completata."
                  : "Scadenzario a tranche; le lavorazioni non generano fatture."}
              </div>
            </button>
          ))}
        </div>
      </div>

      {mode === "piano" && (
        <>
          {/* Base imponibile + IVA */}
          <div className="rounded-md border border-line dark:border-line-dark p-3">
            <div className="text-[11px] uppercase tracking-wider text-muted dark:text-muted-dark mb-2">Base di calcolo</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-muted dark:text-muted-dark">Imponibile base (€)</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className={inputCls}
                  value={baseNet}
                  disabled={!isAdmin}
                  onChange={(e) => setBaseNet(e.target.value)}
                />
                <span className="mt-0.5 block text-[10px] text-muted dark:text-muted-dark">
                  Suggerito dal contratto: {formatEur(plan?.base_net_default ?? 0)}
                </span>
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-muted dark:text-muted-dark">IVA (%)</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  className={inputCls}
                  value={vatRate}
                  disabled={!isAdmin}
                  onChange={(e) => setVatRate(e.target.value)}
                />
              </label>
              <div className="flex flex-col justify-end text-xs">
                <div className="text-muted dark:text-muted-dark">Totale base (IVA incl.)</div>
                <div className="text-sm font-semibold text-ink dark:text-paper">
                  {formatEur(round2(baseNetNum * (1 + vatNum / 100)))}
                </div>
              </div>
            </div>
          </div>

          {/* Tranche */}
          <div className="rounded-md border border-line dark:border-line-dark p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-[11px] uppercase tracking-wider text-muted dark:text-muted-dark">Tranche</div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={!isAdmin}
                  onClick={applyPreset302020}
                  className="rounded-md border border-line dark:border-line-dark px-2 py-1 text-[11px] font-semibold text-muted hover:text-ink dark:text-muted-dark dark:hover:text-paper disabled:opacity-60"
                >
                  Preset 30/50/20
                </button>
                <Button size="sm" variant="secondary" disabled={!isAdmin} onClick={() => addRow()}>
                  <Icon name="plus" className="h-3.5 w-3.5" /> Tranche
                </Button>
              </div>
            </div>

            {rows.length === 0 ? (
              <div className="rounded-md border border-dashed border-line px-3 py-4 text-center text-xs text-muted dark:border-line-dark dark:text-muted-dark">
                Nessuna tranche. Aggiungine una o usa il preset 30/50/20.
              </div>
            ) : (
              <div className="space-y-2">
                {rows.map((r, idx) => {
                  const c = computed[idx];
                  const srv = r.id != null ? serverById.get(r.id) : undefined;
                  const released = srv?.state === "released";
                  const invoiced = srv?.billing_state === "fatturato";
                  const canRelease = !!srv && srv.releasable && !dirty;
                  return (
                    <div
                      key={r.key}
                      className={
                        "rounded-md border p-2.5 " +
                        (released ? "border-success/40 bg-success/5" : "border-line/70 dark:border-line-dark/70")
                      }
                    >
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-12">
                        {/* Etichetta */}
                        <div className="md:col-span-3">
                          <input
                            className={inputCls}
                            placeholder="Etichetta (es. Anticipo)"
                            value={r.label}
                            disabled={!isAdmin || released}
                            onChange={(e) => patchRow(r.key, { label: e.target.value })}
                          />
                        </div>
                        {/* Quota */}
                        <div className="flex items-center gap-1 md:col-span-3">
                          <select
                            className={inputCls + " w-[70px]"}
                            value={r.mode}
                            disabled={!isAdmin || released}
                            onChange={(e) => patchRow(r.key, { mode: e.target.value as QuotaMode })}
                          >
                            <option value="percent">%</option>
                            <option value="fixed">€</option>
                          </select>
                          {r.mode === "percent" ? (
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step="0.001"
                              className={inputCls}
                              placeholder="%"
                              value={r.percent}
                              disabled={!isAdmin || released}
                              onChange={(e) => patchRow(r.key, { percent: e.target.value })}
                            />
                          ) : (
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              className={inputCls}
                              placeholder="€ netto"
                              value={r.amountNet}
                              disabled={!isAdmin || released}
                              onChange={(e) => patchRow(r.key, { amountNet: e.target.value })}
                            />
                          )}
                        </div>
                        {/* Trigger */}
                        <div className="flex items-center gap-1 md:col-span-4">
                          <select
                            className={inputCls + " w-[110px]"}
                            value={r.triggerType}
                            disabled={!isAdmin || released}
                            onChange={(e) => patchRow(r.key, { triggerType: e.target.value as BillingTriggerType })}
                          >
                            <option value="manual">Manuale</option>
                            <option value="stage">Allo step</option>
                            <option value="date">Alla data</option>
                          </select>
                          {r.triggerType === "stage" && (
                            <select
                              className={inputCls}
                              value={r.triggerStage}
                              disabled={!isAdmin || released}
                              onChange={(e) => patchRow(r.key, { triggerStage: e.target.value })}
                            >
                              {STAGE_OPTIONS.map((s) => (
                                <option key={s} value={s}>
                                  {CONTRACT_STAGE_LABELS[s]}
                                </option>
                              ))}
                            </select>
                          )}
                          {r.triggerType === "date" && (
                            <input
                              type="date"
                              className={inputCls}
                              value={r.triggerDate}
                              disabled={!isAdmin || released}
                              onChange={(e) => patchRow(r.key, { triggerDate: e.target.value })}
                            />
                          )}
                        </div>
                        {/* Rimuovi */}
                        <div className="flex items-center justify-end md:col-span-2">
                          {!released && isAdmin && (
                            <button
                              type="button"
                              onClick={() => removeRow(r.key)}
                              className="rounded-md border border-line px-2 py-1 text-[11px] text-muted hover:border-danger hover:text-danger dark:border-line-dark dark:text-muted-dark"
                            >
                              <Icon name="trash" className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Importi + stato/azioni */}
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-2 text-xs dark:border-line-dark/60">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-muted dark:text-muted-dark">
                          <span>Imponibile <b className="text-ink dark:text-paper">{formatEur(released && srv?.amount_net != null ? srv.amount_net : c.net)}</b></span>
                          <span>IVA <b className="text-ink dark:text-paper">{formatEur(released && srv?.amount_vat != null ? srv.amount_vat : c.vat)}</b></span>
                          <span>Totale <b className="text-ink dark:text-paper">{formatEur(released && srv?.amount_gross != null ? srv.amount_gross : c.gross)}</b></span>
                        </div>
                        <div className="flex items-center gap-2">
                          {released ? (
                            <>
                              <span
                                className={
                                  "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase " +
                                  (invoiced ? "bg-success/15 text-success" : "bg-warning/15 text-warning")
                                }
                              >
                                {invoiced ? `Fatturata${srv?.invoice_number ? " · " + srv.invoice_number : ""}` : "In fatturazione"}
                              </span>
                              {isAdmin && !invoiced && (
                                <button
                                  type="button"
                                  disabled={busyId === r.id}
                                  onClick={() => r.id != null && unrelease(r.id)}
                                  className="rounded-md border border-line px-2 py-1 text-[11px] font-semibold text-muted hover:border-danger hover:text-danger dark:border-line-dark dark:text-muted-dark disabled:opacity-60"
                                >
                                  Annulla rilascio
                                </button>
                              )}
                            </>
                          ) : (
                            <>
                              {srv && !srv.releasable && (
                                <span className="text-[10px] text-muted dark:text-muted-dark">
                                  {srv ? "Trigger non ancora soddisfatto" : ""}
                                </span>
                              )}
                              {isAdmin && (
                                <button
                                  type="button"
                                  disabled={!canRelease || busyId === r.id}
                                  onClick={() => r.id != null && release(r.id)}
                                  title={
                                    dirty
                                      ? "Salva il piano prima di inviare in fatturazione"
                                      : !srv
                                      ? "Salva il piano per abilitare l'invio"
                                      : !srv.releasable
                                      ? "Trigger non ancora raggiunto"
                                      : "Invia questa tranche in fatturazione"
                                  }
                                  className="inline-flex items-center gap-1 rounded-md bg-ink px-2.5 py-1 text-[11px] font-semibold text-paper hover:opacity-90 disabled:opacity-40 dark:bg-paper dark:text-ink"
                                >
                                  <Icon name="upload" className="h-3.5 w-3.5" /> Invia in fatturazione
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Riepilogo allocazione */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-line/70 px-3 py-2 text-xs dark:border-line-dark/70">
              <div className={overAllocated ? "font-semibold text-danger" : "text-muted dark:text-muted-dark"}>
                Allocato: <b className="text-ink dark:text-paper">{allocatedPct.toFixed(2)}%</b> · {formatEur(allocatedNet)}
                {" · "}Residuo: <b className="text-ink dark:text-paper">{remainingPct.toFixed(2)}%</b>
                {overAllocated && " · supera il 100%"}
              </div>
              <div className="flex items-center gap-2">
                {dirty && <span className="text-[11px] font-semibold text-warning">Modifiche non salvate</span>}
                <Button onClick={() => void save()} loading={saving} disabled={!isAdmin || !dirty || overAllocated}>
                  Salva piano
                </Button>
              </div>
            </div>
          </div>
        </>
      )}

      {mode === "per_lavorazione" && dirty && (
        <div className="flex items-center justify-end">
          <Button onClick={() => void save()} loading={saving} disabled={!isAdmin}>
            Salva modalità
          </Button>
        </div>
      )}
    </div>
  );
}
