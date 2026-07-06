import React, { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useSelectedCompanyId } from "../hooks/useSelectedCompanyId";
import { useTheme } from "../context/ThemeContext";
import { useBrand } from "../context/BrandContext";
import { useToast } from "../context/ToastContext";
import { Avatar } from "../components/ui/Avatar";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { Input } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { SearchableSelect } from "../components/ui/SearchableSelect";
import { QuickTaskModal } from "../components/work-items/QuickTaskModal";
import { syncFicClientsApi } from "../api/fic";
import { syncCompanyItalianHolidaysApi } from "../api/companies";
import { useFicQuotesSync } from "../hooks/useFicQuotesSync";
import { useNotifications } from "../features/notifications/useNotifications";
import { NotificationCenter } from "../features/notifications/NotificationCenter";
import { NotificationPreferencesModal } from "../features/notifications/NotificationPreferencesModal";
import { canAccessRoute } from "../utils/access";

interface NavItem {
  label: string;
  to: string;
  icon: React.ReactNode;
  routeKey: Parameters<typeof canAccessRoute>[1];
  group: "overview" | "operations" | "commercial" | "catalog" | "account" | "admin";
}

const allNavItems: NavItem[] = [
  {
    label: "Dashboard",
    to: "/",
    icon: <Icon name="home" />,
    routeKey: "dashboard",
    group: "overview",
  },
  {
    label: "Lavorazioni",
    to: "/work-items",
    icon: <Icon name="list" />,
    routeKey: "work-items",
    group: "operations",
  },
  {
    label: "Workload",
    to: "/workload",
    icon: <Icon name="activity" />,
    routeKey: "workload",
    group: "operations",
  },
  {
    label: "Attività del giorno",
    to: "/daily-tasks",
    icon: <Icon name="check-circle" />,
    routeKey: "daily-tasks",
    group: "operations",
  },
  {
    label: "Comunicazioni",
    to: "/comunicazioni",
    icon: <Icon name="annotation" />,
    routeKey: "comunicazioni",
    group: "operations",
  },
  {
    label: "Clienti",
    to: "/clients",
    icon: <Icon name="user-circle" />,
    routeKey: "clients",
    group: "commercial",
  },
  {
    label: "Situazione clienti",
    to: "/clients-situation",
    icon: <Icon name="activity" />,
    routeKey: "clients-situation",
    group: "commercial",
  },
  {
    label: "Richieste",
    to: "/requests",
    icon: <Icon name="activity" />,
    routeKey: "requests",
    group: "commercial",
  },
  {
    label: "Preventivi",
    to: "/quotes",
    icon: <Icon name="activity" />,
    routeKey: "quotes",
    group: "commercial",
  },
  {
    label: "Pipeline commerciale",
    to: "/contracts-pipeline",
    icon: <Icon name="document-text" />,
    routeKey: "contracts",
    group: "commercial",
  },
  {
    label: "Fatturazione",
    to: "/fatturazione",
    icon: <Icon name="credit-card" />,
    routeKey: "fatturazione",
    group: "commercial",
  },
  {
    label: "Catalogo",
    to: "/catalog",
    icon: <Icon name="settings" />,
    routeKey: "catalog",
    group: "catalog",
  },
  {
    label: "Configuratore",
    to: "/configuratore",
    icon: <Icon name="activity" />,
    routeKey: "configurator",
    group: "catalog",
  },
  {
    label: "Pacchetti Social",
    to: "/social-packages",
    icon: <Icon name="star" />,
    routeKey: "social",
    group: "catalog",
  },
  {
    label: "Presentazione Social",
    to: "/social-packages-presentation",
    icon: <Icon name="eye" />,
    routeKey: "social",
    group: "catalog",
  },
  {
    label: "Profilo",
    to: "/profile",
    icon: <Icon name="user-circle" />,
    routeKey: "profile",
    group: "account",
  },
  {
    label: "Utenti",
    to: "/users",
    icon: <Icon name="users" />,
    routeKey: "admin",
    group: "admin",
  },
  {
    label: "Aziende",
    to: "/companies",
    icon: <Icon name="building" />,
    routeKey: "admin",
    group: "admin",
  },
];

