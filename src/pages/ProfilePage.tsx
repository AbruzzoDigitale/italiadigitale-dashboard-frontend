import { useState, useRef, useCallback } from "react";
import { useAuth } from "../hooks/useAuth";
import { EmailAccountsSection } from "../components/email/EmailAccountsSection";
import { SignatureFromTemplate } from "../components/email/SignatureFromTemplate";
import { CanvaConnectSection } from "../components/canva/CanvaConnectSection";
import { updateMeApi, uploadUserFileApi, type UpdateUserPayload } from "../api/users";
import { useToast } from "../context/ToastContext";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Icon } from "../components/ui/Icon";
import { Badge } from "../components/ui/Badge";

export function ProfilePage() {
  const { user, myCompanies, activeCompanyId, login: _login } = useAuth();
  const toast = useToast();

  const [form, setForm] = useState<UpdateUserPayload>({
    full_name: user?.full_name ?? "",
    phone: user?.phone ?? "",
    role_label: user?.role_label ?? "",
    signature: user?.signature ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [avatarSrc, setAvatarSrc] = useState(user?.avatar_url ?? null);
  const [uploading, setUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const set = (k: keyof UpdateUserPayload, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await updateMeApi(form);
      toast.success("Profilo aggiornato");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore");
    } finally {
      setSaving(false);
    }
  }, [form, toast]);

  const handleAvatarChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Preview immediato
    const objectUrl = URL.createObjectURL(file);
    setAvatarSrc(objectUrl);
    setUploading(true);
    try {
      const updated = await uploadUserFileApi("avatar", file);
      setAvatarSrc(updated.avatar_url);
      toast.success("Avatar aggiornato");
    } catch (err) {
      setAvatarSrc(user?.avatar_url ?? null);
      toast.error(err instanceof Error ? err.message : "Errore upload");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }, [user?.avatar_url, toast]);

  if (!user) return null;

  const initials = (user.full_name || user.username)
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const companyCards = myCompanies.length > 0
    ? myCompanies
    : (user.company ? [{
        id: user.company.id,
        name: user.company.name,
        slug: user.company.slug,
        parent_id: null,
        primary_color: null,
        login_title: null,
        logo_dark: null,
        logo_light: null,
        logo_horizontal_dark: null,
        logo_horizontal_light: null,
        logo_vertical_dark: null,
        logo_vertical_light: null,
        logo_hero: null,
        children: [],
      }] : []);

  return (
    <div className="px-6 py-8 pb-20 mx-auto w-full animate-fadeIn">

      {/* ── Header ── */}
      <div className="mb-8">
        <div className="section-eyebrow">
          <Icon name="user-circle" className="w-3.5 h-3.5" />
          Account
        </div>
        <h1 className="section-title">
          Profilo
        </h1>
        <p className="section-lead">
          Gestisci le tue informazioni personali
        </p>
      </div>

      {/* ── Two-column layout (profile-layout in CSS prototipo) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6 items-start">

        {/* ── Left: profile card ── */}
        <div className="bg-cream dark:bg-[#1c1c20] rounded-lg p-6 text-center lg:sticky lg:top-5">
          {/* Avatar large */}
          <div className="relative w-[120px] h-[120px] mx-auto mb-4">
            <div className="w-full h-full rounded-full bg-ink dark:bg-[#f4f4f7] text-paper dark:text-ink flex items-center justify-center font-display font-bold overflow-hidden"
              style={{ fontSize: "48px" }}>
              {avatarSrc ? (
                <img src={avatarSrc} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                <span>{initials}</span>
              )}
            </div>
            {/* Upload button */}
            <button
              onClick={() => avatarInputRef.current?.click()}
              disabled={uploading}
              className="absolute bottom-1 right-1 w-8 h-8 rounded-full bg-paper dark:bg-[#131316] text-ink dark:text-[#f4f4f7] flex items-center justify-center shadow-2 border-2 border-cream dark:border-[#1c1c20] hover:bg-line dark:hover:bg-[#2a2a2e] transition-colors"
              title="Cambia avatar"
            >
              {uploading ? (
                <span className="w-3.5 h-3.5 border-2 border-current border-r-transparent rounded-full animate-spin" />
              ) : (
                <Icon name="upload" className="w-3.5 h-3.5" />
              )}
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>

          <p className="font-display font-bold text-[20px] tracking-tight text-ink dark:text-[#f4f4f7] mb-1">
            {user.full_name || user.username}
          </p>
          <p className="font-body text-[13px] text-muted dark:text-[#9999a0] uppercase tracking-wider font-semibold mb-3">
            {user.role_label || (user.is_admin ? "Amministratore" : "Operatore")}
          </p>
          <div className="flex flex-wrap gap-2 justify-center">
            <Badge variant={user.is_admin ? "admin" : "user"}>
              {user.is_admin ? "Admin" : "Operatore"}
            </Badge>
            <Badge variant={user.is_active ? "success" : "default"}>
              {user.is_active ? "Attivo" : "Disabilitato"}
            </Badge>
          </div>

          {companyCards.length > 0 && (
            <div className="mt-4 pt-4 border-t border-line dark:border-[#2a2a2e] text-left">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0] mb-2">
                Aziende assegnate
              </p>
              <div className="grid gap-2">
                {companyCards.map((company) => {
                  const isActive = activeCompanyId === company.id;
                  const logo =
                    company.logo_horizontal_dark ||
                    company.logo_horizontal_light ||
                    company.logo_dark ||
                    company.logo_light ||
                    company.logo_vertical_dark ||
                    company.logo_vertical_light ||
                    company.logo_hero;

                  return (
                    <div
                      key={company.id}
                      className={`rounded-md border p-2.5 ${isActive ? "border-success/40 bg-success/5" : "border-line dark:border-[#2a2a2e] bg-paper dark:bg-[#131316]"}`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="h-9 w-9 rounded-md border border-line dark:border-[#2a2a2e] bg-cream dark:bg-[#1c1c20] flex items-center justify-center overflow-hidden flex-shrink-0">
                          {logo ? (
                            <img src={logo} alt={company.name} className="max-w-full max-h-full object-contain" />
                          ) : (
                            <span className="text-[10px] font-bold uppercase tracking-wider text-muted dark:text-[#9999a0]">
                              {company.name.slice(0, 2)}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[12px] font-semibold text-ink dark:text-[#f4f4f7] truncate">{company.name}</p>
                          <p className="text-[10px] text-muted dark:text-[#9999a0] truncate">{company.slug}</p>
                        </div>
                        {isActive && (
                          <span className="text-[9px] font-bold uppercase tracking-wider text-success">Attiva</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── Right: form ── */}
        <div className="flex flex-col gap-5">

          {/* Info personali */}
          <div className="bg-paper dark:bg-[#131316] rounded-lg border border-line dark:border-[#2a2a2e] p-6">
            <h2
              className="font-display font-bold tracking-tight text-ink dark:text-[#f4f4f7] mb-1"
              style={{ fontSize: "17px" }}
            >
              Informazioni personali
            </h2>
            <p className="font-body text-[13px] text-muted dark:text-[#9999a0] mb-5">
              Nome visualizzato, contatto e ruolo nella piattaforma
            </p>
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Nome completo"
                  value={form.full_name as string}
                  onChange={(e) => set("full_name", e.target.value)}
                  placeholder="Mario Rossi"
                />
                <Input
                  label="Telefono"
                  value={form.phone as string ?? ""}
                  onChange={(e) => set("phone", e.target.value)}
                  placeholder="+39 333 000 0000"
                  type="tel"
                />
              </div>
              <Input
                label="Ruolo / Qualifica"
                value={form.role_label as string ?? ""}
                onChange={(e) => set("role_label", e.target.value)}
                placeholder="es. Senior Consultant"
                hint="Viene mostrato nel profilo e nelle presentazioni"
              />
            </div>
          </div>

          {/* Firma email — compilazione dal template aziendale (definito dall'admin) */}
          <SignatureFromTemplate companies={myCompanies} defaultCompanyId={activeCompanyId} />

          {/* Account */}
          <div className="bg-paper dark:bg-[#131316] rounded-lg border border-line dark:border-[#2a2a2e] p-6">
            <h2
              className="font-display font-bold tracking-tight text-ink dark:text-[#f4f4f7] mb-1"
              style={{ fontSize: "17px" }}
            >
              Account
            </h2>
            <p className="font-body text-[13px] text-muted dark:text-[#9999a0] mb-5">
              Credenziali e identificativi univoci
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
                  Username
                </label>
                <p className="px-3 py-2.5 rounded-md border border-line dark:border-[#2a2a2e] bg-cream dark:bg-[#1c1c20] text-sm font-body font-semibold text-ink dark:text-[#f4f4f7]">
                  @{user.username}
                </p>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
                  Email
                </label>
                <p className="px-3 py-2.5 rounded-md border border-line dark:border-[#2a2a2e] bg-cream dark:bg-[#1c1c20] text-sm font-body font-semibold text-ink dark:text-[#f4f4f7]">
                  {user.email}
                </p>
              </div>
            </div>
          </div>

          {/* Email di invio (per organizzazione) */}
          <EmailAccountsSection companies={myCompanies} defaultCompanyId={activeCompanyId} />

          {/* Collegamento account Canva */}
          <CanvaConnectSection />

          {/* Save bar */}
          <div className="flex justify-end">
            <Button variant="primary" onClick={handleSave} loading={saving} size="lg">
              Salva modifiche
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
