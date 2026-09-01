import { Link } from "react-router-dom";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import type { ExpenseSettings } from "../../api/expenses";
import { sheetTab } from "./format";

// La scheda "dove finiscono le righe": foglio del commercialista, cartella
// Drive dell'archivio e link web condivisibile. Sta in fondo alla pagina perché
// si guarda quando si è finito di inserire, non mentre si inserisce.

interface Props {
  settings: ExpenseSettings;
  year: number;
  month: number;
  pendingSync: number;
  syncing: boolean;
  archiving: boolean;
  onCreateSheet: () => void;
  onSync: () => void;
  onArchive: () => void;
  onOpenSettings: () => void;
}

export function SheetCard({
  settings,
  year,
  month,
  pendingSync,
  syncing,
  archiving,
  onCreateSheet,
  onSync,
  onArchive,
  onOpenSettings,
}: Props) {
  const tab = sheetTab(year, month);

  // Senza account Google collegato non c'è nulla da sincronizzare. Il
  // collegamento però non si fa da qui: l'identità è dell'azienda e vive nelle
  // impostazioni del brand, insieme a mittenti email e brand.
  if (!settings.google_connected) {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-warning/40 bg-warning/8 p-6 sm:flex-row sm:items-center">
        <Icon name="drive" className="h-6 w-6 shrink-0 text-warning" />
        <div className="flex-1">
          <b className="block text-[13px]">Manca l'account Google dell'azienda</b>
          <p className="mt-0.5 text-[11px] text-muted dark:text-muted-dark">
            È l'identità con cui il gestionale scrive il foglio del commercialista e archivia su Drive, anche quando
            nessuno è collegato alla dashboard: va collegato un account aziendale, non quello personale di chi accede.
            Si imposta nelle impostazioni dell'azienda, scheda Google.
            {settings.google_error ? ` Ultimo errore: ${settings.google_error}` : ""}
          </p>
        </div>
        <Link to={`/companies/${settings.company_id}/brand?tab=google`} className="shrink-0">
          <Button variant="primary" size="sm" leftIcon={<Icon name="settings" className="h-3.5 w-3.5" />}>
            Impostazioni azienda
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-paper p-6 shadow-1 dark:border-[#2a2a2e] dark:bg-[#131316]">
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-cream dark:bg-[#1c1c20]">
          <Icon name="document-text" className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <b className="block text-[13px]">Rendicontazione commercialista</b>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted dark:text-muted-dark">
            {settings.sheet_configured ? (
              <>
                Le righe approvate vengono scritte nel tab <b>{tab}</b> del foglio Google, condiviso in sola lettura
                con lo studio. Stesse colonne del file di partenza: data, località, estero, motivazione, chilometri,
                quota km, indennità km, vitto, alloggio, parcheggi, pedaggi, indennità di trasferta.
                {settings.auto_sync
                  ? " Con la sincronizzazione automatica ogni riga approvata parte da sola."
                  : " Con la sincronizzazione manuale le righe restano in coda finché non premi “Invia ora”."}
              </>
            ) : (
              <>
                Nessun foglio collegato. Il file .xlsx caricato su Drive non è scrivibile via API: il gestionale ne
                crea uno nativo con la stessa struttura e lo condivide con il commercialista.
              </>
            )}
          </p>

          <div className="mt-2 flex flex-wrap gap-1.5">
            <Tag tone="success">
              <i className="h-1.5 w-1.5 rounded-full bg-success" /> Google · {settings.google_email}
            </Tag>
            {settings.sheet_configured && (
              <Tag tone={settings.auto_sync ? "success" : "default"}>
                {settings.auto_sync ? "Sync automatica" : "Sync manuale"}
              </Tag>
            )}
            {settings.accountant_email && (
              <Tag>
                {settings.accountant_email} · lettore
              </Tag>
            )}
            {settings.last_sync_at && <Tag>Ultimo invio {settings.last_sync_at}</Tag>}
            {settings.drive_folder_url && (
              <Tag>
                <Icon name="drive" className="h-3 w-3" /> {settings.drive_root_path}
              </Tag>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={onOpenSettings} leftIcon={<Icon name="settings" className="h-3.5 w-3.5" />}>
            Impostazioni
          </Button>
          {settings.sheet_configured ? (
            <>
              <a href={settings.sheet_url} target="_blank" rel="noopener">
                <Button variant="secondary" size="sm" leftIcon={<Icon name="link" className="h-3.5 w-3.5" />}>
                  Apri foglio
                </Button>
              </a>
              <Button
                variant={pendingSync > 0 ? "primary" : "secondary"}
                size="sm"
                loading={syncing}
                onClick={onSync}
                leftIcon={<Icon name="refresh-cw" className="h-3.5 w-3.5" />}
              >
                {pendingSync > 0 ? `Invia ora (${pendingSync})` : "Sincronizzato"}
              </Button>
            </>
          ) : (
            <Button variant="primary" size="sm" onClick={onCreateSheet}>
              Crea il foglio
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3 dark:border-[#2a2a2e]">
        <span className="text-[11px] text-muted dark:text-muted-dark">
          Archivio: nota spese PDF, righe in CSV e giustificativi nella cartella del mese
          {settings.auto_archive ? " · creato in automatico il primo del mese" : ""} · conservazione{" "}
          {settings.retention_years} anni
        </span>
        <span className="flex-1" />
        {settings.drive_folder_url && (
          <a href={settings.drive_folder_url} target="_blank" rel="noopener">
            <Button variant="ghost" size="sm" leftIcon={<Icon name="drive" className="h-3.5 w-3.5" />}>
              Apri Drive
            </Button>
          </a>
        )}
        <Button
          variant="secondary"
          size="sm"
          loading={archiving}
          onClick={onArchive}
          leftIcon={<Icon name="archive" className="h-3.5 w-3.5" />}
        >
          Archivia il mese
        </Button>
      </div>

      {settings.share_enabled && settings.share_url && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-cream/60 px-3 py-2.5 dark:border-[#2a2a2e] dark:bg-[#1c1c20]">
          <Icon name="globe" className="h-4 w-4 shrink-0 text-muted dark:text-muted-dark" />
          <span className="min-w-0 flex-1">
            <b className="block text-[11px]">Vista live condivisa</b>
            <span className="block truncate font-mono text-[10px] text-muted dark:text-muted-dark">
              {settings.share_url}
            </span>
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigator.clipboard?.writeText(settings.share_url ?? "")}
            leftIcon={<Icon name="copy" className="h-3.5 w-3.5" />}
          >
            Copia link
          </Button>
        </div>
      )}
    </div>
  );
}

function Tag({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "success";
}) {
  const cls =
    tone === "success"
      ? "border-success/25 bg-success/10 text-success"
      : "border-line bg-cream text-muted dark:border-[#2a2a2e] dark:bg-[#1c1c20] dark:text-muted-dark";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-pill border px-2 py-[3px] text-[10px] font-medium ${cls}`}>
      {children}
    </span>
  );
}
