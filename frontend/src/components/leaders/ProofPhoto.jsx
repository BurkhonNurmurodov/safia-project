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
  if (!url) return <SkeletonBlock className={`${className} w-full`} style={{ height: maxHeight }} />;
  return (
    <img src={url} alt="" loading="lazy"
      onClick={() => (onClick ? onClick(url) : window.open(href || url, "_blank"))}
      className={`${className} w-full rounded-lg border cursor-zoom-in`}
      style={{ maxHeight, objectFit: fit, borderColor: "var(--border)" }} />
  );
}

// A sheet (Fillout → Google Drive) proof photo. Zooming opens the ORIGINAL Drive
// link, which is the full-resolution copy — the proxied one is just what renders
// in the card.
export const ReportPhoto = ({ src, T, className, ...rest }) => (
  <ProxyPhoto T={T} className={className} href={src} deps={[src]} {...rest}
    load={() => api.get("/api/leaders/photo", { params: { url: src }, responseType: "blob" })} />
);

// A bot-submission proof photo, streamed out of the Telegram archive channel.
export const BotPhoto = ({ id, T, className, ...rest }) => (
  <ProxyPhoto T={T} className={className} deps={[id]} {...rest}
    load={() => api.get(`/api/leader-tasks/media/${id}`, { responseType: "blob" })} />
);

/** One photo from the triage queue's `photos[]`, whichever layer filed it. */
export const QueuePhoto = ({ photo, T, ...rest }) =>
  photo.kind === "bot"
    ? <BotPhoto id={photo.id} T={T} {...rest} />
    : <ReportPhoto src={photo.url} T={T} {...rest} />;
