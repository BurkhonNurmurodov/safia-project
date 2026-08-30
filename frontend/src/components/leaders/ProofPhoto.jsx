import { useState, useEffect } from "react";
import { ImageOff, RefreshCw } from "lucide-react";
import { SkeletonBlock } from "../ui/Skeleton";
import api from "../../utils/api";

/* A leader-checklist proof photo.
 *
 * BOTH sources go through the backend and are fetched as a BLOB, rendered via
 * an object URL, because neither can be handed to a bare <img src>: the bot's
 * archive photo needs the JWT on the request, and the sheet's photo is a Google
 * Drive SHARE link, which answers an HTML viewer page rather than image bytes
 * (and the app's CSP is img-src 'self' data: blob: anyway). Each keeps its own
 * load state, so one dead photo shows a compact "failed + retry" card in its
 * own place instead of bubbling a broken <img> up to the boot-error overlay.
 *
 * Lifted out of Leaders.jsx when the AI triage view needed the same loader: two
 * copies would have meant two blob lifecycles and two retry behaviours for what
 * is one photo shown in two places.
 */
export function ProxyPhoto({
  load, deps = [], href, T, className = "mt-2",
  // The triage stage shows ONE photo as large as the pane allows, so it needs
  // the whole frame (`contain`) — a cropped thumbnail is exactly where a corner
  // clock goes missing, and the corner clock is the thing being judged.
  fit = "cover", maxHeight = 240, onClick, onReady,
  // Thumbnail mode: the photo fills its PARENT box (the caller sizes it, e.g.
  // w-16 h-16) instead of running full-width — for surfaces where the photo is
  // an index into a zoom view, not the evidence itself. The failed state
  // shrinks to a bare retry so a dead photo can't outgrow its own cell.
  thumb = false,
}) {
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let obj = "";
    let alive = true;
    setFailed(false);
    setUrl("");
    load()
      .then((res) => {
        obj = URL.createObjectURL(res.data);
        if (alive) { setUrl(obj); onReady?.(obj); }
        else URL.revokeObjectURL(obj);
      })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; if (obj) URL.revokeObjectURL(obj); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt]);

  if (failed) {
    if (thumb) {
      return (
        <button type="button" onClick={() => setAttempt((a) => a + 1)}
          title={`${T.photoFailed} — ${T.retry}`}
          className={`${className} w-full h-full rounded-lg border flex flex-col items-center justify-center gap-1`}
          style={{ borderColor: "var(--border)", background: "var(--bg-inner)" }}>
          <ImageOff size={16} color="var(--text-4)" />
          <RefreshCw size={12} color="var(--brand)" />
        </button>
      );
    }
    return (
      <div className={`${className} w-full rounded-lg border flex flex-col items-center justify-center gap-2 py-6 px-3 text-center`}
        style={{ minHeight: 120, borderColor: "var(--border)", background: "var(--bg-inner)" }}>
        <ImageOff size={22} color="var(--text-4)" />
        <span className="text-xs font-medium" style={{ color: "var(--text-3)" }}>{T.photoFailed}</span>
        <button type="button" onClick={() => setAttempt((a) => a + 1)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-md"
          style={{ color: "var(--brand)", background: "rgba(200,151,63,0.12)" }}>
          <RefreshCw size={13} /> {T.retry}
        </button>
      </div>
    );
  }
  if (!url) {
    return thumb
      ? <SkeletonBlock className={`${className} w-full h-full`} style={{ height: "100%" }} />
      : <SkeletonBlock className={`${className} w-full`} style={{ height: maxHeight }} />;
  }
  return (
    <img src={url} alt="" loading="lazy"
      onClick={() => (onClick ? onClick(url) : window.open(href || url, "_blank"))}
      className={`${className} w-full ${thumb ? "h-full" : ""} rounded-lg border cursor-zoom-in`}
      style={{ objectFit: fit, borderColor: "var(--border)", ...(thumb ? {} : { maxHeight }) }} />
  );
}

/* `uid` is the report the photo was reached through. Both endpoints below are
 * page-gated for the register, but the day report at /leaders/report/:uid is
 * AUTH-ONLY on purpose — the brigadir it is written for often holds no
 * `leaders` grant — so it passes its uid and the backend authorises the photo
 * against that one report's row scope instead. Omitted everywhere else, where
 * the page grant is the door and nothing changes. */

// A sheet (Fillout → Google Drive) proof photo. Zooming opens the ORIGINAL Drive
// link, which is the full-resolution copy — the proxied one is just what renders
// in the card.
export const ReportPhoto = ({ src, T, className, uid, ...rest }) => (
  <ProxyPhoto T={T} className={className} href={src} deps={[src, uid]} {...rest}
    load={() => api.get("/api/leaders/photo",
      { params: uid ? { url: src, uid } : { url: src }, responseType: "blob" })} />
);

// A bot-submission proof photo, streamed out of the Telegram archive channel.
export const BotPhoto = ({ id, T, className, uid, ...rest }) => (
  <ProxyPhoto T={T} className={className} deps={[id, uid]} {...rest}
    load={() => api.get(`/api/leader-tasks/media/${id}`,
      { params: uid ? { uid } : undefined, responseType: "blob" })} />
);

// A camera-roll shot that has NOT become an entry yet — a task still short of
// its `min_media`. Admin-only, and the only door onto these: they hang off no
// LeaderTaskEntry, so the register's media proxy cannot reach them, and the
// leader's own /api/leader-proof/photo answers only for its own filer.
export const RollPhoto = ({ id, T, className, ...rest }) => (
  <ProxyPhoto T={T} className={className} deps={[id]} {...rest}
    load={() => api.get(`/admin/leader-tasks/roll-photo/${id}`, { responseType: "blob" })} />
);

// An admin-uploaded EXAMPLE of a correct proof for one task, as shown on the
// «Vazifalar» tab. Page-gated only (reference material, nobody's data), so no
// uid: /api/leader-tasks/examples/{id}. Bytes are immutable per id, so the
// browser cache does the rest.
export const ExamplePhoto = ({ id, T, className, ...rest }) => (
  <ProxyPhoto T={T} className={className} deps={[id]} {...rest}
    load={() => api.get(`/api/leader-tasks/examples/${id}`, { responseType: "blob" })} />
);

// A LATE proof's photo — filed after the task's own deadline, so it hangs off
// no LeaderTaskEntry and the register's media proxy cannot reach it. Addressed
// by (late proof, media) because the endpoint checks BOTH: a readable queue
// must not become a fetcher for any late-proof photo on the platform.
export const LateProofPhoto = ({ lateId, id, T, className, ...rest }) => (
  <ProxyPhoto T={T} className={className} deps={[lateId, id]} {...rest}
    load={() => api.get(`/api/leaders/late-proofs/${lateId}/photo/${id}`,
      { responseType: "blob" })} />
);

/** One photo from the triage queue's `photos[]`, whichever layer filed it. */
export const QueuePhoto = ({ photo, T, ...rest }) =>
  photo.kind === "bot"
    ? <BotPhoto id={photo.id} T={T} {...rest} />
    : <ReportPhoto src={photo.url} T={T} {...rest} />;
