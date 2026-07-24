import { useEffect, useState } from "react";
import {
  createQuickLinkApi,
  deleteQuickLinkApi,
  listQuickLinksApi,
  reorderQuickLinksApi,
  updateQuickLinkApi,
  type QuickLink,
} from "../../api/quickLinks";
import { useToast } from "../../context/ToastContext";
import { faviconFor, hostLabel, normalizeUrl } from "../../utils/quickLinks";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Icon } from "../ui/Icon";
import { Spinner } from "../ui/Spinner";

/** Notifica la barra in navbar che i collegamenti sono cambiati. */
function notifyUpdated() {
  window.dispatchEvent(new CustomEvent("quick-links-updated"));
}

/**
 * Sezione profilo "Collegamenti rapidi": elenco con favicon, riordino via drag&drop
 * nativo (HTML5), form di aggiunta e modifica/eliminazione per ogni riga.
 */
export function QuickLinksSection() {
  const toast = useToast();
  const [links, setLinks] = useState<QuickLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form di aggiunta.
  const [newTitle, setNewTitle] = useState("");
  const [newUrl, setNewUrl] = useState("");

  // Modifica inline.
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [rowBusy, setRowBusy] = useState<number | null>(null);

  // Drag & drop.
  const [dragId, setDragId] = useState<number | null>(null);
  const [dropId, setDropId] = useState<number | null>(null);

  const reload = () => {
    setLoading(true);
    listQuickLinksApi()
      .then((data) => setLinks([...data].sort((a, b) => a.position - b.position)))
      .catch((e) => toast.error(e instanceof Error ? e.message : "Errore nel caricamento"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    let cancelled = false;
    listQuickLinksApi()
      .then((data) => { if (!cancelled) setLinks([...data].sort((a, b) => a.position - b.position)); })
      .catch(() => { /* silenzioso al primo caricamento */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAdd = async () => {
    const url = newUrl.trim();
    if (!url) {
      toast.error("Inserisci un URL");
      return;
    }
    const normalized = normalizeUrl(url);
    const title = newTitle.trim() || hostLabel(normalized);
    setSaving(true);
    try {
      const created = await createQuickLinkApi({ title, url: normalized });
      setLinks((prev) => [...prev, created].sort((a, b) => a.position - b.position));
      setNewTitle("");
      setNewUrl("");
      notifyUpdated();
      toast.success("Collegamento aggiunto");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore nel salvataggio");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (link: QuickLink) => {
    setEditingId(link.id);
    setEditTitle(link.title);
    setEditUrl(link.url);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditTitle("");
    setEditUrl("");
  };

  const handleUpdate = async (id: number) => {
    const url = editUrl.trim();
    if (!url) {
      toast.error("Inserisci un URL");
      return;
    }
    const normalized = normalizeUrl(url);
    const title = editTitle.trim() || hostLabel(normalized);
    setRowBusy(id);
    try {
      const updated = await updateQuickLinkApi(id, { title, url: normalized });
      setLinks((prev) => prev.map((l) => (l.id === id ? updated : l)).sort((a, b) => a.position - b.position));
      cancelEdit();
      notifyUpdated();
      toast.success("Collegamento aggiornato");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore nel salvataggio");
    } finally {
      setRowBusy(null);
    }
  };

  const handleDelete = async (id: number) => {
    setRowBusy(id);
    try {
      await deleteQuickLinkApi(id);
      setLinks((prev) => prev.filter((l) => l.id !== id));
      if (editingId === id) cancelEdit();
      notifyUpdated();
      toast.success("Collegamento eliminato");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore nell'eliminazione");
    } finally {
      setRowBusy(null);
    }
  };

  // Rilascio drag: riordina localmente (ottimistico) e persiste via API.
  const handleDrop = (targetId: number) => {
    const from = dragId;
    setDragId(null);
    setDropId(null);
    if (from == null || from === targetId) return;

    const current = [...links];
    const fromIdx = current.findIndex((l) => l.id === from);
    const toIdx = current.findIndex((l) => l.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;

    const [moved] = current.splice(fromIdx, 1);
    current.splice(toIdx, 0, moved);
    setLinks(current);

    reorderQuickLinksApi(current.map((l) => l.id))
      .then((updated) => {
        setLinks([...updated].sort((a, b) => a.position - b.position));
        notifyUpdated();
      })
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : "Errore nel riordino");
        reload();
      });
  };

  return (
    <div className="bg-paper dark:bg-[#131316] rounded-lg border border-line dark:border-[#2a2a2e] p-6">
      <div className="mb-1 flex items-center gap-2">
        <Icon name="link" className="h-5 w-5 text-muted dark:text-[#9999a0]" />
        <h2 className="font-display font-bold tracking-tight text-ink dark:text-[#f4f4f7]" style={{ fontSize: "17px" }}>
          Collegamenti rapidi
        </h2>
      </div>
      <p className="font-body text-[13px] text-muted dark:text-[#9999a0] mb-5">
        Siti e strumenti che usi spesso: compaiono nella barra in alto e nel browser interno.
        Trascina per riordinarli.
      </p>

      {loading ? (
        <div className="flex justify-center py-4"><Spinner /></div>
      ) : (
        <div className="flex flex-col gap-2">
          {links.length === 0 && (
            <p className="text-sm text-muted dark:text-muted-dark">
              Nessun collegamento. Aggiungine uno qui sotto.
            </p>
          )}

          {links.map((link) => {
            const isEditing = editingId === link.id;
            const isDropTarget = dropId === link.id && dragId !== link.id;
            return (
              <div
                key={link.id}
                draggable={!isEditing}
                onDragStart={(e) => { setDragId(link.id); e.dataTransfer.effectAllowed = "move"; }}
                onDragEnd={() => { setDragId(null); setDropId(null); }}
                onDragOver={(e) => {
                  if (dragId == null || dragId === link.id) return;
                  e.preventDefault();
                  if (dropId !== link.id) setDropId(link.id);
                }}
                onDrop={(e) => { e.preventDefault(); handleDrop(link.id); }}
                className={`flex items-center gap-3 rounded-md border p-2.5 transition-colors ${
                  isDropTarget ? "border-brand-magenta" : "border-line dark:border-[#2a2a2e]"
                } ${dragId === link.id ? "opacity-40" : ""} ${isEditing ? "" : "cursor-grab active:cursor-grabbing"} bg-paper dark:bg-[#131316]`}
              >
                {isEditing ? (
                  <div className="flex flex-1 flex-col gap-2 sm:flex-row">
                    <div className="sm:w-1/3">
                      <Input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        placeholder="Titolo (opzionale)"
                      />
                    </div>
                    <div className="flex-1">
                      <Input
                        value={editUrl}
                        onChange={(e) => setEditUrl(e.target.value)}
                        placeholder="https://..."
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => handleUpdate(link.id)}
                        loading={rowBusy === link.id}
                      >
                        Salva
                      </Button>
                      <Button size="sm" variant="ghost" onClick={cancelEdit} disabled={rowBusy === link.id}>
                        Annulla
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <Icon name="menu" className="h-4 w-4 flex-shrink-0 text-muted dark:text-[#9999a0]" />
                    <img src={faviconFor(link)} alt="" className="h-6 w-6 flex-shrink-0 rounded-sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-ink dark:text-[#f4f4f7]">{link.title}</p>
                      <p className="truncate text-[11px] text-muted dark:text-[#9999a0]">{link.url}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => startEdit(link)}
                      title="Modifica"
                      aria-label="Modifica"
                      className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-md border border-line text-muted transition-colors hover:text-ink dark:border-[#2a2a2e] dark:text-[#9999a0] dark:hover:text-[#f4f4f7]"
                    >
                      <Icon name="pencil" className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(link.id)}
                      disabled={rowBusy === link.id}
                      title="Elimina"
                      aria-label="Elimina"
                      className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-md border border-line text-muted transition-colors hover:border-danger hover:text-danger disabled:opacity-50 dark:border-[#2a2a2e] dark:text-[#9999a0]"
                    >
                      <Icon name="trash" className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Form di aggiunta ─────────────────────────────────── */}
      <div className="mt-5 border-t border-line pt-5 dark:border-[#2a2a2e]">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
          Aggiungi collegamento
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="sm:w-1/3">
            <Input
              label="Titolo"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Opzionale — usa il sito se vuoto"
            />
          </div>
          <div className="flex-1">
            <Input
              label="URL"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="https://esempio.com"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleAdd(); } }}
            />
          </div>
          <Button variant="secondary" onClick={handleAdd} loading={saving} leftIcon={<Icon name="plus" className="h-4 w-4" />}>
            Salva
          </Button>
        </div>
      </div>
    </div>
  );
}
