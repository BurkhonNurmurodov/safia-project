/**
 * «Rahbariyat vazifalari» — the tasks set FROM THE TOP for brigadirs and
 * leaders, listed on «Smena kunligi».
 *
 * The operator (2026-11-14): «the task which assigned by admins, top managers
 * and shift managers to brigadirs and liders should be shown in the shift
 * day», and, once he had seen a board of names: «when open shift day page i
 * have to see the task for brigadirs and remind them did you do this or not».
 * So the TASKS are on the page — nothing to open first:
 *
 *   a person (worst first)  →  their tasks, each on its own line: its state,
 *   its text, its deadline with the days late, who set it —
 *   and «Eslatish», one press that asks them in the bot whether it is done.
 *
 * A person's line carries their answer in one mark: red — something is past
 * its date; green — everything they were set is done; grey — open work, all of
 * it in time. A task the unit's own brigadir set for a leader is not here, and
 * neither is a shift manager's own — both stay on /tasks.
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
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BellRing, Check, ChevronDown, ChevronUp, ClipboardCheck, Flame, Hourglass, Plus } from "lucide-react";
import { SectionHead } from "../ui/DataTable";
import { SplitBar, SplitLegend } from "../ui/Meter";
import { STATUS_COLOR, CHART_OVERDUE, URGENT_COLOR } from "../ui/TaskQueue";
import Button from "../ui/Button";
import CommentsModal, { CommentsButton } from "../ui/CommentsModal";
import { SkeletonBlock } from "../ui/Skeleton";
import { useToast } from "../ui/Toast";
import TaskFormModal from "../tasks/TaskFormModal";
import api from "../../utils/api";
import { useAuth } from "../../context/AuthContext";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { usePersistentState } from "../../hooks/usePersistentState";
import { fmtDate } from "../../utils/targets";
import { ROLE_LABEL_KEYS } from "../../config/pages";
import { TIERS, KIND_SUP, KIND_LEADER, endpointFor } from "../../utils/taskTiers";

// Worst first — the order of the bar, its legend and a person's own tasks.
const STATE_ORDER = ["overdue", "todo", "doing", "done"];
const STATE_FILL = {
  overdue: CHART_OVERDUE,
  todo: STATUS_COLOR.todo,
  doing: STATUS_COLOR.doing,
  done: STATUS_COLOR.done,
};
// Ink on the card holds AA on both themes; a 500 fill does not.
const STATE_INK = {
  overdue: "var(--status-bad)",
  todo: "var(--text-3)",
  doing: "var(--status-warn)",
  done: "var(--status-ok)",
};
const STATE_LABEL = {
  overdue: "tasks.kpiOverdue",
  todo: "tasks.status.todo",
  doing: "tasks.status.doing",
  done: "tasks.status.done",
};

// A person's one-word answer (services/task_day.tone).
const TONE = {
  late:  { Icon: AlertTriangle, fill: CHART_OVERDUE,     ink: "var(--status-bad)" },
  going: { Icon: Hourglass,     fill: STATUS_COLOR.todo, ink: "var(--text-3)" },
  done:  { Icon: Check,         fill: STATUS_COLOR.done, ink: "var(--status-ok)" },
};

const cardStyle = { background: "var(--bg-card)", border: "1px solid var(--border)" };
const line = "1px solid var(--border)";

function ToneChip({ tone, label }) {
  const { Icon, fill, ink } = TONE[tone] || TONE.going;
  return (
    <span className="grid place-items-center w-5 h-5 rounded-full flex-shrink-0"
      style={{ background: `${fill}24`, color: ink }} title={label} aria-label={label} role="img">
      <Icon size={11} strokeWidth={2.5} />
    </span>
  );
}

function StatePill({ state, label }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0"
      style={{ background: `${STATE_FILL[state]}24`, color: STATE_INK[state] }}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: STATE_FILL[state] }} />
      {label}
    </span>
  );
}

export default function DayTasksCard({ params }) {
  const { auth } = useAuth();
  const { t } = useLang();
  const { tl, tx } = useTranslit();
  const qc = useQueryClient();
  const toast = useToast();

  const [thread, setThread] = useState(null);           // the task whose chat is open
  const [form, setForm] = useState(null);               // the task form's opening state
  // Folded or open — remembered per browser (a convenience, never a right).
  const [open, setOpen] = usePersistentState("day_tasks_open", false);
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
  // Brigadirs, then leaders — the org chart's own order.
  const groups = useMemo(
    () => TIERS.map((kind) => ({ kind, rows: people.filter((p) => p.kind === kind) })).filter((g) => g.rows.length),
    [people]);

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
  if (!data && !(auth?.role === "admin" || seen)) return null;

  const stateLabel = (s) => t(STATE_LABEL[s]);
  const parts = STATE_ORDER.map((s) => ({ key: s, label: stateLabel(s), color: STATE_FILL[s], value: totals?.[s] || 0 }));
  // The block sets a task at the tiers it shows — the server says which of
  // them this viewer may.
  const createKinds = [KIND_SUP, KIND_LEADER].filter((k) => data?.can_create?.[k]);
  const subtitle = t("dayTasks.subNow");

  // What a task's date line says, and in which ink.
  const dueLine = (task) => {
    const due = t("dayTasks.due").replace("{d}", fmtDate(task.due_date, t));
    if (task.state === "overdue") return { text: `${due} · ${t("dayTasks.lateBy").replace("{n}", task.days_late)}`, ink: "var(--status-bad)" };
    // A finished task says WHEN it was finished — it stays a week — and
    // whether that was in time; its deadline moves to the hover.
    if (task.state === "done") {
      const doneOn = t("dayTasks.doneOn").replace("{d}", fmtDate(task.done_day, t));
      return task.late
        ? { text: `${doneOn} · ${t("dayTasks.doneLate").replace("{n}", task.days_late)}`, ink: "var(--status-over)", title: due }
        : { text: `${doneOn} · ${t("dayTasks.onTime")}`, ink: "var(--status-ok)", title: due };
    }
    return { text: due, ink: "var(--text-3)" };
  };

  // One task, on one line from sm up (state · text · deadline · who set it ·
  // actions, in fixed columns so they line up down the list); stacked on a
  // phone, where the text gets the width.
  const taskRow = (p, task) => {
    const due = dueLine(task);
    const role = task.creator_role && ROLE_LABEL_KEYS[task.creator_role] ? t(ROLE_LABEL_KEYS[task.creator_role]) : null;
    const setter = task.created_by_name ? `${tl(task.created_by_name)}${role ? ` (${role})` : ""}` : "";
    const name = tl(p.name) || "—";
    return (
      <li key={task.id}
        className="px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1 sm:grid sm:grid-cols-[8.5rem_minmax(0,1fr)_13rem_9.5rem] lg:grid-cols-[8.5rem_minmax(0,1fr)_13rem_11rem_9.5rem]"
        style={{ borderTop: line }}>
        <span className="inline-flex items-center gap-1.5 min-w-0 max-sm:order-1">
          <StatePill state={task.state} label={stateLabel(task.state)} />
          {task.urgent && (
            <span className="inline-flex flex-shrink-0" style={{ color: URGENT_COLOR }} title={t("tasks.urgentOn")} aria-label={t("tasks.urgentOn")} role="img">
              <Flame size={13} />
            </span>
          )}
        </span>
        <span className="text-sm min-w-0 sm:truncate max-sm:order-3 max-sm:w-full max-sm:line-clamp-3 max-sm:break-words"
          style={{ color: "var(--text-1)" }} title={tx(task.text)}>
          {tx(task.text)}
        </span>
        <span className="text-[11px] font-semibold sm:truncate max-sm:order-4" style={{ color: due.ink }}
          title={due.title ? `${due.text} · ${due.title}` : due.text}>
          {due.text}
        </span>
        <span className="text-[11px] truncate max-lg:hidden" style={{ color: "var(--text-3)" }}
          title={setter ? t("dayTasks.setBy").replace("{name}", setter) : undefined}>
          {setter ? t("dayTasks.setBy").replace("{name}", setter) : ""}
        </span>
        <span className="inline-flex items-center justify-end gap-1.5 max-sm:order-2 max-sm:ml-auto">
          {task.can_remind && (task.reminded ? (
            <Button size="sm" variant="success" tint disabled icon={<Check size={12} />} title={t("dayTasks.remindSentTip")}>
              {t("dayTasks.remindSent")}
            </Button>
          ) : (
            <Button size="sm" variant="primary" tint icon={<BellRing size={12} />}
              loading={remindingId === task.id} title={t("dayTasks.remindTip")}
              onClick={() => remind.mutate({ task, name })}>
              {t("dayTasks.remind")}
            </Button>
          ))}
          {task.thread && (
            <CommentsButton count={task.comment_count} label={t("tasks.commentsTitle")} onClick={() => setThread(task)} />
          )}
        </span>
      </li>
    );
  };

  // A person: their line (the answer in one mark, done/total, how many late),
  // then every task they were set.
  const personBlock = (p) => (
    <div key={p.key} className="rounded-xl overflow-hidden" style={{ border: line }}>
      <div className="flex items-center gap-2 px-3 py-2" style={{ background: "var(--bg-inner)" }}>
        <ToneChip tone={p.tone} label={t(`dayTasks.tone.${p.tone}`)} />
        <span className="flex-1 min-w-0 truncate text-sm font-semibold" style={{ color: "var(--text-1)" }}
          title={p.unit_name ? `${tl(p.name)} · ${tl(p.unit_name)}` : tl(p.name)}>
          {tl(p.name) || "—"}
          {p.unit_name && <span className="font-normal" style={{ color: "var(--text-3)" }}> · {tl(p.unit_name)}</span>}
        </span>
        {p.overdue > 0 && (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-full flex-shrink-0"
            style={{ background: `${CHART_OVERDUE}1f`, color: "var(--status-bad)" }}
            title={`${stateLabel("overdue")}: ${p.overdue}`}>
            <AlertTriangle size={10} /> {p.overdue}
          </span>
        )}
        <span className="text-xs font-bold tabular-nums whitespace-nowrap flex-shrink-0" style={{ color: "var(--text-1)" }}
          title={t("dayTasks.doneOf").replace("{d}", p.done).replace("{n}", p.total)}>
          {p.done}<span style={{ color: "var(--text-3)" }}>/{p.total}</span>
        </span>
        {createKinds.includes(p.kind) && (
          <Button size="sm" variant="ghost" icon={<Plus size={12} />}
            aria-label={`${t("dayTasks.add")}: ${tl(p.name)}`} title={t("dayTasks.add")}
            onClick={() => setForm({ kind: p.kind, assignee_id: p.id })} />
        )}
      </div>
      <ul>{p.tasks.map((task) => taskRow(p, task))}</ul>
    </div>
  );

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
                {groups.map((g) => (
                  <div key={g.kind} className="mt-4">
                    <div className="text-[11px] uppercase tracking-wider font-semibold mb-1.5" style={{ color: "var(--text-3)" }}>
                      {t(`dayTasks.grp.${g.kind}`)} · {g.rows.length}
                    </div>
                    <div className="space-y-2">{g.rows.map(personBlock)}</div>
                  </div>
                ))}
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
          onClose={() => setThread(null)}
        />
      )}

      {toast.node}
    </div>
  );
}
