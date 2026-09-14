import { useEffect, useMemo, useState } from "react";
import { type Client } from "../../api/clients";
import { getUsersApi, type User } from "../../api/users";
import { listSocialProfilesApi, socialProfileLabel, type SocialProfile } from "../../api/socialProfiles";
import { Icon } from "../ui/Icon";
import { Spinner } from "../ui/Spinner";
import { type IconName } from "../ui/Icon";
import { SocialIcon } from "../social/SocialIcon";

function fmt(v: string | null | undefined) {
  return v ?? null;
}

function fmtDate(v: string | null | undefined) {
  if (!v) return null;
  const d = new Date(v);
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" });
}

function fmtAddress(c: Client) {
  const parts = [c.addr, c.address_extra, c.city && c.prov ? `${c.city} (${c.prov})` : c.city, c.zip, c.country].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

function InfoRow({ label, value, mono = false, full = false }: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  full?: boolean;
}) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted dark:text-[#9999a0] mb-0.5">
        {label}
      </p>
      {value != null && value !== "" ? (
        <p className={`text-[13px] font-body text-ink dark:text-[#f4f4f7] ${mono ? "font-mono" : ""}`}>
          {value}
        </p>
      ) : (
        <p className="text-[13px] text-muted dark:text-[#9999a0]">-</p>
      )}
    </div>
  );
}

