import { useAuth } from "../hooks/useAuth";
import { useUsers } from "../hooks/useUsers";
import { StatCard } from "../components/dashboard/StatCard";
import { Avatar } from "../components/ui/Avatar";
import { Badge } from "../components/ui/Badge";
import { Spinner } from "../components/ui/Spinner";
import { Icon } from "../components/ui/Icon";

export function DashboardHome() {
  const { user } = useAuth();
  const { users, isLoading, error } = useUsers();

  const adminCount = users.filter((u) => u.is_admin).length;
  const activeCount = users.length;

  return (
    /* .view padding: 32px 40px 80px */
    <div className="px-6 py-8 pb-20 mx-auto w-full">

      {/* ── Header — stile .section-* del prototipo ──────── */}
      <div className="mb-8 animate-fadeIn">
        {/* .section-eyebrow */}
        <div className="section-eyebrow">
          <span className="w-1.5 h-1.5 rounded-full bg-success inline-block" />
          Sistema operativo
        </div>
        {/* .section-title — 44px, font-display, tracking-tight */}
        <h1 className="section-title">
          Benvenuto,{" "}
          <span style={{ color: "#c41284" }}>
            {user?.full_name?.split(" ")[0] ?? user?.username}
          </span>
        </h1>
        {/* .section-lead */}
        <p className="section-lead">
          Panoramica generale della piattaforma Italia Digitale.
        </p>
      </div>

      {/* ── KPI grid — .dash-grid (4 col) ────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-8">
        <StatCard
          label="Utenti totali"
          value={isLoading ? "—" : activeCount}
          icon={<Icon name="users" className="w-5 h-5" />}
          trend="Registrati nel sistema"
          accent="bg-brand-purple"
        />
        <StatCard
          label="Amministratori"
          value={isLoading ? "—" : adminCount}
          icon={<Icon name="shield" className="w-5 h-5" />}
          trend="Con accesso admin"
          accent="bg-brand-magenta"
        />
        <StatCard
          label="Stato API"
          value="Online"
          icon={<Icon name="activity" className="w-5 h-5" />}
          trend="Tutti i servizi attivi"
          trendUp
          accent="bg-success"
        />
      </div>

      {/* ── Tabella utenti — stile .card del prototipo ───── */}
      <div
        className="bg-paper dark:bg-[#131316] rounded-lg border border-line dark:border-[#2a2a2e] overflow-hidden animate-fadeIn"
      >
        {/* Card header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-line dark:border-[#2a2a2e]">
          <div>
            <h2
              className="font-display font-bold tracking-tight text-ink dark:text-[#f4f4f7]"
              style={{ fontSize: "17px" }}
            >
              Utenti recenti
            </h2>
            <p className="font-body text-[13px] text-muted dark:text-[#9999a0] mt-0.5">
              Lista degli utenti registrati nella piattaforma
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner size="lg" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-16">
            <p className="font-body text-sm text-danger">{error}</p>
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted dark:text-[#9999a0]">
            <Icon name="users" className="w-10 h-10 mb-3 opacity-30" />
            <p className="font-body text-sm">Nessun utente trovato</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm font-body">
              <thead>
                <tr className="border-b border-line dark:border-[#2a2a2e]">
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted dark:text-[#9999a0]">
                    Utente
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted dark:text-[#9999a0] hidden sm:table-cell">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted dark:text-[#9999a0]">
                    Ruolo
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line dark:divide-[#2a2a2e]">
                {users.slice(0, 8).map((u) => (
                  <tr
                    key={u.id}
                    className="hover:bg-cream dark:hover:bg-[#1c1c20] transition-colors duration-100"
                  >
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={u.full_name || u.username} src={u.avatar_url} size="sm" />
                        <div>
                          <p className="font-semibold text-ink dark:text-[#f4f4f7]">
                            {u.full_name || u.username}
                          </p>
                          <p className="text-[11px] text-muted dark:text-[#9999a0]">
                            @{u.username}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-3 text-muted dark:text-[#9999a0] hidden sm:table-cell">
                      {u.email}
                    </td>
                    <td className="px-6 py-3">
                      <Badge variant={u.is_admin ? "admin" : "user"}>
                        {u.is_admin ? "Admin" : "Utente"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
