import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CONTRACT_STAGE_LABELS,
  getContractApi,
  getContractWorkItemsCompletionApi,
  updateContractApi,
  type ContractDetailResponse,
  type ContractEngagementType,
  type ContractWorkItemsCompletionResponse,
  type ContractPricingMode,
  type ContractQuoteLink,
} from "../../api/contracts";
import { getClientsApi, type Client } from "../../api/clients";
import { formatEur, getQuoteApi, getQuotesApi, type Quote, type QuoteLineItem } from "../../api/quotes";
import { listWorkAreasApi, type WorkArea } from "../../api/workAreas";
import { listWorkTagsApi, type WorkTag } from "../../api/workTags";
import { useToast } from "../../context/ToastContext";
import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Checkbox";
import { Input } from "../ui/Input";
import { Icon } from "../ui/Icon";
import { Modal } from "../ui/Modal";
import { MultiSelect } from "../ui/MultiSelect";
import { Radio } from "../ui/Radio";
import { SearchableSelect } from "../ui/SearchableSelect";
import { Spinner } from "../ui/Spinner";
import { ClientSelectorWithCreate } from "../clients/ClientSelectorWithCreate";
import { WorkAreaCreateModal } from "../work-taxonomy/WorkAreaCreateModal";
import { WorkTagCreateModal } from "../work-taxonomy/WorkTagCreateModal";
import { RichTextEditor, hasRichTextContent } from "../ui/RichTextEditor";

interface ContractDetailModalProps {
  open: boolean;
  contractId: number | null;
  onClose: () => void;
  isAdmin: boolean;
  companyId?: number | null;
  onContractUpdated?: (updated: ContractDetailResponse) => void;
  onQuoteLineClick?: (line: QuoteLineItem, quoteId: number) => void;
  modalPosition?: "center" | "left" | "right";
  modalShowOverlay?: boolean;
  modalMobileFullscreen?: boolean;
  modalContainerClassName?: string;
  modalDialogClassName?: string;
  modalBodyClassName?: string;
  modalHideCloseButton?: boolean;
  modalInline?: boolean;
}

