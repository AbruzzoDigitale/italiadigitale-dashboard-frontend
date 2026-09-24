import { useNavigate } from "react-router-dom";
import { Icon } from "../../components/ui/Icon";
import type { OraclePayload } from "../../api/oracle";

/**
 * I record restituiti dagli strumenti, disegnati come card.
 *
 * È la difesa principale contro le allucinazioni, e sta qui e non nel prompt: i dati
 * che l'utente legge arrivano dal payload dello strumento, non dal testo del modello.
 * Il modello scrive solo il raccordo. Se un giorno sbagliasse a riassumere, il numero
 * sulla card resterebbe quello vero.
 */

const CARD =
  "rounded-lg border border-line dark:border-[#2a2a2e] bg-paper dark:bg-[#1c1c20] " +
  "px-3 py-2.5 text-[12px]";

const STATO_COLORE: Record<string, string> = {
  completed: "text-emerald-600 dark:text-emerald-400",
  in_progress: "text-blue-600 dark:text-blue-400",
  review: "text-amber-600 dark:text-amber-400",
  planned: "text-muted dark:text-[#9999a0]",
  blocked: "text-danger",
  cancelled: "text-muted line-through",
};

function Riga({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <div
      className={`${CARD} ${onClick ? "cursor-pointer hover:border-brand-magenta transition-colors" : ""}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === "Enter" && onClick() : undefined}
    >
      {children}
    </div>
  );
}

export function OracleRecords({ payload }: { payload: OraclePayload }) {
  const navigate = useNavigate();
  const records = payload.records ?? [];
  if (!records.length) return null;

  const mostrati = records.length;
  const totale = payload.totale ?? mostrati;

  return (
    <div className="mt-2 space-y-1.5">
      {records.map((r, i) => {
        const key = String(r.id ?? i);

        if (payload.tipo === "task") {
          const taskId = r.task_id as number;
          return (
            <Riga key={key} onClick={() => navigate(`/work-items?task=${taskId}`)}>
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold text-ink dark:text-[#f4f4f7]">{String(r.titolo)}</span>
                <span className={`shrink-0 text-[11px] ${STATO_COLORE[String(r.stato)] ?? ""}`}>
                  {String(r.stato)}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted dark:text-[#9999a0]">
                {r.cliente ? <span>{String(r.cliente)}</span> : null}
                {r.data ? <span>{String(r.data)}</span> : null}
                {Array.isArray(r.assegnatari) && r.assegnatari.length ? (
                  <span>{(r.assegnatari as string[]).join(", ")}</span>
                ) : null}
                <span className="opacity-60">#{String(r.id)}</span>
              </div>
            </Riga>
          );
        }

        if (payload.tipo === "cliente") {
          return (
            <Riga key={key} onClick={() => navigate(`/clients/${r.cliente_id}`)}>
              <div className="font-semibold text-ink dark:text-[#f4f4f7]">{String(r.nome)}</div>
              <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted dark:text-[#9999a0]">
                {r.citta ? <span>{String(r.citta)}</span> : null}
                {r.referente ? <span>{String(r.referente)}</span> : null}
                {r.azienda ? <span className="opacity-70">{String(r.azienda)}</span> : null}
              </div>
            </Riga>
          );
        }

        if (payload.tipo === "carico") {
          const perc = Number(r.utilizzo_percento);
          return (
            <Riga key={key}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-ink dark:text-[#f4f4f7]">{String(r.nome)}</span>
                <span className="text-[11px] text-muted dark:text-[#9999a0]">
                  {String(r.ore_occupate)}h / {String(r.ore_capacita)}h · {String(r.task_assegnate)} task
                </span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-cream dark:bg-[#2a2a2e] overflow-hidden">
                <div
                  className={`h-full ${perc > 100 ? "bg-danger" : perc > 80 ? "bg-amber-500" : "bg-emerald-500"}`}
                  style={{ width: `${Math.min(perc, 100)}%` }}
                />
              </div>
              <div className="mt-0.5 text-[11px] text-muted dark:text-[#9999a0]">{perc}%</div>
            </Riga>
          );
        }

        if (payload.tipo === "persona") {
          return (
            <Riga key={key}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-ink dark:text-[#f4f4f7]">{String(r.nome)}</span>
                <span className="text-[11px] text-muted dark:text-[#9999a0]">{String(r.livello)}</span>
              </div>
              {Array.isArray(r.aree) && r.aree.length ? (
                <div className="mt-1 flex flex-wrap gap-1">
                  {(r.aree as string[]).map((a) => (
                    <span
                      key={a}
                      className="rounded px-1.5 py-0.5 text-[10px] bg-cream dark:bg-[#2a2a2e] text-muted dark:text-[#9999a0]"
                    >
                      {a}
                    </span>
                  ))}
                </div>
              ) : null}
            </Riga>
          );
        }

        if (payload.tipo === "ped") {
          return (
            <Riga key={key}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-ink dark:text-[#f4f4f7]">{String(r.cliente)}</span>
                <span className="text-[11px] text-muted dark:text-[#9999a0]">{String(r.mese)}</span>
              </div>
              <div className="mt-1 text-[11px] text-muted dark:text-[#9999a0]">
                {String(r.pubblicazioni)} pubblicazioni · {String(r.completate)} fatte ·{" "}
                <span className={Number(r.da_fare) > 0 ? "text-amber-600 dark:text-amber-400" : ""}>
                  {String(r.da_fare)} da fare
                </span>
              </div>
            </Riga>
          );
        }

        if (payload.tipo === "contratto") {
          return (
            <Riga key={key} onClick={() => navigate(`/contracts-pipeline?contract=${r.contratto_id}`)}>
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold text-ink dark:text-[#f4f4f7]">{String(r.titolo)}</span>
                <span className="shrink-0 text-[11px] text-muted dark:text-[#9999a0]">
                  {String(r.fase_commerciale)}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted dark:text-[#9999a0]">
                {r.cliente ? <span>{String(r.cliente)}</span> : null}
                {r.firmato_il ? <span>firmato {String(r.firmato_il)}</span> : null}
                {r.impegno ? <span className="opacity-70">{String(r.impegno)}</span> : null}
              </div>
            </Riga>
          );
        }

        if (payload.tipo === "fatturazione") {
          const scaduta = Boolean(r.scaduta);
          return (
            <Riga key={key}>
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold text-ink dark:text-[#f4f4f7]">{String(r.titolo)}</span>
                <span className="shrink-0 font-semibold tabular-nums text-ink dark:text-[#f4f4f7]">
                  {Number(r.importo).toLocaleString("it-IT", {
                    style: "currency",
                    currency: "EUR",
                  })}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted dark:text-[#9999a0]">
                {r.cliente ? <span>{String(r.cliente)}</span> : null}
                <span>{String(r.stato)}</span>
                {r.scadenza ? (
                  <span className={scaduta ? "text-danger font-semibold" : ""}>
                    scadenza {String(r.scadenza)}
                    {scaduta ? " — scaduta" : ""}
                  </span>
                ) : null}
              </div>
            </Riga>
          );
        }

        if (payload.tipo === "sito") {
          return (
            <Riga key={key} onClick={() => navigate(`/siti-web?sito=${r.sito_id}`)}>
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold text-ink dark:text-[#f4f4f7]">{String(r.nome)}</span>
                {r.manutenzione ? (
                  <span className="shrink-0 text-[11px] text-amber-600 dark:text-amber-400">
                    manutenzione
                  </span>
                ) : null}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted dark:text-[#9999a0]">
                {r.cliente ? <span>{String(r.cliente)}</span> : null}
                {r.stato ? <span>{String(r.stato)}</span> : null}
                {r.dominio_scade_il ? <span>dominio scade {String(r.dominio_scade_il)}</span> : null}
              </div>
            </Riga>
          );
        }

        if (payload.tipo === "documento") {
          return (
            <Riga key={key}>
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold text-ink dark:text-[#f4f4f7]">{String(r.titolo)}</span>
                <span className="shrink-0 text-[11px] text-muted dark:text-[#9999a0]">
                  {String(r.tipo)} · {String(r.campo)}
                </span>
              </div>
              {/* L'estratto è parziale per costruzione: va detto, non lasciato intendere. */}
              <p className="mt-1 text-[11px] leading-relaxed text-muted dark:text-[#9999a0] italic">
                {String(r.estratto)}
              </p>
            </Riga>
          );
        }

        return (
          <Riga key={key}>
            <pre className="whitespace-pre-wrap text-[11px]">{JSON.stringify(r, null, 1)}</pre>
          </Riga>
        );
      })}

      {totale > mostrati ? (
        <div className="flex items-center gap-1.5 text-[11px] text-muted dark:text-[#9999a0] pl-1">
          <Icon name="info" className="w-3 h-3" />
          Mostrati {mostrati} di {totale}
        </div>
      ) : null}
    </div>
  );
}
