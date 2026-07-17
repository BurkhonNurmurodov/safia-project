import { useMemo, useState } from "react";
import {
  Trophy, Crown, Medal, Gauge, ClipboardCheck, Lightbulb, ShieldCheck,
  UserCheck, ListOrdered, TrendingUp, Activity, ArrowUp, ArrowDown, Minus,
  Info, ChevronDown, Download, ArrowRight,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import TableCard, { Th, SectionHead } from "../components/ui/DataTable";
import SearchInput from "../components/ui/SearchInput";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import StyledSelect from "../components/ui/StyledSelect";
import DateRangePicker from "../components/ui/DateRangePicker";
import Button from "../components/ui/Button";
import { useLang } from "../context/LangContext";
import { useTheme } from "../context/ThemeContext";
import { useTranslit } from "../utils/transliterate";

/* ══════════════════════════════════════════════════════════════════════
 * Leaderboard — brigadir ranking across every platform statistic.
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

/* Category identity hues — one per statistic, validated colourblind-safe
 * against both chart surfaces (dark #1a1d27 / light #ffffff). Kept in JS like
 * SUP_COLORS: an identity palette, not chrome. */
const CAT_HUES = {
  dark:  { zag: "#3b82f6", naz: "#ea580c", kai: "#a855f7", xav: "#ec4899", kir: "#0891b2" },
  light: { zag: "#2563eb", naz: "#c2410c", kai: "#9333ea", xav: "#db2777", kir: "#0891b2" },
};

/* Traffic-light status bands (fill + higher-contrast ink per theme). */
const STATUS = {
  dark:  { ok: "#22c55e", okInk: "#4ade80", warn: "#eab308", warnInk: "#fbbf24", bad: "#ef4444", badInk: "#f87171", none: "#94a3b8" },
  light: { ok: "#16a34a", okInk: "#15803d", warn: "#ca8a04", warnInk: "#a16207", bad: "#dc2626", badInk: "#b91c1c", none: "#94a3b8" },
};

/* Per-brigadir identity colours — the Workers.jsx SUP_COLORS spectrum. */
const SUP_COLORS = [
  "#2563eb", "#22c55e", "#f97316", "#8b5cf6", "#eab308", "#ec4899",
  "#0d9488", "#ef4444", "#0ea5e9", "#65a30d", "#d946ef", "#C8973F",
];

/* Podium medal palette — gold / silver / bronze, keyed by finishing place.
 * A decoration set (like SUP_COLORS), not chrome: translucent overlays of the
 * warm-metal hue read the same over the light cream card and the dark card. */
const MEDAL = { 1: "#D4A017", 2: "#9AA4B0", 3: "#C17E45" };

const WEEKS = ["04.05", "11.05", "18.05", "25.05", "01.06", "08.06", "15.06", "22.06"];

/* ────────────────────────── dummy data ──────────────────────────────── */
const RAW = [
  { name: "Malika Qodirova",   unit: "2-uchastka",  s: { zag: 92, naz: 88, kai: 90, xav: 84, kir: 96 } },
  { name: "Dilshod Karimov",   unit: "5-uchastka",  s: { zag: 90, naz: 92, kai: 78, xav: 88, kir: 91 } },
  { name: "Aziza Tosheva",     unit: "1-uchastka",  s: { zag: 87, naz: 74, kai: 92, xav: 90, kir: 88 } },
  { name: "Murodali Ochilov",  unit: "7-uchastka",  s: { zag: 84, naz: 81, kai: 70, xav: 76, kir: 90 } },
  { name: "Sherzod Aliyev",    unit: "3-uchastka",  s: { zag: 86, naz: 70, kai: 75, xav: 72, kir: 84 } },
  { name: "Nodira Yusupova",   unit: "4-uchastka",  s: { zag: 78, naz: 85, kai: 80, xav: 74, kir: 81 } },
  { name: "Jasur Rahimov",     unit: "9-uchastka",  s: { zag: 83, naz: 62, kai: 68, xav: 80, kir: 77 } },
  { name: "Gulnora Ismoilova", unit: "8-uchastka",  s: { zag: 71, naz: 78, kai: 74, xav: 70, kir: 79 } },
  { name: "Bekzod Tursunov",   unit: "6-uchastka",  s: { zag: 74, naz: 66, kai: null, xav: 72, kir: 76 } },
  { name: "Kamola Ergasheva",  unit: "11-uchastka", s: { zag: 69, naz: 72, kai: 60, xav: 66, kir: 74 } },
  { name: "Rustam Nazarov",    unit: "10-uchastka", s: { zag: 66, naz: 58, kai: 55, xav: 62, kir: 70 } },
  { name: "Sardor Xolmatov",   unit: "12-uchastka", s: { zag: 58, naz: 52, kai: 48, xav: 60, kir: 63 } },
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
    for (let w = 0; w < 8; w++) hist.push(w === 7 ? comp : comp - trend * (7 - w) + (rnd() - 0.5) * 6);
    const sparks = {};
    CATS.forEach((c) => {
      const v = s[c.key];
      if (v == null) { sparks[c.key] = null; return; }
      const arr = [];
      for (let w = 0; w < 8; w++) arr.push(w === 7 ? v : clamp(Math.round(v - trend * (7 - w) * 0.8 + (rnd() - 0.5) * 9), 8, 99));
      sparks[c.key] = arr;
    });
    return { id: i, name: r.name, unit: r.unit, shift: unitShift(r.unit), color: SUP_COLORS[i], s, comp, hist, sparks, scoreDelta: +(trend * 1.6 + (rnd() - 0.5)).toFixed(1) };
  });

  const rankHist = sups.map(() => []);
  for (let w = 0; w < 8; w++) {
    sups.map((s) => ({ id: s.id, v: s.hist[w] }))
      .sort((a, b) => b.v - a.v)
      .forEach((o, pos) => { rankHist[o.id][w] = pos + 1; });
  }
  sups.forEach((s) => { s.rankHist = rankHist[s.id]; s.rank = rankHist[s.id][7]; s.prevRank = rankHist[s.id][6]; });
  const byRank = [...sups].sort((a, b) => a.rank - b.rank);
  return { sups, byRank };
}

