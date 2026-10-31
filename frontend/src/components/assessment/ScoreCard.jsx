import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, X, MessageSquareText, Loader2, AlertTriangle, Send, Lock, Info, BookCheck } from "lucide-react";
import Button from "../ui/Button";
import FormField from "../ui/FormField";
import SegmentedToggle from "../ui/SegmentedToggle";
import ConfirmDialog from "../ui/ConfirmDialog";
import useIsMobile from "../../hooks/useIsMobile";
import api from "../../utils/api";
import {
  useAT, fill, errText, TypeChip, VERDICT, DEPT_ICON, fmtDateTime,
} from "./assessmentUtil";

const NOTE_DEBOUNCE = 900;
const FEEDBACK_DEBOUNCE = 1200;

const taStyle = { background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-1)" };

/**
 * One judge's scorecard — the questions of THEIR department only (a judge
 * answers for their department; the server refuses a grade on any other).
 * Positions keep the sitting's own numbers, so the panel can still say «the
 * 7th question». Every tap is saved at once (a verdict), every note and
 * the overall feedback as they are typed (debounced, flushed on blur) — the
 * candidate is answering in front of the panel, and nothing a judge enters may
 * wait for a Save button. The local copy is seeded ONCE per scorecard, so the
 * 5-second poll that keeps the panel strip live never rewrites text under the
 * judge's fingers.
 */
