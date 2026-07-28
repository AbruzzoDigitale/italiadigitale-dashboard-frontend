import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  getKpiCatalogApi,
  getKpiLiveApi,
  type KpiCatalogItem,
  type KpiValue,
} from "../../api/kpi";
import { getUsersApi } from "../../api/users";
import { listWorkAreasApi } from "../../api/workAreas";
import { getClientsApi } from "../../api/clients";

export interface KpiFilter {
  operatorIds: number[];
  workAreaIds: number[];
  clientIds: number[];
}

export interface KpiOption {
  id: number;
  label: string;
}

const EMPTY_FILTER: KpiFilter = { operatorIds: [], workAreaIds: [], clientIds: [] };

interface KpiDataValue {
  values: Record<string, KpiValue>;
  catalog: KpiCatalogItem[];
  loading: boolean;
  month: string;
  setMonth: (m: string) => void;
  companyId: number | null;
  reload: () => void;
  privileged: boolean;
  filter: KpiFilter;
  setFilter: (f: KpiFilter) => void;
  options: { operators: KpiOption[]; areas: KpiOption[]; clients: KpiOption[] };
  userName: (id: number) => string;
  areaName: (id: number) => string;
  clientName: (id: number) => string;
}

const KpiDataContext = createContext<KpiDataValue | null>(null);

function loadFilter(companyId: number | null): KpiFilter {
  if (companyId == null) return EMPTY_FILTER;
  try {
    const raw = localStorage.getItem(`kpi_filter_${companyId}`);
    if (raw) {
      const p = JSON.parse(raw);
      return {
        operatorIds: Array.isArray(p.operatorIds) ? p.operatorIds : [],
        workAreaIds: Array.isArray(p.workAreaIds) ? p.workAreaIds : [],
        clientIds: Array.isArray(p.clientIds) ? p.clientIds : [],
      };
    }
  } catch {
    /* ignore */
  }
  return EMPTY_FILTER;
}

export function KpiDataProvider({
  companyId,
  privileged,
  managedAreaIds,
  month: initialMonth,
  children,
}: {
  companyId: number | null;
  privileged: boolean;
  /** Se valorizzato (PM), limita le opzioni dei filtri alle sue aree/operatori.
   *  `null`/undefined = nessuna restrizione (admin). Lo scoping dati è comunque
   *  garantito lato backend (vedi kpi._resolve_filters). */
  managedAreaIds?: number[] | null;
  month?: string;
  children: ReactNode;
}) {
  const [month, setMonth] = useState(() => initialMonth ?? new Date().toISOString().slice(0, 7));

  const [values, setValues] = useState<Record<string, KpiValue>>({});
  const [catalog, setCatalog] = useState<KpiCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [filter, setFilterState] = useState<KpiFilter>(() => loadFilter(companyId));
  const [operators, setOperators] = useState<KpiOption[]>([]);
  const [areas, setAreas] = useState<KpiOption[]>([]);
  const [clients, setClients] = useState<KpiOption[]>([]);
  const [userNames, setUserNames] = useState<Record<number, string>>({});

  // Catalogo (una volta).
  useEffect(() => {
    let cancelled = false;
    getKpiCatalogApi()
      .then((c) => !cancelled && setCatalog(c))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Ricarica il filtro salvato al cambio azienda.
  useEffect(() => {
    setFilterState(loadFilter(companyId));
  }, [companyId]);

  const setFilter = useCallback(
    (f: KpiFilter) => {
      setFilterState(f);
      if (companyId != null) {
        try {
          localStorage.setItem(`kpi_filter_${companyId}`, JSON.stringify(f));
        } catch {
          /* ignore */
        }
      }
    },
    [companyId],
  );

  // Valori live (dipendono da azienda, mese, filtro, reload).
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getKpiLiveApi({
      companyId,
      month,
      operatorIds: filter.operatorIds,
      workAreaIds: filter.workAreaIds,
      clientIds: filter.clientIds,
    })
      .then((live) => {
        if (cancelled) return;
        const map: Record<string, KpiValue> = {};
        for (const k of live.kpis) map[k.id] = k;
        setValues(map);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, month, filter, reloadKey]);

  // Opzioni + mappa nomi. I nomi dei CLIENTI servono anche all'operatore (widget
  // "per cliente"); operatori e aree servono SOLO ad admin/PM (barra filtri e confronti).
  useEffect(() => {
    if (companyId == null) {
      setOperators([]);
      setAreas([]);
      setClients([]);
      setUserNames({});
      return;
    }
    let cancelled = false;

    // Clienti: il backend restituisce solo quelli nello scope dell'utente (un operatore
    // vede unicamente i propri), quindi risolvere i nomi qui non espone dati altrui.
    getClientsApi({ company_id: companyId, per_page: 500 })
      .then((resp) =>
        !cancelled &&
        setClients(resp.data.map((c) => ({ id: c.id, label: c.commercial_name || c.name }))),
      )
      .catch(() => {});

    if (!privileged) {
      // L'operatore non ha bisogno dell'elenco operatori/aree (nessun confronto/filtro).
      setOperators([]);
      setAreas([]);
      setUserNames({});
      return () => {
        cancelled = true;
      };
    }

    // Per i PM le opzioni sono ristrette alle proprie aree e ai relativi operatori.
    const areaScope = managedAreaIds != null ? new Set(managedAreaIds) : null;
    getUsersApi(companyId)
      .then((users) => {
        if (cancelled) return;
        const inScope = areaScope
          ? users.filter((u) => (u.work_area_ids ?? []).some((a) => areaScope.has(a)))
          : users;
        setOperators(inScope.map((u) => ({ id: u.id, label: u.full_name || u.username })));
        // La mappa nomi resta completa (serve a risolvere eventuali id nei breakdown).
        const names: Record<number, string> = {};
        for (const u of users) names[u.id] = u.full_name || u.username;
        setUserNames(names);
      })
      .catch(() => {});
    listWorkAreasApi({ company_id: companyId })
      .then((list) => {
        if (cancelled) return;
        const scoped = areaScope ? list.filter((a) => areaScope.has(a.id)) : list;
        setAreas(scoped.map((a) => ({ id: a.id, label: a.name })));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // managedAreaIds serializzato: dipendenza stabile (evita re-fetch a ogni render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [privileged, companyId, (managedAreaIds ?? []).join(",")]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  const userName = useCallback(
    (id: number) => userNames[id] ?? `Utente ${id}`,
    [userNames],
  );
  const areaName = useCallback(
    (id: number) => areas.find((a) => a.id === id)?.label ?? `Area ${id}`,
    [areas],
  );
  const clientName = useCallback(
    (id: number) => clients.find((c) => c.id === id)?.label ?? `Cliente ${id}`,
    [clients],
  );

  return (
    <KpiDataContext.Provider
      value={{
        values,
        catalog,
        loading,
        month,
        setMonth,
        companyId,
        reload,
        privileged,
        filter,
        setFilter,
        options: { operators, areas, clients },
        userName,
        areaName,
        clientName,
      }}
    >
      {children}
    </KpiDataContext.Provider>
  );
}

export function useKpiData(): KpiDataValue {
  const ctx = useContext(KpiDataContext);
  if (!ctx) throw new Error("useKpiData deve essere usato dentro <KpiDataProvider>");
  return ctx;
}
