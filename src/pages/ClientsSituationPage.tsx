import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useSelectedCompanyId } from "../hooks/useSelectedCompanyId";
import {
  getClientApi,
  getClientsApi,
  type Client as CompanyClient,
  type Client,
  type ClientPostSalesSituationItem,
  type ClientSituationCommercialStage,
  type ClientSituationEngagementType,
  type ClientSituationContractRef,
  type ClientSituationQuoteRef,
  type ClientSituationCountEntry,
  type ClientPostSalesSituationStats,
} from "../api/clients";
import { usePostSalesSituation } from "../hooks/usePostSalesSituation";
import {
  CONTRACT_STAGE_ORDER,
  CONTRACT_STAGE_LABELS,
  type ContractCommercialStage,
} from "../api/contracts";
import type { ContractDetailResponse } from "../api/contracts";
import { createWorkAreaApi, listWorkAreasApi, type WorkArea } from "../api/workAreas";
import { createWorkTagApi, listWorkTagsApi, type WorkTag } from "../api/workTags";
import { formatEur, getQuoteApi, type Quote } from "../api/quotes";
import { getWorkItemApi, listWorkItemsApi, type WorkItem } from "../api/workItems";
import { getUsersApi, type User } from "../api/users";
import { ContractDetailModal } from "../components/contracts/ContractDetailModal";
import { ContractCreateModal } from "../components/contracts/ContractCreateModal";
import { QuoteQuickCreateModal } from "../components/contracts/QuoteQuickCreateModal";
import { ClientModal } from "../components/clients/ClientModal";
import { ClientFullDetails } from "../components/clients/ClientFullDetails";
import { SituationWizardModal } from "../components/clients/SituationWizardModal";
import { WorkItemFormModal } from "../components/work-items/WorkItemFormModal";
import { WorkItemSummaryCard } from "../components/work-items/WorkItemCard";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { PageSectionHeader } from "../components/ui/PageSectionHeader";
import { Icon } from "../components/ui/Icon";
import { FieldHelpPopover } from "../components/ui/FieldHelpPopover";
import { Spinner } from "../components/ui/Spinner";
import { MultiSelect } from "../components/ui/MultiSelect";
import { Checkbox } from "../components/ui/Checkbox";
import { ViewModeToggle } from "../components/ui/ViewModeToggle";
import { WorkAreaCreateModal } from "../components/work-taxonomy/WorkAreaCreateModal";
import { WorkTagCreateModal } from "../components/work-taxonomy/WorkTagCreateModal";
import { useToast } from "../context/ToastContext";
import { getCommercialStageTone } from "../utils/commercialStageTone";

const PER_PAGE = 20;

const EMPTY_STATS: ClientPostSalesSituationStats = {
  clients_count: 0,
  quotes_count: 0,
  contracts_count: 0,
  active_contracts_count: 0,
  recurring_monthly_total: 0,
  one_time_total: 0,
  work_areas: [],
  tags: [],
  quote_statuses: [],
  contract_statuses: [],
};

function formatDate(value?: string | null): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("it-IT");
}

function sortCountEntries(entries: ClientSituationCountEntry[]): ClientSituationCountEntry[] {
  return [...entries].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function paymentTone(paymentType?: string | null): string {
  if (paymentType === "ongoing") return "bg-success/10 text-success border border-success/20";
  if (paymentType === "one_time") return "bg-warning/10 text-warning border border-warning/20";
  if (paymentType === "mixed") return "bg-info/10 text-info border border-info/20";
  return "bg-line text-ink dark:bg-line-dark dark:text-paper";
}

function quoteStatusTone(status?: string | null): string {
  if (status === "accettato") return "bg-success/10 text-success border border-success/20";
  if (status === "in_trattativa" || status === "da_approvare" || status === "in_revisione") return "bg-warning/10 text-warning border border-warning/20";
  if (status === "perso" || status === "rifiutato") return "bg-danger/10 text-danger border border-danger/20";
  if (status === "inviato") return "bg-info/10 text-info border border-info/20";
  return "bg-line text-ink dark:bg-line-dark dark:text-paper";
}

// Glossario delle voci di prezzo/ingaggio, mostrato nel popover "?".
const PRICING_TERMS_INFO = [
  "• Canone (ongoing): contratto ricorrente nel tempo.",
  "• Una tantum (one_time / oneoff): pagamento singolo, non ricorrente.",
  "• Misto: presenza sia di canone sia di una tantum.",
  "• Mensile (monthly): riga del preventivo fatturata ogni mese.",
  "• Annuale (yearly): riga del catalogo fatturata ogni anno.",
  "",
  "La cadenza delle righe (mensile / una tantum) deriva dall'UDM del prodotto sincronizzato da Fatture in Cloud.",
].join("\n");

function hasAmountBreakdown(monthly?: number | null, oneTime?: number | null): boolean {
  return (monthly ?? 0) > 0 || (oneTime ?? 0) > 0;
}

function formatAmountBreakdown(monthly?: number | null, oneTime?: number | null, total?: number | null): string {
  if (hasAmountBreakdown(monthly, oneTime)) {
    return `Mese ${formatEur(monthly ?? 0)} · Una tantum ${formatEur(oneTime ?? 0)}`;
  }
  if ((total ?? 0) > 0) {
    return `Totale ${formatEur(total ?? 0)}`;
  }
  return `Mese ${formatEur(0)} · Una tantum ${formatEur(0)}`;
}

function formatCompactAmount(monthly?: number | null, total?: number | null): string {
  if ((monthly ?? 0) > 0) return `${formatEur(monthly ?? 0)} / mese`;
  if ((total ?? 0) > 0) return `Totale ${formatEur(total ?? 0)}`;
  return `${formatEur(0)} / mese`;
}

const WORK_ITEMS_ENABLED_STAGES = new Set(["firmato", "in_produzione", "completato"]);

function clampPercent(value: number | null | undefined): number {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function formatStatusSummary(summary: unknown): string {
  if (!summary) return "Stato contratti non disponibile";
  if (typeof summary === "string") return summary;
  if (Array.isArray(summary)) {
    const entries = summary
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const label = (item as { label?: unknown; key?: unknown }).label ?? (item as { key?: unknown }).key;
        const count = (item as { count?: unknown }).count;
        if ((typeof label !== "string" && typeof label !== "number") || typeof count !== "number") return null;
        return `${label}: ${count}`;
      })
      .filter((item): item is string => !!item);
    return entries.length > 0 ? entries.join(" · ") : "Stato contratti non disponibile";
  }
  if (typeof summary === "object") {
    const entries = Object.entries(summary as Record<string, unknown>)
      .filter(([, value]) => typeof value === "number")
      .map(([key, value]) => `${key}: ${value}`);
    return entries.length > 0 ? entries.join(" · ") : "Stato contratti non disponibile";
  }
  return "Stato contratti non disponibile";
}

function getPrimaryStatus(summary: unknown): { label: string; count?: number } | null {
  if (!summary) return null;

  if (Array.isArray(summary)) {
    const parsed = summary
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const label = (item as { label?: unknown; key?: unknown }).label ?? (item as { key?: unknown }).key;
        const count = (item as { count?: unknown }).count;
        if (typeof label !== "string" && typeof label !== "number") return null;
        return { label: String(label), count: typeof count === "number" ? count : 0 };
      })
      .filter((item): item is { label: string; count: number } => !!item)
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    if (parsed.length === 0) return null;
    return parsed[0];
  }

  if (typeof summary === "object") {
    const entries = Object.entries(summary as Record<string, unknown>)
      .filter(([, value]) => typeof value === "number")
      .map(([label, value]) => ({ label, count: value as number }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    if (entries.length === 0) return null;
    return entries[0];
  }

  if (typeof summary === "string") {
    return { label: summary };
  }

  return null;
}

type ClientDetailTab = "client" | "contracts" | "work-items" | "quotes";

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return !!target.closest("button,a,input,select,textarea");
}

