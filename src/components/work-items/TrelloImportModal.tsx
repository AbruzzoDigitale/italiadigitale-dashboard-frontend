import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Spinner } from "../ui/Spinner";
import { SearchableSelect } from "../ui/SearchableSelect";
import { useToast } from "../../context/ToastContext";
import { listLiveTrelloBoardsApi, type TrelloLiveBoard } from "../../api/trelloBoards";
import {
  getBoardMembersApi,
  saveMemberMapApi,
  previewTrelloCardsApi,
  importTrelloCardsApi,
  type TrelloMemberMapItem,
  type TrelloPreviewCard,
} from "../../api/trelloImport";
import { type User } from "../../api/users";

// ─────────────────────────────────────────────────────────────────────────────
// Import card Trello → lavorazioni. Scegli una board (cliente), mappa i membri
// (una volta), poi seleziona le card da importare con anteprima stato/scadenza.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
  companyId: number;
  users: User[];
  onImported: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  planned: "Da fare", in_progress: "In corso", review: "Revisione", completed: "Completata",
};
const labelCls = "text-[11px] font-semibold uppercase tracking-wider text-muted dark:text-muted-dark";

export function TrelloImportModal({ open, onClose, companyId, users, onImported }: Props) {
  const toast = useToast();
  const [boards, setBoards] = useState<TrelloLiveBoard[]>([]);
  const [boardId, setBoardId] = useState<string>("");
  const [loadingBoards, setLoadingBoards] = useState(false);

  const [members, setMembers] = useState<TrelloMemberMapItem[]>([]);
  const [mapOpen, setMapOpen] = useState(false);
  const [savingMap, setSavingMap] = useState(false);

  const [cards, setCards] = useState<TrelloPreviewCard[]>([]);
  const [loadingCards, setLoadingCards] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);

  const userOptions = useMemo(
    () => [{ value: "", label: "— non assegnato —" }, ...users.map((u) => ({ value: String(u.id), label: u.full_name || u.username }))],
    [users]
  );

  // Board live all'apertura
  useEffect(() => {
    if (!open) return;
    setLoadingBoards(true);
    listLiveTrelloBoardsApi(companyId)
      .then((bs) => setBoards(bs.filter((b) => !b.closed)))
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setLoadingBoards(false));
  }, [open, companyId, toast]);

  const loadCards = useCallback(async (bid: string) => {
    setLoadingCards(true);
    try {
      const r = await previewTrelloCardsApi(companyId, bid);
      setCards(r.cards);
      // preseleziona le non ancora importate
      setSelected(new Set(r.cards.filter((c) => !c.already_imported_work_item_id).map((c) => c.trello_card_id)));
    } catch (e) {
      toast.error((e as Error).message);
      setCards([]);
    } finally {
      setLoadingCards(false);
    }
  }, [companyId, toast]);

  const onSelectBoard = async (bid: string) => {
    setBoardId(bid);
    setCards([]);
    setSelected(new Set());
    if (!bid) return;
    try {
      const m = await getBoardMembersApi(companyId, bid);
      setMembers(m.members);
      // apri la mappatura se ci sono membri non mappati
      setMapOpen(m.members.some((x) => x.user_id == null));
    } catch (e) {
      toast.error((e as Error).message);
    }
    void loadCards(bid);
  };

  const setMemberUser = (memberId: string, userId: number | null) =>
    setMembers((cur) => cur.map((m) => (m.trello_member_id === memberId ? { ...m, user_id: userId } : m)));

  const saveMap = async () => {
    setSavingMap(true);
    try {
      await saveMemberMapApi(companyId, members);
      toast.success("Mappatura membri salvata.");
      setMapOpen(false);
      if (boardId) void loadCards(boardId); // aggiorna gli assegnatari nell'anteprima
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingMap(false);
    }
  };

  const toggle = (id: string) => setSelected((cur) => { const n = new Set(cur); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const importable = cards.filter((c) => !c.already_imported_work_item_id);
  const allSel = importable.length > 0 && importable.every((c) => selected.has(c.trello_card_id));
  const toggleAll = () => setSelected(allSel ? new Set() : new Set(importable.map((c) => c.trello_card_id)));

  const doImport = async () => {
    const ids = [...selected];
    if (!ids.length) return;
    setImporting(true);
    try {
      const r = await importTrelloCardsApi(companyId, { board_id: boardId, card_ids: ids });
      toast.success(`Importate ${r.created} card${r.skipped ? `, ${r.skipped} già presenti` : ""}.`);
      onImported();
      void loadCards(boardId); // ricarica → marcate come importate
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setImporting(false);
    }
  };

  const unmappedNeeded = members.some((m) => m.user_id == null);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Importa da Trello"
      icon={<Icon name="trello" className="h-5 w-5" />}
      size="2xl"
      dialogClassName="!max-w-4xl"
    >
      <div className="flex flex-col gap-4">
        {/* Board */}
        <div className="flex flex-col gap-1">
          <span className={labelCls}>Board Trello (cliente)</span>
          {loadingBoards ? (
            <div className="flex items-center gap-2 text-sm text-muted"><Spinner size="sm" /> Carico le board…</div>
          ) : (
            <SearchableSelect
              value={boardId}
              onChange={onSelectBoard}
              options={boards.map((b) => ({ value: b.id, label: b.name }))}
              placeholder="Seleziona una board"
              searchPlaceholder="Cerca board…"
            />
          )}
        </div>

        {boardId && (
          <>
            {/* Mappatura membri (collassabile) */}
            <div className="rounded-md border border-line dark:border-[#2a2a2e]">
              <button onClick={() => setMapOpen((v) => !v)} className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left">
                <span className="text-[13px] font-semibold text-ink dark:text-paper">
                  Mappatura membri {unmappedNeeded && <span className="ml-1 rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-bold uppercase text-warning">da completare</span>}
                </span>
                <Icon name="chevron-down" className={`h-4 w-4 transition-transform ${mapOpen ? "rotate-180" : ""}`} />
              </button>
              {mapOpen && (
                <div className="border-t border-line dark:border-[#2a2a2e] p-3 flex flex-col gap-2">
                  <p className="text-[12px] text-muted dark:text-muted-dark">Abbina ogni membro Trello a un utente del gestionale (i membri Trello diventano assegnatari).</p>
                  {members.map((m) => (
                    <div key={m.trello_member_id} className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-center">
                      <span className="text-[13px] text-ink dark:text-paper">{m.trello_full_name || m.trello_username || m.trello_member_id}</span>
                      <SearchableSelect value={m.user_id != null ? String(m.user_id) : ""} onChange={(v) => setMemberUser(m.trello_member_id, Number(v) || null)} options={userOptions} placeholder="Utente" />
                    </div>
                  ))}
                  <div><Button size="sm" variant="secondary" onClick={() => void saveMap()} loading={savingMap}><Icon name="check" className="h-4 w-4" /> Salva mappatura</Button></div>
                </div>
              )}
            </div>

            {/* Card */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className={labelCls}>Card ({cards.length})</span>
                {importable.length > 0 && (
                  <button onClick={toggleAll} className="text-[12px] font-semibold text-brand-magenta hover:underline">
                    {allSel ? "Deseleziona tutte" : "Seleziona tutte"}
                  </button>
                )}
              </div>
              {loadingCards ? (
                <div className="flex items-center gap-2 text-sm text-muted py-6 justify-center"><Spinner /> Carico le card…</div>
              ) : cards.length === 0 ? (
                <div className="rounded-md border border-dashed border-line dark:border-[#2a2a2e] p-6 text-center text-[13px] text-muted">Nessuna card nelle liste di lavoro.</div>
              ) : (
                <div className="max-h-[46vh] overflow-y-auto flex flex-col gap-1.5 pr-1">
                  {cards.map((c) => {
                    const imported = !!c.already_imported_work_item_id;
                    const sel = selected.has(c.trello_card_id);
                    return (
                      <label key={c.trello_card_id} className={`flex items-start gap-3 rounded-md border p-2.5 ${imported ? "opacity-60 border-line dark:border-[#2a2a2e]" : sel ? "border-brand-magenta bg-brand-magenta/5" : "border-line dark:border-[#2a2a2e] cursor-pointer"}`}>
                        <input type="checkbox" className="mt-1" checked={sel} disabled={imported} onChange={() => toggle(c.trello_card_id)} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[13px] font-semibold text-ink dark:text-paper truncate">{c.name}</span>
                            <span className="rounded-full bg-cream dark:bg-[#1c1c20] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">{STATUS_LABEL[c.status] ?? c.status}</span>
                            {imported && <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-bold uppercase text-success">Già importata</span>}
                          </div>
                          <div className="mt-0.5 flex items-center gap-3 flex-wrap text-[11px] text-muted dark:text-muted-dark">
                            {c.deadline_date && <span>📅 {c.deadline_date}</span>}
                            {c.assignee_names.filter(Boolean).length > 0 && <span>👤 {c.assignee_names.filter(Boolean).join(", ")}</span>}
                            {c.unmapped_member_ids.length > 0 && <span className="text-warning">{c.unmapped_member_ids.length} membro/i non mappati</span>}
                            {c.url && <a href={c.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-brand-magenta hover:underline">Trello ↗</a>}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-line dark:border-[#2a2a2e] pt-3">
              <Button variant="ghost" onClick={onClose}>Chiudi</Button>
              <Button variant="primary" onClick={() => void doImport()} loading={importing} disabled={selected.size === 0}>
                <Icon name="download" className="h-4 w-4" /> Importa {selected.size > 0 ? `(${selected.size})` : ""}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
