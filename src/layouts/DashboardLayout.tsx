import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useSelectedCompanyId } from "../hooks/useSelectedCompanyId";
import { useTheme } from "../context/ThemeContext";
import { getCompanyLogoUrl } from "../utils/companyLogo";
import { useBrand } from "../context/BrandContext";
import { useToast } from "../context/ToastContext";
import { Avatar } from "../components/ui/Avatar";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { ThemeToggleIcon } from "../components/ui/ThemeToggleIcon";
import { Input } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { SearchableSelect } from "../components/ui/SearchableSelect";
import { QuickTaskModal } from "../components/work-items/QuickTaskModal";
import { syncFicClientsApi } from "../api/fic";
import { syncCompanyItalianHolidaysApi } from "../api/companies";
import { useFicQuotesSync } from "../hooks/useFicQuotesSync";
import { useNotifications } from "../features/notifications/useNotifications";
import type { NotifTabKey } from "../features/notifications/notificationsData";
import { subscribeRealtime } from "../features/realtime/realtimeBus";

// Operatori: nel centro notifiche non vedono le notifiche "contratti".
const OPERATOR_HIDDEN_NOTIF_TABS: NotifTabKey[] = ["contratti"];
const NO_HIDDEN_NOTIF_TABS: NotifTabKey[] = [];
import { NotificationCenter } from "../features/notifications/NotificationCenter";
import { NotificationToastLayer, NOTIF_BELL_ID } from "../features/notifications/NotificationToastLayer";
import { NotificationPreferencesModal } from "../features/notifications/NotificationPreferencesModal";
import { QuickLinksBar } from "../components/quicklinks/QuickLinksBar";
import { canAccessRoute } from "../utils/access";
import { getSidebarPreferencesApi, updateSidebarPreferencesApi } from "../api/sidebarPreferences";

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
    icon: <Icon name="calendar" />,
    routeKey: "workload",
    group: "operations",
  },
  {
    label: "Attività del giorno",
    to: "/daily-tasks",
    icon: <Icon name="clock" />,
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
    label: "Controllo PED",
    to: "/controllo-ped",
    icon: <Icon name="check-circle" />,
    routeKey: "controllo-ped",
    group: "operations",
  },
  {
    label: "Profili social",
    to: "/profili-social",
    icon: <Icon name="globe" />,
    routeKey: "social-profiles",
    group: "operations",
  },
  {
    label: "Monitoraggio social",
    to: "/monitoraggio-social",
    icon: <Icon name="activity" />,
    routeKey: "social-monitors",
    group: "operations",
  },
  // Browser interno nascosto per ora (non ancora affidabile): i collegamenti
  // rapidi aprono direttamente in una nuova scheda. Riabilitare quando pronto.
  // {
  //   label: "Browser",
  //   to: "/browser",
  //   icon: <Icon name="globe" />,
  //   routeKey: "profile",
  //   group: "operations",
  // },
  {
    label: "Clienti",
    to: "/clients",
    icon: <Icon name="users" />,
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
    icon: <Icon name="mail" />,
    routeKey: "requests",
    group: "commercial",
  },
  {
    label: "Preventivi",
    to: "/quotes",
    icon: <Icon name="document-text" />,
    routeKey: "quotes",
    group: "commercial",
  },
  {
    label: "Pipeline commerciale",
    to: "/contracts-pipeline",
    icon: <Icon name="target" />,
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
    icon: <Icon name="grid" />,
    routeKey: "catalog",
    group: "catalog",
  },
  {
    label: "Configuratore",
    to: "/configuratore",
    icon: <Icon name="tools" />,
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
    label: "Documenti",
    to: "/documenti",
    icon: <Icon name="document-text" />,
    routeKey: "documenti",
    group: "admin",
  },
  {
    label: "Utenti",
    to: "/users",
    icon: <Icon name="shield-check" />,
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

const DEFAULT_GROUP_ORDER: Array<NavItem["group"]> = [
  "overview", "operations", "commercial", "catalog", "account", "admin",
];

export function DashboardLayout() {
  const { user, logout, myCompanies, activeCompanyId, switchActiveCompany, permissions } = useAuth();
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();

  // Sincronizza lo stato con l'uscita fullscreen via Esc/gesti del browser.
  useEffect(() => {
    const onChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
      // Flourish motion graphic sul contenuto entrando/uscendo da schermo intero.
      mainRef.current?.animate?.(
        [
          { transform: "scale(0.985)", opacity: 0.5 },
          { transform: "scale(1)", opacity: 1 },
        ],
        { duration: 380, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" },
      );
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = () => {
    try {
      if (document.fullscreenElement) {
        void document.exitFullscreen?.();
      } else {
        void document.documentElement.requestFullscreen?.();
      }
    } catch {
      // Alcuni browser possono bloccare la richiesta: ignoriamo silenziosamente.
    }
  };
  const { brand } = useBrand();
  // Simbolo del brand reattivo al tema: scuro → logo per sfondi scuri, chiaro → logo per
  // sfondi chiari, con fallback all'altra variante quando una non è caricata.
  const brandSymbol = (theme === "dark" ? brand?.logo_dark : brand?.logo_light)
    ?? brand?.logo_dark ?? brand?.logo_light ?? null;
  const { selectedCompanyId, setSelectedCompanyId } = useSelectedCompanyId(user?.company_id ?? null);
  const navigate = useNavigate();
  const toast = useToast();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  // Personalizzazione sidebar per (utente × azienda): preferiti + ordine per gruppo.
  const [favorites, setFavorites] = useState<string[]>([]);
  const [itemOrder, setItemOrder] = useState<Record<string, string[]>>({});
  const [groupOrder, setGroupOrder] = useState<string[]>([]);
  // DnD: voce trascinata + indicatore di rilascio (prima/dopo una voce dello stesso gruppo).
  const [itemDrag, setItemDrag] = useState<{ path: string; group: string } | null>(null);
  const [itemDrop, setItemDrop] = useState<{ group: string; path: string; before: boolean } | null>(null);
  // DnD: categoria trascinata + indicatore di rilascio (prima/dopo una categoria).
  const [groupDrag, setGroupDrag] = useState<string | null>(null);
  const [groupDrop, setGroupDrop] = useState<{ group: string; before: boolean } | null>(null);
  // Full focus: mette il gestionale a schermo intero (Fullscreen API).
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Sidebar compatta (solo desktop): larghezza ridotta + sole icone.
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("sidebar_collapsed") === "1");
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => setIsDesktop(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  // "compact" vale solo su desktop: su mobile la sidebar resta un drawer completo.
  const compact = collapsed && isDesktop;
  const toggleCollapsed = () =>
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem("sidebar_collapsed", next ? "1" : "0");
      return next;
    });
  const [syncMenuOpen, setSyncMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifPrefsOpen, setNotifPrefsOpen] = useState(false);
  // Operatore = non admin e non project manager. Per lui il centro notifiche
  // nasconde la scheda "Contratti" (e il relativo conteggio dal badge).
  const isOperator = permissions != null && !permissions.is_admin && !permissions.is_project_manager;
  const hiddenNotifTabs = isOperator ? OPERATOR_HIDDEN_NOTIF_TABS : NO_HIDDEN_NOTIF_TABS;
  const notifications = useNotifications(hiddenNotifTabs);
  // Contatore incrementato a ogni notifica in arrivo (via stream SSE): usato come
  // `key` per rilanciare l'animazione della campanella. Parte da 0 = nessuna animazione
  // al primo mount.
  const [notifPing, setNotifPing] = useState(0);
  useEffect(() => subscribeRealtime(() => setNotifPing((n) => n + 1)), []);
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
  const mainRef = useRef<HTMLDivElement | null>(null);
  const isAdmin = !!user?.is_admin;

  const companyOptions = useMemo(
    () => myCompanies.map((company) => ({ id: company.id, name: company.name, logo: getCompanyLogoUrl(company, theme) })),
    [myCompanies, theme]
  );

  const currentCompanyId = selectedCompanyId ?? activeCompanyId ?? user?.company_id ?? null;
  const effectiveCompanyOptions =
    companyOptions.length > 0
      ? companyOptions
      : currentCompanyId != null
        ? [{ id: currentCompanyId, name: `Company #${currentCompanyId}`, logo: null }]
        : [];
  const companySelectOptions = useMemo(
    () =>
      effectiveCompanyOptions.map((company) => ({
        value: String(company.id),
        label: company.name,
        keywords: company.name,
        avatarUrl: company.logo,
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

  // ── Personalizzazione sidebar (preferiti + ordine), per utente × azienda ──────
  useEffect(() => {
    if (currentCompanyId == null) {
      setFavorites([]);
      setItemOrder({});
      setGroupOrder([]);
      return;
    }
    let cancelled = false;
    getSidebarPreferencesApi(currentCompanyId)
      .then((prefs) => {
        if (cancelled) return;
        setFavorites(Array.isArray(prefs.favorites) ? prefs.favorites : []);
        setItemOrder(prefs.item_order && typeof prefs.item_order === "object" ? prefs.item_order : {});
        setGroupOrder(Array.isArray(prefs.group_order) ? prefs.group_order : []);
      })
      .catch(() => {
        if (!cancelled) {
          setFavorites([]);
          setItemOrder({});
          setGroupOrder([]);
        }
      });
    return () => { cancelled = true; };
  }, [currentCompanyId]);

  const persistSidebarPrefs = useCallback(
    (favs: string[], order: Record<string, string[]>, groups: string[]) => {
      if (currentCompanyId == null) return;
      void updateSidebarPreferencesApi({
        company_id: currentCompanyId,
        favorites: favs,
        item_order: order,
        group_order: groups,
      }).catch(() => {});
    },
    [currentCompanyId],
  );

  const toggleFavorite = useCallback(
    (path: string) => {
      setFavorites((prev) => {
        const next = prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path];
        persistSidebarPrefs(next, itemOrder, groupOrder);
        return next;
      });
    },
    [itemOrder, groupOrder, persistSidebarPrefs],
  );

  // Ordine effettivo degli item di un gruppo: item_order + fallback all'ordine di default.
  const orderedGroupItems = useCallback(
    (groupKey: NavItem["group"]): NavItem[] => {
      const items = groupedNavItems[groupKey];
      const order = itemOrder[groupKey] ?? [];
      const byPath = new Map(items.map((i) => [i.to, i] as const));
      const out: NavItem[] = [];
      order.forEach((p) => {
        const it = byPath.get(p);
        if (it) { out.push(it); byPath.delete(p); }
      });
      items.forEach((i) => { if (byPath.has(i.to)) out.push(i); });
      return out;
    },
    [groupedNavItems, itemOrder],
  );

  // Ordine delle categorie (group_order) con fallback all'ordine di default.
  const orderedGroups = useMemo(() => {
    const present = DEFAULT_GROUP_ORDER.filter((g) => (groupedNavItems[g]?.length ?? 0) > 0);
    const inOrder = groupOrder.filter((g): g is NavItem["group"] => (present as string[]).includes(g));
    const rest = present.filter((g) => !inOrder.includes(g));
    return [...inOrder, ...rest] as Array<NavItem["group"]>;
  }, [groupOrder, groupedNavItems]);

  // Preferiti raggruppati per categoria; ORDINE (categorie e voci) allineato alla nav
  // principale: le categorie seguono group_order, le voci l'item_order del loro gruppo.
  const favoritesByGroup = useMemo(() => {
    const map = new Map<NavItem["group"], NavItem[]>();
    orderedGroups.forEach((groupKey) => {
      const favs = orderedGroupItems(groupKey).filter((i) => favorites.includes(i.to));
      if (favs.length > 0) map.set(groupKey, favs);
    });
    return map;
  }, [orderedGroups, orderedGroupItems, favorites]);

  const hasFavorites = favorites.length > 0;

  // Sorgente per la sidebar compatta: sempre TUTTE le voci (preferite e non),
  // divise per gruppo.
  const compactGroups = useMemo<Array<[NavItem["group"], NavItem[]]>>(() => {
    return orderedGroups
      .map((g) => [g, orderedGroupItems(g)] as [NavItem["group"], NavItem[]])
      .filter(([, items]) => items.length > 0);
  }, [orderedGroups, orderedGroupItems]);

  const handleItemReorder = useCallback(
    (group: string, dragPath: string, targetPath: string, before: boolean) => {
      if (dragPath === targetPath) return;
      const current = orderedGroupItems(group as NavItem["group"]).map((i) => i.to);
      const next = current.filter((p) => p !== dragPath);
      const ti = next.indexOf(targetPath);
      if (ti === -1) next.push(dragPath);
      else next.splice(before ? ti : ti + 1, 0, dragPath);
      const nextOrder = { ...itemOrder, [group]: next };
      setItemOrder(nextOrder);
      persistSidebarPrefs(favorites, nextOrder, groupOrder);
    },
    [favorites, itemOrder, groupOrder, orderedGroupItems, persistSidebarPrefs],
  );

  const handleGroupReorder = useCallback(
    (dragGroup: string, targetGroup: string, before: boolean) => {
      if (dragGroup === targetGroup) return;
      const next = orderedGroups.filter((g) => g !== dragGroup) as Array<NavItem["group"]>;
      const ti = next.indexOf(targetGroup as NavItem["group"]);
      if (ti === -1) next.push(dragGroup as NavItem["group"]);
      else next.splice(before ? ti : ti + 1, 0, dragGroup as NavItem["group"]);
      setGroupOrder(next);
      persistSidebarPrefs(favorites, itemOrder, next);
    },
    [orderedGroups, favorites, itemOrder, persistSidebarPrefs],
  );

  // Render di una voce nav con stella (preferiti). Se `reorderable`, l'intera riga è
  // trascinabile per riordinare le voci dentro la loro categoria, con indicatore di rilascio.
  const renderNavItem = (item: NavItem, ctx: string, reorderable: boolean) => {
    const isFav = favorites.includes(item.to);
    const isDragging = itemDrag?.path === item.to && itemDrag?.group === ctx;
    const dropHere = reorderable && itemDrag?.group === ctx && itemDrop?.group === ctx && itemDrop?.path === item.to && !isDragging;
    return (
      <div key={`${ctx}-${item.to}`} className="relative">
        {dropHere && itemDrop?.before && (
          <div className="pointer-events-none absolute -top-[3px] left-2 right-2 z-20 h-[3px] rounded-full bg-brand-yellow shadow-[0_0_6px_rgba(252,212,60,0.7)]" />
        )}
        <div
          draggable={reorderable}
          onDragStart={reorderable ? (e) => { setItemDrag({ path: item.to, group: ctx }); e.dataTransfer.effectAllowed = "move"; } : undefined}
          onDragEnd={reorderable ? () => { setItemDrag(null); setItemDrop(null); } : undefined}
          onDragOver={reorderable ? (e) => {
            if (!itemDrag || itemDrag.group !== ctx) return;
            e.preventDefault();
            const r = e.currentTarget.getBoundingClientRect();
            const before = e.clientY < r.top + r.height / 2;
            if (itemDrop?.path !== item.to || itemDrop?.before !== before) setItemDrop({ group: ctx, path: item.to, before });
          } : undefined}
          onDrop={reorderable ? (e) => {
            if (itemDrag && itemDrag.group === ctx) {
              e.preventDefault();
              const r = e.currentTarget.getBoundingClientRect();
              const before = e.clientY < r.top + r.height / 2;
              handleItemReorder(ctx, itemDrag.path, item.to, before);
            }
            setItemDrag(null); setItemDrop(null);
          } : undefined}
          className={`group relative rounded-md transition-[transform,opacity] duration-150 ${reorderable ? "cursor-grab active:cursor-grabbing" : ""} ${isDragging ? "scale-[0.97] opacity-40" : ""}`}
        >
          <NavLink
            to={{ pathname: item.to, search: cleanSearch }}
            end={item.to === "/"}
            draggable={false}
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 pl-3 ${reorderable ? "pr-14" : "pr-8"} py-2.5 rounded-md text-[13px] font-semibold transition-all duration-150 select-none
              ${isActive ? "bg-white text-[#0a0a0a]" : "text-[rgba(255,255,255,0.65)] hover:bg-[rgba(255,255,255,0.10)] hover:text-white"}`
            }
          >
            <span className="nav-ico">{item.icon}</span>
            <span className="truncate">{item.label}</span>
          </NavLink>
          {reorderable && (
            <Icon
              name="menu"
              className="pointer-events-none absolute right-8 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[rgba(255,255,255,0.5)] opacity-0 transition-opacity group-hover:opacity-70"
            />
          )}
          <button
            type="button"
            onClick={() => toggleFavorite(item.to)}
            className={`absolute right-1.5 top-1/2 -translate-y-1/2 grid h-6 w-6 place-items-center rounded transition-opacity
            ${isFav ? "text-brand-yellow opacity-100" : "text-[rgba(255,255,255,0.5)] opacity-0 hover:text-white group-hover:opacity-100"}`}
            title={isFav ? "Rimuovi dai preferiti" : "Aggiungi ai preferiti"}
            aria-label={isFav ? "Rimuovi dai preferiti" : "Aggiungi ai preferiti"}
          >
            {isFav && <span className="fav-spark" aria-hidden />}
            <Icon key={isFav ? "on" : "off"} name="star" className={`h-3.5 w-3.5 ${isFav ? "fav-burst" : ""}`} />
          </button>
        </div>
        {dropHere && !itemDrop?.before && (
          <div className="pointer-events-none absolute -bottom-[3px] left-2 right-2 z-20 h-[3px] rounded-full bg-brand-yellow shadow-[0_0_6px_rgba(252,212,60,0.7)]" />
        )}
      </div>
    );
  };
  const cleanSearch = useMemo(() => {
    const params = new URLSearchParams(location.search);
    params.delete("quote_id");
    const value = params.toString();
    return value ? `?${value}` : "";
  }, [location.search]);
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
    <div className="flex h-dvh bg-paper dark:bg-ink overflow-hidden">
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
          fixed lg:static inset-y-0 left-0 z-50 flex flex-col
          ${compact ? "w-[72px]" : "w-60"}
          text-paper
          transition-[width,transform] duration-300 ease-[cubic-bezier(.2,.7,.2,1)]
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
        style={{ background: "#0a0a0a", borderRight: "1px solid rgba(255,255,255,.08)" }}
      >
        {/* Brand */}
        <div
          className={`flex items-center gap-3 py-5 ${compact ? "justify-center px-0" : "px-5"}`}
          style={{ borderBottom: "1px solid rgba(255,255,255,.08)" }}
        >
          <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center">
            {brandSymbol ? (
              <img
                src={brandSymbol}
                alt={brand?.app_name ?? "Logo"}
                className="w-8 h-8 object-contain"
              />
            ) : (
              <svg viewBox="0 0 32 32" fill="none" aria-label="Italia Digitale logo">
                <rect width="32" height="32" rx="8" fill="white" fillOpacity=".12" />
                <path d="M8 16h16M16 8v16" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            )}
          </div>
          {!compact && (
            <div>
              <p className="font-display font-bold text-[13px] uppercase tracking-wider leading-tight">
                {brand?.app_name ?? "Italia Digitale"}
              </p>
              <p className="font-body text-[10px] text-muted-dark mt-0.5">
                Admin Dashboard
              </p>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav
          className={`no-scrollbar flex-1 overflow-y-auto flex flex-col ${
            compact ? "items-center px-2 py-4 gap-1" : "px-3 py-4 gap-0.5"
          }`}
        >
          {compact ? (
            compactGroups.map(([groupKey, items], gi) => (
              <div key={`c-${groupKey}`} className="flex w-full flex-col items-center gap-1">
                {gi > 0 && <div className="my-1 h-px w-8 bg-white/10" />}
                {items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    title={item.label}
                    onClick={() => setSidebarOpen(false)}
                    className={({ isActive }) =>
                      `grid h-10 w-10 place-items-center rounded-md transition-colors ${
                        isActive ? "bg-white/15 text-white" : "text-[rgba(255,255,255,0.65)] hover:text-white hover:bg-white/10"
                      }`
                    }
                  >
                    <span className="nav-ico">{item.icon}</span>
                  </NavLink>
                ))}
              </div>
            ))
          ) : (
          <>
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
                avatarShape="logo"
                className="w-full"
                triggerClassName="border-white/20 bg-white/10 px-2.5 py-2 text-[12px] font-semibold text-white focus:border-white/40"
              />
            </label>
          </div>
          {hasFavorites && (
            <div className="mb-2 rounded-lg bg-[rgba(255,255,255,0.04)] pb-1.5">
              <p className="flex items-center gap-1.5 px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-brand-yellow">
                <Icon name="star" className="h-3 w-3" /> Preferiti
              </p>
              {[...favoritesByGroup.entries()].map(([groupKey, favItems]) => (
                <div key={`fav-${groupKey}`} className="mb-1">
                  <p className="px-3 pb-0.5 pt-1.5 text-[9px] font-semibold uppercase tracking-wider text-[rgba(255,255,255,0.4)]">
                    {NAV_GROUP_LABELS[groupKey]}
                  </p>
                  <div className="flex flex-col gap-0.5">
                    {favItems.map((item) => renderNavItem(item, `fav:${groupKey}`, false))}
                  </div>
                </div>
              ))}
            </div>
          )}
          {orderedGroups.map((groupKey) => {
            const items = groupedNavItems[groupKey];
            if (items.length === 0) return null;

            const groupDropHere = groupDrag && groupDrag !== groupKey && groupDrop?.group === groupKey;
            return (
              <div
                key={groupKey}
                className={`relative mb-2 rounded-md transition-[transform,opacity] duration-150 ${groupDrag === groupKey ? "scale-[0.98] opacity-40" : ""}`}
                onDragOver={(e) => {
                  if (!groupDrag || groupDrag === groupKey) return;
                  e.preventDefault();
                  const r = e.currentTarget.getBoundingClientRect();
                  const before = e.clientY < r.top + r.height / 2;
                  if (groupDrop?.group !== groupKey || groupDrop?.before !== before) setGroupDrop({ group: groupKey, before });
                }}
                onDrop={(e) => {
                  if (groupDrag && groupDrag !== groupKey) {
                    e.preventDefault();
                    const r = e.currentTarget.getBoundingClientRect();
                    const before = e.clientY < r.top + r.height / 2;
                    handleGroupReorder(groupDrag, groupKey, before);
                  }
                  setGroupDrag(null); setGroupDrop(null);
                }}
              >
                {groupDropHere && groupDrop?.before && (
                  <div className="pointer-events-none absolute -top-1 left-2 right-2 z-20 h-[3px] rounded-full bg-brand-cyan shadow-[0_0_6px_rgba(46,195,243,0.7)]" />
                )}
                <p
                  draggable
                  onDragStart={(e) => { setGroupDrag(groupKey); e.dataTransfer.effectAllowed = "move"; }}
                  onDragEnd={() => { setGroupDrag(null); setGroupDrop(null); }}
                  className="group/gh flex cursor-grab select-none items-center gap-1.5 px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-[rgba(255,255,255,0.45)] active:cursor-grabbing hover:text-[rgba(255,255,255,0.7)]"
                  title="Trascina per riordinare la categoria"
                >
                  {NAV_GROUP_LABELS[groupKey]}
                  <Icon name="menu" className="h-3 w-3 opacity-0 transition-opacity group-hover/gh:opacity-70" />
                </p>
                <div className="flex flex-col gap-0.5">
                  {orderedGroupItems(groupKey).map((item) => renderNavItem(item, groupKey, true))}

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
                {groupDropHere && !groupDrop?.before && (
                  <div className="pointer-events-none absolute -bottom-1 left-2 right-2 z-20 h-[3px] rounded-full bg-brand-cyan shadow-[0_0_6px_rgba(46,195,243,0.7)]" />
                )}
              </div>
            );
          })}
          </>
          )}
        </nav>

        {/* Footer */}
        <div
          className={`flex flex-col gap-2 ${compact ? "p-2" : "p-4"}`}
          style={{ borderTop: "1px solid rgba(255,255,255,.08)" }}
        >
          <button
            onClick={toggleCollapsed}
            title={compact ? "Espandi menu" : "Comprimi menu"}
            className={`hidden lg:flex items-center gap-3 py-2 rounded-md text-[13px] text-[rgba(255,255,255,0.65)] hover:text-white hover:bg-[rgba(255,255,255,0.10)] transition-colors w-full ${compact ? "justify-center px-0" : "px-3"}`}
          >
            <span className="nav-ico">
              <Icon
                name="chevron-right"
                className={`w-[18px] h-[18px] transition-transform duration-300 ${compact ? "" : "rotate-180"}`}
              />
            </span>
            {!compact && "Comprimi menu"}
          </button>
          <button
            onClick={logout}
            title={compact ? "Esci" : undefined}
            className={`flex items-center gap-3 py-2 rounded-md text-[13px] text-[rgba(255,255,255,0.65)] hover:text-danger hover:bg-danger/10 transition-colors w-full ${compact ? "justify-center px-0" : "px-3"}`}
          >
            <span className="nav-ico"><Icon name="logout" /></span>
            {!compact && "Esci"}
          </button>
        </div>
      </aside>

      {/* ── Main area ─────────────────────────────────────── */}
      <div ref={mainRef} className="flex-1 flex flex-col min-w-0">
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

          {/* Spacer + barra collegamenti rapidi (centro). Su schermi stretti la barra
              si nasconde (hidden md:flex nel componente) e questo div resta solo spacer. */}
          <div className="flex flex-1 min-w-0 justify-center px-2">
            <QuickLinksBar />
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              id={NOTIF_BELL_ID}
              onClick={() => setNotifOpen((prev) => { const next = !prev; if (next) void notifications.reload(); return next; })}
              aria-label="Centro notifiche"
              title="Centro notifiche"
              className={`relative inline-flex h-9 w-9 items-center justify-center rounded-pill border bg-paper text-ink transition-colors hover:bg-cream dark:bg-[#1c1c20] dark:text-[#f4f4f7] dark:hover:bg-[#252529] ${notifOpen ? "border-brand-magenta text-brand-magenta dark:border-brand-magenta dark:text-brand-magenta" : "border-line dark:border-[#2a2a2e]"}`}
            >
              {notifPing > 0 && <span key={`halo-${notifPing}`} className="notif-halo" aria-hidden />}
              <span className="nav-ico"><Icon key={`bell-${notifPing}`} name="bell" className={`w-4 h-4 ${notifPing > 0 ? "notif-ring" : ""}`} /></span>
              {notifications.totalUnread > 0 && (
                <span
                  key={`badge-${notifPing}`}
                  className={`absolute -top-1.5 -right-1.5 grid min-w-[17px] h-[17px] place-items-center rounded-full border-2 border-paper bg-brand-magenta px-1 text-[10px] font-bold tabular-nums text-white dark:border-[#131316] ${notifPing > 0 ? "notif-pop" : ""}`}
                >
                  {notifications.totalUnread > 99 ? "99+" : notifications.totalUnread}
                </span>
              )}
            </button>

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
              onClick={toggleFullscreen}
              aria-pressed={isFullscreen}
              title={isFullscreen ? "Esci da Full focus" : "Full focus (schermo intero)"}
              className={`inline-flex h-9 w-9 items-center justify-center rounded-pill border transition-colors ${
                isFullscreen
                  ? "border-brand-magenta bg-brand-magenta/10 text-brand-magenta"
                  : "border-line bg-paper text-ink hover:bg-cream dark:border-[#2a2a2e] dark:bg-[#1c1c20] dark:text-[#f4f4f7] dark:hover:bg-[#252529]"
              }`}
            >
              <span className="nav-ico"><Icon name={isFullscreen ? "minimize" : "maximize"} className="w-4 h-4" /></span>
            </button>

            <button
              type="button"
              onClick={(e) => toggleTheme({ x: e.clientX, y: e.clientY })}
              title={theme === "dark" ? "Attiva tema chiaro" : "Attiva tema scuro"}
              className="inline-flex h-9 w-9 items-center justify-center rounded-pill border border-line bg-paper text-ink transition-colors hover:bg-cream dark:border-[#2a2a2e] dark:bg-[#1c1c20] dark:text-[#f4f4f7] dark:hover:bg-[#252529]"
            >
              <span className="nav-ico"><ThemeToggleIcon className="w-4 h-4" /></span>
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
          hiddenTabs={hiddenNotifTabs}
          onOpenPreferences={() => {
            setNotifOpen(false);
            setNotifPrefsOpen(true);
          }}
        />

        {/* Toast in-app degli arrivi realtime: dopo pochi secondi si ripiegano
            in un aeroplanino che vola dentro la campanella. */}
        <NotificationToastLayer />

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
