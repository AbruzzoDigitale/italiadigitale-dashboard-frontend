import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addDocumentLinkApi,
  deleteDocumentApi,
  deleteTemplateFieldApi,
  getDocumentApi,
  listSourcePathsApi,
  removeDocumentLinkApi,
  visualScanApi,
  updateDocumentApi,
  updateTemplateFieldApi,
  DOC_TYPE_LABELS,
  formatDocSize,
  type DocFieldType,
  type DocLinkEntityType,
  type DocumentDetail,
  type SourcePathInfo,
  type TemplateField,
} from "../../api/documents";
import { getClientsApi } from "../../api/clients";
import { listContractsApi } from "../../api/contracts";
import { getQuotesApi } from "../../api/quotes";
import { useToast } from "../../context/ToastContext";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";
import { SearchableSelect, type SearchableSelectOption } from "../ui/SearchableSelect";
import { Spinner } from "../ui/Spinner";
import { openDocumentDownload, openDocumentPdfExport } from "./documentActions";

const FIELD_TYPE_OPTIONS: SearchableSelectOption[] = [
  { value: "text", label: "Testo" },
  { value: "textarea", label: "Testo lungo" },
  { value: "date", label: "Data" },
  { value: "number", label: "Numero" },
];

const LINK_TYPE_OPTIONS: SearchableSelectOption[] = [
  { value: "client", label: "Cliente" },
  { value: "contract", label: "Contratto" },
  { value: "quote", label: "Preventivo" },
];

const LINK_TYPE_LABELS: Record<DocLinkEntityType, string> = {
  client: "Cliente",
  contract: "Contratto",
  quote: "Preventivo",
};

const FREE_TEXT_VALUE = "__free__";

interface DocumentDetailModalProps {
  documentId: number | null;
  open: boolean;
  onClose: () => void;
  /** Notifica modifiche (rinomina, eliminazione, link) per il refresh dell'archivio. */
  onChanged?: () => void;
  /** Apre il wizard di compilazione (modello_contratto) o modifica valori (compilato). */
  onFill?: (doc: DocumentDetail) => void;
}

