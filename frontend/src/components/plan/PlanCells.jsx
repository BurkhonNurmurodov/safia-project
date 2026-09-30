import { useMemo, useState } from "react";
import { Boxes } from "lucide-react";
import TableCard, { Th } from "../ui/DataTable";
import SearchInput from "../ui/SearchInput";
import CellLink from "../ui/CellLink";
import GroupBadge from "../ui/GroupBadge";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { latinFold } from "../../utils/latinCode";
import { surnameInitial } from "../../utils/personName";
import { activeBands } from "../../utils/statusBands";
import { ratio, fmtHours, dayStats, fill } from "./planUtil";
import { usePlanSort, sortRows, num } from "./planSort";
import { FulfilChip, DaysShort } from "./planTable";
import DayStrip from "./DayStrip";
import PlanLegend from "./PlanLegend";

// «Yacheykalar» — each production cell's part of its work centre's plan (its
// own group's lines, and an even share of the lines no group letter claims —
// the split every per-cell page on the platform makes), how much of it was
// made and on how many days it fell short. Lines at a work centre no cell
// stands at are one «Yacheykasiz» row per brigadir, never dropped: that is
// plan somebody owes and no cell answers for.
export default function PlanCells({ data, unitName, cellById, productById }) {
  const { t } = useLang();
  const { tl, tx, lang } = useTranslit();
  const [q, setQ] = useState("");
  const [sort, onSort] = usePlanSort("plan_cell_sort", { key: "short", dir: "desc" });
  const { ok } = activeBands().compl;

  const rows = useMemo(() => (data.cell_rows || []).map((c) => {
    const cell = c.cell_id != null ? cellById.get(c.cell_id) : null;
    const mid = cell ? cell.manager_id : c.manager_id;
    const unit = unitName(mid);
    const worst = c.worst != null ? productById.get(c.worst) : null;
    const st = dayStats(c.daily);
    return {
      ...c, cell, unit, worst, st,
      r: ratio(c.actual, c.plan),
      hay: latinFold([cell?.code, cell?.sap, cell?.leader, tl(cell?.leader), tl(unit), worst?.name].join(" ")),
    };
  }), [data.cell_rows, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(() => {
    const needle = latinFold(q.trim());
    const list = needle ? rows.filter((c) => c.hay.includes(needle)) : rows;
    return sortRows(list, sort, (c, k) => {
      if (k === "code") return c.cell?.code || "~";
      if (k === "leader") return c.cell?.leader ? tl(c.cell.leader) : null;
      if (k === "unit") return tl(c.unit) || "";
      if (k === "r") return c.r;
      if (k === "days") return c.st.counted ? c.st.short / c.st.counted : null;
      return c[k];
    });
  }, [rows, q, sort, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const stripLabels = { nf: t("plan.legend.nf"), np: t("plan.legend.np"), none: t("plan.legend.none"), aria: t("plan.col.strip") };

  const cellName = (c) => (c.cell
    ? (
      <span className="inline-flex items-center gap-1.5">
        <CellLink id={c.cell.id} className="font-mono font-semibold">{c.cell.code}</CellLink>
        <GroupBadge group={c.cell.group} />
        {c.cell.sap && <span className="text-[11px] font-mono" style={{ color: "var(--text-4)" }}>{c.cell.sap}</span>}
      </span>
    )
    : <span className="text-[11px] font-medium" style={{ color: "var(--text-3)" }} title={t("plan.noCellHint")}>{t("plan.noCell")}</span>);

  const worstOf = (c) => (c.worst
    ? <span className="block truncate max-w-[16rem]" title={tx(c.worst.name)}>{tx(c.worst.name)}</span>
    : <span style={{ color: "var(--text-4)" }}>—</span>);

  const mobile = (
    <div>
      {shown.map((c) => (
        <div key={c.key} className="px-4 py-3 space-y-1.5" style={{ borderTop: "1px solid var(--border)" }}>
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">{cellName(c)}</div>
            <FulfilChip r={c.r} />
          </div>
          <div className="flex items-center justify-between gap-2 text-[11px]" style={{ color: "var(--text-3)" }}>
            <span className="truncate">{c.cell?.leader ? surnameInitial(tl(c.cell.leader)) : t("plan.noLeader")} · {surnameInitial(tl(c.unit))}</span>
            <span className="tabular-nums">{t("plan.kpi.shortfall")}: <b style={{ color: "var(--text-1)" }}>{fmtHours(c.short)} {t("plan.h")}</b></span>
          </div>
          <DayStrip daily={c.daily} days={data.days} labels={stripLabels} />
        </div>
      ))}
      {!shown.length && <p className="px-4 py-8 text-center text-xs" style={{ color: "var(--text-4)" }}>{t("plan.empty.filtered")}</p>}
    </div>
  );

  return (
    <div className="space-y-3">
      <TableCard
        icon={Boxes}
        title={t("plan.tab.cells")}
        subtitle={t("plan.cells.sub")}
        right={<span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{fill(t("plan.rows"), { n: shown.length })}</span>}
        toolbar={<SearchInput value={q} onChange={setQ} placeholder={t("plan.search.cells")} className="w-full sm:w-72" />}
        mobile={mobile}
        minWidth={1100}
      >
        <thead>
          <tr>
            <Th label={t("plan.col.cell")} k="code" sort={sort} onSort={onSort} />
            <Th label={t("plan.col.leader")} k="leader" sort={sort} onSort={onSort} />
            <Th label={t("plan.col.brigadir")} k="unit" sort={sort} onSort={onSort} />
            <Th label={t("plan.col.planH")} k="plan" sort={sort} onSort={onSort} align="right" />
            <Th label={t("plan.col.factH")} k="actual" sort={sort} onSort={onSort} align="right" />
            <Th label={t("plan.col.fulfil")} k="r" sort={sort} onSort={onSort} align="center" hint={t("plan.col.fulfilHint")} />
            <Th label={t("plan.col.shortH")} k="short" sort={sort} onSort={onSort} align="right" hint={t("plan.col.shortHHint")} />
            <Th label={t("plan.col.days")} k="days" sort={sort} onSort={onSort} align="center" hint={fill(t("plan.col.daysHint"), { ok })} />
            <Th label={t("plan.col.strip")} hint={t("plan.col.stripHint")} cls="w-[180px]" />
            <Th label={t("plan.col.worst")} hint={t("plan.col.worstHint")} />
          </tr>
        </thead>
        <tbody>
          {shown.map((c) => (
            <tr key={c.key}>
              <td className="px-3 py-2">{cellName(c)}</td>
              <td className="px-3 py-2 max-w-[12rem] truncate" title={c.cell?.leader ? tl(c.cell.leader) : undefined}>
                {c.cell?.leader ? surnameInitial(tl(c.cell.leader)) : <span style={{ color: "var(--text-4)" }}>{c.cell ? t("plan.noLeader") : "—"}</span>}
              </td>
              <td className="px-3 py-2 max-w-[12rem] truncate" title={tl(c.unit)}>{surnameInitial(tl(c.unit))}</td>
              <td className={num}>{fmtHours(c.plan)}</td>
              <td className={num}>{fmtHours(c.actual)}</td>
              <td className="px-3 py-2 text-center"><FulfilChip r={c.r} /></td>
              <td className={`${num} font-semibold`} style={{ color: c.short > 0 ? "var(--text-1)" : "var(--text-4)" }}>{c.short > 0 ? fmtHours(c.short) : "—"}</td>
              <td className="px-3 py-2 text-center">
                <DaysShort short={c.st.short} of={c.st.counted} title={c.st.nf ? fill(t("plan.nfDays"), { n: c.st.nf }) : undefined} />
              </td>
              <td className="px-3 py-2 w-[180px]"><DayStrip daily={c.daily} days={data.days} labels={stripLabels} /></td>
              <td className="px-3 py-2">{worstOf(c)}</td>
            </tr>
          ))}
          {!shown.length && (
            <tr><td colSpan={10} className="px-3 py-8 text-center" style={{ color: "var(--text-4)" }}>{t("plan.empty.filtered")}</td></tr>
          )}
        </tbody>
      </TableCard>
      <PlanLegend />
    </div>
  );
}
