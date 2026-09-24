import { useEffect, useMemo, useState } from "react";

/**
 * La scorciatoia per aprire l'Oracolo, e come si scrive.
 *
 * Su Mac è ⌘K, altrove Ctrl+K: scriverne una sola sarebbe sbagliato per metà degli
 * utenti. Il rilevamento usa `navigator.platform` con ripiego su `userAgent` perché
 * `userAgentData` non c'è su Safari.
 */
export function useIsMac(): boolean {
  return useMemo(() => {
    if (typeof navigator === "undefined") return false;
    const piattaforma =
      (navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform ??
      navigator.platform ??
      navigator.userAgent;
    return /mac|iphone|ipad|ipod/i.test(piattaforma);
  }, []);
}

/** "⌘K" oppure "Ctrl K", da mostrare accanto alla barra di ricerca. */
export function useShortcutLabel(): string {
  return useIsMac() ? "⌘K" : "Ctrl K";
}

/** Registra la scorciatoia globale. Ritorna lo stato di apertura e come cambiarlo. */
export function useOracleShortcut(abilitata: boolean) {
  const [aperto, setAperto] = useState(false);
  const isMac = useIsMac();

  useEffect(() => {
    if (!abilitata) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const modificatore = isMac ? e.metaKey : e.ctrlKey;
      if (modificatore && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAperto((v) => !v);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [abilitata, isMac]);

  return { aperto, setAperto };
}
