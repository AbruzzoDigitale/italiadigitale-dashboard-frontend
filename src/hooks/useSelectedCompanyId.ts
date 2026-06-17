import { useMemo } from "react";
import { useLocation, useSearchParams } from "react-router-dom";

interface SetSelectedCompanyOptions {
  replace?: boolean;
}

interface UseSelectedCompanyIdResult {
  selectedCompanyId: number | null;
  setSelectedCompanyId: (companyId: number | null, options?: SetSelectedCompanyOptions) => void;
}

export function useSelectedCompanyId(defaultCompanyId: number | null = null): UseSelectedCompanyIdResult {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const selectedCompanyId = useMemo(() => {
    const raw = searchParams.get("company_id");
    if (!raw) return defaultCompanyId;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return defaultCompanyId;

    // Global guard: block non-assigned company ids injected via URL.
    // Source of truth is /companies/me cached in localStorage by AuthContext.
    const cachedCompaniesRaw = localStorage.getItem("id_my_companies");
    if (!cachedCompaniesRaw) return parsed;

    try {
      const cachedCompanies = JSON.parse(cachedCompaniesRaw) as Array<{ id: number }>;
      const allowed = new Set(cachedCompanies.map((company) => company.id));
      if (allowed.size > 0 && !allowed.has(parsed)) {
        return defaultCompanyId;
      }
      return parsed;
    } catch {
      return parsed;
    }
  }, [defaultCompanyId, searchParams]);

  const setSelectedCompanyId = (companyId: number | null, options?: SetSelectedCompanyOptions) => {
    const next = new URLSearchParams(searchParams);
    if (companyId == null) next.delete("company_id");
    else next.set("company_id", String(companyId));
    setSearchParams(next, { replace: options?.replace ?? false, state: location.state });
  };

  return { selectedCompanyId, setSelectedCompanyId };
}
