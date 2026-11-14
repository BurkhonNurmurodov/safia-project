/**
 * «Rahbariyat vazifalari» — the tasks management set, on «Smena kunligi».
 *
 * The operator (2026-11-14): tasks a top-manager, a shift-manager or an admin
 * sets must show on the shift day, «easy visible for top managers to say like
 * you are not doing or good doing». So this is a board of PEOPLE, not a table
 * of tasks: one tile per person who was set work from above, worst first, the
 * answer readable before anything is opened —
 *
 *   red   something is past its date («Bajarilmayapti»)
 *   grey / yellow   open work, all of it in time
 *   green everything they were set is done
 *
 * and a tile opens that person's tasks, each with its chat.
 *
 * `GET /api/tasks/day` is the whole read (`services/task_day.py` holds the
 * rule of what a day contains and the four states). The SERVER decides who
 * sees the block: `show: false` draws nothing — it is the admins' alone until
 * the day the operator names (`task_board.OPEN_FROM`), and there is no client
 * twin of that date to keep in step.
 *
 * The four states are a PARTITION here (late is its own bucket), unlike the
 * /tasks board where overdue is a flag beside three statuses: that page counts
 * what the status column says, this block asks who is late.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, ClipboardCheck, Flame, Hourglass, Plus } from "lucide-react";
import { SectionHead } from "../ui/DataTable";
import { RankedBar } from "../ui/AnalysisBoard";
import { SplitBar, SplitLegend } from "../ui/Meter";
import { STATUS_COLOR, CHART_OVERDUE, URGENT_COLOR } from "../ui/TaskQueue";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import CommentsModal, { CommentsButton } from "../ui/CommentsModal";
import { SkeletonBlock } from "../ui/Skeleton";
import TaskFormModal from "../tasks/TaskFormModal";
import api from "../../utils/api";
import { useAuth } from "../../context/AuthContext";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { usePersistentState } from "../../hooks/usePersistentState";
import { fmtDate } from "../../utils/targets";
import { ROLE_LABEL_KEYS } from "../../config/pages";
import { TIERS, KIND_SUP, KIND_SM, endpointFor } from "../../utils/taskTiers";

// Worst first, left to right — the red starts at the same edge on every tile,
// so who is late reads straight down the column.
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

// People shown per tier before «yana N» — the list is worst first, so the
// slice on screen is the people to talk to.
const SHOWN = 6;

const cardStyle = { background: "var(--bg-card)", border: "1px solid var(--border)" };

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

export default function DayTasksCard({ day, params }) {
  const { auth } = useAuth();
  const { t } = useLang();
  const { tl, tx } = useTranslit();
  const qc = useQueryClient();

  const [personKey, setPersonKey] = useState(null);     // whose tasks are open
  const [thread, setThread] = useState(null);           // the task whose chat is open
  const [form, setForm] = useState(null);               // the task form's opening state
  const [expanded, setExpanded] = useState({});         // tier → show every person
  // Whether this browser was shown the block last time — so a reader who has
  // it gets its skeleton while it loads instead of a block dropping in above
  // the board. Never a right: the server decides (`show`).
  const [seen, setSeen] = usePersistentState("day_tasks_seen", false);

  const query = useMemo(
    () => ({ date: day, ...(params?.shift ? { shift: params.shift } : {}), ...(params?.factory != null ? { factory: params.factory } : {}) }),
    [day, params]);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["day-tasks", query],
    queryFn: () => api.get("/api/tasks/day", { params: query }).then((r) => {
      setSeen(!!r.data?.show);
      return r.data;
    }),
    enabled: !!day,
    staleTime: 30_000,
  });

  const people = useMemo(() => data?.people || [], [data]);
  const totals = data?.totals;
  const groups = useMemo(
    () => TIERS.map((kind) => ({ kind, rows: people.filter((p) => p.kind === kind) })).filter((g) => g.rows.length),
    [people]);
  const maxTotal = people.reduce((m, p) => Math.max(m, p.total), 0);
  // Read off the fresh payload, so an open dialog follows a refetch.
  const person = personKey ? people.find((p) => p.key === personKey) : null;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["day-tasks"] });
    qc.invalidateQueries({ queryKey: ["task-board"] });
  };

  if (data && !data.show) return null;
  // Without an answer — still loading, or the read failed — the block is
  // drawn only for a reader known to have it (a skeleton, then the failure).
  // Anybody else gets nothing: a block that is not theirs has nothing to report.
  if (!data && !(auth?.role === "admin" || seen)) return null;

  const stateLabel = (s) => t(STATE_LABEL[s]);
  const unit = t("tasks.itemsUnit");
  const parts = STATE_ORDER.map((s) => ({ key: s, label: stateLabel(s), color: STATE_FILL[s], value: totals?.[s] || 0 }));
  const barParts = STATE_ORDER.map((s) => ({ key: s, label: stateLabel(s), color: STATE_FILL[s] }));
  const createKinds = [data?.can_create?.[KIND_SUP] && KIND_SUP, data?.can_create?.[KIND_SM] && KIND_SM].filter(Boolean);
  const toneLabel = (p) => t(`dayTasks.tone.${p.tone}`);
  const dateLabel = fmtDate(data?.date || day, t);

  const tile = (p) => (
    <RankedBar
      key={p.key}
      row={{ ...p, label: tl(p.name) || "—", title: p.unit_name ? `${tl(p.name)} · ${tl(p.unit_name)}` : tl(p.name) }}
      max={maxTotal}
      parts={barParts}
      unit={unit}
      badge={<ToneChip tone={p.tone} label={toneLabel(p)} />}
      extra={p.overdue > 0 ? (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-full"
          style={{ background: `${CHART_OVERDUE}1f`, color: "var(--status-bad)" }}
          title={`${stateLabel("overdue")}: ${p.overdue} ${unit}`}>
          <AlertTriangle size={10} /> {p.overdue}
        </span>
      ) : null}
      value={
        <span className="text-xs font-bold tabular-nums whitespace-nowrap" style={{ color: "var(--text-1)" }}
          title={t("dayTasks.doneOf").replace("{d}", p.done).replace("{n}", p.total)}>
          {p.done}<span style={{ color: "var(--text-3)" }}>/{p.total}</span>
        </span>
      }
      onClick={() => setPersonKey(p.key)}
    />
  );

  // What a task's date line says, and in which ink.
  const dueLine = (task) => {
    const due = fmtDate(task.due_date, t);
    if (task.state === "overdue") {
      return { text: `${t("dayTasks.due").replace("{d}", due)} · ${t("dayTasks.lateBy").replace("{n}", task.days_late)}`, ink: "var(--status-bad)" };
    }
    if (task.state === "done") {
      return task.late
        ? { text: `${t("dayTasks.due").replace("{d}", due)} · ${t("dayTasks.doneLate").replace("{n}", task.days_late)}`, ink: "var(--status-over)" }
        : { text: `${t("dayTasks.due").replace("{d}", due)} · ${t("dayTasks.onTime")}`, ink: "var(--status-ok)" };
    }
    return { text: t("dayTasks.due").replace("{d}", due), ink: "var(--text-3)" };
  };

  return (
    <div className="rounded-xl overflow-hidden mb-6" style={cardStyle}>
      <SectionHead
        icon={ClipboardCheck}
        color="#3b82f6"
        title={t("dayTasks.title")}
        subtitle={t("dayTasks.sub").replace("{d}", dateLabel)}
        right={createKinds.length ? (
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
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-3 pt-2">
              {Array.from({ length: 3 }).map((_, i) => <SkeletonBlock key={i} className="h-10 w-full" />)}
            </div>
          </div>
        ) : !people.length ? (
          <div className="text-sm py-2" style={{ color: "var(--text-3)" }}>{t("dayTasks.empty")}</div>
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

            {groups.map((g) => {
              const all = !!expanded[g.kind];
              const rows = all ? g.rows : g.rows.slice(0, SHOWN);
              const more = g.rows.length - SHOWN;
              return (
                <div key={g.kind} className="mt-4">
                  <div className="text-[11px] uppercase tracking-wider font-semibold mb-1.5" style={{ color: "var(--text-3)" }}>
                    {t(`dayTasks.grp.${g.kind}`)} · {g.rows.length}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-1.5">
                    {rows.map(tile)}
                  </div>
                  {more > 0 && (
                    <div className="mt-1.5">
                      <Button size="sm" variant="ghost"
                        onClick={() => setExpanded((e) => ({ ...e, [g.kind]: !all }))}>
                        {all ? t("dayTasks.showLess") : t("dayTasks.showMore").replace("{n}", more)}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* One person's tasks on that day */}
      {person && (
        <Modal
          onClose={() => setPersonKey(null)}
          maxWidth="max-w-xl"
          title={tl(person.name) || "—"}
          subtitle={[
            t(`tasks.tier.${person.kind}`),
            person.unit_name ? tl(person.unit_name) : null,
            t("dayTasks.doneOf").replace("{d}", person.done).replace("{n}", person.total),
          ].filter(Boolean).join(" · ")}
          footer={
            <>
              <Button variant="secondary" onClick={() => setPersonKey(null)}>{t("dayTasks.close")}</Button>
              {createKinds.includes(person.kind) && (
                <Button icon={<Plus size={14} />}
                  onClick={() => setForm({ kind: person.kind, assignee_id: person.id })}>
                  {t("dayTasks.add")}
                </Button>
              )}
            </>
          }
        >
          <SplitBar parts={STATE_ORDER.map((s) => ({ key: s, label: stateLabel(s), color: STATE_FILL[s], value: person[s] }))} height={8} />
          <div className="space-y-2">
            {person.tasks.map((task) => {
              const due = dueLine(task);
              const role = task.creator_role && ROLE_LABEL_KEYS[task.creator_role] ? t(ROLE_LABEL_KEYS[task.creator_role]) : null;
              return (
                <div key={task.id} className="rounded-xl p-3" style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <StatePill state={task.state} label={stateLabel(task.state)} />
                        {task.urgent && (
                          <span className="inline-flex" style={{ color: URGENT_COLOR }} title={t("tasks.urgentOn")} aria-label={t("tasks.urgentOn")} role="img">
                            <Flame size={13} />
                          </span>
                        )}
                      </div>
                      <div className="text-sm whitespace-pre-wrap break-words" style={{ color: "var(--text-1)" }}>
                        {tx(task.text)}
                      </div>
                    </div>
                    {task.thread && (
                      <CommentsButton count={task.comment_count} label={t("tasks.commentsTitle")} onClick={() => setThread(task)} />
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]" style={{ color: "var(--text-3)" }}>
                    <span className="font-semibold" style={{ color: due.ink }}>{due.text}</span>
                    {task.created_by_name && (
                      <span>
                        {t("dayTasks.setBy").replace("{name}", tl(task.created_by_name))}{role ? ` (${role})` : ""}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Modal>
      )}

      {/* The ONE task form — set a task without leaving the day */}
      {form && (
        <TaskFormModal
          kinds={createKinds}
          initial={form}
          zIndex={60}
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
          zIndex={60}
          onClose={() => setThread(null)}
        />
      )}
    </div>
  );
}
