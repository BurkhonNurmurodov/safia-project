/**
 * «Imtihon» — /exam. A leader's assignment, their task list and the open
 * practice; a supervisor reads their unit's results here. Phone-first: the
 * examinee sits it in the Telegram mini-app.
 */
import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  GraduationCap, Play, RotateCcw, Flag, CalendarClock, ListChecks, ChevronDown, ChevronRight,
  Dumbbell, CheckCircle2, Award,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import { useLang } from "../context/LangContext";
import { useExam } from "../context/ExamContext";
import api from "../utils/api";
import Button from "../components/ui/Button";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import EmptyState from "../components/ui/EmptyState";
import RequestStateChip from "../components/ui/RequestStateChip";
import TableCard, { SectionHead, Th } from "../components/ui/DataTable";
import { SkeletonCard } from "../components/ui/Skeleton";
import { useToast } from "../components/ui/Toast";
import { useTranslit } from "../utils/transliterate";
import { AREAS, ATTEMPT_STATE, TASK_STATE, areaOf, fill } from "../components/exam/examAreas";

// «1 Oktabr» — the platform's own month names (cal.m0…m11), never a locale
// string: the Uzbek locale prints a short month as «M10».
const fmtDate = (iso, t) => {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getDate()} ${t(`cal.m${d.getMonth()}`)}`;
};
const daysLeft = (iso) => {
  if (!iso) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((new Date(`${iso}T00:00:00`) - today) / 86400000);
};

function Card({ icon: Icon, title, right, children }) {
  return (
    <div className="rounded-2xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <SectionHead icon={Icon} title={title} right={right} />
      <div className="p-4 space-y-3">{children}</div>
    </div>
  );
}

function Ring({ value, color, label }) {
  const r = 34, c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value || 0));
  return (
    <div className="relative w-[88px] h-[88px] flex-shrink-0">
      <svg viewBox="0 0 88 88" className="w-full h-full -rotate-90">
        <circle cx="44" cy="44" r={r} fill="none" stroke="var(--bg-inner)" strokeWidth="8" />
        <circle cx="44" cy="44" r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
                strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} style={{ transition: "stroke-dashoffset .6s var(--ease-out)" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold leading-none" style={{ color: "var(--text-1)" }}>{label}</span>
      </div>
    </div>
  );
}

export default function Exam() {
  const { t, lang } = useLang();
  const { tl } = useTranslit();
  const exam = useExam();
  const toast = useToast();
  const [confirm, setConfirm] = useState(null);   // "submit" | "reset"
  const [openAreas, setOpenAreas] = useState(() => new Set());
  const me = exam?.me;
  const attempt = me?.attempt;
  const practice = me?.practice;

  const start = useMutation({
    mutationFn: (id) => api.post(`/api/exam/attempts/${id}/start`, { lang }).then((r) => r.data),
    onSuccess: async (att) => { await exam.refreshMe(); exam.enter(att, att.current_task); },
    onError: (e) => toast.error(e?.response?.data?.detail || t("exam.err")),
  });
  const submit = useMutation({
    mutationFn: (id) => api.post(`/api/exam/attempts/${id}/submit`).then((r) => r.data),
    onSuccess: async () => { setConfirm(null); await exam.leave(); toast.success(t("exam.submitted")); },
    onError: (e) => toast.error(e?.response?.data?.detail || t("exam.err")),
  });
  const practiceStart = useMutation({
    mutationFn: () => api.post("/api/exam/practice/start", { lang }).then((r) => r.data),
    onSuccess: async (att) => { await exam.refreshMe(); exam.enter(att, att.current_task); },
    onError: (e) => toast.error(e?.response?.data?.detail || t("exam.err")),
  });
  const practiceReset = useMutation({
    mutationFn: () => api.post("/api/exam/practice/reset", { lang }).then((r) => r.data),
    onSuccess: async (att) => { setConfirm(null); await exam.refreshMe(); exam.enter(att, att.current_task); },
    onError: (e) => toast.error(e?.response?.data?.detail || t("exam.err")),
  });

  const continueAttempt = (att) => {
    if (exam.on && exam.attemptId === att.id) return;
    exam.enter(att, att.current_task);
  };
  const openTask = (att, key) => {
    if (att.status !== "running") return;
    if (exam.on && exam.attemptId === att.id) exam.setCurrent(key);
    else exam.enter(att, key);
  };

  const groups = useMemo(() => {
    const src = (exam.on ? exam.attempt : (attempt?.status === "running" ? attempt : attempt)) || null;
    const tasks = src?.tasks || [];
    return AREAS.map((a) => ({ ...a, tasks: tasks.filter((x) => x.area === a.key) })).filter((g) => g.tasks.length);
  }, [exam.on, exam.attempt, attempt]);

  const toggleArea = (k) => setOpenAreas((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });

  if (exam?.meLoading || !me) {
    return <Layout title={t("nav.exam")}><div className="max-w-[720px] mx-auto space-y-4"><SkeletonCard /><SkeletonCard /></div></Layout>;
  }

  const passMark = me.pass_mark;
  const stateOf = (att) => ATTEMPT_STATE[att?.status] || ATTEMPT_STATE.assigned;

  const assignmentCard = () => {
    if (!attempt) {
      return (
        <Card icon={GraduationCap} title={t("exam.title")}>
          <EmptyState icon={GraduationCap} title={t("exam.none.title")} message={t("exam.none.msg")} showUploadLink={false} height="h-32" />
        </Card>
      );
    }
    const st = stateOf(attempt);
    const left = daysLeft(attempt.deadline);
    const c = attempt.counts || {};
    if (attempt.status === "assigned") {
      return (
        <Card icon={GraduationCap} title={t("exam.title")} right={<RequestStateChip state={st.chip} label={t(st.key)} />}>
          <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-2)" }}>
            <CalendarClock size={15} />
            <span>{fill(t("exam.deadline"), { d: fmtDate(attempt.deadline, t) })}</span>
            {left != null && <span style={{ color: left < 0 ? "#ef4444" : "var(--text-3)" }}>· {fill(t("exam.daysLeft"), { n: left })}</span>}
          </div>
          {attempt.note && <p className="text-sm italic" style={{ color: "var(--text-3)" }}>«{attempt.note}»</p>}
          <div className="text-xs" style={{ color: "var(--text-3)" }}>
            {fill(t("exam.facts"), { n: attempt.task_count || me.task_count || 50, a: AREAS.length })}
          </div>
          <ul className="text-sm space-y-1 list-disc pl-5" style={{ color: "var(--text-2)" }}>
            <li>{t("exam.rule.notReal")}</li>
            <li>{t("exam.rule.skip")}</li>
            <li>{t("exam.rule.noHints")}</li>
            <li>{t("exam.rule.pause")}</li>
            <li>{fill(t("exam.rule.passMark"), { n: passMark })}</li>
          </ul>
          <Button size="lg" className="w-full sm:w-auto" icon={<Play size={16} />} loading={start.isPending}
                  onClick={() => start.mutate(attempt.id)}>
            {t("exam.start")}
          </Button>
        </Card>
      );
    }
    if (attempt.status === "running") {
      const pct = c.available ? Math.round(c.passed * 100 / c.available) : 0;
      return (
        <Card icon={GraduationCap} title={t("exam.title")} right={<RequestStateChip state={st.chip} label={t(st.key)} />}>
          <div className="flex items-center gap-4">
            <Ring value={pct} color="var(--brand)" label={`${c.passed}/${c.available}`} />
            <div className="space-y-1 text-sm" style={{ color: "var(--text-2)" }}>
              <div><CheckCircle2 size={13} className="inline mr-1" style={{ color: "#22c55e" }} />{fill(t("exam.cnt.passed"), { n: c.passed })}</div>
              <div>{fill(t("exam.cnt.skipped"), { n: c.skipped })} · {fill(t("exam.cnt.open"), { n: c.open })}</div>
              {c.unavailable > 0 && <div style={{ color: "var(--text-4)" }}>{fill(t("exam.cnt.unavailable"), { n: c.unavailable })}</div>}
              <div style={{ color: left != null && left < 1 ? "#ef4444" : "var(--text-3)" }}>
                {fill(t("exam.deadline"), { d: fmtDate(attempt.deadline, t) })}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {!(exam.on && exam.attemptId === attempt.id) && (
              <Button size="lg" icon={<Play size={16} />} onClick={() => continueAttempt(attempt)}>{t("exam.continue")}</Button>
            )}
            <Button size="lg" variant="secondary" icon={<Flag size={16} />} onClick={() => setConfirm("submit")}>{t("exam.finish")}</Button>
          </div>
        </Card>
      );
    }
    const ok = attempt.passed;
    return (
      <Card icon={GraduationCap} title={t("exam.title")} right={<RequestStateChip state={st.chip} label={t(st.key)} />}>
        <div className="flex items-center gap-4">
          <Ring value={attempt.score_pct} color={ok ? "#22c55e" : "#ef4444"} label={`${attempt.score_pct ?? 0}%`} />
          <div className="space-y-1 text-sm" style={{ color: "var(--text-2)" }}>
            <div className="font-semibold" style={{ color: ok ? "#22c55e" : "#ef4444" }}>
              {ok ? t("exam.result.passed") : t("exam.result.failed")}
            </div>
            <div>{fill(t("exam.result.mark"), { n: attempt.pass_mark_pct })}</div>
            <div>{fill(t("exam.cnt.passed"), { n: c.passed })} / {c.available}</div>
            <div style={{ color: "var(--text-3)" }}>{fmtDate(attempt.submitted_at, t)} · {t("exam.result.brigadirSees")}</div>
            {me.badge && <div className="flex items-center gap-1" style={{ color: "var(--brand-text)" }}><Award size={13} /> {t("exam.badge")}</div>}
          </div>
        </div>
      </Card>
    );
  };

  const taskList = () => {
    const att = exam.on ? exam.attempt : attempt;
    if (!att || !groups.length) return null;
    return (
      <Card icon={ListChecks} title={t("exam.tasks")} right={<span className="text-xs" style={{ color: "var(--text-3)" }}>{att.kind === "practice" ? t("exam.practice") : ""}</span>}>
        <div className="divide-y" style={{ borderColor: "var(--border)" }}>
          {groups.map((g) => {
            const done = g.tasks.filter((x) => x.status === "passed").length;
            const open = openAreas.has(g.key);
            return (
              <div key={g.key} className="py-1">
                <button type="button" onClick={() => toggleArea(g.key)} className="w-full flex items-center gap-2 py-2 text-left">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: g.color }} />
                  <span className="text-sm font-medium flex-1" style={{ color: "var(--text-1)" }}>{g.letter} · {t(`exam.area.${g.key}`)}</span>
                  <span className="text-xs" style={{ color: "var(--text-3)" }}>{done}/{g.tasks.length}</span>
                  {open ? <ChevronDown size={14} style={{ color: "var(--text-4)" }} /> : <ChevronRight size={14} style={{ color: "var(--text-4)" }} />}
                </button>
                {open && (
                  <div className="pb-2 space-y-1">
                    {g.tasks.map((x) => {
                      const s = TASK_STATE[x.status] || TASK_STATE.open;
                      const isCur = exam.on && exam.current === x.key;
                      const label = x.status === "unavailable"
                        ? t(x.reason === "page" ? "exam.st.noPage" : "exam.st.noData") : t(s.key);
                      return (
                        <button key={x.key} type="button"
                                disabled={x.status === "unavailable" || att.status !== "running"}
                                onClick={() => openTask(att, x.key)}
                                className="w-full flex items-start gap-2 px-2 py-1.5 rounded-lg text-left"
                                style={{ background: isCur ? "var(--brand-bg)" : "transparent", opacity: x.status === "unavailable" ? 0.55 : 1 }}>
                          <span className="text-xs font-semibold w-6 flex-shrink-0 pt-0.5" style={{ color: "var(--text-3)" }}>{x.n}</span>
                          <span className="text-sm flex-1 line-clamp-2" style={{ color: "var(--text-1)" }}>{t(`exam.t.${x.key}`)}</span>
                          <RequestStateChip state={s.chip} label={label} size="xs" />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    );
  };

  const practiceCard = () => (
    <Card icon={Dumbbell} title={t("exam.practice")}>
      <p className="text-sm" style={{ color: "var(--text-3)" }}>{t("exam.practice.msg")}</p>
      <div className="flex flex-wrap gap-2">
        {practice?.status === "running" ? (
          <>
            {!(exam.on && exam.attemptId === practice.id) && (
              <Button size="lg" icon={<Play size={16} />} onClick={() => continueAttempt(practice)}>{t("exam.continue")}</Button>
            )}
            <Button size="lg" variant="secondary" icon={<RotateCcw size={16} />} onClick={() => setConfirm("reset")}>{t("exam.practice.reset")}</Button>
          </>
        ) : (
          <Button size="lg" variant="secondary" icon={<Dumbbell size={16} />} loading={practiceStart.isPending}
                  onClick={() => practiceStart.mutate()}>{t("exam.practice.start")}</Button>
        )}
      </div>
    </Card>
  );

  const unitTable = () => {
    if (!me.unit) return null;
    return (
      <TableCard icon={GraduationCap} title={t("exam.unit.title")} right={<span className="text-xs" style={{ color: "var(--text-3)" }}>{me.unit.length}</span>}>
          <thead><tr>
            <Th label={t("exam.unit.leader")} k="leader" />
            <Th label={t("exam.unit.status")} k="status" />
            <Th label={t("exam.unit.score")} k="score" align="right" />
            <Th label={t("exam.unit.deadline")} k="deadline" />
          </tr></thead>
          <tbody>
            {me.unit.map((r) => {
              const a = r.attempt;
              const st = a ? stateOf(a) : null;
              return (
                <tr key={r.profile_key}>
                  <td className="px-3 py-2">{tl(r.leader)}</td>
                  <td className="px-3 py-2">{a ? <RequestStateChip state={st.chip} label={t(st.key)} /> : <span style={{ color: "var(--text-4)" }}>{t("exam.unit.notAssigned")}</span>}</td>
                  <td className="px-3 py-2 text-right font-semibold" style={{ color: a?.score_pct == null ? "var(--text-4)" : a.passed ? "#22c55e" : "#ef4444" }}>
                    {a?.score_pct == null ? "—" : `${a.score_pct}%`}
                  </td>
                  <td className="px-3 py-2" style={{ color: "var(--text-3)" }}>{fmtDate(a?.deadline, t)}</td>
                </tr>
              );
            })}
            {!me.unit.length && <tr><td colSpan={4} className="px-3 py-6 text-center" style={{ color: "var(--text-3)" }}>{t("exam.unit.empty")}</td></tr>}
          </tbody>
      </TableCard>
    );
  };

  return (
    <Layout title={t("nav.exam")}>
      <div className="max-w-[720px] mx-auto space-y-4" style={{ paddingBottom: exam.on ? 120 : 0 }}>
        <p className="text-sm" style={{ color: "var(--text-3)" }}>{t("exam.subtitle")}</p>
        {me.can_sit && assignmentCard()}
        {me.can_sit && taskList()}
        {practiceCard()}
        {unitTable()}
      </div>
      {confirm === "submit" && (
        <ConfirmDialog
          title={t("exam.finish")}
          message={fill(t("exam.finishConfirm"), { n: (attempt?.counts?.open || 0) + (attempt?.counts?.skipped || 0) })}
          confirmLabel={t("exam.finish")}
          loading={submit.isPending}
          onCancel={() => setConfirm(null)}
          onConfirm={() => submit.mutate(attempt.id)}
        />
      )}
      {confirm === "reset" && (
        <ConfirmDialog
          title={t("exam.practice.reset")}
          message={t("exam.practice.resetConfirm")}
          confirmLabel={t("exam.practice.reset")}
          loading={practiceReset.isPending}
          onCancel={() => setConfirm(null)}
          onConfirm={() => practiceReset.mutate()}
        />
      )}
      {toast.node}
    </Layout>
  );
}
