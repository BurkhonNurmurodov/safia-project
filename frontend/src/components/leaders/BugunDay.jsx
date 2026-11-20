import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Camera, ImagePlus, CheckSquare, Settings2, ChevronRight, ChevronDown, TimerOff,
  ShieldAlert, Flag, Lock, CheckCircle2, Info, MessageSquarePlus, ShieldQuestion,
  ListTodo, UserCheck, PencilLine,
} from "lucide-react";
import api from "../../utils/api";
import Button from "../ui/Button";
import { useLang } from "../../context/LangContext";
import { useAuth } from "../../context/AuthContext";
import { usePageAccess } from "../../hooks/usePageAccess";
import { useCapabilities } from "../../hooks/useCapabilities";
import { canAccessPage } from "../../config/pages";
import { useFactoryParams } from "../../context/FactoryContext";
import { CATEGORY_COLORS } from "../../utils/chartPalette";
import { hexA, pick } from "./DayReportView";
import { put } from "./checklistText";
import { useBugunT } from "./bugunText";
import {
  C_BAD, C_WARN, GROUP_OF, STATE_LOOK, KIND_ICON, groupOfTask, leftText, urgency, rowMeta,
  clock, disputeChip, lateChip, cameraPath, ink,
} from "./checklistShared";

/**
 * «Bugun» — the leader's own day, on a phone (the leader-phone redesign,
 * 2026-11-20, plan §4). The «Chek-list» tab re-cut for the one reader who
 * files it, in the order the shift asks for it:
 *
 *   the day's ring («Qoldi n») · the NEXT task, big, with its one action ·
 *   later today · missed with the late window open (ONE group, the rule said
 *   once) · rejected, objectable · the system's own checks (one quiet strip) ·
 *   closed (folded) · what else waits on the leader (an inbox of counts).
 *
 * Insight: a leader opens the app on the floor, between two jobs, with one
 * question — what do I owe right now, and is anyone waiting on me? Concept:
 * the next task IS the screen; everything else is a short list under it.
 *
 * Same payload, same sheet, same cores as the tab (`Checklist.jsx` renders
 * this in place of its own body) — nothing here decides a state or a score.
 * Desktop and every other viewer keep the tab as it was.
 */

// «Bugun»'s identity hue (plan §4, «Life»): blue, on its progress marks only —
// never a status. The inbox rows wear their own areas' hues.
const BLUE = CATEGORY_COLORS[2];
const HUE = {
  concerns: CATEGORY_COLORS[4],   // «Havotirlar» orange
  objections: CATEGORY_COLORS[7], // «Natijam» pink — objections live there
  tasks: CATEGORY_COLORS[8],      // «Rahbariyat vazifalari» indigo
  kelish: CATEGORY_COLORS[6],     // «Ish grafigi» teal
};

const NO_PARAMS = {};
const card = { background: "var(--bg-card)", border: "1px solid var(--border)" };

// ── the ring ─────────────────────────────────────────────────────────────────

function Ring({ left, done, total, B }) {
  const size = 76, stroke = 7;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = total > 0 ? Math.min(1, Math.max(0, done / total)) : 0;
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}
      role="img" aria-label={put(B.leftAria, { n: left })}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-inner)" strokeWidth={stroke} />
        {frac > 0 && (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={BLUE} strokeWidth={stroke}
            strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - frac)}
            style={{ transition: "stroke-dashoffset 600ms ease" }} />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none" aria-hidden>
        <span className="text-[22px] font-extrabold tabular-nums" style={{ color: "var(--text-1)" }}>{left}</span>
        <span className="text-[12px] mt-1" style={{ color: "var(--text-3)" }}>{B.left}</span>
      </div>
    </div>
  );
}

// ── one row ──────────────────────────────────────────────────────────────────

function Row({ name, Icon, iconColor, tinted, meta, metaColor, extra, onClick }) {
  return (
    <li>
      <button type="button" onClick={onClick}
        className="w-full min-h-[56px] flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[var(--hover-bg)] focus-visible:outline-2 focus-visible:outline-[var(--brand)]">
        <span className="w-9 h-9 rounded-xl grid place-items-center flex-shrink-0"
          style={{ background: tinted ? hexA(iconColor, 0.14) : "var(--bg-inner)", color: iconColor }}>
          <Icon size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold leading-snug break-words" style={{ color: "var(--text-1)" }}>
            {name}
          </span>
          {meta && (
            <span className="block mt-0.5 text-[12px] leading-snug break-words" style={{ color: metaColor || "var(--text-3)" }}>
              {meta}
            </span>
          )}
          {extra}
        </span>
        <ChevronRight size={18} className="flex-shrink-0" style={{ color: "var(--text-4)" }} />
      </button>
    </li>
  );
}

