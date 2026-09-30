import { memo, useEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, Clock } from "lucide-react";
import { SectionHead } from "../ui/DataTable";
import SegmentedToggle from "../ui/SegmentedToggle";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { surnameInitial } from "../../utils/personName";
import { toneFill } from "../../utils/statusBands";
import { productionLink } from "../../utils/scopeLinks";
import useIsMobile from "../../hooks/useIsMobile";
import { usePersistentState } from "../../hooks/usePersistentState";
import { ratio, pctOf, toneOf, fmtHours, ddmm, weekdayOf } from "./planUtil";
import PlanLegend from "./PlanLegend";

const HATCH = "repeating-linear-gradient(135deg, var(--border-md) 0 2px, transparent 2px 5px)";
const CELL_W = 40;

// Brigadir × day — the whole period at once: who fell short, and on which
// days. One square per unit-day in the completion bands' colours, the period's
// own figure pinned at the row's end, the fleet's day in the last row. Every
// square with a figure opens that unit's «Zagruzka fayli» on that day, where
// the figure comes from (only for a viewer who may open that page).
//
// A unique visualisation table (like the /zagruzka heatmaps), not a DataTable:
// its columns are days, not fields.
function PlanDayMatrix({ units, days, trend, canOpen }) {
  const { t } = useLang();
  const { tl, lang } = useTranslit();
  const phone = useIsMobile();
  const [sort, setSort] = usePersistentState("plan_matrix_sort", "worst");
  const scrollRef = useRef(null);

  const rows = useMemo(() => {
    const list = units.map((u) => ({ ...u, r: ratio(u.actual, u.plan) }));
    if (sort === "name") return list.sort((a, b) => tl(a.name).localeCompare(tl(b.name)));
    // lowest first; a unit with no figure at all sinks to the bottom
    return list.sort((a, b) => (a.r == null) - (b.r == null) || (a.r ?? 0) - (b.r ?? 0));
  }, [units, sort, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  // Open on the LATEST day: the days a manager asks about first are the most
  // recent, and a long period would otherwise open on its first week.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [days.length]);

  const nameW = phone ? 120 : 200;
  const showFleet = trend?.length === days.length && rows.length > 1;
  const dayHead = (iso) => (
    <div className="leading-tight">
      <div className="font-semibold" style={{ color: "var(--text-2)" }}>{iso.slice(8, 10)}</div>
      <div className="text-[9px]" style={{ color: "var(--text-4)" }}>{t(`cal.d${weekdayOf(iso)}`)}</div>
    </div>
  );

  const cell = (u, d, i) => {
    const iso = days[i];
    const base = "flex items-center justify-center h-[30px] text-[11px] font-semibold tabular-nums rounded-[4px]";
    if (d === "nf") {
      return (
        <div className={base} style={{ background: HATCH, border: "1px solid var(--border-md)", color: "var(--text-3)" }}
          title={`${tl(u.name)} · ${ddmm(iso)} · ${t("plan.legend.nf")}`}>
          <Clock size={11} />
        </div>
      );
    }
    if (d === "np") {
      return (
        <div className={base} style={{ border: "1px dashed var(--text-4)", color: "var(--text-4)" }}
          title={`${tl(u.name)} · ${ddmm(iso)} · ${t("plan.legend.np")}`}>·</div>
      );
    }
    if (!Array.isArray(d)) return <div className="h-[30px] rounded-[4px]" style={{ background: "var(--bg-inner)" }} title={`${tl(u.name)} · ${ddmm(iso)} · ${t("plan.legend.none")}`} />;
    const r = d[0] > 0 ? d[1] / d[0] : null;
    const title = `${tl(u.name)} · ${ddmm(iso)}\n${t("plan.plan")}: ${fmtHours(d[0])} ${t("plan.h")} · ${t("plan.fact")}: ${fmtHours(d[1])} ${t("plan.h")} · ${pctOf(r)}%`;
    const body = (
      <div className={base} style={toneFill(toneOf(r))} title={title}>{pctOf(r)}</div>
    );
    return canOpen
      ? <Link to={productionLink({ unit: u.manager_id, date: iso })} className="block hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand)] rounded-[4px]">{body}</Link>
      : body;
  };

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <SectionHead
        icon={CalendarDays}
        title={t("plan.matrix.title")}
        subtitle={canOpen ? t("plan.matrix.sub") : t("plan.matrix.subNoLink")}
        right={(
          <SegmentedToggle size="sm" value={sort} onChange={setSort}
            options={[["worst", t("plan.matrix.sortWorst")], ["name", t("plan.matrix.sortName")]]} />
        )}
      />
      {/* Names on the left, the days scrolling beside them — two tables with
          one row pitch, never a sticky column: a sticky cell is a layer of its
          own that a phone can paint a frame late while it scrolls, and the days
          then flash through the names (what the /zagruzka grids taught). */}
      <div className="flex items-start">
        <table className="border-separate flex-shrink-0" style={{ borderSpacing: 3, width: nameW, tableLayout: "fixed" }}>
          <thead>
            <tr>
              <th className="p-0">
                <div className="h-[34px] flex items-end px-2 pb-1 text-[11px] font-semibold" style={{ color: "var(--text-3)" }}>
                  {t("plan.col.brigadir")}
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.manager_id}>
                <td className="p-0">
                  <div className="h-[30px] flex items-center gap-1.5 min-w-0 px-2 text-xs">
                    <span className="truncate" style={{ color: "var(--text-1)" }} title={tl(u.name)}>
                      {phone ? surnameInitial(tl(u.name)) : tl(u.name)}
                    </span>
                    {u.shift ? <span className="text-[10px] flex-shrink-0" style={{ color: "var(--text-4)" }}>S{u.shift}</span> : null}
                  </div>
                </td>
              </tr>
            ))}
            {showFleet && (
              <tr>
                <td className="p-0">
                  <div className="h-[30px] flex items-center px-2 text-xs font-semibold" style={{ color: "var(--text-2)" }}>
                    {t("plan.matrix.fleet")}
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div ref={scrollRef} className="overflow-x-auto flex-1 min-w-0">
          <table className="border-separate" style={{ borderSpacing: 3, minWidth: "100%" }}>
            <thead>
              <tr>
                {days.map((iso) => (
                  <th key={iso} className="p-0 text-center text-[10px] font-normal" style={{ minWidth: CELL_W }}>
                    <div className="h-[34px] flex flex-col items-center justify-end pb-1">{dayHead(iso)}</div>
                  </th>
                ))}
                <th className="p-0" style={{ minWidth: 52 }}>
                  <div className="h-[34px] flex items-end justify-center pb-1 text-[10px] font-semibold" style={{ color: "var(--text-3)" }}>
                    {t("plan.matrix.total")}
                  </div>
                </th>
                <th className="p-0">
                  <div className="h-[34px] flex items-end justify-end pb-1 px-2 text-[10px] font-semibold whitespace-nowrap" style={{ color: "var(--text-3)" }}>
                    {t("plan.col.shortH")}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.manager_id}>
                  {days.map((iso, i) => <td key={iso} className="p-0">{cell(u, u.daily?.[i], i)}</td>)}
                  <td className="p-0">
                    <div className="flex items-center justify-center h-[30px] text-[11px] font-bold tabular-nums rounded-[4px]"
                      style={u.r != null ? toneFill(toneOf(u.r)) : { color: "var(--text-4)" }}
                      title={u.no_data ? t("plan.noUnitData") : undefined}>
                      {u.r != null ? `${pctOf(u.r)}%` : "—"}
                    </div>
                  </td>
                  <td className="p-0">
                    <div className="h-[30px] flex items-center justify-end px-2 text-xs tabular-nums whitespace-nowrap"
                      style={{ color: u.short > 0 ? "var(--text-1)" : "var(--text-4)" }}>
                      {u.plan > 0 ? fmtHours(u.short) : "—"}
                    </div>
                  </td>
                </tr>
              ))}
              {showFleet && (
                <tr>
                  {trend.map((d) => {
                    const r = ratio(d.actual, d.plan);
                    return (
                      <td key={d.date} className="p-0">
                        <div className="flex items-center justify-center h-[30px] text-[11px] font-semibold tabular-nums rounded-[4px]"
                          style={r != null ? { boxShadow: "inset 0 0 0 2px var(--border-md)", color: "var(--text-1)" } : { color: "var(--text-4)" }}
                          title={r != null ? `${ddmm(d.date)} · ${pctOf(r)}%` : undefined}>
                          {r != null ? pctOf(r) : ""}
                        </div>
                      </td>
                    );
                  })}
                  <td colSpan={2} className="p-0"><div className="h-[30px]" /></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div className="px-4 py-2.5" style={{ borderTop: "1px solid var(--border)" }}>
        <PlanLegend />
      </div>
    </div>
  );
}

export default memo(PlanDayMatrix);
