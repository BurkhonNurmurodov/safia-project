import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import {
  Trophy, Gauge, Zap, ClipboardCheck, Lightbulb, ShieldCheck, UserCheck,
  ListOrdered, TrendingUp, ArrowUp, ArrowDown, Minus, Info, ChevronDown,
  Download, Layers, CircleCheck, TriangleAlert, CalendarX2, Target,
  MessageSquareWarning, Loader2,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import TableCard, { Th, SectionHead } from "../components/ui/DataTable";
import KPICard from "../components/ui/KPICard";
import SearchInput from "../components/ui/SearchInput";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import DayStepper from "../components/ui/DayStepper";
import { FilterPanel } from "../components/ui/ColumnFilter";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import ProfileAvatar from "../components/ui/ProfileAvatar";
import { SkeletonBlock } from "../components/ui/Skeleton";
import { useToast } from "../components/ui/Toast";
import { useFactorySection } from "../components/ui/FactorySelect";
import { useFactory, factoryName } from "../context/FactoryContext";
import { useLang } from "../context/LangContext";
import { useTheme } from "../context/ThemeContext";
import { usePersistentState } from "../hooks/usePersistentState";
import useElementWidth from "../hooks/useElementWidth";
import { useTranslit } from "../utils/transliterate";
import { shortPerson } from "../utils/personName";
import api from "../utils/api";
import { exportXlsx } from "../utils/exportXlsx";
import {
  lastFinishedDay, inScope, rosterIn, boardScores, buildCutLeaders, buildCutUnits,
  buildStartLeaders, poolRows, poolRoster,
} from "../utils/leaderBoard";

/* ══════════════════════════════════════════════════════════════════════
 * Leaderboard — brigadir ranking across the platform's statistics.
 *
 * Read top to bottom it answers four questions, in order: who leads (the
 * podium), is the team OK (the KPI strip), where does everybody stand (the
 * register, a row opening into its breakdown against the team average), and
 * how did the places move (the trajectory chart). The podium is the one
 * deliberately theatrical element — three big player cards, kept by the
 * operator's call — everything else is the platform's own card grammar.
 *
 * REAL DATA from 2026-10-23 (`GET /api/leaderboard`, services/brigadir_board.py
 * holds the rule): one WEEK, MONTH or YEAR (the operator: no date-to-date
 * range) and the periods of the same grain before it. Every figure is one
 * another page already prints — Samaradorlik is /zagruzka's «Samaradorlik»
 * heatmap (it replaced Zagruzka, the operator's call), Plan bajarish is the
 * «Reja bajarilishi» heatmap beside it (added the same day — the operator:
 * «why no plan fulfillment as I said»), Davomat is /workers'
 * attendance rate, Xavotir the share of the period's /concerns resolved,
 * «Sifat nazorati» the share of its quality complaints resolved — the shift
 * dashboard's own «Sifat nazorati %», hair left out (the operator,
 * 2026-10-23: «add also Quality Complaints Resolved percentage (without
 * hair)») — and
 * «Lider nazorati» is the /leaders brigadir ranking's «Reyting», scored HERE
 * from the checklist pool with the very functions that board uses
 * (utils/leaderBoard.js). Kaizen is not measured yet: its column says so and
 * its weight is shared out over the ones that are (the operator, same day).
 * ════════════════════════════════════════════════════════════════════ */

/* ── categories (the ranked statistics) ──────────────────────────────── */
/* The live weights add up to 1, so each is its share of the score as it is.
 * Plan fulfilment took 22% when it joined (2026-10-23) and the four before it
 * kept their proportions (35 · 18 · 18 · 29 → 28 · 14 · 14 · 22); quality
 * control took 14% the same day — the weight the other closure rate beside it
 * carries — and the five before it kept theirs again (× 0.86). Kaizen's own
 * weight is set aside until it is measured. NONE of these is the operator's
 * ruling: they are a starting point, one line each to change. `tiny` = the
 * podium's short label. */
const CATS = [
  { key: "eff",  icon: Zap,                  weight: 0.24, tiny: true },
  { key: "plan", icon: Target,               weight: 0.19, tiny: true },
  { key: "naz",  icon: ClipboardCheck,       weight: 0.12 },
  { key: "kai",  icon: Lightbulb,            weight: 0.15, live: false },
  { key: "xav",  icon: ShieldCheck,          weight: 0.12 },
  { key: "qual", icon: MessageSquareWarning, weight: 0.14 },
  { key: "kir",  icon: UserCheck,            weight: 0.19 },
];
const LIVE = CATS.filter((c) => c.live !== false);
const LIVE_W = LIVE.reduce((a, c) => a + c.weight, 0);
/* What a category weighs once the ones not measured yet are shared out. */
const shareOf = (c) => (c.live === false ? 0 : c.weight / LIVE_W);

/* Category identity hues — one per statistic in the shared generic-first
 * order (red, green, blue, yellow, orange, purple), darker in the light theme for
 * contrast. Identity only: they tint the icon chip and the header dot, never
 * a value — a value is always traffic-light. */
const CAT_HUES = {
  dark:  { eff: "#ef4444", naz: "#22c55e", kai: "#3b82f6", xav: "#eab308", kir: "#f97316", plan: "#a855f7", qual: "#14b8a6" },
  light: { eff: "#dc2626", naz: "#16a34a", kai: "#2563eb", xav: "#ca8a04", kir: "#ea580c", plan: "#9333ea", qual: "#0d9488" },
};

/* Traffic-light status bands (fill + higher-contrast ink per theme). */
const STATUS = {
  dark:  { ok: "#22c55e", okInk: "#4ade80", warn: "#eab308", warnInk: "#fbbf24", bad: "#ef4444", badInk: "#f87171", none: "#94a3b8" },
  light: { ok: "#16a34a", okInk: "#15803d", warn: "#ca8a04", warnInk: "#a16207", bad: "#dc2626", badInk: "#b91c1c", none: "#94a3b8" },
};

/* Medals — the Leaders page's gold / silver / bronze, pushed apart in hue AND
 * lightness so the place reads at chip weight; darker on white. */
const MEDAL = {
  dark:  { 1: "#E0A82E", 2: "#C3CBD6", 3: "#C0703A" },
  light: { 1: "#B8860B", 2: "#7B8794", 3: "#A0522D" },
};

const GRAINS = ["week", "month", "year"];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/* The 0–100 score: the live figures weighed, a figure the period has none of
 * left out and its weight shared over the rest. A figure counts at most 100 —
 * efficiency above 100% (output beyond 90% of the clocked minutes) is printed
 * as it is and enters the score as 100. Null when no figure exists at all. */
function composite(s) {
  let num = 0, den = 0;
  LIVE.forEach((c) => { const v = s[c.key]; if (v != null) { num += Math.min(v, 100) * c.weight; den += c.weight; } });
  return den ? num / den : null;
}

/* ── periods ─────────────────────────────────────────────────────────── */
const pad2 = (n) => String(n).padStart(2, "0");
const isoOf = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const isoAdd = (iso, n) => { const d = new Date(`${iso}T00:00:00`); d.setDate(d.getDate() + n); return isoOf(d); };
const ddmm = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
function daysOf(from, to) {
  const out = [];
  for (let d = from; d <= to; d = isoAdd(d, 1)) out.push(d);
  return out;
}
/* The first day of the period of `grain` that holds `iso` — a week's Monday,
 * a month's 1st, 1 January; the twin of `period_of` (services/
 * brigadir_board.py). The request is keyed by it, never by the day itself:
 * keyed by today's date, the board kept on the device (and in react-query's
 * memory) stopped matching at midnight, in the middle of the very week it
 * was the board of, and the first open of every day drew the skeleton. */
function periodStart(grain, iso) {
  const d = new Date(`${iso}T00:00:00`);
  if (grain === "week") d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  else if (grain === "month") d.setDate(1);
  else d.setMonth(0, 1);
  return isoOf(d);
}
/* When the board on screen was calculated — «11:53», or «12.11 11:53» when
 * that was not today. `builtAt` is the server's ISO stamp, Tashkent time. */
function builtLabel(builtAt, today) {
  if (typeof builtAt !== "string" || builtAt.length < 16) return "";
  const day = builtAt.slice(0, 10), clock = builtAt.slice(11, 16);
  return day === today ? clock : `${ddmm(day)} ${clock}`;
}
/* A period's name: the week's span, the month, the year. `short` is the
 * chart axis's. */
function periodLabel(p, grain, t, short = false) {
  if (!p) return "";
  const y = p.from.slice(0, 4), m = Number(p.from.slice(5, 7)) - 1;
  if (grain === "year") return y;
  if (grain === "month") return short ? t(`cal.m${m}`).slice(0, 3) : `${t(`cal.m${m}`)} ${y}`;
  return short ? ddmm(p.from) : `${ddmm(p.from)} – ${ddmm(p.end)}.${p.end.slice(0, 4)}`;
}

/* «Lider nazorati» per period: the /leaders brigadir ranking's «Reyting» —
 * `boardScores("unit", …)` over the pool, each window cut at the last
 * FINISHED day, as that board cuts its own (`countCap`). unit id → score. */
function checklistByPeriod(pay) {
  const pool = pay.checklist || {};
  const rows = poolRows(pool.rows), roster = rosterIn(poolRoster(pool.roster), {});
  const cutLeaders = buildCutLeaders(pool.cutoffs,
    new Set(roster.filter((p) => p.filed).map((p) => p.name)), roster);
  const cutUnits = buildCutUnits(pool.cutUnits);
  const startLeaders = buildStartLeaders(roster);
  const cap = lastFinishedDay();
  return (pay.periods || []).map((p) => {
    const m = new Map();
    const to = p.to < cap ? p.to : cap;
    if (to < p.from) return m;
    const dates = daysOf(p.from, to);
    const rs = rows.filter((r) => inScope(r, { from: p.from, to }));
    for (const e of boardScores("unit", rs, roster, cutLeaders, cutUnits, dates, dates.length, startLeaders))
      m.set(e.name, e.rating);
    return m;
  });
}

/* The whole board out of one payload: every unit's figures per period,
 * the composite per period, and the places — dense 1..n among the units that
 * HAVE a score in that period (a unit with nothing in the picked period is
 * not on the board; in an older one it is simply absent from that week). */
function buildBoard(pay) {
  const P = pay?.periods || [];
  const L = P.length - 1;
  if (L < 0) return { sups: [], byRank: [], periods: P, missing: 0 };
  const naz = checklistByPeriod(pay);
  const all = (pay.units || []).map((u) => {
    const f = pay.figures?.[String(u.id)] || {};
    const series = {
      eff: P.map((_, i) => f.eff?.v?.[i] ?? null),
      plan: P.map((_, i) => f.plan?.v?.[i] ?? null),
      naz: P.map((_, i) => naz[i].get(String(u.id)) ?? null),
      kai: P.map(() => null),
      xav: P.map((_, i) => f.xav?.v?.[i] ?? null),
      qual: P.map((_, i) => f.qual?.v?.[i] ?? null),
      kir: P.map((_, i) => f.att?.v?.[i] ?? null),
    };
    const at = (i) => Object.fromEntries(CATS.map((c) => [c.key, series[c.key][i]]));
    const hist = P.map((_, i) => composite(at(i)));
    return {
      id: u.id, name: u.name, shift: u.shift, factory: u.factory,
      profileKey: u.profile_key, photoVer: u.photo_ver,
      s: at(L), comp: hist[L], hist, sparks: series,
      xav: f.xav ? { n: f.xav.n?.[L] ?? 0, done: f.xav.done?.[L] ?? 0, up: f.xav.up?.[L] ?? 0 } : null,
      // «0% of one» and «0% of forty» are different facts — the cell's title
      // says which, since the row itself stays one line high.
      qual: f.qual ? { n: f.qual.n?.[L] ?? 0, done: f.qual.done?.[L] ?? 0 } : null,
      days: { eff: f.eff?.days?.[L] ?? 0, plan: f.plan?.days?.[L] ?? 0, kir: f.att?.days?.[L] ?? 0 },
    };
  });
  const rankHist = new Map(all.map((s) => [s.id, P.map(() => null)]));
  P.forEach((_, i) => {
    all.filter((s) => s.hist[i] != null)
      .sort((a, b) => b.hist[i] - a.hist[i] || a.name.localeCompare(b.name))
      .forEach((s, pos) => { rankHist.get(s.id)[i] = pos + 1; });
  });
  const sups = all.filter((s) => s.comp != null).map((s) => {
    const rh = rankHist.get(s.id);
    const prevComp = L > 0 ? s.hist[L - 1] : null;
    return {
      ...s, rankHist: rh, rank: rh[L], prevRank: L > 0 ? rh[L - 1] : null,
      scoreDelta: prevComp == null ? null : s.comp - prevComp,
    };
  });
  const byRank = [...sups].sort((a, b) => a.rank - b.rank);
  return { sups, byRank, periods: P, missing: all.length - sups.length };
}


/* ────────────────────────── helpers ─────────────────────────────────── */
const fmt = (v) => (v == null ? "—" : String(Math.round(v)));
const fmt1 = (v) => (v == null ? "—" : v.toFixed(1).replace(".", ","));
function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }
function bandOf(v) { return v == null ? "none" : v >= 80 ? "ok" : v >= 65 ? "warn" : "bad"; }
function bandFill(st, v) { const b = bandOf(v); return b === "ok" ? st.ok : b === "warn" ? st.warn : b === "bad" ? st.bad : st.none; }
function bandInk(st, v) { const b = bandOf(v); return b === "ok" ? st.okInk : b === "warn" ? st.warnInk : b === "bad" ? st.badInk : st.none; }
/* The counts behind a closure rate, for the cell's hover: «0% of one» and
 * «0% of forty» are different facts, and the row itself stays one line high
 * (the platform's table rule), so this is where the denominator can be said.
 * Both closure rates carry them; every other category has none and gets the
 * category's own name, as before. */
