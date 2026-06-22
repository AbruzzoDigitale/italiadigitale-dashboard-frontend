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
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
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
