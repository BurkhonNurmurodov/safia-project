// «Deadlines» — the open goals on ONE calendar: each bar is a goal's period,
// its fill is how much is done, and the upright tick is today. Fill that stops
// short of the tick on a bar is a goal behind its time; a red dashed tail past
// the bar's end is a goal whose date has gone by. Soonest due first.
//
// Ranges on a date axis → a timeline. Achieved goals are left out: they no
// longer have a date anybody needs to watch.
import { useState } from "react";
import useElementWidth from "../../../hooks/useElementWidth";
import { ChevronDown } from "lucide-react";
import { STATUS_ICON } from "../targetsUi";
import { MARK_COLOR, msOf, DAY_MS, shortMonth, dayLabel, clamp } from "./chartKit";
import { RED } from "../../../utils/statusBands";
import { fmtPct, fill, hexA } from "../../../utils/targets";

// Rows shown before «N more»: fewer on a phone, where each row is two lines.
const SHOW_WIDE = 6;
const SHOW_NARROW = 4;

export default function DeadlineTimeline({ rows, today, t, onOpen }) {
  const [all, setAll] = useState(false);
  const [boxRef, boxW] = useElementWidth();
  const SHOW = boxW && boxW < 512 ? SHOW_NARROW : SHOW_WIDE;
  const open = rows
    .filter((r) => r.g.start && r.g.due && r.st !== "achieved")
    .sort((a, b) => (a.g.due < b.g.due ? -1 : a.g.due > b.g.due ? 1 : a.g.start < b.g.start ? -1 : 1));
  if (!open.length) {
    return <p className="px-4 pb-5 pt-1 text-sm" style={{ color: "var(--text-3)" }}>{t("targets.chart.timeline.empty")}</p>;
  }

  const tMs = msOf(today);
  const lo = Math.min(...open.map((r) => msOf(r.g.start)), tMs);
  const hi = Math.max(...open.map((r) => msOf(r.g.due)), tMs);
  const padMs = Math.max(2 * DAY_MS, (hi - lo) * 0.03);
  const d0 = lo - padMs;
  const d1 = hi + padMs;
  const pct = (ms) => clamp(((ms - d0) / (d1 - d0)) * 100, 0, 100);

  // First of every month inside the span; thinned so the labels never touch.
  const months = [];
  const c = new Date(d0);
  c.setDate(1);
  c.setMonth(c.getMonth() + 1);
  while (c.getTime() < d1 && months.length < 60) {
    months.push({ ms: c.getTime(), m: c.getMonth() });
    c.setMonth(c.getMonth() + 1);
  }
  const every = Math.max(1, Math.ceil(months.length / 8));
  const todayP = pct(tMs);
  const shown = all ? open : open.slice(0, SHOW);
  const cols = "@lg:grid-cols-[minmax(0,34%)_1fr]";

  return (
    <div ref={boxRef} className="@container px-4 pb-4 pt-1">
      {/* the date axis: months, and where today is */}
      <div className={`grid ${cols} gap-x-4`}>
        <div className="hidden @lg:block" />
        {/* two rows: the months, then today — they never share a line */}
        <div className="relative h-10" aria-hidden>
          {months.map((mo, i) => (i % every === 0) && (
            <span key={mo.ms} className="absolute top-0 text-[10px] -translate-x-1/2 whitespace-nowrap" style={{ left: `${pct(mo.ms)}%`, color: "var(--text-3)" }}>
              {shortMonth(t, mo.m)}
            </span>
          ))}
          <span
            className="absolute bottom-0.5 text-[10px] font-semibold whitespace-nowrap px-1.5 rounded"
            style={{
              left: `${todayP}%`, transform: `translateX(${todayP > 85 ? "-100%" : todayP < 15 ? "0" : "-50%"})`,
              color: "var(--bg-card)", background: "var(--text-2)",
            }}
          >
            {t("targets.chart.timeline.today")}
          </span>
        </div>
      </div>

      <ul className="mt-1">
        {shown.map((r) => {
          const s = msOf(r.g.start);
          const e = msOf(r.g.due);
          const sp = pct(s);
          const ep = pct(e);
          const late = r.st === "overdue";
          const endP = late ? Math.max(ep, todayP) : ep;
          const color = MARK_COLOR[r.st];
          const Icon = STATUS_ICON[r.st];
          const due = dayLabel(r.g.due, t);
          const labelAfter = endP < 80;
          const labelBefore = !labelAfter && sp > 16;
          return (
            <li key={r.g.id}>
              <button
                type="button" onClick={() => onOpen(r.g.id)}
                aria-label={fill(t("targets.chart.timeline.aria"), { title: r.g.title, st: t(`targets.st.${r.st}`), p: fmtPct(r.p), due })}
                className={`w-full grid ${cols} items-center gap-x-4 gap-y-1.5 rounded-lg px-1.5 -mx-1.5 py-2 text-left transition-colors hover:bg-[var(--hover-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <Icon size={14} strokeWidth={2.4} className="flex-shrink-0" style={{ color }} aria-hidden />
                  <span className="truncate text-[13px]" style={{ color: "var(--text-1)" }}>{r.g.title}</span>
                  <span className="ml-auto pl-2 text-xs font-semibold tabular-nums @lg:hidden" style={{ color: "var(--text-2)" }}>{fmtPct(r.p)}</span>
                </span>
                <span className="relative block h-5" aria-hidden>
                  {months.map((mo) => (
                    <span key={mo.ms} className="absolute inset-y-0 w-px" style={{ left: `${pct(mo.ms)}%`, background: "var(--bg-accent)" }} />
                  ))}
                  {/* the period, filled to the share done */}
                  <span
                    className="absolute top-1/2 -translate-y-1/2 h-2.5 rounded-full overflow-hidden"
                    style={{ left: `${sp}%`, width: `${Math.max(0.8, ep - sp)}%`, background: "var(--bg-accent)" }}
                  >
                    <span className="block h-full rounded-full" style={{ width: `${Math.round(r.p * 100)}%`, background: color }} />
                  </span>
                  {/* the days since the date went by */}
                  {late && todayP > ep && (
                    <span
                      className="absolute top-1/2 -translate-y-1/2 h-2.5 rounded-r-full"
                      style={{ left: `${ep}%`, width: `${todayP - ep}%`, border: `1.5px dashed ${RED}`, borderLeft: "none", background: hexA(RED, 0.12) }}
                    />
                  )}
                  {/* today */}
                  <span className="absolute -inset-y-0.5 w-0.5 rounded-full" style={{ left: `calc(${todayP}% - 1px)`, background: "var(--text-2)" }} />
                  {(labelAfter || labelBefore) && (
                    <span
                      className="absolute top-1/2 -translate-y-1/2 text-[10px] font-medium whitespace-nowrap tabular-nums"
                      style={labelAfter
                        ? { left: `calc(${endP}% + 6px)`, color: late ? RED : "var(--text-2)" }
                        : { right: `calc(${100 - sp}% + 6px)`, color: late ? RED : "var(--text-2)" }}
                    >
                      {due}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {open.length > SHOW && (
        <button
          type="button" onClick={() => setAll((v) => !v)} aria-expanded={all}
          className="mt-1 inline-flex items-center gap-1 text-xs font-medium rounded-lg px-1.5 py-1 -mx-1.5 transition-colors hover:text-[var(--text-1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
          style={{ color: "var(--text-2)" }}
        >
          {all ? t("targets.showLess") : fill(t("targets.chart.timeline.more"), { n: open.length - SHOW })}
          <ChevronDown size={13} aria-hidden style={{ transform: all ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
        </button>
      )}
    </div>
  );
}