function Tag({ color, children }) {
  return (
    <span className="mt-1 inline-flex items-center rounded-md px-1.5 py-0.5 text-[12px] font-semibold"
      style={{ background: hexA(color, 0.12), color: ink(color) }}>
      {children}
    </span>
  );
}

/** A group that asks for something — its marker is the ONE place it is red. */
function AskGroup({ Icon, title, count, line, children }) {
  return (
    <section className="rounded-2xl overflow-hidden" style={card} aria-label={title}>
      <div className="flex items-center gap-3 px-4 pt-3.5 pb-2.5">
        <span className="w-9 h-9 rounded-xl grid place-items-center flex-shrink-0"
          style={{ background: hexA(C_BAD, 0.14), color: C_BAD }}>
          <Icon size={18} />
        </span>
        <span className="min-w-0">
          <span className="block text-[15px] font-bold leading-tight" style={{ color: "var(--text-1)" }}>
            {title} <span className="tabular-nums font-semibold" style={{ color: "var(--text-3)" }}>{count}</span>
          </span>
          {line && <span className="block text-[12px] mt-0.5" style={{ color: "var(--text-2)" }}>{line}</span>}
        </span>
      </div>
      <ul className="divide-y divide-[var(--border)]" style={{ borderTop: "1px solid var(--border)" }}>{children}</ul>
    </section>
  );
}

/** A quiet folded strip — the system's checks, the closed tasks. */
function Fold({ Icon, title, count, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="w-full min-h-[52px] flex items-center gap-3 px-4 text-left transition-colors hover:bg-[var(--hover-bg)]">
        <Icon size={18} className="flex-shrink-0" style={{ color: "var(--text-3)" }} />
        <span className="flex-1 text-[14px] font-semibold" style={{ color: "var(--text-2)" }}>
          {title} <span className="tabular-nums" style={{ color: "var(--text-3)" }}>· {count}</span>
        </span>
        <ChevronDown size={18} className="flex-shrink-0 transition-transform"
          style={{ color: "var(--text-3)", transform: open ? "rotate(180deg)" : "none" }} />
      </button>
      {open && (
        <ul className="divide-y divide-[var(--border)]" style={{ borderTop: "1px solid var(--border)" }}>{children}</ul>
      )}
    </div>
  );
}

// ── what else waits on the leader ────────────────────────────────────────────

/**
 * Four counts, each from the page it jumps to — the SAME request (and the
 * same react-query key) that page makes, so the number here and the list
 * there are one answer, and a visit to either warms the other. Asked only
 * for pages this leader may open; a failure hides its row (never a «0»).
 */
