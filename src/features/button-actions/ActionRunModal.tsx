import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  prepareButtonActionApi,
  runButtonActionApi,
  type ActionCatalog,
  type ActionField,
  type EmailPreparePayload,
} from "../../api/buttonActions";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { Input } from "../../components/ui/Input";
import { Modal } from "../../components/ui/Modal";
import { Spinner } from "../../components/ui/Spinner";
import { Textarea } from "../../components/ui/Textarea";
import { useToast } from "../../context/ToastContext";

// Modale che precede l'esecuzione di un bottone configurato.
//
// Perché esiste: la mail al cliente non si ritira. Prima di premere si vede a
// chi va, con che oggetto e con che testo — firma compresa, perché è quella
// che il destinatario leggerà.
//
// I CAMPI sono modificabili, il CORPO no: se il testo non va bene si cambia il
// modello, non la singola mail. Così quello che parte resta prevedibile e
// uguale per tutti i siti.

interface Target {
  id: number;
  label: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  companyId: number;
  buttonKey: string;
  /** Una riga sola, oppure tutte quelle selezionate (invio multiplo). */
  targets: Target[];
  catalog: ActionCatalog | null;
  onDone: () => void;
}

type PreparedByEntity = Map<number, EmailPreparePayload | { error: string }>;

export function ActionRunModal({
  open,
  onClose,
  companyId,
  buttonKey,
  targets,
  catalog,
  onDone,
}: Props) {
  const toast = useToast();
  const multiplo = targets.length > 1;
  const primo = targets[0];

  const [values, setValues] = useState<Record<string, string>>({});
  const [prepared, setPrepared] = useState<EmailPreparePayload | null>(null);
  const [perEntity, setPerEntity] = useState<PreparedByEntity>(new Map());
  const [loading, setLoading] = useState(true);
  // Aggiornamento in corso ≠ caricamento: il primo sostituisce l'anteprima già
  // a video, il secondo la crea. Solo il secondo può mostrare uno spinner.
  const [aggiornando, setAggiornando] = useState(false);
  const [sending, setSending] = useState(false);
  // Numero di richiesta: chi torna in ritardo rispetto a una più recente viene
  // scartato, altrimenti scrivendo in fretta l'anteprima tornerebbe indietro.
  const richiesta = useRef(0);
  // Prima apertura: i campi vanno riempiti coi valori proposti dal backend.
  const inizializzato = useRef(false);
  // L'oggetto contiene segnaposto (la data dell'intervento, per esempio): finché
  // non lo si scrive a mano deve seguire i campi, non restare a quello di prima.
  const oggettoToccato = useRef(false);

  const bottone = useMemo(
    () => catalog?.buttons.find((b) => b.key === buttonKey) ?? null,
    [catalog, buttonKey],
  );
  const azione = useMemo(() => {
    if (!catalog || !prepared) return null;
    return catalog.actions.find((a) => a.action_type === prepared.action_type) ?? null;
  }, [catalog, prepared]);

  // Campi del bottone (data, note) + campi dell'azione (destinatario, oggetto).
  const campi: ActionField[] = useMemo(
    () => [...(bottone?.run_fields ?? []), ...(azione?.run_fields ?? [])],
    [bottone, azione],
  );

  const carica = useCallback(
    async (valori: Record<string, string>, primaVolta = false) => {
      if (!primo) return;
      const mia = ++richiesta.current;
      if (primaVolta) setLoading(true);
      else setAggiornando(true);
      try {
        const dati = await prepareButtonActionApi(companyId, {
          button_key: buttonKey,
          entity_id: primo.id,
          values: valori,
        });
        // Sorpassata da una richiesta più recente: si butta.
        if (mia !== richiesta.current) return;
        setPrepared(dati);
        if (inizializzato.current && !oggettoToccato.current) {
          setValues((prev) => ({ ...prev, subject: dati.subject ?? "" }));
        }
        if (!inizializzato.current) {
          // Il backend propone la data in calendario e il destinatario in
          // anagrafica: sono i valori con cui aprire i campi.
          setValues({
            ...dati.run_values,
            to: dati.to ?? "",
            cc: dati.cc ?? "",
            subject: dati.subject ?? "",
          });
          inizializzato.current = true;
        }
      } catch (e) {
        // Solo la prima volta si protesta: se fallisce un aggiornamento mentre
        // si sta scrivendo, resta l'anteprima di prima e si riprova al tasto
        // successivo — un toast a ogni battuta sarebbe peggio del problema.
        if (primaVolta) toast.error(e instanceof Error ? e.message : "Anteprima non disponibile");
      } finally {
        if (mia === richiesta.current) {
          setLoading(false);
          setAggiornando(false);
        }
      }
    },
    [companyId, buttonKey, primo, toast],
  );

  useEffect(() => {
    if (!open) {
      inizializzato.current = false;
      oggettoToccato.current = false;
      setPrepared(null);
      setPerEntity(new Map());
      setValues({});
      return;
    }
    void carica({}, true);
  }, [open, carica]);

  // Invio multiplo: si chiede l'anteprima di ogni riga per mostrare CHI riceverà.
  useEffect(() => {
    if (!open || !multiplo) return;
    let vivo = true;
    void (async () => {
      const esiti: PreparedByEntity = new Map();
      // A gruppi: cento richieste in parallelo non aiutano nessuno.
      for (let i = 0; i < targets.length; i += 6) {
        const lotto = targets.slice(i, i + 6);
        const risposte = await Promise.all(
          lotto.map(async (t) => {
            try {
              return [t.id, await prepareButtonActionApi(companyId, {
                button_key: buttonKey,
                entity_id: t.id,
              })] as const;
            } catch (e) {
              return [t.id, { error: e instanceof Error ? e.message : "Errore" }] as const;
            }
          }),
        );
        if (!vivo) return;
        for (const [id, dati] of risposte) esiti.set(id, dati);
        setPerEntity(new Map(esiti));
      }
    })();
    return () => {
      vivo = false;
    };
  }, [open, multiplo, targets, companyId, buttonKey]);

  // L'anteprima si rigenera quando cambiano i campi che alimentano i segnaposto
  // (la data, le note): il corpo deve mostrare il testo vero, non quello di prima.
  const timer = useRef<number | null>(null);
  const cambiaCampo = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (key === "subject") oggettoToccato.current = true;
    if (!key.includes(".")) return; // to/cc/subject non toccano il corpo
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const prossimi = { ...values, [key]: value };
      // Oggetto non toccato: non lo si rimanda indietro, così il backend lo
      // ricalcola dal modello con la data nuova.
      if (!oggettoToccato.current) delete prossimi.subject;
      void carica(prossimi);
    }, 250);
  };

  // Perché una riga verrà saltata: manca il destinatario, oppure manca la data
  // e non ce n'è una in calendario da cui ripiegare. La data digitata in alto
  // vale per tutte, quindi copre il secondo caso senza rifare le anteprime.
  const motivoSalto = useCallback(
    (id: number): string => {
      const p = perEntity.get(id);
      if (!p) return "";
      if ("error" in p) return p.error;
      if (!p.to) return "nessuna email";
      const campoData = bottone?.run_fields.find((f) => f.type === "date" && f.required);
      if (campoData) {
        const scelta = (values[campoData.key] ?? "").trim();
        const propria = (p.run_values?.[campoData.key] ?? "").trim();
        if (!scelta && !propria) return "nessuna data";
      }
      return "";
    },
    [perEntity, bottone, values],
  );

  const destinatariMancanti = useMemo(() => {
    if (!multiplo) return [];
    return targets.filter((t) => perEntity.has(t.id) && motivoSalto(t.id) !== "");
  }, [multiplo, targets, perEntity, motivoSalto]);

  const handleRun = async () => {
    setSending(true);
    try {
      const risposta = await runButtonActionApi(companyId, {
        button_key: buttonKey,
        entity_id: multiplo ? undefined : primo?.id,
        entity_ids: multiplo ? targets.map((t) => t.id) : undefined,
        values,
      });
      const ok = risposta.results.filter((r) => r.ok).length;
      const ko = risposta.results.length - ok;
      if (ko === 0) toast.success(multiplo ? `Inviate ${ok} email.` : "Email inviata.");
      else if (ok === 0) toast.error(risposta.results[0]?.detail || "Invio non riuscito.");
      else toast.error(`Inviate ${ok} email, ${ko} non riuscite.`);
      onDone();
      if (ok > 0) onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Invio non riuscito");
    } finally {
      setSending(false);
    }
  };

  const puoInviare = multiplo
    ? targets.length > destinatariMancanti.length
    : Boolean(prepared?.can_run && (values.to ?? "").trim());

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="2xl"
      icon={<Icon name="mail" className="h-5 w-5" />}
      title={bottone?.label ?? "Esegui azione"}
      description={
        multiplo
          ? `${targets.length} righe selezionate: parte una email per ciascuna.`
          : primo?.label
      }
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <span className="text-[11.5px] text-muted dark:text-[#9999a0]">
            {prepared?.sender_email ? `Da: ${prepared.sender_email}` : ""}
            {prepared?.sender_origin === "aziendale" ? " (indirizzo aziendale)" : ""}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>
              Annulla
            </Button>
            <Button
              variant="primary"
              onClick={handleRun}
              loading={sending}
              disabled={!puoInviare}
              leftIcon={<Icon name="mail" className="h-3.5 w-3.5" />}
            >
              {multiplo ? `Invia ${targets.length - destinatariMancanti.length} email` : "Invia"}
            </Button>
          </div>
        </div>
      }
    >
      {loading && !prepared ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {(prepared?.warnings ?? []).map((w) => (
            <div
              key={w}
              className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-[12.5px] text-ink dark:text-[#f4f4f7]"
            >
              <Icon name="alert-triangle" className="mt-0.5 h-3.5 w-3.5 flex-none text-warning" />
              <span>{w}</span>
            </div>
          ))}

          {/* Campi compilabili: quelli del bottone e quelli dell'azione. */}
          <div className="grid gap-3 sm:grid-cols-2">
            {campi.map((f) => {
              // Nell'invio multiplo destinatario e oggetto sono per riga: li
              // decide il modello, non chi preme.
              if (multiplo && (f.key === "to" || f.key === "cc")) return null;
              const larghezza = f.type === "textarea" ? "sm:col-span-2" : "";
              return (
                <div key={f.key} className={larghezza}>
                  {f.type === "textarea" ? (
                    <Textarea
                      label={f.label}
                      rows={2}
                      value={values[f.key] ?? ""}
                      onChange={(e) => cambiaCampo(f.key, e.target.value)}
                    />
                  ) : (
                    <Input
                      label={f.label}
                      type={f.type === "date" ? "date" : "text"}
                      value={values[f.key] ?? ""}
                      hint={multiplo && f.type === "date" ? "Vuoto = la data in calendario di ogni sito" : f.help}
                      onChange={(e) => cambiaCampo(f.key, e.target.value)}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Invio multiplo: chi riceverà, prima di premere. */}
          {multiplo && (
            <div className="rounded-lg border border-line dark:border-[#2a2a2e]">
              <div className="flex items-center justify-between border-b border-line px-3 py-2 dark:border-[#2a2a2e]">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
                  Destinatari
                </span>
                {destinatariMancanti.length > 0 && (
                  <span className="text-[11.5px] text-warning">
                    {destinatariMancanti.length} saltati
                  </span>
                )}
              </div>
              <div className="max-h-52 overflow-y-auto">
                {targets.map((t) => {
                  const p = perEntity.get(t.id);
                  const motivo = motivoSalto(t.id);
                  const email = p && !("error" in p) ? p.to : "";
                  return (
                    <div
                      key={t.id}
                      className="flex items-center justify-between gap-3 border-b border-line/60 px-3 py-1.5 text-[12.5px] last:border-0 dark:border-[#2a2a2e]/60"
                    >
                      <span className="min-w-0 flex-1 truncate text-ink dark:text-[#f4f4f7]">{t.label}</span>
                      {!p ? (
                        <span className="text-muted dark:text-[#9999a0]">…</span>
                      ) : motivo ? (
                        <span className="flex-none text-warning">{motivo}</span>
                      ) : (
                        <span className="truncate text-muted dark:text-[#9999a0]">{email}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Anteprima del corpo: quello che leggerà il destinatario. */}
          {prepared && (
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
                  Anteprima {multiplo ? `(primo: ${primo?.label})` : ""}
                  {/* Puntino che pulsa: dice che l'anteprima si sta allineando,
                      senza toglierla di mezzo né spostare il testo. */}
                  <span
                    aria-hidden
                    className={`h-1.5 w-1.5 rounded-full bg-brand-magenta transition-opacity duration-200 ${
                      aggiornando ? "animate-pulse opacity-100" : "opacity-0"
                    }`}
                  />
                </span>
                {prepared.template_name && (
                  <span className="text-[11.5px] text-muted dark:text-[#9999a0]">
                    Modello: {prepared.template_name}
                  </span>
                )}
              </div>
              {/* Foglio bianco anche in tema scuro: il corpo porta colori inline
                  scritti per la carta del client di posta, su fondo scuro
                  sparirebbe. Qui non si guarda l'app, si guarda l'email. */}
              <div className="max-h-72 overflow-y-auto rounded-lg border border-line bg-white p-4 dark:border-[#2a2a2e]">
                {loading ? (
                  <div className="flex justify-center py-4">
                    <Spinner />
                  </div>
                ) : (
                  <>
                    <div
                      className="prose-email text-[13px] leading-relaxed text-[#1a1a1a]"
                      dangerouslySetInnerHTML={{ __html: prepared.body_html }}
                    />
                    {/* La firma è mostrata staccata e con l'etichetta: così si
                        vede a colpo d'occhio SE ce n'è una e di chi è, invece di
                        scoprirlo dalla copia in posta inviata. */}
                    <div className="mt-4 border-t border-dashed border-[#e2e2e6] pt-3">
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[#9999a0]">
                        Firma — aggiunta automaticamente, non rimovibile
                      </p>
                      {prepared.signature_html.trim() ? (
                        <div
                          className="prose-email text-[13px] leading-relaxed text-[#1a1a1a]"
                          dangerouslySetInnerHTML={{ __html: prepared.signature_html }}
                        />
                      ) : (
                        <p className="text-[12.5px] italic text-[#9999a0]">
                          Non hai una firma email: la mail partirà senza. La crei dal tuo profilo,
                          in «Firma email».
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>
              <p className="mt-1.5 text-[11.5px] text-muted dark:text-[#9999a0]">
                Il testo si cambia dal modello email, non da qui: così ogni cliente riceve la stessa
                comunicazione. La firma è sempre in coda e non è rimovibile.
              </p>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
