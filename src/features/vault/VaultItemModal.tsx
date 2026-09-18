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
import { FieldLabel } from "../../components/ui/FieldLabel";
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
  const [url, setUrl] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("");
  const [path, setPath] = useState("");
  const [note, setNote] = useState("");
  const [secret, setSecret] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [totp, setTotp] = useState("");
  const [rotationDays, setRotationDays] = useState("");
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
    setUrl(item?.url ?? "");
    setHost(item?.host ?? "");
    setPort(item?.port != null ? String(item.port) : "");
    setPath(item?.path ?? "");
    setNote(item?.note ?? "");
    setRotationDays(item?.rotation_days != null ? String(item.rotation_days) : "");
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
      url: url || null,
      host: host || null,
      port: port ? Number(port) : null,
      path: path || null,
      note: note || null,
      rotation_days: rotationDays ? Number(rotationDays) : null,
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

        <Input
          label="Rinnovo ogni (giorni, 0 = mai)"
          value={rotationDays}
          onChange={(e) => setRotationDays(e.target.value)}
          placeholder="policy aziendale"
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
      </div>
    </Modal>
  );
}
