import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { DocFieldType, SourcePathInfo } from "../../api/documents";
import { Badge } from "../ui/Badge";
import { Checkbox } from "../ui/Checkbox";
import { Icon } from "../ui/Icon";
import { Input } from "../ui/Input";
import { SearchableSelect, type SearchableSelectOption } from "../ui/SearchableSelect";
import { SegmentedSwitch } from "../ui/SegmentedSwitch";
import { SignatureModal } from "./SignatureModal";
import { fieldLabel, isFilled, type EditorArea, type EditorField, type EditorPart } from "./modelEditor";

const isSignatureValue = (v: string): boolean => !!v && v.startsWith("data:image");

export interface FieldConfigPatch {
  display_label?: string | null;
  clear_display_label?: boolean;
  field_type?: DocFieldType;
  source_path?: string | null;
  clear_source_path?: boolean;
  required?: boolean;
  audience?: "client" | "internal";
}

export interface ModelFieldFormHandle {
  /** Scorre al campo nel form e ne mette a fuoco l'input. */
  focusField: (fieldId: number) => void;
}

interface ModelFieldFormProps {
  parts: EditorPart[];
  fields: EditorField[];
  values: Record<string, string>;
  sourcePaths: SourcePathInfo[];
  onValueChange: (key: string, value: string) => void;
  onFieldConfig: (field: EditorField, patch: FieldConfigPatch) => void;
  /** Firma AZIENDA apposta su un campo (salvata sul modello, precompilata). */
  onFieldSignature: (field: EditorField, dataUrl: string) => void;
  /** Vai al campo corrispondente sul documento (anteprima). */
  onGoToDocument: (fieldId: number) => void;
  /** Sposta un campo in una sezione (prima di beforeFieldId, o in coda se null). */
  onMoveField: (fieldId: number, toGroupKey: string, beforeFieldId: number | null) => void;
  /** Riordina le sezioni di una parte (sposta areaKey prima di beforeAreaKey). */
  onMoveArea: (partDocumentId: number, areaKey: string, beforeAreaKey: string | null) => void;
}

const TYPE_OPTIONS: SearchableSelectOption[] = [
  { value: "text", label: "Testo" },
  { value: "textarea", label: "Testo lungo" },
  { value: "date", label: "Data" },
  { value: "number", label: "Numero" },
  { value: "signature", label: "Firma elettronica" },
];

const FREE_TEXT = "__free__";

/** Gruppi di source_path ammessi per ambito (cliente vs azienda). */
const CLIENT_GROUPS = new Set(["Cliente", "Contratto", "Preventivo", "Generale"]);
const INTERNAL_GROUPS = new Set(["Azienda", "Generale"]);

