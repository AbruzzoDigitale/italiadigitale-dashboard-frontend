import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Modal } from "../../components/ui/Modal";
import { Icon } from "../../components/ui/Icon";
import { Spinner } from "../../components/ui/Spinner";
import { OracleChat } from "../oracle/OracleChat";
import { useSearch } from "./useSearch";
import { BottoneMicrofono } from "../voce/BottoneMicrofono";
import { useDettatura } from "../voce/useDettatura";

/**
 * Cerca qualsiasi cosa nel gestionale, e se non basta chiedi all'Oracolo.
 *
 * Due modalità nello stesso pannello, e l'ordine conta: si apre in ricerca, perché è
 * la cosa che si fa cento volte al giorno e costa zero. L'Oracolo è la riga in fondo,
 * per quando la domanda non è "trovami X" ma "come sta andando X" — più lenta e più
 * costosa, quindi scelta apposta e non per inerzia.
 *
 * La tastiera funziona per intero: frecce per scorrere, Invio per aprire, Esc per
 * chiudere. Chi usa un palette lo usa senza staccare le mani.
 */

interface Voce {
  chiave: string;
  etichetta: string;
  sottotitolo: string;
  gruppo: string;
  vaiA: string | null;
}

function vociDaGruppo(tipo: string, records: Record<string, unknown>[], etichetta: string): Voce[] {
  return records.map((r, i) => {
    const base = { chiave: `${tipo}-${r.id ?? i}`, gruppo: etichetta };
    switch (tipo) {
      case "task":
        return {
          ...base,
          etichetta: String(r.titolo),
          sottotitolo: [r.cliente, r.stato, r.data].filter(Boolean).join(" · "),
          vaiA: `/work-items?task=${r.task_id}`,
        };
      case "cliente":
        return {
          ...base,
          etichetta: String(r.nome),
          sottotitolo: [r.citta, r.azienda].filter(Boolean).join(" · "),
          vaiA: `/clients/${r.cliente_id}`,
        };
      case "contratto":
        return {
          ...base,
          etichetta: String(r.titolo),
          sottotitolo: [r.cliente, r.fase_commerciale].filter(Boolean).join(" · "),
          vaiA: `/contracts-pipeline?contract=${r.contratto_id}`,
        };
      case "sito":
        return {
          ...base,
          etichetta: String(r.nome),
          sottotitolo: [r.cliente, r.stato].filter(Boolean).join(" · "),
          vaiA: `/siti-web?sito=${r.sito_id}`,
        };
      case "persona":
        return {
          ...base,
          etichetta: String(r.nome),
          sottotitolo: [r.livello, (r.aree as string[])?.join(", ")].filter(Boolean).join(" · "),
          vaiA: null,
        };
      case "documento":
        return {
          ...base,
          etichetta: String(r.titolo),
          sottotitolo: String(r.estratto).slice(0, 80),
          vaiA: null,
        };
      default:
        return { ...base, etichetta: String(r.id), sottotitolo: "", vaiA: null };
    }
  });
}

