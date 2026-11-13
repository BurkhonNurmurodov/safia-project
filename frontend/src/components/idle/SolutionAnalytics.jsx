import { createElement, useMemo, useState } from "react";
import {
  ArrowDownRight, ArrowUpRight, CalendarClock, ClipboardCheck, MapPin, Repeat2, Sparkles,
  Target, TrendingDown, UserRound,
} from "lucide-react";
import { SectionHead } from "../ui/DataTable";
import SegmentedToggle from "../ui/SegmentedToggle";
import Button from "../ui/Button";
import EmptyState from "../ui/EmptyState";
import CellLink from "../ui/CellLink";
import { PersonLink } from "../people/peopleUtil";
import useElementWidth from "../../hooks/useElementWidth";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { shortPerson } from "../../utils/personName";
import { bucketTick, trendGrain } from "../../utils/trendBuckets";
import { ROLE_LABEL_KEYS } from "../../config/pages";
import { catColor, iconFor } from "./categories";
import OwnerChip from "./OwnerChip";
import { fill } from "../../pages/idleSolutionsText";

/**
 * «Tahlil» tab of «Kutish yechimlari» (GET /api/idle-solutions/analytics,
 * routers/idle_solutions.py). Written for somebody who does not read charts:
 * every card is a plain QUESTION, answered first in one sentence and only then
 * drawn. Top to bottom — the short summary, «is the waiting going down»,
 * «where does it come from», «when», «do the stops get a solution», «do the
 * solutions work».
 *
 * Two kinds of minutes never share a card: a cause's and a brigadir's are the
 * page's waiting minutes (/downtime's own); a cell's, an hour's and a weekday's
 * are the filed stops' own lengths, worded «to'xtab turdi». Colours: a status
 * (good / bad / waiting) is the traffic-light palette, a cause is its category
 * hue, everything else the gold accent.
 */
const OK = "var(--status-ok)", WARN = "var(--status-warn)", BAD = "var(--status-bad)";
const GREY = "#94a3b8", BLUE = "#3b82f6";
// the five places a stop can stand, in the order it moves through them
const STATES = ["unanswered", "promised", "watch", "held", "back"];
const STATE_INK = { unanswered: GREY, promised: WARN, watch: BLUE, held: OK, back: BAD };

const HEAD = 6;       // rows a long list shows before «N more»
const num = (v) => Math.round(Number(v) || 0).toLocaleString("ru-RU");
const pct = (a, b) => (b > 0 ? Math.round((100 * a) / b) : 0);
const catCode = (n) => String(n || "").replace(/^Cat\s*/i, "");
const ddmm = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : "");
const hh = (h) => `${String(h).padStart(2, "0")}:00`;

/** Change against the period before: null when there is nothing to say. */
function delta(now, before) {
  if (!(before > 0)) return now > 0 ? { kind: "new" } : null;
  const p = Math.round((100 * (now - before)) / before);
  if (Math.abs(p) < 5) return { kind: "same", p: Math.abs(p) };
  return { kind: p < 0 ? "down" : "up", p: Math.abs(p) };
}

/** Less waiting is the good direction: down is green, up is red. */
function DeltaChip({ d, A }) {
  if (!d) return null;
  const ink = d.kind === "down" ? OK : d.kind === "up" ? BAD : "var(--text-3)";
  const Icon = d.kind === "down" ? ArrowDownRight : d.kind === "up" ? ArrowUpRight : null;
  return (
    <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums whitespace-nowrap flex-shrink-0"
      style={{ color: ink }}>
      {Icon && <Icon size={12} strokeWidth={2.4} />}
      {d.kind === "new" ? A.isNew : d.kind === "same" ? A.same : `${d.p}%`}
    </span>
  );
}

function Card({ icon, title, right, children }) {
  return (
    <section className="rounded-2xl overflow-hidden mb-4"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <SectionHead icon={icon} title={title} right={right} />
      <div className="p-4">{children}</div>
    </section>
  );
}

