import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Lock, LockOpen, Shuffle, Trash2, Info, FlaskConical, ChevronDown } from "lucide-react";
import Layout from "../components/layout/Layout";
import Button from "../components/ui/Button";
import ActionMenu from "../components/ui/ActionMenu";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import EmptyState from "../components/ui/EmptyState";
import ProfileAvatar from "../components/ui/ProfileAvatar";
import { SkeletonBlock } from "../components/ui/Skeleton";
import { useToast } from "../components/ui/Toast";
import { useTranslit } from "../utils/transliterate";
import { nameCase } from "../utils/personName";
import api from "../utils/api";
import SeatStrip, { SeatRing } from "../components/assessment/SeatStrip";
import useIsMobile from "../hooks/useIsMobile";
import ScoreCard from "../components/assessment/ScoreCard";
import ResultsView from "../components/assessment/ResultsView";
import { useAT, fill, errText, fmtDate } from "../components/assessment/assessmentUtil";
import { useCanOpen } from "../components/people/peopleUtil";

/**
 * The Judge Grading Dashboard (/assessment/:id). Every judge opens the same
 * page: the candidate, the panel live (who sits on which department seat, how
 * far they are), their own scorecard — the questions of their department, Pass
 * / No pass and a note each, the mandatory overall feedback — and the results
 * once their own scorecard is in. Polls every 5 s while the sitting is open, so
 * judges grading simultaneously see each other's progress (never each other's
 * verdicts before they submit).
 *
 * The candidate is the subject and the panel is the periphery: once a judge
 * holds a seat the panel folds into one row of progress rings in the
 * candidate's card, and the sheet below is the page.
 */
