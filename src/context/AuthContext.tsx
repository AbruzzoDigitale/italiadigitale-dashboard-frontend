import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  loginApi,
  getMeApi,
  registerUnauthorizedHandler,
  resetUnauthorizedFlag,
  type AuthUser,
  type LoginPayload,
} from "../api/auth";
import {
  getMyCompaniesApi,
  switchActiveCompanyApi,
  type Company,
} from "../api/companies";
import {
  getMePermissionsApi,
  type UserPermissions,
} from "../api/users";
import { startSilentRenew } from "../api/session";
import { useToast } from "./ToastContext";

interface AuthContextValue {
  user: AuthUser | null;
  activeCompanyId: number | null;
  assignedCompanyIds: number[];
  myCompanies: Company[];
  permissions: UserPermissions | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (payload: LoginPayload) => Promise<void>;
  refreshSession: () => Promise<void>;
  switchActiveCompany: (companyId: number) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const toast = useToast();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [myCompanies, setMyCompanies] = useState<Company[]>([]);
  const [activeCompanyId, setActiveCompanyId] = useState<number | null>(null);
  const [assignedCompanyIds, setAssignedCompanyIds] = useState<number[]>([]);
  const [permissions, setPermissions] = useState<UserPermissions | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const logoutRef = useRef<() => void>(() => undefined);

  const setSessionState = useCallback((nextUser: AuthUser | null, nextCompanies: Company[], nextPermissions: UserPermissions | null) => {
    setUser(nextUser);
    setMyCompanies(nextCompanies);
    setAssignedCompanyIds(nextUser?.company_ids ?? nextCompanies.map((company) => company.id));
    setPermissions(nextPermissions);
    const resolvedActive = nextUser?.company_id ?? nextCompanies[0]?.id ?? null;
    setActiveCompanyId(resolvedActive);

    if (nextUser) {
      localStorage.setItem("id_user", JSON.stringify(nextUser));
    } else {
      localStorage.removeItem("id_user");
    }

    localStorage.setItem("id_my_companies", JSON.stringify(nextCompanies));
    if (nextPermissions) {
      localStorage.setItem("id_user_permissions", JSON.stringify(nextPermissions));
    } else {
      localStorage.removeItem("id_user_permissions");
    }
    if (resolvedActive == null) {
      localStorage.removeItem("id_active_company_id");
    } else {
      localStorage.setItem("id_active_company_id", String(resolvedActive));
    }
  }, []);

  const refreshSession = useCallback(async () => {
    const [nextUser, nextCompanies, nextPermissions] = await Promise.all([
      getMeApi(),
      getMyCompaniesApi(),
      getMePermissionsApi(),
    ]);
    setSessionState(nextUser, nextCompanies, nextPermissions);
  }, [setSessionState]);

  const logout = useCallback(() => {
    localStorage.removeItem("id_token");
    localStorage.removeItem("id_user");
    localStorage.removeItem("id_my_companies");
    localStorage.removeItem("id_active_company_id");
    setUser(null);
    setMyCompanies([]);
    setActiveCompanyId(null);
    setAssignedCompanyIds([]);
    setPermissions(null);
    resetUnauthorizedFlag();
  }, []);

  // Keep a stable ref for the 401 handler (avoids stale closure)
  logoutRef.current = () => {
    logout();
    toast.error("Sessione scaduta. Effettua nuovamente il login.");
  };

  // Register 401 handler once
  useEffect(() => {
    registerUnauthorizedHandler(() => logoutRef.current());
  }, []);

  // Rinnovo silenzioso della sessione finché l'utente è autenticato: chi sta
  // lavorando non viene mai buttato fuori allo scadere delle 3 ore.
  useEffect(() => {
    if (!user) return;
    return startSilentRenew();
  }, [user]);

  // Restore session on mount
  useEffect(() => {
    const token = localStorage.getItem("id_token");
    const cached = localStorage.getItem("id_user");
    const cachedCompanies = localStorage.getItem("id_my_companies");
    const cachedActiveCompanyId = localStorage.getItem("id_active_company_id");
    const cachedPermissions = localStorage.getItem("id_user_permissions");

    if (token && cached) {
      try {
        setUser(JSON.parse(cached) as AuthUser);
        if (cachedCompanies) {
          setMyCompanies(JSON.parse(cachedCompanies) as Company[]);
        }
        if (cachedPermissions) {
          setPermissions(JSON.parse(cachedPermissions) as UserPermissions);
        }
        if (cachedActiveCompanyId) {
          const parsed = Number(cachedActiveCompanyId);
          setActiveCompanyId(Number.isFinite(parsed) ? parsed : null);
        }
      } catch {
        // malformed cache — re-fetch silently
      }
      refreshSession()
        .catch(() => {
          logout();
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, [logout, refreshSession]);

  const login = useCallback(
    async (payload: LoginPayload) => {
      const { access_token } = await loginApi(payload);
      localStorage.setItem("id_token", access_token);
      await refreshSession();
    },
    [refreshSession]
  );

  const switchActiveCompany = useCallback(async (companyId: number) => {
    await switchActiveCompanyApi({ company_id: companyId });

    const [nextUser, nextCompanies, nextPermissions] = await Promise.all([
      getMeApi(),
      getMyCompaniesApi(),
      getMePermissionsApi(),
    ]);
    setSessionState({
      ...nextUser,
      company_id: companyId,
    }, nextCompanies, nextPermissions);
  }, [setSessionState]);

  return (
    <AuthContext.Provider
      value={{
        user,
        activeCompanyId,
        assignedCompanyIds,
        myCompanies,
        permissions,
        isAuthenticated: user !== null,
        isLoading,
        login,
        refreshSession,
        switchActiveCompany,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuthContext must be used inside AuthProvider");
  return ctx;
}
