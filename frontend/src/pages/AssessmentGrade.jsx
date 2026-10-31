import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Gavel, Lock, LockOpen, Shuffle, Trash2, CalendarDays, Info, FlaskConical } from "lucide-react";
import Layout from "../components/layout/Layout";
import Button from "../components/ui/Button";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import EmptyState from "../components/ui/EmptyState";
import { SkeletonBlock } from "../components/ui/Skeleton";
import { SectionHead } from "../components/ui/DataTable";
import { useToast } from "../components/ui/Toast";
import { useTranslit } from "../utils/transliterate";
import api from "../utils/api";
import SeatStrip from "../components/assessment/SeatStrip";
import ScoreCard from "../components/assessment/ScoreCard";
import ResultsView from "../components/assessment/ResultsView";
import { useAT, fill, errText, fmtDate } from "../components/assessment/assessmentUtil";

/**
 * The Judge Grading Dashboard (/assessment/:id). Every judge opens the same
 * page: the candidate, the panel live (who sits on which department seat, how
 * far they are), their own scorecard — 20 questions, Pass / No pass and a note
 * each, the mandatory overall feedback — and the results once their own
 * scorecard is in. Polls every 5 s while the sitting is open, so judges
 * grading simultaneously see each other's progress (never each other's
 * verdicts before they submit).
 */
