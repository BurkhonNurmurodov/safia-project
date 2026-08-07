import { useEffect, useMemo, useRef, useState } from "react";
import { useLang } from "../../context/LangContext";

// GitHub-style contribution calendar. Renders one small square per calendar day,
// laid out in week-columns (Monday at top — local convention) with month labels
// along the top and a few weekday labels down the left. Colour intensity scales
// with the day's value relative to the busiest day in the series.
//
// The grid is always a clean block of whole weeks: at most MAX_WEEKS columns,
// ending with the week that contains the last day of the series. Leading days
// that would create a ragged partial first column are dropped; future days in
// the current week render as blanks.
//
// Props:
//   series      [{ day:'YYYY-MM-DD', minutes, count }]  — daily values
//   valueKey    which numeric field drives the colour (default 'minutes')
//   accent      base brand hex for the filled scale (default gold)
//   label       metric name shown in the tooltip (e.g. "min")
//   formatValue (v) => string for the tooltip value
//   onDayClick  optional (dayObj) => void

const GAP = 3;      // gap between squares
const LABEL_W = 32; // left weekday-label gutter
const MONTH_H = 18; // top month-label band
const MAX_WEEKS = 53;

const I18N = {
  uz: {
    months: ["Yan", "Fev", "Mar", "Apr", "May", "Iyn", "Iyl", "Avg", "Sen", "Okt", "Noy", "Dek"],
    weekdays: ["Du", "", "Cho", "", "Ju", "", ""],
    active: (n) => `Faol kunlar: ${n}`, less: "Kam", more: "Ko'p", none: "Faollik yo'q",
    locale: "uz-Latn-UZ",
  },
  uz_cyrl: {
    months: ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"],
    weekdays: ["Ду", "", "Чо", "", "Жу", "", ""],
    active: (n) => `Фаол кунлар: ${n}`, less: "Кам", more: "Кўп", none: "Фаоллик йўқ",
    locale: "uz-Cyrl-UZ",
  },
  ru: {
    months: ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"],
    weekdays: ["Пн", "", "Ср", "", "Пт", "", ""],
    active: (n) => `Активных дней: ${n}`, less: "Меньше", more: "Больше", none: "Нет активности",
    locale: "ru-RU",
  },
  en: {
    months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    weekdays: ["Mon", "", "Wed", "", "Fri", "", ""],
    active: (n) => `Active days: ${n}`, less: "Less", more: "More", none: "No activity",
    locale: "en",
  },
};

const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
// Mix a hex toward white by amount 0..1 → lighter shade for the low levels.
const lighten = (hex, amt) => {
  const [r, g, b] = hexToRgb(hex);
  const ch = (c) => Math.round(c + (255 - c) * amt);
  return `rgb(${ch(r)}, ${ch(g)}, ${ch(b)})`;
};

const parseDay = (s) => new Date(s + "T00:00:00Z");
const iso = (d) => d.toISOString().slice(0, 10);
const mondayIdx = (d) => (d.getUTCDay() + 6) % 7; // Mon=0 … Sun=6

