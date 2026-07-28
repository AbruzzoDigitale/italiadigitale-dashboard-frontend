import { useCallback, useEffect, useRef, useState } from "react";
import {
  addDocumentLinkApi,
  deleteDocumentApi,
  deleteTemplateFieldApi,
  getDocumentApi,
  linkPartApi,
  listDocumentsApi,
  listSourcePathsApi,
  removeDocumentLinkApi,
  unlinkPartApi,
  updatePartApi,
  uploadPartApi,
  visualScanApi,
  updateDocumentApi,
  updateTemplateFieldApi,
  DOC_TYPE_LABELS,
  formatDocSize,
  type DocFieldType,
  type DocLinkEntityType,
  type DocumentDetail,
  type DocumentPart,
  type SourcePathInfo,
  type TemplateField,
} from "../../api/documents";
import { getClientsApi } from "../../api/clients";
import { listContractsApi } from "../../api/contracts";
import { getQuotesApi } from "../../api/quotes";
import { useToast } from "../../context/ToastContext";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Checkbox";
import { Icon } from "../ui/Icon";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";
import { SearchableSelect, type SearchableSelectOption } from "../ui/SearchableSelect";
import { Spinner } from "../ui/Spinner";
import { openDocumentDownload, openDocumentPdfExport } from "./documentActions";
import { FieldLayoutModal } from "./FieldLayoutModal";
import { GenerateClientLinkModal } from "./GenerateClientLinkModal";

const FIELD_TYPE_OPTIONS: SearchableSelectOption[] = [
  { value: "text", label: "Testo" },
  { value: "textarea", label: "Testo lungo" },
  { value: "date", label: "Data" },
  { value: "number", label: "Numero" },
  { value: "signature", label: "Firma elettronica" },
];

