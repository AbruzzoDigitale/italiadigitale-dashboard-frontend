import { useEffect, useMemo, useState } from "react";
import { getQuotesApi, type Quote } from "../../api/quotes";
import {
  CONTRACT_STAGE_LABELS,
  CONTRACT_STAGE_ORDER,
  contractFromQuoteDryRunApi,
  createContractFromQuoteApi,
  type ContractCommercialStage,
  type ContractDetailResponse,
  type ContractEngagementType,
  type ContractFromQuoteDryRunResponse,
  type ContractFromQuoteRequest,
  type ContractPricingMode,
  type ContractType,
} from "../../api/contracts";
import type { Client } from "../../api/clients";
import { useToast } from "../../context/ToastContext";
import { ClientSelectorWithCreate } from "../clients/ClientSelectorWithCreate";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";
import { SearchableSelect } from "../ui/SearchableSelect";
import { Spinner } from "../ui/Spinner";
import { Textarea } from "../ui/Textarea";
import { QuoteQuickCreateModal } from "./QuoteQuickCreateModal";

type FormState = {
  quote_id: string;
  company_id: string;
  client_id: string;
  featured_quote_id: string;
  contract_type: "" | ContractType;
  engagement_type: "" | ContractEngagementType;
  title: string;
  commercial_notes: string;
  operational_brief: string;
  commercial_stage: "" | ContractCommercialStage;
  execution_stage: string;
  stage_sent_at: string;
  stage_negotiation_at: string;
  stage_accepted_at: string;
  contract_sent_at: string;
  signed_at: string;
  start_date: string;
  end_date: string;
  in_production_at: string;
  completed_at: string;
  lost_at: string;
  pricing_view_mode: "" | ContractPricingMode;
  include_quote_in_total: boolean;
  is_primary_quote: boolean;
  display_order: string;
  label: string;
};

type QuoteSourceStep = "source" | "pick-existing" | "configure";

const EMPTY_FORM: FormState = {
  quote_id: "",
  company_id: "",
  client_id: "",
  featured_quote_id: "",
  contract_type: "",
  engagement_type: "",
  title: "",
  commercial_notes: "",
  operational_brief: "",
  commercial_stage: "bozza",
  execution_stage: "",
  stage_sent_at: "",
  stage_negotiation_at: "",
  stage_accepted_at: "",
  contract_sent_at: "",
  signed_at: "",
  start_date: "",
  end_date: "",
  in_production_at: "",
  completed_at: "",
  lost_at: "",
  pricing_view_mode: "",
  include_quote_in_total: true,
  is_primary_quote: true,
  display_order: "0",
  label: "",
};

