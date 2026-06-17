import { useState } from "react";
import { createWorkAreaApi, type WorkArea } from "../../api/workAreas";
import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Checkbox";
import { ColorHexField } from "../ui/ColorHexField";
import { EmojiPickerField } from "../ui/EmojiPickerField";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

type Props = {
  open: boolean;
  companyId: number | null;
  onClose: () => void;
  onCreated: (area: WorkArea) => void;
};

export function WorkAreaCreateModal({ open, companyId, onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("");
  const [color, setColor] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (saving) return;
    setName("");
    setSlug("");
    setDescription("");
    setIcon("");
    setColor("");
    setIsActive(true);
    setSlugTouched(false);
    setError(null);
    onClose();
  };

  const handleName = (value: string) => {
    setName(value);
    if (!slugTouched) {
      setSlug(slugify(value));
    }
  };

  const save = async () => {
    if (!companyId) {
      setError("Azienda non disponibile");
      return;
    }
    if (!name.trim()) {
      setError("Il nome è obbligatorio");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const created = await createWorkAreaApi({
        company_id: companyId,
        name: name.trim(),
        slug: slug.trim() || undefined,
        description: description.trim() || undefined,
        icon: icon.trim() || undefined,
        color: color.trim() || undefined,
        is_active: isActive,
      });
      onCreated(created);
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nella creazione area");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Nuova area"
      size="sm"
      footer={(
        <>
          <Button variant="ghost" onClick={close} disabled={saving}>Annulla</Button>
          <Button onClick={() => void save()} loading={saving}>Crea</Button>
        </>
      )}
    >
      <div className="space-y-3">
        {error && <div className="rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</div>}
        <Input label="Nome" value={name} onChange={(e) => handleName(e.target.value)} placeholder="Es. Social Media" />
        <Input
          label="Slug"
          value={slug}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(e.target.value);
          }}
          placeholder="es. social-media"
        />
        <Input label="Descrizione" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descrizione opzionale" />
        <EmojiPickerField label="Icona" value={icon} onChange={setIcon} />
        <ColorHexField label="Colore" value={color} onChange={setColor} />
        <label className="inline-flex items-center gap-2 text-sm text-ink dark:text-paper">
          <Checkbox checked={isActive} onChange={setIsActive} />
          Attiva
        </label>
      </div>
    </Modal>
  );
}
