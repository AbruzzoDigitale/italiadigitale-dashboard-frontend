import { useCallback, useEffect, useState } from "react";
import {
  CONDITION_LABELS,
  FIELD_SOURCE_LABELS,
  FIELD_TYPE_LABELS,
  createFormApi,
  deleteFormApi,
  disableShareLinkApi,
  enableShareLinkApi,
  listFormsApi,
  updateFormApi,
  type ConditionOperator,
  type Form,
  type FormFieldPayload,
  type FormFieldSource,
  type FormFieldType,
  type FormSectionPayload,
} from "../../api/forms";
import { getUsersApi, type User } from "../../api/users";
import { listWorkAreasApi, type WorkArea } from "../../api/workAreas";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Checkbox } from "../../components/ui/Checkbox";
import { Icon } from "../../components/ui/Icon";
import { Input } from "../../components/ui/Input";
import { Modal } from "../../components/ui/Modal";
import { MultiSelect } from "../../components/ui/MultiSelect";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import { useToast } from "../../context/ToastContext";

type FieldDraft = FormFieldPayload & { key?: string; optionsText: string };

const NUOVO_CAMPO = (position: number): FieldDraft => ({
  label: "",
  field_type: "text",
  is_required: false,
  position,
  optionsText: "",
  allow_other: false,
  source: null,
  visible_if: null,
  section_index: null,
});

interface FormsTabProps {
  companyId: number;
  /** Definire i moduli: admin e project manager. */
  canManage: boolean;
}

/**
 * Sezione «Moduli» della pagina Report: crea i moduli, ne definisce i campi
 * (anche condizionali), decide a quali aree e operatori appartengono e genera
 * il link di compilazione (che resta interno: serve l'accesso alla dashboard).
 * Sta accanto ai report perché è lì che se ne vede l'effetto; la visibilità è
 * riservata ad admin e project manager.
 */
