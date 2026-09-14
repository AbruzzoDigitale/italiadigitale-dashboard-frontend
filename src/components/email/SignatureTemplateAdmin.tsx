import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "../../context/ToastContext";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Icon, type IconName } from "../ui/Icon";
import { Modal } from "../ui/Modal";
import { Spinner } from "../ui/Spinner";
import { Checkbox } from "../ui/Checkbox";
import { SearchableSelect } from "../ui/SearchableSelect";
import { getCompanyBrandApi, type CompanyBrand } from "../../api/companies";
import { uploadSignatureMediaApi } from "../../api/emailSignatures";
import {
  listTemplatesApi,
  createTemplateApi,
  updateTemplateApi,
  type CompanyTemplate,
  type SignatureFieldDef,
  type SignatureFieldType,
} from "../../api/signatureTemplates";
import {
  generateHtml,
  renderBlock,
  resolveTokens,
  applyFieldRows,
  companyTokenMap,
  detectTokens,
  newBlock,
  newId,
  BLOCK_LABELS,
  SOCIAL_LABELS,
  SEPARATOR_PRESETS,
  type SignatureDesign,
  type SigBlock,
  type SigBlockType,
  type ContactIcon,
  type SocialNetwork,
  type Align,
} from "./signatureComposer";

const labelCls = "text-[11px] font-semibold uppercase tracking-wider text-muted dark:text-muted-dark";
const cardCls = "bg-paper dark:bg-[#131316] rounded-lg border border-line dark:border-[#2a2a2e] p-6";
type ColKey = "left" | "right";

const TYPE_OPTIONS: { value: SignatureFieldType; label: string }[] = [
  { value: "text", label: "Testo" }, { value: "email", label: "Email" }, { value: "tel", label: "Telefono" },
  { value: "url", label: "URL" }, { value: "image", label: "Immagine" },
];
const ICON_OPTIONS: { value: ContactIcon; label: string }[] = [
  { value: "phone", label: "Telefono" }, { value: "email", label: "Email" }, { value: "website", label: "Sito" },
  { value: "address", label: "Indirizzo" }, { value: "none", label: "Nessuna" },
];
const ALIGN_OPTIONS: { value: Align; label: string }[] = [
  { value: "left", label: "Sinistra" }, { value: "center", label: "Centro" }, { value: "right", label: "Destra" },
];
const NETWORKS: SocialNetwork[] = ["facebook", "instagram", "linkedin", "tiktok", "youtube"];
const ADD_TYPES: SigBlockType[] = ["text", "contact", "fields", "social", "image", "spacer", "divider"];

/** Icona + descrizione per il selettore blocchi. */
const BLOCK_META: Record<SigBlockType, { icon: IconName; hint: string }> = {
  text: { icon: "document-text", hint: "Nome, ruolo, testo libero" },
  contact: { icon: "mail", hint: "Riga con icona: telefono, email, sito…" },
  fields: { icon: "list", hint: "Più campi su una riga, separatore auto" },
  social: { icon: "globe", hint: "Icone social con link" },
  image: { icon: "image", hint: "Foto o logo" },
  spacer: { icon: "arrows-v", hint: "Spazio verticale" },
  divider: { icon: "minus", hint: "Linea di separazione" },
};

const DEFAULT_DESIGN: SignatureDesign = {
  version: 1, accent: "#eb2f5b", contentWidth: 560, columns: "two",
  left: [
    { id: "d1", type: "text", text: "{{nome}}", size: 18, bold: true, color: "#000000" },
    { id: "d2", type: "text", text: "{{ruolo}}\n{{reparto}} | {{azienda.nome}}", size: 14, bold: false, color: "#000000" },
    { id: "d3", type: "spacer", height: 6 },
    { id: "d4", type: "contact", icon: "phone", text: "{{azienda.telefono}} · {{cellulare}}", href: "" },
    { id: "d5", type: "contact", icon: "email", text: "{{email}}", href: "mailto:{{email}}" },
    { id: "d6", type: "contact", icon: "website", text: "{{azienda.sito}}", href: "{{azienda.sito}}" },
    { id: "d7", type: "contact", icon: "address", text: "{{azienda.indirizzo}}", href: "{{azienda.maps}}" },
    { id: "d8", type: "social", items: [
      { network: "facebook", url: "{{azienda.facebook}}" }, { network: "instagram", url: "{{azienda.instagram}}" },
      { network: "linkedin", url: "{{azienda.linkedin}}" }, { network: "tiktok", url: "{{azienda.tiktok}}" },
    ] },
  ],
  right: [
    { id: "r1", type: "image", src: "{{foto}}", width: 110, radius: 8, align: "right" },
    { id: "r2", type: "spacer", height: 10 },
    { id: "r3", type: "image", src: "{{azienda.logo}}", width: 130, radius: 0, align: "right" },
  ],
};