const NAV_GROUP_LABELS: Record<NavItem["group"], string> = {
  overview: "Overview",
  operations: "Operativo",
  commercial: "Commerciale",
  catalog: "Catalogo e offerte",
  account: "Account",
  admin: "Amministrazione",
};

export function DashboardLayout() {
  const { user, logout, myCompanies, activeCompanyId, switchActiveCompany, permissions } = useAuth();
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { brand } = useBrand();
  const { selectedCompanyId, setSelectedCompanyId } = useSelectedCompanyId(user?.company_id ?? null);
  const navigate = useNavigate();
  const toast = useToast();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [syncMenuOpen, setSyncMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifPrefsOpen, setNotifPrefsOpen] = useState(false);
  const notifications = useNotifications();
  const [syncing, setSyncing] = useState(false);
  const [quickTaskModalOpen, setQuickTaskModalOpen] = useState(false);
  const [ficQuotesModalOpen, setFicQuotesModalOpen] = useState(false);
  const [ficQuotesOnlyFromDate, setFicQuotesOnlyFromDate] = useState("");
  const [ficQuotesPerPage, setFicQuotesPerPage] = useState("100");
  const [ficQuotesMaxPages, setFicQuotesMaxPages] = useState("5");
  const [ficQuotesStatusOnImport, setFicQuotesStatusOnImport] = useState("bozza");
  const [ficQuotesKindOnImport, setFicQuotesKindOnImport] = useState("preventivo");
  const [ficQuotesSyncMode, setFicQuotesSyncMode] = useState("upsert");
  const invalidCompanyToastRef = useRef<number | null>(null);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const syncMenuRef = useRef<HTMLDivElement | null>(null);
  const isAdmin = !!user?.is_admin;

  const companyOptions = useMemo(
    () => myCompanies.map((company) => ({ id: company.id, name: company.name })),
    [myCompanies]
  );

  const currentCompanyId = selectedCompanyId ?? activeCompanyId ?? user?.company_id ?? null;
  const effectiveCompanyOptions =
    companyOptions.length > 0
      ? companyOptions
      : currentCompanyId != null
        ? [{ id: currentCompanyId, name: `Company #${currentCompanyId}` }]
        : [];
  const companySelectOptions = useMemo(
    () =>
      effectiveCompanyOptions.map((company) => ({
        value: String(company.id),
        label: company.name,
        keywords: company.name,
      })),
    [effectiveCompanyOptions]
  );

  const navItems = allNavItems.filter((item) => canAccessRoute(permissions, item.routeKey));
  const groupedNavItems = useMemo(() => {
    const groups: Record<NavItem["group"], NavItem[]> = {
      overview: [],
      operations: [],
      commercial: [],
      catalog: [],
      account: [],
      admin: [],
    };

    navItems.forEach((item) => {
      groups[item.group].push(item);
    });

    return groups;
  }, [navItems]);
  const cleanSearch = useMemo(() => {
    const params = new URLSearchParams(location.search);
    params.delete("quote_id");
    const value = params.toString();
    return value ? `?${value}` : "";
  }, [location.search]);
  const roleBadgeLabel = user?.role_label || (user?.is_admin ? "Admin" : "Operatore");
  const currentCompanyName = useMemo(() => {
    const company = effectiveCompanyOptions.find((item) => item.id === currentCompanyId);
    if (company) return company.name;
    return currentCompanyId != null ? `Company #${currentCompanyId}` : "Nessuna company attiva";
  }, [effectiveCompanyOptions, currentCompanyId]);
  const {
    previewResult: ficQuotesPreview,
    executionResult: ficQuotesExecution,
    previewLoading: ficQuotesPreviewLoading,
    executionLoading: ficQuotesExecutionLoading,
    runPreview: runFicQuotesPreview,
    runExecution: runFicQuotesExecution,
    reset: resetFicQuotesSync,
  } = useFicQuotesSync({ isAdmin });

  const ficQuotesRequestPayload = useMemo(() => {
    const perPageValue = Number(ficQuotesPerPage);
    const maxPagesValue = Number(ficQuotesMaxPages);
    return {
      sync_mode: ficQuotesSyncMode || "upsert",
      only_from_date: ficQuotesOnlyFromDate || undefined,
      per_page: Number.isFinite(perPageValue) && perPageValue > 0 ? perPageValue : undefined,
      max_pages: Number.isFinite(maxPagesValue) && maxPagesValue > 0 ? maxPagesValue : undefined,
      status_on_import: ficQuotesStatusOnImport || undefined,
      kind_on_import: ficQuotesKindOnImport || undefined,
    };
  }, [ficQuotesKindOnImport, ficQuotesMaxPages, ficQuotesOnlyFromDate, ficQuotesPerPage, ficQuotesStatusOnImport, ficQuotesSyncMode]);

  useEffect(() => {
    const allowedIds = new Set(companyOptions.map((company) => company.id));
    if (selectedCompanyId != null && allowedIds.size > 0 && !allowedIds.has(selectedCompanyId)) {
      const fallbackCompanyId = activeCompanyId ?? user?.company_id ?? companyOptions[0]?.id ?? null;
      if (fallbackCompanyId != null) {
        setSelectedCompanyId(fallbackCompanyId, { replace: true });
      }
      if (invalidCompanyToastRef.current !== selectedCompanyId) {
        invalidCompanyToastRef.current = selectedCompanyId;
        toast.error("Azienda non assegnata al tuo profilo");
      }
      return;
    }

    if (selectedCompanyId != null) return;
    const fallbackCompanyId = activeCompanyId ?? user?.company_id ?? companyOptions[0]?.id ?? null;
    if (fallbackCompanyId != null) {
      setSelectedCompanyId(fallbackCompanyId, { replace: true });
    }
  }, [activeCompanyId, companyOptions, selectedCompanyId, setSelectedCompanyId, toast, user?.company_id]);

  const handleCompanySwitch = async (nextCompanyId: number | null) => {
    if (nextCompanyId == null) return;
    if (nextCompanyId === currentCompanyId) {
      setSelectedCompanyId(nextCompanyId, { replace: true });
      return;
    }

    try {
      await switchActiveCompany(nextCompanyId);
      setSelectedCompanyId(nextCompanyId, { replace: true });
      toast.success("Azienda attiva aggiornata");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Errore nel cambio azienda";
      if (message.includes("[403]")) {
        toast.error("Azienda non assegnata al tuo profilo");
      } else if (message.includes("[404]")) {
        toast.error("Azienda non trovata o non attiva");
      } else {
        toast.error(message);
      }
    }
  };

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      if (!userMenuRef.current) return;
      const target = event.target as Node;
      if (!userMenuRef.current.contains(target)) {
        setUserMenuOpen(false);
      }
    };

    if (userMenuOpen) {
      document.addEventListener("mousedown", onDocumentClick);
    }

    return () => {
      document.removeEventListener("mousedown", onDocumentClick);
    };
  }, [userMenuOpen]);

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      if (!syncMenuRef.current) return;
      if (!syncMenuRef.current.contains(event.target as Node)) {
        setSyncMenuOpen(false);
      }
    };
    if (syncMenuOpen) {
      document.addEventListener("mousedown", onDocumentClick);
    }
    return () => document.removeEventListener("mousedown", onDocumentClick);
  }, [syncMenuOpen]);

  const handleSyncClients = async () => {
    if (!isAdmin) {
      toast.error("Operazione consentita solo agli admin");
      return;
    }
    setSyncMenuOpen(false);
    setSyncing(true);
    try {
      const result = await syncFicClientsApi();
      const msg = `Sync clienti completata: Creati ${result.created}, aggiornati ${result.updated}, totale FIC ${result.total_fic}`;
      toast.success(msg);
      window.dispatchEvent(new CustomEvent("fic-sync-completed", { detail: { entity: "clients" } }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore sincronizzazione FIC");
    } finally {
      setSyncing(false);
    }
  };

  const handleOpenFicQuotesModal = () => {
    if (!isAdmin) {
      toast.error("Operazione consentita solo agli admin");
      return;
    }
    setSyncMenuOpen(false);
    resetFicQuotesSync();
    setFicQuotesModalOpen(true);
  };

  const handleRunFicQuotesPreview = async () => {
    try {
      const result = await runFicQuotesPreview(ficQuotesRequestPayload);
      toast.success(
        `Sync preventivi dry-run: Trovati ${result.total_fic_quotes}, da creare ${result.created}, da aggiornare ${result.updated}, saltati ${result.skipped}`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore preview sync preventivi FIC");
    }
  };

  const handleRunFicQuotesExecution = async () => {
    try {
      const result = await runFicQuotesExecution(ficQuotesRequestPayload);
      toast.success(
        `Sync preventivi completata: Creati ${result.created}, aggiornati ${result.updated}, saltati ${result.skipped}, errori ${result.errors.length}`
      );
      window.dispatchEvent(new CustomEvent("fic-sync-completed", { detail: { entity: "quotes" } }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore sync preventivi FIC");
    }
  };

  const handleSyncItalianHolidays = async () => {
    setSyncMenuOpen(false);
    if (currentCompanyId == null) {
      toast.error("Seleziona una company");
      return;
    }

    setSyncing(true);
    try {
      const result = await syncCompanyItalianHolidaysApi(currentCompanyId);
      toast.success(
        `Festivita ${result.year}: ${result.created} create, ${result.updated} aggiornate, ${result.skipped} invariate`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore sincronizzazione festivita italiane");
    } finally {
      setSyncing(false);
    }
  };

  const onOpenProfile = () => {
    setUserMenuOpen(false);
    navigate({ pathname: "/profile", search: cleanSearch });
  };

  const onLogout = () => {
    setUserMenuOpen(false);
    logout();
  };

  return (
    <div className="flex h-screen h-dvh bg-paper dark:bg-ink overflow-hidden">
      {/* ── Mobile sidebar overlay ─────────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-ink/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ───────────────────────────────────────── */}
      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-50 w-60 flex flex-col
          text-paper
          transition-transform duration-300 ease-[cubic-bezier(.2,.7,.2,1)]
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
        style={{ background: "#0a0a0a", borderRight: "1px solid rgba(255,255,255,.08)" }}
      >
        {/* Brand */}
        <div
          className="flex items-center gap-3 px-5 py-5"
          style={{ borderBottom: "1px solid rgba(255,255,255,.08)" }}
        >
          <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center">
            {brand?.logo_dark ? (
              <img
                src={brand.logo_dark}
                alt={brand.app_name ?? "Logo"}
                className="w-8 h-8 object-contain"
              />
            ) : (
              <svg viewBox="0 0 32 32" fill="none" aria-label="Italia Digitale logo">
                <rect width="32" height="32" rx="8" fill="white" fillOpacity=".12" />
                <path d="M8 16h16M16 8v16" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            )}
          </div>
          <div>
            <p className="font-display font-bold text-[13px] uppercase tracking-wider leading-tight">
              {brand?.app_name ?? "Italia Digitale"}
            </p>
            <p className="font-body text-[10px] text-muted-dark mt-0.5">
              Admin Dashboard
            </p>
          </div>
        </div>

        {/* Nav */}
        <nav className="no-scrollbar flex-1 px-3 py-4 flex flex-col gap-0.5 overflow-y-auto">
          <div className="px-3 pb-3 pt-1">
            <label className="flex flex-col gap-1">
              <SearchableSelect
                value={currentCompanyId != null ? String(currentCompanyId) : ""}
                onChange={(value) => handleCompanySwitch(value ? Number(value) : null)}
                options={companySelectOptions}
                placeholder="Seleziona azienda"
                searchPlaceholder="Cerca azienda..."
                emptyMessage="Nessuna azienda trovata"
                menuLayer="portal"
                className="w-full"
                triggerClassName="border-white/20 bg-white/10 px-2.5 py-2 text-[12px] font-semibold text-white focus:border-white/40"
              />
            </label>
          </div>
          {(Object.keys(groupedNavItems) as Array<NavItem["group"]>).map((groupKey) => {
            const items = groupedNavItems[groupKey];
            if (items.length === 0) return null;

            return (
              <div key={groupKey} className="mb-2">
                <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-[rgba(255,255,255,0.45)]">
                  {NAV_GROUP_LABELS[groupKey]}
                </p>
                <div className="flex flex-col gap-0.5">
                  {items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={{ pathname: item.to, search: cleanSearch }}
                      end={item.to === "/"}
                      onClick={() => setSidebarOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-3 px-3 py-2.5 rounded-md text-[13px] font-semibold transition-all duration-150 select-none
                        ${
                          isActive
                            ? "bg-white text-[#0a0a0a]"
                            : "text-[rgba(255,255,255,0.65)] hover:bg-[rgba(255,255,255,0.10)] hover:text-white"
                        }`
                      }
                    >
                      {item.icon}
                      {item.label}
                    </NavLink>
                  ))}

                  {groupKey === "operations" && canAccessRoute(permissions, "work-items") && (
                    <button
                      type="button"
                      onClick={() => {
                        setQuickTaskModalOpen(true);
                        setSidebarOpen(false);
                      }}
                      disabled={currentCompanyId == null}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-md text-[13px] font-semibold transition-all duration-150 select-none text-[rgba(255,255,255,0.9)] bg-[rgba(255,255,255,0.08)] hover:bg-[rgba(255,255,255,0.16)] disabled:opacity-50 disabled:cursor-not-allowed"
                      title={currentCompanyId == null ? "Seleziona una company" : "Apri task rapida"}
                    >
                      <Icon name="plus" />
                      Task Rapida
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div
          className="p-4 flex flex-col gap-2"
          style={{ borderTop: "1px solid rgba(255,255,255,.08)" }}
        >
          <button
            onClick={toggleTheme}
            className="flex items-center gap-3 px-3 py-2 rounded-md text-[13px] text-[rgba(255,255,255,0.65)] hover:text-white hover:bg-[rgba(255,255,255,0.10)] transition-colors w-full"
          >
            <Icon name={theme === "dark" ? "sun" : "moon"} />
            {theme === "dark" ? "Modalità chiara" : "Modalità scura"}
          </button>
          <button
            onClick={logout}
            className="flex items-center gap-3 px-3 py-2 rounded-md text-[13px] text-[rgba(255,255,255,0.65)] hover:text-danger hover:bg-danger/10 transition-colors w-full"
          >
            <Icon name="logout" />
            Esci
          </button>
        </div>
      </aside>

      {/* ── Main area ─────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="flex items-center gap-4 px-8 h-16 bg-paper dark:bg-[#131316] border-b border-line dark:border-[#2a2a2e] flex-shrink-0">
          {/* Mobile menu toggle */}
          <button
            className="lg:hidden p-1.5 rounded-md text-muted hover:text-ink dark:hover:text-paper transition-colors"
            onClick={() => setSidebarOpen(true)}
            aria-label="Apri menu"
          >
            <Icon name="menu" />
          </button>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Right actions */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setNotifOpen((prev) => { const next = !prev; if (next) void notifications.reload(); return next; })}
              aria-label="Centro notifiche"
              title="Centro notifiche"
              className={`relative inline-flex h-9 w-9 items-center justify-center rounded-pill border bg-paper text-ink transition-colors hover:bg-cream dark:bg-[#1c1c20] dark:text-[#f4f4f7] dark:hover:bg-[#252529] ${notifOpen ? "border-brand-magenta text-brand-magenta dark:border-brand-magenta dark:text-brand-magenta" : "border-line dark:border-[#2a2a2e]"}`}
            >
              <Icon name="bell" className="w-4 h-4" />
              {notifications.totalUnread > 0 && (
                <span className="absolute -top-1.5 -right-1.5 grid min-w-[17px] h-[17px] place-items-center rounded-full border-2 border-paper bg-brand-magenta px-1 text-[10px] font-bold tabular-nums text-white dark:border-[#131316]">
                  {notifications.totalUnread > 99 ? "99+" : notifications.totalUnread}
                </span>
              )}
            </button>

            <span className="hidden md:inline-flex items-center rounded-pill border border-line px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted dark:border-[#2a2a2e] dark:text-[#9999a0]">
              {roleBadgeLabel}
            </span>

            <span className="hidden md:inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-success bg-success/10">
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              Online
            </span>

            {isAdmin && (
              <div className="relative hidden sm:block" ref={syncMenuRef}>
              <button
                type="button"
                onClick={() => setSyncMenuOpen((prev) => !prev)}
                title="Sincronizza con Fatture in Cloud"
                disabled={syncing || ficQuotesPreviewLoading || ficQuotesExecutionLoading}
                className="inline-flex items-center gap-1.5 rounded-pill border border-line px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink transition-colors hover:bg-cream disabled:opacity-50 dark:border-[#2a2a2e] dark:text-[#f4f4f7] dark:hover:bg-[#1c1c20]"
              >
                <Icon name="refresh-cw" className={`w-3.5 h-3.5 ${syncing || ficQuotesPreviewLoading || ficQuotesExecutionLoading ? "animate-spin" : ""}`} />
                Sync
                <Icon name="chevron-down" className={`w-3 h-3 opacity-60 transition-transform ${syncMenuOpen ? "rotate-180" : ""}`} />
              </button>

              {syncMenuOpen && (
                <div className="absolute right-0 top-[calc(100%+6px)] z-30 w-60 rounded-lg border border-line bg-paper p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.12)] dark:border-[#2a2a2e] dark:bg-[#131316]">
                  <button
                    type="button"
                    onClick={handleSyncClients}
                    className="w-full inline-flex items-center gap-2.5 rounded-md px-3 py-2.5 text-left text-[13px] font-semibold text-ink hover:bg-cream dark:text-[#f4f4f7] dark:hover:bg-[#1c1c20]"
                  >
                    <Icon name="users" className="w-4 h-4 flex-shrink-0 text-muted dark:text-[#9999a0]" />
                    <span>Sincronizza clienti FIC</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleOpenFicQuotesModal}
                    className="w-full inline-flex items-center gap-2.5 rounded-md px-3 py-2.5 text-left text-[13px] font-semibold text-ink hover:bg-cream dark:text-[#f4f4f7] dark:hover:bg-[#1c1c20]"
                  >
                    <Icon name="document-text" className="w-4 h-4 flex-shrink-0 text-muted dark:text-[#9999a0]" />
                    <span>Sincronizza preventivi FIC</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSyncItalianHolidays}
                    className="w-full inline-flex items-center gap-2.5 rounded-md px-3 py-2.5 text-left text-[13px] font-semibold text-ink hover:bg-cream dark:text-[#f4f4f7] dark:hover:bg-[#1c1c20]"
                  >
                    <Icon name="refresh-cw" className="w-4 h-4 flex-shrink-0 text-muted dark:text-[#9999a0]" />
                    <span>Sincronizza festivita italiane</span>
                  </button>
                </div>
              )}
              </div>
            )}

            <button
              type="button"
              onClick={toggleTheme}
              title={theme === "dark" ? "Attiva tema chiaro" : "Attiva tema scuro"}
              className="inline-flex h-9 w-9 items-center justify-center rounded-pill border border-line bg-paper text-ink transition-colors hover:bg-cream dark:border-[#2a2a2e] dark:bg-[#1c1c20] dark:text-[#f4f4f7] dark:hover:bg-[#252529]"
            >
              <Icon name={theme === "dark" ? "sun" : "moon"} className="w-4 h-4" />
            </button>

            {user && (
              <div className="relative" ref={userMenuRef}>
                <button
                  type="button"
                  onClick={() => setUserMenuOpen((prev) => !prev)}
                  title="Apri menu utente"
                  aria-haspopup="menu"
                  aria-expanded={userMenuOpen}
                  className="inline-flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-pill bg-cream dark:bg-[#1c1c20] text-[13px] font-semibold text-ink dark:text-paper border border-line dark:border-[#2a2a2e]"
                >
                  <Avatar name={user.full_name || user.username} src={user.avatar_url} size="sm" />
                  <span className="hidden sm:inline">{user.full_name || user.username}</span>
                  <Icon
                    name="chevron-down"
                    className={`hidden sm:inline-block w-3.5 h-3.5 opacity-70 transition-transform ${
                      userMenuOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {userMenuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-[calc(100%+8px)] z-30 w-44 rounded-lg border border-line bg-paper p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.12)] dark:border-[#2a2a2e] dark:bg-[#131316]"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={onOpenProfile}
                      className="w-full inline-flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] font-semibold text-ink hover:bg-cream dark:text-[#f4f4f7] dark:hover:bg-[#1c1c20]"
                    >
                      <Icon name="user-circle" className="w-4 h-4" />
                      Profilo
                    </button>

                    <button
                      type="button"
                      role="menuitem"
                      onClick={onLogout}
                      className="w-full inline-flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] font-semibold text-danger hover:bg-danger/10"
                    >
                      <Icon name="logout" className="w-4 h-4" />
                      Disconnetti
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden bg-cream dark:bg-ink">
          <Outlet />
        </main>

        <QuickTaskModal
          open={quickTaskModalOpen}
          onClose={() => setQuickTaskModalOpen(false)}
          companyId={currentCompanyId}
        />

        <NotificationCenter
          open={notifOpen}
          onClose={() => setNotifOpen(false)}
          notifications={notifications}
          onOpenPreferences={() => {
            setNotifOpen(false);
            setNotifPrefsOpen(true);
          }}
        />

        <NotificationPreferencesModal
          open={notifPrefsOpen}
          onClose={() => setNotifPrefsOpen(false)}
        />

        <Modal
          open={ficQuotesModalOpen}
          onClose={() => {
            if (ficQuotesPreviewLoading || ficQuotesExecutionLoading) return;
            setFicQuotesModalOpen(false);
          }}
          title="Sincronizza preventivi da FIC"
          description={`Agenzia attiva: ${currentCompanyName}`}
          size="lg"
          footer={(
            <>
              <Button
                variant="ghost"
                onClick={() => setFicQuotesModalOpen(false)}
                disabled={ficQuotesPreviewLoading || ficQuotesExecutionLoading}
              >
                Chiudi
              </Button>
              <Button
                variant="secondary"
                onClick={() => void handleRunFicQuotesPreview()}
                loading={ficQuotesPreviewLoading}
                disabled={ficQuotesExecutionLoading}
              >
                Esegui anteprima
              </Button>
              <Button
                onClick={() => void handleRunFicQuotesExecution()}
                loading={ficQuotesExecutionLoading}
                disabled={!ficQuotesPreview || ficQuotesPreviewLoading}
              >
                Conferma sincronizzazione
              </Button>
            </>
          )}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input
                label="Only from date"
                type="date"
                value={ficQuotesOnlyFromDate}
                onChange={(event) => setFicQuotesOnlyFromDate(event.target.value)}
              />
              <SearchableSelect
                value={ficQuotesSyncMode}
                onChange={(value) => setFicQuotesSyncMode(value || "upsert")}
                options={[{ value: "upsert", label: "Upsert" }]}
                placeholder="Modalita sync"
              />
              <Input
                label="Per page"
                type="number"
                min={1}
                value={ficQuotesPerPage}
                onChange={(event) => setFicQuotesPerPage(event.target.value)}
              />
              <Input
                label="Max pages"
                type="number"
                min={1}
                value={ficQuotesMaxPages}
                onChange={(event) => setFicQuotesMaxPages(event.target.value)}
              />
              <Input
                label="Status on import"
                value={ficQuotesStatusOnImport}
                onChange={(event) => setFicQuotesStatusOnImport(event.target.value)}
                placeholder="bozza"
              />
              <Input
                label="Kind on import"
                value={ficQuotesKindOnImport}
                onChange={(event) => setFicQuotesKindOnImport(event.target.value)}
                placeholder="preventivo"
              />
            </div>

            {ficQuotesPreview && (
              <div className="rounded-md border border-line dark:border-line-dark p-3 bg-paper dark:bg-[#131316] space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">Risultato anteprima</div>
                <div className="text-sm text-ink dark:text-paper">
                  Trovati {ficQuotesPreview.total_fic_quotes} preventivi FIC, da creare {ficQuotesPreview.created}, da aggiornare {ficQuotesPreview.updated}, saltati {ficQuotesPreview.skipped}.
                </div>
                <div className="text-xs text-muted dark:text-muted-dark">Errori: {ficQuotesPreview.errors.length}</div>
              </div>
            )}

            {ficQuotesExecution && (
              <div className="rounded-md border border-success/40 bg-success/10 p-3 space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-success">Sync completata</div>
                <div className="text-sm text-ink dark:text-paper">
                  Creati {ficQuotesExecution.created}, aggiornati {ficQuotesExecution.updated}, saltati {ficQuotesExecution.skipped}, errori {ficQuotesExecution.errors.length}.
                </div>
              </div>
            )}

            {!!ficQuotesPreview?.errors.length && (
              <div className="rounded-md border border-warning/40 bg-warning/10 p-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-warning">Errori backend</div>
                <ul className="mt-2 max-h-40 overflow-auto space-y-1 text-xs text-warning">
                  {ficQuotesPreview.errors.map((err, index) => (
                    <li key={index}>- {typeof err === "string" ? err : JSON.stringify(err)}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Modal>
      </div>
    </div>
  );
}
