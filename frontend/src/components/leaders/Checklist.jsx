import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ClipboardCheck, ClipboardList, ShieldAlert, XCircle, Hourglass, CheckCircle2,
  Circle, Lock, PencilLine, TimerOff, CircleSlash, Gavel, ShieldQuestion,
  ImagePlus, Settings2, ChevronRight, ChevronDown, MessagesSquare,
  Timer, Info, UserSearch,
} from "lucide-react";
import api from "../../utils/api";
import Button from "../ui/Button";
import SegmentedToggle from "../ui/SegmentedToggle";
import ConfirmDialog from "../ui/ConfirmDialog";
import EmptyState from "../ui/EmptyState";
import { SkeletonBlock } from "../ui/Skeleton";
import { useToast } from "../ui/Toast";
import { useLang } from "../../context/LangContext";
import { useClT, put, errText } from "./checklistText";
import { hexA, pick, scoreColor } from "./DayReportView";
import ChecklistTaskSheet from "./ChecklistTaskSheet";
import {
  C_OK, C_BAD, C_WARN, C_WAIT, GROUP_OF, KIND_ICON, DISPUTE_OPEN, leftText,
  urgency, disputeChip, lateChip, rowMeta,
} from "./checklistShared";

/**
 * The «Chek-list» tab of /leaders — ONE leader's checklist, ONE day.
 *
 * Built 2026-09-28 on the operator's rulings: a leader picks a single date;
 * TODAY they file here (the same checklist the bot's `/tasks` files — both
 * doors stay, and whatever is done in one shows in the other); a PAST day shows
 * what was accepted and what was not; a verdict appears the moment it is
 * written, and a wrong one is objected to in place. A brigadir, shift manager
 * or admin picks the leader in the page's filter and reads the same day —
 * past, present and in progress — without the controls that file it.
 *
 * Tasks are GROUPED BY WHAT IS LEFT (the operator's pick over catalog order):
 * to do → rejected → not done → being checked → accepted. A task moves between
 * groups as its state changes, so the first group is always the next thing to
 * do; inside «to do» the nearest deadline comes first.
 *
 * Nothing here computes a score or decides a state. The payload
 * (`GET /api/leader-checklist/day`) carries the day report's number for a
 * closed day, the bot menu's running figure for an open one, and each task's
 * state as `leader_close.task_state` answers it, with the human rulings the
 * register applies already folded in.
 */

const GROUPS = [
  { id: "todo", label: "gTodo", Icon: ClipboardList, color: "var(--text-2)" },
  { id: "rejected", label: "gRejected", Icon: ShieldAlert, color: C_BAD },
  { id: "failed", label: "gFailed", Icon: XCircle, color: C_BAD },
  { id: "checking", label: "gChecking", Icon: Hourglass, color: C_WAIT },
  { id: "done", label: "gDone", Icon: CheckCircle2, color: C_OK },
];

// One icon and one colour per state. Every state carries an ICON as well as a
// colour (see verifyState.js): a red dot beside a green one is not a message a
// colour-blind reader can receive.
const STATE_LOOK = {
  open: { Icon: Circle, color: C_WAIT },
  draft: { Icon: PencilLine, color: C_WARN },
  pending: { Icon: Hourglass, color: C_WAIT },
  passed: { Icon: CheckCircle2, color: C_OK },
  autopass: { Icon: CheckCircle2, color: C_OK },
  rejected: { Icon: ShieldAlert, color: C_BAD },
  autofail: { Icon: XCircle, color: C_BAD },
  expired: { Icon: TimerOff, color: C_BAD },
  notdone: { Icon: XCircle, color: C_BAD },
  missing: { Icon: CircleSlash, color: C_BAD },
  ruledout: { Icon: Gavel, color: C_BAD },
};
function haptic(kind) {
  // Inside Telegram a verdict arriving is felt as well as seen. The SDK call
  // goes through the index.html bridge shim, so a torn-down bridge is not a
  // crash; outside Telegram the object is simply absent.
  window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.(kind);
}