function inferType(key: string): SignatureFieldType {
  const k = key.toLowerCase();
  if (/(foto|photo|logo|immagine|avatar)/.test(k)) return "image";
  if (/(email|mail)/.test(k)) return "email";
  if (/(tel|cell|phone|cellulare)/.test(k)) return "tel";
  return "text";
}
function mergeFields(tokens: string[], current: SignatureFieldDef[]): SignatureFieldDef[] {
  const byKey = new Map(current.map((f) => [f.key, f]));
  return tokens.map((k) => byKey.get(k) ?? { key: k, label: k, type: inferType(k), editable: true, default: "" });
}
function moveBlock(d: SignatureDesign, fromCol: ColKey, fromIdx: number, toCol: ColKey, toIdx: number): SignatureDesign {
  const from = [...d[fromCol]];
  const [item] = from.splice(fromIdx, 1);
  if (fromCol === toCol) { from.splice(toIdx, 0, item); return { ...d, [fromCol]: from }; }
  const to = [...d[toCol]]; to.splice(toIdx, 0, item);
  return { ...d, [fromCol]: from, [toCol]: to };
}

// ── Pannello proprietà del blocco selezionato ────────────────────────────────
function BlockProps({ block, onChange }: { block: SigBlock; onChange: (b: SigBlock) => void }) {
  const toast = useToast();
  return (
    <div className="flex flex-col gap-3">
      <div className="text-[11px] font-bold uppercase tracking-wider text-brand-magenta">{BLOCK_LABELS[block.type]}</div>
      {block.type === "text" && (
        <>
          <textarea value={block.text} onChange={(e) => onChange({ ...block, text: e.target.value })} rows={3}
            className="w-full rounded-md border border-line dark:border-[#2a2a2e] bg-paper dark:bg-[#131316] px-2.5 py-2 text-[13px] focus:outline-none"
            placeholder="Testo — {{nome}}, a capo = nuova riga" />
          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-1 text-[12px] text-muted">Dim.
              <input type="number" value={block.size} onChange={(e) => onChange({ ...block, size: Number(e.target.value) || 14 })} className="w-14 rounded border border-line dark:border-[#2a2a2e] bg-paper dark:bg-[#131316] px-1.5 py-1 text-[12px]" />
            </label>
            <label className="flex items-center gap-1.5 text-[12px] text-muted cursor-pointer"><Checkbox checked={block.bold} onChange={(v) => onChange({ ...block, bold: v })} /> Grassetto</label>
            <label className="flex items-center gap-1 text-[12px] text-muted">Colore
              <input type="color" value={block.color} onChange={(e) => onChange({ ...block, color: e.target.value })} className="h-6 w-8 rounded border border-line dark:border-[#2a2a2e]" />
            </label>
          </div>
        </>
      )}
      {block.type === "contact" && (
        <>
          <div><span className={labelCls}>Icona</span><SearchableSelect value={block.icon} onChange={(v) => onChange({ ...block, icon: v as ContactIcon })} options={ICON_OPTIONS} /></div>
          <Input label="Testo" value={block.text} onChange={(e) => onChange({ ...block, text: e.target.value })} placeholder="{{email}}" />
          <Input label="Link (opzionale)" value={block.href} onChange={(e) => onChange({ ...block, href: e.target.value })} placeholder="mailto:{{email}}" />
        </>
      )}
      {block.type === "fields" && (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-[140px]"><span className={labelCls}>Icona (opzionale)</span><SearchableSelect value={block.icon} onChange={(v) => onChange({ ...block, icon: v as ContactIcon })} options={ICON_OPTIONS} /></div>
            <label className="flex items-center gap-1 text-[12px] text-muted">Dim.
              <input type="number" value={block.size ?? 14} onChange={(e) => onChange({ ...block, size: Number(e.target.value) || 14 })} className="w-14 rounded border border-line dark:border-[#2a2a2e] bg-paper dark:bg-[#131316] px-1.5 py-1 text-[12px]" />
            </label>
          </div>
          <div>
            <span className={labelCls}>Separatore</span>
            <div className="mt-1 flex items-center gap-2">
              <div className="flex-1"><SearchableSelect
                value={SEPARATOR_PRESETS.some((s) => s.value === block.separator) ? block.separator : "__custom__"}
                onChange={(v) => { if (v !== "__custom__") onChange({ ...block, separator: v }); }}
                options={[...SEPARATOR_PRESETS, { value: "__custom__", label: "Personalizzato…" }]}
              /></div>
              <input
                value={block.separator}
                onChange={(e) => onChange({ ...block, separator: e.target.value })}
                className="w-20 rounded-md border border-line dark:border-[#2a2a2e] bg-paper dark:bg-[#131316] px-2 py-2 text-center text-[13px] focus:outline-none"
                title="Separatore (spazi inclusi)"
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <span className={labelCls}>Campi (in ordine)</span>
            {block.items.map((it, i) => (
              <div key={it.id} className="flex flex-col gap-1 rounded-md border border-line dark:border-[#2a2a2e] p-2">
                <div className="flex items-center gap-2">
                  <Input value={it.content} onChange={(e) => { const items = [...block.items]; items[i] = { ...items[i], content: e.target.value }; onChange({ ...block, items }); }} placeholder="{{ruolo}} o testo" className="flex-1" />
                  <button className="px-1 text-muted hover:text-danger" title="Rimuovi campo" onClick={() => onChange({ ...block, items: block.items.filter((_, j) => j !== i) })}><Icon name="trash" className="h-3.5 w-3.5" /></button>
                </div>
                <Input value={it.href} onChange={(e) => { const items = [...block.items]; items[i] = { ...items[i], href: e.target.value }; onChange({ ...block, items }); }} placeholder="Link (opzionale) — mailto:{{email}}" />
              </div>
            ))}
            <Button size="sm" variant="ghost" onClick={() => onChange({ ...block, items: [...block.items, { id: newId(), content: "", href: "" }] })}><Icon name="plus" className="h-3.5 w-3.5" /> Campo</Button>
          </div>
        </>
      )}
      {block.type === "social" && (
        <div className="flex flex-col gap-2">
          {block.items.map((it, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="w-28"><SearchableSelect value={it.network} onChange={(v) => { const items = [...block.items]; items[i] = { ...items[i], network: v as SocialNetwork }; onChange({ ...block, items }); }} options={NETWORKS.map((n) => ({ value: n, label: SOCIAL_LABELS[n] }))} /></div>
              <Input value={it.url} onChange={(e) => { const items = [...block.items]; items[i] = { ...items[i], url: e.target.value }; onChange({ ...block, items }); }} placeholder="{{azienda.facebook}}" className="flex-1" />
              <button className="px-1 text-muted hover:text-danger" onClick={() => onChange({ ...block, items: block.items.filter((_, j) => j !== i) })}><Icon name="trash" className="h-3.5 w-3.5" /></button>
            </div>
          ))}
          <Button size="sm" variant="ghost" onClick={() => onChange({ ...block, items: [...block.items, { network: "youtube", url: "" }] })}><Icon name="plus" className="h-3.5 w-3.5" /> Social</Button>
        </div>
      )}
      {block.type === "image" && (
        <>
          <Input label="Sorgente (URL o {{foto}})" value={block.src} onChange={(e) => onChange({ ...block, src: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1"><span className={labelCls}>Larghezza</span><input type="number" value={block.width} onChange={(e) => onChange({ ...block, width: Number(e.target.value) || 100 })} className="rounded-md border border-line dark:border-[#2a2a2e] bg-paper dark:bg-[#131316] px-2 py-2 text-[13px]" /></label>
            <label className="flex flex-col gap-1"><span className={labelCls}>Raggio</span><input type="number" value={block.radius} onChange={(e) => onChange({ ...block, radius: Number(e.target.value) || 0 })} className="rounded-md border border-line dark:border-[#2a2a2e] bg-paper dark:bg-[#131316] px-2 py-2 text-[13px]" /></label>
          </div>
          <div><span className={labelCls}>Allineamento</span><SearchableSelect value={block.align} onChange={(v) => onChange({ ...block, align: v as Align })} options={ALIGN_OPTIONS} /></div>
          <label className="w-full">
            <input type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { const { url } = await uploadSignatureMediaApi(f); onChange({ ...block, src: url }); } catch (err) { toast.error((err as Error).message); } finally { e.target.value = ""; } }} />
            <span className="inline-flex h-[36px] w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-line dark:border-[#2a2a2e] text-[13px] font-semibold hover:bg-cream dark:hover:bg-[#1c1c20]"><Icon name="upload" className="h-4 w-4" /> Carica immagine</span>
          </label>
        </>
      )}
      {block.type === "spacer" && (
        <label className="flex items-center gap-2 text-[12px] text-muted">Altezza (px)
          <input type="number" value={block.height} onChange={(e) => onChange({ ...block, height: Number(e.target.value) || 10 })} className="w-20 rounded border border-line dark:border-[#2a2a2e] bg-paper dark:bg-[#131316] px-2 py-1 text-[12px]" />
        </label>
      )}
      {block.type === "divider" && <div className="text-[12px] text-muted">Linea orizzontale.</div>}
    </div>
  );
}

export function SignatureTemplateAdmin({ companyId }: { companyId: number }) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tplId, setTplId] = useState<number | null>(null);
  const [name, setName] = useState("Firma aziendale");
  const [design, setDesign] = useState<SignatureDesign>(DEFAULT_DESIGN);
  const [fields, setFields] = useState<SignatureFieldDef[]>([]);
  const [brand, setBrand] = useState<CompanyBrand | null>(null);
  const [selected, setSelected] = useState<{ col: ColKey; id: string } | null>(null);
  const [addMenu, setAddMenu] = useState<ColKey | null>(null);
  const dragRef = useRef<{ col: ColKey; index: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, b] = await Promise.all([listTemplatesApi(companyId), getCompanyBrandApi(companyId).catch(() => null)]);
      setBrand(b);
      const tpl: CompanyTemplate | undefined = list.find((t) => t.is_default) ?? list[0];
      if (tpl && tpl.config && (tpl.config as unknown as SignatureDesign).version === 1) {
        setTplId(tpl.id); setName(tpl.name); setDesign(tpl.config as unknown as SignatureDesign); setFields(tpl.fields ?? []);
      } else {
        setTplId(tpl?.id ?? null); setName(tpl?.name ?? "Firma aziendale"); setDesign(DEFAULT_DESIGN); setFields(tpl?.fields ?? []);
      }
    } catch (e) { toast.error((e as Error).message); } finally { setLoading(false); }
  }, [companyId, toast]);
  useEffect(() => { void load(); }, [load]);

  const html = useMemo(() => generateHtml(design), [design]);
  useEffect(() => { setFields((cur) => mergeFields(detectTokens(html), cur)); }, [html]);

  const previewValues = useMemo(() => {
    const v: Record<string, string> = { ...(brand ? companyTokenMap(brand) : {}) };
    for (const f of fields) v[f.key] = f.editable ? (f.default || f.label || f.key) : (f.default || "");
    return v;
  }, [fields, brand]);

  // ── mutazioni design ──
  const setCol = (col: ColKey, blocks: SigBlock[]) => setDesign((d) => ({ ...d, [col]: blocks }));
  const updateBlock = (col: ColKey, id: string, nb: SigBlock) => setCol(col, design[col].map((b) => (b.id === id ? nb : b)));
  const removeBlock = (col: ColKey, id: string) => { setCol(col, design[col].filter((b) => b.id !== id)); setSelected(null); };
  const addBlock = (col: ColKey, type: SigBlockType) => { const nb = newBlock(type); setDesign((d) => ({ ...d, [col]: [...d[col], nb] })); setSelected({ col, id: nb.id }); setAddMenu(null); };
  const updateField = (key: string, patch: Partial<SignatureFieldDef>) => setFields((cur) => cur.map((f) => (f.key === key ? { ...f, ...patch } : f)));

  // ── drag & drop ──
  const onDragStart = (col: ColKey, index: number) => { dragRef.current = { col, index }; };
  const onDragEnterBlock = (col: ColKey, index: number) => {
    const dr = dragRef.current; if (!dr) return;
    if (dr.col === col && dr.index === index) return;
    setDesign((d) => moveBlock(d, dr.col, dr.index, col, index));
    dragRef.current = { col, index };
  };
  const onDragEnterColEnd = (col: ColKey) => {
    const dr = dragRef.current; if (!dr) return;
    const end = design[col].length - (dr.col === col ? 1 : 0);
    if (dr.col === col && dr.index === end) return;
    setDesign((d) => moveBlock(d, dr.col, dr.index, col, d[col].length - (dr.col === col ? 1 : 0)));
    dragRef.current = { col, index: design[col].length - (dr.col === col ? 1 : 0) };
  };
  const onDragEnd = () => { dragRef.current = null; };

  const save = async () => {
    setSaving(true);
    try {
      const body = { name, html, config: design as unknown as Record<string, unknown>, fields, is_default: true };
      const saved = tplId ? await updateTemplateApi(tplId, body) : await createTemplateApi(companyId, body);
      setTplId(saved.id); toast.success("Template firma salvato.");
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  };

  const selectedBlock = selected ? design[selected.col].find((b) => b.id === selected.id) ?? null : null;

  const renderCol = (col: ColKey) => (
    <div className="flex flex-col gap-1" style={{ minWidth: 0 }}>
      {design[col].map((b, i) => {
        const isSel = selected?.col === col && selected.id === b.id;
        return (
          <div
            key={b.id}
            draggable
            onDragStart={() => onDragStart(col, i)}
            onDragEnter={() => onDragEnterBlock(col, i)}
            onDragOver={(e) => e.preventDefault()}
            onDragEnd={onDragEnd}
            onClick={() => setSelected({ col, id: b.id })}
            className={`group relative cursor-move rounded transition-shadow ${isSel ? "ring-2 ring-brand-magenta" : "hover:ring-1 hover:ring-brand-magenta/40"}`}
            title="Trascina per riordinare · clic per modificare"
          >
            <div style={{ pointerEvents: "none" }} dangerouslySetInnerHTML={{ __html: resolveTokens(applyFieldRows(renderBlock(b, design.accent), [], previewValues), previewValues) }} />
            {isSel && (
              <button
                onClick={(e) => { e.stopPropagation(); removeBlock(col, b.id); }}
                className="absolute -right-2 -top-2 z-10 grid h-5 w-5 place-items-center rounded-full bg-danger text-white shadow"
                title="Elimina blocco"
              ><Icon name="x" className="h-3 w-3" /></button>
            )}
          </div>
        );
      })}
      {/* drop-at-end + add */}
      <div onDragEnter={() => onDragEnterColEnd(col)} onDragOver={(e) => e.preventDefault()} className="mt-1">
        <button onClick={() => setAddMenu(col)} className="w-full rounded border border-dashed border-line dark:border-[#2a2a2e] py-1.5 text-[11px] text-muted hover:text-ink dark:hover:text-paper hover:border-brand-magenta">
          + blocco
        </button>
      </div>
    </div>
  );

  if (loading) return <div className="flex items-center gap-2 text-muted dark:text-muted-dark text-sm p-4"><Spinner size="sm" /> Caricamento…</div>;

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className={cardCls}>
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="font-display font-bold tracking-tight text-ink dark:text-[#f4f4f7]" style={{ fontSize: "17px" }}>Template firma aziendale</h2>
          <Button variant="primary" onClick={() => void save()} loading={saving}><Icon name="check" className="h-4 w-4" /> Salva template</Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
          <div className="sm:col-span-2"><Input label="Nome template" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <label className="flex flex-col gap-1"><span className={labelCls}>Colore icone</span><input type="color" value={design.accent} onChange={(e) => setDesign({ ...design, accent: e.target.value })} className="h-[38px] w-full rounded-md border border-line dark:border-[#2a2a2e]" /></label>
          <div><span className={labelCls}>Layout</span><SearchableSelect value={design.columns} onChange={(v) => setDesign({ ...design, columns: v as "one" | "two" })} options={[{ value: "two", label: "Due colonne" }, { value: "one", label: "Una colonna" }]} /></div>
        </div>
      </div>

      {/* Editor: canvas + proprietà */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        {/* Canvas WYSIWYG */}
        <div className={cardCls}>
          <span className={labelCls}>Anteprima · trascina i blocchi, clicca per modificare</span>
          <div className="sig-preview mt-3 rounded-md border border-line dark:border-[#2a2a2e] bg-white p-5 overflow-x-auto">
            <div className="flex gap-5" style={{ fontFamily: "Tahoma, Arial, sans-serif" }}>
              <div className="flex-1" style={{ minWidth: 0 }}>{renderCol("left")}</div>
              {design.columns === "two" && <div className="w-48 flex-none">{renderCol("right")}</div>}
            </div>
          </div>
        </div>

        {/* Proprietà */}
        <div className={cardCls}>
          {selectedBlock ? (
            <BlockProps block={selectedBlock} onChange={(nb) => selected && updateBlock(selected.col, selected.id, nb)} />
          ) : (
            <div className="text-[13px] text-muted dark:text-muted-dark">Seleziona un blocco nell'anteprima per modificarlo, oppure aggiungine uno con “+ blocco”.</div>
          )}
        </div>
      </div>

      {/* Campi compilabili */}
      {fields.length > 0 && (
        <div className={cardCls}>
          <h3 className="font-display font-bold text-ink dark:text-[#f4f4f7] mb-4" style={{ fontSize: "15px" }}>Campi compilabili dall'utente ({fields.length})</h3>
          <div className="flex flex-col gap-3">
            {fields.map((f) => (
              <div key={f.key} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end border-b border-line dark:border-[#2a2a2e] pb-3">
                <div className="sm:col-span-2"><span className={labelCls}>Segnaposto</span><div className="mt-1 font-mono text-[12px]">{`{{${f.key}}}`}</div></div>
                <div className="sm:col-span-3"><Input label="Etichetta" value={f.label ?? ""} onChange={(e) => updateField(f.key, { label: e.target.value })} /></div>
                <div className="sm:col-span-2"><span className={labelCls}>Tipo</span><SearchableSelect value={f.type} onChange={(v) => updateField(f.key, { type: v as SignatureFieldType })} options={TYPE_OPTIONS} /></div>
                <div className="sm:col-span-3"><Input label="Default" value={f.default ?? ""} onChange={(e) => updateField(f.key, { default: e.target.value })} /></div>
                <label className="sm:col-span-2 pb-2 flex items-center gap-2 cursor-pointer"><Checkbox checked={f.editable} onChange={(v) => updateField(f.key, { editable: v })} /><span className="text-[13px]">Editabile</span></label>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Selettore blocchi */}
      <Modal
        open={addMenu !== null}
        onClose={() => setAddMenu(null)}
        title="Aggiungi blocco"
        icon={<Icon name="plus" className="h-5 w-5" />}
        size="md"
      >
        <p className="mb-4 text-[13px] text-muted dark:text-muted-dark">
          Scegli il blocco da aggiungere alla colonna {addMenu === "right" ? "destra (immagini)" : "sinistra (dettagli)"}.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {ADD_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => addMenu && addBlock(addMenu, t)}
              className="flex flex-col items-center gap-2 rounded-lg border border-line dark:border-[#2a2a2e] bg-paper dark:bg-[#131316] px-3 py-4 text-center transition-colors hover:border-brand-magenta hover:bg-cream dark:hover:bg-[#1c1c20]"
            >
              <span className="grid h-10 w-10 place-items-center rounded-md bg-cream text-ink dark:bg-[#1c1c20] dark:text-paper">
                <Icon name={BLOCK_META[t].icon} className="h-5 w-5" />
              </span>
              <span className="text-[13px] font-semibold text-ink dark:text-paper">{BLOCK_LABELS[t]}</span>
              <span className="text-[11px] leading-tight text-muted dark:text-muted-dark">{BLOCK_META[t].hint}</span>
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}
