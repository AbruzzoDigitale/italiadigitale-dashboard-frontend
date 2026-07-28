import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../../components/ui/Icon";
import {
  subscribeNotificationToast,
  type NotificationToastItem,
} from "./notificationToastBus";

// Dopo quanti ms il toast "decolla" da solo verso la campanella.
const AUTO_FLY_MS = 4500;
// Id del bottone campanella nell'header (DashboardLayout).
export const NOTIF_BELL_ID = "notif-bell-btn";

// Aeroplanino di carta (icona "send"): la punta guarda in alto a destra (-45°).
const PLANE_SVG =
  '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>';

/** Fa "reagire" la campanella quando l'aeroplanino la raggiunge. */
function popBell(bell: HTMLElement) {
  bell.classList.remove("notif-catch");
  // reflow: fa ripartire l'animazione anche su arrivi ravvicinati
  void bell.offsetWidth;
  bell.classList.add("notif-catch");
  window.setTimeout(() => bell.classList.remove("notif-catch"), 600);
}

function NotifToast({ item, onDone }: { item: NotificationToastItem; onDone: () => void }) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const flownRef = useRef(false);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const fly = useCallback(() => {
    if (flownRef.current) return;
    flownRef.current = true;

    const card = cardRef.current;
    const bell = document.getElementById(NOTIF_BELL_ID);
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    // Senza campanella (layout mobile?) o con reduced-motion: dissolvenza e via.
    if (!card || !bell || reduced) {
      if (card) {
        const anim = card.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: 180,
          easing: "ease-out",
          fill: "forwards",
        });
        anim.onfinish = onDone;
      } else {
        onDone();
      }
      if (bell) popBell(bell);
      return;
    }

    const cardRect = card.getBoundingClientRect();
    const bellRect = bell.getBoundingClientRect();

    // La card si ripiega su sé stessa mentre l'aeroplanino "nasce" al suo posto.
    card.style.pointerEvents = "none";
    card.animate(
      [
        { opacity: 1, transform: "scale(1)" },
        { opacity: 0, transform: "scale(0.55) rotate(-3deg)" },
      ],
      { duration: 220, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "forwards" }
    );

    const startX = cardRect.left + cardRect.width / 2;
    const startY = cardRect.top + cardRect.height / 2;
    const endX = bellRect.left + bellRect.width / 2;
    const endY = bellRect.top + bellRect.height / 2;
    const dx = endX - startX;
    const dy = endY - startY;
    // Punto intermedio spostato in perpendicolare → traiettoria ad arco.
    const midX = dx / 2 - dy * 0.22;
    const midY = dy / 2 + dx * 0.22;
    // L'icona punta a -45°: ruota la punta lungo la direzione di volo.
    const rot = (Math.atan2(dy, dx) * 180) / Math.PI + 45;

    const plane = document.createElement("div");
    plane.style.cssText = `position:fixed;left:${startX}px;top:${startY}px;z-index:100001;pointer-events:none;color:#c41284;filter:drop-shadow(0 2px 6px rgba(196,18,132,0.35));`;
    plane.innerHTML = PLANE_SVG;
    document.body.appendChild(plane);

    const anim = plane.animate(
      [
        { transform: `translate(-50%,-50%) translate(0px,0px) rotate(${rot - 14}deg) scale(0.6)`, opacity: 0 },
        { transform: `translate(-50%,-50%) translate(0px,0px) rotate(${rot}deg) scale(1.05)`, opacity: 1, offset: 0.16 },
        { transform: `translate(-50%,-50%) translate(${midX}px,${midY}px) rotate(${rot}deg) scale(0.85)`, opacity: 1, offset: 0.58 },
        { transform: `translate(-50%,-50%) translate(${dx}px,${dy}px) rotate(${rot}deg) scale(0.3)`, opacity: 0.25 },
      ],
      { duration: 820, easing: "cubic-bezier(0.45, 0.05, 0.2, 1)", fill: "forwards" }
    );
    anim.onfinish = () => {
      plane.remove();
      popBell(bell);
      onDone();
    };
  }, [onDone]);

  useEffect(() => {
    const timer = window.setTimeout(fly, AUTO_FLY_MS);
    return () => window.clearTimeout(timer);
  }, [fly]);

  return (
    <div
      ref={cardRef}
      role="status"
      onClick={fly}
      title="Vola nel centro notifiche"
      className={`pointer-events-auto w-[320px] cursor-pointer rounded-lg border border-line bg-paper p-3.5 shadow-lg transition-all duration-300 hover:shadow-xl dark:border-[#2a2a2e] dark:bg-[#1c1c20] ${
        entered ? "translate-x-0 opacity-100" : "translate-x-8 opacity-0"
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-magenta/10 text-brand-magenta">
          <Icon name="bell" className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-bold text-ink dark:text-[#f4f4f7]">{item.title}</p>
          <p className="mt-0.5 text-[12px] leading-snug text-muted line-clamp-2 dark:text-[#9999a0]">
            {item.body}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Layer dei toast di notifica in-app (arrivi realtime con scheda attiva).
 * Dopo pochi secondi — o al click — il toast si ripiega in un aeroplanino di
 * carta che vola dentro la campanella del centro notifiche.
 */
export function NotificationToastLayer() {
  const [toasts, setToasts] = useState<NotificationToastItem[]>([]);

  useEffect(
    () =>
      subscribeNotificationToast((toast) => {
        // Al massimo 3 toast in pila: i più vecchi scalano via.
        setToasts((prev) => [...prev.slice(-2), toast]);
      }),
    []
  );

  const remove = useCallback((key: number) => {
    setToasts((prev) => prev.filter((t) => t.key !== key));
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="pointer-events-none fixed right-4 top-16 z-[90000] flex flex-col items-end gap-2">
      {toasts.map((t) => (
        <NotifToast key={t.key} item={t} onDone={() => remove(t.key)} />
      ))}
    </div>,
    document.body
  );
}
