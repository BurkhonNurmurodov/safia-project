import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useLang } from "../../context/LangContext";

/**
 * Canonical single-day stepper — THE template for "‹ [date] ›" day
 * navigation on daily pages (Daily, ShiftDaily, Production…).
 * Chevron buttons step ±1 day; clicking the label opens the native
 * date picker (hidden input) for a direct jump.
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

function fmtLongLocalized(iso, t) {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  const dayIdx = (d.getDay() + 6) % 7;
  return `${t(`cal.d${dayIdx}`)}, ${d.getDate()} ${t(`cal.mg${d.getMonth()}`)} ${d.getFullYear()}`;
}

export default function DayStepper({ value, onChange, max = toISO(new Date()) }) {
  const { t } = useLang();
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
      <label
        className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm cursor-pointer"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}
      >
        <CalendarDays size={14} style={{ color: "var(--text-4)" }} />
        <span className="whitespace-nowrap">{fmtLongLocalized(value, t)}</span>
        <input
          type="date"
          value={value}
          max={max ?? undefined}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          className="sr-only"
        />
      </label>
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
