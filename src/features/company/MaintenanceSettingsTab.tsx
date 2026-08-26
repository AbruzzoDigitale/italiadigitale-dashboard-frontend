import { useCallback, useEffect, useState } from "react";
import { listFormsApi, type Form } from "../../api/forms";
import { getUsersApi, type User } from "../../api/users";
import { listWorkAreasApi, type WorkArea } from "../../api/workAreas";
import {
  WEEKDAY_LABELS,
  WEEK_ORDINAL_LABELS,
  cadenceLabel,
  generateMaintenanceApi,
  getMaintenanceSettingsApi,
  previewMaintenanceApi,
  updateMaintenanceSettingsApi,
  type CadenceType,
  type MaintenancePlan,
  type MaintenanceSettings,
} from "../../api/websiteMaintenance";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Checkbox } from "../../components/ui/Checkbox";
import { EstimatedHoursField } from "../../components/ui/EstimatedHoursField";
import { Icon } from "../../components/ui/Icon";
import { Input } from "../../components/ui/Input";
import { MultiSelect } from "../../components/ui/MultiSelect";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import { SegmentedSwitch } from "../../components/ui/SegmentedSwitch";
import { useToast } from "../../context/ToastContext";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });
}

interface MaintenanceSettingsTabProps {
  companyId: number;
  /** Cambiare le regole e generare: solo admin (ricade sul carico di tutti). */
  isAdmin: boolean;
}

/**
 * Pannello Azienda → Siti web, sezione manutenzioni: la regola di calendario,
 * la distribuzione, chi le fa e quanto pesano. L'anteprima mostra il giro
 * **prima** di creare le task, così non si scopre a cose fatte che il carico è
 * sbilanciato. Sta insieme alle tassonomie dei siti perché è la stessa materia,
 * e il pannello Azienda ha già abbastanza schede.
 */
