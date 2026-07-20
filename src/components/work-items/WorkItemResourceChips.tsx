import { useToast } from "../../context/ToastContext";
import { type WorkItemResource } from "../../api/workItems";
import { isHttpResourceUrl, resourceChipLabel } from "../../utils/taskResources";
import { ResourceIcon } from "./ResourceIcon";

/**
 * Chip risorse in stile Trello: iconcina del tipo + titolo/host.
 * - Link http(s): anchor in nuova scheda.
 * - Percorso NAS (non http): bottone che copia il percorso negli appunti.
 */
export function WorkItemResourceChips({
  resources,
  className = "",
}: {
  resources: WorkItemResource[];
  className?: string;
}) {
  const toast = useToast();
  if (!resources.length) return null;

  const ordered = [...resources].sort((a, b) => a.position - b.position);

  const copyPath = async (path: string) => {
    try {
      await navigator.clipboard.writeText(path);
      toast.success("Percorso copiato");
    } catch {
      toast.error("Impossibile copiare il percorso");
    }
  };

  const chipClass =
    "inline-flex max-w-[150px] items-center gap-1 rounded-pill border border-line bg-cream px-2 py-0.5 text-[10px] font-semibold text-muted transition-colors hover:border-ink hover:text-ink dark:border-line-dark dark:bg-[#1c1c20] dark:text-muted-dark dark:hover:border-paper dark:hover:text-paper";

  return (
    // Ferma la propagazione: i chip vivono dentro una card cliccabile (apre il dettaglio).
    <div className={`flex flex-wrap gap-1 ${className}`.trim()} onClick={(e) => e.stopPropagation()}>
      {ordered.map((resource) => {
        const label = resourceChipLabel(resource.title, resource.url);
        if (isHttpResourceUrl(resource.url)) {
          return (
            <a
              key={resource.id}
              href={resource.url}
              target="_blank"
              rel="noreferrer"
              className={chipClass}
              title={resource.url}
              onClick={(e) => e.stopPropagation()}
            >
              <ResourceIcon type={resource.type} className="h-3 w-3 flex-none" />
              <span className="truncate">{label}</span>
            </a>
          );
        }
        return (
          <button
            key={resource.id}
            type="button"
            className={chipClass}
            title={`${resource.url} · clic per copiare il percorso`}
            onClick={(e) => {
              e.stopPropagation();
              void copyPath(resource.url);
            }}
          >
            <ResourceIcon type={resource.type} className="h-3 w-3 flex-none" />
            <span className="truncate">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
