// One section of «Hisobotlar» — its blocks, in the order the server folded
// them. TWO block shapes and no third:
//
//   periods — a figure per row, its unit of measurement beside it, then the
//             previous month and the picked one (TopSim's own reading: the
//             picked month last and emphasised, so a number is always read
//             against where it came from);
//   units   — a brigadir per row, describing the PICKED month alone.
//
// Every cell is printed by `fmtCell` and nothing else, and «—» means the
// platform has no answer — never a 0 somebody could read as «none».
//
// Number columns are NARROW and fixed (TopSim's layout, the operator
// 2026-11-02): the figure's name takes whatever the card has left, so a
// figure sits beside its neighbours instead of across a wide gap. Fixed, not
// shrink-to-fit, so the months line up from one card to the next; a value
// wider than its column still widens it.
import TableCard, { Th } from "../ui/DataTable";
import { DASH, fmtCell, fmtDelta, deltaTone, rowLabel, colLabel, uomOf, monthLabel, fill, useRT }
  from "./reportsUtil";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";

const TONE = {
  good: "var(--status-ok)",
  bad: "var(--status-bad)",
};

function DeltaCell({ row, T }) {
  // A TOTAL over a month still running is not comparable with a whole month —
  // the server withholds its delta and says so (`no_delta`), and the cell
  // carries that reason rather than leaving a silent gap where every other
  // row has a change.
  if (row.no_delta === "partial") {
    return <span className="text-xs" style={{ color: "var(--text-3)" }}
      title={T.noDeltaPartial}>·</span>;
  }
  // «—» means no answer; a change of exactly nothing is a 0, said plainly.
  if (row.delta != null && Number(row.delta) === 0) {
    return <span className="text-xs" style={{ color: "var(--text-3)" }}>{row.fmt === "pct" ? "0 p.p." : "0"}</span>;
  }
  const txt = fmtDelta(row.delta, row.fmt);
  if (!txt) return <span style={{ color: "var(--text-4)" }}>{DASH}</span>;
  const tone = deltaTone(`${row.section || ""}.${row.key.split(".").pop()}`, row.delta);
  return (
    <span className="text-xs font-medium"
      style={{ color: tone ? TONE[tone] : "var(--text-2)" }}>{txt}</span>
  );
}

const NUM_W = "w-[100px]";  // a month or the change
const UOM_W = "w-[88px]";   // the unit of measurement
const UNIT_NUM_W = "w-[88px] whitespace-normal!";  // a brigadir table's figure

/** A month's column label on two lines — the month, then its year — so the
 *  column stays as narrow as its figures. While the month is still running the
 *  second line also names the days it covers, so a shorter column is never
 *  read as a fall. */
function MonthHead({ m, T, t }) {
  const [y, mo] = String(m.ym).split("-").map(Number);
  const name = mo ? t(`cal.m${mo - 1}`) : monthLabel(m.ym, t);
  const day = (iso) => Number(String(iso).slice(8, 10));
  const days = m.partial ? ` · ${fill(T.partialDays, { a: day(m.from), b: day(m.to) })}` : "";
  return (
    <span className="flex flex-col items-end leading-tight">
      <span>{name}</span>
      {mo ? <span className="font-normal">{y}{days}</span> : null}
    </span>
  );
}

function PeriodsBlock({ block, months, T, t, caption }) {
  const last = months.length - 1;
  // The change against the month before gets a column of its own, so the
  // picked month's figures line up; only where the server sends one.
  const hasDelta = block.rows.some((r) => r.delta != null || r.no_delta);
  return (
    <TableCard title={caption} maxHeight="none">
      <thead>
        <tr>
          <Th label={T.caps.figure} cls="min-w-[180px]" />
          <Th label={T.colUnit} cls={UOM_W} />
          {months.map((m) => (
            <Th key={m.ym} align="right" cls={NUM_W}
              label={<MonthHead m={m} T={T} t={t} />}
              hint={m.partial ? T.partial : undefined} />
          ))}
          {hasDelta && <Th label={T.colDelta} align="right" cls={NUM_W} hint={T.prevLabel} />}
        </tr>
      </thead>
      <tbody>
        {block.rows.map((r) => (
          <tr key={r.key}>
            <td className="px-3 py-2"
              style={{ color: "var(--text-1)", fontWeight: r.bold ? 600 : 500 }}>
              {rowLabel(r, T, t)}
            </td>
            <td className="px-3 py-2 whitespace-nowrap text-xs" style={{ color: "var(--text-3)" }}>
              {uomOf(r, T)}
            </td>
            {r.values.map((v, i) => (
              <td key={i} className="px-3 py-2 text-right tabular-nums"
                style={{
                  color: v === null || v === undefined ? "var(--text-4)" : "var(--text-1)",
                  fontWeight: i === last ? 500 : 400,
                  background: i === last ? "var(--bg-inner)" : undefined,
                }}>
                {fmtCell(v, r.fmt, true)}
              </td>
            ))}
            {hasDelta && (
              <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap"><DeltaCell row={r} T={T} /></td>
            )}
          </tr>
        ))}
      </tbody>
    </TableCard>
  );
}

function UnitsBlock({ block, T, caption, tl }) {
  const cols = block.columns || [];
  return (
    <TableCard title={caption} maxHeight="none" right={
      <span className="text-[11px]" style={{ color: "var(--text-3)" }}>
        {block.rows.length}
      </span>
    }>
      <thead>
        <tr>
          {cols.map((c, i) => (
            <Th key={c.key} label={colLabel(c, T)} align={i === 0 ? "left" : "right"}
              cls={i === 0 ? "min-w-[160px]" : UNIT_NUM_W} />
          ))}
        </tr>
      </thead>
      <tbody>
        {block.rows.map((r) => (
          <tr key={r.key}>
            {r.cells.map((v, i) => (
              <td key={i}
                className={`px-3 py-2 ${i === 0 ? "" : "text-right tabular-nums"}`}
                style={{
                  color: v === null || v === undefined ? "var(--text-4)" : "var(--text-1)",
                  maxWidth: i === 0 ? 240 : undefined,
                  overflow: i === 0 ? "hidden" : undefined,
                  textOverflow: i === 0 ? "ellipsis" : undefined,
                }}
                title={i === 0 && v ? tl(String(v)) : undefined}>
                {i === 0 ? (v ? tl(String(v)) : DASH) : fmtCell(v, cols[i]?.fmt)}
              </td>
            ))}
          </tr>
        ))}
        {!block.rows.length && (
          <tr>
            <td colSpan={cols.length} className="px-3 py-6 text-center"
              style={{ color: "var(--text-3)" }}>{T.noRows}</td>
          </tr>
        )}
      </tbody>
    </TableCard>
  );
}

export default function ReportSection({ section, months }) {
  const T = useRT();
  const { t } = useLang();
  const { tl } = useTranslit();
  return (
    <div className="space-y-4">
      {(section.blocks || []).map((b) => {
        const caption = T.caps[`${section.key}.${b.key}`] || T.caps[b.key] || "";
        return b.kind === "periods"
          ? <PeriodsBlock key={b.key} block={b} months={months} T={T} t={t} caption={caption} />
          : <UnitsBlock key={b.key} block={b} T={T} caption={caption} tl={tl} />;
      })}
    </div>
  );
}
