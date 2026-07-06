import { useEffect, useMemo, useState } from "react";
import { getClientsApi, type Client } from "../../api/clients";
import { type CreateQuickTaskResponse, type UrgencyLevel } from "../../api/workItems";
import { useQuickTask } from "../../hooks/useQuickTask";
import { useToast } from "../../context/ToastContext";
import { ClientSelectorWithCreate } from "../clients/ClientSelectorWithCreate";
import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Checkbox";
import { FieldLabel } from "../ui/FieldLabel";
import { Icon } from "../ui/Icon";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";
import { SearchableSelect } from "../ui/SearchableSelect";
import { SectionCard } from "../ui/SectionCard";
import { Textarea } from "../ui/Textarea";
import { getUsersApi, type User } from "../../api/users";

interface QuickTaskModalProps {
  open: boolean;
  onClose: () => void;
  companyId?: number | null;
  onCreated?: (response: CreateQuickTaskResponse) => void;
}

interface QuickTaskForm {
  detail: string;
  client_id: string;
  deadline_date: string;
  urgency_level: "" | UrgencyLevel;
  operator_id: string;
  is_priority: boolean;
}

const EMPTY_FORM: QuickTaskForm = {
  detail: "",
  client_id: "",
  deadline_date: "",
  urgency_level: "",
  operator_id: "",
  is_priority: false,
};

const URGENCY_OPTIONS: Array<{ value: "" | UrgencyLevel; label: string }> = [
  { value: "", label: "Urgenza (opzionale)" },
  { value: "low", label: "Bassa" },
  { value: "normal", label: "Normale" },
  { value: "high", label: "Alta" },
  { value: "critical", label: "Critica" },
];

