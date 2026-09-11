import { useCallback, useEffect, useRef, useState } from "react";
import { Play, MonitorPlay, Video, VideoOff, Clapperboard, Loader2, RotateCw } from "lucide-react";
import { useLang } from "../../context/LangContext";
import api from "../../utils/api";
import Button from "../ui/Button";

// Provider → the mark on a card corner and the poster fallback. The set is
// closed by services/education_video (and by the CSP, which names each
// provider's host), so this map can never need a runtime default. The icons are
// deliberately GENERIC rather than brand marks — lucide dropped its brand set,
// and the provider is named in text right beside the glyph anyway.
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
 * - **Loom** → the app's own `<video>`, for EVERY viewer and with nothing to
 *   fall back to, fed a signed MP4 URL from `GET /api/education/media/:id`.
 *   Loom's embed exposes no playback events at all — no position, no seek, no
 *   progress — so its iframe can be shown and cannot be measured; and Loom's
 *   own player is shown to nobody, not even when the MP4 cannot be resolved
 *   (the operator's call, 2026-09-11 — the CSP's `frame-src` no longer names
 *   Loom's host, so the browser would refuse the frame anyway). A video that
 *   cannot be played says WHY inside this frame instead. The bytes stream
 *   straight from Loom's CDN to the phone; nothing is downloaded and nothing is
 *   stored on our server.
 * - **YouTube** and **Vimeo** → iframes, driven by RAW postMessage. Both ship a
 *   JavaScript SDK that does this more comfortably and neither is loaded: that
 *   would need a `script-src` hole for a foreign host in a page holding this
 *   session's token, and the wire protocol underneath the SDK is all we need to
 *   read a clock.
 *
 * It still does NOT autoplay. A lesson opens on a phone that is often in a
 * workshop, frequently on someone else's shift, and sound starting by itself is
 * how a video gets closed before it is watched.
 *
 * `tracker` is `useWatchTracker`. Absent — an admin previewing somebody else's
 * lesson — every player below plays exactly the same and simply reports
 * nothing: measurement decides what is COUNTED, never which player is shown.
 */

const FRAME_ORIGIN = {
  youtube: "https://www.youtube-nocookie.com",
  vimeo: "https://player.vimeo.com",
};

// Loom signs each MP4 URL for about an hour. A player left PAUSED longer than
// this gets a fresh one before anybody presses play again: a re-sign triggered
// BY the failed play lands after an async gap, and iOS then refuses `play()`
// until the viewer taps a second time.
const LOOM_RESIGN_MS = 45 * 60 * 1000;
// Silent re-resolves allowed inside the window before the player admits it
// cannot play. A lapsed signature needs exactly one; a file Loom serves broken
// would otherwise be fetched again forever.
const LOOM_RETRIES = 2;
const LOOM_RETRY_WINDOW_MS = 5 * 60 * 1000;

/** The frame a player shows when there is nothing it can play. */
function PlayerNotice({ children }) {
  return (
    <div
      className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-2xl px-6 text-center text-sm"
      style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-3)" }}
    >
      {children}
    </div>
  );
}