function CountInlineRow({ title, entries }: { title: string; entries: ClientSituationCountEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      <span className="text-[11px] uppercase tracking-wider text-muted dark:text-muted-dark">{title}</span>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {entries.map((entry) => (
          <span key={`${title}-${entry.id ?? entry.name}`} className="inline-flex items-center gap-1.5 text-xs text-ink dark:text-paper">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ backgroundColor: entry.color ?? "#9ca3af" }}
              aria-hidden
            />
            <span>{entry.name}</span>
            <span className="text-muted dark:text-muted-dark">{entry.count}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function ContractRow({
  contract,
  onClick,
  onOpenWorkItems,
}: {
  contract: ClientSituationContractRef;
  onClick?: () => void;
  onOpenWorkItems?: (contractId: number) => void;
}) {
  const canOpenWorkItems = WORK_ITEMS_ENABLED_STAGES.has(contract.commercial_stage);
  const totalTasks = contract.tasks_completion?.total_tasks ?? 0;
  const completedTasks = contract.tasks_completion?.completed_tasks ?? 0;
  const completionRate = clampPercent(contract.tasks_completion?.completion_rate ?? 0);
  const [showWorkItemsDetails, setShowWorkItemsDetails] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick?.();
        }
      }}
      className={`flex w-full flex-col rounded-md border border-line bg-paper p-2.5 text-left transition-colors hover:bg-cream dark:border-line-dark dark:bg-[#131316] dark:hover:bg-[#1c1c20] ${showWorkItemsDetails && canOpenWorkItems ? "min-h-[14rem]" : "h-auto"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold text-ink dark:text-paper" title={contract.title || `Contratto #${contract.id}`}>
            {contract.title || `Contratto #${contract.id}`}
          </div>
          <div className="text-xs text-muted dark:text-muted-dark mt-0.5">
            Firma {formatDate(contract.signed_at)} · Inizio {formatDate(contract.start_date)}
          </div>
        </div>
        <span className={`inline-flex items-center rounded-pill border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${getCommercialStageTone(contract.commercial_stage as ContractCommercialStage)}`}>
          {CONTRACT_STAGE_LABELS[contract.commercial_stage as ContractCommercialStage] ?? contract.commercial_stage}
        </span>
      </div>

      {contract.execution_stage && contract.execution_stage !== contract.commercial_stage && (
        <div className="mt-1.5 text-xs text-muted dark:text-muted-dark">
          {contract.execution_stage}
        </div>
      )}

      <div className="mt-1.5 text-sm font-semibold text-ink dark:text-paper">
        Totale {formatEur(contract.total_amount ?? 0)}
      </div>
      <div className="text-[11px] text-muted dark:text-muted-dark">
        {formatAmountBreakdown(contract.monthly_amount, contract.one_time_amount, contract.total_amount)}
      </div>

      <div className={`mt-1 ${showWorkItemsDetails && canOpenWorkItems ? "flex min-h-[5rem] flex-1 flex-col justify-end pt-1" : "pt-0.5"}`}>
        {!showWorkItemsDetails ? (
          <div className="flex flex-1 items-center justify-center">
            {canOpenWorkItems ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setShowWorkItemsDetails(true);
                }}
                className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted transition-colors hover:text-ink dark:text-muted-dark dark:hover:text-paper"
                aria-label="Mostra dettaglio lavorazioni"
                title="Mostra dettaglio lavorazioni"
              >
                <Icon name="chevron-right" className="h-3.5 w-3.5 rotate-90" />
              </button>
            ) : (
              <span
                className="inline-flex h-6 w-6 items-center justify-center text-muted/35 dark:text-muted-dark/35"
                aria-hidden="true"
              >
                <Icon name="chevron-right" className="h-3.5 w-3.5 rotate-90" />
              </span>
            )}
          </div>
        ) : canOpenWorkItems ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
              <span>Lavorazioni</span>
              <div className="flex items-center gap-2">
                <span>{completedTasks}/{totalTasks}</span>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setShowWorkItemsDetails(false);
                  }}
                  className="inline-flex h-5 w-5 items-center justify-center text-muted transition-colors hover:text-ink dark:text-muted-dark dark:hover:text-paper"
                  aria-label="Nascondi dettaglio lavorazioni"
                  title="Nascondi dettaglio lavorazioni"
                >
                  <Icon name="chevron-right" className="h-3 w-3 -rotate-90" />
                </button>
              </div>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-cream dark:bg-[#2a2a2e]">
              <div
                className="h-full rounded-full bg-info transition-[width] duration-200"
                style={{ width: `${completionRate}%` }}
              />
            </div>
            <div className="flex justify-end">
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Icon name="list" className="h-3.5 w-3.5" />}
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenWorkItems?.(contract.id);
                }}
              >
                Vai a Lavorazioni
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center text-[11px] font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
            Nessuna lavorazione
          </div>
        )}
      </div>
    </div>
  );
}