function cellTip(s, key, t) {
  const c = s[key];
  const name = t(`leaderboard.cat.${key}`);
  return c && c.n ? `${name}: ${c.done} / ${c.n}` : name;
}

/* Sign-aware delta ink: up is good here (a score, a place gained). */
function deltaInk(st, d) { return d == null || d === 0 ? st.none : d > 0 ? st.okInk : st.badInk; }
function deltaFill(st, d) { return d == null || d === 0 ? st.none : d > 0 ? st.ok : st.bad; }

/* ────────────────────────── atoms ───────────────────────────────────── */
/* THE profile avatar (ProfileAvatar) — the brigadir's photo, else their
 * initials on their own hue. */
function Avatar({ sup, size, style }) {
  return <ProfileAvatar name={sup.name} colorKey={sup.name} profileKey={sup.profileKey} photoVer={sup.photoVer} size={size} style={style} />;
}

/* The dashed micro-gauge under a number — six segments lit by the value's
 * own band, so a cell reads at a glance without parsing the digits. */
function Meter({ pct, color, align = "left" }) {
  const on = pct == null ? 0 : clamp(Math.round((pct / 100) * 6), 0, 6);
  return (
    <span className={`flex gap-[2px] mt-1 ${align === "right" ? "justify-end" : ""}`} aria-hidden="true">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <span key={i} style={{ width: 5, height: 2.5, borderRadius: 1, background: i < on ? color : "var(--border-md)" }} />
      ))}
    </span>
  );
}

/* Place chip — medal-tinted for 1–3, neutral for the rest. */
function PlaceBadge({ place, medal, size = 26 }) {
  const tone = medal[place];
  const style = tone
    ? { background: hexA(tone, 0.18), color: tone, border: `1px solid ${hexA(tone, 0.5)}` }
    : { background: "var(--bg-inner)", color: "var(--text-2)", border: "1px solid var(--border-md)" };
  return (
    <span className="inline-flex items-center justify-center rounded-lg tabular-nums flex-shrink-0"
      style={{ width: size, height: size, fontSize: 12.5, fontWeight: 800, ...style }}>{place}</span>
  );
}

/* Places won or lost against the period before. A place is better the
 * SMALLER it is, so 7 → 4 is +3 and green — movement up the board, not
 * arithmetic. Not on the board then: «yangi», neutral. */
function MoveChip({ prev, now, st, t, vsLabel }) {
  if (prev == null) {
    return (
      <span className="inline-flex items-center rounded-lg px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap leading-none"
        title={`${t("leaderboard.rank")} · ${vsLabel}: —`}
        style={{ background: hexA(st.none, 0.14), color: "var(--text-3)" }}>
        {t("leaderboard.new")}
      </span>
    );
  }
  const mv = prev - now;
  const Icon = mv > 0 ? ArrowUp : mv < 0 ? ArrowDown : Minus;
  return (
    <span className="inline-flex items-center gap-0.5 rounded-lg px-1.5 py-0.5 text-[11px] font-semibold tabular-nums whitespace-nowrap leading-none"
      title={`${t("leaderboard.rank")} · ${vsLabel}: ${prev} → ${now}`}
      style={{ background: hexA(deltaFill(st, mv), 0.14), color: deltaInk(st, mv) }}>
      <Icon size={11} />{Math.abs(mv)}
    </span>
  );
}

/* S1/S2 identity chip — rendered only while the board mixes both shifts.
 * Neutral chrome on purpose: a shift is an identity, not a status. */
function ShiftChip({ shift, t }) {
  return (
    <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums leading-none flex-shrink-0"
      title={`${t("filter.shift")} ${shift}`} style={{ border: "1px solid var(--border-md)", color: "var(--text-3)" }}>
      S{shift}
    </span>
  );
}

/* One smooth Catmull-Rom path plus the same path closed as a flat wash —
 * the Leaders page's sparkline, toned by where the line ended up. */
