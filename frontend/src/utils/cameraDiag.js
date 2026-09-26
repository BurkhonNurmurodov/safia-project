/**
 * utils/cameraDiag — why the proof camera failed, measured on the device that
 * failed.
 *
 * `/proof/camera` puts a leader on a failure screen when the camera cannot be
 * opened, or opens and sends no picture. The first report of that screen was a
 * leader's screenshot: it says what happened and nothing about why, and the why
 * exists only on that device. So the page keeps a flight recorder of every
 * camera event, and when it lands on a failure screen it runs a few bounded
 * probes and posts everything through the ONE client-failure door,
 * `POST /api/crash-report` with kind "camera". The admin's message is laid out
 * by backend/app/services/camera_report.py, which also says what each probe
 * tells apart.
 *
 * Three rules this module keeps:
 *  - It never becomes a failure of its own. Every await is bounded, every call
 *    is wrapped, and nothing here throws into the page.
 *  - It never holds the camera. The one probe that takes a second handle on the
 *    stream (a clone) hands the page its release, and the page calls it the
 *    moment a new open starts — a clone left running keeps the dead camera
 *    source alive underneath the leader's retry.
 *  - It never asks the leader anything. No getUserMedia is called here, so no
 *    «Allow camera?» sheet can come from a diagnostic.
 */
import api from "./api";
import { APP_VERSION } from "./version";

const TIMEOUT = Symbol("timeout");

/** `p`, or TIMEOUT once `ms` has passed. A rejection still rejects. */
function within(p, ms) {
  let timer;
  return Promise.race([
    Promise.resolve(p),
    new Promise((resolve) => { timer = setTimeout(() => resolve(TIMEOUT), ms); }),
  ]).finally(() => clearTimeout(timer));
}

/** Enough of a device id to tell two cameras apart in a message, and no more. */
export const shortId = (id) => (id ? String(id).slice(0, 8) : "");

/* ── the flight recorder ──────────────────────────────────────────────────── */

/** The last `limit` camera events, stamped in page time (ms since it opened).
 *  A repeat of the event just recorded is COUNTED, not appended: the watchdog
 *  retries every two seconds, and sixty identical rows would push out the ones
 *  that say how the failure started. */
export function createRecorder(limit = 60) {
  const rows = [];
  return {
    note(ev, detail) {
      try {
        const d = detail == null ? ""
          : typeof detail === "string" ? detail : JSON.stringify(detail);
        const text = d.length > 160 ? `${d.slice(0, 159)}…` : d;
        const last = rows[rows.length - 1];
        if (last && last[1] === ev && last[2] === text) {
          last[3] = (last[3] || 1) + 1;
          return;
        }
        rows.push([Math.round(performance.now()), String(ev), text]);
        if (rows.length > limit) rows.splice(0, rows.length - limit);
      } catch { /* a recorder must never be the failure */ }
    },
    list: () => rows.map((r) => r.slice()),
  };
}

/* ── snapshots ────────────────────────────────────────────────────────────── */

const span = (c) => (c && typeof c === "object" && (c.min != null || c.max != null)
  ? [c.min ?? null, c.max ?? null] : undefined);
const round1 = (n) => (typeof n === "number" ? Math.round(n * 10) / 10 : undefined);

/** What the stream says about itself: what it asked for, what it opened as,
 *  what the camera could have done, and whether Chrome still calls it alive. */
export function trackSnap(track) {
  if (!track) return null;
  const out = {
    label: track.label || "", state: track.readyState, muted: track.muted, enabled: track.enabled,
  };
  try {
    const s = track.getSettings?.() || {};
    out.settings = {
      w: s.width, h: s.height, fps: round1(s.frameRate), facing: s.facingMode,
      resize: s.resizeMode, zoom: s.zoom, id: shortId(s.deviceId),
    };
  } catch { /* not every WebView answers */ }
  try {
    const c = track.getCapabilities?.() || {};
    out.caps = {
      w: span(c.width), h: span(c.height), fps: span(c.frameRate), zoom: span(c.zoom),
      facing: c.facingMode, resize: c.resizeMode,
    };
  } catch { /* getCapabilities is newer than getSettings */ }
  try {
    out.asked = JSON.stringify(track.getConstraints?.() || {}, (k, v) => {
      if (k !== "deviceId" || !v) return v;
      if (typeof v !== "object") return shortId(v);
      const short = {};
      Object.keys(v).forEach((kk) => { short[kk] = shortId(v[kk]); });
      return short;
    });
  } catch { /* ditto */ }
  return out;
}

