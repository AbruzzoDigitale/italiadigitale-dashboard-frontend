import { useEffect, useState } from "react";
import { Icon } from "../../components/ui/Icon";
import { Spinner } from "../../components/ui/Spinner";
import { useTheme } from "../../context/ThemeContext";
import { chipStyle } from "../../utils/chipColor";
import { getMyClientsApi, type MyClientCard } from "../../api/users";

// I clienti che ti sono stati assegnati, come schede che scorrono in
// orizzontale. Non è un elenco da consultare — per quello c'è la pagina Clienti
// — ma un promemoria di chi segui: nome, dove sta, chi contattare, di che aree
// si tratta. Quanto si vede lo decide il backend in base al livello di accesso.

export function MyClientsCard() {
  const [clients, setClients] = useState<MyClientCard[] | null>(null);
  const [loading, setLoading] = useState(true);
  const { theme } = useTheme();

  useEffect(() => {
    let alive = true;
    getMyClientsApi()
      .then((res) => alive && setClients(res))
      .catch(() => alive && setClients([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  // Senza clienti assegnati la scheda non serve: sparisce invece di occupare
  // spazio con un riquadro vuoto.
  if (!loading && (clients?.length ?? 0) === 0) return null;

  return (
    <div className="rounded-lg border border-line bg-paper p-6 dark:border-[#2a2a2e] dark:bg-[#131316]">
      <h2
        className="mb-1 font-display font-bold tracking-tight text-ink dark:text-[#f4f4f7]"
        style={{ fontSize: "17px" }}
      >
        I tuoi clienti
      </h2>
      <p className="mb-4 font-body text-[13px] text-muted dark:text-[#9999a0]">
        {clients?.length ?? 0} assegnati a te. Le assegnazioni le cambia un amministratore.
      </p>

      {loading ? (
        <Spinner />
      ) : (
        <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:thin]">
          {clients?.map((client) => (
            <article
              key={client.id}
              className="flex w-60 shrink-0 flex-col gap-2 rounded-md border border-line p-3 dark:border-[#2a2a2e]"
            >
              <div className="flex items-start gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-cream text-[11px] font-bold uppercase text-muted dark:bg-[#1c1c20] dark:text-[#9999a0]">
                  {client.name.slice(0, 2)}
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[12px]" title={client.name}>
                    {client.commercial_name || client.name}
                  </b>
                  {(client.city || client.prov) && (
                    <span className="block truncate text-[11px] text-muted dark:text-[#9999a0]">
                      {[client.city, client.prov].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </span>
                {client.is_lead && (
                  <span className="shrink-0 rounded-pill border border-warning/30 bg-warning/10 px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-wider text-warning">
                    Lead
                  </span>
                )}
              </div>

              {client.contact && (
                <span className="flex items-center gap-1.5 text-[11px] text-muted dark:text-[#9999a0]">
                  <Icon name="user-circle" className="h-3 w-3 shrink-0" />
                  <span className="truncate">{client.contact}</span>
                </span>
              )}
              {client.email && (
                <a
                  href={`mailto:${client.email}`}
                  className="flex items-center gap-1.5 text-[11px] text-muted transition-colors hover:text-brand-magenta dark:text-[#9999a0]"
                >
                  <Icon name="mail" className="h-3 w-3 shrink-0" />
                  <span className="truncate">{client.email}</span>
                </a>
              )}
              {client.phone && (
                <a
                  href={`tel:${client.phone}`}
                  className="flex items-center gap-1.5 text-[11px] text-muted transition-colors hover:text-brand-magenta dark:text-[#9999a0]"
                >
                  <span className="w-3 shrink-0 text-center">·</span>
                  <span className="truncate">{client.phone}</span>
                </a>
              )}

              {client.work_areas.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {client.work_areas.map((area) => (
                    <span
                      key={area.id}
                      className="rounded-pill border border-line bg-cream px-2 py-[2px] text-[10px] font-medium dark:border-[#2a2a2e] dark:bg-[#1c1c20]"
                      style={chipStyle(area.color, theme === "dark")}
                    >
                      {area.name}
                    </span>
                  ))}
                </div>
              )}

              {/* Partita IVA e contratti arrivano solo ad admin e project
                  manager: per gli altri il backend li lascia vuoti. */}
              {(client.vat || client.contracts_count != null) && (
                <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-line pt-2 text-[10px] text-muted dark:border-[#2a2a2e] dark:text-[#9999a0]">
                  {client.vat && <span>P.IVA {client.vat}</span>}
                  {client.contracts_count != null && (
                    <span>
                      {client.contracts_count}{" "}
                      {client.contracts_count === 1 ? "contratto attivo" : "contratti attivi"}
                    </span>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
