import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  createSignatureRequestApi,
  exportDocumentPdfApi,
  getDocumentApi,
  listDocumentsApi,
  listSourcePathsApi,
  reorderTemplateFieldsApi,
  saveCompanyOverlayApi,
  saveFieldAreasApi,
  updateTemplateFieldApi,
  visualFillApi,
  type DocumentDetail,
  type SourcePathInfo,
} from "../api/documents";
import { listContractsApi } from "../api/contracts";
import { getClientsApi } from "../api/clients";
import { DocumentPreview, type DocumentPreviewHandle } from "../components/documents/DocumentPreview";
import { SignatureRequestsModal } from "../components/documents/SignatureRequestsModal";
import {
  ModelFieldForm,
  type FieldConfigPatch,
  type ModelFieldFormHandle,
} from "../components/documents/ModelFieldForm";
import {
  isFilled,
  loadEditorData,
  loadPrecompileValues,
  type EditorField,
  type EditorPart,
} from "../components/documents/modelEditor";
import { Button } from "../components/ui/Button";
import { Checkbox } from "../components/ui/Checkbox";
import { Icon } from "../components/ui/Icon";
import { Input } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { SearchableSelect, type SearchableSelectOption } from "../components/ui/SearchableSelect";
import { SegmentedSwitch } from "../components/ui/SegmentedSwitch";
import { Spinner } from "../components/ui/Spinner";
import { useToast } from "../context/ToastContext";

const MODEL_TYPES = new Set(["modello", "modello_contratto", "parte_contratto"]);