function useInbox() {
  const { auth } = useAuth();
  const { access } = usePageAccess();
  const { capPages, deniedPages } = useCapabilities();
  const may = (k) => canAccessPage(auth?.role, k, access, capPages, deniedPages);
  const kelishParams = useFactoryParams(NO_PARAMS);
  const opts = { retry: false, staleTime: 60_000, refetchOnWindowFocus: true };

  // /cell-concerns «Tahlil»'s own read, unfiltered: `open` = todo + doing.
  const concerns = useQuery({
    queryKey: ["cell-concerns", "stats", {}, ""],
    queryFn: () => api.get("/api/cell-concerns/stats", { params: {} }).then((r) => r.data),
    enabled: may("cell-concerns"), ...opts,
  });
  // «Norozliklar» without a period — the queue's own bare key (AppealQueue).
  const disputes = useQuery({
    queryKey: ["leader-disputes"],
    queryFn: () => api.get("/api/leaders/disputes", { params: {} }).then((r) => r.data),
    enabled: may("leaders"), ...opts,
  });
  // /tasks' board: a leader's is their own queue and nothing above it.
  const tasks = useQuery({
    queryKey: ["task-board"],
    queryFn: () => api.get("/api/tasks/board").then((r) => r.data),
    enabled: may("tasks"), ...opts,
  });
  // «Ish grafigi»'s cell list: each cell's NEXT list and how far it is marked.
  const kelish = useQuery({
    queryKey: ["kelish-cells", kelishParams],
    queryFn: () => api.get("/api/kelish/cells", { params: kelishParams }).then((r) => r.data),
    enabled: may("kelish"), ...opts,
  });

  return useMemo(() => {
    const out = [];
    const nConcerns = concerns.data ? Number(concerns.data.open || 0) : 0;
    if (nConcerns > 0) {
      out.push({ key: "concerns", Icon: MessageSquarePlus, hue: HUE.concerns, n: nConcerns,
        to: "/cell-concerns?tab=register", label: "inConcerns", sub: "inConcernsSub" });
    }
    const nObj = (disputes.data?.items || []).filter((it) => Number(it.chat?.unread || 0) > 0).length;
    if (nObj > 0) {
      out.push({ key: "objections", Icon: ShieldQuestion, hue: HUE.objections, n: nObj,
        to: "/leaders?tab=disputes", label: "inObjections", sub: "inObjectionsSub" });
    }
    const nTasks = (tasks.data?.data || []).filter((r) => r.status !== "done").length;
    if (nTasks > 0) {
      out.push({ key: "tasks", Icon: ListTodo, hue: HUE.tasks, n: nTasks, to: "/tasks",
        label: "inTasks", sub: "inTasksSub" });
    }
    const nKelish = (kelish.data?.cells || [])
      .filter((c) => c.can_edit && c.progress?.total)
      .reduce((s, c) => s + Number(c.progress.none || 0), 0);
    if (nKelish > 0) {
      out.push({ key: "kelish", Icon: UserCheck, hue: HUE.kelish, n: nKelish, to: "/kelish",
        label: "inKelish", sub: "inKelishSub" });
    }
    return out;
  }, [concerns.data, disputes.data, tasks.data, kelish.data]);
}

