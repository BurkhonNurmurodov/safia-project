// «Jamoalar» → «Soatlik» (2026-11-12, the operator): how many of each container
// every team needs in ONE hour — by default the NEXT one, so at 08:00 the page
// shows what 09–10 needs (the operator, same day: «I don't need all day or one
// shift, just show hourly and one hour before»). An hour picker steps to others. See docs/production-quantities.md «Hourly containers».
//
// The timeline is DERIVED: a team works through its positions in «Navbat»
// order (then №), one after another — equal «Navbat» lines together — from its cell's shift start. A line
// takes  total_labor ÷ N ÷ (productive_min ÷ shift_min)  clock minutes — its
// standard minutes shared by the team's N people at the unit's productive pace
// (the 85% the загрузка file uses). Its containers are needed as it is made, so
// an hour gets the containers for the share of the line made inside it.
//
// Rounding keeps the day's total: an hour's count is
//   ROUNDUP(made by the hour's end ÷ capacity) − ROUNDUP(made by its start ÷ capacity)
// so the hours add up to exactly the line's daily count (`containerCount`).
import { useEffect, useMemo, useState } from "react";
import SegmentedToggle from "../ui/SegmentedToggle";
import { Clock } from "lucide-react";

const DAY = 1440;
const toMin = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm ?? ""));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const clock = (min) => {
  const m = ((Math.round(min) % DAY) + DAY) % DAY;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
const hourLabel = (h) => String(((h % 24) + 24) % 24).padStart(2, "0");
const ceil6 = (x) => Math.ceil(Math.round(x * 1e6) / 1e6);

// Tashkent wall clock now, as {iso, min}.
const tashkentNow = () => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tashkent", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { iso: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute) };
};
const prevISO = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d - 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
};

/** One team's timeline: {start, end, shiftEnd, hours: Map(h → {cid → n}),
 *  untimed: {cid → n}, people, src}. Minutes count from the day's midnight and
 *  run past 1440 for a shift that crosses it. */
export function teamTimeline({ rows, people, startHHMM, endHHMM, eff, containers }) {
  const start = toMin(startHHMM) ?? 8 * 60;
  let shiftEnd = toMin(endHHMM);
  if (shiftEnd != null && shiftEnd <= start) shiftEnd += DAY;
  const hours = new Map();
  const untimed = {};
  const add = (h, cid, n) => {
    if (!n) return;
    let e = hours.get(h);
    if (!e) { e = {}; hours.set(h, e); }
    e[cid] = (e[cid] ?? 0) + n;
  };
  let cur = start;
  const N = Number(people) || 0;
  // «Navbat» first (the team's typed order for the day), then № for the lines
  // nobody ordered. Lines sharing one «Navbat» are made AT THE SAME TIME: the
  // team splits over them so they finish together, i.e. the step lasts their
  // summed minutes and each line is spread over the whole step.
  const ordered = [...rows].sort((a, b) =>
    (a.priority ?? Infinity) - (b.priority ?? Infinity) || (a.seq ?? 0) - (b.seq ?? 0));
  const steps = [];
  for (const r of ordered) {
    const last = steps[steps.length - 1];
    if (r.priority != null && last && last.prio === r.priority) last.rows.push(r);
    else steps.push({ prio: r.priority ?? null, rows: [r] });
  }
  for (const step of steps) {
    const timed = [];
    for (const r of step.rows) {
      const plan = Number(r.plan_qty);
      if (!(plan > 0)) continue;
      const caps = containers.filter((c) => Number(r[c.field]) > 0);
      if (N > 0 && Number(r.total_labor) > 0) { timed.push({ r, plan, caps }); continue; }
      for (const c of caps) untimed[c.id] = (untimed[c.id] ?? 0) + ceil6(plan / Number(r[c.field]));
    }
    if (!timed.length) continue;
    const dur = timed.reduce((sum, x) => sum + Number(x.r.total_labor), 0) / N / eff;
    const t0 = cur, t1 = cur + dur;
    for (const { r, plan, caps } of timed) {
      if (!caps.length) continue;
      for (let h = Math.floor(t0 / 60); h * 60 < t1; h++) {
        const a = Math.max(t0, h * 60), b = Math.min(t1, (h + 1) * 60);
        const qa = plan * (a - t0) / dur, qb = plan * (b - t0) / dur;
        for (const c of caps) {
          const cap = Number(r[c.field]);
          add(h, c.id, ceil6(qb / cap) - ceil6(qa / cap));
        }
      }
    }
    cur = t1;
  }
  return { start, end: cur, shiftEnd, hours, untimed };
}

