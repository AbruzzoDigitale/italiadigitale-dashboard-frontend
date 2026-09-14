import { Fragment } from "react";
import {
  FIELD_SOURCE_LABELS,
  type FormAttachment,
  type FormField,
  type FormSection,
} from "../../api/forms";
import { Checkbox } from "../../components/ui/Checkbox";
import { Icon } from "../../components/ui/Icon";
import { Input } from "../../components/ui/Input";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import { visibleFields, type AnswerMap } from "./formVisibility";

/**
 * Rende un modulo da compilare. Condiviso fra la compilazione autenticata e
 * quella dal link pubblico, così le due non possono divergere.
 */

const OTHER_OPTION = "__altro__";

interface FormRendererProps {
  fields: FormField[];
  sections: FormSection[];
  answers: AnswerMap;
  onChange: (key: string, value: AnswerMap[string]) => void;
  otherValues: Record<string, string>;
  onOtherChange: (key: string, value: string) => void;
  /** Allegati già caricati, per campo. Assente = campo file non gestito (pubblico). */
  attachments?: Record<string, FormAttachment[]>;
  onUpload?: (key: string, file: File) => void;
  onRemoveAttachment?: (key: string, attachmentId: number) => void;
  uploadingKey?: string | null;
  disabled?: boolean;
  /** Campi da evidenziare perché obbligatori e ancora vuoti. */
  missingKeys?: Set<string>;
}

