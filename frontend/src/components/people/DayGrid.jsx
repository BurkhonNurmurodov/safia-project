import { useMemo } from "react";
import { useLang } from "../../context/LangContext";
import useElementWidth from "../../hooks/useElementWidth";
import { DAY_PAINT, fmtDate } from "./peopleUtil";

const GAP = 3;
const WEEK_GAP = 5;      // the extra room before a Monday on the strip
const LABEL_W = 22;      // the weekday names' column on the grid
const STRIP_MIN = 14;    // below this a square cannot carry its day: use the grid
const STRIP_MAX = 34;
const GRID_MAX = 20;

const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function squareStyle(c) {
  const paint = DAY_PAINT[c.s];
  if (paint) return { background: paint.background, color: paint.color };
  if (c.s === "off" || c.s === "not_yet") return { background: "var(--bg-inner)", color: "var(--text-3)" };
  return { background: "transparent", color: "var(--text-3)", boxShadow: "inset 0 0 0 1px var(--border-md)" };
}

/**
 * The period's days, read as a SHAPE: a solid green field is a person who
 * comes, a gap in it is the day they did not.
 *
 * Two forms, one picture. Where every day can be a square large enough to
 * carry its date, the period is a STRIP — one square a day, oldest left, a
 * little more room before each Monday so the weeks show. Where it cannot (a
 * long period, a phone) the days fold into a week-column grid, Monday to Sunday
 * down, the way a calendar strip is drawn. The form is chosen by the room the
 * band has, measured.
 *
 * `days` is the server's list (one `{s, p}` per day from `from`); nothing is
 * counted here. A click on a day hands its date to `onPick` (the card opens
 * that month's calendar) — a shortcut; the calendar and the table are the
 * accessible way in.
 */
export default function DayGrid({ from, days, P, onPick }) {
  const { t } = useLang();
  const [ref, width] = useElementWidth();

  const cells = useMemo(() => {
    const start = new Date(`${from}T00:00:00`);
    const lead = (start.getDay() + 6) % 7;
    return days.map((x, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const pos = lead + i;
      return { ...x, iso: isoOf(d), i, col: Math.floor(pos / 7), row: pos % 7, dom: d.getDate(), mon: d.getMonth(), monday: pos % 7 === 0 };
    });
  }, [from, days]);

  if (!cells.length) return null;
  const n = cells.length;
  const breaks = cells.filter((c) => c.monday && c.i > 0).length;
  const stripFit = width ? Math.floor((width - (n - 1) * GAP - breaks * WEEK_GAP) / n) : 0;
  const strip = stripFit >= STRIP_MIN;

  const label = `${P.tAtt}: ${fmtDate(cells[0].iso)} – ${fmtDate(cells[n - 1].iso)}`;
  const pick = (e) => {
    const iso = e.target?.closest?.("[data-day]")?.dataset?.day;
    if (iso && onPick) onPick(iso);
  };
  const title = (c) => `${fmtDate(c.iso)} · ${P.state[c.s || "none"] || c.s}${c.p ? ` · ${P.notClosed}` : ""}`;
  const mark = (c) => ({
    opacity: c.p ? 0.45 : undefined,
    outline: c.s === "live" ? "2px solid var(--brand)" : undefined,
    outlineOffset: c.s === "live" ? 2 : undefined,
  });

  if (strip || !width) {
    const size = Math.min(STRIP_MAX, stripFit || STRIP_MIN);
    const radius = size >= 24 ? 6 : 4;
    // A month is named over its 1st, and the period's first month over its
    // first day unless the next name would crowd it.
    const names = cells.filter((c) => c.dom === 1 || (c.i === 0 && !cells.slice(1, 5).some((x) => x.dom === 1)));
    const left = [];
    for (let k = 0, at = 0; k < cells.length; k += 1) {
      if (k > 0) at += size + GAP + (cells[k].monday ? WEEK_GAP : 0);
      left.push(at);
    }
    return (
      <div ref={ref} className="w-full min-w-0">
        <div role="img" aria-label={label} className="relative" style={{ height: size + 16 }}>
          {names.map((c) => (
            <span key={`m${c.iso}`} aria-hidden="true" className="absolute top-0 text-[10px] leading-none whitespace-nowrap"
              style={{ left: left[c.i], color: "var(--text-3)" }}>
              {t(`cal.m${c.mon}`).slice(0, 3)}
            </span>
          ))}
          <div className="absolute left-0 right-0" style={{ top: 16, height: size }} onClick={pick}>
            {cells.map((c) => (
              <span key={c.iso} data-day={c.iso} title={title(c)}
                className={`pc-sq absolute grid place-items-center tabular-nums font-semibold ${onPick ? "cursor-pointer" : ""}`}
                style={{ ...squareStyle(c), ...mark(c), left: left[c.i], width: size, height: size, borderRadius: radius,
                         fontSize: size >= 26 ? 11 : 10, "--d": `${Math.min(c.i * 16, 640)}ms` }}>
                {size >= 20 ? c.dom : ""}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const weeks = cells[n - 1].col + 1;
  const fit = Math.floor((width - LABEL_W - (weeks - 1) * GAP) / weeks);
  const size = Math.max(7, Math.min(GRID_MAX, fit));
  const gridW = weeks * size + (weeks - 1) * GAP;
  const showMonths = size >= 9;
  const radius = size >= 14 ? 4 : size >= 10 ? 3 : 2;
  const months = [];
  cells.forEach((c) => { if (c.dom === 1) months.push({ col: c.col, mon: c.mon }); });
  if (!(months[0] && months[0].col <= 2)) months.unshift({ col: 0, mon: cells[0].mon });
  return (
    <div ref={ref} className="w-full min-w-0">
      <div role="img" aria-label={label} className="flex" style={{ width: gridW + LABEL_W, maxWidth: "100%" }}>
        {/* Weekday names down the left — Monday, Wednesday, Friday. */}
        <div className="flex-shrink-0" style={{ width: LABEL_W, paddingTop: showMonths ? 16 : 0 }} aria-hidden="true">
          {[0, 1, 2, 3, 4, 5, 6].map((r) => (
            <div key={r} className="text-[10px] leading-none flex items-center"
              style={{ height: size, marginBottom: r < 6 ? GAP : 0, color: "var(--text-3)" }}>
              {size >= 10 && r % 2 === 0 && r < 6 ? t(`cal.d${r}`) : ""}
            </div>
          ))}
        </div>
        <div style={{ width: gridW }}>
          {showMonths && (
            <div className="relative h-4" aria-hidden="true">
              {months.map((m) => (
                <span key={`${m.col}-${m.mon}`} className="absolute top-0 text-[10px] leading-none whitespace-nowrap"
                  style={{ left: m.col * (size + GAP), color: "var(--text-3)" }}>
                  {t(`cal.m${m.mon}`).slice(0, 3)}
                </span>
              ))}
            </div>
          )}
          <div className="grid" onClick={pick}
            style={{ gridTemplateColumns: `repeat(${weeks}, ${size}px)`, gridTemplateRows: `repeat(7, ${size}px)`, gap: GAP }}>
            {cells.map((c) => (
              <span key={c.iso} data-day={c.iso} title={title(c)}
                className={`pc-sq ${onPick ? "cursor-pointer" : ""}`}
                style={{ ...squareStyle(c), ...mark(c), gridColumn: c.col + 1, gridRow: c.row + 1, borderRadius: radius,
                         "--d": `${Math.min(c.col * 26, 700)}ms` }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
