import { useEffect, useMemo, useState } from "react";
import {
  createContractApi,
  CONTRACT_STAGE_LABELS,
  CONTRACT_STAGE_ORDER,
  type ContractCommercialStage,
  type ContractDetailResponse,
  type ContractEngagementType,
  type ContractType,
} from "../../api/contracts";
import { createWorkAreaApi, listWorkAreasApi, type WorkArea } from "../../api/workAreas";
import { createWorkTagApi, listWorkTagsApi, type WorkTag } from "../../api/workTags";
import { formatEur, getQuotesApi, type Quote } from "../../api/quotes";
import type { Client } from "../../api/clients";
import { useToast } from "../../context/ToastContext";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";
import { MultiSelect } from "../ui/MultiSelect";
import { SearchableSelect } from "../ui/SearchableSelect";
import { Textarea } from "../ui/Textarea";
import { Icon } from "../ui/Icon";
import { Spinner } from "../ui/Spinner";
import { WorkAreaCreateModal } from "../work-taxonomy/WorkAreaCreateModal";
import { WorkTagCreateModal } from "../work-taxonomy/WorkTagCreateModal";
import { QuoteQuickCreateModal } from "../contracts/QuoteQuickCreateModal";

type WizardForm = {
  client_id: string;
  title: string;
  contract_type: ContractType;
  engagement_type: "" | ContractEngagementType;
  commercial_stage: ContractCommercialStage;
  execution_stage: string;
  stage_sent_at: string;
  stage_negotiation_at: string;
  stage_accepted_at: string;
  contract_sent_at: string;
  signed_at: string;
  in_production_at: string;
  completed_at: string;
  lost_at: string;
  start_date: string;
  end_date: string;
  commercial_notes: string;
  operational_brief: string;
  tag_ids: number[];
  work_area_ids: number[];
};

const EMPTY_FORM: WizardForm = {
  client_id: "",
  title: "",
  contract_type: "commercial",
  engagement_type: "",
  commercial_stage: "bozza",
  execution_stage: "",
  stage_sent_at: "",
  stage_negotiation_at: "",
  stage_accepted_at: "",
  contract_sent_at: "",
  signed_at: "",
  in_production_at: "",
  completed_at: "",
  lost_at: "",
  start_date: "",
  end_date: "",
  commercial_notes: "",
  operational_brief: "",
  tag_ids: [],
  work_area_ids: [],
};

type TimelineKey =
  | "stage_sent_at"
  | "stage_negotiation_at"
  | "stage_accepted_at"
  | "contract_sent_at"
  | "signed_at"
  | "in_production_at"
  | "completed_at";

/** Ogni milestone di pipeline ha un timestamp dedicato. */
const STAGE_TIMELINE: { stage: ContractCommercialStage; field: TimelineKey; label: string }[] = [
  { stage: "inviato", field: "stage_sent_at", label: "Inviato il" },
  { stage: "in_trattativa", field: "stage_negotiation_at", label: "In trattativa dal" },
  { stage: "accettato", field: "stage_accepted_at", label: "Accettato il" },
  { stage: "contratto_inviato", field: "contract_sent_at", label: "Contratto inviato il" },
  { stage: "firmato", field: "signed_at", label: "Firmato il" },
  { stage: "in_produzione", field: "in_production_at", label: "In produzione dal" },
  { stage: "completato", field: "completed_at", label: "Completato il" },
];

/** In creazione mostriamo direttamente solo le date che contano di più; le altre vanno
    in una sezione espandibile per non appesantire il form. */
const PRIMARY_TIMELINE_STAGES = new Set<ContractCommercialStage>(["accettato", "firmato", "in_produzione"]);

const STEPS = [
  { id: 1, title: "Cliente" },
  { id: 2, title: "Stato & timeline" },
  { id: 3, title: "Periodo & preventivi" },
  { id: 4, title: "Note & classificazione" },
  { id: 5, title: "Riepilogo" },
] as const;

