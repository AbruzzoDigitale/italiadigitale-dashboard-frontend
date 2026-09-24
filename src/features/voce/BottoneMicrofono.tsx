import { Icon } from "../../components/ui/Icon";

/**
 * Il pulsante per dettare. Non compare se il browser non sa ascoltare: meglio niente
 * che un pulsante che non fa niente.
 */
export function BottoneMicrofono({
  supportata,
  inAscolto,
  onAvvia,
  onFerma,
  disabilitato,
}: {
  supportata: boolean;
  inAscolto: boolean;
  onAvvia: () => void;
  onFerma: () => void;
  disabilitato?: boolean;
}) {
  if (!supportata) return null;

  return (
    <button
      type="button"
      onClick={inAscolto ? onFerma : onAvvia}
      disabled={disabilitato}
      aria-pressed={inAscolto}
      aria-label={inAscolto ? "Ferma la dettatura" : "Detta con la voce"}
      title={inAscolto ? "Ferma la dettatura" : "Detta con la voce"}
      className={`relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-pill border
                  transition-colors disabled:opacity-50 ${
                    inAscolto
                      ? "border-brand-magenta text-brand-magenta"
                      : "border-line dark:border-[#2a2a2e] text-muted dark:text-[#9999a0] hover:text-ink dark:hover:text-[#f4f4f7]"
                  }`}
    >
      {inAscolto ? (
        <span
          className="absolute inset-0 rounded-pill border border-brand-magenta animate-ping opacity-60"
          aria-hidden
        />
      ) : null}
      <Icon name="activity" className="w-4 h-4" />
    </button>
  );
}