export default function HourlyContainers({ teams, rows, constants, date, containers, t, fmt, renderTeam }) {
  const eff = (() => {
    const s = Number(constants?.shift_min) || 480;
    const p = Number(constants?.productive_min) || 408;
    const e = p / s;
    return e > 0 && e <= 1.5 ? e : 0.85;
  })();
  const unitHours = constants?.shift_hours ?? null;
  const [picked, setPicked] = useState(null);
  // Re-read the clock every minute, so a page left open moves on to the next
  // hour by itself at the top of the hour.
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 60000);
    return () => clearInterval(id);
  }, []);

  const lines = useMemo(() => {
    const norm = (v) => String(v ?? "").trim().toUpperCase();
    return teams.map((team) => {
      const { w, g, rest } = team;
      const code = norm(w.work_center);
      const mine = rows.filter((r) => norm(r.work_center) === code
        && (g ? r.wc_group === g.group : rest ? !r.wc_group : true));
      const cell = (g ? g.cell : w.cell) ?? w.cell;
      const hrs = cell?.shift_hours ?? unitHours;
      const people = g ? g.people : w.people;
      return { team, tl: teamTimeline({ rows: mine, people, startHHMM: hrs?.start, endHHMM: hrs?.end, eff, containers }) };
    }).filter(({ tl }) => tl.hours.size > 0);
  }, [teams, rows, unitHours, eff, containers]);

  if (lines.length === 0) {
    return <p className="text-[12px] px-1 py-2" style={{ color: "var(--text-3)" }}>{t("production.hourly.none")}</p>;
  }

  // The hour to get ready for: at 08:xx the 09–10 hour. A night shift's hours
  // run past 24, so yesterday's page seen after midnight reads now + 24h.
  const now = tashkentNow();
  const nowMin = date === now.iso ? now.min : date === prevISO(now.iso) ? now.min + DAY : null;
  const prepHour = nowMin == null ? null : Math.floor(nowMin / 60) + 1;
  const lo = Math.min(...lines.flatMap(({ tl }) => [...tl.hours.keys()]));
  const hi = Math.max(...lines.flatMap(({ tl }) => [...tl.hours.keys()]));
  const clamp = (h) => Math.min(hi, Math.max(lo, h));
  const hour = picked != null && picked >= lo && picked <= hi ? picked : clamp(prepHour ?? lo);
  const hourOpts = [];
  for (let h = lo; h <= hi; h++) hourOpts.push({ value: h, label: `${hourLabel(h)}–${hourLabel(h + 1)}` });

  // One card per container, the teams needing it in this hour — the
  // «Konteynerlar» view's layout, read for one hour instead of the day.
  const cards = containers.map((c) => {
    const list = lines.map(({ team, tl }) => ({ team, n: tl.hours.get(hour)?.[c.id] ?? 0 })).filter((x) => x.n > 0);
    return { c, list, total: list.reduce((s, x) => s + x.n, 0) };
  }).filter((x) => x.list.length > 0);
  const isPrep = hour === prepHour;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <SegmentedToggle size="sm" value={hour} onChange={setPicked} options={hourOpts} />
        <span className="flex items-center gap-1.5 text-xs" style={{ color: isPrep ? "var(--brand-text)" : "var(--text-3)" }}>
          <Clock size={13} className="shrink-0" />
          {isPrep
            ? t("production.hourly.prepNow").replace("{at}", clock((hour - 1) * 60)).replace("{span}", `${clock(hour * 60)}–${clock((hour + 1) * 60)}`)
            : t("production.hourly.forHour").replace("{span}", `${clock(hour * 60)}–${clock((hour + 1) * 60)}`)}
        </span>
      </div>
      {cards.length === 0 ? (
        <p className="text-[12px] px-1 py-2" style={{ color: "var(--text-3)" }}>{t("production.hourly.noneThisHour")}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {cards.map(({ c, list, total }) => (
            <div key={c.id} className="rounded-xl p-3" style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
              <div className="flex items-baseline justify-between gap-2 pb-2 mb-1.5" style={{ borderBottom: "1px solid var(--border)" }}>
                <span className="text-sm font-semibold min-w-0" style={{ color: "var(--text-1)" }}>{t(`production.cont.${c.id}`)}</span>
                <span className="flex items-baseline gap-1.5 shrink-0">
                  <span className="text-[11px]" style={{ color: "var(--text-3)" }}>{t("production.cont.total")}</span>
                  <span className="text-base font-bold tabular-nums" style={{ color: "var(--text-1)" }}>{fmt(total, 0)}</span>
                </span>
              </div>
              <ul className="flex flex-col">
                {list.map(({ team, n }) => (
                  <li key={`${team.w.work_center}|${team.g?.group ?? ""}|${team.rest ? 1 : 0}`}
                    className="flex items-center justify-between gap-2 min-h-[30px]">
                    <span className="flex items-center gap-1.5 min-w-0">{renderTeam(team)}</span>
                    <span className="text-sm font-semibold tabular-nums shrink-0" style={{ color: "var(--text-1)" }}>{fmt(n, 0)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      <p className="text-[11px] px-1" style={{ color: "var(--text-3)" }}>
        {t("production.hourly.howto").replace("{pct}", Math.round(eff * 100))}
      </p>
    </div>
  );
}