function toDatetimeLocalValue(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

function toIsoDatetimeValue(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function readString(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  if (value == null) return "";
  return typeof value === "string" ? value : String(value);
}

function readNumberString(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.trim()) return value;
  return "";
}

function readBoolean(payload: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = payload[key];
  if (typeof value === "boolean") return value;
  return fallback;
}

function payloadToForm(
  payload: Record<string, unknown>,
  quoteId: number,
  fallbackCompanyId: number | null
): FormState {
  return {
    quote_id: String(quoteId),
    company_id: readNumberString(payload, "company_id") || (fallbackCompanyId != null ? String(fallbackCompanyId) : ""),
    client_id: readNumberString(payload, "client_id"),
    featured_quote_id: readNumberString(payload, "featured_quote_id") || String(quoteId),
    contract_type: (readString(payload, "contract_type") as "" | ContractType) || "commercial",
    engagement_type: (readString(payload, "engagement_type") as "" | ContractEngagementType) || "",
    title: readString(payload, "title"),
    commercial_notes: readString(payload, "commercial_notes"),
    operational_brief: readString(payload, "operational_brief"),
    commercial_stage: (readString(payload, "commercial_stage") as "" | ContractCommercialStage) || "bozza",
    execution_stage: readString(payload, "execution_stage"),
    stage_sent_at: toDatetimeLocalValue(readString(payload, "stage_sent_at") || null),
    stage_negotiation_at: toDatetimeLocalValue(readString(payload, "stage_negotiation_at") || null),
    stage_accepted_at: toDatetimeLocalValue(readString(payload, "stage_accepted_at") || null),
    contract_sent_at: toDatetimeLocalValue(readString(payload, "contract_sent_at") || null),
    signed_at: toDatetimeLocalValue(readString(payload, "signed_at") || null),
    start_date: readString(payload, "start_date"),
    end_date: readString(payload, "end_date"),
    in_production_at: toDatetimeLocalValue(readString(payload, "in_production_at") || null),
    completed_at: toDatetimeLocalValue(readString(payload, "completed_at") || null),
    lost_at: toDatetimeLocalValue(readString(payload, "lost_at") || null),
    pricing_view_mode: (readString(payload, "pricing_view_mode") as "" | ContractPricingMode) || "aggregated",
    include_quote_in_total: readBoolean(payload, "include_quote_in_total", true),
    is_primary_quote: readBoolean(payload, "is_primary_quote", true),
    display_order: readNumberString(payload, "display_order") || "0",
    label: readString(payload, "label"),
  };
}

function compact<T extends object>(value: T): Partial<T> {
  const out: Partial<T> = {};
  Object.entries(value).forEach(([key, fieldValue]) => {
    if (fieldValue === undefined || fieldValue === null) return;
    if (typeof fieldValue === "string" && fieldValue.trim() === "") return;
    out[key as keyof T] = fieldValue as T[keyof T];
  });
  return out;
}

function formToRequest(form: FormState): ContractFromQuoteRequest {
  const request = {
    quote_id: Number(form.quote_id),
    company_id: form.company_id ? Number(form.company_id) : undefined,
    client_id: form.client_id ? Number(form.client_id) : undefined,
    featured_quote_id: form.featured_quote_id ? Number(form.featured_quote_id) : undefined,
    contract_type: form.contract_type || undefined,
    engagement_type: form.engagement_type || undefined,
    title: form.title.trim() || undefined,
    commercial_notes: form.commercial_notes.trim() || undefined,
    operational_brief: form.operational_brief.trim() || undefined,
    commercial_stage: form.commercial_stage || undefined,
    execution_stage: form.execution_stage.trim() || undefined,
    stage_sent_at: toIsoDatetimeValue(form.stage_sent_at),
    stage_negotiation_at: toIsoDatetimeValue(form.stage_negotiation_at),
    stage_accepted_at: toIsoDatetimeValue(form.stage_accepted_at),
    contract_sent_at: toIsoDatetimeValue(form.contract_sent_at),
    signed_at: toIsoDatetimeValue(form.signed_at),
    start_date: form.start_date || undefined,
    end_date: form.end_date || undefined,
    in_production_at: toIsoDatetimeValue(form.in_production_at),
    completed_at: toIsoDatetimeValue(form.completed_at),
    lost_at: toIsoDatetimeValue(form.lost_at),
    pricing_view_mode: form.pricing_view_mode || undefined,
    include_quote_in_total: form.include_quote_in_total,
    is_primary_quote: form.is_primary_quote,
    display_order: form.display_order.trim() ? Number(form.display_order) : undefined,
    label: form.label.trim() || undefined,
  } satisfies ContractFromQuoteRequest;

  return compact(request) as ContractFromQuoteRequest;
}

export function ContractFromQuoteModal({
  open,
  companyId,
  clients,
  clientsLoading = false,
  canSyncFromFic = false,
  onClose,
  onCreated,
}: {
  open: boolean;
  companyId: number | null;
  clients: Client[];
  clientsLoading?: boolean;
  canSyncFromFic?: boolean;
  onClose: () => void;
  onCreated?: (contract: ContractDetailResponse) => void;
}) {
  const toast = useToast();
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [step, setStep] = useState<QuoteSourceStep>("source");
  const [preparation, setPreparation] = useState<ContractFromQuoteDryRunResponse | null>(null);
  const [preparingContractData, setPreparingContractData] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createQuoteOpen, setCreateQuoteOpen] = useState(false);
  const [quoteSearch, setQuoteSearch] = useState("");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const quoteOptions = useMemo(
    () => quotes.map((quote) => ({
      value: String(quote.id),
      label: `${quote.number} · ${quote.title || quote.tag || "Preventivo"}`,
      keywords: `${quote.number} ${quote.title ?? ""} ${quote.tag ?? ""}`,
    })),
    [quotes]
  );

  const filteredQuoteOptions = useMemo(() => {
    const search = quoteSearch.trim().toLowerCase();
    if (!search) return quoteOptions;
    return quoteOptions.filter((option) => option.keywords.toLowerCase().includes(search) || option.label.toLowerCase().includes(search));
  }, [quoteOptions, quoteSearch]);

  const hasClientWarning = useMemo(() => {
    if (!preparation?.warnings?.length) return false;
    return preparation.warnings.some((warning) => {
      const normalized = warning.toLowerCase();
      return normalized.includes("client_id") && (normalized.includes("missing") || normalized.includes("manc") || normalized.includes("required") || normalized.includes("obblig"));
    });
  }, [preparation]);

  const canSubmit = !!form.quote_id && !createLoading && !(hasClientWarning && !form.client_id);

  const resetState = () => {
    setStep("source");
    setForm(EMPTY_FORM);
    setPreparation(null);
    setQuotes([]);
  };

  const handleClose = () => {
    if (preparingContractData || createLoading) return;
    resetState();
    onClose();
  };

  const ensureQuotes = async () => {
    if (quotes.length > 0 || loadingQuotes) return;
    setLoadingQuotes(true);
    try {
      const response = await getQuotesApi({
        company_id: companyId ?? undefined,
        per_page: 200,
        sort_by: "updated_at",
        sort_dir: "desc",
      });
      setQuotes((response.data ?? []).filter((quote) => quote.kind === "preventivo"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore caricamento preventivi");
    } finally {
      setLoadingQuotes(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    void ensureQuotes();
  }, [open, companyId]);

  const prepareContractFromQuote = async (quoteId: string) => {
    if (!quoteId) {
      toast.error("Seleziona un preventivo");
      return;
    }

    setPreparingContractData(true);
    try {
      const request = formToRequest({ ...form, quote_id: quoteId, commercial_stage: form.commercial_stage || "bozza" });
      request.commercial_stage = "bozza";
      const response = await contractFromQuoteDryRunApi(request);
      setPreparation(response);
      setForm(payloadToForm(response.contract_payload, Number(quoteId), companyId));
      setStep("configure");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore preparazione contratto");
    } finally {
      setPreparingContractData(false);
    }
  };

  const handleCreate = async () => {
    if (!canSubmit || step !== "configure") return;
    if (!form.quote_id) {
      toast.error("Seleziona un preventivo");
      return;
    }
    if (hasClientWarning && !form.client_id) {
      toast.error("Seleziona cliente prima della creazione");
      return;
    }

    setCreateLoading(true);
    try {
      const request = formToRequest({ ...form, commercial_stage: form.commercial_stage || "bozza" });
      request.commercial_stage = "bozza";
      const created = await createContractFromQuoteApi(request);
      toast.success("Contratto bozza creato da preventivo");
      resetState();
      onClose();
      onCreated?.(created);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore creazione contratto da preventivo");
    } finally {
      setCreateLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Genera contratto da preventivo"
      size="xl"
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={preparingContractData || createLoading}>
            Chiudi
          </Button>
          {step === "configure" && (
            <Button onClick={() => void handleCreate()} loading={createLoading} disabled={!canSubmit}>
              Crea contratto bozza
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        {preparingContractData && (
          <div className="rounded-md border border-line dark:border-line-dark p-4 flex items-center gap-2 text-sm text-muted dark:text-muted-dark">
            <Spinner size="sm" />
            Sto preparando i dati del contratto...
          </div>
        )}

        {step === "source" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <button
              type="button"
              className="rounded-lg border border-line dark:border-line-dark bg-paper dark:bg-[#131316] p-4 text-left transition-colors hover:bg-cream dark:hover:bg-[#1c1c20]"
              onClick={() => {
                setStep("pick-existing");
                void ensureQuotes();
              }}
            >
              <div className="text-sm font-semibold text-ink dark:text-paper">Usa un preventivo esistente</div>
              <p className="mt-1 text-xs text-muted dark:text-muted-dark">Seleziona un preventivo gia presente e continua.</p>
            </button>

            <button
              type="button"
              className="rounded-lg border border-line dark:border-line-dark bg-paper dark:bg-[#131316] p-4 text-left transition-colors hover:bg-cream dark:hover:bg-[#1c1c20]"
              onClick={() => setCreateQuoteOpen(true)}
            >
              <div className="text-sm font-semibold text-ink dark:text-paper">Crea un nuovo preventivo</div>
              <p className="mt-1 text-xs text-muted dark:text-muted-dark">Apri il modulo guidato e crea un nuovo preventivo.</p>
            </button>
          </div>
        )}

        {step === "pick-existing" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">Step 1 · Seleziona preventivo</div>
              <Button variant="ghost" size="sm" onClick={() => setStep("source")}>Indietro</Button>
            </div>
            <div className="space-y-2">
              <Input
                label="Cerca preventivo"
                value={quoteSearch}
                onChange={(event) => setQuoteSearch(event.target.value)}
                placeholder="Cerca per numero o titolo..."
              />
              <div className="rounded-md border border-line dark:border-line-dark bg-paper dark:bg-[#131316] max-h-72 overflow-auto">
                {loadingQuotes ? (
                  <div className="p-3 text-sm text-muted dark:text-muted-dark">Caricamento preventivi...</div>
                ) : filteredQuoteOptions.length === 0 ? (
                  <div className="p-3 text-sm text-muted dark:text-muted-dark">Nessun preventivo trovato</div>
                ) : (
                  <ul className="divide-y divide-line dark:divide-line-dark">
                    {filteredQuoteOptions.map((option) => {
                      const selected = option.value === form.quote_id;
                      return (
                        <li key={option.value}>
                          <button
                            type="button"
                            className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                              selected
                                ? "bg-cream dark:bg-[#1c1c20] text-ink dark:text-paper"
                                : "hover:bg-cream dark:hover:bg-[#1c1c20] text-muted dark:text-muted-dark"
                            }`}
                            onClick={() => setForm((current) => ({ ...current, quote_id: option.value }))}
                          >
                            {option.label}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Button variant="secondary" onClick={() => void ensureQuotes()} loading={loadingQuotes}>
                Aggiorna lista
              </Button>
              <Button variant="primary" onClick={() => setCreateQuoteOpen(true)}>
                Nuovo preventivo
              </Button>
              <Button
                onClick={() => void prepareContractFromQuote(form.quote_id)}
                loading={preparingContractData}
                disabled={!form.quote_id}
              >
                Continua
              </Button>
            </div>
          </div>
        )}

        {step === "configure" && (
          <>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">Step 2 · Verifica e crea contratto</div>
            <div className="rounded-md border border-line dark:border-line-dark p-3 bg-paper dark:bg-[#131316]">
              <div className="text-[11px] uppercase tracking-wider text-muted dark:text-muted-dark">Origine preventivo</div>
              <div className="mt-1 text-sm font-semibold text-ink dark:text-paper">
                #{preparation?.quote.number ?? form.quote_id} · {preparation?.quote.title || preparation?.quote.tag || "Preventivo"}
              </div>
              <div className="mt-1 text-xs text-muted dark:text-muted-dark">
                {preparation ? `ID ${preparation.quote.id} · Stato ${preparation.quote.status} · Data ${preparation.quote.date}` : "Verifica i dati e crea il contratto."}
              </div>
            </div>

            {(preparation?.warnings.length ?? 0) > 0 && (
              <div className="rounded-md border border-warning/30 bg-warning/10 p-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-warning">Attenzioni</div>
                <ul className="mt-1 space-y-1 text-sm text-warning">
                  {preparation?.warnings.map((warning, index) => (
                    <li key={`${warning}-${index}`}>- {warning}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-end">
              <Button variant="ghost" size="sm" onClick={() => setStep("pick-existing")}>Cambia preventivo</Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Input label="Titolo contratto" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">Cliente</label>
                <ClientSelectorWithCreate
                  value={form.client_id}
                  onChange={(value) => setForm((current) => ({ ...current, client_id: value }))}
                  clients={clients}
                  companyId={form.company_id ? Number(form.company_id) : companyId}
                  placeholder="Seleziona cliente"
                  emptyMessage="Nessun cliente"
                  menuLayer="portal"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">Stage commerciale</label>
                <SearchableSelect
                  value={form.commercial_stage || "bozza"}
                  onChange={(value) => setForm((current) => ({ ...current, commercial_stage: value as ContractCommercialStage }))}
                  options={CONTRACT_STAGE_ORDER.map((stage) => ({ value: stage, label: CONTRACT_STAGE_LABELS[stage] }))}
                  menuLayer="portal"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">Tipo contratto</label>
                <SearchableSelect
                  value={form.contract_type}
                  onChange={(value) => setForm((current) => ({ ...current, contract_type: value as "" | ContractType }))}
                  options={[
                    { value: "commercial", label: "Commerciale" },
                    { value: "execution", label: "Execution" },
                  ]}
                  menuLayer="portal"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">Tipo ingaggio</label>
                <SearchableSelect
                  value={form.engagement_type}
                  onChange={(value) => setForm((current) => ({ ...current, engagement_type: value as "" | ContractEngagementType }))}
                  options={[
                    { value: "", label: "Non impostato" },
                    { value: "one_time", label: "Una tantum" },
                    { value: "ongoing", label: "Continuativo" },
                  ]}
                  menuLayer="portal"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">Pricing view</label>
                <SearchableSelect
                  value={form.pricing_view_mode}
                  onChange={(value) => setForm((current) => ({ ...current, pricing_view_mode: value as "" | ContractPricingMode }))}
                  options={[
                    { value: "aggregated", label: "Totale aggregato" },
                    { value: "single_quote", label: "Preventivo principale" },
                  ]}
                  menuLayer="portal"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Input label="Data inizio" type="date" value={form.start_date} onChange={(event) => setForm((current) => ({ ...current, start_date: event.target.value }))} />
              <Input label="Data fine" type="date" value={form.end_date} onChange={(event) => setForm((current) => ({ ...current, end_date: event.target.value }))} />
              <Input label="Data firma" type="datetime-local" value={form.signed_at} onChange={(event) => setForm((current) => ({ ...current, signed_at: event.target.value }))} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">Note commerciali</label>
                <Textarea
                  rows={3}
                  value={form.commercial_notes}
                  onChange={(event) => setForm((current) => ({ ...current, commercial_notes: event.target.value }))}
                  className="w-full rounded-md border border-line dark:border-line-dark bg-paper dark:bg-[#1c1c20] px-3 py-2.5 text-sm text-ink dark:text-paper"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">Brief operativo</label>
                <Textarea
                  rows={3}
                  value={form.operational_brief}
                  onChange={(event) => setForm((current) => ({ ...current, operational_brief: event.target.value }))}
                  className="w-full rounded-md border border-line dark:border-line-dark bg-paper dark:bg-[#1c1c20] px-3 py-2.5 text-sm text-ink dark:text-paper"
                />
              </div>
            </div>
          </>
        )}
      </div>

      <QuoteQuickCreateModal
        open={createQuoteOpen}
        companyId={companyId}
        clients={clients}
        clientsLoading={clientsLoading}
        canSyncFromFic={canSyncFromFic}
        onClose={() => setCreateQuoteOpen(false)}
        onCreated={(quote) => {
          setCreateQuoteOpen(false);
          setQuotes((current) => {
            const exists = current.some((item) => item.id === quote.id);
            if (exists) return current;
            return [quote, ...current];
          });
          setForm((current) => ({
            ...current,
            quote_id: String(quote.id),
            client_id: quote.client_id != null ? String(quote.client_id) : current.client_id,
            company_id: quote.company_id != null ? String(quote.company_id) : current.company_id,
            title: current.title || quote.title || "",
            commercial_notes: current.commercial_notes || quote.appunti_commerciali || "",
            operational_brief: current.operational_brief || quote.brief_operativo || "",
          }));
          void prepareContractFromQuote(String(quote.id));
          toast.success("Preventivo creato. Procedi con la creazione del contratto.");
        }}
      />
    </Modal>
  );
}
