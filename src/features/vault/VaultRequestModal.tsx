import { useEffect, useState } from "react";
import {
  VAULT_KIND_LABELS,
  createVaultRequestApi,
  type VaultKind,
  type VaultRequest,
} from "../../api/vault";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Checkbox } from "../../components/ui/Checkbox";
import { DurationField } from "../../components/ui/DurationField";
import { FieldLabel } from "../../components/ui/FieldLabel";
import { Icon } from "../../components/ui/Icon";
import { Input } from "../../components/ui/Input";
import { Modal } from "../../components/ui/Modal";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import { Textarea } from "../../components/ui/Textarea";
import { useToast } from "../../context/ToastContext";

/**
 * Chiede a un esterno di inserire lui la credenziale.
 *
 * Si precompila ciò che già si sa (etichetta, URL, utente) e il destinatario
 * aggiunge solo la password, su una pagina nostra. Così la credenziale entra
 * cifrata senza passare da email o chat.
 *
 * La password del link va comunicata su un **canale diverso** da quello con cui
 * si manda il link: scriverli nello stesso messaggio non aggiunge nulla. È il
 * motivo per cui la schermata finale le mostra separate e con quell'avviso.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  companyId: number;
  /** Valorizzato = si chiede il rinnovo di una credenziale esistente. */
  itemId?: number | null;
  prefill?: { kind?: VaultKind; label?: string; username?: string; url?: string };
  onCreated: () => void;
}

const KIND_OPTIONS = (Object.keys(VAULT_KIND_LABELS) as VaultKind[]).map((k) => ({
  value: k,
  label: VAULT_KIND_LABELS[k],
}));

