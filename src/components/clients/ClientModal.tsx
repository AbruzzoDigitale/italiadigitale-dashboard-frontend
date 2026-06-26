import { useCallback, useEffect, useState } from "react";
import {
  createClientApi,
  getClientApi,
  updateClientApi,
  type Client,
  type ClientType,
  type CreateClientPayload,
  type UpdateClientPayload,
} from "../../api/clients";
import { getUsersApi, type User } from "../../api/users";
import { listWorkAreasApi, type WorkArea } from "../../api/workAreas";
import { listWorkTagsApi, type WorkTag } from "../../api/workTags";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { MultiSelect } from "../ui/MultiSelect";
import { Modal } from "../ui/Modal";
import { useToast } from "../../context/ToastContext";
import { Checkbox } from "../ui/Checkbox";
import { SearchableSelect } from "../ui/SearchableSelect";
import { Textarea } from "../ui/Textarea";
import { normalizeCompanyPayload } from "../../utils/companyPayload";
import { useClientTrelloBoards } from "../../hooks/useClientTrelloBoards";
import { createTrelloBoardApi, listTrelloBoardsApi } from "../../api/trelloBoards";
import { WorkAreaCreateModal } from "../work-taxonomy/WorkAreaCreateModal";
import { WorkTagCreateModal } from "../work-taxonomy/WorkTagCreateModal";
import { FicApplyClientModal } from "./FicApplyClientModal";
import { FicImportClientModal } from "./FicImportClientModal";
import { pushClientToFicApi } from "../../api/fic";

export interface ClientModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: (created?: Client) => void;
  client?: Client | null;
  isAdmin?: boolean;
  companyId?: number | null;
}

// ── Form state ────────────────────────────────────────────────────────────────
// All string fields: empty string = null on save. Booleans explicit.
interface FormState {
  type: ClientType | "";
  name: string;
  commercial_name: string;
  first_name: string;
  last_name: string;
  contact: string;
  code: string;
  email: string;
  phone: string;
  fax: string;
  pec: string;
  vat: string;
  cf: string;
  sdi: string;
  e_invoice: boolean;
  addr: string;
  address_extra: string;
  city: string;
  zip: string;
  prov: string;
  country: string;
  bank_iban: string;
  bank_name: string;
  bank_swift_code: string;
  default_payment_terms: string;
  default_payment_terms_type: string;
  default_discount: string;
  assigned_user_ids: string[];
  notes: string;
}

const EMPTY: FormState = {
  type: "", name: "", commercial_name: "", first_name: "", last_name: "", contact: "", code: "",
  email: "", phone: "", fax: "", pec: "",
  vat: "", cf: "", sdi: "", e_invoice: false,
  addr: "", address_extra: "", city: "", zip: "", prov: "", country: "",
  bank_iban: "", bank_name: "", bank_swift_code: "",
  default_payment_terms: "", default_payment_terms_type: "", default_discount: "",
  assigned_user_ids: [],
  notes: "",
};

function fromClient(c: Client): FormState {
  return {
    type: c.type ?? "",
    name: c.name,
    commercial_name: c.commercial_name ?? "",
    first_name: c.first_name ?? "",
    last_name: c.last_name ?? "",
    contact: c.contact ?? "",
    code: c.code ?? "",
    email: c.email ?? "",
    phone: c.phone ?? "",
    fax: c.fax ?? "",
    pec: c.pec ?? "",
    vat: c.vat ?? "",
    cf: c.cf ?? "",
    sdi: c.sdi ?? "",
    e_invoice: c.e_invoice,
    addr: c.addr ?? "",
    address_extra: c.address_extra ?? "",
    city: c.city ?? "",
    zip: c.zip ?? "",
    prov: c.prov ?? "",
    country: c.country ?? "",
    bank_iban: c.bank_iban ?? "",
    bank_name: c.bank_name ?? "",
    bank_swift_code: c.bank_swift_code ?? "",
    default_payment_terms: c.default_payment_terms != null ? String(c.default_payment_terms) : "",
    default_payment_terms_type: c.default_payment_terms_type ?? "",
    default_discount: c.default_discount != null ? String(c.default_discount) : "",
    assigned_user_ids: (c.assigned_user_ids ?? []).map(String),
    notes: c.notes ?? "",
  };
}

