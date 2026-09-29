import { useEffect, useMemo, useState } from "react";
import { listClientOptionsApi } from "../../api/clients";
import { listSocialProfilesApi } from "../../api/socialProfiles";
import {
  VAULT_KIND_FIELDS,
  VAULT_KIND_LABELS,
  createVaultItemApi,
  updateVaultItemApi,
  type VaultItem,
  type VaultItemInput,
  type VaultKind,
  type VaultTargetType,
} from "../../api/vault";
import { listWebsitesApi } from "../../api/websites";
import { Button } from "../../components/ui/Button";
import { DurationField } from "../../components/ui/DurationField";
import { FieldLabel } from "../../components/ui/FieldLabel";
import { Icon } from "../../components/ui/Icon";
import { Input } from "../../components/ui/Input";
import { Modal } from "../../components/ui/Modal";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import { Textarea } from "../../components/ui/Textarea";
import { useToast } from "../../context/ToastContext";

/**
 * Creazione e modifica di una credenziale.
 *
 * Il segreto si comporta diversamente da tutto il resto: in modifica il campo
 * parte VUOTO e lasciarlo vuoto significa "non toccare". Non si ripresenta mai
 * il valore esistente — per vederlo si passa dalla rivelazione, che viene
 * registrata.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  companyId: number;
  /** Null = creazione. */
  item?: VaultItem | null;
  /** Collegamento preimpostato, es. dal pannello dentro un sito. */
  linkFisso?: { target_type: VaultTargetType; target_id: number };
  onSaved: () => void;
}

const KIND_OPTIONS = (Object.keys(VAULT_KIND_LABELS) as VaultKind[]).map((k) => ({
  value: k,
  label: VAULT_KIND_LABELS[k],
}));

