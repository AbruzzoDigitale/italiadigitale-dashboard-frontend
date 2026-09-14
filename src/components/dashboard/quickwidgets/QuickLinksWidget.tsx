import { listQuickLinksApi } from "../../../api/quickLinks";
import { faviconFor, normalizeUrl } from "../../../utils/quickLinks";
import { QuickListFrame, useQuickData } from "./QuickListFrame";

export function QuickLinksWidget() {
  const { data, loading } = useQuickData(() => listQuickLinksApi(), []);
  const links = data ?? [];
  return (
    <QuickListFrame
      title="Collegamenti rapidi"
      icon="link"
      loading={loading}
      empty={links.length === 0}
      emptyText="Nessun collegamento"
    >
      {links.map((l) => (
        <div
          key={l.id}
          onClick={() => window.open(normalizeUrl(l.url), "_blank", "noopener")}
          className="-mx-1 flex cursor-pointer items-center gap-2 rounded border-b border-line/60 px-1 py-1.5 last:border-0 hover:bg-cream dark:border-[#2a2a2e] dark:hover:bg-[#1c1c20]"
        >
          <img src={faviconFor(l)} alt="" className="h-4 w-4 flex-shrink-0 rounded-sm" />
          <span className="min-w-0 flex-1 truncate text-[12px] text-ink dark:text-[#f4f4f7]">{l.title}</span>
        </div>
      ))}
    </QuickListFrame>
  );
}
