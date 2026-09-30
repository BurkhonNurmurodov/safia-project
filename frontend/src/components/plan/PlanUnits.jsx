import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Users, ArrowUpRight, ArrowDownRight } from "lucide-react";
import TableCard, { Th } from "../ui/DataTable";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { surnameInitial } from "../../utils/personName";
import { activeBands, TONE_HEX } from "../../utils/statusBands";
import { productionLink } from "../../utils/scopeLinks";
import useIsMobile from "../../hooks/useIsMobile";
import { ratio, fmtPct, fmtHours, dayStats, fill, fmtDelta } from "./planUtil";
import { usePlanSort, sortRows, num } from "./planSort";
import { FulfilChip, DaysShort } from "./planTable";
import DayStrip from "./DayStrip";
import PlanDayMatrix from "./PlanDayMatrix";

// «Brigadirlar» — the units of the scope: the day-by-day heatmap first (who
// fell short, and when), then the table of the period — the figure, how it
// moved against the period before, the hours short, the short days and the
// days still waiting for their fact, and the one line that cost the most.
export default function PlanUnits({ data, productById, canOpen }) {
  const { t } = useLang();
  const { tl, tx, lang } = useTranslit();
  const phone = useIsMobile();
  const [sort, onSort] = usePlanSort("plan_unit_sort", { key: "r", dir: "asc" });
  const { ok } = activeBands().compl;

  const rows = useMemo(() => (data.units || []).map((u) => {
    const r = ratio(u.actual, u.plan);
    const pr = u.prev_plan > 0 ? u.prev_actual / u.prev_plan : null;
    return {
      ...u, r, pr,
      delta: r != null && pr != null ? Math.round((r - pr) * 1000) / 10 : null,
      st: dayStats(u.daily),
      worstRow: u.worst != null ? productById.get(u.worst) : null,
    };
  }), [data.units, productById]);

  const shown = useMemo(() => sortRows(rows, sort, (u, k) => {
    if (k === "name") return tl(u.name) || "";
    if (k === "days") return u.st.counted ? u.st.short / u.st.counted : null;
    if (k === "nf") return u.st.nf;
    return u[k];
  }), [rows, sort, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const stripLabels = { nf: t("plan.legend.nf"), np: t("plan.legend.np"), none: t("plan.legend.none"), aria: t("plan.col.strip") };
  const lastDay = data.days?.[data.days.length - 1];

  const deltaCell = (u) => {
    if (u.delta == null) return <span style={{ color: "var(--text-4)" }}>—</span>;
    const up = u.delta > 0;
    const color = u.delta === 0 ? "var(--text-3)" : up ? TONE_HEX.ok : TONE_HEX.bad;
    const Icon = up ? ArrowUpRight : ArrowDownRight;
    return (
      <span className="inline-flex items-center gap-1 tabular-nums" title={`${t("plan.col.prev")}: ${fmtPct(u.pr)}`}>
        <span style={{ color: "var(--text-3)" }}>{fmtPct(u.pr)}</span>
        <span className="inline-flex items-center font-semibold" style={{ color }}>
          {u.delta !== 0 && <Icon size={12} />}{fmtDelta(u.delta)}
        </span>
      </span>
    );
  };

  const nameCell = (u) => {
    const label = phone ? surnameInitial(tl(u.name)) : tl(u.name);
    return canOpen && lastDay
      ? <Link to={productionLink({ unit: u.manager_id, date: lastDay })} className="cell-link" title={t("plan.openProduction")}>{label}</Link>
      : <span>{label}</span>;
  };

  return (
    <div className="space-y-4 lg:space-y-6">
      <PlanDayMatrix units={data.units || []} days={data.days || []} trend={data.trend} canOpen={canOpen} />

      <TableCard
        icon={Users}
        title={t("plan.units.title")}
        subtitle={t("plan.units.sub")}
        right={<span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{fill(t("plan.rows"), { n: shown.length })}</span>}
        minWidth={1120}
        mobile={(
          <div>
            {shown.map((u) => (
              <div key={u.manager_id} className="px-4 py-3 space-y-1.5" style={{ borderTop: "1px solid var(--border)" }}>
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0 truncate text-sm font-medium">{nameCell(u)}</div>
                  <FulfilChip r={u.r} title={u.no_data ? t("plan.noUnitData") : undefined} />
                </div>
                <div className="flex items-center justify-between gap-2 text-[11px]" style={{ color: "var(--text-3)" }}>
                  <span>{t("plan.col.prev")}: {deltaCell(u)}</span>
                  <span className="tabular-nums">{t("plan.kpi.shortfall")}: <b style={{ color: "var(--text-1)" }}>{fmtHours(u.short)} {t("plan.h")}</b></span>
                </div>
                <DayStrip daily={u.daily} days={data.days} labels={stripLabels} />
              </div>
            ))}
          </div>
        )}
      >
        <thead>
          <tr>
            <Th label={t("plan.col.brigadir")} k="name" sort={sort} onSort={onSort} />
            <Th label={t("plan.col.shift")} k="shift" sort={sort} onSort={onSort} align="center" />
            <Th label={t("plan.col.planH")} k="plan" sort={sort} onSort={onSort} align="right" />
            <Th label={t("plan.col.factH")} k="actual" sort={sort} onSort={onSort} align="right" />
            <Th label={t("plan.col.fulfil")} k="r" sort={sort} onSort={onSort} align="center" hint={t("plan.col.fulfilHint")} />
            <Th label={t("plan.col.prev")} k="delta" sort={sort} onSort={onSort} align="right" hint={t("plan.col.prevHint")} />
            <Th label={t("plan.col.shortH")} k="short" sort={sort} onSort={onSort} align="right" hint={t("plan.col.shortHHint")} />
            <Th label={t("plan.col.days")} k="days" sort={sort} onSort={onSort} align="center" hint={fill(t("plan.col.daysHint"), { ok })} />
            <Th label={t("plan.col.noFact")} k="nf" sort={sort} onSort={onSort} align="center" hint={t("plan.col.noFactHint")} />
            <Th label={t("plan.col.strip")} hint={t("plan.col.stripHint")} cls="w-[180px]" />
            <Th label={t("plan.col.worst")} hint={t("plan.col.worstHint")} />
          </tr>
        </thead>
        <tbody>
          {shown.map((u) => (
            <tr key={u.manager_id}>
              <td className="px-3 py-2 font-medium max-w-[14rem] truncate" title={tl(u.name)}>{nameCell(u)}</td>
              <td className="px-3 py-2 text-center" style={{ color: "var(--text-3)" }}>{u.shift ? `S${u.shift}` : "—"}</td>
              <td className={num}>{u.plan > 0 ? fmtHours(u.plan) : "—"}</td>
              <td className={num}>{u.plan > 0 || u.actual > 0 ? fmtHours(u.actual) : "—"}</td>
              <td className="px-3 py-2 text-center">
                {u.no_data
                  ? <span className="text-[11px]" style={{ color: "var(--text-4)" }} title={t("plan.noUnitDataHint")}>{t("plan.noUnitData")}</span>
                  : <FulfilChip r={u.r} />}
              </td>
              <td className={num}>{deltaCell(u)}</td>
              <td className={`${num} font-semibold`} style={{ color: u.short > 0 ? "var(--text-1)" : "var(--text-4)" }}>{u.short > 0 ? fmtHours(u.short) : "—"}</td>
              <td className="px-3 py-2 text-center"><DaysShort short={u.st.short} of={u.st.counted} /></td>
              <td className="px-3 py-2 text-center tabular-nums" style={{ color: u.st.nf ? "var(--text-1)" : "var(--text-4)" }}>{u.st.nf || "—"}</td>
              <td className="px-3 py-2 w-[180px]"><DayStrip daily={u.daily} days={data.days} labels={stripLabels} /></td>
              <td className="px-3 py-2">
                {u.worstRow
                  ? <span className="block truncate max-w-[16rem]" title={tx(u.worstRow.name)}>{tx(u.worstRow.name)}</span>
                  : <span style={{ color: "var(--text-4)" }}>—</span>}
              </td>
            </tr>
          ))}
          {!shown.length && (
            <tr><td colSpan={11} className="px-3 py-8 text-center" style={{ color: "var(--text-4)" }}>{t("plan.empty.filtered")}</td></tr>
          )}
        </tbody>
      </TableCard>
    </div>
  );
}
