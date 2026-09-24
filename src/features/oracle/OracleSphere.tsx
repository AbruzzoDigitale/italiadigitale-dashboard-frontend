import { useEffect, useRef } from "react";

/**
 * La sfera di particelle: schermata vuota, e battito mentre l'Oracolo elabora.
 *
 * È canvas 2D, non three.js. Per una nuvola di punti su una sfera serve una
 * proiezione prospettica e un'ordinata in profondità — un centinaio di righe — mentre
 * three.js aggiunge circa 600 KB a un bundle che l'ultimo build segnala già come
 * troppo grande. Se un giorno servisse una vera scena 3D, si cambia; per questo no.
 *
 * I punti stanno su una spirale di Fibonacci, che è l'unico modo semplice di
 * distribuirli davvero uniformemente: a caso si formano grumi e buchi che l'occhio
 * legge come un difetto.
 *
 * Rispetta `prefers-reduced-motion`: chi ha chiesto meno movimento vede la sfera
 * ferma, non un'animazione più lenta.
 */

interface Props {
  /** Diametro in pixel. */
  dimensione?: number;
  /** Batte, per dire che sta elaborando. */
  attiva?: boolean;
}

const PUNTI = 420;

export function OracleSphere({ dimensione = 180, attiva = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const attivaRef = useRef(attiva);
  attivaRef.current = attiva;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = dimensione * dpr;
    canvas.height = dimensione * dpr;
    ctx.scale(dpr, dpr);

    // Spirale di Fibonacci: distribuzione uniforme senza grumi.
    const aureo = Math.PI * (3 - Math.sqrt(5));
    const punti = Array.from({ length: PUNTI }, (_, i) => {
      const y = 1 - (i / (PUNTI - 1)) * 2;
      const raggio = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = aureo * i;
      return { x: Math.cos(theta) * raggio, y, z: Math.sin(theta) * raggio };
    });

    const menoMovimento = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const centro = dimensione / 2;
    const base = dimensione * 0.38;

    let frame = 0;
    let angolo = 0;
    let avvio: number | null = null;

    const colore = () =>
      getComputedStyle(canvas).getPropertyValue("--particella").trim() || "#c41284";

    const disegna = (t: number) => {
      if (avvio === null) avvio = t;
      const tempo = (t - avvio) / 1000;
      if (!menoMovimento) angolo += attivaRef.current ? 0.010 : 0.0035;

      // Il battito: ampio quando elabora, un respiro appena percettibile a riposo.
      const ampiezza = attivaRef.current ? 0.06 : 0.015;
      const velocita = attivaRef.current ? 3.2 : 1.1;
      const raggio = base * (1 + (menoMovimento ? 0 : Math.sin(tempo * velocita) * ampiezza));

      ctx.clearRect(0, 0, dimensione, dimensione);
      const tinta = colore();
      const cos = Math.cos(angolo);
      const sin = Math.sin(angolo);

      for (const p of punti) {
        const x = p.x * cos - p.z * sin;
        const z = p.x * sin + p.z * cos;
        // Prospettiva: i punti davanti più grandi e più opachi di quelli dietro.
        const prospettiva = 1 / (2.2 - z);
        const sx = centro + x * raggio * prospettiva * 2.2;
        const sy = centro + p.y * raggio * prospettiva * 2.2;
        const opacita = 0.18 + ((z + 1) / 2) * 0.62;
        const dimensionePunto = 0.7 + ((z + 1) / 2) * 1.2;

        ctx.globalAlpha = opacita;
        ctx.fillStyle = tinta;
        ctx.beginPath();
        ctx.arc(sx, sy, dimensionePunto, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      frame = requestAnimationFrame(disegna);
    };

    frame = requestAnimationFrame(disegna);
    return () => cancelAnimationFrame(frame);
  }, [dimensione]);

  return (
    <canvas
      ref={canvasRef}
      role="presentation"
      aria-hidden
      style={{ width: dimensione, height: dimensione }}
      className="[--particella:#c41284] dark:[--particella:#e879b8]"
    />
  );
}
