import { ChevronLeft, ChevronRight } from "lucide-react";
import DateRangePicker from "./DateRangePicker";

/**
 * Canonical single-day stepper — THE template for "‹ [date] ›" day
 * navigation on daily pages (Daily, ShiftDaily, Production…).
 * Chevron buttons step ±1 day; the label is the app-wide DateRangePicker
 * in single mode (custom calendar — never the native browser picker).
 *
 * Props:
 *   value    – ISO date "YYYY-MM-DD"
 *   onChange – (iso: string) => void
 *   max      – ISO upper bound; defaults to today. Pass null for no bound.
 */

const pad2 = (n) => String(n).padStart(2, "0");
const toISO = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

function addDaysISO(iso, n) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export default function DayStepper({ value, onChange, max = toISO(new Date()) }) {
  const atMax = max != null && value >= max;

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={() => onChange(addDaysISO(value, -1))}
        className="p-2 rounded-lg"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border-md)", color: "var(--text-3)" }}
      >
        <ChevronLeft size={15} />
      </button>
      <DateRangePicker
        single
        weekday
        max={max}
        dateFrom={value}
        dateTo={value}
        setDateFrom={(v) => v && onChange(v)}
        setDateTo={() => {}}
        triggerClassName="px-3 py-2 text-sm"
      />
      <button
        onClick={() => onChange(addDaysISO(value, 1))}
        disabled={atMax}
        className="p-2 rounded-lg"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border-md)", color: "var(--text-3)", opacity: atMax ? 0.4 : 1 }}
      >
        <ChevronRight size={15} />
      </button>
    </div>
  );
}
