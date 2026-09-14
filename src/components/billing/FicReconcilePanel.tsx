import { useCallback, useEffect, useRef, useState } from "react";
import "./fic-reconcile.css";
import { Icon } from "../ui/Icon";
import { Spinner } from "../ui/Spinner";
import { Checkbox } from "../ui/Checkbox";
import { SearchableSelect } from "../ui/SearchableSelect";
import { useToast } from "../../context/ToastContext";
import {
  listPaymentAccountsApi,
  uploadReconciliationApi,
  confirmRunApi,
  refreshRunApi,
  retryRunApi,
  archiveRunApi,
  listRunsApi,
  getRunApi,
  assignMovementApi,
  unassignLineApi,
  ignoreMovementApi,
  restoreMovementApi,
  type PaymentAccount,
  type ReconcileRun,
  type ReconcileLine,
  type ReconcileMovement,
  type ReconcileTipo,
} from "../../api/ficReconcile";

// ─────────────────────────────────────────────────────────────────────────────
// Pannello admin di riconciliazione con Fatture in Cloud.
//   Incassi   → carichi l'estratto conto (entrate), il tool abbina i bonifici
//               ricevuti alle fatture emesse non saldate e ne registra l'incasso.
//   Pagamenti → carichi l'export dei movimenti bancari (uscite), il tool li
//               abbina alle spese non saldate e ne registra il pagamento.
// Flusso: carica file (anteprima) → controlli la tabella → "Conferma e registra".
// ─────────────────────────────────────────────────────────────────────────────

const beuro = (n: number | null) =>
  n == null ? "—" : n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

// Data ISO "YYYY-MM-DD" → "gg/mm/aaaa" (parsing manuale per evitare shift di fuso).
const dataIt = (s: string | null) => {
  if (!s) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
};

// Tono di colore della riga: certo (verde), incerto (giallo), nessun pagamento
// (rosso), più registrato/errore per lo stato post-conferma.
type Tone = "certo" | "incerto" | "nessuno" | "ok" | "err";

const TONE_META: Record<Tone, { label: string; cls: string }> = {
  certo: { label: "Certo", cls: "certo" },
  incerto: { label: "Incerto", cls: "incerto" },
  nessuno: { label: "Nessun pagamento", cls: "nessuno" },
  ok: { label: "Registrato", cls: "ok" },
  err: { label: "Errore", cls: "err" },
};

/** True se la riga è informativa: documento già saldato su FIC prima del caricamento. */
const isGiaSaldata = (l: ReconcileLine) => Boolean((l.raw_json as { gia_saldata_fuori?: boolean } | null)?.gia_saldata_fuori);

function lineTone(l: ReconcileLine): Tone {
  if (l.esito === "ok") return "ok";
  if (l.esito === "errore") return "err";
  if (l.confidenza) return l.confidenza;
  return l.esito === "da_registrare" ? "incerto" : "nessuno";
}

// Sezioni per stato: le gialle (da verificare) in evidenza come coda di lavoro; le
// verdi pronte da registrare; il riepilogo delle riconciliate; in fondo, separate,
// le non pagate NON ancora scadute e le SCADUTE da sollecitare.
type Bucket = "verificare" | "certi" | "riconciliate" | "senza" | "scadute";

/** True se la fattura è oltre la scadenza (ritardo positivo). */
const isScaduta = (l: ReconcileLine) => (l.giorni_ritardo ?? 0) > 0;

function bucketOf(l: ReconcileLine): Bucket {
  if (l.esito === "ok") return "riconciliate";
  if (l.esito === "da_registrare") return l.confidenza === "certo" ? "certi" : "verificare";
  if (l.esito === "errore") return "verificare"; // registrazione fallita → richiede attenzione
  // skip / nessun pagamento: separo le scadute (da sollecitare) dalle non ancora scadute.
  return isScaduta(l) ? "scadute" : "senza";
}

const SECTIONS: { key: Bucket; title: string; hint: string; tone: Tone; defaultOpen: boolean }[] = [
  { key: "verificare", title: "Da verificare", hint: "Dubbie: controlla e conferma manualmente", tone: "incerto", defaultOpen: true },
  { key: "certi", title: "Certe — pronte da registrare", hint: "Abbinamento sicuro", tone: "certo", defaultOpen: true },
  { key: "riconciliate", title: "Riconciliate", hint: "Registrate ora, oppure già saldate su FIC prima di questo caricamento", tone: "ok", defaultOpen: false },
  { key: "senza", title: "Senza pagamento — non scadute", hint: "Nessun bonifico attribuibile, ma non ancora scadute", tone: "nessuno", defaultOpen: false },
  { key: "scadute", title: "Scadute — da sollecitare", hint: "Oltre la scadenza e non pagate, ordinate per ritardo", tone: "nessuno", defaultOpen: false },
];

