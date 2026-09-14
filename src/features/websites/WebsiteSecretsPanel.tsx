import { useCallback, useEffect, useRef, useState } from "react";
import {
  SECRET_KIND_FIELDS,
  SECRET_KIND_LABELS,
  VaultLockedError,
  createWebsiteSecretApi,
  deleteWebsiteSecretApi,
  isVaultUnlocked,
  listSecretAccessesApi,
  listWebsiteSecretsApi,
  lockVault,
  revealWebsiteSecretApi,
  secretSummary,
  unlockVaultApi,
  updateWebsiteSecretApi,
  vaultRemainingMs,
  vaultStatusApi,
  type SecretAccess,
  type SecretKind,
  type WebsiteSecret,
  type WebsiteSecretPayload,
} from "../../api/websiteSecrets";
import { Button } from "../../components/ui/Button";
import { Checkbox } from "../../components/ui/Checkbox";
import { Icon, type IconName } from "../../components/ui/Icon";
import { Input } from "../../components/ui/Input";
import { Modal } from "../../components/ui/Modal";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import { useToast } from "../../context/ToastContext";

/**
 * Cassaforte degli accessi di un sito.
 *
 * L'elenco è sempre leggibile (tipo, nome, utente@host) perché serve a sapere
 * *cosa* esiste; i valori in chiaro arrivano solo dopo aver sbloccato con la
 * password e restano in memoria finché lo sblocco non scade.
 */

const KIND_OPTIONS = (Object.keys(SECRET_KIND_LABELS) as SecretKind[]).map((k) => ({
  value: k,
  label: SECRET_KIND_LABELS[k],
}));

const KIND_ICON: Record<SecretKind, IconName> = {
  ssh: "tools",
  ftp: "upload",
  wordpress: "globe",
  database: "archive",
  hosting: "settings",
  dns: "link",
  api_key: "key",
  other: "key",
};

interface FormState {
  kind: SecretKind;
  label: string;
  host: string;
  port: string;
  username: string;
  url: string;
  path: string;
  note: string;
  secret: string;
  private_key: string;
  visible_to_operators: boolean;
  /** In modifica i valori non si ricaricano: si sostituiscono solo se toccati. */
  secret_touched: boolean;
  key_touched: boolean;
}

const EMPTY_FORM: FormState = {
  kind: "wordpress",
  label: "",
  host: "",
  port: "",
  username: "",
  url: "",
  path: "",
  note: "",
  secret: "",
  private_key: "",
  visible_to_operators: false,
  secret_touched: false,
  key_touched: false,
};

interface WebsiteSecretsPanelProps {
  websiteId: number;
}