export function FormRenderer({
  fields,
  sections,
  answers,
  onChange,
  otherValues,
  onOtherChange,
  attachments,
  onUpload,
  onRemoveAttachment,
  uploadingKey = null,
  disabled = false,
  missingKeys,
}: FormRendererProps) {
  const shown = visibleFields(fields, sections, answers);
  const sectionById = new Map(sections.map((s) => [s.id, s]));

  // Raggruppa i campi visibili per sezione mantenendo l'ordine.
  const gruppi: Array<{ section: FormSection | null; fields: FormField[] }> = [];
  shown.forEach((field) => {
    const ultimo = gruppi[gruppi.length - 1];
    const sezione = field.section_id != null ? sectionById.get(field.section_id) ?? null : null;
    if (ultimo && ultimo.section?.id === sezione?.id) ultimo.fields.push(field);
    else gruppi.push({ section: sezione, fields: [field] });
  });

  const renderField = (field: FormField) => {
    const value = answers[field.key];
    const mancante = missingKeys?.has(field.key);
    const etichetta = (
      <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
        {field.label}
        {field.is_required && <span className="ml-1 text-danger">*</span>}
      </label>
    );

    // Campo automatico: si vede che è precompilato dal sistema, non si tocca.
    if (field.source) {
      return (
        <div key={field.key} className="flex flex-col gap-1.5">
          {etichetta}
          <div className="flex items-center gap-2 rounded-md border border-line bg-cream px-3 py-2.5 text-sm text-muted dark:border-[#2a2a2e] dark:bg-[#1c1c20] dark:text-[#9999a0]">
            <Icon name="robot" className="h-3.5 w-3.5 flex-none" />
            Compilato in automatico ({FIELD_SOURCE_LABELS[field.source]})
          </div>
        </div>
      );
    }

    if (field.field_type === "boolean") {
      return (
        <div key={field.key} className="flex flex-col gap-1.5">
          {etichetta}
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(field.key, value === true || value === "true" ? false : true)}
            className="inline-flex items-center gap-2 self-start rounded-md border border-line px-3 py-2 text-sm text-ink transition-colors hover:bg-cream disabled:opacity-50 dark:border-[#2a2a2e] dark:text-[#f4f4f7] dark:hover:bg-[#1c1c20]"
          >
            <Checkbox
              checked={value === true || value === "true"}
              onChange={(checked) => onChange(field.key, checked)}
              disabled={disabled}
            />
            {value === true || value === "true" ? "Sì" : "No"}
          </button>
          {field.help_text && <p className="text-[11.5px] text-muted dark:text-[#9999a0]">{field.help_text}</p>}
        </div>
      );
    }

    if (field.field_type === "select" || field.field_type === "multiselect") {
      const opzioni = field.options ?? [];
      const scelto = value == null ? "" : String(value);
      const altroAttivo = field.allow_other && scelto === OTHER_OPTION;
      return (
        <div key={field.key} className="flex flex-col gap-1.5">
          {etichetta}
          <SearchableSelect
            value={altroAttivo ? OTHER_OPTION : scelto}
            onChange={(v) => onChange(field.key, v === OTHER_OPTION ? OTHER_OPTION : v)}
            options={[
              { value: "", label: "Non impostato" },
              ...opzioni.map((o) => ({ value: o, label: o })),
              ...(field.allow_other ? [{ value: OTHER_OPTION, label: "Altro (specifica)" }] : []),
            ]}
            showAvatar={false}
            menuLayer="portal"
            disabled={disabled}
          />
          {altroAttivo && (
            <Input
              value={otherValues[field.key] ?? ""}
              onChange={(e) => onOtherChange(field.key, e.target.value)}
              placeholder="Scrivi la risposta"
              disabled={disabled}
            />
          )}
          {field.help_text && <p className="text-[11.5px] text-muted dark:text-[#9999a0]">{field.help_text}</p>}
          {mancante && <p className="text-[11.5px] text-danger">Campo obbligatorio</p>}
        </div>
      );
    }

    if (field.field_type === "textarea") {
      return (
        <div key={field.key} className="flex flex-col gap-1.5">
          {etichetta}
          <textarea
            value={value == null ? "" : String(value)}
            onChange={(e) => onChange(field.key, e.target.value)}
            rows={4}
            disabled={disabled}
            className={`w-full rounded-md border bg-paper px-3 py-2.5 text-sm font-body text-ink outline-none transition-colors focus:border-ink disabled:opacity-60 dark:bg-ink-soft dark:text-paper dark:focus:border-paper ${
              mancante ? "border-danger" : "border-line dark:border-line-dark"
            }`}
          />
          {field.help_text && <p className="text-[11.5px] text-muted dark:text-[#9999a0]">{field.help_text}</p>}
          {mancante && <p className="text-[11.5px] text-danger">Campo obbligatorio</p>}
        </div>
      );
    }

    if (field.field_type === "file") {
      const caricati = attachments?.[field.key] ?? [];
      return (
        <div key={field.key} className="flex flex-col gap-1.5">
          {etichetta}
          {onUpload ? (
            <>
              <label className="inline-flex cursor-pointer items-center gap-2 self-start rounded-md border border-line px-3 py-2 text-sm text-ink transition-colors hover:bg-cream dark:border-[#2a2a2e] dark:text-[#f4f4f7] dark:hover:bg-[#1c1c20]">
                <Icon
                  name={uploadingKey === field.key ? "refresh-cw" : "upload"}
                  className={`h-3.5 w-3.5 ${uploadingKey === field.key ? "animate-spin" : ""}`}
                />
                {uploadingKey === field.key ? "Caricamento…" : "Scegli un file"}
                <input
                  type="file"
                  className="hidden"
                  disabled={disabled || uploadingKey === field.key}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onUpload(field.key, f);
                    e.target.value = "";
                  }}
                />
              </label>
              {caricati.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-2 rounded-md border border-line bg-cream px-2.5 py-1.5 text-[12.5px] dark:border-[#2a2a2e] dark:bg-[#1c1c20]"
                >
                  <Icon name="paperclip" className="h-3.5 w-3.5 flex-none text-muted" />
                  <span className="min-w-0 flex-1 truncate text-ink dark:text-[#f4f4f7]">{a.filename}</span>
                  {onRemoveAttachment && !disabled && (
                    <button
                      type="button"
                      onClick={() => onRemoveAttachment(field.key, a.id)}
                      title="Rimuovi"
                      className="text-danger hover:underline"
                    >
                      <Icon name="trash" className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </>
          ) : (
            <p className="text-[12.5px] text-muted dark:text-[#9999a0]">
              Gli allegati si caricano dalla dashboard.
            </p>
          )}
          {field.help_text && <p className="text-[11.5px] text-muted dark:text-[#9999a0]">{field.help_text}</p>}
          {mancante && <p className="text-[11.5px] text-danger">Serve almeno un allegato</p>}
        </div>
      );
    }

    const tipoInput =
      field.field_type === "number"
        ? "number"
        : field.field_type === "date"
        ? "date"
        : field.field_type === "email"
        ? "email"
        : field.field_type === "url"
        ? "url"
        : "text";

    return (
      <div key={field.key} className="flex flex-col gap-1.5">
        {etichetta}
        <Input
          type={tipoInput}
          value={value == null ? "" : String(value)}
          onChange={(e) => onChange(field.key, e.target.value)}
          hint={field.help_text ?? undefined}
          error={mancante ? "Campo obbligatorio" : undefined}
          disabled={disabled}
        />
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      {gruppi.map((gruppo, index) => (
        <Fragment key={gruppo.section?.id ?? `senza-sezione-${index}`}>
          <div className="flex flex-col gap-4">
            {gruppo.section && (
              <div className="border-b border-line pb-2 dark:border-[#2a2a2e]">
                <h3 className="font-display text-[15px] font-bold tracking-tight text-ink dark:text-[#f4f4f7]">
                  {gruppo.section.title}
                </h3>
                {gruppo.section.description && (
                  <p className="mt-0.5 text-[12.5px] text-muted dark:text-[#9999a0]">
                    {gruppo.section.description}
                  </p>
                )}
              </div>
            )}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {gruppo.fields.map((field) => (
                <div
                  key={field.key}
                  className={field.field_type === "textarea" ? "md:col-span-2" : undefined}
                >
                  {renderField(field)}
                </div>
              ))}
            </div>
          </div>
        </Fragment>
      ))}
    </div>
  );
}