// ── the summary card ─────────────────────────────────────────────────────────

function Chip({ color, children, icon: Icon }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold"
      style={{ background: hexA(color, 0.12), color }}>
      {Icon && <Icon size={11} />}{children}
    </span>
  );
}

function Summary({ view, counts, T, isLeader, nm, now, onOpen }) {
  const { lang } = useLang();
  const total = view.tasks.length || 1;
  const closed = !!view.day && !view.day.open;
  const score = view.score;
  const running = view.running;
  // «Submitted» means LOCKED on a unit that submits task by task; on one that
  // closes whole days an answer is all there is until the day closes.
  const submitted = view.tasks.filter((t) => (view.perTask ? t.locked : t.answered)).length;
  const next = view.isToday && !closed
    ? view.tasks
      .filter((t) => GROUP_OF[t.state] === "todo" && t.kind !== "auto" && t.dueAt
        && !t.pastDue && Date.parse(t.dueAt) > now)
      .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt))[0]
    : null;
  const bars = [
    ["done", counts.done, C_OK, T.legDone],
    ["checking", counts.checking, C_WAIT, T.legChecking],
    ["failed", counts.rejected + counts.failed, C_BAD, T.legFailed],
    ["todo", counts.todo, "var(--border-md)", T.legTodo],
  ];
  const grey = score && (score.excluded || score.voided);
  const nothing = !view.day && !view.source && !view.isToday;

  return (
    <div className="rounded-2xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl grid place-items-center flex-shrink-0"
          style={{ background: "var(--brand-bg)", color: "var(--brand-text)" }}>
          <ClipboardCheck size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold leading-tight truncate" style={{ color: "var(--text-1)" }}>
            {isLeader ? T.mine : nm(view.leader?.name || "")}
          </p>
          {/* Separators BETWEEN parts, never before the first: a leader
              reading their own day has no unit shown, and the line opened on a
              stray «· S1». */}
          <p className="text-[12px] mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5"
            style={{ color: "var(--text-3)" }}>
            {[
              !isLeader && view.unit?.name ? <span key="u" className="truncate">{nm(view.unit.name)}</span> : null,
              view.shift != null ? <span key="s">S{view.shift}</span> : null,
              view.cell && view.cells?.length > 0
                ? <span key="c" className="tabular-nums">{view.cells.find((c) => c.id === view.cell)?.code}</span> : null,
            ].filter(Boolean).flatMap((el, i) => (i ? [<span key={`d${i}`} aria-hidden>·</span>, el] : [el]))}
          </p>
        </div>
      </div>

      {/* The number the reader came for, and what it is made of. */}
      {nothing ? (
        <div className="mt-4 rounded-xl px-3 py-3" style={{ background: "var(--bg-inner)" }}>
          <p className="text-[13px] font-semibold" style={{ color: "var(--text-2)" }}>{T.nothingT}</p>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--text-3)" }}>{T.nothingM}</p>
        </div>
      ) : (
        <>
          <div className="mt-4 flex items-end justify-between gap-3 flex-wrap">
            {closed && score ? (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-4)" }}>
                  {T.resultLbl}
                </p>
                <div className="flex items-end gap-2 mt-0.5">
                  <span className="text-4xl font-extrabold tabular-nums leading-none"
                    style={{ color: grey ? "var(--text-4)" : scoreColor(score.score) }}>
                    {score.score}%
                  </span>
                  {score.raw != null && score.raw !== score.score && (
                    <span className="text-[12px] pb-0.5" style={{ color: "var(--text-4)" }}>
                      {put(T.rawLbl, { raw: score.raw })}
                    </span>
                  )}
                </div>
              </div>
            ) : running ? (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-4)" }}>
                  {T.runningLbl}
                </p>
                <div className="flex items-end gap-1.5 mt-0.5">
                  <span className="text-4xl font-extrabold tabular-nums leading-none" style={{ color: "var(--text-1)" }}>
                    {running.earned}
                  </span>
                  <span className="text-[15px] font-semibold tabular-nums pb-0.5" style={{ color: "var(--text-3)" }}>
                    / {running.outOf}
                  </span>
                </div>
              </div>
            ) : (
              <div>
                <span className="text-4xl font-extrabold tabular-nums leading-none" style={{ color: "var(--text-1)" }}>
                  {submitted}
                </span>
                <span className="text-[15px] font-semibold tabular-nums" style={{ color: "var(--text-3)" }}>
                  {" "}/ {view.tasks.length}
                </span>
              </div>
            )}
            <span className="text-[12px] font-semibold tabular-nums pb-0.5" style={{ color: "var(--text-3)" }}>
              {put(T.submittedOf, { n: submitted, total: view.tasks.length })}
            </span>
          </div>
          {/* Under the row, not inside the score block: at full width the
              note made that block as wide as the card, which pushed «3 / 13
              topshirildi» onto a line of its own on every phone and severed it
              from the number it qualifies. */}
          {running && (
            <p className="text-[11px] mt-1.5" style={{ color: "var(--text-4)" }}>
              {put(T.runningNote, { total: running.total })}
            </p>
          )}

          {/* One bar, four parts, in the groups' own colours — the page's
              answer to «how is the day going» before anybody reads a row. */}
          <div className="mt-3 h-2.5 rounded-full overflow-hidden flex" style={{ background: "var(--bg-inner)" }}
            role="img" aria-label={bars.filter((b) => b[1]).map((b) => `${b[3]} ${b[1]}`).join(", ")}>
            {bars.map(([k, n, color]) => (n > 0 ? (
              <div key={k} style={{ width: `${(n / total) * 100}%`, background: color }}
                className="h-full transition-[width] duration-500" />
            ) : null))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            {bars.filter((b) => b[1] > 0).map(([k, n, color, label]) => (
              <span key={k} className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: "var(--text-3)" }}>
                <span className="w-2 h-2 rounded-full" style={{ background: color }} />
                {label} <b className="tabular-nums" style={{ color: "var(--text-2)" }}>{n}</b>
              </span>
            ))}
          </div>
        </>
      )}

      {next && (
        <button type="button" onClick={() => onOpen(next.id)}
          className="mt-3 w-full flex items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-[var(--hover-bg)]"
          style={{ background: "var(--bg-inner)" }}>
          <Timer size={16} style={{ color: urgency(next, now).color }} className="flex-shrink-0 mt-0.5" />
          <span className="min-w-0 flex-1">
            {/* The time left rides the label's line, so the task's name below
                gets the card's whole width instead of what a right-hand
                countdown leaves of it. */}
            <span className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-4)" }}>
                {T.nextLbl}
              </span>
              <span className="text-[12px] font-semibold tabular-nums flex-shrink-0" style={{ color: urgency(next, now).color }}>
                {leftText(Date.parse(next.dueAt) - now, T)}
              </span>
            </span>
            <span className="block text-[13px] font-semibold" style={{ color: "var(--text-1)" }}>
              {put(T.nextLine, { id: next.id, time: next.closesAt })}
            </span>
            {/* The task's name on a line of its own: sharing one truncated line
                with the number and the hour left a phone «№9 · 22:00 · Smen…»,
                i.e. the one word that says WHICH task cut to four letters. */}
            <span className="block text-[12px] leading-snug truncate" style={{ color: "var(--text-3)" }}>
              {pick(next.name, lang)}
            </span>
          </span>
        </button>
      )}

      {/* What makes this day read differently from an ordinary one. */}
      {(closed && view.isToday) && <Note>{T.dayClosedToday}</Note>}
      {view.source === "sheet" && <Note>{T.sheetNote}</Note>}
      {view.rehearsal && <Note>{T.rehearsalNote}</Note>}
      {score?.excluded && (
        <Note>{T.excludedNote}{score.excluded.reason ? ` «${score.excluded.reason}»` : ""}</Note>
      )}
      {score?.voided && <Note>{T.voidedNote}</Note>}
    </div>
  );
}

