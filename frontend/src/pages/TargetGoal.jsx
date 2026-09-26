// A goal on its own page (/targets/:id) — full screen on a phone, a readable
// column on a desk. Its status and pace first, then every key result with the
// controls that move it. Reads and writes the same cache as the board
// (components/targets/useGoals), so Back always lands on the list as it now is.
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, Pencil, Trash2, RefreshCw, SearchX, Target as TargetIcon, Rocket, ChartLine, ChartBarStacked,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import Button from "../components/ui/Button";
import ErrorScreen from "../components/ui/ErrorScreen";
import EmptyState from "../components/ui/EmptyState";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import { SkeletonBlock } from "../components/ui/Skeleton";
import { useToast } from "../components/ui/Toast";
import { GoalMeta, PaceRow } from "../components/targets/GoalCard";
import { StatusChip } from "../components/targets/bits";
import { ChartCard } from "../components/ui/AnalysisBoard";
import GoalProgressChart from "../components/targets/charts/GoalProgressChart";
import ContributionBar from "../components/targets/charts/ContributionBar";
import ResultCard from "../components/targets/ResultCard";
import GoalFormModal from "../components/targets/GoalFormModal";
import UpdateProgressModal from "../components/targets/UpdateProgressModal";
import SaveState from "../components/targets/SaveState";
import { useGoals, useSaveState } from "../components/targets/useGoals";
import { useLang } from "../context/LangContext";
import {
  todayISO, goalProgress, goalStatus, elapsed, daysLeft, projection, targetProgress, fmtDate, fmtPct, fill,
} from "../utils/targets";

// What the pace so far says, as one whole sentence per case. Above 100% the
// percent stops meaning anything and the DATE is the answer; past the
// deadline only the date is left.
function forecastText(goal, st, today, t) {
  if (st === "achieved") return null;
  const proj = projection(goal, today);
  const left = daysLeft(goal, today);
  const date = proj.finish ? fmtDate(proj.finish, t, today) : null;
  if (proj.atDue === null) return t("targets.forecast.none");
  if (left !== null && left < 0) return date ? fill(t("targets.forecast.overdue"), { date }) : t("targets.forecast.none");
  if (proj.atDue >= 1) return date ? fill(t("targets.forecast.early"), { date }) : null;
  const p = Math.round(proj.atDue * 100);
  return date ? fill(t("targets.forecast.late"), { p, date }) : fill(t("targets.forecast.lateNoDate"), { p });
}

