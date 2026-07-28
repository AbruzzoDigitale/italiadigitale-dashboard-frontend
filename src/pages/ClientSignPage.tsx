import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  fetchSignFillBaseApi,
  openSignApi,
  submitSignApi,
  type OverlayElement,
  type PublicSignData,
  type PublicSignField,
  type TemplateField,
} from "../api/documents";
import { PdfFillEditor } from "../components/documents/PdfFillEditor";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { Input } from "../components/ui/Input";
import { Spinner } from "../components/ui/Spinner";

function toTemplateField(f: PublicSignField, i: number): TemplateField {
  return {
    id: i + 1,
    tag_name: f.tag_name,
    label: f.label,
    field_type: f.field_type,
    source_path: null,
    required: f.required,
    audience: "client",
    is_in_document: true,
    occurrences: 1,
    placeholder_len: null,
    sort_order: i,
    page: f.page,
    pos_x: f.pos_x,
    pos_y: f.pos_y,
    pos_w: f.pos_w,
    pos_h: f.pos_h,
    font_size: f.font_size,
    placeholder_kind: f.placeholder_kind,
  };
}

export default function ClientSignPage() {
  const { token = "" } = useParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PublicSignData | null>(null);
  const [needPassword, setNeedPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  const [fileData, setFileData] = useState<ArrayBuffer | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [elements, setElements] = useState<OverlayElement[]>([]);
  const [signatures, setSignatures] = useState<Record<string, string>>({});

  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const fields = useMemo(() => (data?.fields ?? []).map(toTemplateField), [data]);

  // Carica documento + fill-base una volta sbloccata la richiesta.
  const loadContent = useCallback(
    async (d: PublicSignData, pwd?: string) => {
      setData(d);
      setValues(d.values ?? {});
      if (d.status === "filled" || d.status === "signed") {
        setDone(true);
        return;
      }
      const buffer = await fetchSignFillBaseApi(token, pwd);
      setFileData(buffer);
    },
    [token]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const d = await openSignApi(token);
        if (cancelled) return;
        if (d.requires_password && d.fields.length === 0) {
          setNeedPassword(true); // pagina protetta: chiedi la password
        } else {
          await loadContent(d);
        }
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
      await loadContent(d, password);
      setNeedPassword(false);
    } catch (err) {
      setPwError(err instanceof Error ? err.message : "Password errata");
    } finally {
      setUnlocking(false);
    }
  };

  const handleSubmit = async () => {
    const missing = (data?.fields ?? []).filter(
      (f) => f.required && !(values[f.tag_name] ?? "").trim()
    );
    if (missing.length) {
      setError(`Compila i campi obbligatori: ${missing.map((f) => f.label).join(", ")}`);
      return;
    }
    const sigFields = (data?.fields ?? []).filter((f) => f.field_type === "signature");
    const isSig = (v?: string) => !!v && v.startsWith("data:image");
    const signed = sigFields.length
      ? sigFields.some((f) => isSig(values[f.tag_name]))
      : elements.some((e) => e.type === "signature");
    if (!signed) {
      setError("Aggiungi la tua firma prima di inviare.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await submitSignApi(token, { password: password || undefined, values, elements, signatures });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante l'invio");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Stati "a pagina intera" ──────────────────────────────────────────────
  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="flex min-h-screen items-center justify-center bg-cream p-4 dark:bg-[#0E0F0E]">
      <div className="w-full max-w-md rounded-xl border border-line bg-paper p-6 text-center shadow-2 dark:border-line-dark dark:bg-[#131316]">
        {children}
      </div>
    </div>
  );

  if (loading) {
    return (
      <Shell>
        <Spinner />
      </Shell>
    );
  }

  if (error && !data) {
    return (
      <Shell>
        <Icon name="x" className="mx-auto mb-2 h-8 w-8 text-danger" />
        <p className="text-[14px] font-semibold">Link non disponibile</p>
        <p className="mt-1 text-[13px] text-muted dark:text-muted-dark">{error}</p>
      </Shell>
    );
  }

  if (needPassword) {
    return (
      <Shell>
        <Icon name="shield-check" className="mx-auto mb-2 h-8 w-8" />
        <p className="mb-1 text-[15px] font-bold">Documento protetto</p>
        <p className="mb-4 text-[13px] text-muted dark:text-muted-dark">
          Inserisci la password che ti è stata comunicata per aprire il documento.
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
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell>
        <Icon name="check-circle" className="mx-auto mb-2 h-10 w-10 text-success" />
        <p className="text-[15px] font-bold">Grazie, è tutto fatto!</p>
        <p className="mt-1 text-[13px] text-muted dark:text-muted-dark">
          Il documento «{data?.document_title}» è stato compilato e firmato. Riceverai una copia via
          email.
        </p>
      </Shell>
    );
  }

  // ── Editor a tutto schermo ────────────────────────────────────────────────
  return (
    <div className="flex h-[100dvh] flex-col bg-cream dark:bg-[#0E0F0E]">
      <header className="flex flex-none items-center justify-between gap-3 border-b border-line bg-paper px-4 py-3 dark:border-line-dark dark:bg-[#131316]">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-bold">{data?.document_title}</p>
          <p className="text-[12px] text-muted dark:text-muted-dark">
            {data?.signer_name ? `Per ${data.signer_name} · ` : ""}Compila i campi e apponi la firma
          </p>
        </div>
        <Button
          onClick={handleSubmit}
          loading={submitting}
          leftIcon={<Icon name="check" className="h-4 w-4" />}
        >
          Firma e invia
        </Button>
      </header>

      {error && (
        <div className="flex-none bg-danger/10 px-4 py-2 text-[13px] text-danger">{error}</div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {fileData && data && (
          <PdfFillEditor
            fileData={fileData}
            pages={data.page_metrics}
            fields={fields}
            values={values}
            onValuesChange={setValues}
            elements={elements}
            onElementsChange={setElements}
            signatures={signatures}
            onSignaturesChange={setSignatures}
            hasTextLayer
          />
        )}
      </div>
    </div>
  );
}
