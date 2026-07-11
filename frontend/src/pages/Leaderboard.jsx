import { useMemo, useState, useEffect } from "react";
import {
  Trophy, Crown, Medal, Gauge, ClipboardCheck, Lightbulb, ShieldCheck,
  UserCheck, ListOrdered, TrendingUp, Activity, ArrowUp, ArrowDown, Minus,
  Info, ChevronDown, Download, ArrowRight,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import TableCard, { Th, SectionHead } from "../components/ui/DataTable";
import SearchInput from "../components/ui/SearchInput";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import Button from "../components/ui/Button";
import { useLang } from "../context/LangContext";
import { useTheme } from "../context/ThemeContext";
import api from "../utils/api";

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

/* Podium medal palette — gold / silver / bronze, keyed by finishing place.
 * A decoration set (like SUP_COLORS), not chrome: translucent overlays of the
 * warm-metal hue read the same over the light cream card and the dark card. */
const MEDAL = { 1: "#D4A017", 2: "#9AA4B0", 3: "#C17E45" };

const WEEKS = ["04.05", "11.05", "18.05", "25.05", "01.06", "08.06", "15.06", "22.06"];

/* ────────────────────────── dummy data ──────────────────────────────── */



const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));



/* Build the whole dataset for a period. A different seed per period makes the
 * mock feel live — switching Hafta/Oy/Chorak reshuffles scores and ranks. */


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