function Note({ children }) {
  return (
    <p className="mt-3 flex items-start gap-1.5 rounded-lg px-2.5 py-2 text-[12px] leading-snug"
      style={{ background: "var(--bg-inner)", color: "var(--text-2)" }}>
      <Info size={13} className="flex-shrink-0 mt-0.5" style={{ color: "var(--text-4)" }} />
      <span>{children}</span>
    </p>
  );
}

// ── one row ──────────────────────────────────────────────────────────────────

function TaskRow({ task, T, now, onOpen, rights, perTask }) {
  const { lang } = useLang();
  const nav = useNavigate();
  const disputeLive = DISPUTE_OPEN.includes(task.dispute?.status);
  const look = disputeLive ? { Icon: ShieldQuestion, color: C_WARN }
    : task.state === "open" && task.kind !== "auto" ? urgency(task, now)
      : STATE_LOOK[task.state] || STATE_LOOK.open;
  const Look = task.state === "open" && task.kind === "auto" ? Settings2 : look.Icon;
  const meta = rowMeta(task, T, now, perTask);
  const KindIcon = KIND_ICON[task.kind] || ImagePlus;
  const dc = disputeChip(task.dispute, T);
  const lc = lateChip(task.late?.proof, T);

  // The ONE thing this row can do without opening it — an objection for a
  // verdict that can still be argued, a late proof for a task whose time ran
  // out. Everything else happens in the sheet.
  let action = null;
  if (task.objectable) {
    action = (
      <Button size="sm" variant="primary" tint onClick={() => onOpen(task.id, "object")}>
        <ShieldQuestion size={12} /> {T.object}
      </Button>
    );
  } else if (task.late?.eligible && !task.late?.proof && rights.file) {
    action = (
      <Button size="sm" variant="secondary" tint onClick={() => onOpen(task.id, "late")}>
        <Timer size={12} /> {T.late}
      </Button>
    );
  }

  return (
    <li className="group">
      <button type="button" onClick={() => onOpen(task.id)}
        className="w-full flex items-start gap-3 px-3.5 sm:px-4 py-3 text-left transition-colors hover:bg-[var(--hover-bg)] focus-visible:outline-2 focus-visible:outline-[var(--brand)]">
        <span className="w-8 h-8 rounded-full grid place-items-center flex-shrink-0"
          style={{ background: typeof look.color === "string" && look.color.startsWith("#")
            ? hexA(look.color, 0.14) : "var(--bg-inner)", color: look.color }}>
          <Look size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-1.5">
            <span className="text-[11px] font-bold tabular-nums flex-shrink-0" style={{ color: "var(--text-4)" }}>
              №{task.id}
            </span>
            <span className="text-[14px] font-semibold leading-snug" style={{ color: "var(--text-1)" }}>
              {pick(task.name, lang) || `№${task.id}`}
            </span>
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 text-[12px] leading-snug" style={{ color: meta.color }}>
            <KindIcon size={12} className="flex-shrink-0" style={{ color: "var(--text-4)" }} />
            {meta.Icon && meta.Icon !== PencilLine && (
              <meta.Icon size={12} className={`flex-shrink-0 ${meta.spin ? "animate-spin" : ""}`} />
            )}
            <span className="min-w-0 break-words">{meta.text}</span>
            {task.weight > 0 && (
              <span className="flex-shrink-0 tabular-nums" style={{ color: "var(--text-4)" }}>· {task.weight}%</span>
            )}
          </span>
          {(dc || lc) && (
            <span className="mt-1.5 flex flex-wrap gap-1.5">
              {dc && <Chip color={dc.color} icon={ShieldQuestion}>{dc.text}</Chip>}
              {lc && <Chip color={lc.color} icon={Timer}>{lc.text}</Chip>}
              {(task.dispute?.canAct) && <Chip color={C_WARN}>{T.yourTurn}</Chip>}
            </span>
          )}
        </span>
        <ChevronRight size={16} className="flex-shrink-0 mt-2" style={{ color: "var(--text-4)" }} />
      </button>
      {(action || (task.dispute?.id) || (task.late?.proof?.id)) && (
        <div className="flex flex-wrap gap-2 pb-3 -mt-1 pl-[58px] sm:pl-[60px] pr-4">
          {action}
          {task.dispute?.id && (
            <Button size="sm" variant="ghost" tint onClick={() => nav(`/leaders/appeal/dispute/${task.dispute.id}`)}>
              <MessagesSquare size={12} /> {T.openChat}
            </Button>
          )}
          {task.late?.proof?.id && (
            <Button size="sm" variant="ghost" tint onClick={() => nav(`/leaders/appeal/late/${task.late.proof.id}`)}>
              <MessagesSquare size={12} /> {T.openChat}
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

function Group({ group, tasks, T, now, onOpen, rights, perTask, collapsible, defaultOpen }) {
  // Keyed on `defaultOpen` by the caller, so a change of default re-seeds it.
  const [open, setOpen] = useState(defaultOpen);
  const { Icon } = group;
  return (
    <section className="rounded-2xl overflow-hidden"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      aria-label={T[group.label]}>
      <button type="button" disabled={!collapsible} onClick={() => setOpen((o) => !o)}
        aria-expanded={collapsible ? open : undefined}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left disabled:cursor-default"
        style={{ borderBottom: open ? "1px solid var(--border)" : "none", background: "var(--bg-inner)" }}>
        <Icon size={14} style={{ color: group.color }} />
        <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-2)" }}>
          {T[group.label]}
        </span>
        <span className="text-[11px] font-bold tabular-nums rounded-full px-1.5"
          style={{ background: "var(--bg-card)", color: "var(--text-3)" }}>
          {tasks.length}
        </span>
        {collapsible && (
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: "var(--text-3)" }}>
            {open ? T.hide : T.show}
            <ChevronDown size={14} style={{ transform: open ? "rotate(180deg)" : "none" }} className="transition-transform" />
          </span>
        )}
      </button>
      {open && (
        <ul className="divide-y divide-[var(--border)]">
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} T={T} now={now} onOpen={onOpen} rights={rights}
              perTask={perTask} />
          ))}
        </ul>
      )}
    </section>
  );
}

