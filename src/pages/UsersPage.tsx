import { useState, useCallback, useMemo, useEffect } from "react";
import { useAuth } from "../hooks/useAuth";
import { useUsers } from "../hooks/useUsers";
import { useSelectedCompanyId } from "../hooks/useSelectedCompanyId";
import { useCompanies } from "../hooks/useCompanies";
import { useWorkAreas } from "../hooks/useWorkAreas";
import { getClientsApi, type Client } from "../api/clients";
import {
  createUserApi,
  updateUserApi,
  deleteUserApi,
  type User,
  type CreateUserPayload,
  type UpdateUserPayload,
  type AccessLevel,
} from "../api/users";
import type { WorkArea } from "../api/workAreas";
import { listRolesApi, type Role } from "../api/roles";
import { useToast } from "../context/ToastContext";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Avatar } from "../components/ui/Avatar";
import { Modal } from "../components/ui/Modal";
import { Input } from "../components/ui/Input";
import { Icon } from "../components/ui/Icon";
import { Spinner } from "../components/ui/Spinner";
import { SearchableSelect } from "../components/ui/SearchableSelect";
import { MultiSelect } from "../components/ui/MultiSelect";
import { WorkAreaBadge } from "../components/work-areas/WorkAreaBadge";
import { WorkAreaMultiSelect } from "../components/work-areas/WorkAreaMultiSelect";
import { Checkbox } from "../components/ui/Checkbox";

// ── Helpers ──────────────────────────────────────────────────────────────────

interface CompanyNode {
  id: number;
  name: string;
  children: CompanyNode[];
}

function flattenCompanies(list: CompanyNode[]): { id: number; name: string }[] {
  return list.flatMap((c) => [{ id: c.id, name: c.name }, ...flattenCompanies(c.children)]);
}

// ── User modal (create + edit) ───────────────────────────────────────────────

interface UserModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  user?: User | null;
  defaultCompanyId?: number | null;
  companiesList: { id: number; name: string }[];
  workAreasList: WorkArea[];
  canAssignRoles: boolean;
}

