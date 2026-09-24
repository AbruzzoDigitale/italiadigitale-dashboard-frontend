import { useRef, useState } from "react";
import {
  importVaultItemsApi,
  type VaultImportResult,
  type VaultImportRow,
} from "../../api/vault";
import { Badge } from "../../components/ui/Badge";
import { Checkbox } from "../../components/ui/Checkbox";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { Modal } from "../../components/ui/Modal";
import { useToast } from "../../context/ToastContext";

/**
 * Import di credenziali da un CSV (export di Google Password Manager e simili).
 *
 * **Il file non viene caricato da nessuna parte**: lo legge il browser, lo
 * converte in righe e manda quelle. Un CSV con tutte le password dentro un body
 * multipart rischierebbe di finire nei log di accesso del server — un modo
 * curioso di inaugurare una cassaforte.
 *
 * Restano poi da cancellare i Download: è lì che il file si dimentica per mesi,
 * ed è la ragione per cui l'avviso in fondo è scritto grosso.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  companyId: number;
  onImported: () => void;
}

/** Parser CSV minimo ma corretto su virgolette, virgole e a capo interni. */
function parseCsv(testo: string): string[][] {
  const righe: string[][] = [];
  let campo = "";
  let riga: string[] = [];
  let traVirgolette = false;

  for (let i = 0; i < testo.length; i++) {
    const c = testo[i];
    if (traVirgolette) {
      if (c === '"') {
        if (testo[i + 1] === '"') {
          campo += '"';
          i++;
        } else traVirgolette = false;
      } else campo += c;
      continue;
    }
    if (c === '"') traVirgolette = true;
    else if (c === ",") {
      riga.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && testo[i + 1] === "\n") i++;
      riga.push(campo);
      campo = "";
      if (riga.some((x) => x.trim() !== "")) righe.push(riga);
      riga = [];
    } else campo += c;
  }
  riga.push(campo);
  if (riga.some((x) => x.trim() !== "")) righe.push(riga);
  return righe;
}

const SINONIMI: Record<string, string[]> = {
  label: ["name", "title", "nome", "label"],
  url: ["url", "website", "site", "sito", "login_uri"],
  username: ["username", "user", "utente", "login", "login_username"],
  secret: ["password", "pass", "pwd", "login_password"],
  note: ["note", "notes", "comment", "commento"],
};

function indiceColonne(intestazione: string[]): Record<string, number> {
  const normalizzata = intestazione.map((h) => h.trim().toLowerCase());
  const out: Record<string, number> = {};
  for (const [campo, nomi] of Object.entries(SINONIMI)) {
    const i = normalizzata.findIndex((h) => nomi.includes(h));
    if (i >= 0) out[campo] = i;
  }
  return out;
}

function sembraEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

