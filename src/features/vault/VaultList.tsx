import { useCallback, useEffect, useState } from "react";
import {
  VAULT_KIND_LABELS,
  VaultLockedError,
  deleteVaultItemApi,
  isVaultUnlocked,
  listVaultItemsApi,
  revealVaultItemApi,
  type VaultItem,
  type VaultListFilters,
} from "../../api/vault";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Checkbox } from "../../components/ui/Checkbox";
import { Icon } from "../../components/ui/Icon";
import { Skeleton } from "../../components/ui/Skeleton";
import { useToast } from "../../context/ToastContext";
import { useAuth } from "../../hooks/useAuth";
import { VaultGrantModal } from "./VaultGrantModal";
import { VaultShareModal } from "./VaultShareModal";
import { VaultUnlockModal } from "./VaultUnlockModal";
import { contaGruppo, groupItems, type VaultGroup, type VaultView } from "./grouping";

/**
 * Elenco della cassaforte, raggruppato secondo la vista scelta.
 *
 * Riusato in due posti: la pagina Cassaforte e il pannello dentro un sito. Nel
 * secondo caso basta passare `filters={{ targetType: "website", targetId }}`.
 *
 * I valori in chiaro non arrivano mai con l'elenco: si chiedono uno alla volta,
 * e ogni richiesta finisce nel registro accessi lato server.
 */

interface Props {
  filters?: VaultListFilters;
  view?: VaultView;
  /** Ricarica quando cambia: chi crea o modifica incrementa questo numero. */
  reloadKey?: number;
  onEdit?: (item: VaultItem) => void;
  emptyHint?: string;
}

