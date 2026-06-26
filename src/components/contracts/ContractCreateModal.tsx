import { useEffect, useMemo, useState } from "react";
import { createContractApi, CONTRACT_STAGE_LABELS, CONTRACT_STAGE_ORDER, type ContractCommercialStage, type ContractDetailResponse, type ContractEngagementType, type ContractPricingMode, type ContractType } from "../../api/contracts";
import { createWorkAreaApi, listWorkAreasApi, type WorkArea } from "../../api/workAreas";
import { createWorkTagApi, listWorkTagsApi, type WorkTag } from "../../api/workTags";
import type { Client } from "../../api/clients";
import { useToast } from "../../context/ToastContext";
import { ClientSelectorWithCreate } from "../clients/ClientSelectorWithCreate";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";
import { MultiSelect } from "../ui/MultiSelect";
import { SearchableSelect } from "../ui/SearchableSelect";
import { Textarea } from "../ui/Textarea";
import { WorkAreaCreateModal } from "../work-taxonomy/WorkAreaCreateModal";
import { WorkTagCreateModal } from "../work-taxonomy/WorkTagCreateModal";

type ContractCreateState = {
  title: string;
  client_id: string;
  contract_type: ContractType;
  engagement_type: "" | ContractEngagementType;
  signed_at: string;
  start_date: string;
  end_date: string;
  commercial_stage: ContractCommercialStage;
  pricing_view_mode: ContractPricingMode;
  commercial_notes: string;
  operational_brief: string;
  tag_ids: number[];
  work_area_ids: number[];
};

const EMPTY_CREATE_FORM: ContractCreateState = {
  title: "",
  client_id: "",
  contract_type: "commercial",
  engagement_type: "",
  signed_at: "",
  start_date: "",
  end_date: "",
  commercial_stage: "bozza",
  pricing_view_mode: "aggregated",
  commercial_notes: "",
  operational_brief: "",
  tag_ids: [],
  work_area_ids: [],
};