const SPARK_W = 84, SPARK_H = 24;
function Spark({ vals: raw, tone }) {
  const vals = (raw || []).filter((v) => v != null);
  if (vals.length < 2) return null;
  const lo = Math.min(...vals) - 3, hi = Math.max(...vals) + 3;
  const pt = (v, i) => [3 + (i / (vals.length - 1)) * (SPARK_W - 6), SPARK_H - 3 - ((v - lo) / (hi - lo || 1)) * (SPARK_H - 6)];
  const p = vals.map(pt), r = (n) => Math.round(n * 10) / 10;
  let d = `M${r(p[0][0])},${r(p[0][1])}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2;
    d += `C${r(p1[0] + (p2[0] - p0[0]) / 6)},${r(p1[1] + (p2[1] - p0[1]) / 6)} ` +
      `${r(p2[0] - (p3[0] - p1[0]) / 6)},${r(p2[1] - (p3[1] - p1[1]) / 6)} ${r(p2[0])},${r(p2[1])}`;
  }
  const [ex, ey] = p[p.length - 1];
  return (
    <svg width={SPARK_W} height={SPARK_H} className="flex-shrink-0" aria-hidden="true">
      <path d={`${d} L${r(ex)},${SPARK_H - 1} L3,${SPARK_H - 1} Z`} fill={hexA(tone, 0.14)} />
      <path d={d} fill="none" stroke={tone} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={ex} cy={ey} r="2.5" fill={tone} />
    </svg>
  );
}
const sparkTone = (st, raw) => {
  const vals = (raw || []).filter((v) => v != null);
  if (vals.length < 2) return st.none;
  const d = vals[vals.length - 1] - vals[0];
  return deltaFill(st, Math.abs(d) < 0.5 ? 0 : d);
};

/* Floating hover tip for the SVG chart — the one surface here that Apex does
 * not draw, so it carries the same tokens the Apex tooltips use. `sub` may be
 * a node: the rank chart's is two lines (the period, then place · score).
 * Near the right edge it opens to the LEFT of the pointer where there is room
 * (the chart's names stand there, and a tip pushed back over them hid the very
 * rows being pointed at); a phone has room on neither side and keeps the clamp. */
function FloatTip({ tip }) {
  if (!tip) return null;
  const vw = window.innerWidth;
  const flip = tip.x + 14 + 240 > vw - 8 && tip.x - 14 - 240 >= 8;
  return (
    <div className="fixed z-50 pointer-events-none rounded-lg px-2.5 py-2"
      style={{ ...(flip ? { right: vw - tip.x + 14 } : { left: Math.min(tip.x + 14, vw - 250) }), top: Math.max(8, tip.y - 74), background: "var(--bg-accent)", border: "1px solid var(--border-md)", boxShadow: "0 6px 20px rgba(0,0,0,0.25)", maxWidth: 240 }}>
      <div className="text-xs font-bold" style={{ color: "var(--text-1)" }}>{tip.title}</div>
      <div className="text-[11px] tabular-nums" style={{ color: "var(--text-3)" }}>{tip.sub}</div>
    </div>
  );
}

/* ═══════════════════════ podium — player cards ═══════════════════════
 * Back by the operator's call (2026-09-04): the three big cards are the
 * page's hero and stand on their own above the KPI strip.
 * The top three ride metal player cards: the gold / silver / bronze plate,
 * FIDE-style decoration — engraved arcs radiating from behind the brigadir's
 * photo medallion under a top spotlight — the big rank number over a dark
 * score flag on the left, the engraved cup top-right, and a frosted-glass
 * foot (progressive backdrop blur) the render's legs melt into, carrying the
 * name band and the measured statistics (the grid is one column per LIVE
 * statistic — six since quality control joined — so a statistic not measured
 * yet, Kaizen, is left off it; each column shrinks as one joins, and a label
 * too long for its column is cut with the full name on hover).
 *
 * A card is its own surface, so its palette is fixed in both themes (like the
 * chart identity colours): three stops of the medal metal, the dark ink
 * written on the plate, the bright edge that lights the decoration, and the
 * deep tone tinting the frosted foot. */
const PLATE = {
  1: { hi: "#F9E7A8", mid: "#DBAB2C", lo: "#8A6410", ink: "#3B2A06", edge: "#FFF6CE", deep: "#4E3604" },
  2: { hi: "#F1F5FA", mid: "#A9B3BF", lo: "#5C6673", ink: "#1E2530", edge: "#FFFFFF", deep: "#2E3742" },
  3: { hi: "#F2CBA0", mid: "#C68249", lo: "#7A4A20", ink: "#33190A", edge: "#FFE6CC", deep: "#472409" },
};

function PlayerCard({ s, place, selected, onSelect, catMeta, st, t, nm }) {
  const first = place === 1;
  // The photo fills the band BELOW the rank column (so it never covers the
  // place, the score flag or «Umumiy») and ABOVE the foot's own text block
  // (name + unit + stat grid), centered in it — sized off the card's measured
  // width (the card is 0.73 wide-to-tall), so the initials inside it scale
  // with it too. Sized against the foot's BLUR edge instead it ended well
  // above the name and left a dead strip of bare plate; reaching into the
  // glass is the design («the render's legs melt into the frosted foot»).
  const [cardRef, cardW] = useElementWidth();
  const cardH = cardW ? cardW / 0.73 : 0;
  const headTop = first ? 96 : 80;
  const footText = first ? 98 : 82;
  const band = cardH ? Math.max(0, cardH - headTop - footText) : 0;
  const photo = band ? clamp(Math.round(Math.min(cardW * 0.58, band - 14)), 36, 200) : 0;
  const rim = photo > 90 ? 4 : 2.5;
  const photoTop = Math.round(headTop + Math.max(0, band - photo - rim * 2) / 2);
  // Where the medallion's center sits, as a share of the card — the engraved
  // arcs and the champion halo radiate from the head, wherever it landed.
  const centerPct = cardH ? (((photoTop + rim + photo / 2) / cardH) * 100).toFixed(1) : "24";
  const p = PLATE[place];
  const up = (s.scoreDelta ?? 0) >= 0;
  return (
    <button
      ref={cardRef}
      onClick={onSelect}
      className={`fut-card place-${place}${first ? " fut-champ" : ""} relative flex flex-col overflow-hidden rounded-2xl`}
      style={{
        aspectRatio: "0.73",
        color: p.ink,
        background: `linear-gradient(158deg, ${p.hi} 0%, ${p.mid} 46%, ${p.lo} 100%)`,
        border: `1px solid ${hexA(p.mid, 0.8)}`,
        boxShadow: selected
          ? `0 24px 50px -20px ${hexA(p.mid, 0.7)}, 0 0 0 3px var(--brand-ring)`
          : `0 24px 50px -22px ${hexA(p.mid, 0.6)}`,
      }}
    >
      {/* plate finish — a raking highlight and a glow off the top edge */}
      <span aria-hidden className="absolute inset-0 pointer-events-none" style={{ background: `linear-gradient(104deg, transparent 6%, ${hexA(p.edge, 0.5)} 20%, transparent 33%), radial-gradient(120% 55% at 50% -4%, ${hexA(p.edge, 0.55)} 0%, transparent 64%)` }} />
      {/* engraved arcs — the FIDE-poster decoration translated onto metal:
          thin rings radiating from behind the head, fading out well before
          the frosted foot so the band stays calm */}
      <span aria-hidden className="absolute inset-0 pointer-events-none" style={{ background: `repeating-radial-gradient(circle at 50% ${centerPct}%, transparent 0 42px, ${hexA(p.edge, 0.45)} 42px 43.5px)`, opacity: 0.55, maskImage: "linear-gradient(to bottom, black 0%, black 50%, transparent 74%)", WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 50%, transparent 74%)" }} />
      {/* champion halo — a slow breathing glow behind the render, tracking
          the medallion wherever the measurement seated it */}
      {first && photo > 0 && <span aria-hidden className="podium-halo absolute pointer-events-none rounded-full" style={{ left: "10%", right: "10%", top: photoTop - photo * 0.32, height: photo * 1.64, background: `radial-gradient(circle at 50% 50%, ${hexA(p.edge, 0.8)} 0%, transparent 62%)` }} />}

      {/* the brigadir — their profile photo struck as a medallion under the
          spotlight, the plate's own metal as its rim (initials on their hue
          where nobody uploaded one) */}
      {photo > 0 && (
        <span aria-hidden className="absolute left-0 right-0 flex justify-center pointer-events-none select-none" style={{ top: photoTop }}>
          <span className="rounded-full" style={{ padding: rim, background: `linear-gradient(160deg, ${p.edge} 0%, ${p.mid} 55%, ${p.lo} 100%)`, boxShadow: `0 16px 30px -14px ${hexA(p.deep, 0.85)}` }}>
            <Avatar sup={s} size={photo} />
          </span>
        </span>
      )}

      {/* frosted foot — progressive backdrop blur (the render's legs melt into
          the glass; the mask fades the blur in so there is no hard seam) plus
          a deep-metal tint that keeps the band legible and stands in as the
          scrim when backdrop-filter is unsupported (old Telegram WebViews) */}
      <span aria-hidden className="absolute left-0 right-0 bottom-0 pointer-events-none" style={{ height: "44%", backdropFilter: "blur(14px) saturate(1.2)", WebkitBackdropFilter: "blur(14px) saturate(1.2)", maskImage: "linear-gradient(to top, black 58%, transparent 100%)", WebkitMaskImage: "linear-gradient(to top, black 58%, transparent 100%)" }} />
      <span aria-hidden className="absolute left-0 right-0 bottom-0 pointer-events-none" style={{ height: "50%", background: `linear-gradient(to top, ${hexA(p.deep, 0.88)} 0%, ${hexA(p.deep, 0.5)} 55%, transparent 100%)` }} />
      {first && <span aria-hidden className="fut-sheen absolute pointer-events-none" style={{ top: "-25%", bottom: "-25%", width: "36%", background: `linear-gradient(90deg, transparent, ${hexA("#FFFFFF", 0.42)}, transparent)` }} />}

      {/* rank column — the big embossed place number over its skewed dark
          score flag, underscored by the composite's traffic-light band */}
      <span className="absolute flex flex-col items-start" style={{ top: first ? 8 : 6, left: first ? 14 : 10, lineHeight: 1 }}>
        <b className="tabular-nums" style={{ fontSize: first ? 44 : 33, fontWeight: 900, letterSpacing: "-0.04em", textShadow: `0 1px 0 ${hexA(p.edge, 0.65)}` }}>{s.rank}</b>
        <span className="tabular-nums" style={{ marginTop: 5, marginLeft: 3, padding: first ? "3px 9px" : "2px 7px", fontSize: first ? 15 : 12.5, fontWeight: 900, color: p.hi, background: hexA(p.ink, 0.88), transform: "skewX(-10deg)", borderRadius: 3, boxShadow: `0 4px 14px -6px ${hexA(p.deep, 0.8)}` }}>
          <span style={{ display: "inline-block", transform: "skewX(10deg)" }}>{fmt(s.comp)}</span>
        </span>
        <span className="flex items-center gap-1" style={{ marginTop: 5, marginLeft: 3 }}>
          <i className="rounded-full" style={{ width: 6, height: 6, background: bandFill(st, s.comp) }} />
          <span style={{ fontSize: first ? 10 : 9, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", opacity: 0.88 }}>{t("leaderboard.overallShort")}</span>
        </span>
      </span>

      {/* the cup — a medallion struck into the plate, not an icon laid on it:
          a recessed coin (dark-to-light recess, inset top shadow, lit bottom
          lip, frosted so the arcs melt away beneath it) holding the trophy as
          a clean engraved stroke — no fill: lucide glyphs are stroke-drawn and
          flooding them blots the open bowl — lit by the same 1px edge-light
          the rank numeral carries. The period's score movement rides under it
          on the coin's own center axis. */}
      <span className="absolute flex flex-col items-center gap-1.5" style={{ top: first ? 10 : 8, right: first ? 12 : 9 }}>
        <span aria-hidden className="flex items-center justify-center rounded-full" style={{
          width: first ? 40 : 31, height: first ? 40 : 31,
          background: `linear-gradient(168deg, ${hexA(p.lo, 0.34)} 0%, ${hexA(p.mid, 0.18)} 52%, ${hexA(p.edge, 0.4)} 100%)`,
          border: `1px solid ${hexA(p.ink, 0.16)}`,
          boxShadow: `inset 0 1.5px 3px ${hexA(p.deep, 0.34)}, inset 0 -1px 1px ${hexA(p.edge, 0.5)}, 0 1px 0 ${hexA(p.edge, 0.5)}`,
          backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
        }}>
          <Trophy size={first ? 21 : 16} strokeWidth={first ? 2.25 : 2.5} style={{ color: p.ink, filter: `drop-shadow(0 1px 0 ${hexA(p.edge, 0.55)})` }} />
        </span>
        {s.scoreDelta != null && (
          <span className="inline-flex items-center gap-0.5 rounded-full tabular-nums" style={{ fontSize: 10, fontWeight: 800, padding: "1.5px 7px", background: hexA("#FFFFFF", 0.78), border: `1px solid ${hexA(p.ink, 0.1)}`, boxShadow: `0 2px 6px -3px ${hexA(p.deep, 0.6)}`, color: up ? "#15803D" : "#B91C1C" }}>
            {up ? <ArrowUp size={9} /> : <ArrowDown size={9} />}{fmt1(Math.abs(s.scoreDelta))}
          </span>
        )}
      </span>

      {/* name band + stat grid — riding the frosted foot in light ink */}
      <span className="relative mt-auto w-full" style={{ padding: first ? "0 11px 11px" : "0 7px 8px", color: "#FFFFFF", textShadow: "0 1px 2px rgba(0,0,0,0.4)" }}>
        <span className="block truncate text-center" style={{ fontSize: first ? 15.5 : 12.5, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.02em", padding: "5px 2px 0" }}>{nm(s.name)}</span>
        <span className="flex items-center justify-center gap-1.5" style={{ fontSize: first ? 10 : 9, fontWeight: 600, color: "rgba(255,255,255,0.82)", padding: "2px 0 6px" }}>
          {s.sub && <span className="truncate min-w-0">{s.sub}</span>}
          {s.shift && <span className="rounded tabular-nums flex-shrink-0" style={{ fontSize: first ? 9.5 : 9, fontWeight: 800, letterSpacing: "0.05em", padding: "1px 5px", background: "rgba(255,255,255,0.16)", color: "#FFFFFF" }}>S{s.shift}</span>}
        </span>
        <span className="block" style={{ height: 1, background: `linear-gradient(90deg, transparent, ${hexA(p.hi, 0.6)}, transparent)` }} />
        <span className="grid" style={{ gridTemplateColumns: `repeat(${LIVE.length}, minmax(0, 1fr))`, paddingTop: 6 }}>
          {LIVE.map((c, i) => (
            <span key={c.key} title={`${catMeta[c.key].name}: ${c.live === false ? t("leaderboard.notYet") : s.s[c.key] == null ? t("leaderboard.noData") : `${fmt(s.s[c.key])}%`}`} className="flex flex-col items-center" style={{ borderLeft: i ? "1px solid rgba(255,255,255,0.2)" : undefined, opacity: c.live === false ? 0.55 : 1 }}>
              <b className="tabular-nums" style={{ fontSize: first ? 15 : 12.5, fontWeight: 900, lineHeight: 1 }}>{fmt(s.s[c.key])}</b>
              <span className="truncate max-w-full" style={{ fontSize: first ? 9 : 8.5, fontWeight: 800, letterSpacing: "0.02em", textTransform: "uppercase", opacity: 0.88, marginTop: 3 }}>{catMeta[c.key].tiny}</span>
            </span>
          ))}
        </span>
      </span>
    </button>
  );
}

function Podium({ byRank, selectedId, onSelect, catMeta, st, t, nm }) {
  // A filtered pool can hold fewer than 3 brigadirs — render only real places,
  // centered, instead of assuming a full podium.
  const full = byRank.length >= 3;
  return (
    <div
      className={`podium-grid${full ? "" : " podium-short"}`}
      style={full ? undefined : { gridTemplateColumns: `repeat(${byRank.length}, minmax(0, 300px))`, justifyContent: "center" }}
    >
      <style>{`
        /* Phone: the champion takes the full width on its own row, the two
           runners-up share the row underneath. Desktop unfolds the classic
           2 · 1 · 3 podium with the champion taller and lifted. */
        .podium-grid { display:grid; gap:10px; align-items:end; padding-top:14px; grid-template-columns:1fr 1fr; }
        .podium-grid > .place-1 { grid-column:1 / -1; justify-self:center; width:100%; max-width:264px; }
        .podium-short > .place-1 { grid-column:auto; width:auto; max-width:none; }
        @media (min-width: 700px) {
          .podium-grid:not(.podium-short) { gap:14px; grid-template-columns:1fr 1.14fr 1fr; }
          /* a card is a card — it keeps its size on a wide screen instead of
             stretching into a poster */
          .podium-grid > .fut-card { justify-self:center; width:100%; max-width:300px; }
          .podium-grid:not(.podium-short) > .place-1 { grid-column:auto; max-width:344px; order:2; transform:translateY(-14px); }
          .podium-grid:not(.podium-short) > .place-2 { order:1; }
          .podium-grid:not(.podium-short) > .place-3 { order:3; }
        }
        @keyframes podiumHalo { 0%,100% { opacity:.45; transform:scale(1); } 50% { opacity:.9; transform:scale(1.08); } }
        .podium-halo { animation: podiumHalo 3.6s ease-in-out infinite; }
        @keyframes futSheen { 0% { transform:translateX(-140%) skewX(-14deg); } 55%,100% { transform:translateX(300%) skewX(-14deg); } }
        .fut-sheen { transform:translateX(-140%) skewX(-14deg); animation: futSheen 5s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .podium-halo { animation:none; opacity:.7; }
          .fut-sheen { animation:none; opacity:0; }
        }
      `}</style>
      {byRank.slice(0, 3).map((s, i) => (
        <PlayerCard key={s.id} s={s} place={i + 1} selected={s.id === selectedId}
          onSelect={() => onSelect(s.id)} catMeta={catMeta} st={st} t={t} nm={nm} />
      ))}
    </div>
  );
}

/* ═══════════════════════ breakdown (an opened row) ═══════════════════
 * The statistics against the TEAM, drawn as a spider chart: the
 * brigadir's own shape in brand gold (gold means the selected brigadir on
 * this page, and an opened row is always the selected one), the team average
 * as a dashed outline under it, every vertex dot in its value's traffic-light
 * band and every vertex NAMED with its value and its change since the first
 * week — plus the two strongest and two weakest named outright. */

/* Radar geometry. The radius is SOLVED from the measured width and the
 * measured labels, never fixed: one opened row is ~450px of a desktop table
 * and ~320px of a phone card, and a fixed radius either runs the side labels
 * off the phone or shrinks the web to a thumbnail on the desktop. */
const RADAR = {
  maxW: 460,              // the drawing never grows wider than this…
  rMax: 104, rMin: 52,    // …nor its web past this radius
  pad: 4,                 // clear margin inside the drawing
  gapX: 10,               // vertex → a label beside it
  gapY: 11,               // vertex → a label above / below (clears an enlarged dot)
  icon: 12, iconGap: 4,
  nameFs: 11.5, valueFs: 13.5, deltaFs: 10.5,
  nameBase: 11, valueBase: 27, blockH: 31, // baselines inside one label block
  rings: [20, 40, 60, 80, 100],
};
const TIP_W = 220, TIP_GAP = 14;

const px1 = (v) => Math.round(v * 10) / 10;
const fmtDelta = (d) => (d == null ? "" : `${d > 0 ? "+" : d < 0 ? "−" : ""}${fmt(Math.abs(d))}`);

/* Label widths decide the radius, so they are MEASURED in the page's own font
 * rather than guessed from a character count — the short names run from six
 * to ten characters across the four languages. Padded by 5%: a webfont that
 * lands after the first measure must not push a label over its edge. */
let measureCtx, measureFamily;
function textWidth(str, px, weight) {
  if (!str) return 0;
  if (measureCtx === undefined) {
    measureCtx = (typeof document !== "undefined" && document.createElement("canvas").getContext("2d")) || null;
    measureFamily = (measureCtx && getComputedStyle(document.body).fontFamily) || "sans-serif";
  }
  if (!measureCtx) return str.length * px * 0.62;
  measureCtx.font = `${weight} ${px}px ${measureFamily}`;
  return measureCtx.measureText(str).width;
}

/* Where everything sits for a given width. Axis 0 points straight up and the
 * rest follow clockwise; a label rides beside its vertex on the flanks and
 * above / below it at the top and bottom. Every label extent is linear in
 * the radius, so the largest radius at which all of them clear both edges
 * solves in closed form — no trial rendering. */
function radarLayout(width, blocks) {
  const { pad, gapX, gapY, blockH, rMax, rMin } = RADAR;
  const n = blocks.length;
  let W, cx;
  const axes = blocks.map((b, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
    const ux = Math.cos(a), uy = Math.sin(a);
    const place = uy < -0.55 ? "above" : uy > 0.55 ? "below" : "side";
    return { ux, uy, place, align: place === "side" ? (ux > 0 ? "start" : "end") : "middle", w: b.w, nameW: b.nameW };
  });
  const span = (ax, r) => {
    const x = cx + ax.ux * r + (ax.place === "side" ? Math.sign(ax.ux) * gapX : 0);
    return ax.align === "start" ? [x, x + ax.w] : ax.align === "end" ? [x - ax.w, x] : [x - ax.w / 2, x + ax.w / 2];
  };
  // Narrower than even the smallest web needs (a 320px phone, English
  // labels) the drawing is laid out at the width it needs and SCALED down to
  // the box — smaller text beats labels clipped off the edge.
  const fit = () => {
    W = Math.min(width, RADAR.maxW); cx = W / 2;
    const lim = axes.reduce((acc, ax) => {
      const [l0, r0] = span(ax, 0);
      if (ax.ux > 1e-6) acc = Math.min(acc, (W - pad - r0) / ax.ux);
      if (ax.ux < -1e-6) acc = Math.min(acc, (l0 - pad) / -ax.ux);
      return acc;
    }, rMax);
    if (lim >= rMin) return lim;
    W = Math.ceil(2 * (pad + Math.max(...axes.map((ax) => { const [l, rt] = span(ax, rMin); return Math.max(cx - l, rt - cx); }))));
    cx = W / 2;
    return rMin;
  };
  let r = fit();
  // Labels under the web centre on their vertices while they clear each
  // other; once two would touch, both turn outward instead.
  const below = axes.filter((ax) => ax.place === "below").sort((p, q) => p.ux - q.ux);
  if (below.some((ax, k) => k > 0 && span(below[k - 1], r)[1] + 12 > span(ax, r)[0])) {
    below.forEach((ax) => { ax.align = ax.ux < 0 ? "end" : "start"; });
    r = fit();
  }
  const top = (ax) => ax.uy * r + (ax.place === "above" ? -gapY - blockH : ax.place === "below" ? gapY : -blockH / 2);
  const cy = pad - Math.min(-r, ...axes.map(top));
  const H = Math.ceil(cy + Math.max(...axes.map((ax) => Math.max(ax.uy * r, top(ax) + blockH))) + pad);
  return {
    W, H, cx, cy, r, scale: Math.min(1, width / W),
    axes: axes.map((ax) => { const [left, right] = span(ax, r); return { ...ax, left, right, top: cy + top(ax) }; }),
    at: (i, pct) => [cx + axes[i].ux * r * (pct / 100), cy + axes[i].uy * r * (pct / 100)],
  };
}

/* One series as paths over the axes that carry a value: the closed area, and
 * its outline — whole when nothing is missing, otherwise split so an edge
 * that skips an axis with no data is drawn apart (dotted). A solid straight
 * edge across that axis would read as a value on it. */
function radarShape(L, vals) {
  const n = vals.length, idx = [];
  vals.forEach((v, i) => { if (v != null) idx.push(i); });
  const p = (i) => L.at(i, clamp(vals[i], 0, 100)).map(px1).join(",");
  const area = idx.length >= 3 ? `M${idx.map(p).join("L")}Z` : "";
  let edges = "", skips = "";
  if (idx.length >= 2 && idx.length < n) {
    idx.forEach((i, k) => {
      if (idx.length === 2 && k === 1) return;
      const j = idx[(k + 1) % idx.length];
      if ((j - i + n) % n === 1) edges += `M${p(i)}L${p(j)}`; else skips += `M${p(i)}L${p(j)}`;
    });
  }
  return { area, edges, skips, whole: idx.length === n };
}

/* A series key: a short stroke in the series' own line style — what the
 * chart draws, not a filled box. */
function LineKey({ tone, dashed }) {
  return (
    <svg width="16" height="6" className="flex-shrink-0" aria-hidden="true">
      <line x1="1" y1="3" x2="15" y2="3" stroke={tone} strokeWidth="2" strokeLinecap={dashed ? "butt" : "round"} strokeDasharray={dashed ? "3 2" : undefined} />
    </svg>
  );
}

/* The spider chart. Reading one axis is a hover on a mouse, a tap on a phone
 * (tap again, or anywhere else, to close) and the arrow keys once focused;
 * the pointer never has to land on a 2px line — whichever axis is nearest by
 * ANGLE is the one read. Every value the readout shows is also printed on the
 * chart or in its aria-label, so the readout adds the team's number beside
 * the brigadir's and gates nothing. */
function RadarChart({ s, catMeta, teamAvg, st, t, nm, vsLabel }) {
  const [measureRef, width] = useElementWidth();
  const [active, setActive] = useState(null);
  const [tipPos, setTipPos] = useState(null); // { i, left, top } — the readout's measured placement
  const boxRef = useRef(null), svgRef = useRef(null);
  const shapeRef = useRef(null), tipRef = useRef(null), tapRef = useRef(null);
  const setBox = useCallback((el) => { boxRef.current = el; measureRef(el); }, [measureRef]);
  const n = CATS.length;

  const rows = useMemo(() => CATS.map((c) => {
    // The change is against the period before — the one MoveChip and the
    // KPI strip compare with.
    const v = s.s[c.key], arr = s.sparks[c.key];
    const prev = arr && arr.length > 1 ? arr[arr.length - 2] : null;
    return { key: c.key, meta: catMeta[c.key], v, avg: teamAvg[c.key], d: v != null && prev != null ? v - prev : null };
  }), [s, catMeta, teamAvg]);

  const L = useMemo(() => {
    if (!width) return null;
    const { icon, iconGap, nameFs, valueFs, deltaFs } = RADAR;
    return radarLayout(width, rows.map((row) => {
      const nameW = icon + iconGap + textWidth(row.meta.short, nameFs, 500);
      const valueW = (row.v == null ? textWidth(t(row.meta.live === false ? "leaderboard.notYet" : "leaderboard.noData"), nameFs, 500) : textWidth(`${fmt(row.v)}%`, valueFs, 700))
        + (row.d == null ? 0 : 4 + textWidth(fmtDelta(row.d), deltaFs, 600));
      return { nameW: nameW * 1.05, w: Math.ceil(Math.max(nameW, valueW) * 1.05) + 2 };
    }));
  }, [width, rows, t]);

  // The brigadir's shape grows out of the centre once, as the row opens.
  const drawn = !!L;
  useEffect(() => {
    const el = shapeRef.current;
    if (!drawn || !el || !el.animate || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    el.animate([{ opacity: 0, transform: "scale(0.6)" }, { opacity: 1, transform: "scale(1)" }], { duration: 420, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" });
  }, [drawn]);

  // Where the readout goes — MEASURED, both its own height (a long category
  // name wraps) and the room around it. Next to the label of the axis being
  // read and never over it: under a label on the flanks, beside one at the
  // top and bottom. Where the opened row has no room for that (a phone) it
  // docks to the half of the chart AWAY from the axis instead. Never past the
  // row, which sits in a scrolling table that would clip it. Runs before
  // paint, so an unplaced readout is never seen.
  useLayoutEffect(() => {
    const tipEl = tipRef.current, box = boxRef.current;
    if (active == null || !L || !tipEl || !box) return;
    const k = L.scale, h = tipEl.offsetHeight, chartH = L.H * k, offX = (width - L.W * k) / 2;
    const b = box.getBoundingClientRect();
    const row = (box.closest("[data-breakdown]") || box).getBoundingClientRect();
    const lo = row.left - b.left + 2, hi = row.right - b.left - TIP_W - 2;
    const ax = L.axes[active];
    const lb = { l: offX + ax.left * k, r: offX + ax.right * k, t: ax.top * k, b: (ax.top + RADAR.blockH) * k };
    let left, top;
    if (ax.place === "side") { left = ax.ux > 0 ? lb.l : lb.r - TIP_W; top = lb.b + 6; }
    else { left = ax.ux < -0.2 ? lb.l - TIP_GAP - TIP_W : lb.r + TIP_GAP; top = ax.place === "above" ? lb.t : lb.b - h; }
    if (left >= lo && left <= hi) top = clamp(top, 0, Math.max(0, chartH - h));
    else {
      const vy = L.at(active, clamp(rows[active].v ?? rows[active].avg ?? 100, 0, 100))[1] * k;
      left = clamp((width - TIP_W) / 2, lo, Math.max(lo, hi));
      top = vy > chartH / 2 ? 0 : Math.max(0, chartH - h);
    }
    left = Math.round(left); top = Math.round(top);
    if (!tipPos || tipPos.i !== active || tipPos.left !== left || tipPos.top !== top) setTipPos({ i: active, left, top });
  }, [active, L, width, rows, tipPos]);

  // A tap anywhere outside the chart closes the readout.
  useEffect(() => {
    if (active == null) return undefined;
    const off = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setActive(null); };
    document.addEventListener("pointerdown", off);
    return () => document.removeEventListener("pointerdown", off);
  }, [active]);

  if (!L) return <div ref={setBox} className="w-full" />;

  const axisAt = (e) => {
    const box = svgRef.current.getBoundingClientRect();
    const k = L.W / (box.width || L.W); // screen px → drawing units, for a scaled-down chart
    const x = (e.clientX - box.left) * k - L.cx, y = (e.clientY - box.top) * k - L.cy;
    if (Math.hypot(x, y) < 6) return active; // the dead centre names no axis
    const turn = (Math.atan2(y, x) + Math.PI / 2 + 2 * Math.PI) % (2 * Math.PI);
    return Math.round(turn / ((2 * Math.PI) / n)) % n;
  };
  const onKeyDown = (e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") setActive((c) => (c == null ? 0 : (c + 1) % n));
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") setActive((c) => (c == null ? n - 1 : (c - 1 + n) % n));
    else if (e.key === "Escape") setActive(null);
    else return;
    e.preventDefault();
  };

  const mine = radarShape(L, rows.map((row) => row.v));
  const team = radarShape(L, rows.map((row) => row.avg));
  const noDataOf = (row) => t(row.meta.live === false ? "leaderboard.notYet" : "leaderboard.noData");
  const summary = `${nm(s.name)} — ` + rows.map((row) =>
    `${row.meta.name}: ${row.v == null ? noDataOf(row) : `${fmt(row.v)}%`} (${t("leaderboard.teamAvg")}: ${row.avg == null ? "—" : `${fmt(row.avg)}%`})`).join("; ");

  const cur = active != null ? rows[active] : null;
  const CurIcon = cur?.meta.icon;

  return (
    <div ref={setBox} className="relative w-full">
      <div tabIndex={0} role="img" aria-label={summary} onKeyDown={onKeyDown} onBlur={() => setActive(null)}
        className="mx-auto rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]" style={{ width: L.W * L.scale }}>
        <svg ref={svgRef} width={px1(L.W * L.scale)} height={px1(L.H * L.scale)} viewBox={`0 0 ${L.W} ${L.H}`} style={{ display: "block" }} aria-hidden="true"
          onPointerMove={(e) => { if (e.pointerType === "mouse") setActive(axisAt(e)); }}
          onPointerLeave={(e) => { if (e.pointerType === "mouse") setActive(null); }}
          onPointerDown={(e) => { tapRef.current = e.pointerType === "mouse" ? null : [e.clientX, e.clientY]; }}
          onPointerUp={(e) => {
            // A tap, not a drag — a scroll that starts on the chart cancels the
            // pointer instead, so it never gets here.
            const at = tapRef.current;
            tapRef.current = null;
            if (!at || Math.hypot(e.clientX - at[0], e.clientY - at[1]) > 10) return;
            const i = axisAt(e);
            setActive((c) => (c === i ? null : i));
          }}>
          {/* the web: a ring every 20 points, one spoke per statistic */}
          {RADAR.rings.map((pct) => (
            <path key={pct} d={`M${CATS.map((_, i) => L.at(i, pct).map(px1).join(",")).join("L")}Z`} fill="none" stroke="var(--border-md)" strokeWidth="1" />
          ))}
          {CATS.map((c, i) => {
            const [x, y] = L.at(i, 100);
            return <line key={c.key} x1={px1(L.cx)} y1={px1(L.cy)} x2={px1(x)} y2={px1(y)} stroke={active === i ? "var(--text-3)" : "var(--border-md)"} strokeWidth="1" />;
          })}

          {/* the team average under the brigadir — seen through their wash */}
          {team.area && <path d={team.area} fill="none" stroke="var(--text-3)" strokeWidth="1.5" strokeDasharray="4 3" strokeLinejoin="round" />}

          <g ref={shapeRef} style={{ transformOrigin: `${px1(L.cx)}px ${px1(L.cy)}px` }}>
            {mine.area && <path d={mine.area} fill="var(--brand)" fillOpacity="0.16" stroke={mine.whole ? "var(--brand)" : "none"} strokeWidth="2" strokeLinejoin="round" />}
            {mine.edges && <path d={mine.edges} fill="none" stroke="var(--brand)" strokeWidth="2" strokeLinecap="round" />}
            {mine.skips && <path d={mine.skips} fill="none" stroke="var(--brand)" strokeWidth="1.5" strokeDasharray="1 4" strokeLinecap="round" />}
            {rows.map((row, i) => {
              if (row.v == null) return null;
              const [x, y] = L.at(i, clamp(row.v, 0, 100));
              return <circle key={row.key} cx={px1(x)} cy={px1(y)} r={active === i ? 6 : 4.5} fill={bandFill(st, row.v)} stroke="var(--bg-inner)" strokeWidth="2" />;
            })}
          </g>

          {/* where the team sits on the axis being read */}
          {cur && cur.avg != null && (() => {
            const [x, y] = L.at(active, clamp(cur.avg, 0, 100));
            return <circle cx={px1(x)} cy={px1(y)} r="3.5" fill="var(--bg-inner)" stroke="var(--text-2)" strokeWidth="1.5" />;
          })()}

          {/* the labels: identity icon + short name, then value and change */}
          {rows.map((row, i) => {
            const ax = L.axes[i], Icon = row.meta.icon, on = active === i;
            const nameX = ax.align === "start" ? ax.left : ax.align === "end" ? ax.right - ax.nameW : (ax.left + ax.right - ax.nameW) / 2;
            const valueX = ax.align === "start" ? ax.left : ax.align === "end" ? ax.right : (ax.left + ax.right) / 2;
            return (
              <g key={row.key}>
                <Icon x={px1(nameX)} y={px1(ax.top + RADAR.nameBase - 10)} size={RADAR.icon} color={row.meta.hue} strokeWidth={2.25} aria-hidden="true" />
                <text x={px1(nameX + RADAR.icon + RADAR.iconGap)} y={px1(ax.top + RADAR.nameBase)} fontSize={RADAR.nameFs} fontWeight={on ? 600 : 500} fill={on ? "var(--text-1)" : "var(--text-2)"}>{row.meta.short}</text>
                <text x={px1(valueX)} y={px1(ax.top + RADAR.valueBase)} textAnchor={ax.align} style={{ fontVariantNumeric: "tabular-nums" }}>
                  {row.v == null
                    ? <tspan fontSize={RADAR.nameFs} fontWeight="500" fill={st.none}>{noDataOf(row)}</tspan>
                    : <tspan fontSize={RADAR.valueFs} fontWeight="700" fill={bandInk(st, row.v)}>{fmt(row.v)}%</tspan>}
                  {row.d != null && <tspan dx="4" fontSize={RADAR.deltaFs} fontWeight="600" fill={deltaInk(st, row.d)}>{fmtDelta(row.d)}</tspan>}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {cur && (
        <div ref={tipRef} className="absolute z-10 pointer-events-none rounded-lg px-2.5 py-2"
          style={{ left: tipPos?.left ?? 0, top: tipPos?.top ?? 0, visibility: tipPos?.i === active ? "visible" : "hidden", width: TIP_W, background: "var(--bg-accent)", border: "1px solid var(--border-md)", boxShadow: "0 6px 20px rgba(0,0,0,0.25)" }}>
          <div className="flex items-start gap-1.5 text-xs font-bold leading-snug" style={{ color: "var(--text-1)" }}>
            <CurIcon size={12} className="flex-shrink-0 mt-[2px]" style={{ color: cur.meta.hue }} />
            <span className="min-w-0">{cur.meta.name}</span>
          </div>
          <div className="grid items-center gap-x-2 gap-y-1 mt-1.5 text-[11px] leading-tight" style={{ gridTemplateColumns: "16px auto minmax(0,1fr)" }}>
            <LineKey tone="var(--brand)" />
            <b className="tabular-nums text-right" style={{ color: bandInk(st, cur.v) }}>{cur.v == null ? "" : `${fmt(cur.v)}%`}</b>
            <span style={{ color: "var(--text-3)" }}>{shortPerson(nm(s.name))}{cur.v == null && <span style={{ color: st.none }}> · {noDataOf(cur)}</span>}</span>
            <LineKey tone="var(--text-3)" dashed />
            <b className="tabular-nums text-right" style={{ color: "var(--text-1)" }}>{cur.avg == null ? "—" : `${fmt(cur.avg)}%`}</b>
            <span style={{ color: "var(--text-3)" }}>{t("leaderboard.teamAvg")}</span>
            {cur.d != null && <>
              <span className="flex justify-center" style={{ color: deltaInk(st, cur.d) }}>{cur.d > 0 ? <ArrowUp size={11} /> : cur.d < 0 ? <ArrowDown size={11} /> : <Minus size={11} />}</span>
              <b className="tabular-nums text-right" style={{ color: deltaInk(st, cur.d) }}>{fmtDelta(cur.d)}</b>
              <span style={{ color: "var(--text-3)" }}>{vsLabel}</span>
            </>}
          </div>
        </div>
      )}
    </div>
  );
}

function BreakdownBody({ s, catMeta, teamAvg, st, t, nm, vsLabel }) {
  const have = LIVE.filter((c) => s.s[c.key] != null);
  const sorted = [...have].sort((a, b) => s.s[b.key] - s.s[a.key]);
  const strong = sorted.slice(0, 2), weak = sorted.slice(Math.max(2, sorted.length - 2)).reverse();
  const chip = (c, good) => (
    <span key={c.key} className="inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2.5 py-1 tabular-nums"
      style={{ color: good ? st.okInk : st.badInk, background: hexA(good ? st.ok : st.bad, 0.12) }}>
      {good ? <ArrowUp size={10} /> : <ArrowDown size={10} />}{catMeta[c.key].short} · {fmt(s.s[c.key])}%
    </span>
  );
  return (
    <div data-breakdown className="grid gap-4 lg:grid-cols-[minmax(0,520px)_236px] lg:justify-center lg:items-center lg:gap-x-12">
      <div className="flex flex-col gap-2 min-w-0">
        <RadarChart s={s} catMeta={catMeta} teamAvg={teamAvg} st={st} t={t} nm={nm} vsLabel={vsLabel} />
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px]" style={{ color: "var(--text-3)" }}>
          <span className="inline-flex items-center gap-1.5"><LineKey tone="var(--brand)" />{shortPerson(nm(s.name))}</span>
          <span className="inline-flex items-center gap-1.5"><LineKey tone="var(--text-3)" dashed />{t("leaderboard.teamAvg")}</span>
          <span style={{ color: "var(--text-4)" }}>{t("leaderboard.radarLegend")}</span>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>{t("leaderboard.strengths")}</span>
        <span className="flex flex-wrap gap-1.5">{strong.map((c) => chip(c, true))}</span>
        {weak.length > 0 && <>
          <span className="text-[10px] font-bold uppercase tracking-wider mt-1" style={{ color: "var(--text-3)" }}>{t("leaderboard.growthZones")}</span>
          <span className="flex flex-wrap gap-1.5">{weak.map((c) => chip(c, false))}</span>
        </>}
      </div>
    </div>
  );
}

/* ═══════════════════════ register rows ═══════════════════════════════ */
function TableRow({ s, isSel, isExp, onClick, sortKey, catMeta, teamAvg, st, medal, t, nm, showShift, vsLabel }) {
  const onKey = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } };
  return (
    <>
      <tr onClick={onClick} onKeyDown={onKey} tabIndex={0} aria-expanded={isExp}
        className="transition-colors cursor-pointer" style={isSel ? { background: "var(--brand-bg)" } : undefined}>
        <td className="px-3 py-2">
          <span className="flex items-center gap-2">
            <PlaceBadge place={s.rank} medal={medal} />
            <MoveChip prev={s.prevRank} now={s.rank} st={st} t={t} vsLabel={vsLabel} />
          </span>
        </td>
        <td className="px-3 py-2">
          <span className="flex items-center gap-2.5">
            <Avatar sup={s} size={30} />
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold leading-tight" style={{ color: "var(--text-1)" }}>{nm(s.name)}</span>
              <span className="flex items-center gap-1.5 text-[11px] mt-0.5" style={{ color: "var(--text-4)" }}>
                {s.sub && <span className="truncate">{s.sub}</span>}{showShift && s.shift && <ShiftChip shift={s.shift} t={t} />}
              </span>
            </span>
          </span>
        </td>
        <td className="px-3 py-2" style={sortKey === "overall" ? { background: "var(--bg-inner)" } : undefined}>
          <span className="flex items-baseline gap-1">
            <b className="tabular-nums" style={{ fontSize: 15, fontWeight: 800, color: bandInk(st, s.comp) }}>{fmt1(s.comp)}</b>
            <span className="tabular-nums text-[11px]" style={{ color: "var(--text-4)" }}>/100</span>
          </span>
          <span className="block overflow-hidden rounded-full mt-1.5" style={{ height: 4, width: 96, background: "var(--border-md)" }}>
            <i className="block h-full rounded-full" style={{ width: `${clamp(s.comp, 0, 100)}%`, background: bandFill(st, s.comp) }} />
          </span>
        </td>
        {CATS.map((c) => {
          const v = s.s[c.key];
          return (
            <td key={c.key} className="px-3 py-2 text-right hidden md:table-cell"
              title={v == null ? undefined : cellTip(s, c.key, t)}
              style={sortKey === c.key ? { background: "var(--bg-inner)" } : undefined}>
              {v == null
                ? <span className="font-semibold" style={{ color: st.none, opacity: c.live === false ? 0.6 : 1 }} title={t(c.live === false ? "leaderboard.notYet" : "leaderboard.noData")}>—</span>
                : <>
                  <span className="tabular-nums font-bold text-[13px]" style={{ color: bandInk(st, v) }}>{fmt(v)}%</span>
                  <Meter pct={v} color={bandFill(st, v)} align="right" />
                </>}
            </td>
          );
        })}
        <td className="px-3 py-2 hidden lg:table-cell">
          <span className="flex justify-center"><Spark vals={s.hist} tone={sparkTone(st, s.hist)} /></span>
        </td>
        <td className="px-3 py-2">
          <ChevronDown size={15} style={{ color: "var(--text-4)", transform: isExp ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
        </td>
      </tr>
      {isExp && (
        <tr>
          <td colSpan={5 + CATS.length} className="px-4 py-3" style={{ background: "var(--bg-inner)" }}>
            <BreakdownBody s={s} catMeta={catMeta} teamAvg={teamAvg} st={st} t={t} nm={nm} vsLabel={vsLabel} />
          </td>
        </tr>
      )}
    </>
  );
}

/* Phone: the same row as a stacked card — place, who, the overall score — and
 * the breakdown opens INSIDE the card, so the statistics the narrow
 * table has no room for are one tap away from the name. */
function MobileRow({ s, isSel, isExp, onClick, catMeta, teamAvg, st, medal, t, nm, showShift, vsLabel }) {
  return (
    <div style={{ borderTop: "1px solid var(--border)", background: isSel ? "var(--brand-bg)" : undefined }}>
      <button type="button" onClick={onClick} aria-expanded={isExp} className="w-full text-left flex items-center gap-2.5 px-3 py-2.5">
        <PlaceBadge place={s.rank} medal={medal} />
        <Avatar sup={s} size={32} />
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold leading-tight truncate" style={{ color: "var(--text-1)" }}>{nm(s.name)}</span>
          <span className="flex items-center gap-1.5 text-[11px] mt-0.5 flex-wrap" style={{ color: "var(--text-4)" }}>
            {s.sub && <span className="truncate max-w-[50%]">{s.sub}</span>}{showShift && s.shift && <ShiftChip shift={s.shift} t={t} />}<MoveChip prev={s.prevRank} now={s.rank} st={st} t={t} vsLabel={vsLabel} />
          </span>
        </span>
        <span className="text-right flex-shrink-0">
          <b className="block tabular-nums leading-none" style={{ fontSize: 16, color: bandInk(st, s.comp) }}>{fmt1(s.comp)}</b>
          <span className="text-[10px]" style={{ color: "var(--text-4)" }}>/100</span>
        </span>
        <ChevronDown size={15} className="flex-shrink-0" style={{ color: "var(--text-4)", transform: isExp ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
      </button>
      {isExp && (
        <div className="px-3 py-3" style={{ background: "var(--bg-inner)" }}>
          <BreakdownBody s={s} catMeta={catMeta} teamAvg={teamAvg} st={st} t={t} nm={nm} vsLabel={vsLabel} />
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════ rank-trajectory chart ═══════════════════════
 * A bump chart: every brigadir's place period by period, measured to its card
 * (never a fixed width that scrolls on a phone). Redrawn 2026-11-12 on the
 * operator's references. A line HOLDS its place across a period and S-curves
 * to the next, thick and neutral, cased in the card's own surface so a
 * crossing reads as over / under and never as a knot. The selected brigadir
 * is the gold line and the one under the pointer the dark one, and both carry
 * their place as a NUMBER at every period — a trajectory is read off the line
 * itself, with no trip to the axis. A line begins and ends at the brigadir's
 * photo: on the left where they enter the board (mid-chart for one who joined
 * later), on the right at the picked period's place beside the place and the
 * name. Final places are unique, so that column is the legend and can never
 * collide. A period a brigadir had no score in breaks their line rather than
 * drawing a place they never held.
 *
 * The lines are SVG; the photos and names are HTML laid over it at the same
 * pixel coordinates (the SVG is never scaled): ProfileAvatar fetches a photo
 * as a blob, and a name is a real button — focusable, pressable, cut with «…»
 * where the column is narrow. The highlighted lines are drawn AGAIN in a layer
 * of their own on top with pointer events off, so the lines underneath never
 * change order under the pointer. */
const BUMP_LINE = "color-mix(in srgb, var(--text-3) 30%, var(--bg-card))";
const BUMP_RING = [
  "0 0 0 2px var(--bg-card)",
  "0 0 0 2px var(--bg-card), 0 0 0 3.5px var(--text-2)",
  "0 0 0 2px var(--bg-card), 0 0 0 4px var(--brand)",
];
function BumpChart({ sups, labels, tips, selectedId, onSelect, onTip, nm, medal, t }) {
  const [ref, W] = useElementWidth();
  // The line under the pointer and the period the pointer is over.
  const [hover, setHover] = useState(null);
  const last = labels.length - 1;
  const n = Math.max(1, ...sups.flatMap((s) => s.rankHist.filter((r) => r != null)));
  // A phone keeps every period and gives up the furniture instead: no photo
  // where a line starts, no place beside the name (the axis on the left has it).
  const narrow = W < 520;
  const av = narrow ? 20 : 24;
  const pitch = clamp(Math.round(260 / Math.max(1, n - 1)), narrow ? 24 : 30, 44);
  const names = new Map(sups.map((s) => [s.id, shortPerson(nm(s.name))]));
  const nameW = Math.min(Math.ceil(Math.max(0, ...[...names.values()].map((v) => textWidth(v, 12, 700))) * 1.05), narrow ? 84 : 150);
  const rankW = narrow ? 0 : 18;
  const padL = narrow ? 28 : 24 + av / 2;
  const padR = av / 2 + 6 + (rankW ? rankW + 6 : 0) + nameW + 2;
  const padT = av / 2 + 6, padB = av / 2 + 28;
  const plotW = Math.max(0, W - padL - padR);
  const step = last < 1 ? plotW : plotW / last;
  const H = padT + (n - 1) * pitch + padB;
  const x = (w) => (last < 1 ? padL + plotW / 2 : padL + w * step);
  const y = (rk) => padT + (rk - 1) * pitch;
  const lw = Math.round(clamp(step * 0.07, 2.5, Math.min(6, pitch * 0.2)) * 2) / 2;
  // How far a line runs level on either side of a period before it turns.
  const flat = Math.min(step * 0.14, 20);
  // A place fits inside its node while the periods stand far enough apart.
  const nodeR = step >= 44 && pitch >= 28 ? 9.5 : step >= 22 ? 8 : 0;
  // The period axis thins to the room it has, counted back from the picked
  // period so that one is always named.
  const every = Math.max(1, Math.ceil((Math.max(0, ...labels.map((l) => textWidth(l, 10.5, 600))) + 10) / Math.max(1, step)));

  // One path per unbroken run of places.
  const series = sups.map((s) => {
    const runs = [];
    let cur = null;
    s.rankHist.forEach((rk, w) => {
      if (rk == null) { cur = null; return; }
      if (!cur) { cur = { a: w, b: w, pts: [] }; runs.push(cur); }
      cur.b = w;
      cur.pts.push([x(w), y(rk)]);
    });
    runs.forEach((run) => {
      let d = `M${px1(run.pts[0][0])},${px1(run.pts[0][1])}`;
      for (let i = 1; i < run.pts.length; i++) {
        const [x0, y0] = run.pts[i - 1], [x1, y1] = run.pts[i];
        if (y0 === y1) { d += `H${px1(x1)}`; continue; }
        const m = px1((x0 + x1) / 2);
        d += `H${px1(x0 + flat)}C${m},${px1(y0)} ${m},${px1(y1)} ${px1(x1 - flat)},${px1(y1)}H${px1(x1)}`;
      }
      run.d = d;
    });
    return { s, runs };
  });
  const lvOf = (s) => (s.id === selectedId ? 2 : hover && s.id === hover.id ? 1 : 0);
  // Fixed order, the leaders drawn last: nothing here moves under the pointer.
  const base = [...series].sort((p, q) => q.s.rank - p.s.rank);
  const lit = [series.find((e) => lvOf(e.s) === 1), series.find((e) => lvOf(e.s) === 2)].filter(Boolean);

  const point = (e, s, col) => {
    setHover((h) => (h && h.id === s.id && h.col === col ? h : { id: s.id, col }));
    onTip(e, nm(s.name), <>
      <span className="block">{tips[col]}</span>
      <span className="block"><b style={{ color: "var(--text-1)" }}>{t("leaderboard.rank")}: {s.rankHist[col]}</b> · {fmt1(s.hist[col])} /100</span>
    </>);
  };
  const leave = () => { setHover(null); onTip(null); };
  // A tip is pinned to the screen, so it must not outlive the scroll that
  // moves the line away from under it — on a phone a tap leaves it standing.
  const hovering = hover != null;
  useEffect(() => {
    if (!hovering) return undefined;
    const off = () => { setHover(null); onTip(null); };
    window.addEventListener("scroll", off, true);
    return () => window.removeEventListener("scroll", off, true);
  }, [hovering]); // eslint-disable-line react-hooks/exhaustive-deps
  const colAt = (e, run) => {
    if (last < 1) return run.a;
    const box = e.currentTarget.ownerSVGElement.getBoundingClientRect();
    return clamp(Math.round((e.clientX - box.left - padL) / step), run.a, run.b);
  };

  return (
    <div ref={ref} className="relative w-full" style={{ height: W > 0 ? H : undefined }}>
      {W > 0 && <>
        <svg width={W} height={H} style={{ display: "block" }} role="img" aria-label={t("leaderboard.rankDynamics")}>
          {Array.from({ length: n }, (_, i) => i + 1).map((rk) => (
            <text key={rk} x={14} y={y(rk) + 3.7} textAnchor="end" fontSize="10.5" fill="var(--text-3)" className="tabular-nums">{rk}</text>
          ))}
          {labels.map((lb, i) => ((last - i) % every === 0 ? (
            <text key={`${lb}-${i}`} x={x(i)} y={H - 8} textAnchor="middle" fontSize="10.5" className="tabular-nums"
              fontWeight={hover?.col === i ? 700 : 400} fill={hover?.col === i ? "var(--text-1)" : "var(--text-3)"}>{lb}</text>
          ) : null))}
          {base.map(({ s, runs }) => (
            <g key={s.id} style={{ cursor: "pointer" }} onMouseLeave={leave} onClick={() => onSelect(s.id)}>
              {runs.map((run) => (run.pts.length > 1 ? (
                <g key={run.a} onMouseMove={(e) => point(e, s, colAt(e, run))}>
                  <path d={run.d} fill="none" strokeWidth={lw + 3} strokeLinecap="round" style={{ stroke: "var(--bg-card)" }} />
                  <path d={run.d} fill="none" strokeWidth={lw} strokeLinecap="round" style={{ stroke: BUMP_LINE }} />
                  <path d={run.d} fill="none" stroke="transparent" strokeWidth={Math.max(14, lw + 8)} />
                </g>
              ) : narrow && run.a < last ? (
                <circle key={run.a} cx={run.pts[0][0]} cy={run.pts[0][1]} r={lw / 2 + 1.5} style={{ fill: BUMP_LINE }}
                  onMouseMove={(e) => point(e, s, run.a)} />
              ) : null))}
            </g>
          ))}
          <g style={{ pointerEvents: "none" }}>
            {lit.map(({ s, runs }) => {
              const sel = lvOf(s) === 2;
              const tone = sel ? "var(--brand)" : "var(--text-2)";
              const w = lw + (sel ? 1.5 : 0.5);
              return (
                <g key={s.id}>
                  {runs.map((run) => (run.pts.length > 1 ? (
                    <g key={run.a}>
                      <path d={run.d} fill="none" strokeWidth={w + 3.5} strokeLinecap="round" style={{ stroke: "var(--bg-card)" }} />
                      <path d={run.d} fill="none" strokeWidth={w} strokeLinecap="round" style={{ stroke: tone }} />
                    </g>
                  ) : null))}
                  {/* the place at every period — except where a photo already sits */}
                  {s.rankHist.map((rk, i) => {
                    if (rk == null || i === last || (!narrow && runs.some((run) => run.a === i))) return null;
                    return nodeR ? (
                      <g key={i}>
                        <circle cx={x(i)} cy={y(rk)} r={nodeR} strokeWidth="2" style={{ fill: tone, stroke: "var(--bg-card)" }} />
                        <text x={x(i)} y={y(rk) + (nodeR > 9 ? 3.7 : 3.2)} textAnchor="middle" fontSize={nodeR > 9 ? 10.5 : 9} fontWeight="700"
                          className="tabular-nums" fill={sel ? "var(--on-brand)" : "var(--bg-card)"}>{rk}</text>
                      </g>
                    ) : (
                      <circle key={i} cx={x(i)} cy={y(rk)} r={lw / 2 + 2.5} strokeWidth="1.5" style={{ fill: tone, stroke: "var(--bg-card)" }} />
                    );
                  })}
                </g>
              );
            })}
          </g>
        </svg>

        {/* where each line starts: the brigadir's photo */}
        {!narrow && series.flatMap(({ s, runs }) => runs.filter((run) => run.a < last).map((run) => {
          const size = run.a === 0 ? av : av - 4;
          const lv = lvOf(s);
          return (
            <div key={`${s.id}-${run.a}`} className="absolute" aria-hidden="true"
              style={{ left: run.pts[0][0] - size / 2, top: run.pts[0][1] - size / 2, zIndex: 1 + lv, cursor: "pointer" }}
              onMouseMove={(e) => point(e, s, run.a)} onMouseLeave={leave} onClick={() => onSelect(s.id)}>
              <Avatar sup={s} size={size} style={{ boxShadow: BUMP_RING[lv] }} />
            </div>
          );
        }))}

        {/* where it ends: photo · place · name — the chart's legend */}
        {sups.map((s) => {
          const lv = lvOf(s);
          const tone = medal[s.rank];
          return (
            <button key={s.id} type="button" className="absolute flex items-center text-left rounded-full"
              style={{ left: x(last) - av / 2, top: y(s.rank) - pitch / 2, width: W - x(last) + av / 2, height: pitch, gap: 6, zIndex: 1 + lv, cursor: "pointer" }}
              aria-pressed={lv === 2} aria-label={`${nm(s.name)} — ${t("leaderboard.rank")}: ${s.rank}`}
              onMouseMove={(e) => point(e, s, last)} onMouseLeave={leave}
              onFocus={() => setHover({ id: s.id, col: last })} onBlur={() => setHover(null)}
              onClick={() => onSelect(s.id)}>
              <Avatar sup={s} size={av} style={{ boxShadow: BUMP_RING[lv] }} />
              {rankW > 0 && (
                <span className="inline-flex items-center justify-center rounded-md tabular-nums flex-shrink-0"
                  style={{ width: rankW, height: rankW, fontSize: 10.5, fontWeight: 800, ...(tone ? { background: hexA(tone, 0.18), color: tone } : { color: "var(--text-3)" }) }}>{s.rank}</span>
              )}
              <span className="truncate min-w-0" style={{ fontSize: 12, fontWeight: lv === 2 ? 700 : 500, color: lv === 2 ? "var(--brand-text)" : lv === 1 ? "var(--text-1)" : "var(--text-2)" }}>{names.get(s.id)}</span>
            </button>
          );
        })}
      </>}
    </div>
  );
}

/* ═══════════════════════ page ════════════════════════════════════════ */
/* Skeletons of the page's final shape while the board loads — the podium's
 * three cards, the KPI strip and a few register rows. */
function BoardSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 items-end">
        <SkeletonBlock className="rounded-2xl" style={{ aspectRatio: "0.73", maxWidth: 300 }} />
        <SkeletonBlock className="rounded-2xl col-span-2 md:col-span-1 md:order-none" style={{ aspectRatio: "0.73", maxWidth: 344 }} />
        <SkeletonBlock className="rounded-2xl hidden md:block" style={{ aspectRatio: "0.73", maxWidth: 300 }} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => <SkeletonBlock key={i} className="h-[104px] rounded-2xl" />)}
      </div>
      <SkeletonBlock className="h-[320px] rounded-2xl" />
    </div>
  );
}

export default function Leaderboard() {
  const { t } = useLang();
  const { tl, tx, lang } = useTranslit();
  const { theme } = useTheme();
  const { factories, factory } = useFactory();
  const st = STATUS[theme] || STATUS.dark;
  const hues = CAT_HUES[theme] || CAT_HUES.dark;
  const medal = MEDAL[theme] || MEDAL.dark;
  const toast = useToast();
  const nm = (s) => tl(s);

  const catMeta = useMemo(() => Object.fromEntries(CATS.map((c) => [c.key, {
    hue: hues[c.key], name: t(`leaderboard.cat.${c.key}`), short: t(`leaderboard.cat.${c.key}Short`),
    // The podium's stat grid is tight — ~7 capitals a column at six of them.
    tiny: t(`leaderboard.cat.${c.key}${c.tiny ? "Tiny" : "Short"}`),
    icon: c.icon, weight: c.weight, live: c.live !== false,
  }])), [hues, t]);

  // The period: one week, month or year (the operator's call — never a
  // date-to-date range). The anchor is any day of it; the server snaps it.
  const today = isoOf(new Date());
  const [grainRaw, setGrain] = usePersistentState("leaderboard_grain", "week");
  const [anchorRaw, setAnchor] = usePersistentState("leaderboard_anchor", null);
  const [shiftF, setShiftF] = usePersistentState("leaderboard_shift", null); // null = all | 1 | 2
  const grain = GRAINS.includes(grainRaw) ? grainRaw : "week";
  const anchor = anchorRaw && anchorRaw <= today ? anchorRaw : today;

  // ONE request per period — its grain and first day (`periodStart`). The
  // server sends the whole board this viewer may see; plant and shift are
  // filters of the PAGE (below), so picking one costs no request at all.
  const params = useMemo(() => ({ grain, anchor: periodStart(grain, anchor) }), [grain, anchor]);
  const pollSince = useRef(null);
  const query = useQuery({
    queryKey: ["leaderboard", params],
    queryFn: () => api.get("/api/leaderboard", { params }).then((r) => r.data),
    staleTime: 60_000,
    // Another period picked: the board on screen stays (dimmed) until the
    // new one is in, instead of the page falling back to its skeleton.
    placeholderData: keepPreviousData,
    // The server answers at once from the board it keeps and says
    // `refreshing` while a newer one is being calculated behind the answer
    // (routers/leaderboard.py `_KEPT`): ask again until it is in — every 3 s
    // for the first minute, then every 20 s, as «Hisobotlar» asks for its
    // months.
    refetchInterval: (q) => {
      if (!q.state.data?.refreshing) { pollSince.current = null; return false; }
      pollSince.current ??= Date.now();
      return Date.now() - pollSince.current < 60_000 ? 3_000 : 20_000;
    },
  });
  // The page's own cut of the answer: the plant and the shift.
  const pay = useMemo(() => {
    const d = query.data;
    if (!d || (factory == null && shiftF == null)) return d;
    return {
      ...d,
      units: (d.units || []).filter((u) => (factory == null || u.factory_id === factory)
        && (shiftF == null || u.shift === shiftF)),
    };
  }, [query.data, factory, shiftF]);
  const board = useMemo(() => buildBoard(pay), [pay]);
  const L = board.periods.length - 1;
  const cur = board.periods[L];
  // What is ON SCREEN, which for a moment is not what was picked: while the
  // next period loads, the board (and so every label on it) is still the one
  // before — a week's, perhaps, under a toggle already saying «Month».
  const shownGrain = GRAINS.includes(query.data?.grain) ? query.data.grain : grain;
  const pending = query.isPlaceholderData;
  const busy = pending || !!query.data?.refreshing;
  const asOf = builtLabel(query.data?.built_at, today);

  // The plant is named on a row only while the board mixes plants.
  const multiPlant = new Set((pay?.units || []).map((u) => u.factory_id ?? 0)).size > 1;
  const { sups, byRank } = useMemo(() => {
    const sub = (s) => (multiPlant && s.factory ? tx(factoryName(s.factory, lang)) : null);
    const list = board.sups.map((s) => ({ ...s, sub: sub(s) }));
    return { sups: list, byRank: [...list].sort((a, b) => a.rank - b.rank) };
  }, [board.sups, multiPlant, tx, lang]);

  const [selectedId, setSelectedId] = usePersistentState("leaderboard_sel_unit", null);
  const [expandedId, setExpandedId] = usePersistentState("leaderboard_open_unit", null);
  const [sortRaw, setSortKey] = usePersistentState("leaderboard_sort", "overall");
  const [search, setSearch] = usePersistentState("leaderboard_search", "");
  const [tip, setTip] = useState(null);
  const [exporting, setExporting] = useState(false);
  const sortKey = sortRaw === "overall" || LIVE.some((c) => c.key === sortRaw) ? sortRaw : "overall";

  // Selection survives filtering: if the selected brigadir left the pool,
  // spotlight the current leader instead (the chart always needs a selection).
  const effSelectedId = sups.some((s) => s.id === selectedId) ? selectedId : byRank[0]?.id;
  const selectedSup = sups.find((s) => s.id === effSelectedId);

  function onTip(e, title, sub) {
    if (!e) { setTip(null); return; }
    setTip({ x: e.clientX, y: e.clientY, title, sub });
  }
  function selectSup(id, fromTable) {
    setSelectedId(id);
    setExpandedId((c) => (fromTable && c === id ? null : id));
  }

  const vsLabel = t(`leaderboard.vsPrev.${shownGrain}`);

  // Team reference points — every number on the page is read against these.
  const teamAvg = useMemo(() => Object.fromEntries(CATS.map((c) => {
    const vals = sups.map((s) => s.s[c.key]).filter((v) => v != null);
    return [c.key, vals.length ? vals.reduce((a, v) => a + v, 0) / vals.length : null];
  })), [sups]);

  const kpi = useMemo(() => {
    const n = sups.length;
    if (!n) return null;
    const avg = sups.reduce((a, s) => a + s.comp, 0) / n;
    // Against the period before, over the brigadirs who were on the board in
    // both — a unit new this period moves no average it was never in.
    const both = sups.filter((s) => L > 0 && s.hist[L - 1] != null);
    const dAvg = both.length
      ? both.reduce((a, s) => a + s.comp, 0) / both.length - both.reduce((a, s) => a + s.hist[L - 1], 0) / both.length
      : null;
    const green = sups.filter((s) => s.comp >= 80).length;
    const red = sups.filter((s) => s.comp < 65).length;
    const best = sups.filter((s) => s.prevRank != null)
      .map((s) => ({ s, mv: s.prevRank - s.rank })).sort((a, b) => b.mv - a.mv)[0];
    return { n, avg, dAvg, green, red, climber: best && best.mv > 0 ? best : null };
  }, [sups, L]);

  const rows = useMemo(() => {
    let r = [...sups];
    r.sort(sortKey === "overall" ? (a, b) => a.rank - b.rank : (a, b) => (b.s[sortKey] ?? -1) - (a.s[sortKey] ?? -1) || a.rank - b.rank);
    const q = search.trim().toLowerCase();
    if (q) r = r.filter((s) => `${s.name} ${tl(s.name)} ${s.sub || ""}`.toLowerCase().includes(q));
    return r;
  }, [sups, sortKey, search, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const factorySection = useFactorySection();
  const shiftSection = {
    key: "shift", icon: Layers, label: t("filter.shift"),
    active: shiftF != null,
    display: shiftF != null ? `${t("filter.shift")} ${shiftF}` : "",
    onClear: () => setShiftF(null),
    render: () => (
      <SegmentedToggle fill value={shiftF} onChange={setShiftF} options={[[null, t("filter.all")], [1, "S1"], [2, "S2"]]} />
    ),
  };
  const plantName = factory != null ? tx(factoryName(factories.find((f) => f.id === factory), lang)) : t("leaderboard.allPlants");
  const scopeText = `${plantName} · ${shiftF ? `${t("filter.shift")} ${shiftF}` : t("leaderboard.allShifts")}`;

  const showShift = shiftF == null;
  const sortOptions = [["overall", t("leaderboard.overallShort")], ...LIVE.map((c) => [c.key, catMeta[c.key].short])];
  const muted = { color: "var(--text-4)" };
  const dAvgIcon = kpi && kpi.dAvg != null && (kpi.dAvg > 0.05 ? <ArrowUp size={11} /> : kpi.dAvg < -0.05 ? <ArrowDown size={11} /> : <Minus size={11} />);
  const chartLabels = board.periods.map((p) => periodLabel(p, shownGrain, t, true));
  const chartTips = board.periods.map((p) => periodLabel(p, shownGrain, t));
  const prevAnchor = cur ? isoAdd(cur.from, -1) : null;

  const rowProps = (s) => ({
    s, isSel: s.id === effSelectedId, isExp: s.id === expandedId, onClick: () => selectSup(s.id, true),
    catMeta, teamAvg, st, medal, t, nm, showShift, vsLabel,
  });

  async function onExport() {
    if (!cur || !byRank.length) return;
    setExporting(true);
    try {
      const how = await exportXlsx("/api/leaderboard/export.xlsx", {
        fallbackName: "brigadirlar-reytingi.xlsx",
        body: {
          title: t("leaderboard.subtitle"),
          period: periodLabel(cur, shownGrain, t),
          scope: scopeText,
          filename: `brigadirlar-reytingi-${cur.from}`,
          caption: `📊 ${t("leaderboard.subtitle")} — ${periodLabel(cur, shownGrain, t)}`,
          columns: LIVE.map((c) => ({ key: c.key, label: catMeta[c.key].name })),
          weights: LIVE.map((c) => `${catMeta[c.key].short} ${Math.round(shareOf(c) * 100)}%`).join(" · "),
          labels: {
            sheet: t("leaderboard.overallShort"), place: t("leaderboard.rank"), brigadir: t("leaderboard.brigadir"),
            shift: t("filter.shift"), factory: t("leaderboard.plant"), score: t("leaderboard.score"),
            periodLabel: t("leaderboard.periodLabel"), scopeLabel: t("leaderboard.scopeLabel"),
            generated: t("leaderboard.generated"), weightsLabel: t("leaderboard.weightsLabel"),
            note: t("leaderboard.exportNote"),
          },
          rows: byRank.map((s) => ({
            place: s.rank, name: tl(s.name), shift: s.shift, factory: s.factory ? tx(factoryName(s.factory, lang)) : null,
            score: Math.round(s.comp * 10) / 10,
            values: Object.fromEntries(LIVE.map((c) => [c.key, s.s[c.key]])),
          })),
        },
      });
      toast.success(t(how === "download" ? "leaderboard.exportDone" : "leaderboard.exportSent"));
    } catch {
      toast.error(t("leaderboard.exportFailed"));
    } finally {
      setExporting(false);
    }
  }

  const loading = query.isLoading;
  const failed = query.isError && !query.data;

  return (
    <Layout title={t("leaderboard.subtitle")}>
      <div className="flex flex-col gap-4 max-w-[1200px] mx-auto">

        {/* ── page toolbar: the grain and its stepper inline, plant + shift in
            the FilterPanel (chips when narrowed), the export on the right ── */}
        <div className="flex items-center gap-2 flex-wrap">
          <SegmentedToggle value={grain} onChange={setGrain} ariaLabel={t("leaderboard.periodLabel")}
            options={GRAINS.map((g) => [g, t(`leaderboard.period.${g}`)])} />
          {/* the export: beside the grain on a phone, at the row's end above */}
          <div className="flex items-center ml-auto sm:order-last">
            <Button size="lg" variant="secondary" icon={<Download size={14} />} loading={exporting}
              disabled={!byRank.length || loading || pending} onClick={onExport} aria-label={t("leaderboard.export")}>
              <span className="max-sm:hidden">{t("leaderboard.export")}</span>
            </Button>
          </div>
          <DayStepper value={anchor} onChange={setAnchor} max={today}
            week={grain === "week"} month={grain === "month"} year={grain === "year"} />
          <FilterPanel sections={[factorySection, shiftSection].filter(Boolean)} />
        </div>

        {/* what the period on screen is, and when its figures were calculated
            (the board is served from a kept answer and recalculated behind it).
            The stamp is there whenever a board is, and its spinner keeps its
            place while idle — nothing here appears or leaves on a refresh, so
            the board never moves. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs -mt-2 min-h-[16px]" style={{ color: "var(--text-3)" }}>
          <span className="min-w-0">
            {cur && <>
              <span className="font-semibold" style={{ color: "var(--text-2)" }}>{periodLabel(cur, shownGrain, t)}</span>
              {cur.partial && <span> · {t("leaderboard.partialNote")}</span>}
              {board.missing > 0 && <span> · {t("leaderboard.missingNote").replace("{n}", board.missing)}</span>}
            </>}
          </span>
          {asOf && (
            <span className="ml-auto inline-flex items-center gap-1 whitespace-nowrap tabular-nums"
              role="status" aria-live="polite" title={t("leaderboard.asOfHint")}>
              <Loader2 size={11} className={busy ? "animate-spin" : ""} style={{ visibility: busy ? "visible" : "hidden" }} aria-hidden="true" />
              {busy && <span className="sr-only">{t("leaderboard.updating")}</span>}
              {t("leaderboard.asOf").replace("{t}", asOf)}
            </span>
          )}
        </div>

        {loading ? <BoardSkeleton /> : failed ? (
          <div className="rounded-2xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <EmptyState tone="danger" icon={TriangleAlert} showUploadLink={false} title={t("leaderboard.loadError")}
              message={t("leaderboard.loadErrorBody")} height="h-56"
              action={<Button variant="secondary" onClick={() => query.refetch()}>{t("common.retry")}</Button>} />
          </div>
        ) : !sups.length ? (
          <div className="rounded-2xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <EmptyState icon={CalendarX2} showUploadLink={false} title={t("leaderboard.emptyTitle")}
              message={t("leaderboard.emptyBody")} height="h-56"
              action={prevAnchor && <Button variant="secondary" onClick={() => setAnchor(prevAnchor)}>{t(`leaderboard.prev.${grain}`)}</Button>} />
          </div>
        ) : <div className="flex flex-col gap-4 transition-opacity duration-200 motion-reduce:transition-none"
            aria-busy={pending || undefined} style={{ opacity: pending ? 0.5 : 1 }}>

          {/* ── podium: the three big cards ── */}
          <Podium byRank={byRank} selectedId={effSelectedId} onSelect={selectSup} catMeta={catMeta} st={st} t={t} nm={nm} />

          {/* ── the five-second answer: is the team OK, and who is moving ── */}
          {kpi && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KPICard label={t("leaderboard.teamAvg")} icon={Gauge} color={bandInk(st, kpi.avg)}
                value={<>{fmt1(kpi.avg)}<span className="text-sm font-normal" style={muted}> /100</span></>}
                sub={<span className="inline-flex items-center gap-1 flex-wrap">
                  <span>{kpi.n} {t("leaderboard.brigadirsUnit")}{kpi.dAvg != null && " ·"}</span>
                  {kpi.dAvg != null && <>
                    <span className="inline-flex items-center gap-0.5 font-semibold tabular-nums" style={{ color: deltaInk(st, Math.abs(kpi.dAvg) < 0.05 ? 0 : kpi.dAvg) }}>{dAvgIcon}{fmt1(Math.abs(kpi.dAvg))}</span>
                    <span>{vsLabel}</span>
                  </>}
                </span>} />
              <KPICard label={t("leaderboard.kpi.green")} icon={CircleCheck} color={st.okInk}
                value={<>{kpi.green}<span className="text-sm font-normal" style={muted}> / {kpi.n}</span></>}
                sub={t("leaderboard.bandGood")} />
              <KPICard label={t("leaderboard.kpi.attention")} icon={TriangleAlert} color={kpi.red ? st.badInk : st.none}
                value={<>{kpi.red}<span className="text-sm font-normal" style={muted}> / {kpi.n}</span></>}
                sub={t("leaderboard.bandBad")} />
              <KPICard label={t("leaderboard.kpi.climber")} icon={TrendingUp} color={kpi.climber ? st.okInk : st.none}
                value={kpi.climber ? <>+{kpi.climber.mv}<span className="text-sm font-normal" style={muted}> {t("leaderboard.rank").toLowerCase()}</span></> : "—"}
                sub={kpi.climber ? `${nm(kpi.climber.s.name)} · ${kpi.climber.s.prevRank} → ${kpi.climber.s.rank}` : t(L > 0 ? "leaderboard.kpi.nobodyUp" : "leaderboard.kpi.noPrev")} />
            </div>
          )}

          {/* ── the register: every brigadir ── */}
          <TableCard
            icon={ListOrdered}
            title={t("leaderboard.overallRanking")}
            subtitle={t("leaderboard.rowHint")}
            right={<span className="text-xs tabular-nums" style={muted}>{rows.length} {t("leaderboard.brigadirsUnit")}</span>}
            toolbar={<>
              <SearchInput value={search} onChange={setSearch} placeholder={t("leaderboard.searchPlaceholder")} className="w-full sm:w-56" />
              <SegmentedToggle value={sortKey} onChange={setSortKey} options={sortOptions} className="sm:ml-auto" ariaLabel={t("leaderboard.score")} />
            </>}
            maxHeight="none"
            mobile={rows.length
              ? <div>{rows.map((s) => <MobileRow key={s.id} {...rowProps(s)} />)}</div>
              : <div className="px-3 py-8 text-center text-xs" style={{ color: "var(--text-3)", borderTop: "1px solid var(--border)" }}>{t("common.noMatch")}</div>}
          >
            <thead>
              <tr>
                <Th label={t("leaderboard.rank")} cls="w-[84px]" />
                <Th label={t("leaderboard.brigadir")} />
                <Th label={t("leaderboard.score")} k="overall" sort={{ key: sortKey, dir: "desc" }} onSort={setSortKey} cls="w-[136px]" />
                {CATS.map((c) => {
                  const live = c.live !== false;
                  return (
                    <Th key={c.key} {...(live ? { k: c.key, sort: { key: sortKey, dir: "desc" }, onSort: setSortKey } : {})} align="right" cls="hidden md:table-cell w-[112px]"
                      hint={live ? catMeta[c.key].name : `${catMeta[c.key].name} — ${t("leaderboard.notYet")}`}
                      label={<span className="inline-flex items-center gap-1.5" style={live ? undefined : { opacity: 0.6 }}><span className="inline-block rounded-full" style={{ width: 7, height: 7, background: catMeta[c.key].hue }} />{catMeta[c.key].short}</span>} />
                  );
                })}
                <Th label={t("leaderboard.trend")} align="center" cls="hidden lg:table-cell w-[116px]" hint={t(`leaderboard.trendHint.${shownGrain}`)} />
                <Th label="" cls="w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.length
                ? rows.map((s) => <TableRow key={s.id} {...rowProps(s)} sortKey={sortKey} />)
                : <tr><td colSpan={5 + CATS.length} className="px-3 py-8 text-center" style={{ color: "var(--text-3)" }}>{t("common.noMatch")}</td></tr>}
            </tbody>
          </TableCard>

          {/* ── how the places moved ── */}
          {board.periods.length > 1 && (
            <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <SectionHead icon={TrendingUp} title={t(`leaderboard.rankDyn.${shownGrain}`)} subtitle={t("leaderboard.chartHint")}
                right={selectedSup && (
                  <span className="inline-flex items-center gap-1.5 text-xs">
                    <Avatar sup={selectedSup} size={20} />
                    <span className="font-semibold" style={{ color: "var(--brand-text)" }}>{nm(selectedSup.name)}</span>
                    <span style={muted}>· {t("leaderboard.selected")}</span>
                  </span>
                )} />
              <div className="px-3 pb-3 pt-2">
                <BumpChart sups={sups} labels={chartLabels} tips={chartTips} selectedId={effSelectedId} onSelect={selectSup} onTip={onTip} nm={nm} medal={medal} t={t} />
              </div>
            </div>
          )}
        </div>}

        {/* ── methodology ── */}
        <details className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer select-none" style={{ listStyle: "none" }}>
            <span className="inline-flex items-center justify-center rounded-lg flex-shrink-0" style={{ width: 26, height: 26, background: "var(--brand-bg)", color: "var(--brand-text)" }}><Info size={14} /></span>
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>{t("leaderboard.methodTitle")}</span>
            <ChevronDown size={15} className="ml-auto" style={muted} />
          </summary>
          <div className="px-4 pb-4 text-[13px] max-w-[760px] flex flex-col gap-2" style={{ color: "var(--text-2)" }}>
            <p>{t("leaderboard.methodBody")}</p>
            <ul className="flex flex-col gap-1.5">
              {CATS.map((c) => (
                <li key={c.key} className="flex items-start gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-2.5 py-1 flex-shrink-0 tabular-nums"
                    style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", opacity: c.live === false ? 0.6 : 1 }}>
                    <span className="rounded-full" style={{ width: 8, height: 8, background: catMeta[c.key].hue }} />
                    {catMeta[c.key].short} <b>{c.live === false ? "—" : `${Math.round(shareOf(c) * 100)}%`}</b>
                  </span>
                  <span className="pt-0.5">{t(`leaderboard.src.${c.key}`)}</span>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2 mt-1">
              {[["ok", "bandGood"], ["warn", "bandMid"], ["bad", "bandBad"]].map(([b, key]) => (
                <span key={b} className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-3 py-1.5" style={{ background: hexA(st[b], 0.12), color: st[`${b}Ink`] }}>
                  <span className="rounded-full" style={{ width: 8, height: 8, background: st[b] }} />{t(`leaderboard.${key}`)}
                </span>
              ))}
            </div>
          </div>
        </details>
      </div>

      <FloatTip tip={tip} />
      {toast.node}
    </Layout>
  );
}
