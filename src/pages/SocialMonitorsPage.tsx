import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageSectionHeader } from "../components/ui/PageSectionHeader";
import { Icon } from "../components/ui/Icon";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { Checkbox } from "../components/ui/Checkbox";
import { SearchableSelect } from "../components/ui/SearchableSelect";
import { FieldHelpPopover } from "../components/ui/FieldHelpPopover";
import { SocialIcon } from "../components/social/SocialIcon";
import { useAuth } from "../hooks/useAuth";
import { useSelectedCompanyId } from "../hooks/useSelectedCompanyId";
import { useToast } from "../context/ToastContext";
import { listClientOptionsApi } from "../api/clients";
import { getUsersApi, type User } from "../api/users";
import { listSocialProfilesApi, type SocialProfile } from "../api/socialProfiles";
import {
  createMonitorApi,
  deleteMonitorApi,
  listMonitorsApi,
  runMonitorNowApi,
  updateMonitorApi,
  type SocialMonitor,
} from "../api/socialMonitors";
import { MonitorDetail } from "../features/social-monitoring/MonitorDetail";

interface FormState {
  name: string;
  client_id: string; // "" = nessuno
  social_profile_ids: number[];
  recipient_user_ids: number[];
  interval_hours: string;
  reminder_interval_days: string;
  analysis_depth: string;
  fetch_insights: boolean;
  check_posts: boolean;
  check_carousels: boolean;
  check_reels: boolean;
  check_stories: boolean;
  posts_inactivity_days: string;
  carousels_inactivity_days: string;
  reels_inactivity_days: string;
  stories_inactivity_days: string;
  notify_in_app: boolean;
  notify_push: boolean;
  is_active: boolean;
  auto_disable_date: string; // "YYYY-MM-DD"; "" = nessuna auto-disattivazione
}

const EMPTY_FORM: FormState = {
  name: "",
  client_id: "",
  social_profile_ids: [],
  recipient_user_ids: [],
  interval_hours: "24",
  reminder_interval_days: "3",
  analysis_depth: "10",
  fetch_insights: true,
  check_posts: true,
  check_carousels: true,
  check_reels: true,
  check_stories: false,
  posts_inactivity_days: "7",
  carousels_inactivity_days: "7",
  reels_inactivity_days: "7",
  stories_inactivity_days: "1",
  notify_in_app: true,
  notify_push: true,
  is_active: true,
  auto_disable_date: "",
};

