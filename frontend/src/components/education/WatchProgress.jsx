import { CheckCircle2 } from "lucide-react";
import { useLang } from "../../context/LangContext";

/** ``634`` → ``"10:34"``. The client twin of
 *  ``services/education_progress.fmt_clock``, and it must stay one: the bar and
 *  the workbook are read about the same lesson by the same people. */
export function clock(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const two = (n) => String(n).padStart(2, "0");
  return h ? `${h}:${two(m)}:${two(sec)}` : `${m}:${two(sec)}`;
}

/**
 * How much of this lesson the viewer has watched.
 *
 * **Only 100% counts as watched** (the operator's rule, 2026-09-10;
 * ``services/education_progress.COMPLETE_AT``), so the bar always carries the
 * PERCENTAGE beside the flag. Without it a 99% watch and a lesson nobody opened
 * wear the same un-ticked mark, and a leader who is one second short has no way
 * to tell which of the two they are — which is the one thing a strict threshold
 * has to make legible.
 *
 * Green means done, because done is a status. Everything short of it is brand
 * gold: an accent on a single metric, never a verdict — there is no threshold
 * below 100% for this to have an opinion about.
 */
export default function WatchProgress({ pct = 0, complete = false, coveredS = 0, totalS = 0 }) {
  const { t } = useLang();
  const value = Math.max(0, Math.min(100, Math.round((Number(pct) || 0) * 100)));
  const tone = complete ? "#22c55e" : "var(--brand)";

  return (
    <div
      className="rounded-xl px-3 py-2.5"
      style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: "var(--text-2)" }}>
          {complete && <CheckCircle2 size={14} style={{ color: tone }} aria-hidden />}
          {complete ? t("education.watch.done") : t("education.watch.progress")}
        </span>
        <span className="text-xs font-semibold tabular-nums" style={{ color: tone }}>
          {value}%
        </span>
      </div>

      <div
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full"
        style={{ background: "var(--bg-card)" }}
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${value}%`, background: tone }}
        />
      </div>

      {totalS > 0 && (
        <p className="mt-1.5 text-[11px] tabular-nums" style={{ color: "var(--text-4)" }}>
          {clock(coveredS)} / {clock(totalS)}
        </p>
      )}
      {/* The rule, said where the number is. A threshold nobody was told about
          reads as a broken bar the first time somebody stops at 98%. */}
      {!complete && (
        <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-3)" }}>
          {t("education.watch.rule")}
        </p>
      )}
    </div>
  );
}
