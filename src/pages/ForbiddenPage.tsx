import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { useAuth } from "../hooks/useAuth";
import { getFallbackRoute } from "../utils/access";

export function ForbiddenPage() {
  const navigate = useNavigate();
  const { permissions } = useAuth();

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6 py-12">
      <div className="max-w-lg w-full rounded-2xl border border-line dark:border-[#2a2a2e] bg-paper dark:bg-[#131316] p-8 text-center shadow-2">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-danger/10 text-danger">
          <Icon name="shield" className="h-7 w-7" />
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted dark:text-[#9999a0]">
          Accesso non consentito
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-ink dark:text-[#f4f4f7]">
          Non hai i permessi per questa sezione
        </h1>
        <p className="mt-3 text-sm text-muted dark:text-[#9999a0] leading-relaxed">
          La tua utenza non è autorizzata ad aprire questa pagina. Torna a una sezione disponibile oppure contatta un amministratore.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button onClick={() => navigate(getFallbackRoute(permissions), { replace: true })}>
            Torna indietro
          </Button>
          <Button variant="ghost" onClick={() => navigate("/profile", { replace: true })}>
            Vai al profilo
          </Button>
        </div>
      </div>
    </div>
  );
}
