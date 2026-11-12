// «Jamoalar» → «Soatlik» (2026-11-12, the operator): how many of each container
// every team needs IN EACH HOUR of its shift, so the containers for 09–10 can be
// brought at 08:00. See docs/production-quantities.md «Hourly containers».
//
// The timeline is DERIVED, never typed: a team works through its positions in
// the table's order (№), one after another, from its cell's shift start. A line
// takes  total_labor ÷ N ÷ (productive_min ÷ shift_min)  clock minutes — its
// standard minutes shared by the team's N people at the unit's productive pace
// (the 85% the загрузка file uses). Its containers are needed as it is made, so
// an hour gets the containers for the share of the line made inside it.
//
// Rounding keeps the day's total: an hour's count is
//   ROUNDUP(made by the hour's end ÷ capacity) − ROUNDUP(made by its start ÷ capacity)
// so the hours add up to exactly the line's daily count (`containerCount`).
import { useMemo } from "react";
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
  for (const r of [...rows].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))) {
    const plan = Number(r.plan_qty);
    if (!(plan > 0)) continue;
    const caps = containers.filter((c) => Number(r[c.field]) > 0);
    const dur = N > 0 && Number(r.total_labor) > 0 ? Number(r.total_labor) / N / eff : null;
    if (dur == null) {
      for (const c of caps) untimed[c.id] = (untimed[c.id] ?? 0) + ceil6(plan / Number(r[c.field]));
      continue;
    }
    const t0 = cur, t1 = cur + dur;
    if (caps.length) {
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
      const tl = teamTimeline({ rows: mine, people, startHHMM: hrs?.start, endHHMM: hrs?.end, eff, containers });
      const used = containers.filter((c) => [...tl.hours.values()].some((e) => e[c.id]) || tl.untimed[c.id]);
      return { team, tl, used, people, clockKnown: !!hrs?.start };
    }).filter((x) => x.used.length > 0);
  }, [teams, rows, unitHours, eff, containers]);

  // «Now» on the day shown, and the hour to get ready: at 08:xx the 09–10 hour.
  // A night shift's hours run past 24, so a page for yesterday's date seen
  // after midnight reads now + 24h.
  const now = tashkentNow();
  const nowMin = date === now.iso ? now.min : date === prevISO(now.iso) ? now.min + DAY : null;
  const prepHour = nowMin == null ? null : Math.floor(nowMin / 60) + 1;

  if (lines.length === 0) {
    return <p className="text-[12px] px-1 py-2" style={{ color: "var(--text-3)" }}>{t("production.hourly.none")}</p>;
  }

  // The plant-wide strip on top: every team's hours summed by clock hour.
  const lo = Math.min(...lines.map(({ tl }) => Math.floor(tl.start / 60)));
  const hi = Math.max(...lines.map(({ tl }) => Math.max(...[...tl.hours.keys(), Math.floor(tl.start / 60)])));
  const all = new Map();
  const allUntimed = {};
  for (const { tl } of lines) {
    for (const [h, e] of tl.hours) {
      const o = all.get(h) ?? {};
      for (const [k, n] of Object.entries(e)) o[k] = (o[k] ?? 0) + n;
      all.set(h, o);
    }
    for (const [k, n] of Object.entries(tl.untimed)) allUntimed[k] = (allUntimed[k] ?? 0) + n;
  }
  const allUsed = containers.filter((c) => [...all.values()].some((e) => e[c.id]) || allUntimed[c.id]);

  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-[11px] px-1 flex items-center gap-1.5" style={{ color: "var(--text-3)" }}>
        <Clock size={12} className="shrink-0" />
        <span>{t("production.hourly.howto").replace("{pct}", Math.round(eff * 100))}</span>
      </p>
      {lines.length > 1 && (
        <Matrix title={<span className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>{t("production.hourly.allTeams")}</span>}
          lo={lo} hi={hi} hours={all} untimed={allUntimed} used={allUsed} prepHour={prepHour} nowMin={nowMin}
          t={t} fmt={fmt} />
      )}
      {lines.map(({ team, tl, used, people, clockKnown }) => {
        const tlo = Math.floor(tl.start / 60);
        const thi = Math.max(tlo, ...tl.hours.keys());
        const over = tl.shiftEnd != null && tl.end > tl.shiftEnd + 0.5;
        return (
          <Matrix key={`${team.w.work_center}|${team.g?.group ?? ""}|${team.rest ? 1 : 0}`}
            title={renderTeam(team)}
            sub={
              <span style={{ color: over ? "#ef4444" : "var(--text-3)" }}>
                {clockKnown ? "" : `${t("production.hourly.clockUnknown")} · `}
                {clock(tl.start)} → {clock(tl.end)}
                {people ? ` · ${fmt(people, 1)} ${t("production.hourly.people")}` : ""}
                {over ? ` · ${t("production.hourly.overrun").replace("{end}", clock(tl.shiftEnd))}` : ""}
              </span>
            }
            lo={tlo} hi={thi} hours={tl.hours} untimed={tl.untimed} used={used}
            shiftEnd={tl.shiftEnd} prepHour={prepHour} nowMin={nowMin} t={t} fmt={fmt} />
        );
      })}
    </div>
  );
}

