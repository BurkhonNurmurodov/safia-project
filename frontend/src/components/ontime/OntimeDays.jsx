import { useCallback, useMemo } from "react";
import HeatmapChart from "../charts/HeatmapChart";
import SegmentedToggle from "../ui/SegmentedToggle";
import EmptyState from "../ui/EmptyState";
import useIsMobile from "../../hooks/useIsMobile";
import { usePersistentState } from "../../hooks/usePersistentState";
import { activeBands, TONE_HEX } from "../../utils/statusBands";
import { useLang } from "../../context/LangContext";
import { useOT, fill, ratio, pctOf, fmtQty, useGroupName } from "./ontimeUtil";

// «Kunlar bo'yicha» — the sheet's «свод по группам» drawn by THE heatmap the
// /zagruzka tables are drawn by (HeatmapChart): one row per group (its day =
// the mean of its waves, «средний on time»), one column per day, the AVG /
// MAX / MIN column pinned right, and the day's total (on-time quantity ÷
// ordered) as the footer row. A wave picker reads one wave instead of the
// group's mean. Cells wear the on-time band in force; a blank is a day the
// group had no orders. A cell opens the group's products.

const toGridDate = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
// Module-level, so the memoised grid is handed stable references.
const READ = (v) => (typeof v === "number" ? v : null);
const AS_IS = (key) => key;          // row keys are already display-ready
const LABEL_W = 210;
const PHONE_LABEL_W = 132;

export default function OntimeDays({ data, onGroup }) {
  const T = useOT();
  const { t, lang } = useLang();
  const gn = useGroupName();
  const phone = useIsMobile();
  const [pick, setPick] = usePersistentState("ontime_days_wave", "all");

  const dates = useMemo(() => (data.days || []).map(toGridDate), [data.days]);

  // Every wave the payload carries a group figure for. One wave alone is the
  // group's mean already, so the picker only appears for two or more.
  const waveKeys = useMemo(() => {
    const s = new Set();
    for (const g of data.groups || []) for (const w of Object.keys(g.wave_daily || {})) s.add(w);
    return [...s].sort((a, b) => Number(a) - Number(b));
  }, [data.groups]);
  const wave = waveKeys.length > 1 && waveKeys.includes(pick) ? pick : "all";

  // The ontime band as heatmap segments, low → high, judged on the whole
  // percent printed — the rule `ontimeTone` applies everywhere else here.
  const { ok, warn } = activeBands().ontime;
  const segments = useMemo(() => [
    { from: 0, color: TONE_HEX.bad },
    { from: warn, color: TONE_HEX.warn },
    { from: ok, color: TONE_HEX.ok },
  ], [ok, warn]);

  // Rows are keyed by the name the reader sees, so the grid's name sort runs
  // in the reader's own script; `grpOf` takes a key back to the sheet's group.
  const { managers, grid, grpOf } = useMemo(() => {
    const names = [];
    const out = {};
    const back = {};
    for (const g of data.groups || []) {
      if (!(g.demand > 0)) continue;
      const arr = wave === "all" ? g.daily : g.wave_daily?.[wave];
      if (!arr || !arr.some((v) => typeof v === "number")) continue;
      let key = gn(g.grp) || g.grp;
      if (back[key]) key = `${key} (${g.grp})`;
      back[key] = g.grp;
      names.push(key);
      const row = {};
      arr.forEach((v, i) => { if (typeof v === "number" && dates[i]) row[dates[i]] = v; });
      out[key] = row;
    }
    return { managers: names, grid: out, grpOf: back };
  }, [data.groups, wave, dates, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  // The day's total: on-time quantity ÷ ordered, for every group (or the wave
  // picked) — a row of its own under the groups, never a mean of them.
  const { pinnedRow, totals } = useMemo(() => {
    const row = {};
    const qty = {};
    for (const d of data.trend || []) {
      const key = toGridDate(d.date);
      const [dem, on] = wave === "all" ? [d.demand, d.ontime] : (d.waves?.[wave] || [0, 0]);
      if (dem > 0) { row[key] = ratio(on, dem); qty[key] = [on, dem]; }
    }
    return {
      pinnedRow: { label: T.total, hint: T.totalHint, data: row },
      totals: qty,
    };
  }, [data.trend, wave, T]);

  const cellTitle = useCallback((cell, name, d) => {
    const day = d.slice(0, 5);
    if (name === T.total) {
      const q = totals[d];
      return q ? `${T.total} · ${day} · ${pctOf(cell)}% — ${fmtQty(q[0])} / ${fmtQty(q[1])} ${T.pcs}` : `${T.total} · ${day} · ${T.legendNone}`;
    }
    if (typeof cell !== "number") return `${name} · ${day} · ${T.legendNone}`;
    return `${name} · ${day} · ${pctOf(cell)}% — ${T.groupOpen}`;
  }, [T, totals]);

  const onCellClick = useCallback((name) => {
    const g = grpOf[name];
    if (g) onGroup(g);
  }, [grpOf, onGroup]);

  const small = phone ? "text-[11px]" : "text-[10px]";
  const legend = [
    [TONE_HEX.bad, fill(T.legendBad, { warn })],
    [TONE_HEX.warn, fill(T.legendWarn, { warn, ok1: ok - 1 })],
    [TONE_HEX.ok, fill(T.legendOk, { ok })],
  ];

  return (
    <div className="rounded-2xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-2)" }}>
            {T.daysTitle}
          </div>
          <div className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>
            {t("zagruzka.periodDays").replace("{n}", dates.length)}
          </div>
          <div className={`${small} mt-0.5`} style={{ color: "var(--text-3)" }}>{T.daysSub}</div>
        </div>
        {waveKeys.length > 1 && (
          <SegmentedToggle
            value={wave}
            onChange={setPick}
            options={[["all", T.showAll], ...waveKeys.map((w) => [w, fill(T.waveN, { n: w })])]}
            fill={phone}
            className={phone ? "w-full" : ""}
          />
        )}
      </div>

      <div className={`flex flex-wrap items-center gap-3 ${small} mb-3`} style={{ color: "var(--text-3)" }}>
        {legend.map(([color, label]) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: color }} />
            {label}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ border: "1px solid var(--border-md)" }} />
          {T.legendNone}
        </span>
      </div>

      {!managers.length ? (
        <EmptyState title={T.emptyTitle} message="" showUploadLink={false} height="h-48" />
      ) : (
        <div className={phone ? "-mx-4" : undefined}>
          <HeatmapChart
            dates={dates}
            managers={managers}
            data={grid}
            cellValue={READ}
            segments={segments}
            rowLabel={T.colGroup}
            labelWidth={phone ? PHONE_LABEL_W : LABEL_W}
            labelFor={AS_IS}
            pinnedRow={pinnedRow}
            cellTitle={cellTitle}
            onCellClick={onCellClick}
            phoneFit
          />
        </div>
      )}
    </div>
  );
}