export function VaultItemModal({ open, onClose, companyId, item, linkFisso, onSaved }: Props) {
  const [kind, setKind] = useState<VaultKind>("password");
  const [label, setLabel] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [url, setUrl] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("");
  const [path, setPath] = useState("");
  const [note, setNote] = useState("");
  const [secret, setSecret] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [totp, setTotp] = useState("");
  const [rotationDays, setRotationDays] = useState<number | null>(null);
  const [clientId, setClientId] = useState("");
  const [websiteId, setWebsiteId] = useState("");
  const [socialId, setSocialId] = useState("");
  const [salvataggio, setSalvataggio] = useState(false);

  const [clienti, setClienti] = useState<Array<{ value: string; label: string }>>([]);
  const [siti, setSiti] = useState<Array<{ value: string; label: string }>>([]);
  const [social, setSocial] = useState<Array<{ value: string; label: string }>>([]);
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    setKind((item?.kind as VaultKind) ?? "password");
    setLabel(item?.label ?? "");
    setUsername(item?.username ?? "");
    setEmail(item?.email ?? "");
    setUrl(item?.url ?? "");
    setHost(item?.host ?? "");
    setPort(item?.port != null ? String(item.port) : "");
    setPath(item?.path ?? "");
    setNote(item?.note ?? "");
    setRotationDays(item?.rotation_days ?? null);
    // Mai precompilati: si riempiono solo per cambiarli.
    setSecret("");
    setPrivateKey("");
    setTotp("");

    const trova = (t: VaultTargetType) =>
      String(item?.links.find((l) => l.target_type === t)?.target_id ?? "");
    setClientId(linkFisso?.target_type === "client" ? String(linkFisso.target_id) : trova("client"));
    setWebsiteId(
      linkFisso?.target_type === "website" ? String(linkFisso.target_id) : trova("website")
    );
    setSocialId(
      linkFisso?.target_type === "social_profile"
        ? String(linkFisso.target_id)
        : trova("social_profile")
    );
  }, [open, item, linkFisso]);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      try {
        const [c, w, s] = await Promise.all([
          listClientOptionsApi(companyId),
          listWebsitesApi({ companyId }),
          listSocialProfilesApi({ companyId }),
        ]);
        setClienti(c.map((x) => ({ value: String(x.id), label: x.name })));
        setSiti(w.map((x) => ({ value: String(x.id), label: x.name || x.url })));
        setSocial(s.map((x) => ({ value: String(x.id), label: x.name || x.url })));
      } catch {
        // Le select restano vuote: si può comunque salvare senza collegamenti.
      }
    })();
  }, [open, companyId]);

  const campi = useMemo(() => new Set(VAULT_KIND_FIELDS[kind] ?? []), [kind]);

  async function salva() {
    if (!label.trim()) {
      toast.error("Serve un'etichetta");
      return;
    }
    const links: VaultItemInput["links"] = [];
    if (clientId) links.push({ target_type: "client", target_id: Number(clientId) });
    if (websiteId) links.push({ target_type: "website", target_id: Number(websiteId) });
    if (socialId) links.push({ target_type: "social_profile", target_id: Number(socialId) });

    const base = {
      kind,
      label: label.trim(),
      username: username || null,
      email: email || null,
      url: url || null,
      host: host || null,
      port: port ? Number(port) : null,
      path: path || null,
      note: note || null,
      rotation_days: rotationDays,
    };

    setSalvataggio(true);
    try {
      if (item) {
        // Stringa vuota = non toccare il segreto (il backend distingue null da "").
        await updateVaultItemApi(item.id, {
          ...base,
          ...(secret ? { secret } : {}),
          ...(privateKey ? { private_key: privateKey } : {}),
          ...(totp ? { totp } : {}),
          links,
        });
      } else {
        await createVaultItemApi({
          company_id: companyId,
          ...base,
          secret: secret || null,
          private_key: privateKey || null,
          totp: totp || null,
          links,
        });
      }
      toast.success(item ? "Credenziale aggiornata" : "Credenziale salvata");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Salvataggio non riuscito");
    } finally {
      setSalvataggio(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={item ? "Modifica credenziale" : "Nuova credenziale"}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Annulla
          </Button>
          <Button onClick={() => void salva()} loading={salvataggio}>
            Salva
          </Button>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <FieldLabel>Tipo</FieldLabel>
          <SearchableSelect
            value={kind}
            onChange={(v) => setKind(v as VaultKind)}
            options={KIND_OPTIONS}
          />
        </div>
        <Input label="Etichetta" value={label} onChange={(e) => setLabel(e.target.value)} />

        {campi.has("username") && (
          <Input label="Utente" value={username} onChange={(e) => setUsername(e.target.value)} />
        )}
        {campi.has("email") && (
          <Input
            type="email"
            label="Email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        )}
        {campi.has("url") && (
          <Input label="URL" value={url} onChange={(e) => setUrl(e.target.value)} />
        )}
        {campi.has("host") && (
          <Input label="Host" value={host} onChange={(e) => setHost(e.target.value)} />
        )}
        {campi.has("port") && (
          <Input label="Porta" value={port} onChange={(e) => setPort(e.target.value)} />
        )}
        {campi.has("path") && (
          <Input label="Percorso" value={path} onChange={(e) => setPath(e.target.value)} />
        )}

        <Input
          type="password"
          label={item ? "Password (vuoto = invariata)" : "Password"}
          autoComplete="new-password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
        />
        {campi.has("totp") && (
          <Input
            type="password"
            label={item ? "Seed TOTP (vuoto = invariato)" : "Seed TOTP"}
            value={totp}
            onChange={(e) => setTotp(e.target.value)}
          />
        )}
        {campi.has("private_key") && (
          <div className="sm:col-span-2">
            <Textarea
              label={item ? "Chiave privata (vuoto = invariata)" : "Chiave privata"}
              className="font-mono text-xs"
              rows={4}
              value={privateKey}
              onChange={(e) => setPrivateKey(e.target.value)}
            />
          </div>
        )}

        <DurationField
          label="Rinnovo ogni"
          value={rotationDays}
          onChange={setRotationDays}
          placeholder="policy aziendale"
          hint="Vuoto = usa la policy dell'azienda. 0 = non scade mai."
        />

        <div className="sm:col-span-2 grid gap-3 sm:grid-cols-3">
          <div>
            <FieldLabel>Cliente</FieldLabel>
            <SearchableSelect
              value={clientId}
              onChange={setClientId}
              options={[{ value: "", label: "—" }, ...clienti]}
              placeholder="Nessuno"
            />
          </div>
          <div>
            <FieldLabel>Sito</FieldLabel>
            <SearchableSelect
              value={websiteId}
              onChange={setWebsiteId}
              options={[{ value: "", label: "—" }, ...siti]}
              placeholder="Nessuno"
            />
          </div>
          <div>
            <FieldLabel>Profilo social</FieldLabel>
            <SearchableSelect
              value={socialId}
              onChange={setSocialId}
              options={[{ value: "", label: "—" }, ...social]}
              placeholder="Nessuno"
            />
          </div>
        </div>

        <div className="sm:col-span-2">
          <Textarea
            label="Note"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        {/* Chi altri ce l'ha. In sola lettura: si condivide dalla lista, dove si
            possono prendere più credenziali insieme invece che una per volta. */}
        {item && item.grants.length > 0 && (
          <div className="sm:col-span-2">
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
                    <span className="text-muted dark:text-muted-dark">
                      · da {g.granted_by_name}
                    </span>
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
