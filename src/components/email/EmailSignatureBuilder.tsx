import { useCallback, useEffect, useRef, useState } from "react";
import { EmailEditor } from "react-email-editor";
import type { EditorRef } from "react-email-editor";
import {
  createSignatureApi,
  deleteSignatureApi,
  listSignaturesApi,
  setDefaultSignatureApi,
  updateSignatureApi,
  uploadSignatureMediaApi,
  type EmailSignature,
  type SignatureDesign,
} from "../../api/emailSignatures";
import { SIGNATURE_BASE_HTML } from "./signatureBaseTemplate";
import { useToast } from "../../context/ToastContext";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Icon } from "../ui/Icon";
import { Modal } from "../ui/Modal";
import { Spinner } from "../ui/Spinner";
import { Checkbox } from "../ui/Checkbox";
import { SearchableSelect } from "../ui/SearchableSelect";

interface Company { id: number; name: string; }
interface Props { companies: Company[]; defaultCompanyId: number | null; }
type Editing = { id?: number; name: string; is_default: boolean };

const labelCls = "text-[11px] font-semibold uppercase tracking-wider text-muted dark:text-muted-dark";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Unlayer = any;

export function EmailSignatureBuilder({ companies, defaultCompanyId }: Props) {
  const toast = useToast();
  const [companyId, setCompanyId] = useState<number | null>(defaultCompanyId ?? companies[0]?.id ?? null);
  const [list, setList] = useState<EmailSignature[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [saving, setSaving] = useState(false);
  const editorRef = useRef<EditorRef>(null);
  const pendingLoadRef = useRef<{ design?: SignatureDesign; html?: string } | null>(null);

  const reload = useCallback((cid: number | null) => {
    if (cid == null) return;
    setLoading(true);
    listSignaturesApi(cid)
      .then(setList)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Errore nel caricamento"))
      .finally(() => setLoading(false));
  }, [toast]);

  useEffect(() => { reload(companyId); setEditing(null); }, [companyId, reload]);

  // Callback immagini di Unlayer → upload su GCS.
  const registerImageCallback = useCallback((unlayer: Unlayer) => {
    unlayer.registerCallback("image", async (file: { attachments: File[] }, done: (r: { progress: number; url: string }) => void) => {
      try {
        const { url } = await uploadSignatureMediaApi(file.attachments[0]);
        done({ progress: 100, url });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Upload immagine fallito");
        done({ progress: 0, url: "" });
      }
    });
  }, [toast]);

  const handleReady = useCallback((unlayer: Unlayer) => {
    registerImageCallback(unlayer);
    const pl = pendingLoadRef.current;
    if (pl?.design) unlayer.loadDesign(pl.design);
    else unlayer.loadHtml({ html: pl?.html ?? SIGNATURE_BASE_HTML });
  }, [registerImageCallback]);

  const startEdit = (s?: EmailSignature) => {
    if (s) {
      pendingLoadRef.current = s.config ? { design: s.config } : { html: SIGNATURE_BASE_HTML };
      setEditing({ id: s.id, name: s.name, is_default: s.is_default });
    } else {
      pendingLoadRef.current = { html: SIGNATURE_BASE_HTML };
      setEditing({ name: "Firma", is_default: list.length === 0 });
    }
  };

  const onSave = () => {
    const editor = editorRef.current?.editor;
    if (!editor || !editing || companyId == null) return;
    if (!editing.name.trim()) { toast.error("Dai un nome alla firma"); return; }
    setSaving(true);
    editor.exportHtml(async (data: { design: object; html: string }) => {
      try {
        const payload = { name: editing.name, config: data.design as SignatureDesign, html: data.html, is_default: editing.is_default };
        const saved = editing.id
          ? await updateSignatureApi(editing.id, payload)
          : await createSignatureApi(companyId, payload);
        toast.success("Firma salvata");
        setEditing({ id: saved.id, name: saved.name, is_default: saved.is_default });
        reload(companyId);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Errore nel salvataggio");
      } finally {
        setSaving(false);
      }
    });
  };

  const onDelete = async () => {
    if (!editing?.id) { setEditing(null); return; }
    if (!window.confirm(`Eliminare la firma "${editing.name}"?`)) return;
    try {
      await deleteSignatureApi(editing.id);
      setEditing(null);
      reload(companyId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Eliminazione fallita");
    }
  };

  const onSetDefault = async (s: EmailSignature) => {
    try { await setDefaultSignatureApi(s.id); reload(companyId); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Errore"); }
  };

  return (
    <div className="bg-paper dark:bg-[#131316] rounded-lg border border-line dark:border-[#2a2a2e] p-6">
      <h2 className="font-display font-bold tracking-tight text-ink dark:text-[#f4f4f7] mb-1" style={{ fontSize: "17px" }}>
        Firma email
      </h2>
      <p className="font-body text-[13px] text-muted dark:text-[#9999a0] mb-5">
        Editor a blocchi drag-and-drop (compatibile Gmail, Outlook e tutti i provider). Puoi averne più d'una per organizzazione.
      </p>

      {companies.length > 1 && (
        <div className="mb-5 flex flex-col gap-1">
          <label className={labelCls}>Organizzazione</label>
          <SearchableSelect
            value={companyId != null ? String(companyId) : ""}
            onChange={(v) => setCompanyId(Number(v))}
            options={companies.map((c) => ({ value: String(c.id), label: c.name }))}
            placeholder="Seleziona organizzazione"
          />
        </div>
      )}

      {/* Elenco firme */}
      {!editing && (
        <>
          {loading ? (
            <div className="flex justify-center py-6"><Spinner /></div>
          ) : list.length === 0 ? (
            <p className="text-sm text-muted dark:text-muted-dark">Nessuna firma per questa organizzazione.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {list.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center gap-3 rounded-md border border-line dark:border-line-dark px-3 py-2.5">
                  <button className="min-w-0 flex-1 text-left" onClick={() => startEdit(s)}>
                    <span className="text-sm font-semibold text-ink dark:text-paper">{s.name}</span>
                    {s.is_default && <span className="ml-2 rounded-pill bg-brand-magenta/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-magenta">Predefinita</span>}
                  </button>
                  {!s.is_default && <Button size="sm" variant="ghost" onClick={() => onSetDefault(s)}>Predefinita</Button>}
                  <Button size="sm" variant="ghost" onClick={() => startEdit(s)}>Modifica</Button>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4">
            <Button size="sm" variant="secondary" onClick={() => startEdit()}>
              <Icon name="plus" className="h-4 w-4" /> Nuova firma
            </Button>
          </div>
        </>
      )}

      {/* Editor Unlayer in un modal a tutta larghezza */}
      {editing && (
        <Modal
          open
          onClose={() => setEditing(null)}
          title={editing.id ? "Modifica firma" : "Nuova firma"}
          icon={<Icon name="mail" className="h-5 w-5" />}
          dialogClassName="h-[92vh] !max-w-6xl"
          bodyClassName="flex flex-col gap-4"
          footer={
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-ink dark:text-paper">
                <Checkbox checked={editing.is_default} onChange={(v) => setEditing({ ...editing, is_default: v })} />
                Predefinita
              </label>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={onDelete}>{editing.id ? "Elimina" : "Annulla"}</Button>
                <Button size="sm" variant="primary" onClick={onSave} loading={saving}>Salva firma</Button>
              </div>
            </div>
          }
        >
          <Input label="Nome firma" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="es. Firma commerciale" />
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-line dark:border-line-dark">
            <EmailEditor
              ref={editorRef}
              onReady={handleReady}
              minHeight="100%"
              style={{ height: "100%", flex: 1 }}
              options={{ tools: { image: { enabled: true } }, appearance: { theme: "modern_light" } }}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