/** The card's answer — the one line a reader may stop at. */
function Answer({ tone, sub, children }) {
  return (
    <div className="mb-4">
      <div className="text-lg font-bold leading-snug" style={{ color: tone || "var(--text-1)" }}>{children}</div>
      {sub && <div className="text-xs mt-1 leading-relaxed" style={{ color: "var(--text-2)" }}>{sub}</div>}
    </div>
  );
}

/** «N more» under a list cut to its head — the rest opens in place, below. */
function More({ T, A, rest, open, onToggle }) {
  if (rest <= 0 && !open) return null;
  return (
    <button type="button" onClick={onToggle} aria-expanded={open}
      className="text-xs mt-2 py-1.5 font-medium" style={{ color: "var(--brand-text)" }}>
      {open ? T.hide : fill(A.more, { n: rest })}
    </button>
  );
}

function Caption({ children }) {
  return <div className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-3)" }}>{children}</div>;
}

function Note({ children }) {
  return <p className="text-[11px] mt-3 leading-relaxed" style={{ color: "var(--text-3)" }}>{children}</p>;
}

function StateChip({ state, children }) {
  const ink = STATE_INK[state] || GREY;
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold whitespace-nowrap flex-shrink-0"
      style={{ color: ink, background: `color-mix(in srgb, ${ink} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${ink} 35%, transparent)` }}>{children}</span>
  );
}

/**
 * A row of columns (days, hours, weekdays). Values are read by pointing at or
 * tapping a column: its line replaces the caption under the chart, which is
 * always there, so nothing moves. `hot` columns carry the accent, the rest are
 * its pale twin; `dim` ones are outside the period.
 */
function Columns({ items, height = 96, caption, labelPx = 40, label }) {
  const [ref, width] = useElementWidth();
  const [active, setActive] = useState(null);
  const max = Math.max(1, ...items.map((x) => x.value));
  const cell = items.length ? width / items.length : 0;
  // labels thin to the measured width, and none starts where it would be cut
  const step = width ? Math.max(1, Math.ceil(labelPx / Math.max(cell, 1))) : 1;
  const shown = active != null ? items[active] : null;
  const anyHot = items.some((x) => x.hot);
  return (
    <div>
      <div ref={ref} className="flex items-end gap-[2px]" style={{ height }} role="img" aria-label={label}
        onMouseLeave={() => setActive(null)}>
        {items.map((x, i) => (
          <div key={x.key} className="flex-1 min-w-0 h-full flex items-end justify-center cursor-default"
            onMouseEnter={() => setActive(i)} onClick={() => setActive(i)}>
            <div className="w-full rounded-t-[3px]"
              style={{
                maxWidth: 34,
                height: x.value > 0 ? `max(3px, ${(100 * x.value) / max}%)` : 2,
                background: !anyHot || x.hot ? "var(--brand)" : "color-mix(in srgb, var(--brand) 32%, transparent)",
                opacity: x.value > 0 ? (x.dim ? 0.35 : 1) : 0.25,
                outline: active === i ? "2px solid var(--text-1)" : "none", outlineOffset: 1,
              }} />
          </div>
        ))}
      </div>
      <div className="flex gap-[2px] mt-1 h-3.5 text-[10px] tabular-nums" style={{ color: "var(--text-3)" }} aria-hidden="true">
        {items.map((x, i) => (
          <div key={x.key} className={`flex-1 min-w-0 whitespace-nowrap overflow-visible ${step === 1 ? "text-center" : ""}`}>
            {x.label && i % step === 0 && (step === 1 || (items.length - i) * cell >= labelPx - 8) ? x.label : ""}
          </div>
        ))}
      </div>
      <div className="text-xs mt-1.5 min-h-[18px] tabular-nums" aria-live="polite"
        style={{ color: shown ? "var(--text-1)" : "var(--text-2)" }}>
        {shown ? shown.tip : caption}
      </div>
    </div>
  );
}

