// One goal on the board. The WHOLE card opens the goal's page (the title is a
// link stretched over the card); the one other control on it is «Update»,
// which opens the quick update dialog. Every figure comes from utils/targets —
// the card computes nothing of its own.
//
// Colour means STATUS and nothing else: the chip, the bar fill, the little
// trend beside each result. Figures stay in text ink. The area is not on the
// card at all — it is a filter, and it is on the goal's page.
import { Link } from "react-router-dom";
import { RefreshCw, UserRound, CalendarDays, History } from "lucide-react";
import Button from "../ui/Button";
import { StatusChip, AreaTag, PaceBar, KrValue } from "./bits";
import Sparkline from "./Sparkline";
import SegmentBar from "./charts/SegmentBar";
import { MARK_COLOR } from "./charts/chartKit";
import { useLang } from "../../context/LangContext";
import { AMBER, RED } from "../../utils/statusBands";
import { shortPerson } from "../../utils/personName";
import {
  goalProgress, goalStatus, elapsed, daysLeft, targetStatus, series, lastActivity, dayDiff, isNumeric,
  fmtPct, fmtDate, fill, STATUS_COLOR,
} from "../../utils/targets";

const MAX_ROWS = 3;

// «12 kun qoldi» / «Bugun oxirgi kun» / «3 kun kechikdi» — red once the date
// has passed, amber in the last three days, muted otherwise.
export function DaysLeft({ left, t, className = "" }) {
  if (left === null || left === undefined) return null;
  const txt = left < 0
    ? fill(t("targets.daysOver"), { n: -left })
    : left === 0 ? t("targets.dueToday") : fill(t("targets.daysLeft"), { n: left });
  const color = left < 0 ? RED : left <= 3 ? AMBER : "var(--text-2)";
  return <span className={`whitespace-nowrap ${left <= 3 ? "font-medium" : ""} ${className}`} style={{ color }}>{txt}</span>;
}

