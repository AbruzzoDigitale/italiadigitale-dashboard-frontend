import { useCallback, useEffect, useMemo, useState } from "react";

import {
  getStripeSdiInvoiceApi,
  getStripeSdiSummaryApi,
  listStripeSdiInvoicesApi,
  reprocessStripeSdiApi,
  sendStripeSdiApi,
  STRIPE_SDI_STATI,
  type StripeSdiInvoice,
  type StripeSdiInvoiceDetail,
  type StripeSdiStatus,
  type StripeSdiSummary,
} from "../../api/stripeSdi";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";
import { SegmentedSwitch } from "../ui/SegmentedSwitch";
import { Spinner } from "../ui/Spinner";
import "./fic-reconcile.css";

// ─────────────────────────────────────────────────────────────────────────────
// Scheda "Abbonamenti Stripe" della pagina Fatturazione.
//
// Ogni riga è un incasso di un abbonamento e racconta dove è arrivato: fattura
// trasmessa allo SDI, bozza ferma in attesa di una correzione, o errore. Da qui
// non si emette nulla a mano: si sblocca ciò che si è fermato.
// ─────────────────────────────────────────────────────────────────────────────

type Filtro = "tutte" | "da_sistemare" | "inviate";

// Gli stati che richiedono un intervento: è la vista che si guarda ogni giorno.
const STATI_DA_SISTEMARE: StripeSdiStatus[] = [
  "cliente_non_trovato",
  "bozza_creata",
  "scartata_sdi",
  "errore",
];