export function VaultRequestModal({
  open,
  onClose,
  companyId,
  itemId,
  prefill,
  onCreated,
}: Props) {
  const [kind, setKind] = useState<VaultKind>("password");
  const [label, setLabel] = useState("");
  const [username, setUsername] = useState("");
  const [url, setUrl] = useState("");
  const [destinatario, setDestinatario] = useState("");
  const [messaggio, setMessaggio] = useState("");
  const [password, setPassword] = useState("");
  const [giorni, setGiorni] = useState<number | null>(7);
  const [inviaMail, setInviaMail] = useState(false);
  const [email, setEmail] = useState("");
  const [mailConPassword, setMailConPassword] = useState(false);
  const [inCorso, setInCorso] = useState(false);
  const [creata, setCreata] = useState<VaultRequest | null>(null);
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    setKind(prefill?.kind ?? "password");
    setLabel(prefill?.label ?? "");
    setUsername(prefill?.username ?? "");
    setUrl(prefill?.url ?? "");
    setDestinatario("");
    setMessaggio("");
    setPassword("");
    setGiorni(7);
    setInviaMail(false);
    setEmail("");
    setMailConPassword(false);
    setCreata(null);
  }, [open, prefill]);

  async function crea() {
    if (!label.trim()) {
      toast.error("Serve un'etichetta: il destinatario deve capire cosa gli stai chiedendo");
      return;
    }
    if (inviaMail && !email.trim()) {
      toast.error("Serve un indirizzo a cui mandare il link");
      return;
    }
    setInCorso(true);
    try {
      const r = await createVaultRequestApi({
        company_id: companyId,
        item_id: itemId ?? null,
        kind,
        label: label.trim(),
        username: username || null,
        url: url || null,
        message: messaggio || null,
        recipient_note: destinatario || null,
        access_password: password || null,
        expires_days: giorni ?? undefined,
        send_email: inviaMail,
        recipient_email: inviaMail ? email.trim() : null,
        include_password: inviaMail && mailConPassword,
      });
      setCreata(r);
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Creazione non riuscita");
    } finally {
      setInCorso(false);
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
      title={itemId ? "Chiedi il rinnovo della credenziale" : "Richiedi una credenziale"}
      description="Il destinatario la inserisce su una pagina nostra: non passa da email né da chat."
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {creata ? "Chiudi" : "Annulla"}
          </Button>
          {!creata && (
            <Button onClick={() => void crea()} loading={inCorso}>
              Genera il link
            </Button>
          )}
        </div>
      }
    >
      {creata ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Badge variant="success">Link creato</Badge>
            <span className="text-sm text-muted dark:text-muted-dark">
              Scade il {new Date(creata.expires_at).toLocaleDateString("it-IT")} · un solo utilizzo
            </span>
          </div>

          {creata.email_inviata !== null && (
            <div
              className={`flex gap-2 rounded-lg border p-3 text-sm ${
                creata.email_inviata
                  ? "border-success/30 bg-success/10"
                  : "border-danger/30 bg-danger/10"
              }`}
            >
              <Icon
                name={creata.email_inviata ? "check-circle" : "alert-triangle"}
                className={`mt-0.5 h-4 w-4 shrink-0 ${creata.email_inviata ? "text-success" : "text-danger"}`}
              />
              <p>
                {creata.email_inviata
                  ? "Email inviata al destinatario."
                  : `Email non inviata: ${creata.email_dettaglio ?? "errore sconosciuto"}. Il link resta valido, mandalo a mano.`}
              </p>
            </div>
          )}

          <div>
            <FieldLabel>Link da inviare</FieldLabel>
            <div className="flex gap-2">
              <Input readOnly value={creata.url_pubblico ?? ""} className="font-mono text-xs" />
              <Button
                variant="secondary"
                onClick={() => void copia(creata.url_pubblico ?? "", "Link")}
              >
                <Icon name="copy" className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {creata.has_password && (
            <div>
              <FieldLabel>Password del link</FieldLabel>
              <div className="flex gap-2">
                <Input readOnly value={password} className="font-mono text-xs" />
                <Button variant="secondary" onClick={() => void copia(password, "Password")}>
                  <Icon name="copy" className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          <div className="flex gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm">
            <Icon name="alert-triangle" className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <div>
              <p className="font-semibold">Manda link e password su due canali diversi.</p>
              <p className="text-muted dark:text-muted-dark">
                Il link via email, la password per telefono o SMS. Scriverli nello stesso
                messaggio rende la password inutile: chi legge il messaggio ha già entrambi.
              </p>
            </div>
          </div>

          <p className="text-xs text-muted dark:text-muted-dark">
            La password viene mostrata solo adesso: dopo resta salvata cifrata e non si può
            rileggere. Se la perdi, revoca il link e creane un altro.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <FieldLabel>Tipo</FieldLabel>
            <SearchableSelect
              value={kind}
              onChange={(v) => setKind(v as VaultKind)}
              options={KIND_OPTIONS}
            />
          </div>
          <Input
            label="Cosa stai chiedendo"
            placeholder="Es. Accesso WordPress del sito"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />

          <Input
            label="Utente (se lo sai)"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <Input label="URL" value={url} onChange={(e) => setUrl(e.target.value)} />

          <Input
            label="A chi lo mandi"
            placeholder="Nome o email — serve al registro"
            value={destinatario}
            onChange={(e) => setDestinatario(e.target.value)}
          />
          <DurationField
            label="Il link scade fra"
            value={giorni}
            onChange={setGiorni}
            hint="Oltre il limite della policy aziendale viene rifiutato."
          />

          <div className="sm:col-span-2">
            <Input
              type="password"
              label="Password del link (consigliata)"
              autoComplete="new-password"
              placeholder="Da comunicare a voce o via SMS"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="sm:col-span-2 rounded-lg border border-line p-3 dark:border-line-dark">
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
                  name="destinatario-richiesta"
                  autoComplete="off"
                  placeholder="cliente@esempio.it"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <p className="text-xs text-muted dark:text-muted-dark">
                  Parte dal modello aziendale «Cassaforte — richiesta credenziali»,
                  modificabile nelle impostazioni dell'azienda.
                </p>
                {password && (
                  <>
                    <button
                      type="button"
                      onClick={() => setMailConPassword((v) => !v)}
                      className="inline-flex items-start gap-2 text-left text-[13px] text-ink dark:text-[#f4f4f7]"
                    >
                      <span className="mt-0.5">
                        <Checkbox checked={mailConPassword} onChange={setMailConPassword} />
                      </span>
                      Includi anche la password del link
                    </button>
                    {mailConPassword && (
                      <p className="text-xs text-warning">
                        Con link e password nello stesso messaggio la password non
                        protegge più niente: chi legge l'email ha già entrambi.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          <div className="sm:col-span-2">
            <Textarea
              label="Messaggio per il destinatario"
              rows={2}
              placeholder="Ciao, inserisci qui la password del tuo pannello. Grazie!"
              value={messaggio}
              onChange={(e) => setMessaggio(e.target.value)}
            />
          </div>
        </div>
      )}
    </Modal>
  );
}
