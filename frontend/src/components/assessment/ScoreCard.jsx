import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, X, Loader2, AlertTriangle, Send, Lock, Info, BookCheck, ChevronDown, MessageSquareText, ArrowDown } from "lucide-react";
import Button from "../ui/Button";
import FormField from "../ui/FormField";
import ConfirmDialog from "../ui/ConfirmDialog";
import { hasOpenDialog } from "../ui/dialogLayers";
import useIsMobile from "../../hooks/useIsMobile";
import api from "../../utils/api";
import {
  useAT, fill, errText, TypeChip, VERDICT, DEPT_ICON, fmtDateTime,
} from "./assessmentUtil";

const NOTE_DEBOUNCE = 900;
const FEEDBACK_DEBOUNCE = 1200;
const ADVANCE_MS = 380;

const taStyle = { background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-1)" };

/** The question's number, wearing its verdict. */
function Num({ position, v, size = 28 }) {
  const style = v ? { background: VERDICT[v].bg, color: VERDICT[v].fg } : { background: "var(--bg-inner)", color: "var(--text-2)", boxShadow: "inset 0 0 0 1px var(--border-md)" };
  return (
    <span key={v || "none"} className={`inline-flex items-center justify-center gap-0.5 rounded-lg font-semibold tabular-nums flex-shrink-0 ${v ? "aq-pop" : ""}`}
      style={{ ...style, minWidth: size, height: size, padding: "0 6px", fontSize: size >= 34 ? 13 : 12 }}>
      {v === "pass" && <Check size={12} strokeWidth={3} aria-hidden="true" />}
      {v === "fail" && <X size={12} strokeWidth={3} aria-hidden="true" />}
      {position}
    </span>
  );
}

/** One of the two verdict buttons — big, plain, colour only when chosen. */
function VerdictButton({ kind, chosen, onClick, disabled, label, hint }) {
  const c = VERDICT[kind];
  const Icon = kind === "pass" ? Check : X;
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={chosen}
      className="aq-verdict relative inline-flex items-center justify-center gap-2 rounded-xl font-semibold text-[15px] min-h-[52px] px-4 disabled:cursor-default"
      style={chosen
        ? { background: c.bg, color: c.fg, boxShadow: `inset 0 0 0 1px ${c.bg}` }
        : { background: "transparent", color: c.ink, boxShadow: `inset 0 0 0 1.5px ${kind === "pass" ? "rgba(34,197,94,.42)" : "rgba(239,68,68,.42)"}`, opacity: disabled ? 0.5 : 1 }}>
      <Icon size={18} strokeWidth={3} aria-hidden="true" />
      {label}
      {hint && !disabled && (
        <kbd className="hidden pointer-fine:inline-flex absolute right-3 items-center justify-center w-5 h-5 rounded text-[11px] font-medium"
          style={{ background: chosen ? "rgba(255,255,255,.22)" : "var(--bg-inner)", color: chosen ? c.fg : "var(--text-3)" }}>{hint}</kbd>
      )}
    </button>
  );
}