/** Loom, in our own player — for everyone, with no iframe behind it. */
function LoomPlayer({ lesson, title, tracker }) {
  const { t } = useLang();
  const ref = useRef(null);
  const [media, setMedia] = useState(null);       // { url, gen, at }
  const [err, setErr] = useState(null);           // null | "restricted" | "failed"
  const [reloading, setReloading] = useState(false);
  const req = useRef(0);                          // only the latest answer may land
  const busy = useRef(false);
  const pos = useRef(0);                          // where the viewer is, in seconds
  const wantPlay = useRef(false);                 // were they watching?
  const resume = useRef(null);                    // { at, play } for the next element
  const retries = useRef([]);                     // when the silent re-resolves ran

  // `quiet` is the pre-emptive re-sign: its failure changes nothing on screen,
  // because the URL in hand still works and the next check asks again.
  const resolve = useCallback((quiet = false) => {
    const token = ++req.current;
    busy.current = true;
    if (!quiet) setReloading(true);
    api.get(`/api/education/media/${lesson.id}`)
      .then((r) => {
        if (token !== req.current) return;
        const url = r.data?.url;
        if (!url) throw new Error("no url");
        // The new element takes over where the old one stood, and plays on
        // only if somebody was watching.
        resume.current = (pos.current > 0 || wantPlay.current)
          ? { at: pos.current, play: wantPlay.current } : null;
        setErr(null);
        setMedia((m) => ({ url, gen: (m?.gen ?? 0) + 1, at: Date.now() }));
      })
      .catch((e) => {
        if (token !== req.current || quiet) return;
        setErr(e?.response?.data?.detail === "loom_restricted" ? "restricted" : "failed");
      })
      .finally(() => {
        if (token !== req.current) return;
        busy.current = false;
        setReloading(false);
      });
  }, [lesson.id]);

  // Another lesson starts from nothing: no URL, no position carried over.
  useEffect(() => {
    setMedia(null);
    setErr(null);
    pos.current = 0;
    wantPlay.current = false;
    resume.current = null;
    retries.current = [];
    resolve();
    return () => { req.current += 1; busy.current = false; };
  }, [resolve]);

  // Re-sign a PAUSED player whose URL is about to lapse — on a slow timer, and
  // the moment the page is shown again, which is exactly when somebody who left
  // a lesson paused comes back to it.
  useEffect(() => {
    if (!media) return undefined;
    const check = () => {
      const v = ref.current;
      if (document.hidden || busy.current || !v?.paused) return;
      if (Date.now() - media.at >= LOOM_RESIGN_MS) resolve(true);
    };
    const timer = setInterval(check, 60 * 1000);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [media, resolve]);

  // A signed URL that lapsed mid-lesson surfaces here as a network error, and
  // is answered with a fresh URL at the same second rather than a dead frame.
  const onError = () => {
    if (ref.current?.error?.code === 1) return;   // MEDIA_ERR_ABORTED: a source let go, not a failure
    const now = Date.now();
    retries.current = retries.current.filter((at) => now - at < LOOM_RETRY_WINDOW_MS);
    if (retries.current.length >= LOOM_RETRIES) { setErr("failed"); return; }
    retries.current.push(now);
    resolve();
  };

  const onLoadedMetadata = () => {
    const v = ref.current;
    const r = resume.current;
    resume.current = null;
    if (!v || !r) return;
    if (r.at > 0) v.currentTime = r.at;
    // After the async gap iOS may refuse this until the viewer taps — the
    // position is already restored and the controls are right there.
    if (r.play) v.play().catch(() => {});
  };

  const retry = () => {
    retries.current = [];
    setErr(null);
    setMedia(null);
    resolve();
  };

  if (err) {
    return (
      <PlayerNotice>
        <VideoOff size={28} strokeWidth={1.5} style={{ color: "var(--text-4)" }} aria-hidden />
        <p className="max-w-md" style={{ color: "var(--text-2)" }} role="status">
          {t(err === "restricted" ? "education.player.restricted" : "education.player.unavailable")}
        </p>
        <Button variant="secondary" size="md" icon={RotateCw} onClick={retry}>
          {t("common.retry")}
        </Button>
      </PlayerNotice>
    );
  }
  if (!media) {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-2xl"
           style={{ background: "#000", border: "1px solid var(--border)" }}>
        <Loader2 size={22} className="animate-spin" style={{ color: "var(--text-4)" }} />
      </div>
    );
  }
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl"
         style={{ background: "#000", border: "1px solid var(--border)" }}>
      <video
        // A fresh element per URL: a new `src` on an element that has already
        // failed is not reliably a reload, and a new URL may equal the old one.
        key={media.gen}
        ref={ref}
        src={media.url}
        aria-label={title || t("education.player.title")}
        controls
        // Without this iOS hands the video to its own fullscreen player, which
        // is a different surface with different controls on the phone most of
        // these lessons are watched on.
        playsInline
        preload="metadata"
        controlsList="nodownload"
        className="absolute inset-0 h-full w-full"
        onLoadedMetadata={onLoadedMetadata}
        onTimeUpdate={() => {
          const v = ref.current;
          if (!v) return;
          pos.current = v.currentTime;
          tracker?.report(v.currentTime, v.duration);
        }}
        onPlay={() => { wantPlay.current = true; }}
        onPause={() => { wantPlay.current = false; tracker?.pause(); tracker?.flush(); }}
        onSeeking={() => tracker?.pause()}
        onEnded={() => {
          wantPlay.current = false;
          tracker?.markEnded(ref.current?.duration);
          tracker?.flush();
        }}
        onError={onError}
      />
      {reloading && (
        <div className="absolute inset-0 flex items-center justify-center"
             style={{ background: "rgba(0,0,0,0.45)" }}>
          <Loader2 size={22} className="animate-spin" style={{ color: "#fff" }} />
        </div>
      )}
    </div>
  );
}

/** YouTube and Vimeo, read over postMessage. Never Loom — see LoomPlayer. */
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
  // Loom is played by LoomPlayer or by nothing: there is no Loom iframe on this
  // platform, so a Loom lesson with no id to resolve is simply unavailable.
  if (kind === "loom") {
    return lesson?.id
      ? <LoomPlayer lesson={lesson} title={title} tracker={tracker} />
      : <PlayerNotice>{t("education.player.unavailable")}</PlayerNotice>;
  }
  if (!src) return <PlayerNotice>{t("education.player.unavailable")}</PlayerNotice>;
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
