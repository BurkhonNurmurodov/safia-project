import { useMemo, useState } from "react";
import { Package, ChevronRight } from "lucide-react";
import TableCard, { Th } from "../ui/DataTable";
import SearchInput from "../ui/SearchInput";
import SegmentedToggle from "../ui/SegmentedToggle";
import Pagination from "../ui/Pagination";
import { useTranslit } from "../../utils/transliterate";
import { latinFold } from "../../utils/latinCode";
import { usePlanSort, sortRows, num } from "../plan/planSort";
import { FulfilChip, DaysShort } from "../plan/planTable";
import DayStrip from "../plan/DayStrip";
import OntimeLegend from "./OntimeLegend";
import { WaveChip } from "./OntimeOverview";
import { useOT, fill, ratio, toneOf, okEdge, waveRatio, fmtQty, dayStats, useGroupName } from "./ontimeUtil";

const PAGE = 50;

// «Mahsulotlar» — every product ordered in the period: how much was ordered,
// how much was produced in its wave's window, how much was late, on how many
// days it fell below the green edge, and a strip of its days. Opens on the
// largest late quantity — the product that cost the stores most. A row opens
// the product's working day by day (OntimeProductModal).
export default function OntimeProducts({ data, onProduct, show, setShow }) {
  const T = useOT();
  const { tx, lang } = useTranslit();
  const gn = useGroupName();
  const [q, setQ] = useState("");
  const [sort, onSort] = usePlanSort("ontime_prod_sort", { key: "late", dir: "desc" });
  const [pageState, setPageState] = useState({ page: 1, sig: "" });
  const ok = okEdge();

  const rows = useMemo(() => (data.products || []).filter((p) => p.demand > 0).map((p) => ({
    ...p,
    r: ratio(p.ontime, p.demand),
    st: dayStats(p.daily),
    hay: latinFold([p.name, tx(p.name), p.material, p.grp, gn(p.grp)].join(" ")),
  })), [data.products, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => ({
    all: rows.length,
    late: rows.filter((p) => p.late > 1e-6).length,
    zero: rows.filter((p) => p.ontime <= 1e-6).length,
  }), [rows]);

  const shown = useMemo(() => {
    const needle = latinFold(q.trim());
    let list = rows;
    if (show === "late") list = list.filter((p) => p.late > 1e-6);
    else if (show === "zero") list = list.filter((p) => p.ontime <= 1e-6);
    if (needle) list = list.filter((p) => p.hay.includes(needle));
    return sortRows(list, sort, (p, k) => {
      if (k === "name") return tx(p.name) || p.material;
      if (k === "grp") return gn(p.grp) || "";
      if (k === "r") return p.r;
      if (k === "days") return p.st.counted ? p.st.short / p.st.counted : null;
      return p[k];
    });
  }, [rows, show, q, sort, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const pageCount = Math.max(1, Math.ceil(shown.length / PAGE));
  const sig = `${show}|${q}|${sort.key}|${sort.dir}|${data.date_from}|${data.date_to}|${shown.length}`;
  const page = pageState.sig === sig ? Math.min(pageState.page, pageCount) : 1;
  const setPage = (p) => setPageState({ page: p, sig });
  const slice = shown.slice((page - 1) * PAGE, page * PAGE);
  const stripLabels = { nf: T.stripNone, np: T.stripNone, none: T.stripNone, aria: T.colStrip };
  const open = (p) => onProduct(p.material);

  const waves = (p) => {
    const e = Object.entries(p.waves || {});
    if (e.length < 2) return <span style={{ color: "var(--text-4)" }}>—</span>;
    return (
      <span className="inline-flex items-center gap-2">
        {e.map(([w, v]) => (
          <WaveChip key={w} w={w} r={waveRatio(v)} T={T}
            title={`${fill(T.waveN, { n: w })}: ${fmtQty(v[1])} / ${fmtQty(v[0])} ${T.pcs}`} />
        ))}
      </span>
    );
  };

  const nameCell = (p) => (
    <button type="button" onClick={() => open(p)}
      className="group flex items-center gap-1.5 min-w-0 max-w-[24rem] text-left rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand)]"
      title={`${tx(p.name)} · ${p.material}`}>
      <span className="truncate font-medium group-hover:underline" style={{ color: "var(--text-1)" }}>{tx(p.name) || p.material}</span>
      <span className="flex-shrink-0 font-mono text-[11px]" style={{ color: "var(--text-4)" }}>{p.material}</span>
    </button>
  );

  const toolbar = (
    <>
      <SearchInput value={q} onChange={setQ} placeholder={T.searchProducts} className="w-full sm:w-80" />
      <SegmentedToggle value={show} onChange={setShow}
        options={[
          ["all", `${T.showAll} · ${counts.all}`],
          ["late", `${T.showLate} · ${counts.late}`],
          { value: "zero", label: `${T.showZero} · ${counts.zero}`, title: T.showZeroHint },
        ]} />
    </>
  );

  const mobile = (
    <div className="divide-y" style={{ borderColor: "var(--border)" }}>
      {slice.map((p) => (
        <button type="button" key={p.material} onClick={() => open(p)}
          className="w-full text-left px-4 py-3 space-y-1.5 active:bg-[var(--bg-inner)]" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-2">
            <span className="flex-1 min-w-0 truncate text-sm font-medium" style={{ color: "var(--text-1)" }}>{tx(p.name) || p.material}</span>
            <FulfilChip r={p.r} toneFn={toneOf} />
            <ChevronRight size={14} style={{ color: "var(--text-4)" }} />
          </div>
          <div className="flex items-center justify-between gap-2 text-[11px]" style={{ color: "var(--text-3)" }}>
            <span className="truncate">{gn(p.grp)}</span>
            <span className="tabular-nums">{fmtQty(p.ontime)} / {fmtQty(p.demand)} {T.pcs}</span>
          </div>
          <div className="flex items-center justify-between gap-2 text-[11px]" style={{ color: "var(--text-3)" }}>
            <span>{T.colLate}: <b style={{ color: p.late > 0 ? "var(--text-1)" : "var(--text-4)" }}>{fmtQty(p.late)} {T.pcs}</b></span>
            <span>{T.colDays}: <DaysShort short={p.st.short} of={p.st.counted} /></span>
          </div>
          <DayStrip daily={p.daily} days={data.days} labels={stripLabels} tone={toneOf} />
        </button>
      ))}
      {!slice.length && <p className="px-4 py-8 text-center text-xs" style={{ color: "var(--text-4)" }}>{T.noMatch}</p>}
    </div>
  );

  return (
    <div className="space-y-3">
      <TableCard
        icon={Package}
        title={T.tabProducts}
        subtitle={T.productsSub}
        right={<span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{fill(T.rows, { n: shown.length })}</span>}
        toolbar={toolbar}
        mobile={mobile}
        minWidth={1180}
      >
        <thead>
          <tr>
            <Th label={T.colProduct} k="name" sort={sort} onSort={onSort} />
            <Th label={T.colGroup} k="grp" sort={sort} onSort={onSort} />
            <Th label={T.colOrdered} k="demand" sort={sort} onSort={onSort} align="right" />
            <Th label={T.colOntime} k="ontime" sort={sort} onSort={onSort} align="right" />
            <Th label={T.colLate} k="late" sort={sort} onSort={onSort} align="right" />
            <Th label={T.colPct} k="r" sort={sort} onSort={onSort} align="center" />
            <Th label={T.colWaves} hint={T.colWavesHint} />
            <Th label={T.colDays} k="days" sort={sort} onSort={onSort} align="center" hint={fill(T.colDaysHint, { ok })} />
            <Th label={T.colStrip} hint={T.colStripHint} cls="w-[180px]" />
          </tr>
        </thead>
        <tbody>
          {slice.map((p) => (
            <tr key={p.material} className="cursor-pointer" onClick={(e) => { if (!e.target.closest("button")) open(p); }}>
              <td className="px-3 py-2">{nameCell(p)}</td>
              <td className="px-3 py-2 max-w-[12rem] truncate" title={gn(p.grp)}>{gn(p.grp)}</td>
              <td className={num}>{fmtQty(p.demand)}</td>
              <td className={num}>{fmtQty(p.ontime)}</td>
              <td className={`${num} font-semibold`} style={{ color: p.late > 1e-6 ? "var(--text-1)" : "var(--text-4)" }}>
                {p.late > 1e-6 ? fmtQty(p.late) : "—"}
              </td>
              <td className="px-3 py-2 text-center"><FulfilChip r={p.r} toneFn={toneOf} /></td>
              <td className="px-3 py-2 whitespace-nowrap">{waves(p)}</td>
              <td className="px-3 py-2 text-center"><DaysShort short={p.st.short} of={p.st.counted} /></td>
              <td className="px-3 py-2 w-[180px]"><DayStrip daily={p.daily} days={data.days} labels={stripLabels} tone={toneOf} /></td>
            </tr>
          ))}
          {!slice.length && (
            <tr><td colSpan={9} className="px-3 py-8 text-center" style={{ color: "var(--text-4)" }}>{T.noMatch}</td></tr>
          )}
        </tbody>
      </TableCard>
      <Pagination page={page} pageCount={pageCount} total={shown.length} pageSize={PAGE} onPage={setPage} />
      <OntimeLegend />
    </div>
  );
}
