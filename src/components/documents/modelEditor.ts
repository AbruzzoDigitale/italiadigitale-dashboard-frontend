/* Normalizzazione dati per l'editor modello (ModelEditorPage): unifica
 * compositori (modello_contratto) e modelli a file singolo (modello/parte)
 * in una forma comune parte → sezione → campi + valori + PDF per l'anteprima. */
import {
  composeApi,
  fetchFillBaseApi,
  getFillPrefillApi,
  type DocFieldType,
  type DocumentDetail,
  type FieldArea,
  type PageMetric,
} from "../../api/documents";

/** Campo normalizzato dell'editor (posizioni per l'anteprima + config). */
export interface EditorField {
  /** Chiave del valore nella mappa `values` (tag del loader). */
  key: string;
  /** id reale del DocumentTemplateField (per config/riordino). */
  fieldId: number;
  /** Documento proprietario (modello singolo = doc.id; compositore = parte). */
  partDocumentId: number;
  label: string;
  displayLabel: string | null;
  fieldType: DocFieldType;
  sourcePath: string | null;
  groupKey: string;
  required: boolean;
  audience: "client" | "internal";
  page: number | null;
  posX: number | null;
  posY: number | null;
  posW: number | null;
  posH: number | null;
  fontSize: number | null;
  placeholderKind: "underscore" | "tag" | null;
  placeholderLen: number | null;
}

export interface EditorArea {
  key: string;
  label: string;
  icon: string | null;
  sub: string | null;
  partDocumentId: number;
}

export interface EditorPart {
  partDocumentId: number;
  title: string;
  areas: EditorArea[];
}

export interface EditorData {
  isComposite: boolean;
  parts: EditorPart[];
  fields: EditorField[];
  values: Record<string, string>;
  pages: PageMetric[];
  fileData: ArrayBuffer;
  partIds: number[];
  suggestedTitle: string;
  hasTextLayer: boolean;
}

/** Etichetta mostrata: preferisce quella scelta dall'utente. */
export function fieldLabel(f: EditorField): string {
  return (f.displayLabel && f.displayLabel.trim()) || f.label || f.key;
}

export function isFilled(v: string | undefined): boolean {
  return !!v && v.trim().length > 0;
}

const AREA_FALLBACK = { label: "Altri campi", icon: "list", sub: "Campi da categorizzare" };

/** Aree derivate dai group_key quando il documento non ne ha ancora salvate. */
function deriveAreas(fields: EditorField[], partDocumentId: number): EditorArea[] {
  const seen = new Map<string, EditorArea>();
  for (const f of fields) {
    if (seen.has(f.groupKey)) continue;
    seen.set(f.groupKey, {
      key: f.groupKey,
      label: AREA_FALLBACK.label,
      icon: AREA_FALLBACK.icon,
      sub: null,
      partDocumentId,
    });
  }
  return [...seen.values()];
}

/** Solo i VALORI risolti (precompilazione), senza ricaricare campi/PDF.
 *  Usato quando si cambia contratto/cliente: aggiorna la mappa valori a caldo. */
export async function loadPrecompileValues(
  doc: DocumentDetail,
  contractId?: number | null,
  clientId?: number | null
): Promise<Record<string, string>> {
  const values: Record<string, string> = {};
  if (doc.doc_type === "modello_contratto") {
    const comp = await composeApi(doc.id, { contractId, clientId });
    for (const f of comp.fields) values[f.tag_name] = f.value ?? "";
    return values;
  }
  const prefill = await getFillPrefillApi(doc.id, contractId, clientId);
  for (const f of prefill.fields) values[f.tag_name] = f.value ?? "";
  return values;
}

/** Carica e normalizza i dati dell'editor per un modello (precompila da
 *  contratto o da cliente, o solo dati azienda se nessuno dei due). */
