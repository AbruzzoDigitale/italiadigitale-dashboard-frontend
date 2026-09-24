import { useCallback, useEffect, useState } from "react";
import {
  createVaultShareApi,
  listVaultSharesApi,
  revokeVaultShareApi,
  type VaultItem,
  type VaultShare,
} from "../../api/vault";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Checkbox } from "../../components/ui/Checkbox";
import { DurationField } from "../../components/ui/DurationField";
import { FieldLabel } from "../../components/ui/FieldLabel";
import { Icon } from "../../components/ui/Icon";
import { Input } from "../../components/ui/Input";
import { Modal } from "../../components/ui/Modal";
import { Skeleton } from "../../components/ui/Skeleton";
import { useToast } from "../../context/ToastContext";

/**
 * Consegna una credenziale a chi non ha un account sul gestionale.
 *
 * È l'opposto di `VaultRequestModal`, e va trattato con più riguardo: quel link
 * può solo raccogliere una password, questo la **consegna**. Chi ha l'URL e la
 * password ha la credenziale.
 *
 * Per questo la password non si sceglie e non si può disattivare: la genera il
 * server con 77 bit di entropia e la si vede una volta sola. Va detta su un
 * canale diverso da quello del link — scriverli nello stesso messaggio annulla
 * il senso di averla.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  /** Una o più credenziali: finiscono tutte sullo stesso link, con una password sola. */
  items: VaultItem[];
}

const ETICHETTA_STATO: Record<VaultShare["status"], { testo: string; variante: "success" | "default" | "danger" }> = {
  active: { testo: "attivo", variante: "success" },
  expired: { testo: "scaduto", variante: "default" },
  exhausted: { testo: "esaurito", variante: "default" },
  revoked: { testo: "revocato", variante: "danger" },
};

