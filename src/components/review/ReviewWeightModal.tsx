import { useEffect, useState } from "react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Textarea } from "../ui/Textarea";
import { Input } from "../ui/Input";
import { useToast } from "../../context/ToastContext";
import { getWorkloadWeightsApi } from "../../api/workloadWeights";
import { formatDurationHuman } from "../../utils/duration";

interface ReviewWeightModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  confirmLabel: string;
  /** Situazione peso in config azienda (rework | rework_cliente | awaiting_publish). */
  situationKey: string;
  companyId?: number;
  /** Ore stimate della task, per l'anteprima durata col peso scelto. */
  estimatedHours: number | null;
  /** Commento obbligatorio (rimando) o facoltativo (pubblicazione). */
  commentRequired: boolean;
  commentPlaceholder?: string;
  /** Mostra il campo "nuova scadenza". */
  showDeadline?: boolean;
  currentDeadline?: string | null;
  onConfirm: (v: { text: string; factor: number; deadline?: string | null }) => Promise<void>;
}

/**
 * Modal condiviso "commento + peso" usato da: Rimanda indietro (rework interno/cliente,
 * commento obbligatorio + scadenza) e Metti in pubblicazione (awaiting_publish, commento
 * facoltativo). Il peso mostra il default aziendale della situazione, l'anteprima durata
 * ed è bloccato se "permanente". Stepper +/- tematizzato (niente frecce del browser).
 */
export function ReviewWeightModal({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  situationKey,
  companyId,
  estimatedHours,
  commentRequired,
  commentPlaceholder,
  showDeadline = false,
  currentDeadline,
  onConfirm,
}: ReviewWeightModalProps) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [deadline, setDeadline] = useState<string>("");
  const [pct, setPct] = useState<string>("50");
  const [defaultPct, setDefaultPct] = useState<number>(50);
  const [locked, setLocked] = useState<boolean>(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setText("");
    setDeadline(currentDeadline ?? "");
    let cancelled = false;
    if (companyId) {
      getWorkloadWeightsApi(companyId)
        .then((cfg) => {
          if (cancelled) return;
          const s = cfg.situations.find((x) => x.key === situationKey);
          if (!s) return;
          setLocked(s.locked);
          setDefaultPct(Math.round(s.default_factor * 100));
          setPct(String(Math.round(s.factor * 100)));
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [open, companyId, situationKey, currentDeadline]);

  const clampPct = (n: number) => Math.max(0, Math.min(300, n));
  const step = (delta: number) => setPct(String(clampPct((Number(pct) || 0) + delta)));
  const factor = clampPct(Number(pct) || 0) / 100;
  const durationLabel =
    estimatedHours != null && estimatedHours > 0 ? formatDurationHuman(estimatedHours * factor) : "—";

  const confirm = async () => {
    if (commentRequired && !text.trim()) {
      toast.error("Scrivi un commento.");
      return;
    }
    setBusy(true);
    try {
      await onConfirm({
        text: text.trim(),
        factor,
        deadline: showDeadline && deadline && deadline !== (currentDeadline ?? "") ? deadline : undefined,
      });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      // Niente bozza: il commento di un rimando e' un messaggio una tantum, legato a QUELLA
      // lavorazione. Il Modal salva le bozze in sessionStorage con una chiave ricavata da
      // percorso + titolo — qui identica per ogni task — e non le cancella mai: il motivo
      // scritto su una lavorazione ricompariva precompilato sul rimando successivo, di
      // un'altra task. Un campo vuoto e' l'unico comportamento corretto.
      persistDraft={false}
      description={description}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Annulla
          </Button>
          <Button
            variant="primary"
            onClick={() => void confirm()}
            loading={busy}
            disabled={commentRequired && !text.trim()}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Textarea
          label={commentRequired ? "Commento (obbligatorio)" : "Commento (facoltativo)"}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={commentPlaceholder ?? "Scrivi un commento…"}
          rows={3}
          maxLength={2000}
        />

        {showDeadline ? (
          <Input
            type="date"
            label="Nuova scadenza (facoltativa)"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            onPostpone={(iso) => setDeadline(iso)}
          />
        ) : null}

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">
            Peso
          </label>
          <div className="flex items-center gap-2 text-sm">
            <div className="inline-flex items-center overflow-hidden rounded-md border border-line dark:border-line-dark">
              <button
                type="button"
                onClick={() => step(-5)}
                disabled={locked}
                aria-label="Diminuisci"
                className="px-3 py-1.5 text-base leading-none text-ink transition-colors hover:bg-cream disabled:opacity-40 dark:text-paper dark:hover:bg-[#1c1c20]"
              >
                −
              </button>
              <input
                inputMode="numeric"
                value={pct}
                disabled={locked}
                onChange={(e) => setPct(e.target.value.replace(/[^\d]/g, ""))}
                className="w-14 border-x border-line bg-paper px-1 py-1.5 text-center text-ink outline-none disabled:opacity-50 dark:border-line-dark dark:bg-[#0E0F0E] dark:text-paper"
              />
              <button
                type="button"
                onClick={() => step(5)}
                disabled={locked}
                aria-label="Aumenta"
                className="px-3 py-1.5 text-base leading-none text-ink transition-colors hover:bg-cream disabled:opacity-40 dark:text-paper dark:hover:bg-[#1c1c20]"
              >
                +
              </button>
            </div>
            <span className="text-muted dark:text-muted-dark">%</span>
            <span className="text-muted dark:text-muted-dark">
              · durerebbe <b className="text-ink dark:text-paper">{durationLabel}</b>
            </span>
          </div>
          <p className="text-[11px] text-muted dark:text-muted-dark">
            {locked
              ? `Permanente (impostato dall'admin): ${defaultPct}% · non modificabile.`
              : `Default aziendale ${defaultPct}% · puoi cambiarlo per questa task.`}
          </p>
        </div>
      </div>
    </Modal>
  );
}
