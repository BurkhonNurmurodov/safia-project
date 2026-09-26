// «Maqsadlar» — the goal board (Laboratory, admin-only design preview).
//
// A goal is a title, an owner, an area, a period and a list of KEY RESULTS,
// each of five types (number · percent · currency · yes/no · task list). The
// board answers one question first — which goals need somebody now — by
// GROUPING them by status, most urgent first, with a one-card summary above
// them. A card opens the goal's own page (/targets/:id); its «Update» button
// opens one short dialog for all of the goal's results. `utils/targets.js` is
// the one definition of every figure.
//
// It is a TEST SCREEN: the goals live as a JSON blob per profile in
// `/api/ui-prefs/targets_lab` (components/targets/useGoals), so they follow the
// viewer across devices and cost no table — and never leak between two
// people. Making this a shared register is a separate decision.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Target as TargetIcon, Plus, Sparkles, FlaskConical, ChevronDown, Shapes } from "lucide-react";
import Layout from "../components/layout/Layout";
import Button from "../components/ui/Button";
import SearchInput from "../components/ui/SearchInput";
import EmptyState from "../components/ui/EmptyState";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import { FilterPanel, PickFilter } from "../components/ui/ColumnFilter";
import { SkeletonBlock } from "../components/ui/Skeleton";
import { useToast } from "../components/ui/Toast";
import GoalCard from "../components/targets/GoalCard";
import GoalFormModal from "../components/targets/GoalFormModal";
import UpdateProgressModal from "../components/targets/UpdateProgressModal";
import StatusOverview from "../components/targets/StatusOverview";
import SaveState from "../components/targets/SaveState";
import { AREA_ICON, GROUP_ICON, groupColor } from "../components/targets/targetsUi";
import { buildDemoGoals } from "../components/targets/demoGoals";
import { useGoals, useSaveState } from "../components/targets/useGoals";
import { useLang } from "../context/LangContext";
import { usePersistentState } from "../hooks/usePersistentState";
import { CATEGORIES, GROUPS, STATUS_RANK, todayISO, goalProgress, goalStatus, fill } from "../utils/targets";

const matches = (g, q) => {
  if (!q) return true;
  const hay = [g.title, g.description, g.owner, ...(g.targets ?? []).map((tg) => tg.title)].join(" ").toLowerCase();
  return hay.includes(q);
};
const byDue = (a, b) => ((a.g.due ?? "9999") < (b.g.due ?? "9999") ? -1 : (a.g.due ?? "9999") > (b.g.due ?? "9999") ? 1 : 0);
// Inside a group: the most urgent first — overdue before behind before at
// risk, then the nearest deadline. Achieved goals, most recent first.
const ORDER = {
  attention: (a, b) => (STATUS_RANK[a.st] - STATUS_RANK[b.st]) || byDue(a, b),
  on_track: byDue,
  not_started: byDue,
  achieved: (a, b) => byDue(b, a),
};

function GoalGroup({ group, rows, counts, open, onToggle, collapsible, t, today, onUpdate }) {
  const Icon = GROUP_ICON[group.key];
  const label = t(`targets.group.${group.key}`);
  const head = (
    <>
      <Icon size={16} strokeWidth={2.3} className="flex-shrink-0" style={{ color: groupColor(group.key, counts) }} aria-hidden />
      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-2)" }}>{label}</span>
      <span
        className="text-xs font-semibold tabular-nums rounded-full px-2 py-0.5"
        style={{ background: "var(--bg-inner)", color: "var(--text-2)", border: "1px solid var(--border)" }}
      >
        {rows.length}
      </span>
    </>
  );
  return (
    <section aria-label={label}>
      {collapsible ? (
        <button
          type="button" onClick={onToggle} aria-expanded={open}
          className="w-full flex items-center gap-2 mb-2 px-1 py-1 rounded-lg text-left transition-colors hover:bg-[var(--hover-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
        >
          {head}
          <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium" style={{ color: "var(--text-2)" }}>
            {open ? t("targets.hideDone") : t("targets.showDone")}
            <ChevronDown size={14} aria-hidden style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
          </span>
        </button>
      ) : (
        <h2 className="flex items-center gap-2 mb-2 px-1 py-1">{head}</h2>
      )}
      {open && (
        <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3">
          {rows.map((r) => (
            <GoalCard key={r.g.id} goal={r.g} today={today} onUpdate={() => onUpdate(r.g.id)} />
          ))}
        </div>
      )}
    </section>
  );
}

