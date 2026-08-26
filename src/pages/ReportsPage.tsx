import { useCallback, useEffect, useMemo, useState } from "react";
import { listClientOptionsApi } from "../api/clients";
import {
  downloadSubmissionsCsv,
  listFormsApi,
  listSubmissionsApi,
  type Form,
  type FormSubmission,
} from "../api/forms";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { Input } from "../components/ui/Input";
import { PageSectionHeader } from "../components/ui/PageSectionHeader";
import { SegmentedSwitch } from "../components/ui/SegmentedSwitch";
import { SearchableSelect } from "../components/ui/SearchableSelect";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../hooks/useAuth";
import { useSelectedCompanyId } from "../hooks/useSelectedCompanyId";
import { FormsTab } from "../features/forms/FormsTab";

/**
 * Pagina Report, in due viste:
 * - **Report**: i moduli compilati che l'utente può vedere. La selezione la fa
 *   il backend — l'admin tutto, gli altri i report dei moduli assegnati a una
 *   loro area o a loro, più quelli delle task a cui hanno accesso.
 * - **Moduli**: la definizione dei moduli, riservata ad admin e PM. Sta qui e
 *   non nel pannello Azienda perché è accanto ai report che se ne vede l'esito.
 */
export function ReportsPage() {
  const { user, activeCompanyId } = useAuth();
  const { selectedCompanyId } = useSelectedCompanyId(activeCompanyId ?? user?.company_id ?? null);
  const companyId = selectedCompanyId ?? activeCompanyId ?? user?.company_id ?? null;
  const toast = useToast();

  const [rows, setRows] = useState<FormSubmission[]>([]);
  const [forms, setForms] = useState<Form[]>([]);
  const [clients, setClients] = useState<Array<{ id: number; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // I moduli li definiscono admin e PM: per gli operatori la pagina resta il
  // solo elenco dei report, senza nemmeno il selettore.
  const canManageForms = !!user?.is_admin || user?.access_level === "project_manager";
  const [view, setView] = useState<"report" | "moduli">("report");

  const [formId, setFormId] = useState("");
  const [clientId, setClientId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    if (companyId == null) return;
    setLoading(true);
    try {
      setRows(
        await listSubmissionsApi({
          companyId,
          formId: formId ? Number(formId) : null,
          clientId: clientId ? Number(clientId) : null,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        })
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel caricamento dei report");
    } finally {
      setLoading(false);
    }
  }, [companyId, formId, clientId, dateFrom, dateTo]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (companyId == null) return;
    listFormsApi({ companyId }).then(setForms).catch(() => setForms([]));
    listClientOptionsApi(companyId).then(setClients).catch(() => setClients([]));
  }, [companyId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      `${r.form_name} ${r.website_url ?? ""} ${r.client_name ?? ""} ${r.submitted_by_label ?? ""}`
        .toLowerCase()
        .includes(q)
    );
  }, [rows, search]);

  const toggle = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const esporta = async () => {
    if (companyId == null) return;
    setExporting(true);
    try {
      await downloadSubmissionsCsv({
        companyId,
        formId: formId ? Number(formId) : null,
        clientId: clientId ? Number(clientId) : null,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore durante l'export");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="mx-auto flex h-full w-full flex-col px-6 py-8 min-h-0 animate-fadeIn">
      <div className="flex flex-none flex-wrap items-center justify-between gap-3">
        <PageSectionHeader icon={<Icon name="document-text" className="w-6 h-6" />} title="Report" />
        <div className="flex flex-wrap items-center gap-2">
          {canManageForms && (
            <SegmentedSwitch
              value={view}
              onChange={setView}
              ariaLabel="Sezione report"
              options={[
                { value: "report", label: <><Icon name="list" className="w-3.5 h-3.5" />Report</> },
                { value: "moduli", label: <><Icon name="document-text" className="w-3.5 h-3.5" />Moduli</> },
              ]}
            />
          )}
          {view === "report" && (
            <Button
              variant="secondary"
              onClick={esporta}
              loading={exporting}
              disabled={filtered.length === 0}
              leftIcon={<Icon name="download" className="w-3.5 h-3.5" />}
            >
              Esporta CSV
            </Button>
          )}
        </div>
      </div>

      {view === "moduli" && canManageForms && companyId != null && (
        <div className="-mr-3 min-h-0 flex-1 overflow-y-auto pr-3">
          <FormsTab companyId={companyId} canManage />
        </div>
      )}

      {view === "report" && (
      <>

      <div className="mb-5 flex flex-none flex-wrap items-end gap-3">
        <div className="relative min-w-[200px] max-w-xs flex-1">
          <Icon name="search" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca per sito, cliente, operatore..."
            className="pl-9"
          />
        </div>
        <div className="w-52">
          <SearchableSelect
            value={formId}
            onChange={setFormId}
            options={[
              { value: "", label: "Tutti i moduli" },
              ...forms.map((f) => ({ value: String(f.id), label: f.name })),
            ]}
            placeholder="Modulo"
            showAvatar={false}
            menuLayer="portal"
          />
        </div>
        <div className="w-52">
          <SearchableSelect
            value={clientId}
            onChange={setClientId}
            options={[
              { value: "", label: "Tutti i clienti" },
              ...clients.map((c) => ({ value: String(c.id), label: c.name })),
            ]}
            placeholder="Cliente"
            menuLayer="portal"
          />
        </div>
        <div className="w-40">
          <Input label="Dal" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div className="w-40">
          <Input label="Al" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
      </div>

      {error && (
        <div className="mb-4 flex-none rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="-mr-3 min-h-0 flex-1 overflow-y-auto pr-3">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="sp-pop-in sp-skeleton h-16 rounded-md border border-line dark:border-[#2a2a2e]"
                style={{ animationDelay: `${i * 45}ms` }}
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-md border border-dashed border-line px-4 py-8 text-sm text-muted dark:border-[#2a2a2e] dark:text-[#9999a0]">
            {rows.length === 0
              ? "Nessun report visibile. Vedi i report dei moduli assegnati alle tue aree o a te."
              : "Nessun report corrisponde ai filtri."}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((r, index) => (
              <div
                key={r.id}
                className="sp-pop-in rounded-md border border-line bg-cream px-3 py-2.5 dark:border-[#2a2a2e] dark:bg-[#1c1c20]"
                style={{ animationDelay: `${Math.min(index, 11) * 30}ms` }}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-bold text-ink dark:text-[#f4f4f7]">
                      {r.form_name}
                      {r.website_url && (
                        <span className="ml-2 font-normal text-muted dark:text-[#9999a0]">
                          {r.website_url.replace(/^https?:\/\/(www\.)?/, "")}
                        </span>
                      )}
                    </p>
                    <p className="truncate text-[11px] text-muted dark:text-[#9999a0]">
                      {r.submitted_at
                        ? new Date(r.submitted_at).toLocaleString("it-IT", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })
                        : "Non ancora consegnato"}
                      {r.submitted_by_label && ` · ${r.submitted_by_label}`}
                      {r.client_name && ` · ${r.client_name}`}
                    </p>
                  </div>
                  {r.status === "submitted" ? (
                    <Badge variant="success">Consegnato</Badge>
                  ) : (
                    <Badge variant="warning">Bozza</Badge>
                  )}
                  {r.attachments.length > 0 && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-muted dark:text-[#9999a0]">
                      <Icon name="paperclip" className="h-3 w-3" />
                      {r.attachments.length}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => toggle(r.id)}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-magenta hover:underline"
                  >
                    <Icon
                      name="chevron-right"
                      className={`h-3 w-3 transition-transform ${expanded.has(r.id) ? "rotate-90" : ""}`}
                    />
                    {expanded.has(r.id) ? "Nascondi" : "Risposte"}
                  </button>
                  <a
                    href={`/modulo/compila/${r.id}`}
                    target="_blank"
                    rel="noreferrer"
                    title="Apri il report"
                    className="inline-grid h-7 w-7 place-items-center rounded-md border border-line text-ink transition-colors hover:bg-paper dark:border-[#2a2a2e] dark:text-[#f4f4f7] dark:hover:bg-[#131316]"
                  >
                    <Icon name="maximize" className="h-3.5 w-3.5" />
                  </a>
                </div>

                {expanded.has(r.id) && (
                  <div className="wb-detail wb-detail-in mt-2">
                    <dl className="grid grid-cols-1 gap-2 border-t border-line/60 pt-2 dark:border-[#2a2a2e] sm:grid-cols-2 lg:grid-cols-3">
                      {r.answers.map((a) => (
                        <div key={a.field_key}>
                          <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
                            {a.field_label}
                          </dt>
                          <dd className="whitespace-pre-wrap break-words text-[12.5px] text-ink dark:text-[#f4f4f7]">
                            {a.field_type === "boolean"
                              ? a.value === "true"
                                ? "Sì"
                                : "No"
                              : a.value || a.other_value || "—"}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <p className="mt-3 text-[12px] text-muted dark:text-[#9999a0]">
            {filtered.length} {filtered.length === 1 ? "report" : "report"}
          </p>
        )}
      </div>
      </>
      )}
    </div>
  );
}
