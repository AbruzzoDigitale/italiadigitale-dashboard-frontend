import {
  VAULT_KIND_LABELS,
  VAULT_TARGET_LABELS,
  type VaultItem,
} from "../../api/vault";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { FieldLabel } from "../../components/ui/FieldLabel";
import { Icon } from "../../components/ui/Icon";
import { Modal } from "../../components/ui/Modal";

/**
 * Tutto quello che si sa di una credenziale, senza aprire la modifica.
 *
 * Serve a chi la credenziale può solo vederla — dalla modifica è escluso — e a
 * chi vuole leggere una nota o l'host senza rischiare di salvare per sbaglio.
 * Per questo è in sola lettura: le uniche azioni sono quelle che ci sono già
 * sulla riga.
 *
 * Il segreto non compare nemmeno qui finché non lo si chiede: la rivelazione è
 * una chiamata a parte e finisce nel registro accessi, che è il punto.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  item: VaultItem | null;
  scoperto?: string;
  onMostra: (i: VaultItem) => void;
  onCopia: (i: VaultItem) => void;
  onCondividi: (i: VaultItem) => void;
  onEdit?: (i: VaultItem) => void;
}

function Campo({ etichetta, valore }: { etichetta: string; valore: React.ReactNode }) {
  if (valore === null || valore === undefined || valore === "") return null;
  return (
    <div className="min-w-0">
      <FieldLabel>{etichetta}</FieldLabel>
      <p className="break-words text-sm">{valore}</p>
    </div>
  );
}

function data(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function rinnovo(item: VaultItem): string {
  if (item.rotation_days === 0) return "Non scade mai";
  const ogni = item.rotation_days ? `ogni ${item.rotation_days} giorni` : "secondo la policy aziendale";
  const prossimo = data(item.next_rotation_at);
  return prossimo ? `${ogni} · prossimo il ${prossimo}` : ogni;
}

export function VaultDetailModal({
  open,
  onClose,
  item,
  scoperto,
  onMostra,
  onCopia,
  onCondividi,
  onEdit,
}: Props) {
  if (!item) return null;

  const href = item.url
    ? /^https?:\/\//i.test(item.url)
      ? item.url
      : `https://${item.url}`
    : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={item.label}
      description={VAULT_KIND_LABELS[item.kind] ?? item.kind}
      size="lg"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Chiudi
          </Button>
          {item.has_secret && (
            <>
              <Button variant="secondary" onClick={() => onCopia(item)}>
                <Icon name="copy" className="mr-1 h-4 w-4" />
                Copia
              </Button>
              <Button variant="secondary" onClick={() => onMostra(item)}>
                <Icon name="eye" className="mr-1 h-4 w-4" />
                Mostra
              </Button>
            </>
          )}
          {item.can_manage && (
            <Button variant="secondary" onClick={() => onCondividi(item)}>
              <Icon name="link" className="mr-1 h-4 w-4" />
              Condividi
            </Button>
          )}
          {item.can_manage && onEdit && (
            <Button onClick={() => onEdit(item)}>
              <Icon name="pencil" className="mr-1 h-4 w-4" />
              Modifica
            </Button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {item.rotation_due && <Badge variant="warning">da rinnovare</Badge>}
          {item.has_secret && <Badge variant="success">password</Badge>}
          {item.has_totp && <Badge variant="info">seed TOTP</Badge>}
          {item.has_private_key && <Badge variant="info">chiave privata</Badge>}
          {!item.can_manage && <Badge>sola lettura</Badge>}
        </div>

        {scoperto !== undefined && (
          <div>
            <FieldLabel>Password</FieldLabel>
            <code className="block break-all rounded bg-muted/10 px-2 py-1 text-sm">
              {scoperto || "(vuota)"}
            </code>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etichetta="Utente" valore={item.username} />
          <Campo etichetta="Email" valore={item.email} />
          <Campo
            etichetta="Indirizzo"
            valore={
              href && (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand hover:underline"
                >
                  {item.url}
                </a>
              )
            }
          />
          <Campo etichetta="Host" valore={item.host} />
          <Campo etichetta="Porta" valore={item.port != null ? String(item.port) : null} />
          <Campo etichetta="Percorso" valore={item.path} />
          <Campo etichetta="Rinnovo" valore={rinnovo(item)} />
          <Campo etichetta="Ultimo cambio" valore={data(item.last_rotated_at)} />
          <Campo etichetta="Proprietario" valore={item.owner_name} />
          <Campo etichetta="Creata il" valore={data(item.created_at)} />
        </div>

        {item.note && (
          <div>
            <FieldLabel>Note</FieldLabel>
            <p className="whitespace-pre-wrap break-words rounded-lg border border-line p-3 text-sm dark:border-line-dark">
              {item.note}
            </p>
          </div>
        )}

        {item.links.length > 0 && (
          <div>
            <FieldLabel>Collegata a</FieldLabel>
            <div className="flex flex-wrap gap-1.5">
              {item.links.map((l) => (
                <span
                  key={`${l.target_type}-${l.target_id}`}
                  className="inline-flex items-center gap-1.5 rounded-pill border border-line px-2.5 py-1 text-xs dark:border-line-dark"
                >
                  <span className="text-muted dark:text-muted-dark">
                    {VAULT_TARGET_LABELS[l.target_type] ?? l.target_type}
                  </span>
                  {l.target_label ?? `#${l.target_id}`}
                  {l.client_name && (
                    <span className="text-muted dark:text-muted-dark">· {l.client_name}</span>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}

        {item.grants.length > 0 && (
          <div>
            <FieldLabel>Condivisa con</FieldLabel>
            <div className="flex flex-wrap gap-1.5">
              {item.grants.map((g) => (
                <span
                  key={g.user_id}
                  className="inline-flex items-center gap-1.5 rounded-pill border border-line px-2.5 py-1 text-xs dark:border-line-dark"
                  title={
                    g.granted_by_name
                      ? `Condivisa da ${g.granted_by_name}`
                      : "Provenienza non registrata (permesso anteriore a questa funzione)"
                  }
                >
                  <Icon name="users" className="h-3 w-3 text-muted dark:text-muted-dark" />
                  {g.user_name ?? `utente ${g.user_id}`}
                  <span className="text-muted dark:text-muted-dark">
                    {g.permission === "manage" ? "· gestisce" : "· vede"}
                  </span>
                  {g.granted_by_name && (
                    <span className="text-muted dark:text-muted-dark">· da {g.granted_by_name}</span>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