export const ModelFieldForm = forwardRef<ModelFieldFormHandle, ModelFieldFormProps>(function ModelFieldForm(
  {
    parts,
    fields,
    values,
    sourcePaths,
    onValueChange,
    onFieldConfig,
    onFieldSignature,
    onGoToDocument,
    onMoveField,
    onMoveArea,
  },
  ref
) {
  const [configFieldId, setConfigFieldId] = useState<number | null>(null);
  const [dragFieldId, setDragFieldId] = useState<number | null>(null);
  const [dragArea, setDragArea] = useState<string | null>(null);
  const [signingField, setSigningField] = useState<EditorField | null>(null);
  const [flashId, setFlashId] = useState<number | null>(null);
  const fieldRefs = useRef<Record<number, HTMLElement | null>>({});
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useImperativeHandle(ref, () => ({
    focusField(fieldId: number) {
      const el = fieldRefs.current[fieldId];
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      const input = el.querySelector("input, textarea") as HTMLElement | null;
      input?.focus();
      // Evidenzia brevemente il campo raggiunto.
      setFlashId(fieldId);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlashId(null), 1400);
    },
  }));

  const sourceOptionsFor = (audience: "client" | "internal"): SearchableSelectOption[] => {
    const groups = audience === "internal" ? INTERNAL_GROUPS : CLIENT_GROUPS;
    const opts = sourcePaths
      .filter((s) => groups.has(s.gruppo))
      .map((s) => ({ value: s.path, label: s.label, trailing: s.gruppo }));
    return [{ value: FREE_TEXT, label: "Testo libero (nessun dato)" }, ...opts];
  };

  const fieldsByArea = useMemo(() => {
    const map: Record<string, EditorField[]> = {};
    for (const f of fields) (map[`${f.partDocumentId}:${f.groupKey}`] ??= []).push(f);
    return map;
  }, [fields]);

  return (
    <div className="flex flex-col gap-5">
      {parts.map((part, pIdx) => (
        <div key={part.partDocumentId} className="flex flex-col gap-4">
          {parts.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded-md bg-brand-magenta/15 text-[11px] font-bold text-brand-magenta">
                {pIdx + 1}
              </span>
              <h2 className="text-[13px] font-bold uppercase tracking-wide">{part.title}</h2>
              <span className="h-px flex-1 bg-line dark:bg-line-dark" />
            </div>
          )}

          {part.areas.map((area, aIdx) => {
            const areaFields = fieldsByArea[`${part.partDocumentId}:${area.key}`] ?? [];
            const done = areaFields.filter((f) => isFilled(values[f.key])).length;
            return (
              <section
                key={area.key}
                className={`overflow-hidden rounded-xl border shadow-sm ${
                  dragArea && dragArea !== area.key
                    ? "border-dashed border-brand-magenta/50"
                    : "border-line dark:border-line-dark"
                }`}
                onDragOver={(e) => {
                  if (dragFieldId != null || dragArea != null) e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragFieldId != null) {
                    onMoveField(dragFieldId, area.key, null);
                    setDragFieldId(null);
                  } else if (dragArea != null && dragArea !== area.key) {
                    onMoveArea(part.partDocumentId, dragArea, area.key);
                    setDragArea(null);
                  }
                }}
              >
                {/* Intestazione sezione (trascinabile per riordinare) */}
                <header
                  draggable
                  onDragStart={() => setDragArea(area.key)}
                  onDragEnd={() => setDragArea(null)}
                  className="flex cursor-grab items-center gap-3 border-b-2 border-line bg-cream/60 px-4 py-3 active:cursor-grabbing dark:border-line-dark dark:bg-ink-2/60"
                >
                  <span className="grid h-6 w-6 place-items-center rounded-md bg-ink text-[11px] font-bold text-paper dark:bg-brand-magenta dark:text-white">
                    {aIdx + 1}
                  </span>
                  <span className="grid h-7 w-7 place-items-center rounded-md bg-brand-magenta/15 text-brand-magenta">
                    <Icon name={area.icon || "list"} className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-bold uppercase tracking-wide">{area.label}</span>
                    {area.sub && (
                      <span className="block truncate text-[11px] text-muted dark:text-muted-dark">{area.sub}</span>
                    )}
                  </span>
                  <span
                    className={`flex-none rounded-full border px-2 py-0.5 text-[11px] font-bold tabular-nums ${
                      done === areaFields.length && areaFields.length > 0
                        ? "border-mint/50 bg-mint/10 text-mint"
                        : "border-line text-muted dark:border-line-dark dark:text-muted-dark"
                    }`}
                  >
                    {done}/{areaFields.length}
                  </span>
                  <Icon name="dots-vertical" className="h-4 w-4 text-muted dark:text-muted-dark" />
                </header>

                {/* Campi */}
                <div className="flex flex-col divide-y divide-line/70 dark:divide-line-dark/70">
                  {areaFields.length === 0 && (
                    <p className="px-4 py-4 text-center text-[12px] italic text-muted dark:text-muted-dark">
                      Trascina qui un campo
                    </p>
                  )}
                  {areaFields.map((f) => (
                    <FieldRow
                      key={f.fieldId}
                      field={f}
                      value={values[f.key] ?? ""}
                      configOpen={configFieldId === f.fieldId}
                      onToggleConfig={() =>
                        setConfigFieldId((id) => (id === f.fieldId ? null : f.fieldId))
                      }
                      onValueChange={(v) => onValueChange(f.key, v)}
                      onConfig={(patch) => onFieldConfig(f, patch)}
                      sourceOptions={sourceOptionsFor(f.audience)}
                      onDragStart={() => setDragFieldId(f.fieldId)}
                      onDragEnd={() => setDragFieldId(null)}
                      onDropBefore={() => {
                        if (dragFieldId != null && dragFieldId !== f.fieldId) {
                          onMoveField(dragFieldId, f.groupKey, f.fieldId);
                          setDragFieldId(null);
                        }
                      }}
                      dragging={dragFieldId === f.fieldId}
                      flash={flashId === f.fieldId}
                      onSign={() => setSigningField(f)}
                      onGoToDocument={() => onGoToDocument(f.fieldId)}
                      registerRef={(el) => {
                        fieldRefs.current[f.fieldId] = el;
                      }}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ))}

      <SignatureModal
        open={signingField != null}
        onClose={() => setSigningField(null)}
        onConfirm={(dataUrl) => {
          if (signingField) onFieldSignature(signingField, dataUrl);
          setSigningField(null);
        }}
      />
    </div>
  );
});

interface FieldRowProps {
  field: EditorField;
  value: string;
  configOpen: boolean;
  onToggleConfig: () => void;
  onValueChange: (v: string) => void;
  onConfig: (patch: FieldConfigPatch) => void;
  sourceOptions: SearchableSelectOption[];
  onDragStart: () => void;
  onDragEnd: () => void;
  onDropBefore: () => void;
  dragging: boolean;
  flash: boolean;
  onSign: () => void;
  onGoToDocument: () => void;
  registerRef: (el: HTMLDivElement | null) => void;
}

function FieldRow({
  field,
  value,
  configOpen,
  onToggleConfig,
  onValueChange,
  onConfig,
  sourceOptions,
  onDragStart,
  onDragEnd,
  onDropBefore,
  dragging,
  flash,
  onSign,
  onGoToDocument,
  registerRef,
}: FieldRowProps) {
  const [labelDraft, setLabelDraft] = useState(field.displayLabel ?? "");
  const isInternal = field.audience === "internal";
  const isSignature = field.fieldType === "signature";

  return (
    <div
      ref={registerRef}
      className={`scroll-mt-4 px-4 py-3 transition-colors ${dragging ? "opacity-40" : ""} ${
        flash ? "bg-brand-magenta/10 ring-2 ring-inset ring-brand-magenta/50" : ""
      }`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onDropBefore();
      }}
    >
      <div className="flex items-start gap-2">
        {/* Maniglia drag */}
        <span
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          className="mt-1.5 cursor-grab text-muted active:cursor-grabbing dark:text-muted-dark"
          title="Trascina per spostare"
        >
          <Icon name="dots-vertical" className="h-4 w-4" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={onGoToDocument}
              title="Vai al campo nel documento"
              className="group/lbl flex items-center gap-1 text-left text-[11px] font-bold uppercase tracking-wide text-muted hover:text-brand-magenta dark:text-muted-dark"
            >
              {fieldLabel(field)}
              <Icon name="eye" className="h-3 w-3 opacity-0 transition group-hover/lbl:opacity-100" />
            </button>
            {field.required && <span className="text-[13px] font-bold leading-none text-brand-magenta">*</span>}
            <Badge variant={isInternal ? "warning" : "info"}>{isInternal ? "Azienda" : "Cliente"}</Badge>
            {field.sourcePath && (
              <span className="rounded bg-cream px-1.5 py-0.5 font-mono text-[9.5px] text-muted dark:bg-ink-2 dark:text-muted-dark">
                {field.sourcePath}
              </span>
            )}
          </div>

          {isSignature ? (
            isInternal ? (
              // Firma AZIENDA: si imposta nel modello e resta precompilata.
              <button
                type="button"
                onClick={onSign}
                className="flex w-full items-center gap-3 rounded-lg border border-brand-magenta/50 bg-brand-magenta/5 px-3 py-2 text-left hover:bg-brand-magenta/10"
              >
                {isSignatureValue(value) ? (
                  <>
                    <img src={value} alt="Firma azienda" className="h-9 max-w-[150px] object-contain" draggable={false} />
                    <span className="text-[12px] font-semibold text-brand-magenta">Modifica firma azienda</span>
                  </>
                ) : (
                  <>
                    <Icon name="pencil" className="h-4 w-4 text-brand-magenta" />
                    <span className="text-[12px] font-semibold text-brand-magenta">Apponi firma azienda</span>
                  </>
                )}
              </button>
            ) : (
              // Firma CLIENTE: la apporrà il cliente in fase di firma.
              <div className="flex items-center gap-2 rounded-lg border border-dashed border-line px-3 py-2 text-[12px] text-muted dark:border-line-dark dark:text-muted-dark">
                <Icon name="pencil" className="h-4 w-4" />
                Firma del cliente — la apporrà il cliente in fase di firma
              </div>
            )
          ) : (
            <Input
              value={value}
              onChange={(e) => onValueChange(e.target.value)}
              disabled={isInternal}
              placeholder={isInternal ? "Dato azienda (automatico)" : "—"}
            />
          )}
        </div>

        {/* Ingranaggio config */}
        <button
          type="button"
          onClick={onToggleConfig}
          className={`mt-0.5 grid h-8 w-8 flex-none place-items-center rounded-md border ${
            configOpen
              ? "border-brand-magenta text-brand-magenta"
              : "border-line text-muted hover:text-ink dark:border-line-dark dark:text-muted-dark dark:hover:text-paper"
          }`}
          title="Configura campo"
          aria-label="Configura campo"
        >
          <Icon name="settings" className="h-4 w-4" />
        </button>
      </div>

      {/* Pannello config */}
      {configOpen && (
        <div className="mt-3 grid grid-cols-1 gap-3 rounded-lg border border-line bg-cream/40 p-3 dark:border-line-dark dark:bg-ink-2/40 sm:grid-cols-2">
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted dark:text-muted-dark">
              Etichetta mostrata
            </span>
            <Input
              value={labelDraft}
              onChange={(e) => setLabelDraft(e.target.value)}
              onBlur={() => {
                const next = labelDraft.trim();
                if (next === (field.displayLabel ?? "")) return;
                if (next) onConfig({ display_label: next });
                else onConfig({ clear_display_label: true });
              }}
              placeholder={field.label || "Etichetta del campo"}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted dark:text-muted-dark">
              Dato collegato
            </span>
            <SearchableSelect
              value={field.sourcePath ?? FREE_TEXT}
              onChange={(v) =>
                v === FREE_TEXT ? onConfig({ clear_source_path: true }) : onConfig({ source_path: v })
              }
              options={sourceOptions}
              menuLayer="portal"
              showAvatar={false}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted dark:text-muted-dark">
              Tipo
            </span>
            <SearchableSelect
              value={field.fieldType}
              onChange={(v) => onConfig({ field_type: v as DocFieldType })}
              options={TYPE_OPTIONS}
              menuLayer="portal"
              showAvatar={false}
            />
          </label>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted dark:text-muted-dark">
              Chi compila
            </span>
            <SegmentedSwitch
              value={field.audience}
              onChange={(v) => onConfig({ audience: v as "client" | "internal" })}
              options={[
                { value: "client", label: "Cliente" },
                { value: "internal", label: "Azienda" },
              ]}
            />
          </div>

          <label className="flex items-center gap-2 self-end pb-1">
            <Checkbox checked={field.required} onChange={(next) => onConfig({ required: next })} />
            <span className="text-[12px] font-semibold">Obbligatorio</span>
          </label>
        </div>
      )}
    </div>
  );
}
