// «Liderlar KPI» — WHY a cell's plan-fulfilment score is what it is: the
// percent, the minutes it is made of, the band it lands in, the KPI points,
// and the month day by day (each day on the KPI's own scale — the tone its
// score would wear — a day with a plan and no actual marked as such). The
// figures are the board's own (`data.plan.daily` is the «Plan Bajarish» page's
// per-cell day strip); nothing is computed here but each day's own fact ÷ plan.
import { Calculator, CalendarDays } from "lucide-react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import { toneFill } from "../../utils/statusBands";
import { fill } from "../../pages/leadersKpiText";
import { ScoreChip } from "./KpiBits";
import { bandLines, dm, n0, planScoreOf, pts, scoreTone, toneInk, w100 } from "./kpiUtil";

function Scale({ bands, score }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {bands.map(([label, s], i) => {
        const hit = score != null && s === score;
        return (
          <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs tabular-nums whitespace-nowrap"
            style={{
              border: `1px solid ${hit ? toneInk(scoreTone(s)) : "var(--border)"}`,
              background: hit ? "var(--bg-inner)" : "transparent",
              color: hit ? "var(--text-1)" : "var(--text-3)", fontWeight: hit ? 600 : 400,
            }}>
            {label || "…"} → <span className="font-semibold" style={{ color: toneInk(scoreTone(s)) }}>{s}</span>
          </span>
        );
      })}
    </div>
  );
}

// One tile per day of the month so far: the date, then the day's percent on
// its band's fill; «—» on a day with a plan and no actual; empty with nothing.
function DayStrip({ days, strip, rule, T }) {
  return (
    <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(44px, 1fr))" }}>
      {days.map((d, i) => {
        const v = strip[i];
        const counted = Array.isArray(v);
        const pct = counted && v[0] > 0 ? Math.round((100 * v[1]) / v[0]) : null;
        const fillStyle = pct != null ? toneFill(scoreTone(planScoreOf(pct, rule))) : null;
        const title = counted
          ? `${dm(d)}: ${n0(v[1])} / ${n0(v[0])} — ${pct ?? "—"}%`
          : `${dm(d)}: ${v === "nf" ? T.plExDayNf : v === "np" ? T.plExDayNp : "—"}`;
        return (
          <div key={d} title={title} className="rounded-md px-1 py-1 text-center leading-tight"
            style={fillStyle || {
              background: v === "nf" ? "var(--bg-inner)" : "transparent",
              border: "1px solid var(--border)", color: "var(--text-3)",
            }}>
            <div className="text-[10px] tabular-nums opacity-80">{dm(d)}</div>
            <div className="text-xs font-semibold tabular-nums">{pct != null ? `${pct}%` : v === "nf" ? "—" : ""}</div>
          </div>
        );
      })}
    </div>
  );
}

export default function PlanExplain({ open, onClose, item, data, T, title, subtitle, zIndex }) {
  const rule = data?.rules?.plan;
  const p = item?.plan || {};
  const days = data?.plan?.days || [];
  const strip = data?.plan?.daily?.[item?.key] || [];
  const w0 = !(Number(rule?.weight) > 0);
  const tone = scoreTone(p.score);
  return (
    <Modal open={open} onClose={onClose} title={title} subtitle={subtitle} maxWidth="max-w-xl" zIndex={zIndex}
      icon={<Calculator size={18} style={{ color: "var(--brand-text)" }} />}
      bodyClassName="px-5 py-4 space-y-4"
      footer={<Button variant="secondary" onClick={onClose}>{T.done}</Button>}>
      <section className="space-y-2">
        <div className="flex items-center gap-3">
          <span className="text-[28px] font-bold tabular-nums leading-none" style={{ color: p.pct0 == null ? "var(--text-4)" : toneInk(tone) }}>
            {p.pct0 == null ? "—" : `${p.pct0}%`}
          </span>
          <ScoreChip score={p.score} />
        </div>
        {p.pct0 == null ? (
          <p className="text-sm" style={{ color: "var(--text-2)" }}>{T.plExNoPlan}</p>
        ) : (
          <p className="text-sm leading-relaxed" style={{ color: "var(--text-2)" }}>
            {[fill(T.plExFig, { a: n0(p.actual), p: n0(p.plan) }),
              p.short ? fill(T.plExShort, { n: n0(p.short) }) : null,
              fill(T.plExDays, { n: n0(p.days) }),
              p.no_fact ? fill(T.plExNoFact, { n: n0(p.no_fact) }) : null].filter(Boolean).join(" · ")}
          </p>
        )}
        {p.score != null && (
          <p className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>
            {fill(T.cmPoints, { score: p.score, w: w100(rule), p: pts(p.points) })}{w0 ? ` · ${T.plExW0}` : ""}
          </p>
        )}
        <Scale bands={bandLines("plan", rule)} score={p.score} />
      </section>
      {days.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <CalendarDays size={15} style={{ color: "var(--brand-text)" }} aria-hidden />
            <h3 className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>{T.plExDaysTitle}</h3>
          </div>
          <DayStrip days={days} strip={strip} rule={rule} T={T} />
        </section>
      )}
    </Modal>
  );
}
