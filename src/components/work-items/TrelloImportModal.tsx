import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Checkbox } from "../ui/Checkbox";
import { Avatar } from "../ui/Avatar";
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
import { isPedTitle } from "../../utils/ped";

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

// Card fantasma per il caricamento board (shimmer + entrata a cascata).
function BoardSkeleton({ delay = 0 }: { delay?: number }) {
  return (
    <div
      className="flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-3 dark:border-[#2a2a2e] dark:bg-[#131316] animate-fadeIn"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="skel-shimmer h-8 w-8 flex-none rounded-md" />
      <div className="skel-shimmer h-3.5 flex-1 rounded" />
    </div>
  );
}

export function TrelloImportModal({ open, onClose, companyId, users, onImported }: Props) {
  const toast = useToast();
  const [boards, setBoards] = useState<TrelloLiveBoard[]>([]);
  const [boardId, setBoardId] = useState<string>("");
  const [loadingBoards, setLoadingBoards] = useState(false);
  const [boardQuery, setBoardQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(18);
  const boardScrollRef = useRef<HTMLDivElement>(null);
  const boardSentinelRef = useRef<HTMLDivElement>(null);

  const [members, setMembers] = useState<TrelloMemberMapItem[]>([]);
  const [mapOpen, setMapOpen] = useState(false);
  const [savingMap, setSavingMap] = useState(false);

  const [cards, setCards] = useState<TrelloPreviewCard[]>([]);
  const [loadingCards, setLoadingCards] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pedIds, setPedIds] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);

  const userOptions = useMemo(
    () => [
      { value: "", label: "— non assegnato —" },
      ...users.map((u) => ({ value: String(u.id), label: u.full_name || u.username, avatarUrl: u.avatar_url })),
    ],
    [users]
  );

  // Board live all'apertura — sorgente "workspace" = TUTTE le board dell'azienda
  // (non solo quelle a cui l'account è iscritto).
  useEffect(() => {
    if (!open) return;
    setLoadingBoards(true);
    listLiveTrelloBoardsApi(companyId, false, "workspace")
      .then((bs) => setBoards(bs.filter((b) => !b.closed)))
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setLoadingBoards(false));
  }, [open, companyId, toast]);

  // Ricerca + reveal progressivo (infinite loading).
  const filteredBoards = useMemo(() => {
    const q = boardQuery.trim().toLowerCase();
    return q ? boards.filter((b) => b.name.toLowerCase().includes(q)) : boards;
  }, [boards, boardQuery]);
  const shownBoards = filteredBoards.slice(0, visibleCount);
  const hasMoreBoards = visibleCount < filteredBoards.length;
  useEffect(() => { setVisibleCount(18); }, [boardQuery]);

  // Infinite loading robusto: un sentinel osservato da IntersectionObserver.
  // Rivela altre board finché il sentinel è visibile (riempie sempre l'area,
  // anche se la lista non genera scroll) e si ferma da solo quando finiscono.
  useEffect(() => {
    if (boardId || loadingBoards || !hasMoreBoards) return;
    const sentinel = boardSentinelRef.current;
    if (!sentinel) return;
    const io = new IntersectionObserver(
      (entries) => { if (entries.some((e) => e.isIntersecting)) setVisibleCount((c) => c + 18); },
      { root: boardScrollRef.current, rootMargin: "250px" }
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [boardId, loadingBoards, hasMoreBoards, visibleCount, filteredBoards.length]);

  const loadCards = useCallback(async (bid: string) => {
    setLoadingCards(true);
    try {
      const r = await previewTrelloCardsApi(companyId, bid);
      setCards(r.cards);
      setPedIds(new Set());
      // preseleziona solo le card di lavoro non ancora importate; le liste
      // informative (Informazioni/Link/Modelli…) restano visibili ma deselezionate;
      // le card già importate sono selezionabili a parte (re-sync), non preselezionate
      setSelected(new Set(r.cards.filter((c) => !c.already_imported_work_item_id && c.is_workflow).map((c) => c.trello_card_id)));
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
    setPedIds(new Set());
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
  const togglePed = (id: string) => setPedIds((cur) => { const n = new Set(cur); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allSel = cards.length > 0 && cards.every((c) => selected.has(c.trello_card_id));
  const toggleAll = () => setSelected(allSel ? new Set() : new Set(cards.map((c) => c.trello_card_id)));

  const doImport = async () => {
    const ids = [...selected];
    if (!ids.length) return;
    setImporting(true);
    try {
      const ped_card_ids = ids.filter((id) => pedIds.has(id));
      const r = await importTrelloCardsApi(companyId, { board_id: boardId, card_ids: ids, ped_card_ids });
      const parts = [r.created ? `${r.created} importate` : "", r.updated ? `${r.updated} sincronizzate` : ""].filter(Boolean);
      toast.success(parts.length ? `Fatto: ${parts.join(", ")}.` : "Nessuna modifica.");
      onImported();
      void loadCards(boardId); // ricarica → stato aggiornato
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
      dialogClassName="!max-w-4xl h-[85vh]"
      bodyClassName="flex flex-col"
    >
      <div className="flex flex-1 min-h-0 flex-col gap-4">
        {!boardId ? (
          /* PICKER BOARD — cerca + card + infinite loading */
          <div className="flex flex-1 min-h-0 flex-col gap-3">
            <div className="flex flex-none items-center gap-3">
              <div className="relative flex-1">
                <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input
                  value={boardQuery}
                  onChange={(e) => setBoardQuery(e.target.value)}
                  placeholder="Cerca board…"
                  className="w-full rounded-md border border-line bg-paper py-2.5 pl-9 pr-3 text-sm text-ink placeholder:text-muted focus:border-ink focus:outline-none dark:border-[#2a2a2e] dark:bg-[#131316] dark:text-paper"
                />
              </div>
              <span className="flex-none text-[12px] text-muted dark:text-muted-dark">{filteredBoards.length} board</span>
            </div>
            {loadingBoards ? (
              <div className="flex-1 min-h-0 overflow-hidden pr-1">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {Array.from({ length: 9 }).map((_, i) => (
                    <BoardSkeleton key={i} delay={i * 55} />
                  ))}
                </div>
              </div>
            ) : filteredBoards.length === 0 ? (
              <div className="flex flex-1 items-center justify-center text-[13px] text-muted">Nessuna board trovata.</div>
            ) : (
              <div ref={boardScrollRef} className="flex-1 min-h-0 overflow-y-auto pr-1">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {shownBoards.map((b, i) => (
                    <button
                      key={b.id}
                      onClick={() => onSelectBoard(b.id)}
                      title={b.name}
                      className="flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-3 text-left transition-colors hover:border-brand-magenta hover:bg-brand-magenta/5 dark:border-[#2a2a2e] dark:bg-[#131316] animate-fadeIn"
                      style={{ animationDelay: `${(i % 18) * 30}ms` }}
                    >
                      <span className="grid h-8 w-8 flex-none place-items-center rounded-md bg-[#0079bf]/10 text-[#0079bf]">
                        <Icon name="trello" className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 truncate text-[13px] font-semibold text-ink dark:text-paper">{b.name}</span>
                    </button>
                  ))}
                </div>
                {hasMoreBoards && (
                  <div ref={boardSentinelRef} className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <BoardSkeleton key={i} delay={i * 60} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-1 min-h-0 flex-col gap-4">
            <button
              onClick={() => { setBoardId(""); setCards([]); setSelected(new Set()); }}
              className="flex-none inline-flex items-center gap-1 self-start text-[12px] font-semibold text-brand-magenta hover:underline"
            >
              <Icon name="chevron-right" className="h-3.5 w-3.5 rotate-180" /> Cambia board
              <span className="ml-1 text-muted dark:text-muted-dark">· {boards.find((b) => b.id === boardId)?.name}</span>
            </button>
            {/* Mappatura membri (collassabile) */}
            <div className="flex-none rounded-md border border-line dark:border-[#2a2a2e]">
              <button onClick={() => setMapOpen((v) => !v)} className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left">
                <span className="text-[13px] font-semibold text-ink dark:text-paper">
                  Mappatura membri {unmappedNeeded && <span className="ml-1 rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-bold uppercase text-warning">da completare</span>}
                </span>
                <Icon name="chevron-down" className={`h-4 w-4 transition-transform ${mapOpen ? "rotate-180" : ""}`} />
              </button>
              {mapOpen && (
                <div className="border-t border-line dark:border-[#2a2a2e] p-3 flex flex-col gap-2">
                  <p className="text-[12px] text-muted dark:text-muted-dark">Abbina ogni membro Trello a un utente del gestionale (i membri Trello diventano assegnatari).</p>
                  {members.map((m) => {
                    const trelloName = m.trello_full_name || m.trello_username || m.trello_member_id;
                    return (
                      <div key={m.trello_member_id} className="flex flex-wrap items-center gap-2">
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <Avatar name={trelloName} size="sm" className="!bg-[#0079bf]" />
                          <span className="min-w-0 truncate text-[13px] text-ink dark:text-paper">{trelloName}</span>
                        </div>
                        <Icon name="chevron-right" className="h-4 w-4 flex-none text-muted dark:text-muted-dark" />
                        <div className="min-w-0 flex-1">
                          <SearchableSelect value={m.user_id != null ? String(m.user_id) : ""} onChange={(v) => setMemberUser(m.trello_member_id, Number(v) || null)} options={userOptions} placeholder="Utente" />
                        </div>
                      </div>
                    );
                  })}
                  <div><Button size="sm" variant="secondary" onClick={() => void saveMap()} loading={savingMap}><Icon name="check" className="h-4 w-4" /> Salva mappatura</Button></div>
                </div>
              )}
            </div>

            {/* Card */}
            <div className="flex flex-1 min-h-0 flex-col">
              <div className="mb-2 flex flex-none items-center justify-between">
                <span className={labelCls}>Card ({cards.length})</span>
                {cards.length > 0 && (
                  <button onClick={toggleAll} className="text-[12px] font-semibold text-brand-magenta hover:underline">
                    {allSel ? "Deseleziona tutte" : "Seleziona tutte"}
                  </button>
                )}
              </div>
              {loadingCards ? (
                <div className="grid flex-1 min-h-0 grid-cols-1 content-start gap-2 overflow-hidden pr-1 sm:grid-cols-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div
                      key={i}
                      className="flex flex-col gap-2 rounded-lg border border-line dark:border-[#2a2a2e] p-3 animate-fadeIn"
                      style={{ animationDelay: `${i * 70}ms` }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="skel-shimmer h-3.5 rounded" style={{ width: `${45 + ((i * 13) % 40)}%` }} />
                        <div className="skel-shimmer h-4 w-4 flex-none rounded-[4px]" />
                      </div>
                      <div className="flex gap-1.5">
                        <div className="skel-shimmer h-4 w-16 rounded-full" />
                        <div className="skel-shimmer h-4 w-20 rounded-full" />
                      </div>
                      <div className="skel-shimmer h-2.5 w-24 rounded" />
                    </div>
                  ))}
                </div>
              ) : cards.length === 0 ? (
                <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-line dark:border-[#2a2a2e] p-6 text-center text-[13px] text-muted">Nessuna card in questa board.</div>
              ) : (
                <div className="grid flex-1 min-h-0 grid-cols-1 content-start gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                  {cards.map((c) => {
                    const imported = !!c.already_imported_work_item_id;
                    const sel = selected.has(c.trello_card_id);
                    const isPed = pedIds.has(c.trello_card_id);
                    const suggestsPed = isPedTitle(c.name);
                    const assignees = c.assignee_names.filter(Boolean);
                    const hasMeta = !!(c.deadline_date || assignees.length || c.unmapped_member_ids.length || c.url);
                    return (
                      <label key={c.trello_card_id} className={`flex cursor-pointer flex-col gap-2 rounded-lg border p-3 ${sel ? "border-brand-magenta bg-brand-magenta/5" : "border-line dark:border-[#2a2a2e] hover:border-brand-magenta/60"}`}>
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-[13px] font-semibold text-ink dark:text-paper line-clamp-2">{c.name}</span>
                          <Checkbox className="mt-0.5 flex-none" checked={sel} onChange={() => toggle(c.trello_card_id)} />
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {c.is_workflow ? (
                            <span className="rounded-full bg-cream dark:bg-[#1c1c20] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">{STATUS_LABEL[c.status] ?? c.status}</span>
                          ) : (
                            <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-warning">Informativa</span>
                          )}
                          {c.list_name && (
                            <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-line dark:border-[#2a2a2e] px-2 py-0.5 text-[10px] font-medium text-muted dark:text-muted-dark">
                              <Icon name="list" className="h-3 w-3 flex-none" /> <span className="truncate">{c.list_name}</span>
                            </span>
                          )}
                          {suggestsPed && (
                            <button
                              type="button"
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); togglePed(c.trello_card_id); }}
                              title={isPed ? "Importa come task PED" : 'Il titolo contiene "PED": importa come task PED'}
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide transition-colors ${isPed ? "bg-brand-magenta text-white" : "border border-dashed border-brand-magenta/60 text-brand-magenta hover:bg-brand-magenta/10"}`}
                            >
                              <Icon name="grid" className="h-3 w-3 flex-none" /> PED
                            </button>
                          )}
                          {imported && <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-bold uppercase text-success">{sel ? "Re-sync" : "Già importata"}</span>}
                        </div>
                        {hasMeta && (
                          <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted dark:text-muted-dark">
                            {c.deadline_date && <span className="inline-flex items-center gap-1"><Icon name="calendar" className="h-3 w-3 flex-none" /> {c.deadline_date}</span>}
                            {assignees.length > 0 && <span className="inline-flex min-w-0 items-center gap-1"><Icon name="users" className="h-3 w-3 flex-none" /> <span className="truncate">{assignees.join(", ")}</span></span>}
                            {c.unmapped_member_ids.length > 0 && <span className="inline-flex items-center gap-1 text-warning"><Icon name="alert-triangle" className="h-3 w-3 flex-none" /> {c.unmapped_member_ids.length} non mappati</span>}
                            {c.url && <a href={c.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-brand-magenta hover:underline"><Icon name="trello" className="h-3 w-3 flex-none" /> Trello</a>}
                          </div>
                        )}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex flex-none items-center justify-end gap-3 border-t border-line dark:border-[#2a2a2e] pt-3">
              <Button variant="ghost" onClick={onClose}>Chiudi</Button>
              <Button variant="primary" onClick={() => void doImport()} loading={importing} disabled={selected.size === 0}>
                <Icon name="download" className="h-4 w-4" /> Importa / Sincronizza {selected.size > 0 ? `(${selected.size})` : ""}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
