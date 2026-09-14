import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getSharedFormApi, submitSharedFormApi, type SharedForm } from "../api/forms";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { FullPageSpinner } from "../components/ui/Spinner";
import { FormRenderer } from "../features/forms/FormRenderer";
import { missingRequired, type AnswerMap } from "../features/forms/formVisibility";

/**
 * Compilazione di un modulo dal link condiviso. Il link NON è pubblico: serve
 * l'accesso alla dashboard e il permesso arriva dalle aree/operatori assegnati
 * al modulo. Serve ai moduli che vivono fuori dalle task.
 */
export function SharedFormPage() {
  const { token } = useParams<{ token: string }>();

  const [form, setForm] = useState<SharedForm | null>(null);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [otherValues, setOtherValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [missing, setMissing] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      setForm(await getSharedFormApi(token));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Modulo non disponibile");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const setAnswer = (key: string, value: AnswerMap[string]) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
    setMissing((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  const send = async () => {
    if (!form || !token) return;
    const mancanti = missingRequired(form.fields, form.sections, answers);
    if (mancanti.length) {
      setMissing(new Set(mancanti.map((f) => f.key)));
      setError(`Mancano ${mancanti.length} risposte obbligatorie.`);
      return;
    }
    setSending(true);
    setError(null);
    try {
      await submitSharedFormApi(token, {
        answers: Object.entries(answers).map(([field_key, value]) => ({
          field_key,
          value: value === "__altro__" ? "" : (value as string | null),
          other_value: otherValues[field_key] ?? null,
        })),
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invio non riuscito");
    } finally {
      setSending(false);
    }
  };

  if (loading) return <FullPageSpinner />;

  if (error && !form) {
    return (
      <div className="mx-auto flex min-h-screen max-w-lg items-center px-6">
        <div className="w-full rounded-lg border border-line bg-paper p-8 text-center dark:border-[#2a2a2e] dark:bg-[#131316]">
          <Icon name="alert-triangle" className="mx-auto mb-3 h-8 w-8 text-warning" />
          <p className="text-[15px] font-bold text-ink dark:text-[#f4f4f7]">Modulo non accessibile</p>
          <p className="mt-1 text-[13px] text-muted dark:text-[#9999a0]">{error}</p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="mx-auto flex min-h-screen max-w-lg items-center px-6">
        <div className="w-full rounded-lg border border-line bg-paper p-8 text-center dark:border-[#2a2a2e] dark:bg-[#131316]">
          <span className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-success/10">
            <Icon name="check" className="h-6 w-6 text-success" />
          </span>
          <p className="text-[16px] font-bold text-ink dark:text-[#f4f4f7]">Modulo inviato</p>
          <p className="mt-1 text-[13px] text-muted dark:text-[#9999a0]">
            Grazie, la risposta è stata registrata. Puoi chiudere questa pagina.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-12 animate-fadeIn">
      <h1 className="font-display text-[24px] font-bold tracking-tight text-ink dark:text-[#f4f4f7]">
        {form?.name}
      </h1>
      {form?.description && (
        <p className="mt-1 text-[13.5px] text-muted dark:text-[#9999a0]">{form.description}</p>
      )}

      {error && (
        <div className="mt-5 rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="mt-6 rounded-lg border border-line bg-paper p-6 dark:border-[#2a2a2e] dark:bg-[#131316]">
        {form && (
          <FormRenderer
            fields={form.fields}
            sections={form.sections}
            answers={answers}
            onChange={setAnswer}
            otherValues={otherValues}
            onOtherChange={(k, v) => setOtherValues((prev) => ({ ...prev, [k]: v }))}
            missingKeys={missing}
          />
        )}
      </div>

      <div className="mt-5 flex justify-end">
        <Button variant="primary" onClick={send} loading={sending}>
          Invia
        </Button>
      </div>
    </div>
  );
}
