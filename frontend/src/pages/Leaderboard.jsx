import { useMemo, useState } from "react";
import {
  Trophy, Gauge, ClipboardCheck, Lightbulb, ShieldCheck, UserCheck,
  ListOrdered, TrendingUp, ArrowUp, ArrowDown, Minus, Info, ChevronDown,
  Download, Layers, CircleCheck, TriangleAlert,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import TableCard, { Th, SectionHead } from "../components/ui/DataTable";
import KPICard from "../components/ui/KPICard";
import SearchInput from "../components/ui/SearchInput";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import DateRangePicker from "../components/ui/DateRangePicker";
import { FilterPanel } from "../components/ui/ColumnFilter";
import Button from "../components/ui/Button";
import { useToast } from "../components/ui/Toast";
import { useLang } from "../context/LangContext";
import { useTheme } from "../context/ThemeContext";
import { usePersistentState } from "../hooks/usePersistentState";
import useElementWidth from "../hooks/useElementWidth";
import { useTranslit } from "../utils/transliterate";
import { shortPerson } from "../utils/personName";

/* ══════════════════════════════════════════════════════════════════════
 * Leaderboard — brigadir ranking across the five platform statistics.
 *
 * Read top to bottom it answers four questions, in order: is the team OK
 * (the KPI strip), who leads (the podium), where does everybody stand (the
 * register, a row opening into its breakdown against the team average), and
 * how did the places move (the trajectory chart). One card family, one
 * traffic-light grammar, the Leaders page's own podium idiom — nothing on this
 * surface is drawn in a style the rest of the platform does not use.
 *
 * ⚠ DUMMY DATA. Everything below the `── dummy data ──` banner is a
 * deterministic mock so the page is fully interactive in prod without a
 * backend. When real endpoints land, replace `useLeaderboardData()` with a
 * useQuery call that returns the same shape ({ sups, byRank }); the render
 * layer needs no changes.
 * ════════════════════════════════════════════════════════════════════ */

/* ── categories (the five ranked statistics) ─────────────────────────── */
const CATS = [
  { key: "zag", icon: Gauge,          weight: 0.30 },
  { key: "naz", icon: ClipboardCheck, weight: 0.15 },
  { key: "kai", icon: Lightbulb,      weight: 0.15 },
  { key: "xav", icon: ShieldCheck,    weight: 0.15 },
  { key: "kir", icon: UserCheck,      weight: 0.25 },
];

/* Category identity hues — one per statistic in the shared generic-first
 * order (red, green, blue, yellow, orange), darker in the light theme for
 * contrast. Identity only: they tint the icon chip and the header dot, never
 * a value — a value is always traffic-light. */
const CAT_HUES = {
  dark:  { zag: "#ef4444", naz: "#22c55e", kai: "#3b82f6", xav: "#eab308", kir: "#f97316" },
  light: { zag: "#dc2626", naz: "#16a34a", kai: "#2563eb", xav: "#ca8a04", kir: "#ea580c" },
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

const WEEKS = ["04.05", "11.05", "18.05", "25.05", "01.06", "08.06", "15.06", "22.06"];
const LAST = WEEKS.length - 1;

/* ────────────────────────── dummy data ──────────────────────────────── */
const RAW = [
  { name: "Malika Qodirova",   unit: "2-uchastka",  image: "/images/supervisors/malika.png",   s: { zag: 92, naz: 88, kai: 90, xav: 84, kir: 96 } },
  { name: "Dilshod Karimov",   unit: "5-uchastka",  image: "/images/supervisors/dilshod.png",  s: { zag: 90, naz: 92, kai: 78, xav: 88, kir: 91 } },
  { name: "Aziza Tosheva",     unit: "1-uchastka",  image: "/images/supervisors/aziza.png",    s: { zag: 87, naz: 74, kai: 92, xav: 90, kir: 88 } },
  { name: "Murodali Ochilov",  unit: "7-uchastka",  image: "/images/supervisors/murodali.png", s: { zag: 84, naz: 81, kai: 70, xav: 76, kir: 90 } },
  { name: "Sherzod Aliyev",    unit: "3-uchastka",  image: "/images/supervisors/sherzod.png",  s: { zag: 86, naz: 70, kai: 75, xav: 72, kir: 84 } },
  { name: "Nodira Yusupova",   unit: "4-uchastka",  image: "/images/supervisors/nodira.png",   s: { zag: 78, naz: 85, kai: 80, xav: 74, kir: 81 } },
  { name: "Jasur Rahimov",     unit: "9-uchastka",  image: "/images/supervisors/jasur.png",    s: { zag: 83, naz: 62, kai: 68, xav: 80, kir: 77 } },
  { name: "Gulnora Ismoilova", unit: "8-uchastka",  image: "/images/supervisors/gulnora.png",  s: { zag: 71, naz: 78, kai: 74, xav: 70, kir: 79 } },
  { name: "Bekzod Tursunov",   unit: "6-uchastka",  image: "/images/supervisors/bekzod.png",   s: { zag: 74, naz: 66, kai: null, xav: 72, kir: 76 } },
  { name: "Kamola Ergasheva",  unit: "11-uchastka", image: "/images/supervisors/kamola.png",   s: { zag: 69, naz: 72, kai: 60, xav: 66, kir: 74 } },
  { name: "Rustam Nazarov",    unit: "10-uchastka", image: "/images/supervisors/rustam.png",   s: { zag: 66, naz: 58, kai: 55, xav: 62, kir: 70 } },
  { name: "Sardor Xolmatov",   unit: "12-uchastka", image: "/images/supervisors/sardor.png",   s: { zag: 58, naz: 52, kai: 48, xav: 60, kir: 63 } },
];

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function composite(s) {
  let num = 0, den = 0;
  CATS.forEach((c) => { if (s[c.key] != null) { num += s[c.key] * c.weight; den += c.weight; } });
  return den ? num / den : 0;
}

/* Dummy shift assignment — odd unit numbers = S1, even = S2 (6 sups each). */
const unitShift = (unit) => (parseInt(unit, 10) % 2 === 1 ? 1 : 2);

/* Seed derived from the selected date range so a different period reshuffles
 * scores and ranks — the mock feels live until real endpoints land. */
function seedOf(from, to) {
  const s = `${from}|${to}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 100000;
}

/* Build the whole dataset for a seed. */
function buildData(seed) {
  const sups = RAW.map((r, i) => {
    const rnd = mulberry32(seed * 1000 + i * 77);
    const s = {};
    CATS.forEach((c) => {
      const base = r.s[c.key];
      s[c.key] = base == null ? null : clamp(Math.round(base + (rnd() - 0.5) * 8), 20, 99);
    });
    const comp = composite(s);
    const trend = (rnd() - 0.45) * 2.2;
    const hist = [];
    for (let w = 0; w <= LAST; w++) hist.push(w === LAST ? comp : comp - trend * (LAST - w) + (rnd() - 0.5) * 6);
    const sparks = {};
    CATS.forEach((c) => {
      const v = s[c.key];
      if (v == null) { sparks[c.key] = null; return; }
      const arr = [];
      for (let w = 0; w <= LAST; w++) arr.push(w === LAST ? v : clamp(Math.round(v - trend * (LAST - w) * 0.8 + (rnd() - 0.5) * 9), 8, 99));
      sparks[c.key] = arr;
    });
    return { id: i, name: r.name, unit: r.unit, shift: unitShift(r.unit), image: r.image, s, comp, hist, sparks };
  });
  return rankPool(sups);
}

/* Dense places 1..n inside a pool, for every week — re-run after a filter so a
 * shift's own board is ranked among itself. */
function rankPool(pool) {
  const rankHist = new Map(pool.map((s) => [s.id, []]));
  for (let w = 0; w <= LAST; w++) {
    pool.map((s) => ({ id: s.id, v: s.hist[w] }))
      .sort((a, b) => b.v - a.v)
      .forEach((o, pos) => { rankHist.get(o.id)[w] = pos + 1; });
  }
  const sups = pool.map((s) => {
    const rh = rankHist.get(s.id);
    return { ...s, rankHist: rh, rank: rh[LAST], prevRank: rh[LAST - 1] };
  });
  const byRank = [...sups].sort((a, b) => a.rank - b.rank);
  return { sups, byRank };
}

/* ────────────────────────── helpers ─────────────────────────────────── */
const fmt = (v) => (v == null ? "—" : String(Math.round(v)));
const fmt1 = (v) => v.toFixed(1).replace(".", ",");
function initials(name) { return name.trim().split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase(); }
function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }
function bandOf(v) { return v == null ? "none" : v >= 80 ? "ok" : v >= 65 ? "warn" : "bad"; }
function bandFill(st, v) { const b = bandOf(v); return b === "ok" ? st.ok : b === "warn" ? st.warn : b === "bad" ? st.bad : st.none; }
function bandInk(st, v) { const b = bandOf(v); return b === "ok" ? st.okInk : b === "warn" ? st.warnInk : b === "bad" ? st.badInk : st.none; }
/* Sign-aware delta ink: up is good here (a score, a place gained). */
function deltaInk(st, d) { return d == null || d === 0 ? st.none : d > 0 ? st.okInk : st.badInk; }
function deltaFill(st, d) { return d == null || d === 0 ? st.none : d > 0 ? st.ok : st.bad; }

/* ────────────────────────── atoms ───────────────────────────────────── */
function Avatar({ sup, size }) {
  // Anchored high in the frame: a portrait cropped to a circle must land on
  // the face, not the chest. Neutral chrome — identity is the name beside it.
  return (
    <span className="inline-flex items-center justify-center rounded-full font-bold flex-shrink-0 overflow-hidden"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36), background: "var(--bg-accent)", color: "var(--text-3)", border: "1px solid var(--border-md)" }}>
      {sup.image
        ? <img src={sup.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 14%" }} />
        : initials(sup.name)}
    </span>
  );
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

/* Places won or lost against last week. A place is better the SMALLER it is,
 * so 7 → 4 is +3 and green — movement up the board, not arithmetic. */
function MoveChip({ prev, now, st, t }) {
  const mv = prev - now;
  const Icon = mv > 0 ? ArrowUp : mv < 0 ? ArrowDown : Minus;
  return (
    <span className="inline-flex items-center gap-0.5 rounded-lg px-1.5 py-0.5 text-[11px] font-semibold tabular-nums whitespace-nowrap leading-none"
      title={`${t("leaderboard.rank")} · ${t("leaderboard.vsPrevWeek")}: ${prev} → ${now}`}
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
function Spark({ vals, tone }) {
  if (!vals || vals.length < 2) return null;
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
const sparkTone = (st, vals) => (!vals ? st.none : deltaFill(st, Math.abs(vals[vals.length - 1] - vals[0]) < 0.5 ? 0 : vals[vals.length - 1] - vals[0]));

/* Floating hover tip for the SVG chart — the one surface here that Apex does
 * not draw, so it carries the same tokens the Apex tooltips use. */
function FloatTip({ tip }) {
  if (!tip) return null;
  return (
    <div className="fixed z-50 pointer-events-none rounded-lg px-2.5 py-2"
      style={{ left: Math.min(tip.x + 14, window.innerWidth - 250), top: Math.max(8, tip.y - 56), background: "var(--bg-accent)", border: "1px solid var(--border-md)", boxShadow: "0 6px 20px rgba(0,0,0,0.25)", maxWidth: 240 }}>
      <div className="text-xs font-bold" style={{ color: "var(--text-1)" }}>{tip.title}</div>
      <div className="text-[11px] tabular-nums" style={{ color: "var(--text-3)" }}>{tip.sub}</div>
    </div>
  );
}

/* ═══════════════════════ podium card ═════════════════════════════════
 * The Leaders page's StandCard, one level up: bg-inner card, medal rim
 * (heavier on first place), ghost place numeral, photo + name + medallion,
 * the overall score against /100, the week's movement, and the five
 * statistics as labelled micro-gauges — never three-letter codes. */
function CardStat({ label, full, value, st }) {
  return (
    <span className="block min-w-0" title={`${full}: ${value == null ? "—" : `${fmt(value)}%`}`}>
      <span className="block text-[10px] uppercase truncate" style={{ color: "var(--text-4)" }}>{label}</span>
      <span className="block text-[14px] font-bold tabular-nums leading-tight mt-0.5" style={{ color: bandInk(st, value) }}>{fmt(value)}</span>
      <Meter pct={value} color={bandFill(st, value)} />
    </span>
  );
}

function PodiumCard({ s, place, selected, onSelect, catMeta, st, tone, t, nm, showShift }) {
  const rim = place === 1 ? 0.6 : 0.38;
  return (
    <button type="button" onClick={onSelect} aria-pressed={selected}
      className="relative text-left rounded-2xl overflow-hidden p-3 transition-shadow"
      style={{ background: "var(--bg-inner)", border: `1px solid ${hexA(tone, rim)}`, boxShadow: selected ? "0 0 0 2px var(--brand-ring)" : "none" }}>
      <span aria-hidden className="absolute select-none tabular-nums font-black leading-none pointer-events-none"
        style={{ right: 6, bottom: -18, fontSize: 76, color: hexA(tone, 0.14) }}>{place}</span>

      <span className="relative flex items-center gap-2.5">
        <Avatar sup={s} size={36} />
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold leading-tight truncate" style={{ color: "var(--text-1)" }}>{nm(s.name)}</span>
          <span className="mt-0.5 flex items-center gap-1.5 text-[10.5px] leading-tight" style={{ color: "var(--text-3)" }}>
            {s.unit}{showShift && <ShiftChip shift={s.shift} t={t} />}
          </span>
        </span>
        <span className="flex-shrink-0 inline-flex items-center gap-1 rounded-full pl-1.5 pr-2 py-1 text-[13px] font-black tabular-nums leading-none"
          style={{ background: hexA(tone, 0.18), border: `1px solid ${hexA(tone, 0.5)}`, color: tone }}>
          <Trophy size={14} />{place}
        </span>
      </span>

      <span className="relative mt-2.5 flex items-end gap-2">
        <span className="tabular-nums leading-none" style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", color: bandInk(st, s.comp) }}>{fmt1(s.comp)}</span>
        <span className="text-[11px] pb-0.5" style={{ color: "var(--text-4)" }}>/100 · {t("leaderboard.overallShort")}</span>
        <span className="ml-auto pb-0.5"><MoveChip prev={s.prevRank} now={s.rank} st={st} t={t} /></span>
      </span>

      <span className="relative grid grid-cols-5 gap-1.5 mt-2.5">
        {CATS.map((c) => (
          <CardStat key={c.key} label={catMeta[c.key].short} full={catMeta[c.key].name} value={s.s[c.key]} st={st} />
        ))}
      </span>
    </button>
  );
}

/* ═══════════════════════ breakdown (an opened row) ═══════════════════
 * The five statistics against the TEAM — each value with its bar, the team
 * average as a tick on the same bar, and the change since the first week —
 * plus the two strongest and two weakest named outright. */
function BreakdownBody({ s, catMeta, teamAvg, st, t }) {
  const have = CATS.filter((c) => s.s[c.key] != null);
  const sorted = [...have].sort((a, b) => s.s[b.key] - s.s[a.key]);
  const strong = sorted.slice(0, 2), weak = sorted.slice(-2).reverse();
  const chip = (c, good) => (
    <span key={c.key} className="inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2.5 py-1 tabular-nums"
      style={{ color: good ? st.okInk : st.badInk, background: hexA(good ? st.ok : st.bad, 0.12) }}>
      {good ? <ArrowUp size={10} /> : <ArrowDown size={10} />}{catMeta[c.key].short} · {fmt(s.s[c.key])}%
    </span>
  );
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_236px]">
      <div className="flex flex-col gap-2 min-w-0">
        {CATS.map((c) => {
          const meta = catMeta[c.key], Icon = meta.icon;
          const v = s.s[c.key], arr = s.sparks[c.key];
          const d = arr ? v - arr[0] : null;
          const avg = teamAvg[c.key];
          return (
            <div key={c.key} className="grid items-center gap-3" style={{ gridTemplateColumns: "minmax(88px,150px) 44px minmax(40px,1fr) 40px" }}>
              <span className="flex items-center gap-2 min-w-0 text-[12.5px] font-medium" style={{ color: "var(--text-1)" }} title={meta.name}>
                <span className="inline-flex items-center justify-center rounded-md flex-shrink-0" style={{ width: 22, height: 22, background: hexA(meta.hue, 0.14), color: meta.hue }}><Icon size={12} /></span>
                <span className="truncate">{meta.name}</span>
              </span>
              <b className="tabular-nums text-right text-[13.5px]" style={{ color: bandInk(st, v) }}>{v == null ? t("leaderboard.noData") : `${fmt(v)}%`}</b>
              <div className="relative" style={{ height: 14 }} title={avg != null ? `${t("leaderboard.teamAvg")}: ${fmt(avg)}%` : undefined}>
                <div className="absolute inset-x-0 rounded-full overflow-hidden" style={{ top: 4, height: 6, background: "var(--border-md)" }}>
                  {v != null && <i className="block h-full rounded-full" style={{ width: `${v}%`, background: bandFill(st, v) }} />}
                </div>
                {avg != null && <i className="absolute rounded-sm" style={{ left: `calc(${avg}% - 1px)`, top: 1, width: 2, height: 12, background: "var(--text-2)" }} />}
              </div>
              <span className="tabular-nums text-right text-[11px] font-semibold" title={t("leaderboard.vsEightWeeks")} style={{ color: deltaInk(st, d) }}>
                {d == null ? "" : `${d > 0 ? "+" : d < 0 ? "−" : ""}${fmt(Math.abs(d))}`}
              </span>
            </div>
          );
        })}
        <div className="text-[11px]" style={{ color: "var(--text-4)" }}>{t("leaderboard.breakdownLegend")}</div>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>{t("leaderboard.strengths")}</span>
        <span className="flex flex-wrap gap-1.5">{strong.map((c) => chip(c, true))}</span>
        <span className="text-[10px] font-bold uppercase tracking-wider mt-1" style={{ color: "var(--text-3)" }}>{t("leaderboard.growthZones")}</span>
        <span className="flex flex-wrap gap-1.5">{weak.map((c) => chip(c, false))}</span>
      </div>
    </div>
  );
}

/* ═══════════════════════ register rows ═══════════════════════════════ */
function TableRow({ s, isSel, isExp, onClick, sortKey, catMeta, teamAvg, st, medal, t, nm, showShift }) {
  const onKey = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } };
  return (
    <>
      <tr onClick={onClick} onKeyDown={onKey} tabIndex={0} aria-expanded={isExp}
        className="transition-colors cursor-pointer" style={isSel ? { background: "var(--brand-bg)" } : undefined}>
        <td className="px-3 py-2">
          <span className="flex items-center gap-2">
            <PlaceBadge place={s.rank} medal={medal} />
            <MoveChip prev={s.prevRank} now={s.rank} st={st} t={t} />
          </span>
        </td>
        <td className="px-3 py-2">
          <span className="flex items-center gap-2.5">
            <Avatar sup={s} size={30} />
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold leading-tight" style={{ color: "var(--text-1)" }}>{nm(s.name)}</span>
              <span className="flex items-center gap-1.5 text-[11px] mt-0.5" style={{ color: "var(--text-4)" }}>
                {s.unit}{showShift && <ShiftChip shift={s.shift} t={t} />}
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
            <i className="block h-full rounded-full" style={{ width: `${s.comp}%`, background: bandFill(st, s.comp) }} />
          </span>
        </td>
        {CATS.map((c) => {
          const v = s.s[c.key];
          return (
            <td key={c.key} className="px-3 py-2 text-right hidden md:table-cell" style={sortKey === c.key ? { background: "var(--bg-inner)" } : undefined}>
              {v == null
                ? <span className="font-semibold" style={{ color: st.none }} title={t("leaderboard.noData")}>—</span>
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
            <BreakdownBody s={s} catMeta={catMeta} teamAvg={teamAvg} st={st} t={t} />
          </td>
        </tr>
      )}
    </>
  );
}

/* Phone: the same row as a stacked card — place, who, the overall score — and
 * the breakdown opens INSIDE the card, so the five statistics the narrow
 * table has no room for are one tap away from the name. */
function MobileRow({ s, isSel, isExp, onClick, catMeta, teamAvg, st, medal, t, nm, showShift }) {
  return (
    <div style={{ borderTop: "1px solid var(--border)", background: isSel ? "var(--brand-bg)" : undefined }}>
      <button type="button" onClick={onClick} aria-expanded={isExp} className="w-full text-left flex items-center gap-2.5 px-3 py-2.5">
        <PlaceBadge place={s.rank} medal={medal} />
        <Avatar sup={s} size={32} />
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold leading-tight truncate" style={{ color: "var(--text-1)" }}>{nm(s.name)}</span>
          <span className="flex items-center gap-1.5 text-[11px] mt-0.5 flex-wrap" style={{ color: "var(--text-4)" }}>
            {s.unit}{showShift && <ShiftChip shift={s.shift} t={t} />}<MoveChip prev={s.prevRank} now={s.rank} st={st} t={t} />
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
          <BreakdownBody s={s} catMeta={catMeta} teamAvg={teamAvg} st={st} t={t} />
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════ rank-trajectory chart ═══════════════════════
 * A bump chart: every brigadir's place week by week. Measured to its card
 * (never a fixed width that scrolls on a phone), one neutral line per person,
 * the selected one in brand gold, and every line NAMED at its end — final
 * places are unique, so the names can never collide and no legend is needed.
 * The end dots of the top three carry their medal. */
function BumpChart({ sups, selectedId, onSelect, onTip, nm, medal, t }) {
  const [ref, width] = useElementWidth();
  const [hoverId, setHoverId] = useState(null);
  const n = sups.length;
  const W = Math.max(360, width);
  const H = Math.max(200, 24 * n + 44);
  const padL = 28, padR = clamp(Math.round(W * 0.22), 96, 150), padT = 14, padB = 26;
  const x = (w) => padL + (w / LAST) * (W - padL - padR);
  const y = (rk) => (n < 2 ? padT + (H - padT - padB) / 2 : padT + ((rk - 1) / (n - 1)) * (H - padT - padB));
  const state = (s) => (s.id === selectedId ? 2 : s.id === hoverId ? 1 : 0);
  const order = [...sups].sort((a, b) => state(a) - state(b));
  return (
    <div ref={ref} className="w-full">
      {width > 0 && (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block", maxWidth: "100%" }} role="img" aria-label={t("leaderboard.rankDynamics")}>
          {Array.from({ length: n }, (_, i) => i + 1).map((rk) => (
            <g key={rk}>
              <line x1={padL} y1={y(rk)} x2={W - padR + 6} y2={y(rk)} stroke="var(--border-md)" strokeWidth="1" />
              <text x={padL - 8} y={y(rk) + 3.5} textAnchor="end" fontSize="10" fill="var(--text-4)" className="tabular-nums">{rk}</text>
            </g>
          ))}
          {WEEKS.map((wk, i) => (
            <text key={wk} x={x(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--text-4)" className="tabular-nums">{wk}</text>
          ))}
          {order.map((s) => {
            const lv = state(s);
            const pts = s.rankHist.map((rk, w) => `${x(w).toFixed(1)},${y(rk).toFixed(1)}`).join(" ");
            const stroke = lv === 2 ? "var(--brand)" : lv === 1 ? "var(--text-2)" : "var(--text-4)";
            const dot = lv === 2 ? "var(--brand)" : medal[s.rank] || stroke;
            return (
              <g key={s.id} style={{ cursor: "pointer" }}
                onMouseMove={(e) => { setHoverId(s.id); onTip(e, nm(s.name), `${t("leaderboard.rank")}: ${s.rank} · ${t("leaderboard.eightWeeksAgo")}: ${s.rankHist[0]} · ${fmt1(s.comp)} /100`); }}
                onMouseLeave={() => { setHoverId(null); onTip(null); }}
                onClick={() => onSelect(s.id)}>
                <polyline points={pts} fill="none" stroke={stroke} strokeWidth={lv === 2 ? 3 : lv === 1 ? 2.2 : 1.4} opacity={lv ? 1 : 0.45} strokeLinecap="round" strokeLinejoin="round" />
                <circle cx={x(LAST)} cy={y(s.rank)} r={lv === 2 ? 4.5 : 3.2} fill={dot} stroke="var(--bg-card)" strokeWidth="1.5" />
                <text x={x(LAST) + 10} y={y(s.rank) + 3.5} fontSize="11" fontWeight={lv === 2 ? 700 : 500}
                  fill={lv === 2 ? "var(--brand-text)" : lv === 1 ? "var(--text-1)" : "var(--text-3)"}>{shortPerson(nm(s.name))}</text>
                <polyline points={pts} fill="none" stroke="transparent" strokeWidth="14" />
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

/* ═══════════════════════ page ════════════════════════════════════════ */
function useLeaderboardData(dateFrom, dateTo, shiftF) {
  // DUMMY: swap this hook for a useQuery returning { sups, byRank } later —
  // it already takes the standard filter set (period + shift).
  return useMemo(() => {
    const { sups: all } = buildData(seedOf(dateFrom, dateTo));
    // A shift is ranked among itself, so places stay dense (1..n).
    return rankPool(shiftF ? all.filter((s) => s.shift === shiftF) : all);
  }, [dateFrom, dateTo, shiftF]);
}

/* Local YYYY-MM-DD (no UTC shift). */
function isoDay(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function Leaderboard() {
  const { t } = useLang();
  const { tl, lang } = useTranslit();
  const { theme } = useTheme();
  const st = STATUS[theme] || STATUS.dark;
  const hues = CAT_HUES[theme] || CAT_HUES.dark;
  const medal = MEDAL[theme] || MEDAL.dark;
  const toast = useToast();
  const nm = (s) => tl(s);

  const catMeta = useMemo(() => Object.fromEntries(CATS.map((c) => [c.key, {
    hue: hues[c.key], name: t(`leaderboard.cat.${c.key}`), short: t(`leaderboard.cat.${c.key}Short`), icon: c.icon, weight: c.weight,
  }])), [hues, t]);

  // Page-local period + shift (the standard top-row set). Local, NOT the
  // global FilterContext: dummy ids must never leak into the shared filter
  // state other pages send to real endpoints.
  const [dateFrom, setDateFrom] = usePersistentState("leaderboard_date_from", () => { const d = new Date(); d.setDate(d.getDate() - 13); return isoDay(d); });
  const [dateTo, setDateTo] = usePersistentState("leaderboard_date_to", () => isoDay(new Date()));
  const [shiftF, setShiftF] = usePersistentState("leaderboard_shift", null); // null = all | 1 | 2
  const { sups, byRank } = useLeaderboardData(dateFrom, dateTo, shiftF);

  const [selectedId, setSelectedId] = usePersistentState("leaderboard_selected_id", 3);
  const [expandedId, setExpandedId] = usePersistentState("leaderboard_expanded_id", 3);
  const [sortKey, setSortKey] = usePersistentState("leaderboard_sort", "overall");
  const [query, setQuery] = usePersistentState("leaderboard_search", "");
  const [tip, setTip] = useState(null);

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
    setExpandedId((cur) => (fromTable && cur === id ? null : id));
  }

  // Team reference points — every number on the page is read against these.
  const teamAvg = useMemo(() => Object.fromEntries(CATS.map((c) => {
    const vals = sups.map((s) => s.s[c.key]).filter((v) => v != null);
    return [c.key, vals.length ? vals.reduce((a, v) => a + v, 0) / vals.length : null];
  })), [sups]);

  const kpi = useMemo(() => {
    const n = sups.length;
    if (!n) return null;
    const avg = sups.reduce((a, s) => a + s.comp, 0) / n;
    const prevAvg = sups.reduce((a, s) => a + s.hist[LAST - 1], 0) / n;
    const green = sups.filter((s) => s.comp >= 80).length;
    const red = sups.filter((s) => s.comp < 65).length;
    const best = sups.map((s) => ({ s, mv: s.prevRank - s.rank })).sort((a, b) => b.mv - a.mv)[0];
    return { n, avg, dAvg: avg - prevAvg, green, red, climber: best && best.mv > 0 ? best : null };
  }, [sups]);

  const rows = useMemo(() => {
    let r = [...sups];
    r.sort(sortKey === "overall" ? (a, b) => a.rank - b.rank : (a, b) => (b.s[sortKey] ?? -1) - (a.s[sortKey] ?? -1));
    const q = query.trim().toLowerCase();
    if (q) r = r.filter((s) => `${s.name} ${tl(s.name)} ${s.unit}`.toLowerCase().includes(q));
    return r;
  }, [sups, sortKey, query, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const showShift = shiftF == null;
  const showPodium = sortKey === "overall" && !query.trim() && byRank.length >= 3;
  const sortOptions = [["overall", t("leaderboard.overallShort")], ...CATS.map((c) => [c.key, catMeta[c.key].short])];
  const muted = { color: "var(--text-4)" };
  const dAvgIcon = kpi && (kpi.dAvg > 0.05 ? <ArrowUp size={11} /> : kpi.dAvg < -0.05 ? <ArrowDown size={11} /> : <Minus size={11} />);

  const rowProps = (s) => ({
    s, isSel: s.id === effSelectedId, isExp: s.id === expandedId, onClick: () => selectSup(s.id, true),
    catMeta, teamAvg, st, medal, t, nm, showShift,
  });

  return (
    <Layout title={t("leaderboard.subtitle")}>
      <div className="flex flex-col gap-4 max-w-[1200px] mx-auto">

        {/* ── page toolbar: period inline, shift in the FilterPanel (a chip
            when narrowed), demo caveat + export on the right ── */}
        <div className="flex items-center gap-2 flex-wrap">
          <DateRangePicker dateFrom={dateFrom} dateTo={dateTo} setDateFrom={setDateFrom} setDateTo={setDateTo} compactLabel triggerClassName="px-3 py-2 text-sm" />
          <FilterPanel
            sections={[{
              key: "shift", icon: Layers, label: t("filter.shift"),
              active: shiftF != null,
              display: shiftF != null ? `${t("filter.shift")} ${shiftF}` : "",
              onClear: () => setShiftF(null),
              render: () => (
                <SegmentedToggle fill value={shiftF} onChange={setShiftF} options={[[null, t("filter.all")], [1, "S1"], [2, "S2"]]} />
              ),
            }]}
          />
          <div className="flex items-center gap-2.5 sm:ml-auto">
            {/* the demo badge is a caveat, not an accent: amber keeps it from
                reading as a second gold action and leaves brand gold to mean
                one thing on this page — the selected brigadir. */}
            <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ color: st.warnInk, background: hexA(st.warn, 0.12), border: `1px solid ${hexA(st.warn, 0.32)}` }}>
              {t("leaderboard.demoBadge")}
            </span>
            <Button size="lg" variant="secondary" icon={<Download size={14} />} title={t("leaderboard.exportHint")} onClick={() => toast.info(t("leaderboard.demoExport"))}>
              {t("leaderboard.export")}
            </Button>
          </div>
        </div>

        {/* ── the five-second answer: is the team OK, and who is moving ── */}
        {kpi && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KPICard label={t("leaderboard.teamAvg")} icon={Gauge} color={bandInk(st, kpi.avg)}
              value={<>{fmt1(kpi.avg)}<span className="text-sm font-normal" style={muted}> /100</span></>}
              sub={<span className="inline-flex items-center gap-1 flex-wrap">
                <span>{kpi.n} {t("leaderboard.brigadirsUnit")} ·</span>
                <span className="inline-flex items-center gap-0.5 font-semibold tabular-nums" style={{ color: deltaInk(st, Math.abs(kpi.dAvg) < 0.05 ? 0 : kpi.dAvg) }}>{dAvgIcon}{fmt1(Math.abs(kpi.dAvg))}</span>
                <span>{t("leaderboard.vsPrevWeek")}</span>
              </span>} />
            <KPICard label={t("leaderboard.kpi.green")} icon={CircleCheck} color={st.okInk}
              value={<>{kpi.green}<span className="text-sm font-normal" style={muted}> / {kpi.n}</span></>}
              sub={t("leaderboard.bandGood")} />
            <KPICard label={t("leaderboard.kpi.attention")} icon={TriangleAlert} color={kpi.red ? st.badInk : st.none}
              value={<>{kpi.red}<span className="text-sm font-normal" style={muted}> / {kpi.n}</span></>}
              sub={t("leaderboard.bandBad")} />
            <KPICard label={t("leaderboard.kpi.climber")} icon={TrendingUp} color={kpi.climber ? st.okInk : st.none}
              value={kpi.climber ? <>+{kpi.climber.mv}<span className="text-sm font-normal" style={muted}> {t("leaderboard.rank").toLowerCase()}</span></> : "—"}
              sub={kpi.climber ? `${nm(kpi.climber.s.name)} · ${kpi.climber.s.prevRank} → ${kpi.climber.s.rank}` : t("leaderboard.kpi.nobodyUp")} />
          </div>
        )}

        {/* ── the register: podium on top, every brigadir below ── */}
        <TableCard
          icon={ListOrdered}
          title={t("leaderboard.overallRanking")}
          subtitle={t("leaderboard.rowHint")}
          right={<span className="text-xs tabular-nums" style={muted}>{rows.length} {t("leaderboard.brigadirsUnit")}</span>}
          toolbar={<>
            <SearchInput value={query} onChange={setQuery} placeholder={t("leaderboard.searchPlaceholder")} className="w-full sm:w-56" />
            <SegmentedToggle value={sortKey} onChange={setSortKey} options={sortOptions} className="sm:ml-auto" ariaLabel={t("leaderboard.score")} />
            {showPodium && (
              <div className="basis-full grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-1">
                {byRank.slice(0, 3).map((s, i) => (
                  <PodiumCard key={s.id} s={s} place={i + 1} tone={medal[i + 1]} selected={s.id === effSelectedId}
                    onSelect={() => selectSup(s.id)} catMeta={catMeta} st={st} t={t} nm={nm} showShift={showShift} />
                ))}
              </div>
            )}
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
              {CATS.map((c) => (
                <Th key={c.key} k={c.key} sort={{ key: sortKey, dir: "desc" }} onSort={setSortKey} align="right" cls="hidden md:table-cell w-[104px]" hint={catMeta[c.key].name}
                  label={<span className="inline-flex items-center gap-1.5"><span className="inline-block rounded-full" style={{ width: 7, height: 7, background: catMeta[c.key].hue }} />{catMeta[c.key].short}</span>} />
              ))}
              <Th label={t("leaderboard.trend")} align="center" cls="hidden lg:table-cell w-[116px]" hint={t("leaderboard.trendHint")} />
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
        <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <SectionHead icon={TrendingUp} title={t("leaderboard.rankDynamics")} subtitle={t("leaderboard.chartHint")}
            right={selectedSup && (
              <span className="inline-flex items-center gap-1.5 text-xs">
                <Avatar sup={selectedSup} size={20} />
                <span className="font-semibold" style={{ color: "var(--brand-text)" }}>{nm(selectedSup.name)}</span>
                <span style={muted}>· {t("leaderboard.selected")}</span>
              </span>
            )} />
          <div className="px-3 pb-3 pt-2">
            <BumpChart sups={sups} selectedId={effSelectedId} onSelect={selectSup} onTip={onTip} nm={nm} medal={medal} t={t} />
          </div>
        </div>

        {/* ── methodology ── */}
        <details className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer select-none" style={{ listStyle: "none" }}>
            <span className="inline-flex items-center justify-center rounded-lg flex-shrink-0" style={{ width: 26, height: 26, background: "var(--brand-bg)", color: "var(--brand-text)" }}><Info size={14} /></span>
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>{t("leaderboard.methodTitle")}</span>
            <ChevronDown size={15} className="ml-auto" style={muted} />
          </summary>
          <div className="px-4 pb-4 text-[13px] max-w-[720px]" style={{ color: "var(--text-2)" }}>
            {t("leaderboard.methodBody")}
            <div className="flex flex-wrap gap-2 mt-3">
              {CATS.map((c) => (
                <span key={c.key} className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-3 py-1.5" style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
                  <span className="rounded-full" style={{ width: 8, height: 8, background: catMeta[c.key].hue }} />{catMeta[c.key].name} <b className="tabular-nums">{Math.round(c.weight * 100)}%</b>
                </span>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
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
