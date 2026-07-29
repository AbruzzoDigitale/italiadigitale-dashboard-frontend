import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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

const MODEL_TYPES: DocType[] = ["modello", "modello_contratto", "parte_contratto"];
const isModel = (doc: DocumentItem) => MODEL_TYPES.includes(doc.doc_type);

export function DocumentsPage() {
  const toast = useToast();
  const navigate = useNavigate();
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((doc) => {
            const model = isModel(doc);
            return (
              <div
                key={doc.id}
                onClick={() => (model ? navigate(`/documenti/modello/${doc.id}`) : setDetailId(doc.id))}
                className="group flex cursor-pointer flex-col rounded-xl border border-line bg-paper p-4 transition hover:-translate-y-0.5 hover:border-brand-magenta/50 hover:shadow-md dark:border-line-dark dark:bg-[#0E0F0E]"
              >
                <div className="mb-3 flex items-start justify-between gap-2">
                  <span
                    className={`grid h-10 w-10 flex-none place-items-center rounded-lg ${
                      model ? "bg-brand-magenta/15 text-brand-magenta" : "bg-cream text-ink dark:bg-ink-2 dark:text-paper"
                    }`}
                  >
                    <Icon name="document-text" className="h-5 w-5" />
                  </span>
                  <Badge variant={BADGE_BY_TYPE[doc.doc_type]}>{DOC_TYPE_LABELS[doc.doc_type]}</Badge>
                </div>

                <h3 className="line-clamp-2 min-h-[2.5rem] text-[14px] font-bold leading-tight">{doc.title}</h3>
                <p className="mt-1 truncate text-[11px] text-muted dark:text-muted-dark">{doc.original_filename}</p>

                <div className="mt-2 flex flex-wrap items-center gap-1">
                  {doc.links.slice(0, 2).map((link) => (
                    <Badge key={link.id}>{link.entity_label ?? `#${link.entity_id}`}</Badge>
                  ))}
                  {doc.links.length > 2 && <Badge>+{doc.links.length - 2}</Badge>}
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-line/70 pt-2 dark:border-line-dark/70">
                  <span className="text-[10.5px] text-muted dark:text-muted-dark">
                    {formatDocSize(doc.size_bytes)}
                    {doc.created_at ? ` · ${new Date(doc.created_at).toLocaleDateString("it-IT")}` : ""}
                  </span>
                  <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                    {model && (
                      <span className="mr-1 flex items-center gap-1 text-[11px] font-semibold text-brand-magenta opacity-0 transition group-hover:opacity-100">
                        Apri <Icon name="chevron-right" className="h-3 w-3" />
                      </span>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      iconOnly
                      title="Scarica"
                      aria-label="Scarica"
                      onClick={() => handleDownload(doc)}
                    >
                      <Icon name="download" className="h-4 w-4" />
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
                        <Icon name="eye" className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
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
