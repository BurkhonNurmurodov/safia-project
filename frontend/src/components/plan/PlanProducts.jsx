import { useMemo, useState } from "react";
import { Package, Split } from "lucide-react";
import TableCard, { Th } from "../ui/DataTable";
import SearchInput from "../ui/SearchInput";
import SegmentedToggle from "../ui/SegmentedToggle";
import Pagination from "../ui/Pagination";
import CellLink from "../ui/CellLink";
import GroupBadge from "../ui/GroupBadge";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { usePersistentState } from "../../hooks/usePersistentState";
import { latinFold } from "../../utils/latinCode";
import { surnameInitial } from "../../utils/personName";
import { activeBands } from "../../utils/statusBands";
import { ratio, pctOf, fmtQty, fmtHours, prodDayStats, fill } from "./planUtil";
import { usePlanSort, sortRows, num } from "./planSort";
import { FulfilChip, DaysShort } from "./planTable";
import DayStrip from "./DayStrip";
import PlanLegend from "./PlanLegend";

const PAGE = 50;

// «Mahsulotlar» — every catalog LINE (a product at its work centre, one
// operation of it — the «Pozitsiyalar» row of the Production page) that had a
// plan or a fact in the period: how much was planned and made, how much fell
// short, and on how many of its planned days. Opens on the largest shortfall
// in hours — the line that cost the most work — with a strip of its days
// beside it, so «usually short» is read off the row rather than guessed.
export default function PlanProducts({ data, unitName, cellById }) {
  const { t } = useLang();
  const { tl, tx, lang } = useTranslit();
  const [q, setQ] = useState("");
  const [show, setShow] = usePersistentState("plan_prod_show", "all");
  const [sort, onSort] = usePlanSort("plan_prod_sort", { key: "short", dir: "desc" });
  // The page resets whenever what is listed changes — held beside the listing
  // it was chosen for, so no effect has to chase it.
  const [pageState, setPageState] = useState({ page: 1, sig: "" });
  const { ok } = activeBands().compl;

  const rows = useMemo(() => (data.products || []).map((p) => {
    const st = prodDayStats(p.daily);
    const unit = unitName(p.manager_id);
    const cells = (p.cells || []).map((id) => cellById.get(id)).filter(Boolean);
    return {
      ...p, st, unit, cellList: cells,
      r: ratio(p.actual, p.plan),
      hay: latinFold([p.name, tx(p.name), p.code, p.wc, tl(unit), ...cells.map((c) => c.code)].join(" ")),
    };
  }), [data.products, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => {
    const c = { all: rows.length, short: 0, zero: 0, over: 0 };
    rows.forEach((p) => {
      if (p.plan > 0 && pctOf(p.r) < ok) c.short += 1;
      if (p.plan > 0 && p.actual <= 0) c.zero += 1;
      if ((p.plan > 0 && pctOf(p.r) > 100) || (p.plan <= 0 && p.actual > 0)) c.over += 1;
    });
    return c;
  }, [rows, ok]);

  const shown = useMemo(() => {
    const needle = latinFold(q.trim());
    let list = rows;
    if (show === "short") list = list.filter((p) => p.plan > 0 && pctOf(p.r) < ok);
    else if (show === "zero") list = list.filter((p) => p.plan > 0 && p.actual <= 0);
    else if (show === "over") list = list.filter((p) => (p.plan > 0 && pctOf(p.r) > 100) || (p.plan <= 0 && p.actual > 0));
    if (needle) list = list.filter((p) => p.hay.includes(needle));
    return sortRows(list, sort, (p, k) => {
      if (k === "name") return tx(p.name) || "";
      if (k === "unit") return tl(p.unit) || "";
      if (k === "r") return p.r;
      if (k === "days") return p.st.planned ? p.st.short / p.st.planned : null;
      return p[k];
    });
  }, [rows, show, q, sort, ok, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const pageCount = Math.max(1, Math.ceil(shown.length / PAGE));
  const sig = `${show}|${q}|${sort.key}|${sort.dir}|${data.date_from}|${data.date_to}|${shown.length}`;
  const page = pageState.sig === sig ? Math.min(pageState.page, pageCount) : 1;
  const setPage = (p) => setPageState({ page: p, sig });
  const slice = shown.slice((page - 1) * PAGE, page * PAGE);
  const stripLabels = { nf: t("plan.legend.nf"), np: t("plan.legend.np"), none: t("plan.legend.none"), aria: t("plan.col.strip") };

  const cellsOf = (p) => {
    if (!p.cellList.length) return <span style={{ color: "var(--text-4)" }} title={t("plan.noCellHint")}>—</span>;
    const first = p.cellList.slice(0, 2);
    return (
      <span className="inline-flex items-center gap-1.5">
        {first.map((c) => <CellLink key={c.id} id={c.id} title={c.leader ? tl(c.leader) : undefined}>{c.code}</CellLink>)}
        {p.cellList.length > 2 && <span style={{ color: "var(--text-4)" }}>+{p.cellList.length - 2}</span>}
        {p.n_cells > 1 && (
          <span className="inline-flex items-center gap-0.5 text-[10px] px-1 rounded" style={{ background: "var(--bg-inner)", color: "var(--text-3)" }}
            title={fill(t("plan.shared"), { n: p.n_cells })}>
            <Split size={10} />{p.n_cells}
          </span>
        )}
      </span>
    );
  };

  const productCell = (p) => (
    <div className="min-w-0">
      <div className="truncate font-medium max-w-[22rem]" title={tx(p.name)}>{tx(p.name) || "—"}</div>
      <div className="flex items-center gap-1.5 text-[11px] mt-0.5" style={{ color: "var(--text-4)" }}>
        {p.code && <span className="font-mono">{p.code}</span>}
        {p.wc && <span className="font-mono">· {p.wc}</span>}
        <GroupBadge group={p.group} />
        {p.share < 0.999 && <span title={t("plan.shareHint")}>· {fill(t("plan.shareOf"), { p: Math.round(p.share * 100) })}</span>}
      </div>
    </div>
  );

  const toolbar = (
    <>
      <SearchInput value={q} onChange={setQ} placeholder={t("plan.search.products")} className="w-full sm:w-80" />
      <SegmentedToggle value={show} onChange={setShow}
        options={[
          ["all", `${t("plan.show.all")} · ${counts.all}`],
          ["short", `${t("plan.show.short")} · ${counts.short}`],
          ["zero", `${t("plan.show.zero")} · ${counts.zero}`],
          ["over", `${t("plan.show.over")} · ${counts.over}`],
        ]} />
    </>
  );

  const mobile = (
    <div className="divide-y" style={{ borderColor: "var(--border)" }}>
      {slice.map((p) => (
        <div key={p.id} className="px-4 py-3 space-y-1.5" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">{productCell(p)}</div>
            <FulfilChip r={p.r} title={p.plan <= 0 ? t("plan.unplanned") : undefined} />
          </div>
          <div className="flex items-center justify-between gap-2 text-[11px]" style={{ color: "var(--text-3)" }}>
            <span className="truncate">{surnameInitial(tl(p.unit))}</span>
            <span className="tabular-nums">{fmtQty(p.actual_qty)} / {fmtQty(p.plan_qty)} {t("plan.pcs")}</span>
          </div>
          <div className="flex items-center justify-between gap-2 text-[11px]" style={{ color: "var(--text-3)" }}>
            <span>{t("plan.kpi.shortfall")}: <b style={{ color: "var(--text-1)" }}>{fmtHours(p.short)} {t("plan.h")}</b></span>
            <span>{t("plan.col.days")}: <DaysShort short={p.st.short} of={p.st.planned} /></span>
          </div>
          <DayStrip daily={p.daily} days={data.days} labels={stripLabels} />
        </div>
      ))}
      {!slice.length && <p className="px-4 py-8 text-center text-xs" style={{ color: "var(--text-4)" }}>{t("plan.empty.filtered")}</p>}
    </div>
  );

  return (
    <div className="space-y-3">
      <TableCard
        icon={Package}
        title={t("plan.tab.products")}
        subtitle={fill(t("plan.products.sub"), { ok })}
        right={<span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{fill(t("plan.rows"), { n: shown.length })}</span>}
        toolbar={toolbar}
        mobile={mobile}
        minWidth={1180}
      >
        <thead>
          <tr>
            <Th label={t("plan.col.product")} k="name" sort={sort} onSort={onSort} />
            <Th label={t("plan.col.brigadir")} k="unit" sort={sort} onSort={onSort} />
            <Th label={t("plan.col.cell")} hint={t("plan.col.cellHint")} />
            <Th label={t("plan.col.planQty")} k="plan_qty" sort={sort} onSort={onSort} align="right" />
            <Th label={t("plan.col.factQty")} k="actual_qty" sort={sort} onSort={onSort} align="right" />
            <Th label={t("plan.col.fulfil")} k="r" sort={sort} onSort={onSort} align="center" hint={t("plan.col.fulfilHint")} />
            <Th label={t("plan.col.shortQty")} k="short_qty" sort={sort} onSort={onSort} align="right" hint={t("plan.col.shortQtyHint")} />
            <Th label={t("plan.col.shortH")} k="short" sort={sort} onSort={onSort} align="right" hint={t("plan.col.shortHHint")} />
            <Th label={t("plan.col.days")} k="days" sort={sort} onSort={onSort} align="center" hint={fill(t("plan.col.daysHint"), { ok })} />
            <Th label={t("plan.col.strip")} hint={t("plan.col.stripHint")} cls="w-[180px]" />
          </tr>
        </thead>
        <tbody>
          {slice.map((p) => (
            <tr key={p.id}>
              <td className="px-3 py-2">{productCell(p)}</td>
              <td className="px-3 py-2 max-w-[12rem] truncate" title={tl(p.unit)}>{surnameInitial(tl(p.unit))}</td>
              <td className="px-3 py-2">{cellsOf(p)}</td>
              <td className={num}>{fmtQty(p.plan_qty)}</td>
              <td className={num}>{fmtQty(p.actual_qty)}</td>
              <td className="px-3 py-2 text-center">
                {p.plan > 0
                  ? <FulfilChip r={p.r} />
                  : <span className="text-[11px]" style={{ color: "var(--text-3)" }} title={t("plan.unplannedHint")}>{t("plan.unplanned")}</span>}
              </td>
              <td className={num} style={{ color: p.short_qty > 0 ? "var(--text-1)" : "var(--text-4)" }}>{p.short_qty > 0 ? fmtQty(p.short_qty) : "—"}</td>
              <td className={`${num} font-semibold`} style={{ color: p.short > 0 ? "var(--text-1)" : "var(--text-4)" }}>{p.short > 0 ? fmtHours(p.short) : "—"}</td>
              <td className="px-3 py-2 text-center">
                <DaysShort short={p.st.short} of={p.st.planned}
                  title={p.st.zero ? fill(t("plan.zeroDays"), { n: p.st.zero }) : undefined} />
              </td>
              <td className="px-3 py-2 w-[180px]"><DayStrip daily={p.daily} days={data.days} labels={stripLabels} /></td>
            </tr>
          ))}
          {!slice.length && (
            <tr><td colSpan={10} className="px-3 py-8 text-center" style={{ color: "var(--text-4)" }}>{t("plan.empty.filtered")}</td></tr>
          )}
        </tbody>
      </TableCard>
      <Pagination page={page} pageCount={pageCount} total={shown.length} pageSize={PAGE} onPage={setPage} />
      <PlanLegend />
    </div>
  );
}