const AUDIENCE_OPTIONS: SearchableSelectOption[] = [
  { value: "client", label: "Cliente" },
  { value: "internal", label: "Interno (azienda)" },
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
  const [partUploading, setPartUploading] = useState(false);
  const partInputRef = useRef<HTMLInputElement | null>(null);
  const [libraryOptions, setLibraryOptions] = useState<SearchableSelectOption[]>([]);
  const [linkPickerValue, setLinkPickerValue] = useState("");
  const [clientLinkOpen, setClientLinkOpen] = useState(false);
  const [fieldLayoutOpen, setFieldLayoutOpen] = useState(false);

  // Ordine locale delle parti (per il drag & drop, ottimistico).
  const [orderedParts, setOrderedParts] = useState<DocumentPart[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  // I campi propri li hanno i modelli e le parti; il modello_contratto è un
  // compositore (i campi stanno nelle parti collegate).
  const isTemplate = doc?.doc_type === "modello" || doc?.doc_type === "parte_contratto";
  const isComposite = doc?.doc_type === "modello_contratto";

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

  // Ordine locale allineato al documento a ogni ricarica.
  useEffect(() => {
    setOrderedParts([...(doc?.parts ?? [])].sort((a, b) => a.sort_order - b.sort_order));
  }, [doc]);

  useEffect(() => {
    if (!open || !isTemplate || sourcePaths.length) return;
    listSourcePathsApi()
      .then(setSourcePaths)
      .catch(() => setSourcePaths([]));
  }, [open, isTemplate, sourcePaths.length]);

  // Libreria parti collegabili (documenti parte_contratto della stessa azienda,
  // escluse quelle già collegate).
  useEffect(() => {
    if (!open || !doc || !isComposite) {
      setLibraryOptions([]);
      return;
    }
    const linkedIds = new Set(doc.parts.map((p) => p.part_document_id));
    listDocumentsApi({ company_id: doc.company_id, doc_type: "parte_contratto", limit: 500 })
      .then((docs) =>
        setLibraryOptions(
          docs
            .filter((d) => !linkedIds.has(d.id))
            .map((d) => ({ value: String(d.id), label: d.title, keywords: d.original_filename }))
        )
      )
      .catch(() => setLibraryOptions([]));
  }, [open, doc, isComposite]);

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

  // Gruppi di dati per ambito: un campo Cliente attinge a cliente/contratto/
  // preventivo; un campo Interno (azienda) attinge ai dati dell'azienda.
  const groupsForAudience = (audience: "client" | "internal"): Set<string> =>
    audience === "internal"
      ? new Set(["Azienda", "Generale"])
      : new Set(["Cliente", "Contratto", "Preventivo", "Generale"]);

  const groupOfPath = (path: string | null): string | undefined =>
    path ? sourcePaths.find((p) => p.path === path)?.gruppo : undefined;

  const sourceOptionsFor = (audience: "client" | "internal"): SearchableSelectOption[] => {
    const allowed = groupsForAudience(audience);
    const grouped = sourcePaths
      .filter((p) => allowed.has(p.gruppo))
      .map((p) => ({ value: p.path, label: `${p.gruppo} · ${p.label}`, keywords: p.path }));
    return [{ value: FREE_TEXT_VALUE, label: "Testo libero (inserimento manuale)" }, ...grouped];
  };

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

  const handleAddPart = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !doc) return;
    if (!/\.(pdf|docx)$/i.test(file.name)) {
      toast.error("La parte deve essere un PDF o un Word (.docx)");
      return;
    }
    const title = window.prompt("Titolo della parte", file.name.replace(/\.[^.]+$/, "")) ?? "";
    setPartUploading(true);
    try {
      await uploadPartApi(doc.id, file, title.trim() || undefined);
      toast.success("Parte aggiunta");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore aggiunta parte");
    } finally {
      setPartUploading(false);
    }
  };

  const handlePartRename = async (part: DocumentPart, title: string) => {
    if (!doc || title.trim() === part.title) return;
    try {
      await updatePartApi(doc.id, part.link_id, { title: title.trim() || part.title });
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore rinomina parte");
    }
  };

  const handlePartUnlink = async (part: DocumentPart) => {
    if (!doc) return;
    if (!window.confirm(`Scollegare "${part.title}"? La parte resta in archivio, riutilizzabile.`)) {
      return;
    }
    try {
      await unlinkPartApi(doc.id, part.link_id);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore scollegamento parte");
    }
  };

  // Persiste il nuovo ordine (sort_order = indice) aggiornando solo le parti
  // spostate. Aggiornamento ottimistico: la lista si riordina subito.
  const persistPartOrder = async (next: DocumentPart[]) => {
    if (!doc) return;
    const updates = next
      .map((p, i) => ({ linkId: p.link_id, sortOrder: i, changed: p.sort_order !== i }))
      .filter((u) => u.changed);
    setOrderedParts(next.map((p, i) => ({ ...p, sort_order: i })));
    if (!updates.length) return;
    try {
      await Promise.all(
        updates.map((u) => updatePartApi(doc.id, u.linkId, { sort_order: u.sortOrder }))
      );
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore riordino parti");
      await reload();
    }
  };

  const handlePartDrop = (dropIndex: number) => {
    const from = dragIndex;
    setDragIndex(null);
    setOverIndex(null);
    if (from == null || from === dropIndex) return;
    const next = [...orderedParts];
    const [moved] = next.splice(from, 1);
    next.splice(dropIndex, 0, moved);
    void persistPartOrder(next);
  };

  const handleLinkExistingPart = async (partDocumentId: string) => {
    if (!doc || !partDocumentId) return;
    setLinkPickerValue("");
    try {
      await linkPartApi(doc.id, Number(partDocumentId));
      toast.success("Parte collegata");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore collegamento parte");
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
    <>
    <Modal
      open={open}
      onClose={onClose}
      title={doc?.title ?? "Documento"}
      icon={<Icon name="document-text" className="w-5 h-5" />}
      size="2xl"
      headerActions={
        doc && (
          <div className="flex items-center gap-1.5">
            {(doc.doc_type === "modello_contratto" ||
              doc.doc_type === "parte_contratto" ||
              doc.doc_type === "modello" ||
              doc.doc_type === "compilato") &&
              onFill && (
                <Button
                  size="sm"
                  onClick={() => onFill(doc)}
                  leftIcon={<Icon name="pencil" className="w-3.5 h-3.5" />}
                >
                  {doc.doc_type === "compilato" ? "Modifica valori" : "Compila"}
                </Button>
              )}
            {canExportPdf && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setClientLinkOpen(true)}
                leftIcon={<Icon name="link" className="w-3.5 h-3.5" />}
              >
                Genera link cliente
              </Button>
            )}
            {!isComposite && (
              <Button
                size="sm"
                variant="secondary"
                onClick={handleDownload}
                leftIcon={<Icon name="download" className="w-3.5 h-3.5" />}
              >
                Scarica
              </Button>
            )}
            {!isComposite && canExportPdf && (
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
                    {isComposite
                      ? `Compositore · ${doc.parts.length} parti`
                      : `${doc.original_filename} · ${formatDocSize(doc.size_bytes)}`}
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

          {/* ── Parti del contratto (libreria riutilizzabile) ── */}
          {isComposite && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[13px] font-bold uppercase tracking-wide flex items-center gap-1.5">
                  <Icon name="document-text" className="w-4 h-4" />
                  Parti del contratto ({doc.parts.length})
                </h3>
                <div className="flex items-center gap-2">
                  {doc.parts.length > 0 && (
                    <Button
                      size="sm"
                      onClick={() => setFieldLayoutOpen(true)}
                      leftIcon={<Icon name="document-text" className="w-3.5 h-3.5" />}
                    >
                      Configura campi sul PDF
                    </Button>
                  )}
                  <input
                    ref={partInputRef}
                    type="file"
                    accept=".pdf,.docx"
                    className="hidden"
                    onChange={handleAddPart}
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => partInputRef.current?.click()}
                    loading={partUploading}
                    leftIcon={<Icon name="upload" className="w-3.5 h-3.5" />}
                  >
                    Nuova parte
                  </Button>
                </div>
              </div>
              <p className="mb-2 text-[12px] text-muted dark:text-muted-dark">
                Trascina le parti per riordinarle; in compilazione scegli quali includere → unite in
                un unico PDF. Le parti sono documenti riutilizzabili anche in altri modelli.
              </p>

              <div className="mb-3 max-w-md">
                <SearchableSelect
                  value={linkPickerValue}
                  onChange={handleLinkExistingPart}
                  options={libraryOptions}
                  placeholder={
                    libraryOptions.length ? "Collega una parte dalla libreria…" : "Nessun'altra parte in libreria"
                  }
                  disabled={libraryOptions.length === 0}
                  menuLayer="portal"
                  showAvatar={false}
                />
              </div>

              <div className="space-y-1.5">
                {orderedParts.map((part, index) => (
                  <div
                    key={part.link_id}
                    data-part-row
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      if (overIndex !== index) setOverIndex(index);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      handlePartDrop(index);
                    }}
                    className={`flex items-center gap-2 rounded-md border px-3 py-2 transition-colors ${
                      dragIndex === index
                        ? "opacity-40"
                        : overIndex === index
                          ? "border-ink bg-cream dark:border-paper dark:bg-[#1c1c20]"
                          : "border-line dark:border-line-dark"
                    }`}
                  >
                    <span
                      draggable
                      onDragStart={(e) => {
                        setDragIndex(index);
                        const row = (e.currentTarget as HTMLElement).closest("[data-part-row]");
                        if (row) e.dataTransfer.setDragImage(row as HTMLElement, 16, 16);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => {
                        setDragIndex(null);
                        setOverIndex(null);
                      }}
                      className="flex-none cursor-grab text-muted transition-colors hover:text-ink active:cursor-grabbing dark:text-muted-dark dark:hover:text-paper"
                      title="Trascina per riordinare"
                      aria-label="Trascina per riordinare"
                    >
                      <Icon name="dots-vertical" className="h-5 w-5" />
                    </span>
                    <span className="flex h-8 w-8 flex-none items-center justify-center rounded-md border border-line bg-paper text-[11px] font-bold dark:border-line-dark dark:bg-[#131316]">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <input
                        key={part.link_id + part.title}
                        defaultValue={part.title}
                        onBlur={(e) => handlePartRename(part, e.target.value)}
                        className="w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm font-semibold text-ink outline-none hover:border-line focus:border-ink dark:text-paper dark:hover:border-line-dark dark:focus:border-paper"
                      />
                      <span className="px-1 text-[11px] text-muted dark:text-muted-dark">
                        {part.page_count} pagine · {part.field_count} campi · {part.original_filename}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="danger-ghost"
                      iconOnly
                      title="Scollega parte"
                      aria-label="Scollega parte"
                      onClick={() => handlePartUnlink(part)}
                    >
                      <Icon name="x" className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                {orderedParts.length === 0 && (
                  <p className="text-[12px] text-muted dark:text-muted-dark">
                    Nessuna parte collegata. Collega parti dalla libreria o creane una nuova.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ── Campi del modello ── */}
          {isTemplate && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[13px] font-bold uppercase tracking-wide flex items-center gap-1.5">
                  <Icon name="list" className="w-4 h-4" />
                  Campi del documento ({doc.template_fields.length})
                </h3>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => setFieldLayoutOpen(true)}
                    leftIcon={<Icon name="document-text" className="w-3.5 h-3.5" />}
                  >
                    Configura sul PDF
                  </Button>
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
              </div>

              <div className="space-y-1.5">
                {doc.template_fields.map((field) => (
                  <div
                    key={field.id}
                    className="rounded-md border border-line dark:border-line-dark px-3 py-2"
                  >
                    <div className="grid grid-cols-[1fr_140px_220px_auto] items-center gap-2 max-md:grid-cols-1">
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
                        options={sourceOptionsFor(field.audience)}
                        placeholder={
                          field.audience === "internal" ? "Dato azienda / testo libero" : "Dato cliente / testo libero"
                        }
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

                    {/* Firma cliente: chi compila il campo e se è obbligatorio */}
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line/60 pt-2 dark:border-line-dark/60">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted dark:text-muted-dark">
                          Ambito
                        </span>
                        <div className="w-44">
                          <SearchableSelect
                            value={field.audience}
                            onChange={(value) => {
                              const nextAud = value as "client" | "internal";
                              const grp = groupOfPath(field.source_path);
                              // Il dato collegato non appartiene al nuovo ambito → torna a testo libero.
                              const incompatible = !!grp && !groupsForAudience(nextAud).has(grp);
                              patchField(field, {
                                audience: nextAud,
                                ...(incompatible ? { clear_source_path: true } : {}),
                              });
                            }}
                            options={AUDIENCE_OPTIONS}
                            menuLayer="portal"
                            showAvatar={false}
                          />
                        </div>
                      </div>
                      <label className="flex cursor-pointer select-none items-center gap-2 text-[12px] font-semibold">
                        <Checkbox
                          checked={field.required}
                          onChange={(next) => patchField(field, { required: next })}
                        />
                        Obbligatorio
                      </label>
                    </div>
                  </div>
                ))}
              </div>

              <p className="mt-3 text-[12px] text-muted dark:text-muted-dark">
                <b>Ambito</b>: «Cliente» = precompilato dai dati ma modificabile dal cliente in firma;
                «Interno» = dato azienda, non modificabile dal cliente. «Obbligatorio» = il cliente
                deve compilarlo prima di firmare. Per campi non rilevati usa gli elementi liberi
                (testo, spunta, firma) durante la compilazione.
              </p>
            </div>
          )}
        </div>
      )}
    </Modal>
    <GenerateClientLinkModal
      open={clientLinkOpen}
      onClose={() => setClientLinkOpen(false)}
      document={doc}
    />
    <FieldLayoutModal
      open={fieldLayoutOpen}
      onClose={() => setFieldLayoutOpen(false)}
      document={doc}
      onChanged={reload}
    />
    </>
  );
}