export function DocumentDetailModal({
  documentId,
  open,
  onClose,
  onChanged,
  onFill,
}: DocumentDetailModalProps) {
  const toast = useToast();

  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [sourcePaths, setSourcePaths] = useState<SourcePathInfo[]>([]);

  const [editingMeta, setEditingMeta] = useState(false);
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");

  const [linkType, setLinkType] = useState<DocLinkEntityType | "">("");
  const [linkEntityId, setLinkEntityId] = useState("");
  const [linkOptions, setLinkOptions] = useState<SearchableSelectOption[]>([]);
  const [linkOptionsLoading, setLinkOptionsLoading] = useState(false);

  const [rescanLoading, setRescanLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const isTemplate = doc?.doc_type === "modello" || doc?.doc_type === "modello_contratto";

  const reload = useCallback(async () => {
    if (documentId == null) return;
    setLoading(true);
    try {
      const detail = await getDocumentApi(documentId);
      setDoc(detail);
      setMetaTitle(detail.title);
      setMetaDescription(detail.description ?? "");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Documento non trovato");
      onClose();
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId]);

  useEffect(() => {
    if (open && documentId != null) {
      setDoc(null);
      setEditingMeta(false);
      setLinkType("");
      setLinkEntityId("");
      reload();
    }
  }, [open, documentId, reload]);

  useEffect(() => {
    if (!open || !isTemplate || sourcePaths.length) return;
    listSourcePathsApi()
      .then(setSourcePaths)
      .catch(() => setSourcePaths([]));
  }, [open, isTemplate, sourcePaths.length]);

  // Opzioni entità per il nuovo collegamento (caricate al cambio tipo).
  useEffect(() => {
    if (!open || !doc || !linkType) {
      setLinkOptions([]);
      return;
    }
    let cancelled = false;
    setLinkOptionsLoading(true);
    setLinkEntityId("");

    const load = async (): Promise<SearchableSelectOption[]> => {
      if (linkType === "client") {
        const res = await getClientsApi({ company_id: doc.company_id, per_page: 500 });
        return res.data.map((c) => ({
          value: String(c.id),
          label: c.name,
          keywords: [c.commercial_name, c.email, c.vat].filter(Boolean).join(" "),
        }));
      }
      if (linkType === "contract") {
        const res = await listContractsApi({ company_id: doc.company_id });
        return res.map((c) => ({ value: String(c.id), label: c.title }));
      }
      const res = await getQuotesApi({ company_id: doc.company_id, per_page: 500 });
      return res.data.map((q) => ({
        value: String(q.id),
        label: q.title ? `${q.number} — ${q.title}` : q.number,
      }));
    };

    load()
      .then((options) => {
        if (!cancelled) setLinkOptions(options);
      })
      .catch(() => {
        if (!cancelled) setLinkOptions([]);
      })
      .finally(() => {
        if (!cancelled) setLinkOptionsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, doc, linkType]);

  const sourcePathOptions = useMemo<SearchableSelectOption[]>(() => {
    const grouped = sourcePaths.map((p) => ({
      value: p.path,
      label: `${p.gruppo} · ${p.label}`,
      keywords: p.path,
    }));
    return [{ value: FREE_TEXT_VALUE, label: "Testo libero (inserimento manuale)" }, ...grouped];
  }, [sourcePaths]);

  const notifyChanged = () => onChanged?.();

  const saveMeta = async () => {
    if (!doc) return;
    setBusy(true);
    try {
      await updateDocumentApi(doc.id, {
        title: metaTitle.trim() || doc.title,
        description: metaDescription,
      });
      toast.success("Documento aggiornato");
      setEditingMeta(false);
      await reload();
      notifyChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore salvataggio");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!doc) return;
    if (!window.confirm(`Eliminare "${doc.title}"?`)) return;
    setBusy(true);
    try {
      await deleteDocumentApi(doc.id);
      toast.success("Documento eliminato");
      notifyChanged();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore eliminazione");
    } finally {
      setBusy(false);
    }
  };

  const handleAddLink = async () => {
    if (!doc || !linkType || !linkEntityId) return;
    setBusy(true);
    try {
      await addDocumentLinkApi(doc.id, {
        entity_type: linkType,
        entity_id: Number(linkEntityId),
      });
      toast.success("Collegamento aggiunto");
      setLinkType("");
      setLinkEntityId("");
      await reload();
      notifyChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore collegamento");
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveLink = async (linkId: number) => {
    if (!doc) return;
    setBusy(true);
    try {
      await removeDocumentLinkApi(doc.id, linkId);
      await reload();
      notifyChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore rimozione collegamento");
    } finally {
      setBusy(false);
    }
  };

  const patchField = async (
    field: TemplateField,
    body: Parameters<typeof updateTemplateFieldApi>[2]
  ) => {
    if (!doc) return;
    try {
      await updateTemplateFieldApi(doc.id, field.id, body);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore aggiornamento campo");
    }
  };

  const handleDeleteField = async (field: TemplateField) => {
    if (!doc) return;
    if (!window.confirm(`Rimuovere il campo "${field.label}"? In compilazione resterà vuoto.`)) return;
    try {
      await deleteTemplateFieldApi(doc.id, field.id);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore eliminazione campo");
    }
  };

  const handleRescan = async () => {
    if (!doc) return;
    setRescanLoading(true);
    try {
      const result = await visualScanApi(doc.id, true);
      const missing = result.fields_missing.length
        ? `, ${result.fields_missing.length} non più presenti`
        : "";
      toast.success(
        `Analisi completata: ${result.fields_added} nuovi campi, ${result.fields_updated} aggiornati${missing}`
      );
      if (!result.has_text_layer) {
        toast.warning("Nessun testo rilevabile: compila il documento con gli elementi liberi");
      }
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore analisi documento");
    } finally {
      setRescanLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!doc) return;
    try {
      await openDocumentDownload(doc.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore download");
    }
  };

  const handlePdf = async () => {
    if (!doc) return;
    try {
      toast.info("Preparazione anteprima PDF…");
      await openDocumentPdfExport(doc.id, { disposition: "inline" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore anteprima PDF");
    }
  };

  const canExportPdf =
    doc != null &&
    (doc.content_type === "application/pdf" ||
      doc.content_type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document");

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={doc?.title ?? "Documento"}
      icon={<Icon name="document-text" className="w-5 h-5" />}
      size="2xl"
      headerActions={
        doc && (
          <div className="flex items-center gap-1.5">
            {(doc.doc_type === "modello_contratto" || doc.doc_type === "compilato") && onFill && (
              <Button
                size="sm"
                onClick={() => onFill(doc)}
                leftIcon={<Icon name="pencil" className="w-3.5 h-3.5" />}
              >
                {doc.doc_type === "compilato" ? "Modifica valori" : "Compila"}
              </Button>
            )}
            <Button
              size="sm"
              variant="secondary"
              onClick={handleDownload}
              leftIcon={<Icon name="download" className="w-3.5 h-3.5" />}
            >
              Scarica
            </Button>
            {canExportPdf && (
              <Button size="sm" variant="secondary" onClick={handlePdf}>
                PDF
              </Button>
            )}
            <Button
              size="sm"
              variant="danger-ghost"
              iconOnly
              title="Elimina documento"
              aria-label="Elimina documento"
              onClick={handleDelete}
              disabled={busy}
            >
              <Icon name="trash" className="w-4 h-4" />
            </Button>
          </div>
        )
      }
    >
      {loading || !doc ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-6">
          {/* ── Metadati ── */}
          <div className="rounded-lg border border-line dark:border-line-dark p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={doc.doc_type === "compilato" ? "success" : doc.doc_type === "generico" ? "default" : "info"}>
                    {DOC_TYPE_LABELS[doc.doc_type]}
                  </Badge>
                  <span className="text-[12px] text-muted dark:text-muted-dark">
                    {doc.original_filename} · {formatDocSize(doc.size_bytes)}
                  </span>
                </div>
                {doc.source_document_title && (
                  <p className="mt-1 text-[12px] text-muted dark:text-muted-dark">
                    Generato dal modello: <b>{doc.source_document_title}</b>
                  </p>
                )}
                {doc.uploaded_by_name && (
                  <p className="mt-1 text-[12px] text-muted dark:text-muted-dark">
                    Caricato da {doc.uploaded_by_name}
                    {doc.created_at ? ` il ${new Date(doc.created_at).toLocaleDateString("it-IT")}` : ""}
                  </p>
                )}
                {!editingMeta && doc.description && (
                  <p className="mt-2 text-[13px] whitespace-pre-wrap">{doc.description}</p>
                )}
              </div>
              {!editingMeta && (
                <Button
                  size="sm"
                  variant="ghost"
                  iconOnly
                  title="Rinomina / descrizione"
                  aria-label="Rinomina / descrizione"
                  onClick={() => setEditingMeta(true)}
                >
                  <Icon name="pencil" className="w-4 h-4" />
                </Button>
              )}
            </div>

            {editingMeta && (
              <div className="mt-3 space-y-3">
                <Input label="Titolo" value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} />
                <Input
                  label="Descrizione"
                  value={metaDescription}
                  onChange={(e) => setMetaDescription(e.target.value)}
                />
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setEditingMeta(false)}>
                    Annulla
                  </Button>
                  <Button size="sm" onClick={saveMeta} loading={busy}>
                    Salva
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* ── Collegamenti ── */}
          <div>
            <h3 className="text-[13px] font-bold uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Icon name="link" className="w-4 h-4" />
              Collegamenti
            </h3>
            {doc.links.length === 0 ? (
              <p className="text-[13px] text-muted dark:text-muted-dark">
                Nessun collegamento: il documento è solo in archivio.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {doc.links.map((link) => (
                  <li
                    key={link.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-line dark:border-line-dark px-3 py-1.5"
                  >
                    <span className="text-[13px] truncate">
                      <Badge className="mr-2">{LINK_TYPE_LABELS[link.entity_type]}</Badge>
                      {link.entity_label ?? `#${link.entity_id}`}
                    </span>
                    <Button
                      size="sm"
                      variant="danger-ghost"
                      iconOnly
                      title="Rimuovi collegamento"
                      aria-label="Rimuovi collegamento"
                      onClick={() => handleRemoveLink(link.id)}
                      disabled={busy}
                    >
                      <Icon name="x" className="w-4 h-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-3 flex flex-wrap items-end gap-2">
              <div className="w-40">
                <SearchableSelect
                  value={linkType}
                  onChange={(value) => setLinkType(value as DocLinkEntityType)}
                  options={LINK_TYPE_OPTIONS}
                  placeholder="Collega a…"
                  menuLayer="portal"
                  showAvatar={false}
                />
              </div>
              {linkType && (
                <div className="flex-1 min-w-[220px]">
                  <SearchableSelect
                    value={linkEntityId}
                    onChange={setLinkEntityId}
                    options={linkOptions}
                    placeholder={linkOptionsLoading ? "Caricamento…" : `Scegli ${LINK_TYPE_LABELS[linkType].toLowerCase()}`}
                    disabled={linkOptionsLoading}
                    menuLayer="portal"
                    showAvatar={false}
                  />
                </div>
              )}
              {linkType && linkEntityId && (
                <Button size="sm" onClick={handleAddLink} loading={busy} leftIcon={<Icon name="plus" className="w-3.5 h-3.5" />}>
                  Collega
                </Button>
              )}
            </div>
          </div>

          {/* ── Campi del modello ── */}
          {isTemplate && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[13px] font-bold uppercase tracking-wide flex items-center gap-1.5">
                  <Icon name="list" className="w-4 h-4" />
                  Campi del modello ({doc.template_fields.length})
                </h3>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleRescan}
                  loading={rescanLoading}
                  leftIcon={<Icon name="refresh-cw" className="w-3.5 h-3.5" />}
                >
                  Ri-analizza documento
                </Button>
              </div>

              <div className="space-y-1.5">
                {doc.template_fields.map((field) => (
                  <div
                    key={field.id}
                    className="grid grid-cols-[1fr_140px_220px_auto] items-center gap-2 rounded-md border border-line dark:border-line-dark px-3 py-2 max-md:grid-cols-1"
                  >
                    <div className="min-w-0">
                      <Input
                        defaultValue={field.label}
                        onBlur={(e) => {
                          const next = e.target.value.trim();
                          if (next && next !== field.label) patchField(field, { label: next });
                        }}
                      />
                      <p className="mt-0.5 text-[11px] text-muted dark:text-muted-dark truncate">
                        {"{{" + field.tag_name + "}}"}
                        {field.occurrences > 1 ? ` · ${field.occurrences} occorrenze` : ""}
                        {!field.is_in_document && (
                          <Badge variant="warning" className="ml-2">Non presente nel documento</Badge>
                        )}
                      </p>
                    </div>
                    <SearchableSelect
                      value={field.field_type}
                      onChange={(value) => patchField(field, { field_type: value as DocFieldType })}
                      options={FIELD_TYPE_OPTIONS}
                      menuLayer="portal"
                      showAvatar={false}
                    />
                    <SearchableSelect
                      value={field.source_path ?? FREE_TEXT_VALUE}
                      onChange={(value) =>
                        patchField(
                          field,
                          value === FREE_TEXT_VALUE
                            ? { clear_source_path: true }
                            : { source_path: value }
                        )
                      }
                      options={sourcePathOptions}
                      menuLayer="portal"
                      showAvatar={false}
                    />
                    <Button
                      size="sm"
                      variant="danger-ghost"
                      iconOnly
                      title="Rimuovi campo"
                      aria-label="Rimuovi campo"
                      onClick={() => handleDeleteField(field)}
                    >
                      <Icon name="trash" className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>

              <p className="mt-3 text-[12px] text-muted dark:text-muted-dark">
                Per aggiungere campi non rilevati usa gli elementi liberi (testo, spunta, firma)
                direttamente sul documento durante la compilazione.
              </p>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
