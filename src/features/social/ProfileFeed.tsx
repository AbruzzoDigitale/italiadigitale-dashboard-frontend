import { useEffect, useState } from "react";
import { Icon } from "../../components/ui/Icon";
import { getSocialProfileFeedApi, type FeedPost, type SocialProfileFeed } from "../../api/socialProfiles";
import { PostLightbox } from "./PostLightbox";

type FeedState = { loading: boolean } & Partial<SocialProfileFeed>;

function FeedCell({ post, onOpen }: { post: FeedPost; onOpen: (p: FeedPost) => void }) {
  const isCarousel = post.children && post.children.length > 1;
  return (
    <button
      type="button"
      onClick={() => onOpen(post)}
      className="group relative block aspect-square overflow-hidden rounded-md bg-cream dark:bg-[#1c1c20]"
      title={post.caption ?? undefined}
    >
      {post.thumbnail_url ? (
        <img src={post.thumbnail_url} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center p-2 text-center text-[10px] leading-tight text-muted line-clamp-5 dark:text-[#9999a0]">
          {post.caption || "—"}
        </div>
      )}
      {(post.content_type !== "post" || isCarousel) && (
        <span className="absolute right-1 top-1 rounded bg-black/55 px-1 py-0.5 text-[8.5px] font-bold uppercase tracking-wider text-white">
          {isCarousel ? "carosello" : post.content_type}
        </span>
      )}
      <div className="absolute inset-0 flex items-center justify-center gap-3 bg-black/50 text-[12px] font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">
        <span>♥ {post.like_count ?? "—"}</span>
        <span>💬 {post.comments_count ?? "—"}</span>
      </div>
    </button>
  );
}

function StoryTray({ stories, onOpen }: { stories: FeedPost[]; onOpen: (p: FeedPost) => void }) {
  if (!stories || stories.length === 0) return null;
  return (
    <div className="mb-3">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted dark:text-[#9999a0]">
        Storie in corso ora
      </p>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {stories.map((s, i) => (
          <button key={s.external_post_id ?? i} type="button" onClick={() => onOpen(s)} className="flex-none" title="Storia in corso">
            <span className="block rounded-full bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600 p-[2px]">
              <span className="block rounded-full border-2 border-paper dark:border-[#131316]">
                {s.thumbnail_url ? (
                  <img src={s.thumbnail_url} alt="" className="h-14 w-14 rounded-full object-cover" />
                ) : (
                  <span className="grid h-14 w-14 place-items-center rounded-full bg-cream text-muted dark:bg-[#1c1c20]">
                    <Icon name="image" className="h-5 w-5" />
                  </span>
                )}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Feed (storie + griglia post/reel) di UN singolo profilo social, con lightbox. */
export function ProfileFeed({
  profileId,
  platform,
  name,
  url,
}: {
  profileId: number;
  platform: string;
  name: string;
  url: string;
}) {
  const [state, setState] = useState<FeedState>({ loading: true });
  const [openPost, setOpenPost] = useState<FeedPost | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true });
    getSocialProfileFeedApi(profileId, 12)
      .then((res) => {
        if (!cancelled) setState({ loading: false, ...res });
      })
      .catch((err) => {
        if (!cancelled)
          setState({
            loading: false,
            supported: true,
            posts: [],
            stories: [],
            error: err instanceof Error ? err.message : "Errore",
          });
      });
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  const gridBody = () => {
    if (state.loading) {
      return (
        <div className="grid grid-cols-3 gap-1 sm:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="sp-skeleton aspect-square rounded-md" />
          ))}
        </div>
      );
    }
    if (state.supported === false) {
      return (
        <p className="text-[12.5px] text-muted dark:text-[#9999a0]">
          Anteprima non disponibile per questa piattaforma.{" "}
          <a href={url} target="_blank" rel="noreferrer" className="text-brand-magenta hover:underline">
            Apri profilo
          </a>
        </p>
      );
    }
    if (state.error) return <p className="text-[12.5px] text-danger">{state.error}</p>;
    if (!state.posts || state.posts.length === 0)
      return <p className="text-[12.5px] text-muted dark:text-[#9999a0]">Nessun post da mostrare.</p>;
    return (
      <div className="grid grid-cols-3 gap-1 sm:grid-cols-4 lg:grid-cols-6">
        {state.posts.map((post, i) => (
          <FeedCell key={post.external_post_id ?? i} post={post} onOpen={setOpenPost} />
        ))}
      </div>
    );
  };

  return (
    <div>
      <StoryTray stories={state.stories ?? []} onOpen={setOpenPost} />
      {gridBody()}
      {openPost && (
        <PostLightbox post={openPost} platform={platform} title={name} onClose={() => setOpenPost(null)} />
      )}
    </div>
  );
}
