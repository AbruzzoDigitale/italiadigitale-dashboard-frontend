import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { type CatalogProductFlatResponse } from "../api/catalog";
import { getClientsApi, type Client } from "../api/clients";
import { ClientSelectorWithCreate } from "../components/clients/ClientSelectorWithCreate";
import {
  createQuoteApi,
  createQuoteFromConfiguratorApi,
  formatEur,
  getAllowedTransitions,
  getQuoteHistoryLabel,
  getQuoteLinkedContractsApi,
  getQuoteApi,
  updateQuoteApi,
  type CreateQuotePayload,
  type QuoteEventResponse,
  type QuoteLinkedContractResponse,
  type QuoteLineItem,
  type QuotePreviewResponse,
} from "../api/quotes";
import {
  createRequestApi,
  createRequestFromConfiguratorApi,
  getRequestApi,
  updateRequestApi,
  updateRequestStatusApi,
} from "../api/requests";
import { getSocialPackageApi, listSocialPackagesApi, type SocialPackageBase, type SocialPackageDetail } from "../api/socialPackages";
import { CONTRACT_STAGE_LABELS, createContractApi } from "../api/contracts";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { FieldHelpPopover } from "../components/ui/FieldHelpPopover";
import { Input } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { SearchableSelect } from "../components/ui/SearchableSelect";
import { Textarea } from "../components/ui/Textarea";
import { useAuth } from "../hooks/useAuth";
import { useCatalogProductsFlat } from "../hooks/useCatalogProductsFlat";
import { useSelectedCompanyId } from "../hooks/useSelectedCompanyId";
import { useToast } from "../context/ToastContext";
import { usePushQuoteToFic } from "../hooks/usePushQuoteToFic";
import { useFicQuoteImport } from "../hooks/useFicQuoteImport";
import { normalizeCompanyPayload } from "../utils/companyPayload";

type EditorNavState = {
  preview?: QuotePreviewResponse;
  previewPayload?: CreateQuotePayload;
  previewSource?: "configurator" | "social-package";
  socialPackageId?: number;
  socialPackageTitle?: string;
  quoteId?: number;
};

type Totals = {
  subtotal: number;
  global_discount: number;
  net: number;
  vat_amount: number;
  total: number;
  monthly: number;
  one_time: number;
};

type EditableQuoteLine = QuoteLineItem & { rowId: string };

const ALLOWED_PERIODS: Array<NonNullable<QuoteLineItem["period"]>> = ["monthly", "oneoff", "yearly"];

function computeTotals(lines: QuoteLineItem[], discountPct: number, discountEur: number): Totals {
  let monthly = 0;
  let one_time = 0;

  lines.forEach((line) => {
    const qty = Math.max(0, Number(line.quantity ?? 0));
    const net = Math.max(0, Number(line.net ?? 0));
    const lineDiscount = Math.max(0, Math.min(100, Number(line.discountPct ?? 0)));
    const gross = net * qty;
    const discounted = gross * (1 - lineDiscount / 100);
    if (line.period === "monthly" || line.period === "yearly") monthly += discounted;
    else one_time += discounted;
  });

  const subtotal = monthly + one_time;
  const global_discount = subtotal * (Math.max(0, discountPct) / 100) + Math.max(0, discountEur);
  const net = Math.max(0, subtotal - global_discount);
  const vat_amount = net * 0.22;
  const total = net + vat_amount;

  return { subtotal, global_discount, net, vat_amount, total, monthly, one_time };
}

function mapPeriod(period: string | null | undefined): QuoteLineItem["period"] {
  if (period === "monthly") return "monthly";
  if (period === "yearly") return "yearly";
  return "oneoff";
}

function defaultPrice(product: CatalogProductFlatResponse) {
  if (product.prices?.length) {
    return product.prices.find((price) => price.is_default) ?? product.prices[0];
  }
  return null;
}

function mapCatalogProductToLine(product: CatalogProductFlatResponse): QuoteLineItem {
  const price = defaultPrice(product);
  const period = mapPeriod(price?.billing_period ?? product.base_billing_period ?? null);
  const net = Number(price?.amount ?? product.base_amount ?? 0);

  return {
    productId: product.id,
    name: product.title,
    category: product.category_name,
    desc: product.description ?? "",
    net,
    vat: 0.22,
    udm: period === "monthly" ? "Mese" : period === "yearly" ? "Anno" : "Una tantum",
    quantity: 1,
    discountPct: 0,
    period,
    lineKind: "line",
    autoAdded: false,
    included: false,
  };
}

function mapSocialPackagePeriod(period: string | null | undefined): QuoteLineItem["period"] {
  if (period === "monthly") return "monthly";
  if (period === "yearly") return "yearly";
  return "oneoff";
}

function socialPackageUdm(period: QuoteLineItem["period"]) {
  if (period === "monthly") return "Mese";
  if (period === "yearly") return "Anno";
  return "Una tantum";
}

function buildSocialPackageDescription(detail: SocialPackageDetail): string {
  const sectionLines = (detail.sections ?? [])
    .slice()
    .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))
    .flatMap((section) =>
      (section.badges ?? [])
        .slice()
        .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))
        .flatMap((badge) =>
          (badge.items ?? [])
            .slice()
            .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))
            .map((item) => item.title?.trim() ?? "")
        )
    )
    .filter((line) => line.length > 0);

  if (sectionLines.length > 0) {
    return sectionLines.join("\n");
  }

  const activeItems = (detail.catalog_items ?? []).filter((item) => {
    const raw = item as unknown as Record<string, unknown>;
    if (raw.is_active == null) return true;
    return raw.is_active !== false;
  });
  if (activeItems.length === 0) {
    return detail.description ?? "";
  }

  return activeItems
    .sort((a, b) => {
      const aRaw = a as unknown as Record<string, unknown>;
      const bRaw = b as unknown as Record<string, unknown>;
      const aSort = Number(aRaw.sort_order ?? 0);
      const bSort = Number(bRaw.sort_order ?? 0);
      return aSort - bSort;
    })
    .map((item) => {
      const raw = item as unknown as Record<string, unknown>;
      const quantity = Number(raw.quantity ?? 1);
      const qtyPrefix = quantity > 1 ? `${quantity}x ` : "";
      const label = String(
        raw.title ??
        raw.label_override ??
        raw.service_name ??
        "Servizio"
      ).trim();
      const description = String(raw.description ?? raw.description_override ?? "").trim();
      return description
        ? `${qtyPrefix}${label} - ${description}`
        : `${qtyPrefix}${label}`;
    })
    .join("\n");
}

function mapSocialPackageToSingleLine(summary: SocialPackageBase, detail: SocialPackageDetail): QuoteLineItem {
  const period = mapSocialPackagePeriod(summary.billing_period ?? detail.billing_period ?? null);
  const quantity = period === "oneoff"
    ? 1
    : Math.max(1, Number(summary.default_duration_months ?? detail.default_duration_months ?? 1));

  return {
    productId: null,
    name: summary.title,
    category: "Pacchetto Social",
    desc: buildSocialPackageDescription(detail),
    net: Number(summary.base_price ?? detail.base_price ?? 0),
    vat: 0.22,
    udm: socialPackageUdm(period),
    quantity,
    discountPct: Number(summary.discount_pct ?? detail.discount_pct ?? 0),
    period,
    lineKind: "line",
    autoAdded: false,
    included: false,
  };
}

