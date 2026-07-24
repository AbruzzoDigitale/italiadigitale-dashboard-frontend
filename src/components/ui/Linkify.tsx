import { Fragment, useMemo, type MouseEvent, type ReactNode } from "react";

// Rende un testo con i link cliccabili invece che grezzi. Gestisce tre casi:
//  - testo semplice con link Markdown `[label](url)`, URL nudi e `<br>`;
//  - HTML "vero" (es. descrizioni importate da Trello/Gmail, con <a>, <div>,
//    <wbr>, style="--tw-…") → viene PARSATO in sicurezza (DOMParser, senza
//    dangerouslySetInnerHTML): si tengono i link e gli a-capo, si scartano tag e
//    stili di contorno, così non compaiono più i tag grezzi.
// Gli a-capo `\n` del testo semplice si preservano con `whitespace-pre-line`.

// [label](url "titolo")  |  url nudo  |  <br>
const TOKEN_RE =
  /\[([^\]]+)\]\(\s*(https?:\/\/[^\s)]+)(?:\s+"[^"]*")?\s*\)|(https?:\/\/[^\s<]+|www\.[^\s<]+)|(<br\s*\/?>)/gi;
// Sembra HTML? (un qualsiasi tag)
const HTML_RE = /<\/?[a-z][^>]*>/i;

const stop = (e: MouseEvent) => e.stopPropagation();

function hrefOf(raw: string): string {
  return raw.toLowerCase().startsWith("www.") ? `https://${raw}` : raw;
}
function safeHref(raw: string): string {
  return /^https?:\/\//i.test(raw) ? raw : /^www\./i.test(raw) ? `https://${raw}` : "";
}
// Toglie la punteggiatura finale che di solito non fa parte dell'URL nudo.
function splitTrailing(url: string): [string, string] {
  const m = url.match(/[),.;:!?]+$/);
  return m ? [url.slice(0, -m[0].length), m[0]] : [url, ""];
}

interface Ctx {
  key: number;
  cls: string;
}

// Testo semplice → nodi (Markdown link, URL nudi, <br> letterale).
function tokenizeText(src: string, ctx: Ctx): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  for (const m of src.matchAll(TOKEN_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) nodes.push(<Fragment key={ctx.key++}>{src.slice(last, idx)}</Fragment>);
    if (m[1] && m[2]) {
      nodes.push(
        <a key={ctx.key++} href={hrefOf(m[2])} target="_blank" rel="noreferrer noopener" onClick={stop} className={ctx.cls}>
          {m[1]}
        </a>
      );
    } else if (m[3]) {
      const [url, trail] = splitTrailing(m[3]);
      nodes.push(
        <a key={ctx.key++} href={hrefOf(url)} target="_blank" rel="noreferrer noopener" onClick={stop} className={ctx.cls}>
          {url}
        </a>
      );
      if (trail) nodes.push(<Fragment key={ctx.key++}>{trail}</Fragment>);
    } else {
      nodes.push(<br key={ctx.key++} />);
    }
    last = idx + m[0].length;
  }
  if (last < src.length) nodes.push(<Fragment key={ctx.key++}>{src.slice(last)}</Fragment>);
  return nodes;
}

// HTML → nodi puliti: link cliccabili + a-capo, niente tag/stili grezzi.
function htmlToNodes(html: string, ctx: Ctx): ReactNode[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const out: ReactNode[] = [];

  const walk = (node: Node, acc: ReactNode[]) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === 3) {
        // Nodo di testo: collassa lo spazio (come fa l'HTML) e linkifica gli URL nudi.
        const collapsed = (child.textContent ?? "").replace(/\s+/g, " ");
        if (collapsed) acc.push(...tokenizeText(collapsed, ctx));
        return;
      }
      if (child.nodeType !== 1) return;
      const el = child as HTMLElement;
      const tag = el.tagName.toLowerCase();

      if (tag === "a") {
        const href = safeHref(el.getAttribute("href") || "");
        const inner: ReactNode[] = [];
        walk(el, inner);
        if (href) {
          acc.push(
            <a key={ctx.key++} href={href} target="_blank" rel="noreferrer noopener" onClick={stop} className={ctx.cls}>
              {inner.length ? inner : href}
            </a>
          );
        } else {
          acc.push(...inner);
        }
      } else if (tag === "br") {
        acc.push(<br key={ctx.key++} />);
      } else if (tag === "wbr" || tag === "style" || tag === "script" || tag === "head" || tag === "title") {
        // Contorno da scartare (incluso lo <wbr> e gli stili inline).
      } else if (tag === "b" || tag === "strong") {
        const inner: ReactNode[] = [];
        walk(el, inner);
        acc.push(<strong key={ctx.key++}>{inner}</strong>);
      } else if (tag === "i" || tag === "em") {
        const inner: ReactNode[] = [];
        walk(el, inner);
        acc.push(<em key={ctx.key++}>{inner}</em>);
      } else if (tag === "li") {
        acc.push(<Fragment key={ctx.key++}>• </Fragment>);
        walk(el, acc);
        acc.push(<br key={ctx.key++} />);
      } else if (tag === "div" || tag === "p" || tag === "tr") {
        const before = acc.length;
        walk(el, acc);
        if (acc.length > before) acc.push(<br key={ctx.key++} />); // blocco → a capo
      } else {
        walk(el, acc); // span, ul, ol, td, font, ecc.: contenuto inline
      }
    });
  };

  walk(doc.body, out);
  return out;
}

interface LinkifyProps {
  text: string | null | undefined;
  /** Classi applicate agli <a> (colore/underline). */
  linkClassName?: string;
}

export function Linkify({ text, linkClassName = "" }: LinkifyProps) {
  const nodes = useMemo(() => {
    const src = text ?? "";
    const ctx: Ctx = { key: 0, cls: linkClassName };
    return HTML_RE.test(src) ? htmlToNodes(src, ctx) : tokenizeText(src, ctx);
  }, [text, linkClassName]);

  return <>{nodes}</>;
}
