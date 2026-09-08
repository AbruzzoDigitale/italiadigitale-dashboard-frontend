import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "../../context/ToastContext";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Icon } from "../../components/ui/Icon";
import { Spinner } from "../../components/ui/Spinner";
import { RichTextEditor, hasRichTextContent } from "../../components/ui/RichTextEditor";
import { VariableMenu } from "./VariableMenu";
import {
  createEmailTemplateApi,
  deleteEmailTemplateApi,
  listEmailTemplatesApi,
  listEmailTemplateVariablesApi,
  previewEmailTemplateApi,
  updateEmailTemplateApi,
  type EmailTemplate,
  type EmailTemplateScope,
  type EmailTemplateVariable,
} from "../../api/emailTemplates";

// ─────────────────────────────────────────────────────────────────────────────
// Gestione dei modelli email (editor "stile Gmail"). Riusato in due contesti:
//   - impostazioni del brand → scope="company" (modelli condivisi, solo admin);
//   - profilo personale       → scope="personal" (modelli dell'utente).
// La FIRMA del mittente è sempre aggiunta in coda e NON è rimovibile: qui viene
// mostrata bloccata sotto al corpo, così l'autore sa che sarà sempre presente.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  companyId: number;
  scope: EmailTemplateScope;
  canEdit: boolean;
}

interface Draft {
  name: string;
  subject: string;
  body_html: string;
}

const EMPTY_DRAFT: Draft = { name: "", subject: "", body_html: "" };

const labelCls = "text-[11px] font-semibold uppercase tracking-wider text-muted dark:text-muted-dark";

// Cache di modulo per il catalogo variabili (uguale per tutti).
let variablesCache: EmailTemplateVariable[] | null = null;

