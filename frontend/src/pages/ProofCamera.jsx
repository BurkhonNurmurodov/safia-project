import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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
import { enqueue, flush, pending } from "../utils/proofQueue";

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
// A shot's own quality. 0.92 keeps small print (a gauge, a label, a serial)
// legible for the reviewer; the server re-encodes to its own long edge anyway.
const JPEG_Q = 0.92;
const LENS_KEY = "proof.camera.lens";

// Lens words to avoid when a phone offers several rear cameras. An ultra-wide
// bends straight lines and a macro cannot focus past 10 cm — both make a
// workplace photo look like evidence of a different place. The MAIN camera is
// the one none of these words describe.
const AVOID_LENS = /(ultra|wide.?angle|tele|zoom|macro|depth|truedepth|infrared|ir\b)/i;
const PREFER_LENS = /(back camera|rear camera|camera2 0|facing back)/i;

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

/** The burnt-in mark, rendered in DOM. Sized off the frame it sits on so the
 *  preview and the stored file look the same at any resolution. */
function StampMark({ text, boxH }) {
  const size = Math.max(11, Math.round((boxH || 0) * 0.036));
  return (
    <div
      className="pointer-events-none absolute font-bold tabular-nums"
      style={{
        left: "2.8%", bottom: "2.8%",
        fontSize: size, lineHeight: 1.15,
        padding: `${size * 0.3}px ${size * 0.42}px`,
        borderRadius: size * 0.34,
        color: "#fff",
        background: "rgba(0,0,0,0.45)",
        textShadow: "0 0 3px rgba(0,0,0,0.9), 0 1px 2px rgba(0,0,0,0.9)",
        letterSpacing: "0.01em",
      }}
    >
      {text}
    </div>
  );
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
function ShotImg({ id, className, alt = "" }) {
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let obj = "";
    let alive = true;
    setFailed(false);
    setUrl("");
    api.get(`/api/leader-proof/photo/${id}`, { responseType: "blob" })
      .then((r) => {
        if (!alive) return;
        obj = URL.createObjectURL(r.data);
        setUrl(obj);
      })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; if (obj) URL.revokeObjectURL(obj); };
  }, [id]);
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
  return <img src={url} alt={alt} className={className} />;
}


/* ── the roll ─────────────────────────────────────────────────────────────── */

/**
 * Numbered slots, required ones first. A filled slot shows its thumbnail, an
 * empty required slot a dashed outline with its number, a queued one the upload
 * mark. Required and extra are visually distinct, because only extras can be
 * deleted and the strip is where that becomes obvious.
 */