function createCustomLine(): QuoteLineItem {
  return {
    productId: null,
    name: "",
    category: "",
    desc: "",
    net: 0,
    vat: 0.22,
    udm: "",
    quantity: 1,
    discountPct: 0,
    period: "oneoff",
    lineKind: "line",
    autoAdded: false,
    included: false,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function sanitizeLineForApi(line: EditableQuoteLine): QuoteLineItem {
  const quantity = Number(line.quantity ?? 1);
  const net = Number(line.net ?? 0);
  const discountPct = Number(line.discountPct ?? 0);
  const vat = Number(line.vat ?? 0.22);
  const period = ALLOWED_PERIODS.includes((line.period ?? "oneoff") as NonNullable<QuoteLineItem["period"]>)
    ? (line.period ?? "oneoff")
    : "oneoff";

  return {
    productId: line.productId ?? null,
    ficProductId: line.ficProductId ?? null,
    area: line.area ?? null,
    boxId: line.boxId ?? null,
    name: (line.name ?? "").trim(),
    category: (line.category ?? "").trim() || null,
    desc: (line.desc ?? "").trim() || null,
    net: round2(Math.max(0, net)),
    vat: round2(Math.max(0, Math.min(1, vat))),
    udm: (line.udm ?? "").trim() || null,
    quantity: round2(Math.max(0, quantity)),
    discountPct: round2(Math.max(0, Math.min(100, discountPct))),
    period,
    lineKind: line.lineKind ?? "line",
    autoAdded: line.autoAdded ?? false,
    included: line.included ?? false,
  };
}

function validateLines(lines: EditableQuoteLine[]): string | null {
  if (lines.length === 0) return "Aggiungi almeno una riga";

  for (let i = 0; i < lines.length; i += 1) {
    const line = sanitizeLineForApi(lines[i]);
    if (!line.name?.trim()) return `Riga ${i + 1}: il nome e obbligatorio`;
    if ((line.net ?? 0) < 0) return `Riga ${i + 1}: il prezzo netto deve essere >= 0`;
    if ((line.quantity ?? 0) <= 0) return `Riga ${i + 1}: la quantita deve essere > 0`;
    if ((line.discountPct ?? 0) < 0 || (line.discountPct ?? 0) > 100) return `Riga ${i + 1}: lo sconto deve essere tra 0 e 100`;
    if ((line.vat ?? 0) < 0 || (line.vat ?? 0) > 1) return `Riga ${i + 1}: IVA non valida`;
    if (!ALLOWED_PERIODS.includes((line.period ?? "oneoff") as NonNullable<QuoteLineItem["period"]>)) return `Riga ${i + 1}: periodo non valido`;
  }

  return null;
}

// Testi di aiuto (popover "?") che spiegano le voci del dettaglio preventivo.
const QUOTE_HELP = {
  totali: {
    title: "Totali del preventivo",
    shortText: "Come si compongono gli importi.",
    longText: [
      "• Mensile: somma delle righe con periodo mensile (canone ricorrente).",
      "• Una tantum: somma delle righe a pagamento singolo (oneoff/annuale).",
      "• Subtotale: Mensile + Una tantum, al netto dell'IVA.",
      "• Sconto globale: (Sconto % × Subtotale) + Sconto fisso €.",
      "• Netto: Subtotale − Sconto globale.",
      "• IVA: imposta calcolata sul Netto (di norma 22%).",
      "• Totale: Netto + IVA, l'importo finale.",
    ].join("\n"),
  },
  periodo: {
    title: "Periodo riga",
    shortText: "Cadenza di fatturazione della riga.",
    longText: [
      "• oneoff: una tantum, pagamento singolo.",
      "• monthly: mensile, canone ricorrente.",
      "• yearly: annuale (dal catalogo).",
      "",
      "Nei totali solo 'monthly' confluisce in Mensile; oneoff e yearly vanno in Una tantum.",
    ].join("\n"),
  },
  udm: {
    title: "UDM — unità di misura",
    shortText: "Unità della riga (es. Mese, Anno, Una tantum, Pezzo).",
    longText:
      "Testo descrittivo dell'unità. Per le righe importate da Fatture in Cloud determina il Periodo: se l'UDM contiene “mese/mensile/month” diventa mensile, altrimenti una tantum.",
  },
  iva: {
    title: "IVA della riga",
    shortText: "Aliquota IVA applicata alla riga.",
    longText:
      "Valore decimale: 0,22 = 22%. Si applica sul netto della riga (prezzo × quantità, meno l'eventuale sconto riga).",
  },
} as const;

const HISTORY_FIELD_LABELS: Record<string, string> = {
  fic_id: "ID FIC",
  fic_company_id: "Azienda FIC",
  fic_document_url: "URL documento FIC",
  fic_pushed_at: "Ultimo sync FIC",
  discount_pct: "Sconto %",
  discount_eur: "Sconto fisso",
  status: "Stato",
};

function formatHistoryValue(value: unknown, fieldName?: string | null): string {
  if (value == null) return "-";
  if (typeof value === "string") {
    if (fieldName === "fic_pushed_at") {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) {
        return date.toLocaleString("it-IT", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
      }
    }
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function getTimelineTitle(event: QuoteEventResponse): string {
  const fieldLabel = event.field_name ? (HISTORY_FIELD_LABELS[event.field_name] ?? event.field_name) : null;
  if (event.event_type === "field_updated" && fieldLabel) {
    return `Campo aggiornato: ${fieldLabel}`;
  }
  if (event.event_type === "status_changed") {
    return "Cambio stato";
  }
  return getQuoteHistoryLabel(event);
}

export function QuoteEditorPage({
  embedded = false,
  forceNew = false,
  forceRequest = false,
  onClose,
  onSaved,
}: {
  /** Reso dentro un modal: niente navigazioni di rotta, chiude via onClose. */
  embedded?: boolean;
  forceNew?: boolean;
  forceRequest?: boolean;
  onClose?: () => void;
  onSaved?: () => void;
} = {}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const toast = useToast();
  const { user, activeCompanyId } = useAuth();
  const isAdmin = !!user?.is_admin;
  const isOperator = !isAdmin;
  const canSeePricing = isAdmin;
  const { selectedCompanyId } = useSelectedCompanyId(activeCompanyId ?? user?.company_id ?? null);
  const isRequestMode = embedded ? forceRequest : location.pathname.startsWith("/requests");
  const useOperatorRequestTerminology = isOperator && !isRequestMode;
  const hideTagAndDiscount = isOperator;
  const editorLabel = isRequestMode || useOperatorRequestTerminology ? "Richiesta" : "Preventivo";
  const primaryActionLabel = useOperatorRequestTerminology
    ? "Invia richiesta"
    : (isRequestMode ? "Salva richiesta" : "Salva preventivo");
  const invalidRedirectedRef = useRef(false);
  const hasLocalLineEditsRef = useRef(false);
  const rowIdCounterRef = useRef(0);

  const navState = (location.state as EditorNavState | null) ?? null;
  const preview = navState?.preview;
  const previewPayload = navState?.previewPayload;
  const previewSource = navState?.previewSource ?? (previewPayload ? "configurator" : undefined);
  const quoteIdFromQuery = Number(searchParams.get("quote_id"));
  const quoteId = embedded ? null : (navState?.quoteId ?? (Number.isFinite(quoteIdFromQuery) ? quoteIdFromQuery : null));
  const isNewDraftMode = embedded ? forceNew : searchParams.get("new") === "1";
  const quotesSearch = useMemo(() => {
    const params = new URLSearchParams(location.search);
    params.delete("quote_id");
    const value = params.toString();
    return value ? `?${value}` : "";
  }, [location.search]);
  const listPath = isRequestMode ? "/requests" : "/quotes";

  const [clients, setClients] = useState<Client[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creatingContract, setCreatingContract] = useState(false);
  const [linkedContractsLoading, setLinkedContractsLoading] = useState(false);
  const [linkedContracts, setLinkedContracts] = useState<QuoteLinkedContractResponse[]>([]);
  const [quoteHistory, setQuoteHistory] = useState<QuoteEventResponse[]>([]);

  // FIC state (from loaded quote)
  const [loadedFicId, setLoadedFicId] = useState<string | null>(null);
  const [loadedFicPushedAt, setLoadedFicPushedAt] = useState<string | null>(null);

  const { push: pushToFic, isPushing: ficPushing, confirmPending: ficConfirm, confirmPush: ficConfirmPush, cancelConfirm: ficCancelConfirm, lastResult: ficResult, lastFicUrl, clearResult: ficClearResult } = usePushQuoteToFic();
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogCategory, setCatalogCategory] = useState("");
  const [socialPackages, setSocialPackages] = useState<SocialPackageBase[]>([]);
  const [socialPackagesLoading, setSocialPackagesLoading] = useState(false);
  const [addingSocialPackageId, setAddingSocialPackageId] = useState<number | null>(null);
  const [ficSyncOpen, setFicSyncOpen] = useState(false);
  const [ficSearchQ, setFicSearchQ] = useState("");
  const [ficFromDate, setFicFromDate] = useState("");
  const [ficToDate, setFicToDate] = useState("");
  const [ficPage, setFicPage] = useState(1);
  const [selectedFicDocumentId, setSelectedFicDocumentId] = useState<number | null>(null);

  const {
    searchResult: ficSearchResult,
    importPreview,
    applyPreview,
    searchLoading: ficSearchLoading,
    importPreviewLoading,
    importExecutionLoading,
    applyPreviewLoading,
    applyExecutionLoading,
    search: searchFicQuotes,
    runImportPreview,
    runImportExecution,
    runApplyPreview,
    runApplyExecution,
    reset: resetFicSync,
  } = useFicQuoteImport({ isAdmin });

  const [date, setDate] = useState(preview?.date ?? new Date().toISOString().slice(0, 10));
  const [title, setTitle] = useState(preview?.title ?? "");
  const [tag, setTag] = useState(preview?.tag ?? "");
  const [notes, setNotes] = useState(preview?.notes ?? "");
  const [appuntiCommerciali, setAppuntiCommerciali] = useState(preview?.appunti_commerciali ?? "");
  const [briefOperativo, setBriefOperativo] = useState(preview?.brief_operativo ?? "");
  const [clientId, setClientId] = useState<number | null>(preview?.client_id ?? null);
  const [discountPct, setDiscountPct] = useState<number>(preview?.discount_pct ?? 0);
  const [discountEur, setDiscountEur] = useState<number>(preview?.discount_eur ?? 0);
  const [lines, setLines] = useState<EditableQuoteLine[]>([]);
  const [quoteCompanyId, setQuoteCompanyId] = useState<number | null>(preview?.company_id ?? previewPayload?.company_id ?? null);
  const [loadedCompanyIds, setLoadedCompanyIds] = useState<number[]>(preview?.company_ids ?? previewPayload?.company_ids ?? []);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [expandedLineIds, setExpandedLineIds] = useState<Record<string, boolean>>({});
  const currentCompanyId = selectedCompanyId ?? activeCompanyId ?? user?.company_id ?? quoteCompanyId ?? null;

  const toEditableLines = (source: QuoteLineItem[]): EditableQuoteLine[] => source.map((line) => {
    rowIdCounterRef.current += 1;
    return {
      ...line,
      rowId: `quote-line-${rowIdCounterRef.current}`,
    };
  });

  useEffect(() => {
    if (preview?.lines?.length) {
      setLines(toEditableLines(preview.lines));
    }
  }, [preview?.lines]);

  useEffect(() => {
    if (!preview && !previewPayload && !quoteId && !isNewDraftMode) {
      if (invalidRedirectedRef.current) return;
      invalidRedirectedRef.current = true;
      toast.error(isRequestMode
        ? "Nessuna richiesta da modificare: genera prima una preview dal configuratore o dal pacchetto social"
        : (!isAdmin
          ? "Nessuna richiesta da modificare: genera prima una preview dal configuratore o dal pacchetto social"
          : "Nessun preventivo da modificare: genera prima una preview dal configuratore o dal pacchetto social"));
      navigate({ pathname: listPath, search: quotesSearch }, { replace: true });
    }
  }, [isAdmin, isNewDraftMode, isRequestMode, listPath, navigate, previewPayload, preview, quoteId, quotesSearch, toast]);

  useEffect(() => {
    if (!quoteId) return;

    let cancelled = false;
    (async () => {
      try {
        const quote = isRequestMode ? await getRequestApi(quoteId) : await getQuoteApi(quoteId);
        if (!cancelled) {
          setDate(quote.date ?? new Date().toISOString().slice(0, 10));
          setTitle(quote.title ?? "");
          setTag(quote.tag ?? "");
          setNotes(quote.notes ?? "");
          setAppuntiCommerciali(quote.appunti_commerciali ?? "");
          setBriefOperativo(quote.brief_operativo ?? "");
          setClientId(quote.client_id ?? null);
          setDiscountPct(quote.discount_pct ?? 0);
          setDiscountEur(quote.discount_eur ?? 0);
          if (!hasLocalLineEditsRef.current) {
            setLines(toEditableLines(quote.lines ?? []));
          }
          setQuoteCompanyId(quote.company_id ?? null);
          setLoadedCompanyIds(quote.company_ids ?? (quote.company_id != null ? [quote.company_id] : []));
          setLoadedFicId(quote.fic_id ?? null);
          setLoadedFicPushedAt(quote.fic_pushed_at ?? null);
          setQuoteHistory(quote.history ?? []);
        }
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Errore";
        if (message.includes("[403]")) {
          navigate("/forbidden", { replace: true });
          return;
        }
        toast.error((isRequestMode || useOperatorRequestTerminology) ? "Impossibile caricare la richiesta" : "Impossibile caricare il preventivo");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isRequestMode, quoteId, toast, useOperatorRequestTerminology]);

  useEffect(() => {
    let cancelled = false;
    setClientsLoading(true);
    (async () => {
      try {
        const clientsCompanyId = selectedCompanyId ?? quoteCompanyId ?? user?.company_id ?? undefined;
        const list = await getClientsApi({ company_id: clientsCompanyId });
        if (!cancelled) setClients(list.data);
      } catch {
        if (!cancelled) toast.error("Impossibile caricare i clienti");
      } finally {
        if (!cancelled) setClientsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [quoteCompanyId, selectedCompanyId, toast, user?.company_id]);

  useEffect(() => {
    if (!quoteId || isRequestMode || !isAdmin) {
      setLinkedContracts([]);
      return;
    }

    let cancelled = false;
    setLinkedContractsLoading(true);
    void getQuoteLinkedContractsApi(quoteId)
      .then((rows) => {
        if (cancelled) return;
        setLinkedContracts(rows);
      })
      .catch((err) => {
        if (cancelled) return;
        toast.error(err instanceof Error ? err.message : "Errore caricamento contratti collegati");
      })
      .finally(() => {
        if (cancelled) return;
        setLinkedContractsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isAdmin, isRequestMode, quoteId, toast]);

  useEffect(() => {
    if (quoteId || isRequestMode) return;
    setQuoteHistory([]);
  }, [isRequestMode, quoteId]);

  const catalogCompanyId = useMemo(() => {
    if (!catalogOpen) return null;
    return (
      selectedCompanyId ??
      (quoteId ? user?.company_id : null) ??
      quoteCompanyId ??
      preview?.company_id ??
      previewPayload?.company_id ??
      user?.company_id ??
      null
    );
  }, [catalogOpen, preview?.company_id, previewPayload?.company_id, quoteCompanyId, quoteId, selectedCompanyId, user?.company_id]);

  const {
    products: catalogProducts,
    isLoading: catalogLoading,
    error: catalogError,
  } = useCatalogProductsFlat(catalogCompanyId, { only_standalone: true });

  useEffect(() => {
    if (!catalogOpen || !catalogError) return;
    toast.error(catalogError);
  }, [catalogError, catalogOpen, toast]);

  useEffect(() => {
    if (!catalogOpen || !catalogCompanyId) {
      setSocialPackages([]);
      setSocialPackagesLoading(false);
      return;
    }

    let cancelled = false;
    setSocialPackagesLoading(true);
    void listSocialPackagesApi({ company_id: catalogCompanyId })
      .then((rows) => {
        if (cancelled) return;
        setSocialPackages(rows.filter((pkg) => pkg.is_active));
      })
      .catch((err) => {
        if (cancelled) return;
        setSocialPackages([]);
        toast.error(err instanceof Error ? err.message : "Errore caricamento pacchetti social");
      })
      .finally(() => {
        if (!cancelled) setSocialPackagesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [catalogCompanyId, catalogOpen, toast]);

  const totals = useMemo(() => {
    if (!canSeePricing) {
      return {
        subtotal: 0,
        global_discount: 0,
        net: 0,
        vat_amount: 0,
        total: 0,
        monthly: 0,
        one_time: 0,
      };
    }
    return computeTotals(lines, discountPct, discountEur);
  }, [canSeePricing, lines, discountPct, discountEur]);

  const updateLineField = <K extends keyof EditableQuoteLine>(index: number, field: K, value: EditableQuoteLine[K]) => {
    hasLocalLineEditsRef.current = true;
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, [field]: value } : line)));
  };

  const updateLineNumber = (index: number, field: "quantity" | "net" | "discountPct" | "vat", value: number) => {
    updateLineField(index, field, Number.isFinite(value) ? value : 0);
  };

  const removeLine = (index: number) => {
    hasLocalLineEditsRef.current = true;
    setLines((prev) => {
      const target = prev[index];
      if (!target) return prev;
      if (target.included === true) return prev;
      return prev.filter((_, i) => i !== index);
    });
  };

  const addCatalogProduct = (product: CatalogProductFlatResponse) => {
    hasLocalLineEditsRef.current = true;
    rowIdCounterRef.current += 1;
    const rowId = `quote-line-${rowIdCounterRef.current}`;
    const mapped = mapCatalogProductToLine(product);
    setLines((prev) => [...prev, { ...mapped, rowId }]);
    setCatalogOpen(false);
    setCatalogSearch("");
    setCatalogCategory("");
    toast.success("Servizio aggiunto dal catalogo");
  };

  const addSocialPackage = async (summary: SocialPackageBase) => {
    setAddingSocialPackageId(summary.id);
    try {
      const detail = await getSocialPackageApi(summary.id);
      const mapped = mapSocialPackageToSingleLine(summary, detail);
      hasLocalLineEditsRef.current = true;
      rowIdCounterRef.current += 1;
      const rowId = `quote-line-${rowIdCounterRef.current}`;
      setLines((prev) => [...prev, { ...mapped, rowId }]);
      setCatalogOpen(false);
      setCatalogSearch("");
      setCatalogCategory("");
      toast.success("Pacchetto social aggiunto al preventivo");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore aggiunta pacchetto social");
    } finally {
      setAddingSocialPackageId(null);
    }
  };

  const addCustomLine = () => {
    hasLocalLineEditsRef.current = true;
    rowIdCounterRef.current += 1;
    const rowId = `quote-line-${rowIdCounterRef.current}`;
    setLines((prev) => [...prev, { ...createCustomLine(), rowId }]);
    setExpandedLineIds((prev) => ({ ...prev, [rowId]: true }));
  };

  const toggleExpandedLine = (rowId: string) => {
    setExpandedLineIds((prev) => ({ ...prev, [rowId]: !prev[rowId] }));
  };

  const catalogCategories = useMemo(
    () => Array.from(new Set(catalogProducts.map((product) => product.category_name).filter(Boolean))).sort((a, b) => a.localeCompare(b, "it")),
    [catalogProducts]
  );

  const filteredCatalogProducts = useMemo(() => {
    const q = catalogSearch.trim().toLowerCase();
    return catalogProducts.filter((product) => {
      const matchesCategory = !catalogCategory || product.category_name === catalogCategory;
      if (!matchesCategory) return false;
      if (!q) return true;
      return (
        product.title.toLowerCase().includes(q) ||
        (product.category_name ?? "").toLowerCase().includes(q)
      );
    });
  }, [catalogCategory, catalogProducts, catalogSearch]);

  const filteredSocialPackages = useMemo(() => {
    const q = catalogSearch.trim().toLowerCase();
    return socialPackages.filter((pkg) => {
      if (!q) return true;
      return (
        pkg.title.toLowerCase().includes(q) ||
        (pkg.description ?? "").toLowerCase().includes(q) ||
        (pkg.area ?? "").toLowerCase().includes(q)
      );
    });
  }, [catalogSearch, socialPackages]);

  const reloadCurrentQuoteFromServer = async () => {
    if (!quoteId) return;
    const q = isRequestMode ? await getRequestApi(quoteId) : await getQuoteApi(quoteId);
    setDate(q.date ?? new Date().toISOString().slice(0, 10));
    setTitle(q.title ?? "");
    setTag(q.tag ?? "");
    setNotes(q.notes ?? "");
    setAppuntiCommerciali(q.appunti_commerciali ?? "");
    setBriefOperativo(q.brief_operativo ?? "");
    setClientId(q.client_id ?? null);
    setDiscountPct(q.discount_pct ?? 0);
    setDiscountEur(q.discount_eur ?? 0);
    hasLocalLineEditsRef.current = false;
    setLines(toEditableLines(q.lines ?? []));
    setQuoteCompanyId(q.company_id ?? null);
    setLoadedCompanyIds(q.company_ids ?? (q.company_id != null ? [q.company_id] : []));
    setLoadedFicId(q.fic_id ?? null);
    setLoadedFicPushedAt(q.fic_pushed_at ?? null);
    setQuoteHistory(q.history ?? []);
  };

  const runFicSearch = async (page = 1) => {
    setFicPage(page);
    try {
      await searchFicQuotes({
        page,
        per_page: 20,
        q: ficSearchQ.trim() || undefined,
        from_date: ficFromDate || undefined,
        to_date: ficToDate || undefined,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore ricerca preventivi FIC");
    }
  };

  const handlePreviewApplyFromFic = async (ficDocumentId: number) => {
    setSelectedFicDocumentId(ficDocumentId);
    try {
      if (quoteId) {
        await runApplyPreview({
          ficDocumentId,
          quoteId,
          payload: {
            update_header: true,
            update_client: true,
            replace_lines: true,
            status_on_apply: null,
          },
        });
      } else {
        await runImportPreview({
          fic_document_id: ficDocumentId,
          fic_company_id: ficSearchResult?.fic_company_id,
          kind_on_import: "preventivo",
        });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore anteprima import da FIC");
    }
  };

  const handleConfirmApplyFromFic = async () => {
    if (selectedFicDocumentId == null) return;
    try {
      if (quoteId) {
        await runApplyExecution({
          ficDocumentId: selectedFicDocumentId,
          quoteId,
          payload: {
            update_header: true,
            update_client: true,
            replace_lines: true,
            status_on_apply: null,
          },
        });
        await reloadCurrentQuoteFromServer();
        toast.success("Preventivo sincronizzato da Fatture in Cloud");
      } else {
        const result = await runImportExecution({
          fic_document_id: selectedFicDocumentId,
          fic_company_id: ficSearchResult?.fic_company_id,
          kind_on_import: "preventivo",
        });
        if (result.status === "ok" && "local_quote_id" in result && result.local_quote_id != null) {
          const params = new URLSearchParams(location.search);
          params.set("quote_id", String(result.local_quote_id));
          params.delete("new");
          navigate({
            pathname: location.pathname,
            search: `?${params.toString()}`,
          }, { replace: true });
        }
        toast.success("Preventivo importato da Fatture in Cloud");
      }
      setFicSyncOpen(false);
      setSelectedFicDocumentId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore import da FIC");
    }
  };

  const save = async (opts?: { submit?: boolean }) => {
    if (isReadOnly) {
      toast.error((isRequestMode || useOperatorRequestTerminology) ? "Richiesta in sola lettura per questo stato o permesso" : "Preventivo in sola lettura per questo stato o permesso");
      return;
    }
    if (!clientId) {
      toast.error("Seleziona un cliente prima di salvare");
      return;
    }

    const lineValidationError = validateLines(lines);
    if (lineValidationError) {
      toast.error(lineValidationError);
      return;
    }

    const apiLines = lines.map(sanitizeLineForApi);

    setSaving(true);
    try {
      const targetCompanyId = currentCompanyId;
      const isCompanyChanged = !!quoteId && targetCompanyId != null && quoteCompanyId != null && targetCompanyId !== quoteCompanyId;
      const companyPayload = normalizeCompanyPayload(
        targetCompanyId,
        loadedCompanyIds.length > 0
          ? loadedCompanyIds
          : (user?.company_ids ?? (targetCompanyId != null ? [targetCompanyId] : []))
      );

      const requestPayload: CreateQuotePayload = {
        ...companyPayload,
        kind: isRequestMode ? "richiesta" : (previewPayload?.kind ?? "preventivo"),
      };

      const effectivePayload: CreateQuotePayload = previewPayload
        ? {
            ...previewPayload,
            ...requestPayload,
            client_id: clientId,
            date: date || null,
            title: title || null,
            tag: hideTagAndDiscount ? null : (tag || null),
            notes: notes || null,
            appunti_commerciali: appuntiCommerciali || null,
            brief_operativo: briefOperativo || null,
            discount_pct: hideTagAndDiscount ? 0 : (canSeePricing ? discountPct : 0),
            discount_eur: hideTagAndDiscount ? 0 : (canSeePricing ? discountEur : 0),
            lines: apiLines,
          }
        : {
          ...requestPayload,
            client_id: clientId,
            date: date || null,
            title: title || null,
            tag: hideTagAndDiscount ? null : (tag || null),
            notes: notes || null,
            appunti_commerciali: appuntiCommerciali || null,
            brief_operativo: briefOperativo || null,
            discount_pct: hideTagAndDiscount ? 0 : (canSeePricing ? discountPct : 0),
            discount_eur: hideTagAndDiscount ? 0 : (canSeePricing ? discountEur : 0),
            lines: apiLines,
            configurator: null,
          };

      let createdId: number | null = null;
      if (quoteId && !isCompanyChanged) {
            if (isRequestMode) {
              await updateRequestApi(quoteId, effectivePayload);
            } else {
              await updateQuoteApi(quoteId, effectivePayload);
            }
      } else if (quoteId && isCompanyChanged) {
            if (isRequestMode) {
              createdId = (await createRequestApi(effectivePayload)).id;
            } else {
              await createQuoteApi(effectivePayload);
            }
      } else if (previewSource === "configurator") {
            if (isRequestMode) {
              createdId = (await createRequestFromConfiguratorApi(effectivePayload)).id;
            } else {
              await createQuoteFromConfiguratorApi(effectivePayload);
            }
      } else {
            if (isRequestMode) {
              createdId = (await createRequestApi(effectivePayload)).id;
            } else {
              await createQuoteApi(effectivePayload);
            }
      }

      // "Invia richiesta": creata la bozza, la si porta subito allo stato di invio
      // (così esce dalle bozze private e diventa visibile a PM/admin).
      if (opts?.submit && createdId != null) {
        const target = getAllowedTransitions("bozza", isAdmin)[0];
        if (target) {
          try {
            await updateRequestStatusApi(createdId, target);
            toast.success("Richiesta inviata");
          } catch {
            toast.error("Richiesta creata, ma l'invio non è riuscito: resta in bozza.");
          }
        }
      } else if (quoteId && isCompanyChanged) {
            toast.success(isRequestMode ? "Richiesta salvata nella nuova company" : "Preventivo salvato nella nuova company");
      } else {
            toast.success(quoteId ? (isRequestMode ? "Richiesta aggiornata" : "Preventivo aggiornato") : (isRequestMode ? "Richiesta salvata" : "Preventivo salvato"));
      }
      if (embedded) {
        onSaved?.();
        onClose?.();
        return;
      }
      const redirectParams = new URLSearchParams(quotesSearch);
      if (currentCompanyId != null) {
        redirectParams.set("company_id", String(currentCompanyId));
      }
          navigate({ pathname: listPath, search: `?${redirectParams.toString()}` });
    } catch (err) {
          const message = err instanceof Error ? err.message : "Errore";
          if (message.includes("[403]") || message.includes("[422]")) {
            setIsReadOnly(true);
          }
          toast.error(err instanceof Error ? err.message : (isRequestMode ? "Errore salvataggio richiesta" : "Errore salvataggio preventivo"));
    } finally {
      setSaving(false);
    }
      };

  const createContractFromQuote = async () => {
    if (isRequestMode) {
      toast.error("Questa azione è disponibile solo sui preventivi");
      return;
    }
    if (!quoteId) {
      toast.error("Salva prima il preventivo");
      return;
    }
    if (!currentCompanyId) {
      toast.error("Company non disponibile");
      return;
    }

    setCreatingContract(true);
    try {
      const contract = await createContractApi({
        company_id: currentCompanyId,
        client_id: clientId,
        title: title || `Contratto da preventivo #${quoteId}${tag ? ` · ${tag}` : ""}`,
        contract_type: "commercial",
        commercial_stage: "bozza",
        pricing_view_mode: "single_quote",
        commercial_notes: appuntiCommerciali || null,
        operational_brief: briefOperativo || null,
        featured_quote_id: quoteId,
        quote_links: [
          {
            quote_id: quoteId,
            include_in_total: true,
            is_primary: true,
            display_order: 0,
            label: "Preventivo principale",
          },
        ],
      });
      toast.success("Contratto creato dal preventivo");
      navigate("/contracts-pipeline", {
        state: { fromQuoteId: quoteId, createdContractId: contract.id },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore creazione contratto da preventivo");
    } finally {
      setCreatingContract(false);
    }
  };

  return (
    <div className={embedded ? "w-full" : "px-6 py-8 pb-20 mx-auto w-full animate-fadeIn"}>
      {!embedded && (
        <>
          <div className="section-eyebrow">
            <Icon name="list" className="w-3.5 h-3.5" />
            {`Editor ${editorLabel}`}
          </div>
          <h1 className="section-title">{`Modifica ${editorLabel}`}</h1>
          <p className="section-lead">{hideTagAndDiscount ? "Rivedi righe e cliente prima del salvataggio definitivo della richiesta." : "Rivedi righe, sconti e cliente prima del salvataggio definitivo."}</p>
        </>
      )}

      <div className={embedded ? "grid grid-cols-1 gap-5" : "grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6 mt-8"}>
        <div className="rounded-lg border border-line dark:border-[#2a2a2e] bg-paper dark:bg-[#131316] overflow-hidden">
          <div className={"p-5 border-b border-line dark:border-[#2a2a2e] grid grid-cols-1 gap-4" + (embedded ? "" : " md:grid-cols-2")}>
            <Input label="Data" type="date" value={date ?? ""} onChange={(e) => setDate(e.target.value)} disabled={isReadOnly} />
            <Input label="Titolo" value={title ?? ""} onChange={(e) => setTitle(e.target.value)} placeholder={(isRequestMode || useOperatorRequestTerminology) ? "Es. Richiesta Campagna Estate 2026" : "Es. Preventivo Campagna Estate 2026"} disabled={isReadOnly} />
            {!hideTagAndDiscount && (
              <Input label="Tag" value={tag ?? ""} onChange={(e) => setTag(e.target.value)} placeholder="Configuratore Social" disabled={isReadOnly} />
            )}

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">Cliente</label>
              <ClientSelectorWithCreate
                value={clientId != null ? String(clientId) : ""}
                onChange={(nextValue) => setClientId(nextValue ? Number(nextValue) : null)}
                clients={clients}
                clientsLoading={clientsLoading}
                companyId={selectedCompanyId ?? quoteCompanyId ?? user?.company_id ?? null}
                disabled={isReadOnly}
                placeholder="- Seleziona cliente -"
                emptyMessage="Nessun cliente"
                includeEmptyOption
                emptyOptionLabel={clientsLoading ? "Caricamento in corso..." : "- Seleziona cliente -"}
              />
            </div>

            {!hideTagAndDiscount && canSeePricing && (
              <>
                <Input
                  label="Sconto %"
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={String(discountPct)}
                  onChange={(e) => setDiscountPct(Number(e.target.value) || 0)}
                  disabled={isReadOnly}
                />

                <Input
                  label="Sconto fisso €"
                  type="number"
                  min={0}
                  step={0.01}
                  value={String(discountEur)}
                  onChange={(e) => setDiscountEur(Number(e.target.value) || 0)}
                  disabled={isReadOnly}
                />
              </>
            )}

            <div className="md:col-span-2 flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">Note</label>
              <Textarea
                rows={3}
                value={notes ?? ""}
                onChange={(e) => setNotes(e.target.value)}
                disabled={isReadOnly}
                className="w-full px-3.5 py-2.5 rounded-md text-[13px] font-body text-ink dark:text-[#f4f4f7] placeholder:text-muted/60 dark:placeholder:text-[#9999a0]/60 border border-line dark:border-[#2a2a2e] bg-paper dark:bg-[#1c1c20] outline-none transition-colors focus:border-ink dark:focus:border-[#f4f4f7] resize-none"
              />
            </div>

            {/* Appunti commerciali */}
            <div className="md:col-span-2 flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
                Appunti commerciali
                <span className="ml-1.5 text-[10px] normal-case font-normal text-muted/60">Note interne tra un appuntamento e l'altro. Non vanno al cliente, servono a strutturare il brief operativo.</span>
              </label>
              <Textarea
                rows={3}
                value={appuntiCommerciali ?? ""}
                onChange={(e) => setAppuntiCommerciali(e.target.value)}
                onBlur={async () => {
                  if (isReadOnly) return;
                  if (!quoteId) return;
                  try {
                    const companyPayload = normalizeCompanyPayload(
                      selectedCompanyId ?? quoteCompanyId ?? user?.company_id ?? null,
                      loadedCompanyIds.length > 0
                        ? loadedCompanyIds
                        : (user?.company_ids ?? [])
                    );
                    await updateQuoteApi(quoteId, {
                      appunti_commerciali: appuntiCommerciali || null,
                      ...companyPayload,
                    });
                  } catch { /* ignore autosave error */ }
                }}
                placeholder="Es. Decisore Marco (CFO), budget +20% se ROAS provato…"
                className="w-full px-3.5 py-2.5 rounded-md text-[13px] font-body text-ink dark:text-[#f4f4f7] placeholder:text-muted/50 dark:placeholder:text-[#9999a0]/50 border border-line dark:border-[#2a2a2e] bg-paper dark:bg-[#1c1c20] outline-none transition-colors focus:border-ink dark:focus:border-[#f4f4f7] resize-none"
              />
            </div>

            {/* Brief operativo */}
            <div className="md:col-span-2 flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
                Brief operativo
                <span className="ml-1.5 text-[10px] normal-case font-normal text-muted/60">Istruzioni operative per il team. Al passaggio in Firmato popola la mail di automation e la card Trello.</span>
              </label>
              <Textarea
                rows={3}
                value={briefOperativo ?? ""}
                onChange={(e) => setBriefOperativo(e.target.value)}
                onBlur={async () => {
                  if (isReadOnly) return;
                  if (!quoteId) return;
                  try {
                    const companyPayload = normalizeCompanyPayload(
                      selectedCompanyId ?? quoteCompanyId ?? user?.company_id ?? null,
                      loadedCompanyIds.length > 0
                        ? loadedCompanyIds
                        : (user?.company_ids ?? [])
                    );
                    await updateQuoteApi(quoteId, {
                      brief_operativo: briefOperativo || null,
                      ...companyPayload,
                    });
                  } catch { /* ignore autosave error */ }
                }}
                placeholder="Es. Obiettivo follower +20% in 3 mesi, ToV elegante, lun/mer/ven, 1 reel/sett…"
                className="w-full px-3.5 py-2.5 rounded-md text-[13px] font-body text-ink dark:text-[#f4f4f7] placeholder:text-muted/50 dark:placeholder:text-[#9999a0]/50 border border-line dark:border-[#2a2a2e] bg-paper dark:bg-[#1c1c20] outline-none transition-colors focus:border-ink dark:focus:border-[#f4f4f7] resize-none"
              />
            </div>

            <div className="md:col-span-2 flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setCatalogOpen(true)} leftIcon={<Icon name="plus" className="w-4 h-4" />} disabled={isReadOnly}>
                Aggiungi servizio dal catalogo
              </Button>
              <Button variant="ghost" onClick={addCustomLine} leftIcon={<Icon name="plus" className="w-4 h-4" />} disabled={isReadOnly}>
                Aggiungi riga custom
              </Button>
            </div>
          </div>

          <div className="divide-y divide-line dark:divide-[#2a2a2e]">
            {lines.length === 0 ? (
              <div className="p-6 text-sm text-muted">Nessuna riga da mostrare.</div>
            ) : lines.map((line, index) => {
              const included = line.included === true;
              const isExpanded = !!expandedLineIds[line.rowId];
              const quantity = Math.max(0, Number(line.quantity ?? 1));
              const unitNet = Math.max(0, Number(line.net ?? 0));
              const lineDiscountPct = Math.max(0, Math.min(100, Number(line.discountPct ?? 0)));
              const discountedUnitNet = unitNet * (1 - lineDiscountPct / 100);
              const lineTotalNet = discountedUnitNet * quantity;
              return (
                <div key={line.rowId} className={`p-4 hover:bg-cream dark:hover:bg-[#1c1c20] transition-colors ${included ? "bg-slate-50/70 dark:bg-slate-900/30 md:ml-3 border-l-2 border-slate-300 dark:border-slate-700" : ""}`}>
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase tracking-wider text-muted font-semibold">
                        {line.category || "Senza categoria"} · {line.period ?? "oneoff"}{included ? " · Inclusa" : ""}
                      </div>
                      <div className="text-sm font-semibold text-ink dark:text-[#f4f4f7] truncate">
                        {line.name || "(Senza nome)"}
                      </div>
                      {line.desc ? <div className="text-xs text-muted dark:text-[#9999a0] line-clamp-2">{line.desc}</div> : null}
                    </div>

                    <div className="flex items-center gap-2 text-xs text-muted dark:text-[#9999a0]">
                      <span className="rounded-md border border-line dark:border-[#2a2a2e] px-2 py-1">Q.ta {line.quantity ?? 1}</span>
                      {canSeePricing ? (
                        <span className="rounded-md border border-line dark:border-[#2a2a2e] px-2 py-1">
                          {lineDiscountPct > 0 ? (
                            <>
                              <span className="line-through opacity-70 mr-1">{formatEur(unitNet)}</span>
                              <span className="text-success font-semibold">{formatEur(discountedUnitNet)}</span>
                            </>
                          ) : (
                            formatEur(unitNet)
                          )}
                        </span>
                      ) : null}
                      {canSeePricing ? (
                        <span className="rounded-md border border-line dark:border-[#2a2a2e] px-2 py-1 font-semibold text-ink dark:text-[#f4f4f7]">
                          Tot: {formatEur(lineTotalNet)}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => toggleExpandedLine(line.rowId)}
                        disabled={isReadOnly}
                        className="h-8 rounded-md border border-line dark:border-[#2a2a2e] px-3 text-xs font-semibold text-ink dark:text-[#f4f4f7] disabled:opacity-40"
                      >
                        {isExpanded ? "Chiudi" : "Modifica"}
                      </button>
                      <button
                        type="button"
                        title={included ? "Voce inclusa nel bundle" : "Rimuovi riga"}
                        disabled={included || isReadOnly}
                        onClick={() => removeLine(index)}
                        className="h-8 w-8 rounded-full border border-line dark:border-[#2a2a2e] text-muted disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {included ? "🔒" : "×"}
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-3 flex flex-col gap-2">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <label className="flex flex-col gap-1">
                          <span className="text-[10px] uppercase tracking-wider text-muted font-semibold">Voce</span>
                          <input
                            className="w-full rounded-md border px-3 py-2 text-sm font-body bg-paper dark:bg-[#1c1c20] text-ink dark:text-[#f4f4f7] border-line dark:border-[#2a2a2e] outline-none focus:border-ink dark:focus:border-[#f4f4f7]"
                            value={line.name ?? ""}
                            onChange={(e) => updateLineField(index, "name", e.target.value)}
                            disabled={isReadOnly}
                          />
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-[10px] uppercase tracking-wider text-muted font-semibold">Descrizione</span>
                          <Textarea
                            rows={3}
                            className="w-full rounded-md border px-3 py-2 text-sm font-body bg-paper dark:bg-[#1c1c20] text-ink dark:text-[#f4f4f7] border-line dark:border-[#2a2a2e] outline-none focus:border-ink dark:focus:border-[#f4f4f7] resize-y min-h-[88px]"
                            value={line.desc ?? ""}
                            onChange={(e) => updateLineField(index, "desc", e.target.value)}
                            disabled={isReadOnly}
                          />
                        </label>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <label className="flex flex-col gap-1">
                          <span className="text-[10px] uppercase tracking-wider text-muted font-semibold">Categoria</span>
                          <input
                            className="w-full rounded-md border px-3 py-2 text-sm font-body bg-paper dark:bg-[#1c1c20] text-ink dark:text-[#f4f4f7] border-line dark:border-[#2a2a2e] outline-none focus:border-ink dark:focus:border-[#f4f4f7]"
                            value={line.category ?? ""}
                            onChange={(e) => updateLineField(index, "category", e.target.value)}
                            disabled={isReadOnly}
                          />
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="inline-flex items-center text-[10px] uppercase tracking-wider text-muted font-semibold">Periodo<FieldHelpPopover {...QUOTE_HELP.periodo} /></span>
                          <select
                            className="w-full rounded-md border px-2.5 py-2 text-sm font-body bg-paper dark:bg-[#1c1c20] text-ink dark:text-[#f4f4f7] border-line dark:border-[#2a2a2e] outline-none focus:border-ink dark:focus:border-[#f4f4f7]"
                            value={line.period ?? "oneoff"}
                            onChange={(e) => updateLineField(index, "period", e.target.value as QuoteLineItem["period"])}
                            disabled={isReadOnly}
                          >
                            <option value="oneoff">oneoff</option>
                            <option value="monthly">monthly</option>
                            <option value="yearly">yearly</option>
                          </select>
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="inline-flex items-center text-[10px] uppercase tracking-wider text-muted font-semibold">Udm<FieldHelpPopover {...QUOTE_HELP.udm} /></span>
                          <input
                            className="w-full rounded-md border px-3 py-2 text-sm font-body bg-paper dark:bg-[#1c1c20] text-ink dark:text-[#f4f4f7] border-line dark:border-[#2a2a2e] outline-none focus:border-ink dark:focus:border-[#f4f4f7]"
                            value={line.udm ?? ""}
                            onChange={(e) => updateLineField(index, "udm", e.target.value)}
                            disabled={isReadOnly}
                          />
                        </label>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        <label className="flex flex-col gap-1">
                          <span className="text-[10px] uppercase tracking-wider text-muted font-semibold">Q.ta</span>
                          <input
                            className="w-full rounded-md border px-3 py-2 text-sm font-body text-right bg-paper dark:bg-[#1c1c20] text-ink dark:text-[#f4f4f7] border-line dark:border-[#2a2a2e] outline-none focus:border-ink dark:focus:border-[#f4f4f7]"
                            type="number"
                            min={0}
                            step={0.01}
                            value={line.quantity ?? 1}
                            onChange={(e) => updateLineNumber(index, "quantity", Number(e.target.value))}
                            disabled={isReadOnly}
                          />
                        </label>
                        {canSeePricing && (
                          <>
                            <label className="flex flex-col gap-1">
                              <span className="text-[10px] uppercase tracking-wider text-muted font-semibold">Prezzo</span>
                              <input
                                className="w-full rounded-md border px-3 py-2 text-sm font-body text-right bg-paper dark:bg-[#1c1c20] text-ink dark:text-[#f4f4f7] border-line dark:border-[#2a2a2e] outline-none focus:border-ink dark:focus:border-[#f4f4f7]"
                                type="number"
                                min={0}
                                step={0.01}
                                value={line.net ?? 0}
                                onChange={(e) => updateLineNumber(index, "net", Number(e.target.value))}
                                disabled={isReadOnly}
                              />
                            </label>
                            <label className="flex flex-col gap-1">
                              <span className="text-[10px] uppercase tracking-wider text-muted font-semibold">Sconto %</span>
                              <input
                                className="w-full rounded-md border px-3 py-2 text-sm font-body text-right bg-paper dark:bg-[#1c1c20] text-ink dark:text-[#f4f4f7] border-line dark:border-[#2a2a2e] outline-none focus:border-ink dark:focus:border-[#f4f4f7]"
                                type="number"
                                min={0}
                                max={100}
                                step={0.01}
                                value={line.discountPct ?? 0}
                                onChange={(e) => updateLineNumber(index, "discountPct", Number(e.target.value))}
                                disabled={isReadOnly}
                              />
                            </label>
                            <label className="flex flex-col gap-1">
                              <span className="inline-flex items-center text-[10px] uppercase tracking-wider text-muted font-semibold">Iva<FieldHelpPopover {...QUOTE_HELP.iva} /></span>
                              <input
                                className="w-full rounded-md border px-3 py-2 text-sm font-body text-right bg-paper dark:bg-[#1c1c20] text-ink dark:text-[#f4f4f7] border-line dark:border-[#2a2a2e] outline-none focus:border-ink dark:focus:border-[#f4f4f7]"
                                type="number"
                                min={0}
                                max={1}
                                step={0.01}
                                value={line.vat ?? 0.22}
                                onChange={(e) => updateLineNumber(index, "vat", Number(e.target.value))}
                                disabled={isReadOnly}
                              />
                            </label>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <aside className="rounded-lg border border-line dark:border-[#2a2a2e] bg-paper dark:bg-[#131316] p-5 h-fit sticky top-5">
          {canSeePricing ? (
            <>
              <div className="flex items-center text-xs uppercase tracking-wider text-muted font-semibold">
                Totali
                <FieldHelpPopover {...QUOTE_HELP.totali} />
              </div>
              <div className="mt-4 space-y-2 text-sm font-body">
                <div className="flex justify-between"><span className="text-muted dark:text-[#9999a0]">Mensile</span><b>{formatEur(totals.monthly)}</b></div>
                <div className="flex justify-between"><span className="text-muted dark:text-[#9999a0]">Una tantum</span><b>{formatEur(totals.one_time)}</b></div>
                <div className="flex justify-between"><span className="text-muted dark:text-[#9999a0]">Subtotale</span><b>{formatEur(totals.subtotal)}</b></div>
                {!hideTagAndDiscount && (
                  <div className="flex justify-between text-pink-600"><span>Sconto globale</span><b>-{formatEur(totals.global_discount)}</b></div>
                )}
                <div className="flex justify-between"><span className="text-muted dark:text-[#9999a0]">Netto</span><b>{formatEur(totals.net)}</b></div>
                <div className="flex justify-between"><span className="text-muted dark:text-[#9999a0]">IVA</span><b>{formatEur(totals.vat_amount)}</b></div>
                <div className="pt-3 mt-2 border-t border-line dark:border-[#2a2a2e] flex justify-between text-lg font-bold">
                  <span>Totale</span><span>{formatEur(totals.total)}</span>
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-md border border-line dark:border-[#2a2a2e] p-3 text-sm text-muted dark:text-[#9999a0]">
              Importi e sconti non visibili per il tuo ruolo.
            </div>
          )}

          {isReadOnly && (
            <div className="mt-4 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
              Modifica bloccata da regole backend o permessi (403/422). Il record e in sola lettura.
            </div>
          )}

          <div className="mt-5 flex flex-col gap-2">
            {embedded ? (
              <>
                <Button variant="primary" onClick={() => void save({ submit: true })} loading={saving} disabled={isReadOnly}>
                  Invia richiesta
                </Button>
                <Button variant="secondary" onClick={() => void save({ submit: false })} loading={saving} disabled={isReadOnly}>
                  Salva bozza
                </Button>
              </>
            ) : (
              <Button variant="primary" onClick={() => void save()} loading={saving} disabled={isReadOnly}>{primaryActionLabel}</Button>
            )}
            {!isRequestMode && isAdmin && (
              <Button
                variant="secondary"
                onClick={() => void createContractFromQuote()}
                loading={creatingContract}
                disabled={!quoteId}
                leftIcon={<Icon name="document-text" className="w-4 h-4" />}
              >
                Crea contratto da questo preventivo
              </Button>
            )}
            {!isRequestMode && isAdmin && (
              <Button
                variant="secondary"
                onClick={() => {
                  const next = !ficSyncOpen;
                  setFicSyncOpen(next);
                  if (next) {
                    resetFicSync();
                    void runFicSearch(1);
                  }
                }}
              >
                {quoteId ? "Sincronizza da Fatture in Cloud" : "Importa da Fatture in Cloud"}
              </Button>
            )}

            {ficSyncOpen && isAdmin && !isRequestMode && (
              <div className="rounded-md border border-line dark:border-[#2a2a2e] p-3 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                  <div className="md:col-span-2">
                    <Input
                      label="Cerca"
                      value={ficSearchQ}
                      onChange={(event) => setFicSearchQ(event.target.value)}
                      placeholder="Nome cliente, descrizione, titolo"
                    />
                  </div>
                  <Input
                    label="Da data"
                    type="date"
                    value={ficFromDate}
                    onChange={(event) => setFicFromDate(event.target.value)}
                  />
                  <Input
                    label="A data"
                    type="date"
                    value={ficToDate}
                    onChange={(event) => setFicToDate(event.target.value)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-xs text-muted dark:text-[#9999a0]">
                    {quoteId
                      ? "Seleziona un preventivo FiC da collegare a questo preventivo locale."
                      : "Seleziona un preventivo FiC da importare come nuovo preventivo locale."}
                  </div>
                  <Button size="sm" onClick={() => void runFicSearch(1)} loading={ficSearchLoading}>Cerca</Button>
                </div>

                <div className="rounded-md border border-line dark:border-[#2a2a2e] overflow-hidden">
                  <div className="max-h-56 overflow-y-auto">
                    {ficSearchLoading ? (
                      <div className="px-3 py-3 text-sm text-muted dark:text-[#9999a0]">Caricamento preventivi FIC...</div>
                    ) : !ficSearchResult || ficSearchResult.data.length === 0 ? (
                      <div className="px-3 py-3 text-sm text-muted dark:text-[#9999a0]">Nessun preventivo FiC trovato.</div>
                    ) : (
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-line dark:border-[#2a2a2e] bg-cream/70 dark:bg-[#1c1c20]">
                            <th className="px-2 py-1.5 text-left">Numero</th>
                            <th className="px-2 py-1.5 text-left">Data</th>
                            <th className="px-2 py-1.5 text-left">Cliente</th>
                            <th className="px-2 py-1.5 text-left">Titolo</th>
                            <th className="px-2 py-1.5 text-left">Lordo</th>
                            <th className="px-2 py-1.5 text-right">Azione</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ficSearchResult.data.map((item) => (
                            <tr key={item.fic_document_id} className="border-b border-line/70 dark:border-[#2a2a2e]/70">
                              <td className="px-2 py-1.5">
                                {(item.numeration && item.numeration.trim())
                                  ? item.numeration
                                  : (item.number != null ? String(item.number) : `#${item.fic_document_id}`)}
                              </td>
                              <td className="px-2 py-1.5">{item.date ?? "-"}</td>
                              <td className="px-2 py-1.5">{item.entity?.name ?? "-"}</td>
                              <td className="px-2 py-1.5">{item.subject ?? "-"}</td>
                              <td className="px-2 py-1.5">{canSeePricing && item.amount_gross != null ? formatEur(item.amount_gross) : "-"}</td>
                              <td className="px-2 py-1.5 text-right">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => void handlePreviewApplyFromFic(item.fic_document_id)}
                                  loading={(quoteId ? applyPreviewLoading : importPreviewLoading) && selectedFicDocumentId === item.fic_document_id}
                                >
                                  {quoteId ? "Collega" : "Importa"}
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>

                {ficSearchResult && ficSearchResult.last_page > 1 && (
                  <div className="flex items-center justify-between text-xs">
                    <div className="text-muted dark:text-[#9999a0]">Pagina {ficSearchResult.page} di {ficSearchResult.last_page} · {ficSearchResult.total} risultati</div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="ghost" disabled={ficSearchResult.page <= 1} onClick={() => void runFicSearch(ficPage - 1)}>Prev</Button>
                      <Button size="sm" variant="ghost" disabled={ficSearchResult.page >= ficSearchResult.last_page} onClick={() => void runFicSearch(ficPage + 1)}>Next</Button>
                    </div>
                  </div>
                )}

                {(quoteId
                  ? (applyPreview && applyPreview.status === "dry_run")
                  : (importPreview && importPreview.status === "dry_run")) && (
                  <div className="rounded-md border border-info/30 bg-info/10 px-3 py-2 space-y-2">
                    <div className="text-xs font-semibold text-info">
                      {quoteId ? "Anteprima sincronizzazione pronta" : "Anteprima import pronta"}
                    </div>
                    <div className="text-xs text-ink dark:text-[#f4f4f7]">
                      {quoteId
                        ? `Titolo: ${String(applyPreview?.status === "dry_run" ? applyPreview.changes_preview.title : "-")} · Data: ${String(applyPreview?.status === "dry_run" ? applyPreview.changes_preview.date : "-")} · Righe: ${String(applyPreview?.status === "dry_run" ? applyPreview.changes_preview.lines_count : "-")}`
                        : `Titolo: ${String(importPreview?.status === "dry_run" ? importPreview.payload_preview.title : "-")} · Data: ${String(importPreview?.status === "dry_run" ? importPreview.payload_preview.date : "-")} · Righe: ${String(importPreview?.status === "dry_run" ? importPreview.payload_preview.lines_count : "-")}`}
                    </div>
                    <div className="flex justify-end">
                      <Button size="sm" onClick={() => void handleConfirmApplyFromFic()} loading={quoteId ? applyExecutionLoading : importExecutionLoading}>
                        {quoteId ? "Conferma sincronizzazione" : "Conferma import"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
            {/* Invia a FIC — solo admin e solo per preventivi già salvati (con quoteId) */}
            {isAdmin && quoteId && (() => {
              const selectedClient = clients.find((c) => c.id === clientId);
              const clientMissingFic = selectedClient && selectedClient.fic_id == null;
              const ficDocUrl = loadedFicId
                ? `https://secure.fattureincloud.it/issued-documents/${loadedFicId}`
                : null;
              const refreshFicData = async () => {
                try {
                  const q = await getQuoteApi(quoteId);
                  setLoadedFicId(q.fic_id ?? null);
                  setLoadedFicPushedAt(q.fic_pushed_at ?? null);
                  setQuoteHistory(q.history ?? []);
                } catch { /* ignore */ }
              };
              return (
                <>
                  {/* FIC status block */}
                  {loadedFicId && (
                    <div className="rounded-md bg-success/10 border border-success/20 p-3 flex flex-col gap-1.5">
                      <div className="flex items-center gap-1.5">
                        <Icon name="check-circle" className="w-3.5 h-3.5 text-success" />
                        <span className="text-[11px] font-bold uppercase tracking-wider text-success">Inviato a FIC</span>
                      </div>
                      <p className="text-[11px] text-success/80">
                        Doc #{loadedFicId}
                        {loadedFicPushedAt && (
                          <> · {new Date(loadedFicPushedAt).toLocaleDateString('it-IT')}</>
                        )}
                      </p>
                      {ficDocUrl && (
                        <a
                          href={ficDocUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] font-semibold text-success underline underline-offset-2 hover:no-underline"
                        >
                          Apri su Fatture in Cloud →
                        </a>
                      )}
                    </div>
                  )}
                  {clientMissingFic && (
                    <p className="text-[11px] text-warning font-body leading-tight">
                      ⚠ Il cliente selezionato non è collegato a FIC. Il documento verrà inviato come anonimo.
                    </p>
                  )}
                  <Button
                    variant="secondary"
                    onClick={() => pushToFic(
                      { id: quoteId, fic_id: loadedFicId },
                      refreshFicData
                    )}
                    disabled={!clientId}
                    loading={ficPushing === quoteId}
                    leftIcon={<Icon name="upload" className="w-4 h-4" />}
                  >
                    {loadedFicId ? 'Reinvia a Fatture in Cloud' : 'Invia a Fatture in Cloud'}
                  </Button>
                  {!clientId && (
                    <p className="text-[11px] text-muted font-body leading-tight">
                      Seleziona un cliente per abilitare l’invio a FIC.
                    </p>
                  )}
                </>
              );
            })()}
            {!embedded && (
              <Button
                variant="ghost"
                onClick={() => {
                  const redirectParams = new URLSearchParams(quotesSearch);
                  if (currentCompanyId != null) {
                    redirectParams.set("company_id", String(currentCompanyId));
                  }
                  navigate({ pathname: "/quotes", search: `?${redirectParams.toString()}` });
                }}
              >
                Annulla
              </Button>
            )}
          </div>

          {!isRequestMode && isAdmin && (
            <div className="mt-5 rounded-md border border-line dark:border-[#2a2a2e] p-3">
              <div className="text-[11px] uppercase tracking-wider text-muted font-semibold">Contratti collegati</div>
              {linkedContractsLoading ? (
                <div className="mt-2 text-sm text-muted dark:text-[#9999a0]">Caricamento...</div>
              ) : linkedContracts.length === 0 ? (
                <div className="mt-2 text-sm text-muted dark:text-[#9999a0]">Nessun contratto collegato a questo preventivo.</div>
              ) : (
                <div className="mt-2 space-y-2">
                  {linkedContracts.map((contract) => (
                    <button
                      key={contract.link_id}
                      type="button"
                      onClick={() => navigate({ pathname: "/contracts-pipeline", search: `?open_contract_id=${contract.contract_id}` })}
                      className="w-full rounded-md border border-line dark:border-[#2a2a2e] p-2 text-left transition-colors hover:bg-cream dark:hover:bg-[#1c1c20]"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-sm font-semibold text-ink dark:text-[#f4f4f7] line-clamp-2">{contract.title}</div>
                        <div className="text-[10px] text-muted dark:text-[#9999a0]">#{contract.contract_id}</div>
                      </div>
                      <div className="mt-1 text-xs text-muted dark:text-[#9999a0]">
                        {CONTRACT_STAGE_LABELS[contract.commercial_stage]} · {contract.pricing_view_mode}
                      </div>
                      <div className="mt-1 text-xs text-muted dark:text-[#9999a0]">
                        {contract.is_primary ? "Link principale" : "Link secondario"} · {contract.include_in_total ? "Incluso nel totale" : "Escluso dal totale"}
                      </div>
                      {contract.label ? (
                        <div className="mt-1 text-xs text-muted dark:text-[#9999a0]">Etichetta: {contract.label}</div>
                      ) : null}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {!isRequestMode && quoteId && (
            <div className="mt-5 rounded-md border border-line dark:border-[#2a2a2e] p-3">
              <div className="text-[11px] uppercase tracking-wider text-muted font-semibold">Timeline</div>
              {quoteHistory.length === 0 ? (
                <div className="mt-2 text-sm text-muted dark:text-[#9999a0]">Nessun evento disponibile.</div>
              ) : (
                <div className="mt-2 max-h-80 overflow-y-auto pr-1 space-y-2">
                  {quoteHistory.map((event) => (
                    <div
                      key={event.id}
                      className="rounded-md border border-line dark:border-[#2a2a2e] p-2"
                    >
                      <div className="text-xs font-semibold text-ink dark:text-[#f4f4f7]">
                        {getTimelineTitle(event)}
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted dark:text-[#9999a0]">
                        {new Date(event.created_at).toLocaleString("it-IT")}
                        {event.actor_user_id != null ? ` · Utente #${event.actor_user_id}` : ""}
                      </div>
                      {(event.event_type === "field_updated" || event.event_type === "status_changed") && (
                        <div className="mt-2 rounded-md bg-cream dark:bg-[#1c1c20] px-2 py-1.5 text-xs text-ink dark:text-[#f4f4f7] space-y-1">
                          {event.field_name && (
                            <div>
                              <span className="font-semibold">Campo:</span>{" "}
                              {HISTORY_FIELD_LABELS[event.field_name] ?? event.field_name}
                            </div>
                          )}
                          <div>
                            <span className="font-semibold">Da:</span>{" "}
                            {formatHistoryValue(event.from_value, event.field_name)}
                          </div>
                          <div>
                            <span className="font-semibold">A:</span>{" "}
                            {formatHistoryValue(event.to_value, event.field_name)}
                          </div>
                        </div>
                      )}
                      {event.notes && (
                        <div className="mt-2 rounded-md bg-cream dark:bg-[#1c1c20] px-2 py-1.5 text-xs text-ink dark:text-[#f4f4f7]">
                          <span className="font-semibold">Nota:</span> {event.notes}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      <Modal
        open={catalogOpen}
        onClose={() => setCatalogOpen(false)}
        title="Aggiungi da catalogo completo"
        size="xl"
        footer={
          <Button variant="ghost" onClick={() => setCatalogOpen(false)}>
            Chiudi
          </Button>
        }
      >
        <div className="grid gap-4">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_260px] gap-4">
            <Input
              label="Ricerca"
              value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)}
              placeholder="Cerca per titolo o categoria"
            />
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted dark:text-[#9999a0]">Categoria</span>
              <SearchableSelect
                value={catalogCategory}
                onChange={setCatalogCategory}
                options={[
                  { value: "", label: "Tutte" },
                  ...catalogCategories.map((category) => ({ value: category, label: category })),
                ]}
                placeholder="Tutte"
                searchPlaceholder="Cerca categoria..."
              />
            </label>
          </div>

          <div className="max-h-[52vh] overflow-y-auto rounded-lg border border-line dark:border-[#2a2a2e] divide-y divide-line dark:divide-[#2a2a2e]">
            {!catalogCompanyId ? (
              <div className="p-6 text-sm text-muted dark:text-[#9999a0]">
                Impossibile caricare il catalogo: company_id non disponibile per questo preventivo.
              </div>
            ) : (catalogLoading || socialPackagesLoading) ? (
              <div className="p-6 text-sm text-muted dark:text-[#9999a0]">Caricamento catalogo completo...</div>
            ) : filteredCatalogProducts.length === 0 && filteredSocialPackages.length === 0 ? (
              <div className="p-6 text-sm text-muted dark:text-[#9999a0]">Nessun prodotto trovato con i filtri selezionati.</div>
            ) : (
              <>
                {filteredSocialPackages.length > 0 && (
                  <div className="p-3 bg-cream/40 dark:bg-[#1c1c20] text-[11px] font-bold uppercase tracking-wider text-muted dark:text-[#9999a0]">
                    Social Media Packages
                  </div>
                )}
                {filteredSocialPackages.map((pkg) => {
                  const period = mapSocialPackagePeriod(pkg.billing_period);
                  return (
                    <div key={`social-package-${pkg.id}`} className="p-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-ink dark:text-[#f4f4f7]">{pkg.title}</div>
                        <div className="text-xs text-muted dark:text-[#9999a0]">Pacchetto social{pkg.area ? ` · ${pkg.area}` : ""}</div>
                        {pkg.description && (
                          <p className="mt-1 text-xs text-muted dark:text-[#9999a0] line-clamp-2">{pkg.description}</p>
                        )}
                        {canSeePricing && (
                          <div className="mt-2 text-xs text-muted dark:text-[#9999a0]">
                            {formatEur(Number(pkg.base_price ?? 0))} · {period === "monthly" ? "mensile" : period === "yearly" ? "annuale" : "una tantum"}
                          </div>
                        )}
                      </div>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => void addSocialPackage(pkg)}
                        loading={addingSocialPackageId === pkg.id}
                        disabled={addingSocialPackageId != null}
                      >
                        Aggiungi
                      </Button>
                    </div>
                  );
                })}

                {filteredCatalogProducts.length > 0 && (
                  <div className="p-3 bg-cream/40 dark:bg-[#1c1c20] text-[11px] font-bold uppercase tracking-wider text-muted dark:text-[#9999a0]">
                    Catalogo servizi
                  </div>
                )}
                {filteredCatalogProducts.map((product) => {
                  const price = defaultPrice(product);
                  const net = Number(price?.amount ?? product.base_amount ?? 0);
                  const period = mapPeriod(price?.billing_period ?? product.base_billing_period ?? null);
                  return (
                    <div key={product.id} className="p-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-ink dark:text-[#f4f4f7]">{product.title}</div>
                        <div className="text-xs text-muted dark:text-[#9999a0]">{product.category_name}</div>
                        {product.description && (
                          <p className="mt-1 text-xs text-muted dark:text-[#9999a0] line-clamp-2">{product.description}</p>
                        )}
                        {canSeePricing && (
                          <div className="mt-2 text-xs text-muted dark:text-[#9999a0]">
                            {formatEur(net)} · {period === "monthly" ? "mensile" : period === "yearly" ? "annuale" : "una tantum"}
                          </div>
                        )}
                      </div>
                      <Button variant="primary" size="sm" onClick={() => addCatalogProduct(product)}>
                        Aggiungi
                      </Button>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      </Modal>

      {/* ── FIC duplicate confirm ── */}
      <Modal
        open={!!ficConfirm}
        onClose={ficCancelConfirm}
        title="Preventivo già inviato a FIC"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={ficCancelConfirm}>Annulla</Button>
            <Button variant="primary" onClick={ficConfirmPush}>Invia copia</Button>
          </>
        }
      >
        <p className="text-sm font-body text-ink dark:text-[#f4f4f7]">
          Questo preventivo è già stato inviato a FIC{ficConfirm ? ` (doc #${ficConfirm.ficId})` : ""}.
        </p>
        <p className="text-sm font-body text-muted dark:text-[#9999a0] mt-2">
          Vuoi crearne una nuova copia su Fatture in Cloud?
        </p>
      </Modal>

      {/* ── FIC result link ── */}
      <Modal
        open={!!lastFicUrl}
        onClose={ficClearResult}
        title="Inviato a Fatture in Cloud"
        size="sm"
        footer={<Button variant="ghost" onClick={ficClearResult}>Chiudi</Button>}
      >
        <p className="text-sm font-body text-ink dark:text-[#f4f4f7] mb-4">
          Documento FIC #{ficResult?.fic_document_id} creato con successo.
        </p>
        {lastFicUrl && (
          <a
            href={lastFicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-md bg-success/10 text-success px-4 py-2 text-sm font-semibold hover:bg-success/20 transition-colors"
          >
            <Icon name="upload" className="w-4 h-4" />
            Apri su Fatture in Cloud
          </a>
        )}
      </Modal>
    </div>
  );
}