/* ────────────────────────── helpers ─────────────────────────────────── */
const fmt = (v) => (v == null ? "—" : String(Math.round(v)));
const fmt1 = (v) => v.toFixed(1).replace(".", ",");
function initials(name) { return name.trim().split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase(); }
function shortName(name) { const p = name.split(" "); return p[1] ? `${p[0]} ${p[1][0]}.` : p[0]; }
function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }
function bandOf(v) { return v == null ? "none" : v >= 80 ? "ok" : v >= 65 ? "warn" : "bad"; }
function bandFill(st, v) { const b = bandOf(v); return b === "ok" ? st.ok : b === "warn" ? st.warn : b === "bad" ? st.bad : st.none; }
function bandInk(st, v) { const b = bandOf(v); return b === "ok" ? st.okInk : b === "warn" ? st.warnInk : b === "bad" ? st.badInk : st.none; }

function Avatar({ sup, size }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-full font-bold flex-shrink-0"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36), background: hexA(sup.color, 0.16), color: sup.color, border: `1.5px solid ${hexA(sup.color, 0.35)}` }}
    >
      {initials(sup.name)}
    </span>
  );
}

/* Area sparkline. `color` may be a hex or a var() string. */
function Spark({ arr, w, h, color, cardVar = "var(--bg-card)" }) {
  if (!arr) return <span style={{ color: "var(--text-4)" }}>—</span>;
  const min = Math.min(...arr) - 4, max = Math.max(...arr) + 4;
  const px = (i) => 2 + (i / (arr.length - 1)) * (w - 4);
  const py = (v) => h - 2 - ((v - min) / (max - min || 1)) * (h - 4);
  const pts = arr.map((v, i) => `${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(" ");
  const last = arr[arr.length - 1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" style={{ display: "block" }}>
      <polygon points={`2,${h - 2} ${pts} ${w - 2},${h - 2}`} fill={color} opacity="0.12" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={px(arr.length - 1)} cy={py(last)} r="2.6" fill={color} stroke={cardVar} strokeWidth="1.5" />
    </svg>
  );
}

/* Circular score ring. */
function ScoreRing({ score, color, label }) {
  const r = 38, c = 2 * Math.PI * r;
  return (
    <div className="relative" style={{ width: 92, height: 92 }}>
      <svg width="92" height="92" viewBox="0 0 92 92">
        <circle cx="46" cy="46" r={r} fill="none" stroke="var(--bg-inner)" strokeWidth="7" />
        <circle cx="46" cy="46" r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} transform="rotate(-90 46 46)" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <b className="tabular-nums" style={{ fontSize: 23, fontWeight: 800, letterSpacing: "-0.02em" }}>{fmt1(score)}</b>
        <span style={{ fontSize: 9.5, color: "var(--text-4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
      </div>
    </div>
  );
}

function DeltaChip({ v, unit, st }) {
  const up = v >= 0;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span className="inline-flex items-center gap-1 rounded-full tabular-nums" style={{ fontSize: 11.5, fontWeight: 700, padding: "2px 8px", color: up ? st.okInk : st.badInk, background: up ? hexA(st.ok, 0.12) : hexA(st.bad, 0.12) }}>
      <Icon size={11} />{up ? "+" : "−"}{fmt1(Math.abs(v))} {unit}
    </span>
  );
}

/* ═══════════════════════ rank-trajectory bump chart ═══════════════════ */
function BumpChart({ sups, byRank, selectedId, onSelect, hues, onTip }) {
  const [hoverId, setHoverId] = useState(null);
  const W = 620, H = 320, padL = 34, padR = 150, padT = 18, padB = 30;
  const n = sups.length;
  const x = (w) => padL + (w / 7) * (W - padL - padR);
  // n === 1 (supervisor filter active) — a single flat line through the middle.
  const y = (rk) => (n < 2 ? padT + (H - padT - padB) / 2 : padT + ((rk - 1) / (n - 1)) * (H - padT - padB));
  const emphasized = (s) => s.id === hoverId || s.id === selectedId || s.rank <= 3;
  const order = [...sups].sort((a, b) => (emphasized(a) ? 1 : 0) - (emphasized(b) ? 1 : 0));

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ maxWidth: "100%", display: "block" }}>
      {Array.from({ length: n }, (_, i) => i + 1).map((rk) => (
        <g key={rk}>
          <line x1={padL} y1={y(rk)} x2={W - padR + 10} y2={y(rk)} stroke="var(--grid, rgba(128,128,128,0.12))" strokeWidth="1" />
          <text x={padL - 10} y={y(rk) + 3.5} textAnchor="end" fontSize="10" fill="var(--text-4)" className="tabular-nums">{rk}</text>
        </g>
      ))}
      {WEEKS.map((wk, i) => (
        <text key={wk} x={x(i)} y={H - 8} textAnchor="middle" fontSize="9.5" fill="var(--text-4)" className="tabular-nums">{wk}</text>
      ))}
      {order.map((s) => {
        const pts = s.rankHist.map((rk, w) => `${x(w).toFixed(1)},${y(rk).toFixed(1)}`).join(" ");
        const em = emphasized(s);
        const isSel = s.id === selectedId;
        const stroke = em ? (isSel ? "var(--brand)" : s.color) : "var(--text-4)";
        const last = s.rankHist[7];
        return (
          <g key={s.id}>
            <polyline points={pts} fill="none" stroke={stroke} strokeWidth={em ? (isSel ? 3 : 2.2) : 1.4} opacity={em ? 1 : 0.22} strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: "none" }} />
            {em && <circle cx={x(7)} cy={y(last)} r="4" fill={stroke === "var(--brand)" ? "var(--brand)" : s.color} stroke="var(--bg-card)" strokeWidth="1.5" style={{ pointerEvents: "none" }} />}
            {em && <text x={x(7) + 10} y={y(last) + 3.5} fontSize="11" fontWeight={isSel ? 700 : 600} fill={isSel ? "var(--brand-text)" : "var(--text-2)"}>{shortName(s.name)}</text>}
            <polyline points={pts} fill="none" stroke="transparent" strokeWidth="12" style={{ cursor: "pointer" }}
              onMouseMove={(e) => { setHoverId(s.id); onTip(e, s.name, `${s.rank}-oʻrin · 8 hafta avval: ${s.rankHist[0]}-oʻrin · ${fmt1(s.comp)}`); }}
              onMouseLeave={() => { setHoverId(null); onTip(null); }}
              onClick={() => onSelect(s.id)} />
          </g>
        );
      })}
    </svg>
  );
}

/* ═══════════════════════ distribution strips ═════════════════════════ */
function DistributionStrips({ sups, selectedId, onSelect, catMeta, st, onTip }) {
  const W = 430, H = 34;
  const px = (v) => 8 + (v / 100) * (W - 16);
  const sel = sups.find((s) => s.id === selectedId);
  return (
    <div className="flex flex-col gap-1">
      {CATS.map((c) => {
        const meta = catMeta[c.key];
        const vals = sups.filter((s) => s.s[c.key] != null).map((s) => s.s[c.key]).sort((a, b) => a - b);
        const med = vals[Math.floor(vals.length / 2)];
        const sv = sel.s[c.key];
        return (
          <div key={c.key} className="grid items-center gap-2.5 py-1" style={{ gridTemplateColumns: "118px 1fr" }}>
            <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: "var(--text-2)" }}>
              <span className="inline-flex items-center justify-center rounded-md flex-shrink-0" style={{ width: 22, height: 22, background: hexA(meta.hue, 0.14), color: meta.hue }}>
                <c.icon size={12} />
              </span>{meta.short}
            </span>
            <div style={{ overflow: "hidden" }}>
              <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ maxWidth: "100%", display: "block" }}>
                <line x1="8" y1={H / 2} x2={W - 8} y2={H / 2} stroke="var(--grid, rgba(128,128,128,0.14))" strokeWidth="1.5" />
                <line x1={px(med)} y1="5" x2={px(med)} y2={H - 5} stroke="var(--text-3)" strokeWidth="1.5" strokeDasharray="3 3" />
                {sups.map((s) => {
                  const v = s.s[c.key];
                  if (v == null || s.id === selectedId) return null;
                  return <circle key={s.id} cx={px(v)} cy={H / 2} r="5" fill="var(--text-4)" opacity="0.5" style={{ cursor: "pointer" }}
                    onMouseMove={(e) => onTip(e, s.name, `${meta.name}: ${fmt(v)}%`)} onMouseLeave={() => onTip(null)} onClick={() => onSelect(s.id)} />;
                })}
                {sv != null && <>
                  <text x={px(sv)} y={H / 2 - 10} textAnchor="middle" fontSize="10.5" fontWeight="700" fill="var(--brand-text)" className="tabular-nums">{fmt(sv)}</text>
                  <circle cx={px(sv)} cy={H / 2} r="6.5" fill="var(--brand)" stroke="var(--bg-card)" strokeWidth="2" style={{ cursor: "pointer" }}
                    onMouseMove={(e) => onTip(e, sel.name, `${meta.name}: ${fmt(sv)}%`)} onMouseLeave={() => onTip(null)} />
                </>}
              </svg>
            </div>
          </div>
        );
      })}
      <div className="flex justify-between tabular-nums" style={{ padding: "2px 0 0 128px", fontSize: 10, color: "var(--text-4)" }}>
        <span>0</span><span>50</span><span>100</span>
      </div>
    </div>
  );
}

/* ═══════════════════════ podium ══════════════════════════════════════ */
function Podium({ byRank, selectedId, onSelect, catMeta, st }) {
  const cell = (s, place) => {
    const first = place === 1;
    const medal = MEDAL[place];
    const sel = s.id === selectedId;
    /* Colored elevation = the "aura". #1 sits highest and glows hardest. */
    const lift = first ? 16 : place === 2 ? 4 : 0;
    const glow = first
      ? `0 26px 60px -16px ${hexA(medal, 0.62)}, 0 6px 18px -8px ${hexA(medal, 0.45)}`
      : place === 2
      ? `0 18px 44px -18px ${hexA(medal, 0.52)}`
      : `0 16px 40px -20px ${hexA(medal, 0.46)}`;
    return (
      <button
        key={s.id}
        onClick={() => onSelect(s.id)}
        className={`podium-card${first ? " podium-champ" : ""} relative flex flex-col rounded-2xl text-center overflow-hidden`}
        style={{
          background: "var(--bg-card)",
          border: `1px solid ${hexA(medal, first ? 0.6 : 0.48)}`,
          boxShadow: sel ? `${glow}, 0 0 0 3px var(--brand-ring)` : glow,
          transform: `translateY(-${lift}px)`,
        }}
      >
        {/* metallic wash pouring from the top edge */}
        <span aria-hidden className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(135% 95% at 50% -22%, ${hexA(medal, first ? 0.5 : 0.4)} 0%, ${hexA(medal, 0.14)} 40%, transparent 72%)` }} />
        {/* bright shine line across the top */}
        <span aria-hidden className="absolute top-0 h-px pointer-events-none" style={{ left: 24, right: 24, background: `linear-gradient(90deg, transparent, ${hexA(medal, 0.95)}, transparent)` }} />
        {/* giant ghost rank numeral for sheer weight */}
        <span aria-hidden className="absolute pointer-events-none select-none tabular-nums font-black leading-none" style={{ right: 6, bottom: -22, fontSize: first ? 150 : 118, color: hexA(medal, 0.11) }}>{s.rank}</span>
        {/* champion halo — a slow breathing glow behind the crest */}
        {first && <span aria-hidden className="podium-halo absolute pointer-events-none rounded-full" style={{ inset: "-24% 14% auto 14%", height: "70%", background: `radial-gradient(circle at 50% 40%, ${hexA(medal, 0.55)} 0%, transparent 62%)` }} />}

        <div className="relative flex flex-col items-center gap-2" style={{ padding: first ? "30px 16px 22px" : "22px 16px 16px" }}>
          <span className="absolute flex items-center justify-center rounded-full tabular-nums" style={{ top: 0, left: 0, width: 26, height: 26, fontSize: 12, fontWeight: 800, background: medal, color: "#fff", boxShadow: `0 3px 10px -2px ${hexA(medal, 0.7)}` }}>{s.rank}</span>
          <span className="absolute flex items-center justify-center rounded-lg" style={{ top: 0, right: 0, width: 28, height: 28, color: "#fff", background: medal, boxShadow: `0 3px 12px -2px ${hexA(medal, 0.75)}` }}>{first ? <Crown size={15} /> : <Medal size={15} />}</span>
          <Avatar sup={s} size={first ? 56 : 44} />
          <div style={{ fontWeight: 700, fontSize: first ? 16 : 15 }}>{s.name}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{s.unit}</div>
          <ScoreRing score={s.comp} color={bandFill(st, s.comp)} label="ball" />
          <DeltaChip v={s.scoreDelta} unit="ball" st={st} />
          <div className="flex gap-1.5 mt-1.5">
            {CATS.map((c) => {
              const v = s.s[c.key];
              return (
                <span key={c.key} className="flex flex-col items-center gap-1" style={{ width: 30 }}>
                  <span className="relative w-full overflow-hidden rounded" style={{ height: 26, background: "var(--bg-inner)" }}>
                    <span className="absolute bottom-0 left-0 right-0 rounded-t" style={{ height: `${v ?? 0}%`, background: catMeta[c.key].hue }} />
                  </span>
                  <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: "0.03em", color: "var(--text-4)", textTransform: "uppercase" }}>{catMeta[c.key].short.slice(0, 3)}</span>
                </span>
              );
            })}
          </div>
        </div>
      </button>
    );
  };
  const [p1, p2, p3] = byRank;
  // A filtered pool can hold fewer than 3 brigadirs — render only real places,
  // centered, instead of assuming a full podium.
  return (
    <div
      className="grid gap-3 items-end pt-4"
      style={p3
        ? { gridTemplateColumns: "1fr 1.16fr 1fr" }
        : { gridTemplateColumns: `repeat(${byRank.length}, minmax(220px, 340px))`, justifyContent: "center" }}
    >
      <style>{`
        @keyframes podiumHalo { 0%,100% { opacity:.5; transform:scale(1); } 50% { opacity:.95; transform:scale(1.09); } }
        .podium-halo { animation: podiumHalo 3.6s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .podium-halo { animation: none; opacity:.7; } }
      `}</style>
      {p3
        ? <>{cell(p2, 2)}{cell(p1, 1)}{cell(p3, 3)}</>
        : <>{p1 && cell(p1, 1)}{p2 && cell(p2, 2)}</>}
    </div>
  );
}

