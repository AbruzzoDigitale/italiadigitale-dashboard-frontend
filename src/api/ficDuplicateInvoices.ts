import { authFetch, API_BASE } from "./auth";

// ─────────────────────────────────────────────────────────────────────────────
// Duplica su Fatture in Cloud le fatture emesse del mese precedente nel mese
// successivo (senza inviarle allo SDI). Area admin. Il token FIC è preso dal DB.
// Vedi app/api/v1/endpoints/fic_duplicate_invoices.py sul backend.
// ─────────────────────────────────────────────────────────────────────────────

const BASE = `${API_BASE}/api/v1/fic/duplicate-invoices`;

export type DuplicateInvoiceStatus = "preview" | "created" | "skipped" | "error";

export interface DuplicateInvoiceItem {
  number: string;
  client: string;
  old_date: string | null;
  new_date: string | null;
  due_date: string;
  amount: number;
  status: DuplicateInvoiceStatus;
  new_number: string | null;
  error: string | null;
}

export interface DuplicateInvoicesResult {
  dry_run: boolean;
  source_year: number;
  source_month: number;
  dest_year: number;
  dest_month: number;
  due_date: string;
  found: number;
  created: number;
  skipped: number;
  errors: number;
  items: DuplicateInvoiceItem[];
}

export interface DuplicateInvoicesParams {
  /** Mese di origine (opzionale): se assente, mese precedente rispetto ad oggi. */
  sourceYear?: number | null;
  sourceMonth?: number | null;
  /** Scadenza forzata "YYYY-MM-DD": se assente, giorno 20 del mese di destinazione. */
  dueDate?: string | null;
  /** Data di emissione forzata "YYYY-MM-DD": se assente, stesso giorno dell'originale
   *  nel mese di destinazione ma mai oltre oggi (FIC rifiuta le date future). */
  documentDate?: string | null;
  /** Numeri di fattura da NON copiare. */
  excludeNumbers?: string[];
  /** 0 = tutte; N>0 = crea solo le prime N non escluse (per test). */
  onlyFirstN?: number;
  /** true = anteprima (non crea nulla); false = crea davvero. */
  dryRun: boolean;
  ficCompanyId?: number | null;
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string })?.detail ?? "Errore imprevisto");
  }
  return res.json() as Promise<T>;
}

export async function duplicatePreviousMonthInvoicesApi(
  params: DuplicateInvoicesParams,
): Promise<DuplicateInvoicesResult> {
  const res = await authFetch(`${BASE}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fic_company_id: params.ficCompanyId ?? null,
      source_year: params.sourceYear ?? null,
      source_month: params.sourceMonth ?? null,
      due_date: params.dueDate ?? null,
      document_date: params.documentDate ?? null,
      exclude_numbers: params.excludeNumbers ?? [],
      only_first_n: params.onlyFirstN ?? 0,
      dry_run: params.dryRun,
    }),
  });
  return jsonOrThrow(res);
}