function InfoCard({ title, iconName, children }: {
  title: string;
  iconName: IconName;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-paper dark:bg-[#131316] border border-line dark:border-[#2a2a2e] rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon name={iconName} className="w-3.5 h-3.5 text-muted dark:text-[#9999a0]" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted dark:text-[#9999a0]">
          {title}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4">
        {children}
      </div>
    </div>
  );
}

function BoolBadge({ value, labelTrue, labelFalse }: {
  value: boolean;
  labelTrue: string;
  labelFalse: string;
}) {
  return value ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-success">
      {labelTrue}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-line px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted dark:bg-[#2a2a2e] dark:text-[#9999a0]">
      {labelFalse}
    </span>
  );
}

interface ClientFullDetailsProps {
  client: Client;
}

export function ClientFullDetails({ client }: ClientFullDetailsProps) {
  const [assignedUsers, setAssignedUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  useEffect(() => {
    const companyId = client.company_id ?? client.company_ids?.[0] ?? null;
    const assignedIds = client.assigned_user_ids ?? [];

    if (companyId == null || assignedIds.length === 0) {
      setAssignedUsers([]);
      setUsersLoading(false);
      return;
    }

    let cancelled = false;
    setUsersLoading(true);

    getUsersApi(companyId)
      .then((list) => {
        if (cancelled) return;
        const assignedSet = new Set(assignedIds);
        setAssignedUsers(list.filter((user) => assignedSet.has(user.id)));
      })
      .catch(() => {
        if (!cancelled) setAssignedUsers([]);
      })
      .finally(() => {
        if (!cancelled) setUsersLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [client]);

  const [socialProfiles, setSocialProfiles] = useState<SocialProfile[]>([]);
  useEffect(() => {
    let cancelled = false;
    listSocialProfilesApi({ clientId: client.id })
      .then((rows) => {
        if (!cancelled) setSocialProfiles(rows);
      })
      .catch(() => {
        if (!cancelled) setSocialProfiles([]);
      });
    return () => {
      cancelled = true;
    };
  }, [client.id]);

  const fullAddress = useMemo(() => fmtAddress(client), [client]);
  const hasAssignedUsers = assignedUsers.length > 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {((client.work_areas?.length ?? 0) > 0 || (client.tags?.length ?? 0) > 0) && (
        <div className="md:col-span-2 bg-paper dark:bg-[#131316] border border-line dark:border-[#2a2a2e] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Icon name="target" className="w-3.5 h-3.5 text-muted dark:text-[#9999a0]" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted dark:text-[#9999a0]">
              Aree e tag assegnati
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(client.work_areas ?? []).map((area) => (
              <span
                key={`client-area-${area.id}`}
                className="inline-flex items-center rounded-pill border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider"
                style={area.color ? { borderColor: `${area.color}55`, color: area.color, backgroundColor: `${area.color}1A` } : undefined}
              >
                {area.name}
              </span>
            ))}
            {(client.tags ?? []).map((tag) => (
              <span
                key={`client-tag-${tag.id}`}
                className="inline-flex items-center rounded-pill border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider"
                style={tag.color ? { borderColor: `${tag.color}55`, color: tag.color, backgroundColor: `${tag.color}1A` } : undefined}
              >
                #{tag.name}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="md:col-span-2 bg-paper dark:bg-[#131316] border border-line dark:border-[#2a2a2e] rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Icon name="users" className="w-3.5 h-3.5 text-muted dark:text-[#9999a0]" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted dark:text-[#9999a0]">
            Utenti assegnati
          </span>
        </div>
        {usersLoading ? (
          <div className="flex items-center gap-2 text-[13px] text-muted dark:text-[#9999a0]">
            <Spinner size="sm" />
            Caricamento utenti...
          </div>
        ) : hasAssignedUsers ? (
          <div className="flex flex-wrap gap-1.5">
            {assignedUsers.map((user) => (
              <span
                key={user.id}
                className="inline-flex items-center rounded-pill border border-line bg-cream px-2.5 py-0.5 text-[11px] font-semibold text-ink dark:border-[#2a2a2e] dark:bg-[#1c1c20] dark:text-[#f4f4f7]"
              >
                {user.full_name || user.username}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-muted dark:text-[#9999a0]">
            Nessun utente assegnato a questo cliente.
          </p>
        )}
      </div>

      <div className="md:col-span-2 bg-paper dark:bg-[#131316] border border-line dark:border-[#2a2a2e] rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Icon name="trello" className="w-3.5 h-3.5 text-muted dark:text-[#9999a0]" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted dark:text-[#9999a0]">
            Board Trello collegate
          </span>
        </div>
        {(client.trello_boards?.length ?? 0) > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {(client.trello_boards ?? []).map((board) => (
              <a
                key={board.id}
                href={board.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-line dark:border-[#2a2a2e] px-3 py-2 hover:border-ink dark:hover:border-[#f4f4f7] transition-colors"
              >
                <p className="text-[12px] font-semibold text-ink dark:text-[#f4f4f7] truncate">{board.name}</p>
                <p className="text-[11px] text-muted dark:text-[#9999a0] font-mono">#{board.id} · {board.trello_board_id}</p>
              </a>
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-muted dark:text-[#9999a0]">
            Nessuna board Trello collegata a questo cliente.
          </p>
        )}
      </div>

      {socialProfiles.length > 0 && (
        <div className="md:col-span-2 bg-paper dark:bg-[#131316] border border-line dark:border-[#2a2a2e] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Icon name="globe" className="w-3.5 h-3.5 text-muted dark:text-[#9999a0]" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted dark:text-[#9999a0]">
              Profili social
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {socialProfiles.map((profile) => (
              <a
                key={profile.id}
                href={profile.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2.5 rounded-lg border border-line dark:border-[#2a2a2e] px-3 py-2 hover:border-ink dark:hover:border-[#f4f4f7] transition-colors"
              >
                <SocialIcon
                  platform={profile.platform}
                  label={profile.platform_label}
                  color={profile.platform_color}
                  className="h-8 w-8"
                />
                <span className="min-w-0">
                  <p className="text-[12px] font-semibold text-ink dark:text-[#f4f4f7] truncate">
                    {socialProfileLabel(profile)}
                  </p>
                  <p className="text-[11px] text-muted dark:text-[#9999a0]">
                    {profile.platform_label}
                  </p>
                </span>
              </a>
            ))}
          </div>
        </div>
      )}

      <InfoCard title="Contatti" iconName="mail">
        <InfoRow label="Email" value={
          client.email
            ? <a href={`mailto:${client.email}`} className="hover:underline text-primary">{client.email}</a>
            : null
        } />
        <InfoRow label="Telefono" value={
          client.phone
            ? <a href={`tel:${client.phone}`} className="hover:underline">{client.phone}</a>
            : null
        } />
        <InfoRow label="Fax" value={fmt(client.fax)} />
        <InfoRow label="PEC" value={
          client.pec
            ? <a href={`mailto:${client.pec}`} className="hover:underline text-primary">{client.pec}</a>
            : null
        } />
      </InfoCard>

      <InfoCard title="Dati fiscali" iconName="document-text">
        <InfoRow label="P.IVA" value={fmt(client.vat)} mono />
        <InfoRow label="Cod. Fiscale" value={fmt(client.cf)} mono />
        <InfoRow label="Cod. SDI" value={fmt(client.sdi)} mono />
        <InfoRow label="PEC" value={fmt(client.pec)} />
        <div className="col-span-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted dark:text-[#9999a0] mb-1">Fatturazione elettronica</p>
          <BoolBadge value={!!client.e_invoice} labelTrue="Abilitata" labelFalse="Non abilitata" />
        </div>
      </InfoCard>

      {fullAddress && (
        <InfoCard title="Indirizzo" iconName="map-pin">
          {client.addr && <InfoRow label="Via / Indirizzo" value={client.addr} full />}
          {client.address_extra && <InfoRow label="Complemento" value={client.address_extra} full />}
          <InfoRow label="Città" value={client.city} />
          <InfoRow label="ZIP" value={client.zip} />
          <InfoRow label="Provincia" value={client.prov} />
          <InfoRow label="Paese" value={client.country} />
        </InfoCard>
      )}

      {(client.bank_iban || client.bank_name || client.bank_swift_code || client.default_payment_terms != null || client.default_discount != null) && (
        <InfoCard title="Banca & Pagamenti" iconName="credit-card">
          {client.bank_name && <InfoRow label="Banca" value={client.bank_name} full />}
          {client.bank_iban && <InfoRow label="IBAN" value={client.bank_iban} mono full />}
          {client.bank_swift_code && <InfoRow label="SWIFT / BIC" value={client.bank_swift_code} mono />}
          {client.default_payment_terms != null && (
            <InfoRow
              label="Termini di pagamento"
              value={`${client.default_payment_terms} ${client.default_payment_terms_type ?? "giorni"}`}
            />
          )}
          {client.default_discount != null && (
            <InfoRow label="Sconto default" value={`${client.default_discount}%`} />
          )}
          {client.default_vat != null && (
            <InfoRow label="IVA default" value={`${client.default_vat.value}% - ${client.default_vat.description}`} />
          )}
          {client.default_payment_method != null && (
            <InfoRow label="Metodo di pagamento" value={client.default_payment_method.name} />
          )}
        </InfoCard>
      )}

      {client.has_intent_declaration && (
        <InfoCard title="Dichiarazione d'intento" iconName="shield-check">
          <div className="col-span-2 mb-1">
            <BoolBadge value={true} labelTrue="Presente" labelFalse="" />
          </div>
          <InfoRow label="Numero protocollo" value={fmt(client.intent_declaration_protocol_number)} mono />
          <InfoRow label="Data protocollo" value={fmtDate(client.intent_declaration_protocol_date)} />
        </InfoCard>
      )}

      {client.notes && (
        <div className="md:col-span-2 bg-paper dark:bg-[#131316] border border-line dark:border-[#2a2a2e] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Icon name="annotation" className="w-3.5 h-3.5 text-muted dark:text-[#9999a0]" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted dark:text-[#9999a0]">
              Note
            </span>
          </div>
          <p className="text-[13px] font-body text-ink dark:text-[#f4f4f7] whitespace-pre-wrap leading-relaxed">
            {client.notes}
          </p>
        </div>
      )}

      <div className="md:col-span-2 bg-paper dark:bg-[#131316] border border-line dark:border-[#2a2a2e] rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Icon name="information-circle" className="w-3.5 h-3.5 text-muted dark:text-[#9999a0]" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted dark:text-[#9999a0]">
            Informazioni record
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4">
          <InfoRow label="ID interno" value={String(client.id)} mono />
          {client.fic_id != null && <InfoRow label="ID FIC" value={String(client.fic_id)} mono />}
          <InfoRow label="Creato il" value={fmtDate(client.created_at)} />
          <InfoRow label="Aggiornato il" value={fmtDate(client.updated_at)} />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted dark:text-[#9999a0] mb-1">Stato</p>
            <BoolBadge value={client.is_active} labelTrue="Attivo" labelFalse="Disattivo" />
          </div>
        </div>
      </div>
    </div>
  );
}
