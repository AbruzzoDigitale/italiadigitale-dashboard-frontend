import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from "react";
import "./review-tab.css";
import { useToast } from "../../context/ToastContext";
import { Linkify } from "../ui/Linkify";
import { updateWorkItemApi } from "../../api/workItems";
import {
  listReviewCommentsApi,
  addReviewCommentApi,
  sendToClientApi,
  approveInternallyApi,
  approveClientApi,
  publishApi,
  sendBackApi,
  reopenReviewApi,
  type ReviewComment,
  type ReviewCommentsResponse,
  type ReviewBadge,
} from "../../api/reviewComments";
import { subscribeRealtime } from "../../features/realtime/realtimeBus";
import { ReviewWeightModal } from "./ReviewWeightModal";
import {
  deriveReviewPhase,
  reviewPhaseButtons,
  REVIEW_PHASE_LABEL,
  sendBackSource,
  type ReviewActionKey,
} from "./reviewFlow";

// ─────────────────────────────────────────────────────────────────────────────
// Scheda "Revisione" del modale Lavorazione.
//   · Thread commenti/segnalazioni (badge auto dal ruolo, chat-style)
//   · Macchina a stati della revisione: pulsanti di fase + modali rimando/pubblicazione
// Il peso è governato dal flusso di revisione (non più editabile a mano qui); la scadenza
// si cambia nella scheda Dettagli o nel modal di rimando. Dati via /work-items/{id}/review-*.
// ─────────────────────────────────────────────────────────────────────────────

type IconName = "chat" | "clock" | "calendar" | "send" | "rework" | "plus" | "building" | "refresh" | "check";

function Svg({ name, w = 15 }: { name: IconName; w?: number }) {
  const p: Record<IconName, ReactNode> = {
    chat: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    calendar: <><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
    send: <><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4z" /></>,
    rework: <><path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 5 5a5 5 0 0 1-5 5H7" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    building: <path d="M3 21h18M3 7l9-4 9 4M4 7v14M20 7v14" />,
    refresh: <><path d="M23 4v6h-6M1 20v-6h6" /><path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15" /></>,
    check: <path d="M9 11l3 3L22 4" />,
  };
  return (
    <svg viewBox="0 0 24 24" width={w} height={w} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      {p[name]}
    </svg>
  );
}

