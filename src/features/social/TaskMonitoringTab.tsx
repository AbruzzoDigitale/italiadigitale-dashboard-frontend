import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { Badge } from "../../components/ui/Badge";
import { Checkbox } from "../../components/ui/Checkbox";
import { SocialIcon } from "../../components/social/SocialIcon";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import { SOCIAL_PLATFORM_LABELS } from "../../api/socialProfiles";
import { useToast } from "../../context/ToastContext";
import {
  getMonitorForWorkItemApi,
  listMonitorsApi,
  runMonitorNowApi,
  suggestMonitorFromWorkItemApi,
  updateMonitorApi,
  type SocialMonitor,
} from "../../api/socialMonitors";
import { ProfileFeed } from "./ProfileFeed";
import { PaceIndicator } from "./PaceIndicator";

function fmtDateTime(v: string | null): string {
  if (!v) return "—";
  return new Date(v).toLocaleString("it-IT", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

const CHIP: Record<string, string> = {
  post: "bg-brand-magenta/10 text-brand-magenta",
  carousel: "bg-violet-500/10 text-violet-500",
  reel: "bg-brand-cyan/10 text-brand-cyan",
  story: "bg-warning/10 text-warning",
};

interface Props {
  workItemId: number;
  companyId: number | null;
  clientId: number | null;
  isManager: boolean;
  hasPedConfig: boolean;
}

export function TaskMonitoringTab({ workItemId, companyId, clientId, isManager, hasPedConfig }: Props) {
  const toast = useToast();
  const navigate = useNavigate();
  const [monitor, setMonitor] = useState<SocialMonitor | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [paceRefresh, setPaceRefresh] = useState(0);

  // Picker per collegare un monitor esistente.
  const [linking, setLinking] = useState(false);
  const [available, setAvailable] = useState<SocialMonitor[]>([]);
  const [pick, setPick] = useState<string>("");

  const load = useCallback(async () => {
    try {
      setMonitor(await getMonitorForWorkItemApi(workItemId));
    } catch {
      setMonitor(null);
    }
  }, [workItemId]);

  useEffect(() => {
    void load();
  }, [load]);

  const openLink = async () => {
    setLinking(true);
    if (companyId != null) {
      try {
        const rows = await listMonitorsApi(companyId);
        // Preferisci quelli non ancora collegati a una task o dello stesso cliente.
        setAvailable(rows.filter((m) => m.work_item_id == null || m.client_id === clientId));
      } catch {
        setAvailable([]);
      }
    }
  };

  const confirmLink = async () => {
    if (!pick) return;
    setBusy(true);
    try {
      await updateMonitorApi(Number(pick), { work_item_id: workItemId });
      toast.success("Monitoraggio collegato");
      setLinking(false);
      setPick("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore nel collegamento");
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    if (!monitor) return;
    setBusy(true);
    try {
      await updateMonitorApi(monitor.id, { work_item_id: null });
      toast.success("Monitoraggio scollegato");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore");
    } finally {
      setBusy(false);
    }
  };

  const createFromPed = async () => {
    setBusy(true);
    try {
      setMonitor(await suggestMonitorFromWorkItemApi(workItemId));
      toast.success("Monitoraggio creato dalla configurazione PED");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore nella creazione");
    } finally {
      setBusy(false);
    }
  };

  const runNow = async () => {
    if (!monitor) return;
    setBusy(true);
    try {
      setMonitor(await runMonitorNowApi(monitor.id));
      setPaceRefresh((v) => v + 1);
      toast.success("Analisi eseguita");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore nell'analisi");
    } finally {
      setBusy(false);
    }
  };

  const toggleOperators = async () => {
    if (!monitor) return;
    try {
      setMonitor(await updateMonitorApi(monitor.id, { operators_can_view: !monitor.operators_can_view }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore");
    }
  };

  const platforms = useMemo(() => {
    const seen: string[] = [];
    for (const t of monitor?.targets ?? []) {
      const pl = t.platform ?? "";
      if (pl && !seen.includes(pl)) seen.push(pl);
    }
    return seen;
  }, [monitor]);
  const [activePlatform, setActivePlatform] = useState<string | null>(null);
  useEffect(() => {
    setActivePlatform((cur) => cur ?? platforms[0] ?? null);
  }, [platforms]);

  // ── Stati ────────────────────────────────────────────────────────────────
  if (monitor === undefined) {
    return <div className="py-8 text-center text-[13px] text-muted dark:text-muted-dark">Caricamento…</div>;
  }

  if (monitor === null) {
    // Nessun monitor collegato.
    if (!isManager) {
      return (
        <div className="py-8 text-center text-[13px] text-muted dark:text-muted-dark">
          Nessun monitoraggio attivo per questa task.
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <Icon name="activity" className="h-8 w-8 text-muted dark:text-muted-dark" />
        <p className="text-[13px] text-muted dark:text-muted-dark">
          Nessun monitoraggio social collegato a questa task.
        </p>
        {hasPedConfig && !linking && (
          <div className="w-full max-w-sm rounded-lg border border-brand-magenta/30 bg-brand-magenta/5 p-3 text-left">
            <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink dark:text-[#f4f4f7]">
              <Icon name="activity" className="h-3.5 w-3.5 text-brand-magenta" /> Suggerimento
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-muted dark:text-[#9999a0]">
              Questa task ha una configurazione PED e dei social collegati. Crea un
              monitoraggio pre-impostato sulle sue pagine, con soglie di inattività
              ricavate dalle pubblicazioni previste dal PED.
            </p>
            <Button
              variant="primary"
              onClick={createFromPed}
              loading={busy}
              className="mt-2"
              leftIcon={<Icon name="activity" className="h-3.5 w-3.5" />}
            >
              Crea monitoraggio suggerito
            </Button>
          </div>
        )}
        {!linking ? (
          <Button variant="primary" onClick={openLink} leftIcon={<Icon name="plus" className="h-3.5 w-3.5" />}>
            Collega monitoraggio
          </Button>
        ) : (
          <div className="flex w-full max-w-sm flex-col gap-2">
            <SearchableSelect
              value={pick}
              onChange={setPick}
              options={available.map((m) => ({
                value: String(m.id),
                label: `${m.name}${m.client_name ? ` · ${m.client_name}` : ""}`,
              }))}
              placeholder="Scegli un monitoraggio…"
              emptyMessage="Nessun monitoraggio disponibile"
              menuLayer="portal"
            />
            <div className="flex justify-center gap-2">
              <Button variant="ghost" onClick={() => setLinking(false)}>Annulla</Button>
              <Button variant="primary" onClick={confirmLink} loading={busy} disabled={!pick}>Collega</Button>
            </div>
            <button
              type="button"
              onClick={() => navigate("/monitoraggio-social")}
              className="text-[11.5px] text-brand-magenta hover:underline"
            >
              …oppure crea un nuovo monitoraggio
            </button>
          </div>
        )}
      </div>
    );
  }

  const anyAlert = monitor.targets.some((t) => t.is_alerting);
  const activeTargets = monitor.targets.filter((t) => (t.platform ?? "") === activePlatform);

  return (
    <div className="flex flex-col gap-4">
      {/* Header + azioni */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[15px] font-bold text-ink dark:text-[#f4f4f7]">{monitor.name}</h3>
            <Badge variant={monitor.is_active ? "success" : "info"}>{monitor.is_active ? "Attivo" : "In pausa"}</Badge>
            {anyAlert && <Badge variant="danger">Avvisi</Badge>}
          </div>
          <p className="text-[12px] text-muted dark:text-muted-dark">
            Prossimo controllo: {fmtDateTime(monitor.next_run_at)}
          </p>
        </div>
        {isManager && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              onClick={runNow}
              loading={busy}
              leftIcon={<Icon name="refresh-cw" className="h-3.5 w-3.5" />}
            >
              Analizza subito
            </Button>
            <button
              type="button"
              onClick={() => navigate(`/monitoraggio-social?edit=${monitor.id}`)}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-[11px] font-semibold uppercase tracking-wider text-ink hover:bg-cream dark:border-[#2a2a2e] dark:text-[#f4f4f7] dark:hover:bg-[#1c1c20]"
            >
              <Icon name="pencil" className="h-3.5 w-3.5" /> Modifica monitor
            </button>
            <button
              type="button"
              onClick={unlink}
              disabled={busy}
              title="Scollega il monitoraggio da questa task (il monitor non viene eliminato)"
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-[11px] font-semibold uppercase tracking-wider text-ink transition-colors hover:border-danger/40 hover:text-danger disabled:opacity-50 dark:border-[#2a2a2e] dark:text-[#f4f4f7]"
            >
              <Icon name="unlink" className="h-3.5 w-3.5" /> Scollega
            </button>
          </div>
        )}
      </div>

      {isManager && (
        <label className="flex items-center gap-2 text-[12.5px] text-ink dark:text-[#f4f4f7]">
          <Checkbox checked={monitor.operators_can_view} onChange={toggleOperators} />
          Visibile agli operatori di questa task
        </label>
      )}

      {/* Dati chiave per account */}
      <div className="rounded-lg border border-line p-3 dark:border-[#2a2a2e]">
        <p className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
          Ultime pubblicazioni
        </p>
        <div className="flex flex-col gap-1.5">
          {monitor.targets.map((t) => (
            <div key={t.id} className="flex flex-wrap items-center gap-2 text-[12.5px]">
              <SocialIcon platform={t.platform ?? ""} className="h-4 w-4 flex-none" />
              <span className="min-w-0 flex-1 truncate text-ink dark:text-[#f4f4f7]">{t.profile_name}</span>
              {monitor.check_posts && (
                <span className={`rounded px-1.5 py-0.5 text-[10px] tabular-nums ${CHIP.post}`}>
                  Post {fmtDateTime(t.last_post_at)}
                </span>
              )}
              {monitor.check_carousels && (
                <span className={`rounded px-1.5 py-0.5 text-[10px] tabular-nums ${CHIP.carousel}`}>
                  Carosello {fmtDateTime(t.last_carousel_at)}
                </span>
              )}
              {monitor.check_reels && (
                <span className={`rounded px-1.5 py-0.5 text-[10px] tabular-nums ${CHIP.reel}`}>
                  Reel {fmtDateTime(t.last_reel_at)}
                </span>
              )}
              {monitor.check_stories && (
                <span className={`rounded px-1.5 py-0.5 text-[10px] tabular-nums ${CHIP.story}`}>
                  Storia {fmtDateTime(t.last_story_at)}
                </span>
              )}
              {t.is_alerting && <Badge variant="danger">In allarme</Badge>}
              {t.last_error && (
                <span
                  title={t.last_error}
                  className="inline-flex items-center gap-1 rounded bg-danger/10 px-1.5 py-0.5 text-[10px] font-semibold text-danger"
                >
                  <Icon name="alert-triangle" className="h-3 w-3" /> Collegamento non verificato
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Ritmo pubblicazioni vs PED (solo monitor da PED) */}
      {monitor.check_pace && <PaceIndicator monitorId={monitor.id} refreshKey={paceRefresh} />}

      {/* Feed diviso per social/account */}
      <div>
        <div className="mb-3 flex flex-wrap gap-2">
          {platforms.map((pl) => (
            <button
              key={pl}
              type="button"
              onClick={() => setActivePlatform(pl)}
              className={`inline-flex items-center gap-2 rounded-pill border px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                activePlatform === pl
                  ? "border-brand-magenta bg-brand-magenta/5 text-ink dark:text-[#f4f4f7]"
                  : "border-line text-muted hover:text-ink dark:border-[#2a2a2e] dark:text-[#9999a0]"
              }`}
            >
              <SocialIcon platform={pl} className="h-4 w-4" />
              {SOCIAL_PLATFORM_LABELS[pl] ?? pl}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-6">
          {activeTargets.map((t) => (
            <div key={t.id}>
              <div className="mb-2 flex items-center gap-2">
                <SocialIcon platform={t.platform ?? ""} className="h-5 w-5" />
                <span className="text-[14px] font-bold text-ink dark:text-[#f4f4f7]">{t.profile_name}</span>
              </div>
              <ProfileFeed
                profileId={t.social_profile_id}
                platform={t.platform ?? ""}
                name={t.profile_name ?? ""}
                url={t.profile_url ?? "#"}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