function toDatetimeLocalValue(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toIsoDatetimeValue(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function eventLabel(eventType: string): string {
  switch (eventType) {
    case "contract_created":
      return "Contratto creato";
    case "field_updated":
      return "Campo aggiornato";
    case "note_updated":
      return "Nota aggiornata";
    case "quote_links_updated":
      return "Preventivi collegati aggiornati";
    case "stage_changed":
      return "Stage modificato";
    case "stage_advanced":
      return "Stage avanzato";
    case "stage_regressed":
      return "Stage retrocesso";
    case "contract_deleted":
      return "Contratto eliminato";
    default:
      return eventType;
  }
}

export function ContractDetailModal({
  open,
  contractId,
  onClose,
  isAdmin,
  companyId,
  onContractUpdated,
  onQuoteLineClick,
  modalPosition = "center",
  modalShowOverlay = true,
  modalMobileFullscreen = false,
  modalContainerClassName = "",
  modalDialogClassName = "",
  modalBodyClassName = "",
  modalHideCloseButton = false,
  modalInline = false,
}: ContractDetailModalProps) {
  const navigate = useNavigate();
  const toast = useToast();

  const [detailLoading, setDetailLoading] = useState(false);
  const [detailData, setDetailData] = useState<ContractDetailResponse | null>(null);

  const [quoteLinksDraft, setQuoteLinksDraft] = useState<ContractQuoteLink[]>([]);
  const [pricingModeDraft, setPricingModeDraft] = useState<ContractPricingMode>("aggregated");
  const [availableQuotes, setAvailableQuotes] = useState<Quote[]>([]);
  const [availableClients, setAvailableClients] = useState<Client[]>([]);
  const [availableWorkTags, setAvailableWorkTags] = useState<WorkTag[]>([]);
  const [availableWorkAreas, setAvailableWorkAreas] = useState<WorkArea[]>([]);
  const [taxonomyLoading, setTaxonomyLoading] = useState(false);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [taxonomyCompanyId, setTaxonomyCompanyId] = useState<number | null>(null);
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [quoteWizardStep, setQuoteWizardStep] = useState<1 | 2 | 3>(1);
  const [quoteWizardOpen, setQuoteWizardOpen] = useState(false);
  const [quoteLinksSaving, setQuoteLinksSaving] = useState(false);
  const [editingQuoteLabelId, setEditingQuoteLabelId] = useState<number | null>(null);
  const [editingQuoteLabelValue, setEditingQuoteLabelValue] = useState("");

  const [commercialNotesDraft, setCommercialNotesDraft] = useState("");
  const [operationalBriefDraft, setOperationalBriefDraft] = useState("");
  const [lostNotesDraft, setLostNotesDraft] = useState("");
  const [engagementTypeDraft, setEngagementTypeDraft] = useState<"" | ContractEngagementType>("");
  const [signedAtDraft, setSignedAtDraft] = useState("");
  const [startDateDraft, setStartDateDraft] = useState("");
  const [endDateDraft, setEndDateDraft] = useState("");
  const [clientIdDraft, setClientIdDraft] = useState("");
  const [clientSaving, setClientSaving] = useState(false);
  const [detailTagIdsDraft, setDetailTagIdsDraft] = useState<number[]>([]);
  const [detailWorkAreaIdsDraft, setDetailWorkAreaIdsDraft] = useState<number[]>([]);
  const [workTagModalOpen, setWorkTagModalOpen] = useState(false);
  const [workAreaModalOpen, setWorkAreaModalOpen] = useState(false);
  const [activeMainTab, setActiveMainTab] = useState<"contract" | "tasks" | "client" | "quotes" | "timeline">("contract");
  const [activeNotesTab, setActiveNotesTab] = useState<"commercial" | "operational" | "lost">("commercial");
  const [notesSaving, setNotesSaving] = useState(false);
  const [expandedQuoteIds, setExpandedQuoteIds] = useState<number[]>([]);
  const [quoteLinesById, setQuoteLinesById] = useState<Record<number, QuoteLineItem[]>>({});
  const [quoteLinesLoadingById, setQuoteLinesLoadingById] = useState<Record<number, boolean>>({});
  const [quoteLinesErrorById, setQuoteLinesErrorById] = useState<Record<number, string>>({});
  const [workItemsCompletionLoading, setWorkItemsCompletionLoading] = useState(false);
  const [workItemsCompletionError, setWorkItemsCompletionError] = useState<string | null>(null);
  const [workItemsCompletion, setWorkItemsCompletion] = useState<ContractWorkItemsCompletionResponse | null>(null);

  const effectiveCompanyId = companyId ?? detailData?.company_id ?? null;

  const workTagOptions = useMemo(
    () => availableWorkTags.map((tag) => ({ id: tag.id, label: tag.name, color: tag.color })),
    [availableWorkTags]
  );

  const workAreaOptions = useMemo(
    () => availableWorkAreas.map((area) => ({ id: area.id, label: area.name, color: area.color })),
    [availableWorkAreas]
  );

  const quoteMultiSelectOptions = useMemo(
    () => availableQuotes.map((quote) => ({ id: quote.id, label: `${quote.title} · ${quote.number}` })),
    [availableQuotes]
  );

  const quoteTitleById = useMemo(() => {
    const map = new Map<number, string>();
    availableQuotes.forEach((quote) => {
      map.set(quote.id, quote.title);
    });
    return map;
  }, [availableQuotes]);

  const selectedClient = useMemo(() => {
    const trimmed = clientIdDraft.trim();
    if (!trimmed) return null;
    const clientId = Number(trimmed);
    if (!Number.isInteger(clientId) || clientId <= 0) return null;
    return availableClients.find((client) => client.id === clientId) ?? null;
  }, [availableClients, clientIdDraft]);

  const selectedClientLocation = useMemo(() => {
    if (!selectedClient) return null;
    const locationParts = [selectedClient.city, selectedClient.prov, selectedClient.country]
      .filter((part): part is string => !!part && part.trim().length > 0);
    return locationParts.length > 0 ? locationParts.join(" · ") : null;
  }, [selectedClient]);

  const primaryQuoteCount = useMemo(
    () => quoteLinksDraft.filter((link) => link.is_primary).length,
    [quoteLinksDraft]
  );

  const hasPrimaryQuoteError = quoteLinksDraft.length > 0 && primaryQuoteCount !== 1;

  const isQuoteLinksDirty = useMemo(() => {
    if (!detailData) return false;

    const draftNormalized = normalizeLinks(quoteLinksDraft);
    const savedNormalized = normalizeLinks(
      (detailData.quote_links ?? [])
        .slice()
        .sort((a, b) => a.display_order - b.display_order)
    );

    if (pricingModeDraft !== detailData.pricing_view_mode) return true;
    if (draftNormalized.length !== savedNormalized.length) return true;

    return draftNormalized.some((link, index) => {
      const saved = savedNormalized[index];
      if (!saved) return true;
      return (
        link.quote_id !== saved.quote_id
        || link.include_in_total !== saved.include_in_total
        || link.is_primary !== saved.is_primary
        || (link.label ?? null) !== (saved.label ?? null)
      );
    });
  }, [detailData, pricingModeDraft, quoteLinksDraft]);

  const savedQuoteLinksNormalized = useMemo(() => {
    if (!detailData) return [];
    return normalizeLinks(
      (detailData.quote_links ?? [])
        .slice()
        .sort((a, b) => a.display_order - b.display_order)
    );
  }, [detailData]);

  const quoteLinksDiff = useMemo(() => {
    const draft = normalizeLinks(quoteLinksDraft);
    const savedById = new Map(savedQuoteLinksNormalized.map((link) => [link.quote_id, link]));
    const draftById = new Map(draft.map((link) => [link.quote_id, link]));

    const added = draft.filter((link) => !savedById.has(link.quote_id));
    const removed = savedQuoteLinksNormalized.filter((link) => !draftById.has(link.quote_id));
    const updated = draft.filter((link) => {
      const saved = savedById.get(link.quote_id);
      if (!saved) return false;
      return (
        link.include_in_total !== saved.include_in_total
        || link.is_primary !== saved.is_primary
        || (link.label ?? null) !== (saved.label ?? null)
      );
    });

    return { added, removed, updated, current: draft };
  }, [quoteLinksDraft, savedQuoteLinksNormalized]);

  const selectedQuoteIds = useMemo(
    () => quoteLinksDraft
      .slice()
      .sort((a, b) => a.display_order - b.display_order)
      .map((link) => link.quote_id),
    [quoteLinksDraft]
  );

  const canGoToStep2 = selectedQuoteIds.length > 0;
  const canGoToStep3 = selectedQuoteIds.length > 0 && !hasPrimaryQuoteError;
  const completionPercent = useMemo(() => {
    const value = workItemsCompletion?.completion_rate ?? 0;
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(100, value));
  }, [workItemsCompletion]);

  const applySelectedQuoteIds = useCallback((ids: number[]) => {
    setQuoteLinksDraft((current) => {
      const uniqueIds = Array.from(new Set(ids.filter((id) => Number.isInteger(id) && id > 0)));
      const currentById = new Map(current.map((link) => [link.quote_id, link]));

      const next = uniqueIds.map((id, index) => {
        const existing = currentById.get(id);
        if (existing) {
          return { ...existing, display_order: index };
        }
        return {
          quote_id: id,
          include_in_total: true,
          is_primary: false,
          display_order: index,
          label: quoteTitleById.get(id)?.trim() || null,
        } satisfies ContractQuoteLink;
      });

      const primaryStillPresent = next.some((link) => link.is_primary);
      if (!primaryStillPresent && next.length > 0) {
        next[0] = { ...next[0], is_primary: true };
      }

      return next;
    });
  }, [quoteTitleById]);

  const loadTaxonomyOptions = useCallback(async (targetCompanyId: number) => {
    setTaxonomyLoading(true);
    setTaxonomyCompanyId(targetCompanyId);
    try {
      const [tags, areas] = await Promise.all([
        listWorkTagsApi({ company_id: targetCompanyId }),
        listWorkAreasApi({ company_id: targetCompanyId }),
      ]);
      setAvailableWorkTags(tags);
      setAvailableWorkAreas(areas);
    } catch (err) {
      setAvailableWorkTags([]);
      setAvailableWorkAreas([]);
      throw err;
    } finally {
      setTaxonomyLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open || !contractId) return;

    let cancelled = false;
    setDetailLoading(true);

    void getContractApi(contractId)
      .then(async (detail) => {
        if (cancelled) return;

        setDetailData(detail);
        setQuoteLinksDraft(
          detail.quote_links
            .slice()
            .sort((a, b) => a.display_order - b.display_order)
        );
        setPricingModeDraft(detail.pricing_view_mode);
        setCommercialNotesDraft(detail.commercial_notes ?? "");
        setOperationalBriefDraft(detail.operational_brief ?? "");
        setLostNotesDraft(detail.lost_notes ?? "");
        setEngagementTypeDraft(detail.engagement_type ?? "");
        setSignedAtDraft(toDatetimeLocalValue(detail.signed_at));
        setStartDateDraft(detail.start_date ?? "");
        setEndDateDraft(detail.end_date ?? "");
        setClientIdDraft(detail.client_id != null ? String(detail.client_id) : "");
        setDetailTagIdsDraft((detail.tags ?? []).map((tag) => tag.id));
        setDetailWorkAreaIdsDraft((detail.work_areas ?? []).map((area) => area.id));
        setQuoteWizardStep(1);
        setEditingQuoteLabelId(null);
        setEditingQuoteLabelValue("");

        if (taxonomyCompanyId !== detail.company_id) {
          try {
            await loadTaxonomyOptions(detail.company_id);
          } catch (taxonomyErr) {
            if (cancelled) return;
            toast.error(taxonomyErr instanceof Error ? taxonomyErr.message : "Errore caricamento tag e aree");
          }
        }
      })
      .catch((err) => {
        if (cancelled) return;
        toast.error(err instanceof Error ? err.message : "Errore caricamento dettaglio contratto");
        onClose();
      })
      .finally(() => {
        if (cancelled) return;
        setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [contractId, loadTaxonomyOptions, onClose, open, taxonomyCompanyId, toast]);

  useEffect(() => {
    if (!open || !effectiveCompanyId) return;

    let cancelled = false;
    setQuotesLoading(true);

    void getQuotesApi({ company_id: effectiveCompanyId })
      .then((quotesResponse) => {
        if (cancelled) return;
        setAvailableQuotes((quotesResponse.data ?? []).filter((quote) => quote.kind === "preventivo" && quote.is_active));
      })
      .catch((err) => {
        if (cancelled) return;
        toast.error(err instanceof Error ? err.message : "Errore caricamento preventivi");
      })
      .finally(() => {
        if (cancelled) return;
        setQuotesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [effectiveCompanyId, open, toast]);

  useEffect(() => {
    if (!open || !effectiveCompanyId) {
      setAvailableClients([]);
      setClientsLoading(false);
      return;
    }

    let cancelled = false;
    setClientsLoading(true);

    void getClientsApi({ company_id: effectiveCompanyId, per_page: 500 })
      .then((response) => {
        if (cancelled) return;
        setAvailableClients(response.data ?? []);
      })
      .catch((err) => {
        if (cancelled) return;
        setAvailableClients([]);
        toast.error(err instanceof Error ? err.message : "Errore caricamento clienti");
      })
      .finally(() => {
        if (!cancelled) setClientsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [effectiveCompanyId, open, toast]);

  useEffect(() => {
    if (open) return;
    setDetailLoading(false);
    setDetailData(null);
    setQuoteLinksDraft([]);
    setPricingModeDraft("aggregated");
    setQuoteWizardStep(1);
    setCommercialNotesDraft("");
    setOperationalBriefDraft("");
    setLostNotesDraft("");
    setEngagementTypeDraft("");
    setSignedAtDraft("");
    setStartDateDraft("");
    setEndDateDraft("");
    setClientIdDraft("");
    setDetailTagIdsDraft([]);
    setDetailWorkAreaIdsDraft([]);
    setExpandedQuoteIds([]);
    setQuoteLinesById({});
    setQuoteLinesLoadingById({});
    setQuoteLinesErrorById({});
    setWorkItemsCompletion(null);
    setWorkItemsCompletionLoading(false);
    setWorkItemsCompletionError(null);
    setQuoteWizardOpen(false);
    setActiveMainTab("contract");
    setActiveNotesTab("commercial");
    setEditingQuoteLabelId(null);
    setEditingQuoteLabelValue("");
  }, [open]);

  useEffect(() => {
    if (!open || !contractId || activeMainTab !== "tasks") return;

    let cancelled = false;
    setWorkItemsCompletionLoading(true);
    setWorkItemsCompletionError(null);

    void getContractWorkItemsCompletionApi(contractId)
      .then((response) => {
        if (cancelled) return;
        setWorkItemsCompletion(response);
      })
      .catch((err) => {
        if (cancelled) return;
        setWorkItemsCompletion(null);
        setWorkItemsCompletionError(err instanceof Error ? err.message : "Errore caricamento lavorazioni");
      })
      .finally(() => {
        if (!cancelled) setWorkItemsCompletionLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeMainTab, contractId, open]);

  useEffect(() => {
    const areaSet = new Set(workAreaOptions.map((option) => option.id));
    const tagSet = new Set(workTagOptions.map((option) => option.id));

    setDetailWorkAreaIdsDraft((current) => current.filter((id) => areaSet.has(id)));
    setDetailTagIdsDraft((current) => current.filter((id) => tagSet.has(id)));
  }, [workAreaOptions, workTagOptions]);

  const openQuoteEditor = (quoteId: number) => {
    const params = new URLSearchParams();
    params.set("quote_id", String(quoteId));
    onClose();
    navigate({ pathname: "/preventivo", search: `?${params.toString()}` }, { state: { quoteId } });
  };

  const toggleQuoteLines = async (quoteId: number) => {
    const currentlyExpanded = expandedQuoteIds.includes(quoteId);
    if (currentlyExpanded) {
      setExpandedQuoteIds((current) => current.filter((id) => id !== quoteId));
      return;
    }

    setExpandedQuoteIds((current) => [...current, quoteId]);

    if (quoteLinesById[quoteId] || quoteLinesLoadingById[quoteId]) {
      return;
    }

    setQuoteLinesLoadingById((current) => ({ ...current, [quoteId]: true }));
    setQuoteLinesErrorById((current) => {
      const next = { ...current };
      delete next[quoteId];
      return next;
    });

    try {
      const quote = await getQuoteApi(quoteId);
      setQuoteLinesById((current) => ({ ...current, [quoteId]: quote.lines ?? [] }));
    } catch (err) {
      setQuoteLinesErrorById((current) => ({
        ...current,
        [quoteId]: err instanceof Error ? err.message : "Errore caricamento linee preventivo",
      }));
    } finally {
      setQuoteLinesLoadingById((current) => ({ ...current, [quoteId]: false }));
    }
  };

  const linePeriodLabel = (period?: string | null): string => {
    if (period === "monthly") return "mensile";
    if (period === "yearly") return "annuale";
    if (period === "oneoff") return "una tantum";
    return "n/d";
  };

  const computeQuoteLineTotal = (line: QuoteLineItem): number => {
    const quantity = line.quantity ?? 1;
    const discountPct = line.discountPct ?? 0;
    const discounted = line.net * (1 - discountPct / 100);
    return discounted * quantity;
  };

  function normalizeLinks(links: ContractQuoteLink[]) {
    return links.map((link, index) => ({
      quote_id: link.quote_id,
      include_in_total: !!link.include_in_total,
      is_primary: !!link.is_primary,
      display_order: index,
      label: link.label?.trim() || null,
    }));
  }

  const handleSaveQuoteLinks = async () => {
    if (!detailData) return;

    if (hasPrimaryQuoteError) {
      toast.error("Devi avere un solo preventivo principale");
      return;
    }

    if (!isQuoteLinksDirty) {
      toast.success("Nessuna modifica da salvare");
      return;
    }

    const normalizedLinks = normalizeLinks(quoteLinksDraft);
    const featuredQuoteId = normalizedLinks.find((link) => link.is_primary)?.quote_id ?? null;

    setQuoteLinksSaving(true);
    try {
      const updated = await updateContractApi(detailData.id, {
        quote_links: normalizedLinks,
        featured_quote_id: featuredQuoteId,
        pricing_view_mode: pricingModeDraft,
      });
      setDetailData(updated);
      setQuoteLinksDraft(normalizedLinks);
      setPricingModeDraft(updated.pricing_view_mode);
      onContractUpdated?.(updated);
      toast.success("Preventivi collegati aggiornati");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore aggiornamento preventivi collegati");
    } finally {
      setQuoteLinksSaving(false);
    }
  };

  const startEditingQuoteLabel = (quoteId: number, currentLabel?: string | null) => {
    setEditingQuoteLabelId(quoteId);
    setEditingQuoteLabelValue(currentLabel ?? "");
  };

  const cancelEditingQuoteLabel = () => {
    setEditingQuoteLabelId(null);
    setEditingQuoteLabelValue("");
  };

  const applyEditingQuoteLabel = () => {
    if (editingQuoteLabelId == null) return;
    const normalized = editingQuoteLabelValue.trim() || null;
    setQuoteLinksDraft((current) => current.map((item) => (
      item.quote_id === editingQuoteLabelId ? { ...item, label: normalized } : item
    )));
    cancelEditingQuoteLabel();
  };

  const handleSaveContractNotes = async () => {
    if (!detailData) return;

    if (startDateDraft && endDateDraft && endDateDraft < startDateDraft) {
      toast.error("La data fine non puo essere precedente alla data inizio");
      return;
    }

    setNotesSaving(true);
    try {
      const updated = await updateContractApi(detailData.id, {
        engagement_type: engagementTypeDraft || null,
        signed_at: toIsoDatetimeValue(signedAtDraft),
        start_date: startDateDraft || null,
        end_date: endDateDraft || null,
        commercial_notes: hasRichTextContent(commercialNotesDraft) ? commercialNotesDraft : null,
        operational_brief: hasRichTextContent(operationalBriefDraft) ? operationalBriefDraft : null,
        lost_notes: hasRichTextContent(lostNotesDraft) ? lostNotesDraft : null,
        tag_ids: detailTagIdsDraft,
        work_area_ids: detailWorkAreaIdsDraft,
      });

      setDetailData(updated);
      setCommercialNotesDraft(updated.commercial_notes ?? "");
      setOperationalBriefDraft(updated.operational_brief ?? "");
      setLostNotesDraft(updated.lost_notes ?? "");
      setEngagementTypeDraft(updated.engagement_type ?? "");
      setSignedAtDraft(toDatetimeLocalValue(updated.signed_at));
      setStartDateDraft(updated.start_date ?? "");
      setEndDateDraft(updated.end_date ?? "");
      setDetailTagIdsDraft((updated.tags ?? []).map((tag) => tag.id));
      setDetailWorkAreaIdsDraft((updated.work_areas ?? []).map((area) => area.id));
      onContractUpdated?.(updated);
      toast.success("Note contratto aggiornate");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore aggiornamento note contratto");
    } finally {
      setNotesSaving(false);
    }
  };

  const handleSaveClient = async () => {
    if (!detailData) return;
    setClientSaving(true);
    try {
      const updated = await updateContractApi(detailData.id, {
        client_id: clientIdDraft ? Number(clientIdDraft) : null,
      });
      setDetailData(updated);
      setClientIdDraft(updated.client_id != null ? String(updated.client_id) : "");
      onContractUpdated?.(updated);
      toast.success(updated.client_id != null ? "Cliente collegato al contratto" : "Cliente rimosso dal contratto");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore aggiornamento cliente contratto");
    } finally {
      setClientSaving(false);
    }
  };

  return (
    <>
    <Modal
      open={open}
      onClose={onClose}
      title={detailData?.title ?? "Dettaglio contratto"}
      size="xl"
      position={modalPosition}
      showOverlay={modalShowOverlay}
      mobileFullscreen={modalMobileFullscreen}
      containerClassName={modalContainerClassName}
      dialogClassName={modalDialogClassName}
      bodyClassName={modalBodyClassName}
      hideCloseButton={modalHideCloseButton}
      inline={modalInline}
      draftId={contractId ? `contract-detail:${contractId}` : "contract-detail"}
    >
      {detailLoading || !contractId ? (
        <div className="py-8 flex items-center justify-center"><Spinner size="md" /></div>
      ) : !detailData ? (
        <div className="text-sm text-muted dark:text-muted-dark">Impossibile caricare il dettaglio contratto.</div>
      ) : (
        <div className={modalInline ? "flex h-full min-h-0 flex-col" : "flex h-[72vh] min-h-[32rem] max-h-[72vh] flex-col"}>
          <div className="inline-flex rounded-md border border-line dark:border-line-dark p-1 gap-1">
            <button
              type="button"
              onClick={() => setActiveMainTab("contract")}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${activeMainTab === "contract" ? "bg-ink text-paper dark:bg-paper dark:text-ink" : "text-muted dark:text-muted-dark hover:bg-cream dark:hover:bg-[#1c1c20]"}`}
            >
              Contratto
            </button>
            <button
              type="button"
              onClick={() => setActiveMainTab("quotes")}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${activeMainTab === "quotes" ? "bg-ink text-paper dark:bg-paper dark:text-ink" : "text-muted dark:text-muted-dark hover:bg-cream dark:hover:bg-[#1c1c20]"}`}
            >
              Preventivi
            </button>
            <button
              type="button"
              onClick={() => setActiveMainTab("tasks")}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${activeMainTab === "tasks" ? "bg-ink text-paper dark:bg-paper dark:text-ink" : "text-muted dark:text-muted-dark hover:bg-cream dark:hover:bg-[#1c1c20]"}`}
            >
              Task
            </button>
            <button
              type="button"
              onClick={() => setActiveMainTab("client")}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${activeMainTab === "client" ? "bg-ink text-paper dark:bg-paper dark:text-ink" : "text-muted dark:text-muted-dark hover:bg-cream dark:hover:bg-[#1c1c20]"}`}
            >
              Cliente
            </button>
            <button
              type="button"
              onClick={() => setActiveMainTab("timeline")}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${activeMainTab === "timeline" ? "bg-ink text-paper dark:bg-paper dark:text-ink" : "text-muted dark:text-muted-dark hover:bg-cream dark:hover:bg-[#1c1c20]"}`}
            >
              Timeline eventi
            </button>
          </div>

          <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
          {activeMainTab === "contract" && (
            <div className="space-y-6">
              <div className="rounded-md border border-line dark:border-line-dark p-3">
                <div className="text-[11px] uppercase tracking-wider text-muted dark:text-muted-dark mb-2">Cliente</div>
                <div className="grid grid-cols-1 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">Cliente collegato</label>
                    <ClientSelectorWithCreate
                      value={clientIdDraft}
                      onChange={setClientIdDraft}
                      clients={availableClients}
                      companyId={effectiveCompanyId}
                      clientsLoading={clientsLoading}
                      placeholder={clientsLoading ? "Caricamento clienti..." : "Seleziona cliente"}
                      searchPlaceholder="Cerca cliente..."
                      emptyMessage={clientsLoading ? "Caricamento clienti..." : "Nessun cliente"}
                      includeEmptyOption
                      emptyOptionLabel="Nessun cliente collegato"
                      createButtonTitle="Crea nuovo cliente"
                    />
                  </div>

                  <div className="flex justify-end">
                    <Button onClick={() => void handleSaveClient()} loading={clientSaving} disabled={!isAdmin}>
                      Salva cliente
                    </Button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-md border border-line dark:border-line-dark p-3">
                  <div className="text-[11px] uppercase tracking-wider text-muted dark:text-muted-dark">Stage</div>
                  <div className="mt-1 text-sm font-semibold text-ink dark:text-paper">{CONTRACT_STAGE_LABELS[detailData.commercial_stage]}</div>
                </div>
                {detailData.pricing && (
                  <>
                    <div className="rounded-md border border-line dark:border-line-dark p-3">
                      <div className="text-[11px] uppercase tracking-wider text-muted dark:text-muted-dark">Totale selezionato</div>
                      <div className="mt-1 text-sm font-semibold text-ink dark:text-paper">{formatEur(detailData.pricing.selected_total)}</div>
                    </div>
                    <div className="rounded-md border border-line dark:border-line-dark p-3">
                      <div className="text-[11px] uppercase tracking-wider text-muted dark:text-muted-dark">Mensile selezionato</div>
                      <div className="mt-1 text-sm font-semibold text-ink dark:text-paper">{formatEur(detailData.pricing.selected_monthly ?? 0)}</div>
                    </div>
                    <div className="rounded-md border border-line dark:border-line-dark p-3">
                      <div className="text-[11px] uppercase tracking-wider text-muted dark:text-muted-dark">Una tantum selezionato</div>
                      <div className="mt-1 text-sm font-semibold text-ink dark:text-paper">{formatEur(detailData.pricing.selected_one_time ?? 0)}</div>
                    </div>
                    <div className="rounded-md border border-line dark:border-line-dark p-3">
                      <div className="text-[11px] uppercase tracking-wider text-muted dark:text-muted-dark">Modalità prezzi</div>
                      <div className="mt-1 text-sm font-semibold text-ink dark:text-paper">{detailData.pricing.mode === "single_quote" ? "Preventivo principale" : "Totale aggregato"}</div>
                    </div>
                  </>
                )}
                <div className="rounded-md border border-line dark:border-line-dark p-3">
                  <div className="text-[11px] uppercase tracking-wider text-muted dark:text-muted-dark">Tipo rapporto</div>
                  <div className="mt-1 text-sm font-semibold text-ink dark:text-paper">{detailData.engagement_type === "one_time" ? "Una tantum" : detailData.engagement_type === "ongoing" ? "Continuativo" : "n/d"}</div>
                </div>
              </div>

              {((detailData.work_areas?.length ?? 0) > 0 || (detailData.tags?.length ?? 0) > 0) && (
                <div className="rounded-md border border-line dark:border-line-dark p-3">
                  <div className="text-[11px] uppercase tracking-wider text-muted dark:text-muted-dark mb-2">Aree e tag</div>
                  <div className="flex flex-wrap gap-1.5">
                    {(detailData.work_areas ?? []).map((area) => (
                      <span
                        key={`detail-area-${area.id}`}
                        className="inline-flex items-center rounded-pill border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider"
                        style={area.color ? { borderColor: `${area.color}55`, color: area.color, backgroundColor: `${area.color}1A` } : undefined}
                      >
                        {area.name}
                      </span>
                    ))}
                    {(detailData.tags ?? []).map((tag) => (
                      <span
                        key={`detail-tag-${tag.id}`}
                        className="inline-flex items-center rounded-pill border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider"
                        style={tag.color ? { borderColor: `${tag.color}55`, color: tag.color, backgroundColor: `${tag.color}1A` } : undefined}
                      >
                        #{tag.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="rounded-md border border-line dark:border-line-dark p-3">
                <div className="text-[11px] uppercase tracking-wider text-muted dark:text-muted-dark mb-2">Note contratto</div>

                <div className="grid grid-cols-1 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">engagement type</label>
                    <SearchableSelect
                      value={engagementTypeDraft}
                      onChange={(value) => setEngagementTypeDraft(value as "" | ContractEngagementType)}
                      options={[
                        { value: "", label: "Non impostato" },
                        { value: "one_time", label: "Una tantum" },
                        { value: "ongoing", label: "Continuativo" },
                      ]}
                      placeholder="Tipo rapporto"
                      disabled={!isAdmin}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Input
                      label="Data firma"
                      type="datetime-local"
                      value={signedAtDraft}
                      onChange={(event) => setSignedAtDraft(event.target.value)}
                    />
                    <Input
                      label="Data inizio"
                      type="date"
                      value={startDateDraft}
                      onChange={(event) => setStartDateDraft(event.target.value)}
                    />
                    <Input
                      label="Data fine"
                      type="date"
                      value={endDateDraft}
                      onChange={(event) => setEndDateDraft(event.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <MultiSelect
                      label="Aree di lavoro"
                      value={detailWorkAreaIdsDraft}
                      onChange={setDetailWorkAreaIdsDraft}
                      options={workAreaOptions}
                      placeholder={taxonomyLoading ? "Caricamento aree..." : "Seleziona aree"}
                      onCreateClick={isAdmin ? () => setWorkAreaModalOpen(true) : undefined}
                      createActionLabel="Crea area"
                    />
                    <MultiSelect
                      label="Tag"
                      value={detailTagIdsDraft}
                      onChange={setDetailTagIdsDraft}
                      options={workTagOptions}
                      placeholder={taxonomyLoading ? "Caricamento tag..." : "Seleziona tag"}
                      onCreateClick={isAdmin ? () => setWorkTagModalOpen(true) : undefined}
                      createActionLabel="Crea tag"
                    />
                  </div>

                  <div className="rounded-md border border-line dark:border-line-dark p-3">
                    <div className="mb-2 inline-flex rounded-md border border-line dark:border-line-dark p-1 gap-1">
                      <button
                        type="button"
                        onClick={() => setActiveNotesTab("commercial")}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${activeNotesTab === "commercial" ? "bg-ink text-paper dark:bg-paper dark:text-ink" : "text-muted dark:text-muted-dark hover:bg-cream dark:hover:bg-[#1c1c20]"}`}
                      >
                        Appunti commerciali
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveNotesTab("operational")}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${activeNotesTab === "operational" ? "bg-ink text-paper dark:bg-paper dark:text-ink" : "text-muted dark:text-muted-dark hover:bg-cream dark:hover:bg-[#1c1c20]"}`}
                      >
                        Brief operativo
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveNotesTab("lost")}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${activeNotesTab === "lost" ? "bg-ink text-paper dark:bg-paper dark:text-ink" : "text-muted dark:text-muted-dark hover:bg-cream dark:hover:bg-[#1c1c20]"}`}
                      >
                        Note perdita
                      </button>
                    </div>

                    {activeNotesTab === "commercial" ? (
                      <RichTextEditor
                        label="appunti commerciali"
                        value={commercialNotesDraft}
                        onChange={setCommercialNotesDraft}
                        placeholder="Note lato commerciale (trattativa, condizioni, obiezioni...)"
                        disabled={!isAdmin}
                      />
                    ) : activeNotesTab === "operational" ? (
                      <RichTextEditor
                        label="brief operativo"
                        value={operationalBriefDraft}
                        onChange={setOperationalBriefDraft}
                        placeholder="Brief operativo per il team (attività, vincoli, priorità...)"
                        disabled={!isAdmin}
                      />
                    ) : (
                      <RichTextEditor
                        label="note perdita"
                        value={lostNotesDraft}
                        onChange={setLostNotesDraft}
                        placeholder="Motivo perdita (prezzo, tempi, competitor, mancata risposta...)"
                        disabled={!isAdmin}
                        minHeightClassName="min-h-[104px]"
                      />
                    )}
                  </div>

                  <div className="flex justify-end">
                    <Button onClick={() => void handleSaveContractNotes()} loading={notesSaving} disabled={!isAdmin}>
                      Salva note contratto
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeMainTab === "client" && (
            <div className="space-y-3">
              <div className="rounded-md border border-line dark:border-line-dark p-3">
                <div className="text-[11px] uppercase tracking-wider text-muted dark:text-muted-dark mb-2">Cliente collegato</div>
                <div className="grid grid-cols-1 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">Cliente</label>
                    <ClientSelectorWithCreate
                      value={clientIdDraft}
                      onChange={setClientIdDraft}
                      clients={availableClients}
                      companyId={effectiveCompanyId}
                      clientsLoading={clientsLoading}
                      placeholder={clientsLoading ? "Caricamento clienti..." : "Seleziona cliente"}
                      searchPlaceholder="Cerca cliente..."
                      emptyMessage={clientsLoading ? "Caricamento clienti..." : "Nessun cliente"}
                      includeEmptyOption
                      emptyOptionLabel="Nessun cliente collegato"
                      createButtonTitle="Crea nuovo cliente"
                    />
                  </div>

                  <div className="flex justify-end">
                    <Button onClick={() => void handleSaveClient()} loading={clientSaving} disabled={!isAdmin}>
                      Salva cliente
                    </Button>
                  </div>
                </div>
              </div>

              <div className="rounded-md border border-line dark:border-line-dark p-3">
                <div className="text-[11px] uppercase tracking-wider text-muted dark:text-muted-dark mb-2">Dettagli cliente</div>

                {!clientIdDraft.trim() ? (
                  <div className="text-sm text-muted dark:text-muted-dark">Seleziona un cliente per vedere i dettagli.</div>
                ) : clientsLoading ? (
                  <div className="py-4 flex items-center justify-center"><Spinner size="sm" /></div>
                ) : !selectedClient ? (
                  <div className="text-sm text-muted dark:text-muted-dark">Dettagli cliente non disponibili.</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs">
                    <div className="rounded-md border border-line/70 dark:border-line-dark/70 px-2.5 py-2">
                      <div className="text-[11px] uppercase tracking-wider text-muted dark:text-muted-dark">Ragione sociale</div>
                      <div className="mt-0.5 text-sm font-semibold text-ink dark:text-paper">{selectedClient.commercial_name || selectedClient.name || "-"}</div>
                    </div>
                    <div className="rounded-md border border-line/70 dark:border-line-dark/70 px-2.5 py-2">
                      <div className="text-[11px] uppercase tracking-wider text-muted dark:text-muted-dark">Nominativo</div>
                      <div className="mt-0.5 text-sm font-semibold text-ink dark:text-paper">{selectedClient.name || "-"}</div>
                    </div>
                    <div className="rounded-md border border-line/70 dark:border-line-dark/70 px-2.5 py-2">
                      <div className="text-[11px] uppercase tracking-wider text-muted dark:text-muted-dark">Contatto</div>
                      <div className="mt-0.5 text-sm text-ink dark:text-paper">{selectedClient.contact || "-"}</div>
                    </div>
                    <div className="rounded-md border border-line/70 dark:border-line-dark/70 px-2.5 py-2">
                      <div className="text-[11px] uppercase tracking-wider text-muted dark:text-muted-dark">Email</div>
                      <div className="mt-0.5 text-sm text-ink dark:text-paper">{selectedClient.email || "-"}</div>
                    </div>
                    <div className="rounded-md border border-line/70 dark:border-line-dark/70 px-2.5 py-2">
                      <div className="text-[11px] uppercase tracking-wider text-muted dark:text-muted-dark">Telefono</div>
                      <div className="mt-0.5 text-sm text-ink dark:text-paper">{selectedClient.phone || "-"}</div>
                    </div>
                    <div className="rounded-md border border-line/70 dark:border-line-dark/70 px-2.5 py-2">
                      <div className="text-[11px] uppercase tracking-wider text-muted dark:text-muted-dark">Localita</div>
                      <div className="mt-0.5 text-sm text-ink dark:text-paper">{selectedClientLocation || "-"}</div>
                    </div>
                    <div className="rounded-md border border-line/70 dark:border-line-dark/70 px-2.5 py-2">
                      <div className="text-[11px] uppercase tracking-wider text-muted dark:text-muted-dark">Partita IVA</div>
                      <div className="mt-0.5 text-sm text-ink dark:text-paper">{selectedClient.vat || "-"}</div>
                    </div>
                    <div className="rounded-md border border-line/70 dark:border-line-dark/70 px-2.5 py-2">
                      <div className="text-[11px] uppercase tracking-wider text-muted dark:text-muted-dark">Codice fiscale</div>
                      <div className="mt-0.5 text-sm text-ink dark:text-paper">{selectedClient.cf || "-"}</div>
                    </div>
                    <div className="rounded-md border border-line/70 dark:border-line-dark/70 px-2.5 py-2 md:col-span-2">
                      <div className="text-[11px] uppercase tracking-wider text-muted dark:text-muted-dark">Indirizzo</div>
                      <div className="mt-0.5 text-sm text-ink dark:text-paper">{selectedClient.addr || "-"}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeMainTab === "quotes" && (
            <div className="rounded-md border border-line dark:border-line-dark p-3">
            <div className="text-[11px] uppercase tracking-wider text-muted dark:text-muted-dark mb-2">Preventivi collegati</div>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm text-muted dark:text-muted-dark">
                  {quoteLinksDraft.length === 0 ? "Nessun preventivo collegato." : `${quoteLinksDraft.length} preventivo/i collegato/i.`}
                </div>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setQuoteWizardStep(1);
                    setExpandedQuoteIds([]);
                    setEditingQuoteLabelId(null);
                    setEditingQuoteLabelValue("");
                    setQuoteWizardOpen(true);
                  }}
                  disabled={!isAdmin}
                >
                  Gestisci collegamenti
                </Button>
              </div>

              {quoteLinksDraft.length > 0 && (
                <div className="rounded-md border border-line/70 dark:border-line-dark/70 overflow-auto max-h-[62vh]">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 z-10 bg-cream/80 dark:bg-[#1c1c20]">
                      <tr className="border-b border-line dark:border-line-dark">
                        <th className="px-2 py-1.5 text-left">Preventivo</th>
                        <th className="px-2 py-1.5 text-left">Totale</th>
                        <th className="px-2 py-1.5 text-left">Includi</th>
                        <th className="px-2 py-1.5 text-left">Principale</th>
                        <th className="px-2 py-1.5 text-left">Etichetta</th>
                        <th className="px-2 py-1.5 text-left">Azioni</th>
                      </tr>
                    </thead>
                    <tbody>
                      {quoteLinksDraft
                        .slice()
                        .sort((a, b) => a.display_order - b.display_order)
                        .map((link) => (
                          <Fragment key={`summary-fragment-${link.quote_id}`}>
                            <tr key={`summary-row-${link.quote_id}`} className="border-b border-line/70 dark:border-line-dark/70">
                              <td className="px-2 py-1.5">#{link.quote_id}</td>
                              <td className="px-2 py-1.5">{link.totals?.total != null ? formatEur(link.totals.total) : "n/d"}</td>
                              <td className="px-2 py-1.5">{link.include_in_total ? "Si" : "No"}</td>
                              <td className="px-2 py-1.5">{link.is_primary ? "Si" : "No"}</td>
                              <td className="px-2 py-1.5">{link.label || "-"}</td>
                              <td className="px-2 py-1.5">
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => void toggleQuoteLines(link.quote_id)}
                                    className="rounded-md border border-line dark:border-line-dark px-2 py-1 text-[11px] text-muted dark:text-muted-dark hover:text-ink dark:hover:text-paper"
                                  >
                                    {expandedQuoteIds.includes(link.quote_id) ? "Nascondi" : "Dettagli"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setQuoteWizardStep(2);
                                      setQuoteWizardOpen(true);
                                    }}
                                    className="rounded-md border border-line dark:border-line-dark px-2 py-1 text-[11px] text-muted dark:text-muted-dark hover:text-ink dark:hover:text-paper"
                                  >
                                    Gestisci
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openQuoteEditor(link.quote_id)}
                                    className="rounded-md border border-line dark:border-line-dark px-2 py-1 text-[11px] text-muted dark:text-muted-dark hover:text-ink dark:hover:text-paper"
                                  >
                                    Apri
                                  </button>
                                </div>
                              </td>
                            </tr>

                            {expandedQuoteIds.includes(link.quote_id) && (
                              <tr key={`summary-row-details-${link.quote_id}`} className="border-b border-line/70 dark:border-line-dark/70">
                                <td colSpan={6} className="px-2 py-2">
                                  <div className="rounded-md border border-line dark:border-line-dark p-2 bg-paper/50 dark:bg-[#1c1c20]/50">
                                    {quoteLinesLoadingById[link.quote_id] ? (
                                      <div className="py-3 flex items-center justify-center">
                                        <Spinner size="sm" />
                                      </div>
                                    ) : quoteLinesErrorById[link.quote_id] ? (
                                      <div className="text-xs text-danger">{quoteLinesErrorById[link.quote_id]}</div>
                                    ) : (quoteLinesById[link.quote_id]?.length ?? 0) === 0 ? (
                                      <div className="text-xs text-muted dark:text-muted-dark">Nessuna linea nel preventivo.</div>
                                    ) : (
                                      <div className="space-y-1.5">
                                        {quoteLinesById[link.quote_id].map((line, lineIndex) => (
                                          <div
                                            key={`summary-quote-${link.quote_id}-line-${lineIndex}`}
                                            role={onQuoteLineClick ? "button" : undefined}
                                            tabIndex={onQuoteLineClick ? 0 : undefined}
                                            title={onQuoteLineClick ? "Precompila una task da questa voce" : undefined}
                                            onClick={onQuoteLineClick ? () => onQuoteLineClick(line, link.quote_id) : undefined}
                                            onKeyDown={onQuoteLineClick ? (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onQuoteLineClick(line, link.quote_id); } } : undefined}
                                            className={`rounded border border-line dark:border-line-dark px-2 py-1.5${onQuoteLineClick ? " cursor-pointer transition-colors hover:border-brand-magenta/60 hover:bg-brand-magenta/5 focus:outline-none focus:ring-2 focus:ring-brand-magenta/40" : ""}`}
                                          >
                                            <div className="text-xs font-semibold text-ink dark:text-paper">{line.name}</div>
                                            {line.desc ? (
                                              <div className="mt-0.5 whitespace-pre-line text-[11px] text-muted dark:text-muted-dark">{line.desc}</div>
                                            ) : null}
                                            <div className="mt-0.5 text-[11px] text-muted dark:text-muted-dark">
                                              Qta {line.quantity ?? 1} · {linePeriodLabel(line.period)}
                                              {isAdmin ? ` · Unit ${formatEur(line.net)}` : ""}
                                              {isAdmin && (line.discountPct ?? 0) > 0 ? ` · Sconto ${line.discountPct}%` : ""}
                                            </div>
                                            {isAdmin && (
                                              <div className="mt-0.5 text-xs font-semibold text-ink dark:text-paper">
                                                Totale linea {formatEur(computeQuoteLineTotal(line))}
                                              </div>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            </div>
          )}

          {activeMainTab === "tasks" && (
            <div className="rounded-md border border-line dark:border-line-dark p-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] uppercase tracking-wider text-muted dark:text-muted-dark">Stato lavorazioni contratto</div>
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<Icon name="list" className="h-3.5 w-3.5" />}
                  onClick={() => {
                    if (!contractId) return;
                    navigate(`/work-items?contract_id=${contractId}`);
                  }}
                >
                  Vai a Lavorazioni
                </Button>
              </div>

              {workItemsCompletionLoading ? (
                <div className="py-6 flex items-center justify-center"><Spinner size="sm" /></div>
              ) : workItemsCompletionError ? (
                <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                  {workItemsCompletionError}
                </div>
              ) : !workItemsCompletion ? (
                <div className="text-sm text-muted dark:text-muted-dark">Nessun dato lavorazioni disponibile.</div>
              ) : (
                <>
                  <div className="rounded-md border border-line/70 dark:border-line-dark/70 p-3 space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
                      <span>Completamento</span>
                      <span>{workItemsCompletion.completed_tasks}/{workItemsCompletion.total_tasks} · {completionPercent.toFixed(0)}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-cream dark:bg-[#2a2a2e]">
                      <div className="h-full rounded-full bg-info transition-[width] duration-200" style={{ width: `${completionPercent}%` }} />
                    </div>
                  </div>

                  <div className="space-y-2 max-h-[44vh] overflow-y-auto pr-1">
                    {workItemsCompletion.items.length === 0 ? (
                      <div className="text-sm text-muted dark:text-muted-dark">Nessuna task collegata a questo contratto.</div>
                    ) : (
                      workItemsCompletion.items.map((item) => (
                        <div key={`contract-task-${item.id}`} className="rounded-md border border-line/70 dark:border-line-dark/70 p-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-ink dark:text-paper truncate" title={item.title}>{item.title}</div>
                              <div className="mt-0.5 text-[11px] text-muted dark:text-muted-dark">
                                #{item.id} · Stato {item.status || "n/d"}
                              </div>
                            </div>
                            <span
                              className={`inline-flex rounded-pill border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                                item.completion_state === "completed"
                                  ? "border-success/35 bg-success/10 text-success"
                                  : item.completion_state === "in_progress"
                                    ? "border-info/35 bg-info/10 text-info"
                                    : "border-line dark:border-line-dark text-muted dark:text-muted-dark"
                              }`}
                            >
                              {item.completion_state === "completed" ? "Completata" : item.completion_state === "in_progress" ? "In corso" : "Da avviare"}
                            </span>
                          </div>

                          <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-1.5 text-[11px] text-muted dark:text-muted-dark">
                            <span>Progress: {Math.max(0, Math.min(100, item.progress_percent ?? 0))}%</span>
                            <span>Data: {item.work_date ? new Date(item.work_date).toLocaleDateString("it-IT") : "-"}</span>
                            <span>Scadenza: {item.deadline_date ? new Date(item.deadline_date).toLocaleDateString("it-IT") : "-"}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {activeMainTab === "timeline" && (
            <div className="rounded-md border border-line dark:border-line-dark p-3">
            <div className="text-[11px] uppercase tracking-wider text-muted dark:text-muted-dark mb-2">Timeline eventi</div>
            {detailData.history.length === 0 ? (
              <div className="text-sm text-muted dark:text-muted-dark">Nessun evento disponibile.</div>
            ) : (
              <div className="space-y-2">
                {detailData.history
                  .slice()
                  .sort((a, b) => b.created_at.localeCompare(a.created_at))
                  .map((event, index) => (
                    <div key={`${event.event_type}-${event.created_at}-${index}`} className="rounded-md border border-line dark:border-line-dark p-2">
                      <div className="text-xs font-semibold text-ink dark:text-paper">{eventLabel(event.event_type)}</div>
                      <div className="text-[11px] text-muted dark:text-muted-dark mt-0.5">
                        {new Date(event.created_at).toLocaleString("it-IT")}
                      </div>
                      {(event.field_name || event.from_value || event.to_value || event.notes) && (
                        <div className="mt-1 text-xs text-muted dark:text-muted-dark">
                          {event.field_name ? `${event.field_name}: ` : ""}
                          {event.from_value ?? ""}
                          {event.to_value != null ? ` → ${event.to_value}` : ""}
                          {event.notes ? ` · ${event.notes}` : ""}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            )}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>

    <Modal
      open={quoteWizardOpen}
      onClose={() => setQuoteWizardOpen(false)}
      title="Gestione preventivi collegati"
      size="2xl"
      draftId={contractId ? `contract-detail-quote-wizard:${contractId}` : "contract-detail-quote-wizard"}
    >
      <div className="flex h-[70vh] min-h-[28rem] max-h-[70vh] flex-col">
      <div className="space-y-3 overflow-y-auto pr-1">
        <div className="inline-flex rounded-md border border-line dark:border-line-dark p-1 gap-1">
          <button
            type="button"
            onClick={() => setQuoteWizardStep(1)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${quoteWizardStep === 1 ? "bg-ink text-paper dark:bg-paper dark:text-ink" : "text-muted dark:text-muted-dark hover:bg-cream dark:hover:bg-[#1c1c20]"}`}
          >
            1. Selezione
          </button>
          <button
            type="button"
            onClick={() => canGoToStep2 && setQuoteWizardStep(2)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${quoteWizardStep === 2 ? "bg-ink text-paper dark:bg-paper dark:text-ink" : "text-muted dark:text-muted-dark hover:bg-cream dark:hover:bg-[#1c1c20]"} ${!canGoToStep2 ? "opacity-50 cursor-not-allowed" : ""}`}
            disabled={!canGoToStep2}
          >
            2. Principale
          </button>
          <button
            type="button"
            onClick={() => canGoToStep3 && setQuoteWizardStep(3)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${quoteWizardStep === 3 ? "bg-ink text-paper dark:bg-paper dark:text-ink" : "text-muted dark:text-muted-dark hover:bg-cream dark:hover:bg-[#1c1c20]"} ${!canGoToStep3 ? "opacity-50 cursor-not-allowed" : ""}`}
            disabled={!canGoToStep3}
          >
            3. Riepilogo
          </button>
        </div>

        {quoteWizardStep === 1 && (
          <div className="space-y-3">
            <MultiSelect
              label="Seleziona preventivi"
              value={selectedQuoteIds}
              onChange={(value) => {
                if (!isAdmin) return;
                applySelectedQuoteIds(value);
              }}
              options={quoteMultiSelectOptions}
              placeholder={quotesLoading ? "Caricamento preventivi..." : "Scegli uno o più preventivi"}
            />

            {selectedQuoteIds.length === 0 ? (
              <div className="text-sm text-muted dark:text-muted-dark">Seleziona almeno un preventivo per continuare.</div>
            ) : (
              <div className="rounded-md border border-line/70 dark:border-line-dark/70 p-2 text-xs text-muted dark:text-muted-dark">
                {selectedQuoteIds.length} preventivo/i selezionato/i.
              </div>
            )}
          </div>
        )}

        {quoteWizardStep === 2 && (
          <div className="space-y-2">
            <div className="rounded-md border border-line/70 dark:border-line-dark/70 bg-paper/60 dark:bg-[#1c1c20]/60 px-3 py-2 text-xs text-muted dark:text-muted-dark">
              Configura preventivi collegati in modo compatto: scegli un solo principale, imposta inclusione nel totale e modifica etichetta dove serve.
            </div>

            <div className="rounded-md border border-line/70 dark:border-line-dark/70 overflow-auto max-h-[52vh]">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10 bg-cream/85 dark:bg-[#1c1c20]">
                  <tr className="border-b border-line dark:border-line-dark">
                    <th className="px-2 py-1.5 text-left">Preventivo</th>
                    <th className="px-2 py-1.5 text-left">Totale</th>
                    <th className="px-2 py-1.5 text-left">Includi</th>
                    <th className="px-2 py-1.5 text-left">Principale</th>
                    <th className="px-2 py-1.5 text-left">Etichetta</th>
                    <th className="px-2 py-1.5 text-left">Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {quoteLinksDraft
                    .slice()
                    .sort((a, b) => a.display_order - b.display_order)
                    .map((link) => (
                      <>
                        <tr key={`wizard-row-${link.quote_id}`} className="border-b border-line/70 dark:border-line-dark/70">
                          <td className="px-2 py-1.5 align-top">
                            <div className="group flex min-w-0 items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => openQuoteEditor(link.quote_id)}
                                className="text-sm text-ink dark:text-paper underline decoration-dotted underline-offset-2 truncate"
                                title={`#${link.quote_id} ${link.label ? `· ${link.label}` : ""}`}
                              >
                                #{link.quote_id}
                              </button>

                              <button
                                type="button"
                                onClick={() => startEditingQuoteLabel(link.quote_id, link.label)}
                                className="opacity-0 group-hover:opacity-100 transition-opacity rounded border border-line dark:border-line-dark px-1.5 py-0.5 text-[11px] text-muted dark:text-muted-dark hover:text-ink dark:hover:text-paper"
                                title="Modifica etichetta"
                                aria-label="Modifica etichetta"
                                disabled={!isAdmin}
                              >
                                ✎
                              </button>
                            </div>
                          </td>
                          <td className="px-2 py-1.5 align-top">{link.totals?.total != null ? formatEur(link.totals.total) : "n/d"}</td>
                          <td className="px-2 py-1.5 align-top">
                            <Checkbox
                              checked={link.include_in_total}
                              onChange={(checked) => {
                                if (!isAdmin) return;
                                setQuoteLinksDraft((current) => current.map((item) => (
                                  item.quote_id === link.quote_id ? { ...item, include_in_total: checked } : item
                                )));
                              }}
                            />
                          </td>
                          <td className="px-2 py-1.5 align-top">
                            <Radio
                              name="primary-quote-link"
                              checked={link.is_primary}
                              onChange={(checked) => {
                                if (!isAdmin || !checked) return;
                                setQuoteLinksDraft((current) => current.map((item) => ({
                                  ...item,
                                  is_primary: item.quote_id === link.quote_id,
                                })));
                              }}
                            />
                          </td>
                          <td className="px-2 py-1.5 align-top min-w-[220px]">
                            {editingQuoteLabelId === link.quote_id ? (
                              <div className="flex items-center gap-1.5">
                                <input
                                  value={editingQuoteLabelValue}
                                  onChange={(event) => setEditingQuoteLabelValue(event.target.value)}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                      event.preventDefault();
                                      applyEditingQuoteLabel();
                                    }
                                    if (event.key === "Escape") {
                                      event.preventDefault();
                                      cancelEditingQuoteLabel();
                                    }
                                  }}
                                  className="flex-1 min-w-[150px] rounded-md border border-line dark:border-line-dark px-2 py-1 text-xs bg-paper dark:bg-[#1c1c20]"
                                  placeholder="Etichetta"
                                  autoFocus
                                />
                                <button
                                  type="button"
                                  onClick={applyEditingQuoteLabel}
                                  className="h-7 w-7 rounded-md border border-line dark:border-line-dark text-ink dark:text-paper hover:bg-cream dark:hover:bg-[#1c1c20]"
                                  title="Conferma"
                                  aria-label="Conferma"
                                >
                                  ✓
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelEditingQuoteLabel}
                                  className="h-7 w-7 rounded-md border border-line dark:border-line-dark text-muted dark:text-muted-dark hover:text-ink dark:hover:text-paper hover:bg-cream dark:hover:bg-[#1c1c20]"
                                  title="Annulla"
                                  aria-label="Annulla"
                                >
                                  ✕
                                </button>
                              </div>
                            ) : (
                              <span className="text-muted dark:text-muted-dark">{link.label || "-"}</span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 align-top">
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                className="rounded-md border border-line dark:border-line-dark px-2 py-1 text-[11px] text-muted dark:text-muted-dark hover:text-ink dark:hover:text-paper"
                                onClick={() => void toggleQuoteLines(link.quote_id)}
                              >
                                {expandedQuoteIds.includes(link.quote_id) ? "Nascondi" : "Dettagli"}
                              </button>
                              <button
                                type="button"
                                className="rounded-md border border-line dark:border-line-dark px-2 py-1 text-[11px] text-muted dark:text-muted-dark hover:text-ink dark:hover:text-paper disabled:opacity-50"
                                onClick={() => {
                                  if (!isAdmin) return;
                                  applySelectedQuoteIds(selectedQuoteIds.filter((id) => id !== link.quote_id));
                                }}
                                disabled={!isAdmin}
                              >
                                Rimuovi
                              </button>
                            </div>
                          </td>
                        </tr>

                        {expandedQuoteIds.includes(link.quote_id) && (
                          <tr key={`wizard-row-details-${link.quote_id}`} className="border-b border-line/70 dark:border-line-dark/70">
                            <td colSpan={6} className="px-2 py-2">
                              <div className="rounded-md border border-line dark:border-line-dark p-2 bg-paper/50 dark:bg-[#1c1c20]/50">
                                {quoteLinesLoadingById[link.quote_id] ? (
                                  <div className="py-3 flex items-center justify-center">
                                    <Spinner size="sm" />
                                  </div>
                                ) : quoteLinesErrorById[link.quote_id] ? (
                                  <div className="text-xs text-danger">{quoteLinesErrorById[link.quote_id]}</div>
                                ) : (quoteLinesById[link.quote_id]?.length ?? 0) === 0 ? (
                                  <div className="text-xs text-muted dark:text-muted-dark">Nessuna linea nel preventivo.</div>
                                ) : (
                                  <div className="space-y-1.5">
                                    {quoteLinesById[link.quote_id].map((line, lineIndex) => (
                                      <div
                                        key={`quote-${link.quote_id}-line-${lineIndex}`}
                                        role={onQuoteLineClick ? "button" : undefined}
                                        tabIndex={onQuoteLineClick ? 0 : undefined}
                                        title={onQuoteLineClick ? "Precompila una task da questa voce" : undefined}
                                        onClick={onQuoteLineClick ? () => onQuoteLineClick(line, link.quote_id) : undefined}
                                        onKeyDown={onQuoteLineClick ? (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onQuoteLineClick(line, link.quote_id); } } : undefined}
                                        className={`rounded border border-line dark:border-line-dark px-2 py-1.5${onQuoteLineClick ? " cursor-pointer transition-colors hover:border-brand-magenta/60 hover:bg-brand-magenta/5 focus:outline-none focus:ring-2 focus:ring-brand-magenta/40" : ""}`}
                                      >
                                        <div className="text-xs font-semibold text-ink dark:text-paper">{line.name}</div>
                                        {line.desc ? (
                                          <div className="mt-0.5 whitespace-pre-line text-[11px] text-muted dark:text-muted-dark">{line.desc}</div>
                                        ) : null}
                                        <div className="mt-0.5 text-[11px] text-muted dark:text-muted-dark">
                                          Qta {line.quantity ?? 1} · {linePeriodLabel(line.period)}
                                          {isAdmin ? ` · Unit ${formatEur(line.net)}` : ""}
                                          {isAdmin && (line.discountPct ?? 0) > 0 ? ` · Sconto ${line.discountPct}%` : ""}
                                        </div>
                                        {isAdmin && (
                                          <div className="mt-0.5 text-xs font-semibold text-ink dark:text-paper">
                                            Totale linea {formatEur(computeQuoteLineTotal(line))}
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {quoteWizardStep === 3 && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-[220px_auto] gap-2 items-end">
              <SearchableSelect
                value={pricingModeDraft}
                onChange={(value) => setPricingModeDraft(value as ContractPricingMode)}
                options={[
                  { value: "aggregated", label: "Totale aggregato" },
                  { value: "single_quote", label: "Preventivo principale" },
                ]}
                placeholder="Modalità prezzi"
                disabled={!isAdmin}
              />
              <div className="text-xs text-muted dark:text-muted-dark">
                Totale aggregato: somma i preventivi inclusi. Preventivo principale: usa solo il preventivo marcato principale.
              </div>
            </div>

            <div className="rounded-md border border-line/70 dark:border-line-dark/70 p-2.5 text-xs">
              <div className="font-semibold text-ink dark:text-paper">Differenze rispetto ai collegamenti attuali</div>
              <div className="mt-1 text-muted dark:text-muted-dark">
                Aggiunti: {quoteLinksDiff.added.length} · Rimossi: {quoteLinksDiff.removed.length} · Modificati: {quoteLinksDiff.updated.length}
              </div>

              {(quoteLinksDiff.added.length + quoteLinksDiff.removed.length + quoteLinksDiff.updated.length) === 0 ? (
                <div className="mt-2 text-muted dark:text-muted-dark">Nessuna differenza rilevata.</div>
              ) : (
                <div className="mt-2 space-y-1">
                  {quoteLinksDiff.added.map((link) => (
                    <div key={`added-${link.quote_id}`} className="text-success">+ Aggiunto #{link.quote_id} {quoteTitleById.get(link.quote_id) ? `· ${quoteTitleById.get(link.quote_id)}` : ""}</div>
                  ))}
                  {quoteLinksDiff.removed.map((link) => (
                    <div key={`removed-${link.quote_id}`} className="text-danger">- Rimosso #{link.quote_id} {quoteTitleById.get(link.quote_id) ? `· ${quoteTitleById.get(link.quote_id)}` : ""}</div>
                  ))}
                  {quoteLinksDiff.updated.map((link) => (
                    <div key={`updated-${link.quote_id}`} className="text-warning">~ Aggiornato #{link.quote_id} {quoteTitleById.get(link.quote_id) ? `· ${quoteTitleById.get(link.quote_id)}` : ""}</div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line/70 dark:border-line-dark/70 px-2.5 py-2 sticky bottom-0 bg-paper dark:bg-ink-soft">
              <div className="text-xs">
                {hasPrimaryQuoteError ? (
                  <span className="text-danger font-semibold">Seleziona esattamente un preventivo principale per poter salvare.</span>
                ) : isQuoteLinksDirty ? (
                  <span className="text-warning font-semibold">Modifiche non salvate nei collegamenti preventivi.</span>
                ) : (
                  <span className="text-muted dark:text-muted-dark">Nessuna modifica in sospeso.</span>
                )}
              </div>

              <Button
                onClick={() => void handleSaveQuoteLinks()}
                loading={quoteLinksSaving}
                disabled={!isAdmin || !isQuoteLinksDirty || hasPrimaryQuoteError}
              >
                Salva collegamenti preventivi
              </Button>
            </div>
          </div>
        )}

        <div className="mt-3 flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            onClick={() => setQuoteWizardStep((current) => (current === 1 ? 1 : (current - 1) as 1 | 2 | 3))}
            disabled={quoteWizardStep === 1}
          >
            Indietro
          </Button>

          <Button
            variant="secondary"
            onClick={() => setQuoteWizardStep((current) => (current === 3 ? 3 : (current + 1) as 1 | 2 | 3))}
            disabled={(quoteWizardStep === 1 && !canGoToStep2) || (quoteWizardStep === 2 && !canGoToStep3) || quoteWizardStep === 3}
          >
            Avanti
          </Button>
        </div>
      </div>
      </div>
    </Modal>

    <WorkTagCreateModal
      open={workTagModalOpen}
      companyId={effectiveCompanyId}
      onClose={() => setWorkTagModalOpen(false)}
      onCreated={(tag) => {
        setAvailableWorkTags((current) => (current.some((item) => item.id === tag.id) ? current : [...current, tag]));
        setDetailTagIdsDraft((current) => (current.includes(tag.id) ? current : [...current, tag.id]));
        setWorkTagModalOpen(false);
        toast.success("Tag creato");
      }}
    />

    <WorkAreaCreateModal
      open={workAreaModalOpen}
      companyId={effectiveCompanyId}
      onClose={() => setWorkAreaModalOpen(false)}
      onCreated={(area) => {
        setAvailableWorkAreas((current) => (current.some((item) => item.id === area.id) ? current : [...current, area]));
        setDetailWorkAreaIdsDraft((current) => (current.includes(area.id) ? current : [...current, area.id]));
        setWorkAreaModalOpen(false);
        toast.success("Area creata");
      }}
    />
    </>
  );
}