function quando(iso: string | null): string {
  if (!iso) return "—";
  // Le date arrivano già in Europe/Rome: un middleware del backend converte
  // ogni ISO 8601 UTC nelle risposte. Qui non si riconverte.
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function importo(valore: string | null, valuta: string | null): string {
  if (valore === null) return "—";
  const numero = Number(valore);
  if (Number.isNaN(numero)) return "—";
  return numero.toLocaleString("it-IT", { style: "currency", currency: valuta || "EUR" });
}

export function StripeSdiPanel() {
  const [righe, setRighe] = useState<StripeSdiInvoice[]>([]);
  const [riepilogo, setRiepilogo] = useState<StripeSdiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);

  const [filtro, setFiltro] = useState<Filtro>("tutte");
  const [cerca, setCerca] = useState("");

  const [aperta, setAperta] = useState<StripeSdiInvoiceDetail | null>(null);
  const [caricandoDettaglio, setCaricandoDettaglio] = useState(false);
  const [azioneInCorso, setAzioneInCorso] = useState<"reprocess" | "send" | null>(null);
  const [erroreAzione, setErroreAzione] = useState<string | null>(null);

  const carica = useCallback(async () => {
    setLoading(true);
    setErrore(null);
    try {
      const [lista, sommario] = await Promise.all([
        listStripeSdiInvoicesApi({ per_page: 200 }),
        getStripeSdiSummaryApi(),
      ]);
      setRighe(lista.items);
      setRiepilogo(sommario);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Errore imprevisto");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void carica();
  }, [carica]);

  const daSistemare = useMemo(
    () => righe.filter((r) => STATI_DA_SISTEMARE.includes(r.status)).length,
    [righe],
  );

  const filtrate = useMemo(() => {
    const testo = cerca.trim().toLowerCase();
    return righe.filter((r) => {
      if (filtro === "inviate" && r.status !== "inviata_sdi") return false;
      if (filtro === "da_sistemare" && !STATI_DA_SISTEMARE.includes(r.status)) return false;
      if (!testo) return true;
      return [
        r.customer_name,
        r.customer_email,
        r.client_name,
        r.stripe_payment_intent_id,
        r.stripe_invoice_id,
        r.fic_number,
      ]
        .filter(Boolean)
        .some((campo) => `${campo}`.toLowerCase().includes(testo));
    });
  }, [righe, filtro, cerca]);

  const apri = useCallback(async (riga: StripeSdiInvoice) => {
    setCaricandoDettaglio(true);
    setErroreAzione(null);
    try {
      setAperta(await getStripeSdiInvoiceApi(riga.id));
    } catch (e) {
      setErroreAzione(e instanceof Error ? e.message : "Errore imprevisto");
    } finally {
      setCaricandoDettaglio(false);
    }
  }, []);

  const esegui = useCallback(
    async (azione: "reprocess" | "send") => {
      if (!aperta) return;
      setAzioneInCorso(azione);
      setErroreAzione(null);
      try {
        const aggiornata =
          azione === "reprocess"
            ? await reprocessStripeSdiApi(aperta.id)
            : await sendStripeSdiApi(aperta.id);
        setAperta(aggiornata);
        await carica();
      } catch (e) {
        setErroreAzione(e instanceof Error ? e.message : "Errore imprevisto");
      } finally {
        setAzioneInCorso(null);
      }
    },
    [aperta, carica],
  );

  return (
    <div className="fr-panel animate-fadeIn">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="fr-hint">
          Ogni pagamento incassato da Stripe diventa una fattura elettronica su Fatture in Cloud.
          Parte da sola verso lo SDI solo se l'anagrafica del cliente è completa e l'XML supera la
          verifica: tutto il resto resta qui, in bozza, in attesa di una correzione.
        </p>
        <div className="flex items-center gap-3">
          <SegmentedSwitch
            value={filtro}
            onChange={(v) => setFiltro(v as Filtro)}
            ariaLabel="Filtra per esito"
            options={[
              { value: "tutte", label: <>Tutte</> },
              {
                value: "da_sistemare",
                label: <>Da sistemare{daSistemare ? ` (${daSistemare})` : ""}</>,
                title: "Incassi che non sono arrivati allo SDI",
              },
              { value: "inviate", label: <>Inviate</> },
            ]}
          />
          <button
            type="button"
            onClick={() => void carica()}
            title="Ricarica"
            aria-label="Ricarica"
            className="inline-grid h-9 w-9 place-items-center rounded-md border border-line text-ink transition-colors hover:bg-cream dark:border-[#2a2a2e] dark:text-[#f4f4f7] dark:hover:bg-[#1c1c20]"
          >
            <Icon name="refresh-cw" className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {riepilogo && (
        <div className="flex flex-wrap items-center gap-2 font-body text-[12.5px]">
          <span className="rounded-md bg-success/10 px-3 py-1.5 text-success">
            Trasmesso allo SDI:{" "}
            <strong>{importo(riepilogo.totale_fatturato, riepilogo.valuta)}</strong>
          </span>
          {Number(riepilogo.totale_bloccato) > 0 && (
            <span className="rounded-md bg-warning/10 px-3 py-1.5 text-warning">
              Fermo in attesa: <strong>{importo(riepilogo.totale_bloccato, riepilogo.valuta)}</strong>
            </span>
          )}
        </div>
      )}

      <div className="max-w-md">
        <div className="relative">
          <Icon
            name="search"
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
          />
          <Input
            value={cerca}
            onChange={(e) => setCerca(e.target.value)}
            placeholder="Cerca per cliente, email, pi_… o numero fattura"
            className="pl-9"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : errore ? (
          <div className="rounded-md border border-danger/30 bg-danger/5 px-4 py-6 text-sm text-danger">
            {errore}
          </div>
        ) : filtrate.length === 0 ? (
          <div className="rounded-md border border-dashed border-line px-4 py-10 text-center text-sm text-muted dark:border-[#2a2a2e] dark:text-[#9999a0]">
            {righe.length === 0
              ? "Nessun pagamento Stripe ancora ricevuto. Appena arriva il primo rinnovo, compare qui."
              : "Nessun pagamento corrisponde ai filtri."}
          </div>
        ) : (
          <table className="w-full min-w-[980px] table-fixed border-separate border-spacing-y-2">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
                <th className="w-[14%] px-3 py-1">Incasso</th>
                <th className="w-[22%] px-3 py-1">Cliente</th>
                <th className="w-[11%] px-3 py-1 text-right">Importo</th>
                <th className="w-[19%] px-3 py-1">Transazione</th>
                <th className="w-[16%] px-3 py-1">Fattura</th>
                <th className="w-[18%] px-3 py-1 text-right">Esito</th>
              </tr>
            </thead>
            <tbody>
              {filtrate.map((r) => {
                const stato = STRIPE_SDI_STATI[r.status] ?? {
                  label: r.status,
                  variant: "default" as const,
                };
                return (
                  <tr
                    key={r.id}
                    onClick={() => void apri(r)}
                    className="sp-pop-in cursor-pointer bg-cream align-middle transition-colors hover:bg-paper dark:bg-[#1c1c20] dark:hover:bg-[#131316]"
                    title="Apri il dettaglio dell'incasso"
                  >
                    <td className="rounded-l-md px-3 py-3 text-[12.5px] text-muted dark:text-[#9999a0]">
                      {quando(r.paid_at ?? r.created_at)}
                    </td>
                    <td className="px-3 py-3 text-[13px] font-semibold text-ink dark:text-[#f4f4f7]">
                      <span className="block truncate">{r.client_name || r.customer_name || "—"}</span>
                      <span className="block truncate text-[11.5px] font-normal text-muted dark:text-[#9999a0]">
                        {r.customer_email || "—"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right text-[13px] font-semibold text-ink dark:text-[#f4f4f7]">
                      {importo(r.amount_total, r.currency)}
                    </td>
                    <td className="px-3 py-3 font-mono text-[11.5px] text-muted dark:text-[#9999a0]">
                      <span className="block truncate" title={r.stripe_payment_intent_id ?? ""}>
                        {r.stripe_payment_intent_id || "—"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-[12.5px] text-ink dark:text-[#f4f4f7]">
                      <span className="block truncate">{r.fic_number || "—"}</span>
                      {r.ei_status && (
                        <span className="block truncate text-[11.5px] text-muted dark:text-[#9999a0]">
                          SDI: {r.ei_status}
                        </span>
                      )}
                    </td>
                    <td className="rounded-r-md px-3 py-3 text-right">
                      <Badge variant={stato.variant}>{stato.label}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        open={!!aperta || caricandoDettaglio}
        onClose={() => {
          setAperta(null);
          setErroreAzione(null);
        }}
        title={aperta ? aperta.client_name || aperta.customer_name || "Incasso Stripe" : "Dettaglio"}
        titleBadge={
          aperta ? (
            <Badge
              variant={(STRIPE_SDI_STATI[aperta.status] ?? { variant: "default" as const }).variant}
            >
              {(STRIPE_SDI_STATI[aperta.status] ?? { label: aperta.status }).label}
            </Badge>
          ) : undefined
        }
        icon={<Icon name="credit-card" className="h-5 w-5" />}
        size="lg"
      >
        {caricandoDettaglio || !aperta ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : (
          <div className="flex flex-col gap-4 font-body text-[13px]">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
              <Voce etichetta="Incassato il" valore={quando(aperta.paid_at ?? aperta.created_at)} />
              <Voce etichetta="Importo" valore={importo(aperta.amount_total, aperta.currency)} />
              <Voce etichetta="Transazione Stripe" valore={aperta.stripe_payment_intent_id} mono />
              <Voce etichetta="Fattura Stripe" valore={aperta.stripe_invoice_id} mono />
              <Voce etichetta="Cliente" valore={aperta.client_name || aperta.customer_name} />
              <Voce etichetta="Email" valore={aperta.customer_email} />
              <Voce etichetta="Fattura FIC" valore={aperta.fic_number} />
              <Voce etichetta="Stato SDI" valore={aperta.ei_status} />
              <Voce etichetta="Tentativi" valore={`${aperta.attempts}`} />
              <Voce etichetta="Trasmessa il" valore={quando(aperta.sent_at)} />
            </dl>

            {aperta.blocking_reasons && aperta.blocking_reasons.length > 0 && (
              <div className="rounded-md border border-warning/30 bg-warning/5 px-4 py-3">
                <p className="mb-1.5 font-semibold text-warning">Perché non è partita allo SDI</p>
                <ul className="list-disc pl-5 text-ink dark:text-[#f4f4f7]">
                  {aperta.blocking_reasons.map((motivo, i) => (
                    <li key={i}>{motivo}</li>
                  ))}
                </ul>
              </div>
            )}

            {aperta.error_message && (
              <div className="rounded-md border border-danger/30 bg-danger/5 px-4 py-3 text-danger">
                {aperta.error_message}
              </div>
            )}

            {erroreAzione && (
              <div className="rounded-md border border-danger/30 bg-danger/5 px-4 py-3 text-danger">
                {erroreAzione}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4 dark:border-[#2a2a2e]">
              {!aperta.fic_document_id && aperta.status !== "inviata_sdi" && (
                <Button
                  variant="secondary"
                  loading={azioneInCorso === "reprocess"}
                  onClick={() => void esegui("reprocess")}
                  leftIcon={<Icon name="refresh-cw" className="h-4 w-4" />}
                >
                  Rielabora
                </Button>
              )}
              {aperta.fic_document_id && aperta.status !== "inviata_sdi" && (
                <Button
                  variant="primary"
                  loading={azioneInCorso === "send"}
                  onClick={() => void esegui("send")}
                  leftIcon={<Icon name="check-circle" className="h-4 w-4" />}
                >
                  Invia allo SDI
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Voce({
  etichetta,
  valore,
  mono = false,
}: {
  etichetta: string;
  valore: string | null | undefined;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
        {etichetta}
      </dt>
      <dd
        className={`mt-0.5 break-all text-ink dark:text-[#f4f4f7] ${mono ? "font-mono text-[12px]" : ""}`}
      >
        {valore || "—"}
      </dd>
    </div>
  );
}
