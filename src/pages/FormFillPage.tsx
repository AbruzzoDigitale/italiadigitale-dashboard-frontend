import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  deleteAttachmentApi,
  getFormApi,
  getSubmissionApi,
  saveSubmissionApi,
  uploadAttachmentApi,
  type Form,
  type FormAttachment,
  type FormSubmission,
} from "../api/forms";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { FullPageSpinner } from "../components/ui/Spinner";
import { useToast } from "../context/ToastContext";
import { FormRenderer } from "../features/forms/FormRenderer";
import { missingRequired, type AnswerMap } from "../features/forms/formVisibility";

/**
 * Compilazione di un report in scheda dedicata: si arriva qui dal pulsante sulla
 * task, che apre una nuova scheda del browser. Un report già consegnato si vede
 * in sola lettura, ricostruito dalle risposte salvate (che portano con sé
 * etichetta e tipo, quindi restano leggibili anche se il modulo è cambiato).
 */
export function FormFillPage() {
  const { submissionId } = useParams<{ submissionId: string }>();
  const toast = useToast();

  const [submission, setSubmission] = useState<FormSubmission | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [otherValues, setOtherValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [missing, setMissing] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!submissionId) return;
    setLoading(true);
    try {
      const sub = await getSubmissionApi(Number(submissionId));
      setSubmission(sub);
      const iniziali: AnswerMap = {};
      const altri: Record<string, string> = {};
      sub.answers.forEach((a) => {
        iniziali[a.field_key] = a.value;
        if (a.other_value) altri[a.field_key] = a.other_value;
      });
      setAnswers(iniziali);
      setOtherValues(altri);
      // La struttura viva serve solo per compilare: un report consegnato si
      // rende dalle risposte, che sono già autoconsistenti.
      if (sub.status !== "submitted") setForm(await getFormApi(sub.form_id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel caricamento del report");
    } finally {
      setLoading(false);
    }
  }, [submissionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const attachmentsByKey = useMemo(() => {
    const out: Record<string, FormAttachment[]> = {};
    (submission?.attachments ?? []).forEach((a) => {
      (out[a.field_key] ??= []).push(a);
    });
    return out;
  }, [submission]);

  const setAnswer = (key: string, value: AnswerMap[string]) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
    setMissing((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  const payload = () =>
    Object.entries(answers).map(([field_key, value]) => ({
      field_key,
      value: value === "__altro__" ? "" : (value as string | null),
      other_value: otherValues[field_key] ?? null,
    }));

  const save = async (submit: boolean) => {
    if (!submission || !form) return;
    if (submit) {
      const conteggi: Record<string, number> = {};
      Object.entries(attachmentsByKey).forEach(([k, v]) => (conteggi[k] = v.length));
      const mancanti = missingRequired(form.fields, form.sections, answers, conteggi);
      if (mancanti.length) {
        setMissing(new Set(mancanti.map((f) => f.key)));
        toast.error(
          `Mancano ${mancanti.length} risposte obbligatorie: ${mancanti.map((f) => f.label).join(", ")}`
        );
        return;
      }
    }
    setSaving(true);
    try {
      const aggiornato = await saveSubmissionApi(submission.id, { answers: payload(), submit });
      setSubmission(aggiornato);
      toast.success(submit ? "Report consegnato" : "Bozza salvata");
      if (submit) setForm(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore nel salvataggio");
    } finally {
      setSaving(false);
    }
  };

  const upload = async (key: string, file: File) => {
    if (!submission) return;
    setUploadingKey(key);
    try {
      await uploadAttachmentApi(submission.id, key, file);
      setSubmission(await getSubmissionApi(submission.id));
      toast.success("Allegato caricato");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore nel caricamento");
    } finally {
      setUploadingKey(null);
    }
  };

  const removeAttachment = async (_key: string, attachmentId: number) => {
    if (!submission) return;
    try {
      await deleteAttachmentApi(submission.id, attachmentId);
      setSubmission(await getSubmissionApi(submission.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore nella rimozione");
    }
  };

  if (loading) return <FullPageSpinner />;
  if (error || !submission) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <div className="rounded-md border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error ?? "Report non trovato"}
        </div>
      </div>
    );
  }

  const consegnato = submission.status === "submitted";

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 animate-fadeIn">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-[22px] font-bold tracking-tight text-ink dark:text-[#f4f4f7]">
            {submission.form_name}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-muted dark:text-[#9999a0]">
            {submission.website_url && (
              <span className="inline-flex items-center gap-1">
                <Icon name="globe" className="h-3.5 w-3.5" />
                {submission.website_url.replace(/^https?:\/\/(www\.)?/, "")}
              </span>
            )}
            {submission.client_name && <span>· {submission.client_name}</span>}
            {submission.work_item_title && <span>· {submission.work_item_title}</span>}
          </div>
        </div>
        {consegnato ? (
          <Badge variant="success">Consegnato</Badge>
        ) : (
          <Badge variant="warning">Bozza</Badge>
        )}
      </div>

      {consegnato ? (
        <div className="flex flex-col gap-3 rounded-lg border border-line bg-paper p-6 dark:border-[#2a2a2e] dark:bg-[#131316]">
          <p className="text-[12.5px] text-muted dark:text-[#9999a0]">
            Consegnato
            {submission.submitted_at
              ? ` il ${new Date(submission.submitted_at).toLocaleString("it-IT", {
                  dateStyle: "short",
                  timeStyle: "short",
                })}`
              : ""}
            {submission.submitted_by_label ? ` da ${submission.submitted_by_label}` : ""}.
          </p>
          <dl className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {submission.answers.map((a) => (
              <div key={a.field_key}>
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
                  {a.field_label}
                </dt>
                <dd className="whitespace-pre-wrap break-words text-[13.5px] text-ink dark:text-[#f4f4f7]">
                  {a.field_type === "boolean"
                    ? a.value === "true"
                      ? "Sì"
                      : "No"
                    : a.value || a.other_value || "—"}
                </dd>
              </div>
            ))}
          </dl>
          {submission.attachments.length > 0 && (
            <div className="mt-2 border-t border-line pt-3 dark:border-[#2a2a2e]">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
                Allegati
              </p>
              {submission.attachments.map((a) => (
                <p key={a.id} className="text-[12.5px] text-ink dark:text-[#f4f4f7]">
                  <Icon name="paperclip" className="mr-1 inline h-3.5 w-3.5" />
                  {a.filename}
                </p>
              ))}
            </div>
          )}
        </div>
      ) : (
        form && (
          <>
            {form.description && (
              <p className="mb-5 text-[13px] text-muted dark:text-[#9999a0]">{form.description}</p>
            )}
            <div className="rounded-lg border border-line bg-paper p-6 dark:border-[#2a2a2e] dark:bg-[#131316]">
              <FormRenderer
                fields={form.fields}
                sections={form.sections}
                answers={answers}
                onChange={setAnswer}
                otherValues={otherValues}
                onOtherChange={(k, v) => setOtherValues((prev) => ({ ...prev, [k]: v }))}
                attachments={attachmentsByKey}
                onUpload={upload}
                onRemoveAttachment={removeAttachment}
                uploadingKey={uploadingKey}
                missingKeys={missing}
              />
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              <Button variant="secondary" onClick={() => save(false)} loading={saving}>
                Salva bozza
              </Button>
              <Button
                variant="primary"
                onClick={() => save(true)}
                loading={saving}
                leftIcon={<Icon name="check" className="w-3.5 h-3.5" />}
              >
                Consegna report
              </Button>
            </div>
            <p className="mt-3 text-right text-[11.5px] text-muted dark:text-[#9999a0]">
              Una volta consegnato il report non si modifica più.
            </p>
          </>
        )
      )}
    </div>
  );
}
