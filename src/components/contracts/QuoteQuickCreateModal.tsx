import { useEffect, useMemo, useRef, useState } from "react";
import { createQuoteApi, formatEur, getQuoteApi, updateQuoteApi, type Quote, type QuoteLineItem } from "../../api/quotes";
import type { Client } from "../../api/clients";
import { type CatalogProductFlatResponse } from "../../api/catalog";
import { useToast } from "../../context/ToastContext";
import { useCatalogProductsFlat } from "../../hooks/useCatalogProductsFlat";
import { useFicQuoteImport } from "../../hooks/useFicQuoteImport";
import { ClientSelectorWithCreate } from "../clients/ClientSelectorWithCreate";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";
import { SearchableSelect } from "../ui/SearchableSelect";
import { Textarea } from "../ui/Textarea";

type QuoteQuickCreateState = {
  title: string;
  date: string;
  tag: string;
  client_id: string;
  notes: string;
  appunti_commerciali: string;
  brief_operativo: string;
  discount_pct: number;
  discount_eur: number;
  lines: EditableQuoteLine[];
};

type EditableQuoteLine = QuoteLineItem & { rowId: string };

const ALLOWED_PERIODS: Array<NonNullable<QuoteLineItem["period"]>> = ["monthly", "oneoff", "yearly"];

