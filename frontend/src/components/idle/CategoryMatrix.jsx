import { useMemo, useRef, useState } from "react";
import { ChevronRight, Table2 } from "lucide-react";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { catColor } from "./categories";
import { SkeletonMatrix } from "../ui/Skeleton";
import EmptyState from "../ui/EmptyState";

/**
 * «Toifalar bo'yicha» — categories down, the days of the month across.
 *
 * THE FIGURE, and why it is not the one the Analysis tab charts
 * -------------------------------------------------------------
 * A leaf cell is a brigadir's minutes in one category on one day DIVIDED BY
 * the cells that had people standing in them that day. Every other ojidaniya
 * number on the platform is the headcount-weighted mean Σ(N·T)÷ΣN, so the two
 * do not agree and are never interchangeable — which is also why this tab
 * carries no KPI cards: two totals of two different kinds, one above the
 * other, read as a bug. The backend (`services/ojidaniya_matrix`) owns every
 * roll-up; this file only draws what it is handed.
 *
 * Four rules the drawing has to keep honest:
 *   · a BLANK cell is a real zero — cells ran and nothing waited. Keeping the
 *     zeros blank is what lets the non-zero values read across 31 columns.
 *   · «·» is the gap: no cell had anybody in it, so there is nothing to divide
 *     by and the average does not exist. It is never rendered as 0.
 *   · a HATCHED column is a day the month has not reached. A month still
 *     running keeps all of its columns (the operator's call, 2026-09-04), and
 *     neither glyph above can say why one is empty — blank would read as "cells
 *     ran and nothing waited", «·» as "nobody was in any cell". So it is drawn
 *     as its own thing and named in the legend, and it carries no value at all.
 *     Which columns those are is `future` on the payload, decided once by
 *     `services/ojidaniya_matrix` — never re-derived here from the browser's
 *     own clock, or the file and the screen could disagree about one month.
 *   · the ramp is GOLD and carries no threshold. The 50-daq flag is defined
 *     over a unit's whole-day UNION, so it says nothing about a per-category
 *     average — a red cell here would be a number pretending to be a verdict.
 *
 * Category rows and brigadir rows get their own ramp domain: a category row is
 * the SUM of the rows under it and always larger, so one shared scale would
 * wash every brigadir row out to nothing.
 *
 * EVERY brigadir in scope is listed under EVERY category (the operator's call,
 * 2026-09-05), including the ones who waited nothing and the ones who filed
 * nothing at all. The group used to end with «yana N brigadirda…» and fold them
 * away; the row set then changed from category to category, so two groups could
 * not be read against each other. The backend sorts the carriers to the top, so
 * a long group is still read from the top — the ORDER is what answers the fold's
 * old argument, not hiding anybody.
 *
 * Minutes only, one decimal. The page's min/hrs switch is deliberately not
 * applied — «1 soat 35 daq» cannot be read in a 46px column.
 */

// A day the month has not reached yet. Drawn from ONE slate at a low alpha
// rather than from a theme token, so it reads the same faint diagonal in both
// themes without a second definition — and as an IMAGE, so a cell keeps
// whatever background colour it already had (the Sunday tint) underneath.
const FUTURE_HATCH =
  "repeating-linear-gradient(135deg, transparent 0 4px, rgba(148,163,184,0.16) 4px 8px)";

const COL_W = 46;      // one day
const NAME_W = 238;    // the frozen category / brigadir column
const TOT_W = 78;      // the frozen month total

const fmt1 = (v) => (v == null ? null : v.toFixed(1));

// Intensity, not status: eased so the long tail of small waits still separates.
function shade(v, max) {
  if (!v || !max) return undefined;
  const k = Math.pow(Math.min(v / max, 1), 0.62);
  return {
    backgroundColor: `rgba(var(--brand-rgb), ${(k * 0.9).toFixed(3)})`,
    // Gold at full strength needs dark ink in BOTH themes, so this one literal
    // is theme-independent by construction rather than by omission.
    ...(k > 0.55 ? { color: "#1a1508" } : null),
  };
}