export function VaultShareModal({ open, onClose, items }: Props) {
  const [giorni, setGiorni] = useState<number | null>(7);
  const [aperture, setAperture] = useState("3");
  const [destinatario, setDestinatario] = useState("");
  const [inviaMail, setInviaMail] = useState(false);
  const [email, setEmail] = useState("");
  const [mailConPassword, setMailConPassword] = useState(false);
  const [inCorso, setInCorso] = useState(false);
  const [creato, setCreato] = useState<VaultShare | null>(null);
  const [esistenti, setEsistenti] = useState<VaultShare[] | null>(null);
  const toast = useToast();

  // I link già emessi si mostrano solo quando si parte da una credenziale sola:
  // con dieci selezionate sarebbe un elenco lungo e di nessun aiuto.
  const unica = items.length === 1 ? items[0] : null;
  const caricaEsistenti = useCallback(async () => {
    if (!unica) {
      setEsistenti([]);
      return;
    }
    try {
      setEsistenti(await listVaultSharesApi(unica.id));
    } catch {
      setEsistenti([]);
    }
  }, [unica]);

  useEffect(() => {
    if (!open) return;
    setGiorni(7);
    setAperture("3");
    setDestinatario("");
    setInviaMail(false);
    setEmail("");
    setMailConPassword(false);
    setCreato(null);
    setEsistenti(null);
    void caricaEsistenti();
  }, [open, caricaEsistenti]);

  async function crea() {
    if (items.length === 0) return;
    if (inviaMail && !email.trim()) {
      toast.error("Serve un indirizzo a cui mandare il link");
      return;
    }
    setInCorso(true);
    try {
      const s = await createVaultShareApi({
        item_ids: items.map((i) => i.id),
        expires_days: giorni ?? undefined,
        max_views: aperture.trim() ? Number(aperture) : null,
        recipient_note: destinatario || email || null,
        send_email: inviaMail,
        recipient_email: inviaMail ? email.trim() : null,
        include_password: inviaMail && mailConPassword,
      });
      setCreato(s);
      void caricaEsistenti();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Creazione del link non riuscita");
    } finally {
      setInCorso(false);
    }
  }

  async function revoca(s: VaultShare) {
    if (!confirm("Revocare questo link? Smetterà di funzionare subito.")) return;
    try {
      await revokeVaultShareApi(s.id);
      toast.success("Link revocato");
      void caricaEsistenti();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Revoca non riuscita");
    }
  }

  async function copia(testo: string, cosa: string) {
    await navigator.clipboard.writeText(testo);
    toast.success(`${cosa} copiato negli appunti`);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        items.length === 1
          ? "Condividi la credenziale"
          : `Condividi ${items.length} credenziali`
      }
      description={
        items.length === 1
          ? `«${items[0].label}» verrà consegnata su una pagina protetta da password.`
          : "Finiranno tutte sulla stessa pagina, con una sola password."
      }
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {creato ? "Chiudi" : "Annulla"}
          </Button>
          {!creato && (
            <Button onClick={() => void crea()} loading={inCorso}>
              Genera il link
            </Button>
          )}
        </div>
      }
    >
      {creato ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Badge variant="success">Link creato</Badge>
            <span className="text-sm text-muted dark:text-muted-dark">
              {creato.item_labels.length} {creato.item_labels.length === 1 ? "credenziale" : "credenziali"}
              {" · "}scade il {new Date(creato.expires_at).toLocaleDateString("it-IT")}
              {creato.max_views != null && ` · ${creato.max_views} aperture`}
            </span>
          </div>

          {creato.email_inviata !== null && (
            <div
              className={`flex gap-2 rounded-lg border p-3 text-sm ${
                creato.email_inviata
                  ? "border-success/30 bg-success/10"
                  : "border-danger/30 bg-danger/10"
              }`}
            >
              <Icon
                name={creato.email_inviata ? "check-circle" : "alert-triangle"}
                className={`mt-0.5 h-4 w-4 shrink-0 ${
                  creato.email_inviata ? "text-success" : "text-danger"
                }`}
              />
              <p>
                {creato.email_inviata
                  ? "Email inviata. Ora comunica la password su un altro canale."
                  : `Email non inviata: ${creato.email_dettaglio ?? "errore sconosciuto"}. Il link resta valido, mandalo a mano.`}
              </p>
            </div>
          )}

          <div>
            <FieldLabel>Link da inviare</FieldLabel>
            <div className="flex gap-2">
              <Input readOnly value={creato.url_pubblico ?? ""} className="font-mono text-xs" />
              <Button
                variant="secondary"
                onClick={() => void copia(creato.url_pubblico ?? "", "Link")}
              >
                <Icon name="copy" className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div>
            <FieldLabel>Password del link</FieldLabel>
            <div className="flex gap-2">
              <Input
                readOnly
                value={creato.password ?? ""}
                className="font-mono text-base tracking-wider"
              />
              <Button
                variant="secondary"
                onClick={() => void copia(creato.password ?? "", "Password")}
              >
                <Icon name="copy" className="h-4 w-4" />
              </Button>
            </div>
            <p className="mt-1 text-xs text-muted dark:text-muted-dark">
              Generata adesso e non più rileggibile: in archivio ne resta solo l'impronta.
              È fatta per essere dettata al telefono.
            </p>
          </div>

          <div className="flex gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm">
            <Icon name="alert-triangle" className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <div>
              <p className="font-semibold">Link e password su due canali diversi.</p>
              <p className="text-muted dark:text-muted-dark">
                Il link via email, la password a voce o per SMS. Nello stesso messaggio
                la password non protegge niente: chi legge il messaggio ha già entrambi.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <DurationField
              label="Il link scade fra"
              value={giorni}
              onChange={setGiorni}
              hint="Oltre il limite della policy aziendale viene rifiutato."
            />
            <Input
              type="number"
              min={1}
              max={50}
              label="Aperture consentite"
              value={aperture}
              onChange={(e) => setAperture(e.target.value)}
              hint="Dopo l'ultima il link si chiude da solo."
            />
            <div className="sm:col-span-2">
              <Input
                label="A chi lo mandi"
                placeholder="Nome o email — resta nel registro accessi"
                value={destinatario}
                onChange={(e) => setDestinatario(e.target.value)}
              />
            </div>
          </div>

          <div className="rounded-lg border border-line p-3 dark:border-line-dark">
            <button
              type="button"
              onClick={() => setInviaMail((v) => !v)}
              className="inline-flex items-center gap-2 text-[13px] text-ink dark:text-[#f4f4f7]"
            >
              <Checkbox checked={inviaMail} onChange={setInviaMail} />
              Manda il link per email
            </button>

            {inviaMail && (
              <div className="mt-3 flex flex-col gap-2">
                <Input
                  type="email"
                  label="Indirizzo"
                  name="destinatario-link"
                  autoComplete="off"
                  placeholder="cliente@esempio.it"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <p className="text-xs text-muted dark:text-muted-dark">
                  Parte dal modello aziendale «Cassaforte — consegna credenziali»,
                  modificabile nelle impostazioni dell'azienda.
                </p>

                <button
                  type="button"
                  onClick={() => setMailConPassword((v) => !v)}
                  className="inline-flex items-start gap-2 text-left text-[13px] text-ink dark:text-[#f4f4f7]"
                >
                  <span className="mt-0.5">
                    <Checkbox checked={mailConPassword} onChange={setMailConPassword} />
                  </span>
                  Includi anche la password nell'email
                </button>

                {mailConPassword ? (
                  <div className="flex gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs">
                    <Icon name="alert-triangle" className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                    <p>
                      Con link e password nello stesso messaggio, la password non
                      protegge più niente: chi legge l'email ha già entrambi. Ha senso
                      solo se ti fidi della casella del destinatario più che del canale
                      con cui gli parleresti. L'email lo avvisa di cancellarla.
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-muted dark:text-muted-dark">
                    L'email contiene <strong>solo il link</strong>: la password resta a
                    te da comunicare altrove, ed è il motivo per cui protegge qualcosa.
                  </p>
                )}
              </div>
            )}
          </div>

          <div>
            <FieldLabel>Link già emessi per questa credenziale</FieldLabel>
            {esistenti === null ? (
              <Skeleton className="h-10 w-full" />
            ) : esistenti.length === 0 ? (
              <p className="text-sm text-muted dark:text-muted-dark">
                Nessuno finora.
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {esistenti.map((s) => {
                  const stato = ETICHETTA_STATO[s.status];
                  return (
                    <div
                      key={s.id}
                      className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm dark:border-line-dark"
                    >
                      <Badge variant={stato.variante}>{stato.testo}</Badge>
                      <span className="truncate">
                        {s.recipient_note || "destinatario non annotato"}
                      </span>
                      <span className="ml-auto shrink-0 text-xs text-muted dark:text-muted-dark">
                        {s.view_count} aperture · scade il{" "}
                        {new Date(s.expires_at).toLocaleDateString("it-IT")}
                      </span>
                      {s.status === "active" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Revoca"
                          aria-label="Revoca il link"
                          onClick={() => void revoca(s)}
                        >
                          <Icon name="x" className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
