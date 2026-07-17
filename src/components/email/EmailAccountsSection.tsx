import { useEffect, useState } from "react";
import {
  createEmailAccountApi,
  deleteEmailAccountApi,
  googleAuthorizeApi,
  listEmailAccountsApi,
  setDefaultEmailAccountApi,
  testEmailAccountApi,
  type EmailAccount,
  type EmailAccountCreate,
  type EmailSecurity,
  type IncomingProtocol,
} from "../../api/emailAccounts";
import { useToast } from "../../context/ToastContext";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Icon } from "../ui/Icon";
import { Spinner } from "../ui/Spinner";

interface Company {
  id: number;
  name: string;
}
interface Props {
  companies: Company[];
  defaultCompanyId: number | null;
}

type FormKind = "google_app" | "generic";

const inputCls =
  "rounded-md border border-line bg-paper px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-ink dark:border-line-dark dark:bg-ink-soft dark:text-paper dark:focus:border-paper";
const labelCls = "text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark";

const SECURITY_OPTS: EmailSecurity[] = ["ssl", "starttls", "none"];

function emptyForm(kind: FormKind): EmailAccountCreate & { _kind: FormKind } {
  return {
    _kind: kind,
    provider: kind === "google_app" ? "google" : "generic",
    auth_method: kind === "google_app" ? "app_password" : "password",
    email_address: "",
    display_name: "",
    is_default: false,
    smtp_host: kind === "google_app" ? "smtp.gmail.com" : "",
    smtp_port: kind === "google_app" ? 587 : undefined,
    smtp_security: kind === "google_app" ? "starttls" : "ssl",
    smtp_password: "",
    incoming_protocol: "imap",
    incoming_host: kind === "google_app" ? "imap.gmail.com" : "",
    incoming_port: kind === "google_app" ? 993 : undefined,
    incoming_security: "ssl",
    incoming_username: "",
    incoming_password: "",
  };
}

function ProviderBadge({ a }: { a: EmailAccount }) {
  const label =
    a.provider === "google" ? (a.auth_method === "oauth2" ? "Google OAuth" : "Google app-password") : "SMTP/IMAP";
  return (
    <span className="rounded-pill border border-line px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted dark:border-line-dark dark:text-muted-dark">
      {label}
    </span>
  );
}