/** What the <video> element made of the stream. */
export function videoSnap(v, stream) {
  if (!v) return null;
  const out = {
    ready: v.readyState, paused: v.paused, w: v.videoWidth, h: v.videoHeight,
    t: Math.round((v.currentTime || 0) * 100) / 100,
    attached: !!stream && v.srcObject === stream,
    box: `${v.clientWidth}x${v.clientHeight}`,
  };
  try {
    const q = v.getVideoPlaybackQuality?.();
    if (q) out.frames = q.totalVideoFrames;
  } catch { /* optional */ }
  return out;
}

/** The device, its versions and the page's situation — the part of a report
 *  nobody could ask a leader for. Telegram for Android appends its own
 *  version, the maker and model, and a performance class to the WebView's
 *  user agent; that suffix is what names the tablet. */
export async function deviceEnv() {
  const ua = String(navigator.userAgent || "");
  const tgUa = ua.match(/Telegram-Android\/([\w.]+)\s*\(([^;)]*);\s*Android\s*([\w.]+)[^;)]*(?:;\s*SDK\s*(\d+))?(?:;\s*(\w+))?/);
  const env = {
    model: tgUa?.[2]?.trim() || (ua.match(/;\s*([^;()]+?)\s+Build\//) || [])[1] || "",
    android: (ua.match(/Android\s+([\d.]+)/) || [])[1] || tgUa?.[3] || "",
    webview: (ua.match(/Chrome\/([\d.]+)/) || [])[1] || "",
    telegram: tgUa?.[1] || "",
    perf: tgUa?.[5] || "",
    screen: `${window.screen?.width}x${window.screen?.height}@${Math.round((window.devicePixelRatio || 1) * 100) / 100}`,
    mem: navigator.deviceMemory,
    cores: navigator.hardwareConcurrency,
    online: navigator.onLine,
    vis: document.visibilityState,
    uptime: Math.round(performance.now()),
  };
  const tg = window.Telegram?.WebApp;
  if (tg) env.tg = { platform: tg.platform, api: tg.version, active: tg.isActive };
  try {
    const hi = await within(navigator.userAgentData?.getHighEntropyValues?.(["model", "platformVersion"]), 800);
    if (hi && hi !== TIMEOUT) { env.chModel = hi.model || ""; env.chPlatform = hi.platformVersion || ""; }
  } catch { /* client hints are optional */ }
  try {
    const p = await within(navigator.permissions?.query?.({ name: "camera" }), 800);
    if (p && p !== TIMEOUT) env.perm = p.state;
  } catch { /* "camera" is not a permission name everywhere */ }
  return env;
}

/** Every camera the device lists, and which one is this stream. */
export async function cameraList(openId) {
  try {
    const all = await within(navigator.mediaDevices?.enumerateDevices?.(), 1500);
    if (all === TIMEOUT) return { error: "timeout" };
    return (all || []).filter((d) => d.kind === "videoinput").slice(0, 8).map((d) => ({
      label: d.label || "", id: shortId(d.deviceId), open: !!openId && d.deviceId === openId,
    }));
  } catch (e) {
    return { error: e?.name || "error" };
  }
}

/** What the page can say about camera ACCESS without ever asking for it.
 *
 *  Neither `permissions.query` nor `enumerateDevices` raises the «Allow
 *  camera?» sheet, and between them they answer the one question an open that
 *  never returns cannot: has this page been granted the camera at all.
 *  Chromium hands a page with NO grant one unnamed videoinput per kind, so a
 *  list whose entries carry no label is the signature of a grant that never
 *  arrived — which is a different failure from a camera that will not open. */
export async function accessState() {
  const out = {};
  try {
    const p = await within(navigator.permissions?.query?.({ name: "camera" }), 1000);
    if (p && p !== TIMEOUT) out.perm = p.state;
  } catch { /* "camera" is not a permission name everywhere */ }
  try {
    const all = await within(navigator.mediaDevices?.enumerateDevices?.(), 1500);
    if (all === TIMEOUT) out.list = "timeout";
    else {
      const v = (all || []).filter((d) => d.kind === "videoinput");
      out.cams = v.length;
      out.named = v.filter((d) => d.label).length;
    }
  } catch (e) { out.list = e?.name || "error"; }
  return out;
}

/** The above as one line for the flight recorder. */
export function accessLine(a) {
  const s = [];
  if (a?.perm) s.push(`permission ${a.perm}`);
  if (a?.list) s.push(`device list ${a.list}`);
  else if (a?.cams != null) s.push(`${a.cams} cameras, ${a.named} named`);
  return s.join(" · ") || "nothing readable";
}

/** Say so whenever the camera permission itself changes state — the moment a
 *  leader taps «Allow», or the moment a grant is revoked under the page. The
 *  query is free of prompts; a WebView without it simply never calls back. */
export function watchPermission(onChange) {
  let p = null;
  const fire = () => { try { onChange(p?.state); } catch { /* never the failure */ } };
  (async () => {
    try {
      const q = await within(navigator.permissions?.query?.({ name: "camera" }), 2000);
      if (!q || q === TIMEOUT) return;
      p = q;
      p.addEventListener?.("change", fire);
    } catch { /* optional everywhere */ }
  })();
  return () => { try { p?.removeEventListener?.("change", fire); } catch { /* optional */ } };
}

/* ── probes ───────────────────────────────────────────────────────────────── */

/** One frame read straight off the stream, bypassing the <video> element.
 *
 *  It tells a camera that sends nothing apart from a page that does not show
 *  what the camera sends. The processor reads from a CLONE, so the page's own
 *  track is untouched, and `hold` receives the clone's release so the page can
 *  drop it the moment a retry starts. */
export async function readTrackFrame(track, ms, hold) {
  if (!track) return { got: null, why: "no stream" };
  if (track.readyState !== "live") return { got: null, why: `stream ${track.readyState}` };
  const t0 = performance.now();
  const after = () => Math.round(performance.now() - t0);
  const Processor = window.MediaStreamTrackProcessor;
  if (typeof Processor === "function") {
    let clone = null;
    let reader = null;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      try { reader?.cancel?.().catch?.(() => {}); } catch { /* already gone */ }
      try { clone?.stop(); } catch { /* already gone */ }
    };
    hold?.(release);
    try {
      clone = track.clone();
      reader = new Processor({ track: clone }).readable.getReader();
      const r = await within(reader.read(), ms);
      if (r === TIMEOUT) return { got: false, via: "processor", waited: ms };
      const frame = r?.value;
      if (!frame) return { got: false, via: "processor", why: released ? "retry pressed" : "stream ended" };
      const out = { got: true, via: "processor", w: frame.displayWidth, h: frame.displayHeight, after: after() };
      try { frame.close(); } catch { /* closed or collected */ }
      return out;
    } catch (e) {
      return { got: false, via: "processor", error: e?.name || String(e) };
    } finally {
      release();
      hold?.(null);
    }
  }
  const Capture = window.ImageCapture;
  if (typeof Capture === "function") {
    try {
      const bmp = await within(new Capture(track).grabFrame(), ms);
      if (bmp === TIMEOUT) return { got: false, via: "grabFrame", waited: ms };
      const out = { got: true, via: "grabFrame", w: bmp?.width, h: bmp?.height, after: after() };
      try { bmp?.close?.(); } catch { /* optional */ }
      return out;
    } catch (e) {
      return { got: false, via: "grabFrame", error: e?.name || String(e) };
    }
  }
  return { got: null, why: "this WebView cannot read frames directly" };
}

