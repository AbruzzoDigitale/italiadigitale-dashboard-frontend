import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "../../context/ToastContext";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Icon } from "../ui/Icon";
import { Spinner } from "../ui/Spinner";
import { type CompanyLogoFields } from "../../utils/companyLogo";
import { uploadSignatureMediaApi } from "../../api/emailSignatures";
import {
  getMyTemplateFillApi,
  previewMyTemplateApi,
  saveMyTemplateFillApi,
  type SignatureFieldDef,
} from "../../api/signatureTemplates";

// ─────────────────────────────────────────────────────────────────────────────
// Compilazione della firma dal TEMPLATE AZIENDALE (definito dall'admin).
// L'utente vede solo i campi editabili + anteprima; il resto è bloccato.
// ─────────────────────────────────────────────────────────────────────────────

interface Company extends CompanyLogoFields { id: number; name: string; }
interface Props { companies: Company[]; defaultCompanyId: number | null; }

const labelCls = "text-[11px] font-semibold uppercase tracking-wider text-muted dark:text-muted-dark";
const cardCls = "bg-paper dark:bg-[#131316] rounded-lg border border-line dark:border-[#2a2a2e] p-6";

/** Interruttore mostra/nascondi del campo. */
function ShowToggle({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={shown ? "Mostrato nella firma — clicca per nascondere" : "Nascosto — clicca per mostrare"}
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${
        shown
          ? "border-success/40 bg-success/10 text-success"
          : "border-line text-muted hover:text-ink dark:border-[#2a2a2e] dark:hover:text-paper"
      }`}
    >
      <Icon name={shown ? "eye" : "eye-off"} className="h-3 w-3" />
      {shown ? "Mostra" : "Nascosto"}
    </button>
  );
}

function FieldInput({
  field,
  value,
  onChange,
  shown,
  onToggleShown,
}: {
  field: SignatureFieldDef;
  value: string;
  onChange: (v: string) => void;
  shown: boolean;
  onToggleShown: () => void;
}) {
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const label = field.label || field.key;
  const head = (
    <div className="flex items-center justify-between gap-2">
      <span className={labelCls}>{label}</span>
      <ShowToggle shown={shown} onToggle={onToggleShown} />
    </div>
  );

  if (field.type === "image") {
    return (
      <div className={"flex flex-col gap-1" + (shown ? "" : " opacity-50")}>
        {head}
        <div className="flex items-center gap-2">
          <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="URL immagine" className="flex-1" />
          <label className="shrink-0">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setUploading(true);
                try {
                  const { url } = await uploadSignatureMediaApi(f);
                  onChange(url);
                } catch (err) {
                  toast.error((err as Error).message);
                } finally {
                  setUploading(false);
                  e.target.value = "";
                }
              }}
            />
            <span className="inline-flex h-[38px] cursor-pointer items-center gap-1.5 rounded-md border border-line dark:border-[#2a2a2e] px-3 text-[13px] font-semibold text-ink dark:text-paper hover:bg-cream dark:hover:bg-[#1c1c20]">
              {uploading ? <Spinner size="sm" /> : <Icon name="upload" className="h-4 w-4" />} Carica
            </span>
          </label>
        </div>
        {value ? <img src={value} alt="" className="mt-1 h-14 w-14 rounded object-cover border border-line dark:border-[#2a2a2e]" /> : null}
      </div>
    );
  }

  const htmlType = field.type === "email" ? "email" : field.type === "tel" ? "tel" : field.type === "url" ? "url" : "text";
  return (
    <div className={"flex flex-col gap-1" + (shown ? "" : " opacity-50")}>
      {head}
      <Input type={htmlType} value={value} onChange={(e) => onChange(e.target.value)} placeholder={label} disabled={!shown} />
    </div>
  );
}

export function SignatureFromTemplate({ companies, defaultCompanyId }: Props) {
  const toast = useToast();
  // L'organizzazione la sceglie la sidebar: qui la si segue e basta. Un secondo
  // selettore poteva puntare a un'azienda diversa da quella in cui stai
  // lavorando, e la firma che compilavi non era quella che ti aspettavi.
  const companyId = defaultCompanyId ?? companies[0]?.id ?? null;
  const companyName = companies.find((c) => c.id === companyId)?.name ?? null;
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [templateName, setTemplateName] = useState<string | null>(null);
  const [hasTemplate, setHasTemplate] = useState(true);
  const [fields, setFields] = useState<SignatureFieldDef[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [hidden, setHidden] = useState<string[]>([]);
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const debounceRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    if (companyId == null) return;
    setLoading(true);
    try {
      const r = await getMyTemplateFillApi(companyId);
      setHasTemplate(r.template_id != null);
      setTemplateName(r.template_name);
      setFields(r.fields);
      setValues(r.values ?? {});
      setHidden(r.hidden ?? []);
      setPreviewHtml(r.rendered_html ?? "");
    } catch (e) {
      toast.error((e as Error).message);
      setHasTemplate(false);
    } finally {
      setLoading(false);
    }
  }, [companyId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  // Anteprima live (debounced) quando cambiano i valori.
  const schedulePreview = useCallback(
    (next: Record<string, string>, nextHidden: string[]) => {
      if (companyId == null) return;
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(async () => {
        try {
          const r = await previewMyTemplateApi(companyId, next, nextHidden);
          setPreviewHtml(r.rendered_html ?? "");
        } catch {
          /* preview non bloccante */
        }
      }, 400);
    },
    [companyId]
  );

  const setValue = (key: string, v: string) => {
    setValues((cur) => {
      const next = { ...cur, [key]: v };
      schedulePreview(next, hidden);
      return next;
    });
  };

  /** Mostra/nascondi un campo: se nascosto, il blocco sparisce dalla firma. */
  const toggleShown = (key: string) => {
    setHidden((cur) => {
      const next = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key];
      schedulePreview(values, next);
      return next;
    });
  };

  const save = async () => {
    if (companyId == null) return;
    setSaving(true);
    try {
      const r = await saveMyTemplateFillApi(companyId, values, hidden);
      setPreviewHtml(r.rendered_html ?? "");
      toast.success("Firma salvata.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={cardCls}>
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="font-display font-bold tracking-tight text-ink dark:text-[#f4f4f7]" style={{ fontSize: "17px" }}>
          Firma email
        </h2>
        {companyName && (
          <span className="shrink-0 rounded-pill border border-line px-2.5 py-[3px] text-[11px] font-medium text-muted dark:border-[#2a2a2e] dark:text-muted-dark">
            {companyName}
          </span>
        )}
      </div>
      <p className="font-body text-[13px] text-muted dark:text-muted-dark mb-5">
        {hasTemplate
          ? `Compila i campi consentiti dal template aziendale${templateName ? ` "${templateName}"` : ""}. Il resto è impostato dall'organizzazione.`
          : "Nessun template firma configurato dall'organizzazione."}
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-muted dark:text-muted-dark text-sm">
          <Spinner size="sm" /> Caricamento…
        </div>
      ) : !hasTemplate ? (
        <div className="rounded-md border border-dashed border-line dark:border-[#2a2a2e] p-6 text-center text-[13px] text-muted dark:text-muted-dark">
          L'admin non ha ancora configurato un template di firma per questa organizzazione.
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {/* Campi editabili (sopra) */}
          <div className="flex flex-col gap-4">
            {fields.length === 0 ? (
              <div className="text-[13px] text-muted dark:text-muted-dark">
                Questo template non ha campi compilabili: la firma è già pronta.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {fields.map((f) => (
                  <FieldInput
                    key={f.key}
                    field={f}
                    value={values[f.key] ?? ""}
                    onChange={(v) => setValue(f.key, v)}
                    shown={!hidden.includes(f.key)}
                    onToggleShown={() => toggleShown(f.key)}
                  />
                ))}
              </div>
            )}
            <div>
              <Button variant="primary" onClick={() => void save()} loading={saving}>
                <Icon name="check" className="h-4 w-4" /> Salva firma
              </Button>
            </div>
          </div>

          {/* Anteprima (sotto, a tutta larghezza) */}
          <div className="flex flex-col gap-2">
            <span className={labelCls}>Anteprima</span>
            <div className="sig-preview rounded-md border border-line dark:border-[#2a2a2e] bg-white p-4 overflow-x-auto">
              {previewHtml ? (
                <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
              ) : (
                <div className="text-[13px] text-muted">—</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
