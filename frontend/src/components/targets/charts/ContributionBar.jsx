// «How the % adds up» — a goal's progress split into the results it is made
// of. Each result owns a slice of the bar as wide as its WEIGHT, filled as far
// as that result has come, so the filled length of the whole bar IS the
// goal's percent and the emptiest slice is what holds it back. The rows under
// it say the same in numbers: each result's points out of what it could give.
//
// Part-to-whole with unequal parts → a single stacked bar, widths by weight.
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
  const total = Math.round(items.reduce((s, it) => s + it.got, 0) * 100);

  return (
    <div className="px-4 pb-4 pt-2">
      <div className="flex h-5 w-full gap-[2px]" role="img" aria-label={fill(t("targets.chart.contrib.aria"), { p: total })}>
        {items.map((it) => (
          <div
            key={it.tg.id} className="h-full overflow-hidden first:rounded-l-md last:rounded-r-md"
            style={{ flex: `${it.share} 1 0%`, background: "var(--bg-accent)" }}
            title={`${it.tg.title}: ${Math.round(it.p * 100)}%`}
          >
            <div className="h-full" style={{ width: `${Math.round(it.p * 100)}%`, background: it.color }} />
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 text-[11px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-3)" }}>
        <span>{t("targets.results")}</span>
        <span className="text-right">{t("targets.chart.contrib.col")}</span>
      </div>
      <ul className="mt-1.5 space-y-2">
        {items.map((it) => (
          <li key={it.tg.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 text-sm">
            <span className="flex items-center gap-2 min-w-0">
              <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: it.color }} aria-hidden />
              <span className="truncate" style={{ color: "var(--text-1)" }} title={it.tg.title}>{it.tg.title}</span>
            </span>
            <span className="tabular-nums text-right whitespace-nowrap">
              <span className="font-semibold" style={{ color: "var(--text-1)" }}>{Math.round(it.got * 100)}</span>
              <span style={{ color: "var(--text-3)" }}> / {Math.round(it.share * 100)}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 pt-2.5 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 text-sm" style={{ borderTop: "1px solid var(--border)" }}>
        <span className="font-semibold" style={{ color: "var(--text-2)" }}>{t("targets.chart.contrib.total")}</span>
        <span className="tabular-nums text-right">
          <span className="font-bold" style={{ color: "var(--text-1)" }}>{total}</span>
          <span style={{ color: "var(--text-3)" }}> / 100</span>
        </span>
      </div>
    </div>
  );
}
