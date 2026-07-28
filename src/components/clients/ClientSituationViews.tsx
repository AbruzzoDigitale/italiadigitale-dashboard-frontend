import { useState, useEffect } from "react";
import type { ClientSituationItem, ClientSituationContract, ClientSituationQuote } from "../../api/clients";
import { CONTRACT_STAGE_LABELS, type ContractCommercialStage } from "../../api/contracts";
import { Icon } from "../ui/Icon";
import { DropdownMenu, type DropdownMenuItem } from "../ui/DropdownMenu";

// ── Helpers ─────────────────────────────────────────────────────────────────

export type PrimaryStatus = { label: string; count?: number } | null;

const WORK_ITEMS_ENABLED_STAGES = new Set(["firmato", "in_produzione", "completato"]);

function euro(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}
function dateIt(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? String(s) : d.toLocaleDateString("it-IT");
}
function typeClass(pt?: string | null): string {
  return pt === "ongoing" ? "canone" : pt === "one_time" ? "tantum" : "misto";
}
function typeLabel(c: ClientSituationItem): string {
  if (c.payment_type_label) return c.payment_type_label;
  return c.payment_type === "ongoing" ? "Canone" : c.payment_type === "one_time" ? "Una tantum" : "Misto";
}
function contractStateClass(stage?: string | null): string {
  if (stage === "firmato" || stage === "accettato" || stage === "completato") return "ok";
  if (stage === "in_produzione") return "prod";
  if (stage === "perso") return "perso";
  return "warn";
}
function contractStateLabel(stage?: string | null): string {
  return CONTRACT_STAGE_LABELS[stage as ContractCommercialStage] ?? stage ?? "—";
}
const QUOTE_STATUS_LABELS: Record<string, string> = {
  bozza: "Bozza",
  inviato: "Inviato",
  in_trattativa: "In trattativa",
  da_approvare: "Da approvare",
  in_revisione: "In revisione",
  accettato: "Accettato",
  perso: "Perso",
  rifiutato: "Rifiutato",
};
function quoteStateClass(status?: string | null): string {
  if (status === "accettato") return "ok";
  if (status === "perso" || status === "rifiutato") return "perso";
  if (status === "inviato") return "prod";
  return "warn";
}
function quoteStateLabel(status?: string | null): string {
  return status ? QUOTE_STATUS_LABELS[status] ?? status : "—";
}
function isInteractive(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && !!target.closest("button,a,input,select,textarea,[role='button']");
}

// ── Callbacks condivise ─────────────────────────────────────────────────────

interface ViewCallbacks {
  onOpenClient: (c: ClientSituationItem) => void;
  onOpenContract: (id: number) => void;
  onOpenQuote: (id: number) => void;
  onOpenWorkItems: (id: number) => void;
  copyContact: (value: string, msg: string) => void;
  primaryStatusOf: (c: ClientSituationItem) => PrimaryStatus;
  // Archiviazione/ripristino dell'intera situazione cliente. Opzionali: se
  // assenti, il menu ⋯ sulla card non compare.
  onArchiveClient?: (c: ClientSituationItem) => void;
  onUnarchiveClient?: (c: ClientSituationItem) => void;
}

// ── Deal card (stile prototipo .cs-deal) ────────────────────────────────────

function ContractDealCard({ c, onOpen, onOpenWorkItems }: { c: ClientSituationContract; onOpen: (id: number) => void; onOpenWorkItems: (id: number) => void }) {
  const showWork = WORK_ITEMS_ENABLED_STAGES.has(c.commercial_stage ?? "");
  const tc = c.tasks_completion;
  return (
    <div className="cs-deal" role="button" tabIndex={0} onClick={() => onOpen(c.id)}>
      <div className="cs-deal-top">
        <span className="cs-deal-title">{c.title || `Contratto #${c.id}`}</span>
        <span className={"cs-state " + contractStateClass(c.commercial_stage)}>{contractStateLabel(c.commercial_stage)}</span>
      </div>
      <div className="cs-deal-meta">Firma {dateIt(c.signed_at)} · Inizio {dateIt(c.start_date)}</div>
      <div className="cs-deal-tot">Totale {euro(c.total_amount)}</div>
      <div className="cs-deal-sub">Mese {euro(c.monthly_amount)} · Una tantum {euro(c.one_time_amount)}</div>
      {showWork && (
        <div className="cs-deal-work">
          <span>{tc ? `Lavorazioni ${tc.completed_tasks}/${tc.total_tasks}` : "Lavorazioni"}</span>
          <button type="button" className="cs-deal-worklink" onClick={(e) => { e.stopPropagation(); onOpenWorkItems(c.id); }}>
            Apri lavorazioni
          </button>
        </div>
      )}
    </div>
  );
}

