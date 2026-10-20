import { Fragment } from "react";
import { CalendarRange } from "lucide-react";
import SegmentedToggle from "../ui/SegmentedToggle";
import { ChartCard, NoChart } from "../ui/AnalysisBoard";
import { usePersistentState } from "../../hooks/usePersistentState";
import { toneFill } from "../../utils/statusBands";
import { useLang } from "../../context/LangContext";
import OntimeLegend from "./OntimeLegend";
import { useOT, fill, ratio, pctOf, toneOf, ddmm, weekdayOf, useGroupName } from "./ontimeUtil";

// «Kunlar bo'yicha» — the sheet's «свод по группам» as a heatmap: one row per
// group (its day = the mean of its waves, «средний on time»), optionally
// unfolded into its waves («on time по заходам»), one column per day, the
// day's total (on-time quantity ÷ ordered) on top. Cells are the platform's
// heatmap paint — the band's hue at full saturation with its contrast ink —
// and a blank is a day the group had no orders. A group's name opens its
// products.
const CELL = 46;

// Full-bleed, flat per band, ruled by a 1px line of the CARD's own colour set
// inline — the platform heatmap's own cell (HeatmapChart, «Smena hisoboti»).
const RULE = "1px solid var(--bg-card)";
const GAP = "5px solid var(--bg-card)";

function Cell({ v, title, gap = false }) {
  // The day's total sits above the groups with a wider rule under it, so it
  // reads as the sum line it is rather than as one more group.
  const rule = { border: RULE, ...(gap ? { borderBottom: GAP } : null) };
  if (v == null) {
    return <td className="p-0 h-8" title={title} style={{ background: "var(--bg-inner)", ...rule }} />;
  }
  return (
    <td className="p-0 h-8 text-center text-[11px] font-semibold tabular-nums" title={title}
      style={{ ...toneFill(toneOf(v)), ...rule }}>
      {pctOf(v)}
    </td>
  );
}

export default function OntimeDays({ data, onGroup }) {
  const T = useOT();
  const { t } = useLang();
  const gn = useGroupName();
  const [mode, setMode] = usePersistentState("ontime_days_mode", "groups");
  const days = data.days || [];
  const groups = [...(data.groups || [])].filter((g) => g.demand > 0)
    .sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0) || a.grp.localeCompare(b.grp));
  const totals = (data.trend || []).map((d) => (d.demand > 0 ? ratio(d.ontime, d.demand) : null));
  const nameW = 200;

  const head = (d) => (
    <th key={d} className="px-0 py-1.5 text-center font-medium text-[10px] leading-tight sticky top-0"
      style={{ minWidth: CELL, background: "var(--bg-inner)", color: "var(--text-3)", borderBottom: "1px solid var(--border)" }}>
      <div>{ddmm(d)}</div>
      <div style={{ color: "var(--text-4)" }}>{t(`cal.d${weekdayOf(d)}`)}</div>
    </th>
  );
  const nameTd = (content, { sub = false, bold = false, title, gap = false } = {}) => (
    <td className={`sticky left-0 z-[1] px-3 py-0 text-xs truncate ${sub ? "pl-7" : ""}`}
      style={{ width: nameW, minWidth: nameW, maxWidth: nameW, background: "var(--bg-card)",
        color: sub ? "var(--text-3)" : "var(--text-1)", fontWeight: bold ? 600 : 500, borderRight: "1px solid var(--border)",
        ...(gap ? { borderBottom: GAP } : null) }}
      title={title}>
      {content}
    </td>
  );

  return (
    <div className="space-y-3">
      <ChartCard icon={CalendarRange} title={T.daysTitle} subtitle={T.daysSub}
        right={(
          <SegmentedToggle size="sm" value={mode} onChange={setMode}
            options={[["groups", T.modeGroups], ["waves", T.modeWaves]]} />
        )}>
        {!groups.length ? <NoChart height={240} text={T.emptyTitle} /> : (
          <div className="overflow-x-auto">
            <table className="border-separate" style={{ borderSpacing: 0, width: "100%", minWidth: nameW + days.length * CELL }}>
              <thead>
                <tr>
                  <th className="sticky left-0 top-0 z-[2] px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider"
                    style={{ background: "var(--bg-inner)", color: "var(--text-3)", borderBottom: "1px solid var(--border)", borderRight: "1px solid var(--border)", width: nameW }}>
                    {T.colGroup}
                  </th>
                  {days.map(head)}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {nameTd(T.total, { bold: true, title: T.totalHint, gap: true })}
                  {totals.map((v, i) => <Cell key={days[i]} v={v} gap title={`${T.total} · ${ddmm(days[i])}`} />)}
                </tr>
                {groups.map((g) => (
                  <Fragment key={g.grp}>
                    <tr>
                      {nameTd(
                        <button type="button" onClick={() => onGroup(g.grp)}
                          className="truncate max-w-full text-left hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand)] rounded"
                          title={`${gn(g.grp)} — ${T.groupOpen}`}>
                          {gn(g.grp)}
                        </button>,
                      )}
                      {g.daily.map((v, i) => <Cell key={days[i]} v={v} title={`${gn(g.grp)} · ${ddmm(days[i])}`} />)}
                    </tr>
                    {mode === "waves" && Object.keys(g.wave_daily || {}).length > 1 && Object.entries(g.wave_daily).map(([w, arr]) => (
                      <tr key={`${g.grp}-${w}`}>
                        {nameTd(fill(T.waveN, { n: w }), { sub: true })}
                        {arr.map((v, i) => <Cell key={days[i]} v={v} title={`${gn(g.grp)} · ${fill(T.waveN, { n: w })} · ${ddmm(days[i])}`} />)}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ChartCard>
      <OntimeLegend />
    </div>
  );
}
