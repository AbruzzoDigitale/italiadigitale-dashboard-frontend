import { useMemo, useState } from "react";
import {
  DOC_TYPE_LABELS,
  formatDocSize,
  type DocType,
  type DocumentDetail,
  type DocumentItem,
} from "../api/documents";
import { DocumentDetailModal } from "../components/documents/DocumentDetailModal";
import { DocumentVisualFillModal } from "../components/documents/DocumentVisualFillModal";
import { DocumentUploadModal } from "../components/documents/DocumentUploadModal";
import { openDocumentDownload, openDocumentPdfExport } from "../components/documents/documentActions";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { Input } from "../components/ui/Input";
import { PageSectionHeader } from "../components/ui/PageSectionHeader";
import { SearchableSelect } from "../components/ui/SearchableSelect";
import { SegmentedSwitch } from "../components/ui/SegmentedSwitch";
import { Spinner } from "../components/ui/Spinner";
import { useTheme } from "../context/ThemeContext";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../hooks/useAuth";
import { useDocuments } from "../hooks/useDocuments";
import { useSelectedCompanyId } from "../hooks/useSelectedCompanyId";
import { getCompanyLogoUrl } from "../utils/companyLogo";

type TypeFilter = "tutti" | DocType;

const TYPE_FILTER_OPTIONS: Array<{ value: TypeFilter; label: string }> = [
  { value: "tutti", label: "Tutti" },
  { value: "generico", label: "Documenti" },
  { value: "modello", label: "Modelli" },
  { value: "modello_contratto", label: "Modelli contratto" },
  { value: "parte_contratto", label: "Parti" },
  { value: "compilato", label: "Compilati" },
];

const BADGE_BY_TYPE: Record<DocType, "default" | "info" | "success"> = {
  generico: "default",
  modello: "info",
  modello_contratto: "info",
  parte_contratto: "info",
  compilato: "success",
};

export function DocumentsPage() {
  const toast = useToast();
  const { theme } = useTheme();
  const { user, activeCompanyId, myCompanies } = useAuth();
  const { selectedCompanyId, setSelectedCompanyId } = useSelectedCompanyId(
    activeCompanyId ?? user?.company_id ?? null
  );
  const currentCompanyId = selectedCompanyId ?? activeCompanyId ?? user?.company_id ?? null;

  const [typeFilter, setTypeFilter] = useState<TypeFilter>("tutti");
  const [search, setSearch] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [fillDoc, setFillDoc] = useState<DocumentDetail | null>(null);

  const { items, isLoading, error, refetch } = useDocuments({
    company_id: currentCompanyId,
    doc_type: typeFilter === "tutti" ? undefined : typeFilter,
    search: search.trim() || undefined,
    limit: 500,
  });

  const companyOptions = useMemo(
    () =>
      myCompanies.map((c) => ({
        value: String(c.id),
        label: c.name,
        keywords: c.slug ?? "",
        avatarUrl: getCompanyLogoUrl(c, theme),
      })),
    [myCompanies, theme]
  );

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
    <div className="px-6 py-8 pb-20 mx-auto w-full animate-fadeIn">
      <PageSectionHeader
        icon={<Icon name="document-text" className="w-6 h-6" />}
        title="Documenti"
        actions={
          <Button onClick={() => setUploadOpen(true)} leftIcon={<Icon name="upload" className="w-4 h-4" />}>
            Carica documento
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3 mb-4">
        {myCompanies.length > 1 && (
          <div className="w-56">
            <SearchableSelect
              value={currentCompanyId != null ? String(currentCompanyId) : ""}
              onChange={(value) => setSelectedCompanyId(value ? Number(value) : null)}
              options={companyOptions}
              placeholder="Azienda"
              avatarShape="logo"
            />
          </div>
        )}
        <SegmentedSwitch value={typeFilter} onChange={setTypeFilter} options={TYPE_FILTER_OPTIONS} />
        <div className="w-64 max-md:w-full">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca per titolo o nome file…"
          />
        </div>
      </div>

      {error && <p className="text-[13px] text-danger mb-3">{error}</p>}

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line dark:border-line-dark py-16 text-center">
          <Icon name="document-text" className="w-8 h-8 mx-auto mb-3 opacity-40" />
          <p className="text-[14px] text-muted dark:text-muted-dark">
            Nessun documento in archivio per i filtri selezionati.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line dark:border-line-dark">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-line dark:border-line-dark bg-cream/50 dark:bg-ink-2/50 text-left">
                <th className="px-4 py-2.5 font-bold">Documento</th>
                <th className="px-4 py-2.5 font-bold">Tipo</th>
                <th className="px-4 py-2.5 font-bold">Collegamenti</th>
                <th className="px-4 py-2.5 font-bold">Dimensione</th>
                <th className="px-4 py-2.5 font-bold">Caricato</th>
                <th className="px-4 py-2.5 font-bold text-right">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {items.map((doc) => (
                <tr
                  key={doc.id}
                  className="border-b border-line dark:border-line-dark last:border-0 hover:bg-cream/40 dark:hover:bg-ink-2/40 cursor-pointer"
                  onClick={() => setDetailId(doc.id)}
                >
                  <td className="px-4 py-2.5">
                    <span className="font-semibold">{doc.title}</span>
                    <span className="block text-[11px] text-muted dark:text-muted-dark">
                      {doc.original_filename}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant={BADGE_BY_TYPE[doc.doc_type]}>{DOC_TYPE_LABELS[doc.doc_type]}</Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    {doc.links.length === 0 ? (
                      <span className="text-muted dark:text-muted-dark">—</span>
                    ) : (
                      <span className="flex flex-wrap gap-1">
                        {doc.links.slice(0, 3).map((link) => (
                          <Badge key={link.id}>{link.entity_label ?? `#${link.entity_id}`}</Badge>
                        ))}
                        {doc.links.length > 3 && <Badge>+{doc.links.length - 3}</Badge>}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">{formatDocSize(doc.size_bytes)}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-muted dark:text-muted-dark">
                    {doc.created_at ? new Date(doc.created_at).toLocaleDateString("it-IT") : "—"}
                    {doc.uploaded_by_name ? ` · ${doc.uploaded_by_name}` : ""}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
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
                        variant="ghost"
                        iconOnly
                        title="Dettagli"
                        aria-label="Dettagli"
                        onClick={() => setDetailId(doc.id)}
                      >
                        <Icon name="pencil" className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <DocumentUploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        companies={myCompanies.map((c) => ({ id: c.id, name: c.name, logo: getCompanyLogoUrl(c, theme) }))}
        defaultCompanyId={currentCompanyId}
        onUploaded={(doc) => {
          refetch();
          // Compositore appena creato: apri il dettaglio per ordinare le parti.
          if (doc.doc_type === "modello_contratto") setDetailId(doc.id);
        }}
      />

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
        onDone={() => refetch()}
      />
    </div>
  );
}