export async function loadEditorData(
  doc: DocumentDetail,
  contractId?: number | null,
  clientId?: number | null
): Promise<EditorData> {
  if (doc.doc_type === "modello_contratto") {
    const comp = await composeApi(doc.id, { contractId, clientId });
    const fileData = await fetchFillBaseApi(doc.id, comp.part_ids);
    const fields: EditorField[] = comp.fields
      .filter((f) => f.field_id != null && f.part_document_id != null)
      .map((f) => ({
        key: f.tag_name,
        fieldId: f.field_id!,
        partDocumentId: f.part_document_id!,
        label: f.label,
        displayLabel: f.display_label,
        fieldType: f.field_type,
        sourcePath: f.source_path,
        groupKey: f.group_key || "altro",
        required: f.required,
        audience: f.audience,
        page: f.page,
        posX: f.pos_x,
        posY: f.pos_y,
        posW: f.pos_w,
        posH: f.pos_h,
        fontSize: f.font_size,
        placeholderKind: f.placeholder_kind,
        placeholderLen: f.placeholder_len,
      }));
    const values: Record<string, string> = {};
    for (const f of comp.fields) values[f.tag_name] = f.value ?? "";

    // Parti (per i titoli) + aree per parte.
    const areasByPart = new Map<number, EditorArea[]>();
    for (const a of comp.areas) {
      const pid = a.part_document_id ?? doc.id;
      const arr = areasByPart.get(pid) ?? [];
      arr.push({ key: a.key, label: a.label, icon: a.icon ?? null, sub: a.sub ?? null, partDocumentId: pid });
      areasByPart.set(pid, arr);
    }
    const orderedParts = [...doc.parts].sort((a, b) => a.sort_order - b.sort_order);
    const parts: EditorPart[] = (orderedParts.length ? orderedParts : []).map((p) => ({
      partDocumentId: p.part_document_id,
      title: p.title,
      areas:
        areasByPart.get(p.part_document_id) ??
        deriveAreas(fields.filter((f) => f.partDocumentId === p.part_document_id), p.part_document_id),
    }));

    return {
      isComposite: true,
      parts,
      fields,
      values,
      pages: comp.pages,
      fileData,
      partIds: comp.part_ids,
      suggestedTitle: comp.suggested_title,
      hasTextLayer: comp.has_text_layer,
    };
  }

  // Modello / parte a file singolo.
  const [prefill, fileData] = await Promise.all([
    getFillPrefillApi(doc.id, contractId, clientId),
    fetchFillBaseApi(doc.id),
  ]);
  const fields: EditorField[] = doc.template_fields
    .filter((f) => f.is_in_document)
    .map((f) => ({
      key: f.tag_name,
      fieldId: f.id,
      partDocumentId: doc.id,
      label: f.label,
      displayLabel: f.display_label,
      fieldType: f.field_type,
      sourcePath: f.source_path,
      groupKey: f.group_key || "altro",
      required: f.required,
      audience: f.audience,
      page: f.page,
      posX: f.pos_x,
      posY: f.pos_y,
      posW: f.pos_w,
      posH: f.pos_h,
      fontSize: f.font_size,
      placeholderKind: f.placeholder_kind,
      placeholderLen: f.placeholder_len,
    }));
  const values: Record<string, string> = {};
  for (const f of prefill.fields) values[f.tag_name] = f.value ?? "";

  const savedAreas: FieldArea[] = doc.field_areas ?? [];
  const areas: EditorArea[] = savedAreas.length
    ? savedAreas.map((a) => ({
        key: a.key,
        label: a.label,
        icon: a.icon ?? null,
        sub: a.sub ?? null,
        partDocumentId: doc.id,
      }))
    : deriveAreas(fields, doc.id);

  return {
    isComposite: false,
    parts: [{ partDocumentId: doc.id, title: doc.title, areas }],
    fields,
    values,
    pages: doc.page_metrics ?? [],
    fileData,
    partIds: [],
    suggestedTitle: doc.title,
    hasTextLayer: true,
  };
}
