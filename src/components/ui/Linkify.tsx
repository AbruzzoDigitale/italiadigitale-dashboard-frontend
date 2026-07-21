import { Fragment, type ReactNode } from "react";

// Rende un testo con i link cliccabili invece che grezzi: supporta i link
// Markdown `[label](url)`, gli URL nudi (http/https/www) e gli a-capo HTML `<br>`.
// Il resto resta testo, con gli a-capo `\n` preservati (usare `whitespace-pre-line`
// sul contenitore). Usato per descrizioni/commenti importati (es. da Trello).

// 1) [label](url "titolo")  2) url nudo  3) <br> HTML (anche <br/> e <br />)
// Il titolo Markdown tra virgolette (es. Trello: [url](url "smartCard-inline")) è ignorato.
const TOKEN_RE =
  /\[([^\]]+)\]\(\s*(https?:\/\/[^\s)]+)(?:\s+"[^"]*")?\s*\)|(https?:\/\/[^\s<]+|www\.[^\s<]+)|(<br\s*\/?>)/gi;

function hrefOf(raw: string): string {
  return raw.toLowerCase().startsWith("www.") ? `https://${raw}` : raw;
}

// Toglie la punteggiatura finale che di solito non fa parte dell'URL nudo.
function splitTrailing(url: string): [string, string] {
  const m = url.match(/[),.;:!?]+$/);
  return m ? [url.slice(0, -m[0].length), m[0]] : [url, ""];
}

interface LinkifyProps {
  text: string | null | undefined;
  /** Classi applicate agli <a> (colore/underline). */
  linkClassName?: string;
}

export function Linkify({ text, linkClassName = "" }: LinkifyProps) {
  const src = text ?? "";
  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;

  for (const m of src.matchAll(TOKEN_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) nodes.push(<Fragment key={key++}>{src.slice(last, idx)}</Fragment>);

    if (m[1] && m[2]) {
      // Markdown [label](url)
      nodes.push(
        <a key={key++} href={hrefOf(m[2])} target="_blank" rel="noreferrer noopener" onClick={(e) => e.stopPropagation()} className={linkClassName}>
          {m[1]}
        </a>
      );
    } else if (m[3]) {
      // URL nudo
      const [url, trail] = splitTrailing(m[3]);
      nodes.push(
        <a key={key++} href={hrefOf(url)} target="_blank" rel="noreferrer noopener" onClick={(e) => e.stopPropagation()} className={linkClassName}>
          {url}
        </a>
      );
      if (trail) nodes.push(<Fragment key={key++}>{trail}</Fragment>);
    } else {
      // a-capo HTML <br>
      nodes.push(<br key={key++} />);
    }
    last = idx + m[0].length;
  }

  if (last < src.length) nodes.push(<Fragment key={key++}>{src.slice(last)}</Fragment>);

  return <>{nodes}</>;
}
