// «Maqsadlar» — the goal board (Laboratory, admin-only design preview).
//
// A goal is a title, an owner, an area, a period and a list of KEY RESULTS,
// each of five types (number · percent · currency · yes/no · task list). The
// page states how far each goal has come (the weighted mean of its results),
// whether it is on PACE for its deadline (the linear expectation the /live
// monitor already judges a shift's plan by), and what the pace so far
// forecasts. `utils/targets.js` is the one definition of every figure here.
//
// It is a TEST SCREEN: the goals live as a JSON blob per profile in
// `/api/ui-prefs/targets_lab` (the same door the column pickers use), so they
// follow the viewer across devices and cost no table — and never leak between
// two people. Making this a shared register is a separate decision.
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Target as TargetIcon, Plus, Trophy, CircleCheck, TriangleAlert, Gauge, Goal,
  LayoutGrid, Table2, FlaskConical, Sparkles,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import Button from "../components/ui/Button";
import KPICard from "../components/ui/KPICard";
import SearchInput from "../components/ui/SearchInput";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import StyledSelect from "../components/ui/StyledSelect";
import EmptyState from "../components/ui/EmptyState";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import { useToast } from "../components/ui/Toast";
import TableCard, { Th } from "../components/ui/DataTable";
import { SkeletonCard } from "../components/ui/Skeleton";
import GoalCard, { DaysLeft } from "../components/targets/GoalCard";
import GoalFormModal from "../components/targets/GoalFormModal";
import GoalDetailModal from "../components/targets/GoalDetailModal";
import { StatusChip, OwnerAvatar, PaceBar } from "../components/targets/bits";
import { buildDemoGoals } from "../components/targets/demoGoals";
import { useLang } from "../context/LangContext";
import { usePersistentState } from "../hooks/usePersistentState";
import api from "../utils/api";
import { GREEN, RED } from "../utils/statusBands";
import {
  CATEGORIES, STATUS_COLOR, STATUS_RANK, RISK_STATUSES, GREY, PACE,
  todayISO, normalizeGoal, goalProgress, goalStatus, elapsed, daysLeft, targetProgress,
  summarize, fmtPct, fmtDate, fill, categoryColor, hexA,
} from "../utils/targets";

const PREF_KEY = "targets_lab";
const SAVE_DELAY = 600;
const BRAND = "#C8973F";
const SORTS = ["status", "due", "progressDesc", "progressAsc", "title"];

const matches = (g, q) => {
  if (!q) return true;
  const hay = [g.title, g.description, g.owner, ...(g.targets ?? []).map((tg) => tg.title)].join(" ").toLowerCase();
  return hay.includes(q);
};
const inStatus = (st, f) =>
  f === "all" ? true
    : f === "achieved" ? st === "achieved"
      : f === "risk" ? RISK_STATUSES.has(st)
        : st !== "achieved"; // active
const byDue = (a, b) => (a.g.due ?? "9999") < (b.g.due ?? "9999") ? -1 : (a.g.due ?? "9999") > (b.g.due ?? "9999") ? 1 : 0;

function sortRows(rows, key, dir = "asc") {
  const s = dir === "asc" ? 1 : -1;
  const cmp = {
    status: (a, b) => (STATUS_RANK[a.st] - STATUS_RANK[b.st]) || byDue(a, b),
    due: byDue,
    progress: (a, b) => a.p - b.p,
    progressDesc: (a, b) => b.p - a.p,
    progressAsc: (a, b) => a.p - b.p,
    expected: (a, b) => (a.e ?? -1) - (b.e ?? -1),
    results: (a, b) => a.done - b.done,
    owner: (a, b) => (a.g.owner || "").localeCompare(b.g.owner || ""),
    title: (a, b) => a.g.title.localeCompare(b.g.title),
  }[key] ?? (() => 0);
  return [...rows].sort((a, b) => s * cmp(a, b));
}

