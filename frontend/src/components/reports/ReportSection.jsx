// One section of «Hisobotlar» — its blocks, in the order the server folded
// them. TWO block shapes and no third:
//
//   periods — a figure per row, the months across (TopSim's own reading:
//             the picked month last and emphasised, so a number is always
//             read against where it came from);
//   units   — a brigadir per row, describing the PICKED month alone.
//
// Every cell is printed by `fmtCell` and nothing else, and «—» means the
// platform has no answer — never a 0 somebody could read as «none».
import TableCard, { Th } from "../ui/DataTable";
import { DASH, fmtCell, fmtDelta, deltaTone, rowLabel, colLabel, monthLabel, fill, useRT }
  from "./reportsUtil";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";

const TONE = {
  good: "var(--status-ok)",
  bad: "var(--status-bad)",
};

function DeltaChip({ row, T }) {
  // A TOTAL over a month still running is not comparable with a whole month —
  // the server withholds its delta and says so (`no_delta`), and the cell
  // carries that reason rather than leaving a silent gap where every other
  // row has a change.
  if (row.no_delta === "partial") {
    return <span className="ml-2 text-[11px]" style={{ color: "var(--text-4)" }}
      title={T.noDeltaPartial}>·</span>;
  }
  const txt = fmtDelta(row.delta, row.fmt);
  if (!txt) return null;
  const tone = deltaTone(`${row.section || ""}.${row.key.split(".").pop()}`, row.delta);
  return (
    <span className="ml-2 text-[11px] font-medium"
      style={{ color: tone ? TONE[tone] : "var(--text-3)" }}>{txt}</span>
  );
}

/** A month's column label — its name, plus the days it actually covers while
 *  it is still running, so a shorter column is never read as a fall. */
function colMonth(m, T, t) {
  const name = monthLabel(m.ym, t);
  if (!m.partial) return name;
  const day = (iso) => Number(String(iso).slice(8, 10));
  return `${name} · ${fill(T.partialDays, { a: day(m.from), b: day(m.to) })}`;
}

function PeriodsBlock({ block, months, T, t, caption }) {
  const last = months.length - 1;
  return (
    <TableCard title={caption} maxHeight="none">
      <thead>
        <tr>
          <Th label={T.caps.figure} cls="min-w-[180px]" />
          {months.map((m, i) => (
            <Th key={m.ym} align="right"
              label={colMonth(m, T, t)}
              hint={m.partial ? T.partial : undefined}
              cls={i === last ? "font-bold" : ""} />
          ))}
        </tr>
      </thead>
      <tbody>
        {block.rows.map((r) => (
          <tr key={r.key}>
            <td className="px-3 py-2" style={{ color: "var(--text-2)" }}>
              {rowLabel(r, T, t)}
            </td>
            {r.values.map((v, i) => (
              <td key={i} className="px-3 py-2 text-right tabular-nums"
                style={{
                  color: v === null || v === undefined ? "var(--text-4)" : "var(--text-1)",
                  fontWeight: i === last && (r.bold || r.delta != null) ? 600 : 400,
                  background: i === last ? "var(--bg-inner)" : undefined,
                }}>
                {fmtCell(v, r.fmt)}
                {i === last && <DeltaChip row={r} T={T} />}
              </td>
            ))}
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
              cls={i === 0 ? "min-w-[160px]" : ""} />
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
