import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check, X, Camera, ImagePlus, Settings2, ShieldAlert, ShieldQuestion,
  XCircle, TimerOff, CircleSlash, Gavel, CheckCircle2, PencilLine, Lock,
  Clock, CalendarCheck, Percent, Images, ChevronDown, MessagesSquare, Timer,
  RotateCcw, Trash2, ExternalLink, Loader2, Circle,
} from "lucide-react";
import api from "../../utils/api";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import FormField from "../ui/FormField";
import SegmentedToggle from "../ui/SegmentedToggle";
import ConfirmDialog from "../ui/ConfirmDialog";
import Lightbox from "../ui/Lightbox";
import { UploadDropzone } from "../ui/UploadDropzone";
import { SkeletonBlock } from "../ui/Skeleton";
import { CommentsThread } from "../ui/CommentsModal";
import { useLang } from "../../context/LangContext";
import { showReason } from "../../utils/leaderReason";
import VerdictBlock from "./VerdictBlock";
import { BotPhoto, ExamplePhoto, LateDraftPhoto, OwnRollPhoto, ReportPhoto } from "./ProofPhoto";
import { hexA, pick } from "./DayReportView";
import {
  C_OK, C_BAD, C_WARN, C_WAIT, clock, disputeChip, lateChip, leftText, urgency, KIND_ICON,
} from "./checklistShared";
import { put, errText } from "./checklistText";

/**
 * One task of the «Chek-list» tab, opened — everything that can be done with
 * it and everything that was decided about it, in one sheet.
 *
 * It reads top to bottom in the order a leader needs it: what state the task
 * is in (the banner), what judged it (the verdict), what they can do about it
 * (the objection or the late proof), what they handed in (the evidence), and
 * — for a task still to do — the answer itself, with the rule and the example
 * beside it rather than on another tab.
 *
 * Filing writes through the web door (`/api/leader-checklist/*`), which calls
 * the same cores the bot does. The answer is ONE step behind a confirm: on a
 * unit that submits task by task, «Topshirish» saves and submits together,
 * because a leader here has the photos in hand and means to hand them in. A
 * camera task is never uploaded: it opens the in-app camera and comes back.
 */


// Photos leave the device scaled to the archive's own ceiling (Telegram keeps
// 2560 px) and as JPEG: a phone screenshot is often a 3 MB PNG, and the one
// thing the reviewer needs from it — legible figures — survives this intact.
const MAX_EDGE = 2560;
async function shrink(file) {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.type === "image/jpeg" && file.size < 2.5e6) return file;
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(bmp.width * scale));
    c.height = Math.max(1, Math.round(bmp.height * scale));
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.9));
    if (!blob) return file;
    const base = String(file.name || "photo").replace(/\.[^.]+$/, "");
    return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
  } catch {
    // A format the browser cannot decode (HEIC outside Safari) goes as it is;
    // the server re-encodes what it can and refuses, by name, what it cannot.
    return file;
  }
}

let seq = 0;
/** Picked images, as objects the page can preview and remove before sending. */
function usePicked(max) {
  const [items, setItems] = useState([]);
  const itemsRef = useRef(items);
  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => () => itemsRef.current.forEach((i) => URL.revokeObjectURL(i.url)), []);
  const add = useCallback(async (files) => {
    const imgs = Array.from(files || []).filter((f) => f && String(f.type || "").startsWith("image/"));
    if (!imgs.length) return 0;
    const room = Math.max(0, max - itemsRef.current.length);
    const take = imgs.slice(0, room);
    const shrunk = await Promise.all(take.map(shrink));
    setItems((prev) => [...prev, ...shrunk.map((f) => ({
      id: `p${++seq}`, file: f, url: URL.createObjectURL(f),
    }))].slice(0, max));
    return imgs.length - take.length;           // how many did not fit
  }, [max]);
  const remove = (id) => setItems((prev) => {
    const hit = prev.find((i) => i.id === id);
    if (hit) URL.revokeObjectURL(hit.url);
    return prev.filter((i) => i.id !== id);
  });
  return { items, add, remove };
}