function toIsoDatetimeValue(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function SituationWizardModal({
  open,
  companyId,
  clients,
  clientsLoading = false,
  canCreateTaxonomy = false,
  canSyncFromFic = false,
  onClose,
  onCreated,
}: {
  open: boolean;
  companyId: number | null;
  clients: Client[];
  clientsLoading?: boolean;
  canCreateTaxonomy?: boolean;
  canSyncFromFic?: boolean;
  onClose: () => void;
  onCreated?: (contract: ContractDetailResponse) => void;
}) {
  const toast = useToast();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<WizardForm>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [availableTags, setAvailableTags] = useState<WorkTag[]>([]);
  const [availableAreas, setAvailableAreas] = useState<WorkArea[]>([]);
  const [taxonomyLoading, setTaxonomyLoading] = useState(false);
  const [creatingTag, setCreatingTag] = useState(false);
  const [creatingArea, setCreatingArea] = useState(false);
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [areaModalOpen, setAreaModalOpen] = useState(false);
  const [notesTab, setNotesTab] = useState<"commercial" | "operational">("commercial");

  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [selectedQuoteIds, setSelectedQuoteIds] = useState<number[]>([]);
  const [primaryQuoteId, setPrimaryQuoteId] = useState<number | null>(null);
  const [quoteCreateOpen, setQuoteCreateOpen] = useState(false);

  const updateForm = <K extends keyof WizardForm>(key: K, value: WizardForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  // Reset all'apertura
  useEffect(() => {
    if (!open) return;
    setStep(1);
    setForm(EMPTY_FORM);
    setError(null);
    setNotesTab("commercial");
    setQuotes([]);
    setSelectedQuoteIds([]);
    setPrimaryQuoteId(null);
    setQuoteCreateOpen(false);
  }, [open]);

  // Carica taxonomy (tag + aree)
  useEffect(() => {
    if (!open || companyId == null) return;
    let cancelled = false;
    setTaxonomyLoading(true);
    Promise.all([
      listWorkTagsApi({ company_id: companyId }),
      listWorkAreasApi({ company_id: companyId }),
    ])
      .then(([tags, areas]) => {
        if (cancelled) return;
        setAvailableTags(tags);
        setAvailableAreas(areas);
      })
      .catch(() => {
        if (cancelled) return;
        setAvailableTags([]);
        setAvailableAreas([]);
      })
      .finally(() => {
        if (cancelled) return;
        setTaxonomyLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, companyId]);

  // Carica preventivi del cliente selezionato (quando si raggiunge lo step 3)
  useEffect(() => {
    if (!open || step !== 3 || companyId == null || !form.client_id) {
      return;
    }
    let cancelled = false;
    setQuotesLoading(true);
    getQuotesApi({ company_id: companyId, client_id: Number(form.client_id), per_page: 200 })
      .then((res) => {
        if (cancelled) return;
        setQuotes((res.data ?? []).filter((quote) => quote.kind === "preventivo" && quote.is_active));
      })
      .catch(() => {
        if (cancelled) return;
        setQuotes([]);
      })
      .finally(() => {
        if (cancelled) return;
        setQuotesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, step, companyId, form.client_id]);

  const clientOptions = useMemo(
    () =>
      clients.map((client) => ({
        value: String(client.id),
        label: client.commercial_name ?? client.name,
        keywords: `${client.commercial_name ?? ""} ${client.name} ${client.email ?? ""} ${client.vat ?? ""}`,
      })),
    [clients]
  );

  const tagOptions = useMemo(
    () => availableTags.map((tag) => ({ id: tag.id, label: tag.name, color: tag.color })),
    [availableTags]
  );
  const areaOptions = useMemo(
    () => availableAreas.map((area) => ({ id: area.id, label: area.name, color: area.color })),
    [availableAreas]
  );

  const selectedClient = useMemo(
    () => clients.find((client) => String(client.id) === form.client_id) ?? null,
    [clients, form.client_id]
  );

  const isPerso = form.commercial_stage === "perso";
  const stageIndex = CONTRACT_STAGE_ORDER.indexOf(form.commercial_stage);
  const relevantMilestones = useMemo(() => {
    if (isPerso) return [];
    return STAGE_TIMELINE.filter((milestone) => CONTRACT_STAGE_ORDER.indexOf(milestone.stage) <= stageIndex);
  }, [isPerso, stageIndex]);
  const primaryMilestones = useMemo(
    () => relevantMilestones.filter((m) => PRIMARY_TIMELINE_STAGES.has(m.stage)),
    [relevantMilestones]
  );
  const secondaryMilestones = useMemo(
    () => relevantMilestones.filter((m) => !PRIMARY_TIMELINE_STAGES.has(m.stage)),
    [relevantMilestones]
  );

  const handleClientChange = (value: string) => {
    const next = clients.find((client) => String(client.id) === value);
    // I preventivi sono per-cliente: cambiando cliente azzero la selezione.
    if (value !== form.client_id) {
      setQuotes([]);
      setSelectedQuoteIds([]);
      setPrimaryQuoteId(null);
    }
    setForm((current) => ({
      ...current,
      client_id: value,
      title:
        current.title.trim().length > 0
          ? current.title
          : `Situazione cliente - ${next?.commercial_name ?? next?.name ?? ""}`,
    }));
  };

  const handleQuoteCreated = (quote: Quote) => {
    setQuoteCreateOpen(false);
    setQuotes((current) => (current.some((item) => item.id === quote.id) ? current : [quote, ...current]));
    setSelectedQuoteIds((current) => (current.includes(quote.id) ? current : [...current, quote.id]));
    setPrimaryQuoteId((prev) => prev ?? quote.id);
  };

  const toggleQuote = (quoteId: number) => {
    setSelectedQuoteIds((current) => {
      if (current.includes(quoteId)) {
        const next = current.filter((id) => id !== quoteId);
        setPrimaryQuoteId((prev) => {
          if (prev !== quoteId) return prev;
          return next[0] ?? null;
        });
        return next;
      }
      const next = [...current, quoteId];
      setPrimaryQuoteId((prev) => prev ?? quoteId);
      return next;
    });
  };

  const handleCreateTag = async (name: string) => {
    if (!companyId || !name.trim()) return;
    setCreatingTag(true);
    try {
      const created = await createWorkTagApi({ company_id: companyId, name: name.trim(), color: "#6366f1" });
      setAvailableTags((prev) => (prev.some((item) => item.id === created.id) ? prev : [...prev, created]));
      setForm((current) => ({
        ...current,
        tag_ids: current.tag_ids.includes(created.id) ? current.tag_ids : [...current.tag_ids, created.id],
      }));
      toast.success("Tag creato");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore creazione tag");
      throw err;
    } finally {
      setCreatingTag(false);
    }
  };

  const handleCreateArea = async (name: string) => {
    if (!companyId || !name.trim()) return;
    setCreatingArea(true);
    try {
      const created = await createWorkAreaApi({ company_id: companyId, name: name.trim() });
      setAvailableAreas((prev) => (prev.some((item) => item.id === created.id) ? prev : [...prev, created]));
      setForm((current) => ({
        ...current,
        work_area_ids: current.work_area_ids.includes(created.id)
          ? current.work_area_ids
          : [...current.work_area_ids, created.id],
      }));
      toast.success("Area creata");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore creazione area");
      throw err;
    } finally {
      setCreatingArea(false);
    }
  };

  const step1Valid = !!form.client_id && form.title.trim().length > 0;
  const dateRangeValid = !(form.start_date && form.end_date && form.end_date < form.start_date);

  const handleClose = () => {
    if (creating) return;
    onClose();
  };

  const goNext = () => {
    setError(null);
    if (step === 1 && !step1Valid) {
      setError("Seleziona un cliente e inserisci un titolo.");
      return;
    }
    if (step === 3 && !dateRangeValid) {
      setError("La data fine non puo essere precedente alla data inizio.");
      return;
    }
    setStep((current) => Math.min(STEPS.length, current + 1));
  };

  const goBack = () => {
    setError(null);
    setStep((current) => Math.max(1, current - 1));
  };

  const handleCreate = async () => {
    if (companyId == null) {
      setError("Seleziona una company valida.");
      return;
    }
    if (!step1Valid) {
      setError("Seleziona un cliente e inserisci un titolo.");
      setStep(1);
      return;
    }
    if (!dateRangeValid) {
      setError("La data fine non puo essere precedente alla data inizio.");
      setStep(3);
      return;
    }

    const quoteLinks = selectedQuoteIds.map((quoteId, index) => ({
      quote_id: quoteId,
      include_in_total: true,
      is_primary: (primaryQuoteId ?? selectedQuoteIds[0]) === quoteId,
      display_order: index,
      label: null,
    }));

    setError(null);
    setCreating(true);
    try {
      const created = await createContractApi({
        company_id: companyId,
        client_id: Number(form.client_id),
        // Creato dalla pagina Situazione clienti → contratto e preventivi collegati
        // NON devono comparire nella pipeline commerciale.
        created_from: "situation",
        title: form.title.trim(),
        contract_type: form.contract_type,
        engagement_type: form.engagement_type || null,
        commercial_stage: form.commercial_stage,
        execution_stage: form.execution_stage.trim() || null,
        stage_sent_at: isPerso ? null : toIsoDatetimeValue(form.stage_sent_at),
        stage_negotiation_at: isPerso ? null : toIsoDatetimeValue(form.stage_negotiation_at),
        stage_accepted_at: isPerso ? null : toIsoDatetimeValue(form.stage_accepted_at),
        contract_sent_at: isPerso ? null : toIsoDatetimeValue(form.contract_sent_at),
        signed_at: isPerso ? null : toIsoDatetimeValue(form.signed_at),
        in_production_at: isPerso ? null : toIsoDatetimeValue(form.in_production_at),
        completed_at: isPerso ? null : toIsoDatetimeValue(form.completed_at),
        lost_at: isPerso ? toIsoDatetimeValue(form.lost_at) : null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        commercial_notes: form.commercial_notes.trim() || null,
        operational_brief: form.operational_brief.trim() || null,
        pricing_view_mode: "aggregated",
        featured_quote_id: primaryQuoteId,
        quote_links: quoteLinks,
        tag_ids: form.tag_ids,
        work_area_ids: form.work_area_ids,
      });

      toast.success("Situazione cliente creata");
      onClose();
      onCreated?.(created);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Errore creazione situazione cliente";
      setError(message);
      toast.error(message);
    } finally {
      setCreating(false);
    }
  };

  const selectedQuotesTotal = useMemo(
    () =>
      quotes
        .filter((quote) => selectedQuoteIds.includes(quote.id))
        .reduce((sum, quote) => sum + (quote.totals?.total ?? 0), 0),
    [quotes, selectedQuoteIds]
  );

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Nuova situazione cliente"
      size="2xl"
      persistDraft={false}
      dialogClassName="h-[640px] max-h-[88vh]"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <Button variant="ghost" onClick={handleClose} disabled={creating}>
            Annulla
          </Button>
          <div className="flex items-center gap-2">
            {step > 1 && (
              <Button variant="secondary" onClick={goBack} disabled={creating}>
                Indietro
              </Button>
            )}
            {step < STEPS.length ? (
              <Button variant="primary" onClick={goNext} disabled={step === 1 && !step1Valid}>
                Avanti
              </Button>
            ) : (
              <Button variant="primary" onClick={handleCreate} loading={creating}>
                Crea situazione
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Stepper */}
        <ol className="flex items-center gap-1">
          {STEPS.map((item, index) => {
            const state = item.id === step ? "current" : item.id < step ? "done" : "todo";
            return (
              <li key={item.id} className="flex flex-1 items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    if (item.id < step) setStep(item.id);
                  }}
                  disabled={item.id > step}
                  className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
                    item.id < step ? "cursor-pointer hover:bg-cream dark:hover:bg-[#1c1c20]" : "cursor-default"
                  }`}
                  title={item.title}
                >
                  <span
                    className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                      state === "current"
                        ? "bg-ink text-paper dark:bg-paper dark:text-ink"
                        : state === "done"
                          ? "bg-success/15 text-success border border-success/30"
                          : "bg-cream text-muted dark:bg-[#1c1c20] dark:text-muted-dark"
                    }`}
                  >
                    {state === "done" ? <Icon name="check" className="h-3.5 w-3.5" /> : item.id}
                  </span>
                  <span
                    className={`hidden text-[11px] font-semibold uppercase tracking-wider sm:inline ${
                      state === "current" ? "text-ink dark:text-paper" : "text-muted dark:text-muted-dark"
                    }`}
                  >
                    {item.title}
                  </span>
                </button>
                {index < STEPS.length - 1 && (
                  <span className={`h-px flex-1 ${item.id < step ? "bg-success/40" : "bg-line dark:bg-line-dark"}`} />
                )}
              </li>
            );
          })}
        </ol>

        {error && (
          <div className="rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</div>
        )}

        {/* Step 1 — Cliente & tipo */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
                  Cliente *
                </label>
                <SearchableSelect
                  value={form.client_id}
                  onChange={handleClientChange}
                  options={clientOptions}
                  placeholder={clientsLoading ? "Caricamento clienti..." : "Seleziona cliente"}
                  searchPlaceholder="Cerca cliente..."
                  disabled={clientsLoading}
                />
              </div>
              <Input
                label="Titolo *"
                value={form.title}
                onChange={(event) => updateForm("title", event.target.value)}
                placeholder="Situazione cliente - La Perla Del Mare"
              />
            </div>
          </div>
        )}

        {/* Step 2 — Stato & timeline */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
                A che punto e la situazione?
              </label>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {CONTRACT_STAGE_ORDER.map((stage) => {
                  const active = form.commercial_stage === stage;
                  const isLost = stage === "perso";
                  return (
                    <button
                      key={stage}
                      type="button"
                      onClick={() => updateForm("commercial_stage", stage)}
                      className={`rounded-pill border px-3 py-1.5 text-xs font-semibold transition-colors ${
                        active
                          ? isLost
                            ? "border-danger bg-danger/10 text-danger"
                            : "border-ink bg-ink text-paper dark:border-paper dark:bg-paper dark:text-ink"
                          : "border-line text-muted dark:border-line-dark dark:text-muted-dark hover:bg-cream dark:hover:bg-[#1c1c20]"
                      }`}
                    >
                      {CONTRACT_STAGE_LABELS[stage]}
                    </button>
                  );
                })}
              </div>
            </div>

            <Input
              label="Situazione operativa (opzionale)"
              value={form.execution_stage}
              onChange={(event) => updateForm("execution_stage", event.target.value)}
              placeholder="Es. onboarding, in_produzione..."
            />

            <div className="rounded-md border border-line dark:border-line-dark p-3">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
                Timeline {isPerso ? "perdita" : "milestone raggiunte"}
              </div>
              {isPerso ? (
                <Input
                  label="Perso il"
                  type="date"
                  value={form.lost_at}
                  onChange={(event) => updateForm("lost_at", event.target.value)}
                />
              ) : relevantMilestones.length === 0 ? (
                <div className="text-sm text-muted dark:text-muted-dark">
                  In bozza non ci sono ancora milestone da datare. Le date compariranno man mano che avanzi lo stato.
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-[11px] text-muted dark:text-muted-dark">
                    Le date sono facoltative: in alcuni casi fa fede solo il preventivo.
                  </p>
                  {primaryMilestones.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {primaryMilestones.map((milestone) => (
                        <Input
                          key={milestone.field}
                          label={milestone.label}
                          type="date"
                          value={form[milestone.field]}
                          onChange={(event) => updateForm(milestone.field, event.target.value)}
                        />
                      ))}
                    </div>
                  )}
                  {secondaryMilestones.length > 0 && (
                    <details className="group rounded-md border border-line dark:border-line-dark">
                      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
                        <Icon name="chevron-right" className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
                        Altre date (facoltative)
                      </summary>
                      <div className="grid grid-cols-1 gap-3 px-3 pb-3 md:grid-cols-3">
                        {secondaryMilestones.map((milestone) => (
                          <Input
                            key={milestone.field}
                            label={milestone.label}
                            type="date"
                            value={form[milestone.field]}
                            onChange={(event) => updateForm(milestone.field, event.target.value)}
                          />
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 3 — Periodo & preventivi */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
                Periodo del servizio (facoltativo)
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Input
                  label="Inizio periodo"
                  type="date"
                  value={form.start_date}
                  onChange={(event) => updateForm("start_date", event.target.value)}
                  help={{
                    title: "Inizio periodo",
                    shortText: "Data di inizio del servizio/contratto per questo cliente.",
                    longText:
                      "Non è un filtro sui preventivi: indica da quando parte l'erogazione. Lascia vuoto se non rilevante.",
                  }}
                />
                <Input
                  label="Fine periodo"
                  type="date"
                  value={form.end_date}
                  onChange={(event) => updateForm("end_date", event.target.value)}
                  help={{
                    title: "Fine periodo",
                    shortText: "Data di fine prevista del servizio/contratto.",
                    longText:
                      "Non è un filtro sui preventivi. Lascia vuoto se il servizio è continuativo o a tempo indeterminato.",
                  }}
                />
              </div>
            </div>

            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
                  Preventivi collegati
                </label>
                <div className="flex items-center gap-3">
                  {selectedQuoteIds.length > 0 && (
                    <span className="text-[11px] text-muted dark:text-muted-dark">
                      {selectedQuoteIds.length} selezionati · Totale {formatEur(selectedQuotesTotal)}
                    </span>
                  )}
                  {canSyncFromFic && (
                    <Button
                      variant="secondary"
                      size="sm"
                      leftIcon={<Icon name="refresh-cw" className="h-3.5 w-3.5" />}
                      onClick={() => setQuoteCreateOpen(true)}
                      disabled={!form.client_id}
                    >
                      Sincronizza da FiC
                    </Button>
                  )}
                </div>
              </div>

              {quotesLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Spinner />
                </div>
              ) : quotes.length === 0 ? (
                <div className="rounded-md border border-dashed border-line dark:border-line-dark px-3 py-5 text-center text-sm text-muted dark:text-muted-dark">
                  Nessun preventivo disponibile per questo cliente.
                </div>
              ) : (
                <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                  {quotes.map((quote) => {
                    const selected = selectedQuoteIds.includes(quote.id);
                    const isPrimary = primaryQuoteId === quote.id;
                    return (
                      <div
                        key={quote.id}
                        className={`rounded-md border p-2.5 transition-colors ${
                          selected
                            ? "border-ink bg-ink/5 dark:border-paper dark:bg-paper/10"
                            : "border-line dark:border-line-dark"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => toggleQuote(quote.id)}
                            className="min-w-0 flex-1 text-left"
                          >
                            <div className="truncate text-sm font-semibold text-ink dark:text-paper">
                              {quote.title || `Preventivo #${quote.number}`}
                            </div>
                            <div className="text-[11px] text-muted dark:text-muted-dark">
                              #{quote.number} · {quote.status} · {formatEur(quote.totals?.total ?? 0)}
                            </div>
                          </button>
                          <div className="flex items-center gap-2">
                            {selected && (
                              <button
                                type="button"
                                onClick={() => setPrimaryQuoteId(quote.id)}
                                className={`rounded-pill border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                                  isPrimary
                                    ? "border-success bg-success/10 text-success"
                                    : "border-line text-muted dark:border-line-dark dark:text-muted-dark hover:bg-cream dark:hover:bg-[#1c1c20]"
                                }`}
                              >
                                {isPrimary ? "Principale" : "Rendi principale"}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => toggleQuote(quote.id)}
                              className={`inline-flex h-6 w-6 items-center justify-center rounded-md border transition-colors ${
                                selected
                                  ? "border-ink bg-ink text-paper dark:border-paper dark:bg-paper dark:text-ink"
                                  : "border-line text-muted dark:border-line-dark dark:text-muted-dark"
                              }`}
                              aria-label={selected ? "Rimuovi preventivo" : "Collega preventivo"}
                            >
                              <Icon name={selected ? "check" : "plus"} className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 4 — Note & classificazione */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <MultiSelect
                label="Aree di lavoro"
                value={form.work_area_ids}
                onChange={(value) => updateForm("work_area_ids", value)}
                options={areaOptions}
                placeholder={taxonomyLoading ? "Caricamento aree..." : "Seleziona aree"}
                onCreateClick={canCreateTaxonomy ? () => setAreaModalOpen(true) : undefined}
                onCreateOption={canCreateTaxonomy ? handleCreateArea : undefined}
                createLoading={creatingArea}
                createActionLabel="Crea area"
              />
              <MultiSelect
                label="Tag"
                value={form.tag_ids}
                onChange={(value) => updateForm("tag_ids", value)}
                options={tagOptions}
                placeholder={taxonomyLoading ? "Caricamento tag..." : "Seleziona tag"}
                onCreateClick={canCreateTaxonomy ? () => setTagModalOpen(true) : undefined}
                onCreateOption={canCreateTaxonomy ? handleCreateTag : undefined}
                createLoading={creatingTag}
                createActionLabel="Crea tag"
              />
            </div>

            <div className="space-y-2">
              <div className="inline-flex rounded-md border border-line dark:border-line-dark p-1 gap-1">
                <button
                  type="button"
                  onClick={() => setNotesTab("commercial")}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                    notesTab === "commercial"
                      ? "bg-ink text-paper dark:bg-paper dark:text-ink"
                      : "text-muted dark:text-muted-dark hover:bg-cream dark:hover:bg-[#1c1c20]"
                  }`}
                >
                  Accordi commerciali
                </button>
                <button
                  type="button"
                  onClick={() => setNotesTab("operational")}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                    notesTab === "operational"
                      ? "bg-ink text-paper dark:bg-paper dark:text-ink"
                      : "text-muted dark:text-muted-dark hover:bg-cream dark:hover:bg-[#1c1c20]"
                  }`}
                >
                  Brief operativo
                </button>
              </div>

              {notesTab === "commercial" ? (
                <Textarea
                  rows={4}
                  value={form.commercial_notes}
                  onChange={(event) => updateForm("commercial_notes", event.target.value)}
                  placeholder="Accordi economici concordati, condizioni, obiezioni..."
                />
              ) : (
                <Textarea
                  rows={4}
                  value={form.operational_brief}
                  onChange={(event) => updateForm("operational_brief", event.target.value)}
                  placeholder="Attivita operative, vincoli e priorita del cliente..."
                />
              )}
            </div>
          </div>
        )}

        {/* Step 5 — Riepilogo */}
        {step === 5 && (
          <div className="space-y-3">
            <div className="rounded-md border border-line dark:border-line-dark divide-y divide-line dark:divide-line-dark">
              <SummaryRow label="Cliente" value={selectedClient?.commercial_name ?? selectedClient?.name ?? "-"} />
              <SummaryRow label="Titolo" value={form.title.trim() || "-"} />
              <SummaryRow label="Stato" value={CONTRACT_STAGE_LABELS[form.commercial_stage]} />
              {form.execution_stage.trim() && (
                <SummaryRow label="Situazione operativa" value={form.execution_stage.trim()} />
              )}
              <SummaryRow
                label="Periodo"
                value={form.start_date || form.end_date ? `${form.start_date || "-"} → ${form.end_date || "-"}` : "-"}
              />
              <SummaryRow
                label="Preventivi"
                value={
                  selectedQuoteIds.length > 0
                    ? `${selectedQuoteIds.length} collegati · Totale ${formatEur(selectedQuotesTotal)}`
                    : "Nessuno"
                }
              />
              <SummaryRow
                label="Aree / Tag"
                value={`${form.work_area_ids.length} aree · ${form.tag_ids.length} tag`}
              />
            </div>
            <p className="text-[12px] text-muted dark:text-muted-dark">
              Conferma per creare la situazione. Potrai modificarla e arricchirla dal dettaglio subito dopo.
            </p>
          </div>
        )}
      </div>

      <WorkTagCreateModal
        open={tagModalOpen}
        companyId={companyId}
        onClose={() => setTagModalOpen(false)}
        onCreated={(tag) => {
          setAvailableTags((current) => (current.some((item) => item.id === tag.id) ? current : [...current, tag]));
          setForm((current) => ({
            ...current,
            tag_ids: current.tag_ids.includes(tag.id) ? current.tag_ids : [...current.tag_ids, tag.id],
          }));
          setTagModalOpen(false);
          toast.success("Tag creato");
        }}
      />

      <QuoteQuickCreateModal
        open={quoteCreateOpen}
        companyId={companyId}
        clients={clients}
        clientsLoading={clientsLoading}
        canSyncFromFic={canSyncFromFic}
        onClose={() => setQuoteCreateOpen(false)}
        onCreated={handleQuoteCreated}
      />

      <WorkAreaCreateModal
        open={areaModalOpen}
        companyId={companyId}
        onClose={() => setAreaModalOpen(false)}
        onCreated={(area) => {
          setAvailableAreas((current) => (current.some((item) => item.id === area.id) ? current : [...current, area]));
          setForm((current) => ({
            ...current,
            work_area_ids: current.work_area_ids.includes(area.id)
              ? current.work_area_ids
              : [...current.work_area_ids, area.id],
          }));
          setAreaModalOpen(false);
          toast.success("Area creata");
        }}
      />
    </Modal>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 px-3 py-2">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">{label}</span>
      <span className="text-right text-sm text-ink dark:text-paper">{value}</span>
    </div>
  );
}
