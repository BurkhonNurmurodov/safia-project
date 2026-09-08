import { useState } from "react";
import { Play, MonitorPlay, Video, Clapperboard } from "lucide-react";
import { useLang } from "../../context/LangContext";

// Provider → the mark on a card corner and the poster fallback. The set is
// closed by services/education_video (and by the CSP's frame-src), so this map
// can never need a runtime default. The icons are deliberately GENERIC rather
// than brand marks — lucide dropped its brand set, and the provider is named in
// text right beside the glyph anyway.
export const PROVIDER_META = {
  youtube: { label: "YouTube", Icon: MonitorPlay },
  loom:    { label: "Loom",    Icon: Video },
  vimeo:   { label: "Vimeo",   Icon: Clapperboard },
};

/**
 * The 16:9 still for a lesson.
 *
 * Two of the three providers publish a static thumbnail URL and Vimeo does not
 * — so a missing `thumb` is an ordinary, expected state, not a failure, and it
 * draws a branded poster instead of a broken-image glyph. A thumbnail that
 * 404s at request time (a deleted video, a CDN hiccup) falls into the same
 * poster through onError, so the grid can never show a torn card.
 */
export function LessonPoster({ thumb, provider, title, className = "" }) {
  const [failed, setFailed] = useState(false);
  const meta = PROVIDER_META[provider] || {};
  const Icon = meta.Icon || Video;

  if (thumb && !failed) {
    return (
      <img
        src={thumb}
        alt=""                    /* decorative: the title is right beside it */
        loading="lazy"
        onError={() => setFailed(true)}
        className={`h-full w-full object-cover ${className}`}
      />
    );
  }
  return (
    <div
      className={`flex h-full w-full items-center justify-center ${className}`}
      style={{
        background:
          "linear-gradient(135deg, var(--bg-inner) 0%, var(--bg-card) 100%)",
      }}
    >
      <Icon size={30} strokeWidth={1.5} style={{ color: "var(--text-4)" }} aria-hidden />
      <span className="sr-only">{title}</span>
    </div>
  );
}

/**
 * The player itself — a fixed-host iframe, which is the whole reason only three
 * providers are accepted (see services/education_video and the CSP's frame-src
 * in main.py).
 *
 * It does NOT autoplay. A lesson opens on a phone that is often in a workshop,
 * frequently on someone else's shift, and sound starting by itself is how a
 * video gets closed before it is watched.
 */
export default function VideoEmbed({ embed, provider, title }) {
  const { t } = useLang();
  if (!embed) {
    return (
      <div
        className="flex aspect-video w-full items-center justify-center rounded-2xl text-sm"
        style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-3)" }}
      >
        {t("education.player.unavailable")}
      </div>
    );
  }
  return (
    <div
      className="relative aspect-video w-full overflow-hidden rounded-2xl"
      style={{ background: "#000", border: "1px solid var(--border)" }}
    >
      <iframe
        src={embed}
        title={title || t("education.player.title")}
        className="absolute inset-0 h-full w-full"
        style={{ border: 0 }}
        // `fullscreen` must be delegated explicitly: the parent holds the
        // feature for `self`, and a cross-origin child gets it only through
        // this attribute. Without it the player's expand button does nothing.
        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}

/** The play affordance drawn over a card's still. Purely decorative — the whole
 *  card is the button, so this is never focusable on its own. */
export function PlayBadge() {
  return (
    <span
      aria-hidden
      className="edu-play absolute inset-0 flex items-center justify-center"
    >
      <span
        className="flex h-11 w-11 items-center justify-center rounded-full"
        style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(2px)" }}
      >
        <Play size={20} fill="#fff" style={{ color: "#fff" }} />
      </span>
    </span>
  );
}