export default function ContributionHeatmap({
  series = [],
  valueKey = "minutes",
  accent = "#C8973F",
  label = "",
  formatValue,
  onDayClick,
}) {
  const { lang } = useLang();
  const L = I18N[lang] || I18N.ru;

  const [hover, setHover] = useState(null); // { col, row, day, value, count }
  const scrollRef = useRef(null);
  const [availW, setAvailW] = useState(0);

  const { columns, monthLabels, maxVal, totalActive, lastDay } = useMemo(() => {
    const byDay = new Map();
    let maxVal = 0;
    let totalActive = 0;
    for (const d of series) {
      byDay.set(d.day, d);
      const v = d[valueKey] || 0;
      if (v > maxVal) maxVal = v;
      if (v > 0) totalActive++;
    }

    if (!series.length) return { columns: [], monthLabels: [], maxVal: 0, totalActive: 0, lastDay: "" };

    const first = parseDay(series[0].day);
    const last = parseDay(series[series.length - 1].day);

    // The grid ends with the (Mon-first) week containing the last day, and spans
    // whole weeks back from there — capped so a leading partial week is dropped
    // rather than rendered as a ragged one-cell column.
    const gridEnd = new Date(last);
    gridEnd.setUTCDate(gridEnd.getUTCDate() + (6 - mondayIdx(last)));
    const firstWeekStart = new Date(first);
    firstWeekStart.setUTCDate(firstWeekStart.getUTCDate() - mondayIdx(first));
    const spanWeeks = Math.round(((gridEnd - firstWeekStart) / 86400000 + 1) / 7);
    const weeks = Math.min(spanWeeks, MAX_WEEKS);
    const gridStart = new Date(gridEnd);
    gridStart.setUTCDate(gridStart.getUTCDate() - weeks * 7 + 1);

    const columns = [];
    let rawLabels = [];
    let prevMonth = -1;
    const cursor = new Date(gridStart);
    for (let col = 0; col < weeks; col++) {
      // Month label anchored to the column whose Monday opens a new month.
      const m = cursor.getUTCMonth();
      if (m !== prevMonth) {
        rawLabels.push({ col, month: m });
        prevMonth = m;
      }
      const cells = [];
      for (let row = 0; row < 7; row++) {
        const key = iso(cursor);
        const rec = byDay.get(key);
        cells.push({
          day: key,
          date: new Date(cursor),
          future: cursor > last,
          value: rec ? (rec[valueKey] || 0) : 0,
          count: rec ? (rec.count || 0) : 0,
        });
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
      columns.push({ col, cells });
    }
    // Drop a label that sits closer than 3 columns to the next one (a sliver of
    // a month at the left edge) so labels never crowd or overlap.
    const monthLabels = rawLabels.filter((l, i) => {
      const next = rawLabels[i + 1];
      return !next || next.col - l.col >= 3;
    });
    return { columns, monthLabels, maxVal, totalActive, lastDay: series[series.length - 1].day };
  }, [series, valueKey]);

  // Cells grow to fill the card on wide screens and shrink (with horizontal
  // scroll as the floor) on narrow ones.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setAvailW(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const weeks = columns.length || MAX_WEEKS;
  const step = availW
    ? Math.max(13, Math.min(20, Math.floor((availW - LABEL_W - 4) / weeks)))
    : 15;
  const cell = step - GAP;

  // Start scrolled to the most recent weeks when the grid overflows (mobile).
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [columns.length, step]);

  // value → one of 5 levels (0 empty + 4 shades)
  const levelColor = (value) => {
    if (value <= 0) return "var(--bg-inner)";
    const ratio = maxVal > 0 ? value / maxVal : 0;
    const level = ratio > 0.66 ? 4 : ratio > 0.33 ? 3 : ratio > 0.1 ? 2 : 1;
    const shades = { 1: lighten(accent, 0.62), 2: lighten(accent, 0.4), 3: lighten(accent, 0.18), 4: accent };
    return shades[level];
  };

  const fmt = formatValue || ((v) => `${v} ${label}`.trim());
  const width = LABEL_W + weeks * step;

  if (!columns.length) {
    return <div className="text-xs py-8 text-center" style={{ color: "var(--text-4)" }}>—</div>;
  }

  return (
    <div ref={scrollRef} style={{ overflowX: "auto", overflowY: "hidden", paddingBottom: 4 }}>
      <div style={{ position: "relative", width, minWidth: width }}>
        {/* Month labels */}
        <div style={{ position: "relative", height: MONTH_H, marginLeft: LABEL_W }}>
          {monthLabels.map((m) => (
            <span
              key={`${m.col}-${m.month}`}
              style={{
                position: "absolute", left: m.col * step, top: 0,
                fontSize: 10, color: "var(--text-4)", whiteSpace: "nowrap",
              }}
            >
              {L.months[m.month]}
            </span>
          ))}
        </div>

        <div style={{ display: "flex" }}>
          {/* Weekday labels (Mon-first rows) */}
          <div style={{ width: LABEL_W, position: "relative", flexShrink: 0 }}>
            {L.weekdays.map((w, row) => (
              w ? (
                <span
                  key={row}
                  style={{
                    position: "absolute", top: row * step, right: 6,
                    fontSize: 9, lineHeight: `${cell}px`, color: "var(--text-4)",
                  }}
                >
                  {w}
                </span>
              ) : null
            ))}
          </div>

          {/* Week columns */}
          <div style={{ display: "flex", gap: GAP }}>
            {columns.map((c) => (
              <div key={c.col} style={{ display: "flex", flexDirection: "column", gap: GAP }}>
                {c.cells.map((cellObj, row) => (
                  <div
                    key={cellObj.day}
                    onMouseEnter={() => !cellObj.future && setHover({ col: c.col, row, ...cellObj })}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => !cellObj.future && onDayClick?.(cellObj)}
                    style={{
                      width: cell, height: cell, borderRadius: 3,
                      background: cellObj.future ? "transparent" : levelColor(cellObj.value),
                      border: cellObj.future ? "none" : "1px solid var(--border)",
                      boxShadow: cellObj.day === lastDay ? `0 0 0 1.5px ${accent}` : "none",
                      cursor: !cellObj.future && onDayClick ? "pointer" : "default",
                      outline: hover?.col === c.col && hover?.row === row ? "1px solid var(--brand-text)" : "none",
                      transition: "outline .08s",
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Tooltip */}
        {hover && (
          <div
            style={{
              position: "absolute",
              left: Math.max(70, Math.min(LABEL_W + hover.col * step + cell / 2, width - 90)),
              top: MONTH_H + hover.row * step + cell + 6,
              transform: "translateX(-50%)",
              zIndex: 20, pointerEvents: "none",
              background: "rgba(18,21,31,0.94)", color: "#f5f6f8",
              border: "1px solid rgba(255,255,255,0.10)", borderRadius: 8,
              padding: "6px 9px", fontSize: 11, whiteSpace: "nowrap",
              boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            }}
          >
            <div style={{ fontWeight: 700 }}>
              {hover.value > 0 ? fmt(hover.value) : L.none}
            </div>
            <div style={{ opacity: 0.7, fontSize: 10, marginTop: 1 }}>
              {hover.date.toLocaleDateString(L.locale, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
            </div>
          </div>
        )}

        {/* Legend */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, marginLeft: LABEL_W }}>
          <span style={{ fontSize: 10, color: "var(--text-4)" }}>{L.active(totalActive)}</span>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 10, color: "var(--text-4)" }}>{L.less}</span>
          {["var(--bg-inner)", lighten(accent, 0.62), lighten(accent, 0.4), lighten(accent, 0.18), accent].map((c, i) => (
            <span key={i} style={{ width: 11, height: 11, borderRadius: 3, background: c, border: "1px solid var(--border)" }} />
          ))}
          <span style={{ fontSize: 10, color: "var(--text-4)" }}>{L.more}</span>
        </div>
      </div>
    </div>
  );
}
