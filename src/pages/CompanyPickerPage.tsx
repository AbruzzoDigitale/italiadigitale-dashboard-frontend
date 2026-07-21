import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../context/ToastContext";

type CompanyCard = {
  id: number;
  name: string;
  logo_dark?: string | null;
  logo_light?: string | null;
  logo_horizontal_dark?: string | null;
  logo_horizontal_light?: string | null;
};

export function CompanyPickerPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { myCompanies, activeCompanyId, user, switchActiveCompany, logout } = useAuth();
  const [loadingCompanyId, setLoadingCompanyId] = useState<number | null>(null);

  const companies = useMemo<CompanyCard[]>(() => {
    if (myCompanies.length > 0) return myCompanies;
    if (activeCompanyId != null) {
      return [{
        id: activeCompanyId,
        name: `Company #${activeCompanyId}`,
        logo_dark: null,
        logo_light: null,
        logo_horizontal_dark: null,
        logo_horizontal_light: null,
      }];
    }
    return [];
  }, [activeCompanyId, myCompanies]);

  const getCompanyLogo = (company: CompanyCard) => {
    return (
      company.logo_horizontal_light ||
      company.logo_horizontal_dark ||
      company.logo_light ||
      company.logo_dark ||
      null
    );
  };

  const handleSelectCompany = async (companyId: number) => {
    setLoadingCompanyId(companyId);
    try {
      await switchActiveCompany(companyId);
      navigate({ pathname: "/", search: `?company_id=${companyId}` }, { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore selezione azienda");
    } finally {
      setLoadingCompanyId(null);
    }
  };

  return (
    <div className="h-dvh overflow-y-auto bg-[#090909] text-white px-6 py-10 flex items-center justify-center">
      <div className="w-full max-w-6xl">
        <div className="flex items-center justify-between gap-3 mb-8">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-white/60 font-body">Italia Digitale</p>
            <h1 className="mt-2 text-4xl md:text-5xl font-display font-bold tracking-tight">Seleziona azienda</h1>
            <p className="mt-3 text-sm text-white/60 font-body">
              Scegli il contesto con cui vuoi entrare in dashboard.
            </p>
          </div>
          <button
            type="button"
            onClick={logout}
            className="rounded-full border border-white/20 px-4 py-2 text-xs uppercase tracking-wider font-semibold text-white/80 hover:text-white hover:border-white/40 transition-colors"
          >
            Esci
          </button>
        </div>

        {companies.length === 0 ? (
          <div className="rounded-2xl border border-white/15 bg-white/[0.03] p-8">
            <p className="text-sm text-white/75">Nessuna azienda assegnata a questo account.</p>
            <p className="mt-2 text-xs text-white/55">Contatta un amministratore per l’assegnazione aziendale.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 place-items-center">
            {companies.map((company) => {
              const isLoading = loadingCompanyId === company.id;
              const logoUrl = getCompanyLogo(company);
              return (
                <button
                  key={company.id}
                  type="button"
                  onClick={() => void handleSelectCompany(company.id)}
                  disabled={isLoading}
                  className="group relative aspect-square w-full max-w-[240px] overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-br from-white/[0.07] to-white/[0.02] p-6 text-center transition-all hover:-translate-y-0.5 hover:border-white/35 hover:shadow-[0_12px_40px_rgba(0,0,0,.45)] disabled:opacity-60"
                >
                  <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-white/10 blur-2xl" />
                  <div className="relative h-full flex flex-col items-center justify-center">
                    {logoUrl ? (
                      <div className="h-16 w-40 max-w-full rounded-xl bg-white/10 border border-white/20 p-2 flex items-center justify-center">
                        <img
                          src={logoUrl}
                          alt={company.name}
                          className="max-h-full max-w-full object-contain"
                        />
                      </div>
                    ) : (
                      <div className="h-16 w-16 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center text-xl font-bold font-display">
                        {company.name.slice(0, 1).toUpperCase()}
                      </div>
                    )}

                    <h2 className="mt-4 text-lg font-semibold font-display line-clamp-2">{company.name}</h2>
                    <p className="mt-1 text-xs uppercase tracking-wider text-white/55">Company #{company.id}</p>
                    <p className="mt-4 text-sm text-white/80">
                      {isLoading ? "Apertura in corso..." : "Entra con questa azienda"}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <p className="mt-10 text-xs text-white/45">Account: {user?.username ?? "n/d"}</p>
      </div>
    </div>
  );
}