const TIPO_INFO: Record<ReconcileTipo, { title: string; hint: string; fileHint: string }> = {
  incassi: {
    title: "Registra incassi",
    hint: "Abbina i bonifici in entrata dell'estratto conto alle fatture emesse non saldate su FIC e ne registra l'incasso (con la data del bonifico).",
    fileHint: "Excel estratto conto (entrate)",
  },
  pagamenti: {
    title: "Registra pagamenti spese",
    hint: "Abbina i movimenti in uscita dell'estratto conto alle spese non saldate su FIC e ne registra il pagamento.",
    fileHint: "Excel movimenti bancari (uscite)",
  },
};

function ToneBadge({ tone }: { tone: Tone }) {
  const m = TONE_META[tone];
  return <span className={"fr-badge fr-badge-" + m.cls}>{m.label}</span>;
}

// Forme giuridiche e parole vuote: senza toglierle "S.R.L." farebbe combaciare
// qualsiasi azienda con qualsiasi altra (stessa logica del backend).
const STOPWORD_NOME = new Set([
  "srl", "srls", "spa", "snc", "sas", "sapa", "scarl", "scrl", "sc", "ss", "soc",
  "societa", "responsabilita", "limitata", "semplificata", "cooperativa", "coop",
  "consorzio", "impresa", "ditta", "di", "c", "e", "the", "and", "in", "il", "la", "lo",
]);

const tokenNome = (s: string | null): string[] =>
  (s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOPWORD_NOME.has(t));

/** True se due nomi (cliente/fornitore e pagante del movimento) sono la stessa controparte. */
function stessaControparte(a: string | null, b: string | null): boolean {
  const ta = tokenNome(a);
  const tb = tokenNome(b);
  if (!ta.length || !tb.length) return false;
  return ta[0] === tb[0] || ta.some((t) => tb.includes(t));
}

/** Data del documento su FIC: quando la riga è abbinata `data_movimento` diventa
 *  la data del pagamento, quindi si preferisce il campo dedicato. */
const docDate = (l: ReconcileLine) => l.data_documento ?? l.data_movimento;

const MESI_IT = [
  "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
  "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
];

/** Tutte le forme in cui si può scrivere una data cercandola: "30/06/2026",
 *  "30-06-2026", "2026-06-30", "06/2026", "giugno 2026", "giugno". */
function chiaviData(iso: string | null): string {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  if (!m) return "";
  const [, anno, mese, giorno] = m;
  const nome = MESI_IT[Number(mese) - 1] ?? "";
  return [
    `${giorno}/${mese}/${anno}`,
    `${giorno}-${mese}-${anno}`,
    `${giorno}.${mese}.${anno}`,
    `${anno}-${mese}-${giorno}`,
    `${mese}/${anno}`,
    `${nome} ${anno}`,
  ].join(" ");
}

/** True se la riga è registrabile su FIC (abbinata a un bonifico). */
const isRegistrabile = (l: ReconcileLine) => l.esito === "da_registrare";

/** True se la riga si può selezionare: registrabile, oppure ancora aperta e quindi
 *  da ricontrollare su FIC (le "senza pagamento" si aggiornano, non si registrano). */
const isSelectable = (l: ReconcileLine) => l.esito !== "ok" && l.fic_document_id != null;

