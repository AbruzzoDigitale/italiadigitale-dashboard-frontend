import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Modal } from "../../components/ui/Modal";
import { Icon } from "../../components/ui/Icon";
import { Spinner } from "../../components/ui/Spinner";
import { Button } from "../../components/ui/Button";
import { useToast } from "../../context/ToastContext";
import {
  archiveNotificationApi,
  getCommunicationApi,
  markNotificationReadApi,
  markNotificationUnreadApi,
  unarchiveNotificationApi,
  type CommunicationDetail,
} from "../../api/notifications";
import { COMM_PARAM, communicationLink } from "./communicationLink";
import "./notifications.css";

// ─────────────────────────────────────────────────────────────────────────────
// Comunicazione aperta per esteso, come un messaggio di chat.
//
// Vive nel layout e si apre da `?comunicazione=<id>` su QUALUNQUE pagina: la
// rotta /comunicazioni è riservata ad admin e PM, ma la comunicazione la deve
// poter leggere anche l'operatore che l'ha ricevuta — dalla campanella, dalla
// notifica push o da un link condiviso.
// ─────────────────────────────────────────────────────────────────────────────

function dataEstesa(iso: string): string {
  try {
    return new Date(iso).toLocaleString("it-IT", {
      day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function iniziali(nome: string | null): string {
  return (nome ?? "?")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function scopeLabel(c: CommunicationDetail): string {
  if (c.scope === "area") return `Area · ${c.work_area_name ?? "—"}`;
  if (c.scope === "operatore") return `Operatore · ${c.target_user_ids?.length ?? 0} destinatari`;
  return "Tutta l'azienda";
}

export function CommunicationModal() {
  const [searchParams, setSearchParams] = useSearchParams();
  const toast = useToast();
  const idParam = searchParams.get(COMM_PARAM);
  const id = idParam && !Number.isNaN(Number(idParam)) ? Number(idParam) : null;

  const [comm, setComm] = useState<CommunicationDetail | null>(null);
  const [busy, setBusy] = useState(false);
  // Dedotto invece di tenuto in stato: evita di azzerare/riaccendere flag dentro
  // l'effetto a ogni cambio di indirizzo.
  const mostrata = comm && comm.id === id ? comm : null;
  const loading = id !== null && mostrata === null;

  const chiudi = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete(COMM_PARAM);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (id === null) return;
    let vivo = true;
    getCommunicationApi(id)
      .then((c) => {
        if (!vivo) return;
        setComm(c);
        // Aprirla è leggerla: allinea la campanella senza un giro in più.
        if (c.notification_id && !c.is_read) void markNotificationReadApi(c.notification_id).catch(() => {});
      })
      .catch((e: Error) => {
        if (!vivo) return;
        toast.error(e.message);
        chiudi();
      })
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const azione = async (fn: () => Promise<void>, messaggio: string, patch: Partial<CommunicationDetail>) => {
    setBusy(true);
    try {
      await fn();
      setComm((c) => (c ? { ...c, ...patch } : c));
      toast.success(messaggio);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Operazione non riuscita");
    } finally {
      setBusy(false);
    }
  };

  const copiaLink = async () => {
    const url = new URL(communicationLink(mostrata?.id ?? 0), window.location.origin).toString();
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiato: si apre su questa comunicazione");
    } catch {
      toast.error("Non riesco a copiare il link");
    }
  };

  const nid = mostrata?.notification_id ?? null;

  return (
    <Modal
      open={id !== null}
      onClose={chiudi}
      title={mostrata?.title ?? "Comunicazione"}
      description={mostrata ? scopeLabel(mostrata) : undefined}
      icon={<Icon name="annotation" className="h-5 w-5" />}
      size="lg"
      headerActions={
        mostrata ? (
          <button type="button" className="cm-linkbtn" onClick={() => void copiaLink()} title="Copia il link di questa comunicazione">
            <Icon name="link" className="h-4 w-4" />
          </button>
        ) : undefined
      }
      footer={
        mostrata && nid ? (
          <div className="cm-actions">
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() =>
                void azione(
                  () => (mostrata.is_read ? markNotificationUnreadApi(nid) : markNotificationReadApi(nid)),
                  mostrata.is_read ? "Segnata come da leggere" : "Segnata come letta",
                  { is_read: !mostrata.is_read },
                )
              }
            >
              <Icon name={mostrata.is_read ? "eye-off" : "check"} className="h-4 w-4" />
              {mostrata.is_read ? "Segna da leggere" : "Segna come letta"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() =>
                void azione(
                  () => (mostrata.is_archived ? unarchiveNotificationApi(nid) : archiveNotificationApi(nid)),
                  mostrata.is_archived ? "Ripristinata nel centro notifiche" : "Archiviata",
                  { is_archived: !mostrata.is_archived },
                )
              }
            >
              <Icon name={mostrata.is_archived ? "refresh-cw" : "archive"} className="h-4 w-4" />
              {mostrata.is_archived ? "Ripristina" : "Archivia"}
            </Button>
          </div>
        ) : undefined
      }
    >
      {loading ? (
        <div className="cm-loading">
          <Spinner /> Carico la comunicazione…
        </div>
      ) : mostrata ? (
        <div className="cm-chat">
          <div className="cm-msg">
            <span className="cm-avatar">{iniziali(mostrata.author_name)}</span>
            <div className="cm-bolla">
              <div className="cm-meta">
                <b>{mostrata.author_name ?? "Sistema"}</b>
                <span>{dataEstesa(mostrata.created_at)}</span>
              </div>
              <div className="cm-titolo">{mostrata.title}</div>
              {mostrata.body ? <p className="cm-corpo">{mostrata.body}</p> : <p className="cm-corpo cm-vuoto">Nessun testo.</p>}
            </div>
          </div>
          {mostrata.can_manage && mostrata.recipients_count > 0 ? (
            <div className="cm-letture">
              <Icon name="users" className="h-3.5 w-3.5" />
              Letta da <b>{mostrata.read_count}</b> destinatari su <b>{mostrata.recipients_count}</b>
            </div>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}
