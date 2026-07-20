import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from "react";
import "./review-tab.css";
import { useToast } from "../../context/ToastContext";
import { Input } from "../ui/Input";
import { updateWorkItemApi, type UpdateWorkItemPayload } from "../../api/workItems";
import {
  listReviewCommentsApi,
  addReviewCommentApi,
  sendToClientApi,
  sendBackApi,
  type ReviewComment,
  type ReviewCommentsResponse,
  type ReviewBadge,
  type ReviewSource,
} from "../../api/reviewComments";
import { subscribeRealtime } from "../../features/realtime/realtimeBus";

// ─────────────────────────────────────────────────────────────────────────────
// Scheda "Revisione" del modale Lavorazione.
//   · Thread commenti/segnalazioni (badge operatore/pm/cliente, chat-style)
//   · Tempo di lavorazione sul calendario → ricalibra load_weight_factor
//   · Riprogramma scadenza
//   · Inviata al cliente (tracciata)
// Design/logica dal mockup approvato; dati reali via /work-items/{id}/review-*.
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

const BADGE_LABEL: Record<ReviewBadge, string> = { operatore: "Operatore", pm: "PM", cliente: "Cliente" };

function fmtMin(m: number): string {
  const h = Math.floor(m / 60);
  const mm = Math.round(m % 60);
  return h ? `${h}h ${String(mm).padStart(2, "0")}m` : `${mm} min`;
}
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso.length <= 10 ? iso + "T00:00:00" : iso);
  return d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
}
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
        <div className="rv-cm-text">{c.text}</div>
        {badge === "cliente" ? (
          <div className="rv-proxy">↳ inserito da {c.author_name ?? "—"} per conto del cliente</div>
        ) : null}
      </div>
    </div>
  );
}

export type ReviewTabHandle = {
  /** Salva tutto e rimanda indietro. */
  sendBack: () => Promise<void>;
  /** Salva tutto senza rimandare (ed eventualmente segna inviata al cliente). */
  saveConclude: () => Promise<void>;
};