function toIsoDatetimeValue(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function ContractCreateModal({
  open,
  companyId,
  clients,
  canCreateTaxonomy = false,
  title = "Nuovo contratto",
  confirmLabel = "Crea contratto",
  onClose,
  onCreated,
}: {
  open: boolean;
  companyId: number | null;
  clients: Client[];
  canCreateTaxonomy?: boolean;
  title?: string;
  confirmLabel?: string;
  onClose: () => void;
  onCreated?: (contract: ContractDetailResponse) => void;
}) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<ContractCreateState>(EMPTY_CREATE_FORM);

  const [availableWorkTags, setAvailableWorkTags] = useState<WorkTag[]>([]);
  const [availableWorkAreas, setAvailableWorkAreas] = useState<WorkArea[]>([]);
  const [taxonomyLoading, setTaxonomyLoading] = useState(false);
  const [creatingWorkTag, setCreatingWorkTag] = useState(false);
  const [creatingWorkArea, setCreatingWorkArea] = useState(false);
  const [workTagModalOpen, setWorkTagModalOpen] = useState(false);
  const [workAreaModalOpen, setWorkAreaModalOpen] = useState(false);
  const [activeNotesTab, setActiveNotesTab] = useState<"commercial" | "operational">("commercial");

  const updateForm = <K extends keyof ContractCreateState>(key: K, value: ContractCreateState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const stageOptions = useMemo(
    () => CONTRACT_STAGE_ORDER.map((stage) => ({ value: stage, label: CONTRACT_STAGE_LABELS[stage] })),
    []
  );

  const workTagOptions = useMemo(
    () => availableWorkTags.map((tag) => ({ id: tag.id, label: tag.name, color: tag.color })),
    [availableWorkTags]
  );

  const workAreaOptions = useMemo(
    () => availableWorkAreas.map((area) => ({ id: area.id, label: area.name, color: area.color })),
    [availableWorkAreas]
  );

  useEffect(() => {
    if (!open || companyId == null) return;

    let cancelled = false;
    setTaxonomyLoading(true);

    Promise.all([
      listWorkTagsApi({ company_id: companyId }),
      listWorkAreasApi({ company_id: companyId }),
    ])
      .then(([tags, areas]) => {
        if (cancelled) return;
        setAvailableWorkTags(tags);
        setAvailableWorkAreas(areas);
      })
      .catch((err) => {
        if (cancelled) return;
        setAvailableWorkTags([]);
        setAvailableWorkAreas([]);
        toast.error(err instanceof Error ? err.message : "Errore caricamento tag e aree");
      })
      .finally(() => {
        if (cancelled) return;
        setTaxonomyLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [companyId, open, toast]);

  useEffect(() => {
    const areaSet = new Set(workAreaOptions.map((option) => option.id));
    const tagSet = new Set(workTagOptions.map((option) => option.id));

    setForm((current) => ({
      ...current,
      work_area_ids: current.work_area_ids.filter((id) => areaSet.has(id)),
      tag_ids: current.tag_ids.filter((id) => tagSet.has(id)),
    }));
  }, [workAreaOptions, workTagOptions]);

  const handleCreateWorkTag = async (name: string) => {
    if (!companyId || !name.trim()) return;
    setCreatingWorkTag(true);
    try {
      const created = await createWorkTagApi({
        company_id: companyId,
        name: name.trim(),
        color: "#6366f1",
      });
      setAvailableWorkTags((prev) => (prev.some((item) => item.id === created.id) ? prev : [...prev, created]));
      setForm((current) => ({
        ...current,
        tag_ids: current.tag_ids.includes(created.id) ? current.tag_ids : [...current.tag_ids, created.id],
      }));
      toast.success("Tag creato");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore creazione tag");
      throw err;
    } finally {
      setCreatingWorkTag(false);
    }
  };

  const handleCreateWorkArea = async (name: string) => {
    if (!companyId || !name.trim()) return;
    setCreatingWorkArea(true);
    try {
      const created = await createWorkAreaApi({
        company_id: companyId,
        name: name.trim(),
      });
      setAvailableWorkAreas((prev) => (prev.some((item) => item.id === created.id) ? prev : [...prev, created]));
      setForm((current) => ({
        ...current,
        work_area_ids: current.work_area_ids.includes(created.id)
          ? current.work_area_ids
          : [...current.work_area_ids, created.id],
      }));
      toast.success("Area creata");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore creazione area");
      throw err;
    } finally {
      setCreatingWorkArea(false);
    }
  };

  const handleClose = () => {
    if (loading) return;
    setForm(EMPTY_CREATE_FORM);
    setActiveNotesTab("commercial");
    onClose();
  };

  const handleCreate = async () => {
    if (!companyId) {
      toast.error("Seleziona una company");
      return;
    }
    if (!form.title.trim()) {
      toast.error("Titolo obbligatorio");
      return;
    }
    if (form.start_date && form.end_date && form.end_date < form.start_date) {
      toast.error("La data fine non puo essere precedente alla data inizio");
      return;
    }

    setLoading(true);
    try {
      const created = await createContractApi({
        company_id: companyId,
        client_id: form.client_id ? Number(form.client_id) : null,
        title: form.title.trim(),
        contract_type: form.contract_type,
        engagement_type: form.engagement_type || null,
        signed_at: toIsoDatetimeValue(form.signed_at),
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        commercial_stage: form.commercial_stage,
        pricing_view_mode: form.pricing_view_mode,
        commercial_notes: form.commercial_notes.trim() || null,
        operational_brief: form.operational_brief.trim() || null,
        quote_links: [],
        tag_ids: form.tag_ids,
        work_area_ids: form.work_area_ids,
      });

      toast.success("Contratto creato");
      setForm(EMPTY_CREATE_FORM);
      setActiveNotesTab("commercial");
      onClose();
      onCreated?.(created);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore creazione contratto");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={title}
      size="xl"
      draftId={companyId != null ? `contract-create:${companyId}` : "contract-create"}
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={loading}>
            Annulla
          </Button>
          <Button onClick={() => void handleCreate()} loading={loading}>{confirmLabel}</Button>
        </>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Input
          label="Titolo"
          value={form.title}
          onChange={(event) => updateForm("title", event.target.value)}
          placeholder="Es. Contratto Social Q3"
        />

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">Cliente</label>
          <ClientSelectorWithCreate
            value={form.client_id}
            onChange={(value) => updateForm("client_id", value)}
            clients={clients}
            companyId={companyId}
            placeholder="Seleziona cliente"
            includeEmptyOption
            emptyOptionLabel="Nessun cliente"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">Tipo contratto</label>
          <SearchableSelect
            value={form.contract_type}
            onChange={(value) => updateForm("contract_type", value as ContractType)}
            options={[
              { value: "commercial", label: "Commerciale" },
              { value: "execution", label: "Execution" },
            ]}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">Tipo rapporto</label>
          <SearchableSelect
            value={form.engagement_type}
            onChange={(value) => updateForm("engagement_type", value as "" | ContractEngagementType)}
            options={[
              { value: "", label: "Non impostato" },
              { value: "one_time", label: "Una tantum" },
              { value: "ongoing", label: "Continuativo" },
            ]}
            placeholder="Seleziona tipo rapporto"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">Stato iniziale</label>
          <SearchableSelect
            value={form.commercial_stage}
            onChange={(value) => updateForm("commercial_stage", value as ContractCommercialStage)}
            options={stageOptions}
          />
        </div>

        <Input
          label="Data firma"
          type="datetime-local"
          value={form.signed_at}
          onChange={(event) => updateForm("signed_at", event.target.value)}
        />

        <Input
          label="Data inizio"
          type="date"
          value={form.start_date}
          onChange={(event) => updateForm("start_date", event.target.value)}
        />

        <Input
          label="Data fine"
          type="date"
          value={form.end_date}
          onChange={(event) => updateForm("end_date", event.target.value)}
        />

        <div className="md:col-span-2 flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">Modalità prezzi</label>
          <SearchableSelect
            value={form.pricing_view_mode}
            onChange={(value) => updateForm("pricing_view_mode", value as ContractPricingMode)}
            options={[
              { value: "aggregated", label: "Totale aggregato" },
              { value: "single_quote", label: "Preventivo principale" },
            ]}
          />
        </div>

        <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-3">
          <MultiSelect
            label="Aree di lavoro"
            value={form.work_area_ids}
            onChange={(value) => updateForm("work_area_ids", value)}
            options={workAreaOptions}
            placeholder={taxonomyLoading ? "Caricamento aree..." : "Seleziona aree"}
            onCreateClick={canCreateTaxonomy ? () => setWorkAreaModalOpen(true) : undefined}
            onCreateOption={canCreateTaxonomy ? handleCreateWorkArea : undefined}
            createLoading={creatingWorkArea}
            createActionLabel="Crea area"
          />
          <MultiSelect
            label="Tag"
            value={form.tag_ids}
            onChange={(value) => updateForm("tag_ids", value)}
            options={workTagOptions}
            placeholder={taxonomyLoading ? "Caricamento tag..." : "Seleziona tag"}
            onCreateClick={canCreateTaxonomy ? () => setWorkTagModalOpen(true) : undefined}
            onCreateOption={canCreateTaxonomy ? handleCreateWorkTag : undefined}
            createLoading={creatingWorkTag}
            createActionLabel="Crea tag"
          />
        </div>

        <div className="md:col-span-2 space-y-2">
          <div className="mb-2 inline-flex rounded-md border border-line dark:border-line-dark p-1 gap-1">
            <button
              type="button"
              onClick={() => setActiveNotesTab("commercial")}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${activeNotesTab === "commercial" ? "bg-ink text-paper dark:bg-paper dark:text-ink" : "text-muted dark:text-muted-dark hover:bg-cream dark:hover:bg-[#1c1c20]"}`}
            >
              Note commerciali
            </button>
            <button
              type="button"
              onClick={() => setActiveNotesTab("operational")}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${activeNotesTab === "operational" ? "bg-ink text-paper dark:bg-paper dark:text-ink" : "text-muted dark:text-muted-dark hover:bg-cream dark:hover:bg-[#1c1c20]"}`}
            >
              Brief operativo
            </button>
          </div>

          {activeNotesTab === "commercial" ? (
            <Textarea
              value={form.commercial_notes}
              onChange={(event) => updateForm("commercial_notes", event.target.value)}
              rows={3}
              placeholder="Inserisci note commerciali (trattativa, condizioni, obiezioni...)"
            />
          ) : (
            <Textarea
              value={form.operational_brief}
              onChange={(event) => updateForm("operational_brief", event.target.value)}
              rows={3}
              placeholder="Inserisci brief operativo (attivita, vincoli, priorita...)"
            />
          )}
        </div>
      </div>

      <WorkTagCreateModal
        open={workTagModalOpen}
        companyId={companyId}
        onClose={() => setWorkTagModalOpen(false)}
        onCreated={(tag) => {
          setAvailableWorkTags((current) => (current.some((item) => item.id === tag.id) ? current : [...current, tag]));
          setForm((current) => ({
            ...current,
            tag_ids: current.tag_ids.includes(tag.id) ? current.tag_ids : [...current.tag_ids, tag.id],
          }));
          setWorkTagModalOpen(false);
          toast.success("Tag creato");
        }}
      />

      <WorkAreaCreateModal
        open={workAreaModalOpen}
        companyId={companyId}
        onClose={() => setWorkAreaModalOpen(false)}
        onCreated={(area) => {
          setAvailableWorkAreas((current) => (current.some((item) => item.id === area.id) ? current : [...current, area]));
          setForm((current) => ({
            ...current,
            work_area_ids: current.work_area_ids.includes(area.id)
              ? current.work_area_ids
              : [...current.work_area_ids, area.id],
          }));
          setWorkAreaModalOpen(false);
          toast.success("Area creata");
        }}
      />
    </Modal>
  );
}
