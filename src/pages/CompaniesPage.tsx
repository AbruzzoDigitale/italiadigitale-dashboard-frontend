import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useCompanies } from "../hooks/useCompanies";
import {
  createCompanyApi,
  deleteCompanyApi,
  type Company,
  type CreateCompanyPayload,
} from "../api/companies";
import { useToast } from "../context/ToastContext";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { Icon } from "../components/ui/Icon";
import { Spinner } from "../components/ui/Spinner";
import { SearchableSelect } from "../components/ui/SearchableSelect";

// ── Create company modal ──────────────────────────────────────────────────────

interface CreateModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  parentOptions: { id: number; name: string }[];
}

function CreateModal({ open, onClose, onSaved, parentOptions }: CreateModalProps) {
  const toast = useToast();
  const [form, setForm] = useState<CreateCompanyPayload>({ name: "", slug: "", parent_id: null });
  const [saving, setSaving] = useState(false);

  const setName = (v: string) =>
    setForm((f) => ({
      ...f,
      name: v,
      slug: v.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
    }));

  const handleSave = useCallback(async () => {
    if (!form.name.trim() || !form.slug.trim()) {
      toast.error("Nome e slug sono obbligatori");
      return;
    }
    setSaving(true);
    try {
      await createCompanyApi(form);
      toast.success("Azienda creata");
      onSaved();
      onClose();
      setForm({ name: "", slug: "", parent_id: null });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore");
    } finally {
      setSaving(false);
    }
  }, [form, toast, onSaved, onClose]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nuova azienda"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Annulla</Button>
          <Button variant="primary" onClick={handleSave} loading={saving}>Crea azienda</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Input
          label="Nome azienda"
          value={form.name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Abruzzo Digitale"
        />
        <Input
          label="Slug (URL)"
          value={form.slug}
          onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
          placeholder="abruzzo-digitale"
          hint="Generato automaticamente, modificabile"
        />
        {parentOptions.length > 0 && (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
              Azienda madre (opzionale)
            </label>
            <SearchableSelect
              value={form.parent_id != null ? String(form.parent_id) : ""}
              onChange={(value) =>
                setForm((f) => ({ ...f, parent_id: value ? Number(value) : null }))
              }
              options={[
                { value: "", label: "Nessuna (root)" },
                ...parentOptions.map((c) => ({ value: String(c.id), label: c.name })),
              ]}
              placeholder="Nessuna (root)"
              searchPlaceholder="Cerca azienda madre…"
            />
          </div>
        )}
      </div>
    </Modal>
  );
}

// ── Delete company modal ──────────────────────────────────────────────────────

interface DeleteCompanyModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  company: Company | null;
  deleting: boolean;
}

function DeleteCompanyModal({ open, onClose, onConfirm, company, deleting }: DeleteCompanyModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Elimina azienda"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={deleting}>Annulla</Button>
          <Button variant="danger" onClick={onConfirm} loading={deleting}>Elimina</Button>
        </>
      }
    >
      <p className="font-body text-sm text-ink dark:text-[#f4f4f7]">
        Sei sicuro di voler eliminare <strong>{company?.name}</strong>?
      </p>
      <p className="font-body text-sm text-muted dark:text-[#9999a0] mt-2">
        L'azienda non deve avere sotto-aziende né utenti associati. L'azione non è reversibile.
      </p>
    </Modal>
  );
}

// ── Company row (recursive) ───────────────────────────────────────────────────

interface CompanyRowProps {
  company: Company;
  depth: number;
  isAdmin: boolean;
  onEditBrand: (c: Company) => void;
  onDelete: (c: Company) => void;
}

