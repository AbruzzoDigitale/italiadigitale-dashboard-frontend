import { useEffect, useMemo, useState } from "react";
import {
  addDocumentLinkApi,
  getDocumentApi,
  listDocumentsApi,
  removeDocumentLinkApi,
  DOC_TYPE_LABELS,
  formatDocSize,
  type DocumentDetail,
  type DocumentItem,
} from "../../api/documents";
import { useToast } from "../../context/ToastContext";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { SearchableSelect, type SearchableSelectOption } from "../ui/SearchableSelect";
import { Spinner } from "../ui/Spinner";
import { useDocuments } from "../../hooks/useDocuments";
import { DocumentDetailModal } from "./DocumentDetailModal";
import { DocumentVisualFillModal } from "./DocumentVisualFillModal";
import { DocumentUploadModal } from "./DocumentUploadModal";
import { openDocumentDownload, openDocumentPdfExport } from "./documentActions";

interface DocumentsSectionProps {
  contractId: number;
  companyId: number | null;
}

/** Tab "Documenti" del dettaglio contratto: documenti collegati, compilazione modelli. */
export function DocumentsSection({ contractId, companyId }: DocumentsSectionProps) {
  const toast = useToast();

  const { items, isLoading, error, refetch } = useDocuments({
    entity_type: "contract",
    entity_id: contractId,
    company_id: companyId ?? undefined,
  });

  const [uploadOpen, setUploadOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [fillDoc, setFillDoc] = useState<DocumentDetail | null>(null);
  const [linkPickerOpen, setLinkPickerOpen] = useState(false);
  const [linkableDocs, setLinkableDocs] = useState<DocumentItem[]>([]);
  const [linkableLoading, setLinkableLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  // Documenti dell'azienda collegabili (esclusi quelli già collegati al contratto).
  useEffect(() => {
    if (!linkPickerOpen || companyId == null) return;
    let cancelled = false;
    setLinkableLoading(true);
    listDocumentsApi({ company_id: companyId, limit: 500 })
      .then((docs) => {
        if (cancelled) return;
        const linkedIds = new Set(items.map((d) => d.id));
        setLinkableDocs(docs.filter((d) => !linkedIds.has(d.id)));
      })
      .catch(() => {
        if (!cancelled) setLinkableDocs([]);
      })
      .finally(() => {
        if (!cancelled) setLinkableLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [linkPickerOpen, companyId, items]);

  const linkableOptions = useMemo<SearchableSelectOption[]>(
    () =>
      linkableDocs.map((d) => ({
        value: String(d.id),
        label: d.title,
        keywords: `${DOC_TYPE_LABELS[d.doc_type]} ${d.original_filename}`,
        trailing: DOC_TYPE_LABELS[d.doc_type],
      })),
    [linkableDocs]
  );

  const handleLinkExisting = async (documentId: string) => {
    if (!documentId) return;
    setBusy(true);
    try {
      await addDocumentLinkApi(Number(documentId), {
        entity_type: "contract",
        entity_id: contractId,
      });
      toast.success("Documento collegato al contratto");
      setLinkPickerOpen(false);
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore collegamento");
    } finally {
      setBusy(false);
    }
  };

  const handleUnlink = async (doc: DocumentItem) => {
    const link = doc.links.find(
      (l) => l.entity_type === "contract" && l.entity_id === contractId
    );
    if (!link) return;
    if (!window.confirm(`Scollegare "${doc.title}" dal contratto? Il documento resta in archivio.`)) {
      return;
    }
    setBusy(true);
    try {
      await removeDocumentLinkApi(doc.id, link.id);
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore scollegamento");
    } finally {
      setBusy(false);
    }
  };

  const openFill = async (doc: DocumentItem) => {
    try {
      const detail = await getDocumentApi(doc.id);
      setFillDoc(detail);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore apertura compilazione");
    }
  };

  const handleDownload = async (doc: DocumentItem) => {
    try {
      await openDocumentDownload(doc.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore download");
    }
  };

  const handlePdf = async (doc: DocumentItem) => {
    try {
      toast.info("Preparazione anteprima PDF…");
      await openDocumentPdfExport(doc.id, { disposition: "inline" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore anteprima PDF");
    }
  };

  const canPdf = (doc: DocumentItem) =>
    doc.content_type === "application/pdf" ||
    doc.content_type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] uppercase tracking-wider text-muted dark:text-muted-dark">
          Documenti collegati al contratto
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setLinkPickerOpen((v) => !v)}
            leftIcon={<Icon name="link" className="w-3.5 h-3.5" />}
          >
            Collega esistente
          </Button>
          <Button
            size="sm"
            onClick={() => setUploadOpen(true)}
            leftIcon={<Icon name="upload" className="w-3.5 h-3.5" />}
          >
            Carica
          </Button>
        </div>
      </div>

      {linkPickerOpen && (
        <div className="max-w-md">
          <SearchableSelect
            value=""
            onChange={handleLinkExisting}
            options={linkableOptions}
            placeholder={linkableLoading ? "Caricamento archivio…" : "Cerca in archivio…"}
            disabled={linkableLoading || busy}
            menuLayer="portal"
            showAvatar={false}
          />
        </div>
      )}

      {error && <p className="text-[13px] text-danger">{error}</p>}

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-md border border-dashed border-line dark:border-line-dark py-8 text-center">
          <p className="text-[13px] text-muted dark:text-muted-dark">
            Nessun documento collegato. Carica un file o collega un modello dall'archivio.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((doc) => (
            <li
              key={doc.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line dark:border-line-dark px-3 py-2"
            >
              <button
                type="button"
                className="min-w-0 text-left flex-1"
                onClick={() => setDetailId(doc.id)}
              >
                <span className="flex items-center gap-2 flex-wrap">
                  <Icon name="document-text" className="w-4 h-4 shrink-0" />
                  <span className="font-semibold text-[13px] truncate">{doc.title}</span>
                  <Badge variant={doc.doc_type === "compilato" ? "success" : doc.doc_type === "generico" ? "default" : "info"}>
                    {DOC_TYPE_LABELS[doc.doc_type]}
                  </Badge>
                </span>
                <span className="block text-[11px] text-muted dark:text-muted-dark mt-0.5">
                  {doc.original_filename} · {formatDocSize(doc.size_bytes)}
                  {doc.created_at ? ` · ${new Date(doc.created_at).toLocaleDateString("it-IT")}` : ""}
                </span>
              </button>

              <div className="flex items-center gap-1">
                {doc.doc_type === "modello_contratto" && (
                  <Button size="sm" onClick={() => openFill(doc)} leftIcon={<Icon name="pencil" className="w-3.5 h-3.5" />}>
                    Compila
                  </Button>
                )}
                {doc.doc_type === "compilato" && (
                  <Button size="sm" variant="secondary" onClick={() => openFill(doc)} leftIcon={<Icon name="pencil" className="w-3.5 h-3.5" />}>
                    Modifica valori
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  iconOnly
                  title="Scarica"
                  aria-label="Scarica"
                  onClick={() => handleDownload(doc)}
                >
                  <Icon name="download" className="w-4 h-4" />
                </Button>
                {canPdf(doc) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    iconOnly
                    title="Anteprima PDF"
                    aria-label="Anteprima PDF"
                    onClick={() => handlePdf(doc)}
                  >
                    <Icon name="eye" className="w-4 h-4" />
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="danger-ghost"
                  iconOnly
                  title="Scollega dal contratto"
                  aria-label="Scollega dal contratto"
                  onClick={() => handleUnlink(doc)}
                  disabled={busy}
                >
                  <Icon name="x" className="w-4 h-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {companyId != null && (
        <DocumentUploadModal
          open={uploadOpen}
          onClose={() => setUploadOpen(false)}
          companies={[]}
          defaultCompanyId={companyId}
          lockCompany
          defaultLinks={[{ entity_type: "contract", entity_id: contractId }]}
          onUploaded={() => refetch()}
        />
      )}

      <DocumentDetailModal
        documentId={detailId}
        open={detailId != null}
        onClose={() => setDetailId(null)}
        onChanged={refetch}
        onFill={(doc) => {
          setDetailId(null);
          setFillDoc(doc);
        }}
      />

      <DocumentVisualFillModal
        open={fillDoc != null}
        onClose={() => setFillDoc(null)}
        document={fillDoc}
        contractId={contractId}
        onDone={() => refetch()}
      />
    </div>
  );
}
