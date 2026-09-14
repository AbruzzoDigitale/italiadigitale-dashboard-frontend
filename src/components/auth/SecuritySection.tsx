import { useCallback, useEffect, useState } from "react";
import {
  changePasswordApi,
  deletePasskeyApi,
  listPasskeysApi,
  passkeyRegisterApi,
  passkeyRegisterOptionsApi,
  type PasskeyInfo,
} from "../../api/auth";
import { createPasskeyCredential, passkeysSupported } from "../../utils/webauthn";
import { useToast } from "../../context/ToastContext";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Icon } from "../ui/Icon";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "—";
  }
}

/** Card "Sicurezza" del profilo: cambio password + passkey. */
export function SecuritySection() {
  const toast = useToast();

  // ── Cambio password ──
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changing, setChanging] = useState(false);

  // ── Passkey ──
  const [passkeys, setPasskeys] = useState<PasskeyInfo[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(true);
  const [addingKey, setAddingKey] = useState(false);
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [busyKeyId, setBusyKeyId] = useState<number | null>(null);

  const reloadKeys = useCallback(() => {
    setLoadingKeys(true);
    listPasskeysApi()
      .then(setPasskeys)
      .catch(() => setPasskeys([]))
      .finally(() => setLoadingKeys(false));
  }, []);

  useEffect(() => {
    reloadKeys();
  }, [reloadKeys]);

  const handleChangePassword = async () => {
    if (!currentPassword) return toast.error("Inserisci la password attuale.");
    if (newPassword.length < 8) return toast.error("La nuova password deve avere almeno 8 caratteri.");
    if (newPassword !== confirmPassword) return toast.error("Le due password non coincidono.");
    setChanging(true);
    try {
      await changePasswordApi(currentPassword, newPassword);
      toast.success("Password aggiornata.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Impossibile cambiare la password");
    } finally {
      setChanging(false);
    }
  };

  const handleAddPasskey = async () => {
    setAddingKey(true);
    try {
      const { options, challenge_token } = await passkeyRegisterOptionsApi();
      const credential = await createPasskeyCredential(options);
      await passkeyRegisterApi(challenge_token, credential, newKeyLabel.trim() || undefined);
      toast.success("Passkey aggiunta: ora puoi usarla per accedere.");
      setNewKeyLabel("");
      reloadKeys();
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        toast.error("Registrazione passkey annullata.");
      } else {
        toast.error(err instanceof Error ? err.message : "Registrazione passkey non riuscita");
      }
    } finally {
      setAddingKey(false);
    }
  };

  const handleDeletePasskey = async (p: PasskeyInfo) => {
    if (!window.confirm(`Eliminare la passkey "${p.label || `#${p.id}`}"? Non potrai più usarla per accedere.`)) return;
    setBusyKeyId(p.id);
    try {
      await deletePasskeyApi(p.id);
      reloadKeys();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Impossibile eliminare la passkey");
    } finally {
      setBusyKeyId(null);
    }
  };

  return (
    <div className="bg-paper dark:bg-[#131316] rounded-lg border border-line dark:border-[#2a2a2e] p-6">
      <h2 className="font-display font-bold tracking-tight text-ink dark:text-[#f4f4f7] mb-1" style={{ fontSize: "17px" }}>
        Sicurezza
      </h2>
      <p className="font-body text-[13px] text-muted dark:text-[#9999a0] mb-5">
        Cambia la password di accesso e gestisci le passkey (Face ID, Touch ID, chiavi hardware).
      </p>

      {/* ── Cambio password ── */}
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Input
            label="Password attuale"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
          />
          <Input
            label="Nuova password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            hint="Minimo 8 caratteri"
          />
          <Input
            label="Conferma nuova password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
          />
        </div>
        <div className="flex justify-end">
          <Button
            variant="secondary"
            onClick={handleChangePassword}
            loading={changing}
            disabled={!currentPassword || !newPassword || !confirmPassword}
            leftIcon={<Icon name="key" className="w-4 h-4" />}
          >
            Cambia password
          </Button>
        </div>
      </div>

      {/* ── Passkey ── */}
      <div className="mt-6 border-t border-line dark:border-[#2a2a2e] pt-5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0] mb-3">
          Passkey
        </p>

        {!passkeysSupported() ? (
          <p className="text-sm text-muted dark:text-muted-dark">
            Questo browser non supporta le passkey.
          </p>
        ) : (
          <>
            {loadingKeys ? (
              <p className="text-sm text-muted dark:text-muted-dark">Caricamento…</p>
            ) : passkeys.length === 0 ? (
              <p className="text-sm text-muted dark:text-muted-dark mb-3">
                Nessuna passkey registrata. Aggiungine una per accedere senza password.
              </p>
            ) : (
              <div className="flex flex-col gap-2 mb-3">
                {passkeys.map((p) => (
                  <div
                    key={p.id}
                    className="flex flex-wrap items-center gap-3 rounded-md border border-line dark:border-line-dark px-3 py-2.5"
                  >
                    <Icon name="shield-check" className="h-4 w-4 text-success flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink dark:text-paper truncate">
                        {p.label || `Passkey #${p.id}`}
                      </p>
                      <p className="text-[11px] text-muted dark:text-[#9999a0]">
                        Creata il {formatDate(p.created_at)}
                        {p.last_used_at ? ` · ultimo accesso ${formatDate(p.last_used_at)}` : ""}
                      </p>
                    </div>
                    <button
                      className="p-1.5 text-muted hover:text-danger disabled:opacity-40"
                      title="Elimina passkey"
                      disabled={busyKeyId === p.id}
                      onClick={() => handleDeletePasskey(p)}
                    >
                      <Icon name="trash" className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[220px] flex-1 sm:max-w-xs">
                <Input
                  label="Nome della passkey (opzionale)"
                  value={newKeyLabel}
                  onChange={(e) => setNewKeyLabel(e.target.value)}
                  placeholder="es. MacBook di Mario, iPhone…"
                />
              </div>
              <Button
                variant="secondary"
                onClick={handleAddPasskey}
                loading={addingKey}
                leftIcon={<Icon name="plus" className="w-4 h-4" />}
              >
                Aggiungi passkey
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
