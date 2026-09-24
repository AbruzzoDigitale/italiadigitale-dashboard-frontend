import { authFetch, API_BASE } from "./auth";

// ─────────────────────────────────────────────────────────────────────────────
// Ponte Stripe → Fatture in Cloud → SDI.
//
// Le fatture qui non si creano: nascono dal webhook Stripe raccolto dal
// servizio `italiadigitale-stripe-sdi`. Da questa schermata si consulta
// l'esito e si recuperano i casi rimasti indietro.
// ─────────────────────────────────────────────────────────────────────────────

/** Stati della pipeline, allineati a `app/models/stripe_sdi_invoice.py`. */
export type StripeSdiStatus =
  | "ricevuto"
  | "ignorato"
  | "cliente_non_trovato"
  | "bozza_creata"
  | "inviata_sdi"
  | "scartata_sdi"
  | "errore";

export interface StripeSdiInvoice {
  id: number;
  company_id: number;
  stripe_event_id: string;
  stripe_event_type: string | null;
  stripe_invoice_id: string;
  /** L'id della transazione Stripe: quello che inizia per `pi_`. */
  stripe_payment_intent_id: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  customer_email: string | null;
  customer_name: string | null;
  amount_total: string | null;
  currency: string | null;
  paid_at: string | null;
  client_id: number | null;
  client_name: string | null;
  fic_entity_id: number | null;
  fic_document_id: number | null;
  fic_number: string | null;
  /** Stato della fattura elettronica secondo Fatture in Cloud. */
  ei_status: string | null;
  status: StripeSdiStatus;
  blocking_reasons: string[] | null;
  error_message: string | null;
  attempts: number;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface StripeSdiInvoiceDetail extends StripeSdiInvoice {
  payload_snapshot: Record<string, unknown> | null;
}

export interface StripeSdiList {
  items: StripeSdiInvoice[];
  total: number;
  page: number;
  per_page: number;
}

export interface StripeSdiSummary {
  per_stato: Record<string, number>;
  totale_fatturato: string;
  totale_bloccato: string;
  valuta: string;
}

export interface StripeSdiConfig {
  configurato: boolean;
  stripe_api_key_presente: boolean;
  stripe_webhook_secret_presente: boolean;
  fic_token_presente: boolean;
  api_version: string;
  auto_send_sdi: boolean;
  prices_include_vat: boolean;
  fic_vat_id: number | null;
  fic_payment_account_id: number | null;
  fic_payment_method_id: number | null;
  ei_payment_method: string | null;
}

function parseError(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const detail = (body as { detail?: unknown }).detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  return fallback;
}

async function chiedi<T>(url: string, init: RequestInit | undefined, fallback: string): Promise<T> {
  const res = await authFetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseError(body, fallback));
  }
  return res.json();
}

export interface StripeSdiListParams {
  stato?: StripeSdiStatus;
  dal?: string;
  al?: string;
  q?: string;
  page?: number;
  per_page?: number;
}

export async function listStripeSdiInvoicesApi(
  params: StripeSdiListParams = {},
): Promise<StripeSdiList> {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([chiave, valore]) => {
    if (valore !== undefined && valore !== null && `${valore}` !== "") {
      qs.set(chiave, `${valore}`);
    }
  });
  const coda = qs.toString() ? `?${qs.toString()}` : "";
  return chiedi(
    `${API_BASE}/api/v1/stripe-sdi/invoices${coda}`,
    undefined,
    "Errore nel caricamento delle fatture Stripe",
  );
}

export async function getStripeSdiInvoiceApi(id: number): Promise<StripeSdiInvoiceDetail> {
  return chiedi(
    `${API_BASE}/api/v1/stripe-sdi/invoices/${id}`,
    undefined,
    "Errore nel caricamento del dettaglio",
  );
}

export async function getStripeSdiSummaryApi(): Promise<StripeSdiSummary> {
  return chiedi(
    `${API_BASE}/api/v1/stripe-sdi/summary`,
    undefined,
    "Errore nel caricamento del riepilogo",
  );
}

export async function getStripeSdiConfigApi(): Promise<StripeSdiConfig> {
  return chiedi(
    `${API_BASE}/api/v1/stripe-sdi/config`,
    undefined,
    "Errore nel caricamento della configurazione",
  );
}

/** Rilancia l'intera elaborazione (solo se non esiste ancora una fattura su FIC). */
export async function reprocessStripeSdiApi(id: number): Promise<StripeSdiInvoiceDetail> {
  return chiedi(
    `${API_BASE}/api/v1/stripe-sdi/invoices/${id}/reprocess`,
    { method: "POST" },
    "Rielaborazione non riuscita",
  );
}

/** Trasmette allo SDI una bozza già creata. Passa comunque dalla verifica XML. */
export async function sendStripeSdiApi(id: number): Promise<StripeSdiInvoiceDetail> {
  return chiedi(
    `${API_BASE}/api/v1/stripe-sdi/invoices/${id}/send`,
    { method: "POST" },
    "Invio allo SDI non riuscito",
  );
}

/** Etichette e colore di ogni stato: definite qui una volta sola. */
export const STRIPE_SDI_STATI: Record<
  StripeSdiStatus,
  { label: string; variant: "success" | "warning" | "danger" | "info" | "default" }
> = {
  ricevuto: { label: "In corso", variant: "info" },
  ignorato: { label: "Non fatturabile", variant: "default" },
  cliente_non_trovato: { label: "Cliente mancante", variant: "warning" },
  bozza_creata: { label: "Bozza da verificare", variant: "warning" },
  inviata_sdi: { label: "Inviata allo SDI", variant: "success" },
  scartata_sdi: { label: "Scartata dallo SDI", variant: "danger" },
  errore: { label: "Errore", variant: "danger" },
};
