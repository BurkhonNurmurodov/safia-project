// One section of «Hisobotlar» — its blocks, in the order the server folded
// them. ONE block shape: a figure per row, its unit of measurement beside it,
// then the previous month and the picked one (TopSim's own reading: the
// picked month last and emphasised, so a number is always read against where
// it came from). No table lists brigadirs (the operator, 2026-11-02: «we
// don't need any data by supervisors») — a block of any other kind is skipped.
//
// Every cell is printed by `fmtCell` and nothing else, and «—» means the
// platform has no answer — never a 0 somebody could read as «none».
//
// Number columns are NARROW and fixed (TopSim's layout, the operator
// 2026-11-02): the figure's name takes whatever the card has left, so a
// figure sits beside its neighbours instead of across a wide gap. Fixed, not
// shrink-to-fit, so the months line up from one card to the next; a value
// wider than its column still widens it.
//
// The reader may put a table's figures in any order (the operator,
// 2026-11-02): «Tartib» in the card's header arms a handle on every row — drag
// it, or focus it and press ↑ ↓. The order is saved per profile
// (`useRowOrder`) and the download follows it. Unarmed, the table carries no
// handles, so a report reads as a report.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowUpDown, Check, GripVertical, RotateCcw } from "lucide-react";
import TableCard, { Th } from "../ui/DataTable";
import Button from "../ui/Button";
import { ordered } from "./useRowOrder";
import { DASH, fmtCell, fmtDelta, deltaTone, rowLabel, uomOf, monthLabel, fill, useRT }
  from "./reportsUtil";
import { useLang } from "../../context/LangContext";

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

const sameKeys = (a, b) => a.length === b.length && a.every((k, i) => k === b[i]);