export default function Targets() {
  const { t } = useLang();
  const toast = useToast();
  const navigate = useNavigate();
  const today = todayISO();
  const { goals, isError, refetch, setGoals } = useGoals();

  // A failed autosave must reach the reader wherever they have scrolled to.
  const saveState = useSaveState();
  useEffect(() => {
    if (saveState.status === "error") toast.error(t("targets.saveFailed"));
  }, [saveState]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── view state (remembered, like every page's) ────────────────────────────
  const [q, setQ] = usePersistentState("targets_q", "");
  const [cat, setCat] = usePersistentState("targets_cat", "");
  const [doneOpen, setDoneOpen] = usePersistentState("targets_done_open", false);
  const [form, setForm] = useState(false);
  const [updating, setUpdating] = useState(null); // goal id
  const [confirmDemo, setConfirmDemo] = useState(false);

  const rows = useMemo(
    () => (goals ?? []).map((g) => ({ g, p: goalProgress(g), st: goalStatus(g, today) })),
    [goals, today],
  );
  const needle = q.trim().toLowerCase();
  const searched = useMemo(() => rows.filter((r) => matches(r.g, needle)), [rows, needle]);
  const shown = useMemo(() => searched.filter((r) => !cat || r.g.category === cat), [searched, cat]);
  const counts = useMemo(() => {
    const c = {};
    shown.forEach((r) => { c[r.st] = (c[r.st] ?? 0) + 1; });
    return c;
  }, [shown]);
  const groups = useMemo(
    () => GROUPS
      .map((gr) => ({ gr, rows: shown.filter((r) => gr.statuses.includes(r.st)).sort(ORDER[gr.key]) }))
      .filter((x) => x.rows.length),
    [shown],
  );
  const anyFilter = !!needle || !!cat;
  const clearFilters = () => { setQ(""); setCat(""); };

  // ── the area filter — THE filter zone, a FilterPanel section ──────────────
  const areaCount = (c) => searched.filter((r) => r.g.category === c).length;
  const areaOpts = [
    { value: "", label: t("targets.catAll") },
    ...CATEGORIES.map((c) => {
      const Icon = AREA_ICON[c];
      const n = areaCount(c);
      return {
        value: c,
        title: t(`targets.cat.${c}`),
        label: (
          <span className="flex items-center gap-2 min-w-0">
            <Icon size={13} className="flex-shrink-0" aria-hidden />
            <span className="flex-1 truncate">{t(`targets.cat.${c}`)}</span>
            <span className="tabular-nums" style={{ color: n ? "var(--text-2)" : "var(--text-4)" }}>{n}</span>
          </span>
        ),
      };
    }),
  ];
  const sections = [{
    key: "area",
    icon: Shapes,
    label: t("targets.form.category"),
    active: !!cat,
    display: cat ? t(`targets.cat.${cat}`) : t("targets.catAll"),
    render: ({ close }) => <PickFilter opts={areaOpts} value={cat} onChange={setCat} close={close} />,
    onClear: () => setCat(""),
  }];

  const upsert = (goal) => setGoals((gs) =>
    gs.some((g) => g.id === goal.id) ? gs.map((g) => (g.id === goal.id ? goal : g)) : [goal, ...gs]);
  const updatingGoal = goals?.find((g) => g.id === updating) ?? null;

  const newGoalBtn = (
    <Button
      size="lg" variant="primary" icon={<Plus size={16} />}
      onClick={() => setForm(true)} aria-label={t("targets.newGoal")} className="flex-shrink-0"
    >
      <span className="hidden sm:inline">{t("targets.newGoal")}</span>
    </Button>
  );

  let body;
  if (goals === null) {
    body = isError ? (
      <div className="rounded-2xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <EmptyState
          icon={TargetIcon} title={t("targets.loadFailed")} message="" showUploadLink={false} height="h-56"
          action={<Button variant="secondary" size="lg" onClick={() => refetch()}>{t("targets.retry")}</Button>}
        />
      </div>
    ) : (
      <>
        <SkeletonBlock className="h-[38px] rounded-xl" />
        <SkeletonBlock className="h-40 rounded-2xl" />
        <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonBlock key={i} className="h-60 rounded-2xl" />)}
        </div>
      </>
    );
  } else if (goals.length === 0) {
    body = (
      <div className="rounded-2xl px-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <EmptyState
          icon={TargetIcon} title={t("targets.empty.title")} message={t("targets.empty.msg")}
          showUploadLink={false} height="h-72"
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button size="lg" variant="primary" icon={<Plus size={16} />} onClick={() => setForm(true)}>{t("targets.newGoal")}</Button>
              <Button size="lg" variant="secondary" icon={<Sparkles size={15} />} onClick={() => setGoals(buildDemoGoals(today))}>
                {t("targets.demo.load")}
              </Button>
            </div>
          }
        />
      </div>
    );
  } else {
    body = (
      <>
        {/* ONE toolbar row: search grows on the left, the filter zone, the
            primary action pinned right. */}
        <div className="flex items-center gap-2">
          <SearchInput
            value={q} onChange={setQ} placeholder={t("targets.search")}
            className="flex-1 min-w-0" inputClassName="text-base sm:text-sm leading-5 pl-8 pr-7 py-2"
          />
          <FilterPanel sections={sections} />
          {newGoalBtn}
        </div>

        {shown.length === 0 ? (
          <div className="rounded-2xl px-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <EmptyState
              icon={TargetIcon} title={t("targets.empty.noMatch")} message="" showUploadLink={false} height="h-56"
              action={anyFilter ? <Button variant="secondary" size="lg" onClick={clearFilters}>{t("targets.empty.clearFilters")}</Button> : null}
            />
          </div>
        ) : (
          <>
            <StatusOverview rows={shown} total={rows.length} t={t} saveSlot={<SaveState t={t} />} />
            <div className="space-y-6">
              {groups.map(({ gr, rows: gRows }) => {
                const collapsible = gr.key === "achieved" && groups.length > 1 && !needle;
                return (
                  <GoalGroup
                    key={gr.key} group={gr} rows={gRows} counts={counts} t={t} today={today}
                    collapsible={collapsible}
                    open={!collapsible || doneOpen}
                    onToggle={() => setDoneOpen((o) => !o)}
                    onUpdate={setUpdating}
                  />
                );
              })}
            </div>
          </>
        )}

        <footer
          className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-4 text-xs"
          style={{ borderTop: "1px solid var(--border)", color: "var(--text-2)" }}
        >
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-semibold whitespace-nowrap"
            style={{ background: "var(--brand-bg)", color: "var(--brand-text)", border: "1px solid var(--brand-border)" }}
          >
            <FlaskConical size={12} aria-hidden />{t("targets.demoBadge")}
          </span>
          <span className="min-w-0 flex-1 basis-56">{t("targets.demoNote")}</span>
          <Button size="md" variant="ghost" icon={<Sparkles size={13} />} onClick={() => setConfirmDemo(true)}>
            {t("targets.demo.load")}
          </Button>
        </footer>
      </>
    );
  }

  return (
    <Layout title={t("targets.title")}>
      <div className="page-enter space-y-4">{body}</div>

      {form && (
        <GoalFormModal
          initial={null} today={today}
          onClose={() => setForm(false)}
          onSave={(goal) => { upsert(goal); setForm(false); navigate(`/targets/${encodeURIComponent(goal.id)}`); }}
        />
      )}
      {updatingGoal && (
        <UpdateProgressModal
          goal={updatingGoal} today={today}
          onClose={() => setUpdating(null)}
          onSave={(next) => { upsert(next); setUpdating(null); toast.success(t("targets.update.saved")); }}
        />
      )}
      {confirmDemo && (
        <ConfirmDialog
          open
          title={t("targets.demo.confirmTitle")}
          message={fill(t("targets.demo.confirmMsg"), { n: goals?.length ?? 0 })}
          confirmLabel={t("targets.demo.load")}
          onCancel={() => setConfirmDemo(false)}
          onConfirm={() => { setGoals(buildDemoGoals(today)); setConfirmDemo(false); }}
        />
      )}
      {toast.node}
    </Layout>
  );
}