function QuoteRow({ quote, onClick }: { quote: ClientSituationQuoteRef; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-md border border-line dark:border-line-dark p-2.5 text-left bg-paper dark:bg-[#131316] hover:bg-cream dark:hover:bg-[#1c1c20] transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-ink dark:text-paper truncate" title={quote.title || `Preventivo #${quote.id}`}>
            {quote.title || `Preventivo #${quote.id}`}
          </div>
          <div className="text-xs text-muted dark:text-muted-dark mt-0.5">
            {quote.number ? `#${quote.number}` : `#${quote.id}`}
            {quote.tag ? ` · ${quote.tag}` : ""}
          </div>
        </div>
        <span className={`inline-flex items-center rounded-pill px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${quoteStatusTone(quote.status)}`}>
          {quote.status ?? "n/d"}
        </span>
      </div>

      <div className="mt-1.5 text-xs text-muted dark:text-muted-dark">
        Creato {formatDate(quote.created_at)} · Aggiornato {formatDate(quote.updated_at)}
      </div>

      <div className="mt-1.5 text-sm font-semibold text-ink dark:text-paper">
        Totale {formatEur(quote.total_amount ?? 0)}
      </div>
      <div className="text-[11px] text-muted dark:text-muted-dark">
        {formatAmountBreakdown(quote.monthly_amount, quote.one_time_amount, quote.total_amount)}
      </div>
    </button>
  );
}

function ContractsCarousel({
  contracts,
  onOpenContract,
  onOpenWorkItems,
}: {
  contracts: ClientSituationContractRef[];
  onOpenContract: (contractId: number) => void;
  onOpenWorkItems: (contractId: number) => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (contracts.length === 0) {
      setCurrentIndex(0);
      return;
    }
    setCurrentIndex((current) => Math.min(current, contracts.length - 1));
  }, [contracts]);

  if (contracts.length === 0) {
    return <div className="text-sm text-muted dark:text-muted-dark">Nessun contratto associato.</div>;
  }

  const canNavigate = contracts.length > 1;
  const prev = () => setCurrentIndex((current) => (current - 1 + contracts.length) % contracts.length);
  const next = () => setCurrentIndex((current) => (current + 1) % contracts.length);

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden">
        <div
          className="flex transition-transform duration-300 ease-out"
          style={{ transform: `translateX(-${currentIndex * 100}%)` }}
        >
          {contracts.map((contract) => (
            <div key={`carousel-contract-${contract.id}`} className="w-full shrink-0">
              <ContractRow
                contract={contract}
                onClick={() => onOpenContract(contract.id)}
                onOpenWorkItems={onOpenWorkItems}
              />
            </div>
          ))}
        </div>

        {canNavigate && (
          <>
            <button
              type="button"
              onClick={prev}
              className="absolute left-1 top-1/2 -translate-y-1/2 h-7 w-7 inline-flex items-center justify-center rounded-full border border-line dark:border-line-dark bg-paper/95 dark:bg-[#1c1c20]/95 text-ink dark:text-paper hover:bg-cream dark:hover:bg-[#252529]"
              aria-label="Contratto precedente"
            >
              <Icon name="chevron-right" className="w-4 h-4 rotate-180" />
            </button>
            <button
              type="button"
              onClick={next}
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 inline-flex items-center justify-center rounded-full border border-line dark:border-line-dark bg-paper/95 dark:bg-[#1c1c20]/95 text-ink dark:text-paper hover:bg-cream dark:hover:bg-[#252529]"
              aria-label="Contratto successivo"
            >
              <Icon name="chevron-right" className="w-4 h-4" />
            </button>
          </>
        )}
      </div>

      {canNavigate && (
        <div className="flex items-center justify-center gap-1.5">
          {contracts.map((contract, index) => {
            const active = index === currentIndex;
            return (
              <button
                key={`carousel-dot-${contract.id}`}
                type="button"
                onClick={() => setCurrentIndex(index)}
                className={`h-1.5 w-1.5 rounded-full transition-colors ${
                  active ? "bg-ink dark:bg-paper" : "bg-line dark:bg-line-dark hover:bg-muted dark:hover:bg-muted-dark"
                }`}
                aria-label={`Vai al contratto ${index + 1}`}
                aria-pressed={active}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function QuotesCarousel({
  quotes,
  onOpenQuote,
}: {
  quotes: ClientSituationQuoteRef[];
  onOpenQuote: (quoteId: number) => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (quotes.length === 0) {
      setCurrentIndex(0);
      return;
    }
    setCurrentIndex((current) => Math.min(current, quotes.length - 1));
  }, [quotes]);

  if (quotes.length === 0) {
    return <div className="text-sm text-muted dark:text-muted-dark">Nessun preventivo associato.</div>;
  }

  const canNavigate = quotes.length > 1;
  const prev = () => setCurrentIndex((current) => (current - 1 + quotes.length) % quotes.length);
  const next = () => setCurrentIndex((current) => (current + 1) % quotes.length);

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden">
        <div
          className="flex transition-transform duration-300 ease-out"
          style={{ transform: `translateX(-${currentIndex * 100}%)` }}
        >
          {quotes.map((quote) => (
            <div key={`carousel-quote-${quote.id}`} className="w-full shrink-0">
              <QuoteRow quote={quote} onClick={() => onOpenQuote(quote.id)} />
            </div>
          ))}
        </div>

        {canNavigate && (
          <>
            <button
              type="button"
              onClick={prev}
              className="absolute left-1 top-1/2 -translate-y-1/2 h-7 w-7 inline-flex items-center justify-center rounded-full border border-line dark:border-line-dark bg-paper/95 dark:bg-[#1c1c20]/95 text-ink dark:text-paper hover:bg-cream dark:hover:bg-[#252529]"
              aria-label="Preventivo precedente"
            >
              <Icon name="chevron-right" className="w-4 h-4 rotate-180" />
            </button>
            <button
              type="button"
              onClick={next}
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 inline-flex items-center justify-center rounded-full border border-line dark:border-line-dark bg-paper/95 dark:bg-[#1c1c20]/95 text-ink dark:text-paper hover:bg-cream dark:hover:bg-[#252529]"
              aria-label="Preventivo successivo"
            >
              <Icon name="chevron-right" className="w-4 h-4" />
            </button>
          </>
        )}
      </div>

      {canNavigate && (
        <div className="flex items-center justify-center gap-1.5">
          {quotes.map((quote, index) => {
            const active = index === currentIndex;
            return (
              <button
                key={`carousel-quote-dot-${quote.id}`}
                type="button"
                onClick={() => setCurrentIndex(index)}
                className={`h-1.5 w-1.5 rounded-full transition-colors ${
                  active ? "bg-ink dark:bg-paper" : "bg-line dark:bg-line-dark hover:bg-muted dark:hover:bg-muted-dark"
                }`}
                aria-label={`Vai al preventivo ${index + 1}`}
                aria-pressed={active}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function ClientActivityTabs({
  contracts,
  quotes,
  contractStatusSummary,
  quoteStatusSummary,
  onOpenContract,
  onOpenWorkItems,
  onOpenQuote,
}: {
  contracts: ClientSituationContractRef[];
  quotes: ClientSituationQuoteRef[];
  contractStatusSummary?: unknown;
  quoteStatusSummary?: unknown;
  onOpenContract: (contractId: number) => void;
  onOpenWorkItems: (contractId: number) => void;
  onOpenQuote: (quoteId: number) => void;
}) {
  const [activeTab, setActiveTab] = useState<"contracts" | "quotes">("contracts");

  useEffect(() => {
    if (activeTab === "contracts" && contracts.length === 0 && quotes.length > 0) {
      setActiveTab("quotes");
    }
    if (activeTab === "quotes" && quotes.length === 0 && contracts.length > 0) {
      setActiveTab("contracts");
    }
  }, [activeTab, contracts.length, quotes.length]);

  const contractSummary = formatStatusSummary(contractStatusSummary);
  const quoteSummary = formatStatusSummary(quoteStatusSummary);

  return (
    <div className="mt-3 border-t border-line dark:border-line-dark pt-2.5 space-y-2">
      <div className="seg-switch">
        <button
          type="button"
          onClick={() => setActiveTab("contracts")}
          className={activeTab === "contracts" ? "is-active" : ""}
        >
          Contratti ({contracts.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("quotes")}
          className={activeTab === "quotes" ? "is-active" : ""}
        >
          Preventivi ({quotes.length})
        </button>
      </div>

      <div className="text-[11px] text-muted dark:text-muted-dark">
        {activeTab === "contracts" ? contractSummary : quoteSummary}
      </div>

      {activeTab === "contracts" ? (
        <ContractsCarousel contracts={contracts} onOpenContract={onOpenContract} onOpenWorkItems={onOpenWorkItems} />
      ) : (
        <QuotesCarousel quotes={quotes} onOpenQuote={onOpenQuote} />
      )}
    </div>
  );
}

export function ClientsSituationPage() {
  const navigate = useNavigate();
  const { user, permissions, activeCompanyId } = useAuth();
  const { selectedCompanyId } = useSelectedCompanyId(activeCompanyId ?? user?.company_id ?? null);
  const isAdmin = !!permissions?.is_admin;
  const toast = useToast();

  const [search, setSearch] = useState("");
  const [tagFilterIds, setTagFilterIds] = useState<number[]>([]);
  const [workAreaFilterIds, setWorkAreaFilterIds] = useState<number[]>([]);
  const [engagementTypes, setEngagementTypes] = useState<ClientSituationEngagementType[]>([]);
  const [commercialStageFilterIds, setCommercialStageFilterIds] = useState<number[]>([]);

  const [clients, setClients] = useState<ClientPostSalesSituationItem[]>([]);
  const [stats, setStats] = useState<ClientPostSalesSituationStats>(EMPTY_STATS);
  const [viewMode, setViewMode] = useState<"grid" | "list" | "compact">("grid");
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [taxonomyLoading, setTaxonomyLoading] = useState(false);
  const [availableTags, setAvailableTags] = useState<WorkTag[]>([]);
  const [availableAreas, setAvailableAreas] = useState<WorkArea[]>([]);
  const [creatingTag, setCreatingTag] = useState(false);
  const [creatingArea, setCreatingArea] = useState(false);
  const [workTagModalOpen, setWorkTagModalOpen] = useState(false);
  const [workAreaModalOpen, setWorkAreaModalOpen] = useState(false);
  const [contractModalOpen, setContractModalOpen] = useState(false);
  const [selectedContractId, setSelectedContractId] = useState<number | null>(null);
  const [quoteModalOpen, setQuoteModalOpen] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const [createContractOpen, setCreateContractOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [companyClients, setCompanyClients] = useState<CompanyClient[]>([]);
  const [companyClientsLoading, setCompanyClientsLoading] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);

  const [clientDetailOpen, setClientDetailOpen] = useState(false);
  const [clientDetailTab, setClientDetailTab] = useState<ClientDetailTab>("client");
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [selectedClientSnapshot, setSelectedClientSnapshot] = useState<ClientPostSalesSituationItem | null>(null);
  const [selectedClientDetail, setSelectedClientDetail] = useState<Client | null>(null);
  const [selectedClientDetailLoading, setSelectedClientDetailLoading] = useState(false);
  const [selectedClientDetailError, setSelectedClientDetailError] = useState<string | null>(null);
  const [editClientOpen, setEditClientOpen] = useState(false);
  const [workItemModalOpen, setWorkItemModalOpen] = useState(false);
  const [editingWorkItem, setEditingWorkItem] = useState<WorkItem | null>(null);
  const [companyUsers, setCompanyUsers] = useState<User[]>([]);
  const [clientWorkItems, setClientWorkItems] = useState<WorkItem[]>([]);
  const [clientWorkItemsLoading, setClientWorkItemsLoading] = useState(false);


  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const effectiveCompanyId = selectedCompanyId ?? null;

  const selectedCommercialStages = useMemo(
    () => commercialStageFilterIds
      .map((id) => CONTRACT_STAGE_ORDER[id - 1])
      .filter((stage): stage is ClientSituationCommercialStage => !!stage),
    [commercialStageFilterIds]
  );

  const situationParams = useMemo(() => ({
    page,
    per_page: PER_PAGE,
    q: search.trim() || undefined,
    company_id: effectiveCompanyId ?? undefined,
    tag_ids: tagFilterIds.length > 0 ? tagFilterIds : undefined,
    work_area_ids: workAreaFilterIds.length > 0 ? workAreaFilterIds : undefined,
    engagement_types: engagementTypes.length > 0 ? engagementTypes : undefined,
    commercial_stages: selectedCommercialStages.length > 0 ? selectedCommercialStages : undefined,
  }), [
    page,
    search,
    effectiveCompanyId,
    tagFilterIds,
    workAreaFilterIds,
    engagementTypes,
    selectedCommercialStages,
  ]);

  const {
    clients: fetchedClients,
    stats: fetchedStats,
    total: fetchedTotal,
    page: fetchedPage,
    totalPages: fetchedTotalPages,
    isLoading: loading,
    error: fetchError,
    refetch: refetchSituation,
  } = usePostSalesSituation(situationParams, { enabled: effectiveCompanyId != null });

  const handleCreateTag = async (name: string) => {
    if (!effectiveCompanyId || !name.trim()) return;
    setCreatingTag(true);
    try {
      const created = await createWorkTagApi({
        company_id: effectiveCompanyId,
        name: name.trim(),
        color: "#6366f1",
      });
      setAvailableTags((prev) => (prev.some((item) => item.id === created.id) ? prev : [...prev, created]));
      setTagFilterIds((current) => (current.includes(created.id) ? current : [...current, created.id]));
      toast.success("Tag creato");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore creazione tag");
      throw err;
    } finally {
      setCreatingTag(false);
    }
  };

  const handleCreateArea = async (name: string) => {
    if (!effectiveCompanyId || !name.trim()) return;
    setCreatingArea(true);
    try {
      const created = await createWorkAreaApi({
        company_id: effectiveCompanyId,
        name: name.trim(),
      });
      setAvailableAreas((prev) => (prev.some((item) => item.id === created.id) ? prev : [...prev, created]));
      setWorkAreaFilterIds((current) => (current.includes(created.id) ? current : [...current, created.id]));
      toast.success("Area creata");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore creazione area");
      throw err;
    } finally {
      setCreatingArea(false);
    }
  };

  useEffect(() => {
    if (effectiveCompanyId == null) {
      setAvailableTags([]);
      setAvailableAreas([]);
      setTagFilterIds([]);
      setWorkAreaFilterIds([]);
      return;
    }

    let cancelled = false;
    setTaxonomyLoading(true);
    Promise.all([
      listWorkTagsApi({ company_id: effectiveCompanyId }),
      listWorkAreasApi({ company_id: effectiveCompanyId }),
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
  }, [effectiveCompanyId]);

  useEffect(() => {
    const tagSet = new Set(availableTags.map((tag) => tag.id));
    const areaSet = new Set(availableAreas.map((area) => area.id));
    setTagFilterIds((current) => current.filter((id) => tagSet.has(id)));
    setWorkAreaFilterIds((current) => current.filter((id) => areaSet.has(id)));
  }, [availableAreas, availableTags]);

  useEffect(() => {
    if ((!createOpen && !createContractOpen && !quoteModalOpen) || effectiveCompanyId == null) return;

    let cancelled = false;
    setCompanyClientsLoading(true);
    getClientsApi({ company_id: effectiveCompanyId, per_page: 300 })
      .then((result) => {
        if (cancelled) return;
        setCompanyClients(result.data ?? []);
      })
      .catch(() => {
        if (cancelled) return;
        setCompanyClients([]);
      })
      .finally(() => {
        if (cancelled) return;
        setCompanyClientsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [createContractOpen, createOpen, effectiveCompanyId, quoteModalOpen]);

  useEffect(() => {
    setClients(fetchedClients);
    setStats(fetchedStats ?? EMPTY_STATS);
    setTotal(fetchedTotal ?? 0);
    setTotalPages(fetchedTotalPages || 1);
    if (typeof fetchedPage === "number" && fetchedPage > 0 && fetchedPage !== page) {
      setPage(fetchedPage);
    }
  }, [fetchedClients, fetchedStats, fetchedTotal, fetchedTotalPages, fetchedPage, page]);

  useEffect(() => {
    setError(fetchError ?? null);
  }, [fetchError]);

  useEffect(() => {
    if (reloadNonce === 0) return;
    refetchSituation();
  }, [reloadNonce, refetchSituation]);

  useEffect(() => {
    if (!clientDetailOpen || effectiveCompanyId == null) return;
    let cancelled = false;
    getUsersApi(effectiveCompanyId)
      .then((list) => { if (!cancelled) setCompanyUsers(list); })
      .catch(() => { if (!cancelled) setCompanyUsers([]); });
    return () => { cancelled = true; };
  }, [clientDetailOpen, effectiveCompanyId]);

  useEffect(() => {
    if (!clientDetailOpen || effectiveCompanyId == null || selectedClientId == null) {
      setClientWorkItems([]);
      return;
    }
    let cancelled = false;
    setClientWorkItemsLoading(true);
    listWorkItemsApi({ company_id: effectiveCompanyId })
      .then((items) => {
        if (cancelled) return;
        setClientWorkItems(items.filter((item) => item.client_id === selectedClientId));
      })
      .catch(() => { if (!cancelled) setClientWorkItems([]); })
      .finally(() => { if (!cancelled) setClientWorkItemsLoading(false); });
    return () => { cancelled = true; };
  }, [clientDetailOpen, effectiveCompanyId, selectedClientId, reloadNonce]);

  useEffect(() => {
    if (!clientDetailOpen || selectedClientId == null) {
      setSelectedClientDetail(null);
      setSelectedClientDetailError(null);
      setSelectedClientDetailLoading(false);
      return;
    }

    let cancelled = false;
    setSelectedClientDetailLoading(true);
    setSelectedClientDetailError(null);

    getClientApi(selectedClientId)
      .then((result) => {
        if (cancelled) return;
        setSelectedClientDetail(result);
      })
      .catch((err) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Errore caricamento cliente";
        setSelectedClientDetailError(message);
        setSelectedClientDetail(null);
      })
      .finally(() => {
        if (cancelled) return;
        setSelectedClientDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [clientDetailOpen, selectedClientId]);

  const tagOptions = useMemo(
    () => availableTags.map((tag) => ({ id: tag.id, label: tag.name, color: tag.color })),
    [availableTags]
  );
  const areaOptions = useMemo(
    () => availableAreas.map((area) => ({ id: area.id, label: area.name, color: area.color })),
    [availableAreas]
  );

  const stageOptions = useMemo(
    () => CONTRACT_STAGE_ORDER.map((stage, index) => ({
      id: index + 1,
      label: CONTRACT_STAGE_LABELS[stage],
    })),
    []
  );

  const sortedAreas = useMemo(() => sortCountEntries(stats.work_areas).slice(0, 12), [stats.work_areas]);
  const sortedTags = useMemo(() => sortCountEntries(stats.tags).slice(0, 12), [stats.tags]);
  const sortedStatuses = useMemo(() => sortCountEntries(stats.contract_statuses).slice(0, 12), [stats.contract_statuses]);

  const toggleEngagementFilter = (type: ClientSituationEngagementType, checked: boolean) => {
    setPage(1);
    setEngagementTypes((current) => {
      if (checked) return current.includes(type) ? current : [...current, type];
      return current.filter((item) => item !== type);
    });
  };

  const handleSearch = (value: string) => {
    setSearch(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setPage(1);
      setSearch(value);
    }, 350);
  };

  const openContractDetail = (contractId: number) => {
    setSelectedContractId(contractId);
    setContractModalOpen(true);
  };

  const openClientDetail = (client: ClientPostSalesSituationItem, tab: ClientDetailTab = "client") => {
    setSelectedClientId(client.id);
    setSelectedClientSnapshot(client);
    setClientDetailTab(tab);
    setClientDetailOpen(true);
  };

  const closeClientDetail = () => {
    setClientDetailOpen(false);
    setClientDetailTab("client");
    setSelectedClientId(null);
    setSelectedClientSnapshot(null);
    setSelectedClientDetail(null);
    setSelectedClientDetailError(null);
    setSelectedClientDetailLoading(false);
  };

  const openQuoteDetail = async (quoteId: number) => {
    if (quoteModalOpen) return;
    try {
      const quote = await getQuoteApi(quoteId);
      setSelectedQuote(quote);
      setQuoteModalOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore apertura preventivo");
    }
  };

  const openWorkItemsByContract = (contractId: number) => {
    navigate(`/work-items?contract_id=${contractId}`);
  };

  const openWorkItemEdit = async (workItemId: number) => {
    if (effectiveCompanyId == null) {
      toast.error("Seleziona una company valida.");
      return;
    }

    try {
      const item = await getWorkItemApi(workItemId);
      setEditingWorkItem(item);
      setWorkItemModalOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Impossibile aprire la lavorazione");
    }
  };

  const closeQuoteDetail = () => {
    setQuoteModalOpen(false);
    setSelectedQuote(null);
  };

  const selectedClient = useMemo(() => {
    if (selectedClientId == null) return selectedClientSnapshot;
    const fromList = clients.find((client) => client.id === selectedClientId);
    return fromList ?? selectedClientSnapshot;
  }, [clients, selectedClientId, selectedClientSnapshot]);

  const openCreateSituation = () => {
    setCreateOpen(true);
  };

  const closeCreateSituation = () => {
    setCreateOpen(false);
  };

  const applyContractUpdateToClients = (updated: ContractDetailResponse) => {
    setClients((currentClients) => currentClients.map((client) => ({
      ...client,
      contracts: client.contracts.map((contract) => {
        if (contract.id !== updated.id) return contract;
        return {
          ...contract,
          title: updated.title,
          commercial_stage: updated.commercial_stage,
          execution_stage: updated.execution_stage ?? null,
          engagement_type: updated.engagement_type ?? null,
          signed_at: updated.signed_at ?? null,
          start_date: updated.start_date ?? null,
          end_date: updated.end_date ?? null,
          payment_type: updated.engagement_type ?? null,
          payment_type_label: updated.engagement_type === "one_time" ? "Una tantum" : updated.engagement_type === "ongoing" ? "Canone" : contract.payment_type_label,
          monthly_amount: updated.pricing.selected_monthly ?? 0,
          one_time_amount: updated.pricing.selected_one_time ?? 0,
          total_amount: updated.pricing.selected_total,
          tags: updated.tags ?? [],
          work_areas: updated.work_areas ?? [],
        };
      }),
    })));
  };

  const copyContactValue = async (value: string, successMessage: string) => {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard non disponibile");
      await navigator.clipboard.writeText(value);
      toast.success(successMessage);
    } catch {
      toast.error("Impossibile copiare negli appunti");
    }
  };

  return (
    <div className="px-6 py-8 pb-20 mx-auto w-full animate-fadeIn">
      <PageSectionHeader
        eyebrow="Post-sales"
        eyebrowIcon={<Icon name="users" className="w-3.5 h-3.5" />}
        title="Situazione clienti"
        lead={loading ? "Caricamento situazione clienti..." : `${stats.clients_count} clienti con contratti formalizzati`}
      />

      <div className="rounded-lg border border-line dark:border-line-dark bg-paper dark:bg-[#131316] px-3 py-2 mb-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink dark:text-paper">
          <span>
            <b>{stats.clients_count}</b> clienti
          </span>
          <span>
            <b>{stats.quotes_count}</b> preventivi
          </span>
          <span>
            <b>{stats.contracts_count}</b> contratti
          </span>
          <span>
            <b>{stats.active_contracts_count}</b> attivi
          </span>
          <span>
            <b>{formatEur(stats.recurring_monthly_total)}</b> ricorrente/mese
          </span>
          <span>
            <b>{formatEur(stats.one_time_total)}</b> una tantum
          </span>
        </div>
      </div>

      <div className="rounded-lg border border-line dark:border-line-dark bg-paper dark:bg-[#131316] px-3 py-2 mb-4 space-y-2">
        <CountInlineRow title="Aree" entries={sortedAreas} />
        <CountInlineRow title="Tag" entries={sortedTags} />
        <CountInlineRow title="Stati" entries={sortedStatuses} />
      </div>

      <div className="rounded-lg border border-line dark:border-line-dark bg-paper dark:bg-[#131316] p-3 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
          <div className="relative">
            <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted dark:text-muted-dark pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(event) => handleSearch(event.target.value)}
              placeholder="Cerca cliente, referente, email..."
              className="w-full pl-9 pr-4 py-2 rounded-md text-[13px] font-body text-ink dark:text-paper bg-paper dark:bg-[#1c1c20] border border-line dark:border-line-dark placeholder:text-muted/60 dark:placeholder:text-muted-dark/70 outline-none focus:border-ink dark:focus:border-paper transition-colors"
            />
          </div>

          <MultiSelect
            label=""
            value={workAreaFilterIds}
            onChange={(value) => {
              setPage(1);
              setWorkAreaFilterIds(value);
            }}
            options={areaOptions}
            placeholder={taxonomyLoading ? "Caricamento aree..." : "Filtra aree"}
            onCreateClick={isAdmin ? () => setWorkAreaModalOpen(true) : undefined}
            onCreateOption={isAdmin ? handleCreateArea : undefined}
            createLoading={creatingArea}
            createActionLabel="Crea area"
          />

          <MultiSelect
            label=""
            value={tagFilterIds}
            onChange={(value) => {
              setPage(1);
              setTagFilterIds(value);
            }}
            options={tagOptions}
            placeholder={taxonomyLoading ? "Caricamento tag..." : "Filtra tag"}
            onCreateClick={isAdmin ? () => setWorkTagModalOpen(true) : undefined}
            onCreateOption={isAdmin ? handleCreateTag : undefined}
            createLoading={creatingTag}
            createActionLabel="Crea tag"
          />

          <MultiSelect
            label=""
            value={commercialStageFilterIds}
            onChange={(value) => {
              setPage(1);
              setCommercialStageFilterIds(value);
            }}
            options={stageOptions}
            placeholder="Filtra stato"
          />

          <div className="flex items-center gap-3 rounded-md border border-line dark:border-line-dark px-3 py-2">
            <label className="inline-flex items-center gap-2 text-sm text-ink dark:text-paper">
              <Checkbox
                checked={engagementTypes.includes("ongoing")}
                onChange={(checked) => toggleEngagementFilter("ongoing", checked)}
              />
              Canone
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-ink dark:text-paper">
              <Checkbox
                checked={engagementTypes.includes("one_time")}
                onChange={(checked) => toggleEngagementFilter("one_time", checked)}
              />
              Una tantum
            </label>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-end">
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              leftIcon={<Icon name="plus" className="w-4 h-4" />}
              onClick={() => setCreateContractOpen(true)}
              disabled={effectiveCompanyId == null}
            >
              Nuovo contratto
            </Button>
            <Button
              variant="primary"
              leftIcon={<Icon name="plus" className="w-4 h-4" />}
              onClick={openCreateSituation}
              disabled={effectiveCompanyId == null}
            >
              Nuova situazione
            </Button>
            <ViewModeToggle
              value={viewMode}
              onChange={setViewMode}
              options={[
                { value: "grid", icon: "grid", title: "Vista griglia" },
                { value: "list", icon: "list", title: "Vista lista" },
                { value: "compact", icon: "grid-compact", title: "Vista compatta (6 colonne)" },
              ]}
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" />
        </div>
      ) : error ? (
        <div className="rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</div>
      ) : (
        <div className="space-y-3">
          {clients.length === 0 ? (
            <div className="rounded-lg border border-dashed border-line dark:border-line-dark px-4 py-8 text-center text-sm text-muted dark:text-muted-dark">
              Nessun cliente trovato con i filtri selezionati.
            </div>
          ) : (
            <div
              className={
                viewMode === "list"
                  ? "space-y-3"
                  : viewMode === "compact"
                    ? "grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 gap-2"
                    : "grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3"
              }
            >
              {clients.map((client) => (
                (() => {
                  const primaryStatus = getPrimaryStatus(client.contract_status_summary);

                  if (viewMode === "compact") {
                    return (
                      <article
                        key={client.id}
                        role="button"
                        tabIndex={0}
                        onClick={(event) => {
                          if (isInteractiveTarget(event.target)) return;
                          openClientDetail(client);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openClientDetail(client);
                          }
                        }}
                        className="rounded-lg border border-line dark:border-line-dark bg-paper dark:bg-[#131316] p-2.5 cursor-pointer"
                      >
                        <div className="text-xs font-semibold text-ink dark:text-paper truncate" title={client.name}>{client.name}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] text-muted dark:text-muted-dark">
                          <span className="font-semibold text-ink dark:text-paper">Referente:</span>
                          <span className="truncate max-w-[120px]" title={client.contact ?? undefined}>{client.contact || "n/d"}</span>
                          {client.email && (
                            <>
                              <span aria-hidden>·</span>
                              <button
                                type="button"
                                className="underline decoration-dotted underline-offset-2 hover:text-ink dark:hover:text-paper"
                                onClick={() => void copyContactValue(client.email!, "Email copiata")}
                                title="Copia email"
                              >
                                {client.email}
                              </button>
                            </>
                          )}
                          {client.phone && (
                            <>
                              <span aria-hidden>·</span>
                              <button
                                type="button"
                                className="underline decoration-dotted underline-offset-2 hover:text-ink dark:hover:text-paper"
                                onClick={() => void copyContactValue(client.phone!, "Telefono copiato")}
                                title="Copia telefono"
                              >
                                {client.phone}
                              </button>
                            </>
                          )}
                        </div>

                        <div className="mt-1.5 flex items-center justify-between gap-1.5">
                          <span className="text-[11px] text-muted dark:text-muted-dark">{client.active_contract_count} attivi</span>
                          <span className={`inline-flex items-center rounded-pill px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${paymentTone(client.payment_type)}`}>
                            {client.payment_type_label ?? "n/d"}
                          </span>
                        </div>

                        {primaryStatus && (
                          <div className="mt-1 text-[10px] text-muted dark:text-muted-dark truncate" title={primaryStatus.label}>
                            Stato: {primaryStatus.label}
                            {typeof primaryStatus.count === "number" && primaryStatus.count > 0 ? ` (${primaryStatus.count})` : ""}
                          </div>
                        )}

                        <div className="mt-1.5 text-xs font-semibold text-ink dark:text-paper">
                          {formatCompactAmount(client.monthly_amount, client.total_amount)}
                        </div>

                        <div className="mt-1 pt-1 border-t border-line dark:border-line-dark">
                          <div className="overflow-x-auto">
                            <div className="flex items-stretch gap-1.5 min-w-full">
                              {client.contracts.slice(0, 2).map((contract) => (
                                <button
                                  key={`compact-contract-${contract.id}`}
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    openContractDetail(contract.id);
                                  }}
                                  className="shrink-0 rounded border border-line dark:border-line-dark px-1.5 py-1 text-[10px] text-left text-ink dark:text-paper hover:bg-cream dark:hover:bg-[#1c1c20]"
                                  title={contract.title || `Contratto #${contract.id}`}
                                >
                                  {contract.title || `#${contract.id}`}
                                </button>
                              ))}
                              {client.contracts.length > 2 && (
                                <span className="shrink-0 rounded border border-dashed border-line dark:border-line-dark px-1.5 py-1 text-[10px] text-muted dark:text-muted-dark">
                                  +{client.contracts.length - 2}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  }

                  return (
                <article
                  key={client.id}
                  role="button"
                  tabIndex={0}
                  onClick={(event) => {
                    if (isInteractiveTarget(event.target)) return;
                    openClientDetail(client);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openClientDetail(client);
                    }
                  }}
                  className={`rounded-lg border border-line dark:border-line-dark bg-paper dark:bg-[#131316] p-3 ${
                    viewMode === "list" ? "" : "h-full"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-ink dark:text-paper">{client.name}</div>
                      <div className="text-xs text-muted dark:text-muted-dark mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                        <span className="font-semibold text-ink dark:text-paper">Referente:</span>
                        <span>{client.contact || "n/d"}</span>
                        {client.email && (
                          <>
                            <span aria-hidden>·</span>
                            <button
                              type="button"
                              className="underline decoration-dotted underline-offset-2 hover:text-ink dark:hover:text-paper"
                              onClick={() => void copyContactValue(client.email!, "Email copiata")}
                              title="Copia email"
                            >
                              {client.email}
                            </button>
                          </>
                        )}
                        {client.phone && (
                          <>
                            <span aria-hidden>·</span>
                            <button
                              type="button"
                              className="underline decoration-dotted underline-offset-2 hover:text-ink dark:hover:text-paper"
                              onClick={() => void copyContactValue(client.phone!, "Telefono copiato")}
                              title="Copia telefono"
                            >
                              {client.phone}
                            </button>
                          </>
                        )}
                      </div>
                      <div className="text-xs text-muted dark:text-muted-dark mt-0.5">
                        {client.city || ""}
                        {client.prov ? ` (${client.prov})` : ""}
                        {client.vat ? ` · P.IVA ${client.vat}` : ""}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      {primaryStatus && (
                        <span className="inline-flex items-center gap-1.5 rounded-pill px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider border border-line dark:border-line-dark text-ink dark:text-paper">
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-muted dark:bg-muted-dark" aria-hidden />
                          Stato: {primaryStatus.label}
                          {typeof primaryStatus.count === "number" && primaryStatus.count > 0 ? ` (${primaryStatus.count})` : ""}
                        </span>
                      )}
                      <span className={`inline-flex items-center rounded-pill px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${paymentTone(client.payment_type)}`}>
                        {client.payment_type_label ?? "n/d"}
                      </span>
                    </div>
                  </div>

                  <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    <div>
                      <div className="text-muted dark:text-muted-dark">Contratti attivi</div>
                      <div className="font-semibold text-ink dark:text-paper">{client.active_contract_count}</div>
                    </div>
                    <div>
                      <div className="text-muted dark:text-muted-dark">Formalizzati</div>
                      <div className="font-semibold text-ink dark:text-paper">{client.formalized_contract_count}</div>
                    </div>
                    <div>
                      <div className="text-muted dark:text-muted-dark">Prima firma</div>
                      <div className="font-semibold text-ink dark:text-paper">{formatDate(client.first_signed_at)}</div>
                    </div>
                    <div>
                      <div className="text-muted dark:text-muted-dark">Prima partenza</div>
                      <div className="font-semibold text-ink dark:text-paper">{formatDate(client.first_start_date)}</div>
                    </div>
                  </div>

                  <div className="mt-2 flex items-center text-sm font-semibold text-ink dark:text-paper">
                    <span>{formatAmountBreakdown(client.monthly_amount, client.one_time_amount, client.total_amount)}</span>
                    <FieldHelpPopover
                      title="Voci di prezzo e ingaggio"
                      shortText="Come vengono classificati importi e tipo di contratto."
                      longText={PRICING_TERMS_INFO}
                    />
                  </div>

                  {((client.work_areas?.length ?? 0) > 0 || (client.tags?.length ?? 0) > 0) && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(client.work_areas ?? []).map((area) => (
                        <span
                          key={`client-${client.id}-area-${area.id}`}
                          className="inline-flex items-center rounded-pill border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                          style={area.color ? { borderColor: `${area.color}55`, color: area.color, backgroundColor: `${area.color}1A` } : undefined}
                        >
                          {area.name}
                        </span>
                      ))}
                      {(client.tags ?? []).map((tag) => (
                        <span
                          key={`client-${client.id}-tag-${tag.id}`}
                          className="inline-flex items-center rounded-pill border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                          style={tag.color ? { borderColor: `${tag.color}55`, color: tag.color, backgroundColor: `${tag.color}1A` } : undefined}
                        >
                          #{tag.name}
                        </span>
                      ))}
                    </div>
                  )}

                  <ClientActivityTabs
                    contracts={client.contracts}
                    quotes={client.quotes ?? []}
                    contractStatusSummary={client.contract_status_summary}
                    quoteStatusSummary={client.quote_status_summary}
                    onOpenContract={openContractDetail}
                    onOpenWorkItems={openWorkItemsByContract}
                    onOpenQuote={openQuoteDetail}
                  />
                </article>
                  );
                })()
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-1">
              <span className="text-[12px] text-muted dark:text-muted-dark">Pagina {page} di {totalPages} · {total} clienti</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-line bg-paper text-ink transition-colors hover:bg-cream disabled:opacity-40 dark:border-line-dark dark:bg-[#1c1c20] dark:text-paper dark:hover:bg-[#252529]"
                >
                  <Icon name="chevron-right" className="w-4 h-4 rotate-180" />
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-line bg-paper text-ink transition-colors hover:bg-cream disabled:opacity-40 dark:border-line-dark dark:bg-[#1c1c20] dark:text-paper dark:hover:bg-[#252529]"
                >
                  <Icon name="chevron-right" className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <Modal
        open={clientDetailOpen}
        onClose={closeClientDetail}
        title={selectedClient ? `Cliente: ${selectedClient.name}` : "Dettaglio cliente"}
        size="2xl"
        dialogClassName="h-[88vh] max-h-[88vh]"
        footer={
          <>
            <Button variant="ghost" onClick={closeClientDetail}>Chiudi</Button>
            {clientDetailTab === "client" && (
              <Button
                variant="primary"
                onClick={() => setEditClientOpen(true)}
                disabled={selectedClientDetailLoading || !selectedClientDetail}
              >
                Modifica cliente
              </Button>
            )}
          </>
        }
      >
        {!selectedClient ? (
          <div className="rounded-md border border-line dark:border-line-dark px-3 py-4 text-sm text-muted dark:text-muted-dark">
            Cliente non trovato nella situazione corrente.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="seg-switch">
              <button
                type="button"
                onClick={() => setClientDetailTab("client")}
                className={clientDetailTab === "client" ? "is-active" : ""}
              >
                Cliente
              </button>
              <button
                type="button"
                onClick={() => setClientDetailTab("contracts")}
                className={clientDetailTab === "contracts" ? "is-active" : ""}
              >
                Contratti ({selectedClient.contracts.length})
              </button>
              <button
                type="button"
                onClick={() => setClientDetailTab("work-items")}
                className={clientDetailTab === "work-items" ? "is-active" : ""}
              >
                Lavorazioni ({selectedClient.tasks_completion?.total_tasks ?? 0})
              </button>
              <button
                type="button"
                onClick={() => setClientDetailTab("quotes")}
                className={clientDetailTab === "quotes" ? "is-active" : ""}
              >
                Preventivi ({selectedClient.quotes?.length ?? 0})
              </button>
            </div>

            {clientDetailTab === "client" && (
              <div className="space-y-3">
                {selectedClientDetailLoading ? (
                  <div className="flex items-center justify-center py-6"><Spinner size="md" /></div>
                ) : selectedClientDetailError ? (
                  <div className="rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
                    {selectedClientDetailError}
                  </div>
                ) : selectedClientDetail ? (
                  <ClientFullDetails client={selectedClientDetail} />
                ) : (
                  <div className="rounded-md border border-line dark:border-line-dark px-3 py-2 text-sm text-muted dark:text-muted-dark">
                    Nessun dettaglio disponibile.
                  </div>
                )}
              </div>
            )}

            {clientDetailTab === "contracts" && (
              <div className="space-y-3">
                {selectedClient.contracts.length === 0 ? (
                  <div className="rounded-md border border-dashed border-line dark:border-line-dark px-3 py-5 text-sm text-muted dark:text-muted-dark">
                    Nessun contratto disponibile.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {selectedClient.contracts.map((contract) => (
                      <ContractRow
                        key={`client-detail-contract-${contract.id}`}
                        contract={contract}
                        onClick={() => openContractDetail(contract.id)}
                        onOpenWorkItems={openWorkItemsByContract}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {clientDetailTab === "work-items" && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  <div className="rounded-md border border-line dark:border-line-dark px-3 py-2">
                    <div className="text-muted dark:text-muted-dark">Totali</div>
                    <div className="text-sm font-semibold text-ink dark:text-paper">{selectedClient.tasks_completion?.total_tasks ?? 0}</div>
                  </div>
                  <div className="rounded-md border border-line dark:border-line-dark px-3 py-2">
                    <div className="text-muted dark:text-muted-dark">Completate</div>
                    <div className="text-sm font-semibold text-ink dark:text-paper">{selectedClient.tasks_completion?.completed_tasks ?? 0}</div>
                  </div>
                  <div className="rounded-md border border-line dark:border-line-dark px-3 py-2">
                    <div className="text-muted dark:text-muted-dark">Completamento</div>
                    <div className="text-sm font-semibold text-ink dark:text-paper">{clampPercent(selectedClient.tasks_completion?.completion_rate ?? 0)}%</div>
                  </div>
                </div>

                {clientWorkItemsLoading ? (
                  <div className="flex items-center justify-center px-3 py-8">
                    <Spinner />
                  </div>
                ) : clientWorkItems.length === 0 ? (
                  <div className="rounded-md border border-dashed border-line dark:border-line-dark px-3 py-5 text-sm text-muted dark:text-muted-dark">
                    Nessuna lavorazione disponibile per il cliente.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
                    {clientWorkItems.map((item) => (
                      <WorkItemSummaryCard
                        key={`client-work-item-${item.id}`}
                        item={{
                          id: item.id,
                          title: item.title,
                          status: item.status,
                          completion_state: item.is_completed
                            ? "completed"
                            : item.status === "in_progress"
                              ? "in_progress"
                              : item.status === "review"
                                ? "review"
                                : "todo",
                          is_completed: item.is_completed,
                          progress_percent: item.progress_percent,
                          work_date: item.work_date,
                          deadline_date: item.deadline_date,
                          assignee_ids: item.assignee_ids,
                          work_area_ids: item.work_area_ids,
                          tag_ids: item.tag_ids,
                          updated_at: item.updated_at,
                        }}
                        users={companyUsers}
                        workAreas={availableAreas}
                        workTags={availableTags}
                        linkedToContract={(item.contract_ids?.length ?? 0) > 0}
                        onEdit={() => void openWorkItemEdit(item.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {clientDetailTab === "quotes" && (
              <div className="space-y-3">
                {(selectedClient.quotes ?? []).length === 0 ? (
                  <div className="rounded-md border border-dashed border-line dark:border-line-dark px-3 py-5 text-sm text-muted dark:text-muted-dark">
                    Nessun preventivo disponibile per il cliente.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                    {(selectedClient.quotes ?? []).map((quote) => (
                      <QuoteRow key={`client-detail-quote-${quote.id}`} quote={quote} onClick={() => openQuoteDetail(quote.id)} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      <ClientModal
        open={editClientOpen}
        onClose={() => setEditClientOpen(false)}
        client={selectedClientDetail}
        isAdmin={isAdmin}
        companyId={effectiveCompanyId}
        onSaved={() => {
          setEditClientOpen(false);
          if (selectedClientId != null) {
            getClientApi(selectedClientId)
              .then((client) => {
                setSelectedClientDetail(client);
              })
              .catch(() => {
                setSelectedClientDetail(null);
              });
          }
          setReloadNonce((current) => current + 1);
        }}
      />

      <WorkItemFormModal
        open={workItemModalOpen}
        onClose={() => {
          setWorkItemModalOpen(false);
          setEditingWorkItem(null);
        }}
        editingItem={editingWorkItem}
        companyId={effectiveCompanyId ?? 0}
        isAdmin={isAdmin}
        onSaved={() => {
          setWorkItemModalOpen(false);
          setEditingWorkItem(null);
          setReloadNonce((current) => current + 1);
        }}
      />

      <ContractDetailModal
        open={contractModalOpen}
        contractId={selectedContractId}
        companyId={effectiveCompanyId}
        isAdmin={isAdmin}
        onClose={() => {
          setContractModalOpen(false);
          setSelectedContractId(null);
        }}
        onContractUpdated={applyContractUpdateToClients}
      />

      <QuoteQuickCreateModal
        open={quoteModalOpen}
        companyId={effectiveCompanyId}
        clients={companyClients}
        clientsLoading={companyClientsLoading}
        canSyncFromFic={isAdmin}
        quoteToEdit={selectedQuote}
        onClose={closeQuoteDetail}
        onCreated={() => {
          setReloadNonce((current) => current + 1);
          closeQuoteDetail();
        }}
      />

      <ContractCreateModal
        open={createContractOpen}
        companyId={effectiveCompanyId}
        clients={companyClients}
        canCreateTaxonomy={isAdmin}
        onClose={() => setCreateContractOpen(false)}
        onCreated={() => {
          setReloadNonce((current) => current + 1);
        }}
      />

      <WorkTagCreateModal
        open={workTagModalOpen}
        companyId={effectiveCompanyId}
        onClose={() => setWorkTagModalOpen(false)}
        onCreated={(tag) => {
          setAvailableTags((current) => (current.some((item) => item.id === tag.id) ? current : [...current, tag]));
          setTagFilterIds((current) => (current.includes(tag.id) ? current : [...current, tag.id]));
          setWorkTagModalOpen(false);
          toast.success("Tag creato");
        }}
      />

      <WorkAreaCreateModal
        open={workAreaModalOpen}
        companyId={effectiveCompanyId}
        onClose={() => setWorkAreaModalOpen(false)}
        onCreated={(area) => {
          setAvailableAreas((current) => (current.some((item) => item.id === area.id) ? current : [...current, area]));
          setWorkAreaFilterIds((current) => (current.includes(area.id) ? current : [...current, area.id]));
          setWorkAreaModalOpen(false);
          toast.success("Area creata");
        }}
      />

      <SituationWizardModal
        open={createOpen}
        companyId={effectiveCompanyId}
        clients={companyClients}
        clientsLoading={companyClientsLoading}
        canCreateTaxonomy={isAdmin}
        canSyncFromFic={isAdmin}
        onClose={closeCreateSituation}
        onCreated={(created) => {
          setReloadNonce((current) => current + 1);
          setSelectedContractId(created.id);
          setContractModalOpen(true);
        }}
      />
    </div>
  );
}