function LinesTable({
  lines,
  selectable,
  selected,
  onToggle,
  onToggleAll,
  onUnassign,
  onRefreshLine,
  refreshingLine,
}: {
  lines: ReconcileLine[];
  selectable: boolean;
  selected: Set<number>;
  onToggle: (id: number) => void;
  onToggleAll: (checked: boolean, ids: number[]) => void;
  onUnassign?: (lineId: number) => void;
  /** Aggiorna da FIC la singola fattura (stato + eventuale riabbinamento). */
  onRefreshLine?: (lineId: number) => void;
  refreshingLine?: number | null;
}) {
  const [openCausali, setOpenCausali] = useState<Set<number>>(new Set());
  const toggleCausale = (id: number) =>
    setOpenCausali((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  if (!lines.length) return <div className="fr-empty">Nessuna riga nel file.</div>;
  const selIds = lines.filter(isSelectable).map((l) => l.id);
  const allChecked = selectable && selIds.length > 0 && selIds.every((id) => selected.has(id));
  return (
    <div className="fr-table-wrap">
      <table className="fr-table">
        <thead>
          <tr>
            {selectable ? (
              <th className="fr-check-col">
                <Checkbox checked={allChecked} onChange={(c) => onToggleAll(c, selIds)} />
              </th>
            ) : null}
            <th>Doc.</th>
            <th>Beneficiario / Descrizione</th>
            <th className="ta-r">Importo (FIC)</th>
            <th>Data</th>
            <th>Esito</th>
            <th>Dettaglio</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => {
            const tone = lineTone(l);
            const canSelect = selectable && isSelectable(l);
            return (
              <tr key={l.id} className={"fr-row-" + tone}>
                {selectable ? (
                  <td className="fr-check-col">
                    {canSelect ? (
                      <Checkbox checked={selected.has(l.id)} onChange={() => onToggle(l.id)} />
                    ) : null}
                  </td>
                ) : null}
                {/* Le spese non hanno numero su FIC: al suo posto la data del
                    documento, che è ciò che le distingue (canone giugno/luglio). */}
                <td className="mono">
                  {l.numero_fattura != null ? (
                    "#" + l.numero_fattura
                  ) : l.numero_fornitore ? (
                    <span
                      className="fr-doc-data"
                      title={`Numero della fattura del fornitore · documento del ${dataIt(docDate(l))}`}
                    >
                      n.{l.numero_fornitore}
                    </span>
                  ) : (
                    <span className="fr-doc-data" title="Data del documento su FIC (nessun numero)">
                      {dataIt(docDate(l))}
                    </span>
                  )}
                </td>
                <td className="fr-desc">
                  {l.beneficiario || "—"}
                  {l.descrizione && l.beneficiario ? (
                    <span className="fr-doc-descr">{l.descrizione}</span>
                  ) : null}
                </td>
                <td className="ta-r mono">{beuro(l.importo)}</td>
                <td className="mono">
                  {dataIt(l.data_movimento)}
                  {l.scadenza ? (
                    <span className="fr-scad">
                      scad. {dataIt(l.scadenza)}
                      {(l.giorni_ritardo ?? 0) > 0 ? (
                        <b className="fr-scaduta"> · scaduta {l.giorni_ritardo}gg</b>
                      ) : null}
                    </span>
                  ) : null}
                </td>
                <td>
                  {isGiaSaldata(l) ? (
                    <span className="fr-badge fr-badge-ok" title="Saldata su FIC prima di questo caricamento">
                      Già saldata
                    </span>
                  ) : (
                    <ToneBadge tone={tone} />
                  )}
                  {l.is_acconto ? <span className="fr-badge fr-badge-acconto">Acconto</span> : null}
                  {l.match_reason ? <span className="fr-reason">{l.match_reason}</span> : null}
                </td>
                <td className="fr-msg">
                  {l.errore || l.messaggio || "—"}
                  {typeof l.raw_json?.causale === "string" && l.raw_json.causale ? (
                    <button
                      type="button"
                      className={"fr-causale" + (openCausali.has(l.id) ? " is-open" : "")}
                      onClick={() => toggleCausale(l.id)}
                      title={openCausali.has(l.id) ? "Comprimi" : "Clicca per vedere la causale intera"}
                    >
                      <Icon
                        name={openCausali.has(l.id) ? "chevron-down" : "chevron-right"}
                        className="h-3 w-3 fr-causale-caret"
                      />
                      Causale: {l.raw_json.causale}
                    </button>
                  ) : null}
                </td>
                <td>
                  {l.fic_document_url ? (
                    <a className="fr-link" href={l.fic_document_url} target="_blank" rel="noreferrer">
                      <Icon name="document-text" className="h-[13px] w-[13px]" /> FIC
                    </a>
                  ) : null}
                  {onRefreshLine && l.fic_document_id ? (
                    <button
                      type="button"
                      className="fr-refresh-line"
                      disabled={refreshingLine != null}
                      onClick={() => onRefreshLine(l.id)}
                      title="Ricontrolla questa fattura su FIC: se l'hai già saldata a mano esce dalla coda, altrimenti riprova l'abbinamento"
                    >
                      {refreshingLine === l.id ? (
                        <Spinner size="sm" />
                      ) : (
                        <Icon name="refresh-cw" className="h-3 w-3" />
                      )}{" "}
                      Aggiorna
                    </button>
                  ) : null}
                  {onUnassign && l.esito === "da_registrare" ? (
                    <button
                      type="button"
                      className="fr-unassign"
                      onClick={() => onUnassign(l.id)}
                      title="Annulla l'abbinamento: il bonifico torna disponibile"
                    >
                      <Icon name="x" className="h-3 w-3" /> Annulla
                    </button>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Sezione dei bonifici non abbinati: assegnazione manuale a una fattura + ignora. */
function MovementsSection({
  run,
  busy,
  onAssign,
  onIgnore,
  onRestore,
}: {
  run: ReconcileRun;
  busy: boolean;
  onAssign: (movementId: number, lineId: number) => void;
  onIgnore: (movementId: number) => void;
  onRestore: (movementId: number) => void;
}) {
  const [showIgnored, setShowIgnored] = useState(false);
  const [mostraTutti, setMostraTutti] = useState(false);
  const [q, setQ] = useState("");
  const movements = run.movements ?? [];
  if (!movements.length) return null;

  const tuttiLiberi = movements.filter((m) => m.stato === "libero");
  const ignorati = movements.filter((m) => m.stato === "ignorato");
  if (!tuttiLiberi.length && !ignorati.length) return null;

  // Fatture assegnabili: quelle con documento FIC non ancora registrate.
  const candidates = (run.lines ?? []).filter((l) => l.fic_document_id != null && l.esito !== "ok");

  // Un estratto conto contiene tutto: POS, carte, abbonamenti, giroconti. Quasi
  // sempre riguardano documenti già saldati (o mai registrati) su FIC, quindi
  // elencarli tutti seppellisce i pochi che servono. Mostro per primi quelli che
  // POTREBBERO pagare una delle righe ancora aperte: stesso importo o stessa
  // controparte, in un periodo compatibile.
  const plausibile = (m: ReconcileMovement) =>
    // Se la causale cita il numero di un documento già saldato, il movimento è
    // chiuso: proporlo per l'abbinamento sarebbe una contraddizione.
    !m.nota_certa &&
    candidates.some((l) => {
      const rif = l.data_movimento ?? l.scadenza;
      if (rif && m.data) {
        const giorni = (Date.parse(m.data) - Date.parse(rif)) / 86_400_000;
        if (giorni < -10 || giorni > 120) return false;
      }
      const imp = l.importo_dovuto ?? l.importo;
      if (imp != null && m.importo != null && Math.abs(m.importo - imp) < 0.02) return true;
      return stessaControparte(l.beneficiario, m.pagante);
    });

  const rilevanti = tuttiLiberi.filter(plausibile);
  const cerca = q.trim().toLowerCase();
  const base = mostraTutti ? tuttiLiberi : rilevanti;
  const liberi = cerca
    ? base.filter((m) =>
        `${m.pagante ?? ""} ${m.causale ?? ""} ${m.importo ?? ""} ${chiaviData(m.data)}`
          .toLowerCase()
          .includes(cerca),
      )
    : base;
  // Titolo a sinistra, importo dovuto a destra. Le SPESE su FIC non hanno numero:
  // senza data e descrizione due canoni di locazione dello stesso fornitore e
  // dello stesso importo sarebbero indistinguibili nel menu.
  const optTitle = (l: ReconcileLine) => {
    // Numero (nostro o del fornitore) + SEMPRE la data del documento: con clienti
    // che fatturano lo stesso importo ogni mese è la data a distinguerli.
    const numero =
      l.numero_fattura != null ? `#${l.numero_fattura}` : l.numero_fornitore ? `n.${l.numero_fornitore}` : null;
    const testa = numero ? `${numero} · ${dataIt(docDate(l))}` : dataIt(docDate(l));
    const desc = (l.descrizione ?? "").trim();
    return `${testa} · ${l.beneficiario ?? "—"}${desc ? ` — ${desc.slice(0, 70)}` : ""}`;
  };
  const optAmount = (l: ReconcileLine) => beuro(l.importo_dovuto ?? l.importo);

  const MovRow = ({ m }: { m: ReconcileMovement }) => (
    <tr>
      <td className="ta-r mono">{beuro(m.importo)}</td>
      <td className="mono">{dataIt(m.data)}</td>
      <td className="fr-desc">
        {m.pagante || "—"}
        {/* Numeri citati in causale: è il riferimento con cui riconosci la fattura. */}
        {(m.riferimenti?.length ?? 0) > 0 || m.nfatture.length > 0 ? (
          <span className="fr-mov-rif" title="Numeri fattura citati nella causale">
            cita {(m.riferimenti?.length ? m.riferimenti : m.nfatture.map(String)).map((r) => "n." + r).join(" · ")}
          </span>
        ) : null}
        {/* Spiega perché è ancora qui: quasi sempre il documento è già saldato. */}
        {m.nota ? (
          <span className={"fr-mov-nota" + (m.nota_certa ? "" : " is-probabile")}>{m.nota}</span>
        ) : null}
        {m.causale ? <span className="fr-mov-causale">{m.causale}</span> : null}
      </td>
      <td>
        {m.stato === "libero" ? (
          <div className="fr-mov-actions">
            <SearchableSelect
              className="fr-mov-ss"
              value=""
              onChange={(v) => {
                const lid = Number(v);
                if (lid) onAssign(m.id, lid);
              }}
              options={candidates.map((l) => ({
                value: String(l.id),
                label: optTitle(l),
                trailing: optAmount(l),
                keywords: [
                  l.numero_fattura ?? "",
                  l.numero_fornitore ?? "",
                  l.beneficiario ?? "",
                  l.descrizione ?? "",
                  chiaviData(docDate(l)),
                  chiaviData(l.scadenza),
                  l.importo ?? "",
                ].join(" "),
              }))}
              placeholder={candidates.length ? "Assegna a fattura…" : "Nessuna fattura aperta"}
              searchPlaceholder="Cerca fattura…"
              emptyMessage="Nessuna fattura"
              disabled={busy || !candidates.length}
              menuLayer="portal"
              menuMinWidth={560}
              showAvatar={false}
            />
            <button type="button" className="fr-mov-ignore" disabled={busy} onClick={() => onIgnore(m.id)}>
              Ignora
            </button>
          </div>
        ) : (
          <button type="button" className="fr-mov-restore" disabled={busy} onClick={() => onRestore(m.id)}>
            <Icon name="refresh-cw" className="h-3 w-3" /> Ripristina
          </button>
        )}
      </td>
    </tr>
  );

  return (
    <div className="fr-section fr-mov">
      <div className="fr-mov-head">
        <Icon name="credit-card" className="h-3.5 w-3.5" />
        <span className="fr-section-title">Movimenti da abbinare</span>
        <span className="fr-section-count fr-section-count-incerto">{rilevanti.length}</span>
        <span className="fr-section-hint">
          {mostraTutti
            ? `Tutti i ${tuttiLiberi.length} movimenti del file, anche quelli che non c'entrano con le righe aperte`
            : "Solo quelli compatibili con una riga ancora aperta (importo o controparte, in un periodo plausibile)"}
        </span>
        <div className="fr-mov-tools">
          <input
            className="fr-mov-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cerca importo, data, controparte, causale…"
          />
          <button type="button" className="fr-hi-toggle" onClick={() => setMostraTutti((v) => !v)}>
            {mostraTutti ? `Solo compatibili (${rilevanti.length})` : `Mostra tutti (${tuttiLiberi.length})`}
          </button>
        </div>
      </div>
      {liberi.length ? (
        <div className="fr-table-wrap">
          <table className="fr-table">
            <thead>
              <tr>
                <th className="ta-r">Importo</th>
                <th>Data</th>
                <th>Pagante / Causale</th>
                <th>Azione</th>
              </tr>
            </thead>
            <tbody>{liberi.map((m) => <MovRow key={m.id} m={m} />)}</tbody>
          </table>
        </div>
      ) : (
        <div className="fr-empty">
          {cerca
            ? "Nessun movimento corrisponde alla ricerca."
            : mostraTutti
              ? "Tutti i movimenti sono stati abbinati o ignorati."
              : `Nessun movimento compatibile con le righe ancora aperte. Gli altri ${tuttiLiberi.length} riguardano documenti già saldati su FIC o non registrati: aprili con «Mostra tutti» se ti servono.`}
        </div>
      )}

      {ignorati.length ? (
        <div className="fr-mov-ignored">
          <button type="button" className="fr-mov-ignored-head" onClick={() => setShowIgnored((v) => !v)}>
            <Icon name={showIgnored ? "chevron-down" : "chevron-right"} className="h-3 w-3" />
            Ignorati ({ignorati.length})
          </button>
          {showIgnored ? (
            <div className="fr-table-wrap">
              <table className="fr-table">
                <tbody>{ignorati.map((m) => <MovRow key={m.id} m={m} />)}</tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function TipoTool({ tipo }: { tipo: ReconcileTipo }) {
  const toast = useToast();
  const info = TIPO_INFO[tipo];

  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [accountsErr, setAccountsErr] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [run, setRun] = useState<ReconcileRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<ReconcileRun[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  // Riga in aggiornamento: mostra lo spinner solo su quella, non su tutto il pannello.
  const [refreshingLine, setRefreshingLine] = useState<number | null>(null);
  // Storico: vista "archiviati" e voce in uscita (per l'animazione).
  const [showArchived, setShowArchived] = useState(false);
  const [exitingRun, setExitingRun] = useState<number | null>(null);
  const [historyErr, setHistoryErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Quando cambia il run in anteprima, preseleziona di default solo le righe
  // "certe" (verdi): le incerte le decide l'utente.
  useEffect(() => {
    if (run?.state === "anteprima") {
      const def = (run.lines ?? [])
        .filter((l) => l.esito === "da_registrare" && l.confidenza === "certo")
        .map((l) => l.id);
      setSelected(new Set(def));
    } else {
      setSelected(new Set());
    }
  }, [run]);

  const pickFile = (f: File | null | undefined) => {
    if (!f) return;
    const ok = /\.(xlsx|xls)$/i.test(f.name);
    if (!ok) {
      toast.error("Formato non valido: carica un file Excel (.xlsx / .xls).");
      return;
    }
    setFile(f);
  };

  const loadHistory = useCallback(async () => {
    try {
      const { runs } = await listRunsApi(tipo, showArchived);
      setHistory(runs);
      setHistoryErr(null);
    } catch (e) {
      // Lo storico non blocca il lavoro, ma un elenco vuoto per un errore del
      // server sembra "non ho più niente": va detto, non nascosto.
      setHistory([]);
      setHistoryErr((e as Error).message);
    }
  }, [tipo, showArchived]);

  /**
   * Archivia (o ripristina) un caricamento dello storico. Non cancella nulla: il
   * run resta con le sue righe, esce solo dall'elenco. La riga sfila via e viene
   * tolta in locale, senza ricaricare tutto lo storico.
   */
  const onArchiveRun = async (h: ReconcileRun, archived: boolean) => {
    setExitingRun(h.id);
    try {
      await archiveRunApi(h.id, archived);
      window.setTimeout(() => {
        setHistory((prev) => prev.filter((r) => r.id !== h.id));
        setExitingRun(null);
      }, 320);
      toast.success(
        archived
          ? `"${h.file_name ?? `Run #${h.id}`}" archiviato — lo trovi in "Mostra archiviati".`
          : `"${h.file_name ?? `Run #${h.id}`}" di nuovo tra i caricamenti recenti.`,
      );
    } catch (e) {
      setExitingRun(null);
      toast.error((e as Error).message);
    }
  };

  useEffect(() => {
    let alive = true;
    listPaymentAccountsApi()
      .then(({ accounts }) => {
        if (!alive) return;
        setAccounts(accounts);
        // preseleziona un conto "Italia Digitale" se presente
        const pref = accounts.find((a) => a.name.toLowerCase().includes("italia digitale")) ?? accounts[0];
        setAccountId(pref?.id ?? null);
      })
      .catch((e: Error) => alive && setAccountsErr(e.message));
    void loadHistory();
    return () => {
      alive = false;
    };
  }, [loadHistory]);

  const onUpload = async () => {
    if (!file || !accountId) return;
    setBusy(true);
    try {
      const r = await uploadReconciliationApi({ tipo, file, paymentAccountId: accountId, dryRun: true });
      setRun(r);
      const matched = r.lines?.filter((l) => l.esito === "da_registrare").length ?? 0;
      toast.success(`Anteprima pronta: ${matched} righe abbinate su ${r.righe_totali}.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onConfirm = async (lineIds?: number[]) => {
    if (!run) return;
    setBusy(true);
    try {
      const r = await confirmRunApi(run.id, lineIds);
      setRun(r);
      toast.success(`Registrate ${r.righe_ok} righe su FIC${r.righe_ko ? `, ${r.righe_ko} in errore` : ""}.`);
      void loadHistory();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggleLine = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleAll = (checked: boolean, ids: number[]) =>
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (checked ? next.add(id) : next.delete(id)));
      return next;
    });

  const [collapsed, setCollapsed] = useState<Set<Bucket>>(
    () => new Set(SECTIONS.filter((s) => !s.defaultOpen).map((s) => s.key)),
  );
  const toggleSection = (key: Bucket) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  // Ricontrolla FIC senza ricaricare il file: utile dopo aver registrato o
  // incassato qualcosa a mano su Fatture in Cloud. Senza `lineIds` guarda tutto
  // il run (e porta dentro le fatture nuove); con `lineIds` solo quelle righe.
  const onRefresh = async (lineIds?: number[]) => {
    if (!run) return;
    const mirato = !!lineIds?.length;
    if (mirato && lineIds!.length === 1) setRefreshingLine(lineIds![0]);
    else setBusy(true);
    try {
      const r = await refreshRunApi(run.id, lineIds);
      setRun(r);
      const { saldate_su_fic: saldate, nuovi_abbinamenti: nuovi, nuove_fatture: nuove } = r.refresh;
      const parti = [
        saldate ? `${saldate} già saldate su FIC` : "",
        nuovi ? `${nuovi} ${nuovi === 1 ? "abbinamento" : "abbinamenti"}` : "",
        nuove ? `${nuove} fatture nuove` : "",
      ].filter(Boolean);
      const ambito = mirato ? (lineIds!.length === 1 ? "Riga aggiornata" : `${lineIds!.length} righe aggiornate`) : "Aggiornato";
      toast.success(parti.length ? `${ambito}: ${parti.join(", ")}.` : `${ambito}: nessuna novità su FIC.`);
      void loadHistory();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRefreshingLine(null);
      setBusy(false);
    }
  };

  const onRetry = async () => {
    if (!run) return;
    setBusy(true);
    try {
      const r = await retryRunApi(run.id);
      setRun(r);
      toast.success(`Ritentate le righe in errore: ora ${r.righe_ok} ok, ${r.righe_ko} in errore.`);
      void loadHistory();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const openRun = async (id: number) => {
    setBusy(true);
    try {
      setRun(await getRunApi(id));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Riconciliazione manuale (assegna / annulla / ignora / ripristina).
  const runManual = async (fn: () => Promise<ReconcileRun>, okMsg: string) => {
    if (!run) return;
    setBusy(true);
    try {
      setRun(await fn());
      toast.success(okMsg);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const onAssign = (movementId: number, lineId: number) =>
    runManual(() => assignMovementApi(run!.id, movementId, lineId), "Bonifico assegnato alla fattura");
  const onUnassign = (lineId: number) =>
    runManual(() => unassignLineApi(run!.id, lineId), "Abbinamento annullato");
  const onIgnore = (movementId: number) =>
    runManual(() => ignoreMovementApi(run!.id, movementId), "Bonifico ignorato");
  const onRestore = (movementId: number) =>
    runManual(() => restoreMovementApi(run!.id, movementId), "Bonifico ripristinato");

  const reset = () => {
    setRun(null);
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const matched = run?.lines?.filter(isRegistrabile).length ?? 0;
  const isPreview = !!run && run.state === "anteprima";
  const canConfirm = isPreview && matched > 0;
  const selectedCount = selected.size;
  // Della selezione, solo le righe abbinate sono registrabili: le altre (senza
  // pagamento) si possono comunque selezionare per aggiornarle da FIC.
  const selectedRegistrabili = run?.lines?.filter((l) => selected.has(l.id) && isRegistrabile(l)).length ?? 0;
  const canRetry = !!run && run.righe_ko > 0;

  return (
    <div className="fr-tool">
      <p className="fr-hint">{info.hint}</p>

      <div className="fr-form">
        <div className="fr-field">
          <span className="fr-label">Conto di saldo FIC</span>
          {accountsErr ? (
            <span className="fr-field-err">
              <Icon name="alert-triangle" className="h-[14px] w-[14px]" /> {accountsErr}
            </span>
          ) : (
            <SearchableSelect
              value={accountId != null ? String(accountId) : ""}
              onChange={(v) => setAccountId(Number(v) || null)}
              options={accounts.map((a) => ({ value: String(a.id), label: a.name }))}
              placeholder={accounts.length ? "Seleziona conto" : "Caricamento…"}
              searchPlaceholder="Cerca conto…"
              disabled={busy || !accounts.length}
              triggerClassName="fr-trigger"
            />
          )}
        </div>

        <div className="fr-field fr-field-grow">
          <span className="fr-label">{info.fileHint}</span>
          <input
            ref={fileRef}
            className="fr-file-hidden"
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => pickFile(e.target.files?.[0])}
            disabled={busy}
          />
          <button
            type="button"
            className={"fr-dropzone" + (drag ? " is-drag" : "") + (file ? " has-file" : "")}
            onClick={() => !busy && fileRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              if (!busy) setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              if (!busy) pickFile(e.dataTransfer.files?.[0]);
            }}
            disabled={busy}
          >
            <Icon name={file ? "document-text" : "upload"} className="h-[18px] w-[18px]" />
            {file ? (
              <>
                <span className="fr-dz-name">{file.name}</span>
                <span
                  className="fr-dz-clear"
                  aria-label="Rimuovi file"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                    if (fileRef.current) fileRef.current.value = "";
                  }}
                >
                  <Icon name="x" className="h-[14px] w-[14px]" />
                </span>
              </>
            ) : (
              <span className="fr-dz-hint">
                Trascina qui il file <b>Excel</b> o <u>clicca per sceglierlo</u>
              </span>
            )}
          </button>
        </div>

        <button className="fr-btn fr-btn-primary" onClick={() => void onUpload()} disabled={!file || !accountId || busy}>
          {busy && !run ? <Spinner size="sm" /> : <Icon name="upload" className="h-[15px] w-[15px]" />} Carica anteprima
        </button>
      </div>

      {run ? (
        <div className="fr-result">
          <div className="fr-result-head">
            <div className="fr-stats">
              <span className="fr-stat">
                <b>{run.righe_totali}</b> righe
              </span>
              <span className="fr-stat fr-stat-certo">
                <b>{run.lines?.filter((l) => l.confidenza === "certo").length ?? 0}</b> certi
              </span>
              <span className="fr-stat fr-stat-incerto">
                <b>{run.lines?.filter((l) => l.confidenza === "incerto").length ?? 0}</b> incerti
              </span>
              <span className="fr-stat fr-stat-nessuno">
                <b>{run.lines?.filter((l) => l.confidenza === "nessuno").length ?? 0}</b> senza pagamento
              </span>
              <span className="fr-stat fr-stat-ok">
                <b>{run.righe_ok}</b> registrate
              </span>
              {run.righe_ko > 0 ? (
                <span className="fr-stat fr-stat-err">
                  <b>{run.righe_ko}</b> in errore
                </span>
              ) : null}
              <span className={"fr-mode " + (run.state === "anteprima" ? "is-preview" : "is-done")}>
                {run.state === "anteprima" ? "Anteprima" : "Registrato"}
              </span>
            </div>
            <div className="fr-actions">
              <button
                className="fr-btn"
                onClick={() => void onRefresh()}
                disabled={busy}
                title="Ricontrolla su Fatture in Cloud: toglie le fatture saldate a mano, riabbina quelle ancora aperte ai bonifici liberi e aggiunge le fatture nuove"
              >
                <Icon name="refresh-cw" className="h-[15px] w-[15px]" /> Aggiorna da FIC
              </button>
              {canRetry ? (
                <button className="fr-btn" onClick={() => void onRetry()} disabled={busy}>
                  <Icon name="refresh-cw" className="h-[15px] w-[15px]" /> Ritenta falliti
                </button>
              ) : null}
              {selectedCount > 0 ? (
                <button
                  className="fr-btn"
                  onClick={() => void onRefresh([...selected])}
                  disabled={busy}
                  title="Ricontrolla su FIC solo le righe selezionate"
                >
                  <Icon name="refresh-cw" className="h-[15px] w-[15px]" /> Aggiorna selezionate ({selectedCount})
                </button>
              ) : null}
              {isPreview && selectedRegistrabili > 0 ? (
                <button
                  className="fr-btn fr-btn-confirm"
                  onClick={() => void onConfirm([...selected])}
                  disabled={busy}
                >
                  {busy ? <Spinner size="sm" /> : <Icon name="check-circle" className="h-[15px] w-[15px]" />} Conferma
                  selezionate ({selectedRegistrabili})
                </button>
              ) : null}
              {canConfirm ? (
                <button
                  className={"fr-btn " + (selectedCount > 0 ? "fr-btn-ghost" : "fr-btn-confirm")}
                  onClick={() => void onConfirm()}
                  disabled={busy}
                >
                  {busy && selectedCount === 0 ? (
                    <Spinner size="sm" />
                  ) : (
                    <Icon name="check-circle" className="h-[15px] w-[15px]" />
                  )}{" "}
                  Conferma tutte ({matched})
                </button>
              ) : null}
              <button className="fr-btn fr-btn-ghost" onClick={reset} disabled={busy}>
                <Icon name="x" className="h-[15px] w-[15px]" /> Chiudi
              </button>
            </div>
          </div>
          {SECTIONS.map((sec) => {
            const secLines = (run.lines ?? []).filter((l) => bucketOf(l) === sec.key);
            if (!secLines.length) return null;
            // Le scadute in cima le più in ritardo.
            if (sec.key === "scadute") {
              secLines.sort((a, b) => (b.giorni_ritardo ?? 0) - (a.giorni_ritardo ?? 0));
            }
            const open = !collapsed.has(sec.key);
            return (
              <div className="fr-section" key={sec.key}>
                <button type="button" className="fr-section-head" onClick={() => toggleSection(sec.key)}>
                  <Icon
                    name={open ? "chevron-down" : "chevron-right"}
                    className="h-3.5 w-3.5 fr-section-caret"
                  />
                  <i className={"fr-dot fr-dot-" + sec.tone} />
                  <span className="fr-section-title">{sec.title}</span>
                  <span className={"fr-section-count fr-section-count-" + sec.tone}>{secLines.length}</span>
                  <span className="fr-section-hint">{sec.hint}</span>
                </button>
                {open ? (
                  <LinesTable
                    lines={secLines}
                    selectable={isPreview}
                    selected={selected}
                    onToggle={toggleLine}
                    onToggleAll={toggleAll}
                    onUnassign={isPreview ? onUnassign : undefined}
                    onRefreshLine={(id) => void onRefresh([id])}
                    refreshingLine={refreshingLine}
                  />
                ) : null}
              </div>
            );
          })}
          {isPreview ? (
            <MovementsSection
              run={run}
              busy={busy}
              onAssign={onAssign}
              onIgnore={onIgnore}
              onRestore={onRestore}
            />
          ) : null}
        </div>
      ) : null}

      {historyErr ? (
        <div className="fr-history">
          <div className="fr-history-label">
            <Icon name="clock" className="h-3.5 w-3.5" /> Caricamenti recenti
          </div>
          <div className="fr-hist-err">
            <Icon name="alert-triangle" className="h-[14px] w-[14px]" />
            Storico non caricato: {historyErr}
            <button type="button" className="fr-hi-toggle" onClick={() => void loadHistory()}>
              Riprova
            </button>
          </div>
        </div>
      ) : history.length || showArchived ? (
        <div className="fr-history">
          <div className="fr-history-label">
            <Icon name={showArchived ? "archive" : "clock"} className="h-3.5 w-3.5" />
            {showArchived ? "Caricamenti archiviati" : "Caricamenti recenti"}
            <button type="button" className="fr-hi-toggle" onClick={() => setShowArchived((v) => !v)}>
              {showArchived ? "Torna ai recenti" : "Mostra archiviati"}
            </button>
          </div>
          <div className="fr-history-list">
            {history.map((h) => (
              <div key={h.id} className={"fr-history-item" + (exitingRun === h.id ? " is-exiting" : "")}>
                <button type="button" className="fr-hi-open" onClick={() => void openRun(h.id)} disabled={busy}>
                  <span className="fr-hi-file">{h.file_name ?? `Run #${h.id}`}</span>
                  <span className="fr-hi-meta">
                    {h.created_at ? new Date(h.created_at).toLocaleDateString("it-IT") : ""} · {h.righe_ok}/
                    {h.righe_totali} ok
                    {h.righe_ko ? ` · ${h.righe_ko} err` : ""}
                  </span>
                  <span className={"fr-mode " + (h.state === "anteprima" ? "is-preview" : "is-done")}>
                    {h.state === "anteprima" ? "Anteprima" : "Registrato"}
                  </span>
                </button>
                <button
                  type="button"
                  className="fr-hi-archive"
                  disabled={busy}
                  onClick={() => void onArchiveRun(h, !showArchived)}
                  title={
                    showArchived
                      ? "Rimetti questo caricamento tra i recenti"
                      : "Togli dall'elenco (resta archiviato, non viene cancellato)"
                  }
                >
                  <Icon name={showArchived ? "refresh-cw" : "archive"} className="h-3.5 w-3.5" />
                  {showArchived ? "Ripristina" : "Archivia"}
                </button>
              </div>
            ))}
            {!history.length ? <div className="fr-empty">Nessun caricamento archiviato.</div> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function FicReconcilePanel() {
  const [tipo, setTipo] = useState<ReconcileTipo>("incassi");
  return (
    <div className="fr-panel">
      <div className="fr-subtabs">
        {(["incassi", "pagamenti"] as ReconcileTipo[]).map((t) => (
          <button
            key={t}
            className={"fr-subtab" + (tipo === t ? " is-active" : "")}
            onClick={() => setTipo(t)}
          >
            <Icon name={t === "incassi" ? "download" : "upload"} className="h-[15px] w-[15px]" />
            {TIPO_INFO[t].title}
          </button>
        ))}
      </div>
      {/* remount per tipo: ricarica conti/storico e azzera lo stato */}
      <TipoTool key={tipo} tipo={tipo} />
    </div>
  );
}