const BADGE_LABEL: Record<ReviewBadge, string> = { operatore: "Operatore", pm: "PM", cliente: "Cliente", admin: "Admin" };

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("it-IT", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function CommentRow({ c, me }: { c: ReviewComment; me: boolean }) {
  const badge = c.author_badge;
  const isRework = c.kind === "rework";
  return (
    <div className={"rv-cm" + (me ? " me" : "")}>
      <div className={"rv-av " + badge}>{(c.author_name || "?").slice(0, 2).toUpperCase()}</div>
      <div className="rv-cm-main">
        <div className="rv-cm-head">
          <span className="rv-cm-name">{c.author_name || "—"}</span>
          <span className={"rv-rolebadge " + badge}>
            {badge === "cliente" ? <Svg name="building" w={10} /> : null}
            {BADGE_LABEL[badge]}
          </span>
          <span className="rv-cm-time">{c.created_at ? fmtDateTime(c.created_at) : ""}</span>
        </div>
        {isRework ? (
          <span className={"rv-cm-tag rework" + (c.source === "cliente" ? " cliente" : "")}>
            <Svg name="rework" w={11} /> Rimando · {c.source ?? "interna"}
          </span>
        ) : (
          <span className="rv-cm-tag generic">Nota generica</span>
        )}
        <div className="rv-cm-text"><Linkify text={c.text} linkClassName="text-brand-magenta underline underline-offset-2 [overflow-wrap:anywhere]" /></div>
        {badge === "cliente" ? (
          <div className="rv-proxy">↳ inserito da {c.author_name ?? "—"} per conto del cliente</div>
        ) : null}
      </div>
    </div>
  );
}

export type ReviewTabHandle = {
  /** In lavorazione → revisione interna. */
  sendToReview: () => Promise<void>;
  /** Revisione interna → approvata internamente. */
  approveInternally: () => Promise<void>;
  /** Approvata internamente → revisione cliente (inviata al cliente). */
  sendToClient: () => Promise<void>;
  /** Revisione cliente → approvata dal cliente. */
  approveClient: () => Promise<void>;
  /** Approvata dal cliente → in pubblicazione. */
  publish: () => Promise<void>;
  /** In pubblicazione → completata. */
  complete: () => Promise<void>;
  /** In pubblicazione → torna in revisione (annulla, riparte il giro). */
  reopen: () => Promise<void>;
  /** Apre il modal di rimando (commento + scadenza + peso). */
  openSendBack: () => void;
  /** Apre il modal di pubblicazione (commento + peso). */
  openPublish: () => void;
};

type ReviewTabProps = {
  workItemId: number;
  canManage: boolean;
  /** Permesso (anche per operatori abilitati) di inviare/annullare l'invio al cliente.
   *  Per admin/PM è sempre true; abilita i pulsanti invio/rimozione invio anche a chi
   *  non ha l'intera toolbar di revisione (canManage). */
  canSendToClient?: boolean;
  /** Azienda della task: serve al modal di rimando per il peso configurato. */
  companyId?: number;
  onChanged?: () => void;
  /** Chiamato dopo un "Rimanda a correggere" andato a buon fine (per chiudere un eventuale modale dedicato). */
  onSentBack?: () => void;
  /** Se false, i due pulsanti azione NON vengono resi dentro la scheda: il parent li
   *  mette altrove (es. footer del modale) usando il ref imperativo. Default true. */
  renderActionsInline?: boolean;
};

export const ReviewTab = forwardRef<ReviewTabHandle, ReviewTabProps>(function ReviewTab({
  workItemId,
  canManage,
  canSendToClient = false,
  companyId,
  onChanged,
  onSentBack,
  renderActionsInline = true,
}, ref) {
  const toast = useToast();
  const [data, setData] = useState<ReviewCommentsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  // composer (nota generica: badge automatico dal ruolo lato server)
  const [text, setText] = useState("");

  // modali "Rimanda indietro e correggi" e "Metti in pubblicazione"
  const [sendBackOpen, setSendBackOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);

  const review = data?.review ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listReviewCommentsApi(workItemId);
      setData(res);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [workItemId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Aggiornamento live del thread: ricarica SOLO commenti + meta di revisione,
  // senza toccare i controlli editabili (tempo/scadenza/inviata al cliente) che
  // l'utente potrebbe star modificando.
  const refreshLive = useCallback(async () => {
    try {
      const res = await listReviewCommentsApi(workItemId);
      setData(res);
    } catch {
      // refresh in background: silenzioso
    }
  }, [workItemId]);

  // Si aggancia allo stream SSE (via bus): quando arriva un segnale, ricarica.
  useEffect(() => subscribeRealtime(() => { void refreshLive(); }), [refreshLive]);

  useEffect(() => {
    // scrolla in fondo quando cambiano i commenti
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [data?.comments.length]);

  const reload = () => {
    void load();
    onChanged?.();
  };

  // ── azioni ────────────────────────────────────────────────────────────────
  const addNote = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await addReviewCommentApi(workItemId, { text: text.trim() });
      setText("");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Wrapper generico per le transizioni di fase (avvia busy, notifica, ricarica).
  const runTransition = async (fn: () => Promise<unknown>, successMsg: string, closeAfter = false) => {
    setBusy(true);
    try {
      await fn();
      toast.success(successMsg);
      reload();
      if (closeAfter) onSentBack?.();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const doSendToReview = () =>
    runTransition(() => updateWorkItemApi(workItemId, { status: "review" }), "Inviata in revisione.");
  const doApproveInternally = () =>
    runTransition(() => approveInternallyApi(workItemId), "Approvata internamente.");
  const doSendToClient = () =>
    runTransition(() => sendToClientApi(workItemId, true), "Inviata al cliente.");
  const doUnsendToClient = () =>
    runTransition(() => sendToClientApi(workItemId, false), "Invio al cliente rimosso.");
  const doApproveClient = () =>
    runTransition(() => approveClientApi(workItemId), "Approvata dal cliente.");
  const doReopen = () =>
    runTransition(() => reopenReviewApi(workItemId), "Tornata in revisione.");
  const doComplete = () =>
    runTransition(() => updateWorkItemApi(workItemId, { status: "completed" }), "Completata.", true);

  useImperativeHandle(ref, () => ({
    sendToReview: () => doSendToReview(),
    approveInternally: () => doApproveInternally(),
    sendToClient: () => doSendToClient(),
    approveClient: () => doApproveClient(),
    publish: () => { setPublishOpen(true); return Promise.resolve(); },
    complete: () => doComplete(),
    reopen: () => doReopen(),
    openSendBack: () => setSendBackOpen(true),
    openPublish: () => setPublishOpen(true),
  }));

  // Mappa una chiave azione (da reviewFlow) al relativo handler interno.
  const runActionKey = (key: ReviewActionKey) => {
    switch (key) {
      case "sendToReview": return void doSendToReview();
      case "approveInternally": return void doApproveInternally();
      case "sendToClient": return void doSendToClient();
      case "unsendToClient": return void doUnsendToClient();
      case "approveClient": return void doApproveClient();
      case "publish": return setPublishOpen(true);
      case "complete": return void doComplete();
      case "reopen": return void doReopen();
      case "sendBack": return setSendBackOpen(true);
    }
  };

  if (loading) return <div className="rv"><div className="rv-state">Caricamento revisione…</div></div>;
  if (error) return <div className="rv"><div className="rv-state">{error} · <button className="rv-btn ghost" onClick={() => void load()}>Riprova</button></div></div>;
  if (!data || !review) return <div className="rv"><div className="rv-state">Nessun dato di revisione.</div></div>;

  const meId = data.current_user_id;
  const phase = deriveReviewPhase(review.status, review.review_stage, review.client_approved_at);
  const phaseBtns = reviewPhaseButtons(phase);

  return (
    <div className="rv">
      {/* stato revisione: fase corrente della macchina a stati */}
      <div className="rv-chips">
        {phase !== "none" ? (
          <span className="rv-chip review">
            <Svg name={phase === "pubblicazione" ? "check" : "clock"} w={12} /> {REVIEW_PHASE_LABEL[phase]}
          </span>
        ) : (
          <span className="rv-chip review"><Svg name="clock" w={12} /> {review.status}</span>
        )}
        {review.rework_count > 0 ? (
          <span className="rv-chip rework"><Svg name="rework" w={12} /> {review.rework_count} {review.rework_count === 1 ? "rimando" : "rimandi"}</span>
        ) : null}
        {review.delivered_to_client_at ? (
          <span className="rv-chip stage"><Svg name="send" w={12} /> Inviata al cliente</span>
        ) : null}
      </div>

      {/* Azioni "consegna al cliente" disponibili anche a operatori abilitati (canSendToClient),
          non solo alla toolbar di revisione completa. Il "Rimuovi invio" annulla senza rimando. */}
      {(() => {
        // "Invia al cliente" per gli operatori abilitati: i manager lo hanno già nella toolbar/footer.
        const showSend = phase === "approvata_interna" && canSendToClient && !canManage;
        // "Rimuovi invio al cliente" (annulla senza rimando indietro): per chiunque possa inviare.
        const showUnsend = phase === "cliente" && !!review.delivered_to_client_at && (canManage || canSendToClient);
        if (!showSend && !showUnsend) return null;
        return (
          <div className="rv-submitbar">
            {showUnsend ? (
              <button className="rv-btn ghost rv-submit" onClick={() => runActionKey("unsendToClient")} disabled={busy}>
                <Svg name="refresh" /> Rimuovi invio al cliente
              </button>
            ) : null}
            {showSend ? (
              <button className="rv-btn primary rv-submit" onClick={() => runActionKey("sendToClient")} disabled={busy}>
                <Svg name="send" /> Invia al cliente
              </button>
            ) : null}
          </div>
        );
      })()}

      {/* A · COMMENTI */}
      <section className="rv-card">
        <div className="rv-card-head">
          <span className="rv-card-title"><Svg name="chat" /> Commenti &amp; segnalazioni</span>
          <span className="rv-card-hint">Operatore · PM · Cliente</span>
        </div>
        <div className="rv-card-body">
          <div className="rv-thread" ref={threadRef}>
            {data.comments.length === 0 ? (
              <div className="rv-empty">Nessun commento. Scrivi la prima nota o segnalazione.</div>
            ) : (
              data.comments.map((c) => <CommentRow key={c.id} c={c} me={c.author_user_id === meId} />)
            )}
          </div>

          <div className="rv-composer">
            <div className="rv-inputwrap">
              <textarea
                className="rv-textarea"
                rows={2}
                placeholder="Scrivi una nota…"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  // Invio come su WhatsApp: Enter invia, Shift+Enter va a capo.
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (!busy && text.trim()) void addNote();
                  }
                }}
              />
              <button
                className="rv-send"
                onClick={() => void addNote()}
                disabled={busy || !text.trim()}
                title="Invia"
                aria-label="Invia nota"
              >
                <Svg name="send" w={16} />
              </button>
            </div>
            <span className="rv-actions-hint">
              Il badge è automatico dal tuo ruolo. I rimandi si registrano da “Rimanda indietro e correggi”.
            </span>
          </div>
        </div>
      </section>

      {/* B, C, D: solo revisore/PM. L'operatore vede unicamente i commenti. */}
      {canManage && (
        <>
      {/* Peso e scadenza non si gestiscono più qui: il peso è tutto governato dal flusso di
          revisione (modali di rimando/pubblicazione) e la scadenza dalla scheda Dettagli. */}

      {/* Consegna al cliente: stamp informativo (l'invio avviene col pulsante di fase). */}
      {review.delivered_to_client_at ? (
        <section className="rv-card">
          <div className="rv-card-body">
            <div className="rv-stamp">✓ Consegnata al cliente il <b>{fmtDateTime(review.delivered_to_client_at)}</b></div>
          </div>
        </section>
      ) : null}
        </>
      )}

      {/* Azioni di fase inline: solo dove non c'è un footer dedicato (es. modale Revisione). */}
      {renderActionsInline && canManage && (phaseBtns.primary || phaseBtns.secondary) ? (
        <div className="rv-submitbar">
          {phaseBtns.secondary ? (
            <button className="rv-btn warn rv-submit" onClick={() => runActionKey(phaseBtns.secondary!.key)} disabled={busy}>
              <Svg name={phaseBtns.secondary.key === "reopen" ? "refresh" : "rework"} /> {phaseBtns.secondary.label}
            </button>
          ) : null}
          {phaseBtns.primary ? (
            <button className="rv-btn primary rv-submit" onClick={() => runActionKey(phaseBtns.primary!.key)} disabled={busy}>
              <Svg name={phaseBtns.primary.key === "sendToClient" || phaseBtns.primary.key === "sendToReview" ? "send" : "check"} /> {phaseBtns.primary.label}
            </button>
          ) : null}
        </div>
      ) : null}

      <ReviewWeightModal
        open={sendBackOpen}
        onClose={() => setSendBackOpen(false)}
        title="Rimanda indietro e correggi"
        description={
          sendBackSource(phase) === "cliente"
            ? "Il commento verrà attribuito al cliente come modifica da fare."
            : "Il commento verrà attribuito al PM come modifica da fare."
        }
        confirmLabel="Rimanda indietro"
        situationKey={sendBackSource(phase) === "cliente" ? "rework_cliente" : "rework"}
        companyId={companyId}
        estimatedHours={review.estimated_hours}
        commentRequired
        commentPlaceholder="Cosa va corretto…"
        showDeadline
        currentDeadline={review.deadline_date}
        onConfirm={async ({ text, factor, deadline }) => {
          await sendBackApi(workItemId, {
            source: sendBackSource(phase),
            text,
            load_weight_factor: factor,
            deadline_date: deadline,
          });
          reload();
          onSentBack?.();
        }}
      />

      <ReviewWeightModal
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        title="Metti in pubblicazione"
        description="La task torna in corso con il peso di pubblicazione. Il commento è una nota generica col tuo badge."
        confirmLabel="Metti in pubblicazione"
        situationKey="awaiting_publish"
        companyId={companyId}
        estimatedHours={review.estimated_hours}
        commentRequired={false}
        commentPlaceholder="Nota (facoltativa)…"
        onConfirm={async ({ text, factor }) => {
          await publishApi(workItemId, { text: text || null, load_weight_factor: factor });
          reload();
          onSentBack?.();
        }}
      />
    </div>
  );
});
