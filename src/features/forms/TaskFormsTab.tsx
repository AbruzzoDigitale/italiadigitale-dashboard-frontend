import { useCallback, useEffect, useState } from "react";
import {
  attachFormToWorkItemApi,
  createSubmissionApi,
  detachFormFromWorkItemApi,
  listFormsApi,
  listWorkItemFormsApi,
  type Form,
  type WorkItemForm,
} from "../../api/forms";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Checkbox } from "../../components/ui/Checkbox";
import { Icon } from "../../components/ui/Icon";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import { useToast } from "../../context/ToastContext";

interface TaskFormsTabProps {
  workItemId: number;
  companyId: number;
  /** Collegare o staccare un modulo: admin e project manager. */
  canManage: boolean;
}

/**
 * Scheda «Moduli» della task: i report da compilare. Il modulo si apre in una
 * scheda dedicata del browser, non dentro il modal — compilare un report è un
 * lavoro a sé e merita spazio, e così non si perde quello che si stava facendo
 * sulla task.
 */
export function TaskFormsTab({ workItemId, companyId, canManage }: TaskFormsTabProps) {
  const toast = useToast();
  const [links, setLinks] = useState<WorkItemForm[]>([]);
  const [disponibili, setDisponibili] = useState<Form[]>([]);
  const [loading, setLoading] = useState(true);
  const [daCollegare, setDaCollegare] = useState("");
  const [obbligatorio, setObbligatorio] = useState(true);
  const [busy, setBusy] = useState(false);
  const [apertura, setApertura] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setLinks(await listWorkItemFormsApi(workItemId));
    } catch {
      setLinks([]);
    } finally {
      setLoading(false);
    }
  }, [workItemId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!canManage) return;
    listFormsApi({ companyId })
      .then((f) => setDisponibili(f.filter((x) => x.is_active)))
      .catch(() => setDisponibili([]));
  }, [companyId, canManage]);

  const collega = async () => {
    if (!daCollegare) return;
    setBusy(true);
    try {
      await attachFormToWorkItemApi(workItemId, {
        form_id: Number(daCollegare),
        is_required: obbligatorio,
      });
      setDaCollegare("");
      await load();
      toast.success("Modulo collegato alla task");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore nel collegamento");
    } finally {
      setBusy(false);
    }
  };

  const stacca = async (formId: number) => {
    setBusy(true);
    try {
      await detachFormFromWorkItemApi(workItemId, formId);
      await load();
      toast.success("Modulo scollegato");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore nello scollegamento");
    } finally {
      setBusy(false);
    }
  };

  /** Apre il report in una scheda nuova, creando la bozza se non c'è ancora. */
  const apri = async (link: WorkItemForm) => {
    setApertura(link.form_id);
    try {
      const id =
        link.submission_id ??
        (await createSubmissionApi({ form_id: link.form_id, work_item_id: workItemId })).id;
      window.open(`/modulo/compila/${id}`, "_blank", "noopener");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore nell'apertura del modulo");
    } finally {
      setApertura(null);
    }
  };

  const giaCollegati = new Set(links.map((l) => l.form_id));

  return (
    <div className="rounded-md border border-line p-3 dark:border-line-dark">
      <div className="mb-2 text-[11px] uppercase tracking-wider text-muted dark:text-muted-dark">
        Moduli da compilare
      </div>

      {loading ? (
        <div className="sp-skeleton h-14 rounded-md border border-line dark:border-[#2a2a2e]" />
      ) : links.length === 0 ? (
        <p className="text-[12.5px] text-muted dark:text-[#9999a0]">
          Nessun modulo collegato a questa task.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {links.map((link) => {
            const consegnato = link.submission_status === "submitted";
            return (
              <div
                key={link.id}
                className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-cream px-3 py-2.5 dark:border-[#2a2a2e] dark:bg-[#1c1c20]"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold text-ink dark:text-[#f4f4f7]">
                    {link.form_name}
                  </p>
                  <p className="text-[11px] text-muted dark:text-[#9999a0]">
                    {consegnato
                      ? "Report consegnato"
                      : link.submission_status === "draft"
                      ? "Bozza in corso"
                      : "Non ancora compilato"}
                  </p>
                </div>
                {link.is_required && !consegnato && <Badge variant="warning">Obbligatorio</Badge>}
                {consegnato && <Badge variant="success">Fatto</Badge>}
                <Button
                  variant={consegnato ? "secondary" : "primary"}
                  onClick={() => apri(link)}
                  loading={apertura === link.form_id}
                  leftIcon={<Icon name={consegnato ? "eye" : "pencil"} className="w-3.5 h-3.5" />}
                >
                  {consegnato ? "Apri report" : "Compila"}
                </Button>
                {canManage && (
                  <button
                    type="button"
                    title="Scollega dalla task"
                    aria-label="Scollega"
                    disabled={busy}
                    onClick={() => stacca(link.form_id)}
                    className="inline-grid h-7 w-7 place-items-center rounded-md border border-danger/20 bg-danger/5 text-danger transition-colors hover:bg-danger/10 disabled:opacity-40"
                  >
                    <Icon name="unlink" className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {canManage && (
        <div className="mt-3 flex flex-col gap-2 border-t border-line pt-3 dark:border-[#2a2a2e]">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[200px] flex-1">
              <SearchableSelect
                value={daCollegare}
                onChange={setDaCollegare}
                options={[
                  { value: "", label: "Scegli un modulo…" },
                  ...disponibili
                    .filter((f) => !giaCollegati.has(f.id))
                    .map((f) => ({ value: String(f.id), label: f.name })),
                ]}
                showAvatar={false}
                menuLayer="portal"
              />
            </div>
            <Button variant="secondary" onClick={collega} disabled={!daCollegare} loading={busy}>
              Collega
            </Button>
          </div>
          <button
            type="button"
            onClick={() => setObbligatorio((v) => !v)}
            className="inline-flex items-center gap-2 self-start text-[12.5px] text-ink dark:text-[#f4f4f7]"
          >
            <Checkbox checked={obbligatorio} onChange={setObbligatorio} />
            Obbligatorio per chiudere la task
          </button>
        </div>
      )}
    </div>
  );
}
