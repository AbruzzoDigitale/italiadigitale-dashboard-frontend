import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { useSelectedCompanyId } from "../hooks/useSelectedCompanyId";
import { useToast } from "../context/ToastContext";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Textarea } from "../components/ui/Textarea";
import { Icon } from "../components/ui/Icon";
import { Spinner } from "../components/ui/Spinner";
import { SearchableSelect } from "../components/ui/SearchableSelect";
import { MultiSelect } from "../components/ui/MultiSelect";
import { listWorkAreasApi, type WorkArea } from "../api/workAreas";
import { getUsersApi, type User } from "../api/users";
import {
  createCommunicationApi,
  deleteCommunicationApi,
  getCommunicationsApi,
  type CommunicationItem,
  type CommunicationScope,
} from "../api/notifications";

const SCOPE_LABELS: Record<CommunicationScope, string> = {
  globale: "Globale",
  area: "Area",
  operatore: "Operatore",
};

function scopeChipLabel(c: CommunicationItem): string {
  if (c.scope === "area") return `Area · ${c.work_area_name ?? "—"}`;
  if (c.scope === "operatore") return `Operatore · ${c.target_user_ids?.length ?? 0}`;
  return "Globale";
}

export function CommunicationsPage() {
  const { user, permissions } = useAuth();
  const { selectedCompanyId } = useSelectedCompanyId(user?.company_id ?? null);
  const companyId = selectedCompanyId ?? user?.company_id ?? null;
  const toast = useToast();
  const isAdmin = !!permissions?.is_admin;

  const [list, setList] = useState<CommunicationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [areas, setAreas] = useState<WorkArea[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  const [scope, setScope] = useState<CommunicationScope>(isAdmin ? "globale" : "area");
  const [workAreaId, setWorkAreaId] = useState<number | null>(null);
  const [targetUserIds, setTargetUserIds] = useState<number[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const scopeOptions: CommunicationScope[] = isAdmin ? ["globale", "area", "operatore"] : ["area"];

  const reload = async () => {
    if (companyId == null) return;
    setLoading(true);
    try {
      setList(await getCommunicationsApi(companyId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore nel caricamento");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (companyId == null) return;
    void reload();
    listWorkAreasApi({ company_id: companyId }).then(setAreas).catch(() => setAreas([]));
    getUsersApi(companyId).then(setUsers).catch(() => setUsers([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const areaOptions = useMemo(
    () => areas.map((a) => ({ value: String(a.id), label: a.name })),
    [areas],
  );
  const userOptions = useMemo(
    () => users.map((u) => ({ id: u.id, label: u.full_name || u.username })),
    [users],
  );

  const canSend =
    companyId != null &&
    title.trim().length > 0 &&
    (scope !== "area" || workAreaId != null) &&
    (scope !== "operatore" || targetUserIds.length > 0);

  const handleSend = async () => {
    if (companyId == null || !canSend) return;
    setSending(true);
    try {
      await createCommunicationApi({
        company_id: companyId,
        scope,
        title: title.trim(),
        body: body.trim() || null,
        work_area_id: scope === "area" ? workAreaId : null,
        target_user_ids: scope === "operatore" ? targetUserIds : null,
      });
      toast.success("Comunicazione inviata");
      setTitle("");
      setBody("");
      setTargetUserIds([]);
      void reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore nell'invio");
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteCommunicationApi(id);
      setList((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore nell'eliminazione");
    }
  };

  return (
    <div className="px-6 py-8 pb-20 mx-auto w-full animate-fadeIn">
      <div className="mb-8">
        <h1 className="section-title flex items-center gap-2.5">
          <Icon name="annotation" className="w-6 h-6" />
          Comunicazioni
        </h1>
      </div>

      {/* Compositore */}
      <div className="bg-paper dark:bg-[#131316] rounded-lg border border-line dark:border-[#2a2a2e] p-6 mb-8">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="font-display font-bold tracking-tight text-ink dark:text-[#f4f4f7]" style={{ fontSize: "17px" }}>
            Nuova comunicazione
          </h2>
          <Button variant="primary" onClick={handleSend} loading={sending} disabled={!canSend}>
            Invia
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">Destinatari</label>
            <div className="flex flex-wrap gap-1.5">
              {scopeOptions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setScope(s)}
                  className={`rounded-pill px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                    scope === s
                      ? "bg-ink text-paper dark:bg-[#f4f4f7] dark:text-ink"
                      : "border border-line text-muted hover:text-ink dark:border-[#2a2a2e] dark:text-muted-dark dark:hover:text-paper"
                  }`}
                >
                  {SCOPE_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          {scope === "area" && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">Area</label>
              <SearchableSelect
                value={workAreaId != null ? String(workAreaId) : ""}
                onChange={(v) => setWorkAreaId(v ? Number(v) : null)}
                options={areaOptions}
                placeholder="Seleziona area..."
                searchPlaceholder="Cerca area..."
              />
            </div>
          )}

          {scope === "operatore" && (
            <div className="flex flex-col gap-1 sm:col-span-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">Operatori</label>
              <MultiSelect
                value={targetUserIds}
                onChange={setTargetUserIds}
                options={userOptions}
                placeholder="Seleziona operatori..."
                searchPlaceholder="Cerca operatore..."
              />
            </div>
          )}

          <div className="sm:col-span-2">
            <Input label="Titolo *" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Es. Riunione team lunedì ore 09:00" />
          </div>
          <div className="sm:col-span-2">
            <Textarea label="Messaggio" value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="Dettagli della comunicazione..." />
          </div>
        </div>
      </div>

      {/* Inviate */}
      <div className="mb-3 text-[11px] font-bold uppercase tracking-wider text-muted dark:text-muted-dark">Inviate</div>
      {loading ? (
        <div className="flex items-center justify-center py-12"><Spinner size="md" /></div>
      ) : list.length === 0 ? (
        <div className="rounded-md border border-dashed border-line dark:border-line-dark px-4 py-10 text-center text-sm text-muted dark:text-muted-dark">
          Nessuna comunicazione inviata.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {list.map((c) => (
            <div key={c.id} className="bg-paper dark:bg-[#131316] rounded-lg border border-line dark:border-[#2a2a2e] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-ink dark:text-paper">{c.title}</span>
                    <span className="inline-flex items-center rounded-pill border border-line dark:border-line-dark px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
                      {scopeChipLabel(c)}
                    </span>
                  </div>
                  {c.body && <p className="mt-1 text-[13px] text-muted dark:text-muted-dark line-clamp-2">{c.body}</p>}
                  <div className="mt-1.5 text-[11px] text-muted dark:text-muted-dark">
                    {c.author_name ?? "—"} · {c.time}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <span className="inline-flex items-center gap-1.5 rounded-pill bg-cream dark:bg-[#1c1c20] px-2.5 py-1 text-[11px] font-semibold text-ink dark:text-paper">
                    <Icon name="check-circle" className="h-3.5 w-3.5 text-success" />
                    {c.read_count}/{c.recipients_count} lette
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDelete(c.id)}
                    title="Elimina"
                    className="text-muted hover:text-danger dark:text-muted-dark"
                  >
                    <Icon name="trash" className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