/** A labelled bar — the one mark every breakdown here is drawn with. */
function BarRow({ head, aside, value, frac, color, chip, sub, first }) {
  return (
    <li className="py-2.5" style={{ borderTop: first ? "none" : "1px solid var(--border)" }}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
        <div className="min-w-0 flex-1 basis-full sm:basis-0 flex items-center gap-2">{head}</div>
        <span className="text-sm font-bold tabular-nums whitespace-nowrap flex-shrink-0" style={{ color: "var(--text-1)" }}>{value}</span>
        {chip}
        {aside}
      </div>
      <div className="h-2 rounded-full overflow-hidden mt-1.5" style={{ background: "var(--bg-inner)" }}>
        <div className="h-full rounded-full" style={{ width: `${Math.max(frac > 0 ? 2 : 0, Math.min(100, frac * 100))}%`, background: color }} />
      </div>
      {sub && <div className="text-[11px] mt-1 sm:truncate" style={{ color: "var(--text-3)" }}>{sub}</div>}
    </li>
  );
}

function CauseName({ category, label, strong = true }) {
  const code = catCode(category);
  const hue = catColor(category);
  const name = label(code);
  return (
    <>
      <span className="w-6 h-6 rounded-md inline-flex items-center justify-center flex-shrink-0"
        style={{ background: `color-mix(in srgb, ${hue} 14%, transparent)`, color: hue }}>
        {createElement(iconFor(code), { size: 13 })}
      </span>
      <span className={`text-sm min-w-0 sm:truncate ${strong ? "font-semibold" : ""}`} style={{ color: "var(--text-1)" }}
        title={name ? `${category} — ${name}` : category}>
        {name || category}
        {name ? <span className="font-normal" style={{ color: "var(--text-3)" }}> · {code}</span> : null}
      </span>
    </>
  );
}

/** A cause in running text: «Oborudivaniya buzilishi (B)». */
const causeText = (category, label) => {
  const code = catCode(category);
  const name = label(code);
  return name ? `${name} (${code})` : category;
};

