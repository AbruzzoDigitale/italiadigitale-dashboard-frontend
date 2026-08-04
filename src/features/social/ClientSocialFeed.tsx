import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../components/ui/Icon";
import { SocialIcon } from "../../components/social/SocialIcon";
import {
  listSocialProfilesApi,
  socialProfileLabel,
  SOCIAL_PLATFORM_LABELS,
  type SocialProfile,
} from "../../api/socialProfiles";
import { ProfileFeed } from "./ProfileFeed";

export function ClientSocialFeed({ clientId }: { clientId: number }) {
  const [profiles, setProfiles] = useState<SocialProfile[]>([]);
  const [activePlatform, setActivePlatform] = useState<string | null>(null);

  useEffect(() => {
    listSocialProfilesApi({ clientId })
      .then((rows) => {
        setProfiles(rows);
        setActivePlatform((cur) => cur ?? rows[0]?.platform ?? null);
      })
      .catch(() => setProfiles([]));
  }, [clientId]);

  const platforms = useMemo(() => {
    const seen: string[] = [];
    for (const p of profiles) if (!seen.includes(p.platform)) seen.push(p.platform);
    return seen;
  }, [profiles]);

  const activeProfiles = useMemo(
    () => profiles.filter((p) => p.platform === activePlatform),
    [profiles, activePlatform]
  );

  if (profiles.length === 0) return null;

  return (
    <div className="mt-10">
      <h2 className="section-title mb-3 flex items-center gap-2">
        <Icon name="grid" className="h-5 w-5" /> Panoramica social
      </h2>

      <div className="mb-4 flex flex-wrap gap-2">
        {platforms.map((pl) => (
          <button
            key={pl}
            type="button"
            onClick={() => setActivePlatform(pl)}
            className={`inline-flex items-center gap-2 rounded-pill border px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
              activePlatform === pl
                ? "border-brand-magenta bg-brand-magenta/5 text-ink dark:text-[#f4f4f7]"
                : "border-line text-muted hover:text-ink dark:border-[#2a2a2e] dark:text-[#9999a0] dark:hover:text-[#f4f4f7]"
            }`}
          >
            <SocialIcon platform={pl} className="h-4 w-4" />
            {SOCIAL_PLATFORM_LABELS[pl] ?? pl}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-6">
        {activeProfiles.map((p) => (
          <div key={p.id}>
            <div className="mb-2 flex items-center gap-2">
              <SocialIcon platform={p.platform} className="h-5 w-5" />
              <a
                href={p.url}
                target="_blank"
                rel="noreferrer"
                className="text-[14px] font-bold text-ink hover:underline dark:text-[#f4f4f7]"
              >
                {socialProfileLabel(p)}
              </a>
            </div>
            <ProfileFeed profileId={p.id} platform={p.platform} name={socialProfileLabel(p)} url={p.url} />
          </div>
        ))}
      </div>
    </div>
  );
}