export function QuickTaskModal({ open, onClose, companyId, onCreated }: QuickTaskModalProps) {
  const toast = useToast();
  const { createQuickTask, isSubmitting, error, missingFields, autoAssignedUserId, reset } = useQuickTask();

  const [clients, setClients] = useState<Client[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [form, setForm] = useState<QuickTaskForm>(EMPTY_FORM);
  const [localError, setLocalError] = useState<string | null>(null);

  const missingFieldSet = useMemo(() => new Set(missingFields), [missingFields]);

  useEffect(() => {
    if (!open) return;
    setClientsLoading(true);
    setUsersLoading(true);
    setLocalError(null);
    setForm(EMPTY_FORM);
    reset();

    Promise.all([
      getClientsApi({ company_id: companyId ?? undefined, per_page: 1000 })
        .then((res) => setClients(res.data))
        .catch(() => setClients([]))
        .finally(() => setClientsLoading(false)),
      getUsersApi(companyId ?? undefined)
        .then((list) => setUsers(list))
        .catch(() => setUsers([]))
        .finally(() => setUsersLoading(false)),
    ]);
  }, [open, companyId]);

  const submit = async () => {
    const detail = form.detail.trim();
    const clientId = Number(form.client_id);

    if (!detail || !form.client_id || !form.deadline_date) {
      setLocalError("Compila i campi obbligatori: dettaglio, cliente e scadenza.");
      return;
    }

    if (!Number.isFinite(clientId) || clientId <= 0) {
      setLocalError("Cliente non valido.");
      return;
    }

    setLocalError(null);

    try {
      const response = await createQuickTask({
        detail,
        client_id: clientId,
        deadline_date: form.deadline_date,
        company_id: companyId ?? undefined,
        urgency_level: form.urgency_level || undefined,
        is_priority: form.is_priority,
        assignee_ids: form.operator_id ? [Number(form.operator_id)] : undefined,
      });

      if (autoAssignedUserId != null) {
        toast.success(`Task veloce creata e assegnata automaticamente (#${autoAssignedUserId})`);
      } else {
        toast.success("Task veloce creata e assegnata automaticamente");
      }

      onCreated?.(response);
      onClose();
    } catch {
      // handled by hook state
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        if (isSubmitting) return;
        onClose();
      }}
      title="Nuova task rapida"
      description="Flusso rapido: dettaglio, cliente, scadenza. Assegnazione automatica lato backend."
      icon={<Icon name="check-circle" className="h-5 w-5" />}
      size="lg"
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>Annulla</Button>
          <Button variant="primary" onClick={() => void submit()} loading={isSubmitting}>Crea task rapida</Button>
        </>
      )}
    >
      <div className="flex flex-col gap-4">
        {(localError || error) && (
          <div className="rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
            {localError || error}
          </div>
        )}

        <SectionCard icon="list" title="Dettagli task">
        <div className="space-y-1">
          <FieldLabel icon={<Icon name="annotation" className="h-3 w-3" />} required>Dettaglio</FieldLabel>
          <Textarea
            value={form.detail}
            onChange={(event) => setForm((prev) => ({ ...prev, detail: event.target.value }))}
            placeholder="Descrivi la task rapida..."
            rows={4}
            className={`w-full rounded-md border px-3 py-2.5 text-sm font-body bg-paper text-ink placeholder:text-muted border-line focus:border-ink focus:outline-none transition-colors duration-150 dark:bg-ink-soft dark:text-paper dark:border-line-dark dark:placeholder:text-muted-dark dark:focus:border-paper ${missingFieldSet.has("detail") ? "border-danger focus:border-danger" : ""}`}
          />
        </div>

        <div className="space-y-3">
          <div className="space-y-1">
            <FieldLabel icon={<Icon name="user-circle" className="h-3 w-3" />} required>Cliente</FieldLabel>
            <ClientSelectorWithCreate
              value={form.client_id}
              onChange={(value) => setForm((prev) => ({ ...prev, client_id: value }))}
              clients={clients}
              clientsLoading={clientsLoading}
              companyId={companyId ?? null}
              placeholder="Seleziona cliente"
              emptyMessage="Nessun cliente"
              disabled={clientsLoading}
              menuLayer="portal"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input
            label="Scadenza *"
            labelIcon={<Icon name="calendar" className="h-3 w-3" />}
            type="date"
            value={form.deadline_date}
            onChange={(event) => setForm((prev) => ({ ...prev, deadline_date: event.target.value }))}
            error={missingFieldSet.has("deadline_date") ? "Campo richiesto" : undefined}
          />

            <div className="space-y-1">
              <FieldLabel
                icon={<Icon name="alert-triangle" className="h-3 w-3" />}
                help={{ title: "Urgenza", shortText: "Livello di priorità della task.", longText: "Facoltativo. Indica quanto è urgente la task (Bassa/Normale/Alta/Critica) e ne influenza l'ordinamento nei carichi di lavoro." }}
              >
                Urgenza
              </FieldLabel>
              <SearchableSelect
                value={form.urgency_level}
                onChange={(value) => setForm((prev) => ({ ...prev, urgency_level: value as "" | UrgencyLevel }))}
                options={URGENCY_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
                placeholder="Urgenza (opzionale)"
                searchPlaceholder="Cerca urgenza..."
                menuPlacement="top"
                menuLayer="portal"
              />
            </div>
          </div>

          <div className="space-y-1">
            <FieldLabel
              icon={<Icon name="user-circle" className="h-3 w-3" />}
              help={{ title: "Operatore", shortText: "Lascia vuoto per assegnazione automatica.", longText: "Se non selezioni un operatore, il backend assegna automaticamente la task in base a carichi e competenze. Seleziona un operatore per forzare l'assegnatario." }}
            >
              Operatore
            </FieldLabel>
            <SearchableSelect
              value={form.operator_id}
              onChange={(value) => setForm((prev) => ({ ...prev, operator_id: value }))}
              options={users.map((user) => ({
                value: String(user.id),
                label: user.full_name ?? user.username,
                keywords: `${user.full_name ?? ""} ${user.username ?? ""}`,
                avatarUrl: user.avatar_url,
              }))}
              placeholder={usersLoading ? "Caricamento operatori..." : "Assegnazione automatica"}
              searchPlaceholder="Cerca operatore..."
              emptyMessage={usersLoading ? "Caricamento operatori..." : "Nessun operatore"}
              menuLayer="portal"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div />
          <div className="flex items-end">
            <label className="inline-flex items-center gap-2 text-sm text-ink dark:text-paper">
              <Checkbox
                checked={form.is_priority}
                onChange={(checked) => setForm((prev) => ({ ...prev, is_priority: checked }))}
              />
              Prioritaria
            </label>
          </div>
        </div>
        </SectionCard>
      </div>
    </Modal>
  );
}