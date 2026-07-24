import { authFetch, API_BASE } from "./auth";

// ─────────────────────────────────────────────────────────────────────────────
// Account email di INVIO per utente/organizzazione.
//   provider "generic" → SMTP (invio) + IMAP/POP3 (ricezione) via password
//   provider "google"  → app-password (SMTP) oppure OAuth2 ("Connetti con Google")
// Le credenziali NON tornano mai in chiaro: la risposta espone solo flag has_*.
// Vedi app/api/v1/endpoints/email_accounts.py sul backend.
// ─────────────────────────────────────────────────────────────────────────────

const BASE = `${API_BASE}/api/v1/email-accounts`;

export type EmailProvider = "google" | "generic";
export type EmailAuthMethod = "oauth2" | "app_password" | "password";
export type EmailSecurity = "ssl" | "starttls" | "none";
export type IncomingProtocol = "imap" | "pop3";

export interface EmailAccount {
  id: number;
  company_id: number;
  provider: EmailProvider;
  auth_method: EmailAuthMethod;
  email_address: string;
  display_name: string | null;
  is_default: boolean;
  is_active: boolean;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_security: EmailSecurity | null;
  smtp_username: string | null;
  has_smtp_password: boolean;
  incoming_protocol: IncomingProtocol | null;
  incoming_host: string | null;
  incoming_port: number | null;
  incoming_security: EmailSecurity | null;
  incoming_username: string | null;
  has_incoming_password: boolean;
  oauth_email: string | null;
  has_oauth: boolean;
  oauth_token_expiry: string | null;
  oauth_scopes: string | null;
  verified_at: string | null;
  last_test_ok: boolean | null;
  last_test_error: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface EmailAccountCreate {
  provider: EmailProvider;
  auth_method: Exclude<EmailAuthMethod, "oauth2">;
  email_address: string;
  display_name?: string | null;
  is_default?: boolean;
  is_active?: boolean;
  smtp_host?: string | null;
  smtp_port?: number | null;
  smtp_security?: EmailSecurity | null;
  smtp_username?: string | null;
  smtp_password?: string | null;
  incoming_protocol?: IncomingProtocol | null;
  incoming_host?: string | null;
  incoming_port?: number | null;
  incoming_security?: EmailSecurity | null;
  incoming_username?: string | null;
  incoming_password?: string | null;
}

export type EmailAccountUpdate = Partial<Omit<EmailAccountCreate, "provider" | "auth_method" | "email_address">>;

export interface EmailAccountTestResult {
  ok: boolean;
  detail: string;
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string })?.detail ?? "Errore imprevisto");
  }
  return res.json() as Promise<T>;
}

export async function listEmailAccountsApi(companyId?: number): Promise<EmailAccount[]> {
  const suffix = companyId != null ? `?company_id=${companyId}` : "";
  return jsonOrThrow(await authFetch(`${BASE}${suffix}`));
}

export async function createEmailAccountApi(companyId: number, body: EmailAccountCreate): Promise<EmailAccount> {
  const res = await authFetch(`${BASE}?company_id=${companyId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return jsonOrThrow(res);
}

export async function updateEmailAccountApi(id: number, body: EmailAccountUpdate): Promise<EmailAccount> {
  const res = await authFetch(`${BASE}/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return jsonOrThrow(res);
}

export async function deleteEmailAccountApi(id: number): Promise<void> {
  const res = await authFetch(`${BASE}/${id}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string })?.detail ?? "Impossibile eliminare l'account");
  }
}

export async function setDefaultEmailAccountApi(id: number): Promise<EmailAccount> {
  return jsonOrThrow(await authFetch(`${BASE}/${id}/set-default`, { method: "POST" }));
}

export async function testEmailAccountApi(id: number): Promise<EmailAccountTestResult> {
  return jsonOrThrow(await authFetch(`${BASE}/${id}/test`, { method: "POST" }));
}

/** Invia un'email di prova all'indirizzo indicato usando questo mittente. */
export async function sendTestEmailApi(id: number, to: string): Promise<EmailAccountTestResult> {
  return jsonOrThrow(await authFetch(`${BASE}/${id}/send-test`, { method: "POST", body: JSON.stringify({ to }) }));
}

/** Ritorna l'URL di consenso Google da aprire; al ritorno il backend reindirizza a `returnUrl`. */
export async function googleAuthorizeApi(companyId: number, returnUrl: string): Promise<{ authorize_url: string }> {
  const qs = `?company_id=${companyId}&return_url=${encodeURIComponent(returnUrl)}`;
  return jsonOrThrow(await authFetch(`${BASE}/google/authorize${qs}`));
}