/* ═══════════════════════ page ════════════════════════════════════════ */
function useLeaderboardData(dateFrom, dateTo, shiftF, supF) {
  // DUMMY: swap this hook for a useQuery returning { sups, byRank } later —
  // it already takes the standard filter set (period + shift + supervisor).
  return useMemo(() => {
    const { sups: all } = buildData(seedOf(dateFrom, dateTo));
    // Shift narrows the pool; the supervisor pick applies only when it belongs
    // to that pool (a pick from the other shift is ignored, never an empty page).
    let pool = shiftF ? all.filter((s) => s.shift === shiftF) : all;
    if (supF != null && pool.some((s) => s.id === supF)) pool = pool.filter((s) => s.id === supF);
    // Re-rank within the filtered pool so places stay dense (1..n).
    const rankHist = new Map(pool.map((s) => [s.id, []]));
    for (let w = 0; w < 8; w++) {
      pool.map((s) => ({ id: s.id, v: s.hist[w] }))
        .sort((a, b) => b.v - a.v)
        .forEach((o, pos) => { rankHist.get(o.id)[w] = pos + 1; });
    }
    const sups = pool.map((s) => {
      const rh = rankHist.get(s.id);
      return { ...s, rankHist: rh, rank: rh[7], prevRank: rh[6] };
    });
    const byRank = [...sups].sort((a, b) => a.rank - b.rank);
    return { sups, byRank };
  }, [dateFrom, dateTo, shiftF, supF]);
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

  const catMeta = useMemo(() => Object.fromEntries(CATS.map((c) => [c.key, {
    hue: hues[c.key], name: t(`leaderboard.cat.${c.key}`), short: t(`leaderboard.cat.${c.key}Short`), icon: c.icon, weight: c.weight,
  }])), [hues, t]);

  // Page-local period + shift + supervisor filters (the standard top-row set).
  // Local, NOT the global FilterContext: dummy ids must never leak into the
  // shared filter state other pages send to real endpoints.
  const [dateFrom, setDateFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 13); return isoDay(d); });
  const [dateTo, setDateTo] = useState(() => isoDay(new Date()));
  const [shiftF, setShiftF] = useState(null); // null = all | 1 | 2
  const [supF, setSupF] = useState(null);     // brigadir id | null = all
  const { sups, byRank } = useLeaderboardData(dateFrom, dateTo, shiftF, supF);

  const [selectedId, setSelectedId] = useState(3);
  const [expandedId, setExpandedId] = useState(3);
  const [sortKey, setSortKey] = useState("overall");
  const [query, setQuery] = useState("");
  const [tip, setTip] = useState(null);

  // Supervisor picker options track the active shift so the list never offers
  // a pick the pool would ignore.
  const supFilterOptions = useMemo(() => [
    { value: "All", label: t("tasks.allSupervisors") },
    ...RAW.map((r, i) => ({ id: i, name: r.name, shift: unitShift(r.unit) }))
      .filter((o) => !shiftF || o.shift === shiftF)
      .sort((a, b) => tl(a.name).localeCompare(tl(b.name)))
      .map((o) => ({ value: String(o.id), label: tl(o.name) })),
  ], [shiftF, t, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const supSel = supF != null && supFilterOptions.some((o) => o.value === String(supF)) ? String(supF) : "All";

  // Selection survives filtering: if the selected brigadir left the pool,
  // spotlight the current leader instead (charts always need a selection).
  const effSelectedId = sups.some((s) => s.id === selectedId) ? selectedId : byRank[0]?.id;
  const selectedSup = sups.find((s) => s.id === effSelectedId);

  function onTip(e, title, sub) {
    if (!e) { setTip(null); return; }
    setTip({ x: e.clientX, y: e.clientY, title, sub });
  }
  function selectSup(id, fromTable) {
    setSelectedId(id);
    if (fromTable) setExpandedId((cur) => (cur === id ? null : id));
    else setExpandedId(id);
  }

  const rows = useMemo(() => {
    let r = [...sups];
    r.sort(sortKey === "overall" ? (a, b) => a.rank - b.rank : (a, b) => (b.s[sortKey] ?? -1) - (a.s[sortKey] ?? -1));
    if (query) { const q = query.toLowerCase(); r = r.filter((s) => (s.name + " " + s.unit).toLowerCase().includes(q)); }
    return r;
  }, [sups, sortKey, query]);

  const sortOptions = [["overall", t("leaderboard.overallShort")], ...CATS.map((c) => [c.key, catMeta[c.key].short])];

  return (
    <Layout title={t("leaderboard.subtitle")} showFilters={false}>
      <div className="flex flex-col gap-4 max-w-[1200px] mx-auto">

        {/* ── page toolbar (single filter zone): the standard inline period +
            shift + supervisor selectors, plus demo badge + export on the right ── */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <div className="sm:w-72">
            <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: "var(--text-4)" }}>{t("tasks.period")}</label>
            <DateRangePicker
              dateFrom={dateFrom}
              dateTo={dateTo}
              setDateFrom={setDateFrom}
              setDateTo={setDateTo}
              triggerClassName="w-full px-3 py-2 text-sm"
            />
          </div>
          <div className="min-w-0">
            <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: "var(--text-4)" }}>{t("filter.shift")}</label>
            <SegmentedToggle
              value={shiftF}
              onChange={setShiftF}
              options={[[null, t("filter.all")], [1, "S1"], [2, "S2"]]}
            />
          </div>
          <div className="sm:w-64 min-w-0">
            <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: "var(--text-4)" }}>{t("tasks.colSupervisor")}</label>
            <StyledSelect
              value={supSel}
              onChange={(v) => setSupF(v === "All" ? null : Number(v))}
              options={supFilterOptions}
              searchable
              searchPlaceholder={t("filter.searchBrigadirs")}
              triggerClassName="w-full px-3 py-2 text-sm"
            />
          </div>
          <div className="flex items-center gap-2.5 sm:ml-auto sm:self-end">
            <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ color: "var(--brand-text)", background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }}>
              {t("leaderboard.demoBadge")}
            </span>
            <Button size="lg" icon={<Download size={14} />} title={t("leaderboard.exportHint")} onClick={() => onDemoExport(setTip)}>
              {t("leaderboard.export")}
            </Button>
          </div>
        </div>

        {/* ── podium ── */}
        <Podium byRank={byRank} selectedId={effSelectedId} onSelect={selectSup} catMeta={catMeta} st={st} />

        {/* ── category leaders ── */}
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
            <Trophy size={14} style={{ color: "var(--brand-text)" }} />{t("leaderboard.categoryLeaders")}
          </div>
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
            {CATS.map((c) => {
              const meta = catMeta[c.key];
              const ranked = sups.filter((s) => s.s[c.key] != null).sort((a, b) => b.s[c.key] - a.s[c.key]);
              const top = ranked[0];
              const avg = ranked.reduce((a, s) => a + s.s[c.key], 0) / ranked.length;
              return (
                <div key={c.key} className="flex flex-col gap-2.5 rounded-2xl p-3.5 min-w-0" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center justify-center rounded-lg flex-shrink-0" style={{ width: 28, height: 28, background: hexA(meta.hue, 0.14), color: meta.hue }}><c.icon size={15} /></span>
                    <span className="text-[11px] font-bold uppercase leading-tight" style={{ letterSpacing: "0.06em", color: "var(--text-3)" }}>{meta.name}</span>
                  </div>
                  <div className="flex items-center gap-2 min-w-0">
                    <Avatar sup={top} size={26} />
                    <div className="min-w-0">
                      <div className="text-[12.5px] font-semibold truncate">{top.name}</div>
                      <div className="text-[10.5px]" style={{ color: "var(--text-4)" }}>{top.unit}</div>
                    </div>
                  </div>
                  <div className="flex items-end justify-between gap-2">
                    <div>
                      <div className="tabular-nums" style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1, color: bandInk(st, top.s[c.key]) }}>{fmt(top.s[c.key])}%</div>
                      <div className="text-[10.5px] mt-1 tabular-nums" style={{ color: "var(--text-4)" }}>{t("leaderboard.teamAvg")}: {fmt(avg)}%</div>
                    </div>
                    <Spark arr={top.sparks[c.key]} w={76} h={30} color={meta.hue} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── main ranking table ── */}
        <TableCard
          icon={ListOrdered}
          title={t("leaderboard.overallRanking")}
          right={<span className="text-xs" style={{ color: "var(--text-4)" }}>{rows.length} {t("leaderboard.brigadirsUnit")}</span>}
          toolbar={<>
            <SearchInput value={query} onChange={setQuery} placeholder={t("leaderboard.searchPlaceholder")} className="w-full sm:w-60" />
            <div className="flex-1" />
            <div className="overflow-x-auto"><SegmentedToggle size="sm" value={sortKey} onChange={setSortKey} options={sortOptions} /></div>
          </>}
          maxHeight="none"
          hover={false}
        >
          <thead>
            <tr>
              <Th label={t("leaderboard.rank")} cls="w-20" />
              <Th label={t("leaderboard.brigadir")} />
              <Th label={t("leaderboard.score")} k="overall" sort={{ key: sortKey, dir: "desc" }} onSort={setSortKey} align="left" />
              {CATS.map((c) => (
                <Th key={c.key} k={c.key} sort={{ key: sortKey, dir: "desc" }} onSort={setSortKey} align="right"
                  label={<span className="inline-flex items-center gap-1.5"><span className="inline-block rounded-full" style={{ width: 7, height: 7, background: catMeta[c.key].hue }} />{catMeta[c.key].short}</span>} />
              ))}
              <Th label={t("leaderboard.trend")} align="center" cls="w-28" />
              <Th label="" cls="w-9" />
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              const mv = s.prevRank - s.rank;
              const rankCls = s.rank === 1 ? { background: "var(--brand)", color: "#fff", border: "1px solid transparent" }
                : s.rank <= 3 ? { background: "var(--brand-bg)", color: "var(--brand-text)", border: "1px solid var(--brand-border)" }
                : { background: "var(--bg-inner)", color: "var(--text-2)", border: "1px solid var(--border)" };
              const isSel = s.id === selectedId;
              const isExp = s.id === expandedId;
              return (
                <FragmentRow key={s.id}
                  s={s} mv={mv} rankCls={rankCls} isSel={isSel} isExp={isExp}
                  sortKey={sortKey} catMeta={catMeta} st={st}
                  onClick={() => selectSup(s.id, true)}
                  t={t}
                />
              );
            })}
          </tbody>
        </TableCard>
        <div className="text-[11px]" style={{ color: "var(--text-4)", marginTop: -6 }}>{t("leaderboard.rowHint")}</div>

        {/* ── charts ── */}
        <div className="grid gap-4" style={{ gridTemplateColumns: "minmax(0,1.2fr) minmax(0,1fr)" }}>
          <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <SectionHead icon={TrendingUp} title={t("leaderboard.rankDynamics")} right={<span className="text-xs" style={{ color: "var(--text-4)" }}>{t("leaderboard.rankAxis")}</span>} />
            <div className="flex gap-3.5 flex-wrap px-4 pt-2">
              {byRank.slice(0, 3).map((s) => (
                <span key={s.id} className="inline-flex items-center gap-1.5 text-[11.5px]" style={{ color: "var(--text-2)" }}>
                  <span className="rounded-sm" style={{ width: 14, height: 3, background: s.color }} />{shortName(s.name)}
                </span>
              ))}
              <span className="inline-flex items-center gap-1.5 text-[11.5px]" style={{ color: "var(--text-2)" }}>
                <span className="rounded-sm" style={{ width: 14, height: 3, background: "var(--brand)" }} />{shortName(selectedSup.name)} ({t("leaderboard.selected")})
              </span>
            </div>
            <div className="px-4 pb-4 pt-1"><div style={{ overflowX: "auto" }}>
              <BumpChart sups={sups} byRank={byRank} selectedId={effSelectedId} onSelect={selectSup} hues={hues} onTip={onTip} />
            </div></div>
          </div>

          <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <SectionHead icon={Activity} title={t("leaderboard.distribution")}
              right={<span className="inline-flex items-center gap-1.5 text-xs"><Avatar sup={selectedSup} size={20} /><span className="font-semibold" style={{ color: "var(--text-2)" }}>{shortName(selectedSup.name)}</span></span>} />
            <div className="px-4 py-3">
              <DistributionStrips sups={sups} selectedId={effSelectedId} onSelect={selectSup} catMeta={catMeta} st={st} onTip={onTip} />
            </div>
            <div className="text-[11px] px-4 pb-3" style={{ color: "var(--text-4)" }}>{t("leaderboard.distHint")}</div>
          </div>
        </div>

        {/* ── methodology ── */}
        <details className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <summary className="flex items-center gap-2 px-4 py-3.5 cursor-pointer select-none" style={{ listStyle: "none" }}>
            <span className="inline-flex items-center justify-center rounded-lg flex-shrink-0" style={{ width: 26, height: 26, background: "var(--brand-bg)", color: "var(--brand-text)" }}><Info size={14} /></span>
            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>{t("leaderboard.methodTitle")}</span>
            <ChevronDown size={15} className="ml-auto" style={{ color: "var(--text-4)" }} />
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
          </div>
        </details>
      </div>

      {/* floating tooltip */}
      {tip && (
        <div className="fixed z-50 pointer-events-none rounded-lg px-2.5 py-2" style={{ left: Math.min(tip.x + 14, window.innerWidth - 250), top: Math.max(8, tip.y - 60), background: "var(--bg-accent)", border: "1px solid var(--border-md)", boxShadow: "0 6px 20px rgba(0,0,0,0.25)", maxWidth: 240 }}>
          <div className="text-xs font-bold" style={{ color: "var(--text-1)" }}>{tip.title}</div>
          <div className="text-[11px] tabular-nums" style={{ color: "var(--text-3)" }}>{tip.sub}</div>
        </div>
      )}
    </Layout>
  );
}

