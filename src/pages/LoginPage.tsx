import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { Icon } from "../components/ui/Icon";
import {
  forgotPasswordApi,
  googleLoginApi,
  loginOptionsApi,
  passkeyLoginApi,
  passkeyLoginOptionsApi,
  type LoginOptions,
} from "../api/auth";
import { getPasskeyAssertion, passkeysSupported } from "../utils/webauthn";

const inputCls =
  "w-full px-3.5 py-2.5 rounded-md text-[13px] font-body text-white placeholder:text-[#6b6b6b] border border-[#2e2e2e] outline-none transition-colors duration-150 focus:border-white";

type ViewMode = "login" | "forgot" | "forgot-sent";

export function LoginPage() {
  const { login, loginWithToken } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // Destinazione richiesta prima del login (link condiviso): la si porta fino al
  // selettore azienda, che poi ci atterra invece di andare sulla home.
  const from = (location.state as { from?: string } | null)?.from;
  const afterLogin = () =>
    navigate("/choose-company", { replace: true, state: from ? { from } : undefined });

  const [mode, setMode] = useState<ViewMode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [loginOptions, setLoginOptions] = useState<LoginOptions | null>(null);

  const googleBtnRef = useRef<HTMLDivElement>(null);
  // Il callback di Google vive fuori dal ciclo di render: legge remember da un ref.
  const rememberRef = useRef(remember);
  rememberRef.current = remember;

  useEffect(() => {
    loginOptionsApi()
      .then(setLoginOptions)
      .catch(() => setLoginOptions({ google_client_id: null, passkeys: true }));
  }, []);

  // Pulsante "Accedi con Google" (Google Identity Services), solo se configurato.
  useEffect(() => {
    const clientId = loginOptions?.google_client_id;
    if (!clientId || mode !== "login") return;

    const init = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const g = (window as any).google;
      if (!g?.accounts?.id || !googleBtnRef.current) return;
      g.accounts.id.initialize({
        client_id: clientId,
        callback: async (resp: { credential: string }) => {
          setFieldError(null);
          setIsLoading(true);
          try {
            const r = await googleLoginApi(resp.credential, rememberRef.current);
            await loginWithToken(r.access_token);
            afterLogin();
          } catch (err) {
            setFieldError(err instanceof Error ? err.message : "Accesso con Google non riuscito");
          } finally {
            setIsLoading(false);
          }
        },
      });
      g.accounts.id.renderButton(googleBtnRef.current, {
        theme: "filled_black",
        size: "large",
        width: 340,
        text: "signin_with",
        logo_alignment: "center",
      });
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).google?.accounts?.id) {
      init();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = init;
    document.head.appendChild(script);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loginOptions?.google_client_id, mode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldError(null);
    if (!username.trim() || !password) {
      setFieldError("Inserisci username e password.");
      return;
    }
    setIsLoading(true);
    try {
      await login({ username: username.trim(), password, remember });
      afterLogin();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Credenziali non valide";
      setFieldError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasskey = async () => {
    setFieldError(null);
    setPasskeyLoading(true);
    try {
      const { options, challenge_token } = await passkeyLoginOptionsApi();
      const assertion = await getPasskeyAssertion(options);
      const r = await passkeyLoginApi(challenge_token, assertion, remember);
      await loginWithToken(r.access_token);
      afterLogin();
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setFieldError("Accesso con passkey annullato.");
      } else {
        setFieldError(err instanceof Error ? err.message : "Accesso con passkey non riuscito");
      }
    } finally {
      setPasskeyLoading(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = forgotEmail.trim();
    if (!email) {
      setFieldError("Inserisci la tua email.");
      return;
    }
    setFieldError(null);
    setIsLoading(true);
    try {
      await forgotPasswordApi(email);
      setMode("forgot-sent");
    } catch (err) {
      setFieldError(err instanceof Error ? err.message : "Richiesta non riuscita");
    } finally {
      setIsLoading(false);
    }
  };

  const openForgot = () => {
    setFieldError(null);
    // Se nel campo utente c'è già un'email, riusala.
    setForgotEmail(username.includes("@") ? username.trim() : "");
    setMode("forgot");
  };

  return (
    /* Sfondo nero fisso — identico al .login-screen del prototipo */
    <div
      className="fixed inset-0 flex items-center justify-center overflow-y-auto"
      style={{ background: "#0a0a0a" }}
    >
      {/* Box centrato — max-width 380px, padding 40px, testo centrato */}
      <div className="w-full max-w-[380px] px-4 py-8 animate-fadeIn">
        {/* Logo — pittogramma Italia Digitale (bianco su sfondo nero) */}
        <div className="flex justify-center mb-6">
          <img
            src="/logo-symbol-white.png"
            alt="Italia Digitale"
            className="h-16 w-auto object-contain"
          />
        </div>

        {/* Titolo — font-display, 32px, uppercase, bianco */}
        <h1
          className="text-center font-display font-bold uppercase tracking-tight text-white mb-1.5"
          style={{ fontSize: "32px" }}
        >
          ITALIA DIGITALE
        </h1>

        {/* Sottotitolo */}
        <p className="text-center font-body text-[13px] text-[#8a8a8a] mb-8">
          {mode === "login" ? "Accedi alla dashboard amministrativa" : "Recupero password"}
        </p>

        {mode === "forgot-sent" ? (
          <div className="flex flex-col items-center gap-4 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full border border-[#2e2e2e] text-white">
              <Icon name="mail" className="h-5 w-5" />
            </span>
            <p className="font-body text-[13px] leading-relaxed text-[#c9c9c9]">
              Se l'indirizzo <b className="text-white">{forgotEmail}</b> è registrato riceverai
              un'email con il link per reimpostare la password (valido 30 minuti).
            </p>
            <button
              type="button"
              onClick={() => setMode("login")}
              className="font-body text-[12.5px] text-[#8a8a8a] underline underline-offset-2 transition-colors hover:text-white"
            >
              Torna al login
            </button>
          </div>
        ) : mode === "forgot" ? (
          <form onSubmit={handleForgot} noValidate className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5 text-left">
              <label className="text-[11px] font-bold uppercase tracking-wider text-[#8a8a8a] font-body">
                Email dell'account
              </label>
              <input
                type="email"
                value={forgotEmail}
                onChange={(e) => { setForgotEmail(e.target.value); setFieldError(null); }}
                placeholder="nome@dominio.it"
                autoComplete="email"
                autoFocus
                required
                className={inputCls}
                style={{ background: "#1a1a1a" }}
              />
            </div>

            {fieldError && (
              <p role="alert" className="text-[13px] text-danger text-center py-1">
                {fieldError}
              </p>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="mt-1 w-full inline-flex items-center justify-center gap-2 font-body font-bold uppercase tracking-wide rounded-pill transition-all duration-150 hover:-translate-y-px hover:shadow-2 active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
              style={{ background: "#ffffff", color: "#0a0a0a", padding: "14px 26px", fontSize: "15px" }}
            >
              {isLoading ? (
                <>
                  <span className="inline-block w-4 h-4 rounded-full border-2 border-[#0a0a0a] border-r-transparent animate-spin" />
                  Invio in corso…
                </>
              ) : (
                "Invia link di recupero"
              )}
            </button>

            <button
              type="button"
              onClick={() => { setMode("login"); setFieldError(null); }}
              className="font-body text-[12.5px] text-[#8a8a8a] underline underline-offset-2 transition-colors hover:text-white"
            >
              Torna al login
            </button>
          </form>
        ) : (
          <>
            <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
              {/* Campo utente */}
              <div className="flex flex-col gap-1.5 text-left">
                <label className="text-[11px] font-bold uppercase tracking-wider text-[#8a8a8a] font-body">
                  Utente
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => { setUsername(e.target.value); setFieldError(null); }}
                  placeholder="nome utente"
                  autoComplete="username"
                  autoFocus
                  required
                  className={inputCls}
                  style={{ background: "#1a1a1a" }}
                />
              </div>

              {/* Campo password */}
              <div className="flex flex-col gap-1.5 text-left">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-[#8a8a8a] font-body">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={openForgot}
                    tabIndex={-1}
                    className="font-body text-[11px] text-[#8a8a8a] underline underline-offset-2 transition-colors hover:text-white"
                  >
                    Password dimenticata?
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setFieldError(null); }}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                    className="w-full pl-3.5 pr-11 py-2.5 rounded-md text-[13px] font-body text-white placeholder:text-[#6b6b6b] border border-[#2e2e2e] outline-none transition-colors duration-150 focus:border-white"
                    style={{ background: "#1a1a1a" }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    tabIndex={-1}
                    aria-label={showPassword ? "Nascondi password" : "Mostra password"}
                    title={showPassword ? "Nascondi password" : "Mostra password"}
                    className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-[#8a8a8a] transition-colors hover:text-white"
                  >
                    <Icon name={showPassword ? "eye-off" : "eye"} className="h-[17px] w-[17px]" />
                  </button>
                </div>
              </div>

              {/* Ricordami: il backend emette un token da 30 giorni invece che da 3 ore.
                  Checkbox disegnata a tema (quella nativa stonava sul fondo scuro). */}
              <label className="group flex cursor-pointer select-none items-center gap-2.5 text-left">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="peer sr-only"
                />
                <span
                  className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-all duration-150 peer-focus-visible:ring-2 peer-focus-visible:ring-white/40"
                  style={{
                    background: remember ? "#ffffff" : "#1a1a1a",
                    borderColor: remember ? "#ffffff" : "#2e2e2e",
                  }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#0a0a0a"
                    strokeWidth={3.4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-3 w-3 transition-all duration-150"
                    style={{ opacity: remember ? 1 : 0, transform: remember ? "scale(1)" : "scale(0.5)" }}
                  >
                    <path d="m4.5 12.5 5 5 10-11" />
                  </svg>
                </span>
                <span className="font-body text-[12.5px] text-[#8a8a8a] transition-colors group-hover:text-[#c9c9c9]">
                  Ricordami per 30 giorni
                </span>
              </label>

              {/* Errore */}
              {fieldError && (
                <p role="alert" className="text-[13px] text-danger text-center py-1">
                  {fieldError}
                </p>
              )}

              {/* Submit — .btn .btn--primary .btn--lg width 100%, sfondo bianco, testo nero */}
              <button
                type="submit"
                disabled={isLoading}
                className="mt-2 w-full inline-flex items-center justify-center gap-2 font-body font-bold uppercase tracking-wide rounded-pill transition-all duration-150 hover:-translate-y-px hover:shadow-2 active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
                style={{
                  background: "#ffffff",
                  color: "#0a0a0a",
                  padding: "14px 26px",
                  fontSize: "15px",
                }}
              >
                {isLoading ? (
                  <>
                    <span className="inline-block w-4 h-4 rounded-full border-2 border-[#0a0a0a] border-r-transparent animate-spin" />
                    Accesso in corso…
                  </>
                ) : (
                  "Accedi"
                )}
              </button>
            </form>

            {/* Metodi alternativi: passkey sempre (se il browser la supporta), Google se configurato */}
            {(passkeysSupported() || loginOptions?.google_client_id) && (
              <div className="mt-5 flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <span className="h-px flex-1 bg-[#2e2e2e]" />
                  <span className="font-body text-[11px] uppercase tracking-wider text-[#6b6b6b]">oppure</span>
                  <span className="h-px flex-1 bg-[#2e2e2e]" />
                </div>

                {passkeysSupported() && (
                  <button
                    type="button"
                    onClick={handlePasskey}
                    disabled={passkeyLoading}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-pill border border-[#2e2e2e] font-body text-[13px] font-semibold text-white transition-all duration-150 hover:border-white disabled:opacity-40"
                    style={{ background: "#1a1a1a", padding: "11px 22px" }}
                  >
                    {passkeyLoading ? (
                      <span className="inline-block w-4 h-4 rounded-full border-2 border-white border-r-transparent animate-spin" />
                    ) : (
                      <Icon name="key" className="h-4 w-4" />
                    )}
                    Accedi con passkey
                  </button>
                )}

                {loginOptions?.google_client_id && (
                  <div ref={googleBtnRef} className="flex justify-center" />
                )}
              </div>
            )}
          </>
        )}

        {/* Tagline */}
        <p className="mt-6 text-center font-body text-[11px] text-[#8a8a8a]">
          Piattaforma di amministrazione — accesso riservato
        </p>
      </div>
    </div>
  );
}
