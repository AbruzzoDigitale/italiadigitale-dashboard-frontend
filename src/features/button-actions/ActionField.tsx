import { useEffect, useState } from "react";
import { listEmailTemplatesApi, type EmailTemplate } from "../../api/emailTemplates";
import { getUsersApi } from "../../api/users";
import { listWorkAreasApi } from "../../api/workAreas";
import { Checkbox } from "../../components/ui/Checkbox";
import { Input } from "../../components/ui/Input";
import { MultiSelect } from "../../components/ui/MultiSelect";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import { Textarea } from "../../components/ui/Textarea";
import { NOTIF_CATEGORIES } from "../notifications/notificationPreferences";
import type { ActionField as FieldSpec } from "../../api/buttonActions";

// Un campo del popup di configurazione, disegnato dal TIPO che arriva dal
// backend. È questo che rende il sistema estensibile davvero: un'azione nuova
// nel backend compare qui senza toccare il frontend, purché usi tipi già noti.

interface Props {
  field: FieldSpec;
  value: unknown;
  onChange: (value: unknown) => void;
  companyId: number;
}

/** Elenchi condivisi da tutti i campi dello stesso tipo, caricati una volta. */
function useOptions(type: string, companyId: number) {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [users, setUsers] = useState<{ id: number; label: string }[]>([]);
  const [areas, setAreas] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        if (type === "email_template") {
          // "all" = modelli aziendali + i personali di chi configura.
          const rows = await listEmailTemplatesApi(companyId, "all");
          if (vivo) setTemplates(rows.filter((t) => t.is_active));
        } else if (type === "users") {
          const rows = await getUsersApi(companyId);
          if (vivo) {
            setUsers(
              rows.map((u) => ({
                id: u.id,
                label: u.full_name || u.username || u.email || `Utente #${u.id}`,
              })),
            );
          }
        } else if (type === "work_area") {
          const rows = await listWorkAreasApi({ company_id: companyId });
          if (vivo) setAreas(rows.map((a) => ({ id: a.id, name: a.name })));
        }
      } catch {
        // Elenco non disponibile: il campo resta vuoto e il salvataggio
        // fallirà con un messaggio chiaro dal backend.
      }
    })();
    return () => {
      vivo = false;
    };
  }, [type, companyId]);

  return { templates, users, areas };
}

export function ActionFieldInput({ field, value, onChange, companyId }: Props) {
  const { templates, users, areas } = useOptions(field.type, companyId);
  const testo = typeof value === "string" ? value : value == null ? "" : String(value);

  switch (field.type) {
    case "textarea":
      return (
        <Textarea
          label={field.label}
          value={testo}
          rows={3}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.help}
        />
      );

    case "bool":
      return (
        <label className="flex cursor-pointer items-center gap-2 py-1">
          <Checkbox checked={value === true} onChange={(v) => onChange(v)} />
          <span className="text-[13px] text-ink dark:text-[#f4f4f7]">{field.label}</span>
        </label>
      );

    case "number":
      return (
        <Input
          label={field.label}
          type="number"
          value={testo}
          hint={field.help}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        />
      );

    case "date":
      return (
        <Input
          label={field.label}
          type="date"
          value={testo}
          hint={field.help}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "select":
      return (
        <div>
          <FieldLabel text={field.label} />
          <SearchableSelect
            value={testo}
            onChange={onChange}
            options={field.options.map((o) => ({ value: o.value, label: o.label }))}
            placeholder="Scegli…"
          />
          <FieldHint text={field.help} />
        </div>
      );

    case "email_template":
      return (
        <div>
          <FieldLabel text={field.label} />
          <SearchableSelect
            value={testo}
            onChange={(v) => onChange(v ? Number(v) : null)}
            options={templates.map((t) => ({
              value: String(t.id),
              label: t.name,
              trailing: t.scope === "company" ? "aziendale" : "personale",
            }))}
            placeholder="Scegli il modello…"
            emptyMessage="Nessun modello: creane uno in Azienda → Modelli email."
          />
          <FieldHint text={field.help} />
        </div>
      );

    case "work_area":
      return (
        <div>
          <FieldLabel text={field.label} />
          <SearchableSelect
            value={testo}
            onChange={(v) => onChange(v ? Number(v) : null)}
            options={areas.map((a) => ({ value: String(a.id), label: a.name }))}
            placeholder="Nessuna area"
          />
          <FieldHint text={field.help} />
        </div>
      );

    case "notification_category":
      return (
        <div>
          <FieldLabel text={field.label} />
          <SearchableSelect
            value={testo}
            onChange={onChange}
            options={NOTIF_CATEGORIES.map((c) => ({ value: c.key, label: c.label }))}
            placeholder="Invia sempre"
          />
          <FieldHint text={field.help} />
        </div>
      );

    case "users":
      return (
        <MultiSelect
          label={field.label}
          value={Array.isArray(value) ? (value as number[]) : []}
          onChange={(ids) => onChange(ids)}
          options={users.map((u) => ({ id: u.id, label: u.label }))}
          placeholder="Scegli i destinatari…"
        />
      );

    default:
      return (
        <Input
          label={field.label}
          value={testo}
          hint={field.help}
          placeholder={field.type === "url" ? "https://…" : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}

function FieldLabel({ text }: { text: string }) {
  return (
    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
      {text}
    </label>
  );
}

function FieldHint({ text }: { text: string }) {
  if (!text) return null;
  return <p className="mt-1 text-[11.5px] text-muted dark:text-[#9999a0]">{text}</p>;
}