export function ModelEditorPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const docId = Number(documentId);
  const navigate = useNavigate();
  const toast = useToast();

  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [precompiling, setPrecompiling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [savingModel, setSavingModel] = useState(false);

  const [fields, setFields] = useState<EditorField[]>([]);
  const [parts, setParts] = useState<EditorPart[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [fileData, setFileData] = useState<ArrayBuffer | null>(null);
  const [pages, setPages] = useState<{ page: number; width: number; height: number }[]>([]);
  const [partIds, setPartIds] = useState<number[]>([]);
  const [isComposite, setIsComposite] = useState(false);

  const [sourcePaths, setSourcePaths] = useState<SourcePathInfo[]>([]);
  const [models, setModels] = useState<{ id: number; title: string; doc_type: string }[]>([]);
  const [contracts, setContracts] = useState<{ id: number; title: string; client_name?: string | null }[]>([]);
  const [clients, setClients] = useState<{ id: number; name: string }[]>([]);
  const [precompileMode, setPrecompileMode] = useState<"contract" | "client">("contract");
  const [contractId, setContractId] = useState<number | null>(null);
  const [clientId, setClientId] = useState<number | null>(null);

  const [signLink, setSignLink] = useState<string | null>(null);
  const [signaturesOpen, setSignaturesOpen] = useState(false);
  const [inviaOpen, setInviaOpen] = useState(false);
  const [usePassword, setUsePassword] = useState(false);
  const [signPassword, setSignPassword] = useState("");

  const rootId = doc?.id ?? docId;

  // Carica il documento + liste di supporto.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    // Cambio modello: azzera la sorgente di precompilazione.
    setPrecompileMode("contract");
    setContractId(null);
    setClientId(null);
    getDocumentApi(docId)
      .then(async (detail) => {
        if (cancelled) return;
        setDoc(detail);
        const [sp, mods, ctr, cli] = await Promise.all([
          listSourcePathsApi().catch(() => []),
          listDocumentsApi({ company_id: detail.company_id, limit: 500 }).catch(() => []),
          listContractsApi({ company_id: detail.company_id }).catch(() => []),
          getClientsApi({ company_id: detail.company_id, per_page: 500 }).catch(() => ({ data: [] })),
        ]);
        if (cancelled) return;
        setSourcePaths(sp);
        setModels(mods.filter((m) => MODEL_TYPES.has(m.doc_type)).map((m) => ({ id: m.id, title: m.title, doc_type: m.doc_type })));
        setContracts(ctr.map((c) => ({ id: c.id, title: c.title, client_name: c.client_name })));
        setClients(cli.data.map((c) => ({ id: c.id, name: c.commercial_name || c.name })));
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Errore caricamento modello");
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [docId]);

  // (Ri)carica i dati dell'editor (campi/valori/PDF) per il contratto scelto.
  const reload = useCallback(
    async (detail: DocumentDetail, cid: number | null, clId: number | null) => {
      const data = await loadEditorData(detail, cid, clId);
      setFields(data.fields);
      setParts(data.parts);
      setValues(data.values);
      setFileData(data.fileData);
      setPages(data.pages);
      setPartIds(data.partIds);
      setIsComposite(data.isComposite);
    },
    []
  );

  // Caricamento completo (campi + PDF): solo al cambio modello, non alla
  // precompilazione (quella aggiorna solo i valori — vedi applyValues).
  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    setLoading(true);
    reload(doc, null, null)
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Errore caricamento campi");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc]);

  // Aggiorna SOLO i valori (contratto/cliente): niente reload di struttura/PDF.
  const applyValues = async (cid: number | null, clId: number | null) => {
    if (!doc) return;
    setPrecompiling(true);
    try {
      const vals = await loadPrecompileValues(doc, cid, clId);
      setValues(vals);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore precompilazione");
    } finally {
      setPrecompiling(false);
    }
  };

  const partsRef = useRef(parts);
  partsRef.current = parts;
  const formRef = useRef<ModelFieldFormHandle>(null);
  const previewRef = useRef<DocumentPreviewHandle>(null);

  // ── Config campo ───────────────────────────────────────────────────────────
  const onFieldConfig = (field: EditorField, patch: FieldConfigPatch) => {
    // Aggiornamento ottimistico locale.
    setFields((prev) =>
      prev.map((f) => {
        if (f.fieldId !== field.fieldId) return f;
        const next = { ...f };
        if (patch.clear_display_label) next.displayLabel = null;
        else if (patch.display_label !== undefined) next.displayLabel = patch.display_label;
        if (patch.field_type) next.fieldType = patch.field_type;
        if (patch.clear_source_path) next.sourcePath = null;
        else if (patch.source_path !== undefined) next.sourcePath = patch.source_path;
        if (patch.required !== undefined) next.required = patch.required;
        if (patch.audience) next.audience = patch.audience;
        return next;
      })
    );
    updateTemplateFieldApi(field.partDocumentId, field.fieldId, patch)
      .then(() => {
        // Mapping/ambito cambiano il valore risolto: aggiorna SOLO questo campo
        // (senza toccare gli altri valori né ricaricare la struttura/PDF).
        if (patch.source_path !== undefined || patch.clear_source_path || patch.audience) {
          if (doc) {
            loadPrecompileValues(doc, contractId, clientId)
              .then((vals) => setValues((prev) => ({ ...prev, [field.key]: vals[field.key] ?? "" })))
              .catch(() => {});
          }
        }
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "Errore salvataggio campo"));
  };

  // ── Drag&drop campi ────────────────────────────────────────────────────────
  const persistPartOrder = (arr: EditorField[], partId: number) => {
    const part = partsRef.current.find((p) => p.partDocumentId === partId);
    const areaOrder = part ? part.areas.map((a) => a.key) : [];
    const rank = (g: string) => {
      const i = areaOrder.indexOf(g);
      return i < 0 ? 999 : i;
    };
    const ordered = arr.filter((f) => f.partDocumentId === partId).sort((a, b) => rank(a.groupKey) - rank(b.groupKey));
    const items = ordered.map((f, i) => ({ field_id: f.fieldId, group_key: f.groupKey, sort_order: i }));
    reorderTemplateFieldsApi(rootId, items).catch((err) =>
      toast.error(err instanceof Error ? err.message : "Errore riordino campi")
    );
  };

  const onMoveField = (fieldId: number, toGroupKey: string, beforeFieldId: number | null) => {
    setFields((prev) => {
      const moved = prev.find((f) => f.fieldId === fieldId);
      if (!moved) return prev;
      const partId = moved.partDocumentId;
      const movedNew = { ...moved, groupKey: toGroupKey };
      const arr = prev.filter((f) => f.fieldId !== fieldId);
      if (beforeFieldId != null) {
        const idx = arr.findIndex((f) => f.fieldId === beforeFieldId);
        arr.splice(idx < 0 ? arr.length : idx, 0, movedNew);
      } else {
        let insertAt = arr.length;
        for (let i = arr.length - 1; i >= 0; i--) {
          if (arr[i].partDocumentId === partId && arr[i].groupKey === toGroupKey) {
            insertAt = i + 1;
            break;
          }
        }
        arr.splice(insertAt, 0, movedNew);
      }
      persistPartOrder(arr, partId);
      return arr;
    });
  };

  // ── Drag&drop sezioni ──────────────────────────────────────────────────────
  const onMoveArea = (partId: number, areaKey: string, beforeAreaKey: string | null) => {
    setParts((prev) =>
      prev.map((p) => {
        if (p.partDocumentId !== partId) return p;
        const areas = [...p.areas];
        const from = areas.findIndex((a) => a.key === areaKey);
        if (from < 0) return p;
        const [a] = areas.splice(from, 1);
        const to = beforeAreaKey ? areas.findIndex((x) => x.key === beforeAreaKey) : areas.length;
        areas.splice(to < 0 ? areas.length : to, 0, a);
        saveFieldAreasApi(
          partId,
          areas.map((x) => ({ key: x.key, label: x.label, icon: x.icon, sub: x.sub }))
        ).catch((err) => toast.error(err instanceof Error ? err.message : "Errore riordino sezioni"));
        // L'ordine delle sezioni cambia il sort_order dei campi: ripersisti.
        const areaOrder = areas.map((x) => x.key);
        const rank = (g: string) => {
          const i = areaOrder.indexOf(g);
          return i < 0 ? 999 : i;
        };
        const ordered = fields.filter((f) => f.partDocumentId === partId).sort((x, y) => rank(x.groupKey) - rank(y.groupKey));
        reorderTemplateFieldsApi(
          rootId,
          ordered.map((f, i) => ({ field_id: f.fieldId, group_key: f.groupKey, sort_order: i }))
        ).catch(() => {});
        return { ...p, areas };
      })
    );
  };

  // Preset azienda da salvare sul modello: SOLO le firme azienda (data URL).
  // I dati testuali azienda si risolvono in automatico ad ogni apertura e NON
  // vanno congelati; i dati del CLIENTE (campi non interni) non vengono mai salvati.
  const companyPreset = (vals: Record<string, string>): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const f of fields) {
      if (f.audience !== "internal" || f.fieldType !== "signature") continue;
      const v = vals[f.key] ?? "";
      if (v.startsWith("data:image")) out[f.key] = v;
    }
    return out;
  };

  // ── Salva modello: persiste le firme azienda (preset riusato ad ogni apertura).
  //    Mappature, tipi, sezioni e ordine sono già salvati in tempo reale.
  const onSaveModel = async () => {
    if (!doc) return;
    setSavingModel(true);
    try {
      await saveCompanyOverlayApi(rootId, { values: companyPreset(values), elements: [], signatures: {} });
      toast.success("Modello salvato: firme e impostazioni azienda saranno già pronte alle prossime aperture");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore salvataggio modello");
    } finally {
      setSavingModel(false);
    }
  };

  // ── Firma azienda (impostata sul modello, precompilata) ──────────────────────
  const onFieldSignature = (field: EditorField, dataUrl: string) => {
    setValues((prev) => {
      const next = { ...prev, [field.key]: dataUrl };
      // Persiste solo le firme azienda (mai dati cliente): auto-apposte su ogni contratto.
      saveCompanyOverlayApi(rootId, { values: companyPreset(next), elements: [], signatures: {} })
        .then(() => toast.success("Firma azienda salvata sul modello"))
        .catch((err) => toast.error(err instanceof Error ? err.message : "Errore salvataggio firma"));
      return next;
    });
  };

  // ── Precompila / svuota ────────────────────────────────────────────────────
  const onSvuota = () => {
    setValues((prev) => {
      const next = { ...prev };
      for (const f of fields) if (f.audience !== "internal") next[f.key] = "";
      return next;
    });
  };

  // ── Invia per la firma ─────────────────────────────────────────────────────
  const generateLink = async () => {
    if (!doc) return;
    if (usePassword && !signPassword.trim()) {
      toast.error("Inserisci una password o disattiva la protezione");
      return;
    }
    setBusy(true);
    try {
      const req = await createSignatureRequestApi(doc.id, {
        contract_id: precompileMode === "contract" ? contractId : null,
        client_id: precompileMode === "client" ? clientId : null,
        part_ids: isComposite ? partIds : undefined,
        otp_channel: "email",
        password: usePassword && signPassword.trim() ? signPassword.trim() : undefined,
      });
      setInviaOpen(false);
      setSignLink(`${window.location.origin}/firma/${req.token}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore generazione link");
    } finally {
      setBusy(false);
    }
  };

  const onDownload = async () => {
    if (!doc) return;
    if (isComposite && contractId == null) {
      toast.error("Scegli un contratto per generare il PDF compilato");
      return;
    }
    setBusy(true);
    try {
      toast.info("Generazione PDF compilato…");
      // Burn dei valori correnti in una copia compilata, poi apri il PDF.
      const compiled = await visualFillApi(doc.id, {
        contract_id: contractId,
        values,
        elements: [],
        signatures: {},
        part_ids: isComposite ? partIds : undefined,
      });
      const { url } = await exportDocumentPdfApi(compiled.id, { disposition: "inline" });
      window.open(url, "_blank");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore download PDF");
    } finally {
      setBusy(false);
    }
  };

  const modelOptions = useMemo<SearchableSelectOption[]>(
    () => models.map((m) => ({ value: String(m.id), label: m.title })),
    [models]
  );
  const contractOptions = useMemo<SearchableSelectOption[]>(
    () => contracts.map((c) => ({ value: String(c.id), label: c.client_name ? `${c.title} — ${c.client_name}` : c.title })),
    [contracts]
  );
  const clientOptions = useMemo<SearchableSelectOption[]>(
    () => clients.map((c) => ({ value: String(c.id), label: c.name })),
    [clients]
  );

  const countable = fields.filter((f) => f.fieldType !== "signature");
  const filled = countable.filter((f) => isFilled(values[f.key])).length;
  const pct = countable.length ? Math.round((filled / countable.length) * 100) : 0;

  if (error) {
    return (
      <div className="p-8">
        <p className="text-[14px] text-danger">{error}</p>
        <Button className="mt-4" variant="secondary" onClick={() => navigate("/documenti")}>
          Torna ai documenti
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      {/* Header */}
      <div className="flex flex-none flex-wrap items-end justify-between gap-3 px-6 pb-3 pt-5">
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => navigate("/documenti")}
            className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted hover:text-brand-magenta dark:text-muted-dark"
          >
            <Icon name="chevron-right" className="h-3 w-3 rotate-180" /> Documenti
          </button>
          <h1 className="truncate text-[22px] font-bold">{doc?.title ?? "Modello"}</h1>
          <p className="text-[12.5px] text-muted dark:text-muted-dark">
            Compila i dati: il sistema li inserisce nel documento e genera il link di firma.
          </p>
        </div>
        <div className="flex items-end gap-2 max-md:w-full">
          <Button
            variant="secondary"
            onClick={() => setSignaturesOpen(true)}
            leftIcon={<Icon name="list" className="h-4 w-4" />}
            title="Invii, audit trail e documenti firmati"
          >
            Firme
          </Button>
          <Button
            variant="secondary"
            onClick={onSaveModel}
            loading={savingModel}
            leftIcon={<Icon name="check" className="h-4 w-4" />}
            title="Salva mappature, dati azienda e firme come preset del modello"
          >
            Salva modello
          </Button>
          <div className="w-56 max-md:flex-1">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted dark:text-muted-dark">
              Modello
            </span>
            <SearchableSelect
              value={String(rootId)}
              onChange={(v) => v && navigate(`/documenti/modello/${v}`)}
              options={modelOptions}
              showAvatar={false}
              menuLayer="portal"
            />
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-none flex-wrap items-center gap-3 border-y border-line bg-cream/40 px-6 py-2.5 dark:border-line-dark dark:bg-ink-2/40">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted dark:text-muted-dark">
          Precompila da
        </span>
        <SegmentedSwitch
          value={precompileMode}
          onChange={(m) => {
            setPrecompileMode(m);
            setContractId(null);
            setClientId(null);
            void applyValues(null, null);
          }}
          options={[
            { value: "contract", label: "Contratto" },
            { value: "client", label: "Cliente" },
          ]}
        />
        <div className="w-72 max-md:w-full">
          {precompileMode === "contract" ? (
            <SearchableSelect
              value={contractId != null ? String(contractId) : ""}
              onChange={(v) => {
                const id = v ? Number(v) : null;
                setContractId(id);
                setClientId(null);
                void applyValues(id, null);
              }}
              options={contractOptions}
              placeholder="Scegli un contratto…"
              showAvatar={false}
              menuLayer="portal"
            />
          ) : (
            <SearchableSelect
              value={clientId != null ? String(clientId) : ""}
              onChange={(v) => {
                const id = v ? Number(v) : null;
                setClientId(id);
                setContractId(null);
                void applyValues(null, id);
              }}
              options={clientOptions}
              placeholder="Scegli un cliente…"
              showAvatar={false}
              menuLayer="portal"
            />
          )}
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={onSvuota}
          leftIcon={<Icon name="refresh-cw" className="h-3.5 w-3.5" />}
        >
          Svuota
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[12px] font-semibold tabular-nums text-muted dark:text-muted-dark">
            {filled}/{countable.length} campi
          </span>
          <span className="h-1.5 w-32 overflow-hidden rounded-full bg-line dark:bg-line-dark">
            <span
              className={`block h-full rounded-full ${pct === 100 ? "bg-mint" : "bg-brand-magenta"}`}
              style={{ width: `${pct}%` }}
            />
          </span>
        </div>
      </div>

      {/* Split */}
      {loading || !fileData ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner />
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[1fr_minmax(360px,44%)] gap-0 max-lg:grid-cols-1">
          <div className="min-w-0 overflow-y-auto px-6 py-5 max-lg:order-2">
            <ModelFieldForm
              ref={formRef}
              parts={parts}
              fields={fields}
              values={values}
              sourcePaths={sourcePaths}
              onValueChange={(key, v) => setValues((prev) => ({ ...prev, [key]: v }))}
              onFieldConfig={onFieldConfig}
              onFieldSignature={onFieldSignature}
              onGoToDocument={(id) => previewRef.current?.scrollToField(id)}
              onMoveField={onMoveField}
              onMoveArea={onMoveArea}
            />
          </div>
          <div className="flex min-h-0 min-w-0 flex-col gap-3 border-l border-line bg-cream/30 p-4 dark:border-line-dark dark:bg-ink-2/30 max-lg:order-1 max-lg:border-l-0 max-lg:border-b">
            {precompiling && (
              <div className="flex flex-none items-center gap-2 rounded-lg border border-brand-magenta/30 bg-brand-magenta/10 px-3 py-2 text-[12px] font-semibold text-brand-magenta">
                <Icon name="refresh-cw" className="h-3.5 w-3.5 animate-spin" />
                Inserimento dati in corso…
              </div>
            )}
            <div className="min-h-0 flex-1">
              <DocumentPreview
                ref={previewRef}
                fileData={fileData}
                pages={pages}
                fields={fields}
                values={values}
                onFieldClick={(id) => formRef.current?.focusField(id)}
              />
            </div>
            <div className="flex flex-none flex-col gap-2">
              <Button variant="secondary" onClick={onDownload} leftIcon={<Icon name="download" className="h-4 w-4" />}>
                Scarica PDF compilato
              </Button>
              <Button
                onClick={() => {
                  setUsePassword(false);
                  setSignPassword("");
                  setInviaOpen(true);
                }}
                leftIcon={<Icon name="paperclip" className="h-4 w-4" />}
              >
                Invia per la firma
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Invia per la firma: opzione password */}
      <Modal
        open={inviaOpen}
        onClose={() => setInviaOpen(false)}
        title="Invia per la firma"
        description="Genera il link di firma per il cliente"
        icon={<Icon name="paperclip" className="h-5 w-5" />}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setInviaOpen(false)} disabled={busy}>
              Annulla
            </Button>
            <Button onClick={generateLink} loading={busy} leftIcon={<Icon name="link" className="h-4 w-4" />}>
              Genera link
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <label className="flex cursor-pointer items-start gap-2.5">
            <Checkbox checked={usePassword} onChange={setUsePassword} />
            <span className="text-[13px]">
              <b>Proteggi il link con una password</b>
              <span className="block text-[12px] text-muted dark:text-muted-dark">
                Il cliente dovrà inserirla per aprire il documento. Comunicagliela a parte.
              </span>
            </span>
          </label>
          {usePassword && (
            <Input
              type="text"
              value={signPassword}
              onChange={(e) => setSignPassword(e.target.value)}
              placeholder="Password del documento"
              autoFocus
            />
          )}
        </div>
      </Modal>

      <SignatureRequestsModal
        open={signaturesOpen}
        onClose={() => setSignaturesOpen(false)}
        documentId={doc?.id ?? null}
      />

      {/* Link generato */}
      <Modal
        open={signLink != null}
        onClose={() => setSignLink(null)}
        title="Link di firma generato"
        icon={<Icon name="link" className="h-5 w-5" />}
        size="md"
      >
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-muted dark:text-muted-dark">
            Condividi questo link con il cliente per la firma del documento.
          </p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={signLink ?? ""}
              className="flex-1 rounded-lg border border-line bg-cream/50 px-3 py-2 text-[12px] dark:border-line-dark dark:bg-ink-2/50"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button
              size="sm"
              onClick={() => {
                if (signLink) {
                  void navigator.clipboard.writeText(signLink);
                  toast.success("Link copiato");
                }
              }}
              leftIcon={<Icon name="copy" className="h-3.5 w-3.5" />}
            >
              Copia
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default ModelEditorPage;