/** The picked images, as a grid of removable thumbnails plus the drop area. */
function PhotoPicker({ picked, max, T, onZoom, busy, extra = null }) {
  const [warn, setWarn] = useState("");
  const full = picked.items.length >= max;
  const onFiles = async (files) => {
    const left = await picked.add(files);
    setWarn(left > 0 ? put(T.tooMany, { max }) : "");
  };
  // A screenshot on a computer is pasted, not saved and picked — Ctrl+V anywhere
  // in the open sheet lands it here.
  useEffect(() => {
    const onPaste = (e) => {
      const files = Array.from(e.clipboardData?.files || []).filter((f) => f.type.startsWith("image/"));
      if (files.length) { e.preventDefault(); onFiles(files); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });
  return (
    <div className="space-y-2">
      {(picked.items.length > 0 || extra) && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {extra}
          {picked.items.map((p) => (
            <div key={p.id} className="relative aspect-square rounded-lg overflow-hidden"
              style={{ border: "1px solid var(--border)" }}>
              <img src={p.url} alt="" className="w-full h-full object-cover cursor-zoom-in"
                onClick={() => onZoom(p.url)} />
              <button type="button" onClick={() => picked.remove(p.id)} disabled={busy}
                aria-label={T.removePhoto} title={T.removePhoto}
                className="absolute top-1 right-1 w-7 h-7 rounded-full grid place-items-center"
                style={{ background: "rgba(0,0,0,0.6)", color: "#fff" }}>
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      {!full && (
        <UploadDropzone accept={{ "image/*": [] }} multiple busy={busy} onFiles={onFiles}
          label={T.dropLabel} activeLabel={T.dropActive} busyLabel={T.dropBusy}
          hint={T.dropHint} className="[&>div]:py-5" />
      )}
      {warn && <p className="text-[11px]" style={{ color: C_WARN }}>{warn}</p>}
    </div>
  );
}

function Section({ title, icon: Icon, children, innerRef }) {
  return (
    <section ref={innerRef} className="space-y-2">
      {title && (
        <h3 className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5"
          style={{ color: "var(--text-4)" }}>
          {Icon && <Icon size={12} />}{title}
        </h3>
      )}
      {children}
    </section>
  );
}

function Banner({ color, Icon, title, message, spin }) {
  return (
    <div className="rounded-xl px-3 py-2.5 flex items-start gap-2.5"
      style={{ background: hexA(color, 0.1), border: `1px solid ${hexA(color, 0.3)}` }} role="status">
      <Icon size={18} className={`flex-shrink-0 mt-0.5 ${spin ? "animate-spin" : ""}`} style={{ color }} />
      <div className="min-w-0">
        <p className="text-[13px] font-semibold leading-snug" style={{ color: "var(--text-1)" }}>{title}</p>
        {message && (
          <p className="text-[12px] leading-snug mt-0.5 break-words" style={{ color: "var(--text-2)" }}>{message}</p>
        )}
      </div>
    </div>
  );
}

function Fact({ icon: Icon, label, value, color }) {
  return (
    <div className="flex items-start gap-2 min-w-0">
      <Icon size={14} className="flex-shrink-0 mt-0.5" style={{ color: "var(--text-4)" }} />
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-4)" }}>{label}</p>
        <p className="text-[13px] font-semibold leading-snug break-words" style={{ color: color || "var(--text-1)" }}>{value}</p>
      </div>
    </div>
  );
}

/** What an automatic check would read RIGHT NOW — asked when the sheet opens. */
function AutoLive({ view, task, T }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["cl-auto-live", view.leader?.id, task.id, view.cell],
    queryFn: () => api.get("/api/leader-checklist/auto-live", {
      params: { task: task.id, leader: view.leader?.id, cell: view.cell ?? undefined },
    }).then((r) => r.data),
    staleTime: 30000,
  });
  if (isLoading) return <SkeletonBlock className="w-full rounded-xl" style={{ height: 64 }} />;
  if (isError || !data || data.error) {
    return <p className="text-[12px]" style={{ color: "var(--text-3)" }}>{T.autoLiveErr}</p>;
  }
  const f = data.facts || {};
  const lines = [];
  if (data.code === "no_sap_code") lines.push([C_BAD, T.lvNoSap]);
  else if (data.check === "plan_staffing") {
    lines.push([f.with_plan > 0 ? C_OK : C_BAD, put(T.lvPlan, { a: f.with_plan ?? 0, b: f.lines ?? 0 })]);
    const untyped = f.untyped || [];
    lines.push(untyped.length
      ? [C_BAD, put(T.lvUntyped, { codes: untyped.slice(0, 8).join(", ") })]
      : [C_OK, T.lvPeopleOk]);
  } else if (data.check === "plan_pct") {
    const pct = Number(f.pct ?? 0);
    lines.push([pct >= (data.target || 50) ? C_OK : C_WARN,
      put(T.lvPct, { pct: f.pct ?? 0, target: data.target || 50 })]);
  } else if (data.check === "concerns") {
    const n = Number(f.found ?? 0);
    lines.push([n > 0 ? C_OK : C_BAD, put(T.lvConcerns, { n })]);
  }
  return (
    <div className="rounded-xl px-3 py-2.5 space-y-1.5" style={{ background: "var(--bg-inner)" }}>
      <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-4)" }}>{T.autoLive}</p>
      {lines.map(([color, text]) => (
        <p key={text} className="text-[12px] flex items-start gap-1.5 leading-snug" style={{ color: "var(--text-2)" }}>
          {color === C_OK ? <CheckCircle2 size={13} className="flex-shrink-0 mt-0.5" style={{ color }} />
            : <Circle size={13} className="flex-shrink-0 mt-0.5" style={{ color }} />}
          {text}
        </p>
      ))}
    </div>
  );
}

// ── the late proof ───────────────────────────────────────────────────────────

function LateSheet({ view, task, T, onClose, onView, toast }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const cam = task.kind === "camera";
  const max = Math.max(1, task.maxMedia || 4);
  const picked = usePicked(max);
  const [reason, setReason] = useState("");
  const [zoom, setZoom] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // Shots the in-app camera already put on this task's DRAFT roll — the same
  // store the bot's late screen and the camera page write to.
  const { data: sess, refetch } = useQuery({
    queryKey: ["cl-late-session", view.leader?.id, task.id, view.cell],
    queryFn: () => api.get("/api/leader-proof/session", {
      params: { leader: view.leader?.id, task: task.id, late: 1, cell: view.cell ?? undefined },
    }).then((r) => r.data),
    enabled: cam,
  });
  const drafts = (sess?.mode === "late" ? sess.photos : null) || [];
  const have = drafts.length + picked.items.length;
  const ok = have >= 1 && reason.trim().length >= 3 && !busy;

  const shootInApp = async () => {
    setErr("");
    try {
      await api.post("/api/leader-checklist/late/start",
        { leader: view.leader?.id, cell: view.cell, task: task.id });
      const back = `/leaders?tab=checklist&open=${task.id}&focus=late`;
      nav(`/proof/camera?leader=${view.leader?.id}&task=${task.id}${view.cell ? `&cell=${view.cell}` : ""}`
        + `&late=1&back=${encodeURIComponent(back)}`);
    } catch (e) {
      setErr(errText(e, T));
    }
  };

  const send = async () => {
    setBusy(true);
    setErr("");
    try {
      const fd = new FormData();
      fd.append("leader", String(view.leader?.id));
      if (view.cell) fd.append("cell", String(view.cell));
      fd.append("task", String(task.id));
      fd.append("reason", reason.trim());
      for (const p of picked.items) fd.append("files", p.file, p.file.name || "photo.jpg");
      const r = await api.post("/api/leader-checklist/late", fd);
      onView(r.data.view);
      // The «Kechikkan isbotlar» tab's badge counts off this queue.
      qc.invalidateQueries({ queryKey: ["leader-late-proofs"] });
      toast.success(T.lateOk);
      onClose(true);
    } catch (e) {
      setErr(errText(e, T));
      refetch();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open zIndex={60} onClose={() => onClose(false)} dismissable={!have && !reason}
      title={T.lateT} subtitle={`№${task.id}`} icon={<Timer size={18} />}
      footer={(
        <>
          <Button variant="secondary" onClick={() => onClose(false)} disabled={busy}>{T.cancel}</Button>
          <Button onClick={send} disabled={!ok} loading={busy}>{T.lateSend}</Button>
        </>
      )}>
      <p className="text-[12px] leading-snug rounded-xl px-3 py-2.5"
        style={{ background: hexA(C_WARN, 0.1), color: "var(--text-2)" }}>
        {T.lateIntro}
      </p>
      <Section title={T.latePhotosLbl} icon={Images}>
        {cam && (
          <Button variant="secondary" tint size="lg" className="w-full" onClick={shootInApp}>
            <Camera size={15} /> {T.lateCam}
          </Button>
        )}
        <PhotoPicker picked={picked} max={Math.max(0, max - drafts.length)} T={T} onZoom={setZoom} busy={busy}
          extra={drafts.map((d) => (
            <div key={`d${d.id}`} className="aspect-square">
              <LateDraftPhoto id={d.id} T={T} thumb className="" onClick={setZoom} />
            </div>
          ))} />
        {drafts.length > 0 && (
          <p className="text-[11px]" style={{ color: "var(--text-3)" }}>{put(T.lateShot, { n: drafts.length })}</p>
        )}
        {!have && <p className="text-[11px]" style={{ color: "var(--text-3)" }}>{T.lateNeed}</p>}
      </Section>
      <FormField label={T.lateReason} required>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={800}
          placeholder={T.lateReasonPh}
          className="w-full rounded-xl px-3 py-2 text-[16px] sm:text-sm outline-none resize-y"
          style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-1)" }} />
      </FormField>
      {err && <p className="text-[12px]" style={{ color: C_BAD }} role="alert">{err}</p>}
      <Lightbox src={zoom} onClose={() => setZoom("")} />
    </Modal>
  );
}

// ── the sheet ────────────────────────────────────────────────────────────────

export default function ChecklistTaskSheet({ view, task, focus, T, onClose, onView, onRefetch, toast }) {
  const { lang, t } = useLang();
  const nav = useNavigate();
  const qc = useQueryClient();
  const rights = view.rights || {};
  const perTask = !!view.perTask;
  const name = pick(task.name, lang) || `№${task.id}`;
  const isDraft = task.state === "draft";
  const isOpen = task.state === "open";
  const timeUp = isOpen && task.pastDue && perTask;
  const fileable = !!rights.file && (isOpen || isDraft) && task.kind !== "auto" && !task.locked;
  const canAnswer = fileable && isOpen && !timeUp;
  const max = Math.max(1, task.maxMedia || 4);
  const picked = usePicked(max);
  // A camera task the leader has already started shooting opens on «done».
  const [answer, setAnswer] = useState(
    task.kind === "camera" && task.roll?.count ? "yes" : null);   // "yes" | "no"
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ask, setAsk] = useState(null);                   // submit | restart | reopen | empty
  const [zoom, setZoom] = useState("");
  const [howOpen, setHowOpen] = useState(canAnswer);
  // The sheet is short-lived; the moment it opened is the clock its one
  // countdown is read against.
  const [now] = useState(() => Date.now());
  const [lateOpen, setLateOpen] = useState(focus === "late" && !!task.late?.eligible);
  const objRef = useRef(null);
  const lateRef = useRef(null);

  useEffect(() => {
    const el = focus === "object" ? objRef.current : focus === "late" ? lateRef.current : null;
    if (el) setTimeout(() => el.scrollIntoView({ block: "start", behavior: "smooth" }), 60);
  }, [focus]);

  const dirty = picked.items.length > 0 || reason.trim().length > 0;
  const needPhotos = task.kind === "screenshot" ? Math.max(1, task.minMedia || 0) : 0;
  const valid = answer === "no" ? reason.trim().length >= 3
    : answer === "yes" ? (task.kind === "screenshot" ? picked.items.length >= needPhotos
      : task.kind === "none")
      : false;

  // ── writes ─────────────────────────────────────────────────────────────────
  const post = async (fn, okText, close = true) => {
    setBusy(true);
    setErr("");
    try {
      const r = await fn();
      if (r?.data?.view) onView(r.data.view); else onRefetch();
      // The register reads CLOSED days, and a submission can close one. Marked
      // stale rather than refetched now: it is the heaviest read on the page,
      // and it refreshes itself the next time the reader looks at it.
      qc.invalidateQueries({ queryKey: ["leaders"], refetchType: "none" });
      if (okText) toast.success(okText);
      setAsk(null);
      if (close) onClose();
    } catch (e) {
      setErr(errText(e, T));
      onRefetch();
    } finally {
      setBusy(false);
    }
  };
  const base = { leader: view.leader?.id, cell: view.cell, task: task.id };
  const sendAnswer = () => post(() => {
    const fd = new FormData();
    fd.append("leader", String(view.leader?.id));
    if (view.cell) fd.append("cell", String(view.cell));
    fd.append("task", String(task.id));
    fd.append("done", answer === "yes" ? "1" : "0");
    fd.append("submit", perTask ? "1" : "0");
    if (answer === "no") fd.append("reason", reason.trim());
    if (answer === "yes") for (const p of picked.items) fd.append("files", p.file, p.file.name || "photo.jpg");
    return api.post("/api/leader-checklist/answer", fd);
  }, perTask ? (answer === "yes" && task.kind !== "none" ? T.submitOk : T.submitNoOk) : T.saveOk);
  const submitDraft = () => post(() => api.post("/api/leader-checklist/submit", base),
    task.done && (task.media?.length || task.kind === "camera") ? T.submitOk : T.submitNoOk);
  const restart = () => post(() => api.post("/api/leader-checklist/reset", base), T.restartOk, false);
  const reopen = (wipe) => post(() => api.post("/admin/leader-tasks/task/reopen",
    { day_id: view.day?.id, task_id: task.id, wipe }), wipe ? T.admEmptyOk : T.admOk, false);

  const openCamera = () => {
    const back = `/leaders?tab=checklist&open=${task.id}`;
    nav(`/proof/camera?leader=${view.leader?.id}&task=${task.id}${view.cell ? `&cell=${view.cell}` : ""}`
      + `&back=${encodeURIComponent(back)}`);
  };

  // ── what state it is in ────────────────────────────────────────────────────
  const banner = (() => {
    switch (task.state) {
      case "draft":
        return perTask
          ? { color: C_WARN, Icon: PencilLine, title: T.bDraftT, message: T.bDraftM }
          : { color: C_WAIT, Icon: PencilLine, title: T.bDraftDayT, message: T.bDraftDayM };
      case "pending":
        return { color: C_WAIT, Icon: Loader2, spin: true, title: T.bPendingT, message: T.bPendingM };
      case "passed":
        return task.admin?.done
          ? { color: C_OK, Icon: CheckCircle2, title: T.bPassedAdminT, message: task.admin.by || "" }
          : { color: C_OK, Icon: CheckCircle2, title: T.bPassedT,
              message: task.closedAt ? put(T.submittedAt, { time: clock(task.closedAt) }) : "" };
      case "autopass":
        return { color: C_OK, Icon: CheckCircle2, title: T.bAutoPassT };
      case "rejected":
        return { color: C_BAD, Icon: ShieldAlert, title: T.bRejectedT,
                 message: task.objectable ? T.bRejectedM : "" };
      case "autofail":
        return { color: C_BAD, Icon: XCircle, title: T.bAutoFailT,
                 message: task.objectable ? T.bAutoFailM : "" };
      case "expired":
        return { color: C_BAD, Icon: TimerOff, title: T.bExpiredT,
                 message: showReason(task.reason, T.missedLine) || put(T.bExpiredM, { time: task.closesAt }) };
      case "notdone":
        return { color: C_BAD, Icon: XCircle, title: T.bNotdoneT,
                 message: task.reason ? `${T.reasonShown}: ${task.reason}` : "" };
      case "missing":
        return { color: C_BAD, Icon: CircleSlash, title: T.bMissingT };
      case "ruledout":
        return { color: C_BAD, Icon: Gavel, title: T.bRuledoutT, message: task.admin?.by || "" };
      case "open":
        if (task.kind === "auto") return null;
        if (task.notStarted) {
          return { color: C_WAIT, Icon: Lock, title: put(T.bNotStartedT, { time: clock(task.startsAt) }),
                   message: T.bNotStartedM };
        }
        if (timeUp) {
          return { color: C_BAD, Icon: TimerOff, title: T.bTimeUpT,
                   message: put(T.bTimeUpM, { time: task.closesAt }) };
        }
        return null;
      default:
        return null;
    }
  })();

  const KindIcon = KIND_ICON[task.kind] || ImagePlus;
  const kindLabel = { camera: T.kindCam, screenshot: T.kindShot, auto: T.kindAuto, none: T.kindNone }[task.kind];
  const u = urgency(task, now);
  const photoRule = task.kind === "screenshot" || task.kind === "camera"
    ? (!task.dateCheck ? T.ruleNone
      : task.dayCheck === false ? put(T.ruleTime, { from: task.window?.[0], to: task.window?.[1] })
        : task.timeCheck === false ? T.ruleDay
          : put(T.ruleWindowV, { from: task.window?.[0], to: task.window?.[1] }))
    : null;
  const media = task.media || [];
  const rollIds = task.roll?.ids || [];
  const sheetPhotos = task.photos || [];
  const showVerdict = !!task.review || (task.kind === "auto" && ["autofail", "autopass"].includes(task.state));
  const dc = disputeChip(task.dispute, T);
  const lc = lateChip(task.late?.proof, T);
  const camReady = task.kind === "camera" && isDraft;

  const footer = canAnswer ? (
    <>
      <Button variant="secondary" onClick={() => onClose()} disabled={busy}>{T.cancel}</Button>
      <Button disabled={!valid || busy} loading={busy}
        onClick={() => (perTask ? setAsk("submit") : sendAnswer())}>
        {perTask ? T.submit : T.save}
      </Button>
    </>
  ) : isDraft && fileable && perTask ? (
    <>
      <Button variant="secondary" onClick={() => onClose()} disabled={busy}>{T.close}</Button>
      <Button onClick={() => setAsk("submit")} loading={busy} disabled={busy}>{T.submit}</Button>
    </>
  ) : (
    <Button variant="secondary" onClick={() => onClose()}>{T.close}</Button>
  );

  return (
    <>
      <Modal open onClose={() => onClose()} dismissable={!dirty && !busy} maxWidth="max-w-lg"
        title={`№${task.id} · ${name}`}
        subtitle={[kindLabel, task.weight ? `${T.ruleWeight} ${task.weight}%` : null].filter(Boolean).join(" · ")}
        icon={<KindIcon size={18} />} footer={footer}>
        {banner && <Banner {...banner} />}

        {/* What judged it — the AI's words, or the automatic check's hour and
            numbers. The reader decides whether to object on THIS. */}
        {showVerdict && (
          <VerdictBlock rev={task.review} autoReason={task.kind === "auto" ? task.reason : null}
            autoFacts={task.auto?.facts} />
        )}

        {/* The objection — written right here, as the first message of the
            chat it opens with the brigadir and the admins. */}
        {task.objectable && view.uid && (
          <Section title={T.objT} icon={ShieldQuestion} innerRef={objRef}>
            <p className="text-[12px] leading-snug" style={{ color: "var(--text-2)" }}>
              {task.kind === "auto" ? T.objIntroAuto : T.objIntro}
            </p>
            <div className="rounded-xl overflow-hidden flex flex-col"
              style={{ border: "1px solid var(--border)", background: "var(--bg-card)" }}>
              <CommentsThread
                endpoint={`/api/leaders/report/${encodeURIComponent(view.uid)}/dispute`}
                queryKey={["cl-object", view.uid, task.id]}
                listEnabled={false}
                postFields={{ task_id: task.id }}
                textField="reason"
                requireText
                minText={3}
                attachments
                placeholder={task.kind === "auto" ? T.objPhAuto : T.objPh}
                emptyText={T.objEmpty}
                refreshKeys={[["leader-disputes"], ["leaderDayReport", view.uid]]}
                onPosted={() => { toast.success(T.objSent); onRefetch(); }}
              />
            </div>
          </Section>
        )}
        {task.dispute && (
          <Section title={T.objT} icon={ShieldQuestion} innerRef={task.objectable ? null : objRef}>
            <div className="rounded-xl px-3 py-2.5 space-y-2" style={{ background: "var(--bg-inner)" }}>
              {dc && (
                <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold"
                  style={{ background: hexA(dc.color, 0.12), color: dc.color }}>
                  <ShieldQuestion size={11} />{dc.text}
                </span>
              )}
              {task.dispute.reason && (
                <p className="text-[12px] leading-snug" style={{ color: "var(--text-2)" }}>«{task.dispute.reason}»</p>
              )}
              {task.dispute.id && (
                <Button size="md" tint variant={task.dispute.canAct ? "primary" : "secondary"} className="w-full"
                  onClick={() => nav(`/leaders/appeal/dispute/${task.dispute.id}`)}>
                  <MessagesSquare size={13} /> {task.dispute.canAct ? T.yourTurn : T.openChat}
                </Button>
              )}
            </div>
          </Section>
        )}

        {/* The late door, for a task whose own hour has gone by. */}
        {task.late && (task.late.proof || (task.late.eligible && rights.file)) && (
          <Section title={T.lateT} icon={Timer} innerRef={lateRef}>
            {task.late.proof ? (
              <div className="rounded-xl px-3 py-2.5 space-y-2" style={{ background: "var(--bg-inner)" }}>
                {lc && (
                  <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold"
                    style={{ background: hexA(lc.color, 0.12), color: lc.color }}>
                    <Timer size={11} />{lc.text}
                  </span>
                )}
                {task.late.proof.reason && (
                  <p className="text-[12px] leading-snug" style={{ color: "var(--text-2)" }}>«{task.late.proof.reason}»</p>
                )}
                <Button size="md" tint variant="secondary" className="w-full"
                  onClick={() => nav(`/leaders/appeal/late/${task.late.proof.id}`)}>
                  <MessagesSquare size={13} /> {T.openChat}
                </Button>
              </div>
            ) : (
              <>
                <p className="text-[12px] leading-snug" style={{ color: "var(--text-2)" }}>{T.lateIntro}</p>
                <Button size="lg" variant="secondary" tint className="w-full" onClick={() => setLateOpen(true)}>
                  <Timer size={15} /> {T.lateOpen}
                </Button>
              </>
            )}
          </Section>
        )}

        {/* What was handed in. */}
        {(media.length > 0 || sheetPhotos.length > 0 || (rollIds.length > 0 && !isOpen)) && (
          <Section title={T.evidence} icon={Images}>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {media.map((id) => (
                <div key={`m${id}`} className="aspect-square">
                  <BotPhoto id={id} T={T} thumb className="" onClick={setZoom} />
                </div>
              ))}
              {sheetPhotos.map((url) => (
                <div key={url} className="aspect-square">
                  <ReportPhoto src={url} uid={view.uid} T={T} thumb className="" onClick={setZoom} />
                </div>
              ))}
            </div>
          </Section>
        )}
        {/* What a draft currently says — the answer that «Topshirish» hands in. */}
        {isDraft && (
          <p className="text-[12px] leading-snug" style={{ color: "var(--text-2)" }}>
            <b>{T.answerLbl}:</b> {task.done ? T.yes : T.no}
            {!task.done && task.reason ? ` — ${task.reason}` : ""}
          </p>
        )}

        {/* The automatic check: no photo, the job is done on its own page. */}
        {task.kind === "auto" && (
          <Section title={T.autoT} icon={Settings2}>
            <p className="text-[12px] leading-snug" style={{ color: "var(--text-2)" }}>
              {put(T.autoM, { time: task.auto?.hour || task.closesAt })}
            </p>
            {view.isToday && isOpen && <AutoLive view={view} task={task} T={T} />}
            {task.auto?.page && (
              <Button size="lg" variant="secondary" tint className="w-full" onClick={() => nav(task.auto.page)}>
                <ExternalLink size={14} /> {t(task.auto.page === "/concerns" ? "nav.concerns" : "nav.production")}
              </Button>
            )}
          </Section>
        )}

        {/* The rule, at a glance. */}
        {task.kind !== "auto" && (view.isToday || isDraft) && (
          <div className="grid grid-cols-2 gap-3 rounded-xl px-3 py-3" style={{ background: "var(--bg-inner)" }}>
            {task.closesAt && (
              <Fact icon={Clock} label={T.ruleDeadline}
                value={isOpen && task.dueAt && !task.pastDue
                  ? `${put(T.by, { time: task.closesAt })} · ${leftText(Date.parse(task.dueAt) - now, T)}`
                  : put(T.by, { time: task.closesAt })}
                color={isOpen ? u.color : undefined} />
            )}
            {photoRule && <Fact icon={CalendarCheck} label={T.ruleWindow} value={photoRule} />}
            {(task.kind === "screenshot" || task.kind === "camera") && task.minMedia > 0 && (
              <Fact icon={Images} label={T.rulePhotos} value={put(T.rulePhotosV, { n: task.minMedia })} />
            )}
            {task.weight > 0 && <Fact icon={Percent} label={T.ruleWeight} value={`${task.weight}%`} />}
          </div>
        )}

        {/* ── the answer ─────────────────────────────────────────────────── */}
        {canAnswer && (
          <Section title={T.q}>
            <SegmentedToggle fill value={answer} onChange={setAnswer}
              options={[
                { value: "yes", label: <span className="inline-flex items-center gap-1.5"><Check size={14} />{T.yes}</span> },
                { value: "no", label: <span className="inline-flex items-center gap-1.5"><X size={14} />{T.no}</span> },
              ]} />
            {answer === "yes" && task.kind === "screenshot" && (
              <FormField label={T.photosLbl} required
                hint={put(T.photosNeed, { n: needPhotos, max })}>
                <PhotoPicker picked={picked} max={max} T={T} onZoom={setZoom} busy={busy} />
              </FormField>
            )}
            {answer === "yes" && task.kind === "camera" && (
              <div className="rounded-xl px-3 py-3 space-y-2.5" style={{ background: "var(--bg-inner)" }}>
                <p className="text-[13px] font-semibold flex items-center gap-1.5" style={{ color: "var(--text-1)" }}>
                  <Camera size={15} style={{ color: "var(--brand-text)" }} /> {T.camT}
                </p>
                <p className="text-[12px] leading-snug" style={{ color: "var(--text-3)" }}>{T.camM}</p>
                {rollIds.length > 0 && (
                  <>
                    <div className="grid grid-cols-4 gap-2">
                      {rollIds.map((id) => (
                        <div key={id} className="aspect-square">
                          <OwnRollPhoto id={id} T={T} thumb className="" onClick={setZoom} />
                        </div>
                      ))}
                    </div>
                    <p className="text-[11px] tabular-nums" style={{ color: "var(--text-3)" }}>
                      {put(T.camHave, { k: task.roll?.count || 0, n: task.minMedia })}
                    </p>
                  </>
                )}
                <Button size="lg" className="w-full" onClick={openCamera}>
                  <Camera size={15} /> {rollIds.length ? T.camMore : T.camOpen}
                </Button>
              </div>
            )}
            {answer === "yes" && task.kind === "none" && (
              <p className="text-[12px]" style={{ color: "var(--text-3)" }}>{T.noProof}</p>
            )}
            {answer === "no" && (
              <FormField label={T.reasonLbl} required>
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={800}
                  placeholder={T.reasonPh}
                  className="w-full rounded-xl px-3 py-2 text-[16px] sm:text-sm outline-none resize-y"
                  style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-1)" }} />
              </FormField>
            )}
          </Section>
        )}

        {/* A draft: ready to submit, or to start over. */}
        {isDraft && fileable && (
          <div className="flex items-center justify-between gap-2 flex-wrap">
            {camReady && <p className="text-[12px] font-semibold" style={{ color: C_OK }}>{T.camReady}</p>}
            <Button size="md" variant="ghost" tint className="ml-auto" disabled={busy}
              onClick={() => setAsk("restart")}>
              <RotateCcw size={13} /> {T.restart}
            </Button>
          </div>
        )}

        {/* How to do it, and what a right proof looks like. */}
        {task.kind !== "auto" && (task.description || task.examples?.length > 0) && (
          <Section>
            <button type="button" onClick={() => setHowOpen((o) => !o)} aria-expanded={howOpen}
              className="w-full flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider"
              style={{ color: "var(--text-4)" }}>
              {T.howTo}
              <ChevronDown size={13} className="transition-transform ml-auto"
                style={{ transform: howOpen ? "rotate(180deg)" : "none" }} />
            </button>
            {howOpen && (
              <>
                {task.description && (
                  <p className="text-[13px] leading-relaxed whitespace-pre-line" style={{ color: "var(--text-2)" }}>
                    {task.description}
                  </p>
                )}
                {task.examples?.length > 0 && (
                  <>
                    <p className="text-[10px] font-bold uppercase tracking-wider pt-1" style={{ color: "var(--text-4)" }}>
                      {T.examples}
                    </p>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {task.examples.map((id) => (
                        <div key={id} className="aspect-square">
                          <ExamplePhoto id={id} T={T} thumb className="" onClick={setZoom} />
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </Section>
        )}

        {/* The admin's way back into a submission — the bot's own two. */}
        {rights.admin && view.day?.id && task.locked && task.kind !== "auto" && view.source === "bot" && (
          <Section title={T.adminT}>
            <div className="flex gap-2 flex-wrap">
              <Button size="md" variant="secondary" tint onClick={() => setAsk("reopen")} disabled={busy}>
                <RotateCcw size={13} /> {T.admReopen}
              </Button>
              <Button size="md" variant="danger" tint onClick={() => setAsk("empty")} disabled={busy}>
                <Trash2 size={13} /> {T.admEmpty}
              </Button>
            </div>
          </Section>
        )}

        {err && !ask && <p className="text-[12px]" style={{ color: C_BAD }} role="alert">{err}</p>}
        <Lightbox src={zoom} onClose={() => setZoom("")} />
      </Modal>

      <ConfirmDialog open={ask === "submit"}
        title={T.submitT}
        message={(isDraft ? !task.done : answer === "no") ? T.submitNoM : T.submitM}
        confirmLabel={T.submit} loading={busy} error={ask === "submit" ? (err || null) : null}
        onCancel={() => { setAsk(null); setErr(""); }}
        onConfirm={() => (isDraft ? submitDraft() : sendAnswer())} />
      <ConfirmDialog open={ask === "restart"} tone="danger"
        title={T.restartT} message={T.restartM} confirmLabel={T.restart}
        loading={busy} error={ask === "restart" ? (err || null) : null}
        onCancel={() => { setAsk(null); setErr(""); }} onConfirm={restart} />
      <ConfirmDialog open={ask === "reopen"}
        title={T.admReopenT} message={T.admReopenM} confirmLabel={T.admReopen}
        loading={busy} error={ask === "reopen" ? (err || null) : null}
        onCancel={() => { setAsk(null); setErr(""); }} onConfirm={() => reopen(false)} />
      <ConfirmDialog open={ask === "empty"} tone="danger"
        title={T.admEmptyT} message={T.admEmptyM} confirmLabel={T.admEmpty}
        loading={busy} error={ask === "empty" ? (err || null) : null}
        onCancel={() => { setAsk(null); setErr(""); }} onConfirm={() => reopen(true)} />

      {lateOpen && (
        <LateSheet view={view} task={task} T={T} toast={toast} onView={onView}
          onClose={(sent) => { setLateOpen(false); if (sent) onClose(); }} />
      )}
    </>
  );
}