function toPayload(f: FormState): CreateClientPayload {
  const s = (v: string) => (v.trim() === "" ? null : v.trim());
  return {
    type: (f.type as ClientType) || null,
    name: f.name.trim(),
    commercial_name: s(f.commercial_name),
    first_name: s(f.first_name),
    last_name: s(f.last_name),
    contact: s(f.contact),
    code: s(f.code),
    email: s(f.email),
    phone: s(f.phone),
    fax: s(f.fax),
    pec: s(f.pec),
    vat: s(f.vat),
    cf: s(f.cf),
    sdi: s(f.sdi),
    e_invoice: f.e_invoice,
    addr: s(f.addr),
    address_extra: s(f.address_extra),
    city: s(f.city),
    zip: s(f.zip),
    prov: s(f.prov),
    country: s(f.country),
    bank_iban: s(f.bank_iban),
    bank_name: s(f.bank_name),
    bank_swift_code: s(f.bank_swift_code),
    default_payment_terms: f.default_payment_terms !== "" ? Number(f.default_payment_terms) : null,
    default_payment_terms_type: s(f.default_payment_terms_type),
    default_discount: f.default_discount !== "" ? Number(f.default_discount) : null,
    assigned_user_ids: f.assigned_user_ids.length ? f.assigned_user_ids.map(Number) : null,
    notes: s(f.notes),
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────
function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <span className="whitespace-nowrap text-[10px] font-bold uppercase tracking-widest text-muted dark:text-[#9999a0]">
        {label}
      </span>
      <div className="flex-1 h-px bg-line dark:bg-[#2a2a2e]" />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
        {label}
      </label>
      <SearchableSelect
        value={value}
        onChange={onChange}
        options={options}
        placeholder="Seleziona"
        searchPlaceholder="Cerca opzione…"
      />
    </div>
  );
}