function PeriodsBlock({ block, months, T, t, caption, saved, onOrder }) {
  const last = months.length - 1;
  // The change against the month before gets a column of its own, so the
  // picked month's figures line up; only where the server sends one.
  const hasDelta = block.rows.some((r) => r.delta != null || r.no_delta);

  const serverKeys = block.rows.map((r) => r.key);
  const shown = ordered(block.rows, saved);
  const custom = !sameKeys(shown.map((r) => r.key), serverKeys);
  const [arranging, setArranging] = useState(false);
  // While a row is held: its key and the order as it stands under the pointer.
  // Nothing is saved until it is let go.
  const [drag, setDrag] = useState(null);
  const dragRef = useRef(null);
  dragRef.current = drag;
  const bodyRef = useRef(null);
  const grips = useRef({});
  const [focusKey, setFocusKey] = useState(null);
  const byKey = new Map(block.rows.map((r) => [r.key, r]));
  const rows = drag ? drag.keys.map((k) => byKey.get(k)).filter(Boolean) : shown;

  // The server's own order is stored as NO entry, so «Asl tartib» and a drag
  // back to where everything started leave nothing behind.
  const commit = (keys, now) => onOrder(sameKeys(keys, serverKeys) ? null : keys, now);

  // The pointer is followed on the WINDOW, not the handle: the held row's DOM
  // node is moved as the order changes, and a moved node can lose its capture.
  useEffect(() => {
    if (!drag) return undefined;
    const move = (e) => {
      const d = dragRef.current;
      if (!d || !bodyRef.current) return;
      let idx = 0;
      for (const tr of bodyRef.current.children) {
        if (tr.dataset.key === d.key) continue;
        const b = tr.getBoundingClientRect();
        if (b.top + b.height / 2 < e.clientY) idx += 1;
      }
      const rest = d.keys.filter((k) => k !== d.key);
      const keys = [...rest.slice(0, idx), d.key, ...rest.slice(idx)];
      if (!sameKeys(keys, d.keys)) setDrag({ ...d, keys });
    };
    const drop = () => {
      const d = dragRef.current;
      setDrag(null);
      if (d && !sameKeys(d.keys, d.from)) commit(d.keys, true);
    };
    const cancel = () => setDrag(null);
    const key = (e) => { if (e.key === "Escape") { e.preventDefault(); cancel(); } };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", drop);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", drop);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!drag]);

  // A row moved by the keyboard keeps the focus on its handle.
  useLayoutEffect(() => {
    if (!focusKey) return;
    grips.current[focusKey]?.focus();
    setFocusKey(null);
  }, [focusKey]);

  const grab = (e, key) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    const keys = rows.map((r) => r.key);
    setDrag({ key, keys, from: keys });
  };
  const nudge = (e, key) => {
    const d = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
    if (!d) return;
    e.preventDefault();
    const keys = rows.map((r) => r.key);
    const i = keys.indexOf(key);
    const j = i + d;
    if (j < 0 || j >= keys.length) return;
    [keys[i], keys[j]] = [keys[j], keys[i]];
    setFocusKey(key);
    commit(keys, false);
  };

  const head = arranging ? (
    <div className="flex items-center gap-1.5">
      {custom && (
        <Button size="sm" variant="secondary" icon={<RotateCcw size={12} />}
          onClick={() => commit(serverKeys, true)}>{T.arrangeReset}</Button>
      )}
      <Button size="sm" icon={<Check size={12} />} onClick={() => setArranging(false)}>
        {T.arrangeDone}
      </Button>
    </div>
  ) : (
    <Button size="sm" variant="ghost" icon={<ArrowUpDown size={12} />}
      title={custom ? `${T.arrangeTip} · ${T.orderCustom}` : T.arrangeTip}
      onClick={() => setArranging(true)}>
      {T.arrange}
      {custom && <span aria-label={T.orderCustom} className="ml-0.5 inline-block w-1.5 h-1.5 rounded-full"
        style={{ background: "var(--brand)" }} />}
    </Button>
  );

  return (
    <TableCard title={caption} maxHeight="none" right={head}
      footer={arranging ? (
        <p className="text-[11px] leading-snug" style={{ color: "var(--text-3)" }}>{T.arrangeHint}</p>
      ) : undefined}>
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
      <tbody ref={bodyRef} className={drag ? "select-none" : undefined}>
        {rows.map((r, idx) => (
          <tr key={r.key} data-key={r.key}
            style={drag?.key === r.key ? {
              background: "rgba(var(--brand-rgb), 0.12)",
              outline: "1.5px solid var(--brand)", outlineOffset: "-1.5px",
            } : undefined}>
            <td className="px-3 py-2"
              style={{ color: "var(--text-1)", fontWeight: r.bold ? 600 : 500 }}>
              {arranging && (
                <button type="button"
                  ref={(el) => { grips.current[r.key] = el; }}
                  aria-label={fill(T.moveRow, { name: rowLabel(r, T, t), i: idx + 1, n: rows.length })}
                  title={fill(T.moveRow, { name: rowLabel(r, T, t), i: idx + 1, n: rows.length })}
                  onPointerDown={(e) => grab(e, r.key)}
                  onKeyDown={(e) => nudge(e, r.key)}
                  className={`relative inline-flex items-center justify-center w-6 h-6 -my-1 mr-1.5 align-middle rounded-md
                    before:absolute before:-inset-2.5 before:content-[''] hover:bg-[var(--bg-accent)]
                    focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand)]
                    ${drag?.key === r.key ? "cursor-grabbing" : "cursor-grab"}`}
                  style={{ color: drag?.key === r.key ? "var(--brand-text)" : "var(--text-3)", touchAction: "none" }}>
                  <GripVertical size={14} />
                </button>
              )}
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

export default function ReportSection({ section, months, order = {}, setBlock }) {
  const T = useRT();
  const { t } = useLang();
  return (
    <div className="space-y-4">
      {(section.blocks || []).filter((b) => b.kind === "periods").map((b) => (
        <PeriodsBlock key={b.key} block={b} months={months} T={T} t={t}
          caption={T.caps[`${section.key}.${b.key}`] || T.caps[b.key] || ""}
          saved={order[`${section.key}.${b.key}`]}
          onOrder={(keys, now) => setBlock?.(`${section.key}.${b.key}`, keys, now)} />
      ))}
    </div>
  );
}
