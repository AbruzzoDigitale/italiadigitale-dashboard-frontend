const API_BASE = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8001";

export { API_BASE };

type UnauthorizedHandler = () => void;
let _unauthorizedHandler: UnauthorizedHandler | null = null;
let _unauthorizedFired = false;

export function registerUnauthorizedHandler(handler: UnauthorizedHandler) {
  _unauthorizedHandler = handler;
  _unauthorizedFired = false;
}

export function resetUnauthorizedFlag() {
  _unauthorizedFired = false;
}

export async function authFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = localStorage.getItem("id_token");
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers as Record<string, string> | undefined),
    },
  });
  if (res.status === 401 && !_unauthorizedFired) {
    _unauthorizedFired = true;
    _unauthorizedHandler?.();
  }
  return res;
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface LoginPayload {
  username: string;
  password: string;
  /** "Ricordami per 30 giorni": il backend emette un token a lunga scadenza. */
  remember?: boolean;
}

/** Profilo utente completo — identico al payload di /users/me e /auth/login */
export type AccessLevel = "admin" | "project_manager" | "operator";

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  full_name: string | null;
  is_admin: boolean;
  /** "admin" | "project_manager" | "operator" (is_admin resta sincronizzato: true ⇔ "admin") */
  access_level?: AccessLevel;
  is_active: boolean;
  company_id: number | null;
  company_ids: number[] | null;
  role_ids: number[] | null;
  work_area_ids: number[] | null;
  assigned_client_ids?: number[] | null;
  company: { id: number; name: string; slug: string } | null;
  phone: string | null;
  avatar_url: string | null;
  role_label: string | null;
  signature: string | null;
  signature_image_url: string | null;
  operator_permissions: string[] | null;
  /** Se true, lo scambio task viene applicato senza warning di conferma. */
  swap_confirmation_disabled?: boolean;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  /** Durata della sessione in secondi (3 ore, oppure 30 giorni con "Ricordami"). */
  expires_in: number;
  user: AuthUser;
}

// ── API calls ────────────────────────────────────────────────────────────────

export async function loginApi(payload: LoginPayload): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail ?? "Credenziali non valide");
  }
  return res.json();
}

export async function getMeApi(): Promise<AuthUser> {
  const res = await authFetch(`${API_BASE}/api/v1/users/me`);
  if (!res.ok) throw new Error("Impossibile recuperare il profilo");
  return res.json();
}

// ── Password: cambio e recupero ──────────────────────────────────────────────

async function jsonOrThrow<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string })?.detail ?? fallback);
  }
  return res.json() as Promise<T>;
}

export interface OkResponse {
  ok: boolean;
  detail: string | null;
}

export async function changePasswordApi(currentPassword: string, newPassword: string): Promise<OkResponse> {
  const res = await authFetch(`${API_BASE}/api/v1/auth/change-password`, {
    method: "POST",
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
  return jsonOrThrow(res, "Impossibile cambiare la password");
}

export async function forgotPasswordApi(email: string): Promise<OkResponse> {
  const res = await fetch(`${API_BASE}/api/v1/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  return jsonOrThrow(res, "Impossibile richiedere il reset");
}

export async function resetPasswordApi(token: string, newPassword: string): Promise<OkResponse> {
  const res = await fetch(`${API_BASE}/api/v1/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, new_password: newPassword }),
  });
  return jsonOrThrow(res, "Impossibile reimpostare la password");
}

// ── Metodi di accesso alternativi (Google, passkey) ──────────────────────────

export interface LoginOptions {
  google_client_id: string | null;
  passkeys: boolean;
}

export async function loginOptionsApi(): Promise<LoginOptions> {
  const res = await fetch(`${API_BASE}/api/v1/auth/login-options`);
  return jsonOrThrow(res, "Impossibile leggere i metodi di accesso");
}

export async function googleLoginApi(credential: string, remember: boolean): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE}/api/v1/auth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credential, remember }),
  });
  return jsonOrThrow(res, "Accesso con Google non riuscito");
}

export interface PasskeyInfo {
  id: number;
  label: string | null;
  created_at: string | null;
  last_used_at: string | null;
}

export interface PasskeyOptionsResponse {
  options: Record<string, unknown>;
  challenge_token: string;
}

export async function passkeyRegisterOptionsApi(): Promise<PasskeyOptionsResponse> {
  const res = await authFetch(`${API_BASE}/api/v1/auth/passkeys/register-options`, { method: "POST" });
  return jsonOrThrow(res, "Impossibile avviare la registrazione della passkey");
}

export async function passkeyRegisterApi(
  challengeToken: string,
  credential: Record<string, unknown>,
  label?: string
): Promise<PasskeyInfo> {
  const res = await authFetch(`${API_BASE}/api/v1/auth/passkeys/register`, {
    method: "POST",
    body: JSON.stringify({ challenge_token: challengeToken, credential, label: label ?? null }),
  });
  return jsonOrThrow(res, "Registrazione passkey non riuscita");
}

export async function listPasskeysApi(): Promise<PasskeyInfo[]> {
  const res = await authFetch(`${API_BASE}/api/v1/auth/passkeys`);
  return jsonOrThrow(res, "Impossibile leggere le passkey");
}

export async function deletePasskeyApi(id: number): Promise<void> {
  const res = await authFetch(`${API_BASE}/api/v1/auth/passkeys/${id}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string })?.detail ?? "Impossibile eliminare la passkey");
  }
}

export async function passkeyLoginOptionsApi(): Promise<PasskeyOptionsResponse> {
  const res = await fetch(`${API_BASE}/api/v1/auth/passkeys/login-options`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  return jsonOrThrow(res, "Impossibile avviare l'accesso con passkey");
}

export async function passkeyLoginApi(
  challengeToken: string,
  credential: Record<string, unknown>,
  remember: boolean
): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE}/api/v1/auth/passkeys/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challenge_token: challengeToken, credential, remember }),
  });
  return jsonOrThrow(res, "Accesso con passkey non riuscito");
}
