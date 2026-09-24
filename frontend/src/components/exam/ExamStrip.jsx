/**
 * The task strip — fixed at the bottom of every page while the exam mode is
 * on. Portaled to document.body (`.page-enter`'s transform would otherwise
 * contain it) and offset by `--tg-safe-bottom`, the Toast rule.
 *
 * Collapsed: one pill naming the current task. Expanded: the whole text, its
 * state, and the three actions — answer (answer tasks), skip, next. A pass
 * flips it green and advances by itself; a failed check says only «not yet»
 * (ruling 10: no hints).
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Check, ChevronDown, ChevronUp, Loader2, PencilLine, SkipForward, ArrowRight, GraduationCap, RefreshCw } from "lucide-react";
import { useLang } from "../../context/LangContext";
import { useExam } from "../../context/ExamContext";
import Button from "../ui/Button";
import AnswerSheet from "./AnswerSheet";
import { areaOf, fill } from "./examAreas";

const OPEN_KEY = "exam_strip_open";

export default function ExamStrip() {
  const exam = useExam();
  const { t } = useLang();
  const navigate = useNavigate();
  const [open, setOpen] = useState(() => {
    try { return sessionStorage.getItem(OPEN_KEY) !== "0"; } catch { return true; }
  });
  useEffect(() => { try { sessionStorage.setItem(OPEN_KEY, open ? "1" : "0"); } catch { /* ignore */ } }, [open]);

  if (!exam?.on || typeof document === "undefined") return null;
  const { attempt, tasks, currentTask, flash, busy } = exam;
  const counts = attempt?.counts || {};
  const total = counts.available || tasks.length || 0;
  const done = counts.passed || 0;
  const task = currentTask;
  const area = task ? areaOf(task.area) : null;
  const passed = !!task && (flash === task.key || task.status === "passed");
  const isAnswer = task && (task.kind === "answer" || task.kind === "visit_answer");
  const text = task ? t(`exam.t.${task.key}`) : "";
  const progress = fill(t("exam.strip.progress"), { done, total });

  const card = (
    <div
      role="region"
      aria-live="polite"
      aria-label={t("exam.strip.label")}
      className="fixed left-4 right-4 md:left-auto md:w-[440px]"
      style={{
        bottom: "calc(var(--tg-safe-bottom, 0px) + 8px)", zIndex: 40,
        background: passed ? "rgba(34,197,94,0.14)" : "var(--bg-card)",
        border: `1px solid ${passed ? "rgba(34,197,94,0.5)" : "var(--border-md)"}`,
        borderLeft: `3px solid ${passed ? "#22c55e" : (area?.color || "var(--brand)")}`,
        borderRadius: 16, boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
        transition: "background .3s, border-color .3s",
      }}
    >
      {/* the pill — always visible */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 text-left"
        style={{ minHeight: 44, color: "var(--text-1)" }}
        aria-expanded={open}
      >
        {passed ? <Check size={16} style={{ color: "#22c55e" }} /> : <GraduationCap size={16} style={{ color: area?.color || "var(--brand)" }} />}
        <span className="text-xs font-semibold flex-shrink-0" style={{ color: "var(--text-3)" }}>{progress}</span>
        <span className="text-sm truncate flex-1">
          {task ? (open ? `${t("exam.strip.task")} ${task.n}` : `№${task.n} · ${text}`) : t("exam.strip.none")}
        </span>
        {open ? <ChevronDown size={16} style={{ color: "var(--text-3)" }} /> : <ChevronUp size={16} style={{ color: "var(--text-3)" }} />}
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-3">
          {task ? (
            <>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-md"
                      style={{ background: `${area.color}22`, color: area.color, border: `1px solid ${area.color}55` }}>
                  {area.letter} · {t(`exam.area.${area.key}`)}
                </span>
                <span className="text-[11px]" style={{ color: "var(--text-4)" }}>
                  {t(`exam.level.${task.level}`)}
                </span>
              </div>
              <p className="text-sm leading-snug" style={{ color: "var(--text-1)" }}>{text}</p>
              <div className="text-xs flex items-center gap-1.5" style={{ color: passed ? "#22c55e" : "var(--text-3)" }}>
                {passed ? <><Check size={13} /> {t("exam.strip.passed")}</>
                        : busy ? <><Loader2 size={13} className="animate-spin" /> {t("exam.strip.checking")}</>
                        : t("exam.strip.notYet")}
              </div>
              {!passed && (
                <div className="flex items-center gap-2 flex-wrap">
                  {isAnswer ? (
                    <Button size="sm" icon={<PencilLine size={14} />} onClick={exam.openSheet} disabled={busy}>
                      {t("exam.strip.answer")}
                    </Button>
                  ) : (
                    <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} onClick={() => exam.check()} loading={busy}>
                      {t("exam.strip.check")}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" icon={<SkipForward size={14} />} onClick={exam.skip} disabled={busy}>
                    {t("exam.strip.skip")}
                  </Button>
                  <span className="flex-1" />
                  <Button size="sm" variant="ghost" onClick={exam.next} disabled={busy}>
                    {t("exam.strip.next")} <ArrowRight size={14} />
                  </Button>
                </div>
              )}
              {passed && (
                <div className="flex justify-end">
                  <Button size="sm" variant="ghost" onClick={exam.next}>{t("exam.strip.next")} <ArrowRight size={14} /></Button>
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs" style={{ color: "var(--text-3)" }}>{t("exam.strip.allDone")}</span>
              <Button size="sm" onClick={() => navigate("/exam")}>{t("exam.strip.toExam")}</Button>
            </div>
          )}
        </div>
      )}
      {exam.sheetOpen && task && <AnswerSheet task={task} />}
    </div>
  );
  return createPortal(card, document.body);
}
