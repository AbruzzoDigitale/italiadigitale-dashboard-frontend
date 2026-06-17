import { useEffect, useState } from "react";
import {
  createWorkloadProfileApi,
  deleteWorkloadProfileApi,
  listWorkloadProfilesApi,
  updateWorkloadProfileApi,
  type WorkloadAvailabilityStatus,
  type WorkloadComputedStatus,
  type WorkloadProfile,
} from "../../api/workload";
import { getUsersApi, type User } from "../../api/users";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Checkbox";
import { Icon } from "../ui/Icon";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";
import { SearchableSelect } from "../ui/SearchableSelect";
import { Spinner } from "../ui/Spinner";
import { useToast } from "../../context/ToastContext";

// ─── helpers ────────────────────────────────────────────────────────────────

const AVAILABILITY_OPTIONS: Array<{ value: WorkloadAvailabilityStatus; label: string }> = [
  { value: "active", label: "Attivo" },
  { value: "vacation", label: "Ferie" },
  { value: "sick", label: "Malattia" },
  { value: "unavailable", label: "Non disponibile" },
  { value: "part_time", label: "Part-time" },
];

type ProfileFormState = {
  user_id: string;
  max_capacity_hours_day: string;
  max_capacity_hours_week: string;
  availability_status: WorkloadAvailabilityStatus;
  utilization_warn_pct: string;
  utilization_over_pct: string;
  is_active: boolean;
};

const EMPTY_PROFILE_FORM: ProfileFormState = {
  user_id: "",
  max_capacity_hours_day: "8",
  max_capacity_hours_week: "",
  availability_status: "active",
  utilization_warn_pct: "85",
  utilization_over_pct: "100",
  is_active: true,
};

function availabilityLabel(status: WorkloadComputedStatus | WorkloadAvailabilityStatus): string {
  switch (status) {
    case "active": return "Attivo";
    case "vacation": return "Ferie";
    case "sick": return "Malattia";
    case "unavailable": return "Non disp.";
    case "part_time": return "Part-time";
    default: return String(status);
  }
}

function findUserName(users: User[], userId: number): string {
  const user = users.find((u) => u.id === userId);
  return user ? (user.full_name || user.username) : `Utente #${userId}`;
}

// ─── props ───────────────────────────────────────────────────────────────────

interface WorkloadTeamModalProps {
  open: boolean;
  onClose: () => void;
  companyId: number;
  canManage: boolean;
}

// ─── component ───────────────────────────────────────────────────────────────

