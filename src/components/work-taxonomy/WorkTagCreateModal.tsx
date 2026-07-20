import { useState } from "react";
import { createWorkTagApi, type WorkTag } from "../../api/workTags";
import { Button } from "../ui/Button";
import { ColorHexField } from "../ui/ColorHexField";
import { Icon } from "../ui/Icon";
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
  onCreated: (tag: WorkTag) => void;
};

export function WorkTagCreateModal({ open, companyId, onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [color, setColor] = useState("#6366f1");
  const [saving, setSaving] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (saving) return;
    setName("");
    setSlug("");
    setColor("#6366f1");
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
      const created = await createWorkTagApi({
        company_id: companyId,
        name: name.trim(),
        slug: slug.trim() || undefined,
        color: color.trim() || null,
      });
      onCreated(created);
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nella creazione tag");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Nuovo tag"
      icon={<Icon name="star" className="h-5 w-5" />}
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
        <Input label="Nome" labelIcon={<Icon name="pencil" className="h-3 w-3" />} value={name} onChange={(e) => handleName(e.target.value)} placeholder="Es. Urgente" />
        <Input
          label="Slug"
          labelIcon={<Icon name="list" className="h-3 w-3" />}
          value={slug}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(e.target.value);
          }}
          placeholder="es. urgente"
        />
        <ColorHexField label="Colore" value={color} onChange={setColor} />
      </div>
    </Modal>
  );
}
