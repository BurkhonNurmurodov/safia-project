// «How the % adds up» — a goal's progress split into the results it is made
// of, in the goal's own points (the whole goal is 100). Each result gets one
// bar on a SHARED scale: the track is what the result can give (its weight's
// share of the 100), the fill is what it has given so far. So a result that
// counts double has a track twice as long, the tracks add up to 100, the fills
// add up to the goal's percent, and the longest empty stretch is the result
// holding the goal back — which the line under the bars names outright.
//
// Part-to-whole with unequal parts, where each part is compared → aligned bars
// from one baseline, each labelled beside itself (a single stacked bar could
// only tell two same-coloured parts apart by their order).
import { Lightbulb } from "lucide-react";
import { targetProgress, targetStatus, targetWeight, fill } from "../../../utils/targets";
import { MARK_COLOR } from "./chartKit";

export default function ContributionBar({ goal, today, t }) {
  const tgs = goal.targets ?? [];
  const sw = tgs.reduce((s, tg) => s + targetWeight(tg), 0) || 1;
  const items = tgs.map((tg) => {
    const share = targetWeight(tg) / sw;
    const p = targetProgress(tg);
    return { tg, share, p, got: share * p, color: MARK_COLOR[targetStatus(tg, goal, today)] };
  });
  const maxShare = Math.max(...items.map((it) => it.share), 0.0001);
  const pts = (v) => Math.round(v * 100);
  const total = pts(items.reduce((s, it) => s + it.got, 0));
  // The result with the most points still to give — first one on a tie.
  const lever = items.reduce((best, it) => (pts(it.share - it.got) > (best ? pts(best.share - best.got) : 0) ? it : best), null);

  return (
    <div className="px-4 pb-4 pt-3 flex-1 flex flex-col justify-center gap-4">
      <div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 text-[11px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-3)" }}>
          <span>{t("targets.results")}</span>
          <span className="text-right">{t("targets.chart.contrib.col")}</span>
        </div>
        <ul className="mt-2 space-y-3">
          {items.map((it) => (
            <li key={it.tg.id}>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 text-sm">
                <span className="truncate" style={{ color: "var(--text-1)" }} title={it.tg.title}>{it.tg.title}</span>
                <span className="tabular-nums text-right whitespace-nowrap">
                  <span className="font-semibold" style={{ color: "var(--text-1)" }}>{pts(it.got)}</span>
                  <span style={{ color: "var(--text-3)" }}> / {pts(it.share)}</span>
                </span>
              </div>
              {/* track = what it can give, fill = what it has given */}
              <div className="mt-1.5 h-2.5 rounded-full overflow-hidden" style={{ width: `${(it.share / maxShare) * 100}%`, background: "var(--bg-accent)" }} aria-hidden>
                <div className="h-full rounded-full" style={{ width: `${Math.round(it.p * 100)}%`, background: it.color }} />
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-3">
        {lever && (
          <p className="flex items-start gap-2 text-[13px] leading-snug" style={{ color: "var(--text-2)" }}>
            <Lightbulb size={14} className="flex-shrink-0 mt-0.5" style={{ color: "var(--text-3)" }} aria-hidden />
            <span>{fill(t("targets.chart.contrib.lever"), { title: lever.tg.title, n: pts(lever.share - lever.got) })}</span>
          </p>
        )}
        <div className="pt-2.5 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 text-sm" style={{ borderTop: "1px solid var(--border)" }}>
          <span className="font-semibold" style={{ color: "var(--text-2)" }}>{t("targets.chart.contrib.total")}</span>
          <span className="tabular-nums text-right">
            <span className="font-bold" style={{ color: "var(--text-1)" }}>{total}</span>
            <span style={{ color: "var(--text-3)" }}> / 100</span>
          </span>
        </div>
      </div>
    </div>
  );
}