/* Blend a hex toward a target (t=0→hex, 1→target) — for metallic sheen stops. */
function mix(hex, target, t) {
  const a = parseInt(hex.slice(1), 16), b = parseInt(target.slice(1), 16);
  const ch = (sh) => { const x = (a >> sh) & 255, y = (b >> sh) & 255; return Math.round(x + (y - x) * t); };
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

/* An award medallion hung on the crest's lower edge — a chevron ribbon behind a
 * bezelled metal disc struck with the placing. Reads instantly as 2nd / 3rd. */
function MedalBadge({ medal, size, rank }) {
  const d = Math.round(size * 0.34);
  const light = mix(medal, "#ffffff", 0.5), dark = mix(medal, "#000000", 0.3);
  const band = (rot, g, ml) => (
    <span style={{ width: d * 0.3, height: d * 0.95, background: g, transform: `rotate(${rot}deg)`, transformOrigin: "top center", borderRadius: 2, marginLeft: ml }} />
  );
  return (
    <span aria-hidden className="absolute left-1/2 flex flex-col items-center pointer-events-none" style={{ bottom: -d * 0.5, transform: "translateX(-50%)", zIndex: 3 }}>
      <span className="flex justify-center" style={{ marginBottom: -d * 0.62 }}>
        {band(16, `linear-gradient(${light}, ${medal})`, 0)}
        {band(-16, `linear-gradient(${dark}, ${medal})`, -d * 0.14)}
      </span>
      <span className="flex items-center justify-center rounded-full" style={{ width: d, height: d, background: `radial-gradient(circle at 38% 30%, ${light}, ${medal} 54%, ${dark})`, boxShadow: `inset 0 0 0 ${Math.max(1.5, d * 0.055)}px ${hexA("#ffffff", 0.5)}, 0 5px 14px -3px ${hexA(medal, 0.9)}` }}>
        <span className="font-black tabular-nums leading-none" style={{ fontSize: d * 0.5, color: "#fff", textShadow: `0 1px 1px ${hexA("#000000", 0.35)}` }}>{rank}</span>
      </span>
    </span>
  );
}

/* The honour crest: a bezelled avatar hugged by a metallic score ring, crowned
 * (1st) or medalled (2nd/3rd). `score` fills the arc 0–100. */
function Crest({ sup, score, medal, size, first, rank }) {
  const stroke = first ? 9 : 8;
  const cx = size / 2, r = cx - stroke / 2 - 1, c = 2 * Math.PI * r;
  const avD = size - stroke * 2 - 8;                 // small moat → the ring hugs
  const gid = `crest-${medal.slice(1)}-${size}`;
  const light = mix(medal, "#ffffff", 0.5), dark = mix(medal, "#000000", 0.26);
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block", transform: "rotate(-90deg)" }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={light} />
            <stop offset="52%" stopColor={medal} />
            <stop offset="100%" stopColor={dark} />
          </linearGradient>
        </defs>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke={hexA(medal, 0.16)} strokeWidth={stroke} />
        <circle cx={cx} cy={cx} r={r} fill="none" stroke={`url(#${gid})`} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - clamp(score, 0, 100) / 100)} style={{ filter: `drop-shadow(0 0 4px ${hexA(medal, 0.5)})` }} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="inline-flex items-center justify-center rounded-full font-bold" style={{ width: avD, height: avD, fontSize: Math.round(avD * 0.34), background: hexA(sup.color, 0.16), color: sup.color, boxShadow: `inset 0 0 0 2px ${hexA(sup.color, 0.32)}, 0 2px 10px -3px ${hexA(sup.color, 0.5)}` }}>
          {initials(sup.name)}
        </span>
      </span>
      {first
        ? <Crown size={size >= 128 ? 42 : 36} strokeWidth={1.8} style={{ position: "absolute", top: -size * 0.15, left: "50%", transform: "translateX(-50%)", color: medal, fill: hexA(medal, 0.28), filter: `drop-shadow(0 4px 8px ${hexA(medal, 0.6)})`, zIndex: 3 }} />
        : <MedalBadge medal={medal} size={size} rank={rank} />}
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
function BumpChart({ sups, selectedId, onSelect, onTip }) {
  const [hoverId, setHoverId] = useState(null);
  const W = 620, H = 320, padL = 34, padR = 150, padT = 18, padB = 30;
  const n = sups.length;
  const x = (w) => padL + (w / 7) * (W - padL - padR);
  const y = (rk) => padT + ((rk - 1) / (n - 1)) * (H - padT - padB);
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
function DistributionStrips({ sups, selectedId, onSelect, catMeta, onTip }) {
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
/* Two-faced honour card. FRONT = the crest (ringed avatar + regalia + name +
 * score). BACK = the stat detail. Hover peeks the back; click pins it flipped
 * (and selects the supervisor). The colored aura lives on the non-rotating
 * shell so it stays put while the inner face turns. */
function Podium({ byRank, selectedId, onSelect, catMeta, st }) {
  const [pinned, setPinned] = useState(() => new Set());
  const togglePin = (id) => setPinned((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const cell = (s, place) => {
    const first = place === 1;
    const medal = MEDAL[place];
    const sel = s.id === selectedId;
    const pin = pinned.has(s.id);
    const mv = s.prevRank - s.rank;
    const H = first ? 274 : 258;
    const lift = first ? 16 : place === 2 ? 4 : 0;
    const glow = first
      ? `0 26px 60px -16px ${hexA(medal, 0.62)}, 0 6px 18px -8px ${hexA(medal, 0.45)}`
      : place === 2
      ? `0 18px 44px -18px ${hexA(medal, 0.52)}`
      : `0 16px 40px -20px ${hexA(medal, 0.46)}`;

    /* shared face chrome: top wash + hairline sheen (no rank chip — the crest
     * carries the placing on the front; the back gets its own chip below). */
    const faceChrome = (
      <>
        <span aria-hidden className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(135% 95% at 50% -20%, ${hexA(medal, first ? 0.4 : 0.3)} 0%, ${hexA(medal, 0.1)} 42%, transparent 72%)` }} />
        <span aria-hidden className="absolute top-0 h-px pointer-events-none" style={{ left: 24, right: 24, background: `linear-gradient(90deg, transparent, ${hexA(medal, 0.95)}, transparent)` }} />
      </>
    );
    const rankChip = (
      <span className="absolute flex items-center justify-center rounded-full tabular-nums" style={{ top: 12, left: 12, width: 26, height: 26, fontSize: 12, fontWeight: 800, background: medal, color: "#fff", boxShadow: `0 3px 10px -2px ${hexA(medal, 0.7)}`, zIndex: 2 }}>{s.rank}</span>
    );

    const strong = CATS.filter((c) => s.s[c.key] != null).sort((a, b) => s.s[b.key] - s.s[a.key]).slice(0, 2);
    const weak = CATS.filter((c) => s.s[c.key] != null).sort((a, b) => s.s[a.key] - s.s[b.key]).slice(0, 2);

    return (
      <div key={s.id} className={`podium-flip${pin ? " pinned" : ""}`} style={{ perspective: 1400, transform: `translateY(-${lift}px)` }}>
        <div
          role="button" tabIndex={0} aria-pressed={pin} aria-label={`${s.rank}. ${s.name}`}
          onClick={() => { togglePin(s.id); onSelect(s.id); }}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); togglePin(s.id); onSelect(s.id); } }}
          className="podium-flip-outer relative cursor-pointer rounded-2xl outline-none"
          style={{ height: H, boxShadow: sel ? `${glow}, 0 0 0 3px var(--brand-ring)` : glow }}
        >
          <div className="podium-flip-inner absolute inset-0">

            {/* ── FRONT: the honour crest ── */}
            <div className="podium-face absolute inset-0 flex flex-col overflow-hidden rounded-2xl" style={{ background: "var(--bg-card)", border: `1px solid ${hexA(medal, first ? 0.6 : 0.48)}` }}>
              {faceChrome}
              <span aria-hidden className="absolute pointer-events-none select-none tabular-nums font-black leading-none" style={{ right: 6, bottom: -22, fontSize: first ? 150 : 118, color: hexA(medal, 0.11) }}>{s.rank}</span>
              {first && <span aria-hidden className="podium-halo absolute pointer-events-none rounded-full" style={{ inset: "6% 12% auto 12%", height: "58%", background: `radial-gradient(circle at 50% 45%, ${hexA(medal, 0.5)} 0%, transparent 62%)` }} />}
              <div className="relative z-[1] flex flex-1 flex-col items-center justify-center" style={{ padding: "18px 16px 20px" }}>
                <Crest sup={s} score={s.comp} medal={medal} size={first ? 132 : 116} first={first} />
                <div className="mt-5 font-bold" style={{ fontSize: first ? 16.5 : 15 }}>{s.name}</div>
                <div className="tabular-nums font-extrabold leading-none" style={{ marginTop: 6, fontSize: first ? 24 : 21, color: bandInk(st, s.comp) }}>{fmt1(s.comp)}<span style={{ fontSize: "0.62em", fontWeight: 700 }}>%</span></div>
              </div>
            </div>

            {/* ── BACK: the stat detail ── */}
            <div className="podium-face podium-back absolute inset-0 flex flex-col overflow-hidden rounded-2xl" style={{ background: "var(--bg-card)", border: `1px solid ${hexA(medal, 0.48)}` }}>
              {faceChrome}
              <div className="relative z-[1] flex flex-1 flex-col gap-2" style={{ padding: "14px 14px 12px" }}>
                <div className="flex items-center gap-2 pl-7">
                  <div className="min-w-0 text-left">
                    <div className="text-[13px] font-bold leading-tight truncate">{s.name}</div>
                    <div className="text-[11px]" style={{ color: "var(--text-3)" }}>{s.unit}</div>
                  </div>
                  <span className="ml-auto flex items-center gap-1.5">
                    <DeltaChip v={s.scoreDelta} unit="ball" st={st} />
                    {mv !== 0
                      ? <span className="inline-flex items-center gap-0.5 text-[11px] font-bold tabular-nums" style={{ color: mv > 0 ? st.okInk : st.badInk }}>{mv > 0 ? <ArrowUp size={11} /> : <ArrowDown size={11} />}{Math.abs(mv)}</span>
                      : <span className="inline-flex items-center" style={{ color: "var(--text-4)" }}><Minus size={11} /></span>}
                  </span>
                </div>

                <div style={{ height: 1, background: "var(--border)" }} />

                <div className="flex flex-col gap-1">
                  {CATS.map((c) => {
                    const v = s.s[c.key];
                    return (
                      <div key={c.key} className="flex items-center gap-2">
                        <span className="text-[9px] font-bold uppercase tracking-wide" style={{ width: 30, color: "var(--text-4)" }}>{catMeta[c.key].short.slice(0, 3)}</span>
                        <div className="flex-1 overflow-hidden rounded-full" style={{ height: 5, background: "var(--bg-inner)" }}>
                          <i className="block h-full rounded-full" style={{ width: `${v ?? 0}%`, background: catMeta[c.key].hue }} />
                        </div>
                        <span className="text-[11px] font-bold tabular-nums text-right" style={{ width: 30, color: v == null ? st.none : bandInk(st, v) }}>{v == null ? "—" : `${fmt(v)}%`}</span>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-0.5" style={{ overflow: "hidden" }}>
                  <Spark arr={s.hist} w={first ? 300 : 288} h={30} color={s.color} />
                </div>

                <div className="flex flex-wrap gap-1 mt-auto">
                  {strong.map((c) => <span key={c.key} className="inline-flex items-center gap-0.5 text-[10px] font-semibold rounded-full px-2 py-0.5" style={{ color: st.okInk, background: hexA(st.ok, 0.13) }}><ArrowUp size={9} />{catMeta[c.key].short.slice(0, 3)}</span>)}
                  {weak.map((c) => <span key={c.key} className="inline-flex items-center gap-0.5 text-[10px] font-semibold rounded-full px-2 py-0.5" style={{ color: st.badInk, background: hexA(st.bad, 0.13) }}><ArrowDown size={9} />{catMeta[c.key].short.slice(0, 3)}</span>)}
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    );
  };

  const [p1, p2, p3] = byRank;
  return (
    <div className="grid gap-3 items-end pt-5" style={{ gridTemplateColumns: "1fr 1.16fr 1fr" }}>
      <style>{`
        .podium-flip-inner { transform-style: preserve-3d; -webkit-transform-style: preserve-3d; transition: transform .62s cubic-bezier(.2,.72,.24,1); }
        .podium-flip-outer:hover .podium-flip-inner,
        .podium-flip.pinned .podium-flip-inner { transform: rotateY(180deg); }
        .podium-flip-outer:focus-visible { box-shadow: 0 0 0 3px var(--brand-ring) !important; }
        .podium-face { backface-visibility: hidden; -webkit-backface-visibility: hidden; }
        .podium-back { transform: rotateY(180deg); }
        @keyframes podiumHalo { 0%,100% { opacity:.5; transform:scale(1); } 50% { opacity:.95; transform:scale(1.08); } }
        .podium-halo { animation: podiumHalo 3.6s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .podium-flip-inner { transition: none; } .podium-halo { animation: none; opacity:.7; } }
      `}</style>
      {cell(p2, 2)}{cell(p1, 1)}{cell(p3, 3)}
    </div>
  );
}

/* ═══════════════════════ page ════════════════════════════════════════ */
function useLeaderboardData(period) {
  const [data, setData] = useState({ sups: [], byRank: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line
    setLoading(true);
    api.get(`/api/leaderboard?period=${period}`).then((res) => {
      if (active) {
        setData(res.data);
        setLoading(false);
      }
    }).catch((err) => {
      console.error("Leaderboard fetch failed", err);
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [period]);

  return { ...data, loading };
}

export default function Leaderboard() {
  const { t } = useLang();
  const { theme } = useTheme();
  const st = STATUS[theme] || STATUS.dark;
  const hues = CAT_HUES[theme] || CAT_HUES.dark;

  const catMeta = useMemo(() => Object.fromEntries(CATS.map((c) => [c.key, {
    hue: hues[c.key], name: t(`leaderboard.cat.${c.key}`), short: t(`leaderboard.cat.${c.key}Short`), icon: c.icon, weight: c.weight,
  }])), [hues, t]);

  const [period, setPeriod] = useState("month");
  const { sups, byRank, loading } = useLeaderboardData(period);

  const [selectedId, setSelectedId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    if (byRank.length > 0 && selectedId === null) {
      // eslint-disable-next-line
      setSelectedId(byRank[0].id);
      setExpandedId(byRank[0].id);
    }
  }, [byRank, selectedId]);
  const [sortKey, setSortKey] = useState("overall");
  const [query, setQuery] = useState("");
  const [tip, setTip] = useState(null);

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

        {/* ── page toolbar (single filter zone) ── */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <SegmentedToggle
            value={period}
            onChange={setPeriod}
            options={[["week", t("leaderboard.period.week")], ["month", t("leaderboard.period.month")], ["quarter", t("leaderboard.period.quarter")]]}
          />
          <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ color: "var(--brand-text)", background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }}>
            {t("leaderboard.demoBadge")}
          </span>
          <div className="flex-1" />
          <Button size="lg" icon={<Download size={14} />} title={t("leaderboard.exportHint")} onClick={() => onDemoExport(setTip)}>
            {t("leaderboard.export")}
          </Button>
        </div>

        {/* ── podium ── */}
        {loading ? <div className="py-20 text-center text-sm" style={{color: "var(--text-3)"}}>Yuklanmoqda...</div> : byRank.length > 0 && <Podium byRank={byRank} selectedId={selectedId} onSelect={selectSup} catMeta={catMeta} st={st} />}

        {/* ── category leaders ── */}
        {loading || sups.length === 0 ? null : <div className="flex flex-col gap-2.5">
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
        </div>}

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
        {loading || sups.length === 0 || selectedId === null ? null : <div className="grid gap-4" style={{ gridTemplateColumns: "minmax(0,1.2fr) minmax(0,1fr)" }}>
          <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <SectionHead icon={TrendingUp} title={t("leaderboard.rankDynamics")} right={<span className="text-xs" style={{ color: "var(--text-4)" }}>{t("leaderboard.rankAxis")}</span>} />
            <div className="flex gap-3.5 flex-wrap px-4 pt-2">
              {byRank.slice(0, 3).map((s) => (
                <span key={s.id} className="inline-flex items-center gap-1.5 text-[11.5px]" style={{ color: "var(--text-2)" }}>
                  <span className="rounded-sm" style={{ width: 14, height: 3, background: s.color }} />{shortName(s.name)}
                </span>
              ))}
              <span className="inline-flex items-center gap-1.5 text-[11.5px]" style={{ color: "var(--text-2)" }}>
                <span className="rounded-sm" style={{ width: 14, height: 3, background: "var(--brand)" }} />{shortName(sups.find((s) => s.id === selectedId).name)} ({t("leaderboard.selected")})
              </span>
            </div>
            <div className="px-4 pb-4 pt-1"><div style={{ overflowX: "auto" }}>
              <BumpChart sups={sups} selectedId={selectedId} onSelect={selectSup} onTip={onTip} />
            </div></div>
          </div>

          <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <SectionHead icon={Activity} title={t("leaderboard.distribution")}
              right={<span className="inline-flex items-center gap-1.5 text-xs"><Avatar sup={sups.find((s) => s.id === selectedId)} size={20} /><span className="font-semibold" style={{ color: "var(--text-2)" }}>{shortName(sups.find((s) => s.id === selectedId).name)}</span></span>} />
            <div className="px-4 py-3">
              <DistributionStrips sups={sups} selectedId={selectedId} onSelect={selectSup} catMeta={catMeta} onTip={onTip} />
            </div>
            <div className="text-[11px] px-4 pb-3" style={{ color: "var(--text-4)" }}>{t("leaderboard.distHint")}</div>
          </div>
        </div>}

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
