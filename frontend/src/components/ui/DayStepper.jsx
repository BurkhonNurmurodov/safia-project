import { ChevronLeft, ChevronRight } from "lucide-react";
import DateRangePicker from "./DateRangePicker";
import { useLang } from "../../context/LangContext";

/**
 * Canonical single-day stepper — THE template for "‹ [date] ›" day
 * navigation on daily pages (Daily, ShiftDaily, Production…).
 * Chevron buttons step ±1 day; the label is the app-wide DateRangePicker
 * in single mode (custom calendar — never the native browser picker).
 *
 * `week` turns it into the "‹ [week] ›" stepper (the «Kelish ro'yxati» week
 * register): the chevrons step ±7 days, the label is the Monday → Sunday span
 * (numeric below sm), and any day picked in the calendar lands on its week's
 * Monday — so `value` and every `onChange` are always a Monday.
 *
 * Props:
 *   value    – ISO date "YYYY-MM-DD" (with `week`: any day of the week)
 *   onChange – (iso: string) => void
 *   max      – ISO upper bound; defaults to today. Pass null for no bound.
 *              With `week`, «next» stays enabled while the next week still
 *              starts on or before it.
 *   week     – step whole weeks (see above)
 *   compactUntil – with `week`: the breakpoint the numeric label gives way to
 *              the spelled-out one — "sm" (default) or "xl", for a page whose
 *              toolbar is too narrow on a laptop for the long label (/kelish).
 *   dotPrev / dotNext – a reason to look that way: draws a brand dot on the
 *              chevron and adds the text to its label (e.g. «today's list is
 *              in the next week»). Null = no dot.
 */

const pad2 = (n) => String(n).padStart(2, "0");
const toISO = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

function addDaysISO(iso, n) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return toISO(d);
}

function mondayOf(iso) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return toISO(d);
}

export default function DayStepper({
  value, onChange, max = toISO(new Date()), week = false, dotPrev = null, dotNext = null,
  compactUntil = "sm",
}) {
  const { t } = useLang();
  const step = week ? 7 : 1;
  const from = week ? mondayOf(value) : value;
  const to = week ? addDaysISO(from, 6) : value;
  const atMax = max != null && (week ? addDaysISO(from, step) > max : value >= max);
  const prevLabel = [t(week ? "ui.dayStepper.prevWeek" : "ui.dayStepper.prev"), dotPrev].filter(Boolean).join(" · ");
  const nextLabel = [t(week ? "ui.dayStepper.nextWeek" : "ui.dayStepper.next"), dotNext].filter(Boolean).join(" · ");
  // Square 38px chevrons: the toolbar baseline every control beside them sits
  // on (the date trigger, FilterPanel, SearchInput), and a thumb-sized target —
  // `p-2` around a 15px icon was a 33px button a notch lower than its row.
  const btn = "relative grid place-items-center w-[38px] h-[38px] rounded-xl flex-shrink-0 transition-colors hover:bg-[var(--bg-inner)] disabled:hover:bg-[var(--bg-card)] disabled:cursor-default";
  const dot = (
    <span
      aria-hidden="true"
      className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full"
      style={{ background: "var(--brand)", boxShadow: "0 0 0 2px var(--bg-card)" }}
    />
  );

  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <button
        type="button"
        onClick={() => onChange(addDaysISO(from, -step))}
        aria-label={prevLabel}
        title={prevLabel}
        className={btn}
        style={{ background: "var(--bg-card)", border: "1px solid var(--border-md)", color: "var(--text-2)" }}
      >
        <ChevronLeft size={16} />
        {dotPrev && dot}
      </button>
      <DateRangePicker
        single
        weekday={!week}
        compactLabel={week && (compactUntil === "xl" ? "xl" : true)}
        max={max}
        dateFrom={from}
        dateTo={to}
        setDateFrom={(v) => v && onChange(week ? mondayOf(v) : v)}
        setDateTo={() => {}}
        triggerClassName="px-3 py-2 text-sm"
      />
      <button
        type="button"
        onClick={() => onChange(addDaysISO(from, step))}
        disabled={atMax}
        aria-label={nextLabel}
        title={nextLabel}
        className={btn}
        style={{ background: "var(--bg-card)", border: "1px solid var(--border-md)", color: "var(--text-2)", opacity: atMax ? 0.4 : 1 }}
      >
        <ChevronRight size={16} />
        {dotNext && !atMax && dot}
      </button>
    </div>
  );
}
