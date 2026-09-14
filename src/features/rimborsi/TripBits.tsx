import { Icon } from "../../components/ui/Icon";
import type { Trip } from "../../api/expenses";
import { EVIDENCE_META, STATUS_META, euro } from "./format";

// Pezzi minuti riusati da tabella, card e coda approvazioni: stato della riga,
// pallini delle prove documentali, avviso sui giustificativi mancanti.

export function StatusBadge({ trip }: { trip: Trip }) {
  const meta = STATUS_META[trip.status];
  const tone =
    meta.tone === "success"
      ? "bg-success/10 text-success border-success/25"
      : meta.tone === "warning"
        ? "bg-warning/10 text-warning border-warning/25"
        : meta.tone === "danger"
          ? "bg-danger/10 text-danger border-danger/25"
          : "bg-line text-muted border-line dark:bg-[#1c1c20] dark:text-muted-dark dark:border-[#2a2a2e]";

  // Per una riga approvata conta anche se è già finita sul foglio: è la domanda
  // che ci si fa guardando la tabella a fine mese.
  if (trip.status === "approvata") {
    return trip.synced ? (
      <span className="inline-flex items-center gap-1 rounded-pill border border-success/25 bg-success/10 px-2 py-[3px] text-[10px] font-semibold text-success">
        <Icon name="check" className="h-3 w-3" /> Sul foglio
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 rounded-pill border border-info/25 bg-info/10 px-2 py-[3px] text-[10px] font-semibold text-info">
        Da inviare
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1 rounded-pill border px-2 py-[3px] text-[10px] font-semibold ${tone}`}>
      {meta.label}
    </span>
  );
}

export function EvidencePins({ trip, size = "sm" }: { trip: Trip; size?: "sm" | "xs" }) {
  const { evidence } = trip;
  if (!evidence.required.length) return null;
  const dot = size === "xs" ? "h-[18px] w-[18px]" : "h-5 w-5";
  const glyph = size === "xs" ? "h-2.5 w-2.5" : "h-3 w-3";

  return (
    <span
      className="inline-flex items-center gap-1"
      title={`Prove documentali: ${evidence.present}/${evidence.total}`}
    >
      {evidence.required.map((kind) => {
        const meta = EVIDENCE_META[kind];
        const on = evidence.have[kind];
        return (
          <i
            key={kind}
            title={`${meta.label} — ${on ? "presente" : "mancante"}`}
            className={`inline-flex items-center justify-center rounded-full border ${dot} ${
              on
                ? "border-success/30 bg-success/12 text-success"
                : "border-line bg-transparent text-muted/50 dark:border-[#2a2a2e] dark:text-muted-dark/60"
            }`}
          >
            <Icon name={meta.icon} className={glyph} />
          </i>
        );
      })}
      <b
        className={`ml-0.5 text-[10px] font-semibold ${
          evidence.complete ? "text-success" : "text-muted dark:text-muted-dark"
        }`}
      >
        {evidence.present}/{evidence.total}
      </b>
    </span>
  );
}

export function ReceiptsHint({ trip }: { trip: Trip }) {
  const receipts = trip.attachments.filter((a) => a.kind === "giustificativo");
  if (receipts.length) {
    return (
      <span
        className="inline-flex items-center gap-1 text-[11px] text-muted dark:text-muted-dark"
        title={receipts.map((r) => r.filename).join("\n")}
      >
        <Icon name="paperclip" className="h-3 w-3" />
        {receipts.length}
      </span>
    );
  }
  if (!trip.needs_receipts) return null;
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-medium text-warning"
      title={`Spese per ${euro(trip.expenses_total)} senza giustificativo allegato`}
    >
      <Icon name="alert-triangle" className="h-3 w-3" />
      Senza ricevuta
    </span>
  );
}

export function PersonAvatar({ trip }: { trip: Trip }) {
  return (
    <span
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-purple/10 text-[10px] font-bold text-brand-purple dark:bg-brand-magenta/15 dark:text-brand-magenta"
      title={trip.user_name ?? ""}
    >
      {trip.user_initials ?? "?"}
    </span>
  );
}
