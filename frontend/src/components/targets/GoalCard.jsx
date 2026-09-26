// One goal on the board. The WHOLE card opens the goal's page (the title is a
// link stretched over the card); the one other control on it is «Update»,
// which opens the quick update dialog. Every figure comes from utils/targets —
// the card computes nothing of its own.
//
// Colour means STATUS and nothing else: the chip, the big percent and the bar
// fill. The area is an icon and a word, never a colour.
import { Link } from "react-router-dom";
import { RefreshCw, UserRound, CalendarDays } from "lucide-react";
import Button from "../ui/Button";
import { StatusChip, AreaTag, PaceBar, PlanTick, KrValue } from "./bits";
import { paceCaption } from "./targetsUi";
import { useLang } from "../../context/LangContext";
import { AMBER, RED } from "../../utils/statusBands";
import { shortPerson } from "../../utils/personName";
import {
  goalProgress, goalStatus, elapsed, daysLeft, targetProgress, targetStatus,
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
export function GoalMeta({ goal, st, today, t, full = false, className = "" }) {
  const left = daysLeft(goal, today);
  const owner = goal.owner?.trim();
  const icon = { color: "var(--text-3)" };
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-xs ${className}`} style={{ color: "var(--text-2)" }}>
      <AreaTag category={goal.category} t={t} iconStyle={icon} />
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

// The goal's headline row: the percent done (status colour), the pace bar and
// the caption. `big` is the goal page's larger cut of the same row.
export function PaceRow({ p, e, st, t, big = false, ring }) {
  const color = STATUS_COLOR[st];
  const cap = paceCaption({ st, p, e, t });
  const aria = e === null
    ? fill(t("targets.pace.ariaDone"), { p: fmtPct(p) })
    : fill(t("targets.pace.aria"), { p: fmtPct(p), e: fmtPct(e) });
  return (
    <div>
      <div className="flex items-center gap-3">
        <span
          className={`font-bold tabular-nums leading-none flex-shrink-0 ${big ? "text-3xl w-[5.5rem]" : "text-2xl w-[4.25rem]"}`}
          style={{ color }}
        >
          {fmtPct(p)}
        </span>
        <PaceBar
          progress={p} expected={st === "achieved" ? null : e} color={color} height={big ? 10 : 8}
          label={aria} ring={ring} className="flex-1 min-w-0"
        />
      </div>
      {/* Full width in a narrow box, so it stays one line; under the bar once
          the box is wide enough (the parent is a @container). */}
      <div
        className={`mt-2 flex items-start gap-2 ${big ? "text-xs @md:text-sm @md:pl-[6.25rem]" : "text-xs @md:pl-[5rem]"}`}
        style={{ color: "var(--text-2)" }}
      >
        {cap.plan ? (
          <>
            <PlanTick className={big ? "mt-[2.5px] @md:mt-[4.5px]" : "mt-[2.5px]"} />
            <span className="min-w-0">
              {cap.plan}
              <span className="font-medium" style={{ color: "var(--text-1)" }}> · {cap.tail}</span>
            </span>
          </>
        ) : (
          <span>{cap.text}</span>
        )}
      </div>
    </div>
  );
}

export default function GoalCard({ goal, today, onUpdate }) {
  const { t } = useLang();
  const p = goalProgress(goal);
  const st = goalStatus(goal, today);
  const e = elapsed(goal, today);
  const targets = goal.targets ?? [];
  const done = targets.filter((tg) => targetProgress(tg) >= 1).length;
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
        <GoalMeta goal={goal} st={st} today={today} t={t} />
      </div>

      <PaceRow p={p} e={e} st={st} t={t} />

      {rows.length > 0 && (
        <ul className="pt-3 space-y-2" style={{ borderTop: "1px solid var(--border)" }}>
          {rows.map((tg) => (
            <li key={tg.id} className="flex items-center gap-2 text-[13px] min-w-0">
              <span
                aria-hidden
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: STATUS_COLOR[targetStatus(tg, goal, today)] }}
              />
              <span className="truncate flex-1 min-w-0" style={{ color: "var(--text-2)" }} title={tg.title}>{tg.title}</span>
              <KrValue tg={tg} t={t} className="flex-shrink-0" />
            </li>
          ))}
          {targets.length > MAX_ROWS && (
            <li className="text-xs pl-4" style={{ color: "var(--text-2)" }}>
              {fill(t("targets.moreResults"), { n: targets.length - MAX_ROWS })}
            </li>
          )}
        </ul>
      )}

      <div className="mt-auto flex items-center justify-between gap-2">
        <span className="text-xs" style={{ color: "var(--text-2)" }}>
          {fill(t("targets.resultsDone"), { done, total: targets.length })}
        </span>
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
