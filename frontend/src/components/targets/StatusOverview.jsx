// The board's answer to «is everything all right?», counted over the goals the
// search and filters left on screen (never over a total the reader cannot see):
// the average progress, one bar split by status, the four groups with their
// counts — and, one tap away, the rule that decides a status.
import { useState } from "react";
import { Info, ChevronDown } from "lucide-react";
import { StatusChip } from "./bits";
import { GROUP_ICON, groupColor } from "./targetsUi";
import { GREEN, AMBER, RED } from "../../utils/statusBands";
import { GROUPS, GREY, PACE, fmtPct, fill } from "../../utils/targets";

// Worst first, so the red end of the bar is where the eye starts.
const SEGMENTS = [
  ["overdue", RED], ["behind", RED], ["at_risk", AMBER],
  ["on_track", GREEN], ["not_started", GREY], ["achieved", GREEN],
];

export default function StatusOverview({ rows, total, t, saveSlot = null }) {
  const [rulesOpen, setRulesOpen] = useState(false);
  const n = rows.length;
  const counts = {};
  rows.forEach((r) => { counts[r.st] = (counts[r.st] ?? 0) + 1; });
  const avg = n ? rows.reduce((s, r) => s + r.p, 0) / n : 0;
  const segs = SEGMENTS.filter(([st]) => counts[st]);
  const countLine = n === total
    ? fill(t("targets.overview.count"), { n })
    : fill(t("targets.overview.countOf"), { n, total });

  return (
    <section
      className="rounded-2xl p-4 sm:p-5"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      aria-label={t("targets.overview.title")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-3xl font-bold tabular-nums leading-none" style={{ color: "var(--text-1)" }}>
            {fmtPct(avg)}
          </span>
          <div className="min-w-0 leading-tight">
            <div className="text-sm font-medium" style={{ color: "var(--text-2)" }}>{t("targets.overview.avg")}</div>
            <div className="text-xs mt-0.5" style={{ color: "var(--text-2)" }}>{countLine}</div>
          </div>
        </div>
        {saveSlot}
      </div>

      {/* One bar, split by status — solid segments with a hairline seam. */}
      <div className="mt-4 flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full" style={{ background: "var(--bg-accent)" }} aria-hidden>
        {segs.map(([st, c]) => (
          <span key={st} className="h-full" style={{ flexGrow: counts[st], flexBasis: 0, background: c }} />
        ))}
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
        {GROUPS.map((g) => {
          const c = g.statuses.reduce((s, st) => s + (counts[st] ?? 0), 0);
          const Icon = GROUP_ICON[g.key];
          const color = c ? groupColor(g.key, counts) : "var(--text-4)";
          return (
            <li key={g.key} className="flex items-center gap-2 text-sm whitespace-nowrap">
              <Icon size={15} strokeWidth={2.3} className="flex-shrink-0" style={{ color }} aria-hidden />
              <span className="font-semibold tabular-nums" style={{ color: c ? "var(--text-1)" : "var(--text-4)" }}>{c}</span>
              <span style={{ color: c ? "var(--text-2)" : "var(--text-4)" }}>{t(`targets.group.${g.key}`)}</span>
            </li>
          );
        })}
      </ul>

      <div className="mt-3">
        <button
          type="button"
          onClick={() => setRulesOpen((o) => !o)}
          aria-expanded={rulesOpen}
          className="inline-flex items-center gap-1.5 text-xs font-medium rounded-lg -mx-1 px-1 py-1 transition-colors hover:text-[var(--text-1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
          style={{ color: "var(--text-2)" }}
        >
          <Info size={13} aria-hidden />
          {t("targets.rules.toggle")}
          <ChevronDown size={13} aria-hidden style={{ transform: rulesOpen ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
        </button>
        {rulesOpen && (
          <div className="mt-2 space-y-2 text-xs leading-relaxed" style={{ color: "var(--text-2)" }}>
            <p>{t("targets.rules.intro")}</p>
            <ul className="space-y-1.5">
              {["on_track", "at_risk", "behind", "overdue", "not_started", "achieved"].map((st) => (
                <li key={st} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <StatusChip status={st} t={t} />
                  <span>{fill(t(`targets.rules.${st}`), { grace: Math.round(PACE.grace * 100), risk: Math.round(PACE.risk * 100) })}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
