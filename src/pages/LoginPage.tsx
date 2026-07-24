import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { Icon } from "../components/ui/Icon";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

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
      navigate("/choose-company", { replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Credenziali non valide";
      setFieldError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    /* Sfondo nero fisso — identico al .login-screen del prototipo */
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ background: "#0a0a0a" }}
    >
      {/* Box centrato — max-width 380px, padding 40px, testo centrato */}
      <div className="w-full max-w-[380px] px-4 animate-fadeIn">
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
          Accedi alla dashboard amministrativa
        </p>

        {/* Form */}
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
              className="w-full px-3.5 py-2.5 rounded-md text-[13px] font-body text-white placeholder:text-[#6b6b6b] border border-[#2e2e2e] outline-none transition-colors duration-150 focus:border-white"
              style={{ background: "#1a1a1a" }}
            />
          </div>

          {/* Campo password */}
          <div className="flex flex-col gap-1.5 text-left">
            <label className="text-[11px] font-bold uppercase tracking-wider text-[#8a8a8a] font-body">
              Password
            </label>
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

        {/* Tagline */}
        <p className="mt-6 text-center font-body text-[11px] text-[#8a8a8a]">
          Piattaforma di amministrazione — accesso riservato
        </p>
      </div>
    </div>
  );
}
