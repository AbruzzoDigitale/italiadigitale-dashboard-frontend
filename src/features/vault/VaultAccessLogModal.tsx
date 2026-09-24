import { useCallback, useEffect, useMemo, useState } from "react";
import {
  VAULT_ACTION_LABELS,
  listVaultAccessesApi,
  type VaultAccess,
  type VaultAction,
} from "../../api/vault";
import { Badge } from "../../components/ui/Badge";
import { FieldLabel } from "../../components/ui/FieldLabel";
import { Icon } from "../../components/ui/Icon";
import { Input } from "../../components/ui/Input";
import { Modal } from "../../components/ui/Modal";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import { Skeleton } from "../../components/ui/Skeleton";
import { useToast } from "../../context/ToastContext";

/**
 * Registro degli accessi alla cassaforte.
 *
 * È la prova di accountability dell'art. 5.2 del GDPR: finora veniva scritta a
 * ogni rivelazione e non era leggibile da nessuna parte, il che ne sprecava
 * metà del valore — la prova ce l'hai ma non la sai tirare fuori.
 *
 * Sopravvive alla cancellazione della voce e dell'utente, quindi qui compaiono
 * righe che puntano a credenziali non più esistenti: sono proprio quelle che
 * servono a rispondere «chi aveva visto cosa».
 */

interface Props {
  open: boolean;
  onClose: () => void;
  companyId: number;
}

const PERIODI = [
  { value: "7", label: "Ultimi 7 giorni" },
  { value: "30", label: "Ultimi 30 giorni" },
  { value: "90", label: "Ultimi 3 mesi" },
  { value: "365", label: "Ultimo anno" },
  { value: "", label: "Tutto lo storico" },
];

const AZIONI = [
  { value: "", label: "Tutte le azioni" },
  ...(Object.keys(VAULT_ACTION_LABELS) as VaultAction[]).map((a) => ({
    value: a,
    label: VAULT_ACTION_LABELS[a],
  })),
];

/** Le azioni che meritano di saltare all'occhio scorrendo il registro. */
const TONO: Partial<Record<VaultAction, "danger" | "warning" | "info">> = {
  share_denied: "danger",
  share_viewed: "warning",
  share_created: "warning",
  reveal: "info",
};

export function VaultAccessLogModal({ open, onClose, companyId }: Props) {
  const [righe, setRighe] = useState<VaultAccess[] | null>(null);
  const [periodo, setPeriodo] = useState("30");
  const [azione, setAzione] = useState("");
  const [q, setQ] = useState("");
  const toast = useToast();

  const carica = useCallback(async () => {
    setRighe(null);
    try {
      setRighe(
        await listVaultAccessesApi({
          companyId,
          action: (azione || undefined) as VaultAction | undefined,
          days: periodo ? Number(periodo) : undefined,
          limit: 1000,
        })
      );
    } catch (e) {
      setRighe([]);
      toast.error(e instanceof Error ? e.message : "Registro non leggibile");
    }
  }, [companyId, azione, periodo, toast]);

  useEffect(() => {
    if (open) void carica();
  }, [open, carica]);

  const filtrate = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return righe ?? [];
    return (righe ?? []).filter(
      (r) =>
        r.item_label.toLowerCase().includes(t) ||
        (r.user_name ?? "").toLowerCase().includes(t) ||
        (r.ip ?? "").includes(t)
    );
  }, [righe, q]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Registro accessi"
      description="Chi ha aperto cosa, e quando. Resta anche se la credenziale viene eliminata."
      size="xl"
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <FieldLabel>Periodo</FieldLabel>
            <SearchableSelect value={periodo} onChange={setPeriodo} options={PERIODI} />
          </div>
          <div>
            <FieldLabel>Azione</FieldLabel>
            <SearchableSelect value={azione} onChange={setAzione} options={AZIONI} />
          </div>
          <Input
            label="Cerca"
            name="cerca-registro"
            autoComplete="off"
            placeholder="Credenziale, persona, IP…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {righe === null ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-2/3" />
          </div>
        ) : filtrate.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted dark:text-muted-dark">
            Nessun accesso in questo periodo.
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              {filtrate.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center gap-2 rounded-lg border border-line/60 px-2.5 py-1.5 text-sm dark:border-line-dark/60"
                >
                  <Badge variant={TONO[r.action] ?? "default"} className="shrink-0">
                    {VAULT_ACTION_LABELS[r.action] ?? r.action}
                  </Badge>
                  <span className="truncate font-medium">
                    {r.item_label || "(credenziale eliminata)"}
                  </span>
                  <span className="truncate text-xs text-muted dark:text-muted-dark">
                    {r.user_name ?? (
                      <span className="inline-flex items-center gap-1">
                        <Icon name="link" className="h-3 w-3" />
                        da link pubblico
                      </span>
                    )}
                  </span>
                  <span className="ml-auto shrink-0 text-xs text-muted dark:text-muted-dark">
                    {r.ip && <span className="mr-2 font-mono">{r.ip}</span>}
                    {new Date(r.created_at).toLocaleString("it-IT", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted dark:text-muted-dark">
              {filtrate.length} righe. Le aperture da link pubblico non hanno un utente:
              di quelle restano indirizzo IP e momento.
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}