export function FormsTab({ companyId, canManage }: FormsTabProps) {
  const toast = useToast();
  const [forms, setForms] = useState<Form[]>([]);
  const [areas, setAreas] = useState<WorkArea[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<Form | null>(null);
  const [deleting, setDeleting] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  // Bozza dell'editor
  const [nome, setNome] = useState("");
  const [descrizione, setDescrizione] = useState("");
  const [attivo, setAttivo] = useState(true);
  const [sezioni, setSezioni] = useState<FormSectionPayload[]>([]);
  const [campi, setCampi] = useState<FieldDraft[]>([]);
  const [areaIds, setAreaIds] = useState<number[]>([]);
  const [userIds, setUserIds] = useState<number[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setForms(await listFormsApi({ companyId }));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel caricamento dei moduli");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    listWorkAreasApi({ company_id: companyId })
      .then(setAreas)
      .catch(() => setAreas([]));
    getUsersApi(companyId)
      .then(setUsers)
      .catch(() => setUsers([]));
  }, [companyId]);

  const openEditor = (form: Form) => {
    setEditing(form);
    setNome(form.name);
    setDescrizione(form.description ?? "");
    setAttivo(form.is_active);
    setSezioni(
      form.sections.map((s) => ({
        id: s.id,
        title: s.title,
        description: s.description,
        position: s.position,
        visible_if: s.visible_if,
      }))
    );
    setCampi(
      [...form.fields]
        .sort((a, b) => a.position - b.position)
        .map((f) => ({
          id: f.id,
          key: f.key,
          label: f.label,
          field_type: f.field_type,
          help_text: f.help_text,
          is_required: f.is_required,
          position: f.position,
          optionsText: (f.options ?? []).join("\n"),
          allow_other: f.allow_other,
          source: f.source,
          visible_if: f.visible_if,
          section_index: f.section_id != null ? form.sections.findIndex((s) => s.id === f.section_id) : null,
        }))
    );
    setAreaIds(form.assignments.work_area_ids);
    setUserIds(form.assignments.user_ids);
  };

  const createForm = async () => {
    try {
      const creato = await createFormApi({ company_id: companyId, name: "Nuovo modulo" });
      await load();
      openEditor(creato);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore nella creazione");
    }
  };

  const save = async () => {
    if (!editing) return;
    if (!nome.trim()) {
      toast.error("Il nome del modulo è obbligatorio");
      return;
    }
    if (campi.some((c) => !c.label.trim())) {
      toast.error("Ogni campo deve avere un'etichetta");
      return;
    }
    setSaving(true);
    try {
      const aggiornato = await updateFormApi(editing.id, {
        name: nome.trim(),
        description: descrizione.trim() || null,
        is_active: attivo,
        sections: sezioni.map((s, i) => ({ ...s, position: i })),
        fields: campi.map((c, i) => ({
          id: c.id ?? null,
          label: c.label.trim(),
          field_type: c.field_type,
          help_text: c.help_text || null,
          is_required: !!c.is_required,
          position: i,
          options:
            c.field_type === "select" || c.field_type === "multiselect"
              ? c.optionsText.split("\n").map((o) => o.trim()).filter(Boolean)
              : null,
          allow_other: !!c.allow_other,
          source: c.source ?? null,
          visible_if: c.visible_if ?? null,
          section_index: c.section_index ?? null,
        })),
        assignments: { work_area_ids: areaIds, user_ids: userIds },
      });
      toast.success("Modulo salvato");
      setEditing(aggiornato);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore nel salvataggio");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setRemoving(true);
    try {
      await deleteFormApi(deleting.id);
      toast.success("Modulo eliminato");
      setDeleting(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore nell'eliminazione");
    } finally {
      setRemoving(false);
    }
  };

  const toggleShareLink = async (form: Form, attiva: boolean, rigenera = false) => {
    try {
      const res = attiva
        ? await enableShareLinkApi(form.id, rigenera)
        : await disableShareLinkApi(form.id);
      await load();
      if (res.share_token) {
        const url = `${window.location.origin}/modulo/${res.share_token}`;
        await navigator.clipboard?.writeText(url).catch(() => {});
        toast.success("Link copiato: lo apre solo chi ha accesso ed è fra le aree/operatori scelti");
      } else {
        toast.success("Link revocato");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore sul link");
    }
  };

  const setCampo = (index: number, patch: Partial<FieldDraft>) =>
    setCampi((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));

  const spostaCampo = (index: number, delta: number) =>
    setCampi((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  // Un campo può dipendere solo da un campo che viene PRIMA: altrimenti si
  // creerebbero condizioni che si guardano a vicenda.
  const campiPrecedenti = (index: number) =>
    campi.slice(0, index).filter((c) => c.label.trim() && c.key);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-line bg-paper p-5 dark:border-[#2a2a2e] dark:bg-[#131316]">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3
              className="mb-1 font-display font-bold tracking-tight text-ink dark:text-[#f4f4f7]"
              style={{ fontSize: "15px" }}
            >
              Moduli
            </h3>
            <p className="font-body text-[12.5px] text-muted dark:text-[#9999a0]">
              Report compilabili: si collegano a una task oppure si mandano con un link. Le aree e gli
              operatori assegnati decidono chi vede i report nella pagina dedicata.
            </p>
          </div>
          {canManage && (
            <Button variant="secondary" onClick={createForm} leftIcon={<Icon name="plus" className="w-3.5 h-3.5" />}>
              Nuovo modulo
            </Button>
          )}
        </div>

        {error && (
          <div className="mb-3 rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="sp-skeleton h-16 rounded-md border border-line dark:border-[#2a2a2e]" />
            ))}
          </div>
        ) : forms.length === 0 ? (
          <div className="rounded-md border border-dashed border-line px-4 py-6 text-sm text-muted dark:border-[#2a2a2e] dark:text-[#9999a0]">
            Nessun modulo: creane uno per iniziare a raccogliere report.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {forms.map((form) => (
              <div
                key={form.id}
                className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-cream px-3 py-2.5 dark:border-[#2a2a2e] dark:bg-[#1c1c20]"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-bold text-ink dark:text-[#f4f4f7]">{form.name}</p>
                  <p className="truncate text-[11px] text-muted dark:text-[#9999a0]">
                    {form.fields.length} {form.fields.length === 1 ? "campo" : "campi"}
                    {form.assignments.work_area_names.length > 0 &&
                      ` · ${form.assignments.work_area_names.join(", ")}`}
                  </p>
                </div>
                {!form.is_active && <Badge variant="warning">Disattivo</Badge>}
                {form.share_enabled && <Badge variant="info">Link attivo</Badge>}
                {form.submissions_count > 0 && (
                  <Badge variant="default">
                    {form.submissions_count} {form.submissions_count === 1 ? "report" : "report"}
                  </Badge>
                )}
                {canManage && (
                  <div className="flex flex-none items-center gap-1">
                    <button
                      type="button"
                      title={
                        form.share_enabled
                          ? "Revoca il link di compilazione"
                          : "Crea un link di compilazione (solo per le aree/operatori assegnati)"
                      }
                      aria-label="Link di compilazione"
                      onClick={() => toggleShareLink(form, !form.share_enabled)}
                      className="inline-grid h-7 w-7 place-items-center rounded-md border border-line text-ink transition-colors hover:bg-paper dark:border-[#2a2a2e] dark:text-[#f4f4f7] dark:hover:bg-[#131316]"
                    >
                      <Icon name={form.share_enabled ? "unlink" : "link"} className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      title="Modifica"
                      aria-label="Modifica"
                      onClick={() => openEditor(form)}
                      className="inline-grid h-7 w-7 place-items-center rounded-md border border-line text-ink transition-colors hover:bg-paper dark:border-[#2a2a2e] dark:text-[#f4f4f7] dark:hover:bg-[#131316]"
                    >
                      <Icon name="pencil" className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      title="Elimina"
                      aria-label="Elimina"
                      onClick={() => setDeleting(form)}
                      className="inline-grid h-7 w-7 place-items-center rounded-md border border-danger/20 bg-danger/5 text-danger transition-colors hover:bg-danger/10"
                    >
                      <Icon name="trash" className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Editor ── */}
      <Modal
        open={!!editing}
        onClose={() => (saving ? undefined : setEditing(null))}
        title="Modulo"
        description="Campi, condizioni e assegnazioni. Le modifiche alla struttura non toccano i report già compilati."
        size="2xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={saving}>
              Chiudi
            </Button>
            <Button variant="primary" onClick={save} loading={saving}>
              Salva modulo
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Input label="Nome" value={nome} onChange={(e) => setNome(e.target.value)} />
            <Input
              label="Descrizione"
              value={descrizione}
              onChange={(e) => setDescrizione(e.target.value)}
              placeholder="Compare in cima al modulo"
            />
          </div>

          <button
            type="button"
            onClick={() => setAttivo((v) => !v)}
            className="inline-flex items-center gap-2 self-start text-sm text-ink dark:text-[#f4f4f7]"
          >
            <Checkbox checked={attivo} onChange={setAttivo} />
            Modulo attivo
          </button>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <MultiSelect
              label="Aree di lavoro"
              value={areaIds}
              onChange={setAreaIds}
              options={areas.map((a) => ({ id: a.id, label: a.name, color: a.color }))}
              placeholder="Nessuna area"
            />
            <MultiSelect
              label="Operatori"
              value={userIds}
              onChange={setUserIds}
              options={users.map((u) => ({ id: u.id, label: u.full_name || u.username }))}
              placeholder="Nessun operatore"
            />
          </div>
          <p className="-mt-3 text-[11.5px] text-muted dark:text-[#9999a0]">
            Chi rientra qui vedrà i report di questo modulo nella pagina Report ed è l'unico a poterlo
            compilare dal link. Senza assegnazioni restano i soli admin.
          </p>

          {/* ── Sezioni ── */}
          <div className="flex flex-col gap-2 border-t border-line pt-4 dark:border-[#2a2a2e]">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
                Sezioni
              </p>
              <Button
                variant="secondary"
                onClick={() => setSezioni((prev) => [...prev, { title: "Nuova sezione", position: prev.length }])}
                leftIcon={<Icon name="plus" className="w-3 h-3" />}
              >
                Aggiungi
              </Button>
            </div>
            {sezioni.length === 0 ? (
              <p className="text-[12px] text-muted dark:text-[#9999a0]">
                Nessuna sezione: i campi compaiono uno dopo l'altro.
              </p>
            ) : (
              sezioni.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={s.title}
                    onChange={(e) =>
                      setSezioni((prev) => prev.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))
                    }
                    placeholder="Titolo della sezione"
                  />
                  <button
                    type="button"
                    title="Rimuovi sezione"
                    aria-label="Rimuovi sezione"
                    onClick={() => {
                      setSezioni((prev) => prev.filter((_, j) => j !== i));
                      setCampi((prev) =>
                        prev.map((c) => (c.section_index === i ? { ...c, section_index: null } : c))
                      );
                    }}
                    className="inline-grid h-8 w-8 flex-none place-items-center rounded-md border border-danger/20 bg-danger/5 text-danger hover:bg-danger/10"
                  >
                    <Icon name="trash" className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* ── Campi ── */}
          <div className="flex flex-col gap-3 border-t border-line pt-4 dark:border-[#2a2a2e]">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
                Campi
              </p>
              <Button
                variant="secondary"
                onClick={() => setCampi((prev) => [...prev, NUOVO_CAMPO(prev.length)])}
                leftIcon={<Icon name="plus" className="w-3 h-3" />}
              >
                Aggiungi campo
              </Button>
            </div>

            {campi.map((campo, index) => (
              <div
                key={campo.id ?? `nuovo-${index}`}
                className="flex flex-col gap-3 rounded-md border border-line bg-cream p-3 dark:border-[#2a2a2e] dark:bg-[#1c1c20]"
              >
                <div className="flex items-start gap-2">
                  <div className="flex flex-none flex-col gap-0.5 pt-6">
                    <button
                      type="button"
                      aria-label="Sposta su"
                      onClick={() => spostaCampo(index, -1)}
                      className="inline-grid h-5 w-5 place-items-center rounded border border-line text-muted hover:text-ink dark:border-[#2a2a2e]"
                    >
                      <Icon name="chevron-down" className="h-3 w-3 rotate-180" />
                    </button>
                    <button
                      type="button"
                      aria-label="Sposta giù"
                      onClick={() => spostaCampo(index, 1)}
                      className="inline-grid h-5 w-5 place-items-center rounded border border-line text-muted hover:text-ink dark:border-[#2a2a2e]"
                    >
                      <Icon name="chevron-down" className="h-3 w-3" />
                    </button>
                  </div>

                  <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 md:grid-cols-3">
                    <div className="md:col-span-2">
                      <Input
                        label="Etichetta"
                        value={campo.label}
                        onChange={(e) => setCampo(index, { label: e.target.value })}
                        placeholder="Aggiornamento plugin"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
                        Tipo
                      </label>
                      <SearchableSelect
                        value={campo.field_type}
                        onChange={(v) => setCampo(index, { field_type: v as FormFieldType })}
                        options={(Object.keys(FIELD_TYPE_LABELS) as FormFieldType[]).map((t) => ({
                          value: t,
                          label: FIELD_TYPE_LABELS[t],
                        }))}
                        showAvatar={false}
                        menuLayer="portal"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    title="Elimina campo"
                    aria-label="Elimina campo"
                    onClick={() => setCampi((prev) => prev.filter((_, j) => j !== index))}
                    className="mt-6 inline-grid h-8 w-8 flex-none place-items-center rounded-md border border-danger/20 bg-danger/5 text-danger hover:bg-danger/10"
                  >
                    <Icon name="trash" className="h-3.5 w-3.5" />
                  </button>
                </div>

                {(campo.field_type === "select" || campo.field_type === "multiselect") && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
                      Opzioni (una per riga)
                    </label>
                    <textarea
                      value={campo.optionsText}
                      onChange={(e) => setCampo(index, { optionsText: e.target.value })}
                      rows={3}
                      placeholder={"SI\nNO"}
                      className="w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-ink dark:border-line-dark dark:bg-ink-soft dark:text-paper"
                    />
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-4">
                  <button
                    type="button"
                    onClick={() => setCampo(index, { is_required: !campo.is_required })}
                    className="inline-flex items-center gap-2 text-[13px] text-ink dark:text-[#f4f4f7]"
                  >
                    <Checkbox checked={!!campo.is_required} onChange={(v) => setCampo(index, { is_required: v })} />
                    Obbligatorio
                  </button>
                  {(campo.field_type === "select" || campo.field_type === "multiselect") && (
                    <button
                      type="button"
                      onClick={() => setCampo(index, { allow_other: !campo.allow_other })}
                      className="inline-flex items-center gap-2 text-[13px] text-ink dark:text-[#f4f4f7]"
                    >
                      <Checkbox checked={!!campo.allow_other} onChange={(v) => setCampo(index, { allow_other: v })} />
                      Consenti «Altro» a testo libero
                    </button>
                  )}
                  {sezioni.length > 0 && (
                    <div className="w-44">
                      <SearchableSelect
                        value={campo.section_index != null ? String(campo.section_index) : ""}
                        onChange={(v) => setCampo(index, { section_index: v === "" ? null : Number(v) })}
                        options={[
                          { value: "", label: "Nessuna sezione" },
                          ...sezioni.map((s, i) => ({ value: String(i), label: s.title || `Sezione ${i + 1}` })),
                        ]}
                        showAvatar={false}
                        menuLayer="portal"
                      />
                    </div>
                  )}
                  <div className="w-48">
                    <SearchableSelect
                      value={campo.source ?? ""}
                      onChange={(v) => setCampo(index, { source: (v || null) as FormFieldSource | null })}
                      options={[
                        { value: "", label: "Compilato a mano" },
                        ...(Object.keys(FIELD_SOURCE_LABELS) as FormFieldSource[]).map((s) => ({
                          value: s,
                          label: `Auto: ${FIELD_SOURCE_LABELS[s]}`,
                        })),
                      ]}
                      showAvatar={false}
                      menuLayer="portal"
                    />
                  </div>
                </div>

                {/* ── Condizione di visibilità ── */}
                {campiPrecedenti(index).length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 border-t border-line/60 pt-2 dark:border-[#2a2a2e]">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
                      Mostra solo se
                    </span>
                    <div className="w-44">
                      <SearchableSelect
                        value={campo.visible_if?.field_key ?? ""}
                        onChange={(v) =>
                          setCampo(index, {
                            visible_if: v
                              ? { field_key: v, operator: campo.visible_if?.operator ?? "eq", value: campo.visible_if?.value ?? "" }
                              : null,
                          })
                        }
                        options={[
                          { value: "", label: "Sempre visibile" },
                          ...campiPrecedenti(index).map((c) => ({ value: c.key as string, label: c.label })),
                        ]}
                        showAvatar={false}
                        menuLayer="portal"
                      />
                    </div>
                    {campo.visible_if && (
                      <>
                        <div className="w-36">
                          <SearchableSelect
                            value={campo.visible_if.operator}
                            onChange={(v) =>
                              setCampo(index, {
                                visible_if: { ...campo.visible_if!, operator: v as ConditionOperator },
                              })
                            }
                            options={(Object.keys(CONDITION_LABELS) as ConditionOperator[]).map((o) => ({
                              value: o,
                              label: CONDITION_LABELS[o],
                            }))}
                            showAvatar={false}
                            menuLayer="portal"
                          />
                        </div>
                        {campo.visible_if.operator !== "filled" && campo.visible_if.operator !== "empty" && (
                          <div className="w-40">
                            <Input
                              value={(campo.visible_if.value as string) ?? ""}
                              onChange={(e) =>
                                setCampo(index, {
                                  visible_if: { ...campo.visible_if!, value: e.target.value },
                                })
                              }
                              placeholder="NO"
                            />
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </Modal>

      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Elimina modulo"
        description="Un modulo con report già compilati non si elimina: si disattiva, così lo storico resta leggibile."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)} disabled={removing}>
              Annulla
            </Button>
            <Button variant="danger" onClick={remove} loading={removing}>
              Elimina
            </Button>
          </>
        }
      >
        <p className="font-body text-sm text-ink dark:text-[#f4f4f7]">
          Sei sicuro di voler eliminare <strong>{deleting?.name}</strong>?
        </p>
      </Modal>
    </div>
  );
}
