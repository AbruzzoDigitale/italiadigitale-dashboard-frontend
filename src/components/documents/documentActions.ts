import { exportDocumentPdfApi, getDocumentDownloadUrlApi } from "../../api/documents";

/** Scarica un documento aprendo l'URL firmato (scadenza breve) in un nuovo tab. */
export async function openDocumentDownload(
  documentId: number,
  options: { variant?: "original" | "fillbase"; disposition?: "attachment" | "inline" } = {}
): Promise<void> {
  const { url } = await getDocumentDownloadUrlApi(documentId, options);
  window.open(url, "_blank", "noopener");
}

/** Esporta in PDF (conversione lato server con cache) e apre l'URL firmato.
 *  disposition "inline" = anteprima nel browser, "attachment" = download. */
export async function openDocumentPdfExport(
  documentId: number,
  options: { disposition?: "attachment" | "inline" } = {}
): Promise<void> {
  const { url } = await exportDocumentPdfApi(documentId, options);
  window.open(url, "_blank", "noopener");
}
