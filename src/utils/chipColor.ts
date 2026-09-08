// Colori dei chip (ruoli, aree) leggibili in entrambi i temi.
//
// I colori li scelgono gli admin quando creano un ruolo o un'area, e nessuno
// pensa al tema scuro mentre lo fa: un blu notte su fondo nero non si legge, e
// un giallo pastello su fondo chiaro nemmeno. Qui il colore viene mantenuto come
// tinta — così il chip resta riconoscibile — ma la sua luminosità viene portata
// dentro una fascia leggibile per il tema in uso.

function hexToRgb(hex: string): [number, number, number] | null {
  const pulito = hex.trim().replace("#", "");
  const esteso =
    pulito.length === 3
      ? pulito
          .split("")
          .map((c) => c + c)
          .join("")
      : pulito;
  if (!/^[0-9a-f]{6}$/i.test(esteso)) return null;
  return [
    parseInt(esteso.slice(0, 2), 16),
    parseInt(esteso.slice(2, 4), 16),
    parseInt(esteso.slice(4, 6), 16),
  ];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return [h * 360, s, l];
}

/**
 * Stile del chip: bordo e sfondo con la tinta originale, testo con la stessa
 * tinta ma riportato in una luminosità leggibile.
 *
 * Sul tema scuro il testo non scende mai sotto il 62% di luminosità, sul chiaro
 * non sale mai sopra il 42%: sono le soglie oltre le quali un colore pieno
 * smette di staccarsi dal fondo. Lo sfondo resta invece una velatura del colore
 * vero, che è ciò che rende il chip riconoscibile a colpo d'occhio.
 */
export function chipStyle(color: string | null | undefined, dark: boolean): React.CSSProperties | undefined {
  if (!color) return undefined;
  const rgb = hexToRgb(color);
  if (!rgb) return undefined;

  const [h, s, l] = rgbToHsl(...rgb);
  const saturazione = Math.max(0.35, Math.min(s, 0.9));
  const luminosita = dark ? Math.max(l, 0.62) : Math.min(l, 0.42);
  const testo = `hsl(${Math.round(h)} ${Math.round(saturazione * 100)}% ${Math.round(luminosita * 100)}%)`;

  return {
    color: testo,
    borderColor: `hsl(${Math.round(h)} ${Math.round(saturazione * 100)}% ${Math.round(luminosita * 100)}% / 0.4)`,
    backgroundColor: `hsl(${Math.round(h)} ${Math.round(saturazione * 100)}% ${Math.round(luminosita * 100)}% / ${dark ? 0.16 : 0.1})`,
  };
}