export default function ScoreCard({ aid, data, onChanged, onSubmitted, toast }) {
  const T = useAT();
  const phone = useIsMobile();
  const mine = data.mine;
  const items = useMemo(() => data.items.filter((it) => it.department === mine.department),
    [data.items, mine.department]);
  const readOnly = !data.rights.grade;

  const [verdicts, setVerdicts] = useState({});
  const [notes, setNotes] = useState({});
  const [noteOpen, setNoteOpen] = useState(() => new Set());
  const [ansOpen, setAnsOpen] = useState(() => new Set());   // expected answers shown
  const [feedback, setFeedback] = useState("");
  const [state, setState] = useState({});          // item id → "saving" | "failed"
  const [fbState, setFbState] = useState(null);    // "saving" | "failed" | null
  const [confirm, setConfirm] = useState(false);
  const [submitErr, setSubmitErr] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const saved = useRef({ notes: {}, feedback: "" });
  const timers = useRef({});
  const fbTimer = useRef(null);

  // Seed from the server once per scorecard (a seat move keeps the same id).
  useEffect(() => {
    const v = {}, n = {};
    Object.entries(mine.grades || {}).forEach(([k, g]) => {
      if (g.verdict) v[k] = g.verdict;
      if (g.note) n[k] = g.note;
    });
    setVerdicts(v);
    setNotes(n);
    setNoteOpen(new Set(Object.keys(n)));
    setFeedback(mine.overall_feedback || "");
    saved.current = { notes: { ...n }, feedback: mine.overall_feedback || "" };
    setState({});
    setFbState(null);
  }, [mine.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => {
    Object.values(timers.current).forEach(clearTimeout);
    clearTimeout(fbTimer.current);
  }, []);

  const put = useCallback(async (itemId, body) => {
    setState((s) => ({ ...s, [itemId]: "saving" }));
    try {
      await api.put(`/api/assessment/draft/${aid}/grades/${itemId}`, body, { params: { seat: mine.department } });
      setState((s) => { const c = { ...s }; delete c[itemId]; return c; });
      if ("note" in body) saved.current.notes[itemId] = body.note;
      onChanged();
      return true;
    } catch (e) {
      setState((s) => ({ ...s, [itemId]: "failed" }));
      toast.error(`${T.saveFailed}: ${errText(e, T)}`);
      return false;
    }
  }, [aid, mine.department, onChanged, toast, T]);

  const setVerdict = (itemId, v) => {
    if (readOnly) return;
    const prev = verdicts[itemId];
    setVerdicts((s) => ({ ...s, [itemId]: v }));
    put(itemId, { verdict: v }).then((ok) => {
      if (ok) return;
      // The tap is undone on screen (the toast says why), so nothing is left
      // pending for a retry button — the judge simply taps again.
      setVerdicts((s) => { const c = { ...s }; if (prev) c[itemId] = prev; else delete c[itemId]; return c; });
      setState((s) => { const c = { ...s }; delete c[itemId]; return c; });
    });
  };

  const flushNote = (itemId) => {
    clearTimeout(timers.current[itemId]);
    const val = (notes[itemId] || "").trim();
    if (val === (saved.current.notes[itemId] || "").trim()) return;
    put(itemId, { note: val });
  };
  const typeNote = (itemId, val) => {
    setNotes((s) => ({ ...s, [itemId]: val }));
    clearTimeout(timers.current[itemId]);
    timers.current[itemId] = setTimeout(() => {
      const v = val.trim();
      if (v !== (saved.current.notes[itemId] || "").trim()) put(itemId, { note: v });
    }, NOTE_DEBOUNCE);
  };

  const saveFeedback = useCallback(async (val) => {
    if (val.trim() === saved.current.feedback.trim()) return;
    setFbState("saving");
    try {
      await api.put(`/api/assessment/draft/${aid}/feedback`, { overall_feedback: val }, { params: { seat: mine.department } });
      saved.current.feedback = val;
      setFbState(null);
    } catch (e) {
      setFbState("failed");
      toast.error(`${T.saveFailed}: ${errText(e, T)}`);
    }
  }, [aid, mine.department, toast, T]);
  const typeFeedback = (val) => {
    setFeedback(val);
    clearTimeout(fbTimer.current);
    fbTimer.current = setTimeout(() => saveFeedback(val), FEEDBACK_DEBOUNCE);
  };

  const graded = items.filter((it) => verdicts[it.id]).length;
  const passed = items.filter((it) => verdicts[it.id] === "pass").length;
  const failed = graded - passed;
  const missing = items.filter((it) => !verdicts[it.id]);
  const fbMissing = !feedback.trim();
  const pending = Object.values(state).includes("saving") || fbState === "saving";
  const canSubmit = !readOnly && !missing.length && !fbMissing;

  const jump = (pos) => {
    const el = document.getElementById(`aq-${pos}`);
    if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.focus?.({ preventScroll: true }); }
  };

  const doSubmit = async () => {
    setSubmitting(true);
    setSubmitErr(null);
    try {
      clearTimeout(fbTimer.current);
      const r = await api.post(`/api/assessment/assessments/${aid}/submit`, { overall_feedback: feedback },
        { params: { seat: mine.department } });
      setConfirm(false);
      toast.success(T.submitted);
      onSubmitted?.(r.data);
    } catch (e) {
      setSubmitErr(errText(e, T));
    } finally {
      setSubmitting(false);
    }
  };

  const pct = items.length ? (graded / items.length) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* Progress — sticks to the top of the scroll area while the judge works down the list. */}
      <div className="sticky z-10 rounded-2xl px-4 py-2.5"
        style={{ top: "calc(var(--main-pad) * -1)", background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span className="font-semibold tabular-nums" style={{ color: "var(--text-1)" }}>
            {fill(T.progress, { g: graded, t: items.length })}
          </span>
          <span className="inline-flex items-center gap-1 tabular-nums" style={{ color: VERDICT.pass.ink }}>
            <Check size={13} strokeWidth={3} aria-hidden="true" />{fill(T.passedN, { n: passed })}
          </span>
          <span className="inline-flex items-center gap-1 tabular-nums" style={{ color: VERDICT.fail.ink }}>
            <X size={13} strokeWidth={3} aria-hidden="true" />{fill(T.failedN, { n: failed })}
          </span>
          <span className="ml-auto inline-flex items-center gap-1 min-w-[90px] justify-end" style={{ color: "var(--text-3)" }}>
            {readOnly ? <><Lock size={12} aria-hidden="true" />{T.readOnlyNote}</>
              : pending ? <><Loader2 size={12} className="animate-spin" aria-hidden="true" />{T.saving}</> : null}
          </span>
        </div>
        <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-inner)" }}
          role="progressbar" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={graded}>
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: "var(--brand)" }} />
        </div>
      </div>

      {mine.submitted_at && (
        <div className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs"
          style={{ background: "rgba(34,197,94,0.10)", border: "1px solid rgba(34,197,94,0.35)", color: "var(--text-1)" }}>
          <Check size={14} style={{ color: VERDICT.pass.ink }} aria-hidden="true" />
          {fill(T.submittedNote, { at: fmtDateTime(mine.submitted_at) })}
        </div>
      )}

      {items.length === 0 ? (
        <div className="flex items-start gap-2 rounded-2xl px-4 py-3 text-sm"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
          <Info size={16} className="mt-[2px] shrink-0" style={{ color: "var(--brand-text)" }} aria-hidden="true" />
          {fill(T.ownNone, { dept: T.dept[mine.department] })}
        </div>
      ) : (
        <section aria-label={fill(T.ownHead, { dept: T.dept[mine.department] })} className="space-y-2">
          <h3 className="flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-3)" }}>
            {(() => { const Icon = DEPT_ICON[mine.department]; return <Icon size={13} aria-hidden="true" />; })()}
            {fill(T.ownHead, { dept: T.dept[mine.department] })}
            <span className="tabular-nums font-normal normal-case">· {items.length}</span>
          </h3>
          {items.map((it) => {
            const v = verdicts[it.id];
            const st = state[it.id];
            const open = noteOpen.has(String(it.id)) || noteOpen.has(it.id);
            return (
              <article key={it.id} id={`aq-${it.position}`} tabIndex={-1}
                className="rounded-2xl p-3 sm:p-4 outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
                style={{
                  background: "var(--bg-card)", border: "1px solid var(--border)",
                  borderLeft: `4px solid ${v ? VERDICT[v].hex : "var(--border)"}`,
                }}>
                <div className="flex items-start gap-3">
                  <span className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-bold tabular-nums"
                    style={{ background: "var(--bg-inner)", color: "var(--text-2)" }}>{it.position}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <TypeChip type={it.qtype} T={T} />
                    </div>
                    <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-wrap break-words" style={{ color: "var(--text-1)" }}>
                      {it.text}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <div className="w-full sm:w-64">
                        <SegmentedToggle fill size={phone ? "lg" : "md"} value={v ?? null}
                          onChange={(nv) => setVerdict(it.id, nv)}
                          ariaLabel={fill(T.verdictAria, { n: it.position })}
                          options={[
                            { value: "pass", activeBg: VERDICT.pass.bg, activeFg: VERDICT.pass.fg, disabled: readOnly && v !== "pass",
                              label: <><Check size={14} strokeWidth={3} aria-hidden="true" />{T.pass}</> },
                            { value: "fail", activeBg: VERDICT.fail.bg, activeFg: VERDICT.fail.fg, disabled: readOnly && v !== "fail",
                              label: <><X size={14} strokeWidth={3} aria-hidden="true" />{T.fail}</> },
                          ]} />
                      </div>
                      {it.answer && (
                        <Button variant="ghost" size={phone ? "lg" : "md"} icon={BookCheck}
                          aria-expanded={ansOpen.has(it.id)}
                          onClick={() => setAnsOpen((s) => { const c = new Set(s); c.has(it.id) ? c.delete(it.id) : c.add(it.id); return c; })}>
                          {T.answerShow}
                        </Button>
                      )}
                      {(!readOnly || notes[it.id]) && (
                        <Button variant="ghost" size={phone ? "lg" : "md"} icon={MessageSquareText}
                          aria-expanded={open} disabled={readOnly}
                          onClick={() => setNoteOpen((s) => { const c = new Set(s); c.has(String(it.id)) ? c.delete(String(it.id)) : c.add(String(it.id)); return c; })}>
                          {T.addNote}{notes[it.id] && !open ? " •" : ""}
                        </Button>
                      )}
                      {st === "saving" && <Loader2 size={14} className="animate-spin" style={{ color: "var(--text-3)" }} aria-label={T.saving} />}
                      {st === "failed" && (
                        <button type="button" onClick={() => (v ? put(it.id, { verdict: v, note: (notes[it.id] || "").trim() }) : flushNote(it.id))}
                          className="inline-flex items-center gap-1 text-xs font-medium min-h-[32px]" style={{ color: "var(--status-bad)" }}>
                          <AlertTriangle size={13} aria-hidden="true" />{T.saveFailed} · {T.retrySave}
                        </button>
                      )}
                    </div>
                    {it.answer && ansOpen.has(it.id) && (
                      <div className="mt-2 rounded-xl px-3 py-2 text-sm whitespace-pre-wrap break-words"
                        style={{ background: "var(--bg-inner)", borderLeft: "3px solid var(--brand)", color: "var(--text-2)" }}>
                        <div className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--text-3)" }}>{T.answer}</div>
                        {it.answer}
                      </div>
                    )}
                    {(open || (readOnly && notes[it.id])) && (
                      <textarea value={notes[it.id] || ""} readOnly={readOnly} rows={2} maxLength={2000}
                        aria-label={`${T.noteLabel} · ${it.position}`}
                        onChange={(e) => typeNote(it.id, e.target.value)} onBlur={() => flushNote(it.id)}
                        placeholder={T.notePhQ}
                        className="mt-2 w-full rounded-xl px-3 py-2 text-base sm:text-sm outline-none resize-y"
                        style={taStyle} />
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {/* Overall feedback + submit */}
      <div className="rounded-2xl p-4 space-y-3" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <FormField label={T.overall} required={!readOnly} hint={readOnly ? null : T.overallHint}>
          <textarea value={feedback} readOnly={readOnly} rows={phone ? 5 : 4} maxLength={8000}
            onChange={(e) => typeFeedback(e.target.value)}
            onBlur={() => { clearTimeout(fbTimer.current); if (!readOnly) saveFeedback(feedback); }}
            placeholder={T.overallPh} aria-required={!readOnly}
            className="w-full rounded-xl px-3 py-2 text-base sm:text-sm outline-none resize-y" style={taStyle} />
        </FormField>
        {!readOnly && (
          <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-3">
            <div className="text-xs space-y-1 flex-1 min-w-0" aria-live="polite">
              {missing.length > 0 && (
                <div className="flex flex-wrap items-center gap-1" style={{ color: "var(--text-2)" }}>
                  <span>{fill(T.missingGrades, { list: "" })}</span>
                  {missing.map((it) => (
                    <button key={it.id} type="button" onClick={() => jump(it.position)}
                      className="min-w-[28px] min-h-[28px] px-1.5 rounded-md text-xs font-semibold tabular-nums"
                      style={{ background: "var(--bg-inner)", color: "var(--text-1)", border: "1px solid var(--border)" }}>
                      {it.position}
                    </button>
                  ))}
                </div>
              )}
              {fbMissing && <div style={{ color: "var(--text-2)" }}>{T.missingFeedback}</div>}
              {fbState === "failed" && <div style={{ color: "var(--status-bad)" }}>{T.saveFailed}</div>}
            </div>
            <Button size="lg" icon={Send} disabled={!canSubmit} onClick={() => { setSubmitErr(null); setConfirm(true); }}
              className="w-full sm:w-auto">
              {T.submit}
            </Button>
          </div>
        )}
      </div>

      {confirm && (
        <ConfirmDialog title={T.submitTitle} onCancel={() => setConfirm(false)} onConfirm={doSubmit}
          message={fill(T.submitMsg, { p: passed, f: failed })} confirmLabel={T.submit} cancelLabel={T.cancel}
          loading={submitting} error={submitErr} confirmDisabled={pending} />
      )}
    </div>
  );
}