/** The same stream re-asked for 640×480 — through applyConstraints, not a new
 *  getUserMedia, so no «Allow camera?» sheet. Chrome re-configures the camera
 *  for it, which is what tells a device that cannot deliver the size the page
 *  asks for apart from a camera that sends nothing at any size.
 *
 *  It only ever runs on a stream the page has already given up on, and it
 *  changes nothing the leader can use: their retry replaces this stream
 *  whatever the probe found. */
export async function probeSmaller(track, ms, hold) {
  if (!track || track.readyState !== "live" || typeof track.applyConstraints !== "function") {
    return { tried: false, why: !track ? "no stream" : `stream ${track.readyState}` };
  }
  const size = () => {
    try {
      const s = track.getSettings();
      return [s.width ?? null, s.height ?? null];
    } catch { return null; }
  };
  const from = size();
  try {
    const r = await within(track.applyConstraints({ width: { ideal: 640 }, height: { ideal: 480 } }), 5000);
    if (r === TIMEOUT) return { tried: true, from, applied: "timed out" };
  } catch (e) {
    return { tried: true, from, applied: e?.name || "failed" };
  }
  const frames = await readTrackFrame(track, ms, hold);
  return { tried: true, from, to: size(), applied: "ok", ...frames };
}

/* ── the other camera pages of this Telegram ──────────────────────────────── */

const CHANNEL = "safia.proof.camera";
const HOLDERS_KEY = "proof.camera.holders";
const HOLDER_TTL_MS = 12 * 3600 * 1000;

/** Answer the other camera pages of this Telegram when they ask who is there.
 *
 *  Telegram can MINIMIZE a mini app instead of closing it, and a minimized
 *  camera page is still a page with a camera open. Every camera page answers on
 *  one BroadcastChannel, so a failing page can ask whether a sibling is the
 *  reason. Returns the closer. */
