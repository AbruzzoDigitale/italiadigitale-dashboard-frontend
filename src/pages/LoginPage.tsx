import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
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
      await login({ username: username.trim(), password });
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
        {/* Logo SVG */}
        <div className="flex justify-center mb-6">
          <svg
            viewBox="0 0 100 100"
            aria-label="Italia Digitale"
            className="w-16 h-16"
          >
            <rect
              x="2" y="2" width="96" height="96" rx="14"
              fill="none" stroke="white" strokeWidth="3"
              strokeDasharray="4 4" opacity="0.4"
            />
            <text
              x="50" y="62"
              textAnchor="middle"
              fontFamily="Space Grotesk, sans-serif"
              fontWeight="700"
              fontSize="38"
              fill="white"
            >
              ID
            </text>
          </svg>
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
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setFieldError(null); }}
              placeholder="••••••••"
              autoComplete="current-password"
              required
              className="w-full px-3.5 py-2.5 rounded-md text-[13px] font-body text-white placeholder:text-[#6b6b6b] border border-[#2e2e2e] outline-none transition-colors duration-150 focus:border-white"
              style={{ background: "#1a1a1a" }}
            />
          </div>

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