export function WorkloadTeamModal({ open, onClose, companyId, canManage }: WorkloadTeamModalProps) {
  const toast = useToast();

  const [loading, setLoading] = useState(false);
  const [profiles, setProfiles] = useState<WorkloadProfile[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<WorkloadProfile | null>(null);
  const [profileForm, setProfileForm] = useState<ProfileFormState>(EMPTY_PROFILE_FORM);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const [deletingProfile, setDeletingProfile] = useState<WorkloadProfile | null>(null);
  const [deletingLoading, setDeletingLoading] = useState(false);

  // load when opened
  useEffect(() => {
    if (!open) return;
    load();
  }, [open, companyId]);

  // populate form when editing profile changes
  useEffect(() => {
    if (!profileModalOpen) {
      setEditingProfile(null);
      setProfileForm(EMPTY_PROFILE_FORM);
      setProfileError(null);
      return;
    }
    if (!editingProfile) {
      setProfileForm(EMPTY_PROFILE_FORM);
      setProfileError(null);
      return;
    }
    setProfileForm({
      user_id: String(editingProfile.user_id),
      max_capacity_hours_day: String(editingProfile.max_capacity_hours_day),
      max_capacity_hours_week: editingProfile.max_capacity_hours_week ? String(editingProfile.max_capacity_hours_week) : "",
      availability_status: editingProfile.availability_status,
      utilization_warn_pct: String(editingProfile.utilization_warn_pct),
      utilization_over_pct: String(editingProfile.utilization_over_pct),
      is_active: editingProfile.is_active,
    });
    setProfileError(null);
  }, [editingProfile, profileModalOpen]);

  async function load() {
    setLoading(true);
    try {
      const [profilesData, usersData] = await Promise.all([
        listWorkloadProfilesApi({ company_id: companyId }),
        getUsersApi(companyId),
      ]);
      setProfiles(profilesData);
      setUsers(usersData);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore nel caricamento");
    } finally {
      setLoading(false);
    }
  }

  const userOptions = users.map((u) => ({
    value: String(u.id),
    label: u.full_name || u.username,
    keywords: `${u.full_name ?? ""} ${u.username}`,
  }));

  async function onSaveProfile() {
    if (!profileForm.user_id) {
      setProfileError("Seleziona un operatore");
      return;
    }
    setSavingProfile(true);
    setProfileError(null);
    try {
      const payload = {
        company_id: companyId,
        user_id: Number(profileForm.user_id),
        max_capacity_hours_day: Number(profileForm.max_capacity_hours_day) || 8,
        max_capacity_hours_week: profileForm.max_capacity_hours_week ? Number(profileForm.max_capacity_hours_week) : undefined,
        availability_status: profileForm.availability_status,
        utilization_warn_pct: Number(profileForm.utilization_warn_pct) || 85,
        utilization_over_pct: Number(profileForm.utilization_over_pct) || 100,
        is_active: profileForm.is_active,
      };
      if (editingProfile) {
        await updateWorkloadProfileApi(editingProfile.id, payload);
        toast.success("Profilo aggiornato");
      } else {
        await createWorkloadProfileApi(payload);
        toast.success("Profilo creato");
      }
      setProfileModalOpen(false);
      await load();
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Errore nel salvataggio");
    } finally {
      setSavingProfile(false);
    }
  }

  async function onConfirmDelete() {
    if (!deletingProfile) return;
    setDeletingLoading(true);
    try {
      await deleteWorkloadProfileApi(deletingProfile.id);
      toast.success("Profilo eliminato");
      setDeletingProfile(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore eliminazione");
    } finally {
      setDeletingLoading(false);
    }
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Team e capacità"
        description="Profili di capacità e disponibilità degli operatori"
        size="xl"
        footer={
          canManage ? (
            <Button
              variant="primary"
              leftIcon={<Icon name="plus" className="w-3.5 h-3.5" />}
              onClick={() => {
                setEditingProfile(null);
                setProfileModalOpen(true);
              }}
            >
              Nuovo profilo
            </Button>
          ) : (
            <Button variant="ghost" onClick={onClose}>Chiudi</Button>
          )
        }
      >
        {loading ? (
          <div className="py-12 flex items-center justify-center">
            <Spinner size="md" />
          </div>
        ) : profiles.length === 0 ? (
          <div className="rounded-md border border-dashed border-line dark:border-line-dark px-4 py-10 text-sm text-center text-muted dark:text-muted-dark">
            Nessun profilo configurato per questa company.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line dark:border-line-dark">
                  <th className="px-3 py-2 text-left text-[11px] uppercase tracking-wider text-muted dark:text-muted-dark">Operatore</th>
                  <th className="px-3 py-2 text-left text-[11px] uppercase tracking-wider text-muted dark:text-muted-dark">Cap giorn.</th>
                  <th className="px-3 py-2 text-left text-[11px] uppercase tracking-wider text-muted dark:text-muted-dark">Cap sett.</th>
                  <th className="px-3 py-2 text-left text-[11px] uppercase tracking-wider text-muted dark:text-muted-dark">Soglie</th>
                  <th className="px-3 py-2 text-left text-[11px] uppercase tracking-wider text-muted dark:text-muted-dark">Disponibilità</th>
                  {canManage && <th className="px-3 py-2 text-right text-[11px] uppercase tracking-wider text-muted dark:text-muted-dark">Azioni</th>}
                </tr>
              </thead>
              <tbody>
                {profiles.map((profile) => (
                  <tr key={profile.id} className="border-b border-line/60 dark:border-line-dark/70">
                    <td className="px-3 py-2.5 font-semibold text-ink dark:text-paper">{findUserName(users, profile.user_id)}</td>
                    <td className="px-3 py-2.5 text-ink dark:text-paper">{profile.max_capacity_hours_day}h</td>
                    <td className="px-3 py-2.5 text-ink dark:text-paper">{profile.max_capacity_hours_week ? `${profile.max_capacity_hours_week}h` : "-"}</td>
                    <td className="px-3 py-2.5 text-ink dark:text-paper">{profile.utilization_warn_pct}% / {profile.utilization_over_pct}%</td>
                    <td className="px-3 py-2.5">
                      <Badge variant={profile.is_active ? "success" : "default"}>{availabilityLabel(profile.availability_status)}</Badge>
                    </td>
                    {canManage && (
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => { setEditingProfile(profile); setProfileModalOpen(true); }}
                            className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink transition-colors hover:bg-cream dark:border-line-dark dark:text-paper dark:hover:bg-ink-soft"
                          >
                            <Icon name="pencil" className="w-3.5 h-3.5" />
                            Modifica
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingProfile(profile)}
                            className="inline-flex items-center gap-1.5 rounded-md border border-danger/20 bg-danger/5 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-danger transition-colors hover:bg-danger/10"
                          >
                            <Icon name="trash" className="w-3.5 h-3.5" />
                            Elimina
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      {/* Edit / Create profile */}
      <Modal
        open={profileModalOpen}
        onClose={() => { if (!savingProfile) setProfileModalOpen(false); }}
        title={editingProfile ? "Modifica profilo capacità" : "Nuovo profilo capacità"}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setProfileModalOpen(false)} disabled={savingProfile}>Annulla</Button>
            <Button variant="primary" onClick={onSaveProfile} loading={savingProfile}>Salva</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {profileError && (
            <div className="rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">{profileError}</div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">Operatore</label>
              <SearchableSelect
                value={profileForm.user_id}
                onChange={(next) => setProfileForm((c) => ({ ...c, user_id: next }))}
                options={userOptions}
                placeholder="Seleziona utente"
                searchPlaceholder="Cerca utente..."
                disabled={!!editingProfile}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark">Disponibilità</label>
              <SearchableSelect
                value={profileForm.availability_status}
                onChange={(next) => setProfileForm((c) => ({ ...c, availability_status: next as WorkloadAvailabilityStatus }))}
                options={AVAILABILITY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                placeholder="Stato"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Capacità ore/giorno"
              type="number"
              value={profileForm.max_capacity_hours_day}
              onChange={(e) => setProfileForm((c) => ({ ...c, max_capacity_hours_day: e.target.value }))}
              placeholder="8"
            />
            <Input
              label="Capacità ore/settimana (opzionale)"
              type="number"
              value={profileForm.max_capacity_hours_week}
              onChange={(e) => setProfileForm((c) => ({ ...c, max_capacity_hours_week: e.target.value }))}
              placeholder="40"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Warning %"
              type="number"
              value={profileForm.utilization_warn_pct}
              onChange={(e) => setProfileForm((c) => ({ ...c, utilization_warn_pct: e.target.value }))}
              placeholder="85"
            />
            <Input
              label="Overload %"
              type="number"
              value={profileForm.utilization_over_pct}
              onChange={(e) => setProfileForm((c) => ({ ...c, utilization_over_pct: e.target.value }))}
              placeholder="100"
            />
          </div>

          <label className="flex items-center gap-2 rounded-md border border-line dark:border-line-dark px-3 py-2.5">
            <Checkbox
              checked={profileForm.is_active}
              onChange={(checked) => setProfileForm((c) => ({ ...c, is_active: checked }))}
            />
            <span className="text-sm font-semibold text-ink dark:text-paper">Profilo attivo</span>
          </label>
        </div>
      </Modal>

      {/* Delete confirm */}
      <Modal
        open={!!deletingProfile}
        onClose={() => setDeletingProfile(null)}
        title="Elimina profilo workload"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeletingProfile(null)} disabled={deletingLoading}>Annulla</Button>
            <Button variant="danger" onClick={onConfirmDelete} loading={deletingLoading}>Elimina</Button>
          </>
        }
      >
        <p className="text-sm text-ink dark:text-paper">
          Confermi l'eliminazione del profilo per {deletingProfile ? findUserName(users, deletingProfile.user_id) : "l'utente"}?
        </p>
      </Modal>
    </>
  );
}