// ── the tab ──────────────────────────────────────────────────────────────────

export default function Checklist({
  leaderId, date, needLeader, waiting, isLeader, nm, onMeta, openTask, onOpened,
}) {
  const T = useClT();
  const qc = useQueryClient();
  const toast = useToast();
  const [cell, setCell] = useState(null);
  const [sheet, setSheet] = useState(null);          // {id, focus}
  const [closeAsk, setCloseAsk] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closeErr, setCloseErr] = useState("");

  // The cell pick and an open sheet belong to ONE leader: the page mounts this
  // component keyed on the leader, so switching leaders starts it afresh.

  const queryKey = ["leader-checklist", leaderId ?? "me", date ?? "today", cell ?? "auto"];
  const { data: view, isLoading, isError, error, refetch, dataUpdatedAt } = useQuery({
    queryKey,
    queryFn: () => api.get("/api/leader-checklist/day", {
      params: { leader: leaderId ?? undefined, date: date ?? undefined, cell: cell ?? undefined },
    }).then((r) => r.data),
    enabled: !needLeader && !waiting,
    // A verdict lands minutes after a task is submitted, so while anything is
    // being checked the page asks every few seconds — and stops as soon as
    // nothing is. An open day is refreshed on a slow beat for the deadlines the
    // server closes on its own; a finished day never changes by itself.
    refetchInterval: (q) => {
      const v = q.state.data;
      if (!v?.isToday) return false;
      return v.tasks?.some((t) => t.state === "pending") ? 8000 : 60000;
    },
    refetchOnWindowFocus: true,
  });

  // The clock the page counts down with: the server's, carried by the payload,
  // so a phone whose own clock is wrong still shows the right «45 daq qoldi».
  const offset = useMemo(() => (view?.serverNow && dataUpdatedAt
    ? Date.parse(view.serverNow) - dataUpdatedAt : 0), [view?.serverNow, dataUpdatedAt]);
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    if (!view?.isToday) return undefined;
    const id = setInterval(() => setTick(Date.now()), 30000);
    return () => clearInterval(id);
  }, [view?.isToday]);
  const now = tick + offset;

  // The page's scope bar shows the resolved day — which is the leader's
  // current SHIFT day, not the calendar one, whenever nothing was picked.
  useEffect(() => {
    if (view) onMeta?.({ date: view.date, today: view.today });
  }, [view?.date, view?.today]); // eslint-disable-line react-hooks/exhaustive-deps

  // A verdict arriving is announced, not merely re-rendered: the reader may be
  // anywhere on the page, and a rejection they do not notice is a rejection
  // they do not object to.
  const prev = useRef({ key: null, states: {} });
  useEffect(() => {
    if (!view) return;
    const key = `${view.leader?.id}|${view.date}|${view.cell ?? ""}`;
    const was = prev.current;
    if (was.key === key && view.isToday) {
      for (const t of view.tasks) {
        if (was.states[t.id] !== "pending" || t.state === "pending") continue;
        if (t.state === "passed") { toast.success(put(T.tPassed, { id: t.id })); haptic("success"); }
        else if (t.state === "rejected") { toast.error(put(T.tRejected, { id: t.id })); haptic("error"); }
      }
    }
    prev.current = { key, states: Object.fromEntries(view.tasks.map((t) => [t.id, t.state])) };
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

  // A task named by the URL — the in-app camera coming back with the task it
  // was shooting for — opens once its day has loaded, and only once.
  useEffect(() => {
    if (!openTask || !view) return;
    if (view.tasks.some((t) => t.id === openTask.id)) {
      setSheet({ id: openTask.id, focus: openTask.focus || null });
    }
    onOpened?.();
  }, [openTask, view]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(() => {
    const by = { todo: [], rejected: [], failed: [], checking: [], done: [] };
    for (const t of view?.tasks || []) (by[GROUP_OF[t.state] || "todo"]).push(t);
    by.todo.sort((a, b) => {
      // Something to SUBMIT (a draft) before something to start, then the
      // nearest deadline, then the catalog order.
      if ((a.state === "draft") !== (b.state === "draft")) return a.state === "draft" ? -1 : 1;
      const da = a.dueAt ? Date.parse(a.dueAt) : Infinity;
      const db = b.dueAt ? Date.parse(b.dueAt) : Infinity;
      return da - db || a.id - b.id;
    });
    return by;
  }, [view]);
  const counts = useMemo(() => Object.fromEntries(
    Object.entries(groups).map(([k, v]) => [k, v.length])), [groups]);

  const setView = (v) => { if (v) qc.setQueryData(queryKey, v); };

  if (needLeader) {
    return (
      <div className="rounded-2xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <EmptyState icon={UserSearch} title={T.pickT} message={T.pickM} showUploadLink={false} height="h-56" />
      </div>
    );
  }
  if (waiting || isLoading) {
    return (
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(280px,340px)_1fr] items-start">
        <SkeletonBlock className="w-full rounded-2xl" style={{ height: 196 }} />
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <SkeletonBlock key={i} className="w-full rounded-2xl" style={{ height: 120 }} />)}
        </div>
      </div>
    );
  }
  if (isError || !view) {
    const code = error?.response?.status;
    return (
      <div className="rounded-2xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <EmptyState icon={code === 404 ? UserSearch : ClipboardList}
          title={code === 404 ? T.pickT : T.failedT} message={code === 404 ? T.pickM : T.failedM}
          showUploadLink={false} height="h-56"
          action={code === 404 ? null : (
            <Button size="lg" variant="secondary" onClick={() => refetch()}>{T.retry}</Button>
          )} />
      </div>
    );
  }

  const rights = view.rights || {};
  const today = view.isToday;
  const task = sheet ? view.tasks.find((t) => t.id === sheet.id) : null;
  const anyAbove = counts.todo + counts.rejected + counts.failed + counts.checking > 0;

  const closeDay = async () => {
    setClosing(true);
    setCloseErr("");
    try {
      const r = await api.post("/api/leader-checklist/close-day",
        { leader: view.leader.id, cell: view.cell });
      setView(r.data.view);
      setCloseAsk(false);
      toast.success(put(T.closeDayOk, { score: r.data.score }));
    } catch (e) {
      setCloseErr(errText(e, T));
    } finally {
      setClosing(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* WHICH checklist, on a unit that files one per cell. */}
      {view.perCell && view.cells.length > 1 && (
        <SegmentedToggle value={view.cell} onChange={(v) => setCell(v)}
          ariaLabel="cells" options={view.cells.map((c) => [c.id, c.code])} />
      )}

      {view.noCell ? (
        <div className="rounded-2xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <EmptyState icon={CircleSlash} title={T.noCellT}
            message={rights.file || isLeader ? T.noCellMine : T.noCellOther}
            showUploadLink={false} height="h-56" />
        </div>
      ) : (
        // `grid-cols-1` below lg is load-bearing: an implicit grid track is
        // sized `auto`, and `auto` grows to the min-content of whatever sits in
        // it — the «next deadline» line and the leader's name are nowrap
        // `truncate` text, so the column took their FULL width and ran off the
        // right edge of a phone, cutting the score, the counts and every row's
        // chevron. `minmax(0, 1fr)` caps it at the screen.
        <div className="grid grid-cols-1 gap-3 lg:gap-4 lg:grid-cols-[minmax(280px,340px)_1fr] items-start">
          <div className="space-y-3 lg:sticky lg:top-3">
            <Summary view={view} counts={counts} T={T} isLeader={isLeader} nm={nm} now={now}
              onOpen={(id) => setSheet({ id, focus: null })} />
            {today && !rights.file && !isLeader && view.day?.open !== false && (
              <p className="text-[12px] flex items-start gap-1.5 px-1" style={{ color: "var(--text-3)" }}>
                <Lock size={13} className="flex-shrink-0 mt-0.5" style={{ color: "var(--text-4)" }} />
                {T.readOnly}
              </p>
            )}
            {view.closeDay && rights.file && (
              <div className="rounded-2xl p-3" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                <Button size="lg" className="w-full" disabled={!view.closeDay.ready}
                  onClick={() => { setCloseErr(""); setCloseAsk(true); }}>
                  {T.closeDay}
                </Button>
                {!view.closeDay.ready && (
                  <p className="text-[11px] mt-2 leading-snug" style={{ color: "var(--text-3)" }}>
                    {put(T.closeDayNeed, { n: view.closeDay.missing.length })}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="space-y-3 min-w-0">
            {GROUPS.map((g) => (groups[g.id].length ? (
              <Group key={`${g.id}-${g.id !== "done" || !today || !anyAbove}`}
                group={g} tasks={groups[g.id]} T={T} now={now} rights={rights}
                perTask={view.perTask}
                onOpen={(id, focus = null) => setSheet({ id, focus })}
                collapsible={g.id === "done"}
                defaultOpen={g.id !== "done" || !today || !anyAbove} />
            ) : null))}
          </div>
        </div>
      )}

      {task && (
        <ChecklistTaskSheet view={view} task={task} focus={sheet.focus} T={T}
          onClose={() => setSheet(null)} onView={setView} onRefetch={() => refetch()}
          toast={toast} />
      )}

      <ConfirmDialog open={closeAsk} title={T.closeDayT} message={T.closeDayM}
        confirmLabel={T.closeDay} loading={closing} error={closeErr || null}
        onCancel={() => setCloseAsk(false)} onConfirm={closeDay} />
      {toast.node}
    </div>
  );
}