export function answerPresence(selfId, describe, onNeed) {
  let ch;
  try { ch = new BroadcastChannel(CHANNEL); } catch { return () => {}; }
  ch.onmessage = (e) => {
    const m = e?.data;
    if (!m || m.from === selfId) return;
    // A sibling page is about to open the camera. Only one page on this device
    // can have it, so whoever hears this and is not the page in front of the
    // leader is asked to let go — see `announceNeed`.
    if (m.type === "need") { try { onNeed?.(m); } catch { /* never the caller's failure */ } return; }
    if (m.type !== "who") return;
    try { ch.postMessage({ type: "here", to: m.from, from: selfId, ...describe() }); } catch { /* closed */ }
  };
  return () => { try { ch.close(); } catch { /* closed */ } };
}

/** Tell the other camera pages of this Telegram that the camera is wanted HERE.
 *
 *  Android hands the camera to one client at a time and Telegram MINIMIZES a
 *  mini app rather than closing it, so a leader on their third task of the
 *  shift is queued behind two abandoned viewfinders — the 2026-09-18 report
 *  waited 17.4 s for a `getUserMedia` while two sibling pages held live
 *  cameras from the background. Waiting for Android to arbitrate is what that
 *  17.4 s was; asking is instant, and a minimized page has no claim on the
 *  camera anyway. Best-effort by construction: a sibling too frozen to hear
 *  this is exactly what the holder ledger below exists to report. */
export function announceNeed(selfId) {
  try {
    const ch = new BroadcastChannel(CHANNEL);
    ch.postMessage({ type: "need", from: selfId });
    setTimeout(() => { try { ch.close(); } catch { /* closed */ } }, 1000);
  } catch { /* unsupported */ }
}

/** Ask every other camera page of this Telegram to describe itself. */
export async function askOthers(selfId, ms = 1200) {
  let ch;
  try { ch = new BroadcastChannel(CHANNEL); } catch { return { why: "unsupported" }; }
  const replies = [];
  ch.onmessage = (e) => {
    const m = e?.data;
    if (m?.type === "here" && m.to === selfId && m.from !== selfId && replies.length < 6) replies.push(m);
  };
  try { ch.postMessage({ type: "who", from: selfId }); } catch { /* closed */ }
  await new Promise((resolve) => { setTimeout(resolve, ms); });
  try { ch.close(); } catch { /* closed */ }
  return replies;
}

function readHolders() {
  try {
    const v = JSON.parse(localStorage.getItem(HOLDERS_KEY) || "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch { return {}; }
}

/** Write this page's line in the device's camera ledger.
 *
 *  A minimized page's timers can be frozen, and a frozen page cannot answer the
 *  channel above — but the last line it wrote here still says when it took the
 *  camera and whether it let go. `released` keeps the FIRST moment the camera
 *  was seen down; a beat with a live camera clears it. */
export function beatHolder(selfId, rec) {
  try {
    const all = readHolders();
    const now = Date.now();
    const prev = all[selfId] || {};
    const next = { ...prev, ...rec, beat: now };
    next.released = rec.live ? 0 : (prev.released || now);
    all[selfId] = next;
    const out = {};
    Object.keys(all)
      .filter((k) => now - (all[k]?.beat || 0) < HOLDER_TTL_MS)
      .sort((a, b) => (all[b].beat || 0) - (all[a].beat || 0))
      .slice(0, 8)
      .forEach((k) => { out[k] = all[k]; });
    localStorage.setItem(HOLDERS_KEY, JSON.stringify(out));
  } catch { /* storage can be full or blocked */ }
}

/** Every OTHER camera page this device remembers, newest first. */
export function otherHolders(selfId) {
  const all = readHolders();
  return Object.keys(all)
    .filter((k) => k !== selfId)
    .map((k) => ({ ...all[k] }))
    .sort((a, b) => (b.beat || 0) - (a.beat || 0))
    .slice(0, 5);
}

/* ── delivery ─────────────────────────────────────────────────────────────── */

/** Post the report through the one client-failure door. Resolves to the
 *  server's answer, or null — a report that cannot be sent is not a second
 *  failure to put in front of the leader. */
export function sendCameraReport(camera) {
  try {
    return api.post("/api/crash-report", {
      kind: "camera",
      message: `camera ${camera?.screen || "?"} · ${camera?.trigger || "?"}`.slice(0, 500),
      url: String(window.location.pathname + window.location.search).slice(0, 500),
      version: APP_VERSION,
      ua: String(navigator.userAgent || "").slice(0, 500),
      camera,
    }).then((r) => r?.data || null).catch(() => null);
  } catch {
    return Promise.resolve(null);
  }
}
