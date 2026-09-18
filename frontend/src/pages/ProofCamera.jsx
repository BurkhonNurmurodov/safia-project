import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight, Camera, Check, Clock, ImageOff, Info, Loader2, Lock, RefreshCw,
  RotateCcw, SwitchCamera, Trash2, WifiOff, X,
} from "lucide-react";
import api from "../utils/api";
import Button from "../components/ui/Button";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import ErrorScreen from "../components/ui/ErrorScreen";
import { useToast } from "../components/ui/Toast";
import { useLang } from "../context/LangContext";
import { enqueue, flush, newKey, pending } from "../utils/proofQueue";
import {
  announceNeed, answerPresence, askOthers, beatHolder, cameraList, createRecorder, deviceEnv, otherHolders,
  probeSmaller, readTrackFrame, sendCameraReport, shortId, trackSnap, videoSnap,
} from "../utils/cameraDiag";

/**
 * `/proof/camera` — where a leader SHOOTS a checklist proof.
 *
 * Opened from the bot's «📷 Kamerani ochish» button on a task configured
 * `proof_kind = "camera"`. It exists because a photo the leader hands us can
 * carry any timestamp they like: here the picture is taken inside the platform
 * and stamped by the SERVER, so the time on it is not something the phone gets
 * to author.
 *
 * The design rule the whole screen is built on: at any instant there is exactly
 * ONE thing to do, and it is the biggest thing on screen. Viewfinder → the
 * shutter. Review → Saqlash. Full roll → Tayyor. Nothing else competes, and
 * nothing destructive is ever the large button.
 *
 * Three states, and they are the only ones:
 *   live    the viewfinder, with the live stamp exactly where the burnt one lands
 *   review  the frozen frame — the leader sees precisely what will be stored
 *   slot    one already-taken shot, with retake (and delete, for extras only)
 *
 * The clock never comes from the phone. `/api/leader-proof/session` hands over
 * the server's time once; everything after that is `performance.now()` on top of
 * it, which no clock change can move. That is also what makes offline shooting
 * honest — see utils/proofQueue.
 */

const CLOCK_RESYNC_MS = 5 * 60 * 1000;
// How often a queued shot is retried while the page is open. Short enough that
// a leader who walked back into coverage sees the spinner clear before they
// have finished reading the roll, long enough that a phone on a dead cell keeps
// its battery.
const RETRY_EVERY_MS = 20 * 1000;
// An attempt to OPEN the camera has a deadline. Inside Telegram's WebView
// `getUserMedia` can simply never settle — the «Allow camera?» sheet belongs to
// the WebView, and a leader who backgrounds the app or dismisses it while the
// sheet is up leaves the promise hanging for the life of the page. The
// one-at-a-time guard below was then stuck shut forever: the mount,
// `visibilitychange`, the track's own `ended` and even the Retry button all
// returned at it, and the leader was left looking at a black rectangle that
// said nothing and could not be recovered from. After this the guard is
// released and the failure is stated instead.
// Raised from 20 s on 2026-09-18. It measures ONE thing — how long Android
// takes to answer `getUserMedia` — and on a device where a sibling page holds
// the camera that answer is simply slow: the report that day was answered OK
// after 17.4 s, i.e. inside a 20 s budget only by three seconds. A ceiling set
// near the honest worst case turns a slow open into a failure screen, a
// support message and a leader who backs out and re-opens the task — which
// leaves ANOTHER page holding the camera and makes the next open slower still.
// The ceiling is now far past any open that has ever succeeded, so what it
// catches is a camera that never answers at all.
const OPEN_TIMEOUT_MS = 45 * 1000;
// …but silence is not something to leave a leader staring at. Past this the
// viewfinder SAYS it is still opening and why, so waiting is a thing being
// done rather than a thing that has broken.
const OPEN_SLOW_MS = 9 * 1000;
// «The camera is busy» is a fact about another app or another page, not about
// this camera, and the fix for it is to ask again a moment later. These are the
// names Chrome gives it; `NotAllowedError` is deliberately not among them,
// because a refusal is the leader's answer and re-asking is a second sheet.
const BUSY_ERRORS = new Set([
  "NotReadableError", "AbortError", "TrackStartError", "SourceUnavailableError",
]);
const BUSY_RETRIES = 2;
const BUSY_RETRY_MS = 1500;
// How long an open left waiting in the background gets, once the page is back
// on screen, to finish before it is replaced. Its «Allow camera?» sheet may only
// now be in front of the leader, and a second request on top of a sheet still
// up is a second sheet — or none at all.
const RETURN_GRACE_MS = 8 * 1000;
// A video track reads `live`, unpaused and attached, while the WebView delivers
// no frames at all — the state Android leaves behind when another app takes the
// camera, and the one thing that looks pixel-for-pixel like a working
// viewfinder aimed at something black. `videoWidth` stays 0 and `currentTime`
// stops advancing; that is the only way to tell the two apart, so it is
// measured rather than assumed.
const FRAME_STALL_MS = 6 * 1000;
// How often the viewfinder is checked while it is on screen.
const CAM_WATCH_MS = 2 * 1000;
// How long a page that has gone off screen keeps the camera before letting it
// go. A leader who glances away and comes straight back pays nothing; a page
// left behind — which is every proof page Telegram has minimized rather than
// closed — stops being the reason the NEXT task's camera cannot open. The grace
// is what keeps the «Allow camera?» sheet down to one per open, since coming
// back to a released camera costs another one.
const HIDDEN_RELEASE_MS = 15 * 1000;
// How long an open waits, having asked the other pages of this Telegram to let
// go, before asking Android for the camera anyway. Short: this is a message to
// a page in the same browser, not a negotiation.
const NEED_RELEASE_MS = 350;
// A lens correction that the WebView never answers must not hold the open guard
// shut — the guard is what stands the frame watchdog down.
const LENS_FIX_MS = 1500;
// A shot's own quality. 0.92 keeps small print (a gauge, a label, a serial)
// legible for the reviewer; the server re-encodes to its own long edge anyway.
const JPEG_Q = 0.92;
// The chosen lens is remembered per facing so the second shot costs ONE
// «Allow camera?» sheet instead of two. The key is VERSIONED: a phone that
// pinned its ultra-wide under an older rule answers with that lens forever,
// and a value already sitting in somebody's localStorage cannot be reached any
// other way. Bump it whenever the rule below changes its mind.
const LENS_KEY = "proof.camera.lens3";
// The shape asked of every camera, in one place: it travels with the zoom
// correction too, because applyConstraints REPLACES the set a track was opened
// with and a lens fix must not quietly cost the resolution.
const VIDEO_SIZE = { width: { ideal: 1920 }, height: { ideal: 1080 } };

const FRONT_LENS = /front|face|user|selfie|фронт|перед|\boldi?\b|ön/i;
// Lens words to avoid when a phone offers several rear cameras. An ultra-wide
// shoots the whole room and bends straight lines, a macro cannot focus past
// 10 cm, a telephoto cannot step back — all three make a workplace photo look
// like evidence of a different place. The MAIN camera is the one none of these
// words describe.
const AVOID_LENS = /(ultra|wide.?angle|tele|zoom|macro|depth|truedepth|infrared|monochrome|\bir\b|широк|макро|теле|глубин|keng)/i;
// A FUSED rear camera — one device standing for two or three sensors. It is a
// real camera, so it is never disqualified; it is only ever second choice,
// because WHICH member it opens on is the phone's decision and on iOS that
// decision is regularly the 0.5x.
const FUSED_LENS = /(dual|triple|quad|virtual|multi)/i;
// iOS names the plain 1x sensor «Back Camera»; Android's main one is index 0.
const MAIN_LENS = /(back|rear|main|camera2 0|задн|основн|orqa|asosiy|arka)/i;

/** How much a label looks like the camera a person means by «the camera». */
function lensScore(label) {
  const l = label || "";
  return (MAIN_LENS.test(l) ? 6 : 0)
    - (FUSED_LENS.test(l) ? 3 : 0)
    - (AVOID_LENS.test(l) ? 10 : 0);
}

/** Pull a fused rear camera back onto its 1x lens.
 *
 *  0.5x is not a separate camera on every phone. Where the rear device is ONE
 *  fused camera, Chrome reports a zoom range that starts BELOW 1 — 0.5 is the
 *  ultra-wide member, 1 is the main sensor — and some builds open it at the
 *  bottom of that range, on the very device the labels just called the main
 *  one. No deviceId can correct that; only the zoom can. Moving it is a
 *  constraint on a stream we already hold, not a second getUserMedia, so it
 *  costs no «Allow camera?» sheet.
 *
 *  The range is the guard: a camera counting zoom in percent (min 100) or
 *  carrying no ultra-wide (min 1) never enters the branch, and an iPhone —
 *  which reports no zoom at all — falls straight through to its label-picked
 *  lens. */
async function useMainLens(track) {
  try {
    const z = track?.getCapabilities?.().zoom;
    if (!z || !(z.min < 1) || !(z.max >= 1)) return;
    if (track.getSettings?.().zoom === 1) return;
    await Promise.race([
      track.applyConstraints({ ...VIDEO_SIZE, zoom: 1 }),
      new Promise((resolve) => { setTimeout(resolve, LENS_FIX_MS); }),
    ]);
  } catch { /* a lens that will not move is still a lens */ }
}

const tgApp = () => window.Telegram?.WebApp;

/* ── the stamp, drawn live exactly as the server burns it ─────────────────── */

function pad2(n) { return String(n).padStart(2, "0"); }

/** `Safia · DD.MM.YYYY  HH:MM:SS` in Tashkent time — the ONE spelling, and it
 *  must stay identical to services/leader_proof.stamp_text, because this is the
 *  preview of a mark the leader is about to be judged by. */