const EMPTY_QUOTE_FORM: QuoteQuickCreateState = {
  title: "",
  date: new Date().toISOString().slice(0, 10),
  tag: "",
  client_id: "",
  notes: "",
  appunti_commerciali: "",
  brief_operativo: "",
  discount_pct: 0,
  discount_eur: 0,
  lines: [],
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

function computeTotals(lines: EditableQuoteLine[], discountPct: number, discountEur: number): Totals {
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
  if (lines.length === 0) return "Aggiungi almeno una riga al preventivo";

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

function mapQuoteToQuickCreateState(quote: Quote): QuoteQuickCreateState {
  const lines = (quote.lines ?? []).map((line, index) => ({
    ...line,
    rowId: `quote-line-${index + 1}`,
  }));

  return {
    title: quote.title ?? "",
    date: quote.date ?? new Date().toISOString().slice(0, 10),
    tag: quote.tag ?? "",
    client_id: quote.client_id != null ? String(quote.client_id) : "",
    notes: quote.notes ?? "",
    appunti_commerciali: quote.appunti_commerciali ?? "",
    brief_operativo: quote.brief_operativo ?? "",
    discount_pct: quote.discount_pct ?? 0,
    discount_eur: quote.discount_eur ?? 0,
    lines,
  };
}

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

function getTimelineTitle(event: Quote["history"][number]): string {
  const fieldLabel = event.field_name ? (HISTORY_FIELD_LABELS[event.field_name] ?? event.field_name) : null;
  if (event.event_type === "field_updated" && fieldLabel) {
    return `Campo aggiornato: ${fieldLabel}`;
  }
  if (event.event_type === "status_changed") {
    return "Cambio stato";
  }
  return event.event_type;
}

export function QuoteQuickCreateModal({
  open,
  companyId,
  clients,
  clientsLoading = false,
  canSyncFromFic = false,
  quoteToEdit = null,
  onClose,
  onCreated,
}: {
  open: boolean;
  companyId: number | null;
  clients: Client[];
  clientsLoading?: boolean;
  canSyncFromFic?: boolean;
  quoteToEdit?: Quote | null;
  onClose: () => void;
  onCreated: (quote: Quote) => void;
}) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<QuoteQuickCreateState>(EMPTY_QUOTE_FORM);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogCategory, setCatalogCategory] = useState("");
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [expandedLineIds, setExpandedLineIds] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<"details" | "timeline">("details");
  const [ficSyncOpen, setFicSyncOpen] = useState(false);
  const [ficSearchQ, setFicSearchQ] = useState("");
  const [ficFromDate, setFicFromDate] = useState("");
  const [ficToDate, setFicToDate] = useState("");
  const [ficPage, setFicPage] = useState(1);
  const [selectedFicDocumentId, setSelectedFicDocumentId] = useState<number | null>(null);
  const rowIdCounterRef = useRef(0);
  const isEditMode = quoteToEdit != null;

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
  } = useFicQuoteImport({ isAdmin: canSyncFromFic });

  useEffect(() => {
    if (!open || !quoteToEdit) return;
    const mapped = mapQuoteToQuickCreateState(quoteToEdit);
    const expanded = mapped.lines.reduce<Record<string, boolean>>((acc, line) => {
      acc[line.rowId] = true;
      return acc;
    }, {});
    rowIdCounterRef.current = mapped.lines.length;
    setExpandedLineIds(expanded);
    setIsReadOnly(false);
    setActiveTab("details");
    setFicSyncOpen(false);
    setFicSearchQ("");
    setFicFromDate("");
    setFicToDate("");
    setFicPage(1);
    setSelectedFicDocumentId(null);
    resetFicSync();
    setForm(mapped);
  }, [open, quoteToEdit, resetFicSync]);

  const historyEvents = useMemo(
    () => [...(quoteToEdit?.history ?? [])].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [quoteToEdit?.history]
  );

  const {
    products: catalogProducts,
    isLoading: catalogLoading,
    error: catalogError,
  } = useCatalogProductsFlat(companyId, { only_standalone: true });

  const updateForm = <K extends keyof QuoteQuickCreateState>(key: K, value: QuoteQuickCreateState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const totals = useMemo(
    () => computeTotals(form.lines, form.discount_pct, form.discount_eur),
    [form.discount_eur, form.discount_pct, form.lines]
  );

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

  const appendLine = (line: QuoteLineItem) => {
    rowIdCounterRef.current += 1;
    setForm((state) => ({
      ...state,
      lines: [...state.lines, { ...line, rowId: `quote-line-${rowIdCounterRef.current}` }],
    }));
  };

  const updateLineField = <K extends keyof EditableQuoteLine>(index: number, field: K, value: EditableQuoteLine[K]) => {
    setForm((current) => ({
      ...current,
      lines: current.lines.map((line, i) => (i === index ? { ...line, [field]: value } : line)),
    }));
  };

  const updateLineNumber = (index: number, field: "quantity" | "net" | "discountPct" | "vat", value: number) => {
    updateLineField(index, field, Number.isFinite(value) ? value : 0);
  };

  const removeLine = (index: number) => {
    setForm((current) => ({
      ...current,
      lines: current.lines.filter((_, i) => i !== index),
    }));
  };

  const addCatalogProduct = (product: CatalogProductFlatResponse) => {
    appendLine(mapCatalogProductToLine(product));
    toast.success("Servizio aggiunto dal catalogo");
  };

  const addCustomLine = () => {
    rowIdCounterRef.current += 1;
    const rowId = `quote-line-${rowIdCounterRef.current}`;
    setForm((state) => ({
      ...state,
      lines: [...state.lines, { ...createCustomLine(), rowId }],
    }));
    setExpandedLineIds((prev) => ({ ...prev, [rowId]: true }));
  };

  const toggleExpandedLine = (rowId: string) => {
    setExpandedLineIds((prev) => ({ ...prev, [rowId]: !prev[rowId] }));
  };

  const close = () => {
    if (loading) return;
    setIsReadOnly(false);
    setActiveTab("details");
    setFicSyncOpen(false);
    setFicSearchQ("");
    setFicFromDate("");
    setFicToDate("");
    setFicPage(1);
    setSelectedFicDocumentId(null);
    resetFicSync();
    rowIdCounterRef.current = 0;
    setExpandedLineIds({});
    setForm(EMPTY_QUOTE_FORM);
    onClose();
  };

  const runFicSearch = async (page = 1) => {
    setFicPage(page);
    try {
      await searchFicQuotes({
        fic_company_id: quoteToEdit?.fic_company_id ?? undefined,
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
      if (isEditMode && quoteToEdit) {
        await runApplyPreview({
          ficDocumentId,
          quoteId: quoteToEdit.id,
          payload: {
            fic_company_id: quoteToEdit.fic_company_id ?? undefined,
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
      if (isEditMode && quoteToEdit) {
        await runApplyExecution({
          ficDocumentId: selectedFicDocumentId,
          quoteId: quoteToEdit.id,
          payload: {
            fic_company_id: quoteToEdit.fic_company_id ?? undefined,
            update_header: true,
            update_client: true,
            replace_lines: true,
            status_on_apply: null,
          },
        });

        const refreshedQuote = await getQuoteApi(quoteToEdit.id);
        const mapped = mapQuoteToQuickCreateState(refreshedQuote);
        rowIdCounterRef.current = mapped.lines.length;
        setExpandedLineIds(mapped.lines.reduce<Record<string, boolean>>((acc, line) => {
          acc[line.rowId] = true;
          return acc;
        }, {}));
        setForm(mapped);
        setActiveTab("details");
        setFicSyncOpen(false);
        toast.success("Preventivo sincronizzato da Fatture in Cloud");
        onCreated(refreshedQuote);
      } else {
        const result = await runImportExecution({
          fic_document_id: selectedFicDocumentId,
          fic_company_id: ficSearchResult?.fic_company_id,
          kind_on_import: "preventivo",
        });
        if (result.status === "ok" && "local_quote_id" in result && result.local_quote_id != null) {
          const importedQuote = await getQuoteApi(result.local_quote_id);
          toast.success("Preventivo importato da Fatture in Cloud");
          onCreated(importedQuote);
          close();
          return;
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore import da FIC");
    }
  };

  const saveQuote = async () => {
    if (isReadOnly) {
      toast.error("Preventivo in sola lettura per questo stato o permesso");
      return;
    }
    if (!companyId) {
      toast.error("Seleziona una company valida");
      return;
    }
    if (!form.title.trim()) {
      toast.error("Il titolo del preventivo e obbligatorio");
      return;
    }

    const lineValidationError = validateLines(form.lines);
    if (lineValidationError) {
      toast.error(lineValidationError);
      return;
    }

    const apiLines = form.lines.map(sanitizeLineForApi);

    setLoading(true);
    try {
      const payload = {
        kind: "preventivo" as const,
        company_id: companyId,
        client_id: form.client_id ? Number(form.client_id) : null,
        title: form.title.trim(),
        date: form.date || null,
        tag: form.tag.trim() || null,
        notes: form.notes.trim() || null,
        appunti_commerciali: form.appunti_commerciali.trim() || null,
        brief_operativo: form.brief_operativo.trim() || null,
        discount_pct: form.discount_pct,
        discount_eur: form.discount_eur,
        lines: apiLines,
      };

      const quote = isEditMode && quoteToEdit
        ? await updateQuoteApi(quoteToEdit.id, payload)
        : await createQuoteApi(payload);

      toast.success(isEditMode ? "Preventivo aggiornato" : "Preventivo creato");
      onCreated(quote);
      setForm(EMPTY_QUOTE_FORM);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : (isEditMode ? "Errore modifica preventivo" : "Errore creazione preventivo");
      if (message.includes("[403]") || message.includes("[422]")) {
        setIsReadOnly(true);
      }
      toast.error(err instanceof Error ? err.message : (isEditMode ? "Errore modifica preventivo" : "Errore creazione preventivo"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={isEditMode ? "Modifica preventivo" : "Nuovo preventivo"}
      size={isEditMode ? "2xl" : "xl"}
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={loading}>Annulla</Button>
          <Button onClick={() => void saveQuote()} loading={loading} disabled={isReadOnly}>
            {isEditMode ? "Salva modifiche" : "Crea preventivo"}
          </Button>
        </>
      }
    >
      <div className={isEditMode ? "h-[72vh] min-h-[32rem] max-h-[72vh] overflow-y-auto pr-1" : ""}>
      <div className="space-y-3">
        {(isEditMode || canSyncFromFic) && (
          <div className="flex flex-wrap items-center gap-2">
            {canSyncFromFic && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  const next = !ficSyncOpen;
                  setFicSyncOpen(next);
                  if (next) {
                    void runFicSearch(1);
                  }
                }}
              >
                {isEditMode ? "Sincronizza da Fatture in Cloud" : "Importa da Fatture in Cloud"}
              </Button>
            )}

            {isEditMode && (
            <div className="inline-flex rounded-md border border-line dark:border-line-dark p-1 gap-1">
            <button
              type="button"
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${activeTab === "details" ? "bg-ink text-paper dark:bg-paper dark:text-ink" : "text-muted dark:text-muted-dark hover:bg-cream dark:hover:bg-[#1c1c20]"}`}
              onClick={() => setActiveTab("details")}
            >
              Dettagli
            </button>
            <button
              type="button"
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${activeTab === "timeline" ? "bg-ink text-paper dark:bg-paper dark:text-ink" : "text-muted dark:text-muted-dark hover:bg-cream dark:hover:bg-[#1c1c20]"}`}
              onClick={() => setActiveTab("timeline")}
            >
              Timeline
            </button>
            </div>
            )}
          </div>
        )}

        {canSyncFromFic && ficSyncOpen && (
          <div className="rounded-md border border-line dark:border-line-dark p-3 space-y-3">
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
              <div className="text-xs text-muted dark:text-muted-dark">
                {isEditMode
                  ? "Seleziona un preventivo FiC da collegare/sincronizzare su questo preventivo locale."
                  : "Seleziona un preventivo FiC da importare come nuovo preventivo locale."}
              </div>
              <Button size="sm" onClick={() => void runFicSearch(1)} loading={ficSearchLoading}>
                Cerca
              </Button>
            </div>

            <div className="rounded-md border border-line dark:border-line-dark overflow-hidden">
              <div className="max-h-56 overflow-y-auto">
                {ficSearchLoading ? (
                  <div className="px-3 py-3 text-sm text-muted dark:text-muted-dark">Caricamento preventivi FIC...</div>
                ) : !ficSearchResult || ficSearchResult.data.length === 0 ? (
                  <div className="px-3 py-3 text-sm text-muted dark:text-muted-dark">Nessun preventivo FiC trovato.</div>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-line dark:border-line-dark bg-cream/70 dark:bg-[#1c1c20]">
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
                        <tr key={item.fic_document_id} className="border-b border-line/70 dark:border-line-dark/70">
                          <td className="px-2 py-1.5">
                            {(item.numeration && item.numeration.trim())
                              ? item.numeration
                              : (item.number != null ? String(item.number) : `#${item.fic_document_id}`)}
                          </td>
                          <td className="px-2 py-1.5">{item.date ?? "-"}</td>
                          <td className="px-2 py-1.5">{item.entity?.name ?? "-"}</td>
                          <td className="px-2 py-1.5">{item.subject ?? "-"}</td>
                          <td className="px-2 py-1.5">{item.amount_gross != null ? formatEur(item.amount_gross) : "-"}</td>
                          <td className="px-2 py-1.5 text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => void handlePreviewApplyFromFic(item.fic_document_id)}
                              loading={(isEditMode ? applyPreviewLoading : importPreviewLoading) && selectedFicDocumentId === item.fic_document_id}
                            >
                              {isEditMode ? "Collega" : "Importa"}
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
                <div className="text-muted dark:text-muted-dark">
                  Pagina {ficSearchResult.page} di {ficSearchResult.last_page} · {ficSearchResult.total} risultati
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="ghost" disabled={ficSearchResult.page <= 1} onClick={() => void runFicSearch(ficPage - 1)}>
                    Prev
                  </Button>
                  <Button size="sm" variant="ghost" disabled={ficSearchResult.page >= ficSearchResult.last_page} onClick={() => void runFicSearch(ficPage + 1)}>
                    Next
                  </Button>
                </div>
              </div>
            )}

            {(isEditMode
              ? (applyPreview && applyPreview.status === "dry_run")
              : (importPreview && importPreview.status === "dry_run")) && (
              <div className="rounded-md border border-info/30 bg-info/10 px-3 py-2 space-y-2">
                <div className="text-xs font-semibold text-info">
                  {isEditMode ? "Anteprima sincronizzazione pronta" : "Anteprima import pronta"}
                </div>
                <div className="text-xs text-ink dark:text-paper">
                  {isEditMode
                    ? `Titolo: ${String(applyPreview?.status === "dry_run" ? applyPreview.changes_preview.title : "-")} · Data: ${String(applyPreview?.status === "dry_run" ? applyPreview.changes_preview.date : "-")} · Righe: ${String(applyPreview?.status === "dry_run" ? applyPreview.changes_preview.lines_count : "-")}`
                    : `Titolo: ${String(importPreview?.status === "dry_run" ? importPreview.payload_preview.title : "-")} · Data: ${String(importPreview?.status === "dry_run" ? importPreview.payload_preview.date : "-")} · Righe: ${String(importPreview?.status === "dry_run" ? importPreview.payload_preview.lines_count : "-")}`}
                </div>
                <div className="flex justify-end">
                  <Button size="sm" onClick={() => void handleConfirmApplyFromFic()} loading={isEditMode ? applyExecutionLoading : importExecutionLoading}>
                    {isEditMode ? "Conferma sincronizzazione" : "Conferma import"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "timeline" ? (
          <div className="rounded-md border border-line dark:border-line-dark p-3 max-h-[62vh] overflow-y-auto space-y-2">
            {historyEvents.length === 0 ? (
              <div className="text-sm text-muted dark:text-muted-dark">Nessun evento disponibile.</div>
            ) : historyEvents.map((event) => (
              <div key={event.id} className="rounded-md border border-line dark:border-line-dark p-2">
                <div className="text-xs font-semibold text-ink dark:text-paper">{getTimelineTitle(event)}</div>
                <div className="mt-0.5 text-[11px] text-muted dark:text-muted-dark">
                  {new Date(event.created_at).toLocaleString("it-IT")}
                  {event.actor_user_id != null ? ` · Utente #${event.actor_user_id}` : ""}
                </div>
                {(event.event_type === "field_updated" || event.event_type === "status_changed") && (
                  <div className="mt-2 rounded-md bg-cream dark:bg-[#1c1c20] px-2 py-1.5 text-xs text-ink dark:text-paper space-y-1">
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
                  <div className="mt-2 rounded-md bg-cream dark:bg-[#1c1c20] px-2 py-1.5 text-xs text-ink dark:text-paper">
                    <span className="font-semibold">Nota:</span> {event.notes}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <>
        <Input
          label="Titolo *"
          value={form.title}
          onChange={(event) => updateForm("title", event.target.value)}
          placeholder="Es. Preventivo Social Media Q3"
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input
            label="Data"
            type="date"
            value={form.date}
            onChange={(event) => updateForm("date", event.target.value)}
          />
          <Input
            label="Tag"
            value={form.tag}
            onChange={(event) => updateForm("tag", event.target.value)}
            placeholder="Es. Starter"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">Note</label>
          <Textarea
            rows={2}
            value={form.notes}
            onChange={(event) => updateForm("notes", event.target.value)}
            className="w-full rounded-md border border-line dark:border-line-dark bg-paper dark:bg-[#1c1c20] px-3 py-2.5 text-sm text-ink dark:text-paper"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">Cliente</label>
          <ClientSelectorWithCreate
            value={form.client_id}
            onChange={(value) => updateForm("client_id", value)}
            clients={clients}
            clientsLoading={clientsLoading}
            companyId={companyId}
            disabled={isReadOnly}
            placeholder="Seleziona cliente"
            emptyMessage="Nessun cliente"
            menuLayer="portal"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">Appunti commerciali</label>
            <Textarea
              rows={3}
              value={form.appunti_commerciali}
              onChange={(event) => updateForm("appunti_commerciali", event.target.value)}
              className="w-full rounded-md border border-line dark:border-line-dark bg-paper dark:bg-[#1c1c20] px-3 py-2.5 text-sm text-ink dark:text-paper"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">Brief operativo</label>
            <Textarea
              rows={3}
              value={form.brief_operativo}
              onChange={(event) => updateForm("brief_operativo", event.target.value)}
              className="w-full rounded-md border border-line dark:border-line-dark bg-paper dark:bg-[#1c1c20] px-3 py-2.5 text-sm text-ink dark:text-paper"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input
            label="Sconto %"
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={String(form.discount_pct)}
            onChange={(event) => updateForm("discount_pct", Number(event.target.value) || 0)}
          />
          <Input
            label="Sconto fisso €"
            type="number"
            min={0}
            step={0.01}
            value={String(form.discount_eur)}
            onChange={(event) => updateForm("discount_eur", Number(event.target.value) || 0)}
          />
        </div>

        <div className="rounded-md border border-line dark:border-line-dark p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">Righe preventivo</div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={addCustomLine} disabled={isReadOnly}>
                Riga custom
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setCatalogOpen((v) => !v)} disabled={isReadOnly}>
              {catalogOpen ? "Chiudi catalogo" : "Aggiungi da catalogo"}
              </Button>
            </div>
          </div>

          {catalogError && (
            <div className="mt-2 text-xs text-danger">{catalogError}</div>
          )}

          {catalogOpen && (
            <div className="mt-3 rounded-md border border-line dark:border-line-dark p-2 space-y-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <Input
                  label="Cerca servizio"
                  value={catalogSearch}
                  onChange={(event) => setCatalogSearch(event.target.value)}
                  placeholder="Titolo o categoria"
                />
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">Categoria</label>
                  <SearchableSelect
                    value={catalogCategory}
                    onChange={setCatalogCategory}
                    options={[{ value: "", label: "Tutte" }, ...catalogCategories.map((item) => ({ value: item, label: item }))]}
                    placeholder="Filtra categoria"
                    menuLayer="portal"
                  />
                </div>
              </div>

              <div className="max-h-44 overflow-y-auto space-y-1">
                {catalogLoading ? (
                  <div className="text-xs text-muted dark:text-muted-dark">Caricamento catalogo...</div>
                ) : filteredCatalogProducts.length === 0 ? (
                  <div className="text-xs text-muted dark:text-muted-dark">Nessun servizio trovato.</div>
                ) : (
                  filteredCatalogProducts.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => addCatalogProduct(product)}
                      className="w-full rounded-md border border-line dark:border-line-dark px-2 py-1.5 text-left hover:bg-cream dark:hover:bg-[#1c1c20]"
                    >
                      <div className="text-xs font-semibold text-ink dark:text-paper">{product.title}</div>
                      <div className="text-[11px] text-muted dark:text-muted-dark">{product.category_name || "Senza categoria"}</div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          <div className="mt-3 space-y-2">
            {form.lines.length === 0 ? (
              <div className="text-xs text-muted dark:text-muted-dark">Nessuna riga presente.</div>
            ) : form.lines.map((line, index) => (
              <div key={line.rowId} className="rounded-md border border-line dark:border-line-dark p-2">
                {(() => {
                  const quantity = Math.max(0, Number(line.quantity ?? 1));
                  const unitNet = Math.max(0, Number(line.net ?? 0));
                  const lineDiscountPct = Math.max(0, Math.min(100, Number(line.discountPct ?? 0)));
                  const discountedUnitNet = unitNet * (1 - lineDiscountPct / 100);
                  const lineTotalNet = discountedUnitNet * quantity;

                  return (
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-wider text-muted dark:text-muted-dark font-semibold">
                      {line.category || "Senza categoria"} · {line.period ?? "oneoff"}
                    </div>
                    <div className="text-sm font-semibold text-ink dark:text-paper truncate">{line.name || "(Senza nome)"}</div>
                    {line.desc ? <div className="text-[11px] text-muted dark:text-muted-dark line-clamp-2">{line.desc}</div> : null}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted dark:text-muted-dark">
                    <span className="rounded-md border border-line dark:border-line-dark px-2 py-1">Q.ta {line.quantity ?? 1}</span>
                    <span className="rounded-md border border-line dark:border-line-dark px-2 py-1">
                      {lineDiscountPct > 0 ? (
                        <>
                          <span className="line-through opacity-70 mr-1">{formatEur(unitNet)}</span>
                          <span className="text-success font-semibold">{formatEur(discountedUnitNet)}</span>
                        </>
                      ) : (
                        formatEur(unitNet)
                      )}
                    </span>
                    <span className="rounded-md border border-line dark:border-line-dark px-2 py-1 font-semibold text-ink dark:text-paper">
                      Tot: {formatEur(lineTotalNet)}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleExpandedLine(line.rowId)}
                      className="h-8 rounded-md border border-line dark:border-line-dark px-3 text-xs font-semibold text-ink dark:text-paper disabled:opacity-40"
                      disabled={isReadOnly}
                    >
                      {expandedLineIds[line.rowId] ? "Chiudi" : "Modifica"}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeLine(index)}
                      className="h-7 w-7 rounded-full border border-line dark:border-line-dark text-muted hover:text-ink dark:hover:text-paper"
                      title="Rimuovi"
                      disabled={isReadOnly}
                    >
                      ×
                    </button>
                  </div>
                </div>
                  );
                })()}

                {expandedLineIds[line.rowId] && (
                  <div className="mt-3 flex flex-col gap-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <label className="flex flex-col gap-1">
                        <span className="text-[10px] uppercase tracking-wider text-muted dark:text-muted-dark font-semibold">Nome voce</span>
                        <input
                          value={line.name ?? ""}
                          onChange={(event) => updateLineField(index, "name", event.target.value)}
                          className="rounded-md border border-line dark:border-line-dark px-2 py-1.5 text-sm bg-paper dark:bg-[#1c1c20]"
                          placeholder="Nome voce"
                          disabled={isReadOnly}
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-[10px] uppercase tracking-wider text-muted dark:text-muted-dark font-semibold">Descrizione</span>
                        <textarea
                          value={line.desc ?? ""}
                          onChange={(event) => updateLineField(index, "desc", event.target.value)}
                          rows={3}
                          className="rounded-md border border-line dark:border-line-dark px-2 py-1.5 text-sm bg-paper dark:bg-[#1c1c20] resize-y"
                          placeholder="Descrizione"
                          disabled={isReadOnly}
                        />
                      </label>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <label className="flex flex-col gap-1">
                        <span className="text-[10px] uppercase tracking-wider text-muted dark:text-muted-dark font-semibold">Categoria</span>
                        <input
                          value={line.category ?? ""}
                          onChange={(event) => updateLineField(index, "category", event.target.value)}
                          className="rounded-md border border-line dark:border-line-dark px-2 py-1.5 text-sm bg-paper dark:bg-[#1c1c20]"
                          placeholder="Categoria"
                          disabled={isReadOnly}
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-[10px] uppercase tracking-wider text-muted dark:text-muted-dark font-semibold">Periodo</span>
                        <select
                          value={line.period ?? "oneoff"}
                          onChange={(event) => updateLineField(index, "period", event.target.value as QuoteLineItem["period"])}
                          className="rounded-md border border-line dark:border-line-dark px-2 py-1.5 text-sm bg-paper dark:bg-[#1c1c20]"
                          disabled={isReadOnly}
                        >
                          <option value="oneoff">oneoff</option>
                          <option value="monthly">monthly</option>
                          <option value="yearly">yearly</option>
                        </select>
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-[10px] uppercase tracking-wider text-muted dark:text-muted-dark font-semibold">UDM</span>
                        <input
                          value={line.udm ?? ""}
                          onChange={(event) => updateLineField(index, "udm", event.target.value)}
                          className="rounded-md border border-line dark:border-line-dark px-2 py-1.5 text-sm bg-paper dark:bg-[#1c1c20]"
                          placeholder="UDM"
                          disabled={isReadOnly}
                        />
                      </label>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      <label className="flex flex-col gap-1">
                        <span className="text-[10px] uppercase tracking-wider text-muted dark:text-muted-dark font-semibold">Quantita</span>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={line.quantity ?? 1}
                          onChange={(event) => updateLineNumber(index, "quantity", Number(event.target.value))}
                          className="rounded-md border border-line dark:border-line-dark px-2 py-1.5 text-sm text-right bg-paper dark:bg-[#1c1c20]"
                          disabled={isReadOnly}
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-[10px] uppercase tracking-wider text-muted dark:text-muted-dark font-semibold">Prezzo netto</span>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={line.net ?? 0}
                          onChange={(event) => updateLineNumber(index, "net", Number(event.target.value))}
                          className="rounded-md border border-line dark:border-line-dark px-2 py-1.5 text-sm text-right bg-paper dark:bg-[#1c1c20]"
                          disabled={isReadOnly}
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-[10px] uppercase tracking-wider text-muted dark:text-muted-dark font-semibold">Sconto %</span>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.01}
                          value={line.discountPct ?? 0}
                          onChange={(event) => updateLineNumber(index, "discountPct", Number(event.target.value))}
                          className="rounded-md border border-line dark:border-line-dark px-2 py-1.5 text-sm text-right bg-paper dark:bg-[#1c1c20]"
                          disabled={isReadOnly}
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-[10px] uppercase tracking-wider text-muted dark:text-muted-dark font-semibold">IVA</span>
                        <input
                          type="number"
                          min={0}
                          max={1}
                          step={0.01}
                          value={line.vat ?? 0.22}
                          onChange={(event) => updateLineNumber(index, "vat", Number(event.target.value))}
                          className="rounded-md border border-line dark:border-line-dark px-2 py-1.5 text-sm text-right bg-paper dark:bg-[#1c1c20]"
                          disabled={isReadOnly}
                        />
                      </label>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {isReadOnly && (
          <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
            Modifica bloccata da regole backend o permessi (403/422). Il record e in sola lettura.
          </div>
        )}

        <div className="rounded-md border border-line dark:border-line-dark p-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark mb-2">Totali</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-y-1 text-sm">
            <div className="text-muted dark:text-muted-dark">Mensile: <span className="text-ink dark:text-paper font-semibold">{formatEur(totals.monthly)}</span></div>
            <div className="text-muted dark:text-muted-dark">Una tantum: <span className="text-ink dark:text-paper font-semibold">{formatEur(totals.one_time)}</span></div>
            <div className="text-muted dark:text-muted-dark">Subtotale: <span className="text-ink dark:text-paper font-semibold">{formatEur(totals.subtotal)}</span></div>
            <div className="text-muted dark:text-muted-dark">Sconto: <span className="text-danger font-semibold">-{formatEur(totals.global_discount)}</span></div>
            <div className="text-muted dark:text-muted-dark">IVA: <span className="text-ink dark:text-paper font-semibold">{formatEur(totals.vat_amount)}</span></div>
            <div className="text-muted dark:text-muted-dark">Totale: <span className="text-ink dark:text-paper font-semibold">{formatEur(totals.total)}</span></div>
          </div>
        </div>
          </>
        )}
      </div>
      </div>
    </Modal>
  );
}