export default function TargetGoal() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useLang();
  const toast = useToast();
  const today = todayISO();
  const { goals, isError, refetch, setGoals } = useGoals();
  const [editing, setEditing] = useState(false);
  const [update, setUpdate] = useState(null); // null | { only: resultId | null }
  const [confirmDel, setConfirmDel] = useState(false);
  // A failed autosave must reach the reader wherever they have scrolled to.
  const saveState = useSaveState();
  useEffect(() => {
    if (saveState.status === "error") toast.error(t("targets.saveFailed"));
  }, [saveState]); // eslint-disable-line react-hooks/exhaustive-deps

  // Back to wherever the reader came from — the board, with its scroll kept —
  // or, for a link opened cold, to the board itself.
  const back = () => ((window.history.state?.idx ?? 0) > 0 ? navigate(-1) : navigate("/targets", { replace: true }));
  const backLink = (
    <button
      type="button" onClick={back}
      className="inline-flex items-center gap-1.5 text-sm font-medium rounded-lg -ml-1 px-1 py-1 transition-colors hover:text-[var(--text-1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
      style={{ color: "var(--text-2)" }}
    >
      <ArrowLeft size={16} aria-hidden /> {t("targets.backToList")}
    </button>
  );

  if (goals === null) {
    return (
      <Layout title={t("targets.title")}>
        <div className="page-enter mx-auto w-full max-w-5xl space-y-4">
          {backLink}
          {isError ? (
            <EmptyState
              icon={TargetIcon} title={t("targets.loadFailed")} message="" showUploadLink={false}
              action={<Button variant="secondary" size="lg" onClick={() => refetch()}>{t("targets.retry")}</Button>}
            />
          ) : (
            <>
              <SkeletonBlock className="h-56 rounded-2xl" />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <SkeletonBlock className="h-64 rounded-2xl" />
                <SkeletonBlock className="h-64 rounded-2xl" />
              </div>
            </>
          )}
        </div>
      </Layout>
    );
  }

  const goal = goals.find((g) => g.id === id) ?? null;
  if (!goal) {
    return (
      <Layout title={t("targets.title")}>
        <ErrorScreen
          inline tone="neutral" icon={SearchX} live="status"
          title={t("targets.notFound.title")}
          message={t("targets.notFound.msg")}
          action={{ label: t("targets.backToList"), onClick: () => navigate("/targets", { replace: true }) }}
        />
      </Layout>
    );
  }

  const p = goalProgress(goal);
  const st = goalStatus(goal, today);
  const e = elapsed(goal, today);
  const targets = goal.targets ?? [];
  const done = targets.filter((tg) => targetProgress(tg) >= 1).length;
  const forecast = forecastText(goal, st, today, t);

  const save = (next) => setGoals((gs) => gs.map((g) => (g.id === next.id ? next : g)));
  const updateTarget = (tid, fn) =>
    save({ ...goal, targets: targets.map((tg) => (tg.id === tid ? fn(tg) : tg)) });

  return (
    <Layout title={t("targets.title")}>
      <div className="page-enter mx-auto w-full max-w-5xl space-y-4">
        <div className="flex items-center justify-between gap-3">
          {backLink}
          <SaveState t={t} />
        </div>

        {/* ── the goal ── */}
        <section className="rounded-2xl p-4 sm:p-5 space-y-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <StatusChip status={st} t={t} size="md" />
              <h2 className="mt-2 text-xl sm:text-2xl font-bold leading-tight break-words" style={{ color: "var(--text-1)" }}>
                {goal.title}
              </h2>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                size="lg" variant="secondary" icon={<Pencil size={15} />}
                onClick={() => setEditing(true)} aria-label={t("common.edit")} title={t("common.edit")}
              >
                <span className="hidden sm:inline">{t("common.edit")}</span>
              </Button>
              <Button
                size="lg" variant="danger" tint icon={<Trash2 size={15} />}
                onClick={() => setConfirmDel(true)} aria-label={t("common.delete")} title={t("common.delete")}
              />
            </div>
          </div>

          {goal.description && (
            <p className="text-sm leading-relaxed max-w-[70ch] break-words" style={{ color: "var(--text-2)" }}>{goal.description}</p>
          )}
          <GoalMeta goal={goal} st={st} today={today} t={t} full className="text-[13px]" />

          <div
            className="@container rounded-xl p-3 sm:p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5"
            style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}
          >
            <div className="flex-1 min-w-0"><PaceRow p={p} e={e} st={st} t={t} big ring="var(--bg-inner)" /></div>
            <Button
              size="lg" variant="primary" icon={<RefreshCw size={15} />}
              onClick={() => setUpdate({ only: null })} className="w-full sm:w-auto flex-shrink-0"
            >
              {t("targets.updateTitle")}
            </Button>
          </div>
        </section>

        {/* ── the goal over time · what its percent is made of ── */}
        <div className={`grid grid-cols-1 gap-3 ${targets.length > 1 ? "lg:grid-cols-3" : ""}`}>
          <ChartCard icon={ChartLine} title={t("targets.chart.burn.title")} className={targets.length > 1 ? "lg:col-span-2" : ""}>
            {goal.start && goal.due ? (
              <>
                <GoalProgressChart goal={goal} today={today} t={t} />
                {forecast && (
                  <p className="px-4 pb-4 -mt-1 flex items-start gap-2 text-sm" style={{ color: "var(--text-2)" }}>
                    <Rocket size={15} className="flex-shrink-0 mt-0.5" style={{ color: "var(--text-3)" }} aria-hidden />
                    <span><span className="font-medium" style={{ color: "var(--text-1)" }}>{t("targets.projection")}:</span> {forecast}</span>
                  </p>
                )}
              </>
            ) : (
              <p className="px-4 py-6 text-sm" style={{ color: "var(--text-3)" }}>{t("targets.noDates")}</p>
            )}
          </ChartCard>
          {targets.length > 1 && (
            <ChartCard icon={ChartBarStacked} title={fill(t("targets.chart.contrib.title"), { p: fmtPct(p) })}>
              <ContributionBar goal={goal} today={today} t={t} />
            </ChartCard>
          )}
        </div>

        {/* ── its key results ── */}
        <section aria-labelledby="goal-results">
          <h3 id="goal-results" className="flex items-baseline gap-2 mb-2 px-1">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-2)" }}>{t("targets.results")}</span>
            <span className="text-xs" style={{ color: "var(--text-2)" }}>{fill(t("targets.resultsCount"), { done, total: targets.length })}</span>
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 items-start gap-3">
            {targets.map((tg) => (
              <ResultCard
                key={tg.id} tg={tg} goal={goal} today={today} t={t}
                onChange={(fn) => updateTarget(tg.id, fn)}
                onCheckin={() => setUpdate({ only: tg.id })}
              />
            ))}
          </div>
        </section>
      </div>

      {update && (
        <UpdateProgressModal
          goal={goal} only={update.only} today={today}
          onClose={() => setUpdate(null)}
          onSave={(next) => { save(next); setUpdate(null); toast.success(t("targets.update.saved")); }}
        />
      )}
      {editing && (
        <GoalFormModal
          initial={goal} today={today}
          onClose={() => setEditing(false)}
          onSave={(next) => { save(next); setEditing(false); }}
        />
      )}
      {confirmDel && (
        <ConfirmDialog
          open tone="danger"
          title={t("targets.deleteTitle")}
          message={fill(t("targets.deleteMsg"), { title: goal.title })}
          confirmLabel={t("common.delete")}
          onCancel={() => setConfirmDel(false)}
          onConfirm={() => {
            setGoals((gs) => gs.filter((g) => g.id !== goal.id));
            navigate("/targets", { replace: true });
          }}
        />
      )}
      {toast.node}
    </Layout>
  );
}
