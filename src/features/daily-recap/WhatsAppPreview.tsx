import { parseWaLine } from "./recapTemplate";

/**
 * Anteprima che replica una chat WhatsApp: header contatto, messaggio in
 * arrivo che chiede il recap, bolla di risposta con i marcatori renderizzati
 * (*grassetto*, _corsivo_, ~barrato~, ```monospazio```), spunte "lette" e
 * barra di invio finta. Usata nell'editor del template e in Attività del giorno.
 */

/** Doppia spunta blu stile WhatsApp (due check sovrapposti). */
function ReadTicks() {
  return (
    <svg viewBox="0 0 16 11" width="16" height="11" fill="none" aria-hidden="true" className="inline-block">
      <path d="M1 6.2 L4.2 9.2 L10.4 1.6" stroke="#53bdeb" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.6 6.2 L8.8 9.2 L15 1.6" stroke="#53bdeb" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FormattedText({ text }: { text: string }) {
  return (
    <div className="whitespace-pre-wrap break-words text-[13px] leading-relaxed">
      {text.split("\n").map((line, i) => (
        <div key={i} className="min-h-[1.2em]">
          {parseWaLine(line).map((seg, j) => (
            <span
              key={j}
              className={`${seg.bold ? "font-bold" : ""} ${seg.italic ? "italic" : ""} ${
                seg.strike ? "line-through" : ""
              } ${seg.mono ? "font-mono text-[12px]" : ""}`}
            >
              {seg.text}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

const URGENCY_LEGEND: Array<{ emoji: string; label: string }> = [
  { emoji: "🟢", label: "Bassa" },
  { emoji: "⚪", label: "Normale" },
  { emoji: "🟠", label: "Alta" },
  { emoji: "🔴", label: "Critica" },
];

export function WhatsAppPreview({
  text,
  contactName = "Il tuo team",
  avatarUrl,
}: {
  text: string;
  contactName?: string;
  /** Immagine del "gruppo" (logo dell'azienda selezionata). */
  avatarUrl?: string | null;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-line shadow-1 dark:border-[#2a2a2e]">
      {/* Header contatto */}
      <div className="flex items-center gap-2.5 bg-[#f0f2f5] px-3 py-2 dark:bg-[#202c33]">
        <span className="grid h-8 w-8 flex-none place-items-center overflow-hidden rounded-full bg-white dark:bg-[#3b4a54]">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-full w-full object-contain p-0.5" />
          ) : (
            <svg viewBox="0 0 24 24" width="20" height="20" fill="#9aa5ab" aria-hidden="true">
              <circle cx="12" cy="8.5" r="4" />
              <path d="M4 20.5c0-3.6 3.6-6 8-6s8 2.4 8 6v.5H4z" />
            </svg>
          )}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-[#111b21] dark:text-[#e9edef]">{contactName}</p>
          <p className="text-[11px] text-[#667781] dark:text-[#8696a0]">online</p>
        </div>
      </div>

      {/* Conversazione */}
      <div className="flex flex-col gap-2 bg-[#e5ddd5] p-3 dark:bg-[#0b141a]">
        <div className="mr-auto max-w-[75%] rounded-lg rounded-tl-none bg-white px-3 py-2 shadow-sm dark:bg-[#202c33]">
          <div className="text-[13px] leading-relaxed text-[#111b21] dark:text-[#e9edef]">
            Ricordati: il recap va mandato a inizio e a fine giornata 🙏
          </div>
          <div className="mt-0.5 text-right text-[10px] text-[#667781] dark:text-[#8696a0]">12:46</div>
        </div>

        <div className="ml-auto max-w-[88%] rounded-lg rounded-tr-none bg-[#dcf8c6] px-3 py-2 shadow-sm dark:bg-[#005c4b]">
          <div className="text-[#111b21] dark:text-[#e9edef]">
            <FormattedText text={text} />
          </div>
          <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-[#667781] dark:text-[#8696a0]">
            <span>12:47</span>
            <ReadTicks />
          </div>
        </div>
      </div>

      {/* Barra di invio finta */}
      <div className="flex items-center gap-2 bg-[#f0f2f5] px-3 py-2 dark:bg-[#202c33]">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#8696a0" strokeWidth="1.6" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path strokeLinecap="round" d="M8.6 14.2a4.4 4.4 0 0 0 6.8 0" />
          <line x1="9" y1="9.6" x2="9.01" y2="9.6" strokeWidth="2.2" strokeLinecap="round" />
          <line x1="15" y1="9.6" x2="15.01" y2="9.6" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
        <div className="flex-1 rounded-pill bg-white px-3 py-1.5 text-[12.5px] text-[#8696a0] dark:bg-[#2a3942]">
          Messaggio
        </div>
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#8696a0" strokeWidth="1.6" aria-hidden="true">
          <rect x="9.2" y="3.5" width="5.6" height="10.5" rx="2.8" />
          <path strokeLinecap="round" d="M6 11.5a6 6 0 0 0 12 0M12 17.5V21" />
        </svg>
      </div>

      {/* Legenda urgenze */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line bg-paper px-3 py-2 dark:border-[#2a2a2e] dark:bg-[#131316]">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted dark:text-muted-dark">
          Urgenze
        </span>
        {URGENCY_LEGEND.map((u) => (
          <span key={u.label} className="inline-flex items-center gap-1 text-[11.5px] text-muted dark:text-muted-dark">
            <span>{u.emoji}</span>
            {u.label}
          </span>
        ))}
      </div>
    </div>
  );
}