/** Data → stringa "YYYY-MM-DD" locale (per l'input date). */
function toDateInput(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const HELP = {
  name: {
    title: "Nome",
    shortText: "Etichetta del monitoraggio",
    longText: "Un nome per riconoscere questa configurazione (es. il cliente o la campagna).",
  },
  client: {
    title: "Cliente",
    shortText: "Monitora tutte le pagine del cliente",
    longText:
      "Se scegli un cliente, vengono controllate automaticamente TUTTE le sue pagine social. In alternativa (o in aggiunta) puoi selezionare pagine singole qui sotto.",
  },
  pages: {
    title: "Pagine da monitorare",
    shortText: "Le pagine social controllate",
    longText:
      "Seleziona una o più pagine da tenere d'occhio. Se hai scelto un cliente, le sue pagine sono già incluse: qui puoi aggiungerne altre.",
  },
  interval: {
    title: "Frequenza di controllo",
    shortText: "Ogni quante ore girano i controlli",
    longText:
      "Con quale frequenza il sistema legge le pagine (es. 24 = una volta al giorno). Le storie durano 24h: per intercettarle serve un valore basso (poche ore).",
  },
  reminder: {
    title: "Promemoria",
    shortText: "Ogni quanti giorni ripetere l'avviso",
    longText:
      "Quando una pagina è in ritardo, ogni quanti giorni ricordartelo di nuovo finché non torna a pubblicare.",
  },
  depth: {
    title: "Post da leggere",
    shortText: "Quanti contenuti analizzare per pagina",
    longText:
      "Quanti contenuti recenti leggere a ogni controllo. Più alto = più storico per i grafici, ma più chiamate alle API.",
  },
  content: {
    title: "Contenuti e soglie",
    shortText: "Cosa controllare e dopo quanti giorni avvisare",
    longText:
      "Scegli quali tipi controllare (Post, Reel, Storie) e, per ciascuno, dopo quanti giorni senza pubblicare far scattare l'avviso. Le storie sono effimere: si rilevano solo se ancora attive (24h).",
  },
  insights: {
    title: "Insight",
    shortText: "Leggere like / reach",
    longText:
      "Se attivo, legge anche like, commenti e reach dei contenuti (dove disponibili). Aggiunge chiamate alle API.",
  },
  active: {
    title: "Attivo",
    shortText: "Il monitor è in funzione",
    longText: "Se disattivato, la configurazione resta salvata ma non viene eseguita né manda avvisi. Puoi disattivarlo/riattivarlo manualmente in qualsiasi momento (solo PM/admin).",
  },
  autoDisable: {
    title: "Auto-disattivazione",
    shortText: "Spegni il monitor a una data",
    longText: "Scegli dal calendario la data in cui il monitor si disattiva da solo (utile per campagne a termine). Il pulsante » accanto al campo apre le scorciatoie per spostare la data avanti. Vuoto = non si disattiva mai.",
  },
  recipients: {
    title: "Destinatari",
    shortText: "Chi riceve gli avvisi",
    longText:
      "Le persone che ricevono le notifiche in-app e push quando una pagina non pubblica da troppo tempo.",
  },
};

export function SocialMonitorsPage() {
  const toast = useToast();
  const { user, activeCompanyId } = useAuth();
  const { selectedCompanyId } = useSelectedCompanyId(activeCompanyId ?? user?.company_id ?? null);
  const companyId = selectedCompanyId ?? activeCompanyId ?? user?.company_id ?? null;

  const [monitors, setMonitors] = useState<SocialMonitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [clients, setClients] = useState<Array<{ id: number; name: string }>>([]);
  const [profiles, setProfiles] = useState<SocialProfile[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SocialMonitor | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pageSearch, setPageSearch] = useState("");

  const [deleting, setDeleting] = useState<SocialMonitor | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const selected = useMemo(() => monitors.find((m) => m.id === selectedId) ?? null, [monitors, selectedId]);

  // Mantiene una selezione valida: se sparisce, ripiega sul primo.
  useEffect(() => {
    if (monitors.length === 0) {
      setSelectedId(null);
      return;
    }
    setSelectedId((cur) => (cur != null && monitors.some((m) => m.id === cur) ? cur : monitors[0].id));
  }, [monitors]);

  const refetch = useCallback(async () => {
    if (companyId == null) return;
    try {
      setError(null);
      setMonitors(await listMonitorsApi(companyId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel caricamento dei monitor");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    setLoading(true);
    void refetch();
  }, [refetch]);

  useEffect(() => {
    if (companyId == null) return;
    listClientOptionsApi(companyId).then(setClients).catch(() => setClients([]));
    listSocialProfilesApi({ companyId }).then(setProfiles).catch(() => setProfiles([]));
    getUsersApi(companyId).then(setUsers).catch(() => setUsers([]));
  }, [companyId]);

  const clientOptions = useMemo(
    () => [{ value: "", label: "Nessun cliente" }, ...clients.map((c) => ({ value: String(c.id), label: c.name }))],
    [clients]
  );

  const filteredProfiles = useMemo(() => {
    const q = pageSearch.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter((p) => `${p.name} ${p.url} ${p.platform}`.toLowerCase().includes(q));
  }, [profiles, pageSearch]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setPageSearch("");
    setModalOpen(true);
  };

  const openEdit = (m: SocialMonitor) => {
    setEditing(m);
    setForm({
      name: m.name,
      client_id: m.client_id != null ? String(m.client_id) : "",
      social_profile_ids: m.targets.map((t) => t.social_profile_id),
      recipient_user_ids: m.recipients.map((r) => r.user_id),
      interval_hours: String(m.interval_hours),
      reminder_interval_days: String(m.reminder_interval_days),
      analysis_depth: String(m.analysis_depth),
      fetch_insights: m.fetch_insights,
      check_posts: m.check_posts,
      check_carousels: m.check_carousels,
      check_reels: m.check_reels,
      check_stories: m.check_stories,
      posts_inactivity_days: String(m.posts_inactivity_days),
      carousels_inactivity_days: String(m.carousels_inactivity_days),
      reels_inactivity_days: String(m.reels_inactivity_days),
      stories_inactivity_days: String(m.stories_inactivity_days),
      notify_in_app: m.notify_in_app,
      notify_push: m.notify_push,
      is_active: m.is_active,
      auto_disable_date: m.auto_disable_at ? toDateInput(new Date(m.auto_disable_at)) : "",
    });
    setFormError(null);
    setPageSearch("");
    setModalOpen(true);
  };

  // Deep-link: ?monitor=<id> seleziona, ?edit=<id> apre la modifica (dal task/notifiche).
  const [searchParams, setSearchParams] = useSearchParams();
  const [deepLinkDone, setDeepLinkDone] = useState(false);
  useEffect(() => {
    if (deepLinkDone || monitors.length === 0) return;
    const editId = searchParams.get("edit");
    const monId = searchParams.get("monitor");
    const target = editId ?? monId;
    if (!target) return;
    const m = monitors.find((x) => String(x.id) === target);
    if (m) {
      setSelectedId(m.id);
      if (editId) openEdit(m);
    }
    setDeepLinkDone(true);
    const next = new URLSearchParams(searchParams);
    next.delete("edit");
    next.delete("monitor");
    setSearchParams(next, { replace: true });
  }, [monitors, searchParams, deepLinkDone]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleProfile = (id: number) =>
    setForm((f) => ({
      ...f,
      social_profile_ids: f.social_profile_ids.includes(id)
        ? f.social_profile_ids.filter((x) => x !== id)
        : [...f.social_profile_ids, id],
    }));

  const toggleRecipient = (id: number) =>
    setForm((f) => ({
      ...f,
      recipient_user_ids: f.recipient_user_ids.includes(id)
        ? f.recipient_user_ids.filter((x) => x !== id)
        : [...f.recipient_user_ids, id],
    }));

  const handleSave = async () => {
    if (companyId == null) return;
    if (!form.name.trim()) {
      setFormError("Il nome è obbligatorio");
      return;
    }
    if (!form.client_id && form.social_profile_ids.length === 0) {
      setFormError("Seleziona un cliente oppure almeno una pagina social");
      return;
    }
    setSaving(true);
    setFormError(null);
    const payload = {
      name: form.name.trim(),
      client_id: form.client_id ? Number(form.client_id) : null,
      social_profile_ids: form.social_profile_ids,
      recipient_user_ids: form.recipient_user_ids,
      interval_hours: Number(form.interval_hours) || 24,
      default_inactivity_days: Number(form.posts_inactivity_days) || 7,
      reminder_interval_days: Number(form.reminder_interval_days) || 3,
      analysis_depth: Number(form.analysis_depth) || 10,
      fetch_insights: form.fetch_insights,
      check_posts: form.check_posts,
      check_carousels: form.check_carousels,
      check_reels: form.check_reels,
      check_stories: form.check_stories,
      posts_inactivity_days: Number(form.posts_inactivity_days) || 7,
      carousels_inactivity_days: Number(form.carousels_inactivity_days) || 7,
      reels_inactivity_days: Number(form.reels_inactivity_days) || 7,
      stories_inactivity_days: Number(form.stories_inactivity_days) || 1,
      notify_in_app: form.notify_in_app,
      notify_push: form.notify_push,
      is_active: form.is_active,
      auto_disable_at: form.auto_disable_date
        ? new Date(`${form.auto_disable_date}T23:59:59`).toISOString()
        : null,
    };
    try {
      if (editing) {
        await updateMonitorApi(editing.id, payload);
        toast.success("Monitor aggiornato");
      } else {
        await createMonitorApi({ company_id: companyId, ...payload });
        toast.success("Monitor creato");
      }
      setModalOpen(false);
      setEditing(null);
      await refetch();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Errore nel salvataggio");
    } finally {
      setSaving(false);
    }
  };

  const handleRun = async (m: SocialMonitor) => {
    setBusyId(m.id);
    try {
      const updated = await runMonitorNowApi(m.id);
      setMonitors((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      toast.success(`«${m.name}» eseguito`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore nell'esecuzione");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setBusyId(deleting.id);
    try {
      await deleteMonitorApi(deleting.id);
      toast.success("Monitor eliminato");
      setDeleting(null);
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore nell'eliminazione");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="px-6 py-8 mx-auto w-full h-full flex flex-col min-h-0 animate-fadeIn">
      <PageSectionHeader
        icon={<Icon name="activity" className="w-6 h-6" />}
        title="Monitoraggio social"
        lead="Configurazioni di revisione: controlla che i profili social pubblichino con regolarità e ricevi un avviso quando non lo fanno."
        actions={
          <Button variant="primary" onClick={openCreate} leftIcon={<Icon name="plus" className="w-3.5 h-3.5" />}>
            Nuovo monitor
          </Button>
        }
      />

      {error && (
        <div className="mb-4 flex-none rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</div>
      )}

      <div className="flex min-h-0 flex-1 gap-4">
        {/* Colonna sinistra: lista dei monitoraggi (cliccabile) */}
        <div className="w-[300px] flex-none overflow-y-auto pr-1">
          {loading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="sp-skeleton h-20 rounded-xl border border-line dark:border-[#2a2a2e]" />
              ))}
            </div>
          ) : monitors.length === 0 ? (
            <div className="rounded-md border border-dashed border-line px-3 py-8 text-center text-[13px] text-muted dark:border-[#2a2a2e] dark:text-[#9999a0]">
              Nessun monitor: crea la prima configurazione.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {monitors.map((m) => {
                const alerting = m.targets.filter((t) => t.is_alerting).length;
                const active = m.id === selectedId;
                return (
                  <button
                    type="button"
                    key={m.id}
                    onClick={() => setSelectedId(m.id)}
                    className={`sp-pop-in flex flex-col gap-1.5 rounded-xl border p-3 text-left transition-colors ${
                      active
                        ? "border-brand-magenta bg-brand-magenta/5"
                        : "border-line bg-cream hover:border-brand-magenta/40 dark:border-[#2a2a2e] dark:bg-[#1c1c20]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-[13.5px] font-bold text-ink dark:text-[#f4f4f7]" title={m.name}>
                        {m.name}
                      </span>
                      <span
                        className={`h-2 w-2 flex-none rounded-full ${m.is_active ? "bg-success" : "bg-muted/40"}`}
                        title={m.is_active ? "Attivo" : "In pausa"}
                      />
                    </div>
                    <span className="truncate text-[11.5px] text-muted dark:text-[#9999a0]">
                      {m.client_name ? m.client_name : `${m.targets.length} pagine`}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {m.targets.slice(0, 4).map((t) => (
                        <SocialIcon key={t.id} platform={t.platform ?? ""} className="h-4 w-4" />
                      ))}
                      {m.targets.length > 4 && (
                        <span className="text-[10px] text-muted dark:text-[#9999a0]">+{m.targets.length - 4}</span>
                      )}
                      {alerting > 0 && (
                        <span className="ml-auto inline-flex items-center gap-1 text-[10.5px] font-semibold text-danger">
                          <Icon name="alert-triangle" className="h-3 w-3" /> {alerting}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Colonna destra: risultati del monitoraggio selezionato */}
        <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-line bg-paper p-4 dark:border-[#2a2a2e] dark:bg-[#131316]">
          {selected ? (
            <MonitorDetail
              key={selected.id}
              monitor={selected}
              running={busyId === selected.id}
              onRun={() => handleRun(selected)}
              onEdit={() => openEdit(selected)}
              onDelete={() => setDeleting(selected)}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-[13px] text-muted dark:text-[#9999a0]">
              {loading ? "Caricamento…" : "Seleziona un monitoraggio dalla lista per vederne i risultati."}
            </div>
          )}
        </div>
      </div>

      {/* ── Modal crea/modifica ──────────────────────────────────────────── */}
      <Modal
        open={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title={editing ? "Modifica monitor" : "Nuovo monitor"}
        description="Scegli un cliente (tutte le sue pagine) oppure seleziona le pagine, poi le regole e i destinatari."
        size="xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)} disabled={saving}>
              Annulla
            </Button>
            <Button variant="primary" onClick={handleSave} loading={saving}>
              Salva
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {formError && (
            <div className="rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">{formError}</div>
          )}

          <div className="flex flex-col gap-1.5">
            <span className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
              Nome <FieldHelpPopover {...HELP.name} />
            </span>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="es. Pubblicazioni Hotel Atlantic"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
              Cliente (opzionale) <FieldHelpPopover {...HELP.client} />
            </label>
            <SearchableSelect
              value={form.client_id}
              onChange={(v) =>
                setForm((f) => {
                  if (!v) return { ...f, client_id: v };
                  // Pre-compila le pagine del cliente; restano deselezionabili.
                  const clientPages = profiles.filter((p) => String(p.client_id) === v).map((p) => p.id);
                  return {
                    ...f,
                    client_id: v,
                    social_profile_ids: Array.from(new Set([...f.social_profile_ids, ...clientPages])),
                  };
                })
              }
              options={clientOptions}
              placeholder="Nessun cliente"
              menuLayer="portal"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
              Pagine da monitorare {form.social_profile_ids.length > 0 && `(${form.social_profile_ids.length})`}
              <FieldHelpPopover {...HELP.pages} />
            </label>
            <Input value={pageSearch} onChange={(e) => setPageSearch(e.target.value)} placeholder="Cerca pagina..." />
            <div className="max-h-52 overflow-y-auto rounded-md border border-line dark:border-[#2a2a2e]">
              {filteredProfiles.length === 0 ? (
                <div className="px-3 py-4 text-[12.5px] text-muted dark:text-[#9999a0]">Nessuna pagina.</div>
              ) : (
                filteredProfiles.map((p) => (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => toggleProfile(p.id)}
                    className="flex w-full items-center gap-2.5 border-b border-line/60 px-3 py-2 text-left transition-colors last:border-0 hover:bg-cream dark:border-[#2a2a2e] dark:hover:bg-[#131316]"
                  >
                    <Checkbox checked={form.social_profile_ids.includes(p.id)} onChange={() => toggleProfile(p.id)} />
                    <SocialIcon platform={p.platform} className="h-5 w-5" />
                    <span className="min-w-0 flex-1 truncate text-[13px] text-ink dark:text-[#f4f4f7]">
                      {p.name || p.url}
                    </span>
                    {p.client_name && (
                      <span className="truncate text-[11px] text-muted dark:text-[#9999a0]">{p.client_name}</span>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <span className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
                Ogni (ore) <FieldHelpPopover {...HELP.interval} />
              </span>
              <Input
                type="number"
                min={1}
                value={form.interval_hours}
                onChange={(e) => setForm((f) => ({ ...f, interval_hours: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
                Promemoria (gg) <FieldHelpPopover {...HELP.reminder} />
              </span>
              <Input
                type="number"
                min={1}
                value={form.reminder_interval_days}
                onChange={(e) => setForm((f) => ({ ...f, reminder_interval_days: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
                Post da leggere <FieldHelpPopover {...HELP.depth} />
              </span>
              <Input
                type="number"
                min={1}
                value={form.analysis_depth}
                onChange={(e) => setForm((f) => ({ ...f, analysis_depth: e.target.value }))}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-lg border border-line p-3 dark:border-[#2a2a2e]">
            <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
              Contenuti da controllare · avviso se non pubblica da (giorni)
              <FieldHelpPopover {...HELP.content} />
            </p>
            <div className="flex items-center gap-3">
              <label className="flex w-36 items-center gap-2 text-[13px] text-ink dark:text-[#f4f4f7]">
                <Checkbox checked={form.check_posts} onChange={(c) => setForm((f) => ({ ...f, check_posts: c }))} />
                Post (feed)
              </label>
              <Input
                type="number"
                min={1}
                value={form.posts_inactivity_days}
                onChange={(e) => setForm((f) => ({ ...f, posts_inactivity_days: e.target.value }))}
                disabled={!form.check_posts}
                className="w-24"
              />
            </div>
            <div className="flex items-center gap-3">
              <label className="flex w-36 items-center gap-2 text-[13px] text-ink dark:text-[#f4f4f7]">
                <Checkbox checked={form.check_carousels} onChange={(c) => setForm((f) => ({ ...f, check_carousels: c }))} />
                Carosello
              </label>
              <Input
                type="number"
                min={1}
                value={form.carousels_inactivity_days}
                onChange={(e) => setForm((f) => ({ ...f, carousels_inactivity_days: e.target.value }))}
                disabled={!form.check_carousels}
                className="w-24"
              />
            </div>
            <div className="flex items-center gap-3">
              <label className="flex w-36 items-center gap-2 text-[13px] text-ink dark:text-[#f4f4f7]">
                <Checkbox checked={form.check_reels} onChange={(c) => setForm((f) => ({ ...f, check_reels: c }))} />
                Reel
              </label>
              <Input
                type="number"
                min={1}
                value={form.reels_inactivity_days}
                onChange={(e) => setForm((f) => ({ ...f, reels_inactivity_days: e.target.value }))}
                disabled={!form.check_reels}
                className="w-24"
              />
            </div>
            <div className="flex items-center gap-3">
              <label className="flex w-36 items-center gap-2 text-[13px] text-ink dark:text-[#f4f4f7]">
                <Checkbox checked={form.check_stories} onChange={(c) => setForm((f) => ({ ...f, check_stories: c }))} />
                Storie
              </label>
              <Input
                type="number"
                min={1}
                value={form.stories_inactivity_days}
                onChange={(e) => setForm((f) => ({ ...f, stories_inactivity_days: e.target.value }))}
                disabled={!form.check_stories}
                className="w-24"
              />
              <span className="text-[11px] text-muted dark:text-[#9999a0]">effimere: rilevate solo se attive (24h)</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-1">
              <label className="flex items-center gap-2 text-[13px] text-ink dark:text-[#f4f4f7]">
                <Checkbox checked={form.fetch_insights} onChange={(c) => setForm((f) => ({ ...f, fetch_insights: c }))} />
                Leggi insight (like/reach)
              </label>
              <FieldHelpPopover {...HELP.insights} />
            </div>
            <label className="flex items-center gap-2 text-[13px] text-ink dark:text-[#f4f4f7]">
              <Checkbox checked={form.notify_in_app} onChange={(c) => setForm((f) => ({ ...f, notify_in_app: c }))} />
              Avvisi in-app
            </label>
            <label className="flex items-center gap-2 text-[13px] text-ink dark:text-[#f4f4f7]">
              <Checkbox checked={form.notify_push} onChange={(c) => setForm((f) => ({ ...f, notify_push: c }))} />
              Push
            </label>
            <div className="flex items-center gap-1">
              <label className="flex items-center gap-2 text-[13px] text-ink dark:text-[#f4f4f7]">
                <Checkbox checked={form.is_active} onChange={(c) => setForm((f) => ({ ...f, is_active: c }))} />
                Attivo
              </label>
              <FieldHelpPopover {...HELP.active} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
              Disattiva automaticamente il <FieldHelpPopover {...HELP.autoDisable} />
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-52">
                <Input
                  type="date"
                  value={form.auto_disable_date}
                  onChange={(e) => setForm((f) => ({ ...f, auto_disable_date: e.target.value }))}
                  onPostpone={(iso) => setForm((f) => ({ ...f, auto_disable_date: iso }))}
                />
              </div>
              {form.auto_disable_date && (
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, auto_disable_date: "" }))}
                  className="text-[11.5px] font-semibold text-brand-magenta hover:underline"
                >
                  Azzera (mai)
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
              Destinatari avvisi {form.recipient_user_ids.length > 0 && `(${form.recipient_user_ids.length})`}
              <FieldHelpPopover {...HELP.recipients} />
            </label>
            <div className="max-h-40 overflow-y-auto rounded-md border border-line dark:border-[#2a2a2e]">
              {users.length === 0 ? (
                <div className="px-3 py-4 text-[12.5px] text-muted dark:text-[#9999a0]">Nessun utente.</div>
              ) : (
                users.map((u) => (
                  <button
                    type="button"
                    key={u.id}
                    onClick={() => toggleRecipient(u.id)}
                    className="flex w-full items-center gap-2.5 border-b border-line/60 px-3 py-2 text-left transition-colors last:border-0 hover:bg-cream dark:border-[#2a2a2e] dark:hover:bg-[#131316]"
                  >
                    <Checkbox checked={form.recipient_user_ids.includes(u.id)} onChange={() => toggleRecipient(u.id)} />
                    <span className="min-w-0 flex-1 truncate text-[13px] text-ink dark:text-[#f4f4f7]">
                      {u.full_name || u.username}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      </Modal>

      {/* ── Modal elimina ────────────────────────────────────────────────── */}
      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Elimina monitor"
        description="La configurazione e il suo storico verranno eliminati. L'operazione non è reversibile."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)} disabled={busyId === deleting?.id}>
              Annulla
            </Button>
            <Button variant="danger" onClick={handleDelete} loading={busyId === deleting?.id}>
              Elimina
            </Button>
          </>
        }
      >
        <p className="font-body text-sm text-ink dark:text-[#f4f4f7]">
          Sei sicuro di voler eliminare <strong>{deleting?.name}</strong>?
        </p>
      </Modal>
    </div>
  );
}
