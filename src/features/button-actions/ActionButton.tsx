import { Icon } from "../../components/ui/Icon";
import type { IconName } from "../../components/ui/Icon";
import type { ButtonStateItem } from "../../api/buttonActions";

// Il bottone configurabile, in due stati:
//
//   NON configurato → grigio col bordo magenta, e lo vede solo l'admin. È un
//     invito: «io ci sono, ma non faccio ancora niente». Al clic si apre il
//     popup di configurazione.
//   configurato → bottone normale. Lo vedono e lo premono tutti.
//
// Se l'azione è già stata eseguita su questa riga, il tooltip lo dice: una
// mail al cliente non si ritira, e mandarla due volte è un errore vero.

interface Props {
  state: ButtonStateItem | undefined;
  label: string;
  icon?: IconName;
  canConfigure: boolean;
  onConfigure: () => void;
  onRun: () => void;
  disabled?: boolean;
}

function quandoLeggibile(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
}

export function ActionButton({
  state,
  label,
  icon = "mail",
  canConfigure,
  onConfigure,
  onRun,
  disabled = false,
}: Props) {
  if (!state?.visible) return null;

  const inviato = state.last_run ? quandoLeggibile(state.last_run.at) : "";

  if (!state.configured) {
    return (
      <button
        type="button"
        title={`${label} — bottone da configurare (lo vedi solo tu, come admin)`}
        aria-label={`Configura: ${label}`}
        onClick={onConfigure}
        disabled={disabled}
        className="inline-grid h-7 w-7 place-items-center rounded-md border border-dashed border-brand-magenta bg-line/30 text-muted transition-colors hover:bg-brand-magenta/10 hover:text-brand-magenta disabled:opacity-40 dark:bg-[#2a2a2e]/60 dark:text-[#9999a0]"
      >
        <Icon name={icon} className="h-3.5 w-3.5" />
      </button>
    );
  }

  return (
    <button
      type="button"
      title={inviato ? `${label} — già inviata il ${inviato}` : label}
      aria-label={label}
      onClick={onRun}
      // Clic destro: l'admin torna alla configurazione senza un secondo bottone
      // in una riga che ne ha già tre.
      onContextMenu={
        canConfigure
          ? (e) => {
              e.preventDefault();
              onConfigure();
            }
          : undefined
      }
      disabled={disabled}
      className={`relative inline-grid h-7 w-7 place-items-center rounded-md border transition-colors disabled:opacity-40 ${
        inviato
          ? "border-success/30 bg-success/5 text-success hover:bg-success/10"
          : "border-line text-ink hover:bg-paper dark:border-[#2a2a2e] dark:text-[#f4f4f7] dark:hover:bg-[#131316]"
      }`}
    >
      <Icon name={icon} className="h-3.5 w-3.5" />
      {inviato && (
        <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-success" />
      )}
    </button>
  );
}