export function VaultImportModal({ open, onClose, companyId, onImported }: Props) {
  const [righe, setRighe] = useState<VaultImportRow[]>([]);
  const [nomeFile, setNomeFile] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const [esito, setEsito] = useState<VaultImportResult | null>(null);
  const [collegaAuto, setCollegaAuto] = useState(true);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const toast = useToast();

  function reset() {
    setRighe([]);
    setNomeFile("");
    setErrore(null);
    setEsito(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function leggiFile(file: File) {
    setErrore(null);
    setEsito(null);
    try {
      const tabella = parseCsv(await file.text());
      if (tabella.length < 2) {
        setErrore("Il file non contiene righe oltre all'intestazione.");
        return;
      }
      const col = indiceColonne(tabella[0]);
      if (col.secret == null) {
        setErrore(
          "Non trovo la colonna delle password. Attese intestazioni tipo: name, url, username, password."
        );
        return;
      }
      const prese: VaultImportRow[] = [];
      for (const r of tabella.slice(1)) {
        const leggi = (k: string) => (col[k] != null ? (r[col[k]] ?? "").trim() : "");
        const utente = leggi("username");
        prese.push({
          label: leggi("label") || leggi("url") || "Senza nome",
          url: leggi("url") || null,
          // Google mette spesso un'email nella colonna username: la si riconosce
          // e la si mette al posto giusto, senza perderla.
          username: utente && !sembraEmail(utente) ? utente : null,
          email: utente && sembraEmail(utente) ? utente : null,
          secret: leggi("secret") || null,
          note: leggi("note") || null,
        });
      }
      setRighe(prese);
      setNomeFile(file.name);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "File non leggibile");
    }
  }

  async function importa() {
    setInCorso(true);
    try {
      const res = await importVaultItemsApi({
        company_id: companyId,
        rows: righe,
        skip_duplicates: true,
        auto_link: collegaAuto,
      });
      setEsito(res);
      toast.success(
        res.auto_linked > 0
          ? `Importate ${res.created} credenziali, ${res.auto_linked} collegate al sito da sole.`
          : `Importate ${res.created} credenziali.`
      );
      onImported();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import non riuscito");
    } finally {
      setInCorso(false);
    }
  }

  const conPassword = righe.filter((r) => r.secret).length;

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Importa credenziali da CSV"
      description="Da Google Password Manager, Bitwarden, LastPass o qualsiasi export con intestazioni simili."
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Chiudi
          </Button>
          <Button
            onClick={() => void importa()}
            loading={inCorso}
            disabled={righe.length === 0 || !!esito}
          >
            Importa {righe.length > 0 && `(${righe.length})`}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void leggiFile(f);
            }}
          />
          <Button variant="secondary" onClick={() => inputRef.current?.click()}>
            <Icon name="upload" className="mr-1 h-4 w-4" />
            Scegli il file CSV
          </Button>
          {nomeFile && (
            <span className="ml-2 text-sm text-muted dark:text-muted-dark">{nomeFile}</span>
          )}
        </div>

        {errore && <p className="text-sm text-danger">{errore}</p>}

        {righe.length > 0 && !esito && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="info">{righe.length} righe lette</Badge>
              <Badge variant={conPassword === righe.length ? "success" : "warning"}>
                {conPassword} con password
              </Badge>
              <span className="text-muted dark:text-muted-dark">
                I duplicati (stesso URL e stesso utente) vengono saltati.
              </span>
            </div>

            <div className="max-h-56 overflow-auto rounded-lg border border-line dark:border-line-dark">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-cream dark:bg-[#0e0f0e]">
                  <tr>
                    <th className="px-2 py-1.5 font-semibold">Etichetta</th>
                    <th className="px-2 py-1.5 font-semibold">URL</th>
                    <th className="px-2 py-1.5 font-semibold">Utente / Email</th>
                    <th className="px-2 py-1.5 font-semibold">Password</th>
                  </tr>
                </thead>
                <tbody>
                  {righe.slice(0, 50).map((r, i) => (
                    <tr key={i} className="border-t border-line/60 dark:border-line-dark/60">
                      <td className="max-w-[12rem] truncate px-2 py-1">{r.label}</td>
                      <td className="max-w-[12rem] truncate px-2 py-1 text-muted dark:text-muted-dark">
                        {r.url}
                      </td>
                      <td className="max-w-[12rem] truncate px-2 py-1">
                        {r.username || r.email}
                      </td>
                      {/* Mai in chiaro nell'anteprima: serve sapere che c'è, non qual è. */}
                      <td className="px-2 py-1">{r.secret ? "••••••" : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {righe.length > 50 && (
                <p className="px-2 py-1 text-xs text-muted dark:text-muted-dark">
                  … e altre {righe.length - 50}. Verranno importate tutte.
                </p>
              )}
            </div>

            <div>
              <button
                type="button"
                onClick={() => setCollegaAuto((v) => !v)}
                className="inline-flex items-center gap-2 text-[13px] text-ink dark:text-[#f4f4f7]"
              >
                <Checkbox checked={collegaAuto} onChange={setCollegaAuto} />
                Collega da solo al sito con lo stesso dominio
              </button>
              <p className="mt-1 text-xs text-muted dark:text-muted-dark">
                Confronta il dominio dell'indirizzo con i siti in anagrafica e, se
                lo riconosce, collega la credenziale al sito e al suo cliente. Su
                un export di centinaia di righe è la differenza fra una cassaforte
                consultabile e un elenco piatto.
              </p>
            </div>
          </>
        )}

        {esito && (
          <div className="flex flex-col gap-2 rounded-lg border border-line p-3 dark:border-line-dark">
            <div className="flex flex-wrap gap-2">
              <Badge variant="success">{esito.created} importate</Badge>
              {esito.skipped > 0 && <Badge>{esito.skipped} già presenti</Badge>}
              {esito.auto_linked > 0 && (
                <Badge variant="info">{esito.auto_linked} collegate al sito</Badge>
              )}
              {esito.errors.length > 0 && (
                <Badge variant="danger">{esito.errors.length} con errori</Badge>
              )}
            </div>
            {esito.errors.length > 0 && (
              <ul className="list-inside list-disc text-xs text-muted dark:text-muted-dark">
                {esito.errors.slice(0, 10).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm">
          <Icon name="alert-triangle" className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div>
            <p className="font-semibold">Cancella il CSV quando hai finito.</p>
            <p className="text-muted dark:text-muted-dark">
              L'export contiene tutte le password <strong>in chiaro</strong>. Il file non
              viene caricato da nessuna parte — lo legge solo questo browser — ma resta nei
              tuoi Download finché non lo elimini, e lì è leggibile da chiunque usi il
              computer.
            </p>
          </div>
        </div>
      </div>
    </Modal>
  );
}