type ReviewTabProps = {
  workItemId: number;
  canManage: boolean;
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

  // composer
  const [text, setText] = useState("");
  const [badge, setBadge] = useState<ReviewBadge>(canManage ? "pm" : "operatore");
  const [kind, setKind] = useState<"generic" | "rework">("generic");
  const [source, setSource] = useState<ReviewSource>("interna");

  // tempo/peso
  const [mode, setMode] = useState<"preset" | "manual">("preset");
  const [minutes, setMinutes] = useState<number>(15);
  const [factorInput, setFactorInput] = useState<string>("0.25");

  // scadenza (campo sempre visibile: si salva coi pulsanti gemelli)
  const [newDate, setNewDate] = useState<string>("");

  // inviata al cliente (stato locale: viene persistito coi pulsanti gemelli, non al toggle)
  const [delivered, setDelivered] = useState(false);

  const review = data?.review ?? null;
  const baseMin = Math.round((review?.estimated_hours ?? 0) * 60);
  const hasBase = baseMin > 0;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listReviewCommentsApi(workItemId);
      setData(res);
      const r = res.review;
      const f = r.load_weight_factor ?? 1;
      const bmin = Math.round((r.estimated_hours ?? 0) * 60);
      setMinutes(bmin > 0 ? Math.max(1, Math.round(f * bmin)) : 15);
      setFactorInput(f.toFixed(2));
      setSource(r.review_stage === "cliente" ? "cliente" : "interna");
      setNewDate(r.deadline_date ?? "");
      setDelivered(!!r.delivered_to_client_at);
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

  // fattore effettivo mostrato/da salvare
  const factor = useMemo(() => {
    if (mode === "manual") return Math.max(0, Number(factorInput) || 0);
    return hasBase ? minutes / baseMin : Number(factorInput) || 0;
  }, [mode, factorInput, minutes, baseMin, hasBase]);
  const effMin = Math.round(factor * baseMin);

  const setMinutesSynced = (m: number) => {
    const v = Math.max(1, Math.round(m));
    setMinutes(v);
    if (hasBase) setFactorInput((v / baseMin).toFixed(2));
  };
  const setFactorSynced = (f: number) => {
    const v = Math.max(0, f);
    setFactorInput(v.toFixed(2));
    if (hasBase) setMinutes(Math.max(1, Math.round(v * baseMin)));
  };

  const reload = () => {
    void load();
    onChanged?.();
  };

  // ── azioni ────────────────────────────────────────────────────────────────
  const addNote = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await addReviewCommentApi(workItemId, {
        author_badge: badge,
        kind,
        source: kind === "rework" ? source : null,
        text: text.trim(),
      });
      setText("");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Persistenza comune dei due pulsanti gemelli: tempo/peso + scadenza (se cambiata)
  // + stato "inviata al cliente" (se cambiato). Niente più salva per singola sezione.
  const persistCommon = async () => {
    if (!review) return;
    const patch: UpdateWorkItemPayload = { load_weight_factor: Number(factor.toFixed(2)) };
    if (newDate && newDate !== (review.deadline_date ?? "")) patch.deadline_date = newDate;
    await updateWorkItemApi(workItemId, patch);
    if (delivered !== !!review.delivered_to_client_at) {
      await sendToClientApi(workItemId, delivered);
    }
  };

  const doSendBack = async () => {
    if (!review) return;
    setBusy(true);
    try {
      await persistCommon();
      await sendBackApi(workItemId, { source, text: text.trim() || null });
      setText("");
      toast.success(`Salvato e rimandato a correggere (${source}).`);
      reload();
      onSentBack?.();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const doSaveConclude = async () => {
    if (!review) return;
    setBusy(true);
    try {
      await persistCommon();
      if (text.trim()) {
        await addReviewCommentApi(workItemId, {
          author_badge: badge,
          kind,
          source: kind === "rework" ? source : null,
          text: text.trim(),
        });
        setText("");
      }
      toast.success(delivered ? "Revisione salvata · inviata al cliente." : "Revisione salvata.");
      reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  useImperativeHandle(ref, () => ({
    sendBack: () => doSendBack(),
    saveConclude: () => doSaveConclude(),
  }));

  if (loading) return <div className="rv"><div className="rv-state">Caricamento revisione…</div></div>;
  if (error) return <div className="rv"><div className="rv-state">{error} · <button className="rv-btn ghost" onClick={() => void load()}>Riprova</button></div></div>;
  if (!data || !review) return <div className="rv"><div className="rv-state">Nessun dato di revisione.</div></div>;

  const meId = data.current_user_id;

  const MIN_PRESETS = [5, 10, 15, 20, 30];
  const WEIGHT_PRESETS: { label: string; min: number }[] = [
    { label: "Revisione interna", min: 10 },
    { label: "Revisione cliente", min: 15 },
  ];

  return (
    <div className="rv">
      {/* stato revisione */}
      <div className="rv-chips">
        <span className="rv-chip review"><Svg name="clock" w={12} /> {review.status === "review" ? "In revisione" : review.status}</span>
        {review.review_stage ? <span className="rv-chip stage">Fase: {review.review_stage}</span> : null}
        {review.rework_count > 0 ? (
          <span className="rv-chip rework"><Svg name="rework" w={12} /> {review.rework_count} {review.rework_count === 1 ? "rimando" : "rimandi"}</span>
        ) : null}
      </div>

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
            <div className="rv-fields">
              <div className="rv-field">
                <span className="rv-label">Badge</span>
                <div className="rv-seg">
                  {(["operatore", "pm", "cliente"] as ReviewBadge[]).map((b) => (
                    <button key={b} data-role={b} className={badge === b ? "on" : ""} onClick={() => setBadge(b)}>
                      {b === "cliente" ? <Svg name="building" w={12} /> : null}
                      {BADGE_LABEL[b]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="rv-field">
                <span className="rv-label">Tipo</span>
                <div className="rv-seg">
                  <button className={kind === "generic" ? "on" : ""} onClick={() => setKind("generic")}>Nota generica</button>
                  <button className={kind === "rework" ? "on" : ""} onClick={() => setKind("rework")}>Modifica da fare</button>
                </div>
              </div>
            </div>

            {kind === "rework" ? (
              <div className="rv-rework-strip">
                <span className="rv-sublabel">Chiesta da</span>
                <div className="rv-seg">
                  <button className={source === "interna" ? "on" : ""} onClick={() => setSource("interna")}>Revisione interna</button>
                  <button className={source === "cliente" ? "on" : ""} onClick={() => setSource("cliente")}>Cliente</button>
                </div>
                <span className="rv-strip-desc">
                  {source === "interna"
                    ? "Modifica emersa dalla revisione interna (team/PM), prima della consegna al cliente."
                    : "Modifica richiesta dal cliente dopo la consegna."}
                </span>
              </div>
            ) : null}

            <textarea
              className="rv-textarea"
              rows={2}
              placeholder="Scrivi una nota o una segnalazione…"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />

            <div className="rv-actions">
              <button className="rv-btn ghost" onClick={() => void addNote()} disabled={busy || !text.trim()}>
                <Svg name="plus" /> Aggiungi nota
              </button>
              {canManage ? (
                <span className="rv-actions-hint">
                  Il commento qui sopra viene salvato anche dai pulsanti in fondo.
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {/* B, C, D: solo revisore/PM. L'operatore vede unicamente i commenti. */}
      {canManage && (
        <>
      {/* B · TEMPO / PESO */}
      <section className="rv-card">
        <div className="rv-card-head">
          <span className="rv-card-title"><Svg name="clock" /> Tempo di lavorazione sul calendario</span>
          <span className="rv-card-hint">non cambia il tempo reale della task</span>
        </div>
        <div className="rv-card-body">
          <div className="rv-seg" style={{ marginBottom: 14 }}>
            <button className={mode === "preset" ? "on" : ""} onClick={() => setMode("preset")}>Preset</button>
            <button className={mode === "manual" ? "on" : ""} onClick={() => setMode("manual")}>Manuale</button>
          </div>

          {mode === "preset" ? (
            <>
              <div className="rv-subrow">
                <span className="rv-label">Preset peso</span>
                <div className="rv-picks">
                  {WEIGHT_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      className={"rv-pick" + (hasBase && minutes === p.min ? " on" : "")}
                      onClick={() => setMinutesSynced(p.min)}
                      disabled={!hasBase}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="rv-subrow">
                <span className="rv-label">Minuti visualizzati</span>
                <div className="rv-picks">
                  {MIN_PRESETS.map((m) => (
                    <button
                      key={m}
                      className={"rv-pick minutes" + (hasBase && minutes === m ? " on" : "")}
                      onClick={() => setMinutesSynced(m)}
                      disabled={!hasBase}
                    >
                      {m} min
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="rv-manual">
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span className="rv-label">Minuti sul calendario</span>
                <div className="rv-numwrap">
                  <button className="stp" onClick={() => setMinutesSynced(minutes - 5)} disabled={!hasBase}>−</button>
                  <input type="number" min={1} value={minutes} onChange={(e) => setMinutesSynced(Number(e.target.value) || 1)} disabled={!hasBase} />
                  <span className="unit">min</span>
                  <button className="stp" onClick={() => setMinutesSynced(minutes + 5)} disabled={!hasBase}>+</button>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span className="rv-label">Fattore peso</span>
                <div className="rv-numwrap">
                  <button className="stp" onClick={() => setFactorSynced(Number(factorInput) - 0.05)}>−</button>
                  <input type="number" min={0} step={0.05} value={factorInput} onChange={(e) => setFactorSynced(Number(e.target.value) || 0)} />
                  <span className="unit">×</span>
                  <button className="stp" onClick={() => setFactorSynced(Number(factorInput) + 0.05)}>+</button>
                </div>
              </div>
            </div>
          )}

          <div className="rv-readout">
            <div className="rv-ro"><span className="k">Tempo base</span><span className="v muted">{hasBase ? fmtMin(baseMin) : "—"}</span></div>
            <div className="rv-ro"><span className="k">Peso ricalcolato</span><span className="v mag">×{factor.toFixed(2).replace(".", ",")}</span></div>
            <div className="rv-ro"><span className="k">Sul calendario</span><span className="v cyan">{hasBase ? `${effMin} min` : "—"}</span></div>
          </div>
          <div className="rv-hint">
            {hasBase
              ? <>Il tempo base resta invariato. <b>peso = minuti scelti ÷ tempo base</b>. Attuale: ×{(review.load_weight_factor ?? 1).toFixed(2).replace(".", ",")}.</>
              : <>Imposta prima il <b>tempo stimato</b> nella scheda Dettagli per usare i minuti; qui puoi comunque impostare il fattore peso a mano.</>}
          </div>
        </div>
      </section>

      {/* C · SCADENZA */}
      <section className="rv-card">
        <div className="rv-card-head">
          <span className="rv-card-title"><Svg name="calendar" /> Scadenza</span>
        </div>
        <div className="rv-card-body">
          <div className="rv-inline">
            <span className="rv-deadline"><Svg name="calendar" /> Scadenza attuale: {fmtDate(review.deadline_date)}</span>
            <div className="rv-reprog">
              <span className="rv-sublabel">Nuova scadenza</span>
              <div className="rv-datewrap">
                <Input
                  type="date"
                  value={newDate ?? ""}
                  onChange={(e) => setNewDate(e.target.value)}
                  onPostpone={(iso) => setNewDate(iso)}
                />
              </div>
            </div>
          </div>
          <div className="rv-hint">Cambia la data se serve: viene salvata insieme al resto coi pulsanti in fondo.</div>
        </div>
      </section>

      {/* D · CONSEGNA CLIENTE */}
      <section className="rv-card">
        <div className="rv-card-body">
          <div className="rv-deliver">
            <div className="rv-deliver-l">
              <div className="rv-deliver-ic"><Svg name="send" w={20} /></div>
              <div>
                <div className="rv-deliver-t">Inviata al cliente</div>
                <div className="rv-deliver-s">Segna la prima consegna al cliente — traccia data, ora e chi l’ha inviata.</div>
              </div>
            </div>
            <button
              className={"rv-switch" + (delivered ? " on" : "")}
              role="switch"
              aria-checked={delivered}
              aria-label="Inviata al cliente"
              onClick={() => setDelivered((v) => !v)}
              disabled={busy || !canManage}
            />
          </div>
          {review.delivered_to_client_at ? (
            <div className="rv-stamp">✓ Consegnata al cliente il <b>{fmtDateTime(review.delivered_to_client_at)}</b></div>
          ) : delivered ? (
            <div className="rv-stamp pending">Verrà segnata come inviata al cliente al salvataggio.</div>
          ) : null}
        </div>
      </section>
        </>
      )}

      {/* Pulsanti gemelli inline: solo dove non c'è un footer dedicato (es. modale Revisione). */}
      {renderActionsInline && canManage ? (
        <div className="rv-submitbar">
          <button className="rv-btn warn rv-submit" onClick={() => void doSendBack()} disabled={busy}>
            <Svg name="rework" /> Rimanda indietro e correggi
          </button>
          <button className="rv-btn primary rv-submit" onClick={() => void doSaveConclude()} disabled={busy}>
            <Svg name="check" /> Salva e concludi
          </button>
        </div>
      ) : null}
    </div>
  );
});
