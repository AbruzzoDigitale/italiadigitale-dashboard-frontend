import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { getCompanyBrandApi, type CompanyBrand } from "../api/companies";
import { useAuth } from "../hooks/useAuth";

interface BrandContextValue {
  brand: CompanyBrand | null;
  refetch: () => void;
}

const BrandContext = createContext<BrandContextValue>({ brand: null, refetch: () => {} });

function applyBrand(b: CompanyBrand) {
  document.documentElement.style.setProperty(
    "--brand-primary",
    b.primary_color ?? "#2b1342"
  );
  document.documentElement.style.setProperty(
    "--brand-bg",
    b.bg_color ?? "#0a0a0a"
  );
  document.documentElement.style.setProperty(
    "--brand-theme",
    b.theme_color ?? b.primary_color ?? "#2b1342"
  );
  if (b.app_name) document.title = b.app_name;
}

export function BrandProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [brand, setBrand] = useState<CompanyBrand | null>(null);

  const load = useCallback(async (companyId: number) => {
    try {
      const b = await getCompanyBrandApi(companyId);
      setBrand(b);
      applyBrand(b);
    } catch {
      // silent — default brand stays
    }
  }, []);

  useEffect(() => {
    if (user?.company_id) {
      load(user.company_id);
    } else {
      setBrand(null);
      document.documentElement.style.removeProperty("--brand-primary");
      document.documentElement.style.removeProperty("--brand-bg");
      document.documentElement.style.removeProperty("--brand-theme");
    }
  }, [user?.company_id, load]);

  const refetch = useCallback(() => {
    if (user?.company_id) load(user.company_id);
  }, [user?.company_id, load]);

  return (
    <BrandContext.Provider value={{ brand, refetch }}>
      {children}
    </BrandContext.Provider>
  );
}

export function useBrand() {
  return useContext(BrandContext);
}