export function VaultList({ filters = {}, view = "client", reloadKey = 0, onEdit, emptyHint }: Props) {
  const [items, setItems] = useState<VaultItem[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [sbloccoAperto, setSbloccoAperto] = useState(false);
  // Azione da riprovare dopo lo sblocco: evita di far ricliccare l'utente.
  const [inSospeso, setInSospeso] = useState<(() => void) | null>(null);
  const [rivelati, setRivelati] = useState<Record<number, string>>({});
  const [daCondividere, setDaCondividere] = useState<VaultItem | null>(null);
  const [selezionati, setSelezionati] = useState<Set<number>>(new Set());
  const [permessiAperti, setPermessiAperti] = useState(false);
  const toast = useToast();

  const chiave = JSON.stringify(filters);
  const carica = useCallback(async () => {
    setCaricamento(true);
    try {
      setItems(await listVaultItemsApi(JSON.parse(chiave)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Impossibile leggere la cassaforte");
    } finally {
      setCaricamento(false);
    }
  }, [chiave, toast]);

  useEffect(() => {
    void carica();
  }, [carica, reloadKey]);

  // Cambiati i filtri, la selezione si azzera: agire su voci sparite dalla
  // vista è il modo classico per condividere qualcosa senza accorgersene.
  useEffect(() => {
    setSelezionati(new Set());
  }, [chiave, view]);

  /** Esegue l'azione, e se la cassaforte è chiusa apre lo sblocco e la ritenta. */
  const conSblocco = useCallback(
    async (azione: () => Promise<void>) => {
      if (!isVaultUnlocked()) {
        setInSospeso(() => () => void azione());
        setSbloccoAperto(true);
        return;
      }
      try {
        await azione();
      } catch (e) {
        if (e instanceof VaultLockedError) {
          setInSospeso(() => () => void azione());
          setSbloccoAperto(true);
          return;
        }
        toast.error(e instanceof Error ? e.message : "Operazione non riuscita");
      }
    },
    [toast]
  );

  const inverti = (id: number) =>
    setSelezionati((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const mostra = (item: VaultItem) =>
    conSblocco(async () => {
      const dati = await revealVaultItemApi(item.id);
      setRivelati((r) => ({ ...r, [item.id]: dati.secret ?? "" }));
    });

  // Si passa da conSblocco prima ancora di aprire il modale: creare un link
  // richiede la cassaforte sbloccata, e scoprirlo dopo aver compilato il form
  // sarebbe una pessima sorpresa.
  const condividi = (item: VaultItem) =>
    conSblocco(async () => {
      setDaCondividere(item);
    });

  const copia = (item: VaultItem) =>
    conSblocco(async () => {
      const dati = await revealVaultItemApi(item.id);
      if (!dati.secret) {
        toast.error("Nessun valore da copiare");
        return;
      }
      await navigator.clipboard.writeText(dati.secret);
      toast.success("Password copiata negli appunti");
    });

  async function elimina(item: VaultItem) {
    if (!confirm(`Eliminare «${item.label}»? L'operazione non si annulla.`)) return;
    try {
      await deleteVaultItemApi(item.id);
      toast.success("Credenziale eliminata");
      void carica();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Eliminazione non riuscita");
    }
  }

  // Niente `return` anticipati qui: il modale di sblocco deve restare montato
  // anche mentre la lista ricarica o è vuota. Altrimenti basta che cambi un
  // filtro durante lo sblocco e il modale sparisce, portandosi via l'azione in
  // sospeso — e su una cassaforte ancora vuota non si riuscirebbe mai ad aprirla.
  let contenuto;
  if (caricamento) {
    contenuto = (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-2/3" />
      </div>
    );
  } else if (items.length === 0) {
    contenuto = (
      <p className="p-4 text-sm text-muted dark:text-muted-dark">
        {emptyHint ?? "Nessuna credenziale in cassaforte."}
      </p>
    );
  } else {
    contenuto = (
      <div className="flex flex-col gap-3">
        {groupItems(items, view).map((g) => (
          <Gruppo
            key={g.key}
            gruppo={g}
            rivelati={rivelati}
            onMostra={mostra}
            onCopia={copia}
            onCondividi={condividi}
            selezionati={selezionati}
            onSeleziona={inverti}
            onEdit={onEdit}
            onElimina={elimina}
          />
        ))}
      </div>
    );
  }

  return (
    <>
      {selezionati.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-brand/30 bg-brand/5 px-3 py-2 text-sm">
          <span className="font-semibold">
            {selezionati.size} {selezionati.size === 1 ? "selezionata" : "selezionate"}
          </span>
          {selezionati.size < items.length && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelezionati(new Set(items.map((i) => i.id)))}
            >
              Seleziona tutte ({items.length})
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setSelezionati(new Set())}>
            Annulla
          </Button>
          <Button
            size="sm"
            className="ml-auto"
            onClick={() => setPermessiAperti(true)}
            title="Le rende visibili nella cassaforte di un collega"
          >
            <Icon name="users" className="mr-1 h-4 w-4" />
            Condividi con un collega
          </Button>
        </div>
      )}

      {contenuto}

      <VaultGrantModal
        open={permessiAperti}
        onClose={() => setPermessiAperti(false)}
        companyId={filters.companyId ?? 0}
        itemIds={[...selezionati]}
        onDone={() => {
          setSelezionati(new Set());
          void carica();
        }}
      />

      <VaultShareModal
        open={daCondividere !== null}
        onClose={() => setDaCondividere(null)}
        item={daCondividere}
      />

      <VaultUnlockModal
        open={sbloccoAperto}
        onClose={() => {
          setSbloccoAperto(false);
          setInSospeso(null);
        }}
        onUnlocked={() => {
          inSospeso?.();
          setInSospeso(null);
        }}
      />
    </>
  );
}

interface GruppoProps {
  gruppo: VaultGroup;
  livello?: number;
  rivelati: Record<number, string>;
  onMostra: (i: VaultItem) => void;
  onCopia: (i: VaultItem) => void;
  onCondividi: (i: VaultItem) => void;
  selezionati: Set<number>;
  onSeleziona: (id: number) => void;
  onEdit?: (i: VaultItem) => void;
  onElimina: (i: VaultItem) => void;
}

function Gruppo({ gruppo, livello = 0, ...rest }: GruppoProps) {
  const [aperto, setAperto] = useState(true);
  const totale = contaGruppo(gruppo);

  return (
    <section
      className={
        livello === 0
          ? "rounded-xl border border-line bg-surface dark:border-line-dark dark:bg-surface-dark"
          : "border-l border-line pl-3 dark:border-line-dark"
      }
    >
      <button
        type="button"
        onClick={() => setAperto((a) => !a)}
        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left transition hover:bg-muted/5"
        aria-expanded={aperto}
      >
        <Icon
          name={aperto ? "chevron-down" : "chevron-right"}
          className="h-4 w-4 shrink-0 text-muted dark:text-muted-dark"
        />
        <span className="truncate font-semibold">{gruppo.label}</span>
        {gruppo.sublabel && (
          <span className="truncate text-xs text-muted dark:text-muted-dark">
            {gruppo.sublabel}
          </span>
        )}
        <Badge className="ml-auto shrink-0">{totale}</Badge>
      </button>

      {aperto && (
        <div className="flex flex-col gap-1.5 px-3 pb-3">
          {gruppo.items.map((item) => (
            <Riga key={item.id} item={item} {...rest} />
          ))}
          {(gruppo.children ?? []).map((c) => (
            <Gruppo key={c.key} gruppo={c} livello={livello + 1} {...rest} />
          ))}
        </div>
      )}
    </section>
  );
}

function Riga({
  item,
  rivelati,
  onMostra,
  onCopia,
  onCondividi,
  onEdit,
  onElimina,
  selezionati,
  onSeleziona,
}: { item: VaultItem } & Omit<GruppoProps, "gruppo" | "livello">) {
  const { user } = useAuth();
  const scoperto = rivelati[item.id];
  // "Condivisa da" solo se è arrivata a TE da qualcun altro: sulle proprie voci
  // sarebbe rumore, e sulle altrui non è un'informazione che ti riguarda.
  const condivisaDa =
    item.owner_user_id === user?.id
      ? null
      : item.grants.find((g) => g.user_id === user?.id)?.granted_by_name ?? null;

  return (
    <div
      className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm ${
        selezionati.has(item.id)
          ? "border-brand/40 bg-brand/5"
          : "border-line/60 dark:border-line-dark/60"
      }`}
    >
      <Checkbox
        checked={selezionati.has(item.id)}
        onChange={() => onSeleziona(item.id)}
        aria-label={`Seleziona ${item.label}`}
      />
      <Badge variant="info" className="shrink-0">
        {VAULT_KIND_LABELS[item.kind] ?? item.kind}
      </Badge>
      <span className="truncate font-medium">{item.label}</span>
      {condivisaDa && (
        <span
          className="inline-flex shrink-0 items-center gap-1 text-xs text-muted dark:text-muted-dark"
          title={`Condivisa con te da ${condivisaDa}`}
        >
          <Icon name="users" className="h-3 w-3" />
          da {condivisaDa}
        </span>
      )}
      {item.username && (
        <span className="truncate text-xs text-muted dark:text-muted-dark">{item.username}</span>
      )}
      {item.rotation_due && (
        <Badge variant="warning" className="shrink-0">
          da rinnovare
        </Badge>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-1">
        {scoperto !== undefined && (
          <code className="max-w-[16rem] truncate rounded bg-muted/10 px-2 py-0.5 text-xs">
            {scoperto || "(vuoto)"}
          </code>
        )}
        {item.has_secret && (
          <>
            <Button
              size="sm"
              variant="ghost"
              title="Copia senza mostrarla"
              aria-label="Copia la password"
              onClick={() => onCopia(item)}
            >
              <Icon name="copy" className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              title="Mostra"
              aria-label="Mostra la password"
              onClick={() => onMostra(item)}
            >
              <Icon name="eye" className="h-4 w-4" />
            </Button>
            {item.can_manage && (
              <Button
                size="sm"
                variant="ghost"
                title="Condividi con un link protetto"
                aria-label="Condividi la credenziale"
                onClick={() => onCondividi(item)}
              >
                <Icon name="link" className="h-4 w-4" />
              </Button>
            )}
          </>
        )}
        {item.can_manage && onEdit && (
          <Button size="sm" variant="ghost" title="Modifica" aria-label="Modifica" onClick={() => onEdit(item)}>
            <Icon name="pencil" className="h-4 w-4" />
          </Button>
        )}
        {item.can_manage && (
          <Button
            size="sm"
            variant="ghost"
            title="Elimina"
            aria-label="Elimina"
            onClick={() => void onElimina(item)}
          >
            <Icon name="trash" className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