export function WebsiteSecretsPanel({ websiteId }: WebsiteSecretsPanelProps) {
  const toast = useToast();

  const [secrets, setSecrets] = useState<WebsiteSecret[]>([]);
  const [available, setAvailable] = useState(true);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);

  // Valori rivelati, tenuti solo qui: si svuotano quando la cassaforte si chiude.
  const [revealed, setRevealed] = useState<Record<number, { secret: string | null; private_key: string | null }>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(0);

  const [unlockOpen, setUnlockOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  // Azione da riprendere una volta sbloccato (rivela o copia).
  const pendingRef = useRef<(() => void) | null>(null);

  const [editing, setEditing] = useState<WebsiteSecret | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<WebsiteSecret | null>(null);

  const [accesses, setAccesses] = useState<SecretAccess[] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [stato, righe] = await Promise.all([vaultStatusApi(), listWebsiteSecretsApi(websiteId)]);
      setAvailable(stato.available);
      setCanManage(stato.can_manage);
      setSecrets(righe);
    } catch {
      setSecrets([]);
    } finally {
      setLoading(false);
    }
  }, [websiteId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Conto alla rovescia dello sblocco: allo scadere i valori rivelati spariscono
  // dallo schermo da soli, senza che l'utente debba ricordarsene.
  useEffect(() => {
    const id = window.setInterval(() => {
      const ms = vaultRemainingMs();
      setRemaining(ms);
      if (ms <= 0) setRevealed((prec) => (Object.keys(prec).length ? {} : prec));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const unlocked = remaining > 0 && isVaultUnlocked();

  /** Esegue l'azione se la cassaforte è aperta, altrimenti la mette in coda. */
  const withVault = (azione: () => void) => {
    if (isVaultUnlocked()) {
      azione();
      return;
    }
    pendingRef.current = azione;
    setUnlockOpen(true);
  };

  const doUnlock = async () => {
    setUnlocking(true);
    try {
      const minuti = await unlockVaultApi(password);
      setPassword("");
      setUnlockOpen(false);
      setRemaining(vaultRemainingMs());
      toast.success(`Cassaforte aperta per ${minuti} minuti`);
      const ripresa = pendingRef.current;
      pendingRef.current = null;
      ripresa?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sblocco non riuscito");
    } finally {
      setUnlocking(false);
    }
  };

  const chiudiCassaforte = () => {
    lockVault();
    setRevealed({});
    setRemaining(0);
  };

  const rivela = (s: WebsiteSecret) =>
    withVault(async () => {
      setBusyId(s.id);
      try {
        const dati = await revealWebsiteSecretApi(s.id);
        setRevealed((prec) => ({ ...prec, [s.id]: { secret: dati.secret, private_key: dati.private_key } }));
        setRemaining(vaultRemainingMs());
      } catch (err) {
        if (err instanceof VaultLockedError) {
          chiudiCassaforte();
          pendingRef.current = () => rivela(s);
          setUnlockOpen(true);
        } else {
          toast.error(err instanceof Error ? err.message : "Impossibile leggere l'accesso");
        }
      } finally {
        setBusyId(null);
      }
    });

  /** Copia senza mostrare a schermo: comodo quando c'è qualcuno alle spalle. */
  const copia = (s: WebsiteSecret, campo: "secret" | "private_key") =>
    withVault(async () => {
      setBusyId(s.id);
      try {
        const gia = revealed[s.id];
        const dati = gia ?? (await revealWebsiteSecretApi(s.id));
        const valore = campo === "secret" ? dati.secret : dati.private_key;
        if (!valore) {
          toast.error("Nessun valore da copiare");
          return;
        }
        await navigator.clipboard.writeText(valore);
        toast.success(campo === "secret" ? "Password copiata" : "Chiave copiata");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Copia non riuscita");
      } finally {
        setBusyId(null);
      }
    });

  const nascondi = (id: number) =>
    setRevealed((prec) => {
      const next = { ...prec };
      delete next[id];
      return next;
    });

  // ── Creazione e modifica ──────────────────────────────────────────────────

  const apriNuovo = () => {
    setForm(EMPTY_FORM);
    setEditing(null);
    setCreating(true);
  };

  const apriModifica = (s: WebsiteSecret) => {
    setForm({
      kind: s.kind,
      label: s.label,
      host: s.host ?? "",
      port: s.port != null ? String(s.port) : "",
      username: s.username ?? "",
      url: s.url ?? "",
      path: s.path ?? "",
      note: s.note ?? "",
      secret: "",
      private_key: "",
      visible_to_operators: s.visible_to_operators,
      secret_touched: false,
      key_touched: false,
    });
    setCreating(false);
    setEditing(s);
  };

  const salva = async () => {
    if (!form.label.trim()) {
      toast.error("Dai un nome all'accesso");
      return;
    }
    setSaving(true);
    try {
      const base: WebsiteSecretPayload = {
        kind: form.kind,
        label: form.label.trim(),
        host: form.host.trim() || null,
        port: form.port.trim() ? Number(form.port) : null,
        username: form.username.trim() || null,
        url: form.url.trim() || null,
        path: form.path.trim() || null,
        note: form.note.trim() || null,
        visible_to_operators: form.visible_to_operators,
      };
      if (editing) {
        // Solo i campi toccati: altrimenti un salvataggio cancellerebbe i valori.
        const patch: Partial<WebsiteSecretPayload> = { ...base };
        if (form.secret_touched) patch.secret = form.secret;
        if (form.key_touched) patch.private_key = form.private_key;
        await updateWebsiteSecretApi(editing.id, patch);
        nascondi(editing.id);
      } else {
        await createWebsiteSecretApi(websiteId, {
          ...base,
          secret: form.secret || null,
          private_key: form.private_key || null,
        });
      }
      setEditing(null);
      setCreating(false);
      await load();
      toast.success(editing ? "Accesso aggiornato" : "Accesso salvato");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Salvataggio non riuscito");
    } finally {
      setSaving(false);
    }
  };

  const elimina = async () => {
    if (!deleting) return;
    try {
      await deleteWebsiteSecretApi(deleting.id);
      nascondi(deleting.id);
      setDeleting(null);
      await load();
      toast.success("Accesso eliminato");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Eliminazione non riuscita");
    }
  };

  const apriRegistro = async () => {
    if (accesses) {
      setAccesses(null);
      return;
    }
    try {
      setAccesses(await listSecretAccessesApi(websiteId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Registro non disponibile");
    }
  };

  const campiVisibili = SECRET_KIND_FIELDS[form.kind];
  const mostraCampo = (nome: (typeof campiVisibili)[number]) => campiVisibili.includes(nome);

  // ── Resa ──────────────────────────────────────────────────────────────────

  return (
    <div
      className="wb-card-in rounded-md border border-line bg-paper p-3 dark:border-[#2a2a2e] dark:bg-[#131316]"
      style={{ animationDelay: "300ms" }}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
          <Icon name="key" className="h-3.5 w-3.5" />
          Accessi
          {secrets.length > 0 && <span className="font-normal normal-case">({secrets.length})</span>}
        </p>
        <div className="flex items-center gap-2">
          {unlocked && (
            <button
              type="button"
              onClick={chiudiCassaforte}
              title="Richiudi subito la cassaforte"
              className="inline-flex items-center gap-1 rounded-pill border border-success/30 bg-success/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-success transition-colors hover:bg-success/20"
            >
              <Icon name="unlink" className="h-3 w-3" />
              Aperta · {Math.ceil(remaining / 60000)} min
            </button>
          )}
          {canManage && (
            <>
              <button
                type="button"
                onClick={apriRegistro}
                title="Chi ha aperto quali accessi"
                className="inline-grid h-7 w-7 place-items-center rounded-md border border-line text-ink transition-colors hover:bg-cream dark:border-[#2a2a2e] dark:text-[#f4f4f7] dark:hover:bg-[#1c1c20]"
              >
                <Icon name="activity" className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={apriNuovo}
                disabled={!available}
                className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-ink transition-colors hover:bg-cream disabled:opacity-40 dark:border-[#2a2a2e] dark:text-[#f4f4f7] dark:hover:bg-[#1c1c20]"
              >
                <Icon name="plus" className="h-3.5 w-3.5" />
                Aggiungi
              </button>
            </>
          )}
        </div>
      </div>

      {!available && (
        <p className="rounded-md border border-warning/30 bg-warning/5 px-2.5 py-2 text-[12px] text-warning">
          Cassaforte non disponibile: manca la chiave di cifratura sul server. Finché non c'è, nessun
          accesso può essere salvato o letto.
        </p>
      )}

      {loading ? (
        <div className="sp-skeleton h-12 rounded-md border border-line dark:border-[#2a2a2e]" />
      ) : secrets.length === 0 ? (
        <p className="text-[12.5px] text-muted dark:text-[#9999a0]">
          {canManage
            ? "Nessun accesso salvato. Aggiungi SSH, FTP, login WordPress o qualsiasi altro codice utile."
            : "Nessun accesso condiviso con te per questo sito."}
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {secrets.map((s) => {
            const aperto = revealed[s.id];
            return (
              <div
                key={s.id}
                className="rounded-md border border-line bg-cream px-2.5 py-2 dark:border-[#2a2a2e] dark:bg-[#1c1c20]"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Icon
                    name={KIND_ICON[s.kind]}
                    className="h-3.5 w-3.5 flex-none text-muted dark:text-[#9999a0]"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5 text-[12.5px] font-semibold text-ink dark:text-[#f4f4f7]">
                      {s.label}
                      <span className="rounded-pill border border-line px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted dark:border-[#2a2a2e] dark:text-[#9999a0]">
                        {SECRET_KIND_LABELS[s.kind]}
                      </span>
                      {s.visible_to_operators && (
                        <span
                          title="Visibile anche agli operatori"
                          className="rounded-pill border border-info/30 bg-info/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-info"
                        >
                          Operatori
                        </span>
                      )}
                    </p>
                    {secretSummary(s) && (
                      <p className="truncate font-mono text-[11.5px] text-muted dark:text-[#9999a0]">
                        {secretSummary(s)}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-none items-center gap-1">
                    {s.has_secret && (
                      <button
                        type="button"
                        onClick={() => copia(s, "secret")}
                        disabled={busyId === s.id}
                        title="Copia la password senza mostrarla"
                        aria-label="Copia la password"
                        className="inline-grid h-7 w-7 place-items-center rounded-md border border-line text-ink transition-colors hover:bg-paper disabled:opacity-40 dark:border-[#2a2a2e] dark:text-[#f4f4f7] dark:hover:bg-[#131316]"
                      >
                        <Icon name="copy" className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {(s.has_secret || s.has_private_key) && (
                      <button
                        type="button"
                        onClick={() => (aperto ? nascondi(s.id) : rivela(s))}
                        disabled={busyId === s.id}
                        title={aperto ? "Nascondi" : "Mostra"}
                        aria-label={aperto ? "Nascondi" : "Mostra"}
                        className="inline-grid h-7 w-7 place-items-center rounded-md border border-line text-ink transition-colors hover:bg-paper disabled:opacity-40 dark:border-[#2a2a2e] dark:text-[#f4f4f7] dark:hover:bg-[#131316]"
                      >
                        <Icon name={aperto ? "eye-off" : "eye"} className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {s.can_manage && (
                      <>
                        <button
                          type="button"
                          onClick={() => apriModifica(s)}
                          title="Modifica"
                          aria-label="Modifica"
                          className="inline-grid h-7 w-7 place-items-center rounded-md border border-line text-ink transition-colors hover:bg-paper dark:border-[#2a2a2e] dark:text-[#f4f4f7] dark:hover:bg-[#131316]"
                        >
                          <Icon name="pencil" className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleting(s)}
                          title="Elimina"
                          aria-label="Elimina"
                          className="inline-grid h-7 w-7 place-items-center rounded-md border border-danger/20 bg-danger/5 text-danger transition-colors hover:bg-danger/10"
                        >
                          <Icon name="trash" className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {aperto && (
                  <div className="mt-2 flex flex-col gap-1.5 border-t border-line/60 pt-2 dark:border-[#2a2a2e]">
                    {aperto.secret && (
                      <div>
                        <p className="text-[9.5px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
                          Password
                        </p>
                        <p className="break-all font-mono text-[12.5px] text-ink dark:text-[#f4f4f7]">
                          {aperto.secret}
                        </p>
                      </div>
                    )}
                    {aperto.private_key && (
                      <div>
                        <p className="text-[9.5px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
                          Chiave privata
                        </p>
                        <pre className="max-h-40 overflow-auto rounded border border-line bg-paper p-2 font-mono text-[11px] text-ink dark:border-[#2a2a2e] dark:bg-[#131316] dark:text-[#f4f4f7]">
                          {aperto.private_key}
                        </pre>
                      </div>
                    )}
                  </div>
                )}

                {s.note && (
                  <p className="mt-1.5 whitespace-pre-wrap break-words text-[11.5px] text-muted dark:text-[#9999a0]">
                    {s.note}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {accesses && (
        <div className="mt-2 rounded-md border border-line bg-cream px-2.5 py-2 dark:border-[#2a2a2e] dark:bg-[#1c1c20]">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
            Ultime aperture
          </p>
          {accesses.length === 0 ? (
            <p className="text-[12px] text-muted dark:text-[#9999a0]">Nessuno ha ancora aperto questi accessi.</p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {accesses.map((a) => (
                <li key={a.id} className="text-[11.5px] text-muted dark:text-[#9999a0]">
                  <span className="text-ink dark:text-[#f4f4f7]">{a.user_name ?? "Utente rimosso"}</span>
                  {" · "}
                  {a.secret_label}
                  {" · "}
                  {new Date(a.created_at).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" })}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── Sblocco ─────────────────────────────────────────────────────── */}
      <Modal
        open={unlockOpen}
        onClose={() => {
          setUnlockOpen(false);
          setPassword("");
          pendingRef.current = null;
        }}
        title="Sblocca la cassaforte"
        description="Serve la tua password. Resta aperta 15 minuti, poi si richiude da sola."
        icon={<Icon name="key" className="h-5 w-5" />}
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setUnlockOpen(false);
                setPassword("");
                pendingRef.current = null;
              }}
            >
              Annulla
            </Button>
            <Button onClick={() => void doUnlock()} loading={unlocking} disabled={!password}>
              Sblocca
            </Button>
          </>
        }
      >
        <Input
          label="Password"
          type="password"
          value={password}
          autoFocus
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && password) void doUnlock();
          }}
          placeholder="La tua password di accesso"
        />
      </Modal>

      {/* ── Nuovo / modifica ────────────────────────────────────────────── */}
      <Modal
        open={creating || !!editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        title={editing ? "Modifica accesso" : "Nuovo accesso"}
        icon={<Icon name="key" className="h-5 w-5" />}
        size="md"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setCreating(false);
                setEditing(null);
              }}
            >
              Annulla
            </Button>
            <Button onClick={() => void salva()} loading={saving}>
              Salva
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
                Tipo
              </label>
              <SearchableSelect
                value={form.kind}
                onChange={(v) => setForm((f) => ({ ...f, kind: v as SecretKind }))}
                options={KIND_OPTIONS}
                showAvatar={false}
                menuLayer="portal"
              />
            </div>
            <Input
              label="Nome"
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              placeholder="es. SSH produzione"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {mostraCampo("host") && (
              <Input
                label="Host"
                value={form.host}
                onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))}
                placeholder="1.2.3.4 oppure server.hosting.it"
              />
            )}
            {mostraCampo("port") && (
              <Input
                label="Porta"
                value={form.port}
                onChange={(e) => setForm((f) => ({ ...f, port: e.target.value.replace(/\D/g, "") }))}
                placeholder="22"
              />
            )}
            {mostraCampo("url") && (
              <Input
                label="Indirizzo"
                value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                placeholder="https://sito.it/wp-admin"
              />
            )}
            {mostraCampo("username") && (
              <Input
                label="Utente"
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              />
            )}
            {mostraCampo("path") && (
              <Input
                label="Percorso"
                value={form.path}
                onChange={(e) => setForm((f) => ({ ...f, path: e.target.value }))}
                placeholder="/var/www/html"
              />
            )}
          </div>

          <Input
            label={form.kind === "api_key" ? "Chiave" : "Password"}
            type="password"
            value={form.secret}
            onChange={(e) => setForm((f) => ({ ...f, secret: e.target.value, secret_touched: true }))}
            placeholder={
              editing
                ? editing.has_secret
                  ? "Salvata — scrivi qui per sostituirla"
                  : "Nessuna password salvata"
                : ""
            }
          />

          {mostraCampo("private_key") && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
                Chiave privata
              </label>
              <textarea
                rows={4}
                value={form.private_key}
                onChange={(e) => setForm((f) => ({ ...f, private_key: e.target.value, key_touched: true }))}
                placeholder={
                  editing && editing.has_private_key
                    ? "Salvata — incolla qui per sostituirla"
                    : "-----BEGIN OPENSSH PRIVATE KEY-----"
                }
                className="w-full rounded-md border border-line bg-paper px-3 py-2 font-mono text-[12px] text-ink placeholder:text-muted focus:border-brand-magenta focus:outline-none dark:border-line-dark dark:bg-ink-soft dark:text-paper"
              />
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
              Nota
            </label>
            <textarea
              rows={2}
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              placeholder="Promemoria utile — attenzione: la nota è leggibile senza sbloccare."
              className="w-full rounded-md border border-line bg-paper px-3 py-2 text-[13px] text-ink placeholder:text-muted focus:border-brand-magenta focus:outline-none dark:border-line-dark dark:bg-ink-soft dark:text-paper"
            />
          </div>

          <label className="flex cursor-pointer items-start gap-2 text-sm text-ink dark:text-paper">
            <Checkbox
              checked={form.visible_to_operators}
              onChange={(v) => setForm((f) => ({ ...f, visible_to_operators: v }))}
            />
            <span>
              Visibile agli operatori
              <span className="block text-[12px] text-muted dark:text-muted-dark">
                Da attivare per gli accessi che servono a lavorare, come il login WordPress. Lasciala
                spenta per SSH, database e pannelli di hosting.
              </span>
            </span>
          </label>
        </div>
      </Modal>

      {/* ── Conferma eliminazione ───────────────────────────────────────── */}
      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Eliminare questo accesso?"
        icon={<Icon name="trash" className="h-5 w-5" />}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)}>
              Annulla
            </Button>
            <Button variant="danger" onClick={() => void elimina()}>
              Elimina
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink dark:text-paper">
          <strong>{deleting?.label}</strong> verrà eliminato definitivamente. Il registro di chi
          l'aveva aperto resta.
        </p>
      </Modal>
    </div>
  );
}