export default function Targets() {
  const { t } = useLang();
  const toast = useToast();
  const today = todayISO();

  // ── the blob ──────────────────────────────────────────────────────────────
  const { data: stored, isLoading, isError, refetch } = useQuery({
    queryKey: ["ui-pref", PREF_KEY],
    queryFn: () => api.get(`/api/ui-prefs/${PREF_KEY}`).then((r) => r.data?.value ?? null),
    staleTime: Infinity,
    retry: 1,
  });
  // What the blob says — or the samples, for a profile that has never saved
  // anything, so the screen can be read before anything is typed. A saved
  // EMPTY list stays empty: «I deleted them» is not «I have never been here».
  const loaded = useMemo(() => {
    if (isLoading || isError) return null;
    return Array.isArray(stored?.goals) ? stored.goals.map(normalizeGoal) : buildDemoGoals(today);
  }, [stored, isLoading, isError]); // eslint-disable-line react-hooks/exhaustive-deps
  // Edits sit ON TOP of the loaded list: null until the first change, so the
  // load itself is never mistaken for an edit and never saved back.
  const [edits, setEdits] = useState(null);
  const goals = edits ?? loaded;
  const setGoals = (next) =>
    setEdits((cur) => (typeof next === "function" ? next(cur ?? loaded ?? []) : next));

  const [savedAt, setSavedAt] = useState(null);
  const save = useMutation({
    mutationFn: (value) => api.put(`/api/ui-prefs/${PREF_KEY}`, { value }),
    onSuccess: () => setSavedAt(Date.now()),
    onError: () => toast.error(t("targets.saveFailed")),
  });
  const dirty = useRef(false);
  const latest = useRef(null);
  const timer = useRef(null);
  useEffect(() => {
    if (edits === null) return;
    latest.current = edits;
    dirty.current = true;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      dirty.current = false;
      save.mutate({ v: 1, goals: edits, savedAt: new Date().toISOString() });
    }, SAVE_DELAY);
    return () => clearTimeout(timer.current);
  }, [edits]); // eslint-disable-line react-hooks/exhaustive-deps
  // Leaving the page inside the debounce window must not lose the last edit.
  useEffect(() => () => {
    if (dirty.current && latest.current) {
      api.put(`/api/ui-prefs/${PREF_KEY}`, { value: { v: 1, goals: latest.current, savedAt: new Date().toISOString() } }).catch(() => {});
    }
  }, []);

  // ── view state ────────────────────────────────────────────────────────────
  const [q, setQ] = useState("");
  const [status, setStatus] = usePersistentState("targets_status", "all");
  const [cat, setCat] = usePersistentState("targets_cat", "");
  const [sort, setSort] = usePersistentState("targets_sort", "status");
  const [view, setView] = usePersistentState("targets_view", "cards");
  const [tableSort, setTableSort] = useState({ key: "status", dir: "asc" });
  const [openId, setOpenId] = useState(null);
  const [form, setForm] = useState(null);       // { goal: null | goal }
  const [confirm, setConfirm] = useState(null); // { kind: "delete", goal } | { kind: "demo" }

  const rows = useMemo(
    () => (goals ?? []).map((g) => ({
      g, p: goalProgress(g), st: goalStatus(g, today), e: elapsed(g, today), left: daysLeft(g, today),
      done: (g.targets ?? []).filter((tg) => targetProgress(tg) >= 1).length,
    })),
    [goals, today],
  );
  const summary = useMemo(() => summarize(goals ?? [], today), [goals, today]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const kept = rows.filter((r) => matches(r.g, needle) && inStatus(r.st, status) && (!cat || r.g.category === cat));
    return view === "table" ? sortRows(kept, tableSort.key, tableSort.dir) : sortRows(kept, sort);
  }, [rows, q, status, cat, sort, view, tableSort]);
  const anyFilter = !!q || status !== "all" || !!cat;
  const clearFilters = () => { setQ(""); setStatus("all"); setCat(""); };

  const onSort = (key) => setTableSort((s) => ({ key, dir: s.key === key && s.dir === "asc" ? "desc" : "asc" }));

  // ── edits ─────────────────────────────────────────────────────────────────
  const upsert = (goal) => setGoals((gs) =>
    gs.some((g) => g.id === goal.id) ? gs.map((g) => (g.id === goal.id ? goal : g)) : [goal, ...gs]);
  const remove = (id) => {
    setGoals((gs) => gs.filter((g) => g.id !== id));
    if (openId === id) setOpenId(null);
  };
  const openGoal = goals?.find((g) => g.id === openId) ?? null;

  const catOptions = [
    { value: "", label: t("targets.catAll") },
    ...CATEGORIES.map((c) => ({
      value: c,
      title: t(`targets.cat.${c}`),
      label: (
        <span className="inline-flex items-center gap-2">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: categoryColor(c) }} />
          {t(`targets.cat.${c}`)}
        </span>
      ),
    })),
  ];

  const saveState = save.isPending ? t("targets.saving") : savedAt ? t("targets.saved") : "";

  return (
    <Layout>
      <div className="page-enter space-y-4">
        {/* ── hero ── */}
        <div className="rounded-2xl relative overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <span aria-hidden className="absolute inset-0 pointer-events-none"
            style={{ background: `radial-gradient(120% 130% at 18% -30%, ${hexA(BRAND, 0.26)} 0%, ${hexA(BRAND, 0.07)} 45%, transparent 75%)` }} />
          <div className="relative flex flex-wrap items-center gap-3 p-4 md:p-5">
            <span className="grid place-items-center w-12 h-12 rounded-2xl flex-shrink-0"
              style={{ background: "var(--brand-bg)", color: "var(--brand-text)", border: "1px solid var(--brand-border)" }}>
              <TargetIcon size={24} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg sm:text-xl font-bold leading-tight" style={{ color: "var(--text-1)", letterSpacing: "0.02em" }}>{t("targets.title")}</h2>
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                  style={{ background: "var(--brand-bg)", color: "var(--brand-text)", border: "1px solid var(--brand-border)" }}>
                  <FlaskConical size={11} />{t("targets.demoBadge")}
                </span>
              </div>
              <div className="text-[12px] mt-0.5" style={{ color: "var(--text-3)" }}>{t("targets.subtitle")}</div>
              <div className="text-[11px] mt-0.5" style={{ color: "var(--text-4)" }}>{t("targets.demoNote")}</div>
            </div>
            <div className="text-[11px] self-start" style={{ color: "var(--text-4)" }} aria-live="polite">{saveState}</div>
          </div>
        </div>

        {/* ── KPI strip ── */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <KPICard label={t("targets.kpi.total")} value={summary.total} icon={Goal} color={BRAND}
            sub={fill(t("targets.kpi.totalSub"), { active: summary.active, achieved: summary.achieved })} />
          <KPICard label={t("targets.kpi.achieved")} value={summary.achieved} icon={Trophy} color={summary.achieved ? GREEN : GREY} sub={t("targets.kpi.achievedSub")} />
          <KPICard label={t("targets.kpi.onTrack")} value={summary.onTrack} icon={CircleCheck} color={summary.onTrack ? GREEN : GREY} sub={t("targets.kpi.onTrackSub")} />
          <KPICard label={t("targets.kpi.risk")} value={summary.risk} icon={TriangleAlert} color={summary.risk ? RED : GREY} sub={t("targets.kpi.riskSub")} />
          <KPICard label={t("targets.kpi.avg")} value={goals?.length ? fmtPct(summary.avg) : "—"} icon={Gauge} color={BRAND} sub={t("targets.kpi.avgSub")} />
        </div>

        {/* ── toolbar ── */}
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={q} onChange={setQ} placeholder={t("targets.search")} className="w-full sm:w-64" />
          <SegmentedToggle
            value={status} onChange={setStatus}
            options={[["all", t("targets.filter.all")], ["active", t("targets.filter.active")], ["risk", t("targets.filter.risk")], ["achieved", t("targets.filter.achieved")]]}
          />
          <StyledSelect value={cat} onChange={setCat} options={catOptions} />
          <StyledSelect value={sort} onChange={setSort} options={SORTS.map((s) => ({ value: s, label: t(`targets.sort.${s}`) }))} />
          <div className="ml-auto flex items-center gap-2 flex-wrap">
            <SegmentedToggle
              value={view} onChange={setView} ariaLabel={t("targets.view.cards")}
              options={[
                { value: "cards", title: t("targets.view.cards"), label: <LayoutGrid size={14} /> },
                { value: "table", title: t("targets.view.table"), label: <Table2 size={14} /> },
              ]}
            />
            <Button size="lg" variant="ghost" icon={<Sparkles size={14} />} onClick={() => setConfirm({ kind: "demo" })}>{t("targets.demo.load")}</Button>
            <Button size="lg" variant="primary" icon={<Plus size={15} />} onClick={() => setForm({ goal: null })}>{t("targets.newGoal")}</Button>
          </div>
        </div>

        {/* ── body ── */}
        {goals === null ? (
          isError ? (
            <EmptyState icon={TargetIcon} title={t("targets.loadFailed")} message="" showUploadLink={false}
              action={<Button variant="secondary" onClick={() => refetch()}>{t("targets.retry")}</Button>} />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          )
        ) : goals.length === 0 ? (
          <EmptyState icon={TargetIcon} title={t("targets.empty.title")} message={t("targets.empty.msg")} showUploadLink={false} height="h-56"
            action={
              <div className="flex items-center gap-2">
                <Button variant="primary" icon={<Plus size={14} />} onClick={() => setForm({ goal: null })}>{t("targets.newGoal")}</Button>
                <Button variant="secondary" icon={<Sparkles size={14} />} onClick={() => setGoals(buildDemoGoals(today))}>{t("targets.demo.load")}</Button>
              </div>
            } />
        ) : shown.length === 0 ? (
          <EmptyState icon={TargetIcon} title={t("targets.empty.noMatch")} message="" showUploadLink={false}
            action={anyFilter ? <Button variant="secondary" onClick={clearFilters}>{t("targets.empty.clearFilters")}</Button> : null} />
        ) : view === "cards" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {shown.map((r) => (
              <GoalCard
                key={r.g.id} goal={r.g} today={today}
                onOpen={() => setOpenId(r.g.id)}
                onEdit={() => setForm({ goal: r.g })}
                onDelete={() => setConfirm({ kind: "delete", goal: r.g })}
              />
            ))}
          </div>
        ) : (
          <TableCard
            icon={TargetIcon} title={t("targets.title")} minWidth={820}
            right={<span className="text-xs" style={{ color: "var(--text-3)" }}>{fill(t("targets.count"), { n: shown.length })}</span>}
          >
            <thead>
              <tr>
                <Th label={t("targets.col.goal")} k="title" sort={tableSort} onSort={onSort} />
                <Th label={t("targets.col.status")} k="status" sort={tableSort} onSort={onSort} />
                <Th label={t("targets.col.progress")} k="progress" sort={tableSort} onSort={onSort} cls="min-w-[200px]" />
                <Th label={t("targets.col.expected")} k="expected" sort={tableSort} onSort={onSort} align="right" hint={t("targets.expectedHint")} />
                <Th label={t("targets.col.due")} k="due" sort={tableSort} onSort={onSort} />
                <Th label={t("targets.col.results")} k="results" sort={tableSort} onSort={onSort} align="center" />
                <Th label={t("targets.col.owner")} k="owner" sort={tableSort} onSort={onSort} />
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.g.id} className="cursor-pointer" onClick={() => setOpenId(r.g.id)}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: categoryColor(r.g.category) }} title={t(`targets.cat.${r.g.category}`)} />
                      <span className="font-medium truncate max-w-[300px]" style={{ color: "var(--text-1)" }}>{r.g.title}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2"><StatusChip status={r.st} t={t} /></td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <PaceBar progress={r.p} expected={r.e} color={STATUS_COLOR[r.st]} height={6} className="flex-1" />
                      <span className="font-mono font-semibold tabular-nums w-10 text-right" style={{ color: STATUS_COLOR[r.st] }}>{fmtPct(r.p)}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums" style={{ color: "var(--text-3)" }}>{r.e === null ? "—" : fmtPct(r.e)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <span style={{ color: "var(--text-2)" }}>{r.g.due ? fmtDate(r.g.due, t, today) : "—"}</span>
                      {r.st !== "achieved" && <DaysLeft left={r.left} t={t} />}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center font-mono tabular-nums" style={{ color: "var(--text-3)" }}>{r.done}/{(r.g.targets ?? []).length}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <OwnerAvatar name={r.g.owner} size={18} />
                      <span className="truncate" style={{ color: r.g.owner ? "var(--text-2)" : "var(--text-4)" }}>{r.g.owner || "—"}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableCard>
        )}

        <p className="text-[11px]" style={{ color: "var(--text-4)" }}>
          {fill(t("targets.legend.status"), { grace: Math.round(PACE.grace * 100), risk: Math.round(PACE.risk * 100) })}
        </p>
      </div>

      {openGoal && (
        <GoalDetailModal
          goal={openGoal} today={today}
          onClose={() => setOpenId(null)}
          onChange={upsert}
          onEdit={() => setForm({ goal: openGoal })}
          onDelete={() => setConfirm({ kind: "delete", goal: openGoal })}
        />
      )}
      {form && (
        <GoalFormModal
          initial={form.goal} today={today} zIndex={openGoal ? 60 : 50}
          onClose={() => setForm(null)}
          onSave={(goal) => { upsert(goal); setForm(null); }}
        />
      )}
      {confirm?.kind === "delete" && (
        <ConfirmDialog
          open tone="danger"
          title={t("targets.deleteTitle")}
          message={fill(t("targets.deleteMsg"), { title: confirm.goal.title })}
          confirmLabel={t("common.delete")}
          onCancel={() => setConfirm(null)}
          onConfirm={() => { remove(confirm.goal.id); setConfirm(null); }}
        />
      )}
      {confirm?.kind === "demo" && (
        <ConfirmDialog
          open
          title={t("targets.demo.confirmTitle")}
          message={fill(t("targets.demo.confirmMsg"), { n: goals?.length ?? 0 })}
          confirmLabel={t("targets.demo.load")}
          onCancel={() => setConfirm(null)}
          onConfirm={() => { setGoals(buildDemoGoals(today)); setOpenId(null); setConfirm(null); }}
        />
      )}
      {toast.node}
    </Layout>
  );
}
