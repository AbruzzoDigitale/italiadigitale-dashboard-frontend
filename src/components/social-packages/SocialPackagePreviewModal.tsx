import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Modal } from "../ui/Modal";
import type { SocialPackageQuotePreviewResponse } from "../../api/socialPackages";
import { formatCurrency } from "../../features/social-packages/draft";

interface SocialPackagePreviewModalProps {
  open: boolean;
  preview: SocialPackageQuotePreviewResponse | null;
  loading: boolean;
  onClose: () => void;
  onConvert: () => void;
}

export function SocialPackagePreviewModal({ open, preview, loading, onClose, onConvert }: SocialPackagePreviewModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={preview ? `Anteprima ${preview.package_title}` : "Anteprima preventivo"}
      description={preview ? `Durata ${preview.duration_months} mesi` : undefined}
      size="xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Chiudi
          </Button>
          <Button variant="primary" onClick={onConvert} loading={loading} leftIcon={<Icon name="check" className="w-4 h-4" />}>
            Crea preventivo
          </Button>
        </>
      }
    >
      {!preview ? (
        <p className="text-sm text-muted dark:text-[#9999a0]">Nessuna anteprima disponibile.</p>
      ) : (
        <div className="grid gap-5">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-line dark:border-[#2a2a2e] bg-cream/30 dark:bg-[#1c1c20] p-4">
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted dark:text-[#9999a0]">Pacchetto</div>
              <div className="mt-2 text-base font-display font-bold tracking-tight text-ink dark:text-paper">{preview.package_title}</div>
              <div className="text-sm text-muted dark:text-[#9999a0]">{preview.package_slug}</div>
            </div>
            <div className="rounded-xl border border-line dark:border-[#2a2a2e] bg-cream/30 dark:bg-[#1c1c20] p-4">
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted dark:text-[#9999a0]">Durata</div>
              <div className="mt-2 text-base font-display font-bold tracking-tight text-ink dark:text-paper">{preview.duration_months} mesi</div>
              <div className="text-sm text-muted dark:text-[#9999a0]">{preview.lines.length} righe generate</div>
            </div>
            <div className="rounded-xl border border-line dark:border-[#2a2a2e] bg-cream/30 dark:bg-[#1c1c20] p-4">
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted dark:text-[#9999a0]">Totale</div>
              <div className="mt-2 text-base font-display font-bold tracking-tight text-ink dark:text-paper">
                {preview.totals ? formatCurrency(preview.totals.total, "EUR") : "-"}
              </div>
              <div className="text-sm text-muted dark:text-[#9999a0]">Sconti e IVA inclusi</div>
            </div>
          </div>

          <div className="grid gap-3">
            {preview.lines.map((line, index) => (
              <article key={`${line.name}-${index}`} className="rounded-xl border border-line dark:border-[#2a2a2e] bg-paper dark:bg-[#141419] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-display text-sm font-bold tracking-tight text-ink dark:text-paper">{line.name}</h4>
                      {line.included && <Badge variant="warning">Inclusa</Badge>}
                      {line.autoAdded && <Badge variant="info">Auto</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-muted dark:text-[#9999a0]">{line.desc || line.category || "Voce di preventivo"}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted dark:text-[#9999a0]">
                    <span className="rounded-full border border-line dark:border-[#2a2a2e] px-2 py-1">{formatCurrency(line.net, "EUR")}</span>
                    <span className="rounded-full border border-line dark:border-[#2a2a2e] px-2 py-1">Q.tà {line.quantity ?? 1}</span>
                    <span className="rounded-full border border-line dark:border-[#2a2a2e] px-2 py-1">{line.period ?? "oneoff"}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
