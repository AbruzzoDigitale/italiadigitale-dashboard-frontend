import { useCallback, useEffect, useMemo, useState } from "react";
import { getUsersApi, type User } from "../../api/users";
import { listWebsitesApi, websiteLabel, type Website } from "../../api/websites";
import {
  DEFAULT_MONITOR,
  INTERVAL_OPTIONS,
  createMonitorApi,
  deleteMonitorApi,
  intervalLabel,
  listMonitorsApi,
  runMonitorApi,
  updateMonitorApi,
  type MonitorSettings,
  type WebsiteMonitor,
} from "../../api/websiteMonitors";
import { Button } from "../../components/ui/Button";
import { Checkbox } from "../../components/ui/Checkbox";
import { Icon } from "../../components/ui/Icon";
import { Input } from "../../components/ui/Input";
import { Modal } from "../../components/ui/Modal";
import { MultiSelect } from "../../components/ui/MultiSelect";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import { useToast } from "../../context/ToastContext";
import { WebsiteMonitorReport } from "./WebsiteMonitorReport";

/**
 * Monitoraggi dei siti, con lo stesso impianto dei monitor social: l'elenco
 * delle configurazioni a sinistra, il risultato in grande a destra.
 *
 * Ogni monitor porta le proprie regole — quante pagine leggere, ogni quanto,
 * quando considerare un sito in allarme — perché un e-commerce e un sito
 * vetrina non si controllano allo stesso modo.
 */

interface WebsiteMonitorsTabProps {
  companyId: number;
  canManage?: boolean;
  fillHeight?: boolean;
}

function formatDateTime(value: string | null): string {
  if (!value) return "mai";
  return new Date(value).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });
}

const ORE = Array.from({ length: 24 }, (_, i) => ({
  value: String(i),
  label: `${String(i).padStart(2, "0")}:00`,
}));

