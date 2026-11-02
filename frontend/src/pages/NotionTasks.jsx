import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, CalendarClock, CalendarX2, CheckCircle2, CircleDot, Clock, ExternalLink, Flame,
  ListChecks, RefreshCw, Sun, Sunrise, Users, CalendarRange, FolderTree,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import TableCard, { Th } from "../components/ui/DataTable";
import { FilterPanel, OptsFilter } from "../components/ui/ColumnFilter";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import SearchInput from "../components/ui/SearchInput";
import EmptyState from "../components/ui/EmptyState";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import { useToast } from "../components/ui/Toast";
import { SkeletonBlock, SkeletonCard } from "../components/ui/Skeleton";
import { usePersistentState } from "../hooks/usePersistentState";
import {
  useNT, fill, ddmm, stamp, openExt, detailOf, sectionOf, SECTION_ORDER,
} from "../components/notion/notionUtil";
import api from "../utils/api";

/**
 * «Notion vazifalari» — the Notion "Production" task list, read-only
 * (GET /api/notion-tasks → services/notion_tracker.py). The same list the
 * daily Telegram reminders are built from, grouped by where each task stands
 * against today: overdue, today, tomorrow, the next 7 days, later, no
 * deadline — and, on request, done. A row opens the task; «Notion'da ochish»
 * is the way to change it. Page key `notion-tasks`, admin-only until opened on
 * the Access tab.
 */

const QK = ["notion-tasks"];
const NOBODY = "__nobody__";
const NO_LIST = [];
const RED = "var(--status-bad)";
const AMBER = "var(--status-warn)";

const SECTION_META = {
  overdue:  { icon: AlertTriangle, key: "secOverdue", ink: RED },
  today:    { icon: Sun, key: "secToday", ink: AMBER },
  tomorrow: { icon: Sunrise, key: "secTomorrow" },
  soon:     { icon: CalendarRange, key: "secSoon" },
  later:    { icon: CalendarClock, key: "secLater" },
  nodue:    { icon: CalendarX2, key: "secNoDue" },
  done:     { icon: CheckCircle2, key: "secDone", ink: "var(--status-ok)" },
};

function relDue(T, t) {
  if (t.left == null) return "";
  if (t.left < 0) return fill(T.late, { n: -t.left });
  if (t.left === 0) return T.today;
  if (t.left === 1) return T.tomorrow;
  return fill(T.inDays, { n: t.left });
}

const dueText = (t) => (t.due ? `${ddmm(t.due)}${t.due_time ? ` ${t.due_time}` : ""}` : "—");
const peopleText = (T, t) => (t.assignees.length ? t.assignees.join(", ") : T.nobody);

function bySection(sec) {
  if (sec === "overdue") return (a, b) => a.left - b.left || b.high - a.high || a.title.localeCompare(b.title);
  if (sec === "nodue") return (a, b) => b.high - a.high || a.title.localeCompare(b.title);
  if (sec === "done") return (a, b) => (b.due || "").localeCompare(a.due || "") || a.title.localeCompare(b.title);
  return (a, b) => a.left - b.left || b.high - a.high || (a.due_time || "").localeCompare(b.due_time || "")
    || a.title.localeCompare(b.title);
}

function HighMark({ T }) {
  return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-px rounded-md text-[11px] font-semibold flex-shrink-0"
      style={{ background: "rgba(239,68,68,0.12)", color: RED }}>
      <Flame size={11} aria-hidden="true" />{T.high}
    </span>
  );
}

function StatusChip({ text }) {
  if (!text) return <span style={{ color: "var(--text-3)" }}>—</span>;
  return (
    <span className="inline-block max-w-full truncate px-2 py-0.5 rounded-md text-[11px]"
      style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-2)" }} title={text}>
      {text}
    </span>
  );
}

function NotionLink({ T, url, size = 14 }) {
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" onClick={(e) => { e.stopPropagation(); openExt(e, url); }}
      title={T.open} aria-label={T.open}
      className="inline-flex items-center justify-center w-7 h-7 rounded-lg hover:bg-[var(--bg-inner)] focus-visible:outline focus-visible:outline-2"
      style={{ color: "var(--text-3)" }}>
      <ExternalLink size={size} />
    </a>
  );
}