export default function AssessmentGrade() {
  const T = useAT();
  const { tl } = useTranslit();
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const canPeople = useCanOpen("people");
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

  const phone = useIsMobile();
  const [panelOpen, setPanelOpen] = useState(false);
  useEffect(() => { setPanelOpen(false); }, [mineId]);   // a seat taken / switched → back to the questions

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
        <div className="space-y-3">
          <SkeletonBlock className="h-5 w-28 rounded-md" />
          <SkeletonBlock className="h-[156px] rounded-2xl" />
          <SkeletonBlock className="h-[92px] rounded-2xl" />
          <SkeletonBlock className="h-[300px] rounded-2xl" />
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
  // A test sitting may be deleted after grading; its confirm then says the grades go too.
  const anyGraded = d.seats.some((s) => s.graded > 0 || s.submitted);
  // No seat yet and one can be taken: picking it IS this judge's job right now.
  const mustPick = !mine && r.claim;
  const panelShown = mustPick || panelOpen || (!mine && !phone);

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
      title: T.deleteTitle, tone: "danger", confirm: T.del,
      message: d.test_mode && anyGraded ? T.deleteMsgTest : T.deleteMsg,
      run: { method: "delete", url: `/api/assessment/assessments/${id}`, after: "list" },
    },
  };
  const dlg = ask ? dialogs[ask.kind] : null;
  const openAsk = (kind, s) => { setAskErr(null); setAsk({ kind, seat: s }); };
  // Verifix spells the candidate in capitals; the page reads it in title case.
  const cand = d.candidate;
  const candName = cand ? nameCase(tl(cand.full_name)) : null;
  const eid = cand?.employee_id;
  const place = [cand?.job, cand?.code && `${T.cell} ${cand.code}`, cand?.unit ? tl(cand.unit) : null].filter(Boolean).join(" · ");
  const menuItems = [
    r.redraw && { key: "redraw", label: T.redrawA, icon: Shuffle, onSelect: () => openAsk("redraw") },
    r.delete && { key: "delete", label: T.deleteA, icon: Trash2, tone: "danger", onSelect: () => openAsk("delete") },
  ].filter(Boolean);

  return (
    <Layout title={T.title} subtitle={candName || undefined}>
      <div className="space-y-3">
        <Link to="/assessment" className="inline-flex items-center gap-1.5 text-xs font-medium min-h-[32px]" style={{ color: "var(--text-2)" }}>
          <ArrowLeft size={14} aria-hidden="true" />{T.back}
        </Link>

        {/* The candidate — and, folded into the foot of the card, the panel. */}
        <section className="rounded-2xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <div className="p-4 sm:p-5 flex items-start gap-4">
            <ProfileAvatar muted name={candName || "—"} colorKey={cand?.full_name || ""} size={phone ? 48 : 60}
              photoUrl={canPeople && eid ? `/api/people/${encodeURIComponent(eid)}/photo?size=192` : undefined} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <h2 className="text-lg sm:text-[22px] font-semibold leading-tight tracking-[-0.01em] break-words" style={{ color: "var(--text-1)" }}>
                  {candName || "—"}
                </h2>
                {/* A STATE: a neutral chip with a status dot — brand gold is
                    an accent, never a status. */}
                <span className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium"
                  style={{ background: "var(--bg-inner)", color: "var(--text-2)", border: "1px solid var(--border)" }}>
                  <span className="w-1.5 h-1.5 rounded-full" aria-hidden="true"
                    style={{ background: d.status === "open" ? "#22c55e" : "#94a3b8" }} />
                  {d.status === "open" ? T.chipOpen : T.chipClosed}
                </span>
              </div>
              {place && <p className="mt-1 text-sm break-words" style={{ color: "var(--text-2)" }}>{place}</p>}
              <p className="mt-1 text-xs break-words" style={{ color: "var(--text-3)" }}>
                <span className="tabular-nums">{fmtDate(d.held_on)}</span>
                {d.created_by && <> · {fill(T.createdBy, { name: tl(d.created_by) })}</>}
                {cand?.note && <> · <span style={{ color: "var(--text-2)" }}>«{cand.note}»</span></>}
              </p>
            </div>
            {r.admin && (r.close || r.reopen || menuItems.length > 0) && (
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {r.close && <Button variant="secondary" icon={Lock} onClick={() => openAsk("close")} className="max-sm:hidden">{T.closeA}</Button>}
                {r.reopen && <Button variant="secondary" icon={LockOpen} onClick={() => openAsk("reopen")}>{T.reopenA}</Button>}
                {(menuItems.length > 0 || (r.close && phone)) && (
                  <ActionMenu label={T.menuLabel} items={[
                    r.close && phone && { key: "close", label: T.closeA, icon: Lock, onSelect: () => openAsk("close") },
                    ...menuItems,
                  ]} />
                )}
              </div>
            )}
          </div>

          {d.status !== "open" && (
            <div className="mx-4 sm:mx-5 mb-4 flex items-start gap-2 rounded-xl px-3 py-2 text-xs" style={{ background: "var(--bg-inner)", color: "var(--text-2)" }}>
              <Lock size={14} className="mt-[1px] shrink-0" aria-hidden="true" />
              <span>{T.closedBanner} {d.closed_by === "auto" ? T.closedAuto : d.closed_by ? fill(T.closedBy, { name: tl(d.closed_by) }) : ""}</span>
            </div>
          )}

          {/* The panel row: five seats as progress rings. A judge who holds a
              seat reads it at a glance; «Boshqarish» opens the seats. */}
          <div style={{ borderTop: "1px solid var(--border)" }}>
            {!mustPick && <div className="px-4 sm:px-5 py-3 flex items-center gap-x-5 gap-y-2.5 flex-wrap">
              <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>{T.panel}</span>
              <div className="flex items-center gap-x-4 gap-y-2 flex-wrap min-w-0">
                {d.seats.map((s) => (
                  <span key={s.department} className="inline-flex items-center gap-2 min-w-0"
                    title={s.judge_name ? `${T.dept[s.department]}: ${tl(s.judge_name)}` : fill(T.seatFreeTip, { dept: T.dept[s.department] })}>
                    <SeatRing seat={s} current={mine?.department} size={phone ? 34 : 30} />
                    {!phone && (
                      <span className="leading-tight min-w-0">
                        <span className="block text-xs font-medium truncate" style={{ color: "var(--text-1)" }}>
                          {T.dept[s.department]}{s.mine ? <span style={{ color: "var(--brand-text)" }}> · {T.seatYou}</span> : null}
                        </span>
                        <span className="block text-[11px] tabular-nums truncate" style={{ color: s.submitted ? "var(--status-ok)" : "var(--text-3)" }}>
                          {!s.judge_name ? T.seatFree : s.submitted ? T.seatSubmitted : fill(T.seatProgress, { g: s.graded, t: s.total ?? 0 })}
                        </span>
                      </span>
                    )}
                  </span>
                ))}
              </div>
              {!mustPick && (mine || phone) && (
                <button type="button" onClick={() => setPanelOpen((o) => !o)} aria-expanded={panelShown}
                  className="ml-auto inline-flex items-center gap-1 text-xs font-medium min-h-[36px] px-2 -mr-2 rounded-lg"
                  style={{ color: "var(--text-2)" }}>
                  {panelShown ? T.hide : T.manage}
                  <ChevronDown size={14} className={`transition-transform duration-200 ${panelShown ? "rotate-180" : ""}`} aria-hidden="true" />
                </button>
              )}
            </div>}
            <div className={`aq-fold ${panelShown ? "is-open" : ""}`}>
              <div className="aq-fold-inner">
                <div className={`px-4 sm:px-5 pb-4 space-y-3 ${mustPick ? "pt-4" : ""}`}>
                  {mustPick && (
                    <div>
                      <div className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>{T.pickSeatTitle}</div>
                      <div className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>{T.pickSeatMsg}</div>
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
                    onLeave={(s) => openAsk("leave", s)}
                    onRelease={(s) => openAsk("release", s)} />
                </div>
              </div>
            </div>
          </div>
        </section>

        {d.test_mode && (
          <div className="flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-xs leading-relaxed"
            style={{ background: "rgba(var(--brand-rgb),0.07)", border: "1px dashed rgba(var(--brand-rgb),0.4)", color: "var(--text-2)" }}>
            <FlaskConical size={14} className="mt-[1px] shrink-0" style={{ color: "var(--brand-text)" }} aria-hidden="true" />
            <span>{r.multi_seat ? T.testBanner : T.testBannerJudge}</span>
          </div>
        )}

        {mine && (
          <SegmentedToggle asTabs value={view} onChange={setTab} ariaLabel={T.title}
            options={[["card", T.tabCard], ["results", T.tabResults]]} />
        )}
        <div key={view} className="aq-reveal">
          {view === "card" && mine ? (
            <ScoreCard key={mine.id} aid={id} data={d} toast={toast} onChanged={refresh}
              onSubmitted={() => { refresh(); qc.invalidateQueries({ queryKey: ["assessment-list"] }); setTab("results"); }} />
          ) : (
            <ResultsView data={d} />
          )}
        </div>
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