export default function CategoryMatrix({ data, loading, monthLabel }) {
  const { t } = useLang();
  const { tl } = useTranslit();
  const [open, setOpen] = useState(() => new Set());
  const [hotCol, setHotCol] = useState(null);
  const [tip, setTip] = useState(null);
  const scrollRef = useRef(null);

  const dates = data?.dates || [];
  const cats = data?.cats || [];
  const future = data?.future || [];
  const hasFuture = future.some(Boolean);

  // Two domains — see the header comment.
  const { maxCat, maxLeaf } = useMemo(() => {
    let mc = 0, ml = 0;
    for (const c of cats) {
      for (const v of c.days || []) if (v != null && v > mc) mc = v;
      for (const s of c.sups || []) for (const v of s.days || []) if (v != null && v > ml) ml = v;
    }
    return { maxCat: mc, maxLeaf: ml };
  }, [cats]);

  const dayNum = (d) => String(d || "").slice(0, 2);
  const weekday = (d) => {
    const [dd, mm, yy] = String(d || "").split(".");
    if (!yy) return "";
    return t(`cal.d${(new Date(`${yy}-${mm}-${dd}T00:00:00`).getDay() + 6) % 7}`).slice(0, 2);
  };
  const isSunday = (d) => {
    const [dd, mm, yy] = String(d || "").split(".");
    return yy ? new Date(`${yy}-${mm}-${dd}T00:00:00`).getDay() === 0 : false;
  };

  const toggle = (name) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });

  if (loading) return <SkeletonMatrix rows={9} cols={12} />;
  if (!dates.length || !cats.length) {
    return (
      <EmptyState
        title={t("downtime.mx.empty")}
        message={t("downtime.mx.emptySub")}
        showUploadLink={false}
        icon={Table2}
      />
    );
  }

  // A cell: hatched and EMPTY for a day that has not happened, blank for a real
  // zero, «·» for no divisor, the figure otherwise. A future cell carries no
  // tooltip either — there is nothing about it to explain, and the two the grid
  // has both describe a measurement that was taken.
  const cell = (v, max, i, key, tipFn) => {
    const fut = !!future[i];
    const none = v == null;
    return (
      <td
        key={key}
        className="text-center border-b border-r tabular-nums"
        style={{
          width: COL_W, minWidth: COL_W,
          borderColor: "var(--border)",
          backgroundColor: isSunday(dates[i]) ? "rgba(239,68,68,0.05)" : undefined,
          ...(none ? null : shade(v, max)),
          ...(fut ? { backgroundImage: FUTURE_HATCH } : null),
        }}
        onMouseEnter={(e) => {
          setHotCol(i);
          if (fut) { setTip(null); return; }
          if (tipFn) {
            const r = e.currentTarget.getBoundingClientRect();
            setTip({ ...tipFn(), x: r.left + r.width / 2, y: r.top });
          }
        }}
      >
        {fut ? null : none ? (
          <span style={{ color: "var(--text-4)" }}>·</span>
        ) : v ? (
          fmt1(v)
        ) : null}
      </td>
    );
  };

  return (
    <>
      <div
        ref={scrollRef}
        className="overflow-auto"
        style={{ maxHeight: "70vh" }}
        onMouseLeave={() => { setHotCol(null); setTip(null); }}
        onScroll={() => setTip(null)}
      >
        <table className="border-separate" style={{ borderSpacing: 0, width: "max-content", minWidth: "100%" }}>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 top-0 z-[5] text-left text-[10px] font-semibold uppercase tracking-wider px-3 border-b border-r"
                style={{
                  width: NAME_W, minWidth: NAME_W, height: 44,
                  background: "var(--bg-inner)", borderColor: "var(--border)",
                  color: "var(--text-3)",
                }}
              >
                {t("downtime.mx.catCol")}
              </th>
              {dates.map((d, i) => (
                <th
                  key={d}
                  scope="col"
                  className="sticky top-0 z-[3] border-b border-r"
                  style={{
                    width: COL_W, minWidth: COL_W, height: 44,
                    backgroundColor: hotCol === i ? "var(--hover-bg)" : "var(--bg-inner)",
                    borderColor: "var(--border)",
                    ...(future[i] ? { backgroundImage: FUTURE_HATCH } : null),
                  }}
                >
                  <span className="block text-[12.5px] font-semibold leading-tight tabular-nums"
                    style={{
                      color: future[i] ? "var(--text-4)"
                        : hotCol === i ? "var(--brand-text)" : "var(--text-2)",
                    }}>
                    {dayNum(d)}
                  </span>
                  <span className="block text-[9.5px] uppercase tracking-wide" style={{ color: "var(--text-4)" }}>
                    {weekday(d)}
                  </span>
                </th>
              ))}
              <th
                scope="col"
                className="sticky right-0 top-0 z-[5] text-[10px] font-semibold uppercase tracking-wider px-3 border-b border-l"
                style={{
                  width: TOT_W, minWidth: TOT_W, height: 44,
                  background: "var(--bg-inner)", borderColor: "var(--border)", color: "var(--text-3)",
                }}
              >
                {t("downtime.mx.total")}
              </th>
            </tr>
          </thead>

          <tbody>
            {cats.map((c) => {
              const isOpen = open.has(c.name);
              const hue = catColor(c.name);
              const code = c.name.replace(/^Cat\s*/i, "");
              return [
                <tr key={c.name} className="group">
                  <th
                    scope="row"
                    className="sticky left-0 z-[2] p-0 text-left border-b border-r"
                    style={{
                      width: NAME_W, minWidth: NAME_W,
                      background: isOpen ? "var(--bg-inner)" : "var(--bg-card)",
                      borderColor: "var(--border)",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => toggle(c.name)}
                      aria-expanded={isOpen}
                      className="flex items-center gap-2 w-full px-3 text-left text-[12.5px] font-semibold"
                      style={{ height: 38, color: "var(--text-1)" }}
                    >
                      <ChevronRight
                        size={13}
                        className="flex-none transition-transform"
                        style={{
                          color: isOpen ? "var(--brand)" : "var(--text-4)",
                          transform: isOpen ? "rotate(90deg)" : "none",
                        }}
                      />
                      <span className="w-2 h-2 rounded-full flex-none" style={{ background: hue }} />
                      <span className="font-bold">{code}</span>
                      <span className="truncate text-[11.5px] font-normal" style={{ color: "var(--text-3)" }}>
                        {t(`downtime.cat.${code}.label`)}
                      </span>
                    </button>
                  </th>
                  {dates.map((d, i) =>
                    cell(c.days?.[i], maxCat, i, d, () => ({
                      code, hue, date: d,
                      title: t(`downtime.cat.${code}.label`),
                      body: t("downtime.mx.tipCat"),
                      eq: null,
                    })),
                  )}
                  <td
                    className="sticky right-0 z-[2] text-right pr-3 text-[11.5px] font-semibold border-b border-l tabular-nums"
                    style={{
                      width: TOT_W, minWidth: TOT_W,
                      background: isOpen ? "var(--bg-inner)" : "var(--bg-card)",
                      borderColor: "var(--border)", color: "var(--text-1)",
                    }}
                  >
                    {fmt1(c.total)}
                  </td>
                </tr>,

                ...(isOpen
                  ? (c.sups || []).map((s) => (
                      <tr key={`${c.name}:${s.manager_id}`}>
                        <th
                          scope="row"
                          className="sticky left-0 z-[2] p-0 text-left border-b border-r font-normal"
                          style={{
                            width: NAME_W, minWidth: NAME_W,
                            background: "var(--bg-card)", borderColor: "var(--border)",
                          }}
                        >
                          <div className="flex items-center gap-2 pl-8 pr-3 text-[11.5px]"
                            style={{ height: 30, color: "var(--text-2)" }}>
                            <span className="truncate">{tl(s.name)}</span>
                          </div>
                        </th>
                        {dates.map((d, i) =>
                          cell(s.days?.[i], maxLeaf, i, d, () => ({
                            code, hue, date: d,
                            title: tl(s.name),
                            body: t(`downtime.cat.${code}.label`),
                            // Σ is v × the divisor, both of which came from one
                            // division — so the derivation shown is the one the
                            // number was actually made by.
                            eq: s.cells?.[i]
                              ? t("downtime.mx.tipEq")
                                  .replace("{sum}", ((s.days[i] || 0) * s.cells[i]).toFixed(1))
                                  .replace("{cells}", String(s.cells[i]))
                                  .replace("{avg}", (s.days[i] || 0).toFixed(1))
                              : t("downtime.mx.tipNoCells"),
                          })),
                        )}
                        <td
                          className="sticky right-0 z-[2] text-right pr-3 text-[11.5px] border-b border-l tabular-nums"
                          style={{
                            width: TOT_W, minWidth: TOT_W,
                            background: "var(--bg-card)", borderColor: "var(--border)",
                            color: "var(--text-2)",
                          }}
                        >
                          {fmt1(s.total)}
                        </td>
                      </tr>
                    ))
                  : []),
              ];
            })}
          </tbody>

          <tfoot>
            <tr>
              <th
                scope="row"
                className="sticky left-0 bottom-0 z-[6] text-left px-3 border-t border-r"
                style={{
                  width: NAME_W, minWidth: NAME_W, height: 44,
                  background: "var(--bg-inner)", borderColor: "var(--border)",
                }}
              >
                <span className="block text-[12px] font-bold" style={{ color: "var(--text-1)" }}>
                  {t("downtime.mx.total")}
                </span>
                <span className="block text-[9.5px] -mt-0.5" style={{ color: "var(--text-4)" }}>
                  {t("downtime.mx.totalSub")}
                </span>
              </th>
              {dates.map((d, i) => (
                <td
                  key={d}
                  className="sticky bottom-0 z-[4] text-center text-[12px] font-bold border-t border-r tabular-nums"
                  style={{
                    width: COL_W, minWidth: COL_W, height: 44,
                    backgroundColor: "var(--bg-inner)", borderColor: "var(--border)",
                    color: "var(--text-1)",
                    ...(future[i] ? { backgroundImage: FUTURE_HATCH } : null),
                  }}
                >
                  {future[i] ? null : data.col_totals?.[i] == null ? (
                    <span style={{ color: "var(--text-4)" }}>·</span>
                  ) : (
                    fmt1(data.col_totals[i])
                  )}
                </td>
              ))}
              <td
                className="sticky right-0 bottom-0 z-[6] text-right pr-3 text-[12.5px] font-extrabold border-t border-l tabular-nums"
                style={{
                  width: TOT_W, minWidth: TOT_W, height: 44,
                  background: "var(--bg-inner)", borderColor: "var(--border)",
                  color: "var(--brand-text)",
                }}
              >
                {fmt1(data.grand)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Legend — the two glyphs mean different things and neither is guessable. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-4 py-3 text-[11.5px] border-t"
        style={{ borderColor: "var(--border)", color: "var(--text-3)" }}>
        <span className="flex items-center gap-2">
          <span>{t("downtime.mx.rampLo")}</span>
          <span className="flex h-2.5 rounded overflow-hidden border" style={{ borderColor: "var(--border)" }}>
            {[0.06, 0.2, 0.38, 0.58, 0.78, 0.95].map((a) => (
              <i key={a} className="block w-4" style={{ background: `rgba(var(--brand-rgb), ${a})` }} />
            ))}
          </span>
          <span>{t("downtime.mx.rampHi")}</span>
        </span>
        <span><span className="inline-block w-4 text-center" style={{ color: "var(--text-4)" }}>·</span> {t("downtime.mx.legendNoData")}</span>
        <span><span className="inline-block w-4" /> {t("downtime.mx.legendZero")}</span>
        {hasFuture ? (
          <span className="flex items-center gap-2">
            <span className="inline-block w-4 h-2.5 rounded-sm border"
              style={{ borderColor: "var(--border)", backgroundImage: FUTURE_HATCH }} />
            {t("downtime.mx.legendFuture")}
          </span>
        ) : null}
        <span>{t("downtime.mx.legendSort")}</span>
        {monthLabel ? <span className="ml-auto tabular-nums" style={{ color: "var(--text-4)" }}>{monthLabel}</span> : null}
      </div>

      {/* One floating tooltip for the whole grid — the figure is unusual
          enough that it has to be able to explain itself where it is read. */}
      {tip && (
        <div
          role="tooltip"
          className="fixed z-[80] pointer-events-none rounded-xl px-3 py-2 shadow-xl"
          style={{
            left: Math.min(Math.max(8, tip.x - 130), window.innerWidth - 268),
            top: Math.max(8, tip.y - 92),
            width: 260,
            background: "var(--bg-card)", border: "1px solid var(--border)",
          }}
        >
          <div className="flex items-center gap-2 text-[11px] font-semibold mb-1" style={{ color: "var(--text-1)" }}>
            <span className="w-2 h-2 rounded-full flex-none" style={{ background: tip.hue }} />
            {tip.code} · {tip.date}
          </div>
          <div className="text-[10.5px] leading-relaxed" style={{ color: "var(--text-3)" }}>
            {tip.title}
            <br />
            {tip.body}
          </div>
          {tip.eq && (
            <div className="mt-1.5 pt-1.5 text-[11px] tabular-nums border-t"
              style={{ borderColor: "var(--border)", color: "var(--text-2)" }}>
              {tip.eq}
            </div>
          )}
        </div>
      )}
    </>
  );
}
