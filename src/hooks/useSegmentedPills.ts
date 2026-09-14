import { useEffect } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Potenziatore GLOBALE: aggiunge a OGNI segmented switch (.seg-switch,
// .wl-segmented) una "pillola" attiva che SCORRE (motion graphic). La pillola è
// uno pseudo-elemento CSS (::before, vedi index.css): non iniettiamo nodi.
//
// ANTI-FREEZE (fondamentale): NESSUN observer reagisce alle NOSTRE scritture.
//   • Riposizioniamo solo su eventi UTENTE (click su un segmented, resize).
//   • Un MutationObserver rileva solo NODI AGGIUNTI (childList) per animare gli
//     switch che compaiono dopo (modali, cambi pagina) — non osserva attributi
//     né stili, quindi le nostre modifiche di classe/variabili non lo ritriggerano.
// Così è impossibile creare un loop di feedback (niente ResizeObserver-loop).
// ─────────────────────────────────────────────────────────────────────────────

const SELECTOR = ".seg-switch, .wl-segmented";

export function useSegmentedPills(): void {
  useEffect(() => {
    const enhanced = new WeakSet<HTMLElement>();

    const position = (container: HTMLElement) => {
      try {
        if (!container.isConnected) return;
        container.classList.add("seg-anim");
        const active = Array.from(container.children).find(
          (c): c is HTMLElement => c instanceof HTMLElement && c.classList.contains("is-active"),
        );
        if (!active) {
          container.classList.remove("seg-has-pill");
          return;
        }
        container.style.setProperty("--seg-x", `${active.offsetLeft}px`);
        container.style.setProperty("--seg-y", `${active.offsetTop}px`);
        container.style.setProperty("--seg-w", `${active.offsetWidth}px`);
        container.style.setProperty("--seg-h", `${active.offsetHeight}px`);
        container.classList.add("seg-has-pill");
      } catch {
        /* mai far crashare l'app per un dettaglio estetico */
      }
    };

    const enhance = (container: HTMLElement) => {
      position(container);
      if (enhanced.has(container)) return;
      enhanced.add(container);
      // La transizione parte solo dopo il primo posizionamento (niente slide iniziale).
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (container.isConnected) container.classList.add("seg-ready");
        }),
      );
    };

    const scanAll = () => {
      try {
        document.querySelectorAll(SELECTOR).forEach((el) => {
          if (el instanceof HTMLElement) enhance(el);
        });
      } catch {
        /* noop */
      }
    };

    scanAll();
    // Ricalcola quando i font sono pronti (le larghezze dei bottoni possono cambiare).
    if (document.fonts?.ready) document.fonts.ready.then(scanAll).catch(() => {});

    // Click su un segmented: dopo che React ha aggiornato `is-active`, riposiziona.
    const onClick = (e: MouseEvent) => {
      const el = e.target instanceof Element ? e.target.closest(SELECTOR) : null;
      if (el instanceof HTMLElement) requestAnimationFrame(() => enhance(el));
    };
    document.addEventListener("click", onClick, true);

    // Resize finestra: riposiziona tutti (debounce a un frame).
    let resizeRaf = 0;
    const onResize = () => {
      if (resizeRaf) return;
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = 0;
        scanAll();
      });
    };
    window.addEventListener("resize", onResize);

    // Switch aggiunti in seguito (modali/portali, cambi pagina): SOLO childList.
    let scanRaf = 0;
    const bodyObserver = new MutationObserver((records) => {
      let added = false;
      for (const rec of records) {
        if (rec.addedNodes.length) {
          added = true;
          break;
        }
      }
      if (added && !scanRaf) {
        scanRaf = requestAnimationFrame(() => {
          scanRaf = 0;
          scanAll();
        });
      }
    });
    bodyObserver.observe(document.body, { childList: true, subtree: true });

    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("resize", onResize);
      bodyObserver.disconnect();
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      if (scanRaf) cancelAnimationFrame(scanRaf);
    };
  }, []);
}
