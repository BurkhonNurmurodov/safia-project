import { CalendarDays } from "lucide-react";
import { SectionHead } from "../ui/DataTable";
import { SkeletonBlock } from "../ui/Skeleton";
import { useLang } from "../../context/LangContext";
import { NATIJA_T, shortDate } from "./natijaText";

/**
 * «Kunlarim» — a leader's days of the page's period as a CALENDAR (Natijam, a
 * leader's phone, 2026-11-20). It replaces, for that reader alone, the
 * «Oxirgi hisobotlar» card list: nine cards that each printed the leader's own
 * name, their brigadir and «0 ta vazifa bajarilmadi» to say one thing per day —
 * how that day went. Here a day is one tile: its date, its score, and the
 * score's band as a bar under it; a tap opens that day's report
 * (`/leaders/report/:uid`, the page the verification DMs land on).
 *
 * Nothing is scored here. `days` arrives built by Leaders.jsx through the
 * page's ONE rule (`slotsBy`, `countCap`): a day after the last counted one is
 * hatched and carries no number, an excluded day is neutral, a day nobody
 * filed is a red «—» — exactly the register's calendar, drawn for one person.
 *
 * Weeks run Monday → Sunday, so a week reads as the leader lives it. The
 * tiles are 44px+ tall; seven abreast cannot also be 44px wide at 320px, the
 * calendar exception every day picker on the platform makes.
 */

const HATCH = "repeating-linear-gradient(45deg, var(--bg-inner), var(--bg-inner) 5px, transparent 5px, transparent 10px)";
const C_BAD = "#F43F5E";

const weekdayIdx = (iso) => (new Date(`${iso}T00:00:00`).getDay() + 6) % 7;

function DayTile({ day, color, T, lang, onPick }) {
  const n = Number(day.date.slice(8, 10));
  const tappable = day.state === "today" || day.reports.length > 0;
  const band = day.state === "ok" ? color(day.pct)
    : day.state === "missed" ? C_BAD : null;
  const said = day.state === "ok" ? `${day.pct}%`
    : day.state === "missed" ? T.dayMissed
      : day.state === "off" ? T.dayOff
        : day.state === "void" ? T.dayVoid
          : day.state === "today" ? T.dayToday : T.dayLater;
  const hatched = day.state === "later" || day.state === "today";
  const body = (
    <>
      <span className="text-[12px] leading-none tabular-nums"
        style={{ color: day.state === "today" ? "var(--text-1)" : "var(--text-3)",
                 fontWeight: day.state === "today" ? 700 : 500 }}>{n}</span>
      <span className="text-[13px] font-bold leading-none tabular-nums"
        style={{ color: day.state === "ok" ? "var(--text-1)" : "var(--text-3)" }}>
        {day.state === "ok" ? `${day.pct}%` : hatched ? "" : "—"}
      </span>
      {/* The verdict as a fill, never as coloured text: an amber number on an
          amber tint fails contrast in the light theme. */}
      <span aria-hidden="true" className="absolute inset-x-1.5 bottom-1 h-[3px] rounded-full"
        style={{ background: band || "transparent" }} />
    </>
  );
  const cls = "relative w-full h-12 rounded-lg flex flex-col items-center justify-center gap-1.5 min-w-0";
  const style = {
    background: hatched ? HATCH : band ? `${band}1a` : "var(--bg-inner)",
    border: `1px solid ${day.state === "today" ? "var(--text-3)" : "var(--border)"}`,
  };
  const label = `${shortDate(day.date, lang)}: ${said}`;
  return tappable ? (
    <button type="button" onClick={() => onPick(day)} aria-label={label} title={label}
      className={`${cls} transition-[filter] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]`}
      style={style}>
      {body}
    </button>
  ) : (
    <div role="img" aria-label={label} title={label} className={cls} style={style}>{body}</div>
  );
}

export default function NatijaDays({ days, avg, hasAvg, loading, color, onPick }) {
  const { lang } = useLang();
  const T = NATIJA_T[lang] || NATIJA_T.uz;

  // Monday-first weeks: blanks before the first day and after the last.
  const cells = [];
  if (days?.length) {
    for (let i = 0; i < weekdayIdx(days[0].date); i++) cells.push(null);
    cells.push(...days);
    while (cells.length % 7) cells.push(null);
  }

  return (
    <section aria-label={T.myDays} className="rounded-2xl overflow-hidden mb-4"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <SectionHead icon={CalendarDays} title={T.myDays}
        right={hasAvg ? (
          <span className="inline-flex items-baseline gap-1.5 text-[12px]" style={{ color: "var(--text-3)" }}>
            {T.avg}
            <span className="inline-flex items-center gap-1.5 text-[15px] font-bold tabular-nums"
              style={{ color: "var(--text-1)" }}>
              <span aria-hidden="true" className="w-2 h-2 rounded-full" style={{ background: color(avg) }} />
              {avg}%
            </span>
          </span>
        ) : null} />
      <div className="p-2">
        <div className="grid grid-cols-7 gap-1 mb-1" aria-hidden="true">
          {T.week.map((w) => (
            <span key={w} className="text-center text-[12px] font-medium py-0.5" style={{ color: "var(--text-3)" }}>{w}</span>
          ))}
        </div>
        {/* While the register loads every day would read «not filed» — so the
            weeks stand as skeletons of their final size until it answers. */}
        {loading ? (
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: Math.max(7, cells.length) }, (_, i) => <SkeletonBlock key={i} className="h-12 rounded-lg" />)}
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => (d
              ? <DayTile key={d.date} day={d} color={color} T={T} lang={lang} onPick={onPick} />
              : <span key={`b${i}`} aria-hidden="true" />))}
          </div>
        )}
      </div>
    </section>
  );
}