export function EmailAccountsSection({ companies, defaultCompanyId }: Props) {
  const toast = useToast();
  const [companyId, setCompanyId] = useState<number | null>(defaultCompanyId ?? companies[0]?.id ?? null);
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [form, setForm] = useState<(EmailAccountCreate & { _kind: FormKind }) | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = (cid: number | null) => {
    if (cid == null) return;
    setLoading(true);
    listEmailAccountsApi(cid)
      .then(setAccounts)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Errore nel caricamento"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    reload(companyId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  // Ritorno dal flusso OAuth Google (?email_linked / ?email_error).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("email_linked")) {
      toast.success("Account Google collegato");
    } else if (params.has("email_error")) {
      toast.error(params.get("email_error") || "Collegamento Google non riuscito");
    } else {
      return;
    }
    params.delete("email_linked");
    params.delete("email_error");
    const url = window.location.pathname + (params.toString() ? `?${params}` : "");
    window.history.replaceState({}, "", url);
    reload(companyId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (patch: Partial<EmailAccountCreate>) => setForm((f) => (f ? { ...f, ...patch } : f));

  const onSave = async () => {
    if (!form || companyId == null) return;
    if (!form.email_address.trim()) return toast.error("Inserisci l'indirizzo email");
    if (!form.smtp_password) return toast.error("Inserisci la password di invio");
    setSaving(true);
    try {
      const { _kind, ...payload } = form;
      void _kind;
      await createEmailAccountApi(companyId, payload);
      toast.success("Account email aggiunto");
      setForm(null);
      reload(companyId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore nel salvataggio");
    } finally {
      setSaving(false);
    }
  };

  const onConnectGoogle = async () => {
    if (companyId == null) return;
    try {
      const { authorize_url } = await googleAuthorizeApi(companyId, window.location.href);
      window.location.href = authorize_url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "OAuth Google non disponibile");
    }
  };

  const onTest = async (a: EmailAccount) => {
    setBusyId(a.id);
    try {
      const r = await testEmailAccountApi(a.id);
      r.ok ? toast.success(r.detail) : toast.error(r.detail);
      reload(companyId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test fallito");
    } finally {
      setBusyId(null);
    }
  };

  const onSetDefault = async (a: EmailAccount) => {
    setBusyId(a.id);
    try {
      await setDefaultEmailAccountApi(a.id);
      reload(companyId);
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (a: EmailAccount) => {
    if (!window.confirm(`Eliminare il mittente ${a.email_address}?`)) return;
    setBusyId(a.id);
    try {
      await deleteEmailAccountApi(a.id);
      reload(companyId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Eliminazione fallita");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="bg-paper dark:bg-[#131316] rounded-lg border border-line dark:border-[#2a2a2e] p-6">
      <h2 className="font-display font-bold tracking-tight text-ink dark:text-[#f4f4f7] mb-1" style={{ fontSize: "17px" }}>
        Email di invio
      </h2>
      <p className="font-body text-[13px] text-muted dark:text-[#9999a0] mb-5">
        Configura i mittenti da cui invierai email, per ciascuna organizzazione. Le credenziali sono cifrate.
      </p>

      {/* Selettore organizzazione */}
      {companies.length > 1 && (
        <div className="mb-5 flex flex-col gap-1">
          <label className={labelCls}>Organizzazione</label>
          <select
            className={inputCls}
            value={companyId ?? ""}
            onChange={(e) => setCompanyId(Number(e.target.value))}
          >
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Elenco account */}
      {loading ? (
        <div className="flex justify-center py-6"><Spinner /></div>
      ) : accounts.length === 0 ? (
        <p className="text-sm text-muted dark:text-muted-dark">Nessun mittente configurato per questa organizzazione.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {accounts.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-md border border-line dark:border-line-dark px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-ink dark:text-paper">{a.email_address}</span>
                  <ProviderBadge a={a} />
                  {a.is_default && <span className="rounded-pill bg-brand-magenta/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-magenta">Predefinito</span>}
                  {a.last_test_ok === true && <Icon name="check-circle" className="h-4 w-4 text-success" />}
                  {a.last_test_ok === false && <Icon name="alert-triangle" className="h-4 w-4 text-danger" />}
                </div>
                {a.last_test_error && <div className="mt-0.5 text-[11px] text-danger">{a.last_test_error}</div>}
              </div>
              <div className="flex items-center gap-1.5">
                <Button size="sm" variant="ghost" onClick={() => onTest(a)} loading={busyId === a.id}>Test</Button>
                {!a.is_default && <Button size="sm" variant="ghost" onClick={() => onSetDefault(a)}>Predefinito</Button>}
                <button className="p-1.5 text-muted hover:text-danger" title="Elimina" onClick={() => onDelete(a)}>
                  <Icon name="trash" className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Azioni aggiunta */}
      {!form && (
        <div className="mt-5 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => setForm(emptyForm("generic"))}>
            <Icon name="plus" className="h-4 w-4" /> Account SMTP/IMAP
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setForm(emptyForm("google_app"))}>
            <Icon name="plus" className="h-4 w-4" /> Gmail (app-password)
          </Button>
          <Button size="sm" variant="secondary" onClick={onConnectGoogle}>
            <Icon name="mail" className="h-4 w-4" /> Connetti con Google (OAuth)
          </Button>
        </div>
      )}

      {/* Form aggiunta */}
      {form && (
        <div className="mt-5 flex flex-col gap-4 rounded-lg border border-line dark:border-line-dark p-4">
          <div className="text-sm font-semibold text-ink dark:text-paper">
            {form._kind === "google_app" ? "Nuovo mittente Gmail (app-password)" : "Nuovo mittente SMTP/IMAP"}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Indirizzo email" value={form.email_address} onChange={(e) => set({ email_address: e.target.value })} placeholder="nome@dominio.it" />
            <Input label="Nome mittente" value={form.display_name ?? ""} onChange={(e) => set({ display_name: e.target.value })} placeholder="Mario Rossi" />
          </div>

          {form._kind === "google_app" && (
            <p className="text-[12px] text-muted dark:text-muted-dark">
              Serve una <b>password per le app</b> Google (richiede la verifica in due passaggi attiva). Host SMTP/IMAP sono precompilati.
            </p>
          )}

          {/* SMTP (invio) */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Input label="SMTP host" value={form.smtp_host ?? ""} onChange={(e) => set({ smtp_host: e.target.value })} placeholder="smtp.dominio.it" />
            <Input label="SMTP porta" type="number" value={form.smtp_port ?? ""} onChange={(e) => set({ smtp_port: e.target.value ? Number(e.target.value) : undefined })} placeholder="587" />
            <div className="flex flex-col gap-1">
              <label className={labelCls}>Sicurezza SMTP</label>
              <select className={inputCls} value={form.smtp_security ?? "starttls"} onChange={(e) => set({ smtp_security: e.target.value as EmailSecurity })}>
                {SECURITY_OPTS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Utente SMTP" value={form.smtp_username ?? ""} onChange={(e) => set({ smtp_username: e.target.value })} placeholder="(default: l'indirizzo email)" />
            <Input label={form._kind === "google_app" ? "Password per le app" : "Password SMTP"} type="password" value={form.smtp_password ?? ""} onChange={(e) => set({ smtp_password: e.target.value })} />
          </div>

          {/* IMAP/POP3 (ricezione) */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1">
              <label className={labelCls}>Protocollo ricezione</label>
              <select className={inputCls} value={form.incoming_protocol ?? "imap"} onChange={(e) => set({ incoming_protocol: e.target.value as IncomingProtocol })}>
                <option value="imap">IMAP</option>
                <option value="pop3">POP3</option>
              </select>
            </div>
            <Input label="Host ricezione" value={form.incoming_host ?? ""} onChange={(e) => set({ incoming_host: e.target.value })} placeholder="imap.dominio.it" />
            <Input label="Porta ricezione" type="number" value={form.incoming_port ?? ""} onChange={(e) => set({ incoming_port: e.target.value ? Number(e.target.value) : undefined })} placeholder="993" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Utente ricezione" value={form.incoming_username ?? ""} onChange={(e) => set({ incoming_username: e.target.value })} placeholder="(default: l'indirizzo email)" />
            <Input label="Password ricezione" type="password" value={form.incoming_password ?? ""} onChange={(e) => set({ incoming_password: e.target.value })} placeholder="(opzionale ora)" />
          </div>

          <label className="flex items-center gap-2 text-sm text-ink dark:text-paper">
            <input type="checkbox" checked={!!form.is_default} onChange={(e) => set({ is_default: e.target.checked })} />
            Usa come mittente predefinito per questa organizzazione
          </label>

          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setForm(null)}>Annulla</Button>
            <Button size="sm" variant="primary" onClick={onSave} loading={saving}>Salva mittente</Button>
          </div>
        </div>
      )}
    </div>
  );
}
