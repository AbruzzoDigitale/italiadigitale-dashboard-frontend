import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  openSignApi,
  previewSignApi,
  submitSignApi,
  type OverlayElement,
  type PublicSignData,
} from "../api/documents";
import { SignaturePad } from "../components/documents/SignaturePad";
import { Button } from "../components/ui/Button";
import { Checkbox } from "../components/ui/Checkbox";
import { Icon } from "../components/ui/Icon";
import { Input } from "../components/ui/Input";
import { Spinner } from "../components/ui/Spinner";

export default function ClientSignPage() {
  const { token = "" } = useParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PublicSignData | null>(null);
  const [needPassword, setNeedPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  const [values, setValues] = useState<Record<string, string>>({});
  const [prefilled, setPrefilled] = useState<Set<string>>(new Set());
  const [signature, setSignature] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [touched, setTouched] = useState(false);

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const loadContent = useCallback((d: PublicSignData) => {
    setData(d);
    setValues(d.values ?? {});
    // Campi già precompilati (non firma): modificabili, solo evidenziati.
    const pf = new Set<string>();
    for (const f of d.fields) {
      if (f.field_type !== "signature" && (d.values[f.key] ?? "").trim()) pf.add(f.key);
    }
    setPrefilled(pf);
    if (d.status === "filled" || d.status === "signed") setDone(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const d = await openSignApi(token);
        if (cancelled) return;
        if (d.requires_password && d.fields.length === 0) {
          setData(d); // per mostrare il brand anche sul gate password
          setNeedPassword(true);
        } else loadContent(d);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Link non valido");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, loadContent]);

  const unlock = async () => {
    if (!password.trim()) return;
    setUnlocking(true);
    setPwError(null);
    try {
      const d = await openSignApi(token, password);
      loadContent(d);
      setNeedPassword(false);
    } catch (err) {
      setPwError(err instanceof Error ? err.message : "Password errata");
    } finally {
      setUnlocking(false);
    }
  };

  const formFields = useMemo(() => (data?.fields ?? []).filter((f) => f.field_type !== "signature"), [data]);
  const signatureFields = useMemo(() => (data?.fields ?? []).filter((f) => f.field_type === "signature"), [data]);

  const missing = useMemo(
    () => formFields.filter((f) => f.required && !(values[f.key] ?? "").trim()).length,
    [formFields, values]
  );

  const onChange = (key: string, v: string) => setValues((s) => ({ ...s, [key]: v }));

  // Espande i valori LOGICI su tutte le occorrenze (tags) + firma cliente.
  const buildTagPayload = () => {
    const tagValues: Record<string, string> = {};
    for (const f of data?.fields ?? []) {
      const v = f.field_type === "signature" ? signature ?? "" : values[f.key] ?? "";
      for (const t of f.tags) tagValues[t] = v;
    }
    const elements: OverlayElement[] = [];
    const signatures: Record<string, string> = {};
    // Nessun campo firma nel documento → firma cliente in fondo all'ultima pagina.
    if (signature && signatureFields.length === 0 && data) {
      const last = data.page_metrics[data.page_metrics.length - 1];
      if (last) {
        const key = "clientsig";
        signatures[key] = signature;
        elements.push({
          type: "signature",
          page: last.page,
          x: Math.max(20, last.width - 220),
          y: Math.max(20, last.height - 90),
          w: 180,
          h: 55,
          signature_key: key,
        });
      }
    }
    return { tagValues, elements, signatures };
  };

  const viewPdf = async () => {
    if (!data) return;
    try {
      const { tagValues, elements, signatures } = buildTagPayload();
      const buf = await previewSignApi(token, {
        password: password || undefined,
        values: tagValues,
        elements,
        signatures,
      });
      const url = URL.createObjectURL(new Blob([buf], { type: "application/pdf" }));
      window.open(url, "_blank");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Impossibile aprire il PDF");
    }
  };

  const handleSubmit = async () => {
    if (!data) return;
    setTouched(true);
    if (missing > 0) {
      setSubmitError("Completa i campi obbligatori mancanti.");
      document.querySelector("[data-err='1']")?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    if (!signature) {
      setSubmitError("Aggiungi la tua firma autografa prima di inviare.");
      return;
    }
    if (!consent) {
      setSubmitError("Devi accettare il trattamento dei dati per firmare.");
      return;
    }
    setSubmitError(null);
    setSubmitting(true);
    try {
      const { tagValues, elements, signatures } = buildTagPayload();
      await submitSignApi(token, {
        password: password || undefined,
        values: tagValues,
        elements,
        signatures,
        consent: true,
      });
      setDone(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Errore durante l'invio");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Stati a pagina intera ─────────────────────────────────────────────────
  const brand =
    data?.company_logo ? (
      <img src={data.company_logo} alt={data.company_name} className="mx-auto mb-4 h-9 max-w-[200px] object-contain" />
    ) : data?.company_name ? (
      <p className="mb-3 text-[13px] font-bold uppercase tracking-wide">{data.company_name}</p>
    ) : null;

  const Center = ({ children }: { children: React.ReactNode }) => (
    <div className="flex min-h-[100dvh] items-center justify-center bg-cream p-4 dark:bg-[#0E0F0E]">
      <div className="w-full max-w-md rounded-2xl border border-line bg-paper p-7 text-center shadow-md dark:border-line-dark dark:bg-[#131316]">
        {children}
      </div>
    </div>
  );

  if (loading) return <Center><Spinner /></Center>;

  if (error && !data)
    return (
      <Center>
        <Icon name="alert-triangle" className="mx-auto mb-2 h-9 w-9 text-danger" />
        <p className="text-[15px] font-bold">Link non disponibile</p>
        <p className="mt-1 text-[13px] text-muted dark:text-muted-dark">{error}</p>
      </Center>
    );

  if (needPassword)
    return (
      <Center>
        {brand}
        <Icon name="shield-check" className="mx-auto mb-2 h-9 w-9 text-brand-magenta" />
        <p className="mb-1 text-[16px] font-bold">Documento protetto</p>
        <p className="mb-4 text-[13px] text-muted dark:text-muted-dark">
          Inserisci la password che ti è stata comunicata.
        </p>
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && unlock()}
          placeholder="Password"
          autoFocus
        />
        {pwError && <p className="mt-2 text-[12px] text-danger">{pwError}</p>}
        <Button className="mt-4 w-full" onClick={unlock} loading={unlocking}>
          Apri documento
        </Button>
      </Center>
    );

  if (done)
    return (
      <Center>
        {brand}
        <span className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-full bg-mint/15 text-mint">
          <Icon name="check-circle" className="h-9 w-9" />
        </span>
        <h1 className="text-[19px] font-bold">Documento firmato</h1>
        <p className="mt-2 text-[13px] text-muted dark:text-muted-dark">
          Grazie! Abbiamo ricevuto il tuo documento «{data?.document_title}» firmato. Riceverai a
          breve una copia in PDF via email.
        </p>
      </Center>
    );

  // ── Form di firma ─────────────────────────────────────────────────────────
  // Scroll proprio: il <body> dell'app ha overflow:hidden, questa pagina pubblica
  // vive fuori dal layout e deve scorrere da sé.
  return (
    <div className="h-[100dvh] overflow-y-auto bg-cream pb-16 dark:bg-[#0E0F0E]">
      {/* Header con il brand dell'azienda che invia il contratto */}
      <header className="flex items-center justify-between gap-3 border-b border-line bg-paper px-5 py-3 dark:border-line-dark dark:bg-[#131316]">
        {data?.company_logo ? (
          <img
            src={data.company_logo}
            alt={data.company_name}
            className="h-9 max-w-[220px] object-contain"
          />
        ) : (
          <span className="truncate text-[15px] font-extrabold uppercase tracking-wider">
            {data?.company_name || "Documento"}
          </span>
        )}
        <span className="flex-none rounded-full border border-line px-2.5 py-0.5 text-[11px] font-semibold text-muted dark:border-line-dark dark:text-muted-dark">
          Firma documento
        </span>
      </header>

      <div className="mx-auto w-full max-w-2xl px-4">
        {/* Hero */}
        <div className="py-7">
          <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-brand-magenta">
            Documento da firmare
          </span>
          <h1 className="mt-1 text-[26px] font-bold leading-tight">{data?.document_title}</h1>
          <p className="mt-2 text-[13.5px] text-muted dark:text-muted-dark">
            {data?.signer_name ? `Ciao ${data.signer_name}! ` : "Ciao! "}
            Controlla i dati già inseriti, completa quelli mancanti e firma in fondo alla pagina.
          </p>
          {missing > 0 && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-brand-magenta/30 bg-brand-magenta/10 px-3 py-2 text-[13px] font-semibold text-brand-magenta">
              <Icon name="alert-triangle" className="h-4 w-4" />
              {missing} {missing === 1 ? "campo da completare" : "campi da completare"} prima di firmare.
            </div>
          )}
        </div>

        {/* 1 — I tuoi dati, per sezioni */}
        <section className="mb-5 overflow-hidden rounded-2xl border border-line bg-paper shadow-sm dark:border-line-dark dark:bg-[#131316]">
          <header className="flex items-center gap-3 border-b border-line bg-cream/50 px-5 py-3.5 dark:border-line-dark dark:bg-ink-2/40">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-ink text-[12px] font-bold text-paper dark:bg-brand-magenta dark:text-white">1</span>
            <span>
              <b className="block text-[14px] font-bold">I tuoi dati</b>
              <span className="text-[12px] text-muted dark:text-muted-dark">Verifica e completa le informazioni</span>
            </span>
          </header>
          <div className="flex flex-col gap-5 p-5">
            {(data?.areas ?? []).map((area) => {
              const areaFields = formFields.filter((f) => (f.group_key || "altro") === area.key);
              if (areaFields.length === 0) return null;
              return (
                <div key={area.key}>
                  <div className="mb-2 flex items-center gap-2">
                    <Icon name={area.icon || "list"} className="h-4 w-4 text-brand-magenta" />
                    <span className="text-[12px] font-bold uppercase tracking-wide">{area.label}</span>
                    <span className="h-px flex-1 bg-line dark:bg-line-dark" />
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {areaFields.map((f) => {
                      const empty = !(values[f.key] ?? "").trim();
                      const isPrefilled = prefilled.has(f.key) && !empty;
                      const err = touched && f.required && empty;
                      return (
                        <label key={f.key} className="flex flex-col gap-1" data-err={err ? "1" : undefined}>
                          <span className="flex min-h-[18px] items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted dark:text-muted-dark">
                            <span className="min-w-0 truncate" title={f.label}>
                              {f.label}
                            </span>
                            {f.required && <span className="flex-none text-brand-magenta">*</span>}
                            {isPrefilled ? (
                              <span className="flex-none whitespace-nowrap rounded bg-mint/10 px-1.5 py-0.5 text-[9.5px] font-semibold text-mint">
                                precompilato
                              </span>
                            ) : empty ? (
                              <span className={`flex-none whitespace-nowrap rounded px-1.5 py-0.5 text-[9.5px] font-semibold ${f.required ? "bg-brand-magenta/10 text-brand-magenta" : "bg-cream text-muted dark:bg-ink-2 dark:text-muted-dark"}`}>
                                {f.required ? "da completare" : "opzionale"}
                              </span>
                            ) : null}
                          </span>
                          <Input
                            value={values[f.key] ?? ""}
                            onChange={(e) => onChange(f.key, e.target.value)}
                            type={f.field_type === "date" ? "date" : f.field_type === "number" ? "number" : "text"}
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {formFields.length === 0 && (
              <p className="text-center text-[13px] text-muted dark:text-muted-dark">
                Nessun dato da completare: ti basta firmare qui sotto.
              </p>
            )}
          </div>
        </section>

        {/* 2 — Il documento */}
        <section className="mb-5 flex items-center justify-between rounded-2xl border border-line bg-paper px-5 py-4 shadow-sm dark:border-line-dark dark:bg-[#131316]">
          <div className="flex items-center gap-3">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-ink text-[12px] font-bold text-paper dark:bg-brand-magenta dark:text-white">2</span>
            <span>
              <b className="block text-[14px] font-bold">Il documento</b>
              <span className="text-[12px] text-muted dark:text-muted-dark">Rivedi il testo completo prima di firmare</span>
            </span>
          </div>
          <Button variant="secondary" size="sm" onClick={viewPdf} leftIcon={<Icon name="eye" className="h-3.5 w-3.5" />}>
            Vedi PDF
          </Button>
        </section>

        {/* 3 — Firma */}
        <section className="overflow-hidden rounded-2xl border border-line bg-paper shadow-sm dark:border-line-dark dark:bg-[#131316]">
          <header className="flex items-center gap-3 border-b border-line bg-cream/50 px-5 py-3.5 dark:border-line-dark dark:bg-ink-2/40">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-ink text-[12px] font-bold text-paper dark:bg-brand-magenta dark:text-white">3</span>
            <span>
              <b className="block text-[14px] font-bold">Firma</b>
              <span className="text-[12px] text-muted dark:text-muted-dark">Firma autografa</span>
            </span>
          </header>
          <div className="flex flex-col gap-4 p-5">
            <SignaturePad onChange={setSignature} hasSignature={!!signature} />
            {touched && !signature && (
              <span className="flex items-center gap-1 text-[12px] font-semibold text-danger">
                <Icon name="alert-triangle" className="h-3.5 w-3.5" /> Firma richiesta
              </span>
            )}

            <label className="flex cursor-pointer items-start gap-2.5">
              <Checkbox checked={consent} onChange={setConsent} />
              <span className="text-[12.5px] leading-snug text-ink dark:text-paper">
                Dichiaro di aver letto e accettato il contenuto del documento e autorizzo il
                trattamento dei dati ai sensi del Reg. UE 2016/679.
                {touched && !consent && (
                  <span className="ml-1 font-semibold text-danger">— obbligatorio</span>
                )}
              </span>
            </label>

            {submitError && (
              <div className="rounded-lg bg-danger/10 px-3 py-2 text-[13px] font-semibold text-danger">{submitError}</div>
            )}

            <Button
              className="w-full"
              onClick={handleSubmit}
              loading={submitting}
              leftIcon={<Icon name="pencil" className="h-4 w-4" />}
            >
              Firma e invia il documento
            </Button>
            <p className="text-center text-[11px] text-muted dark:text-muted-dark">
              Firmando accetti che la sottoscrizione avvenga in forma elettronica.
            </p>
          </div>
        </section>

        {/* Footer: contatti dell'azienda */}
        <footer className="mt-8 flex flex-col items-center gap-1 border-t border-line pt-5 text-center text-[11.5px] text-muted dark:border-line-dark dark:text-muted-dark">
          {data?.company_name && <span className="font-semibold text-ink dark:text-paper">{data.company_name}</span>}
          <span className="flex flex-wrap justify-center gap-x-3 gap-y-0.5">
            {data?.company_email && (
              <a href={`mailto:${data.company_email}`} className="hover:text-brand-magenta">
                {data.company_email}
              </a>
            )}
            {data?.company_phone && <span>{data.company_phone}</span>}
            {data?.company_website && (
              <a
                href={/^https?:\/\//.test(data.company_website) ? data.company_website : `https://${data.company_website}`}
                target="_blank"
                rel="noreferrer"
                className="hover:text-brand-magenta"
              >
                {data.company_website.replace(/^https?:\/\//, "")}
              </a>
            )}
          </span>
          {data?.company_address && <span>{data.company_address}</span>}
        </footer>
      </div>
    </div>
  );
}
