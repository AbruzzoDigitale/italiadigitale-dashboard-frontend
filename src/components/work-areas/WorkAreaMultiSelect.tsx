import { useMemo, useState } from "react";
import type { WorkArea } from "../../api/workAreas";
import { Badge } from "../ui/Badge";
import { Icon } from "../ui/Icon";
import { Checkbox } from "../ui/Checkbox";
import { WorkAreaBadge } from "./WorkAreaBadge";

interface WorkAreaMultiSelectProps {
  areas: WorkArea[];
  value: number[];
  onChange: (value: number[]) => void;
  disabled?: boolean;
  showInactive?: boolean;
}

export function WorkAreaMultiSelect({
  areas,
  value,
  onChange,
  disabled = false,
  showInactive = true,
}: WorkAreaMultiSelectProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return areas.filter((area) => {
      if (!showInactive && !area.is_active) return false;
      if (!q) return true;
      return `${area.name} ${area.slug}`.toLowerCase().includes(q);
    });
  }, [areas, search, showInactive]);

  const toggle = (areaId: number) => {
    onChange(
      value.includes(areaId)
        ? value.filter((id) => id !== areaId)
        : [...value, areaId]
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
            Aree di lavoro
          </label>
          <p className="text-[11px] text-muted dark:text-[#9999a0] mt-1">
            Seleziona le aree assegnate a questo utente.
          </p>
        </div>
        <Badge variant="default">{value.length} selezionate</Badge>
      </div>

      <div className="relative">
        <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Cerca area..."
          disabled={disabled}
          className="w-full rounded-md border border-line bg-paper py-2.5 pl-9 pr-3 text-sm font-body text-ink outline-none transition-colors focus:border-ink disabled:cursor-not-allowed disabled:opacity-60 dark:border-line-dark dark:bg-ink-soft dark:text-paper dark:focus:border-paper"
        />
      </div>

      <div className="max-h-56 overflow-y-auto rounded-md border border-line p-2 dark:border-[#2a2a2e]">
        {filtered.length === 0 ? (
          <p className="px-1 py-2 text-sm text-muted dark:text-[#9999a0]">Nessuna area trovata</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {filtered.map((area) => {
              const checked = value.includes(area.id);
              return (
                <label
                  key={area.id}
                  className={`flex items-center justify-between gap-3 rounded-md px-2.5 py-2 transition-colors ${disabled ? "cursor-not-allowed" : "cursor-pointer hover:bg-cream dark:hover:bg-[#1c1c20]"}`}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Checkbox
                      checked={checked}
                      onChange={() => toggle(area.id)}
                      disabled={disabled}
                    />
                    <WorkAreaBadge area={area} />
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={area.is_active ? "success" : "default"}>
                      {area.is_active ? "Attiva" : "Disattiva"}
                    </Badge>
                    <span className="font-mono text-[11px] text-muted dark:text-[#9999a0]">
                      {area.slug}
                    </span>
                  </div>
                </label>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}