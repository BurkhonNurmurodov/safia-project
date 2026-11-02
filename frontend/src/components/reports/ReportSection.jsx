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
import KpiDeltaCard from "../ui/KpiDeltaCard";
import { DASH, fmtCell, fmtDelta, deltaTone, rowLabel, colLabel, monthLabel, fill, useRT }
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

/** The summary's headline — each figure set large with the month before it
 *  and the change, the platform's own KPI card. The same rows the table held
 *  (and the document still prints), drawn as figures: a reader wants these
 *  before any table. No sparkline — three months make a line that says
 *  nothing the two figures beside it do not. */
function HeadlineTiles({ block, months, T, t }) {
  const last = months.length - 1;
  const prevYm = months[last - 1]?.ym;
  return (
    // Two to a row until the screen is wide enough for a whole sum («111 920
    // 000 so'm») and its change to sit on one line — four at 1440 broke both.
    <div className="grid grid-cols-2 2xl:grid-cols-4 gap-3">
      {block.rows.map((r) => {
        const cur = r.values[last];
        const prev = last > 0 ? r.values[last - 1] : null;
        const tone = deltaTone(`${r.section || ""}.${r.key.split(".").pop()}`, r.delta);
        const up = Number(r.delta) > 0;
        return (
          <KpiDeltaCard key={r.key} label={rowLabel(r, T, t)}
            value={fmtCell(cur, r.fmt)}
            prevValue={fmtCell(prev, r.fmt)}
            prevLabel={prevYm ? `${monthLabel(prevYm, t)}:` : ""}
            delta={tone ? Number(r.delta) || 0 : 0}
            deltaText={fmtDelta(r.delta, r.fmt)}
            higherIsBetter={tone ? (tone === "good") === up : true}
            sub={r.no_delta === "partial" ? T.partial : null} />
        );
      })}
    </div>
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
  // The change against the month before gets a column of its own, so the
  // picked month's figures line up; only where the server sends one.
  const hasDelta = block.rows.some((r) => r.delta != null || r.no_delta);
  return (
    <TableCard title={caption} maxHeight="none">
      <thead>
        <tr>
          <Th label={T.caps.figure} cls="min-w-[180px]" />
          {months.map((m) => (
            <Th key={m.ym} align="right"
              label={colMonth(m, T, t)}
              hint={m.partial ? T.partial : undefined} />
          ))}
          {hasDelta && <Th label={T.colDelta} align="right" hint={T.prevLabel} />}
        </tr>
      </thead>
      <tbody>
        {block.rows.map((r) => (
          <tr key={r.key}>
            <td className="px-3 py-2" style={{ color: r.bold ? "var(--text-1)" : "var(--text-2)" }}>
              {rowLabel(r, T, t)}
            </td>
            {r.values.map((v, i) => (
              <td key={i} className="px-3 py-2 text-right tabular-nums"
                style={{
                  color: v === null || v === undefined ? "var(--text-4)" : "var(--text-1)",
                  fontWeight: i === last ? 500 : 400,
                  background: i === last ? "var(--bg-inner)" : undefined,
                }}>
                {fmtCell(v, r.fmt)}
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
        if (section.key === "summary" && b.key === "headline" && b.kind === "periods") {
          return <HeadlineTiles key={b.key} block={b} months={months} T={T} t={t} />;
        }
        return b.kind === "periods"
          ? <PeriodsBlock key={b.key} block={b} months={months} T={T} t={t} caption={caption} />
          : <UnitsBlock key={b.key} block={b} T={T} caption={caption} tl={tl} />;
      })}
    </div>
  );
}