function Kpi({ label, value, sub, ink, icon: Icon }) {
  return (
    <div className="rounded-2xl px-4 py-3 min-w-0" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-3)" }}>
        <Icon size={13} aria-hidden="true" /><span className="truncate">{label}</span>
      </div>
      <div className="text-2xl font-bold tabular-nums mt-1" style={{ color: value > 0 && ink ? ink : "var(--text-1)" }}>{value}</div>
      <div className="text-[11px] mt-0.5 truncate h-4" style={{ color: "var(--text-3)" }}>{sub || ""}</div>
    </div>
  );
}

function TaskModal({ T, task, onClose }) {
  if (!task) return null;
  const row = (label, value) => (
    <div className="grid grid-cols-[minmax(0,9rem)_1fr] gap-3 text-sm py-1.5" style={{ borderTop: "1px solid var(--border)" }}>
      <div style={{ color: "var(--text-3)" }}>{label}</div>
      <div className="min-w-0" style={{ color: "var(--text-1)" }}>{value}</div>
    </div>
  );
  const rel = relDue(T, task);
  return (
    <Modal open onClose={onClose} title={task.title} subtitle={task.parent ? fill(T.inTask, { p: task.parent }) : undefined}
      icon={<ListChecks size={18} />} maxWidth="max-w-xl"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>{T.close}</Button>
          {task.url && (
            <Button href={task.url} target="_blank" rel="noopener noreferrer" icon={ExternalLink}
              onClick={(e) => openExt(e, task.url)}>
              {T.open}
            </Button>
          )}
        </>
      )}>
      <div>
        {row(T.dStatus, <StatusChip text={task.status} />)}
        {row(T.dPeople, peopleText(T, task))}
        {row(T.dDue, task.due ? (
          <span>
            <span className="tabular-nums">{dueText(task)}</span>
            {rel && <span style={{ color: task.left < 0 && !task.done ? RED : "var(--text-3)" }}> · {rel}</span>}
          </span>
        ) : "—")}
        {row(T.dPriority, task.high ? <HighMark T={T} /> : (task.priority || "—"))}
        {task.parent && row(T.dParent, task.parent)}
        <div className="pt-3" style={{ borderTop: "1px solid var(--border)" }}>
          <div className="text-xs mb-1" style={{ color: "var(--text-3)" }}>{T.dNote}</div>
          <p className="text-sm whitespace-pre-wrap break-words" style={{ color: task.note ? "var(--text-1)" : "var(--text-3)" }}>
            {task.note || T.noNote}
          </p>
        </div>
      </div>
    </Modal>
  );
}