function CheckboxField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer select-none">
      <Checkbox checked={checked} onChange={onChange} />
      <span className="text-[13px] font-body text-ink dark:text-[#f4f4f7]">{label}</span>
    </label>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function ClientModal({ open, onClose, onSaved, client, isAdmin = false, companyId }: ClientModalProps) {
  const toast = useToast();
  const isEdit = !!client;
  const targetCompanyId = isEdit ? (client?.company_id ?? null) : (companyId ?? null);

  const [form, setForm] = useState<FormState>(client ? fromClient(client) : { ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState("");
  const [workTags, setWorkTags] = useState<WorkTag[]>([]);
  const [workAreas, setWorkAreas] = useState<WorkArea[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [tagIds, setTagIds] = useState<number[]>([]);
  const [workAreaIds, setWorkAreaIds] = useState<number[]>([]);
  const [assignedUserIds, setAssignedUserIds] = useState<number[]>([]);
  const [taxonomyLoading, setTaxonomyLoading] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [workTagModalOpen, setWorkTagModalOpen] = useState(false);
  const [workAreaModalOpen, setWorkAreaModalOpen] = useState(false);
  const [ficApplyOpen, setFicApplyOpen] = useState(false);
  const [ficImportOpen, setFicImportOpen] = useState(false);
  const [pushingToFic, setPushingToFic] = useState(false);
  const [selectedBoardIds, setSelectedBoardIds] = useState<number[]>([]);

  const {
    unifiedOptions,
    isLoading: trelloBoardsLoading,
    error: trelloBoardsError,
  } = useClientTrelloBoards(targetCompanyId, open && targetCompanyId != null);

  const canCreateTaxonomy = isAdmin && targetCompanyId != null;

  useEffect(() => {
    if (open) {
      setNameError("");
      setForm(client ? fromClient(client) : { ...EMPTY });
      setTagIds((client?.tags ?? []).map((tag) => tag.id));
      setWorkAreaIds((client?.work_areas ?? []).map((area) => area.id));
      setAssignedUserIds((client?.assigned_user_ids ?? []).filter((id): id is number => typeof id === "number"));
      setSelectedBoardIds((client?.trello_boards ?? []).map((board) => board.id));
    }
  }, [open, client]);

  useEffect(() => {
    if (!open || !targetCompanyId) {
      setWorkTags([]);
      setWorkAreas([]);
      setUsers([]);
      setTaxonomyLoading(false);
      setUsersLoading(false);
      return;
    }

    let cancelled = false;
    setTaxonomyLoading(true);
    Promise.all([
      listWorkTagsApi({ company_id: targetCompanyId }),
      listWorkAreasApi({ company_id: targetCompanyId }),
    ])
      .then(([tags, areas]) => {
        if (cancelled) return;
        setWorkTags(tags);
        setWorkAreas(areas);
      })
      .catch((err) => {
        if (cancelled) return;
        setWorkTags([]);
        setWorkAreas([]);
        toast.error(err instanceof Error ? err.message : "Errore caricamento tag e aree");
      })
      .finally(() => {
        if (cancelled) return;
        setTaxonomyLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, targetCompanyId, toast]);

  useEffect(() => {
    if (!open || !targetCompanyId) {
      setUsers([]);
      return;
    }

    let cancelled = false;
    setUsersLoading(true);
    getUsersApi(targetCompanyId)
      .then((list) => {
        if (!cancelled) setUsers(list);
      })
      .catch((err) => {
        if (cancelled) return;
        setUsers([]);
        toast.error(err instanceof Error ? err.message : "Errore caricamento utenti");
      })
      .finally(() => {
        if (!cancelled) setUsersLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, targetCompanyId, toast]);

  useEffect(() => {
    const tagSet = new Set(workTags.map((tag) => tag.id));
    const areaSet = new Set(workAreas.map((area) => area.id));
    const userSet = new Set(users.map((user) => user.id));
    setTagIds((current) => current.filter((id) => tagSet.has(id)));
    setWorkAreaIds((current) => current.filter((id) => areaSet.has(id)));
    setAssignedUserIds((current) => current.filter((id) => userSet.has(id)));
  }, [users, workAreas, workTags]);

  const tagOptions = workTags.map((tag) => ({ id: tag.id, label: tag.name, color: tag.color }));
  const workAreaOptions = workAreas.map((area) => ({ id: area.id, label: area.name, color: area.color }));

  const trelloBoardOptions = unifiedOptions.map((board) => ({
    id: board.localId ?? -parseInt(board.id.slice(0, 8), 36), // Use negative hash if no local ID
    label: board.name,
    color: board.isSynced ? "#16a34a" : "#dc2626",
  }));

  const getSyntheticBoardId = (trelloBoardId: string) => -parseInt(trelloBoardId.slice(0, 8), 36);

  const resolveSelectedTrelloLocalIds = useCallback(async () => {
    const selectedOptions = selectedBoardIds.map((selectedId) => {
      const option = unifiedOptions.find((board) => board.localId === selectedId || getSyntheticBoardId(board.id) === selectedId);
      if (!option) {
        throw new Error("Board Trello selezionata non valida: ricarica la lista e riprova");
      }
      return option;
    });

    const localIds = new Set<number>();
    selectedOptions.forEach((board) => {
      if (board.localId != null) localIds.add(board.localId);
    });

    const toPersist = selectedOptions.filter((board) => board.localId == null);
    if (toPersist.length === 0) return Array.from(localIds);
    if (targetCompanyId == null) return Array.from(localIds);

    for (const board of toPersist) {
      try {
        const created = await createTrelloBoardApi({
          company_id: targetCompanyId,
          trello_board_id: board.trelloBoardId,
          name: board.name,
          url: board.url,
        });
        localIds.add(created.id);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Errore persistenza board Trello";
        if (message.includes("[409]") || message.includes("[422]")) {
          const persistedBoards = await listTrelloBoardsApi(targetCompanyId);
          const fallback = persistedBoards.find((item) => item.trello_board_id === board.trelloBoardId);
          if (fallback) {
            localIds.add(fallback.id);
            continue;
          }
        }
        throw err;
      }
    }

    if (localIds.size !== selectedOptions.length) {
      throw new Error("Impossibile collegare tutte le board Trello selezionate al cliente");
    }

    return Array.from(localIds);
  }, [selectedBoardIds, unifiedOptions, targetCompanyId]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const hydrateFromClient = useCallback((next: Client) => {
    setForm(fromClient(next));
    setTagIds((next.tags ?? []).map((tag) => tag.id));
    setWorkAreaIds((next.work_areas ?? []).map((area) => area.id));
    setAssignedUserIds((next.assigned_user_ids ?? []).filter((id): id is number => typeof id === "number"));
    setNameError("");
  }, []);

  const hydrateFromServer = useCallback(async (clientId: number) => {
    const fresh = await getClientApi(clientId);
    hydrateFromClient(fresh);
  }, [hydrateFromClient]);

  const handleSave = useCallback(async () => {
    if (!form.name.trim()) { setNameError("Campo obbligatorio"); return; }
    setSaving(true);
    try {
      const defaultPrimaryCompanyId = isEdit
        ? (client?.company_id ?? companyId ?? null)
        : (companyId ?? null);
      const selectedCompanyIds = isEdit
        ? (client?.company_ids ?? (client?.company_id != null ? [client.company_id] : []))
        : (companyId != null ? [companyId] : []);

      const trelloBoardIdsToSave = await resolveSelectedTrelloLocalIds();

      const payload = {
        ...toPayload(form),
        ...normalizeCompanyPayload(defaultPrimaryCompanyId, selectedCompanyIds),
        trello_board_ids: trelloBoardIdsToSave,
        ...(defaultPrimaryCompanyId != null
          ? {
              tag_ids: tagIds,
              work_area_ids: workAreaIds,
              assigned_user_ids: assignedUserIds,
            }
          : {}),
      };

      if (isEdit && client) {
        await updateClientApi(client.id, payload as UpdateClientPayload);
        toast.success("Cliente aggiornato");
        onSaved();
      } else {
        const created = await createClientApi(payload);
        toast.success("Cliente creato");
        onSaved(created);
      }
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Errore";
      if (message.includes("[403]")) {
        toast.error("Accesso non consentito");
      } else if (message.includes("[404]")) {
        toast.error("Elemento non trovato (company, cliente o board)");
      } else if (message.includes("[422]")) {
        toast.error("Errore di validazione payload");
      } else if (message.includes("[502]")) {
        toast.error("Errore Trello API o credenziali invalide");
      } else {
        toast.error(message);
      }
    } finally {
      setSaving(false);
    }
  }, [form, isEdit, client, companyId, onSaved, onClose, toast, tagIds, workAreaIds, assignedUserIds, resolveSelectedTrelloLocalIds]);

  const handlePushToFic = async () => {
    if (!client) return;
    setPushingToFic(true);
    try {
      const res = await pushClientToFicApi(client.id);
      toast.success(`Cliente ${res.action === "created" ? "creato" : "aggiornato"} su FiC · FiC #${res.fic_client_id}`);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore sincronizzazione FiC");
    } finally {
      setPushingToFic(false);
    }
  };

  return (
    <>
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Modifica cliente" : "Nuovo cliente"}
      size="xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Annulla</Button>
          <Button variant="primary" onClick={handleSave} loading={saving}>
            {isEdit ? "Salva" : "Crea"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">

        {/* ── FiC sync banner ──────────────────────────── */}
        {isEdit && (
          <div className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 ${
            client?.fic_id != null
              ? "border-success/20 bg-success/8"
              : "border-line dark:border-line-dark bg-cream dark:bg-[#1c1c20]"
          }`}>
            <div className="flex items-center gap-2 min-w-0">
              {client?.fic_id != null ? (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-success flex-shrink-0" />
                  <span className="text-[12px] font-semibold text-success truncate">
                    Sincronizzato FiC · #{client.fic_id}
                  </span>
                </>
              ) : (
                <span className="text-[12px] text-muted dark:text-muted-dark">Non collegato a FiC</span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setFicApplyOpen(true)}
                title={client?.fic_id != null ? "Sincronizza dati da FiC" : "Collega a cliente FiC esistente"}
              >
                {client?.fic_id != null ? "Sync FiC" : "Collega FiC"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                loading={pushingToFic}
                onClick={() => void handlePushToFic()}
                title="Invia/aggiorna su Fatture in Cloud"
              >
                Invia a FiC
              </Button>
            </div>
          </div>
        )}

        {/* ── FiC import panel (create only) ───────────── */}
        {!isEdit && isAdmin && (
          <div className="rounded-md border border-line dark:border-line-dark px-3 py-2 flex items-center justify-between gap-3">
            <span className="text-[12px] text-muted dark:text-muted-dark">Vuoi importare i dati da Fatture in Cloud?</span>
            <Button size="sm" variant="ghost" onClick={() => setFicImportOpen(true)}>
              Importa da FiC
            </Button>
          </div>
        )}

        {/* ── Anagrafica ────────────────────────────────── */}
        <SectionDivider label="Anagrafica" />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <SelectField
            label="Tipo"
            value={form.type}
            onChange={(v) => set("type", v as ClientType | "")}
            options={[
              { value: "", label: "— non specificato —" },
              { value: "company", label: "Azienda" },
              { value: "person", label: "Persona fisica" },
            ]}
          />
          <div className="sm:col-span-2">
            <Input
              label="Ragione sociale / Nome *"
              value={form.name}
              onChange={(e) => { set("name", e.target.value); setNameError(""); }}
              placeholder="Rossi Srl"
              error={nameError}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Nome commerciale"
            value={form.commercial_name}
            onChange={(e) => set("commercial_name", e.target.value)}
            placeholder="Es. La Perla Del Mare"
          />
        </div>

        {form.type === "person" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Nome"
              value={form.first_name}
              onChange={(e) => set("first_name", e.target.value)}
              placeholder="Mario"
            />
            <Input
              label="Cognome"
              value={form.last_name}
              onChange={(e) => set("last_name", e.target.value)}
              placeholder="Rossi"
            />
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Referente"
            value={form.contact}
            onChange={(e) => set("contact", e.target.value)}
            placeholder="Sig. Bianchi"
          />
          <Input
            label="Codice cliente"
            value={form.code}
            onChange={(e) => set("code", e.target.value)}
            placeholder="AE86"
          />
        </div>

        {/* ── Contatti ──────────────────────────────────── */}
        <SectionDivider label="Contatti" />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            placeholder="mario@rossisrl.it"
          />
          <Input
            label="Telefono"
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            placeholder="+39 0862 123456"
          />
          <Input
            label="Fax"
            value={form.fax}
            onChange={(e) => set("fax", e.target.value)}
            placeholder="+39 0862 654321"
          />
          <Input
            label="PEC"
            value={form.pec}
            onChange={(e) => set("pec", e.target.value)}
            placeholder="rossisrl@pec.it"
          />
        </div>

        {/* ── Dati fiscali ──────────────────────────────── */}
        <SectionDivider label="Dati fiscali" />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Input
            label="Partita IVA"
            value={form.vat}
            onChange={(e) => set("vat", e.target.value)}
            placeholder="IT01234567890"
          />
          <Input
            label="Codice fiscale"
            value={form.cf}
            onChange={(e) => set("cf", e.target.value)}
            placeholder="RSSMAR80A01A345Z"
          />
          <Input
            label="Codice SDI"
            value={form.sdi}
            onChange={(e) => set("sdi", e.target.value)}
            placeholder="ABC1234"
          />
        </div>

        <CheckboxField
          label="Abilitato alla fatturazione elettronica"
          checked={form.e_invoice}
          onChange={(v) => set("e_invoice", v)}
        />

        {/* ── Indirizzo ─────────────────────────────────── */}
        <SectionDivider label="Indirizzo" />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2">
            <Input
              label="Indirizzo"
              value={form.addr}
              onChange={(e) => set("addr", e.target.value)}
              placeholder="Via Roma 1"
            />
          </div>
          <Input
            label="Interno / Aggiuntivo"
            value={form.address_extra}
            onChange={(e) => set("address_extra", e.target.value)}
            placeholder="Scala B"
          />
          <div className="sm:col-span-2">
            <Input
              label="Città"
              value={form.city}
              onChange={(e) => set("city", e.target.value)}
              placeholder="Pescara"
            />
          </div>
          <Input
            label="CAP"
            value={form.zip}
            onChange={(e) => set("zip", e.target.value)}
            placeholder="65100"
          />
          <Input
            label="Provincia"
            value={form.prov}
            onChange={(e) => set("prov", e.target.value.toUpperCase().slice(0, 2))}
            placeholder="PE"
          />
          <div className="sm:col-span-2">
            <Input
              label="Paese"
              value={form.country}
              onChange={(e) => set("country", e.target.value)}
              placeholder="Italia"
            />
          </div>
        </div>

        {/* ── Aree e tag ───────────────────────────────── */}
        <SectionDivider label="Aree e tag" />

        {targetCompanyId == null ? (
          <div className="rounded-md border border-line dark:border-[#2a2a2e] px-3 py-2.5 text-sm text-muted dark:text-[#9999a0]">
            Nessuna company assegnata al cliente: non puoi associare tag, aree o utenti.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <MultiSelect
              label="Aree di lavoro"
              value={workAreaIds}
              onChange={setWorkAreaIds}
              options={workAreaOptions}
              placeholder={taxonomyLoading ? "Caricamento aree..." : "Seleziona aree"}
              onCreateClick={canCreateTaxonomy ? () => setWorkAreaModalOpen(true) : undefined}
              createActionLabel="Crea area"
            />
            <MultiSelect
              label="Tag"
              value={tagIds}
              onChange={setTagIds}
              options={tagOptions}
              placeholder={taxonomyLoading ? "Caricamento tag..." : "Seleziona tag"}
              onCreateClick={canCreateTaxonomy ? () => setWorkTagModalOpen(true) : undefined}
              createActionLabel="Crea tag"
            />
          </div>
        )}

        {targetCompanyId != null && (
          <MultiSelect
            label="Utenti assegnati"
            value={assignedUserIds}
            onChange={setAssignedUserIds}
            options={users.map((user) => ({ id: user.id, label: user.full_name ?? user.username }))}
            placeholder={usersLoading ? "Caricamento utenti..." : "Seleziona utenti"}
            searchPlaceholder="Cerca utente..."
          />
        )}

        {/* ── Trello boards ────────────────────────────── */}
        <SectionDivider label="Trello" />

        <div className="flex flex-col gap-3">
          <MultiSelect
            label="Board Trello collegate"
            value={selectedBoardIds}
            onChange={setSelectedBoardIds}
            options={trelloBoardOptions}
            placeholder={trelloBoardsLoading ? "Caricamento board..." : "Seleziona board"}
            searchPlaceholder="Cerca board..."
          />

          {trelloBoardsError && (
            <p className="text-xs text-muted dark:text-muted-dark">
              Impossibile caricare le board: {trelloBoardsError}
            </p>
          )}

          {!trelloBoardsError && unifiedOptions.some((b) => !b.isSynced) && (
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted dark:text-muted-dark">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#16a34a]" />
                Salvabile
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#dc2626]" />
                Solo Trello
              </span>
            </div>
          )}
        </div>

        {/* ── Dati bancari ──────────────────────────────── */}
        <SectionDivider label="Dati bancari" />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Input
              label="IBAN"
              value={form.bank_iban}
              onChange={(e) => set("bank_iban", e.target.value.replace(/\s/g, ""))}
              placeholder="IT60X0542811101000000123456"
              className="font-mono"
            />
          </div>
          <Input
            label="Banca"
            value={form.bank_name}
            onChange={(e) => set("bank_name", e.target.value)}
            placeholder="Intesa Sanpaolo"
          />
          <Input
            label="SWIFT / BIC"
            value={form.bank_swift_code}
            onChange={(e) => set("bank_swift_code", e.target.value.toUpperCase())}
            placeholder="BCITITMM"
            className="font-mono"
          />
        </div>

        {/* ── Condizioni commerciali ────────────────────── */}
        <SectionDivider label="Condizioni commerciali" />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Input
            label="Giorni di pagamento"
            type="number"
            min={0}
            value={form.default_payment_terms}
            onChange={(e) => set("default_payment_terms", e.target.value)}
            placeholder="30"
          />
          <SelectField
            label="Tipo scadenza"
            value={form.default_payment_terms_type}
            onChange={(v) => set("default_payment_terms_type", v)}
            options={[
              { value: "", label: "—" },
              { value: "standard", label: "Standard" },
              { value: "end_of_month", label: "Fine mese" },
              { value: "end_of_month_following", label: "Fine mese successivo" },
            ]}
          />
          <Input
            label="Sconto predefinito (%)"
            type="number"
            min={0}
            max={100}
            step={0.01}
            value={form.default_discount}
            onChange={(e) => set("default_discount", e.target.value)}
            placeholder="0"
          />
        </div>

        {/* ── Note ──────────────────────────────────────── */}
        <SectionDivider label="Note" />

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark font-body">
            Note interne
          </label>
          <Textarea
            rows={3}
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="Note interne sul cliente…"
            className="w-full px-3.5 py-2.5 rounded-md text-[13px] font-body text-ink dark:text-[#f4f4f7] placeholder:text-muted/60 dark:placeholder:text-[#9999a0]/60 border border-line dark:border-[#2a2a2e] bg-paper dark:bg-[#1c1c20] outline-none transition-colors focus:border-ink dark:focus:border-[#f4f4f7] resize-none"
          />
        </div>

        <WorkTagCreateModal
          open={workTagModalOpen}
          companyId={targetCompanyId}
          onClose={() => setWorkTagModalOpen(false)}
          onCreated={(tag) => {
            setWorkTags((current) => (current.some((item) => item.id === tag.id) ? current : [...current, tag]));
            setTagIds((current) => (current.includes(tag.id) ? current : [...current, tag.id]));
            setWorkTagModalOpen(false);
            toast.success("Tag creato");
          }}
        />

        <WorkAreaCreateModal
          open={workAreaModalOpen}
          companyId={targetCompanyId}
          onClose={() => setWorkAreaModalOpen(false)}
          onCreated={(area) => {
            setWorkAreas((current) => (current.some((item) => item.id === area.id) ? current : [...current, area]));
            setWorkAreaIds((current) => (current.includes(area.id) ? current : [...current, area.id]));
            setWorkAreaModalOpen(false);
            toast.success("Area creata");
          }}
        />

      </div>
    </Modal>

    <FicApplyClientModal
      open={ficApplyOpen}
      companyId={targetCompanyId}
      preselectedLocalClient={client ?? null}
      onClose={() => setFicApplyOpen(false)}
      onApplied={(localClientId) => {
        setFicApplyOpen(false);
        void hydrateFromServer(localClientId)
          .then(() => {
            toast.success("Cliente collegato a FiC");
          })
          .catch((err) => {
            toast.error(err instanceof Error ? err.message : "Errore aggiornamento cliente");
          });
      }}
    />

    <FicImportClientModal
      open={ficImportOpen}
      companyId={targetCompanyId}
      onClose={() => setFicImportOpen(false)}
      onImported={(localClientId) => {
        setFicImportOpen(false);
        void hydrateFromServer(localClientId)
          .then(() => {
            toast.success("Cliente importato da FiC");
          })
          .catch((err) => {
            toast.error(err instanceof Error ? err.message : "Errore aggiornamento cliente");
          });
      }}
    />
    </>
  );
}
