import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Modal } from "../../components/ui/Modal";
import { Icon } from "../../components/ui/Icon";
import { Checkbox } from "../../components/ui/Checkbox";
import { setPushOpenMode, type PushOpenMode } from "./pushOpenPreference";
import { apriNotifica, apriNuovaScheda, subscribeOpenChoice } from "./openNotificationTarget";
import { getMyNotificationPreferencesApi, updateMyNotificationPreferencesApi } from "../../api/notifications";

// ─────────────────────────────────────────────────────────────────────────────
// Clic su una notifica push con la dashboard già aperta.
//
// Il service worker porta la scheda in primo piano e ci passa l'indirizzo (vedi
// public/sw.js): qui si decide dove aprirlo. Con la preferenza su "chiedi" esce
// questo popup, così chi sta lavorando su altro non si ritrova la pagina
// cambiata sotto le mani.
// ─────────────────────────────────────────────────────────────────────────────

export function PushOpenPrompt() {
  const navigate = useNavigate();
  const [url, setUrl] = useState<string | null>(null);
  const [ricorda, setRicorda] = useState(false);

  const vaiQui = useCallback(
    (target: string) => {
      // Indirizzo interno: navigazione react-router, niente ricaricamento.
      try {
        const u = new URL(target, window.location.origin);
        if (u.origin === window.location.origin) navigate(u.pathname + u.search + u.hash);
        else window.location.href = target;
      } catch {
        navigate(target);
      }
    },
    [navigate],
  );

  // Richieste di scelta: dal centro notifiche (clic in-app) e dal service worker
  // (clic sulla notifica push). La decisione è la stessa, quindi anche il popup.
  useEffect(() => {
    return subscribeOpenChoice((target) => {
      setRicorda(false);
      setUrl(target);
    });
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; url?: string } | null;
      if (!data || data.type !== "push-open" || !data.url) return;
      apriNotifica(data.url, vaiQui);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [vaiQui]);

  /** Salva la scelta sul profilo (DB), tenendo allineata la copia locale. */
  const ricordaScelta = async (modo: PushOpenMode) => {
    setPushOpenMode(modo);
    try {
      const attuali = await getMyNotificationPreferencesApi();
      await updateMyNotificationPreferencesApi({ ...attuali, push_open_mode: modo });
    } catch {
      // Rete assente: la copia locale vale comunque per questo dispositivo.
    }
  };

  const scegli = (modo: "same" | "new") => {
    const target = url;
    setUrl(null);
    if (ricorda) void ricordaScelta(modo);
    if (!target) return;
    if (modo === "same") vaiQui(target);
    else if (!apriNuovaScheda(target)) vaiQui(target); // popup bloccato: almeno ci arriva
  };

  return (
    <Modal
      open={url !== null}
      onClose={() => setUrl(null)}
      title="Aprire la notifica"
      description="Hai già la dashboard aperta: dove vuoi vedere questa pagina?"
      icon={<Icon name="bell" className="h-5 w-5" />}
      size="sm"
    >
      <div className="flex flex-col gap-3">
        <button type="button" className="pop-scelta" onClick={() => scegli("same")}>
          <Icon name="chevron-right" className="h-4 w-4" />
          <span>
            <b>Apri qui</b>
            <small>Sostituisce la pagina che stai guardando</small>
          </span>
        </button>
        <button type="button" className="pop-scelta" onClick={() => scegli("new")}>
          <Icon name="link" className="h-4 w-4" />
          <span>
            <b>Apri in una nuova scheda</b>
            <small>Lascia intatto il lavoro che hai aperto</small>
          </span>
        </button>
        <label className="pop-ricorda">
          <Checkbox checked={ricorda} onChange={setRicorda} />
          Ricorda la scelta e non chiedermelo più
        </label>
      </div>
    </Modal>
  );
}
