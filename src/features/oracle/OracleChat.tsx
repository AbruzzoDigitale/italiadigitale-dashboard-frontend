import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { Spinner } from "../../components/ui/Spinner";
import {
  askOracleApi,
  getOracleConversationApi,
  type OracleDone,
  type OraclePayload,
} from "../../api/oracle";
import { OracleRecords } from "./OracleRecords";

/** Un turno in pagina. `streaming` è vero solo sull'ultimo, mentre arriva. */
interface Turno {
  role: "user" | "assistant";
  testo: string;
  payloads: OraclePayload[];
  done?: OracleDone;
  streaming?: boolean;
}

interface Props {
  conversationId: number | null;
  onConversationId?: (id: number) => void;
  /** Nel dialog ⌘K lo spazio è poco: meno margini, niente intestazione. */
  compact?: boolean;
  autoFocus?: boolean;
  /** Inviata da sola all'apertura: è la domanda già scritta nella barra di ricerca. */
  domandaIniziale?: string;
}

const SUGGERIMENTI = [
  "Cosa ho in programma questa settimana?",
  "Quali task sono in ritardo?",
  "Chi è più carico in questo momento?",
  "Come sta andando il PED di questo mese?",
];

export function OracleChat({
  conversationId,
  onConversationId,
  compact,
  autoFocus,
  domandaIniziale,
}: Props) {
  const [turni, setTurni] = useState<Turno[]>([]);
  const [domanda, setDomanda] = useState("");
  const [inCorso, setInCorso] = useState(false);
  const [attivita, setAttivita] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [convId, setConvId] = useState<number | null>(conversationId);

  const fondo = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const annulla = useRef<AbortController | null>(null);

  useEffect(() => {
    setConvId(conversationId);
    if (conversationId === null) {
      setTurni([]);
      return;
    }
    let vivo = true;
    getOracleConversationApi(conversationId)
      .then((c) => {
        if (!vivo) return;
        setTurni(
          c.messages.map((m) => ({
            role: m.role,
            testo: m.content,
            payloads: m.payloads ?? [],
          }))
        );
      })
      .catch(() => setErrore("Impossibile aprire la conversazione"));
    return () => {
      vivo = false;
    };
  }, [conversationId]);

  useEffect(() => {
    fondo.current?.scrollIntoView({ behavior: "smooth" });
  }, [turni, attivita]);

  useEffect(() => {
    if (autoFocus) campo.current?.focus();
  }, [autoFocus]);

  // L'unica richiesta in volo va interrotta se il componente sparisce, altrimenti
  // lo stream continua a girare sul server con nessuno che lo legge.
  useEffect(() => () => annulla.current?.abort(), []);

  const invia = useCallback(
    async (testo: string) => {
      const pulito = testo.trim();
      if (!pulito || inCorso) return;

      setErrore(null);
      setDomanda("");
      setInCorso(true);
      setAttivita("sto pensando…");
      setTurni((t) => [
        ...t,
        { role: "user", testo: pulito, payloads: [] },
        { role: "assistant", testo: "", payloads: [], streaming: true },
      ]);

      const aggiornaUltimo = (patch: (t: Turno) => Turno) =>
        setTurni((t) => t.map((turno, i) => (i === t.length - 1 ? patch(turno) : turno)));

      const controller = new AbortController();
      annulla.current = controller;

      try {
        await askOracleApi(
          pulito,
          convId,
          {
            onConversation: (id) => {
              setConvId(id);
              onConversationId?.(id);
            },
            onToolStarted: (tool) => setAttivita(`sto consultando ${tool.replace(/_/g, " ")}…`),
            onToolResult: (_tool, payload) =>
              aggiornaUltimo((t) => ({ ...t, payloads: [...t.payloads, payload] })),
            onText: (chunk) => {
              setAttivita(null);
              aggiornaUltimo((t) => ({ ...t, testo: t.testo + chunk }));
            },
            onDone: (done) => {
              setAttivita(null);
              aggiornaUltimo((t) => ({
                ...t,
                testo: done.testo || t.testo,
                done,
                streaming: false,
              }));
            },
            onError: (messaggio) => {
              setErrore(messaggio);
              aggiornaUltimo((t) => ({ ...t, streaming: false }));
            },
          },
          controller.signal
        );
      } catch (e) {
        if ((e as Error)?.name !== "AbortError") {
          setErrore("La richiesta si è interrotta");
          aggiornaUltimo((t) => ({ ...t, streaming: false }));
        }
      } finally {
        annulla.current = null;
        setInCorso(false);
        setAttivita(null);
      }
    },
    [convId, inCorso, onConversationId]
  );

  // Parte da sola una volta sola: il ref evita che un ri-render la rimandi.
  const inizialeInviata = useRef(false);
  useEffect(() => {
    if (!domandaIniziale || inizialeInviata.current) return;
    inizialeInviata.current = true;
    void invia(domandaIniziale);
  }, [domandaIniziale, invia]);

  const vuoto = turni.length === 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className={`flex-1 min-h-0 overflow-y-auto ${compact ? "px-1" : "px-1 py-2"}`}>
        {vuoto ? (
          <div className={`${compact ? "py-6" : "py-12"} text-center`}>
            <Icon name="robot" className="w-8 h-8 mx-auto text-muted dark:text-[#9999a0]" />
            <p className="mt-3 text-[13px] text-muted dark:text-[#9999a0]">
              Chiedi qualcosa sul lavoro dell'azienda.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-1.5">
              {SUGGERIMENTI.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void invia(s)}
                  className="rounded-full border border-line dark:border-[#2a2a2e] px-3 py-1.5 text-[11px]
                             text-muted dark:text-[#9999a0] hover:border-brand-magenta hover:text-ink
                             dark:hover:text-[#f4f4f7] transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {turni.map((turno, i) =>
          turno.role === "user" ? (
            <div key={i} className="flex justify-end mb-3">
              <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-brand-magenta text-white px-3.5 py-2 text-[13px]">
                {turno.testo}
              </div>
            </div>
          ) : (
            <div key={i} className="mb-4">
              {turno.testo ? (
                <div className="text-[13px] leading-relaxed text-ink dark:text-[#f4f4f7] whitespace-pre-wrap">
                  {turno.testo}
                </div>
              ) : null}

              {turno.payloads.map((p, j) => (
                <OracleRecords key={j} payload={p} />
              ))}

              {turno.done?.citazioni_sospette?.length ? (
                <div className="mt-2 flex items-start gap-1.5 rounded-md bg-amber-50 dark:bg-amber-950/30
                                border border-amber-200 dark:border-amber-900 px-2.5 py-1.5 text-[11px]
                                text-amber-800 dark:text-amber-300">
                  <Icon name="alert-triangle" className="w-3.5 h-3.5 mt-px shrink-0" />
                  <span>
                    Questa risposta cita riferimenti che gli strumenti non hanno restituito
                    ({turno.done.citazioni_sospette.join(", ")}). Verificali prima di fidarti.
                  </span>
                </div>
              ) : null}

              {turno.done && !compact ? (
                <div className="mt-1.5 text-[10px] text-muted dark:text-[#9999a0] opacity-70">
                  {turno.done.token.input + turno.done.token.output} token
                  {turno.done.token.cache ? ` · ${turno.done.token.cache} da cache` : ""}
                  {turno.done.interrotto_da !== "end_turn"
                    ? ` · interrotta: ${turno.done.interrotto_da}`
                    : ""}
                </div>
              ) : null}
            </div>
          )
        )}

        {attivita ? (
          <div className="flex items-center gap-2 text-[12px] text-muted dark:text-[#9999a0] mb-3">
            <Spinner size="sm" />
            {attivita}
          </div>
        ) : null}

        {errore ? (
          <div className="mb-3 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-[12px] text-danger">
            {errore}
          </div>
        ) : null}

        <div ref={fondo} />
      </div>

      <div className="shrink-0 pt-2 border-t border-line dark:border-[#2a2a2e]">
        <div className="flex items-end gap-2">
          <textarea
            ref={campo}
            rows={1}
            value={domanda}
            onChange={(e) => setDomanda(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void invia(domanda);
              }
            }}
            placeholder="Chiedi all'Oracolo…"
            disabled={inCorso}
            className="flex-1 resize-none rounded-lg border border-line dark:border-[#2a2a2e]
                       bg-paper dark:bg-[#1c1c20] px-3 py-2.5 text-[13px] text-ink dark:text-[#f4f4f7]
                       placeholder:text-muted focus:outline-none focus:border-brand-magenta
                       disabled:opacity-60 max-h-32"
          />
          <Button
            variant="primary"
            size="md"
            disabled={inCorso || !domanda.trim()}
            onClick={() => void invia(domanda)}
          >
            {inCorso ? <Spinner size="sm" /> : <Icon name="chevron-right" className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