function QuoteDealCard({ q, onOpen }: { q: ClientSituationQuote; onOpen: (id: number) => void }) {
  return (
    <div className="cs-deal" role="button" tabIndex={0} onClick={() => onOpen(q.id)}>
      <div className="cs-deal-top">
        <span className="cs-deal-title">{q.title || `Preventivo #${q.id}`}</span>
        <span className={"cs-state " + quoteStateClass(q.status)}>{quoteStateLabel(q.status)}</span>
      </div>
      <div className="cs-deal-meta">#{q.number ?? q.id}</div>
      <div className="cs-deal-meta">Creato {dateIt(q.created_at)} · Aggiornato {dateIt(q.updated_at)}</div>
      <div className="cs-deal-tot">Totale {euro(q.total_amount)}</div>
      <div className="cs-deal-sub">Mese {euro(q.monthly_amount)} · Una tantum {euro(q.one_time_amount)}</div>
    </div>
  );
}

// ── Carosello (slide) di deal ───────────────────────────────────────────────

function DealCarousel<T extends { id: number }>({ items, render }: { items: T[]; render: (item: T) => React.ReactNode }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    setIndex((cur) => (items.length === 0 ? 0 : Math.min(cur, items.length - 1)));
  }, [items]);

  if (items.length === 0) return null;
  const many = items.length > 1;
  const prev = () => setIndex((cur) => (cur - 1 + items.length) % items.length);
  const next = () => setIndex((cur) => (cur + 1) % items.length);

  return (
    <div>
      <div className="cs-deal-carousel">
        <div className="cs-deal-track" style={{ transform: `translateX(-${index * 100}%)` }}>
          {items.map((it) => (
            <div key={it.id} className="cs-deal-slide">{render(it)}</div>
          ))}
        </div>
        {many && (
          <>
            <button type="button" className="cs-deal-nav prev" onClick={(e) => { e.stopPropagation(); prev(); }} aria-label="Precedente">
              <Icon name="chevron-right" className="w-4 h-4 rotate-180" />
            </button>
            <button type="button" className="cs-deal-nav next" onClick={(e) => { e.stopPropagation(); next(); }} aria-label="Successivo">
              <Icon name="chevron-right" className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
      {many && (
        <div className="cs-deal-dots">
          {items.map((it, i) => (
            <button
              key={it.id}
              type="button"
              className={"cs-deal-dot" + (i === index ? " on" : "")}
              onClick={(e) => { e.stopPropagation(); setIndex(i); }}
              aria-label={`Vai a ${i + 1}`}
              aria-pressed={i === index}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SituationDeals({ client, cb }: { client: ClientSituationItem; cb: ViewCallbacks }) {
  const contracts = client.contracts ?? [];
  const quotes = client.quotes ?? [];
  const [tab, setTab] = useState<"contratti" | "preventivi">(contracts.length > 0 ? "contratti" : "preventivi");
  return (
    <div className="cs-deals">
      <div className="cs-tabs">
        <button type="button" className={tab === "contratti" ? "on" : ""} onClick={() => setTab("contratti")}>Contratti ({contracts.length})</button>
        <button type="button" className={tab === "preventivi" ? "on" : ""} onClick={() => setTab("preventivi")}>Preventivi ({quotes.length})</button>
      </div>
      {tab === "contratti" ? (
        contracts.length === 0 ? (
          <div className="cs-deal-empty">Nessun contratto</div>
        ) : (
          <DealCarousel items={contracts} render={(c) => <ContractDealCard c={c} onOpen={cb.onOpenContract} onOpenWorkItems={cb.onOpenWorkItems} />} />
        )
      ) : quotes.length === 0 ? (
        <div className="cs-deal-empty">Nessun preventivo</div>
      ) : (
        <DealCarousel items={quotes} render={(q) => <QuoteDealCard q={q} onOpen={cb.onOpenQuote} />} />
      )}
    </div>
  );
}

// ── Header cliente + stat grid ──────────────────────────────────────────────

function ClientHeader({ c, cb }: { c: ClientSituationItem; cb: ViewCallbacks }) {
  const primary = cb.primaryStatusOf(c);
  const canone = (c.monthly_amount ?? 0) > 0;
  return (
    <>
      <div className="cs-head-main">
        <div className="cs-name">{c.name}</div>
        <div className="cs-ref">
          <b>Referente:</b> {c.contact || "n/d"}
          {c.email && (
            <>
              {" · "}
              <button type="button" onClick={(e) => { e.stopPropagation(); cb.copyContact(c.email!, "Email copiata"); }} title="Copia email">
                {c.email}
              </button>
            </>
          )}
        </div>
        <div className="cs-loc">
          {c.city || ""}{c.prov ? ` (${c.prov})` : ""}{c.vat ? ` · P.IVA ${c.vat}` : ""}
        </div>
      </div>
      <div className="cs-head-side">
        <ClientCardMenu c={c} cb={cb} />
        {c.is_archived && <span className="cs-archived-badge" title="Situazione archiviata">Archiviata</span>}
        <span className={"cs-type " + typeClass(c.payment_type)}>{typeLabel(c)}</span>
        {primary && (
          <span className="cs-banner">
            Stato: {primary.label}{typeof primary.count === "number" && primary.count > 0 ? ` (${primary.count})` : ""}
          </span>
        )}
        {canone && <span className="cs-canone">Canone</span>}
      </div>
    </>
  );
}

function StatGrid({ c }: { c: ClientSituationItem }) {
  return (
    <div className="cs-stats">
      <div><span>Contratti attivi</span><b>{c.active_contract_count}</b></div>
      <div><span>Formalizzati</span><b>{c.formalized_contract_count}</b></div>
      <div><span>Prima firma</span><b>{dateIt(c.first_signed_at)}</b></div>
      <div><span>Prima partenza</span><b>{dateIt(c.first_start_date)}</b></div>
    </div>
  );
}

// ── Menu azioni situazione cliente (⋯) ──────────────────────────────────────

function ClientCardMenu({ c, cb }: { c: ClientSituationItem; cb: ViewCallbacks }) {
  const archived = !!c.is_archived;
  const items: DropdownMenuItem[] = [
    archived
      ? cb.onUnarchiveClient && {
          key: "unarchive",
          label: "Ripristina situazione",
          icon: "refresh-cw",
          onClick: () => cb.onUnarchiveClient?.(c),
        }
      : cb.onArchiveClient && {
          key: "archive",
          label: "Archivia situazione",
          icon: "eye-off",
          onClick: () => cb.onArchiveClient?.(c),
        },
  ].filter(Boolean) as DropdownMenuItem[];
  if (items.length === 0) return null;
  return (
    <span className="cs-card-menu" onClick={(e) => e.stopPropagation()}>
      <DropdownMenu items={items} label="Azioni situazione cliente" size="sm" align="right" />
    </span>
  );
}

// ── Viste ───────────────────────────────────────────────────────────────────

export function SituationViews({
  clients,
  viewMode,
  onOpenClient,
  onOpenContract,
  onOpenQuote,
  onOpenWorkItems,
  copyContact,
  primaryStatusOf,
  onArchiveClient,
  onUnarchiveClient,
}: {
  clients: ClientSituationItem[];
  viewMode: "grid" | "list" | "compact";
} & ViewCallbacks) {
  const cb: ViewCallbacks = {
    onOpenClient,
    onOpenContract,
    onOpenQuote,
    onOpenWorkItems,
    copyContact,
    primaryStatusOf,
    onArchiveClient,
    onUnarchiveClient,
  };
  const openClient = (e: React.MouseEvent, c: ClientSituationItem) => {
    if (isInteractive(e.target)) return;
    onOpenClient(c);
  };

  if (viewMode === "compact") {
    return (
      <div className="cs-compact">
        {clients.map((c) => {
          const primary = primaryStatusOf(c);
          const deal = c.contracts?.[0] ?? c.quotes?.[0];
          return (
            <div key={c.id} className="cs-mini" tabIndex={0} onClick={(e) => openClient(e, c)}>
              <div className="cs-mini-actions">
                {c.is_archived && <span className="cs-archived-badge sm" title="Situazione archiviata">Arch.</span>}
                <ClientCardMenu c={c} cb={cb} />
              </div>
              <div className="cs-mini-name" title={c.name}>{c.name}</div>
              <div className="cs-ref"><b>Referente:</b> {c.contact || "n/d"}</div>
              {c.email && (
                <button type="button" className="cs-mini-mail" onClick={(e) => { e.stopPropagation(); copyContact(c.email!, "Email copiata"); }} title="Copia email">
                  {c.email}
                </button>
              )}
              <div className="cs-mini-row">
                <span className="cs-mini-attivi">{c.active_contract_count} attivi</span>
                <span className={"cs-type " + typeClass(c.payment_type)}>{typeLabel(c)}</span>
                {(c.monthly_amount ?? 0) > 0 && <span className="cs-canone sm">Canone</span>}
              </div>
              <div className="cs-mini-money">{euro(c.monthly_amount)}</div>
              {primary && (
                <div className="cs-mini-stato">Stato: {primary.label}{typeof primary.count === "number" && primary.count > 0 ? ` (${primary.count})` : ""}</div>
              )}
              {(c.total_amount ?? 0) > 0 && (
                <div className="cs-mini-tot"><span>Totale</span>{euro(deal ? deal.total_amount : c.total_amount)}</div>
              )}
              <div className="cs-mini-spacer" />
              {deal && <div className="cs-mini-chip">{deal.title}</div>}
            </div>
          );
        })}
      </div>
    );
  }

  if (viewMode === "list") {
    return (
      <div className="cs-list">
        {clients.map((c) => (
          <div key={c.id} className="cs-row" tabIndex={0} onClick={(e) => openClient(e, c)}>
            <div className="cs-row-head">
              <div className="cs-head-main">
                <div className="cs-name">{c.name}</div>
                <div className="cs-ref">
                  <b>Referente:</b> {c.contact || "n/d"}
                  {c.email && (
                    <>
                      {" · "}
                      <button type="button" onClick={(e) => { e.stopPropagation(); copyContact(c.email!, "Email copiata"); }} title="Copia email">{c.email}</button>
                    </>
                  )}
                </div>
                <div className="cs-loc">
                  {c.city || ""}{c.prov ? ` (${c.prov})` : ""}{c.vat ? ` · P.IVA ${c.vat}` : ""}
                </div>
              </div>
              <div className="cs-row-side">
                <ClientCardMenu c={c} cb={cb} />
                {c.is_archived && <span className="cs-archived-badge" title="Situazione archiviata">Archiviata</span>}
                <span className={"cs-type " + typeClass(c.payment_type)}>{typeLabel(c)}</span>
                {primaryStatusOf(c) && <span className="cs-banner">Stato: {primaryStatusOf(c)!.label}</span>}
                {(c.monthly_amount ?? 0) > 0 && <span className="cs-canone">Canone</span>}
              </div>
            </div>
            <div className="cs-row-stats">
              <div><span>Contratti attivi</span><b>{c.active_contract_count}</b></div>
              <div><span>Formalizzati</span><b>{c.formalized_contract_count}</b></div>
              <div><span>Prima firma</span><b>{dateIt(c.first_signed_at)}</b></div>
              <div><span>Prima partenza</span><b>{dateIt(c.first_start_date)}</b></div>
              <div className="cs-row-money"><span>Valore</span><b>Mese {euro(c.monthly_amount)} · Una tantum {euro(c.one_time_amount)}</b></div>
            </div>
            <SituationDeals client={c} cb={cb} />
          </div>
        ))}
      </div>
    );
  }

  // grid (card)
  return (
    <div className="cs-grid">
      {clients.map((c) => (
        <div key={c.id} className="cs-card" tabIndex={0} onClick={(e) => openClient(e, c)}>
          <div className="cs-head"><ClientHeader c={c} cb={cb} /></div>
          <StatGrid c={c} />
          <div className="cs-money"><span className="cs-money-t">Mese <b>{euro(c.monthly_amount)}</b> · Una tantum <b>{euro(c.one_time_amount)}</b></span></div>
          <SituationDeals client={c} cb={cb} />
        </div>
      ))}
    </div>
  );
}
