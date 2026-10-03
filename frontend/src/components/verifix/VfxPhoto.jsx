import { useEffect, useRef, useState } from "react";
import api from "../../utils/api";
import Lightbox from "../ui/Lightbox";
import { useLang } from "../../context/LangContext";
import { VFX, initials } from "./vfx";

/* A photo Verifix holds — a person's own photo or the photo taken at a mark.
 *
 * Fetched as a BLOB through /api/verifix-test/photo (the session token rides
 * on the request; the server resizes it and serves only hashes it handed out
 * as photos), and only once the avatar scrolls into view: a table page holds
 * fifty faces and Verifix should not be asked for all of them at once. At most
 * MAX_ACTIVE downloads run together; the object URLs are kept for the session
 * (bounded), so paging back and forth never refetches a face.
 *
 * No hash, or a photo that will not load, draws the person's initials — a
 * missing photo is a fact about the person, not a broken image. `zoom` opens
 * the large copy in the shared Lightbox. */

const MAX_ACTIVE = 4;
const KEEP = 600;
const urls = new Map();          // `${sha}:${size}` → object URL | "" (failed)
const pending = new Map();       // one download per photo, however many avatars ask
const waiting = [];
let active = 0;

function pump() {
  while (active < MAX_ACTIVE && waiting.length) {
    const job = waiting.shift();
    if (job.cancelled) continue;
    job.started = true;
    active += 1;
    api.get(`${VFX}/photo/${job.sha}`, { params: { size: job.size }, responseType: "blob" })
      .then((r) => {
        const url = URL.createObjectURL(r.data);
        urls.set(job.key, url);
        if (urls.size > KEEP) {
          const [oldKey, oldUrl] = urls.entries().next().value;
          urls.delete(oldKey);
          if (oldUrl) URL.revokeObjectURL(oldUrl);
        }
        job.resolve(url);
      })
      .catch(() => { urls.set(job.key, ""); job.resolve(""); })
      .finally(() => { active -= 1; pending.delete(job.key); pump(); });
  }
}

function load(sha, size) {
  const key = `${sha}:${size}`;
  if (urls.has(key)) return { promise: Promise.resolve(urls.get(key)), cancel: () => {} };
  let job = pending.get(key);
  if (!job) {
    job = { sha, size, key, refs: 0, cancelled: false, started: false };
    job.promise = new Promise((resolve) => { job.resolve = resolve; });
    pending.set(key, job);
    waiting.push(job);
    pump();
  }
  job.refs += 1;
  let done = false;
  // A page turned before its faces loaded drops the ones still queued.
  const cancel = () => {
    if (done) return;
    done = true;
    job.refs -= 1;
    if (job.refs <= 0 && !job.started) { job.cancelled = true; pending.delete(key); }
  };
  return { promise: job.promise, cancel };
}

function useVfxPhoto(sha, size, enabled = true) {
  const key = sha ? `${sha}:${size}` : "";
  const [loaded, setLoaded] = useState({});
  useEffect(() => {
    if (!sha || !enabled || urls.has(key)) return undefined;
    let alive = true;
    const job = load(sha, size);
    job.promise.then((u) => { if (alive) setLoaded((m) => ({ ...m, [key]: u })); });
    return () => { alive = false; job.cancel(); };
  }, [sha, size, enabled, key]);
  if (!key) return null;
  if (urls.has(key)) return urls.get(key);
  return loaded[key] ?? null;          // null = loading, "" = failed, string = ready
}

export default function VfxPhoto({ sha, name, px = 32, square = false, zoom = false, className = "", title }) {
  const { t } = useLang();
  const ref = useRef(null);
  const [seen, setSeen] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!sha || seen) return undefined;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") { setSeen(true); return undefined; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); }
    }, { rootMargin: "120px" });
    io.observe(el);
    return () => io.disconnect();
  }, [sha, seen]);
  const small = useVfxPhoto(sha, 96, seen);
  const big = useVfxPhoto(sha, 960, open);
  const radius = square ? "rounded-lg" : "rounded-full";
  const box = { width: px, height: px, minWidth: px };
  const label = title || name || "";
  const fallback = (
    <span className={`${radius} grid place-items-center font-semibold select-none`}
      style={{ ...box, background: "var(--bg-inner)", color: "var(--text-3)", fontSize: Math.max(10, Math.round(px * 0.36)),
        border: "1px solid var(--border)" }}>
      {initials(name)}
    </span>
  );
  let inner;
  if (!sha || small === "") inner = fallback;
  else if (!small) inner = <span className={`${radius} animate-pulse block`} style={{ ...box, background: "var(--bg-inner)" }} />;
  else inner = <img src={small} alt={label} className={`${radius} object-cover block`} style={box} draggable={false} />;

  const canZoom = zoom && sha && small;
  return (
    <span ref={ref} className={`inline-flex flex-shrink-0 ${className}`} title={sha && small === "" ? t("vfx.photo.failed") : label}>
      {canZoom ? (
        <button type="button" onClick={(e) => { e.stopPropagation(); setOpen(true); }}
          aria-label={fill2(t("vfx.photo.open"), label)}
          className={`${radius} focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand)]`}>
          {inner}
        </button>
      ) : inner}
      {open && <Lightbox src={big || small} alt={label} onClose={() => setOpen(false)} />}
    </span>
  );
}

const fill2 = (s, name) => String(s).replace("{name}", name || "");
