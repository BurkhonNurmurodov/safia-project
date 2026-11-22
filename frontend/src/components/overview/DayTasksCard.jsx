/**
 * «Rahbariyat vazifalari» — the tasks set FROM THE TOP for brigadirs and
 * leaders, listed on «Smena kunligi».
 *
 * The operator (2026-11-14): «the task which assigned by admins, top managers
 * and shift managers to brigadirs and liders should be shown in the shift
 * day», and, once he had seen a board of names: «when open shift day page i
 * have to see the task for brigadirs and remind them did you do this or not».
 * So the TASKS are on the page — nothing to open first.
 *
 * IT IS A BOARD (2026-11-22, the operator: «each task should be card and in
 * the bottom should be written person who is this assigned, and the columns
 * should be to do, doing, and done»). Three columns by STATUS; each task one
 * card — late / urgent chips and the status control on top, the text, the
 * deadline (a picker where `can_due`), who set it, «Eslatish» and the chat —
 * and its foot names the person it was set for (avatar, name, brigadir or
 * leader · unit). «Muddati o'tgan» is no status, so a late card stays in its
 * column, red-edged, first. Below lg (the sidebar leaves three columns too
 * narrow) one column at a time, picked by a `SegmentedToggle` over the board.
 * A card is DRAGGED between columns with a mouse or pen from lg up (the drop
 * is the status PATCH, within `status_options`); the board's own shift toggle
 * filters the cards while the page's «Smena» filter names none. A search box filters by text or person.
 *
 * WHO MOVES A CARD (the same day): on a brigadir's task only an admin and the
 * unit's shift manager set the status or the deadline
 * (`brigadir_tasks.runs_status`) — the brigadir answers in the thread, on their
 * own «Vazifalar» page, and a top-manager sets, flames, reminds and writes but
 * moves nothing. A leader's task keeps its own rule (`tasks._status_choices`).
 * The card offers exactly the server's `status_options` / `can_due`.
 *
 * IT FOLDS (the operator, 2026-11-14: «make this foldable, after pressing it
 * should open all»). Folded — the default, remembered per browser — it is the
 * head and the day's one-line answer (the bar, its parts, how many are late);
 * one press on the head, or on «Hammasini ochish» under the answer, opens
 * EVERY person and EVERY task, nothing held back behind «yana N». The page
 * under it no longer starts a screen and a half down.
 *
 * IT IS ALWAYS NOW — the page's day never reaches it (the operator,
 * 2026-11-15: «remove the date switch, always show now and show all task»).
 * «Smena kunligi» opens on YESTERDAY — its figures are about closed days —
 * and a block that followed it hid every task set today. So it reads the
 * present: every open task, and a finished one for 7 days after the day it
 * was finished (`task_day.DONE_KEEP_DAYS`), green, with the day it was done.
 *
 * `GET /api/tasks/day` is the whole read (`services/task_day.py` holds the
 * rule of what a day contains and the four states). The SERVER decides who
 * sees the block: `show: false` draws nothing — it is the admins' alone until
 * the day the operator names (`task_board.OPEN_FROM`), and there is no client
 * twin of that date to keep in step. Every right on a row is the server's too
 * (`thread`, `can_comment`, `can_remind`, `reminded`).
 *
 * The four states are a PARTITION here (late is its own bucket), unlike the
 * /tasks board where overdue is a flag beside three statuses: that page counts
 * what the status column says, this block asks who is late.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BellRing, CalendarDays, Check, ChevronDown, ChevronUp, ClipboardCheck, Flame, Plus } from "lucide-react";
import { SectionHead } from "../ui/DataTable";
import { SplitBar, SplitLegend } from "../ui/Meter";
import { STATUSES, STATUS_COLOR, CHART_OVERDUE, URGENT_COLOR, StatusSelect } from "../ui/TaskQueue";
import Button from "../ui/Button";
import DateRangePicker from "../ui/DateRangePicker";
import ProfileAvatar from "../ui/ProfileAvatar";
import SearchInput from "../ui/SearchInput";
import SegmentedToggle from "../ui/SegmentedToggle";
import CommentsModal, { CommentsButton } from "../ui/CommentsModal";
import { SkeletonBlock } from "../ui/Skeleton";
import { useToast } from "../ui/Toast";
import TaskFormModal from "../tasks/TaskFormModal";
import api from "../../utils/api";
import { useAuth } from "../../context/AuthContext";
import { useCapabilities } from "../../hooks/useCapabilities";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { usePersistentState } from "../../hooks/usePersistentState";
import { fmtDate } from "../../utils/targets";
import { localISO } from "../ui/DateRangePicker";
import { ROLE_LABEL_KEYS } from "../../config/pages";
import { KIND_SUP, KIND_LEADER, endpointFor } from "../../utils/taskTiers";

// Worst first — the order of the bar, its legend and a person's own tasks.
const STATE_ORDER = ["overdue", "todo", "doing", "done"];
const STATE_FILL = {
  overdue: CHART_OVERDUE,
  todo: STATUS_COLOR.todo,
  doing: STATUS_COLOR.doing,
  done: STATUS_COLOR.done,
};
const STATE_LABEL = {
  overdue: "tasks.kpiOverdue",
  todo: "tasks.status.todo",
  doing: "tasks.status.doing",
  done: "tasks.status.done",
};

const line = "1px solid var(--border)";
const cardStyle = { background: "var(--bg-card)", border: line };

export default function DayTasksCard({ params }) {
  const { auth } = useAuth();
  // An admin, or the tasks page's admin grant (backend `task_board.admin`).
  const { adminOn } = useCapabilities();
  const tasksAdmin = auth?.role === "admin" || adminOn("tasks");
  const { t } = useLang();
  const { tl, tx } = useTranslit();
  const qc = useQueryClient();
  const toast = useToast();

  const [thread, setThread] = useState(null);           // the task whose chat is open
  const [form, setForm] = useState(null);               // the task form's opening state
  // Folded or open — remembered per browser (a convenience, never a right).
  const [open, setOpen] = usePersistentState("day_tasks_open", false);
  const [search, setSearch] = useState("");             // the board's text filter
  // The one column a phone shows (below md the three cannot stand side by side).
  const [phoneCol, setPhoneCol] = useState("todo");
  // The board's own shift filter (2026-11-22, «add filter for them for
  // shift»): null = every shift. Remembered per browser — a convenience.
  const [boardShift, setBoardShift] = usePersistentState("day_tasks_shift", null);
  // A card being dragged between columns: {task, width, x, y, dx, dy}; the
  // column it would land in; the floating copy that follows the pointer.
  const [drag, setDrag] = useState(null);
  const [over, setOver] = useState(null);
  const colRefs = useRef({});
  const ghostRef = useRef(null);
  const ghostAt = useRef(null);                        // its last top-left, applied when it mounts
  const ghostTransform = (pt) => `translate(${pt.x}px, ${pt.y}px) rotate(1.5deg)`;
  const ghostMount = (el) => {
    ghostRef.current = el;
    if (el && ghostAt.current) el.style.transform = ghostTransform(ghostAt.current);
  };
  const dragEnd = useRef(null);
  useEffect(() => () => dragEnd.current?.(), []);
  const cardRef = useRef(null);
  // Whether this browser was shown the block last time — so a reader who has
  // it gets its skeleton while it loads instead of a block dropping in above
  // the board. Never a right: the server decides (`show`).
  const [seen, setSeen] = usePersistentState("day_tasks_seen", false);

  // Never a date: the server reads its own today (Tashkent), whatever this
  // browser's clock and the page's day say.
  const query = useMemo(
    () => ({ ...(params?.shift ? { shift: params.shift } : {}), ...(params?.factory != null ? { factory: params.factory } : {}) }),
    [params]);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["day-tasks", query],
    queryFn: () => api.get("/api/tasks/day", { params: query }).then((r) => {
      setSeen(!!r.data?.show);
      return r.data;
    }),
    staleTime: 30_000,
  });

  const people = useMemo(() => data?.people || [], [data]);
  const totals = data?.totals;
  // The board: every task once, carrying the person it was set for, in the
  // column its STATUS names. Late is no column — a late card stays where its
  // status puts it, marked red, and comes first there (longest late first,
  // then the flamed, then the nearest deadline); «Bajarildi» lists the most
  // recently finished first.
  // The page's own «Smena» filter already narrows the read; while it names a
  // shift the board's toggle is not drawn and filters nothing.
  const pageShift = params?.shift || null;
  const shiftPick = pageShift ? null : boardShift;
  const allTasks = useMemo(
    () => people.flatMap((p) => (p.tasks || []).map((task) => ({ ...task, person: p }))),
    [people]);
  const shiftCounts = useMemo(() => {
    const n = { 1: 0, 2: 0 };
    allTasks.forEach((task) => { if (task.person.shift in n) n[task.person.shift] += 1; });
    return n;
  }, [allTasks]);
  const columns = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const hit = (task) => (shiftPick == null || task.person.shift === shiftPick)
      && (!needle || [task.text, task.person.name, task.person.unit_name, task.created_by_name]
        .some((v) => v && (`${tx(v)} ${tl(v)}`).toLowerCase().includes(needle)));
    const all = allTasks;
    const open = (a, b) => (b.state === "overdue") - (a.state === "overdue")
      || (b.days_late || 0) - (a.days_late || 0)
      || (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0)
      || String(a.due_date || "9999").localeCompare(String(b.due_date || "9999"))
      || a.id - b.id;
    const done = (a, b) => String(b.done_day || "").localeCompare(String(a.done_day || "")) || b.id - a.id;
    return STATUSES.map((key) => {
      const tasks = all.filter((task) => task.status === key && hit(task)).sort(key === "done" ? done : open);
      return { key, tasks, late: tasks.filter((task) => task.state === "overdue").length };
    });
  }, [allTasks, search, shiftPick, tl, tx]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["day-tasks"] });
    qc.invalidateQueries({ queryKey: ["task-board"] });
  };

  // «Eslatish» — ask the person in the bot whether the task is done. The row
  // then reads «Eslatildi» (the server's `reminded`), so the press is answered
  // on the row itself and not by a toast alone.
  const remind = useMutation({
    mutationFn: ({ task }) => api.post(`${endpointFor(task.kind)}/${task.id}/remind`).then((r) => r.data),
    onSuccess: (_d, { name }) => { toast.success(t("dayTasks.reminded").replace("{name}", name)); refresh(); },
    onError: (e) => {
      const code = e?.response?.data?.detail;
      if (code === "reminded_recently") toast.warning(t("dayTasks.remindSentTip"));
      else if (code === "done") toast.info(t("dayTasks.remindDone"));
      else toast.error(t("dayTasks.remindFailed"));
      refresh();
    },
  });
  const remindingId = remind.isPending ? remind.variables?.task?.id : null;

  // The row's status, set where it is read — through the router that owns the
  // task's tier, exactly as on Vazifalar. A refusal says why, in a toast.
  // The card moves AT ONCE (a drop that snapped back until the server answered
  // would read as refused); the read that follows puts the server's word on it.
  const setStatus = useMutation({
    mutationFn: ({ task, status }) =>
      api.patch(`${endpointFor(task.kind)}/${task.id}/status`, { status }).then((r) => r.data),
    onMutate: ({ task, status }) => {
      const today = localISO(new Date());
      const days = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 864e5);
      const moved = (x) => {
        if (status === "done") {
          const late = !!x.due_date && today > x.due_date;
          return { ...x, status, state: "done", done_day: today, late, days_late: late ? days(today, x.due_date) : 0 };
        }
        const late = !!x.due_date && x.due_date < today;
        return { ...x, status, state: late ? "overdue" : status, done_day: null, late, days_late: late ? days(today, x.due_date) : 0 };
      };
      qc.setQueryData(["day-tasks", query], (old) => old?.people ? {
        ...old,
        people: old.people.map((p) => ({
          ...p, tasks: (p.tasks || []).map((x) => (x.id === task.id && x.kind === task.kind ? moved(x) : x)),
        })),
      } : old);
    },
    onSuccess: refresh,
    onError: (e) => { toast.error(e?.response?.data?.detail || t("tasks.saveError")); refresh(); },
  });
  const savingStatusId = setStatus.isPending ? setStatus.variables?.task?.id : null;

  // DRAG A CARD TO ANOTHER COLUMN (2026-11-22) — the status pill's own right
  // (`status_options`), so a drop never asks for what the PATCH refuses. With
  // a mouse or a pen and only while the three columns stand side by side (lg+);
  // a finger keeps the pill (a phone shows one column). The press becomes a
  // drag after 6px, so a click on the card's buttons and text selection are
  // untouched; Escape cancels.
  const canDrag = (task) => (task.status_options || []).some((st) => st !== task.status);
  const startDrag = (e, task) => {
    if (e.button !== 0 || e.pointerType === "touch" || !canDrag(task)) return;
    if (e.target.closest("button, a, input, textarea, select, [role='button'], [data-no-drag]")) return;
    if (!window.matchMedia?.("(min-width: 1024px)").matches) return;
    const card = e.currentTarget;
    const sx = e.clientX, sy = e.clientY;
    let dx = 0, dy = 0, started = false, target = null;
    const colAt = (x, y) => {
      for (const [key, el] of Object.entries(colRefs.current)) {
        const r = el?.getBoundingClientRect();
        if (r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return key;
      }
      return null;
    };
    const place = (x, y) => {
      ghostAt.current = { x: x - dx, y: y - dy };
      if (ghostRef.current) ghostRef.current.style.transform = ghostTransform(ghostAt.current);
    };
    const onMove = (ev) => {
      if (!started) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
        const r = card.getBoundingClientRect();
        dx = sx - r.left; dy = sy - r.top; started = true;
        window.getSelection?.()?.removeAllRanges();
        document.body.classList.add("board-dragging");
        setDrag({ task, width: r.width, x: ev.clientX - dx, y: ev.clientY - dy });
      }
      ev.preventDefault();
      place(ev.clientX, ev.clientY);
      const col = colAt(ev.clientX, ev.clientY);
      const ok = col && col !== task.status && task.status_options.includes(col) ? col : null;
      if (ok !== target) { target = ok; setOver(ok); }
    };
    const end = (drop) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey, true);
      document.body.classList.remove("board-dragging");
      dragEnd.current = null;
      ghostAt.current = null;
      if (started) { setDrag(null); setOver(null); }
      if (drop && started && target) setStatus.mutate({ task, status: target });
    };
    const onUp = () => end(true);
    const onCancel = () => end(false);
    const onKey = (ev) => { if (ev.key === "Escape" && started) { ev.preventDefault(); ev.stopPropagation(); end(false); } };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey, true);
    dragEnd.current = () => end(false);
  };

  // The deadline, moved where it is read (2026-11-22) — an admin, the task's
  // creator, or the shift manager over the unit (the server's `can_due`).
  const setDue = useMutation({
    mutationFn: ({ task, due }) =>
      api.patch(`${endpointFor(task.kind)}/${task.id}/due`, { due_date: due }).then((r) => r.data),
    onSuccess: () => { toast.success(t("dayTasks.dueSaved")); refresh(); },
    onError: (e) => { toast.error(e?.response?.data?.detail || t("tasks.saveError")); refresh(); },
  });
  const statusLabel = (s) => t(`tasks.status.${s}`);

  // Folding from the END of a long list would leave the reader a screen below
  // the block — bring its head back into view.
  const fold = () => {
    setOpen(false);
    requestAnimationFrame(() => cardRef.current?.scrollIntoView?.({ block: "nearest" }));
  };

  if (data && !data.show) return null;
  // Without an answer — still loading, or the read failed — the block is
  // drawn only for a reader known to have it (a skeleton, then the failure).
  // Anybody else gets nothing: a block that is not theirs has nothing to report.
  if (!data && !(tasksAdmin || seen)) return null;

  const stateLabel = (s) => t(STATE_LABEL[s]);
  const parts = STATE_ORDER.map((s) => ({ key: s, label: stateLabel(s), color: STATE_FILL[s], value: totals?.[s] || 0 }));
  // The block sets a task at the tiers it shows — the server says which of
  // them this viewer may.
  const createKinds = [KIND_SUP, KIND_LEADER].filter((k) => data?.can_create?.[k]);
  const subtitle = t("dayTasks.subNow");

  // What a card's date line says, and in which ink. Lateness has its own
  // chip at the card's top, so the line states the date alone.
  const dueLine = (task) => {
    const due = t("dayTasks.due").replace("{d}", fmtDate(task.due_date, t));
    if (task.state === "overdue") return { text: due, ink: "var(--status-bad)" };
    // A finished task says WHEN it was finished — it stays a week — and
    // whether that was in time; its deadline moves to the hover.
    if (task.state === "done") {
      return { text: t("dayTasks.doneOn").replace("{d}", fmtDate(task.done_day, t)), ink: "var(--text-2)", title: due };
    }
    return { text: due, ink: "var(--text-2)" };
  };

  // One task = one card: what is wrong with it (late, urgent) and the status
  // control on top, the text, the deadline and who set it, the actions — and
  // at the bottom the person it was set for.
  const taskCard = (task, ghost = false) => {
    const p = task.person;
    const due = dueLine(task);
    const role = task.creator_role && ROLE_LABEL_KEYS[task.creator_role] ? t(ROLE_LABEL_KEYS[task.creator_role]) : null;
    const setter = task.created_by_name ? `${tl(task.created_by_name)}${role ? ` (${role})` : ""}` : "";
    const name = tl(p.name) || "—";
    const late = task.state === "overdue";
    const done = task.state === "done";
    const canStatus = (task.status_options || []).length > 0;
    // A finished card's verdict: in time, or how many days after its date.
    const verdict = done && (task.late
      ? { text: t("dayTasks.doneLate").replace("{n}", task.days_late), color: "#f97316", ink: "var(--status-over)" }
      : { text: t("dayTasks.onTime"), color: STATUS_COLOR.done, ink: "var(--status-ok)" });
    const caption = p.kind === KIND_LEADER && p.unit_name
      ? `${t("dayTasks.kind.leader")} · ${tl(p.unit_name)}`
      : t(`dayTasks.kind.${p.kind}`);
    return (
      <li key={`${task.kind}:${task.id}`}
        className={`rounded-xl overflow-hidden flex flex-col flex-shrink-0${!ghost && canDrag(task) ? " lg:cursor-grab" : ""}`}
        onPointerDown={ghost ? undefined : (e) => startDrag(e, task)}
        style={{
          background: "var(--bg-card)",
          border: `1px solid ${late ? `${CHART_OVERDUE}73` : "var(--border)"}`,
          boxShadow: [late ? `inset 3px 0 0 ${CHART_OVERDUE}` : null, ghost ? "0 18px 40px rgba(0,0,0,0.35)" : null].filter(Boolean).join(", ") || undefined,
          opacity: !ghost && drag && drag.task.id === task.id && drag.task.kind === task.kind ? 0.35 : undefined,
        }}>
        <div className="px-3 pt-2.5 pb-3 flex flex-col gap-2 min-w-0">
          {(late || task.urgent || verdict) && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {late && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: `${CHART_OVERDUE}1f`, color: "var(--status-bad)" }}>
                  <AlertTriangle size={11} /> {t("dayTasks.lateBy").replace("{n}", task.days_late)}
                </span>
              )}
              {task.urgent && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: `${URGENT_COLOR}1f`, color: URGENT_COLOR }}>
                  <Flame size={11} /> {t("tasks.urgentOn")}
                </span>
              )}
              {verdict && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: `${verdict.color}1f`, color: verdict.ink }}>
                  <Check size={11} /> {verdict.text}
                </span>
              )}
            </div>
          )}
          <p className="text-sm leading-snug break-words line-clamp-4" style={{ color: "var(--text-1)" }} title={tx(task.text)}>
            {tx(task.text)}
          </p>
          <div className="flex flex-col gap-0.5 min-w-0">
            {task.can_due && !done ? (
              <span className="min-w-0 -ml-1.5" title={due.title ? `${due.text} · ${due.title}` : due.text}>
                <DateRangePicker single bare
                  dateFrom={task.due_date} dateTo={task.due_date}
                  setDateFrom={(d) => { if (d && d !== task.due_date) setDue.mutate({ task, due: d }); }}
                  setDateTo={() => {}}
                  triggerClassName="px-1.5 py-0.5 text-xs font-semibold"
                  ariaLabel={`${t("dayTasks.dueEdit")}: ${due.text}`}
                  label={<span style={{ color: due.ink }}>{due.text}</span>} />
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold min-w-0" style={{ color: due.ink }}
                title={due.title ? `${due.text} · ${due.title}` : due.text}>
                <CalendarDays size={13} className="flex-shrink-0" style={{ color: "var(--text-3)" }} />
                <span className="truncate">{due.text}</span>
              </span>
            )}
            {setter && (
              <span className="text-[11px] truncate" style={{ color: "var(--text-3)" }}
                title={t("dayTasks.setBy").replace("{name}", setter)}>
                {t("dayTasks.setBy").replace("{name}", setter)}
              </span>
            )}
          </div>
          {(canStatus || task.can_remind || task.thread) && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {canStatus && (
                <StatusSelect
                  status={task.status}
                  statusLabel={statusLabel}
                  saving={savingStatusId === task.id}
                  editable
                  options={task.status_options}
                  onChange={(st) => setStatus.mutate({ task, status: st })}
                />
              )}
              {task.can_remind && (task.reminded ? (
                <Button size="sm" variant="success" tint disabled icon={<Check size={12} />}
                  title={t("dayTasks.remindSentTip")}>
                  {t("dayTasks.remindSent")}
                </Button>
              ) : (
                <Button size="sm" variant="primary" tint icon={<BellRing size={12} />}
                  loading={remindingId === task.id} title={t("dayTasks.remindTip")}
                  aria-label={`${t("dayTasks.remind")}: ${name}`}
                  onClick={() => remind.mutate({ task, name })}>
                  {t("dayTasks.remind")}
                </Button>
              ))}
              {task.thread && (
                <span className="ml-auto">
                  <CommentsButton count={task.comment_count} label={t("tasks.commentsTitle")} onClick={() => setThread(task)} />
                </span>
              )}
            </div>
          )}
        </div>
        {/* WHO it was set for — the card's foot, on every card. */}
        <div className="mt-auto flex items-center gap-2 px-3 py-2 min-w-0"
          style={{ background: "var(--bg-inner)", borderTop: line }}>
          <ProfileAvatar name={name} colorKey={p.name} size={24} />
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block text-xs font-semibold truncate" style={{ color: "var(--text-1)" }} title={name}>{name}</span>
            <span className="block text-[11px] truncate" style={{ color: "var(--text-3)" }} title={caption}>{caption}</span>
          </span>
          {createKinds.includes(p.kind) && (
            <Button size="sm" variant="ghost" icon={<Plus size={12} />}
              aria-label={`${t("dayTasks.add")}: ${name}`} title={t("dayTasks.add")}
              onClick={() => setForm({ kind: p.kind, assignee_id: p.id })} />
          )}
        </div>
      </li>
    );
  };

  // One column of the board: its status, how many cards and how many of them
  // are late, then the cards. On a phone only the picked column is drawn.
  // While a card is dragged: the column it would land in is outlined in
  // brand, a column its rights cannot reach dims.
  const column = (c) => {
    const target = drag && over === c.key;
    const blocked = drag && c.key !== drag.task.status && !(drag.task.status_options || []).includes(c.key);
    return (
    <section key={c.key} aria-label={statusLabel(c.key)} ref={(el) => { colRefs.current[c.key] = el; }}
      className={`rounded-xl flex flex-col min-w-0 transition-opacity ${c.key === phoneCol ? "" : "max-lg:hidden"}`}
      style={{
        background: target ? "color-mix(in srgb, var(--brand) 9%, var(--bg-inner))" : "var(--bg-inner)",
        border: line,
        outline: target ? "2px dashed var(--brand)" : "none",
        outlineOffset: -2,
        opacity: blocked ? 0.5 : undefined,
      }}>
      <header className="flex items-center gap-2 px-3 py-2.5" style={{ borderBottom: line }}>
        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: STATUS_COLOR[c.key] }} />
        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-1)" }}>{statusLabel(c.key)}</span>
        <span className="text-xs font-bold tabular-nums" style={{ color: "var(--text-3)" }}>{c.tasks.length}</span>
        {c.late > 0 && (
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-bold tabular-nums px-1.5 py-0.5 rounded-full"
            style={{ background: `${CHART_OVERDUE}1f`, color: "var(--status-bad)" }}
            title={`${stateLabel("overdue")}: ${c.late}`}>
            <AlertTriangle size={11} /> {c.late}
          </span>
        )}
      </header>
      {c.tasks.length ? (
        <ul className="p-2 flex flex-col gap-2 lg:max-h-[44rem] lg:overflow-y-auto">{c.tasks.map((task) => taskCard(task))}</ul>
      ) : (
        <div className="px-3 py-8 text-center text-xs" style={{ color: "var(--text-3)" }}>
          {search.trim() || shiftPick != null ? t("dayTasks.noMatch") : t("dayTasks.colEmpty")}
        </div>
      )}
    </section>
    );
  };

  return (
    <div ref={cardRef} className="rounded-xl overflow-hidden mb-6" style={cardStyle}>
      <SectionHead
        icon={ClipboardCheck}
        color="#3b82f6"
        title={t("dayTasks.title")}
        subtitle={subtitle}
        open={open}
        onToggle={() => (open ? fold() : setOpen(true))}
        right={createKinds.length > 0 ? (
          <Button size="md" icon={<Plus size={14} />} onClick={() => setForm({})}>{t("dayTasks.add")}</Button>
        ) : null}
      />
      <div className="p-4">
        {isError ? (
          <div className="text-sm" style={{ color: "var(--text-3)" }}>{t("dayTasks.failed")}</div>
        ) : isLoading || !data ? (
          <div className="space-y-3">
            <SkeletonBlock className="h-2.5 w-full rounded-full" />
            <SkeletonBlock className="h-4 w-2/3" />
            {open && Array.from({ length: 3 }).map((_, i) => <SkeletonBlock key={i} className="h-16 w-full" />)}
          </div>
        ) : !people.length ? (
          <div className="text-sm py-2" style={{ color: "var(--text-3)" }}>{t("dayTasks.emptyNow")}</div>
        ) : (
          <>
            {/* The whole day in one bar, then its parts by name and number. */}
            <SplitBar parts={parts} height={10} />
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 mt-2">
              <SplitLegend parts={parts} />
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold"
                style={{ color: totals.people_late ? "var(--status-bad)" : "var(--status-ok)" }}>
                {totals.people_late ? <AlertTriangle size={12} /> : <Check size={12} />}
                {totals.people_late
                  ? t("dayTasks.peopleLate").replace("{n}", totals.people_late).replace("{m}", totals.people)
                  : t("dayTasks.nobodyLate")}
              </span>
            </div>

            {!open ? (
              <Button className="w-full mt-3" variant="secondary" icon={<ChevronDown size={14} />}
                aria-expanded={false} onClick={() => setOpen(true)}>
                {t("dayTasks.openAll").replace("{n}", totals.total)}
              </Button>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2 mt-4 mb-3">
                  <SearchInput value={search} onChange={setSearch} placeholder={t("dayTasks.search")}
                    className="w-full sm:w-80" />
                  {!pageShift && (
                    <SegmentedToggle value={boardShift} onChange={setBoardShift}
                      options={[
                        { value: null, label: `${t("filter.all")} · ${allTasks.length}` },
                        { value: 1, label: `S1 · ${shiftCounts[1]}`, title: `${t("filter.shift")} 1` },
                        { value: 2, label: `S2 · ${shiftCounts[2]}`, title: `${t("filter.shift")} 2` },
                      ]} />
                  )}
                  <SegmentedToggle className="lg:hidden w-full" fill value={phoneCol} onChange={setPhoneCol}
                    options={columns.map((c) => ({ value: c.key, label: `${statusLabel(c.key)} · ${c.tasks.length}` }))} />
                </div>
                <div className="grid gap-3 lg:grid-cols-3 items-start lg:items-stretch">{columns.map(column)}</div>
                <Button className="w-full mt-3" variant="ghost" icon={<ChevronUp size={14} />}
                  aria-expanded onClick={fold}>
                  {t("dayTasks.fold")}
                </Button>
              </>
            )}
          </>
        )}
      </div>

      {/* The ONE task form — set a task without leaving the day */}
      {form && (
        <TaskFormModal
          kinds={createKinds}
          initial={form}
          onClose={() => setForm(null)}
          onSaved={refresh}
        />
      )}

      {/* The task's chat lives on the router that owns its tier */}
      {thread && (
        <CommentsModal
          endpoint={`${endpointFor(thread.kind)}/${thread.id}/comments`}
          queryKey={["task-comments", thread.kind, thread.id]}
          refreshKeys={[["day-tasks"], ["task-board"]]}
          title={t("tasks.commentsTitle")}
          subtitle={tx(thread.text)}
          canComment={!!thread.can_comment}
          attachments
          filesEndpoint={`${endpointFor(thread.kind)}/${thread.id}/comments/files`}
          onClose={() => setThread(null)}
        />
      )}

      {/* The dragged card's floating copy — follows the pointer, takes no clicks. */}
      {drag && createPortal(
        <ul ref={ghostMount} aria-hidden className="fixed top-0 left-0 pointer-events-none"
          style={{ width: drag.width, zIndex: 300 }}>
          {taskCard(drag.task, true)}
        </ul>,
        document.body)}

      {toast.node}
    </div>
  );
}