function stampText(ms) {
  const d = new Date(ms + 5 * 3600 * 1000); // fixed +05:00, no DST in Tashkent
  return `Safia · ${pad2(d.getUTCDate())}.${pad2(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`
    + `  ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
}

/** Minutes-since-midnight in Tashkent, for the window comparison the hint makes. */
function localMinutes(ms) {
  const d = new Date(ms + 5 * 3600 * 1000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function hhmmToMin(s) {
  const [h, m] = String(s || "").split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
}

function inWindow(ms, win) {
  const lo = hhmmToMin(win?.[0]);
  const hi = hhmmToMin(win?.[1]);
  if (lo == null || hi == null) return true;
  const now = localMinutes(ms);
  return hi <= lo ? now >= lo || now <= hi : now >= lo && now <= hi;
}

// The stamp's geometry, as shares of the picture's SHORT edge — the twin of
// _STAMP_H / _STAMP_PAD in services/leader_proof.py, and it has to stay the
// twin. Short edge, not height: a phone shoots portrait, so a mark sized off
// the height came out half again too big and ran off the right of the photo.
const STAMP_H = 0.036;
const STAMP_PAD = 0.028;

/** The burnt-in mark, drawn over the picture box in the same proportions the
 *  server burns it into the file — so this is the mark, not an impression of
 *  it. It rides on the PICTURE box, never on the screen area around it: those
 *  two are only the same thing when the photo happens to fill the phone.
 *
 *  No plate behind it, matching the file: the stamp states the time, it does
 *  not black out the corner of the evidence. What keeps it readable over a
 *  bright wall or a lit panel is the dark halo around the glyphs — the DOM
 *  twin of the outline Pillow strokes into the JPEG. */
function StampMark({ text, boxW, boxH }) {
  const base = Math.min(boxW || 0, boxH || 0);
  const size = Math.max(11, Math.round(base * STAMP_H));
  const pad = Math.max(4, Math.round(base * STAMP_PAD));
  return (
    <div
      className="pointer-events-none absolute font-bold tabular-nums"
      style={{
        // No padding, so the text sits the same distance off the corner as the
        // burnt one: the server measures that gap to the GLYPHS.
        left: pad, bottom: pad,
        maxWidth: `calc(100% - ${pad * 2}px)`,
        fontSize: size, lineHeight: 1.15,
        color: "#fff",
        background: "transparent",
        textShadow: [
          "0 0 2px rgba(0,0,0,0.95)", "0 0 4px rgba(0,0,0,0.9)",
          "0 0 8px rgba(0,0,0,0.75)", "0 1px 2px rgba(0,0,0,0.95)",
        ].join(", "),
        letterSpacing: "0.01em",
        whiteSpace: "nowrap",
        // The viewfinder is a hardware-composited layer in Telegram's WebView.
        // An overlay with no layer of its own can end up beneath it, and a
        // stamp the leader cannot see is a stamp they will not believe in.
        zIndex: 5, transform: "translateZ(0)",
      }}
    >
      {text}
    </div>
  );
}

/** The box a picture of aspect `ar` occupies inside `w × h`, contained.
 *
 *  THE geometry of this page. The viewfinder used to be a full-bleed element
 *  sized in percentages inside an auto-height grid row: the percentage
 *  collapsed to the video's own intrinsic height, the box outgrew the visible
 *  area, and the leader composed inside a vertical SLICE of the frame that was
 *  actually being stored — with the stamp pushed below the clip, out of sight.
 *  A box measured here in pixels cannot do that: what is inside it is the
 *  photo, what is outside it never was. */
function fitBox(w, h, ar) {
  if (!w || !h || !ar) return { w: 0, h: 0 };
  const byWidth = w / ar;
  return byWidth <= h
    ? { w: Math.round(w), h: Math.round(byWidth) }
    : { w: Math.round(h * ar), h: Math.round(h) };
}

/**
 * One stored shot, fetched as a BLOB.
 *
 * Not a bare `<img src="/api/…">`: every request on this platform carries either
 * the Telegram initData header or the web JWT, and an `<img>` sends neither — so
 * the tag would render a broken thumbnail on a page whose whole job is showing
 * the leader what they already took. The object URL is revoked on unmount; the
 * endpoint sets a long cache, so a re-mount is free.
 */
function ShotImg({ id, className, alt = "", onAspect, late = false }) {
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let obj = "";
    let alive = true;
    setFailed(false);
    setUrl("");
    // Same door in, same door out: a draft shot lives in its own table and is
    // streamed by its own endpoint, so a thumbnail asking the ordinary one
    // would 404 on every photo the leader had just taken.
    api.get(late ? `/api/leader-proof/late-photo/${id}`
                 : `/api/leader-proof/photo/${id}`, { responseType: "blob" })
      .then((r) => {
        if (!alive) return;
        obj = URL.createObjectURL(r.data);
        setUrl(obj);
      })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; if (obj) URL.revokeObjectURL(obj); };
  }, [id, late]);
  if (failed) {
    return (
      <div className="w-full h-full grid place-items-center"
        style={{ background: "rgba(255,255,255,0.06)" }}>
        <ImageOff size={16} color="rgba(255,255,255,0.5)" />
      </div>
    );
  }
  if (!url) {
    return (
      <div className="w-full h-full grid place-items-center"
        style={{ background: "rgba(255,255,255,0.06)" }}>
        <Loader2 size={14} className="animate-spin" color="rgba(255,255,255,0.5)" />
      </div>
    );
  }
  return (
    <img src={url} alt={alt} className={className}
      onLoad={(e) => {
        const el = e.currentTarget;
        if (onAspect && el.naturalWidth && el.naturalHeight) {
          onAspect(el.naturalWidth / el.naturalHeight);
        }
      }} />
  );
}


/* ── the roll ─────────────────────────────────────────────────────────────── */

/**
 * Numbered slots, required ones first. A filled slot shows its thumbnail, an
 * empty required slot a dashed outline with its number, a queued one the upload
 * mark. Required and extra are visually distinct, because only extras can be
 * deleted and the strip is where that becomes obvious.
 */
function Roll({ photos, queued, need, cap, active, onPick, onCancelRetake, onAdd, t,
                late = false }) {
  // Queued shots hold a slot of their own — a retake keeps the slot it names,
  // an append takes the next free one. Without this a leader who shot three
  // photos with no signal would look at a roll showing none of them, which is
  // the exact moment they would re-shoot everything.
  const held = new Set(photos.map((p) => p.slot));
  const waiting = new Map();
  let next = 0;
  for (const q of queued) {
    let at = q.slot;
    if (at == null) {
      while (held.has(next) || waiting.has(next)) next += 1;
      at = next;
    }
    if (!waiting.has(at)) waiting.set(at, q);
  }
  const last = Math.max(
    need,
    ...photos.map((p) => p.slot + 1),
    ...[...waiting.keys()].map((k) => k + 1),
  );
  const slots = [];
  for (let i = 0; i < last; i += 1) slots.push(photos.find((p) => p.slot === i) || null);
  const extras = photos.filter((p) => p.slot >= need);
  const canAdd = photos.length + queued.length < cap;
  return (
    <div className="flex items-center gap-2 overflow-x-auto px-3 py-2"
      style={{ scrollbarWidth: "none" }}>
      {slots.map((p, i) => {
        // The slot under retake shows NO thumbnail. The old photo is still
        // stored — a required slot is replaced, never emptied — but on screen
        // it is the shot about to be taken that belongs here, and a green
        // "done" tick beside the live viewfinder reads as the retake having
        // already happened. It waits like an empty slot, in brand colour, and
        // tapping it puts the old photo back.
        const retaking = !!p && active === i;
        const isQueued = !p && waiting.has(i);
        return (
          <button
            key={i}
            type="button"
            onClick={() => (retaking ? onCancelRetake() : p ? onPick(p) : null)}
            disabled={!p}
            aria-label={`${retaking ? t("proof.cancelRetake") : t("proof.slot")} ${i + 1}`}
            className="relative shrink-0 rounded-lg overflow-hidden grid place-items-center transition-colors"
            style={{
              width: 52, height: 52,
              border: retaking ? "2px dashed var(--brand)"
                : p ? "2px solid #22c55e"
                : isQueued ? "2px solid #eab308"
                : `2px dashed ${active === i ? "var(--brand)" : "rgba(255,255,255,0.32)"}`,
              background: retaking ? "rgba(200,151,63,0.16)" : "rgba(255,255,255,0.06)",
            }}
          >
            {retaking ? (
              <>
                <span className="text-sm font-bold" style={{ color: "var(--brand)" }}>
                  {i + 1}
                </span>
                <span className="absolute right-0.5 bottom-0.5 rounded-full p-0.5"
                  style={{ background: "var(--brand)" }}>
                  <RotateCcw size={9} color="#1a1206" strokeWidth={3} />
                </span>
              </>
            ) : p ? (
              <>
                <ShotImg id={p.id} late={late} className="w-full h-full object-cover" />
                <span className="absolute right-0.5 bottom-0.5 rounded-full p-0.5"
                  style={{ background: "#22c55e" }}>
                  <Check size={9} color="#06210f" strokeWidth={4} />
                </span>
              </>
            ) : isQueued ? (
              <Loader2 size={18} color="#eab308" className="animate-spin" />
            ) : (
              <span className="text-sm font-bold" style={{ color: "rgba(255,255,255,0.55)" }}>
                {i + 1}
              </span>
            )}
          </button>
        );
      })}
      {extras.length > 0 || canAdd ? (
        <button
          type="button"
          onClick={onAdd}
          disabled={!canAdd}
          aria-label={t("proof.addExtra")}
          className="shrink-0 rounded-lg grid place-items-center disabled:opacity-35"
          style={{
            width: 52, height: 52,
            border: "2px dashed rgba(255,255,255,0.32)",
            background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.7)",
          }}
        >
          +
        </button>
      ) : null}
    </div>
  );
}

/* ── the page ─────────────────────────────────────────────────────────────── */

export default function ProofCamera() {
  const { t } = useLang();
  const toast = useToast({ position: "bottom" });
  // `t` answers with the KEY when a string is missing, which on a server-detail
  // key ("day_closed") would put a raw identifier in front of a leader. `tf`
  // makes the miss fall through to a sentence somebody wrote.
  const tf = useCallback((key, fallback) => {
    const got = t(key);
    return got === key ? fallback : got;
  }, [t]);

  const params = new URLSearchParams(window.location.search);
  const leaderId = Number(params.get("leader")) || null;
  // WHICH cell's checklist these shots belong to, on a unit that files one per
  // cell. Absent on every other unit, and the server re-checks it against the
  // cells this leader actually owns — the parameter is typeable.
  const cellId = Number(params.get("cell")) || null;
  const [taskId, setTaskId] = useState(Number(params.get("task")) || null);
  // `?late=1` is a REQUEST, never the authority. The parameter is typeable, so
  // the server decides whether a late filing is actually open for this task and
  // answers `mode: "late"`; the page reads that and nothing else. A page that
  // could talk itself into late mode would send shots to the draft roll for a
  // task the leader could still file normally, costing them the point.
  const lateAsked = params.get("late") === "1";

  const videoRef = useRef(null);
  const frameRef = useRef(null);
  const streamRef = useRef(null);
  const offsetRef = useRef(null);          // serverMs − performance.now()

  // The camera's flight recorder, and what a failure report needs to know
  // about how the failure came about — utils/cameraDiag. Refs, not state:
  // nothing here is drawn, and the page re-renders four times a second.
  const recRef = useRef(null);
  if (!recRef.current) recRef.current = createRecorder();
  const note = useCallback((ev, detail) => recRef.current.note(ev, detail), []);
  const pageIdRef = useRef(Math.random().toString(36).slice(2, 10));
  // Which check put the failure screen up, and what it saw when it did.
  const failRef = useRef({ kind: null, error: null, stall: null });
  const opensRef = useRef({ total: 0, hidden: 0, lastMs: null, openedAt: 0, remembered: false });
  // The report's hold on a clone of the stream. A new open releases it first.
  const probeHoldRef = useRef(null);

  const [mode, setMode] = useState("live");   // live | review | slot
  const [shot, setShot] = useState(null);     // { url, blob, ms, ar }
  const [viewing, setViewing] = useState(null);
  const [retakeSlot, setRetakeSlot] = useState(null);
  const [camErr, setCamErr] = useState(null);
  const [camBusy, setCamBusy] = useState(false);   // opening: black, but not broken
  const [camSlow, setCamSlow] = useState(false);  // opening, and taking long enough to say so
  const [reported, setReported] = useState(false); // the server has this failure's report
  const [facing, setFacing] = useState("environment");
  const [devices, setDevices] = useState([]);
  const [saving, setSaving] = useState(false);
  const [queued, setQueued] = useState([]);
  const [online, setOnline] = useState(navigator.onLine);
  const [clock, setClock] = useState(Date.now());
  const [frame, setFrame] = useState({ w: 0, h: 0 });   // the area on screen
  const [camAR, setCamAR] = useState(0);                // the live stream's shape
  const [viewAR, setViewAR] = useState(0);              // a stored shot's shape
  const [confirm, setConfirm] = useState(null);
  const [showRule, setShowRule] = useState(false);

  /* ── session: the task's rule, the roll, and the server's clock ─────────── */
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["proof-session", leaderId, taskId, lateAsked, cellId],
    queryFn: () => api
      .get("/api/leader-proof/session",
        { params: { leader: leaderId, task: taskId, ...(cellId ? { cell: cellId } : {}),
                    ...(lateAsked ? { late: 1 } : {}) } })
      .then((r) => r.data),
    enabled: !!taskId,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const task = data?.task;
  // The server's verdict, not the URL's. Everything downstream — which endpoint
  // a shot goes to, which one a thumbnail comes from, what the screen says —
  // reads this one value, so the page can never be half in late mode.
  const lateMode = data?.mode === "late";
  const photos = data?.photos || [];
  const need = task?.min_media || 1;
  const cap = task?.max_slots || need;
  const complete = photos.length >= need;
  const dayClosed = !!data?.day?.closed;

  /* ── the clock: server-anchored, phone-proof ────────────────────────────── */
  const serverNow = useCallback(
    () => (offsetRef.current == null ? Date.now() : offsetRef.current + performance.now()),
    [],
  );

  useEffect(() => {
    if (data?.server?.ms) offsetRef.current = data.server.ms - performance.now();
  }, [data]);

  useEffect(() => {
    // Re-anchor now and then: `performance.now()` is monotonic, but a long
    // suspend can let it drift from wall time by a second or two, and the stamp
    // is a second-precision claim.
    const id = setInterval(() => {
      if (!navigator.onLine) return;
      api.get("/api/leader-proof/time")
        .then((r) => { offsetRef.current = r.data.ms - performance.now(); })
        .catch(() => {});
    }, CLOCK_RESYNC_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setClock(serverNow()), 250);
    return () => clearInterval(id);
  }, [serverNow]);

  /* ── Telegram chrome ────────────────────────────────────────────────────── */
  useEffect(() => {
    const tg = tgApp();
    if (!tg) return undefined;
    tg.expand?.();
    tg.BackButton?.hide?.();
    tg.MainButton?.hide?.();
    return () => { tg.disableClosingConfirmation?.(); };
  }, []);

  useEffect(() => {
    // A shot still waiting to upload is the ONE thing worth interrupting a
    // close for: it exists, it is not on the register yet, and closing here is
    // how it would be lost.
    const tg = tgApp();
    if (!tg) return;
    if (queued.length) tg.enableClosingConfirmation?.();
    else tg.disableClosingConfirmation?.();
  }, [queued.length]);

  /* ── camera ─────────────────────────────────────────────────────────────── */
  const pickLens = useCallback((list, want) => {
    const saved = localStorage.getItem(`${LENS_KEY}.${want}`);
    if (saved && list.some((d) => d.deviceId === saved)) return saved;
    // Labels are the only thing that tells an ultra-wide from the main sensor,
    // and some WebViews leave them blank even after the grant. Choosing by
    // POSITION there is how a phone gets pinned to its 0.5x lens — or its front
    // one — for good: answer nothing, and keep the camera facingMode picked.
    const isFront = (d) => FRONT_LENS.test(d.label || "");
    const isBack = (d) => MAIN_LENS.test(d.label || "");

    // If we can't identify ANY camera, trust facingMode rather than making a blind guess.
    if (!list.some(isFront) && !list.some(isBack)) return null;

    let side;
    if (want === "user") {
      side = list.filter(isFront);
      // If we want front but didn't find any explicit front label, pick what's NOT a known back camera
      if (!side.length) side = list.filter((d) => !isBack(d));
    } else {
      side = list.filter(isBack);
      // If we want back but didn't find any explicit back label, pick what's NOT a known front camera
      if (!side.length) side = list.filter((d) => !isFront(d));
    }
    const pool = side.length ? side : list;
    // Modern phones expose three or four rear cameras and their labels are the
    // only difference between them. SCORE every one and take the best, rather
    // than the first that matches something: «facing back» describes the
    // ultra-wide exactly as well as it describes the main sensor, so on a list
    // that happens to name it first, first-match hands over the 0.5x.
    let best = null;
    let top = -Infinity;
    for (const d of pool) {
      const s = lensScore(d.label);
      if (s > top) { top = s; best = d; }
    }
    return best?.deviceId || null;
  }, []);

  // One negotiation at a time. Opening the camera is a promise, and everything
  // that can notice a dead viewfinder — the mount, a mode switch, coming back
  // from the background, the Retry button — can fire while the first one is
  // still in flight. A second getUserMedia there hands back a second live
  // stream that nothing holds a reference to: the camera stays on after the
  // page is closed, with no way left to stop it.
  const startingRef = useRef(false);
  const startCameraRef = useRef(null);
  // Which attempt is the CURRENT one. The guard above is released by whichever
  // comes first — the negotiation or its deadline — so a superseded attempt can
  // still be running: it must not then hand its stream to the page, reopen a
  // newer attempt's guard, or overwrite a newer attempt's verdict. Every step
  // that touches state checks its own number first, and a stream that arrives
  // too late is stopped rather than left running with nothing holding it.
  const attemptRef = useRef(0);
  // Frame bookkeeping for the watchdog: the last `currentTime` seen, when it
  // was seen, and how many silent re-opens this stall has already cost.
  const framesRef = useRef({ time: -1, at: 0, fixes: 0 });
  // The camera is only ever opened ON SCREEN. A request made from the
  // background cannot finish — nobody can answer «Allow camera?» there, and
  // Android does not hand the camera to an app it cannot see — so it hung for
  // OPEN_TIMEOUT_MS and put a failure screen in front of a leader whose camera
  // was never broken. That is the 2026-09-17 report: the page went to the
  // background at 54 s, the watchdog read the paused picture as a dead camera
  // at 64 s, re-opened it from the background, and failed at 84 s. An open
  // asked for while hidden is noted here and made when the page comes back.
  const deferredRef = useRef(false);
  // For the return to settle: whether the open in flight spent time in the
  // background, the promise of that whole open, its deadline, and a token
  // that stands the watchdog aside while the return is being settled.
  const openHiddenRef = useRef(false);
  const openDoneRef = useRef(Promise.resolve());
  const deadlineRef = useRef(null);
  const slowRef = useRef(null);
  const returningRef = useRef(0);
  // The grace a page off screen gets before it lets the camera go.
  const hideTimerRef = useRef(null);

  /** Let the camera GO.
   *
   *  Letting go is as much this page's job as opening. Android hands the camera
   *  to ONE client at a time, and Telegram MINIMIZES a mini app instead of
   *  closing it — so every proof page a leader has opened this shift is still a
   *  page holding a camera. By the third task the open they are waiting on is
   *  queued behind two abandoned viewfinders: in the 2026-09-18 report
   *  `getUserMedia` took 17.4 s to answer while two sibling «SOP standarti»
   *  pages reported live cameras from the background, and the open deadline
   *  then put a failure screen over a camera that had in fact just opened.
   *  Nothing here can close a sibling page; what it can do is not BE one.
   */
  const releaseCamera = useCallback((why) => {
    clearTimeout(hideTimerRef.current);
    const s = streamRef.current;
    if (!s) return;
    streamRef.current = null;
    // `stop()` fires no `ended`, so this can never loop back into a re-open.
    s.getTracks().forEach((tr) => tr.stop());
    framesRef.current = { time: -1, at: 0, fixes: 0 };
    note("stream", `released · ${why}`);
    // Write the ledger NOW rather than wait for the 5 s heartbeat: a page about
    // to be frozen or closed never sends another one, and the next page reads
    // this line to find out who is holding the camera.
    if (opensRef.current.openedAt) {
      beatHolder(pageIdRef.current, { live: false, vis: document.visibilityState });
    }
  }, [note]);

  const startCamera = useCallback(async (want = facing, why = "start") => {
    // A failure report may be holding a clone of the old stream, and a clone
    // keeps the camera source alive underneath the open about to start.
    probeHoldRef.current?.();
    probeHoldRef.current = null;
    if (document.visibilityState !== "visible") {
      if (!deferredRef.current) {
        opensRef.current.hidden += 1;
        note("open", `put off until the page is back on screen · ${why} · ${want}`);
      }
      deferredRef.current = true;
      return;
    }
    if (startingRef.current) return;
    startingRef.current = true;
    const attempt = ++attemptRef.current;
    const mine = () => attemptRef.current === attempt;
    let finished = () => {};
    openDoneRef.current = new Promise((resolve) => { finished = resolve; });
    openHiddenRef.current = false;
    opensRef.current.total += 1;
    note("open", `${why} · ${want}`);
    const t0 = performance.now();
    setCamErr(null);
    setCamBusy(true);
    setCamSlow(false);
    framesRef.current = { time: -1, at: 0, fixes: framesRef.current.fixes };
    // Slow is SAID, not judged. A leader left in front of a silent black
    // rectangle backs out and re-opens the task from the bot — which leaves one
    // more page holding the camera and makes the next open slower still. The
    // one thing that breaks that loop is telling them it is still working.
    const slow = setTimeout(() => { if (mine()) { setCamSlow(true); note("open", "slow"); } },
      OPEN_SLOW_MS);
    slowRef.current = slow;
    const deadline = setTimeout(() => {
      if (!mine()) return;
      startingRef.current = false;
      setCamBusy(false);
      setCamSlow(false);
      failRef.current = {
        kind: "open_timeout", error: null, stall: null,
        hidden: document.visibilityState !== "visible", at: Date.now(),
      };
      note("open", `no answer in ${OPEN_TIMEOUT_MS / 1000} s → failure screen`);
      setCamErr("stalled");
    }, OPEN_TIMEOUT_MS);
    deadlineRef.current = deadline;
    // Every getUserMedia of this attempt, timed and recorded: which path
    // opened the camera, and how long Android took to answer, is half of any
    // failure report.
    const gum = async (path, video) => {
      const g0 = performance.now();
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video, audio: false });
        const st = s.getVideoTracks()[0]?.getSettings?.() || {};
        note("gum", `${path} → ok in ${Math.round(performance.now() - g0)} ms · ${st.width}x${st.height}`);
        return s;
      } catch (e) {
        note("gum", `${path} → ${e?.name || "error"} in ${Math.round(performance.now() - g0)} ms`
          + (e?.message ? ` · ${e.message}` : ""));
        throw e;
      }
    };
    try {
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
      // Ask before queueing. A minimized sibling page holding the camera hears
      // this and releases at once; waiting for Android to arbitrate instead is
      // what the 17.4 s open of the 2026-09-18 report was made of. Best-effort:
      // a sibling too frozen to hear it is what the holder ledger reports.
      announceNeed(pageIdRef.current);
      await new Promise((resolve) => { setTimeout(resolve, NEED_RELEASE_MS); });
      // ONE getUserMedia whenever this phone's lens is already known.
      //
      // Inside Telegram's WebView every getUserMedia call raises its own
      // «Allow camera?» sheet, and the probe-then-correct pass below makes TWO
      // of them: one to earn the labels, one to open the lens those labels
      // named. Nothing in the platform can make that sheet stick — the grant
      // belongs to the WebView, not to us — so the only number we control is
      // how many times per open it appears, and a leader shooting five proofs
      // was answering it ten times. The lens id was written down on the first
      // successful open, so going straight for it costs ONE.
      //
      // It is CHECKED against the device list first, never trusted: an id this
      // phone no longer has (a new device, an id WebKit rotated when the grant
      // was revoked) would prompt and then fail, i.e. two sheets to end up
      // where the plain path starts. `enumerateDevices` itself never prompts.
      const lenses = async () => {
        const list = (await navigator.mediaDevices.enumerateDevices())
          .filter((d) => d.kind === "videoinput");
        setDevices(list);          // the flip button reads this count
        return list;
      };
      const acquire = async () => {
        const remembered = localStorage.getItem(`${LENS_KEY}.${want}`);
        const known = await lenses();
        let stream = null;
        opensRef.current.remembered = false;
        if (remembered && known.some((d) => d.deviceId === remembered)) {
          try {
            stream = await gum("remembered lens", { deviceId: { exact: remembered }, ...VIDEO_SIZE });
            opensRef.current.remembered = true;
          } catch (e) {
            // A refusal is the leader's ANSWER, not a bad lens. Re-asking with
            // different constraints is a second sheet for the same «no».
            if (e?.name === "NotAllowedError" || e?.name === "SecurityError") throw e;
            localStorage.removeItem(`${LENS_KEY}.${want}`);
          }
        }
        if (!stream) {
          // First pass gets permission (labels are blank until it is granted),
          // then the device list becomes readable and the right lens chosen.
          // We try exact facingMode first so that resolution preferences don't
          // override the requested side, falling back to ideal if the device
          // lacks it (e.g. laptops).
          try {
            stream = await gum(`facing ${want} exact`, { facingMode: { exact: want }, ...VIDEO_SIZE });
          } catch (e) {
            if (e?.name === "NotAllowedError" || e?.name === "SecurityError") throw e;
            stream = await gum(`facing ${want} ideal`, { facingMode: { ideal: want }, ...VIDEO_SIZE });
          }
          const list = await lenses();
          const id = pickLens(list, want);
          note("lens", id ? `picked ${shortId(id)} of ${list.length}` : `none picked of ${list.length}`);
          if (id && stream.getVideoTracks()[0]?.getSettings?.().deviceId !== id) {
            stream.getTracks().forEach((tr) => tr.stop());
            stream = await gum("picked lens", { deviceId: { exact: id }, ...VIDEO_SIZE });
          }
          if (id) localStorage.setItem(`${LENS_KEY}.${want}`, id);
        }
        return stream;
      };
      // «Busy» is somebody else holding the camera, and the whole fix for it is
      // to ask again a moment later — a sibling page too frozen to have heard
      // `announceNeed` is usually let go of by Android within a second or two
      // of being asked. Retried here rather than shown, because a failure
      // screen for a camera that is about to be free costs the leader their
      // shot AND puts a support message in front of an admin for nothing.
      // Bounded: a camera busy three times over is a real failure, and the
      // leader is owed the screen rather than another wait.
      let stream = null;
      for (let go = 0; ; go += 1) {
        try { stream = await acquire(); break; } catch (e) {
          if (go >= BUSY_RETRIES || !BUSY_ERRORS.has(e?.name)) throw e;
          note("open", `${e.name} — the camera is held; asking again (${go + 1})`);
          setCamSlow(true);
          announceNeed(pageIdRef.current);
          await new Promise((resolve) => { setTimeout(resolve, BUSY_RETRY_MS); });
          if (!mine()) return;
        }
      }
      if (!mine()) {
        stream.getTracks().forEach((tr) => tr.stop());
        note("open", "superseded by a newer open; stream dropped");
        return;
      }
      streamRef.current = stream;
      opensRef.current.lastMs = Math.round(performance.now() - t0);
      opensRef.current.openedAt = Date.now();
      // The deadline asks ONE question — did Android answer — and it is
      // answered here. Everything below (the lens correction, `play()`) happens
      // on a camera that is already open, and whether a picture ARRIVES is the
      // frame watchdog's question, with its own clock and its own silent
      // re-open. Left running across this line it judged both: in the
      // 2026-09-18 report `getUserMedia` came back OK after 17.4 s of the 20 s
      // budget, and the 2.6 s left were not enough for the rest — so a camera
      // that had just opened was reported as one that never did.
      clearTimeout(deadline);
      // A stream that landed while the page was off screen is on the grace too,
      // or a page nobody is looking at holds the camera for the rest of the day.
      if (document.visibilityState !== "visible") {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = setTimeout(() => releaseCamera("hidden"), HIDDEN_RELEASE_MS);
      }
      // A phone whose rear camera is ONE fused device can open it at 0.5x, and
      // the labels above cannot see that: the device they picked really is the
      // main camera, it is simply pointed at its widest member. Correct it on
      // the stream, before the first frame the leader composes against.
      await useMainLens(stream.getVideoTracks()[0]);
      // The OS can take the camera back at any moment — an incoming call,
      // another app, a WebView the system suspended. The element keeps showing
      // the last frame it got, so a dead camera looks exactly like a working
      // one until the leader presses the shutter and nothing happens. Take it
      // back the instant it ends, while they are still on the viewfinder.
      // (`stop()` never fires this, so re-opening cannot loop.)
      stream.getVideoTracks().forEach((tr) => {
        const st = tr.getSettings?.() || {};
        note("stream", `${st.width}x${st.height}@${Math.round(st.frameRate || 0)} · ${tr.label || "no label"}`
          + (tr.muted ? " · muted" : ""));
        // Chrome mutes a camera stream that stops delivering — the one event
        // that says so from inside the browser.
        tr.addEventListener("mute", () => note("stream", "mute"));
        tr.addEventListener("unmute", () => note("stream", "unmute"));
        tr.addEventListener("ended", () => {
          note("stream", "ended");
          // Off screen this is put off, and made when the page comes back.
          startCameraRef.current?.(want, "stream ended");
        });
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // NOT awaited. `play()` on a stream that never delivers a frame simply
        // never settles, and awaiting it held `startingRef` shut — which stands
        // the frame watchdog down, so the one check that could have named this
        // failure never ran. The ref callback and `ensureCamera` both re-play.
        videoRef.current.play?.().catch((e) => note("play", e?.name || "rejected"));
      }
      // A negotiation slow enough to have been called stalled can still end in
      // a working camera: clear the verdict rather than leave an overlay across
      // a live viewfinder. Having the stream is not yet having a picture — the
      // FRAMES are what prove that, and the watchdog below is what waits.
      if (mine()) {
        setCamErr(null);
        framesRef.current = { time: -1, at: Date.now(), fixes: framesRef.current.fixes };
      }
    } catch (e) {
      if (!mine()) return;
      failRef.current = {
        kind: "gum_error",
        error: { name: e?.name || "", message: String(e?.message || "").slice(0, 200) },
        stall: null, hidden: document.visibilityState !== "visible", at: Date.now(),
      };
      note("open", `failed: ${e?.name || "error"}`);
      setCamErr(e?.name === "NotAllowedError" ? "denied"
        : e?.name === "NotFoundError" ? "none" : "failed");
    } finally {
      clearTimeout(deadline);
      clearTimeout(slow);
      if (mine()) { startingRef.current = false; setCamBusy(false); setCamSlow(false); }
      finished();
    }
  }, [facing, pickLens, note, releaseCamera]);
  startCameraRef.current = startCamera;

  useEffect(() => {
    if (!task || dayClosed) return undefined;
    startCamera(facing, "page open or flip");
    return () => {
      // Retire what is IN FLIGHT along with what is open. An attempt that
      // outlives its effect — the flip pressed while the first open was still
      // negotiating — would otherwise hold the guard shut, so the new side
      // never opens, and then attach a stream for the side just left.
      attemptRef.current += 1;
      startingRef.current = false;
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id, dayClosed, facing]);

  /**
   * The <video> node, wired the moment it exists.
   *
   * A ref callback rather than an effect because the node and the stream are
   * started by different clocks: the camera opens as soon as the task loads,
   * while the element appears whenever React gets around to it. Handing the
   * stream over HERE is what stops the two from missing each other — and it is
   * the only reason a second shot is possible, because the element the leader
   * comes back to after a save is not always the one they shot the first with.
   */
  const camWatch = useRef(null);
  const setVideoEl = useCallback((el) => {
    camWatch.current?.();
    camWatch.current = null;
    videoRef.current = el;
    if (!el) return;
    const sync = (ev) => {
      if (el.videoWidth && el.videoHeight) setCamAR(el.videoWidth / el.videoHeight);
      // A 2×2 here is Chrome's black placeholder for a stream that ended before
      // its first real frame — worth its line in a failure report.
      if (ev?.type) recRef.current?.note("video", `${ev.type} ${el.videoWidth}x${el.videoHeight}`);
    };
    el.addEventListener("loadedmetadata", sync);
    el.addEventListener("resize", sync);   // a rotation changes the frame's shape
    camWatch.current = () => {
      el.removeEventListener("loadedmetadata", sync);
      el.removeEventListener("resize", sync);
    };
    const s = streamRef.current;
    if (s && el.srcObject !== s) {
      el.srcObject = s;
      el.play?.().catch((e) => recRef.current?.note("play", e?.name || "rejected"));
    }
    sync();
  }, []);

  /** The viewfinder must be live whenever it is on screen. A WebView that was
   *  backgrounded can end the track outright, and a dead track looks exactly
   *  like a working camera pointed at something black. */
  const ensureCamera = useCallback(() => {
    if (mode !== "live" || !task || dayClosed) {
      // Not on screen ⇒ not measured, and the clock starts again on the way
      // back: a stale marker would read as six seconds of stall the instant the
      // leader returns from reviewing a shot.
      framesRef.current = { ...framesRef.current, time: -1, at: 0 };
      return;                                            // nothing to look through
    }
    // Off screen the WebView pauses the picture itself, so silence there says
    // nothing about the camera — and nothing may be re-opened from there. The
    // stall clock starts again from zero when the page comes back.
    if (document.visibilityState !== "visible") {
      framesRef.current = { time: -1, at: 0, fixes: 0 };
      return;
    }
    if (returningRef.current) return;           // a return is settling the camera
    if (camErr || startingRef.current) return;  // a refusal is not retried in a loop
    const s = streamRef.current;
    const alive = !!s && s.getVideoTracks().some((tr) => tr.readyState === "live");
    if (!alive) { startCamera(facing, s ? "stream no longer live" : "no stream"); return; }
    const v = videoRef.current;
    if (!v) return;
    if (v.srcObject !== s) v.srcObject = s;
    if (v.paused) v.play?.().catch((e) => note("play", e?.name || "rejected"));

    // Is anything actually ARRIVING? Every check above can pass on a stream
    // that delivers no frames, and a leader looking at that has been handed the
    // one screen the page cannot tell from a working one: the shutter is live,
    // `capture` finds no `videoWidth` and returns without a word, and pressing
    // it harder is the only move left. So the frames themselves are the test.
    const now = Date.now();
    const f = framesRef.current;
    if (v.videoWidth && v.currentTime !== f.time) {
      framesRef.current = { time: v.currentTime, at: now, fixes: 0 };
      return;
    }
    if (!f.at) { framesRef.current = { ...f, at: now }; return; }
    if (now - f.at < FRAME_STALL_MS) return;
    const seen = {
      w: v.videoWidth, h: v.videoHeight, t: Math.round((v.currentTime || 0) * 100) / 100,
      paused: v.paused, ready: v.readyState,
    };
    const what = `no frame for ${FRAME_STALL_MS / 1000} s (video ${seen.w}x${seen.h}, t ${seen.t})`;
    // ONE silent re-open, because a WebView that lost the camera usually hands
    // it straight back and a leader should never have to know. A second dead
    // stream is not a hiccup: say so and give them the button, rather than
    // restarting the camera behind a black screen for the rest of the shift.
    if (f.fixes >= 1) {
      failRef.current = { kind: "no_frames", error: null, stall: seen, hidden: false, at: now };
      note("watch", `${what} again → failure screen`);
      setCamErr("stalled");
      return;
    }
    note("watch", `${what} → silent re-open`);
    framesRef.current = { time: -1, at: 0, fixes: f.fixes + 1 };
    startCamera(facing, "no frames");
  }, [mode, task, dayClosed, camErr, facing, startCamera, note]);

  useEffect(() => { ensureCamera(); }, [ensureCamera]);

  // A heartbeat as well as the events. `visibilitychange` catches the WebView
  // coming back and the track's `ended` catches a camera taken cleanly, but a
  // track can also end with no event of any kind, and a live one can stop
  // delivering without ending. Neither is reachable except by looking.
  useEffect(() => {
    if (mode !== "live" || !task || dayClosed) return undefined;
    const id = setInterval(() => ensureCamera(), CAM_WATCH_MS);
    return () => clearInterval(id);
  }, [mode, task, dayClosed, ensureCamera]);


  /* ── when the camera fails, the device says why — utils/cameraDiag ────── */

  // The page's own comings and goings, into the recorder: a camera that stops
  // right after Telegram minimized the page is a different failure from one
  // that never started on a page nobody left.
  useEffect(() => {
    const vis = () => note("page", document.visibilityState);
    const hide = () => note("page", "pagehide");
    const tg = tgApp();
    const on = () => note("telegram", "activated");
    const off = () => note("telegram", "deactivated");
    document.addEventListener("visibilitychange", vis);
    window.addEventListener("pagehide", hide);
    tg?.onEvent?.("activated", on);
    tg?.onEvent?.("deactivated", off);
    return () => {
      document.removeEventListener("visibilitychange", vis);
      window.removeEventListener("pagehide", hide);
      tg?.offEvent?.("activated", on);
      tg?.offEvent?.("deactivated", off);
    };
  }, [note]);

  // How this page describes itself to a sibling camera page that asks. Read
  // through a ref, because the answer must be the page as it is NOW, not the
  // render the listener was registered in.
  const describeRef = useRef(null);
  describeRef.current = () => {
    const tr = streamRef.current?.getVideoTracks?.()[0];
    let st = {};
    try { st = tr?.getSettings?.() || {}; } catch { /* optional */ }
    const f = framesRef.current;
    return {
      task: taskId, taskName: task?.name || "", vis: document.visibilityState,
      active: tgApp()?.isActive, mode, err: camErr || "",
      live: tr?.readyState === "live", muted: !!tr?.muted,
      size: st.width ? `${st.width}x${st.height}` : "",
      opened: opensRef.current.openedAt,
      frameAgo: f.time >= 0 && f.at ? Date.now() - f.at : null,
      opens: opensRef.current.total, opensHidden: opensRef.current.hidden,
    };
  };

  // Answer sibling camera pages, and keep this page's line in the device's
  // camera ledger for the sibling too frozen to answer at all.
  useEffect(() => {
    const id = pageIdRef.current;
    const stop = answerPresence(id, () => describeRef.current(), () => {
      // Another camera page of this Telegram is opening. Only one page on this
      // device can have the camera, and a page nobody is looking at has no
      // claim on it — so it goes back now, without waiting out the grace.
      if (document.visibilityState !== "visible") {
        releaseCamera("another page needs the camera");
      }
    });
    const beat = () => {
      if (!opensRef.current.openedAt) return;   // never held a camera: nothing to own up to
      const d = describeRef.current();
      beatHolder(id, {
        task: d.task, taskName: d.taskName, opened: d.opened, live: d.live,
        vis: d.vis, active: d.active, frameAgo: d.frameAgo,
      });
    };
    const timer = setInterval(beat, 5000);
    const bye = () => { if (opensRef.current.openedAt) beatHolder(id, { live: false, vis: "closed" }); };
    window.addEventListener("pagehide", bye);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pagehide", bye);
      bye();
      stop();
    };
    // `releaseCamera` is stable, so this still registers once.
  }, [releaseCamera]);

  // The failure report: once per failure screen, at most three per page — a
  // fourth would say nothing the first did not. Nothing on screen changes
  // while it is gathered; once the server has it, one line says so.
  const camErrRef = useRef(camErr);
  camErrRef.current = camErr;
  const reportRef = useRef({ busy: false, sent: 0 });
  useEffect(() => {
    if (!camErr) return;
    setReported(false);
    if (camErr === "denied") return;   // a refusal is the leader's answer, not a fault
    // Raised while the page was hidden: nobody saw it, and the return clears it
    // and opens again. If THAT open fails, it fails on screen and is reported.
    if (failRef.current.hidden) return;
    const r = reportRef.current;
    if (r.busy || r.sent >= 3) return;
    r.busy = true;
    r.sent += 1;
    const attempt = attemptRef.current;
    const same = () => attemptRef.current === attempt;   // Retry starts a new attempt
    const hold = (release) => { probeHoldRef.current = release; };
    (async () => {
      try {
        const fail = failRef.current;
        // Only a stream that opened and went silent is THIS failure's stream;
        // after a failed or unfinished open, streamRef still names the last one.
        const stream = fail.kind === "no_frames" ? streamRef.current : null;
        const track = stream?.getVideoTracks?.()[0] || null;
        let openId = "";
        try { openId = track?.getSettings?.().deviceId || ""; } catch { /* optional */ }
        const cam = {
          screen: camErr, trigger: fail.kind || "unknown", error: fail.error, stall: fail.stall,
          now: Date.now(), mode,
          ctx: {
            task: task?.name, taskId, leader: data?.leader?.name, date: data?.day?.date,
            cell: cellId, late: lateMode, facing,
          },
          opens: { ...opensRef.current, lens: shortId(localStorage.getItem(`${LENS_KEY}.${facing}`) || "") },
          track: trackSnap(track),
          video: videoSnap(videoRef.current, streamRef.current),
        };
        cam.env = await deviceEnv();
        cam.cameras = await cameraList(openId);
        cam.others = await askOthers(pageIdRef.current);
        cam.holders = otherHolders(pageIdRef.current);
        if (fail.kind === "no_frames") {
          // The probes touch the camera, so a page in the background never
          // runs them: it could take the camera from the page in use.
          const onScreen = document.visibilityState === "visible";
          const heldElsewhere = Array.isArray(cam.others) && cam.others.some((o) => o.live);
          cam.frames = !same() ? { got: null, why: "retry pressed" }
            : !onScreen ? { got: null, why: "page not on screen" }
            : await readTrackFrame(track, 3000, hold);
          cam.smaller = !same() ? { tried: false, why: "retry pressed" }
            : !onScreen ? { tried: false, why: "page not on screen" }
            : heldElsewhere ? { tried: false, why: "another camera page holds the camera" }
            : cam.frames?.got !== false
              ? { tried: false, why: cam.frames?.got ? "frames arrived" : (cam.frames?.why || "no frame probe") }
              : await probeSmaller(track, 3000, hold);
        }
        cam.interrupted = !same();
        cam.still = same() && !!camErrRef.current;
        cam.timeline = recRef.current.list();
        const res = await sendCameraReport(cam);
        if (res?.ok && same() && camErrRef.current) setReported(true);
      } catch { /* the report must never become a second failure */ } finally {
        r.busy = false;
      }
    })();
    // Once per failure: everything else it reads is a ref, or the render the
    // failure appeared in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camErr]);

  /* ── back on screen ─────────────────────────────────────────────────────── */

  // Everything the background left behind is settled here: an open that was
  // put off, an open that was still waiting when the page left, and a failure
  // screen raised while nobody could see it. None of them reaches the leader as
  // a failure — the camera is opened again, now that someone is there to
  // answer «Allow camera?».
  const settleReturn = useCallback(async () => {
    if (!task || dayClosed) return;
    const deferred = deferredRef.current;
    const waiting = startingRef.current && openHiddenRef.current;
    const failedHidden = !!camErrRef.current && !!failRef.current.hidden;
    deferredRef.current = false;
    if (!deferred && !waiting && !failedHidden) { ensureCamera(); return; }
    const token = ++returningRef.current;
    const since = Date.now();
    const attempt = attemptRef.current;
    note("page", `back on screen · ${waiting ? "an open was left waiting"
      : failedHidden ? "a failure was raised while hidden" : "making the open that was put off"}`);
    // The waiting open's own deadline must not fire a failure screen while it
    // gets its last chance below.
    clearTimeout(deadlineRef.current);
    clearTimeout(slowRef.current);
    setCamErr(null);
    setCamBusy(true);
    // Never two camera requests at once: the open from before the page left
    // may still be waiting on an «Allow camera?» sheet that is only now in
    // front of the leader.
    await Promise.race([
      openDoneRef.current,
      new Promise((resolve) => { setTimeout(resolve, RETURN_GRACE_MS); }),
    ]);
    if (returningRef.current !== token) return;      // a newer return took over
    returningRef.current = 0;
    if (attemptRef.current !== attempt) return;       // something newer is opening already
    if (opensRef.current.openedAt >= since) return;   // the waiting open finished
    if (failRef.current.at >= since) {                // it failed on screen: that screen stands
      setCamBusy(false);
      return;
    }
    // Drop the open that never finished, and start one the leader can answer.
    attemptRef.current += 1;
    startingRef.current = false;
    startCamera(facing, "back on screen");
  }, [task, dayClosed, ensureCamera, startCamera, facing, note]);

  useEffect(() => {
    const onVis = () => {
      // Whichever way the page went, the stall clock starts again from zero:
      // the time spent hidden is not time the camera failed to deliver.
      framesRef.current = { time: -1, at: 0, fixes: 0 };
      if (document.visibilityState === "visible") {
        clearTimeout(hideTimerRef.current);
        settleReturn();
        return;
      }
      if (startingRef.current) openHiddenRef.current = true;
      // Off screen the camera is held a little longer, in case the leader is
      // only glancing away — coming back to a released camera costs another
      // «Allow camera?» sheet, and that sheet is the one cost this page is
      // built to keep down. Past the grace the page is not coming back soon
      // enough to be worth the next task's shift, and it lets go. On the way
      // back `ensureCamera` opens it again, and only once the viewfinder is
      // what is on screen.
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => releaseCamera("hidden"), HIDDEN_RELEASE_MS);
    };
    // A page really going away lets go at once: there is no grace to spend.
    const bye = () => releaseCamera("page going away");
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", bye);
    return () => {
      clearTimeout(hideTimerRef.current);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", bye);
    };
  }, [settleReturn, releaseCamera]);

  /* ── the frame area, measured, so the picture box can be built from it ──── */
  const frameWatch = useRef(null);
  const setFrameEl = useCallback((el) => {
    frameWatch.current?.disconnect();
    frameWatch.current = null;
    frameRef.current = el;
    if (!el) return;
    // Same numbers ⇒ same object: a ResizeObserver fires on subpixel noise, and
    // a fresh object every time would re-render the viewfinder for nothing.
    const measure = () => setFrame((f) => (
      f.w === el.clientWidth && f.h === el.clientHeight
        ? f : { w: el.clientWidth, h: el.clientHeight }));
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    frameWatch.current = ro;
    measure();
  }, []);

  /* ── the offline queue ──────────────────────────────────────────────────── */
  const reloadQueue = useCallback(async () => {
    setQueued(await pending(leaderId, taskId));
  }, [leaderId, taskId]);

  // `client_key` is the SHOT's id, not the request's: every attempt at one photo
  // sends the same one, which is what lets the server answer a re-send with the
  // row it already wrote instead of putting the same picture on the roll twice.
  const upload = useCallback((item) => {
    const fd = new FormData();
    fd.append("leader", String(item.leader));
    fd.append("task", String(item.task));
    // The cell travels WITH the blob through the offline queue: a shot flushed
    // after the leader moved to another cell's checklist must still land on the
    // one it was taken for.
    if (item.cell) fd.append("cell", String(item.cell));
    fd.append("captured_ms", String(Math.round(item.capturedMs)));
    if (item.phoneMs) fd.append("phone_ms", String(Math.round(item.phoneMs)));
    if (item.slot != null) fd.append("slot", String(item.slot));
    if (item.key) fd.append("client_key", String(item.key));
    fd.append("file", item.blob, "proof.jpg");
    // The DOOR travels with the SHOT, not with the page: a photo taken in late
    // mode and flushed out of the offline queue after a reload must still land
    // where it was taken for. A queued row from before this existed has no
    // `late` field, reads falsy, and goes to the ordinary endpoint — which is
    // exactly right.
    return api.post(item.late ? "/api/leader-proof/late-photo"
                              : "/api/leader-proof/photo", fd)
      .then((r) => r.data);
  }, []);

  const drain = useCallback(async () => {
    if (!leaderId || !navigator.onLine) return;
    const res = await flush(leaderId, upload);
    await reloadQueue();
    if (res.sent) { refetch(); toast.success(t("proof.queueSent").replace("{n}", res.sent)); }
  }, [leaderId, upload, reloadQueue, refetch, toast, t]);

  useEffect(() => { reloadQueue(); }, [reloadQueue]);

  // `drain` closes over `toast` and `t`, both fresh objects on every render —
  // and this page re-renders four times a SECOND to advance its clock. Held in
  // a ref so the two effects below can be registered once and mean what they
  // say. With `drain` in their deps they were torn down and re-run every
  // 250 ms, and each re-run started another flush over the same queued rows:
  // several uploads of one photo in flight together, each landing as its own
  // row, which is how a leader's roll came back holding the same picture twice
  // with the same burnt second on both copies.
  const drainRef = useRef(drain);
  useEffect(() => { drainRef.current = drain; }, [drain]);

  useEffect(() => {
    const up = () => { setOnline(true); drainRef.current(); };
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    if (navigator.onLine) drainRef.current();
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  // The `online` event is not the only way a shot gets stuck. A connection that
  // drops mid-upload and comes back a second later never fires it — the phone
  // was "online" throughout — so a shot parked by that failure would sit in the
  // queue until the page was opened again. While anything is queued, try again
  // on a timer; re-sending costs nothing now that a shot carries its own id and
  // the server answers a replay with the row it already wrote.
  useEffect(() => {
    if (!queued.length) return undefined;
    const id = setInterval(
      () => { if (navigator.onLine) drainRef.current(); }, RETRY_EVERY_MS);
    return () => clearInterval(id);
  }, [queued.length]);

  /* ── shoot ──────────────────────────────────────────────────────────────── */
  const capture = useCallback(() => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const ms = serverNow();
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext("2d");
    if (facing === "user") {           // un-mirror: the preview is flipped, the file must not be
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) { toast.error(t("proof.captureFailed")); return; }
      setShot({
        blob, url: URL.createObjectURL(blob), ms, phoneMs: Date.now(),
        ar: canvas.width / canvas.height,
        // Minted with the picture, so a save that has to be retried — directly
        // or later out of the offline queue — is still recognisably THIS shot.
        key: newKey(),
      });
      setMode("review");
    }, "image/jpeg", JPEG_Q);
  }, [serverNow, facing, toast, t]);

  const discardShot = useCallback(() => {
    if (shot?.url) URL.revokeObjectURL(shot.url);
    setShot(null);
    setMode("live");
  }, [shot]);

  const saveShot = useCallback(async () => {
    if (!shot || saving) return;
    setSaving(true);
    const item = {
      leader: leaderId, task: taskId, cell: cellId, slot: retakeSlot,
      capturedMs: shot.ms, phoneMs: shot.phoneMs, blob: shot.blob,
      key: shot.key, late: lateMode,
    };
    try {
      if (!navigator.onLine) throw Object.assign(new Error("offline"), { offline: true });
      await upload(item);
      await refetch();
      toast.success(t("proof.saved"));
    } catch (e) {
      const code = e?.response?.status;
      if (code && code >= 400 && code < 500) {
        toast.error(tf(`proof.err.${e?.response?.data?.detail || "failed"}`,
          t("proof.err.failed")));
        setSaving(false);
        return;
      }
      // Network, not refusal: the shot is kept whole and goes out on its own.
      // It may already be stored — a connection that dies after the bytes land
      // but before the answer comes back is indistinguishable from one that
      // never carried them — so the queue re-sends it under the same `key` and
      // the server recognises the replay rather than filing a second photo.
      await enqueue(item);
      await reloadQueue();
      toast.warning(t("proof.queued"));
    }
    setSaving(false);
    setRetakeSlot(null);
    discardShot();
  }, [shot, saving, leaderId, taskId, retakeSlot, upload, refetch, toast, t, tf,
      reloadQueue, discardShot, lateMode]);

  const doDelete = useCallback(async (photo) => {
    try {
      await api.delete(lateMode ? `/api/leader-proof/late-photo/${photo.id}`
                                : `/api/leader-proof/photo/${photo.id}`);
      await refetch();
      setViewing(null);
      setConfirm(null);
      toast.success(t("proof.deleted"));
    } catch (e) {
      setConfirm((c) => (c ? { ...c, error: t("proof.err.failed") } : c));
    }
  }, [refetch, toast, t, lateMode]);

  /* ── gates ──────────────────────────────────────────────────────────────── */
  if (!leaderId || !taskId) {
    return <ErrorScreen code="400" tone="neutral" title={t("proof.gate.badLink")}
      message={t("proof.gate.badLinkMsg")}
      action={{ label: t("proof.gate.close"), onClick: () => tgApp()?.close?.() }} />;
  }
  if (isLoading) {
    return (
      <div className="fixed inset-0 grid place-items-center" style={{ background: "#0b0d10" }}>
        <Loader2 size={30} className="animate-spin" color="var(--brand)" />
      </div>
    );
  }
  if (isError) {
    const detail = error?.response?.data?.detail;
    return <ErrorScreen code={String(error?.response?.status || "")} tone="warning"
      title={tf(`proof.gate.${detail}`, t("proof.gate.unavailable"))}
      message={tf(`proof.gate.${detail}Msg`, t("proof.gate.unavailableMsg"))}
      action={{ label: t("proof.gate.retry"), onClick: () => refetch() }}
      secondary={{ label: t("proof.gate.close"), onClick: () => tgApp()?.close?.() }} />;
  }
  // A task the leader submitted is as shut as a closed day — and the page must
  // say WHICH, because «kun yopilgan» on a task they closed themselves an hour
  // ago reads as a fault in the app rather than the rule they just used.
  if (data?.task_closed) {
    return <ErrorScreen icon={Lock} tone="neutral" title={t("proof.gate.taskClosed")}
      message={t("proof.gate.taskClosedMsg")}
      action={{ label: t("proof.gate.close"), onClick: () => tgApp()?.close?.() }} />;
  }
  if (dayClosed) {
    return <ErrorScreen icon={Lock} tone="neutral" title={t("proof.gate.dayClosed")}
      message={t("proof.gate.dayClosedMsg")}
      action={{ label: t("proof.gate.close"), onClick: () => tgApp()?.close?.() }} />;
  }

  // The next camera task that still needs shots. `siblings` arrives ordered by
  // task id — the same order as the bot menu — so "next" means the same thing
  // in both places.
  const nextTask = (data.siblings || [])
    .find((sib) => sib.id !== task.id && sib.have < sib.min_media) || null;
  const goTask = (id) => {
    setViewing(null);
    setRetakeSlot(null);
    discardShot();
    setTaskId(id);
    // Keep the URL honest, so a reload lands on the task actually on screen.
    const u = new URL(window.location.href);
    u.searchParams.set("task", String(id));
    window.history.replaceState(null, "", u.toString());
  };

  const late = task.date_check && task.time_check && !inWindow(clock, task.window);
  const stamp = stampText(mode === "review" && shot ? shot.ms : clock);
  const done = complete && !queued.length;
  // The shape of the picture on screen, and the box it gets. ONE geometry for
  // the viewfinder, the frozen shot and the stamp — so the frame the leader
  // composes in is the frame that reaches the register.
  const ar = (mode === "review" ? shot?.ar : mode === "slot" ? viewAR : camAR)
    || camAR || 3 / 4;
  const fit = fitBox(frame.w, frame.h, ar);

  return (
    <div className="fixed inset-0 flex flex-col select-none"
      style={{
        background: "#0b0d10", color: "#fff",
        paddingTop: "var(--tg-safe-top)", paddingBottom: "var(--tg-safe-bottom)",
      }}>

      {/* Header — who am I shooting for, and how far along. Always visible, in
          every state, because "wrong task" is the one mistake this page could
          make that nobody would notice until the score came out. */}
      <header className="flex items-center gap-3 px-3 h-14 shrink-0"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.10)" }}>
        <button type="button" onClick={() => tgApp()?.close?.()}
          aria-label={t("proof.gate.close")}
          className="grid place-items-center rounded-full shrink-0"
          style={{ width: 36, height: 36, background: "rgba(255,255,255,0.10)" }}>
          <X size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold leading-tight">{task.name}</div>
          <div className="text-[11px] leading-tight" style={{ color: "rgba(255,255,255,0.6)" }}>
            {data.leader?.name} · {data.day?.date}
          </div>
        </div>
        <div className="shrink-0 rounded-full px-2.5 py-1 text-[13px] font-bold tabular-nums"
          style={{
            background: done ? "rgba(34,197,94,0.18)" : "rgba(255,255,255,0.10)",
            color: done ? "#4ade80" : "#fff",
          }}>
          {photos.length}/{need}
        </div>
      </header>

      {/* Frame — viewfinder, frozen shot, or one already-taken photo.

          The picture box is built to the exact shape of what the camera
          stores, so the viewfinder is not a crop of the file: what the leader
          frames is what lands on the register, and the stamp sits on that same
          box. It used to be a full-bleed element sized in percentages inside an
          auto grid row — the box silently grew to the video's own height, the
          leader saw a vertical slice of their shot, and the stamp was pushed
          below the clip where nobody ever saw it. */}
      <div ref={setFrameEl}
        className="relative flex-1 min-h-0 overflow-hidden flex items-center justify-center">
        <div className="relative overflow-hidden"
          style={{ width: fit.w || "100%", height: fit.h || "100%" }}>
          {/* The viewfinder stays MOUNTED in every state, hidden rather than
              removed. Unmounting it for the review shot dropped the camera on
              the floor: React built a fresh <video> on the way back to live,
              nothing re-attached the stream to it, and the second shot was
              being aimed at a black rectangle. */}
          <video ref={setVideoEl} playsInline muted autoPlay
            className="absolute inset-0 w-full h-full object-contain"
            style={{
              transform: facing === "user" ? "scaleX(-1)" : undefined,
              visibility: mode === "live" ? "visible" : "hidden",
            }} />
          {mode === "review" && shot ? (
            <img src={shot.url} alt=""
              className="absolute inset-0 w-full h-full object-contain" />
          ) : mode === "slot" && viewing ? (
            <ShotImg id={viewing.id} late={lateMode} onAspect={setViewAR}
              className="absolute inset-0 w-full h-full object-contain" />
          ) : null}

          {mode !== "slot" ? <StampMark text={stamp} boxW={fit.w} boxH={fit.h} /> : null}
        </div>

        {/* Black is the one thing this screen must never mean two things at
            once. A viewfinder still opening, a camera that opened and sent
            nothing, and a working camera pointed at something dark were all
            the same rectangle — so the first two now say which they are. */}
        {camBusy && !camErr && mode === "live" ? (
          <div className="absolute inset-0 grid place-items-center p-6 text-center"
            style={{ background: "rgba(11,13,16,0.72)" }}>
            <div className="flex flex-col items-center gap-2.5">
              <Loader2 size={26} className="animate-spin" />
              <div className="text-[13px]" style={{ color: "rgba(255,255,255,0.75)" }}>
                {t("proof.cam.opening")}
              </div>
              {/* Past OPEN_SLOW_MS, why. A silent black rectangle is what sends
                  a leader back to the bot to open the task again — and that new
                  page is one more holder of the camera they are waiting for. */}
              {camSlow ? (
                <div className="text-[12px] leading-snug max-w-[17rem]"
                  style={{ color: "rgba(255,255,255,0.55)" }}>
                  {t("proof.cam.openingSlow")}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {camErr && mode === "live" ? (
          <div className="absolute inset-0 grid place-items-center p-6 text-center"
            style={{ background: "rgba(11,13,16,0.94)" }}>
            <div className="max-w-xs">
              <div className="mx-auto mb-3 grid place-items-center rounded-2xl"
                style={{ width: 48, height: 48, background: "rgba(239,68,68,0.16)" }}>
                {camErr === "stalled"
                  ? <ImageOff size={22} color="#ef4444" />
                  : <Camera size={22} color="#ef4444" />}
              </div>
              <div className="text-[15px] font-semibold mb-1.5">
                {t(`proof.cam.${camErr}`)}
              </div>
              <p className="text-[13px] leading-relaxed mb-4"
                style={{ color: "rgba(255,255,255,0.65)" }}>
                {t(`proof.cam.${camErr}Msg`)}
              </p>
              <Button size="lg" onClick={() => startCamera(facing, "retry button")}>
                <RefreshCw size={16} /> {t("proof.cam.retry")}
              </Button>
              {/* Said only once the server HAS the report: reassurance for a
                  send that has not happened is a promise the page cannot keep. */}
              {reported ? (
                <p className="mt-3 text-[11px]" style={{ color: "rgba(255,255,255,0.5)" }}>
                  {t("proof.cam.reported")}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Standing warnings. Both are ABOUT THE NEXT SHOT, so they sit on the
            viewfinder where the decision is made — not in a toast that is gone
            by the time the shutter is pressed. */}
        <div className="absolute top-2 left-0 right-0 flex flex-col items-center gap-1.5 px-3">
          {!online ? (
            <Banner tone="warn" icon={<WifiOff size={13} />} text={t("proof.offline")} />
          ) : null}
          {/* A late filing says so where the decision is made. It replaces the
              ordinary out-of-window banner rather than stacking on it: that one
              warns you are ABOUT to shoot outside the hours, which here is no
              longer news — the hours are gone, and what the leader needs to
              know is that this earns nothing until two people say otherwise. */}
          {lateMode ? (
            <Banner tone="warn" icon={<Clock size={13} />}
              text={t("proof.late.banner").replace("{t}", task?.deadline || "—")} />
          ) : late && mode === "live" ? (
            <Banner tone="warn" icon={<Clock size={13} />}
              text={t("proof.lateNow").replace("{lo}", task.window[0]).replace("{hi}", task.window[1])} />
          ) : null}
          {queued.length ? (
            <Banner tone="info" icon={<Loader2 size={13} className="animate-spin" />}
              text={t("proof.queuedN").replace("{n}", queued.length)} />
          ) : null}
        </div>
      </div>

      {/* Controls. Exactly one primary per state. */}
      <div className="shrink-0" style={{ borderTop: "1px solid rgba(255,255,255,0.10)" }}>
        {mode === "live" ? (
          <>
            <Roll photos={photos} queued={queued} need={need} cap={cap} late={lateMode}
              active={retakeSlot} t={t}
              onPick={(p) => { setViewAR(0); setViewing(p); setMode("slot"); }}
              onCancelRetake={() => setRetakeSlot(null)}
              onAdd={() => { setRetakeSlot(null); toast.info(t("proof.addHint")); }} />
            <div className="grid grid-cols-3 items-center px-4 pb-3 pt-1">
              <button type="button" onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))}
                aria-label={t("proof.flip")} disabled={devices.length < 2}
                className="justify-self-start grid place-items-center rounded-full disabled:opacity-30"
                style={{ width: 44, height: 44, background: "rgba(255,255,255,0.10)" }}>
                <SwitchCamera size={20} />
              </button>

              {/* `capture` returns without a word when no frame has arrived,
                  so a shutter that still looks armed is a button that silently
                  does nothing — the exact complaint this screen produced. */}
              <button type="button" onClick={capture} disabled={!!camErr || camBusy || !camAR}
                aria-label={t("proof.shoot")}
                className="justify-self-center grid place-items-center rounded-full transition-transform active:scale-95 disabled:opacity-30"
                style={{ width: 72, height: 72, background: "#fff", boxShadow: "0 0 0 4px rgba(255,255,255,0.22)" }}>
                <span className="rounded-full" style={{ width: 56, height: 56, background: "var(--brand)" }} />
              </button>

              <button type="button" onClick={() => setShowRule(true)}
                aria-label={t("proof.rule")}
                className="justify-self-end grid place-items-center rounded-full"
                style={{ width: 44, height: 44, background: "rgba(255,255,255,0.10)" }}>
                <Info size={20} />
              </button>
            </div>
            <p className="pb-2 text-center text-[11px] px-4"
              style={{ color: "rgba(255,255,255,0.55)" }}>
              {retakeSlot != null
                ? t("proof.retakingSlot").replace("{n}", retakeSlot + 1)
                : lateMode
                  ? (photos.length ? t("proof.late.doneHint") : t("proof.late.needHint"))
                  : done ? t("proof.doneHint")
                    : t("proof.needHint").replace("{n}", Math.max(0, need - photos.length - queued.length))}
            </p>
            {lateMode ? (
              photos.length ? (
                <div className="px-4 pb-3">
                  {/* Closing the app is the WHOLE action here: the reason is
                      written in the chat and the filing is sent from there, so
                      the button says where the leader is going rather than
                      «Tayyor», which would read as «submitted». No sibling
                      hop either — leaving now with the reason unwritten would
                      strand the shots. */}
                  <Button size="lg" variant="success" className="w-full"
                    onClick={() => tgApp()?.close?.()}>
                    <Check size={17} /> {t("proof.late.finish")}
                  </Button>
                </div>
              ) : null
            ) : done ? (
              <div className="px-4 pb-3 space-y-2">
                {/* Going back to Telegram, finding the menu, tapping the next
                    task, answering «Ha» and tapping the camera again is five
                    taps to do the thing they are already here to do. The next
                    unfinished camera task is offered where they finish the last
                    one. */}
                {nextTask ? (
                  <Button size="lg" variant="secondary" className="w-full justify-between"
                    onClick={() => goTask(nextTask.id)}>
                    <span className="truncate">
                      {t("proof.nextTask")}: {nextTask.name} ({nextTask.have}/{nextTask.min_media})
                    </span>
                    <ArrowRight size={16} />
                  </Button>
                ) : null}
                <Button size="lg" variant="success" className="w-full"
                  onClick={() => tgApp()?.close?.()}>
                  <Check size={17} /> {t("proof.finish")}
                </Button>
              </div>
            ) : null}
          </>
        ) : mode === "review" ? (
          <div className="flex items-center gap-2 px-4 py-3">
            <Button size="lg" variant="secondary" className="flex-1"
              onClick={discardShot} disabled={saving}>
              <RotateCcw size={17} /> {t("proof.retake")}
            </Button>
            <Button size="lg" className="flex-[1.4]" loading={saving} onClick={saveShot}>
              <Check size={17} /> {t("proof.save")}
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-4 py-3">
            <Button size="lg" variant="secondary" className="flex-1"
              onClick={() => { setViewing(null); setMode("live"); }}>
              {t("proof.back")}
            </Button>
            {viewing && viewing.slot >= need ? (
              <Button size="lg" variant="danger" tint
                onClick={() => setConfirm({ photo: viewing })}>
                <Trash2 size={16} />
              </Button>
            ) : null}
            <Button size="lg" className="flex-[1.2]" disabled={!viewing}
              onClick={() => {
                setRetakeSlot(viewing?.slot ?? null);
                setViewing(null);
                setMode("live");
              }}>
              <RotateCcw size={17} /> {t("proof.retakeThis")}
            </Button>
          </div>
        )}
      </div>

      {/* What this task's photo has to prove, and by when. Behind an ⓘ rather
          than on the viewfinder: it is reference, and the viewfinder belongs to
          the shot. */}
      {showRule ? (
        <div className="fixed inset-0 z-[80] flex items-end"
          style={{ background: "rgba(0,0,0,0.6)" }} onClick={() => setShowRule(false)}>
          <div className="w-full rounded-t-2xl p-4"
            style={{ background: "var(--bg-card)", color: "var(--text-1)",
              paddingBottom: "calc(1rem + var(--tg-safe-bottom))" }}
            onClick={(e) => e.stopPropagation()}>
            <div className="text-[15px] font-semibold mb-2">{task.name}</div>
            {/* The leader's own instruction. `criteria` is the GRADER's text —
                English prose since 19.09 — so it is only the fallback, for a
                session served before the backend carried a description. */}
            {(task.description || task.criteria) ? (
              <p className="text-[13px] leading-relaxed mb-3" style={{ color: "var(--text-2)" }}>
                {task.description || task.criteria}
              </p>
            ) : null}
            <ul className="text-[13px] space-y-1.5 mb-4" style={{ color: "var(--text-2)" }}>
              <li>📸 {t("proof.rule.count").replace("{n}", need).replace("{cap}", cap)}</li>
              {task.date_check && task.time_check ? (
                <li>🕒 {t("proof.rule.window").replace("{lo}", task.window[0]).replace("{hi}", task.window[1])}</li>
              ) : (
                <li>🕒 {t("proof.rule.noWindow")}</li>
              )}
              <li>🔒 {t("proof.rule.stamp")}</li>
            </ul>
            <Button size="lg" className="w-full" onClick={() => setShowRule(false)}>
              {t("proof.rule.ok")}
            </Button>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={!!confirm}
        tone="danger"
        title={t("proof.deleteTitle")}
        message={t("proof.deleteMsg")}
        confirmLabel={t("proof.deleteConfirm")}
        error={confirm?.error}
        onCancel={() => setConfirm(null)}
        onConfirm={() => doDelete(confirm.photo)}
      />
      {toast.node}
    </div>
  );
}

function Banner({ tone, icon, text }) {
  const c = tone === "warn"
    ? { bg: "rgba(234,179,8,0.20)", fg: "#fde047", bd: "rgba(234,179,8,0.45)" }
    : { bg: "rgba(59,130,246,0.20)", fg: "#93c5fd", bd: "rgba(59,130,246,0.45)" };
  return (
    <div className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
      style={{ background: c.bg, color: c.fg, border: `1px solid ${c.bd}` }}>
      {icon}<span>{text}</span>
    </div>
  );
}