// ── 0. the short summary ─────────────────────────────────────────────────────
function Summary({ A, data, label }) {
  const t = data.total, f = data.funnel;
  const d = delta(t.minutes, t.prev_minutes);
  const lines = [];
  const vars = { m: num(t.minutes), p: num(t.prev_minutes), n: data.days, x: d?.p };
  if (d?.kind === "down") lines.push([OK, fill(A.sumDown, vars)]);
  else if (d?.kind === "up") lines.push([BAD, fill(A.sumUp, vars)]);
  else if (d?.kind === "same") lines.push([GREY, fill(A.sumFlat, vars)]);
  else if (d?.kind === "new") lines.push([GREY, fill(A.sumFirst, vars)]);
  const top = data.by_cause[0];
  if (top && top.minutes > 0) lines.push(["var(--brand)", fill(A.sumTop, { c: causeText(top.category, label), s: Math.round(top.share) })]);
  if (f.stops > 0) {
    lines.push(f.unanswered > 0
      ? [WARN, fill(A.sumUnanswered, { n: f.stops, u: f.unanswered })]
      : [OK, fill(A.sumAllAnswered, { n: f.stops })]);
    lines.push(f.back > 0 ? [BAD, fill(A.sumBack, { b: f.back })]
      : f.held > 0 ? [OK, fill(A.sumHeld, { h: f.held })]
      : [GREY, A.sumEarly]);
  }
  return (
    <Card icon={Sparkles} title={A.sumTitle}
      right={<span className="text-[11px] tabular-nums" style={{ color: "var(--text-3)" }}>{ddmm(data.date_from)} – {ddmm(data.date_to)}</span>}>
      <ul className="space-y-2.5">
        {lines.map(([ink, text], i) => (
          <li key={i} className="flex items-start gap-2.5 text-sm leading-snug" style={{ color: "var(--text-1)" }}>
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-[5px]" style={{ background: ink }} aria-hidden="true" />
            <span>{text}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ── 1. is the waiting going down ─────────────────────────────────────────────
function Trend({ A, T, data }) {
  const t = data.total;
  const d = delta(t.minutes, t.prev_minutes);
  const max = Math.max(t.minutes, t.prev_minutes, 1);
  const grain = trendGrain(data.daily.length);        // a day each up to ~3 months, then weeks
  const points = useMemo(() => {
    if (grain === "day") return data.daily.map((p) => ({ ...p, from: p.day }));
    const out = [];
    let cur = null;
    for (const p of data.daily) {
      const dt = new Date(p.day + "T00:00:00");
      dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
      const key = `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}`;
      if (!cur || cur.key !== key) { cur = { key, day: p.day, from: p.day, minutes: 0, stops: 0, in_period: true }; out.push(cur); }
      cur.minutes += p.minutes;
      cur.stops += p.stops || 0;
    }
    return out;
  }, [data.daily, grain]);
  const peak = points.reduce((best, p) => (p.in_period && p.minutes > (best?.minutes || 0) ? p : best), null);
  const padded = data.daily.some((p) => !p.in_period);
  const items = points.map((p) => ({
    key: p.day, value: p.minutes, dim: !p.in_period, label: bucketTick(p.from, grain),
    tip: fill(p.stops != null ? A.dayTipStops : A.dayTip, { d: ddmm(p.from), m: num(p.minutes), s: p.stops }),
  }));
  const rows = [
    [A.now, `${ddmm(data.date_from)} – ${ddmm(data.date_to)}`, t.minutes, "var(--brand)"],
    [fill(A.before, { n: data.days }), `${ddmm(data.prev_from)} – ${ddmm(data.prev_to)}`, t.prev_minutes, GREY],
  ];
  return (
    <Card icon={TrendingDown} title={A.qTrend}>
      <Answer tone={d?.kind === "down" ? OK : d?.kind === "up" ? BAD : undefined}>
        {d?.kind === "down" ? fill(A.aDown, { x: d.p }) : d?.kind === "up" ? fill(A.aUp, { x: d.p })
          : d?.kind === "same" ? A.aFlat : A.aFirst}
      </Answer>
      <div className="grid grid-cols-[max-content_1fr_max-content] items-center gap-x-3 gap-y-2 mb-5">
        {rows.map(([name, span, v, ink]) => (
          <div key={name} className="contents">
            <div className="min-w-0">
              <div className="text-xs font-semibold" style={{ color: "var(--text-1)" }}>{name}</div>
              <div className="text-[11px] tabular-nums" style={{ color: "var(--text-3)" }}>{span}</div>
            </div>
            <div className="h-3 rounded-full overflow-hidden" style={{ background: "var(--bg-inner)" }}>
              <div className="h-full rounded-full" style={{ width: `${v > 0 ? Math.max(2, (100 * v) / max) : 0}%`, background: ink }} />
            </div>
            <div className="text-sm font-bold tabular-nums text-right" style={{ color: "var(--text-1)" }}>
              {fill(T.minutes, { m: num(v) })}
            </div>
          </div>
        ))}
      </div>
      <Caption>{grain === "day" ? A.dailyTitle : A.weeklyTitle}</Caption>
      <Columns items={items} label={grain === "day" ? A.dailyTitle : A.weeklyTitle}
        caption={peak ? fill(grain === "day" ? A.peakDay : A.peakWeek, { d: ddmm(peak.from), m: num(peak.minutes) }) : ""} />
      {padded && <Note>{A.padded}</Note>}
    </Card>
  );
}

// ── 2. where does it come from ───────────────────────────────────────────────
function Where({ A, T, data, label }) {
  const { tl } = useTranslit();
  const [dim, setDim] = useState("cause");
  const [wide, setWide] = useState(null);             // the dimension shown whole
  const person = (n) => shortPerson(tl(n) || n || "");
  let answer, rows, note = fill(A.deltaHint, { n: data.days });
  if (dim === "cause") {
    const list = data.by_cause.filter((c) => c.minutes > 0);
    const k = Math.min(3, list.length);
    const share = Math.round(list.slice(0, k).reduce((s, c) => s + c.share, 0));
    answer = list.length > 3 ? fill(A.top3, { k, p: share }) : fill(A.fewCauses, { k: list.length });
    const max = list[0]?.minutes || 1;
    rows = list.map((c) => ({
      key: c.category,
      head: <CauseName category={c.category} label={label} />,
      aside: <OwnerChip owners={{ [c.category]: c.owner }} category={c.category} size="sm" />,
      value: `${fill(T.minutes, { m: num(c.minutes) })} · ${Math.round(c.share)}%`,
      frac: c.minutes / max, color: catColor(c.category),
      chip: <DeltaChip d={delta(c.minutes, c.prev_minutes)} A={A} />,
      sub: fill(A.stopsAnswered, { s: c.stops, a: c.answered }),
    }));
  } else if (dim === "unit") {
    const list = data.by_unit;
    const top = list[0];
    answer = top ? fill(A.topUnit, { n: person(top.manager_name), p: Math.round(top.share) }) : "";
    const max = top?.minutes || 1;
    rows = list.map((u) => ({
      key: u.manager_id,
      head: <>
        <UserRound size={14} className="flex-shrink-0" style={{ color: "var(--text-3)" }} />
        <PersonLink name={u.manager_name} className="text-sm font-semibold truncate" style={{ color: "var(--text-1)" }}>{person(u.manager_name)}</PersonLink>
      </>,
      value: `${fill(T.minutes, { m: num(u.minutes) })} · ${Math.round(u.share)}%`,
      frac: u.minutes / max, color: "var(--brand)",
      chip: <DeltaChip d={delta(u.minutes, u.prev_minutes)} A={A} />,
      sub: `${fill(A.stopsAnswered, { s: u.stops, a: u.answered })} · ${fill(A.mainCause, { c: causeText(u.top_category, label) })}`,
    }));
  } else {
    const list = data.by_cell;
    const top = list[0];
    answer = top ? fill(A.topCell, { c: top.cell, m: num(top.stop_minutes), s: top.stops }) : A.noCells;
    note = A.cellNote;
    const max = top?.stop_minutes || 1;
    rows = list.map((c) => ({
      key: c.cell_id,
      head: <>
        <MapPin size={14} className="flex-shrink-0" style={{ color: "var(--text-3)" }} />
        <CellLink id={c.cell_id} className="text-sm font-semibold tabular-nums" style={{ color: "var(--text-1)" }}>{c.cell}</CellLink>
        <span className="text-xs truncate" style={{ color: "var(--text-3)" }}>{person(c.manager_name)}</span>
      </>,
      value: fill(A.stoodMin, { m: num(c.stop_minutes) }),
      frac: c.stop_minutes / max, color: "var(--brand)",
      sub: `${fill(A.cellSub, { s: c.stops, d: c.days })} · ${fill(A.mainCause, { c: causeText(c.top_category, label) })}`,
    }));
  }
  return (
    <Card icon={MapPin} title={A.qWhere}>
      <div className="mb-3">
        <SegmentedToggle value={dim} onChange={setDim}
          options={[["cause", A.byCause], ["unit", A.byUnit], ["cell", A.byCell]]} />
      </div>
      {rows.length === 0 ? (
        <div className="text-sm" style={{ color: "var(--text-3)" }}>{A.noCells}</div>
      ) : (
        <>
          <Answer>{answer}</Answer>
          <ul>
            {(wide === dim ? rows : rows.slice(0, HEAD)).map(({ key, ...r }, i) => <BarRow key={key} first={i === 0} {...r} />)}
          </ul>
          <More T={T} A={A} rest={rows.length - HEAD} open={wide === dim} onToggle={() => setWide(wide === dim ? null : dim)} />
          <Note>{note}</Note>
        </>
      )}
    </Card>
  );
}

// ── 3. when ──────────────────────────────────────────────────────────────────
function When({ A, data }) {
  const hours = data.hours || [];
  const peak = data.peak;
  const inPeak = (h) => peak && (peak.from < peak.to ? h >= peak.from && h < peak.to : h >= peak.from || h < peak.to);
  const hourItems = hours.map((v, h) => ({
    key: h, value: v, hot: inPeak(h), label: h % 3 === 0 ? String(h).padStart(2, "0") : "",
    tip: fill(A.hourTip, { a: hh(h), b: hh((h + 1) % 24), m: num(v) }),
  }));
  const week = (data.weekdays || []).map((w, i) => ({ ...w, i, avg: w.days > 0 ? w.stop_minutes / w.days : 0 }));
  const worst = week.reduce((best, w) => (w.avg > (best?.avg || 0) ? w : best), null);
  const weekItems = week.map((w) => ({
    key: w.i, value: w.avg, hot: worst && w.i === worst.i, label: A.wd[w.i],
    tip: fill(A.wdTip, { d: A.wdFull[w.i], m: num(w.avg), n: w.days }),
  }));
  const enough = data.days >= 14;
  if (!peak) {
    return <Card icon={CalendarClock} title={A.qWhen}><div className="text-sm" style={{ color: "var(--text-3)" }}>{A.noCells}</div></Card>;
  }
  return (
    <Card icon={CalendarClock} title={A.qWhen}>
      <Answer sub={enough && worst ? fill(A.worstDay, { d: A.wdFull[worst.i], m: num(worst.avg) }) : null}>
        {fill(A.peak, { p: peak.share, a: hh(peak.from), b: hh(peak.to) })}
      </Answer>
      <div className="grid gap-5 md:grid-cols-[3fr_2fr]">
        <div className="min-w-0">
          <Caption>{A.hoursTitle}</Caption>
          <Columns items={hourItems} height={88} labelPx={22} label={A.hoursTitle}
            caption={fill(A.hourTip, { a: hh(peak.from), b: hh(peak.to), m: num(hourItems.filter((x) => x.hot).reduce((s, x) => s + x.value, 0)) })} />
        </div>
        <div className="min-w-0">
          <Caption>{A.weekTitle}</Caption>
          {enough ? (
            <Columns items={weekItems} height={88} labelPx={22} label={A.weekTitle}
              caption={worst ? fill(A.wdTip, { d: A.wdFull[worst.i], m: num(worst.avg), n: worst.days }) : ""} />
          ) : (
            <div className="text-xs" style={{ color: "var(--text-3)" }}>{A.weekNeeds}</div>
          )}
        </div>
      </div>
      <Note>{A.whenNote}</Note>
    </Card>
  );
}

// ── 4. do the stops get a solution ───────────────────────────────────────────
function Funnel({ A, f, states = STATES }) {
  const total = states.reduce((s, k) => s + (f[k] || 0), 0);
  return (
    <>
      <div className="flex h-3 rounded-full overflow-hidden gap-[2px]" aria-hidden="true">
        {total === 0 && <div className="flex-1" style={{ background: "var(--bg-inner)" }} />}
        {states.map((k) => f[k] > 0 && (
          <div key={k} style={{ width: `${(100 * f[k]) / total}%`, minWidth: 4, background: STATE_INK[k] }} />
        ))}
      </div>
      <ul className="grid gap-x-6 gap-y-1.5 mt-3 sm:grid-cols-2">
        {states.map((k) => (
          <li key={k} className="flex items-center gap-2 text-sm min-w-0" style={{ opacity: f[k] > 0 ? 1 : 0.55 }}>
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: STATE_INK[k] }} aria-hidden="true" />
            <span className="flex-1 min-w-0 truncate" style={{ color: "var(--text-1)" }} title={A.state[k]}>{A.state[k]}</span>
            <span className="font-bold tabular-nums flex-shrink-0" style={{ color: "var(--text-1)" }}>{f[k] || 0}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Who wrote their own answer: «9 / 12» and how far along that is. */
function WhoList({ T, A, title, rows, empty }) {
  const [all, setAll] = useState(false);
  return (
    <div className="min-w-0">
      <Caption>{title}</Caption>
      {rows.length === 0 ? (
        <div className="text-xs" style={{ color: "var(--text-3)" }}>{empty}</div>
      ) : (
        <ul className="space-y-2.5">
          {(all ? rows : rows.slice(0, HEAD)).map((r) => (
            <li key={r.key} className="min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <div className="min-w-0 flex-1 flex items-center gap-1.5 text-sm truncate" style={{ color: "var(--text-1)" }}>{r.name}</div>
                <span className="text-sm font-bold tabular-nums flex-shrink-0" style={{ color: "var(--text-1)" }}>{r.own} / {r.stops}</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden mt-1" style={{ background: "var(--bg-inner)" }}>
                <div className="h-full rounded-full" style={{ width: `${pct(r.own, r.stops)}%`, background: r.own >= r.stops ? OK : WARN }} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <More T={T} A={A} rest={rows.length - HEAD} open={all} onToggle={() => setAll(!all)} />
    </div>
  );
}

function Answers({ A, T, data }) {
  const { tl } = useTranslit();
  const f = data.funnel;
  const answered = f.stops - f.unanswered;
  const sp = data.speed;
  const person = (n) => shortPerson(tl(n) || n || "");
  // `responders` is every unit that had a stop; a payload from before it falls
  // back to the units that had minutes
  const units = [...(data.responders || data.by_unit)].filter((u) => u.stops > 0)
    .sort((a, b) => (a.own / a.stops) - (b.own / b.stops) || b.stops - a.stops)
    .map((u) => ({
      key: u.manager_id, own: u.own, stops: u.stops,
      name: <PersonLink name={u.manager_name} className="truncate">{person(u.manager_name)}</PersonLink>,
    }));
  const owners = (data.owners || []).map((o) => ({
    key: o.profile_key, own: o.own, stops: o.stops,
    name: <>
      <span className="truncate">{person(o.name)}</span>
      <span className="text-[11px] flex-shrink-0" style={{ color: "var(--text-3)" }}>{o.categories.map(catCode).join(", ")}</span>
    </>,
  }));
  if (f.stops === 0) {
    return <Card icon={ClipboardCheck} title={A.qAnswers}><div className="text-sm" style={{ color: "var(--text-3)" }}>{A.noCells}</div></Card>;
  }
  return (
    <Card icon={ClipboardCheck} title={A.qAnswers}>
      <Answer tone={f.unanswered === 0 ? OK : undefined}
        sub={sp.answered > 0 ? (sp.median_days > 0 ? fill(A.speedDays, { d: sp.median_days }) : A.speedSame) : null}>
        {f.unanswered === 0 ? fill(A.aAnswersAll, { n: f.stops })
          : fill(A.aAnswers, { n: f.stops, a: answered, p: pct(answered, f.stops) })}
      </Answer>
      <Funnel A={A} f={f} />
      {/* of the promised ones: the plan's own date has already passed */}
      {f.overdue > 0 && (
        <p className="text-xs mt-2.5" style={{ color: "var(--status-bad)" }}>
          {A.state.promised} — {fill(A.promisedLate, { n: f.overdue })}.
        </p>
      )}
      <div className="grid gap-5 md:grid-cols-2 mt-5 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
        <WhoList T={T} A={A} title={A.whoUnits} rows={units} empty={A.noCells} />
        <WhoList T={T} A={A} title={A.whoOwners} rows={owners} empty={A.noOwners} />
      </div>
    </Card>
  );
}

// ── 5. do the solutions work ─────────────────────────────────────────────────
function Results({ A, T, data, label, onOpenCause }) {
  const { t } = useLang();
  const { tl } = useTranslit();
  const f = data.funnel;
  const done = f.held + f.back + f.watch;      // stops whose solution was carried out
  const [all, setAll] = useState(false);
  const REPEATS = 5;
  const person = (n) => shortPerson(tl(n) || n || "");
  const role = (r) => (ROLE_LABEL_KEYS[r] ? t(ROLE_LABEL_KEYS[r]) : "");
  return (
    <Card icon={Target} title={A.qResults}>
      {/* Counts, never a «worked %»: a solution is known to have failed within
          days and known to have worked only after the whole watch, so a rate
          over a recent period would always lean to failure. */}
      <Answer tone={f.back > 0 ? BAD : f.held > 0 ? OK : undefined}
        sub={done > 0 ? fill(A.aResultsSub, { n: done, d: data.hold_days, h: f.held, b: f.back, w: f.watch }) : null}>
        {f.back > 0 ? fill(A.aBack, { b: f.back }) : f.held > 0 ? A.aHeld : A.aResultsNone}
      </Answer>
      {done > 0 && <Funnel A={A} f={f} states={["back", "watch", "held"]} />}
      <Note>
        {fill(A.rule, { d: data.hold_days })}
        {f.held === 0 && data.days < 2 * data.hold_days ? ` ${fill(A.longer, { d: data.hold_days })}` : ""}
      </Note>

      <div className="mt-5 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2 mb-1">
          <Repeat2 size={14} style={{ color: "var(--brand-text)" }} className="flex-shrink-0" />
          <div className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>{A.repTitle}</div>
          {data.repeats_n > 0 && <span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{data.repeats_n}</span>}
        </div>
        <div className="text-[11px] mb-3" style={{ color: "var(--text-3)" }}>{fill(A.repHint, { r: data.repeat_days })}</div>
        {data.repeats.length === 0 ? (
          <div className="text-sm" style={{ color: "var(--text-3)" }}>{A.repNone}</div>
        ) : (
          <ul className="space-y-2">
            {(all ? data.repeats : data.repeats.slice(0, REPEATS)).map((r) => (
              <li key={`${r.cell_id}-${r.category}`} className="rounded-xl p-3"
                style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", boxShadow: `inset 3px 0 0 ${STATE_INK[r.state] || GREY}` }}>
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <CellLink id={r.cell_id} className="text-sm font-bold tabular-nums flex-shrink-0" style={{ color: "var(--text-1)" }}>{r.cell}</CellLink>
                  <div className="min-w-0 flex-1 flex items-center gap-2 basis-40"><CauseName category={r.category} label={label} strong={false} /></div>
                  <StateChip state={r.state}>
                    {r.state === "back" ? fill(A.repBack, { n: r.back_n }) : A.state[r.state]}
                  </StateChip>
                </div>
                <div className="text-[11px] mt-1.5 tabular-nums" style={{ color: "var(--text-2)" }}>
                  {person(r.manager_name)} · {fill(A.repLine, { d: r.days, s: r.stops, m: num(r.stop_minutes), l: ddmm(r.last_date) })}
                </div>
                {r.note && (
                  <div className="text-xs mt-1.5 break-words" style={{ color: "var(--text-2)" }}>
                    <span style={{ color: "var(--text-3)" }}>{A.lastNote}: </span>«{r.note}»
                  </div>
                )}
                <div className="text-xs mt-1 break-words" style={{ color: "var(--text-2)" }}>
                  <span style={{ color: "var(--text-3)" }}>{A.lastSol}: </span>
                  {r.solution ? (
                    <>«{r.solution.text}» — {person(r.solution.author_name)}
                      {role(r.solution.author_role) ? ` (${role(r.solution.author_role)})` : ""}, {ddmm(r.solution.date)} · {T.st[r.solution.status] || r.solution.status}</>
                  ) : A.noSolYet}
                </div>
                {onOpenCause && (
                  <div className="mt-2">
                    <Button size="sm" variant="secondary" onClick={() => onOpenCause(r.category, r.cell)}>{A.open}</Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <More T={T} A={A} rest={data.repeats.length - REPEATS} open={all} onToggle={() => setAll(!all)} />
        {all && data.repeats_n > data.repeats.length && <Note>{fill(A.repMore, { n: data.repeats_n - data.repeats.length })}</Note>}
      </div>
    </Card>
  );
}

export default function SolutionAnalytics({ T, data, label, onOpenCause }) {
  const A = T.an;
  if (!(data.total.minutes > 0) && !(data.total.stops > 0) && !(data.total.prev_minutes > 0)) {
    return <EmptyState icon={TrendingDown} title={T.empty} message={T.emptySub} showUploadLink={false} />;
  }
  return (
    <>
      <Summary A={A} data={data} label={label} />
      <Trend A={A} T={T} data={data} />
      <Where A={A} T={T} data={data} label={label} />
      <When A={A} data={data} />
      <Answers A={A} T={T} data={data} />
      <Results A={A} T={T} data={data} label={label} onOpenCause={onOpenCause} />
      <p className="text-[11px]" style={{ color: "var(--text-3)" }}>{A.foot}</p>
    </>
  );
}