// Area · owner · due date. Each fact carries its own icon, so the line can wrap
// anywhere on a phone without leaving a dangling separator.
export function GoalMeta({ goal, st, today, t, full = false, area = true, className = "" }) {
  const left = daysLeft(goal, today);
  const owner = goal.owner?.trim();
  const icon = { color: "var(--text-3)" };
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-xs ${className}`} style={{ color: "var(--text-2)" }}>
      {area && <AreaTag category={goal.category} t={t} iconStyle={icon} />}
      {(owner || full) && (
        <span className="inline-flex items-center gap-1.5 min-w-0" title={owner || undefined}>
          <UserRound size={13} strokeWidth={2.2} className="flex-shrink-0" style={icon} aria-hidden />
          <span className="truncate" style={owner ? undefined : { color: "var(--text-3)" }}>
            {owner ? (full ? owner : shortPerson(owner)) : t("targets.noOwner")}
          </span>
        </span>
      )}
      <span className="inline-flex items-center gap-1.5 min-w-0">
        <CalendarDays size={13} strokeWidth={2.2} className="flex-shrink-0" style={icon} aria-hidden />
        {goal.due ? (
          <span className="flex flex-wrap items-center gap-x-1.5">
            <span className="whitespace-nowrap">
              {full && goal.start ? `${fmtDate(goal.start, t, today)} – ${fmtDate(goal.due, t, today)}` : fmtDate(goal.due, t, today)}
            </span>
            {st !== "achieved" && left !== null && (
              <>
                <span aria-hidden style={{ color: "var(--text-4)" }}>·</span>
                <DaysLeft left={left} t={t} />
              </>
            )}
          </span>
        ) : (
          <span>{t("targets.noDates")}</span>
        )}
      </span>
    </div>
  );
}

// The goal's headline: the percent done and a bullet bar — the fill is the
// work done, the upright tick is where the plan says the goal should be today,
// and that plan is written right under the tick, so the mark explains itself.
// `big` is the goal page's larger cut of the same row.
export function PaceRow({ p, e, st, t, big = false, ring }) {
  const showPlan = e !== null && st !== "achieved";
  const ep = showPlan ? Math.round(e * 100) : 0;
  const aria = showPlan
    ? fill(t("targets.pace.aria"), { p: fmtPct(p), e: fmtPct(e) })
    : fill(t("targets.pace.ariaDone"), { p: fmtPct(p) });
  return (
    <div className="flex items-start gap-3">
      <span
        className={`font-bold leading-none flex-shrink-0 ${big ? "text-3xl w-[5.5rem]" : "text-2xl w-[4.25rem]"}`}
        style={{ color: "var(--text-1)" }}
      >
        {fmtPct(p)}
      </span>
      <div className={`flex-1 min-w-0 ${big ? "pt-[7px]" : "pt-[5px]"}`}>
        <PaceBar
          progress={p} expected={showPlan ? e : null} color={STATUS_COLOR[st]} height={big ? 10 : 8}
          label={aria} ring={ring}
        />
        {showPlan && (
          <div className="relative h-4 mt-0.5" aria-hidden>
            <span
              className="absolute top-0 text-[11px] font-medium whitespace-nowrap"
              style={{ left: `${ep}%`, transform: `translateX(${ep < 12 ? "-2px" : ep > 88 ? "calc(-100% + 2px)" : "-50%"})`, color: "var(--text-2)" }}
            >
              {fill(t("targets.planShort"), { e: `${ep}%` })}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// The small picture beside a result: a number's recent path, a task list's
// items as blocks. A yes/no result needs none — its value already says it.
function ResultMicro({ tg, goal, today }) {
  const color = MARK_COLOR[targetStatus(tg, goal, today)];
  if (isNumeric(tg.type)) return <Sparkline points={series(tg, goal)} target={null} width={56} height={18} color={color} />;
  if (tg.type === "tasks") return <SegmentBar items={tg.items} color={color} height={6} className="w-14" />;
  return null;
}

// «updated 3 days ago» — a goal nobody has touched for a week is the one
// most likely to be wrong, so the clock turns amber then.
function LastUpdate({ goal, today, t }) {
  const last = lastActivity(goal);
  const n = last ? Math.max(0, dayDiff(last, today)) : null;
  const text = last === null ? t("targets.lastUpdateNever") : n === 0 ? t("targets.lastUpdateToday") : fill(t("targets.lastUpdate"), { n });
  const stale = last === null || n >= 7;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs min-w-0" style={{ color: "var(--text-2)" }}>
      <History size={13} strokeWidth={2.2} className="flex-shrink-0" style={{ color: stale ? AMBER : "var(--text-3)" }} aria-hidden />
      <span className="truncate">{text}</span>
    </span>
  );
}

export default function GoalCard({ goal, today, onUpdate }) {
  const { t } = useLang();
  const p = goalProgress(goal);
  const st = goalStatus(goal, today);
  const e = elapsed(goal, today);
  const targets = goal.targets ?? [];
  const rows = targets.slice(0, MAX_ROWS);

  return (
    <article
      className="@container relative flex flex-col gap-3 rounded-2xl p-4 border transition-colors border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--border-md)] focus-within:border-[var(--border-md)]"
    >
      <div className="space-y-1.5">
        {/* The chip sits above the title on a NARROW card — the title keeps
            the full width — and beside it once the card is wide enough. Sized by
            the CARD (a container query), not the screen: two columns on a
            tablet make phone-width cards. The title stays first in the DOM, so
            a screen reader names the goal before its status. */}
        <div className="flex flex-col-reverse items-start gap-2 @md:flex-row @md:gap-3">
          <h3 className="self-stretch @md:flex-1 min-w-0 text-[15px] font-semibold leading-snug line-clamp-2 break-words" style={{ color: "var(--text-1)" }}>
            {/* Stretched over the whole card: one tap target, one focus ring. */}
            <Link
              to={`/targets/${encodeURIComponent(goal.id)}`}
              className="outline-none after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-[var(--brand-ring)]"
            >
              {goal.title}
            </Link>
          </h3>
          <StatusChip status={st} t={t} />
        </div>
        <GoalMeta goal={goal} st={st} today={today} t={t} area={false} />
      </div>

      <PaceRow p={p} e={e} st={st} t={t} />

      {rows.length > 0 && (
        <ul className="pt-3 space-y-2.5" style={{ borderTop: "1px solid var(--border)" }}>
          {/* A wide card reads each result on ONE line: name · trend · value.
              A narrow one (a phone, or two columns on a tablet) gives the name
              its own line and puts the value under it, the trend beside both —
              on one line the value took the width and the name was cut to
              «Oylik k…», which names nothing. */}
          {rows.map((tg) => (
            <li
              key={tg.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 text-[13px] @md:grid-cols-[minmax(0,1fr)_3.5rem_auto]"
            >
              <span className="col-start-1 row-start-1 truncate" style={{ color: "var(--text-2)" }} title={tg.title}>{tg.title}</span>
              <span className="col-start-2 row-start-1 row-span-2 @md:row-span-1 flex items-center justify-center" aria-hidden>
                <ResultMicro tg={tg} goal={goal} today={today} />
              </span>
              <KrValue tg={tg} t={t} className="col-start-1 row-start-2 @md:col-start-3 @md:row-start-1 @md:text-right" />
            </li>
          ))}
          {targets.length > MAX_ROWS && (
            <li className="text-xs" style={{ color: "var(--text-2)" }}>
              {fill(t("targets.moreResults"), { n: targets.length - MAX_ROWS })}
            </li>
          )}
        </ul>
      )}

      <div className="mt-auto flex items-center justify-between gap-2">
        <LastUpdate goal={goal} today={today} t={t} />
        {/* Above the stretched link, so it is its own tap. */}
        <Button
          size="lg" variant="secondary" icon={<RefreshCw size={14} />}
          onClick={onUpdate} className="relative z-10 flex-shrink-0"
        >
          {t("targets.update")}
        </Button>
      </div>
    </article>
  );
}
