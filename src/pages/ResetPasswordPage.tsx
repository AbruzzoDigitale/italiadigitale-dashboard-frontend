import React, { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Icon } from "../components/ui/Icon";
import { resetPasswordApi } from "../api/auth";

const inputCls =
  "w-full px-3.5 py-2.5 rounded-md text-[13px] font-body text-white placeholder:text-[#6b6b6b] border border-[#2e2e2e] outline-none transition-colors duration-150 focus:border-white";

/** Pagina raggiunta dal link nell'email di recupero (?token=...). */
export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get("token") ?? "", [searchParams]);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("La nuova password deve avere almeno 8 caratteri.");
      return;
    }
    if (password !== confirm) {
      setError("Le due password non coincidono.");
      return;
    }
    setIsLoading(true);
    try {
      await resetPasswordApi(token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossibile reimpostare la password");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center overflow-y-auto" style={{ background: "#0a0a0a" }}>
      <div className="w-full max-w-[380px] px-4 py-8 animate-fadeIn">
        <div className="flex justify-center mb-6">
          <img src="/logo-symbol-white.png" alt="Italia Digitale" className="h-16 w-auto object-contain" />
        </div>

        <h1
          className="text-center font-display font-bold uppercase tracking-tight text-white mb-1.5"
          style={{ fontSize: "32px" }}
        >
          ITALIA DIGITALE
        </h1>
        <p className="text-center font-body text-[13px] text-[#8a8a8a] mb-8">Nuova password</p>

        {!token ? (
          <div className="flex flex-col items-center gap-4 text-center">
            <p className="font-body text-[13px] text-[#c9c9c9]">
              Link non valido: manca il codice di verifica. Richiedi un nuovo recupero password dalla
              pagina di accesso.
            </p>
            <Link to="/login" className="font-body text-[12.5px] text-[#8a8a8a] underline underline-offset-2 hover:text-white">
              Vai al login
            </Link>
          </div>
        ) : done ? (
          <div className="flex flex-col items-center gap-4 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full border border-[#2e2e2e] text-success">
              <Icon name="check-circle" className="h-6 w-6" />
            </span>
            <p className="font-body text-[13px] text-[#c9c9c9]">
              Password reimpostata correttamente: ora puoi accedere con la nuova password.
            </p>
            <Link
              to="/login"
              className="mt-1 w-full inline-flex items-center justify-center gap-2 font-body font-bold uppercase tracking-wide rounded-pill transition-all duration-150 hover:-translate-y-px hover:shadow-2 active:scale-95"
              style={{ background: "#ffffff", color: "#0a0a0a", padding: "14px 26px", fontSize: "15px" }}
            >
              Vai al login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5 text-left">
              <label className="text-[11px] font-bold uppercase tracking-wider text-[#8a8a8a] font-body">
                Nuova password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(null); }}
                  placeholder="Minimo 8 caratteri"
                  autoComplete="new-password"
                  autoFocus
                  required
                  className="w-full pl-3.5 pr-11 py-2.5 rounded-md text-[13px] font-body text-white placeholder:text-[#6b6b6b] border border-[#2e2e2e] outline-none transition-colors duration-150 focus:border-white"
                  style={{ background: "#1a1a1a" }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  aria-label={showPassword ? "Nascondi password" : "Mostra password"}
                  className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-[#8a8a8a] transition-colors hover:text-white"
                >
                  <Icon name={showPassword ? "eye-off" : "eye"} className="h-[17px] w-[17px]" />
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5 text-left">
              <label className="text-[11px] font-bold uppercase tracking-wider text-[#8a8a8a] font-body">
                Conferma password
              </label>
              <input
                type={showPassword ? "text" : "password"}
                value={confirm}
                onChange={(e) => { setConfirm(e.target.value); setError(null); }}
                placeholder="Ripeti la nuova password"
                autoComplete="new-password"
                required
                className={inputCls}
                style={{ background: "#1a1a1a" }}
              />
            </div>

            {error && (
              <p role="alert" className="text-[13px] text-danger text-center py-1">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="mt-2 w-full inline-flex items-center justify-center gap-2 font-body font-bold uppercase tracking-wide rounded-pill transition-all duration-150 hover:-translate-y-px hover:shadow-2 active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
              style={{ background: "#ffffff", color: "#0a0a0a", padding: "14px 26px", fontSize: "15px" }}
            >
              {isLoading ? (
                <>
                  <span className="inline-block w-4 h-4 rounded-full border-2 border-[#0a0a0a] border-r-transparent animate-spin" />
                  Salvataggio…
                </>
              ) : (
                "Imposta nuova password"
              )}
            </button>

            <Link
              to="/login"
              className="text-center font-body text-[12.5px] text-[#8a8a8a] underline underline-offset-2 transition-colors hover:text-white"
            >
              Torna al login
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
