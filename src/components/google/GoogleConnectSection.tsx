import { useEffect, useRef, useState, type ComponentProps } from "react";
import {
  getGoogleStatusApi,
  googleAuthorizeApi,
  disconnectGoogleApi,
  type GoogleScope,
  type GoogleStatus,
} from "../../api/googleServices";
import { useToast } from "../../context/ToastContext";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Spinner } from "../ui/Spinner";
import "./google-connect.css";

type IconName = ComponentProps<typeof Icon>["name"];
type SvcType = "drive" | "calendar" | "docs" | "sheets" | "gmail";

/** Logo Google "G" (4 colori), inline per non dipendere da asset esterni. */
function GoogleG({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/** Icone reali dei prodotti Google (SVG colorati inline, self-contained). */
function GoogleGlyph({ type }: { type: SvcType }) {
  switch (type) {
    case "drive":
      return (
        <svg viewBox="0 0 48 48" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
          <path fill="#FFC107" d="M17 6L31 6L45 30L31 30Z" />
          <path fill="#1976D2" d="M9.875 42L16.938 30L45 30L37.938 42Z" />
          <path fill="#4CAF50" d="M3 30.125L9.875 42L24 18L17 6Z" />
        </svg>
      );
    case "calendar":
      return (
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <rect x="8" y="11" width="32" height="29" rx="4" fill="#fff" stroke="#E0E0E0" strokeWidth="1.5" />
          <path d="M8 15a4 4 0 0 1 4-4h24a4 4 0 0 1 4 4v3H8z" fill="#4285F4" />
          <rect x="15" y="8" width="3" height="7" rx="1.5" fill="#F4B400" />
          <rect x="30" y="8" width="3" height="7" rx="1.5" fill="#0F9D58" />
          <text x="24" y="34" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="13" fontWeight="700" fill="#4285F4">31</text>
        </svg>
      );
    case "docs":
      return (
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#4285F4" d="M13 4h14l10 10v27a3 3 0 0 1-3 3H13a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3z" />
          <path fill="#A1C2FA" d="M27 4l10 10H27z" />
          <rect x="16" y="21" width="16" height="2.2" rx="1.1" fill="#fff" />
          <rect x="16" y="26" width="16" height="2.2" rx="1.1" fill="#fff" />
          <rect x="16" y="31" width="11" height="2.2" rx="1.1" fill="#fff" />
        </svg>
      );
    case "sheets":
      return (
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#0F9D58" d="M13 4h14l10 10v27a3 3 0 0 1-3 3H13a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3z" />
          <path fill="#87CEAC" d="M27 4l10 10H27z" />
          <path fill="#fff" d="M16 21h16v13H16z" />
          <path fill="#0F9D58" d="M16 24.25h16v1.2H16zM16 28.4h16v1.2H16zM21.3 21h1.2v13h-1.2zM26.6 21h1.2v13h-1.2z" />
        </svg>
      );
    case "gmail":
      return (
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#4CAF50" d="M45 16.2l-5 2.75-5 4.75V40h7a3 3 0 0 0 3-3z" />
          <path fill="#1E88E5" d="M3 16.2l3.614 1.71L13 23.7V40H6a3 3 0 0 1-3-3z" />
          <path fill="#E53935" d="M35 11.2L24 19.45 13 11.2 12 17l1 6.7 11 8.25 11-8.25 1-6.7z" />
          <path fill="#C62828" d="M3 12.298V16.2l10 7.5V11.2L9.876 8.859A3.06 3.06 0 0 0 7.298 8 4.3 4.3 0 0 0 3 12.298z" />
          <path fill="#FBC02D" d="M45 12.298V16.2l-10 7.5V11.2l3.124-2.341A3.06 3.06 0 0 1 40.702 8 4.3 4.3 0 0 1 45 12.298z" />
        </svg>
      );
    default:
      return null;
  }
}

const SERVICES: { type: SvcType; generic: IconName; label: string }[] = [
  { type: "drive", generic: "drive", label: "Drive" },
  { type: "calendar", generic: "calendar", label: "Calendar" },
  { type: "docs", generic: "document-text", label: "Documenti" },
  { type: "sheets", generic: "grid-compact", label: "Fogli" },
  { type: "gmail", generic: "mail", label: "Gmail" },
];

/** Icona singola (sempre visibile): reale colorata se collegato, altrimenti generica.
 * L'animazione flip-in riparte perché il parent la rimonta (key) ad ogni ingresso nel
 * viewport; `animate` attiva il keyframe, `delayMs` crea la cascata. */
function ServiceIcon({ type, generic, connected, animate, delayMs }: {
  type: SvcType;
  generic: IconName;
  connected: boolean;
  animate: boolean;
  delayMs: number;
}) {
  return (
    <span
      className={`g-svc-ico ${animate ? "is-anim" : ""}`}
      style={animate ? { animationDelay: `${delayMs}ms` } : undefined}
      aria-hidden="true"
    >
      {connected ? <GoogleGlyph type={type} /> : <Icon name={generic} className="h-4 w-4" />}
    </span>
  );
}

/**
 * Collegamento di un account Google (OAuth) per Drive, Calendar, Docs e Fogli.
 * Il client OAuth (client_id/secret) è nel DB (company_settings, google_oauth.*),
 * lo stesso di Gmail; qui gli scope sono ampi (lettura/scrittura).
 *
 * `scope="mine"` (default, nel profilo) collega l'account della persona.
 * `scope="company"` (impostazioni brand dell'azienda, solo admin) collega
 * l'account dell'AZIENDA: è quello con cui girano le automazioni — foglio dei
 * rimborsi e archivio Drive — anche quando nessuno è collegato alla dashboard.
 */
export function GoogleConnectSection({
  scope = "mine",
  companyId = null,
}: {
  scope?: GoogleScope;
  companyId?: number | null;
} = {}) {
  const isCompany = scope === "company";
  const toast = useToast();
  const [status, setStatus] = useState<GoogleStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  // Ogni ingresso nel viewport incrementa playKey → le icone si rimontano e il flip riparte.
  const [playKey, setPlayKey] = useState(0);
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    let inView = false;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !inView) {
          inView = true;
          setPlayKey((k) => k + 1);
        } else if (!entry.isIntersecting) {
          inView = false;
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const reload = () => {
    getGoogleStatusApi(scope, companyId)
      .then(setStatus)
      .catch(() => setStatus(null))
      .finally(() => setLoading(false));
  };

  // Dipende da scope/companyId: la stessa sezione mostra l'account personale nel
  // profilo e quello aziendale nelle impostazioni dell'azienda.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, [scope, companyId]);

  // Ritorno dal flusso OAuth (?google_linked / ?google_error).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("google_linked")) toast.success("Account Google collegato");
    else if (params.has("google_error")) toast.error(params.get("google_error") || "Collegamento Google non riuscito");
    else return;
    params.delete("google_linked");
    params.delete("google_error");
    const url = window.location.pathname + (params.toString() ? `?${params}` : "");
    window.history.replaceState({}, "", url);
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onConnect = async () => {
    setBusy(true);
    try {
      const { authorize_url } = await googleAuthorizeApi(window.location.href, scope);
      window.location.href = authorize_url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Google non disponibile");
      setBusy(false);
    }
  };

  const onDisconnect = async () => {
    setBusy(true);
    try {
      await disconnectGoogleApi(scope, companyId);
      toast.success(isCompany ? "Account Google aziendale disconnesso" : "Account Google disconnesso");
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore");
    } finally {
      setBusy(false);
    }
  };

  const connected = !!status?.connected;

  return (
    <div className="bg-paper dark:bg-[#131316] rounded-lg border border-line dark:border-[#2a2a2e] p-6">
      <div className="mb-1 flex items-center gap-2">
        <GoogleG className="h-5 w-5" />
        <h2 className="font-display font-bold tracking-tight text-ink dark:text-[#f4f4f7]" style={{ fontSize: "17px" }}>
          {isCompany ? "Google dell'azienda" : "Google"}
        </h2>
      </div>
      <p className="font-body text-[13px] text-muted dark:text-[#9999a0] mb-4">
        {isCompany
          ? "L'account con cui il gestionale scrive per conto dell'azienda: foglio dei rimborsi trasferte e archivio su Drive. Le sincronizzazioni girano da sole, anche quando nessuno è collegato alla dashboard, quindi qui va un account aziendale e non quello personale di chi accede."
          : "Collega il tuo account Google per usare Drive, Calendar, Documenti, Fogli e Gmail direttamente dal gestionale."}
      </p>

      <div ref={rowRef} className="mb-5 flex flex-wrap gap-2">
        {SERVICES.map((s, i) => (
          <span
            key={s.label}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold transition-colors ${
              connected
                ? "border-line/70 text-ink dark:text-paper"
                : "border-line dark:border-line-dark text-muted dark:text-muted-dark"
            }`}
          >
            <ServiceIcon
              key={`${s.type}-${playKey}`}
              type={s.type}
              generic={s.generic}
              connected={connected}
              animate={playKey > 0}
              delayMs={220 + i * 130}
            />
            {s.label}
          </span>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-4"><Spinner /></div>
      ) : status?.configured === false ? (
        <p className="text-sm text-muted dark:text-muted-dark">
          Integrazione Google non ancora configurata sul server. Contatta un amministratore.
        </p>
      ) : connected ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line dark:border-line-dark px-3 py-2.5">
          <span className="flex items-center gap-2 text-sm text-ink dark:text-paper">
            <Icon name="check-circle" className="h-4 w-4 text-success" />
            Collegato{status?.email ? ` come ${status.email}` : status?.display_name ? ` come ${status.display_name}` : ""}
          </span>
          <Button size="sm" variant="ghost" onClick={onDisconnect} loading={busy}>Disconnetti</Button>
        </div>
      ) : (
        <Button size="sm" variant="secondary" onClick={onConnect} loading={busy}>
          <GoogleG className="h-4 w-4" /> {isCompany ? "Collega l'account aziendale" : "Connetti con Google"}
        </Button>
      )}
    </div>
  );
}
