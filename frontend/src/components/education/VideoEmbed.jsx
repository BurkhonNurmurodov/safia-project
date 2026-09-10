import { useEffect, useRef, useState } from "react";
import { Play, MonitorPlay, Video, Clapperboard, Loader2 } from "lucide-react";
import { useLang } from "../../context/LangContext";
import api from "../../utils/api";

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
 * The player, and the only place a lesson is MEASURED.
 *
 * Three providers, three ways of learning where playback is, because they agree
 * on nothing:
 *
 * - **Loom** → the app's own `<video>`, fed a short-lived signed MP4 URL from
 *   `GET /api/education/media/:id`. Loom's embed exposes no playback events at
 *   all — no position, no seek, no progress — so its iframe can be shown and
 *   cannot be measured. The bytes stream straight from Loom's CDN to the phone;
 *   nothing is downloaded and nothing is stored on our server.
 * - **YouTube** and **Vimeo** → the same iframes as before, driven by RAW
 *   postMessage. Both ship a JavaScript SDK that does this more comfortably and
 *   neither is loaded: that would need a `script-src` hole for a foreign host in
 *   a page holding this session's token, and the wire protocol underneath the
 *   SDK is all we need to read a clock.
 *
 * It still does NOT autoplay. A lesson opens on a phone that is often in a
 * workshop, frequently on someone else's shift, and sound starting by itself is
 * how a video gets closed before it is watched.
 *
 * `tracker` is `useWatchTracker`. Absent — an admin previewing somebody else's
 * lesson — every player below runs exactly as it did before measurement existed.
 */

const FRAME_ORIGIN = {
  youtube: "https://www.youtube-nocookie.com",
  vimeo: "https://player.vimeo.com",
};

/** Loom, in our own player. Falls back to Loom's iframe when the MP4 cannot be
 *  resolved (a private video, a Loom outage): the lesson stays watchable even
 *  though it stops being measurable, which is the right way round. */
function LoomPlayer({ lesson, title, tracker }) {
  const ref = useRef(null);
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setSrc(null);
    setFailed(false);
    api.get(`/api/education/media/${lesson.id}`)
      .then((r) => { if (alive) setSrc(r.data?.url || null); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [lesson.id]);

  if (failed) return <FramePlayer embed={lesson.embed} title={title} provider="loom" />;
  if (!src) {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-2xl"
           style={{ background: "#000", border: "1px solid var(--border)" }}>
        <Loader2 size={22} className="animate-spin" style={{ color: "var(--text-4)" }} />
      </div>
    );
  }
  const el = () => ref.current;
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl"
         style={{ background: "#000", border: "1px solid var(--border)" }}>
      <video
        ref={ref}
        src={src}
        controls
        // Without this iOS hands the video to its own fullscreen player, which
        // is a different surface with different controls on the phone most of
        // these lessons are watched on.
        playsInline
        preload="metadata"
        controlsList="nodownload"
        className="absolute inset-0 h-full w-full"
        onTimeUpdate={() => tracker?.report(el()?.currentTime, el()?.duration)}
        onPause={() => { tracker?.pause(); tracker?.flush(); }}
        onSeeking={() => tracker?.pause()}
        onEnded={() => { tracker?.markEnded(el()?.duration); tracker?.flush(); }}
        // A signed CDN URL expires within minutes, so a lesson left paused and
        // resumed later dies here rather than in the middle of the picture.
        onError={() => setFailed(true)}
      />
    </div>
  );
}

/** YouTube and Vimeo, read over postMessage. Also the un-instrumented fallback
 *  for a Loom video whose MP4 could not be resolved. */
function FramePlayer({ embed, title, provider, tracker }) {
  const { t } = useLang();
  const ref = useRef(null);
  const origin = FRAME_ORIGIN[provider];

  useEffect(() => {
    if (!tracker || !origin) return undefined;
    const frame = ref.current;
    if (!frame) return undefined;

    const send = (msg) => {
      try { frame.contentWindow?.postMessage(JSON.stringify(msg), origin); }
      catch { /* the frame is not up yet; the handshake below repeats */ }
    };

    // YouTube starts delivering `infoDelivery` only once it has been told
    // somebody is listening, and the handshake is lost if it lands before the
    // player is up — hence a repeat rather than a single call on load.
    const hello = () => {
      if (provider === "youtube") send({ event: "listening", id: 1, channel: "widget" });
      else {
        ["timeupdate", "seeked", "pause", "ended"].forEach((value) =>
          send({ method: "addEventListener", value }));
      }
    };
    hello();
    const handshake = setInterval(hello, 1500);
    const stopHandshake = setTimeout(() => clearInterval(handshake), 12000);

    const onMessage = (e) => {
      if (e.origin !== origin || e.source !== frame.contentWindow) return;
      let msg = e.data;
      if (typeof msg === "string") {
        try { msg = JSON.parse(msg); } catch { return; }
      }
      if (!msg || typeof msg !== "object") return;

      if (provider === "youtube") {
        if (msg.event !== "infoDelivery" || !msg.info) return;
        const { currentTime, duration, playerState } = msg.info;
        // 1 = playing. Every other state is somebody NOT watching, and
        // extending a span through a pause is exactly what this must not do.
        if (playerState === 1) tracker.report(currentTime, duration);
        else if (playerState === 2 || playerState === 3) tracker.pause();
        else if (playerState === 0) { tracker.markEnded(duration); tracker.flush(); }
        return;
      }
      // Vimeo
      const d = msg.data || {};
      if (msg.event === "timeupdate") tracker.report(d.seconds, d.duration);
      else if (msg.event === "seeked" || msg.event === "pause") tracker.pause();
      else if (msg.event === "ended") { tracker.markEnded(d.duration); tracker.flush(); }
    };

    window.addEventListener("message", onMessage);
    return () => {
      clearInterval(handshake);
      clearTimeout(stopHandshake);
      window.removeEventListener("message", onMessage);
    };
  }, [tracker, origin, provider, embed]);

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl"
         style={{ background: "#000", border: "1px solid var(--border)" }}>
      <iframe
        ref={ref}
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

export default function VideoEmbed({ lesson, embed, provider, title, tracker }) {
  const { t } = useLang();
  const src = embed ?? lesson?.embed;
  const kind = provider ?? lesson?.provider;
  if (!src) {
    return (
      <div
        className="flex aspect-video w-full items-center justify-center rounded-2xl text-sm"
        style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-3)" }}
      >
        {t("education.player.unavailable")}
      </div>
    );
  }
  if (kind === "loom" && lesson?.id && tracker) {
    return <LoomPlayer lesson={lesson} title={title} tracker={tracker} />;
  }
  return <FramePlayer embed={src} title={title} provider={kind} tracker={tracker} />;
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