function Roll({ photos, queued, need, cap, active, onPick, onAdd, t }) {
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
        const isQueued = !p && waiting.has(i);
        return (
          <button
            key={i}
            type="button"
            onClick={() => (p ? onPick(p) : null)}
            disabled={!p}
            aria-label={`${t("proof.slot")} ${i + 1}`}
            className="relative shrink-0 rounded-lg overflow-hidden grid place-items-center transition-colors"
            style={{
              width: 52, height: 52,
              border: p ? "2px solid #22c55e"
                : isQueued ? "2px solid #eab308"
                : `2px dashed ${active === i ? "var(--brand)" : "rgba(255,255,255,0.32)"}`,
              background: "rgba(255,255,255,0.06)",
            }}
          >
            {p ? (
              <>
                <ShotImg id={p.id} className="w-full h-full object-cover" />
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
  const [taskId, setTaskId] = useState(Number(params.get("task")) || null);

  const videoRef = useRef(null);
  const frameRef = useRef(null);
  const streamRef = useRef(null);
  const offsetRef = useRef(null);          // serverMs − performance.now()

  const [mode, setMode] = useState("live");   // live | review | slot
  const [shot, setShot] = useState(null);     // { url, blob, ms }
  const [viewing, setViewing] = useState(null);
  const [retakeSlot, setRetakeSlot] = useState(null);
  const [camErr, setCamErr] = useState(null);
  const [facing, setFacing] = useState("environment");
  const [devices, setDevices] = useState([]);
  const [saving, setSaving] = useState(false);
  const [queued, setQueued] = useState([]);
  const [online, setOnline] = useState(navigator.onLine);
  const [clock, setClock] = useState(Date.now());
  const [frameH, setFrameH] = useState(0);
  const [confirm, setConfirm] = useState(null);
  const [showRule, setShowRule] = useState(false);

  /* ── session: the task's rule, the roll, and the server's clock ─────────── */
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["proof-session", leaderId, taskId],
    queryFn: () => api
      .get("/api/leader-proof/session", { params: { leader: leaderId, task: taskId } })
      .then((r) => r.data),
    enabled: !!taskId,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const task = data?.task;
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
    const side = list.filter((d) => {
      const l = (d.label || "").toLowerCase();
      return want === "environment"
        ? !/front|face|user|selfie/.test(l)
        : /front|face|user|selfie/.test(l);
    });
    const pool = side.length ? side : list;
    // Modern phones expose three or four rear cameras. The plain one — no
    // "ultra", no "tele", no "macro" — is the main sensor, and it is what a
    // person means by "the camera".
    const main = pool.find((d) => PREFER_LENS.test(d.label || ""))
      || pool.find((d) => !AVOID_LENS.test(d.label || ""))
      || pool[0];
    return main?.deviceId || null;
  }, []);

  const startCamera = useCallback(async (want = facing) => {
    setCamErr(null);
    try {
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      // First pass gets permission (labels are blank until it is granted), then
      // the device list becomes readable and the right lens can be chosen.
      let stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: want }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      const list = (await navigator.mediaDevices.enumerateDevices())
        .filter((d) => d.kind === "videoinput");
      setDevices(list);
      const id = pickLens(list, want);
      if (id && stream.getVideoTracks()[0]?.getSettings?.().deviceId !== id) {
        stream.getTracks().forEach((tr) => tr.stop());
        stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: id }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
      }
      if (id) localStorage.setItem(`${LENS_KEY}.${want}`, id);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch (e) {
      setCamErr(e?.name === "NotAllowedError" ? "denied"
        : e?.name === "NotFoundError" ? "none" : "failed");
    }
  }, [facing, pickLens]);

  useEffect(() => {
    if (!task || dayClosed) return undefined;
    startCamera(facing);
    return () => streamRef.current?.getTracks().forEach((tr) => tr.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id, dayClosed, facing]);

  /* ── the frame box, so the live stamp matches the burnt one ─────────────── */
  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setFrameH(el.clientHeight));
    ro.observe(el);
    setFrameH(el.clientHeight);
    return () => ro.disconnect();
  }, [mode]);

  /* ── the offline queue ──────────────────────────────────────────────────── */
  const reloadQueue = useCallback(async () => {
    setQueued(await pending(leaderId, taskId));
  }, [leaderId, taskId]);

  const upload = useCallback((item) => {
    const fd = new FormData();
    fd.append("leader", String(item.leader));
    fd.append("task", String(item.task));
    fd.append("captured_ms", String(Math.round(item.capturedMs)));
    if (item.phoneMs) fd.append("phone_ms", String(Math.round(item.phoneMs)));
    if (item.slot != null) fd.append("slot", String(item.slot));
    fd.append("file", item.blob, "proof.jpg");
    return api.post("/api/leader-proof/photo", fd).then((r) => r.data);
  }, []);

  const drain = useCallback(async () => {
    if (!leaderId || !navigator.onLine) return;
    const res = await flush(leaderId, upload);
    await reloadQueue();
    if (res.sent) { refetch(); toast.success(t("proof.queueSent").replace("{n}", res.sent)); }
  }, [leaderId, upload, reloadQueue, refetch, toast, t]);

  useEffect(() => { reloadQueue(); }, [reloadQueue]);

  useEffect(() => {
    const up = () => { setOnline(true); drain(); };
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    if (navigator.onLine) drain();
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, [drain]);

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
      setShot({ blob, url: URL.createObjectURL(blob), ms, phoneMs: Date.now() });
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
      leader: leaderId, task: taskId, slot: retakeSlot,
      capturedMs: shot.ms, phoneMs: shot.phoneMs, blob: shot.blob,
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
      await enqueue(item);
      await reloadQueue();
      toast.warning(t("proof.queued"));
    }
    setSaving(false);
    setRetakeSlot(null);
    discardShot();
  }, [shot, saving, leaderId, taskId, retakeSlot, upload, refetch, toast, t, tf,
      reloadQueue, discardShot]);

  const doDelete = useCallback(async (photo) => {
    try {
      await api.delete(`/api/leader-proof/photo/${photo.id}`);
      await refetch();
      setViewing(null);
      setConfirm(null);
      toast.success(t("proof.deleted"));
    } catch (e) {
      setConfirm((c) => (c ? { ...c, error: t("proof.err.failed") } : c));
    }
  }, [refetch, toast, t]);

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

      {/* Frame — viewfinder, frozen shot, or one already-taken photo. One box,
          one stamp position, so the preview never disagrees with the file. */}
      <div className="relative flex-1 min-h-0 grid place-items-center overflow-hidden">
        <div ref={frameRef} className="relative w-full h-full grid place-items-center">
          {mode === "live" ? (
            <video ref={videoRef} playsInline muted autoPlay
              className="w-full h-full object-contain"
              style={{ transform: facing === "user" ? "scaleX(-1)" : undefined }} />
          ) : mode === "review" && shot ? (
            <img src={shot.url} alt="" className="w-full h-full object-contain" />
          ) : viewing ? (
            <ShotImg id={viewing.id} className="w-full h-full object-contain" />
          ) : null}

          {mode !== "slot" ? <StampMark text={stamp} boxH={frameH} /> : null}

          {camErr && mode === "live" ? (
            <div className="absolute inset-0 grid place-items-center p-6 text-center"
              style={{ background: "rgba(11,13,16,0.94)" }}>
              <div className="max-w-xs">
                <div className="mx-auto mb-3 grid place-items-center rounded-2xl"
                  style={{ width: 48, height: 48, background: "rgba(239,68,68,0.16)" }}>
                  <Camera size={22} color="#ef4444" />
                </div>
                <div className="text-[15px] font-semibold mb-1.5">
                  {t(`proof.cam.${camErr}`)}
                </div>
                <p className="text-[13px] leading-relaxed mb-4"
                  style={{ color: "rgba(255,255,255,0.65)" }}>
                  {t(`proof.cam.${camErr}Msg`)}
                </p>
                <Button size="lg" onClick={() => startCamera(facing)}>
                  <RefreshCw size={16} /> {t("proof.cam.retry")}
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        {/* Standing warnings. Both are ABOUT THE NEXT SHOT, so they sit on the
            viewfinder where the decision is made — not in a toast that is gone
            by the time the shutter is pressed. */}
        <div className="absolute top-2 left-0 right-0 flex flex-col items-center gap-1.5 px-3">
          {!online ? (
            <Banner tone="warn" icon={<WifiOff size={13} />} text={t("proof.offline")} />
          ) : null}
          {late && mode === "live" ? (
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
            <Roll photos={photos} queued={queued} need={need} cap={cap}
              active={retakeSlot} t={t}
              onPick={(p) => { setViewing(p); setMode("slot"); }}
              onAdd={() => { setRetakeSlot(null); toast.info(t("proof.addHint")); }} />
            <div className="grid grid-cols-3 items-center px-4 pb-3 pt-1">
              <button type="button" onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))}
                aria-label={t("proof.flip")} disabled={devices.length < 2}
                className="justify-self-start grid place-items-center rounded-full disabled:opacity-30"
                style={{ width: 44, height: 44, background: "rgba(255,255,255,0.10)" }}>
                <SwitchCamera size={20} />
              </button>

              <button type="button" onClick={capture} disabled={!!camErr}
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
                : done ? t("proof.doneHint")
                : t("proof.needHint").replace("{n}", Math.max(0, need - photos.length - queued.length))}
            </p>
            {done ? (
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
            {task.criteria ? (
              <p className="text-[13px] leading-relaxed mb-3" style={{ color: "var(--text-2)" }}>
                {task.criteria}
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
