import { ChevronLeft, ChevronRight } from "lucide-react";
import DateRangePicker from "./DateRangePicker";
import { useLang } from "../../context/LangContext";

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
  const { t } = useLang();
  const atMax = max != null && value >= max;
  // Square 38px chevrons: the toolbar baseline every control beside them sits
  // on (the date trigger, FilterPanel, SearchInput), and a thumb-sized target —
  // `p-2` around a 15px icon was a 33px button a notch lower than its row.
  const btn = "grid place-items-center w-[38px] h-[38px] rounded-xl flex-shrink-0 transition-colors hover:bg-[var(--bg-inner)] disabled:hover:bg-[var(--bg-card)] disabled:cursor-default";

  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <button
        type="button"
        onClick={() => onChange(addDaysISO(value, -1))}
        aria-label={t("ui.dayStepper.prev")}
        title={t("ui.dayStepper.prev")}
        className={btn}
        style={{ background: "var(--bg-card)", border: "1px solid var(--border-md)", color: "var(--text-2)" }}
      >
        <ChevronLeft size={16} />
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
        type="button"
        onClick={() => onChange(addDaysISO(value, 1))}
        disabled={atMax}
        aria-label={t("ui.dayStepper.next")}
        title={t("ui.dayStepper.next")}
        className={btn}
        style={{ background: "var(--bg-card)", border: "1px solid var(--border-md)", color: "var(--text-2)", opacity: atMax ? 0.4 : 1 }}
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