export function WebsiteMonitorsTab({ companyId, canManage = false, fillHeight = false }: WebsiteMonitorsTabProps) {
  const toast = useToast();

  const [monitors, setMonitors] = useState<WebsiteMonitor[]>([]);
  const [websites, setWebsites] = useState<Website[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedTargetId, setSelectedTargetId] = useState<number | null>(null);
  const [running, setRunning] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<WebsiteMonitor | null>(null);
  const [form, setForm] = useState<MonitorSettings>(DEFAULT_MONITOR);
  const [siteIds, setSiteIds] = useState<number[]>([]);
  const [recipientIds, setRecipientIds] = useState<number[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<WebsiteMonitor | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, w, u] = await Promise.all([
        listMonitorsApi(companyId),
        listWebsitesApi({ companyId }),
        getUsersApi(companyId).catch(() => [] as User[]),
      ]);
      setMonitors(m);
      setWebsites(w);
      setUsers(u);
      setSelectedId((prec) => prec ?? m[0]?.id ?? null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore nel caricamento");
    } finally {
      setLoading(false);
    }
  }, [companyId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(
    () => monitors.find((m) => m.id === selectedId) ?? null,
    [monitors, selectedId]
  );

  const selectedTarget = useMemo(() => {
    if (!selected) return null;
    return selected.targets.find((t) => t.id === selectedTargetId) ?? selected.targets[0] ?? null;
  }, [selected, selectedTargetId]);

  const apriNuovo = () => {
    setForm(DEFAULT_MONITOR);
    setSiteIds([]);
    setRecipientIds([]);
    setEditing(null);
    setFormOpen(true);
  };

  const apriModifica = (m: WebsiteMonitor) => {
    const { id, company_id, client_name, last_run_at, next_run_at, targets, recipient_ids, created_at, ...impostazioni } = m;
    void id; void company_id; void client_name; void last_run_at; void next_run_at; void recipient_ids; void created_at;
    setForm(impostazioni);
    setSiteIds(targets.map((t) => t.website_id));
    setRecipientIds(m.recipient_ids);
    setEditing(m);
    setFormOpen(true);
  };

  const salva = async () => {
    if (!form.name.trim()) {
      toast.error("Dai un nome al monitoraggio");
      return;
    }
    if (siteIds.length === 0) {
      toast.error("Aggancia almeno un sito");
      return;
    }
    setSaving(true);
    try {
      const salvato = editing
        ? await updateMonitorApi(editing.id, { ...form, website_ids: siteIds, recipient_ids: recipientIds })
        : await createMonitorApi(companyId, { ...form, website_ids: siteIds, recipient_ids: recipientIds });
      setFormOpen(false);
      setEditing(null);
      await load();
      setSelectedId(salvato.id);
      toast.success(editing ? "Monitoraggio aggiornato" : "Monitoraggio creato");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Salvataggio non riuscito");
    } finally {
      setSaving(false);
    }
  };

  const elimina = async () => {
    if (!deleting) return;
    try {
      await deleteMonitorApi(deleting.id);
      setDeleting(null);
      if (selectedId === deleting.id) setSelectedId(null);
      await load();
      toast.success("Monitoraggio eliminato");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Eliminazione non riuscita");
    }
  };

  const esegui = async (soloTarget = false) => {
    if (!selected) return;
    setRunning(true);
    try {
      await runMonitorApi(selected.id, soloTarget ? (selectedTarget?.id ?? undefined) : undefined);
      await load();
      toast.success("Analisi completata");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Analisi non riuscita");
    } finally {
      setRunning(false);
    }
  };

  const websiteOptions = websites.map((w) => ({ id: w.id, label: websiteLabel(w) }));

  return (
    <div className={`flex flex-col ${fillHeight ? "h-full min-h-0" : ""}`}>
      <div className="mb-4 flex flex-none flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            className="mb-1 font-display font-bold tracking-tight text-ink dark:text-[#f4f4f7]"
            style={{ fontSize: "17px" }}
          >
            Monitoraggio siti
          </h2>
          <p className="max-w-[64ch] font-body text-[13px] text-muted dark:text-[#9999a0]">
            Ogni monitoraggio ha le sue regole e i suoi siti. La scansione è dall'esterno: mappa delle
            pagine, codici di risposta, redirect e qualità SEO, con il confronto sul giro precedente.
          </p>
        </div>
        {canManage && (
          <Button onClick={apriNuovo} leftIcon={<Icon name="plus" className="h-3.5 w-3.5" />}>
            Nuovo monitoraggio
          </Button>
        )}
      </div>

      <div className={`flex gap-4 ${fillHeight ? "min-h-0 flex-1" : ""}`}>
        {/* ── Sinistra: i monitoraggi ──────────────────────────────────── */}
        <div className="w-[300px] flex-none overflow-y-auto pr-1">
          {loading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="sp-skeleton h-20 rounded-xl border border-line dark:border-[#2a2a2e]" />
              ))}
            </div>
          ) : monitors.length === 0 ? (
            <div className="rounded-md border border-dashed border-line px-3 py-8 text-center text-[13px] text-muted dark:border-[#2a2a2e] dark:text-[#9999a0]">
              Nessun monitoraggio: crea la prima configurazione.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {monitors.map((m) => {
                const inAllarme = m.targets.filter((t) => t.is_alerting).length;
                const attivo = m.id === selectedId;
                return (
                  <button
                    type="button"
                    key={m.id}
                    onClick={() => {
                      setSelectedId(m.id);
                      setSelectedTargetId(null);
                    }}
                    className={`sp-pop-in flex flex-col gap-1.5 rounded-xl border p-3 text-left transition-colors ${
                      attivo
                        ? "border-brand-magenta bg-brand-magenta/5"
                        : "border-line bg-cream hover:border-brand-magenta/40 dark:border-[#2a2a2e] dark:bg-[#1c1c20]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="min-w-0 truncate text-[13.5px] font-bold text-ink dark:text-[#f4f4f7]"
                        title={m.name}
                      >
                        {m.name}
                      </span>
                      <span
                        className={`h-2 w-2 flex-none rounded-full ${m.is_active ? "bg-success" : "bg-muted/40"}`}
                        title={m.is_active ? "Attivo" : "In pausa"}
                      />
                    </div>
                    <span className="truncate text-[11.5px] text-muted dark:text-[#9999a0]">
                      {m.targets.length} {m.targets.length === 1 ? "sito" : "siti"} ·{" "}
                      {intervalLabel(m.interval_hours).toLowerCase()} · {m.max_pages} pagine
                    </span>
                    <div className="flex items-center gap-2 text-[10.5px] text-muted dark:text-[#9999a0]">
                      <span>ultimo {formatDateTime(m.last_run_at)}</span>
                      {inAllarme > 0 && (
                        <span className="ml-auto inline-flex items-center gap-1 font-semibold text-danger">
                          <Icon name="alert-triangle" className="h-3 w-3" /> {inAllarme}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Destra: il risultato ─────────────────────────────────────── */}
        <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-line bg-paper p-4 dark:border-[#2a2a2e] dark:bg-[#131316]">
          {!selected ? (
            <p className="py-12 text-center text-[13px] text-muted dark:text-[#9999a0]">
              Scegli un monitoraggio a sinistra per vederne i risultati.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3 dark:border-[#2a2a2e]">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-bold text-ink dark:text-[#f4f4f7]">
                    {selected.name}
                  </p>
                  <p className="text-[11.5px] text-muted dark:text-[#9999a0]">
                    {intervalLabel(selected.interval_hours)}
                    {selected.run_hour != null && ` alle ${String(selected.run_hour).padStart(2, "0")}:00`}
                    {" · fino a "}
                    {selected.max_pages} pagine per sito
                    {" · prossimo giro "}
                    {formatDateTime(selected.next_run_at)}
                  </p>
                </div>
                <div className="flex flex-none items-center gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => void esegui(false)}
                    loading={running}
                    leftIcon={<Icon name="refresh-cw" className="h-3.5 w-3.5" />}
                  >
                    Analizza tutti
                  </Button>
                  {canManage && (
                    <>
                      <button
                        type="button"
                        onClick={() => apriModifica(selected)}
                        title="Modifica il monitoraggio"
                        aria-label="Modifica"
                        className="inline-grid h-8 w-8 place-items-center rounded-md border border-line text-ink transition-colors hover:bg-cream dark:border-[#2a2a2e] dark:text-[#f4f4f7] dark:hover:bg-[#1c1c20]"
                      >
                        <Icon name="pencil" className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleting(selected)}
                        title="Elimina il monitoraggio"
                        aria-label="Elimina"
                        className="inline-grid h-8 w-8 place-items-center rounded-md border border-danger/20 bg-danger/5 text-danger transition-colors hover:bg-danger/10"
                      >
                        <Icon name="trash" className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Siti del monitoraggio: schede cliccabili */}
              {selected.targets.length > 1 && (
                <div className="flex flex-wrap gap-1.5">
                  {selected.targets.map((t) => {
                    const attivo = t.id === selectedTarget?.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setSelectedTargetId(t.id)}
                        className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] transition-colors ${
                          attivo
                            ? "border-brand-magenta bg-brand-magenta/5 text-ink dark:text-[#f4f4f7]"
                            : "border-line bg-cream text-muted hover:border-brand-magenta/40 dark:border-[#2a2a2e] dark:bg-[#1c1c20] dark:text-[#9999a0]"
                        }`}
                      >
                        {t.is_alerting && <Icon name="alert-triangle" className="h-3 w-3 text-danger" />}
                        {t.is_paused && <Icon name="minus" className="h-3 w-3" />}
                        <span className="max-w-[160px] truncate">{t.website_name}</span>
                        {t.avg_seo_score != null && (
                          <span className="tabular-nums opacity-70">{t.avg_seo_score}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {selected.targets.length === 0 ? (
                <p className="rounded-md border border-dashed border-line px-4 py-8 text-center text-[13px] text-muted dark:border-[#2a2a2e] dark:text-[#9999a0]">
                  Nessun sito agganciato a questo monitoraggio.
                </p>
              ) : selectedTarget ? (
                <WebsiteMonitorReport
                  key={`${selectedTarget.id}-${selectedTarget.last_crawl_id ?? 0}`}
                  monitor={selected}
                  target={selectedTarget}
                  running={running}
                  onRun={() => void esegui(true)}
                />
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* ── Configurazione ───────────────────────────────────────────────── */}
      <Modal
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        title={editing ? "Modifica monitoraggio" : "Nuovo monitoraggio"}
        icon={<Icon name="activity" className="h-5 w-5" />}
        size="lg"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setFormOpen(false);
                setEditing(null);
              }}
            >
              Annulla
            </Button>
            <Button onClick={() => void salva()} loading={saving}>
              Salva
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              label="Nome"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="es. Siti vetrina — controllo settimanale"
            />
            <div className="flex items-end pb-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-ink dark:text-paper">
                <Checkbox
                  checked={form.is_active}
                  onChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
                />
                Attivo
              </label>
            </div>
          </div>

          <MultiSelect
            label="Siti da controllare"
            value={siteIds}
            onChange={setSiteIds}
            options={websiteOptions}
            placeholder="Scegli i siti..."
          />

          {/* — Quando — */}
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
              Quando
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
                  Cadenza
                </label>
                <SearchableSelect
                  value={String(form.interval_hours)}
                  onChange={(v) => setForm((f) => ({ ...f, interval_hours: Number(v) }))}
                  options={INTERVAL_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))}
                  showAvatar={false}
                  menuLayer="portal"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
                  A che ora
                </label>
                <SearchableSelect
                  value={form.run_hour != null ? String(form.run_hour) : ""}
                  onChange={(v) => setForm((f) => ({ ...f, run_hour: v === "" ? null : Number(v) }))}
                  options={[{ value: "", label: "Appena scade la cadenza" }, ...ORE]}
                  showAvatar={false}
                  menuLayer="portal"
                />
              </div>
            </div>
          </div>

          {/* — Cosa analizzare — */}
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
              Cosa analizzare
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Input
                label="Pagine per sito"
                value={String(form.max_pages)}
                onChange={(e) =>
                  setForm((f) => ({ ...f, max_pages: Number(e.target.value.replace(/\D/g, "")) || 0 }))
                }
              />
              <Input
                label="Pausa fra richieste (ms)"
                value={String(form.request_delay_ms)}
                onChange={(e) =>
                  setForm((f) => ({ ...f, request_delay_ms: Number(e.target.value.replace(/\D/g, "")) || 0 }))
                }
              />
              <Input
                label="User-agent (facoltativo)"
                value={form.user_agent ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, user_agent: e.target.value || null }))}
                placeholder="Lascia vuoto per il nostro bot"
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
              {([
                ["use_sitemap", "Usa la sitemap"],
                ["crawl_fallback", "Esplora dalla home se la sitemap è povera"],
                ["respect_robots", "Rispetta robots.txt"],
                ["check_seo", "Calcola il punteggio SEO"],
                ["check_broken_links", "Cerca i link interni rotti"],
              ] as const).map(([campo, etichetta]) => (
                <label key={campo} className="flex cursor-pointer items-center gap-2 text-[13px] text-ink dark:text-paper">
                  <Checkbox
                    checked={form[campo]}
                    onChange={(v) => setForm((f) => ({ ...f, [campo]: v }))}
                  />
                  {etichetta}
                </label>
              ))}
            </div>
            <p className="mt-1.5 text-[11.5px] text-muted dark:text-muted-dark">
              La pausa fra richieste protegge i siti fragili: 500 ms sono due richieste al secondo.
              Alzala se un hosting inizia a rispondere con errori.
            </p>
          </div>

          {/* — Quando avvisare — */}
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
              Quando considerare il sito in allarme
            </p>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {([
                ["alert_on_errors", "Ci sono pagine che non rispondono"],
                ["alert_on_noindex", "Una pagina è uscita dai motori di ricerca"],
                ["alert_on_disappeared", "Una pagina è sparita"],
                ["alert_on_redirects", "Una pagina ha iniziato a reindirizzare"],
              ] as const).map(([campo, etichetta]) => (
                <label key={campo} className="flex cursor-pointer items-center gap-2 text-[13px] text-ink dark:text-paper">
                  <Checkbox
                    checked={form[campo]}
                    onChange={(v) => setForm((f) => ({ ...f, [campo]: v }))}
                  />
                  {etichetta}
                </label>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                label="Soglia SEO media (facoltativa)"
                value={form.seo_min_score != null ? String(form.seo_min_score) : ""}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "");
                  setForm((f) => ({ ...f, seo_min_score: v ? Number(v) : null }));
                }}
                placeholder="es. 70"
              />
              <Input
                label="Pagine lente oltre (ms)"
                value={form.max_response_ms != null ? String(form.max_response_ms) : ""}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "");
                  setForm((f) => ({ ...f, max_response_ms: v ? Number(v) : null }));
                }}
                placeholder="es. 2000"
              />
            </div>
            <p className="mt-1.5 text-[11.5px] text-muted dark:text-muted-dark">
              Gli errori del monitoraggio stesso — crawler respinto, giro fallito — non generano
              avvisi: si vedono qui nel pannello.
            </p>
          </div>

          {/* — Chi avvisare — */}
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
              Chi avvisare
            </p>
            <MultiSelect
              label="Destinatari"
              value={recipientIds}
              onChange={setRecipientIds}
              options={users.map((u) => ({ id: u.id, label: u.full_name || u.username }))}
              placeholder="Nessuno: gli allarmi restano solo nel pannello"
            />
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
              <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink dark:text-paper">
                <Checkbox
                  checked={form.notify_in_app}
                  onChange={(v) => setForm((f) => ({ ...f, notify_in_app: v }))}
                />
                Notifica nel centro notifiche
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink dark:text-paper">
                <Checkbox
                  checked={form.notify_push}
                  onChange={(v) => setForm((f) => ({ ...f, notify_push: v }))}
                />
                Notifica push
              </label>
            </div>
            <p className="mt-1.5 text-[11.5px] text-muted dark:text-muted-dark">
              L'avviso parte quando un problema nasce o cambia, e quando il sito rientra — non a
              ogni giro: un monitoraggio settimanale che ripete lo stesso avviso smette di essere letto.
            </p>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Eliminare questo monitoraggio?"
        icon={<Icon name="trash" className="h-5 w-5" />}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)}>
              Annulla
            </Button>
            <Button variant="danger" onClick={() => void elimina()}>
              Elimina
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink dark:text-paper">
          <strong>{deleting?.name}</strong> e i suoi risultati verranno eliminati. Le scansioni già
          fatte restano nello storico dei siti.
        </p>
      </Modal>
    </div>
  );
}
