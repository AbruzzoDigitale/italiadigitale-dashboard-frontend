import { useCallback, useEffect, useState } from "react";
import { type ClientTrelloBoard } from "../api/clients";
import { listLiveTrelloBoardsApi, listTrelloBoardsApi, type TrelloLiveBoard } from "../api/trelloBoards";

export interface UnifiedBoardOption {
  id: string;
  localId: number | null;
  trelloBoardId: string;
  name: string;
  url: string;
  isSynced: boolean;
  isLive: boolean;
}

interface UseClientTrelloBoardsResult {
  boards: ClientTrelloBoard[];
  liveBoards: TrelloLiveBoard[];
  unifiedOptions: UnifiedBoardOption[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useClientTrelloBoards(companyId: number | null, enabled = true): UseClientTrelloBoardsResult {
  const [boards, setBoards] = useState<ClientTrelloBoard[]>([]);
  const [liveBoards, setLiveBoards] = useState<TrelloLiveBoard[]>([]);
  const [unifiedOptions, setUnifiedOptions] = useState<UnifiedBoardOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBoards = useCallback(async () => {
    if (!enabled || companyId == null) {
      setBoards([]);
      setLiveBoards([]);
      setUnifiedOptions([]);
      setIsLoading(false);
      setError(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const [live, local] = await Promise.all([
        listLiveTrelloBoardsApi(companyId),
        listTrelloBoardsApi(companyId),
      ]);

      setBoards(local);
      setLiveBoards(live);

      const localByTrelloId = new Map(local.map((board) => [board.trello_board_id, board]));
      const unified: UnifiedBoardOption[] = [];

      live.forEach((liveBoard) => {
        const localBoard = localByTrelloId.get(liveBoard.id);
        unified.push({
          id: liveBoard.id,
          localId: localBoard?.id ?? null,
          trelloBoardId: liveBoard.id,
          name: liveBoard.name,
          url: liveBoard.url,
          isSynced: !!localBoard,
          isLive: true,
        });
      });

      setUnifiedOptions(unified);
    } catch (err) {
      setLiveBoards([]);
      setUnifiedOptions([]);
      setError(err instanceof Error ? err.message : "Errore sconosciuto");
    } finally {
      setIsLoading(false);
    }
  }, [companyId, enabled]);

  useEffect(() => {
    void fetchBoards();
  }, [fetchBoards]);

  return {
    boards,
    liveBoards,
    unifiedOptions,
    isLoading,
    error,
    refetch: fetchBoards,
  };
}