function Inbox({ B }) {
  const nav = useNavigate();
  const rows = useInbox();
  if (!rows.length) return null;
  const go = (r) => {
    // The register is a tab of /cell-concerns that the page keeps in
    // localStorage («Havotir yozish» by default) — the jump means the register.
    if (r.key === "concerns") {
      try { localStorage.setItem("cellConcerns.tab", JSON.stringify("register")); } catch { /* private mode */ }
    }
    nav(r.to);
  };
  return (
    <section aria-label={B.inboxT}>
      <h3 className="px-1 mb-2 text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
        {B.inboxT}
      </h3>
      <ul className="rounded-2xl overflow-hidden divide-y divide-[var(--border)]" style={card}>
        {rows.map((r) => (
          <li key={r.key}>
            <button type="button" onClick={() => go(r)}
              className="w-full min-h-[56px] flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[var(--hover-bg)]">
              <span className="w-9 h-9 rounded-xl grid place-items-center flex-shrink-0"
                style={{ background: hexA(r.hue, 0.14), color: r.hue }}>
                <r.Icon size={18} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[14px] font-semibold leading-snug" style={{ color: "var(--text-1)" }}>
                  {B[r.label]}
                </span>
                <span className="block text-[12px] leading-snug" style={{ color: "var(--text-3)" }}>{B[r.sub]}</span>
              </span>
              <span className="text-[16px] font-bold tabular-nums" style={{ color: "var(--text-1)" }}>{r.n}</span>
              <ChevronRight size={18} className="flex-shrink-0" style={{ color: "var(--text-4)" }} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── the day ──────────────────────────────────────────────────────────────────

export default function BugunDay({ view, T, now, onOpen, onFinish, onCloseDay }) {
  const B = useBugunT();
  const { lang } = useLang();
  const nav = useNavigate();
  const fileRef = useRef(null);
  const perTask = !!view.perTask;
  const fin = view.finishDay;
  const lateBy = fin?.label || (view.shift === 2 ? "12:00" : "24:00");

  const parts = useMemo(() => {
    const tasks = view.tasks || [];
    const lateOpen = (t) => !!t.late?.eligible && !t.late?.proof;
    // A JUDGE refused it (the AI, the automatic check, an admin) — as opposed
    // to the clock, whose «objection» is about a deadline (`objectionKind`).
    const judged = (t) => !!t.rejectedBy || t.state === "rejected" || t.state === "autofail";
    // Missed, and something can still be done: a late proof while the window
    // is open, else an objection to the deadline. One sent already → closed.
    const missed = tasks.filter((t) => lateOpen(t) || (t.objectable && !judged(t) && !t.late?.proof));
    const rejected = tasks.filter((t) => !missed.includes(t) && t.objectable && judged(t));
    const taken = new Set([...missed, ...rejected].map((t) => t.id));
    const system = tasks.filter((t) => t.kind === "auto" && !taken.has(t.id));
    for (const t of system) taken.add(t.id);
    const dayDraft = (t) => !perTask && t.state === "draft";
    const todo = tasks
      .filter((t) => !taken.has(t.id) && groupOfTask(t) === "todo" && !(perTask && t.pastDue))
      .sort((a, b) => {
        // The nearest deadline first — «Next» is the next task DUE. A draft
        // waiting for «Topshirish» goes before an untouched task of the same
        // hour (the platform submits a draft itself at its deadline, so it is
        // never the more urgent of two). A day-mode unit: an answered task is
        // done until the day closes — last.
        const ra = !perTask && a.state === "draft" ? 1 : 0;
        const rb = !perTask && b.state === "draft" ? 1 : 0;
        const da = a.dueAt ? Date.parse(a.dueAt) : Infinity;
        const db = b.dueAt ? Date.parse(b.dueAt) : Infinity;
        return ra - rb || da - db || (b.state === "draft") - (a.state === "draft") || a.id - b.id;
      });
    for (const t of todo) taken.add(t.id);
    const order = ["rejected", "failed", "checking", "done", "todo"];
    const closed = tasks.filter((t) => !taken.has(t.id))
      .sort((a, b) => order.indexOf(GROUP_OF[a.state] || "todo") - order.indexOf(GROUP_OF[b.state] || "todo")
        || a.id - b.id);
    const next = todo.find((t) => !t.notStarted && !dayDraft(t)) || todo.find((t) => t.notStarted) || null;
    const later = todo.filter((t) => t !== next);
    const left = todo.filter((t) => !dayDraft(t)).length;
    const total = tasks.filter((t) => t.kind !== "auto").length;
    byDue(missed);
    return { next, later, missed, rejected, system, closed, left, total };
  }, [view, perTask]);
  const { next, later, missed, rejected, system, closed, left, total } = parts;

  const name = (t) => pick(t.name, lang) || `№${t.id}`;
  const running = view.running;

  // ── the next task ──────────────────────────────────────────────────────────
  let nextCard = null;
  if (next) {
    const due = next.dueAt ? Date.parse(next.dueAt) : null;
    const u = urgency(next, now);
    const mins = due != null ? (due - now) / 60000 : null;
    const start = next.startsAt ? Date.parse(next.startsAt) : null;
    const span = due != null && start != null && due > start ? due - start : 4 * 3600000;
    const frac = due != null ? Math.min(1, Math.max(0, (due - now) / span)) : 0;
    const barColor = mins != null && mins <= 60 ? u.color : BLUE;
    const isDraft = next.state === "draft";
    const roll = next.kind === "camera" && next.roll?.count ? next.roll.count : 0;
    let action = null;
    if (next.notStarted) {
      // Before its hour there is nothing to do yet — the card says when.
    } else if (isDraft) {
      action = (
        <Button size="lg" className="w-full h-12" style={{ fontSize: 15, borderRadius: 12 }}
          onClick={() => onOpen(next.id)}>
          {T.submit}
        </Button>
      );
    } else if (next.kind === "camera") {
      action = (
        <Button size="lg" className="w-full h-12" style={{ fontSize: 15, borderRadius: 12 }}
          onClick={() => nav(cameraPath(view, next.id))}>
          <Camera size={18} /> {roll ? put(B.shootRoll, { k: roll, n: next.minMedia || 1 }) : B.shoot}
        </Button>
      );
    } else if (next.kind === "screenshot") {
      action = (
        <>
          <Button size="lg" className="w-full h-12" style={{ fontSize: 15, borderRadius: 12 }}
            onClick={() => fileRef.current?.click()}>
            <ImagePlus size={18} /> {B.pick}
          </Button>
          {/* Picked here, in the tap itself (a picker opened later is one a
              WebView may refuse); the photos land in the task's sheet, ready
              for «Topshirish». */}
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" tabIndex={-1}
            aria-hidden onChange={(e) => {
              const files = Array.from(e.target.files || []);
              e.target.value = "";
              if (files.length) onOpen(next.id, null, files);
            }} />
        </>
      );
    } else {
      action = (
        <Button size="lg" className="w-full h-12" style={{ fontSize: 15, borderRadius: 12 }}
          onClick={() => onOpen(next.id)}>
          <CheckSquare size={18} /> {T.yes}
        </Button>
      );
    }
    nextCard = (
      <section className="rounded-2xl p-4 space-y-3" style={card} aria-label={B.nextT}>
        <button type="button" onClick={() => onOpen(next.id)} className="block w-full text-left">
          <span className="flex items-baseline justify-between gap-3">
            <span className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
              {B.nextT}
            </span>
            {next.closesAt && (
              <span className="text-[13px] font-semibold tabular-nums flex-shrink-0"
                style={{ color: next.notStarted ? "var(--text-3)" : ink(u.color) }}>
                {put(T.by, { time: next.closesAt })}
              </span>
            )}
          </span>
          <span className="mt-1.5 block text-[19px] font-bold leading-snug break-words" style={{ color: "var(--text-1)" }}>
            {name(next)}
          </span>
          {isDraft && (
            <span className="mt-1 flex items-center gap-1.5 text-[12px]" style={{ color: ink(C_WARN) }}>
              <PencilLine size={13} /> {T.draft}
            </span>
          )}
        </button>
        {next.notStarted ? (
          <p className="flex items-center gap-2 text-[13px] font-semibold" style={{ color: "var(--text-2)" }}>
            <Lock size={15} style={{ color: "var(--text-3)" }} /> {put(T.opens, { time: clock(next.startsAt) })}
          </p>
        ) : due != null ? (
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "var(--bg-inner)" }}
              role="progressbar" aria-label={put(T.left, { t: leftText(due - now, T) })}
              aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(frac * 100)}>
              <div className="h-full rounded-full transition-[width] duration-700"
                style={{ width: `${frac * 100}%`, background: barColor }} />
            </div>
            <span className="text-[13px] font-semibold tabular-nums flex-shrink-0" style={{ color: ink(u.color) }}>
              {put(T.left, { t: leftText(due - now, T) })}
            </span>
          </div>
        ) : null}
        {action}
      </section>
    );
  }

  // ── a row of each kind ─────────────────────────────────────────────────────
  const todoRow = (t) => {
    const Icon = KIND_ICON[t.kind] || ImagePlus;
    const u = urgency(t, now);
    const roll = t.kind === "camera" && t.roll?.count ? ` · ${t.roll.count}/${t.minMedia || 1}` : "";
    const meta = t.notStarted ? put(T.opens, { time: clock(t.startsAt) })
      : t.state === "draft" ? (perTask ? T.draft : T.savedDay)
        : t.closesAt ? put(T.by, { time: t.closesAt }) + roll : "";
    const color = t.notStarted || t.state === "draft" ? "var(--text-3)" : ink(u.color);
    return (
      <Row key={t.id} name={name(t)} Icon={Icon} iconColor="var(--text-2)" meta={meta} metaColor={color}
        onClick={() => onOpen(t.id)} />
    );
  };
  // Asked-for rows say WHAT happened in plain grey: the group's marker is red,
  // the rows are not (C1 — nine red lines read as a wall).
  const askRow = (focus) => (t) => (
    <Row key={t.id} name={name(t)} Icon={KIND_ICON[t.kind] || ImagePlus} iconColor="var(--text-2)"
      meta={rowMeta(t, T, now, perTask).text} onClick={() => onOpen(t.id, focus)} />
  );
  const stateRow = (t) => {
    const look = t.state === "open" && t.kind === "auto" ? { Icon: Settings2, color: "var(--text-3)" }
      : STATE_LOOK[t.state] || STATE_LOOK.open;
    const dc = disputeChip(t.dispute, T);
    const lc = lateChip(t.late?.proof, T);
    const color = typeof look.color === "string" && look.color.startsWith("#") ? look.color : null;
    return (
      <Row key={t.id} name={name(t)} Icon={look.Icon} iconColor={look.color} tinted={!!color}
        meta={rowMeta(t, T, now, perTask).text}
        extra={(dc || lc) ? (
          <span className="flex flex-wrap gap-1.5">
            {lc && <Tag color={lc.color}>{lc.text}</Tag>}
            {dc && <Tag color={dc.color}>{dc.text}</Tag>}
            {t.dispute?.canAct && <Tag color={C_WARN}>{T.yourTurn}</Tag>}
          </span>
        ) : null}
        onClick={() => onOpen(t.id)} />
    );
  };

  return (
    <div className="space-y-4">
      {/* The day, at a glance: what is left, and the score so far. */}
      <div className="flex items-center gap-4 px-1">
        <Ring left={left} done={total - left} total={total} B={B} />
        {running && (
          <div className="min-w-0">
            <p className="text-[12px] font-semibold" style={{ color: "var(--text-3)" }}>{T.runningLbl}</p>
            {running.outOf > 0 ? (
              <p className="mt-1 leading-none">
                <span className="text-[28px] font-extrabold tabular-nums" style={{ color: "var(--text-1)" }}>
                  {running.earned}
                </span>
                <span className="text-[15px] font-semibold tabular-nums" style={{ color: "var(--text-3)" }}>
                  {" "}/ {running.outOf}
                </span>
              </p>
            ) : (
              <p className="mt-1 text-[14px] font-semibold" style={{ color: "var(--text-2)" }}>{B.notScored}</p>
            )}
          </div>
        )}
      </div>
      {view.rehearsal && (
        <p className="flex items-start gap-1.5 px-1 text-[12px] leading-snug" style={{ color: "var(--text-2)" }}>
          <Info size={14} className="flex-shrink-0 mt-px" style={{ color: "var(--text-3)" }} />{T.rehearsalNote}
        </p>
      )}

      {nextCard}

      {later.length > 0 && (
        <section aria-label={B.later}>
          <h3 className="px-1 mb-2 text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
            {B.later}
          </h3>
          <ul className="rounded-2xl overflow-hidden divide-y divide-[var(--border)]" style={card}>
            {later.map(todoRow)}
          </ul>
        </section>
      )}

      {/* A unit that closes whole DAYS: one button, once every task has an answer. */}
      {view.closeDay && (
        <div className="space-y-2">
          <Button size="lg" className="w-full h-12" style={{ fontSize: 15, borderRadius: 12 }}
            disabled={!view.closeDay.ready} onClick={onCloseDay}>
            {T.closeDay}
          </Button>
          {!view.closeDay.ready && (
            <p className="px-1 text-[12px] leading-snug" style={{ color: "var(--text-3)" }}>
              {put(T.closeDayNeed, { n: view.closeDay.missing.length })}
            </p>
          )}
        </div>
      )}

      {missed.length > 0 && (
        <AskGroup Icon={TimerOff} title={B.missedT} count={missed.length}
          line={missed.some((t) => t.late?.eligible) ? put(B.lateLine, { t: lateBy }) : B.rejLine}>
          {missed.map((t) => askRow(t.late?.eligible ? "late" : "object")(t))}
        </AskGroup>
      )}

      {rejected.length > 0 && (
        <AskGroup Icon={ShieldAlert} title={T.gRejected} count={rejected.length} line={B.rejLine}>
          {rejected.map(askRow("object"))}
        </AskGroup>
      )}

      {/* The late window on a unit that submits task by task: shut it early
          once nothing else will be sent, or read that it is shut. */}
      {fin && (fin.can || fin.finishedAt || fin.held > 0) && (
        <div className="space-y-2">
          {fin.finishedAt && (
            <p className="flex items-start gap-1.5 px-1 text-[12px] leading-snug" style={{ color: "var(--text-2)" }}>
              <Flag size={14} className="flex-shrink-0 mt-px" style={{ color: "var(--text-3)" }} />
              {put(T.finishDone, { time: clock(fin.finishedAt) || "—" })}
            </p>
          )}
          {fin.held > 0 && (
            <p className="px-1 text-[12px] leading-snug" style={{ color: "var(--text-3)" }}>
              {put(T.finishHeld, { n: fin.held })}
            </p>
          )}
          {fin.can && (
            <Button size="lg" variant="secondary" className="w-full h-12" style={{ fontSize: 15, borderRadius: 12 }}
              onClick={onFinish}>
              <Flag size={16} /> {T.finishBtn}
            </Button>
          )}
        </div>
      )}

      {(system.length > 0 || closed.length > 0) && (
        <section className="rounded-2xl overflow-hidden divide-y divide-[var(--border)]" style={card}>
          {system.length > 0 && (
            <Fold Icon={Settings2} title={B.systemT} count={system.length}>
              {system.map(stateRow)}
            </Fold>
          )}
          {closed.length > 0 && (
            <Fold Icon={CheckCircle2} title={B.closedT} count={closed.length}>
              {closed.map(stateRow)}
            </Fold>
          )}
        </section>
      )}

      <Inbox B={B} />
    </div>
  );
}

function byDue(arr) {
  arr.sort((a, b) => (a.dueAt ? Date.parse(a.dueAt) : Infinity) - (b.dueAt ? Date.parse(b.dueAt) : Infinity)
    || a.id - b.id);
}
