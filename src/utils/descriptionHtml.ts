// Converte la descrizione salvata (Markdown, HTML "sporco" da Trello/Gmail, o
// testo semplice) in HTML PULITO adatto al RichTextEditor: i link Markdown e gli
// URL nudi diventano <a>, l'HTML esistente viene ripulito (via <wbr>, <style>,
// attributi di contorno) mantenendo i link e gli a-capo.

const TOKEN =
  /\[([^\]]+)\]\(\s*(https?:\/\/[^\s)]+)(?:\s+"[^"]*")?\s*\)|(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi;
const HTML_RE = /<\/?[a-z][^>]*>/i;

function esc(s: string): string {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
function hrefOf(raw: string): string {
  return /^www\./i.test(raw) ? `https://${raw}` : raw;
}
function safeHref(raw: string): string {
  return /^https?:\/\//i.test(raw) ? raw : /^www\./i.test(raw) ? `https://${raw}` : "";
}
function anchor(url: string, label: string): string {
  return `<a href="${esc(url)}" target="_blank" rel="noreferrer noopener">${esc(label)}</a>`;
}

// Testo semplice → HTML: link Markdown e URL nudi diventano <a>, il resto è testo
// escapato; gli a-capo diventano <br>.
function linkifyPlain(text: string): string {
  let out = "";
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    const i = m.index ?? 0;
    if (i > last) out += esc(text.slice(last, i));
    if (m[1] && m[2]) out += anchor(hrefOf(m[2]), m[1]);
    else out += anchor(hrefOf(m[3]), m[3]);
    last = i + m[0].length;
  }
  if (last < text.length) out += esc(text.slice(last));
  return out.replace(/\r?\n/g, "<br>");
}

function walk(node: Node): string {
  let html = "";
  node.childNodes.forEach((child) => {
    if (child.nodeType === 3) {
      html += linkifyPlain((child.textContent ?? "").replace(/\s+/g, " "));
      return;
    }
    if (child.nodeType !== 1) return;
    const el = child as HTMLElement;
    const tag = el.tagName.toLowerCase();
    if (tag === "a") {
      const href = safeHref(el.getAttribute("href") || "");
      const label = el.textContent ?? "";
      html += href ? anchor(href, label) : esc(label);
    } else if (tag === "br") {
      html += "<br>";
    } else if (tag === "wbr" || tag === "style" || tag === "script" || tag === "head" || tag === "title") {
      // contorno da scartare
    } else if (tag === "b" || tag === "strong") {
      html += `<strong>${walk(el)}</strong>`;
    } else if (tag === "i" || tag === "em") {
      html += `<em>${walk(el)}</em>`;
    } else if (tag === "li") {
      html += `• ${walk(el)}<br>`;
    } else if (tag === "div" || tag === "p" || tag === "tr") {
      const inner = walk(el);
      html += inner ? `${inner}<br>` : "";
    } else {
      html += walk(el);
    }
  });
  return html;
}

/** Descrizione salvata → HTML pulito per l'editor rich-text. */
export function toEditorHtml(src: string | null | undefined): string {
  const s = (src ?? "").trim();
  if (!s) return "";
  if (!HTML_RE.test(s)) return linkifyPlain(s);
  const doc = new DOMParser().parseFromString(s, "text/html");
  return walk(doc.body).trim();
}