/**
 * One judge's scorecard — the questions of THEIR department only (a judge
 * answers for their department; the server refuses a grade on any other).
 *
 * Concept: the interview sheet. The candidate answers out loud, so the screen
 * keeps the judge's PLACE: one question is open at a time (the next ungraded
 * one), its verdict is one tap (or the 1 / 2 keys), and the sheet moves on by
 * itself; graded questions fold to one quiet line that opens again on a tap.
 * The map on top is the progress AND the way to any question.
 *
 * Every tap is saved at once, every note and the overall feedback as they are
 * typed (debounced, flushed on blur) — nothing waits for a Save button. The
 * local copy is seeded ONCE per scorecard, so the 5-second poll that keeps the
 * panel live never rewrites text under the judge's fingers.
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
  const [active, setActive] = useState(null);
  const [ansOpen, setAnsOpen] = useState(() => new Set());
  const [feedback, setFeedback] = useState("");
  const [state, setState] = useState({});          // item id → "saving" | "failed"
  const [fbState, setFbState] = useState(null);    // "saving" | "failed" | null
  const [confirm, setConfirm] = useState(false);
  const [submitErr, setSubmitErr] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const saved = useRef({ notes: {}, feedback: "" });
  const timers = useRef({});
  const fbTimer = useRef(null);
  const advTimer = useRef(null);
  const verdictsRef = useRef({});
  useEffect(() => { verdictsRef.current = verdicts; }, [verdicts]);

  // Seed from the server once per scorecard (a seat move keeps the same id),
  // and open the first question still waiting for a verdict.
  useEffect(() => {
    const v = {}, n = {};
    Object.entries(mine.grades || {}).forEach(([k, g]) => {
      if (g.verdict) v[k] = g.verdict;
      if (g.note) n[k] = g.note;
    });
    setVerdicts(v);
    setNotes(n);
    setFeedback(mine.overall_feedback || "");
    saved.current = { notes: { ...n }, feedback: mine.overall_feedback || "" };
    setState({});
    setFbState(null);
    setActive(readOnly ? null : (items.find((it) => !v[it.id])?.id ?? null));
  }, [mine.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => {
    Object.values(timers.current).forEach(clearTimeout);
    clearTimeout(fbTimer.current);
    clearTimeout(advTimer.current);
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

  const fbRef = useRef(null);
  // To the feedback — the sheet's last step. On a phone the keyboard is not
  // raised for the judge: they tap the field when they are ready to write.
  const toFeedback = useCallback(() => {
    document.getElementById("assess-feedback")?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (!phone) setTimeout(() => fbRef.current?.focus({ preventScroll: true }), 380);
  }, [phone]);

  const reveal = (pos) => {
    // After the fold has played: the opened card fully in view, nothing more.
    setTimeout(() => document.getElementById(`aq-${pos}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 300);
  };

  const open = (it) => { clearTimeout(advTimer.current); setActive(it.id); reveal(it.position); };

  // The next question still waiting for a verdict, after `fromId`, wrapping.
  const advance = useCallback((fromId) => {
    const i = items.findIndex((x) => x.id === fromId);
    const order = [...items.slice(i + 1), ...items.slice(0, Math.max(0, i))];
    const next = order.find((x) => !verdictsRef.current[x.id]);
    if (next) { setActive(next.id); reveal(next.position); } else { setActive(null); toFeedback(); }
  }, [items, toFeedback]);

  const setVerdict = (itemId, v) => {
    if (readOnly) return;
    const prev = verdicts[itemId];
    setVerdicts((s) => ({ ...s, [itemId]: v }));
    try { window.Telegram?.WebApp?.HapticFeedback?.selectionChanged?.(); } catch { /* not in Telegram */ }
    // The FIRST verdict on a question moves the sheet on; changing one already
    // given stays put (the judge came back to it on purpose).
    if (!prev) {
      clearTimeout(advTimer.current);
      advTimer.current = setTimeout(() => advance(itemId), ADVANCE_MS);
    }
    put(itemId, { verdict: v }).then((ok) => {
      if (ok) return;
      // The tap is undone on screen (the toast says why) — the judge taps again.
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
    clearTimeout(advTimer.current);   // writing a note on a graded question keeps it open
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

  // 1 = pass, 2 = no pass on the open question — never while typing, never
  // over a dialog.
  useEffect(() => {
    if (readOnly) return undefined;
    const onKey = (e) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || hasOpenDialog()) return;
      const tag = (e.target?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || e.target?.isContentEditable) return;
      if (active == null) return;
      if (e.key === "1") { e.preventDefault(); setVerdict(active, "pass"); }
      if (e.key === "2") { e.preventDefault(); setVerdict(active, "fail"); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const graded = items.filter((it) => verdicts[it.id]).length;
  const passed = items.filter((it) => verdicts[it.id] === "pass").length;
  const failed = graded - passed;
  const missing = items.filter((it) => !verdicts[it.id]);
  const fbMissing = !feedback.trim();
  const pending = Object.values(state).includes("saving") || fbState === "saving";
  const canSubmit = !readOnly && !missing.length && !fbMissing;
  const DeptIcon = DEPT_ICON[mine.department];
  const Head = readOnly ? "div" : "button";

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

  const status = readOnly ? (
    <span className="inline-flex items-center gap-1" style={{ color: "var(--text-3)" }}><Lock size={12} aria-hidden="true" />{T.readOnlyNote}</span>
  ) : pending ? (
    <span className="inline-flex items-center gap-1" style={{ color: "var(--text-3)" }}><Loader2 size={12} className="animate-spin" aria-hidden="true" />{T.saving}</span>
  ) : graded > 0 ? (
    <span className="inline-flex items-center gap-1" style={{ color: "var(--text-3)" }}><Check size={12} aria-hidden="true" />{T.saved}</span>
  ) : null;

  return (
    <div className="space-y-3">
      {/* The question map — progress and navigation in one. It sticks to the
          top while the judge works down the sheet. */}
      <div className="sticky z-10 rounded-2xl px-4 py-3" role="navigation" aria-label={fill(T.ownHead, { dept: T.dept[mine.department] })}
        style={{ top: "calc(var(--main-pad) * -1)", background: "var(--bg-card)", border: "1px solid var(--border)", boxShadow: "0 8px 24px -18px rgba(0,0,0,.6)" }}>
        <div className="flex items-center gap-x-3 gap-y-1 flex-wrap">
          <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: "var(--text-1)" }}>
            {DeptIcon && <DeptIcon size={14} style={{ color: "var(--text-3)" }} aria-hidden="true" />}
            {T.dept[mine.department]}
          </span>
          <span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{fill(T.progress, { g: graded, t: items.length })}</span>
          {graded > 0 && (
            <span className="inline-flex items-center gap-2.5 text-xs font-medium tabular-nums">
              <span className="inline-flex items-center gap-0.5" style={{ color: VERDICT.pass.ink }}><Check size={12} strokeWidth={3} aria-hidden="true" />{passed}</span>
              <span className="inline-flex items-center gap-0.5" style={{ color: VERDICT.fail.ink }}><X size={12} strokeWidth={3} aria-hidden="true" />{failed}</span>
            </span>
          )}
          <span className="ml-auto text-xs min-w-[88px] text-right">{status}</span>
        </div>
        <div className="mt-2.5 flex items-center gap-3">
          <div className="flex flex-wrap gap-1.5 min-w-0 flex-1">
            {items.map((it) => {
              const v = verdicts[it.id];
              const cur = active === it.id;
              return (
                <button key={it.id} type="button" onClick={() => open(it)} aria-current={cur ? "step" : undefined}
                  aria-label={`${it.position} · ${v === "pass" ? T.pass : v === "fail" ? T.fail : T.notGraded}`}
                  className="rounded-lg transition-shadow" style={{ boxShadow: cur ? "0 0 0 2px var(--bg-card), 0 0 0 4px var(--brand)" : "none" }}>
                  <Num position={it.position} v={v} size={phone ? 36 : 32} />
                </button>
              );
            })}
          </div>
          {!readOnly && !phone && (
            <span className="text-xs text-right flex-shrink-0 max-w-[240px]" aria-live="polite"
              style={{ color: canSubmit ? "var(--status-ok)" : "var(--text-3)" }}>
              {missing.length ? fill(T.leftN, { n: missing.length }) : fbMissing ? T.missingFeedback : T.readyToSubmit}
            </span>
          )}
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
          {items.map((it) => {
            const v = verdicts[it.id];
            const st = state[it.id];
            const isOpen = !readOnly && active === it.id;
            const note = notes[it.id] || "";
            const ans = ansOpen.has(it.id);
            return (
              <article key={it.id} id={`aq-${it.position}`} className="rounded-2xl scroll-mt-24 transition-[border-color,box-shadow] duration-200"
                style={{
                  background: "var(--bg-card)",
                  border: isOpen ? "1px solid rgba(var(--brand-rgb), .55)" : "1px solid var(--border)",
                  boxShadow: isOpen ? "0 0 0 3px rgba(var(--brand-rgb), .10)" : "none",
                }}>
                {/* The head: the question folded to one line, or — open — its
                    number and type. One tap opens or folds it. */}
                <Head {...(readOnly ? {} : { type: "button", onClick: () => (isOpen ? setActive(null) : open(it)), "aria-expanded": isOpen })}
                  className="w-full flex items-center gap-3 px-4 text-left" style={{ minHeight: 56 }}>
                  <Num position={it.position} v={v} />
                  {isOpen ? (
                    <TypeChip type={it.qtype} T={T} />
                  ) : (
                    <span className="min-w-0 flex-1 truncate text-sm" style={{ color: v ? "var(--text-2)" : "var(--text-1)" }}>{it.text}</span>
                  )}
                  <span className="ml-auto flex-shrink-0 inline-flex items-center gap-2 text-xs">
                    {st === "saving" && <Loader2 size={14} className="animate-spin" style={{ color: "var(--text-3)" }} aria-label={T.saving} />}
                    {st === "failed" && <AlertTriangle size={14} style={{ color: "var(--status-bad)" }} aria-label={T.saveFailed} />}
                    {!isOpen && note && <MessageSquareText size={14} style={{ color: "var(--text-3)" }} aria-label={T.noteIn} />}
                    {!isOpen && (
                      <span className="font-medium" style={{ color: v ? VERDICT[v].ink : "var(--text-3)" }}>
                        {v === "pass" ? T.pass : v === "fail" ? T.fail : T.notGraded}
                      </span>
                    )}
                    {!readOnly && (
                      <ChevronDown size={16} className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} style={{ color: "var(--text-3)" }} aria-hidden="true" />
                    )}
                  </span>
                </Head>

                {/* Read-only: the whole question and its note, nothing to press. */}
                {readOnly && (
                  <div className="px-4 pb-4 -mt-1 space-y-2">
                    <p className="text-sm leading-relaxed whitespace-pre-wrap break-words" style={{ color: "var(--text-1)" }}>{it.text}</p>
                    {note && (
                      <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words rounded-xl px-3 py-2" style={{ background: "var(--bg-inner)", color: "var(--text-2)" }}>{note}</p>
                    )}
                  </div>
                )}

                {!readOnly && (
                  <div className={`aq-fold ${isOpen ? "is-open" : ""}`} aria-hidden={!isOpen}>
                    <div className="aq-fold-inner">
                      <div className="px-4 pb-4 space-y-3 max-w-[780px]">
                        <p className="text-[17px] leading-relaxed whitespace-pre-wrap break-words" style={{ color: "var(--text-1)" }}>
                          {it.text}
                        </p>
                        {it.answer && (
                          <div>
                            <button type="button" onClick={() => setAnsOpen((s) => { const c = new Set(s); c.has(it.id) ? c.delete(it.id) : c.add(it.id); return c; })}
                              aria-expanded={ans} tabIndex={isOpen ? 0 : -1}
                              className="inline-flex items-center gap-1.5 text-xs font-medium min-h-[32px]" style={{ color: "var(--text-2)" }}>
                              <BookCheck size={14} aria-hidden="true" />{T.answerShow}
                              <ChevronDown size={13} className={`transition-transform ${ans ? "rotate-180" : ""}`} aria-hidden="true" />
                            </button>
                            {ans && (
                              <div className="mt-1 rounded-xl px-3 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words aq-reveal"
                                style={{ background: "var(--bg-inner)", borderLeft: "3px solid var(--brand)", color: "var(--text-2)" }}>
                                {it.answer}
                              </div>
                            )}
                          </div>
                        )}
                        <textarea value={note} rows={1} maxLength={2000} tabIndex={isOpen ? 0 : -1}
                          aria-label={`${T.noteLabel} · ${it.position}`}
                          onChange={(e) => { typeNote(it.id, e.target.value); e.target.style.height = "auto"; e.target.style.height = `${e.target.scrollHeight + 2}px`; }}
                          onBlur={() => flushNote(it.id)}
                          placeholder={T.notePhQ}
                          className="block w-full rounded-xl px-3 py-2.5 text-base sm:text-sm outline-none resize-none min-h-[44px]"
                          style={taStyle} />
                        <div className="grid grid-cols-2 gap-2.5">
                          <VerdictButton kind="pass" chosen={v === "pass"} label={T.pass} hint="1" onClick={() => setVerdict(it.id, "pass")} />
                          <VerdictButton kind="fail" chosen={v === "fail"} label={T.fail} hint="2" onClick={() => setVerdict(it.id, "fail")} />
                        </div>
                        {st === "failed" && (
                          <button type="button" onClick={() => (v ? put(it.id, { verdict: v, note: note.trim() }) : flushNote(it.id))}
                            className="inline-flex items-center gap-1 text-xs font-medium min-h-[32px]" style={{ color: "var(--status-bad)" }}>
                            <AlertTriangle size={13} aria-hidden="true" />{T.saveFailed} · {T.retrySave}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </section>
      )}

      {/* Overall feedback + submit — the sheet's last step. */}
      <div id="assess-feedback" className="rounded-2xl p-4 space-y-3 scroll-mt-24 transition-[border-color,box-shadow] duration-200"
        style={{
          background: "var(--bg-card)",
          border: !readOnly && !missing.length && fbMissing ? "1px solid rgba(var(--brand-rgb), .55)" : "1px solid var(--border)",
          boxShadow: !readOnly && !missing.length && fbMissing ? "0 0 0 3px rgba(var(--brand-rgb), .10)" : "none",
        }}>
        {!readOnly && !missing.length && fbMissing && (
          <div className="text-[13px] font-medium" style={{ color: "var(--brand-text)" }}>{T.allGraded}</div>
        )}
        <FormField label={T.overall} required={!readOnly} hint={readOnly ? null : T.overallHint}>
          <textarea ref={fbRef} value={feedback} readOnly={readOnly} rows={phone ? 5 : 4} maxLength={8000}
            onChange={(e) => typeFeedback(e.target.value)}
            onBlur={() => { clearTimeout(fbTimer.current); if (!readOnly) saveFeedback(feedback); }}
            placeholder={T.overallPh} aria-required={!readOnly}
            className="w-full rounded-xl px-3 py-2 text-base sm:text-sm outline-none resize-y" style={taStyle} />
        </FormField>
        {fbState === "failed" && <div className="text-xs" style={{ color: "var(--status-bad)" }}>{T.saveFailed}</div>}
        {!readOnly && !phone && (
          <div className="flex items-center justify-end gap-3">
            <span className="text-xs" style={{ color: "var(--text-3)" }} aria-live="polite">
              {missing.length ? fill(T.leftN, { n: missing.length }) : fbMissing ? T.missingFeedback : ""}
            </span>
            <Button size="lg" icon={Send} disabled={!canSubmit} onClick={() => { setSubmitErr(null); setConfirm(true); }}>{T.submit}</Button>
          </div>
        )}
      </div>

      {/* Phone: one bar docked to the bottom edge — how far the sheet is and
          the ONE next step (the next ungraded question → the feedback →
          submit), so a judge never scrolls to find what is left. */}
      {!readOnly && phone && (
        <div className="sticky z-20 mx-[calc(var(--main-pad)*-1)] px-4 pt-2.5"
          style={{
            bottom: "calc(var(--main-pad) * -1)",
            paddingBottom: "calc(0.625rem + var(--tg-safe-bottom, 0px))",
            background: "var(--bg-card)", borderTop: "1px solid var(--border)",
            boxShadow: "0 -6px 16px rgba(0,0,0,0.08)",
          }}>
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-semibold tabular-nums" style={{ color: "var(--text-1)" }}>
                  {fill(T.progress, { g: graded, t: items.length })}
                </span>
                {pending && <Loader2 size={12} className="animate-spin" style={{ color: "var(--text-3)" }} aria-label={T.saving} />}
              </div>
              <div className="mt-1.5 h-1.5 rounded-full overflow-hidden flex gap-[2px]" style={{ background: "var(--bg-inner)" }}
                role="progressbar" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={graded} aria-label={fill(T.progress, { g: graded, t: items.length })}>
                {items.map((it) => (
                  <span key={it.id} className="h-full flex-1 transition-colors duration-300"
                    style={{ background: verdicts[it.id] ? VERDICT[verdicts[it.id]].bg : "transparent" }} />
                ))}
              </div>
            </div>
            {missing.length > 0 ? (
              <Button size="lg" variant="secondary" icon={ArrowDown} onClick={() => open(missing[0])}>{T.nextQ}</Button>
            ) : fbMissing ? (
              <Button size="lg" variant="secondary" icon={MessageSquareText} onClick={toFeedback}>{T.toFeedback}</Button>
            ) : (
              <Button size="lg" icon={Send} onClick={() => { setSubmitErr(null); setConfirm(true); }}>{T.submitShort}</Button>
            )}
          </div>
        </div>
      )}

      {confirm && (
        <ConfirmDialog title={T.submitTitle} onCancel={() => setConfirm(false)} onConfirm={doSubmit}
          message={fill(T.submitMsg, { p: passed, f: failed })} confirmLabel={T.submit} cancelLabel={T.cancel}
          loading={submitting} error={submitErr} confirmDisabled={pending} />
      )}
    </div>
  );
}