function Section({ T, sec, items, onOpen }) {
  const meta = SECTION_META[sec];
  const Icon = meta.icon;
  const rows = items.map((t) => {
    const rel = relDue(T, t);
    const lateInk = t.left != null && t.left < 0 && !t.done ? RED : "var(--text-3)";
    return (
      <tr key={t.id} className="cursor-pointer" onClick={() => onOpen(t)}>
        <td className="px-3 py-2">
          <div className="flex items-center gap-1.5 min-w-0">
            {t.high && <HighMark T={T} />}
            <button type="button" className="truncate text-left font-medium hover:underline focus-visible:outline focus-visible:outline-2 rounded"
              onClick={(e) => { e.stopPropagation(); onOpen(t); }} title={t.title}>
              {t.title}
            </button>
            {t.parent && (
              <span className="truncate flex-shrink min-w-0 text-[11px]" style={{ color: "var(--text-3)" }} title={fill(T.inTask, { p: t.parent })}>
                · {t.parent}
              </span>
            )}
          </div>
        </td>
        <td className="px-3 py-2"><div className="truncate" title={peopleText(T, t)}
          style={{ color: t.assignees.length ? "var(--text-1)" : "var(--text-3)" }}>{peopleText(T, t)}</div></td>
        <td className="px-3 py-2">
          <div className="truncate tabular-nums" title={rel}>
            {dueText(t)}{rel && <span style={{ color: lateInk }}> · {rel}</span>}
          </div>
        </td>
        <td className="px-3 py-2"><StatusChip text={t.status} /></td>
        <td className="px-1 py-1 text-center"><NotionLink T={T} url={t.url} /></td>
      </tr>
    );
  });
  const mobile = (
    <ul>
      {items.map((t) => {
        const rel = relDue(T, t);
        return (
          <li key={t.id} style={{ borderTop: "1px solid var(--border)" }}>
            <button type="button" onClick={() => onOpen(t)} className="w-full text-left px-4 py-3 min-h-[44px] active:bg-[var(--bg-inner)]">
              <div className="flex items-start gap-2">
                <span className="text-sm font-medium flex-1 min-w-0 break-words" style={{ color: "var(--text-1)" }}>{t.title}</span>
                {t.high && <HighMark T={T} />}
              </div>
              <div className="text-xs mt-1 flex flex-wrap gap-x-2" style={{ color: "var(--text-3)" }}>
                <span className="tabular-nums">{dueText(t)}{rel && <span style={{ color: t.left < 0 && !t.done ? RED : undefined }}> · {rel}</span>}</span>
                <span>· {peopleText(T, t)}</span>
                {t.status && <span>· {t.status}</span>}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
  return (
    <TableCard icon={Icon} title={T[meta.key]} right={<span className="tabular-nums" style={{ color: meta.ink || "var(--text-3)" }}>{items.length}</span>}
      fixed maxHeight="none" mobile={mobile}>
      <colgroup>
        <col style={{ width: "44%" }} /><col style={{ width: "20%" }} /><col style={{ width: "18%" }} />
        <col style={{ width: "13%" }} /><col style={{ width: "5%" }} />
      </colgroup>
      <thead>
        <tr>
          <Th label={T.cTask} /><Th label={T.cPeople} /><Th label={T.cDue} /><Th label={T.cStatus} />
          <Th label="" />
        </tr>
      </thead>
      <tbody>{rows}</tbody>
    </TableCard>
  );
}

export default function NotionTasks() {
  const T = useNT();
  const qc = useQueryClient();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [people, setPeople] = usePersistentState("notion_tasks_people", NO_LIST);
  const [show, setShow] = usePersistentState("notion_tasks_show", "open");
  const [openTask, setOpenTask] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const query = useQuery({
    queryKey: QK,
    queryFn: () => api.get("/api/notion-tasks").then((r) => r.data),
    staleTime: 60_000,
    retry: false,
  });
  const data = query.data;

  const refresh = async () => {
    setRefreshing(true);
    try {
      const r = await api.get("/api/notion-tasks", { params: { refresh: true } });
      qc.setQueryData(QK, r.data);
      toast.success(T.refreshed);
    } catch (e) {
      const d = detailOf(e);
      toast.error(T.err[d?.code] ? fill(T.err[d.code], { m: d.message || "" }) : T.errLoad);
    } finally {
      setRefreshing(false);
    }
  };

  const tasks = data?.tasks || NO_LIST;
  const personOpts = useMemo(() => [...(data?.people || []), NOBODY], [data]);
  const personLabel = (p) => (p === NOBODY ? T.nobody : p);

  // Every filter but «show» — the KPI tiles count open tasks whatever «show» says.
  const matched = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return tasks.filter((t) => {
      if (people.length) {
        const hit = t.assignees.some((a) => people.includes(a)) || (!t.assignees.length && people.includes(NOBODY));
        if (!hit) return false;
      }
      if (!needle) return true;
      return [t.title, t.note, t.parent, t.status, ...t.assignees].some((s) => (s || "").toLowerCase().includes(needle));
    });
  }, [tasks, people, q]);

  const shown = matched.filter((t) => (show === "all" ? true : show === "done" ? t.done : !t.done));
  const groups = useMemo(() => {
    const m = new Map(SECTION_ORDER.map((s) => [s, []]));
    shown.forEach((t) => m.get(sectionOf(t)).push(t));
    m.forEach((items, s) => items.sort(bySection(s)));
    return SECTION_ORDER.filter((s) => m.get(s).length).map((s) => [s, m.get(s)]);
  }, [shown]);

  const open = matched.filter((t) => !t.done);
  const overdue = open.filter((t) => t.left != null && t.left < 0);
  const kpi = {
    overdue: overdue.length,
    oldest: overdue.length ? Math.max(...overdue.map((t) => -t.left)) : 0,
    today: open.filter((t) => t.left === 0).length,
    week: open.filter((t) => t.left != null && t.left >= 1 && t.left <= 7).length,
    nodue: open.filter((t) => t.left == null).length,
  };

  const brief = (sel) => (sel.length === 1 ? personLabel(sel[0]) : sel.length ? fill(T.nSelected, { n: sel.length }) : "");
  const showLabel = { open: T.stOpen, done: T.stDone, all: T.stAll };
  const sections = [
    {
      key: "show", icon: CircleDot, label: T.fStatus, group: T.grp, pinned: true,
      active: show !== "open", display: showLabel[show], onClear: () => setShow("open"),
      render: () => (
        <SegmentedToggle fill value={show} onChange={setShow}
          options={[["open", T.stOpen], ["done", T.stDone], ["all", T.stAll]]} ariaLabel={T.fStatus} />
      ),
    },
    {
      key: "people", icon: Users, label: T.fPerson, group: T.grp, pinned: true,
      active: people.length > 0, display: brief(people), onClear: () => setPeople([]),
      render: () => (
        <OptsFilter searchable opts={personOpts} sel={people} onChange={setPeople}
          labelOf={personLabel} render={personLabel} />
      ),
    },
  ];
  const anyFilter = people.length > 0 || show !== "open" || q.trim();
  const clearAll = () => { setPeople([]); setShow("open"); setQ(""); };

  const failed = query.isError ? detailOf(query.error) : null;

  return (
    <Layout title={T.title}>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <FilterPanel sections={sections} />
        <SearchInput value={q} onChange={setQ} placeholder={T.search} className="flex-1 min-w-[12rem] max-w-sm" />
        <div className="ml-auto flex items-center gap-2">
          {data?.read_at && (
            <span className="text-xs tabular-nums hidden sm:inline" style={{ color: "var(--text-3)" }}>
              {fill(T.readAt, { at: stamp(data.read_at) })}
            </span>
          )}
          <Button variant="secondary" size="lg" icon={RefreshCw} loading={refreshing} disabled={refreshing || query.isLoading}
            onClick={refresh} aria-label={T.refresh} title={T.refresh} />
        </div>
      </div>

      {query.isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[0, 1, 2, 3].map((i) => <SkeletonCard key={i} />)}</div>
          <SkeletonBlock className="h-64 rounded-2xl" />
        </div>
      ) : failed?.code === "notion_missing" ? (
        <EmptyState tone="danger" icon={AlertTriangle} title={T.errMissing} message={T.errMissingSub} showUploadLink={false} />
      ) : query.isError ? (
        <EmptyState tone="danger" icon={AlertTriangle} title={T.errLoad}
          message={T.err[failed?.code] ? fill(T.err[failed.code], { m: failed.message || "" }) : ""}
          showUploadLink={false}
          action={<Button variant="secondary" icon={RefreshCw} onClick={() => query.refetch()}>{T.retry}</Button>} />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <Kpi icon={AlertTriangle} label={T.kOverdue} value={kpi.overdue} ink={RED}
              sub={kpi.overdue ? fill(T.kOverdueSub, { n: kpi.oldest }) : ""} />
            <Kpi icon={Clock} label={T.kToday} value={kpi.today} ink={AMBER} />
            <Kpi icon={CalendarRange} label={T.kWeek} value={kpi.week} sub={T.kWeekSub} />
            <Kpi icon={FolderTree} label={T.kNoDue} value={kpi.nodue} />
          </div>

          {groups.length ? (
            <div className="space-y-4">
              {groups.map(([sec, items]) => <Section key={sec} T={T} sec={sec} items={items} onOpen={setOpenTask} />)}
            </div>
          ) : anyFilter ? (
            <EmptyState icon={ListChecks} title={T.noMatch} message={T.noMatchSub} showUploadLink={false}
              action={<Button variant="secondary" onClick={clearAll}>{T.clearAll}</Button>} />
          ) : (
            <EmptyState icon={CheckCircle2} title={T.allClear} message={T.allClearSub} showUploadLink={false} />
          )}
        </>
      )}

      <TaskModal T={T} task={openTask} onClose={() => setOpenTask(null)} />
      {toast.node}
    </Layout>
  );
}