/* Demo export placeholder — real build sends the xlsx to the user's Telegram
 * chat (see excel-export-to-chat convention). For now, a transient toast. */
function onDemoExport(setTip) {
  // Show a brief centered note via the same tooltip channel.
  setTip({ x: window.innerWidth / 2 - 100, y: 120, title: "Namuna rejimi", sub: "Real maʼlumot ulangach, eksport faollashadi." });
  setTimeout(() => setTip(null), 2600);
}

/* One data row + its expandable detail row. */
function FragmentRow({ s, mv, rankCls, isSel, isExp, sortKey, catMeta, st, onClick, t }) {
  const rowStyle = isSel ? { background: "var(--brand-bg)", cursor: "pointer" } : { cursor: "pointer" };
  return (
    <>
      <tr onClick={onClick} style={rowStyle} className="transition-colors">
        <td className="px-3 py-2">
          <span className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center rounded-lg tabular-nums flex-shrink-0" style={{ width: 26, height: 26, fontSize: 12.5, fontWeight: 800, ...rankCls }}>{s.rank}</span>
            {mv > 0 ? <span className="inline-flex items-center gap-0.5 text-[11px] font-bold tabular-nums" style={{ color: st.okInk }}><ArrowUp size={10} />{mv}</span>
              : mv < 0 ? <span className="inline-flex items-center gap-0.5 text-[11px] font-bold tabular-nums" style={{ color: st.badInk }}><ArrowDown size={10} />{-mv}</span>
                : <span className="inline-flex items-center text-[11px]" style={{ color: "var(--text-4)" }}><Minus size={11} /></span>}
          </span>
        </td>
        <td className="px-3 py-2">
          <span className="flex items-center gap-2.5" style={{ minWidth: 160 }}>
            <Avatar sup={s} size={32} />
            <span><span className="block text-[13.5px] font-semibold leading-tight">{s.name}</span><span className="block text-[11px]" style={{ color: "var(--text-4)" }}>{s.unit}</span></span>
          </span>
        </td>
        <td className="px-3 py-2" style={{ background: sortKey === "overall" ? "var(--bg-inner)" : undefined, minWidth: 130 }}>
          <div className="flex items-baseline justify-between gap-2">
            <b className="tabular-nums" style={{ fontSize: 15, fontWeight: 800, color: bandInk(st, s.comp) }}>{fmt1(s.comp)}</b>
            <span className="tabular-nums text-[11px]" style={{ color: "var(--text-4)" }}>/ 100</span>
          </div>
          <div className="overflow-hidden rounded-full mt-1.5" style={{ height: 4, background: "var(--bg-inner)" }}>
            <i className="block h-full rounded-full" style={{ width: `${s.comp}%`, background: bandFill(st, s.comp) }} />
          </div>
        </td>
        {CATS.map((c) => {
          const v = s.s[c.key];
          return (
            <td key={c.key} className="px-3 py-2 text-right" style={{ background: sortKey === c.key ? "var(--bg-inner)" : undefined }}>
              {v == null ? <span className="font-semibold" style={{ color: st.none }}>—</span> : <>
                <span className="tabular-nums font-bold text-[13px]" style={{ color: bandInk(st, v) }}>{fmt(v)}%</span>
                <div className="overflow-hidden rounded-full ml-auto mt-1.5" style={{ width: 44, height: 3, background: "var(--bg-inner)" }}>
                  <i className="block h-full rounded-full" style={{ width: `${v}%`, background: bandFill(st, v) }} />
                </div>
              </>}
            </td>
          );
        })}
        <td className="px-3 py-2"><div className="mx-auto" style={{ width: 90 }}><Spark arr={s.hist} w={90} h={28} color={s.color} /></div></td>
        <td className="px-3 py-2"><ChevronDown size={15} style={{ color: "var(--text-4)", transform: isExp ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} /></td>
      </tr>
      {isExp && <DetailRow s={s} catMeta={catMeta} st={st} t={t} />}
    </>
  );
}

function DetailRow({ s, catMeta, st, t }) {
  const have = CATS.filter((c) => s.s[c.key] != null);
  const sorted = [...have].sort((a, b) => s.s[b.key] - s.s[a.key]);
  const strong = sorted.slice(0, 2), weak = sorted.slice(-2).reverse();
  return (
    <tr>
      <td colSpan={5 + CATS.length} style={{ background: "var(--bg-inner)", padding: 16 }}>
        <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
          {CATS.map((c) => {
            const v = s.s[c.key], arr = s.sparks[c.key];
            const d = arr ? v - arr[0] : null;
            const meta = catMeta[c.key];
            return (
              <div key={c.key} className="flex flex-col gap-1.5 rounded-xl p-3 min-w-0" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase" style={{ letterSpacing: "0.06em", color: "var(--text-3)" }}>
                  <span className="rounded-full flex-shrink-0" style={{ width: 7, height: 7, background: meta.hue }} />{meta.name}
                </span>
                <span className="flex items-baseline gap-1.5">
                  {v == null ? <span className="font-semibold text-[13px]" style={{ color: st.none }}>{t("leaderboard.noData")}</span> : <>
                    <b className="tabular-nums" style={{ fontSize: 17, fontWeight: 800, color: bandInk(st, v) }}>{fmt(v)}%</b>
                    <span className="tabular-nums text-[10.5px] font-bold" style={{ color: d >= 0 ? st.okInk : st.badInk }}>{d >= 0 ? "+" : "−"}{fmt(Math.abs(d))}</span>
                  </>}
                </span>
                {arr && <Spark arr={arr} w={120} h={30} color={meta.hue} />}
              </div>
            );
          })}
          <div className="flex flex-col gap-2" style={{ minWidth: 180 }}>
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>{t("leaderboard.strengths")}</span>
            <span className="flex flex-wrap gap-1.5">
              {strong.map((c) => <span key={c.key} className="inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2.5 py-1" style={{ color: st.okInk, background: hexA(st.ok, 0.12) }}><ArrowUp size={10} />{catMeta[c.key].short} · {fmt(s.s[c.key])}%</span>)}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider mt-1" style={{ color: "var(--text-3)" }}>{t("leaderboard.growthZones")}</span>
            <span className="flex flex-wrap gap-1.5">
              {weak.map((c) => <span key={c.key} className="inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2.5 py-1" style={{ color: st.badInk, background: hexA(st.bad, 0.12) }}><ArrowDown size={10} />{catMeta[c.key].short} · {fmt(s.s[c.key])}%</span>)}
            </span>
            <Button variant="ghost" size="sm" className="mt-auto self-start" icon={<ArrowRight size={12} />}>{t("leaderboard.brigadirPage")}</Button>
          </div>
        </div>
      </td>
    </tr>
  );
}
