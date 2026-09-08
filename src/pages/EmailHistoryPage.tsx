import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getButtonRunApi,
  listButtonRunsApi,
  type ButtonRunDetail,
  type ButtonRunLogItem,
} from "../api/buttonActions";
import { Badge } from "../components/ui/Badge";
import { Icon } from "../components/ui/Icon";
import { Input } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { PageSectionHeader } from "../components/ui/PageSectionHeader";
import { SegmentedSwitch } from "../components/ui/SegmentedSwitch";
import { Spinner } from "../components/ui/Spinner";
import { useAuth } from "../hooks/useAuth";
import { useSelectedCompanyId } from "../hooks/useSelectedCompanyId";
import { useToast } from "../context/ToastContext";

/**
 * Storico delle email partite dai bottoni configurabili — schermata da admin.
 *
 * Non è un registro di consegna: qui c'è ciò che il server di posta ha
 * ACCETTATO. Se poi la casella del destinatario rifiuta, la riga resta «ok».
 * La cosa che vale davvero è la copia del corpo spedito: il modello si
 * riscrive quando si vuole, quello che è uscito no.
 */

type Filtro = "tutte" | "ok" | "error";

function quando(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function testo(payload: Record<string, unknown>, chiave: string): string {
  const v = payload?.[chiave];
  if (Array.isArray(v)) return v.join(", ");
  return v == null ? "" : String(v);
}

export function EmailHistoryPage() {
  const toast = useToast();
  const { user, activeCompanyId } = useAuth();
  const { selectedCompanyId } = useSelectedCompanyId(activeCompanyId ?? user?.company_id ?? null);
  const companyId = selectedCompanyId ?? activeCompanyId ?? user?.company_id ?? null;

  const [righe, setRighe] = useState<ButtonRunLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("tutte");
  const [cerca, setCerca] = useState("");
  const [aperta, setAperta] = useState<ButtonRunDetail | null>(null);
  const [caricandoDettaglio, setCaricandoDettaglio] = useState(false);

  const carica = useCallback(async () => {
    if (companyId == null) return;
    setLoading(true);
    setErrore(null);
    try {
      const dati = await listButtonRunsApi(companyId, { action_type: "send_email", limit: 200 });
      setRighe(dati);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Impossibile leggere lo storico");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void carica();
  }, [carica]);

  const filtrate = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    return righe.filter((r) => {
      if (filtro !== "tutte" && r.status !== filtro) return false;
      if (!q) return true;
      const campi = [
        testo(r.payload, "entity_label"),
        testo(r.payload, "to"),
        testo(r.payload, "cc"),
        testo(r.payload, "subject"),
        testo(r.payload, "sender_email"),
        r.actor_name,
      ]
        .join(" ")
        .toLowerCase();
      return campi.includes(q);
    });
  }, [righe, filtro, cerca]);

  const apri = async (r: ButtonRunLogItem) => {
    if (companyId == null) return;
    setCaricandoDettaglio(true);
    try {
      setAperta(await getButtonRunApi(companyId, r.id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Impossibile aprire il messaggio");
    } finally {
      setCaricandoDettaglio(false);
    }
  };

  const falliti = righe.filter((r) => r.status !== "ok").length;

  return (
    <div className="mx-auto flex h-full w-full flex-col px-6 py-8 min-h-0 animate-fadeIn">
      <div className="flex flex-none flex-wrap items-center justify-between gap-3">
        <PageSectionHeader
          icon={<Icon name="mail" className="w-6 h-6" />}
          title={`Storico email${righe.length ? ` (${righe.length})` : ""}`}
        />
        <div className="flex items-center gap-3">
          <SegmentedSwitch
            value={filtro}
            onChange={(v) => setFiltro(v as Filtro)}
            ariaLabel="Filtra per esito"
            options={[
              { value: "tutte", label: <>Tutte</> },
              { value: "ok", label: <>Inviate</> },
              { value: "error", label: <>Non riuscite{falliti ? ` (${falliti})` : ""}</> },
            ]}
          />
          <button
            type="button"
            onClick={() => void carica()}
            title="Ricarica"
            aria-label="Ricarica"
            className="inline-grid h-9 w-9 place-items-center rounded-md border border-line text-ink transition-colors hover:bg-cream dark:border-[#2a2a2e] dark:text-[#f4f4f7] dark:hover:bg-[#1c1c20]"
          >
            <Icon name="refresh-cw" className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      <p className="mt-1 flex-none font-body text-[13px] text-muted dark:text-[#9999a0]">
        Le email partite dai bottoni del gestionale. «Inviata» significa accettata dal server di
        posta: un eventuale rifiuto della casella del destinatario non compare qui.
      </p>

      <div className="mt-4 flex-none">
        <div className="relative max-w-md">
          <Icon
            name="search"
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
          />
          <Input
            value={cerca}
            onChange={(e) => setCerca(e.target.value)}
            placeholder="Cerca per sito, destinatario, oggetto o mittente…"
            className="pl-9"
          />
        </div>
      </div>

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : errore ? (
          <div className="rounded-md border border-danger/30 bg-danger/5 px-4 py-6 text-sm text-danger">
            {errore}
          </div>
        ) : filtrate.length === 0 ? (
          <div className="rounded-md border border-dashed border-line px-4 py-10 text-center text-sm text-muted dark:border-[#2a2a2e] dark:text-[#9999a0]">
            {righe.length === 0
              ? "Nessuna email ancora inviata dai bottoni del gestionale."
              : "Nessuna email corrisponde ai filtri."}
          </div>
        ) : (
          <table className="w-full min-w-[900px] table-fixed border-separate border-spacing-y-2">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
                <th className="w-[15%] px-3 py-1">Quando</th>
                <th className="w-[17%] px-3 py-1">Sito</th>
                <th className="w-[20%] px-3 py-1">Destinatario</th>
                <th className="w-[26%] px-3 py-1">Oggetto</th>
                <th className="w-[14%] px-3 py-1">Inviata da</th>
                <th className="w-[8%] px-3 py-1 text-right">Esito</th>
              </tr>
            </thead>
            <tbody>
              {filtrate.map((r) => {
                const ok = r.status === "ok";
                return (
                  <tr
                    key={r.id}
                    onClick={() => void apri(r)}
                    className="sp-pop-in cursor-pointer bg-cream align-middle transition-colors hover:bg-paper dark:bg-[#1c1c20] dark:hover:bg-[#131316]"
                    title="Apri il messaggio spedito"
                  >
                    <td className="rounded-l-md px-3 py-3 text-[12.5px] text-muted dark:text-[#9999a0]">
                      {quando(r.created_at)}
                    </td>
                    <td className="px-3 py-3 text-[13px] font-semibold text-ink dark:text-[#f4f4f7]">
                      <span className="block truncate">{testo(r.payload, "entity_label") || "—"}</span>
                    </td>
                    <td className="px-3 py-3 text-[12.5px] text-ink dark:text-[#f4f4f7]">
                      <span className="block truncate">{testo(r.payload, "to") || "—"}</span>
                      {testo(r.payload, "cc") && (
                        <span className="block truncate text-[11.5px] text-muted dark:text-[#9999a0]">
                          cc: {testo(r.payload, "cc")}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-[12.5px] text-ink dark:text-[#f4f4f7]">
                      <span className="block truncate">{testo(r.payload, "subject") || "—"}</span>
                    </td>
                    <td className="px-3 py-3 text-[12.5px] text-muted dark:text-[#9999a0]">
                      <span className="block truncate">{r.actor_name || "—"}</span>
                      <span className="block truncate text-[11.5px]">
                        {testo(r.payload, "sender_email")}
                      </span>
                    </td>
                    <td className="rounded-r-md px-3 py-3 text-right">
                      <Badge variant={ok ? "success" : "danger"}>{ok ? "Inviata" : "Errore"}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        open={!!aperta || caricandoDettaglio}
        onClose={() => setAperta(null)}
        size="2xl"
        icon={<Icon name="mail" className="h-5 w-5" />}
        title={aperta ? testo(aperta.payload, "subject") || "Messaggio inviato" : "Messaggio inviato"}
        description={
          aperta
            ? `${quando(aperta.created_at)} · a ${testo(aperta.payload, "to")} · da ${testo(aperta.payload, "sender_email")}`
            : undefined
        }
      >
        {!aperta ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {aperta.status !== "ok" && (
              <div className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-[12.5px] text-danger">
                {aperta.detail || "Invio non riuscito."}
              </div>
            )}
            {aperta.body_html.trim() ? (
              // Foglio bianco: è la copia di un'email, non un pezzo di interfaccia.
              <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-line bg-white p-5 dark:border-[#2a2a2e]">
                <div
                  className="prose-email text-[13px] leading-relaxed text-[#1a1a1a]"
                  dangerouslySetInnerHTML={{ __html: aperta.body_html }}
                />
              </div>
            ) : (
              <p className="rounded-md border border-dashed border-line px-4 py-6 text-center text-[12.5px] text-muted dark:border-[#2a2a2e] dark:text-[#9999a0]">
                Nessuna copia del corpo: l'invio non è andato a buon fine, quindi non c'era niente
                da archiviare.
              </p>
            )}
            <p className="text-[11.5px] text-muted dark:text-[#9999a0]">
              Modello usato: {testo(aperta.payload, "template_name") || "—"}
              {testo(aperta.payload, "cc") ? ` · cc: ${testo(aperta.payload, "cc")}` : ""}
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