export function MaintenanceSettingsTab({ companyId, isAdmin }: MaintenanceSettingsTabProps) {
  const toast = useToast();
  const [settings, setSettings] = useState<MaintenanceSettings | null>(null);
  const [plan, setPlan] = useState<MaintenancePlan | null>(null);
  const [areas, setAreas] = useState<WorkArea[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [forms, setForms] = useState<Form[]>([]);
  const [loading, setLoading] = useState(true);
  const [planLoading, setPlanLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSettings(await getMaintenanceSettingsApi(companyId));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel caricamento");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  const loadPlan = useCallback(async () => {
    setPlanLoading(true);
    try {
      setPlan(await previewMaintenanceApi(companyId));
    } catch {
      setPlan(null);
    } finally {
      setPlanLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void load();
    void loadPlan();
  }, [load, loadPlan]);

  useEffect(() => {
    listWorkAreasApi({ company_id: companyId }).then(setAreas).catch(() => setAreas([]));
    // Solo operatori: gli aggiornamenti dei siti non li fanno PM né admin, e
    // offrirli nel menu porterebbe a pianificare ore che nessuno lavorerà.
    getUsersApi(companyId)
      .then((rows) => setUsers(rows.filter((u) => !u.is_admin && u.access_level === "operator")))
      .catch(() => setUsers([]));
    listFormsApi({ companyId }).then((f) => setForms(f.filter((x) => x.is_active))).catch(() => setForms([]));
  }, [companyId]);

  const patch = (campi: Partial<MaintenanceSettings>) =>
    setSettings((prev) => (prev ? { ...prev, ...campi } : prev));

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const { id: _id, company_id: _c, last_generated_at: _l, pending_changes: _p, ...payload } = settings;
      setSettings(await updateMaintenanceSettingsApi(companyId, payload));
      toast.success("Impostazioni salvate");
      await loadPlan();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore nel salvataggio");
    } finally {
      setSaving(false);
    }
  };

  const generate = async (replace: boolean) => {
    setGenerating(true);
    try {
      const esito = await generateMaintenanceApi(companyId, { replace });
      toast.success(
        `${esito.created} task create${esito.removed ? ` · ${esito.removed} rifatte` : ""}` +
          `${esito.skipped ? ` · ${esito.skipped} già presenti` : ""}`
      );
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore nella generazione");
    } finally {
      setGenerating(false);
    }
  };

  if (loading || !settings) {
    return <div className="sp-skeleton h-64 rounded-lg border border-line dark:border-[#2a2a2e]" />;
  }

  const perOperatore = Object.entries(plan?.per_operator ?? {});

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div className="rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</div>
      )}

      {/* ── Regole ── */}
      <div className="rounded-lg border border-line bg-paper p-5 dark:border-[#2a2a2e] dark:bg-[#131316]">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3
              className="mb-1 font-display font-bold tracking-tight text-ink dark:text-[#f4f4f7]"
              style={{ fontSize: "15px" }}
            >
              Manutenzioni programmate
            </h3>
            <p className="font-body text-[12.5px] text-muted dark:text-[#9999a0]">
              Le task si generano da sole per i siti con la spunta «Richiede manutenzione», a partire
              dal giorno di inizio del giro.
            </p>
          </div>
          {!isAdmin && <Badge variant="user">Sola lettura</Badge>}
        </div>

        <fieldset disabled={!isAdmin} className="flex flex-col gap-4">
          <button
            type="button"
            onClick={() => patch({ is_active: !settings.is_active })}
            className="inline-flex items-center gap-2 self-start text-sm text-ink disabled:opacity-60 dark:text-[#f4f4f7]"
          >
            <Checkbox checked={settings.is_active} onChange={(v) => patch({ is_active: v })} disabled={!isAdmin} />
            Generazione automatica attiva
          </button>

          {/* Quando parte */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
              Il giro parte
            </label>
            <SegmentedSwitch
              value={settings.cadence_type}
              onChange={(v) => patch({ cadence_type: v as CadenceType })}
              ariaLabel="Tipo di cadenza"
              options={[
                { value: "monthly_weekday", label: "Un giorno della settimana" },
                { value: "monthly_day", label: "Un giorno del mese" },
              ]}
            />
            <div className="flex flex-wrap items-end gap-2">
              {settings.cadence_type === "monthly_weekday" ? (
                <>
                  <div className="w-36">
                    <SearchableSelect
                      value={String(settings.week_ordinal)}
                      onChange={(v) => patch({ week_ordinal: Number(v) })}
                      options={[1, 2, 3, 4, -1].map((n) => ({
                        value: String(n),
                        label: WEEK_ORDINAL_LABELS[n],
                      }))}
                      showAvatar={false}
                      menuLayer="portal"
                    />
                  </div>
                  <div className="w-40">
                    <SearchableSelect
                      value={String(settings.weekday)}
                      onChange={(v) => patch({ weekday: Number(v) })}
                      options={WEEKDAY_LABELS.map((l, i) => ({ value: String(i), label: l }))}
                      showAvatar={false}
                      menuLayer="portal"
                    />
                  </div>
                  <span className="pb-2 text-[13px] text-muted dark:text-[#9999a0]">di ogni mese</span>
                </>
              ) : (
                <div className="w-28">
                  <Input
                    type="number"
                    min={1}
                    max={31}
                    value={String(settings.day_of_month)}
                    onChange={(e) => patch({ day_of_month: Number(e.target.value) })}
                    hint="del mese"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Distribuzione */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Input
              label="Siti al giorno"
              type="number"
              min={1}
              max={50}
              value={String(settings.sites_per_day)}
              onChange={(e) => patch({ sites_per_day: Number(e.target.value) })}
              hint="6 = una settimana compatta, 2 = spalmato"
            />
            <EstimatedHoursField
              label="Ore stimate per sito"
              value={settings.estimated_hours ?? null}
              onChange={(v) => patch({ estimated_hours: v })}
            />
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => patch({ include_weekend: !settings.include_weekend })}
              className="inline-flex items-center gap-2 text-[13px] text-ink dark:text-[#f4f4f7]"
            >
              <Checkbox checked={settings.include_weekend} onChange={(v) => patch({ include_weekend: v })} disabled={!isAdmin} />
              Usa anche sabato e domenica
            </button>
            <button
              type="button"
              onClick={() => patch({ skip_holidays: !settings.skip_holidays })}
              className="inline-flex items-center gap-2 text-[13px] text-ink dark:text-[#f4f4f7]"
            >
              <Checkbox checked={settings.skip_holidays} onChange={(v) => patch({ skip_holidays: v })} disabled={!isAdmin} />
              Salta i festivi del calendario aziendale
            </button>
          </div>

          {/* Chi le fa */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
                Area di lavoro
              </label>
              <SearchableSelect
                value={settings.work_area_id != null ? String(settings.work_area_id) : ""}
                onChange={(v) => patch({ work_area_id: v ? Number(v) : null })}
                options={[
                  { value: "", label: "Nessuna area" },
                  ...areas.map((a) => ({ value: String(a.id), label: a.name })),
                ]}
                showAvatar={false}
                menuLayer="portal"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <MultiSelect
                label="Operatori"
                value={settings.operator_ids}
                onChange={(v) => patch({ operator_ids: v })}
                options={users.map((u) => ({ id: u.id, label: u.full_name || u.username }))}
                placeholder="Tutti gli operatori dell'area"
              />
              <p className="text-[11.5px] text-muted dark:text-[#9999a0]">
                Lasciando vuoto si usano tutti gli operatori dell'area. PM e admin non compaiono: le
                manutenzioni non le fanno loro. Ogni sito va a chi quel giorno ha più margine.
              </p>
            </div>
          </div>

          {/* Modulo */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
                Modulo di report
              </label>
              <SearchableSelect
                value={settings.form_id != null ? String(settings.form_id) : ""}
                onChange={(v) => patch({ form_id: v ? Number(v) : null })}
                options={[
                  { value: "", label: "Nessun modulo" },
                  ...forms.map((f) => ({ value: String(f.id), label: f.name })),
                ]}
                showAvatar={false}
                menuLayer="portal"
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => patch({ form_required: !settings.form_required })}
                className="inline-flex items-center gap-2 py-2.5 text-[13px] text-ink dark:text-[#f4f4f7]"
              >
                <Checkbox checked={settings.form_required} onChange={(v) => patch({ form_required: v })} disabled={!isAdmin} />
                Obbligatorio per chiudere la task
              </button>
            </div>
          </div>
        </fieldset>

        {isAdmin && (
          <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4 dark:border-[#2a2a2e]">
            {settings.pending_changes && (
              <span className="mr-auto text-[12px] text-warning">
                Parametri cambiati dall'ultima generazione: il prossimo giro verrà rifatto con le regole nuove.
              </span>
            )}
            <Button variant="secondary" onClick={loadPlan} loading={planLoading}>
              Ricalcola anteprima
            </Button>
            <Button variant="primary" onClick={save} loading={saving}>
              Salva impostazioni
            </Button>
          </div>
        )}
      </div>

      {/* ── Anteprima ── */}
      <div className="rounded-lg border border-line bg-paper p-5 dark:border-[#2a2a2e] dark:bg-[#131316]">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3
              className="mb-1 font-display font-bold tracking-tight text-ink dark:text-[#f4f4f7]"
              style={{ fontSize: "15px" }}
            >
              Anteprima del prossimo giro
            </h3>
            <p className="font-body text-[12.5px] text-muted dark:text-[#9999a0]">
              Obiettivo: {settings.sites_per_day} siti al giorno a partire da {cadenceLabel(settings)}. Qui
              sotto la distribuzione <strong>reale</strong>, che tiene conto del carico già in calendario
              di ogni operatore. Non crea nulla finché non premi Genera.
            </p>
          </div>
          {isAdmin && plan && plan.total_sites > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" onClick={() => generate(true)} loading={generating}>
                Rigenera
              </Button>
              <Button
                variant="primary"
                onClick={() => generate(false)}
                loading={generating}
                leftIcon={<Icon name="calendar" className="w-3.5 h-3.5" />}
              >
                Genera le task
              </Button>
            </div>
          )}
        </div>

        {planLoading ? (
          <div className="sp-skeleton h-40 rounded-md border border-line dark:border-[#2a2a2e]" />
        ) : !plan || plan.total_sites === 0 ? (
          <div className="rounded-md border border-dashed border-line px-4 py-6 text-sm text-muted dark:border-[#2a2a2e] dark:text-[#9999a0]">
            Nessun sito da manutenere: serve la spunta «Richiede manutenzione» su almeno un sito.
          </div>
        ) : (
          <>
            <div className="mb-3 flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted dark:text-[#9999a0]">
                <Badge variant="info">
                  {plan.total_sites} siti in {plan.working_days} giorni
                </Badge>
                <span>dal {formatDate(plan.start)}</span>
                {perOperatore.length > 0 && (
                  <span>
                    · carico:{" "}
                    {perOperatore
                      .map(([nome, n]) => `${nome} ${n}${plan.hours_per_operator[nome] ? ` (${plan.hours_per_operator[nome]}h)` : ""}`)
                      .join(", ")}
                  </span>
                )}
              </div>

              {plan.working_days > plan.target_days && (
                <div className="flex items-start gap-2 rounded-md border border-warning/25 bg-warning/5 px-3 py-2 text-[12.5px] text-ink dark:text-[#f4f4f7]">
                  <Icon name="information-circle" className="mt-0.5 h-4 w-4 flex-none text-warning" />
                  <span>
                    Al ritmo di {settings.sites_per_day} al giorno servirebbero{" "}
                    <strong>{plan.target_days} giorni</strong>, ma il carico già in calendario ne
                    richiede <strong>{plan.working_days}</strong>: il giro si allunga invece di
                    ammassare task su chi è già pieno.
                  </span>
                </div>
              )}

              {plan.unassigned.length > 0 && (
                <div className="flex items-start gap-2 rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-[12.5px] text-danger">
                  <Icon name="alert-triangle" className="mt-0.5 h-4 w-4 flex-none" />
                  <span>
                    {plan.unassigned.length} siti non trovano posto: aggiungi operatori all'area,
                    alza la capacità giornaliera o riduci i siti al giorno. ({plan.unassigned.slice(0, 5).join(", ")}
                    {plan.unassigned.length > 5 ? "…" : ""})
                  </span>
                </div>
              )}

              {plan.operator_names.length === 0 && (
                <div className="flex items-start gap-2 rounded-md border border-warning/25 bg-warning/5 px-3 py-2 text-[12.5px] text-ink dark:text-[#f4f4f7]">
                  <Icon name="information-circle" className="mt-0.5 h-4 w-4 flex-none text-warning" />
                  <span>
                    Nessun operatore: scegline qualcuno oppure imposta un'area di lavoro, e verranno
                    usate tutte le persone di quell'area.
                  </span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {plan.days.map((giorno) => (
                <div
                  key={giorno.date}
                  className="rounded-md border border-line bg-cream p-3 dark:border-[#2a2a2e] dark:bg-[#1c1c20]"
                >
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink dark:text-[#f4f4f7]">
                    {formatDate(giorno.date)}
                  </p>
                  <ul className="flex flex-col gap-0.5">
                    {giorno.sites.map((s) => (
                      <li key={s.website_id} className="flex items-baseline justify-between gap-2 text-[12px]">
                        <span className="min-w-0 truncate text-ink dark:text-[#f4f4f7]">{s.website_domain}</span>
                        {s.user_label && (
                          <span className="flex-none text-[11px] text-muted dark:text-[#9999a0]">
                            {s.user_label}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {plan.next_starts.length > 0 && (
              <p className="mt-3 text-[11.5px] text-muted dark:text-[#9999a0]">
                Giri successivi: {plan.next_starts.map((d) => formatDate(d)).join(" · ")}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