export default function AssessmentGrade() {
  const T = useAT();
  const { tl } = useTranslit();
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const key = ["assessment", id];
  // The seat on screen. One person holds one seat — except in TEST MODE (a
  // sitting drawn from the sample questions), where an admin holds several and
  // switches between them; null = the server's pick (their open one first).
  const [seat, setSeat] = useState(null);

  const det = useQuery({
    queryKey: [...key, seat],
    queryFn: () => api.get(`/api/assessment/assessments/${id}`, { params: seat ? { seat } : {} }).then((r) => r.data),
    refetchInterval: (q) => (q.state.data?.status === "open" ? 5000 : false),
    placeholderData: keepPreviousData,
  });
  const d = det.data;
  const mine = d?.mine;
  // A seat asked for that the viewer no longer holds (freed) → back to the default.
  useEffect(() => {
    if (seat && d && !det.isPlaceholderData && !(d.my_seats || []).includes(seat)) setSeat(null);
  }, [seat, d, det.isPlaceholderData]);

  const [tab, setTab] = useState(null);
  // A judge with an open scorecard lands on it — also the moment they take a
  // seat; everybody else (and a submitted judge) on the results.
  const mineId = mine?.id ?? null;
  const loaded = !!d;
  useEffect(() => {
    if (!loaded) return;
    setTab(mineId && !mine?.submitted_at ? "card" : "results");
  }, [mineId, loaded]); // eslint-disable-line react-hooks/exhaustive-deps
  const view = mine ? tab || "card" : "results";

  const [ask, setAsk] = useState(null);   // {kind, seat}
  const [askErr, setAskErr] = useState(null);
  const refresh = () => qc.invalidateQueries({ queryKey: key });

  const act = useMutation({
    mutationFn: ({ method, url, body }) => api.request({ method, url, data: body }).then((r) => r.data),
    onSuccess: (_, v) => {
      setAsk(null);
      qc.invalidateQueries({ queryKey: ["assessment-list"] });
      if (v.after === "list") { nav("/assessment"); return; }
      if (v.seat !== undefined) setSeat(v.seat);
      refresh();
      if (v.toast) toast.success(v.toast);
    },
    onError: (e, v) => {
      if (v.inline) setAskErr(errText(e, T));
      else toast.error(errText(e, T));
    },
  });

  const claim = (s) => {
    // Holding a seat already means MOVING it — except in test mode, where an
    // admin takes the new seat as one more scorecard.
    if (mine && !d?.rights?.multi_seat) { setAskErr(null); setAsk({ kind: "move", seat: s }); return; }
    act.mutate({ method: "post", url: `/api/assessment/assessments/${id}/seat`,
      body: { department: s.department }, seat: s.department });
  };

  if (det.isLoading) {
    return (
      <Layout title={T.title}>
        <div className="space-y-4">
          <SkeletonBlock className="h-24 rounded-2xl" />
          <SkeletonBlock className="h-28 rounded-2xl" />
          <SkeletonBlock className="h-64 rounded-2xl" />
        </div>
      </Layout>
    );
  }
  if (det.isError || !d) {
    return (
      <Layout title={T.title}>
        <EmptyState tone="danger" title={T.loadFailed} message={errText(det.error, T)} showUploadLink={false}
          action={<div className="flex gap-2 justify-center">
            <Button variant="secondary" icon={ArrowLeft} onClick={() => nav("/assessment")}>{T.back}</Button>
            <Button onClick={() => det.refetch()}>{T.retry}</Button>
          </div>} />
      </Layout>
    );
  }

  const r = d.rights;
  const pendingJudges = d.seats.filter((s) => s.judge_name && !s.submitted).length;
  // Verdicts or notes this judge has on their own questions (a move drops them).
  const myEntered = mine ? Object.values(mine.grades || {}).filter((g) => g.verdict || g.note).length : 0;

  const dialogs = {
    move: ask?.seat && mine && {
      // A judge grades their own department's questions only, so whatever was
      // given as the old department is deleted by the move — said before it.
      title: T.moveSeatTitle, tone: myEntered ? "danger" : "warning", confirm: T.move,
      message: fill(T.moveSeatMsg, { from: T.dept[mine.department], to: T.dept[ask.seat.department] })
        + (myEntered ? ` ${fill(T.moveLoss, { n: myEntered, from: T.dept[mine.department] })}` : ""),
      run: { method: "post", url: `/api/assessment/assessments/${id}/seat`,
        body: { department: ask.seat.department, from: mine.department }, seat: ask.seat.department },
    },
    leave: ask?.seat && {
      title: T.leaveTitle, tone: "danger", confirm: T.leave,
      message: myEntered ? fill(T.leaveMsg, { n: myEntered }) : T.leaveMsgEmpty,
      run: { method: "delete", url: `/api/assessment/assessments/${id}/seats/${ask.seat.department}`, seat: null },
    },
    release: ask?.seat && {
      title: T.releaseTitle, tone: "danger", confirm: T.release,
      message: fill(T.releaseMsg, { name: tl(ask.seat.judge_name || ""), dept: T.dept[ask.seat.department], n: ask.seat.graded }),
      run: { method: "delete", url: `/api/assessment/assessments/${id}/seats/${ask.seat.department}` },
    },
    close: {
      title: T.closeTitle, tone: "warning", confirm: T.closeA, message: fill(T.closeMsg, { n: pendingJudges }),
      run: { method: "post", url: `/api/assessment/assessments/${id}/close`, body: { closed: true }, toast: T.done },
    },
    reopen: {
      title: T.reopenTitle, tone: "warning", confirm: T.reopenA, message: T.reopenMsg,
      run: { method: "post", url: `/api/assessment/assessments/${id}/close`, body: { closed: false }, toast: T.done },
    },
    redraw: {
      title: T.redrawTitle, tone: "warning", confirm: T.redraw, message: T.redrawMsg,
      run: { method: "post", url: `/api/assessment/assessments/${id}/redraw`, toast: T.done },
    },
    delete: {
      title: T.deleteTitle, tone: "danger", confirm: T.del, message: T.deleteMsg,
      run: { method: "delete", url: `/api/assessment/assessments/${id}`, after: "list" },
    },
  };
  const dlg = ask ? dialogs[ask.kind] : null;

  return (
    <Layout title={T.title} subtitle={d.candidate ? tl(d.candidate.full_name) : undefined}>
      <div className="space-y-4">
        <Link to="/assessment" className="inline-flex items-center gap-1.5 text-xs font-medium min-h-[32px]" style={{ color: "var(--text-2)" }}>
          <ArrowLeft size={14} aria-hidden="true" />{T.back}
        </Link>

        {/* The candidate */}
        <div className="rounded-2xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <div className="flex flex-col lg:flex-row lg:items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold break-words" style={{ color: "var(--text-1)" }}>
                  {d.candidate ? tl(d.candidate.full_name) : "—"}
                </h2>
                <span className="inline-flex items-center rounded-md px-1.5 py-[2px] text-[11px] font-medium"
                  style={d.status === "open"
                    ? { background: "rgba(var(--brand-rgb),0.12)", color: "var(--brand-text)", border: "1px solid rgba(var(--brand-rgb),0.35)" }
                    : { background: "var(--bg-inner)", color: "var(--text-3)", border: "1px solid var(--border)" }}>
                  {d.status === "open" ? T.chipOpen : T.chipClosed}
                </span>
              </div>
              {d.candidate?.note && <p className="mt-0.5 text-sm" style={{ color: "var(--text-2)" }}>{d.candidate.note}</p>}
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: "var(--text-3)" }}>
                <span className="inline-flex items-center gap-1"><CalendarDays size={12} aria-hidden="true" />{fmtDate(d.held_on)}</span>
                {d.created_by && <span>{fill(T.createdBy, { name: tl(d.created_by) })}</span>}
              </div>
            </div>
            {r.admin && (
              <div className="flex flex-wrap gap-2">
                {r.close && <Button variant="secondary" icon={Lock} onClick={() => { setAskErr(null); setAsk({ kind: "close" }); }}>{T.closeA}</Button>}
                {r.reopen && <Button variant="secondary" icon={LockOpen} onClick={() => { setAskErr(null); setAsk({ kind: "reopen" }); }}>{T.reopenA}</Button>}
                {r.redraw && <Button variant="secondary" icon={Shuffle} onClick={() => { setAskErr(null); setAsk({ kind: "redraw" }); }}>{T.redrawA}</Button>}
                {r.delete && <Button variant="danger" tint icon={Trash2} onClick={() => { setAskErr(null); setAsk({ kind: "delete" }); }}>{T.deleteA}</Button>}
              </div>
            )}
          </div>
          {d.status !== "open" && (
            <div className="mt-3 flex items-start gap-2 rounded-xl px-3 py-2 text-xs"
              style={{ background: "var(--bg-inner)", color: "var(--text-2)" }}>
              <Lock size={14} className="mt-[1px] shrink-0" aria-hidden="true" />
              <span>
                {T.closedBanner}{" "}
                {d.closed_by === "auto" ? T.closedAuto : d.closed_by ? fill(T.closedBy, { name: tl(d.closed_by) }) : ""}
              </span>
            </div>
          )}
        </div>

        {d.test_mode && (
          <div className="flex items-start gap-2 rounded-2xl px-4 py-3 text-sm"
            style={{ background: "rgba(var(--brand-rgb),0.08)", border: "1px dashed rgba(var(--brand-rgb),0.45)", color: "var(--text-1)" }}>
            <FlaskConical size={16} className="mt-[2px] shrink-0" style={{ color: "var(--brand-text)" }} aria-hidden="true" />
            <span>{r.multi_seat ? T.testBanner : T.testBannerJudge}</span>
          </div>
        )}

        {/* The panel, live */}
        <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <SectionHead icon={Gavel} title={T.panel} />
          <div className="p-4 pt-3 space-y-3">
            {!mine && r.claim && (
              <div>
                <div className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>{T.pickSeatTitle}</div>
                <div className="text-xs" style={{ color: "var(--text-3)" }}>{T.pickSeatMsg}</div>
              </div>
            )}
            {!mine && !r.claim && (
              <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-3)" }}>
                <Info size={13} aria-hidden="true" />{T.notJudge}
              </div>
            )}
            <SeatStrip seats={d.seats} rights={r} mine={mine} current={mine?.department}
              onSwitch={(s) => setSeat(s.department)}
              busyDept={act.isPending && act.variables?.body?.department && !ask ? act.variables.body.department : null}
              onClaim={claim}
              onLeave={(seat) => { setAskErr(null); setAsk({ kind: "leave", seat }); }}
              onRelease={(seat) => { setAskErr(null); setAsk({ kind: "release", seat }); }} />
          </div>
        </div>

        {mine && (
          <SegmentedToggle asTabs value={view} onChange={setTab} ariaLabel={T.title}
            options={[["card", T.tabCard], ["results", T.tabResults]]} />
        )}
        {view === "card" && mine ? (
          <ScoreCard key={mine.id} aid={id} data={d} toast={toast} onChanged={refresh}
            onSubmitted={() => { refresh(); qc.invalidateQueries({ queryKey: ["assessment-list"] }); setTab("results"); }} />
        ) : (
          <ResultsView data={d} />
        )}
      </div>

      {dlg && (
        <ConfirmDialog title={dlg.title} message={dlg.message} tone={dlg.tone}
          confirmLabel={dlg.confirm} cancelLabel={T.cancel} loading={act.isPending} error={askErr}
          onCancel={() => setAsk(null)}
          onConfirm={() => { setAskErr(null); act.mutate({ ...dlg.run, inline: true }); }} />
      )}
      {toast.node}
    </Layout>
  );
}