export function MailTemplatesManager({ companyId, scope, canEdit }: Props) {
  const toast = useToast();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [variables, setVariables] = useState<EmailTemplateVariable[]>(variablesCache ?? []);

  // selezione: id numerico | "new" (nuova bozza) | null (nessuna)
  const [selectedId, setSelectedId] = useState<number | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Anteprima (corpo con variabili d'esempio + firma) e firma bloccata.
  const [signatureHtml, setSignatureHtml] = useState<string>("");
  const [previewSubject, setPreviewSubject] = useState<string>("");
  const [fullHtml, setFullHtml] = useState<string>("");
  const [showPreview, setShowPreview] = useState(false);
  const previewTimer = useRef<number | null>(null);

  // Oggetto: campo di testo semplice → inserimento variabile al caret tramite menu.
  const subjectRef = useRef<HTMLInputElement>(null);
  const subjectCaretRef = useRef<number>(0);
  const trackSubjectCaret = () => {
    const el = subjectRef.current;
    if (el && el.selectionStart != null) subjectCaretRef.current = el.selectionStart;
  };

  // ── Caricamento elenco + variabili ────────────────────────────────────────
  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listEmailTemplatesApi(companyId, scope);
      setTemplates(rows);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [companyId, scope, toast]);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  useEffect(() => {
    if (variablesCache) return;
    listEmailTemplateVariablesApi()
      .then((v) => {
        variablesCache = v;
        setVariables(v);
      })
      .catch(() => {
        /* le variabili sono un extra, non bloccante */
      });
  }, []);

  // Reset selezione quando cambia azienda/ambito.
  useEffect(() => {
    setSelectedId(null);
    setDraft(EMPTY_DRAFT);
    setDirty(false);
  }, [companyId, scope]);

  // ── Anteprima (debounced): risolve variabili + firma del mittente ─────────
  const runPreview = useCallback(
    (subject: string, body: string) => {
      if (previewTimer.current) window.clearTimeout(previewTimer.current);
      previewTimer.current = window.setTimeout(async () => {
        try {
          const r = await previewEmailTemplateApi(companyId, subject, body);
          setSignatureHtml(r.signature_html ?? "");
          setPreviewSubject(r.subject ?? "");
          setFullHtml(r.full_html ?? "");
        } catch {
          /* anteprima non bloccante */
        }
      }, 450);
    },
    [companyId],
  );

  // ── Selezione / editor ─────────────────────────────────────────────────────
  const selectTemplate = (id: number | "new") => {
    if (dirty && !window.confirm("Ci sono modifiche non salvate: vuoi abbandonarle?")) return;
    let next: Draft;
    if (id === "new") {
      next = EMPTY_DRAFT;
    } else {
      const t = templates.find((x) => x.id === id);
      if (!t) return;
      next = { name: t.name ?? "", subject: t.subject ?? "", body_html: t.body_html ?? "" };
    }
    setSelectedId(id);
    setDraft(next);
    setDirty(false);
    setShowPreview(false);
    runPreview(next.subject, next.body_html); // firma + anteprima subito
  };

  const patchDraft = (patch: Partial<Draft>) => {
    setDraft((d) => {
      const next = { ...d, ...patch };
      setDirty(true);
      runPreview(next.subject, next.body_html);
      return next;
    });
  };

  // Inserisce {{token}} nell'oggetto alla posizione del caret (senza digitare le {{}}).
  const insertSubjectVariable = (token: string) => {
    const insertText = `{{${token}}}`;
    setDraft((d) => {
      const pos = Math.min(subjectCaretRef.current, d.subject.length);
      const nextSubject = d.subject.slice(0, pos) + insertText + d.subject.slice(pos);
      setDirty(true);
      runPreview(nextSubject, d.body_html);
      const caret = pos + insertText.length;
      requestAnimationFrame(() => {
        const el = subjectRef.current;
        if (el) {
          el.focus();
          el.setSelectionRange(caret, caret);
          subjectCaretRef.current = caret;
        }
      });
      return { ...d, subject: nextSubject };
    });
  };

  const save = async () => {
    const name = draft.name.trim();
    if (!name) {
      toast.error("Dai un nome al modello.");
      return;
    }
    setSaving(true);
    try {
      if (selectedId === "new") {
        const created = await createEmailTemplateApi(companyId, scope, {
          name,
          subject: draft.subject,
          body_html: draft.body_html,
        });
        setTemplates((rows) => [...rows, created].sort((a, b) => a.name.localeCompare(b.name)));
        setSelectedId(created.id);
      } else if (typeof selectedId === "number") {
        const updated = await updateEmailTemplateApi(selectedId, {
          name,
          subject: draft.subject,
          body_html: draft.body_html,
        });
        setTemplates((rows) =>
          rows.map((r) => (r.id === updated.id ? updated : r)).sort((a, b) => a.name.localeCompare(b.name)),
        );
      }
      setDirty(false);
      toast.success("Modello salvato.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (typeof selectedId !== "number") return;
    if (!window.confirm("Eliminare definitivamente questo modello?")) return;
    setDeleting(true);
    try {
      await deleteEmailTemplateApi(selectedId);
      setTemplates((rows) => rows.filter((r) => r.id !== selectedId));
      setSelectedId(null);
      setDraft(EMPTY_DRAFT);
      setDirty(false);
      toast.success("Modello eliminato.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  const variablePickerOptions = useMemo(
    () => variables.map((v) => ({ token: v.token, label: v.label, group: v.group })),
    [variables],
  );

  const editing = selectedId !== null;
  const isNew = selectedId === "new";

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
      {/* Elenco modelli */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className={labelCls}>{scope === "company" ? "Modelli condivisi" : "I tuoi modelli"}</span>
          {canEdit && (
            <button
              type="button"
              onClick={() => selectTemplate("new")}
              className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] font-semibold text-ink transition-colors hover:bg-cream dark:border-[#2a2a2e] dark:text-paper dark:hover:bg-[#1c1c20]"
            >
              <Icon name="plus" className="h-3.5 w-3.5" /> Nuovo
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted dark:text-muted-dark">
            <Spinner size="sm" /> Caricamento…
          </div>
        ) : templates.length === 0 && !isNew ? (
          <div className="rounded-md border border-dashed border-line p-4 text-center text-[13px] text-muted dark:border-[#2a2a2e] dark:text-muted-dark">
            {canEdit ? "Nessun modello: creane uno con “Nuovo”." : "Nessun modello disponibile."}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {isNew && (
              <div className="rounded-md border border-brand-magenta/50 bg-brand-magenta/5 px-3 py-2 text-[13px] font-semibold text-brand-magenta">
                Nuovo modello…
              </div>
            )}
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => selectTemplate(t.id)}
                className={`flex flex-col gap-0.5 rounded-md border px-3 py-2 text-left transition-colors ${
                  selectedId === t.id
                    ? "border-brand-magenta/50 bg-brand-magenta/5"
                    : "border-line bg-paper hover:bg-cream dark:border-[#2a2a2e] dark:bg-[#131316] dark:hover:bg-[#1c1c20]"
                }`}
              >
                <span
                  className={`truncate text-[13px] font-bold ${
                    selectedId === t.id ? "text-brand-magenta" : "text-ink dark:text-[#f4f4f7]"
                  }`}
                >
                  {t.name}
                </span>
                <span className="truncate text-[11px] text-muted dark:text-muted-dark">
                  {t.subject?.trim() || "(nessun oggetto)"}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Editor "compose" */}
      {!editing ? (
        <div className="grid min-h-[240px] place-items-center rounded-lg border border-dashed border-line p-6 text-center text-[13px] text-muted dark:border-[#2a2a2e] dark:text-muted-dark">
          <div className="flex flex-col items-center gap-2">
            <Icon name="mail" className="h-8 w-8 opacity-40" />
            <span>Seleziona un modello a sinistra{canEdit ? " o creane uno nuovo" : ""}.</span>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4 rounded-lg border border-line bg-paper p-4 dark:border-[#2a2a2e] dark:bg-[#131316]">
          {/* Nome + azioni */}
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-[200px] flex-1">
              <Input
                label="Nome del modello"
                value={draft.name}
                onChange={(e) => patchDraft({ name: e.target.value })}
                placeholder="es. Risposta preventivo"
                disabled={!canEdit}
              />
            </div>
            {canEdit && !isNew && (
              <Button variant="danger-ghost" onClick={() => void remove()} loading={deleting}>
                <Icon name="trash" className="h-4 w-4" /> Elimina
              </Button>
            )}
          </div>

          {/* Oggetto (con inserimento variabili) */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="mail-template-subject"
                className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark"
              >
                Oggetto
              </label>
              {canEdit && (
                <VariableMenu variables={variables} onInsert={insertSubjectVariable} disabled={!canEdit} />
              )}
            </div>
            <Input
              id="mail-template-subject"
              ref={subjectRef}
              value={draft.subject}
              onChange={(e) => patchDraft({ subject: e.target.value })}
              onSelect={trackSubjectCaret}
              onKeyUp={trackSubjectCaret}
              onClick={trackSubjectCaret}
              onFocus={trackSubjectCaret}
              placeholder="Oggetto dell'email"
              disabled={!canEdit}
            />
          </div>

          {/* Corpo — editor stile Gmail con variabili.
              `paper`: il corpo di un'email porta colori inline scritti per la
              carta bianca del client di posta. Su fondo scuro il testo sparisce,
              quindi qui si scrive su bianco anche in tema scuro. */}
          <RichTextEditor
            paper
            label="Corpo del messaggio"
            value={draft.body_html}
            onChange={(v) => patchDraft({ body_html: v })}
            placeholder="Scrivi il modello… usa la toolbar per formattare e “Variabili” per i segnaposto."
            disabled={!canEdit}
            richToolbar
            minHeightClassName="min-h-[220px]"
            variablePicker={{ options: variablePickerOptions }}
          />

          {/* Firma bloccata: sempre in coda, non rimovibile */}
          <div className="rounded-md border border-line bg-cream/60 p-3 dark:border-[#2a2a2e] dark:bg-[#0f0f12]">
            <div className="mb-2 flex items-center gap-1.5">
              <Icon name="eye" className="h-3.5 w-3.5 text-muted dark:text-muted-dark" />
              <span className={labelCls}>Firma email — aggiunta automaticamente, non rimovibile</span>
            </div>
            {hasRichTextContent(signatureHtml) ? (
              <div
                className="sig-preview pointer-events-none select-none rounded bg-white p-3 opacity-90"
                dangerouslySetInnerHTML={{ __html: signatureHtml }}
              />
            ) : (
              <p className="text-[12px] text-muted dark:text-muted-dark">
                Nessuna firma predefinita configurata. Verrà comunque aggiunta in automatico una volta
                impostata la firma email {scope === "company" ? "del mittente" : "nel tuo profilo"}.
              </p>
            )}
          </div>

          {/* Barra azioni + anteprima */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setShowPreview((s) => !s)}
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted transition-colors hover:text-ink dark:text-muted-dark dark:hover:text-paper"
            >
              <Icon name="eye" className="h-4 w-4" />
              {showPreview ? "Nascondi anteprima" : "Mostra anteprima"}
            </button>
            {canEdit && (
              <Button variant="primary" onClick={() => void save()} loading={saving} disabled={!dirty && !isNew}>
                <Icon name="check" className="h-4 w-4" /> Salva modello
              </Button>
            )}
          </div>

          {showPreview && (
            <div className="flex flex-col gap-2">
              <span className={labelCls}>Anteprima messaggio (variabili con valori d'esempio)</span>
              <div className="sig-preview overflow-x-auto rounded-md border border-line bg-white p-4 dark:border-[#2a2a2e]">
                {previewSubject.trim() && (
                  <div className="mb-3 border-b border-line/70 pb-2 text-[13px] text-ink">
                    <span className="font-semibold text-muted">Oggetto:</span> {previewSubject}
                  </div>
                )}
                {fullHtml ? (
                  <div dangerouslySetInnerHTML={{ __html: fullHtml }} />
                ) : (
                  <div className="text-[13px] text-muted">—</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
