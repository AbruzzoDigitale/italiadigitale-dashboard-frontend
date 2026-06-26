import { useEffect, useState } from "react";
import { Icon } from "../ui/Icon";

interface WorkloadDateNavProps {
  /** Etichetta del periodo corrente (es. "22 – 26 lug 2026"). */
  label: string;
  onPrev: () => void;
  onNext: () => void;
  className?: string;
}

/**
 * Navigazione data del Workload in stile prototipo (`.tgroup`): freccia ‹ · etichetta · freccia ›.
 * Riutilizzabile in tutte le view.
 *
 * Durante un drag&drop nel calendario, le frecce diventano verdi e — sostandoci sopra con il
 * cursore — fanno avanzare il periodo (auto-paging). Quella logica è guidata dal calendario
 * (che traccia il puntatore) tramite l'evento `wlcal:drag` su window e il hit-test degli
 * elementi `[data-wl-navzone]`: qui ci limitiamo a riflettere lo stato (verde / freccia armata).
 */
export function WorkloadDateNav({ label, onPrev, onNext, className = "" }: WorkloadDateNavProps) {
  const [dragActive, setDragActive] = useState(false);
  const [armed, setArmed] = useState<"prev" | "next" | null>(null);

  useEffect(() => {
    const onDragState = (event: Event) => {
      const detail = (event as CustomEvent<{ active: boolean; armed: "prev" | "next" | null }>).detail;
      if (!detail) return;
      setDragActive(detail.active);
      setArmed(detail.active ? detail.armed : null);
    };
    window.addEventListener("wlcal:drag", onDragState);
    return () => window.removeEventListener("wlcal:drag", onDragState);
  }, []);

  return (
    <div className={`wl-datenav ${className}`}>
      <button
        type="button"
        data-wl-navzone="prev"
        className={`wl-datenav-arrow ${dragActive ? "is-dragready" : ""} ${armed === "prev" ? "is-armed" : ""}`}
        onClick={onPrev}
        aria-label="Periodo precedente"
      >
        <Icon name="chevron-right" className="h-4 w-4 rotate-180" />
      </button>
      <span className="wl-datenav-label">{label}</span>
      <button
        type="button"
        data-wl-navzone="next"
        className={`wl-datenav-arrow ${dragActive ? "is-dragready" : ""} ${armed === "next" ? "is-armed" : ""}`}
        onClick={onNext}
        aria-label="Periodo successivo"
      >
        <Icon name="chevron-right" className="h-4 w-4" />
      </button>
    </div>
  );
}
