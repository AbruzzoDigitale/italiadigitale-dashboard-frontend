import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../../components/ui/Icon";
import { SocialIcon } from "../../components/social/SocialIcon";
import type { FeedPost } from "../../api/socialProfiles";

interface Slide {
  media_url: string | null;
  media_type: string | null;
  thumbnail_url: string | null;
}

function isVideo(mt: string | null): boolean {
  return (mt || "").toUpperCase() === "VIDEO";
}

function fmt(value: string | null): string {
  if (!value) return "";
  return new Date(value).toLocaleString("it-IT", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

interface Props {
  post: FeedPost;
  platform: string;
  title: string;
  onClose: () => void;
}

export function PostLightbox({ post, platform, title, onClose }: Props) {
  const slides: Slide[] = useMemo(() => {
    if (post.children && post.children.length > 0) return post.children;
    return [{ media_url: post.media_url, media_type: post.media_type, thumbnail_url: post.thumbnail_url }];
  }, [post]);
  const [idx, setIdx] = useState(0);
  const [videoFailed, setVideoFailed] = useState(false);
  const slide = slides[Math.min(idx, slides.length - 1)];
  const multi = slides.length > 1;

  // Reset del fallback video quando cambia slide.
  useEffect(() => setVideoFailed(false), [idx]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && multi) setIdx((i) => (i + 1) % slides.length);
      if (e.key === "ArrowLeft" && multi) setIdx((i) => (i - 1 + slides.length) % slides.length);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [multi, slides.length, onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-paper shadow-3 dark:bg-[#131316] md:flex-row"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Media */}
        <div className="relative flex min-h-[280px] flex-1 items-center justify-center bg-black">
          {isVideo(slide?.media_type ?? null) && slide?.media_url && !videoFailed ? (
            <video
              src={slide.media_url}
              poster={slide.thumbnail_url ?? undefined}
              controls
              autoPlay
              playsInline
              onError={() => setVideoFailed(true)}
              className="max-h-[90vh] w-full object-contain"
            />
          ) : slide?.media_url || slide?.thumbnail_url ? (
            <div className="relative flex w-full items-center justify-center">
              <img
                src={(slide.thumbnail_url || slide.media_url) as string}
                alt=""
                className="max-h-[90vh] w-full object-contain"
              />
              {/* Video non riproducibile inline (es. reel FB): overlay per aprirlo sul social. */}
              {isVideo(slide?.media_type ?? null) && post.permalink && (
                <a
                  href={post.permalink}
                  target="_blank"
                  rel="noreferrer"
                  className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/30 text-white transition-colors hover:bg-black/45"
                >
                  <span className="grid h-14 w-14 place-items-center rounded-full bg-white/90 pl-1 text-[22px] leading-none text-ink">
                    ▶
                  </span>
                  <span className="text-[12px] font-semibold">Guarda il video sul social</span>
                </a>
              )}
            </div>
          ) : (
            <div className="p-8 text-center text-[13px] text-white/70">Media non disponibile</div>
          )}

          {multi && (
            <>
              <button
                type="button"
                onClick={() => setIdx((i) => (i - 1 + slides.length) % slides.length)}
                className="absolute left-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-white hover:bg-black/70"
                aria-label="Precedente"
              >
                <Icon name="chevron-right" className="h-4 w-4 rotate-180" />
              </button>
              <button
                type="button"
                onClick={() => setIdx((i) => (i + 1) % slides.length)}
                className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-white hover:bg-black/70"
                aria-label="Successivo"
              >
                <Icon name="chevron-right" className="h-4 w-4" />
              </button>
              <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5">
                {slides.map((_, i) => (
                  <span key={i} className={`h-1.5 w-1.5 rounded-full ${i === idx ? "bg-white" : "bg-white/40"}`} />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Info */}
        <div className="flex w-full flex-col md:w-80">
          <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3 dark:border-[#2a2a2e]">
            <div className="flex min-w-0 items-center gap-2">
              <SocialIcon platform={platform} className="h-5 w-5 flex-none" />
              <span className="min-w-0 truncate text-[13px] font-bold text-ink dark:text-[#f4f4f7]">{title}</span>
              {post.content_type !== "post" && (
                <span className="rounded bg-muted/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-muted dark:text-[#9999a0]">
                  {post.content_type === "carousel" ? "carosello" : post.content_type === "story" ? "storia" : post.content_type}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Chiudi"
              className="grid h-7 w-7 flex-none place-items-center rounded-md text-muted hover:bg-cream hover:text-ink dark:text-[#9999a0] dark:hover:bg-[#1c1c20]"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto whitespace-pre-line px-4 py-3 text-[13px] leading-relaxed text-ink dark:text-[#f4f4f7]">
            {post.caption || <span className="text-muted dark:text-[#9999a0]">Nessuna caption.</span>}
          </div>

          <div className="border-t border-line px-4 py-3 dark:border-[#2a2a2e]">
            <div className="mb-1.5 flex items-center gap-3 text-[13px] font-semibold text-ink dark:text-[#f4f4f7]">
              <span>♥ {post.like_count ?? "—"}</span>
              <span>💬 {post.comments_count ?? "—"}</span>
            </div>
            <p className="text-[11.5px] text-muted dark:text-[#9999a0]">{fmt(post.posted_at)}</p>
            {post.permalink && (
              <a
                href={post.permalink}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-semibold text-brand-magenta hover:underline"
              >
                <Icon name="link" className="h-3.5 w-3.5" /> Apri sul social
              </a>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
