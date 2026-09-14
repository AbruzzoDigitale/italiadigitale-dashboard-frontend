import { useEffect, useState } from "react";
import { Icon } from "./ui/Icon";

// ─────────────────────────────────────────────────────────────────────────────
// Banner "usa l'app mobile", mostrato quando la dashboard è aperta da mobile e
// non è già in modalità app installata. Comportamento per sistema operativo:
//   Android → scarica l'APK (sideload) ospitato sulla PWA;
//   iOS     → istruzioni "Aggiungi a Home" (Apple non consente APK/download app).
// ─────────────────────────────────────────────────────────────────────────────

// APK Android pubblico (ospitato sulla PWA su Firebase). Sovrascrivibile via env.
const APK_URL =
  (import.meta.env.VITE_APK_URL as string | undefined) ??
  "https://app.italiadigitale.agency/italiadigitale.apk";
// PWA mobile (per iOS: apri e "Aggiungi a Home").
const PWA_URL =
  (import.meta.env.VITE_MOBILE_APP_URL as string | undefined) ?? "https://app.italiadigitale.agency";
const DISMISS_KEY = "id_mobile_app_banner_dismissed";

function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

type OS = "ios" | "android" | "other";
function detectOS(): OS {
  const ua = navigator.userAgent || "";
  if (/Android/i.test(ua)) return "android";
  if (/iPhone|iPod|iPad/i.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1)) return "ios";
  return "other";
}

function isMobileDevice(os: OS): boolean {
  if (os === "android" || os === "ios") return true;
  return window.matchMedia?.("(max-width: 820px) and (pointer: coarse)").matches ?? false;
}

export function MobileAppBanner() {
  const [show, setShow] = useState(false);
  const [os, setOs] = useState<OS>("other");

  useEffect(() => {
    try {
      if (isStandalone()) return;
      if (localStorage.getItem(DISMISS_KEY) === "1") return;
      const detected = detectOS();
      if (!isMobileDevice(detected)) return;
      setOs(detected);
      setShow(true);
    } catch {
      /* niente localStorage/matchMedia → non mostrare */
    }
  }, []);

  if (!show) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setShow(false);
  };

  const isAndroid = os === "android";

  return (
    <div className="fixed inset-x-0 bottom-0 z-[13000] flex justify-center p-3 pointer-events-none">
      <div className="pointer-events-auto w-full max-w-md rounded-2xl border border-line bg-paper p-4 shadow-2xl dark:border-[#2a2a2e] dark:bg-[#1c1c20]">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-brand-magenta/10 text-brand-magenta">
            <Icon name={isAndroid ? "download" : "plus"} className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-bold text-ink dark:text-paper">App di Italia Digitale</div>
            <p className="mt-0.5 text-[13px] text-muted dark:text-muted-dark">
              {isAndroid
                ? "Scarica l'app per Android e installala (consenti l'installazione da origini sconosciute)."
                : "Aggiungila alla Home: tocca Condividi in basso, poi «Aggiungi a Home». Si apre come un'app."}
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="grid h-7 w-7 flex-none place-items-center rounded-md text-muted hover:bg-cream hover:text-ink dark:text-muted-dark dark:hover:bg-[#24242a] dark:hover:text-paper"
            title="Chiudi"
            aria-label="Chiudi"
          >
            <Icon name="x" className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <a
            href={isAndroid ? APK_URL : PWA_URL}
            className="flex-1 rounded-lg bg-brand-magenta px-4 py-2.5 text-center text-[13px] font-bold text-white transition-colors hover:bg-[#a30f6e]"
          >
            {isAndroid ? "Scarica l'app (APK)" : "Apri l'app"}
          </a>
          <button
            type="button"
            onClick={dismiss}
            className="rounded-lg border border-line px-4 py-2.5 text-[13px] font-semibold text-ink transition-colors hover:bg-cream dark:border-[#2a2a2e] dark:text-paper dark:hover:bg-[#24242a]"
          >
            Continua sul browser
          </button>
        </div>
      </div>
    </div>
  );
}
