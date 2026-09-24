import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { OracleChat } from "../features/oracle/OracleChat";
import {
  deleteOracleConversationApi,
  listOracleConversationsApi,
  type OracleConversation,
} from "../api/oracle";

/**
 * La pagina dell'Oracolo: conversazioni a sinistra, chat a destra.
 *
 * La conversazione aperta sta nella query string (`?c=12`) e non nello stato locale,
 * così il link è condivisibile e il tasto indietro del browser funziona — ed è anche
 * come il dialogo ⌘K passa qui la conversazione appena iniziata.
 */
export function OraclePage() {
  const [params, setParams] = useSearchParams();
  const [conversazioni, setConversazioni] = useState<OracleConversation[]>([]);
  const idAperto = params.get("c") ? Number(params.get("c")) : null;

  const ricarica = useCallback(() => {
    listOracleConversationsApi()
      .then(setConversazioni)
      .catch(() => setConversazioni([]));
  }, []);

  useEffect(ricarica, [ricarica]);

  const apri = (id: number | null) => {
    if (id === null) setParams({});
    else setParams({ c: String(id) });
  };

  const elimina = async (id: number) => {
    await deleteOracleConversationApi(id);
    if (idAperto === id) apri(null);
    ricarica();
  };

  return (
    <div className="flex gap-4 h-[calc(100vh-140px)] min-h-0">
      <aside className="hidden md:flex w-60 shrink-0 flex-col gap-2 min-h-0">
        <Button variant="secondary" size="sm" onClick={() => apri(null)} className="w-full">
          <Icon name="plus" className="w-3.5 h-3.5 mr-1.5" />
          Nuova conversazione
        </Button>

        <div className="flex-1 overflow-y-auto space-y-0.5 min-h-0">
          {conversazioni.map((c) => (
            <div
              key={c.id}
              className={`group flex items-center gap-1 rounded-md px-2 py-1.5 cursor-pointer text-[12px]
                ${
                  idAperto === c.id
                    ? "bg-cream dark:bg-[#2a2a2e] text-ink dark:text-[#f4f4f7]"
                    : "text-muted dark:text-[#9999a0] hover:bg-cream dark:hover:bg-[#1c1c20]"
                }`}
              onClick={() => apri(c.id)}
            >
              <span className="flex-1 truncate">{c.title || "Senza titolo"}</span>
              <button
                type="button"
                aria-label="Elimina conversazione"
                onClick={(e) => {
                  e.stopPropagation();
                  void elimina(c.id);
                }}
                className="opacity-0 group-hover:opacity-100 text-muted hover:text-danger transition-opacity"
              >
                <Icon name="trash" className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          {!conversazioni.length ? (
            <p className="px-2 py-3 text-[11px] text-muted dark:text-[#9999a0]">
              Nessuna conversazione.
            </p>
          ) : null}
        </div>
      </aside>

      <main className="flex-1 min-w-0 min-h-0">
        <OracleChat
          key={idAperto ?? "nuova"}
          conversationId={idAperto}
          onConversationId={(id) => {
            apri(id);
            ricarica();
          }}
          autoFocus
        />
      </main>
    </div>
  );
}