function Matrix({ title, sub, lo, hi, hours, untimed, used, shiftEnd, prepHour, nowMin, t, fmt }) {
  const cols = [];
  for (let h = lo; h <= hi; h++) cols.push(h);
  const hasUntimed = used.some((c) => untimed[c.id]);
  const total = (cid) => cols.reduce((s, h) => s + (hours.get(h)?.[cid] ?? 0), 0) + (untimed[cid] ?? 0);
  const past = (h) => nowMin != null && (h + 1) * 60 <= nowMin;
  const afterShift = (h) => shiftEnd != null && h * 60 >= shiftEnd;
  const cellBg = (h) => (h === prepHour ? "rgba(200,151,63,0.16)" : "transparent");
  return (
    <div className="rounded-xl" style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 pt-2.5 pb-2">
        <span className="flex items-center gap-1.5 min-w-0">{title}</span>
        {sub && <span className="text-[11px] tabular-nums">{sub}</span>}
      </div>
      <div className="overflow-x-auto">
        <table className="text-xs tabular-nums border-collapse w-full">
          <thead>
            <tr>
              <th className="sticky left-0 z-[1] text-left font-medium px-3 py-1.5 whitespace-nowrap"
                style={{ background: "var(--bg-inner)", color: "var(--text-3)", borderTop: "1px solid var(--border)" }}>
                {t("production.hourly.container")}
              </th>
              {cols.map((h) => (
                <th key={h} className="px-2 py-1.5 font-medium text-center whitespace-nowrap"
                  title={h === prepHour ? t("production.hourly.prepHint") : afterShift(h) ? t("production.hourly.afterShift") : undefined}
                  style={{
                    background: cellBg(h), borderTop: "1px solid var(--border)", borderLeft: "1px solid var(--border)",
                    color: h === prepHour ? "var(--brand-text)" : afterShift(h) ? "#ef4444" : past(h) ? "var(--text-4)" : "var(--text-2)",
                  }}>
                  {hourLabel(h)}–{hourLabel(h + 1)}
                  {h === prepHour && <span className="ml-1 text-[10px] font-semibold uppercase">{t("production.hourly.prep")}</span>}
                </th>
              ))}
              {hasUntimed && (
                <th className="px-2 py-1.5 font-medium text-center whitespace-nowrap" title={t("production.hourly.untimedHint")}
                  style={{ borderTop: "1px solid var(--border)", borderLeft: "1px solid var(--border)", color: "#eab308" }}>
                  {t("production.hourly.untimed")}
                </th>
              )}
              <th className="px-3 py-1.5 font-semibold text-right whitespace-nowrap"
                style={{ borderTop: "1px solid var(--border)", borderLeft: "1px solid var(--border)", color: "var(--text-2)" }}>
                {t("production.cont.total")}
              </th>
            </tr>
          </thead>
          <tbody>
            {used.map((c) => (
              <tr key={c.id}>
                <td className="sticky left-0 z-[1] px-3 py-1.5 whitespace-nowrap max-w-[220px] truncate"
                  title={t(`production.cont.${c.id}`)}
                  style={{ background: "var(--bg-inner)", color: "var(--text-1)", borderTop: "1px solid var(--border)" }}>
                  {t(`production.cont.${c.id}`)}
                </td>
                {cols.map((h) => {
                  const n = hours.get(h)?.[c.id] ?? 0;
                  return (
                    <td key={h} className="px-2 py-1.5 text-center"
                      style={{
                        background: cellBg(h), borderTop: "1px solid var(--border)", borderLeft: "1px solid var(--border)",
                        color: n ? (past(h) ? "var(--text-3)" : "var(--text-1)") : "var(--text-4)",
                        fontWeight: n && h === prepHour ? 700 : n ? 600 : 400,
                      }}>
                      {n ? fmt(n, 0) : "·"}
                    </td>
                  );
                })}
                {hasUntimed && (
                  <td className="px-2 py-1.5 text-center"
                    style={{ borderTop: "1px solid var(--border)", borderLeft: "1px solid var(--border)", color: untimed[c.id] ? "#eab308" : "var(--text-4)" }}>
                    {untimed[c.id] ? fmt(untimed[c.id], 0) : "·"}
                  </td>
                )}
                <td className="px-3 py-1.5 text-right font-bold"
                  style={{ borderTop: "1px solid var(--border)", borderLeft: "1px solid var(--border)", color: "var(--text-1)" }}>
                  {fmt(total(c.id), 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
