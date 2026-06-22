import type { ClientSituationItem, ClientSituationContract } from "../api/clients";
import type { WorkItem } from "../api/workItems";

// ─────────────────────────────────────────────────────────────────────────────
// Tipi del modulo Fatturazione
//
// Il modulo NON ha endpoint backend dedicati: le voci da fatturare sono DERIVATE
// (lato client) dalle lavorazioni completate + dai contratti/preventivi collegati
// (sorgente: Situazione clienti). Lo stato "fatturato" è un placeholder demo
// persistito in localStorage, in attesa dell'endpoint fattura su FIC.
// ─────────────────────────────────────────────────────────────────────────────

export type BillingPeriodKind = "canone" | "una_tantum";
export type BillingStatus = "da_fatturare" | "fatturato";

export interface BillingItem {
  /** Chiave stabile usata per filtri, React key e persistenza stato. */
  key: string;
  clientId: number;
  clientName: string;
  contractId: number;
  contractTitle: string;
  /** Lavorazione (work item) che ha generato la voce. */
  workItemId: number;
  description: string;
  kind: BillingPeriodKind;
  /** Mese di competenza in formato YYYY-MM (solo per il canone). */
  month: string | null;
  monthLabel: string | null;
  amount: number;
  status: BillingStatus;
  /** True se "fatturato" è stato impostato tramite il placeholder FIC. */
  ficPlaceholder: boolean;
}

export interface BillingStats {
  totalCount: number;
  toBillCount: number;
  toBillAmount: number;
  billedAmount: number;
  canoneAmount: number;
  unaTantumAmount: number;
}

const MONTH_LABELS_IT = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

/** Estrae la chiave mese YYYY-MM da una data ISO; null se non valida. */
export function monthKey(value?: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/** Etichetta mese leggibile (es. "Giugno 2026") a partire da YYYY-MM. */
export function monthLabel(key: string | null): string | null {
  if (!key) return null;
  const [year, month] = key.split("-");
  const index = Number(month) - 1;
  if (index < 0 || index > 11) return key;
  return `${MONTH_LABELS_IT[index]} ${year}`;
}

interface CompletionTask {
  id: number;
  title?: string;
  status?: string;
  completion_state?: string;
  is_completed?: boolean;
  work_date?: string | null;
}

function isCompleted(task: CompletionTask): boolean {
  return (
    task.is_completed === true ||
    task.completion_state === "completed" ||
    task.status === "completed"
  );
}

/** Fallback PED quando il work item non è disponibile dalla lista. */
function looksLikePed(title?: string | null): boolean {
  if (!title) return false;
  return /\bped\b/i.test(title);
}

/**
 * Deriva le voci di fatturazione dai dati della Situazione clienti.
 *
 * Regola (concordata):
 *  - lavorazione PED completata → voce CANONE per il mese della lavorazione
 *    (importo = monthly_amount del contratto);
 *  - altra lavorazione completata su contratto con una tantum → UNA voce
 *    UNA TANTUM (importo = one_time_amount), una sola per contratto.
 *
 * @param clients      clienti dalla Situazione clienti (con contratti + tasks_completion)
 * @param workItemById mappa work item completati per id (per leggere is_PED / work_date)
 */
export function deriveBillingItems(
  clients: ClientSituationItem[],
  workItemById: Map<number, WorkItem>
): BillingItem[] {
  const items: BillingItem[] = [];

  for (const client of clients) {
    const contracts: ClientSituationContract[] = client.contracts ?? [];

    for (const contract of contracts) {
      const monthly = contract.monthly_amount ?? 0;
      const oneTime = contract.one_time_amount ?? 0;
      const tasks = (contract.tasks_completion?.items ?? []) as CompletionTask[];
      const completed = tasks.filter(isCompleted);

      let unaTantumEmitted = false;

      for (const task of completed) {
        const workItem = workItemById.get(task.id);
        const isPed = workItem?.is_PED ?? looksLikePed(task.title);
        const workDate = task.work_date ?? workItem?.work_date ?? null;

        if (isPed && monthly > 0) {
          const mk = monthKey(workDate);
          items.push({
            key: `${contract.id}:canone:${task.id}:${mk ?? "nd"}`,
            clientId: client.id,
            clientName: client.name,
            contractId: contract.id,
            contractTitle: contract.title,
            workItemId: task.id,
            description: task.title?.trim() || `PED ${monthLabel(mk) ?? ""} – ${contract.title}`.trim(),
            kind: "canone",
            month: mk,
            monthLabel: monthLabel(mk),
            amount: monthly,
            status: "da_fatturare",
            ficPlaceholder: false,
          });
        } else if (!isPed && oneTime > 0 && !unaTantumEmitted) {
          unaTantumEmitted = true;
          items.push({
            key: `${contract.id}:una_tantum:${task.id}`,
            clientId: client.id,
            clientName: client.name,
            contractId: contract.id,
            contractTitle: contract.title,
            workItemId: task.id,
            description: task.title?.trim() || `${contract.title} – Una tantum`,
            kind: "una_tantum",
            month: null,
            monthLabel: null,
            amount: oneTime,
            status: "da_fatturare",
            ficPlaceholder: false,
          });
        }
      }
    }
  }

  // Ordino: prima da fatturare, poi per cliente, poi mese più recente.
  return items.sort((a, b) => {
    if (a.clientName !== b.clientName) return a.clientName.localeCompare(b.clientName);
    if (a.kind !== b.kind) return a.kind === "una_tantum" ? -1 : 1;
    return (b.month ?? "").localeCompare(a.month ?? "");
  });
}

export function computeBillingStats(items: BillingItem[]): BillingStats {
  const stats: BillingStats = {
    totalCount: items.length,
    toBillCount: 0,
    toBillAmount: 0,
    billedAmount: 0,
    canoneAmount: 0,
    unaTantumAmount: 0,
  };

  for (const item of items) {
    if (item.status === "da_fatturare") {
      stats.toBillCount += 1;
      stats.toBillAmount += item.amount;
    } else {
      stats.billedAmount += item.amount;
    }
    if (item.kind === "canone") stats.canoneAmount += item.amount;
    else stats.unaTantumAmount += item.amount;
  }

  return stats;
}

// ── Persistenza stato (placeholder demo, in attesa del backend FIC) ────────────

const STORAGE_KEY = "iddash_billing_status_v1";

export interface BillingOverride {
  status: BillingStatus;
  ficPlaceholder: boolean;
}

export type BillingOverrides = Record<string, BillingOverride>;

export function loadBillingOverrides(): BillingOverrides {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as BillingOverrides;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveBillingOverrides(overrides: BillingOverrides): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // Storage non disponibile: lo stato resta solo in memoria per la sessione.
  }
}