function UserModal({ open, onClose, onSaved, user, defaultCompanyId, companiesList, workAreasList, canAssignRoles }: UserModalProps) {
  const toast = useToast();
  const isEdit = !!user;
  const [roles, setRoles] = useState<Role[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);

  const [form, setForm] = useState({
    full_name: user?.full_name ?? "",
    username: user?.username ?? "",
    email: user?.email ?? "",
    password: "",
    access_level: (user?.access_level ?? (user?.is_admin ? "admin" : "operator")) as AccessLevel,
    is_active: user?.is_active ?? true,
    company_id: user?.company_id ? String(user.company_id) : "",
    company_ids: (user?.company_ids ?? []).map(String),
    role_ids: (user?.role_ids ?? []).map(String),
    work_area_ids: (user?.work_area_ids ?? []).map(String),
    assigned_client_ids: (user?.assigned_client_ids ?? []).map(String),
    can_use_llm: user?.is_admin ? true : (user?.operator_permissions ?? []).includes("llm"),
  });
  const [companySearch, setCompanySearch] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;

    if (user) {
      setForm({
        full_name: user.full_name ?? "",
        username: user.username ?? "",
        email: user.email ?? "",
        password: "",
        access_level: (user.access_level ?? (user.is_admin ? "admin" : "operator")) as AccessLevel,
        is_active: user.is_active ?? true,
        company_id: user.company_id ? String(user.company_id) : "",
        company_ids: (user.company_ids ?? []).map(String),
        role_ids: (user.role_ids ?? []).map(String),
        work_area_ids: (user.work_area_ids ?? []).map(String),
        assigned_client_ids: (user.assigned_client_ids ?? []).map(String),
        can_use_llm: user.is_admin ? true : (user.operator_permissions ?? []).includes("llm"),
      });
      return;
    }

    const fallbackCompanyId = defaultCompanyId ? String(defaultCompanyId) : "";
    setForm({
      full_name: "",
      username: "",
      email: "",
      password: "",
      access_level: "operator" as AccessLevel,
      is_active: true,
      company_id: fallbackCompanyId,
      company_ids: fallbackCompanyId ? [fallbackCompanyId] : [],
      role_ids: [],
      work_area_ids: [],
      assigned_client_ids: [],
      can_use_llm: false,
    });
    setErrors({});
    setCompanySearch("");
  }, [open, user, defaultCompanyId]);

  const set = (k: string, v: string | boolean) =>
    setForm((f) => ({ ...f, [k]: v }));

  const toggleCompany = (companyId: string) => {
    setForm((prev) => {
      const isSelected = prev.company_ids.includes(companyId);
      const nextCompanyIds = isSelected
        ? prev.company_ids.filter((id) => id !== companyId)
        : [...prev.company_ids, companyId];

      const nextPrimary = prev.company_id && !nextCompanyIds.includes(prev.company_id)
        ? (nextCompanyIds[0] ?? "")
        : prev.company_id;

      return {
        ...prev,
        company_ids: nextCompanyIds,
        company_id: nextPrimary,
      };
    });
  };

  const assignOnlyCompany = (companyId: string) => {
    if (!companyId) {
      setForm((prev) => ({ ...prev, company_id: "", company_ids: [], role_ids: [] }));
      return;
    }
    setForm((prev) => ({
      ...prev,
      company_id: companyId,
      company_ids: [companyId],
      role_ids: [],
    }));
  };

  const filteredCompanies = companiesList.filter((company) => {
    const q = companySearch.trim().toLowerCase();
    if (!q) return true;
    return company.name.toLowerCase().includes(q);
  });

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.full_name.trim()) e.full_name = "Campo obbligatorio";
    if (!form.username.trim()) e.username = "Campo obbligatorio";
    if (!form.email.trim()) e.email = "Campo obbligatorio";
    if (!isEdit && !form.password.trim()) e.password = "Campo obbligatorio";
    if (canAssignRoles && outOfScopeRoleIds.length > 0) {
      e.role_ids = "Alcuni ruoli selezionati non appartengono alle aziende assegnate";
    }
    return e;
  };

  const roleScopeCompanyIds = useMemo(() => {
    if (form.company_ids.length > 0) return new Set(form.company_ids.map(Number));
    if (form.company_id) return new Set([Number(form.company_id)]);
    return new Set<number>();
  }, [form.company_ids, form.company_id]);

  useEffect(() => {
    if (!canAssignRoles || !open) {
      setRoles([]);
      return;
    }

    const companyIds = Array.from(roleScopeCompanyIds);
    if (companyIds.length === 0) {
      setRoles([]);
      return;
    }

    let cancelled = false;
    Promise.all(companyIds.map((companyId) => listRolesApi({ company_id: companyId })))
      .then((chunks) => {
        if (cancelled) return;
        const uniqueById = new Map<number, Role>();
        for (const role of chunks.flat()) {
          if (!uniqueById.has(role.id)) uniqueById.set(role.id, role);
        }
        setRoles(Array.from(uniqueById.values()));
      })
      .catch(() => {
        if (!cancelled) setRoles([]);
      });

    return () => {
      cancelled = true;
    };
  }, [canAssignRoles, open, roleScopeCompanyIds]);

  useEffect(() => {
    if (!open) return;

    const companyIds = form.company_ids.length > 0
      ? form.company_ids.map(Number)
      : form.company_id
        ? [Number(form.company_id)]
        : [];

    if (companyIds.length === 0) {
      setClients([]);
      setClientsLoading(false);
      return;
    }

    let cancelled = false;
    setClientsLoading(true);

    Promise.all(companyIds.map((companyId) => getClientsApi({ company_id: companyId, per_page: 200 })))
      .then((chunks) => {
        if (cancelled) return;
        const byId = new Map<number, Client>();
        for (const clientList of chunks) {
          for (const clientItem of clientList.data) {
            if (!byId.has(clientItem.id)) byId.set(clientItem.id, clientItem);
          }
        }
        setClients(Array.from(byId.values()));
      })
      .catch(() => {
        if (!cancelled) setClients([]);
      })
      .finally(() => {
        if (!cancelled) setClientsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, form.company_id, form.company_ids]);

  useEffect(() => {
    const allowed = new Set(clients.map((client) => client.id));
    setForm((current) => ({
      ...current,
      assigned_client_ids: current.assigned_client_ids.filter((id) => allowed.has(Number(id))),
    }));
  }, [clients]);

  const scopedRoleOptions = useMemo(() => {
    if (roleScopeCompanyIds.size === 0) return [];
    return roles
      .filter((role) => roleScopeCompanyIds.has(role.company_id))
      .map((role) => ({ id: role.id, label: role.name, color: role.color }));
  }, [roles, roleScopeCompanyIds]);

  const outOfScopeRoleIds = useMemo(() => {
    if (roleScopeCompanyIds.size === 0) return form.role_ids;
    return form.role_ids.filter((roleId) => {
      const role = roles.find((item) => item.id === Number(roleId));
      if (!role) return true;
      return !roleScopeCompanyIds.has(role.company_id);
    });
  }, [form.role_ids, roles, roleScopeCompanyIds]);

  const handleSave = useCallback(async () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setSaving(true);
    try {
      if (isEdit && user) {
        const currentOperatorPermissions = (user.operator_permissions ?? []).filter((permission) => permission !== "llm");
        // Le viste operatore (incl. LLM) si gestiscono solo per l'operatore; admin e PM hanno viste fisse lato backend.
        const nextOperatorPermissions = form.access_level !== "operator"
          ? null
          : form.can_use_llm
            ? Array.from(new Set([...currentOperatorPermissions, "llm"]))
            : currentOperatorPermissions;
        const payload: UpdateUserPayload = {
          full_name: form.full_name,
          username: form.username,
          email: form.email,
          access_level: form.access_level,
          is_active: form.is_active,
          company_id: form.company_id ? Number(form.company_id) : null,
          company_ids: form.company_ids.length ? form.company_ids.map(Number) : null,
          role_ids: form.role_ids.length ? form.role_ids.map(Number) : null,
          work_area_ids: form.work_area_ids.length ? form.work_area_ids.map(Number) : null,
          assigned_client_ids: form.assigned_client_ids.length ? form.assigned_client_ids.map(Number) : null,
          operator_permissions: nextOperatorPermissions,
        };
        await updateUserApi(user.id, payload);
        toast.success("Utente aggiornato");
      } else {
        const nextOperatorPermissions = form.access_level !== "operator"
          ? null
          : form.can_use_llm
            ? ["llm"]
            : null;
        const payload: CreateUserPayload = {
          full_name: form.full_name,
          username: form.username,
          email: form.email,
          password: form.password,
          access_level: form.access_level,
          company_id: form.company_id ? Number(form.company_id) : null,
          company_ids: form.company_ids.length ? form.company_ids.map(Number) : null,
          role_ids: form.role_ids.length ? form.role_ids.map(Number) : null,
          work_area_ids: form.work_area_ids.length ? form.work_area_ids.map(Number) : null,
          assigned_client_ids: form.assigned_client_ids.length ? form.assigned_client_ids.map(Number) : null,
          operator_permissions: nextOperatorPermissions,
        };
        await createUserApi(payload);
        toast.success("Utente creato");
      }
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore");
    } finally {
      setSaving(false);
    }
  }, [form, isEdit, user, toast, onSaved, onClose]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Modifica utente" : "Nuovo utente"}
      size="xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Annulla</Button>
          <Button variant="primary" onClick={handleSave} loading={saving}>
            {isEdit ? "Salva modifiche" : "Crea utente"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Nome completo"
            value={form.full_name}
            onChange={(e) => set("full_name", e.target.value)}
            error={errors.full_name}
            placeholder="Mario Rossi"
          />
          <Input
            label="Username"
            value={form.username}
            onChange={(e) => set("username", e.target.value)}
            error={errors.username}
            placeholder="mario.rossi"
          />
        </div>
        <Input
          label="Email"
          type="email"
          value={form.email}
          onChange={(e) => set("email", e.target.value)}
          error={errors.email}
          placeholder="mario@example.com"
        />
        {!isEdit && (
          <div className="relative">
            <Input
              label="Password"
              type={showPwd ? "text" : "password"}
              value={form.password}
              onChange={(e) => set("password", e.target.value)}
              error={errors.password}
              placeholder="Minimo 8 caratteri"
            />
            <button
              type="button"
              onClick={() => setShowPwd((v) => !v)}
              className="absolute right-3 bottom-[10px] text-muted hover:text-ink dark:hover:text-paper transition-colors"
            >
              <Icon name={showPwd ? "eye-off" : "eye"} className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Primary company */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
            Azienda primaria
          </label>
          <SearchableSelect
            value={form.company_id}
            onChange={assignOnlyCompany}
            options={[
              { value: "", label: "Nessuna azienda" },
              ...companiesList.map((company) => ({
                value: String(company.id),
                label: company.name,
              })),
            ]}
            placeholder="Nessuna azienda"
            searchPlaceholder="Cerca azienda..."
          />
        </div>

        {/* Assigned companies */}
        <div className="flex flex-col gap-2">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
              Aziende assegnate
            </label>
            <p className="text-[11px] text-muted dark:text-[#9999a0] mt-1">
              Seleziona le aziende accessibili all'utente. La primaria deve essere inclusa qui.
            </p>
          </div>

          <input
            value={companySearch}
            onChange={(e) => setCompanySearch(e.target.value)}
            placeholder="Cerca azienda..."
            className="w-full rounded-md border px-3 py-2 text-sm font-body bg-paper text-ink border-line focus:border-ink focus:outline-none transition-colors dark:bg-[#1a1a1a] dark:text-[#f4f4f7] dark:border-[#2e2e2e] dark:focus:border-white"
          />

          <div className="max-h-40 overflow-y-auto rounded-md border border-line dark:border-[#2a2a2e] p-2 flex flex-col gap-1.5">
            {filteredCompanies.length === 0 ? (
              <p className="text-xs text-muted dark:text-[#9999a0] px-1 py-1">Nessuna azienda trovata</p>
            ) : (
              filteredCompanies.map((company) => {
                const value = String(company.id);
                const checked = form.company_ids.includes(value);
                return (
                  <label key={company.id} className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-cream dark:hover:bg-[#1c1c20] cursor-pointer">
                    <Checkbox
                      checked={checked}
                      onChange={() => toggleCompany(value)}
                    />
                    <span className="text-sm font-body text-ink dark:text-[#f4f4f7]">{company.name}</span>
                  </label>
                );
              })
            )}
          </div>

          <p className="text-[11px] text-muted dark:text-[#9999a0]">
            Selezionate: {form.company_ids.length}
          </p>
        </div>

        <WorkAreaMultiSelect
          areas={workAreasList}
          value={form.work_area_ids.map(Number)}
          onChange={(next) => setForm((current) => ({ ...current, work_area_ids: next.map(String) }))}
          showInactive={true}
        />

        <MultiSelect
          label="Clienti assegnati"
          value={form.assigned_client_ids.map(Number)}
          onChange={(next) => setForm((current) => ({ ...current, assigned_client_ids: next.map(String) }))}
          options={clients.map((clientItem) => ({ id: clientItem.id, label: clientItem.name }))}
          placeholder={clientsLoading ? "Caricamento clienti..." : "Seleziona clienti"}
          searchPlaceholder="Cerca cliente..."
        />

        {canAssignRoles && (
          <div className="flex flex-col gap-2">
            <MultiSelect
              label="Ruoli"
              value={form.role_ids.map(Number)}
              onChange={(next) => setForm((current) => ({ ...current, role_ids: next.map(String) }))}
              options={scopedRoleOptions}
              placeholder={roleScopeCompanyIds.size === 0 ? "Seleziona prima azienda/aziende" : "Seleziona ruoli..."}
            />
            {outOfScopeRoleIds.length > 0 && (
              <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-[#854F0B] dark:text-[#fbbf24]">
                Alcuni ruoli non sono più compatibili con le aziende selezionate. Aggiorna la selezione ruoli.
              </div>
            )}
            {errors.role_ids && (
              <p className="text-xs text-danger">{errors.role_ids}</p>
            )}
          </div>
        )}

        {/* Livello di accesso */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
            Livello di accesso
          </label>
          <SearchableSelect
            value={form.access_level}
            onChange={(v) => set("access_level", (v || "operator") as AccessLevel)}
            options={[
              { value: "operator", label: "Operatore" },
              { value: "project_manager", label: "Project Manager" },
              { value: "admin", label: "Amministratore" },
            ]}
            placeholder="Seleziona livello"
          />
          <p className="text-[11px] text-muted dark:text-muted-dark">
            {form.access_level === "admin"
              ? "Accesso completo: impostazioni, utenti/ruoli e dati commerciali."
              : form.access_level === "project_manager"
                ? "Gestisce le task di tutti gli operatori della propria azienda; niente impostazioni, utenti/ruoli o prezzi."
                : "Vede e gestisce solo le proprie task (workload e attività del giorno)."}
          </p>
        </div>

        {/* Toggles */}
        <div className="flex gap-6 pt-1">
          {isEdit && (
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <Checkbox
                checked={form.is_active}
                onChange={(v) => set("is_active", v)}
              />
              <span className="text-sm font-body font-semibold text-ink dark:text-[#f4f4f7]">
                Attivo
              </span>
            </label>
          )}

          {/* L'accesso LLM è una vista operatore: configurabile solo per il livello Operatore */}
          {form.access_level === "operator" && (
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <Checkbox
                checked={form.can_use_llm}
                onChange={(v) => set("can_use_llm", v)}
              />
              <span className="text-sm font-body font-semibold text-ink dark:text-[#f4f4f7]">
                Accesso LLM
              </span>
            </label>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ── Delete confirm ────────────────────────────────────────────────────────────

interface DeleteModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  user: User | null;
  deleting: boolean;
}

function DeleteModal({ open, onClose, onConfirm, user, deleting }: DeleteModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Elimina utente"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={deleting}>Annulla</Button>
          <Button variant="danger" onClick={onConfirm} loading={deleting}>Elimina</Button>
        </>
      }
    >
      <p className="font-body text-sm text-ink dark:text-[#f4f4f7]">
        Sei sicuro di voler eliminare{" "}
        <strong>{user?.full_name || user?.username}</strong>? L'azione non è reversibile.
      </p>
    </Modal>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function UsersPage() {
  const { user: me, permissions } = useAuth();
  const { selectedCompanyId } = useSelectedCompanyId(me?.company_id ?? null);
  const { users, isLoading, error, refetch } = useUsers(selectedCompanyId ?? undefined);
  const { companies } = useCompanies();
  const { workAreas } = useWorkAreas(true, selectedCompanyId ?? undefined);
  const toast = useToast();

  const flatCompanies = flattenCompanies(companies as CompanyNode[]);
  const workAreasById = useMemo(() => new Map(workAreas.map((area) => [area.id, area])), [workAreas]);

  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [deleteUser, setDeleteUser] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);

  const canAssignRoles = !!permissions?.can_assign_roles || !!permissions?.is_admin;

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    return (
      !q ||
      u.full_name?.toLowerCase().includes(q) ||
      u.username.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q)
    );
  });

  const handleDelete = useCallback(async () => {
    if (!deleteUser) return;
    setDeleting(true);
    try {
      await deleteUserApi(deleteUser.id);
      toast.success("Utente eliminato");
      refetch();
      setDeleteUser(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore");
    } finally {
      setDeleting(false);
    }
  }, [deleteUser, toast, refetch]);

  return (
    <div className="px-10 py-8 pb-20 max-w-[1440px] mx-auto w-full animate-fadeIn">

      {/* ── Header ── */}
      <div className="mb-8">
        <div className="section-eyebrow">
          <Icon name="users" className="w-3.5 h-3.5" />
          Gestione
        </div>
        <h1 className="section-title">
          Utenti
        </h1>
        <p className="section-lead">
          {isLoading ? "Caricamento…" : `${users.length} utent${users.length === 1 ? "e" : "i"} registrat${users.length === 1 ? "o" : "i"}`}
        </p>
      </div>

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca per nome, username o email…"
            className="w-full pl-9 pr-4 py-2.5 rounded-md border border-line dark:border-[#2a2a2e] bg-paper dark:bg-[#131316] text-sm font-body text-ink dark:text-[#f4f4f7] placeholder:text-muted dark:placeholder:text-[#9999a0] focus:outline-none focus:border-ink dark:focus:border-white transition-colors"
          />
        </div>
        {me?.is_admin && (
          <Button
            variant="primary"
            leftIcon={<Icon name="plus" className="w-4 h-4" />}
            onClick={() => setCreateOpen(true)}
          >
            Nuovo utente
          </Button>
        )}
      </div>

      {/* ── Table card ── */}
      <div className="bg-paper dark:bg-[#131316] rounded-lg border border-line dark:border-[#2a2a2e] overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Spinner size="lg" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-20">
            <p className="font-body text-sm text-danger">{error}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted dark:text-[#9999a0]">
            <Icon name="users" className="w-10 h-10 mb-3 opacity-30" />
            <p className="font-body text-sm">
              {search ? "Nessun utente trovato per questa ricerca" : "Nessun utente"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm font-body">
              <thead>
                <tr className="border-b border-line dark:border-[#2a2a2e]">
                  {["Utente", "Email", "Ruolo", "Azienda", "Clienti", "Stato", ""].map((h) => (
                    <th
                      key={h}
                      className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted dark:text-[#9999a0] whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line dark:divide-[#2a2a2e]">
                {filtered.map((u) => (
                  <tr
                    key={u.id}
                    className="hover:bg-cream dark:hover:bg-[#1c1c20] transition-colors duration-100"
                  >
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-3">
                        {u.avatar_url ? (
                          <img
                            src={u.avatar_url}
                            alt=""
                            className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                          />
                        ) : (
                          <Avatar name={u.full_name || u.username} size="sm" />
                        )}
                        <div>
                          <p className="font-semibold text-ink dark:text-[#f4f4f7] leading-tight">
                            {u.full_name || u.username}
                          </p>
                          <p className="text-[11px] text-muted dark:text-[#9999a0]">@{u.username}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-3.5 text-muted dark:text-[#9999a0] hidden md:table-cell">
                      {u.email}
                    </td>
                    <td className="px-6 py-3.5">
                      {(() => {
                        const level: AccessLevel = u.access_level ?? (u.is_admin ? "admin" : "operator");
                        if (level === "admin") return <Badge variant="admin">Admin</Badge>;
                        if (level === "project_manager") return <Badge variant="info">Project Manager</Badge>;
                        return <Badge variant="user">Operatore</Badge>;
                      })()}
                    </td>
                    <td className="px-6 py-3.5 text-muted dark:text-[#9999a0] hidden lg:table-cell">
                      <div className="flex flex-col gap-2">
                        <span>{u.company?.name ?? <span className="opacity-40">—</span>}</span>
                        {u.work_area_ids?.length ? (
                          <div className="flex flex-wrap gap-1.5">
                            {u.work_area_ids
                              .map((id) => workAreasById.get(id))
                              .filter((area): area is WorkArea => !!area)
                              .map((area) => (
                                <WorkAreaBadge key={area.id} area={area} className="scale-[0.92] origin-left" />
                              ))}
                          </div>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-6 py-3.5">
                      {u.assigned_client_ids?.length ? (
                        <Badge variant="default">{u.assigned_client_ids.length}</Badge>
                      ) : (
                        <span className="text-muted dark:text-[#9999a0]">—</span>
                      )}
                    </td>
                    <td className="px-6 py-3.5 hidden sm:table-cell">
                      <Badge variant={u.is_active ? "success" : "default"}>
                        {u.is_active ? "Attivo" : "Disabilitato"}
                      </Badge>
                    </td>
                    {me?.is_admin && (
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            onClick={() => setEditUser(u)}
                            className="p-1.5 rounded-md text-muted hover:text-ink dark:hover:text-[#f4f4f7] hover:bg-line dark:hover:bg-[#2a2a2e] transition-colors"
                            title="Modifica"
                          >
                            <Icon name="pencil" className="w-4 h-4" />
                          </button>
                          {u.id !== me.id && (
                            <button
                              onClick={() => setDeleteUser(u)}
                              className="p-1.5 rounded-md text-muted hover:text-danger hover:bg-danger/10 transition-colors"
                              title="Elimina"
                            >
                              <Icon name="trash" className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      <UserModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={refetch}
        defaultCompanyId={selectedCompanyId}
        companiesList={flatCompanies}
        workAreasList={workAreas}
        canAssignRoles={canAssignRoles}
      />
      {editUser && (
        <UserModal
          key={editUser.id}
          open={!!editUser}
          onClose={() => setEditUser(null)}
          onSaved={refetch}
          user={editUser}
          companiesList={flatCompanies}
          workAreasList={workAreas}
          canAssignRoles={canAssignRoles}
        />
      )}
      <DeleteModal
        open={!!deleteUser}
        onClose={() => setDeleteUser(null)}
        onConfirm={handleDelete}
        user={deleteUser}
        deleting={deleting}
      />
    </div>
  );
}