export function CommandPalette({
  open,
  onClose,
  puoUsareOracolo,
  conversationId,
  onConversationId,
}: {
  open: boolean;
  onClose: () => void;
  puoUsareOracolo: boolean;
  conversationId: number | null;
  onConversationId: (id: number) => void;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [modo, setModo] = useState<"ricerca" | "oracolo">("ricerca");
  const [attiva, setAttiva] = useState(0);
  const campo = useRef<HTMLInputElement>(null);
  const { gruppi, inCorso } = useSearch(modo === "ricerca" ? query : "");
  // Nella ricerca la dettatura sostituisce il testo invece di accodarlo: si detta
  // cosa si cerca, non un discorso.
  const dettatura = useDettatura((testo) => setQuery(testo));

  useEffect(() => {
    if (!open) return;
    setModo("ricerca");
    setQuery("");
    setAttiva(0);
    // Il focus dopo il montaggio del dialogo, non durante.
    const t = setTimeout(() => campo.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [open]);

  const voci = useMemo(
    () => gruppi.flatMap((g) => vociDaGruppo(g.tipo, g.records, g.etichetta)),
    [gruppi]
  );

  useEffect(() => setAttiva(0), [voci.length]);

  const chiediAllOracolo = () => {
    setModo("oracolo");
  };

  const apri = (voce: Voce) => {
    if (!voce.vaiA) return;
    onClose();
    navigate(voce.vaiA);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (modo !== "ricerca") return;
    const totale = voci.length + (puoUsareOracolo && query.trim().length >= 2 ? 1 : 0);
    if (!totale) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAttiva((i) => (i + 1) % totale);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAttiva((i) => (i - 1 + totale) % totale);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (attiva >= voci.length) chiediAllOracolo();
      else apri(voci[attiva]);
    }
  };

  let indice = -1;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={modo === "oracolo" ? "Oracolo" : "Cerca"}
      icon={<Icon name={modo === "oracolo" ? "robot" : "search"} className="w-[18px] h-[18px]" />}
      size="lg"
      bodyClassName="h-[60vh] flex flex-col min-h-0"
    >
      {modo === "oracolo" ? (
        <div className="flex flex-col h-full min-h-0">
            <OracleChat
            conversationId={conversationId}
            onConversationId={onConversationId}
            domandaIniziale={query.trim() || undefined}
            compact
            autoFocus
          />
          <button
            type="button"
            onClick={() => {
              onClose();
              navigate(conversationId ? `/oracolo?c=${conversationId}` : "/oracolo");
            }}
            className="shrink-0 pt-2 text-left text-[11px] text-muted dark:text-[#9999a0]
                       hover:text-brand-magenta transition-colors"
          >
            Apri nella pagina dell'Oracolo →
          </button>
        </div>
      ) : (
        <div className="flex flex-col h-full min-h-0">
          <div className="flex items-center gap-2 pb-2 border-b border-line dark:border-[#2a2a2e]">
            <Icon name="search" className="w-4 h-4 text-muted shrink-0" />
            <input
              ref={campo}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Cerca lavorazioni, clienti, contratti, siti, persone…"
              className="flex-1 bg-transparent text-[14px] text-ink dark:text-[#f4f4f7]
                         placeholder:text-muted focus:outline-none"
            />
            {inCorso ? <Spinner size="sm" /> : null}
            <BottoneMicrofono
              supportata={dettatura.supportata}
              inAscolto={dettatura.inAscolto}
              onAvvia={dettatura.avvia}
              onFerma={dettatura.ferma}
            />
          </div>

          <div className="flex-1 overflow-y-auto pt-2 min-h-0">
            {query.trim().length < 2 ? (
              <p className="py-8 text-center text-[12px] text-muted dark:text-[#9999a0]">
                Scrivi almeno due lettere.
              </p>
            ) : null}

            {gruppi.map((g) => (
              <div key={g.tipo} className="mb-3">
                <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
                  {g.etichetta}
                  {g.totale > g.records.length ? ` · ${g.records.length} di ${g.totale}` : ""}
                </div>
                {vociDaGruppo(g.tipo, g.records, g.etichetta).map((v) => {
                  indice += 1;
                  const selezionata = indice === attiva;
                  return (
                    <button
                      key={v.chiave}
                      type="button"
                      onClick={() => apri(v)}
                      onMouseEnter={() => setAttiva(voci.findIndex((x) => x.chiave === v.chiave))}
                      className={`w-full text-left rounded-md px-2 py-1.5 flex items-baseline gap-2 ${
                        selezionata ? "bg-cream dark:bg-[#2a2a2e]" : ""
                      } ${v.vaiA ? "cursor-pointer" : "cursor-default"}`}
                    >
                      <span className="text-[13px] text-ink dark:text-[#f4f4f7] truncate">
                        {v.etichetta}
                      </span>
                      {v.sottotitolo ? (
                        <span className="text-[11px] text-muted dark:text-[#9999a0] truncate">
                          {v.sottotitolo}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))}

            {!inCorso && query.trim().length >= 2 && !gruppi.length ? (
              <p className="py-6 text-center text-[12px] text-muted dark:text-[#9999a0]">
                Nessun risultato per «{query.trim()}».
              </p>
            ) : null}

            {puoUsareOracolo && query.trim().length >= 2 ? (
              <button
                type="button"
                onClick={chiediAllOracolo}
                onMouseEnter={() => setAttiva(voci.length)}
                className={`w-full text-left rounded-md px-2 py-2 flex items-center gap-2 border-t
                            border-line dark:border-[#2a2a2e] mt-1 ${
                              attiva >= voci.length ? "bg-cream dark:bg-[#2a2a2e]" : ""
                            }`}
              >
                <Icon name="robot" className="w-4 h-4 text-brand-magenta shrink-0" />
                <span className="text-[13px] text-ink dark:text-[#f4f4f7] truncate">
                  Chiedi all'Oracolo: «{query.trim()}»
                </span>
              </button>
            ) : null}
          </div>
        </div>
      )}
    </Modal>
  );
}