function CompanyRow({ company, depth, isAdmin, onEditBrand, onDelete }: CompanyRowProps) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = company.children.length > 0;

  return (
    <>
      <tr className="hover:bg-cream dark:hover:bg-[#1c1c20] transition-colors duration-100">
        <td className="px-6 py-3.5">
          <div className="flex items-center gap-2" style={{ paddingLeft: `${depth * 20}px` }}>
            {hasChildren ? (
              <button
                onClick={() => setExpanded((v) => !v)}
                className="p-0.5 rounded text-muted hover:text-ink dark:hover:text-[#f4f4f7] transition-colors flex-shrink-0"
              >
                <Icon
                  name="chevron-down"
                  className={`w-4 h-4 transition-transform duration-150 ${expanded ? "" : "-rotate-90"}`}
                />
              </button>
            ) : (
              <span className="w-5 flex-shrink-0" />
            )}
            <div
              className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0"
              style={{ background: company.primary_color ?? "#2b1342" }}
            >
              <Icon name="building" className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="font-semibold text-sm text-ink dark:text-[#f4f4f7]">{company.name}</p>
              <p className="text-[11px] text-muted dark:text-[#9999a0]">{company.slug}</p>
            </div>
          </div>
        </td>
        <td className="px-6 py-3.5 text-sm text-muted dark:text-[#9999a0] hidden sm:table-cell">
          {company.parent_id ? "Sub-azienda" : "Root"}
        </td>
        <td className="px-6 py-3.5 text-sm text-muted dark:text-[#9999a0] hidden md:table-cell">
          {company.children.length > 0 ? (
            <span>{company.children.length} sub-aziend{company.children.length === 1 ? "a" : "e"}</span>
          ) : (
            <span className="opacity-40">—</span>
          )}
        </td>
        {isAdmin && (
          <td className="px-6 py-3.5">
            <div className="flex justify-end gap-1.5">
              <button
                onClick={() => onEditBrand(company)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-body font-bold uppercase tracking-wide text-muted dark:text-[#9999a0] border border-line dark:border-[#2a2a2e] hover:text-ink dark:hover:text-[#f4f4f7] hover:border-ink dark:hover:border-[#f4f4f7] transition-colors"
              >
                <Icon name="pencil" className="w-3.5 h-3.5" />
                Brand
              </button>
              <button
                onClick={() => onDelete(company)}
                className="p-1.5 rounded-md text-muted hover:text-danger hover:bg-danger/10 transition-colors"
                title="Elimina azienda"
              >
                <Icon name="trash" className="w-4 h-4" />
              </button>
            </div>
          </td>
        )}
      </tr>
      {expanded &&
        company.children.map((child) => (
          <CompanyRow
            key={child.id}
            company={child}
            depth={depth + 1}
            isAdmin={isAdmin}
            onEditBrand={onEditBrand}
            onDelete={onDelete}
          />
        ))}
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function CompaniesPage() {
  const { user } = useAuth();
  const { companies, isLoading, error, refetch } = useCompanies();
  const toast = useToast();
  const navigate = useNavigate();

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteCompany, setDeleteCompany] = useState<Company | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = useCallback(async () => {
    if (!deleteCompany) return;
    setDeleting(true);
    try {
      await deleteCompanyApi(deleteCompany.id);
      toast.success("Azienda eliminata");
      refetch();
      setDeleteCompany(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore");
    } finally {
      setDeleting(false);
    }
  }, [deleteCompany, toast, refetch]);

  // Root companies only as parent options
  const parentOptions = companies.map((c) => ({ id: c.id, name: c.name }));

  if (!user?.is_admin) {
    return (
      <div className="px-10 py-8">
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Icon name="shield" className="w-12 h-12 mb-4 text-muted opacity-40" />
          <h2 className="font-display font-bold text-[20px] tracking-tight text-ink dark:text-[#f4f4f7] mb-2">
            Accesso negato
          </h2>
          <p className="font-body text-sm text-muted dark:text-[#9999a0]">
            Solo gli amministratori possono gestire le aziende.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-10 py-8 pb-20 max-w-[1440px] mx-auto w-full animate-fadeIn">

      {/* ── Header ── */}
      <div className="mb-8">
        <div className="section-eyebrow">
          <Icon name="building" className="w-3.5 h-3.5" />
          Organizzazione
        </div>
        <h1 className="section-title">
          Aziende
        </h1>
        <p className="section-lead">
          {isLoading ? "Caricamento…" : `${companies.length} aziend${companies.length === 1 ? "a" : "e"} nella struttura`}
        </p>
      </div>

      {/* ── Toolbar ── */}
      <div className="flex items-center justify-end mb-5">
        <Button
          variant="primary"
          leftIcon={<Icon name="plus" className="w-4 h-4" />}
          onClick={() => setCreateOpen(true)}
        >
          Nuova azienda
        </Button>
      </div>

      {/* ── Table card ── */}
      <div className="bg-paper dark:bg-[#131316] rounded-lg border border-line dark:border-[#2a2a2e] overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20"><Spinner size="lg" /></div>
        ) : error ? (
          <div className="flex items-center justify-center py-20">
            <p className="font-body text-sm text-danger">{error}</p>
          </div>
        ) : companies.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted dark:text-[#9999a0]">
            <Icon name="building" className="w-10 h-10 mb-3 opacity-30" />
            <p className="font-body text-sm">Nessuna azienda</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm font-body">
              <thead>
                <tr className="border-b border-line dark:border-[#2a2a2e]">
                  {["Azienda", "Tipo", "Struttura", ""].map((h) => (
                    <th key={h} className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted dark:text-[#9999a0]">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line dark:divide-[#2a2a2e]">
                {companies.map((c) => (
                  <CompanyRow
                    key={c.id}
                    company={c}
                    depth={0}
                    isAdmin={!!user?.is_admin}
                    onEditBrand={(c) => navigate(`/companies/${c.id}/brand`, { state: { name: c.name } })}
                    onDelete={setDeleteCompany}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      <CreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={refetch}
        parentOptions={parentOptions}
      />
      <DeleteCompanyModal
        open={!!deleteCompany}
        onClose={() => setDeleteCompany(null)}
        onConfirm={handleDelete}
        company={deleteCompany}
        deleting={deleting}
      />
    </div>
  );
}
