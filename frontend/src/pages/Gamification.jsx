import { useMemo, useState, useId } from "react";
import {
  Award, Crown, Medal, Trophy, Flame, Gauge, ClipboardCheck, Lightbulb,
  ShieldCheck, ShieldAlert, CalendarCheck, Sparkles, Gift, ScrollText,
  CalendarClock, Users, TrendingUp, ArrowUp, ListOrdered, Snowflake,
  Megaphone, BadgeCheck, Lock,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import Modal from "../components/ui/Modal";
import Button from "../components/ui/Button";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import TableCard, { SectionHead, Th } from "../components/ui/DataTable";
import { useLang } from "../context/LangContext";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { useTranslit } from "../utils/transliterate";

/* ────────────────────────────────────────────────────────────────────────────
 * Safia Honors — gamification & rewards DESIGN PREVIEW (admin-only, demo data).
 * Implements the visual identity from the Gamification & Rewards Strategy:
 * one coin-medallion geometry (milled gold rim, dark enamel core, engraved
 * glyph), locked badges as darkened silhouettes, XP tier medallions I–IV,
 * streaks, season score explain view, and the reward catalog. All numbers are
 * sample data wired the way the future API will shape them.
 * ──────────────────────────────────────────────────────────────────────────── */

/* ── tiny helpers (Leaderboard conventions) ── */
const hexA = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};
const fmt1 = (n) => (Math.round(n * 10) / 10).toFixed(1).replace(".", ",");
const fmtXp = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const initials = (name) =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

const MEDAL = { 1: "#D4A017", 2: "#9AA4B0", 3: "#C17E45" };

const CAT_HUES = {
  dark:  { zag: "#3b82f6", naz: "#ea580c", kai: "#a855f7", xav: "#ec4899", kir: "#0891b2" },
  light: { zag: "#2563eb", naz: "#c2410c", kai: "#9333ea", xav: "#db2777", kir: "#0891b2" },
};

/* ── medallion artwork ──────────────────────────────────────────────────────
 * The enamel core stays night-palette dark in BOTH themes — the coins are
 * artwork, not chrome (validated against the light background too). */
const METALS = {
  gold:     { hi: "#F6E3A6", mid1: "#E9C476", mid2: "#C8973F", lo: "#8A6226", deep: "#5F421A", gHi: "#F2D48C", gLo: "#C8973F" },
  bronze:   { hi: "#EFB98A", mid1: "#D89158", mid2: "#B5713A", lo: "#7A431C", deep: "#542E12", gHi: "#EFB98A", gLo: "#C07E44" },
  silver:   { hi: "#F5F8FB", mid1: "#D4DBE3", mid2: "#AEB8C4", lo: "#77828F", deep: "#525C68", gHi: "#EDF1F6", gLo: "#AEB8C4" },
  platinum: { hi: "#F0FAFC", mid1: "#C8DDE4", mid2: "#9BB8C2", lo: "#5E7A85", deep: "#3E545E", gHi: "#E4F4F8", gLo: "#9BB8C2" },
  locked:   { hi: "#3A4353", mid1: "#2E3644", mid2: "#242B37", lo: "#161B24", deep: "#10141b", gHi: "#39424f", gLo: "#39424f" },
};

/* Engraved glyphs = lucide path data (24×24 stroke icons), scaled onto the coin. */
const GLYPHS = {
  perfectWeek: ["M8 2v4", "M16 2v4", "RECT:3,4,18,18,2", "M3 10h18", "m9 16 2 2 4-4"],
  ironDiscipline: ["CIRCLE:12,13,8", "M5 3 2 6", "m22 6-3-3", "M6.38 18.7 4 21", "M17.64 18.67 20 21", "m9 13 2 2 4-4"],
  qualityShield: ["M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z", "m9 12 2 2 4-4"],
  fastResolver: ["M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"],
  selfSufficient: ["M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z"],
  kaizenChampion: ["M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5", "M9 18h6", "M10 22h4"],
  earlyBird: ["M12 2v8", "m4.93 10.93 1.41 1.41", "M2 18h2", "M20 18h2", "m19.07 10.93-1.41 1.41", "M22 22H2", "m8 6 4-4 4 4", "M16 18a4 4 0 0 0-8 0"],
  champion: ["M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z", "M5 21h14"],
  derbyCup: ["M10 14.66v1.626a2 2 0 0 1-.976 1.696A5 5 0 0 0 7 21.978", "M14 14.66v1.626a2 2 0 0 0 .976 1.696A5 5 0 0 1 17 21.978", "M18 9h1.5a1 1 0 0 0 0-5H18", "M4 22h16", "M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z", "M6 9H4.5a1 1 0 0 1 0-5H6"],
};

/* 72 milling teeth around the rim, precomputed once. */
const TICKS = Array.from({ length: 72 }, (_, i) => {
  const a = (i / 72) * Math.PI * 2;
  return {
    x1: (60 + Math.cos(a) * 55.5).toFixed(2), y1: (60 + Math.sin(a) * 55.5).toFixed(2),
    x2: (60 + Math.cos(a) * 58.5).toFixed(2), y2: (60 + Math.sin(a) * 58.5).toFixed(2),
  };
});

function GlyphPaths({ glyph }) {
  return (GLYPHS[glyph] || []).map((d, i) => {
    if (d.startsWith("RECT:")) {
      const [x, y, w, h, rx] = d.slice(5).split(",");
      return <rect key={i} x={x} y={y} width={w} height={h} rx={rx} fill="none" />;
    }
    if (d.startsWith("CIRCLE:")) {
      const [cx, cy, r] = d.slice(7).split(",");
      return <circle key={i} cx={cx} cy={cy} r={r} fill="none" />;
    }
    return <path key={i} d={d} fill="none" />;
  });
}

/* The coin. `glyph` for badges, `numeral` for XP tiers; `locked` renders the
 * darkened-silhouette variant; `progress` (0..1) adds the outer gold ring;
 * `counter` adds the repeat-count chip (Champion ×N). */
function Medallion({ size = 112, glyph = null, numeral = null, metal = "gold", locked = false, progress = null, counter = null }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const m = METALS[locked ? "locked" : metal];
  const circ = 2 * Math.PI * 66;
  return (
    <svg width={size} height={size} viewBox="-14 -14 148 148" style={{ overflow: "visible", display: "block" }} aria-hidden>
      <defs>
        <linearGradient id={`${id}r`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={m.hi} /><stop offset="0.35" stopColor={m.mid1} />
          <stop offset="0.62" stopColor={m.mid2} /><stop offset="1" stopColor={m.lo} />
        </linearGradient>
        <linearGradient id={`${id}v`} x1="1" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor={m.hi} /><stop offset="0.5" stopColor={m.mid2} /><stop offset="1" stopColor={m.lo} />
        </linearGradient>
        <radialGradient id={`${id}c`} cx="0.38" cy="0.32" r="0.95">
          <stop offset="0" stopColor={locked ? "#1a2029" : "#2b3344"} />
          <stop offset="0.55" stopColor={locked ? "#12161f" : "#1c2331"} />
          <stop offset="1" stopColor={locked ? "#0d1118" : "#131826"} />
        </radialGradient>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={m.gHi} /><stop offset="1" stopColor={m.gLo} />
        </linearGradient>
        <filter id={`${id}d`} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#000" floodOpacity={locked ? 0.32 : 0.45} />
        </filter>
      </defs>
      {progress != null && !locked && (
        <>
          <circle cx="60" cy="60" r="66" fill="none" stroke="rgba(148,163,184,0.22)" strokeWidth="4.5" />
          <circle cx="60" cy="60" r="66" fill="none" stroke={`url(#${id}r)`} strokeWidth="4.5" strokeLinecap="round"
            strokeDasharray={`${(circ * Math.min(1, progress)).toFixed(1)} ${circ.toFixed(1)}`} transform="rotate(-90 60 60)" />
        </>
      )}
      <g filter={`url(#${id}d)`}>
        <circle cx="60" cy="60" r="58" fill={`url(#${id}r)`} />
        <g stroke={m.deep} strokeWidth="1.1" opacity="0.55">
          {TICKS.map((t, i) => <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} />)}
        </g>
        <circle cx="60" cy="60" r="54.5" fill="none" stroke={m.hi} strokeWidth="0.8" opacity="0.7" />
        <circle cx="60" cy="60" r="46.5" fill={`url(#${id}v)`} />
        <circle cx="60" cy="60" r="44" fill={`url(#${id}c)`} />
        <circle cx="60" cy="60" r="43.2" fill="none" stroke={m.deep} strokeWidth="1.2" opacity="0.8" />
        <circle cx="60" cy="60" r="41.4" fill="none" stroke={`url(#${id}r)`} strokeWidth="0.9" opacity={locked ? 0.5 : 0.9} />
        {glyph && (locked ? (
          <g transform="translate(33, 33) scale(2.25)" stroke={m.gHi} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.85">
            <GlyphPaths glyph={glyph} />
          </g>
        ) : (
          <>
            <g transform="translate(33.7, 33.9) scale(2.25)" stroke="#000" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.45">
              <GlyphPaths glyph={glyph} />
            </g>
            <g transform="translate(33, 33) scale(2.25)" stroke={`url(#${id}g)`} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <GlyphPaths glyph={glyph} />
            </g>
          </>
        ))}
        {numeral && (
          <>
            <text x="61" y="63.5" textAnchor="middle" dominantBaseline="central" fontFamily="Georgia, 'Times New Roman', serif"
              fontWeight="700" fontSize="44" fill="#000" opacity={locked ? 0.35 : 0.5}>{numeral}</text>
            <text x="60" y="62.2" textAnchor="middle" dominantBaseline="central" fontFamily="Georgia, 'Times New Roman', serif"
              fontWeight="700" fontSize="44" fill={locked ? m.gHi : `url(#${id}g)`}>{numeral}</text>
          </>
        )}
        <path d="M 22 34 A 46 46 0 0 1 86 18 A 56 56 0 0 0 24 42 Z" fill="#fff" opacity={locked ? 0.04 : 0.09} />
      </g>
      {counter != null && !locked && (
        <g>
          <circle cx="97" cy="97" r="15" fill={`url(#${id}r)`} stroke={m.deep} strokeWidth="1.5" />
          <circle cx="97" cy="97" r="11.5" fill={m.deep} />
          <text x="97" y="98" textAnchor="middle" dominantBaseline="central" fontFamily="Georgia, serif" fontWeight="700" fontSize="14" fill={m.hi}>{counter}</text>
        </g>
      )}
    </svg>
  );
}

/* ── demo data (shaped like the future API) ── */
const BADGE_DEFS = [
  { key: "perfectWeek",    xp: 150, state: "earned",   date: "14.07.2026" },
  { key: "ironDiscipline", xp: 300, state: "progress", cur: 21, goal: 30 },
  { key: "qualityShield",  xp: 250, state: "locked" },
  { key: "fastResolver",   xp: 150, state: "earned",   date: "22.07.2026" },
  { key: "selfSufficient", xp: 200, state: "earned",   date: "28.07.2026" },
  { key: "kaizenChampion", xp: 250, state: "progress", cur: 2, goal: 3 },
  { key: "earlyBird",      xp: 200, state: "earned",   date: "09.07.2026" },
  { key: "champion",       xp: 500, state: "earned",   date: "01.07.2026", count: 2 },
  { key: "derbyCup",       xp: 100, state: "locked",   team: true },
];

const TIERS = [
  { key: "bronze",   metal: "bronze",   numeral: "I",   from: 0 },
  { key: "silver",   metal: "silver",   numeral: "II",  from: 2000 },
  { key: "gold",     metal: "gold",     numeral: "III", from: 5000 },
  { key: "platinum", metal: "platinum", numeral: "IV",  from: 10000 },
];

const ME = { xp: 6240, tier: 2, score: 78.25, rank: 2, delta: 2.1, unit: "4-uchastka" };

const STREAKS = [
  { key: "dayClose",     icon: CalendarCheck, days: 21, next: 30, best: 21 },
  { key: "onTrack",      icon: Gauge,         days: 12, next: 14, best: 18 },
  { key: "zeroDowntime", icon: Flame,         days: 4,  next: 5,  best: 11 },
];

const CATS = [
  { key: "zag", icon: Gauge,          weight: 0.30, val: 82 },
  { key: "kir", icon: ClipboardCheck, weight: 0.25, val: 88 },
  { key: "naz", icon: BadgeCheck,     weight: 0.15, val: 71 },
  { key: "kai", icon: Lightbulb,      weight: 0.15, val: 65 },
  { key: "xav", icon: ShieldAlert,    weight: 0.15, val: 75 },
];

const LEDGER = [
  { icon: CalendarCheck, reason: "gami.xp.dayConfirmed", xp: 10,  when: "01.08 09:12" },
  { icon: Gauge,         reason: "gami.xp.onTrack",      xp: 10,  when: "01.08 09:12" },
  { icon: ShieldAlert,   reason: "gami.xp.concernClosed", xp: 25, when: "31.07 16:40" },
  { icon: Lightbulb,     reason: "gami.xp.kaizenDone",   xp: 25,  when: "30.07 11:05" },
  { icon: Flame,         reason: "gami.xp.streak14",     xp: 100, when: "29.07 09:00" },
  { icon: Award,         reason: "gami.xp.badgeEarned",  badge: "selfSufficient", xp: 200, when: "28.07 18:22" },
  { icon: CalendarCheck, reason: "gami.xp.dayConfirmed", xp: 10,  when: "28.07 08:47" },
  { icon: Gauge,         reason: "gami.xp.onTrack",      xp: 10,  when: "27.07 09:03" },
];

const RIVALS = [
  { name: "Malika Qodirova", unit: "2-uchastka", score: 79.7, delta: 0.8, color: "#2563eb" },
  { name: "Dilshod Karimov", unit: "5-uchastka", score: 76.9, delta: 1.2, color: "#22c55e" },
];

const REWARDS = [
  { key: "crown",  icon: Crown,         note: "rwChampion" },
  { key: "cert",   icon: ScrollText,    note: "rwAuto" },
  { key: "dayOff", icon: CalendarClock, note: "rwSignoff" },
  { key: "dinner", icon: Users,         note: "rwTeam" },
];

const CEREMONY = [
  { key: "freeze",   icon: Snowflake },
  { key: "badges",   icon: Award },
  { key: "cert",     icon: ScrollText },
  { key: "announce", icon: Megaphone },
];

/* ── shared atoms ── */
function MicroLabel({ children, style }) {
  return (
    <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-4)", ...style }}>
      {children}
    </div>
  );
}

function GoldPill({ children, title }) {
  return (
    <span title={title} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-semibold whitespace-nowrap"
      style={{ color: "var(--brand-text)", background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }}>
      {children}
    </span>
  );
}

function Avatar({ name, size = 44, color = "#C8973F", ringPct = null }) {
  const R = size / 2 + 5;
  const circ = 2 * Math.PI * (R - 2.5);
  return (
    <span className="relative inline-flex flex-shrink-0" style={{ width: size + 10, height: size + 10 }}>
      {ringPct != null && (
        <svg className="absolute inset-0" width={size + 10} height={size + 10} aria-hidden>
          <circle cx={R} cy={R} r={R - 2.5} fill="none" stroke="var(--bg-inner)" strokeWidth="3.5" />
          <circle cx={R} cy={R} r={R - 2.5} fill="none" stroke="var(--brand)" strokeWidth="3.5" strokeLinecap="round"
            strokeDasharray={`${circ * ringPct} ${circ}`} transform={`rotate(-90 ${R} ${R})`} />
        </svg>
      )}
      <span className="absolute inline-flex items-center justify-center rounded-full font-bold overflow-hidden"
        style={{ inset: 5, fontSize: Math.round(size * 0.34), background: hexA(color, 0.16), color, border: `1.5px solid ${hexA(color, 0.35)}` }}>
        {initials(name)}
      </span>
    </span>
  );
}

function Card({ children, className = "", style }) {
  return (
    <div className={`rounded-2xl ${className}`} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", ...style }}>
      {children}
    </div>
  );
}

/* ── page ── */
export default function Gamification() {
  const { t } = useLang();
  const { theme } = useTheme();
  const { auth } = useAuth();
  const { tl } = useTranslit();
  const hues = CAT_HUES[theme === "light" ? "light" : "dark"];

  const [view, setView] = useState("badges");
  const [detail, setDetail] = useState(null);

  const myName = (auth?.full_name || "Safia Admin").trim();
  const earned = BADGE_DEFS.filter((b) => b.state === "earned");
  const nextTier = TIERS[ME.tier + 1];
  const curTier = TIERS[ME.tier];
  const tierPct = nextTier ? (ME.xp - curTier.from) / (nextTier.from - curTier.from) : 1;
  const daysLeft = Math.max(0, Math.ceil((new Date(2026, 8, 1) - Date.now()) / 86400000));
  const gapToFirst = RIVALS[0].score - ME.score;

  const badgeName = (k) => t(`gami.badge.${k}`);
  const badgeDesc = (k) => t(`gami.badge.${k}Desc`);

  /* podium in season view: #1 rival, #2 me, #3 rival */
  const podium = [
    { place: 1, name: RIVALS[0].name, unit: RIVALS[0].unit, score: RIVALS[0].score, delta: RIVALS[0].delta, color: RIVALS[0].color, me: false },
    { place: 2, name: myName, unit: ME.unit, score: ME.score, delta: ME.delta, color: "#C8973F", me: true },
    { place: 3, name: RIVALS[1].name, unit: RIVALS[1].unit, score: RIVALS[1].score, delta: RIVALS[1].delta, color: RIVALS[1].color, me: false },
  ];

  const detailDef = detail ? BADGE_DEFS.find((b) => b.key === detail) : null;

  return (
    <Layout title={t("gami.title")}>
      <style>{`
        @keyframes gamiHalo { 0%,100% { opacity:.4; transform:scale(1); } 50% { opacity:.85; transform:scale(1.06); } }
        @keyframes gamiFlicker { 0%,100% { transform:scale(1); } 40% { transform:scale(1.12) rotate(-3deg); } 70% { transform:scale(.96) rotate(2deg); } }
        @keyframes gamiShimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        @keyframes gamiPulse { 0%,100% { opacity:1; } 50% { opacity:.35; } }
        .gami-halo { animation: gamiHalo 3.6s ease-in-out infinite; }
        .gami-flame { animation: gamiFlicker 1.9s ease-in-out infinite; transform-origin: 50% 80%; }
        .gami-live { animation: gamiPulse 2s ease-in-out infinite; }
        .gami-shimmer { background-size: 200% 100%; animation: gamiShimmer 2.8s linear infinite; }
        .gami-badge { transition: transform .22s ease, filter .22s ease; }
        .gami-badge:hover { transform: translateY(-4px) scale(1.02); filter: drop-shadow(0 12px 24px rgba(200,151,63,.25)); }
        .gami-badge.is-locked:hover { filter: none; }
        @media (prefers-reduced-motion: reduce) {
          .gami-halo, .gami-flame, .gami-live, .gami-shimmer { animation: none; }
          .gami-badge:hover { transform: none; filter: none; }
        }
      `}</style>

      <div className="flex flex-col gap-4 max-w-[1200px] mx-auto">

        {/* ── hero header ── */}
        <Card className="relative overflow-hidden">
          <span aria-hidden className="absolute inset-0 pointer-events-none"
            style={{ background: `radial-gradient(120% 130% at 18% -30%, ${hexA("#C8973F", 0.28)} 0%, ${hexA("#C8973F", 0.08)} 45%, transparent 75%)` }} />
          <span aria-hidden className="absolute top-0 h-px pointer-events-none" style={{ left: 24, right: 24, background: `linear-gradient(90deg, transparent, ${hexA("#C8973F", 0.9)}, transparent)` }} />
          <div className="relative flex flex-wrap items-center gap-3 p-4 md:p-5">
            <span className="relative inline-flex flex-shrink-0">
              <span aria-hidden className="gami-halo absolute inset-[-10px] rounded-full pointer-events-none"
                style={{ background: `radial-gradient(circle, ${hexA("#C8973F", 0.5)} 0%, transparent 65%)` }} />
              <Medallion size={64} glyph="champion" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg sm:text-xl font-bold leading-tight" style={{ letterSpacing: "0.02em" }}>{t("gami.title")}</h2>
                <GoldPill>{t("gami.demoBadge")}</GoldPill>
              </div>
              <div className="text-[12px] mt-0.5" style={{ color: "var(--text-3)" }}>{t("gami.subtitle")}</div>
              <div className="text-[11px] mt-0.5" style={{ color: "var(--text-4)" }}>{t("gami.demoNote")}</div>
            </div>
          </div>
        </Card>

        <div className="overflow-x-auto no-scrollbar">
          <SegmentedToggle value={view} onChange={setView} className="min-w-[420px] sm:max-w-[620px]" fill
            options={[["badges", t("gami.viewBadges")], ["progress", t("gami.viewProgress")], ["season", t("gami.viewSeason")], ["rewards", t("gami.viewRewards")]]} />
        </div>

        {/* ════════ BADGES ════════ */}
        {view === "badges" && (
          <Card>
            <SectionHead icon={Award} title={t("gami.collection")}
              right={
                <span className="flex items-center gap-2">
                  <GoldPill>{earned.length}/{BADGE_DEFS.length} {t("gami.earned")}</GoldPill>
                  <span className="text-[11px] tabular-nums hidden sm:inline" style={{ color: "var(--text-4)" }}>{fmtXp(ME.xp)} XP</span>
                </span>
              } />
            <div className="px-4 pt-3 pb-1 text-[12px]" style={{ color: "var(--text-3)" }}>{t("gami.collectionSub")}</div>
            <div className="grid gap-3 p-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
              {BADGE_DEFS.map((b) => {
                const locked = b.state === "locked";
                const prog = b.state === "progress" ? b.cur / b.goal : null;
                return (
                  <button key={b.key} onClick={() => setDetail(b.key)}
                    className={`gami-badge ${locked ? "is-locked" : ""} flex flex-col items-center gap-1.5 rounded-2xl p-3 text-center`}
                    style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
                    <Medallion size={104} glyph={b.key} locked={locked} progress={prog} counter={b.count ?? null} />
                    <div className="text-[12.5px] font-bold leading-tight mt-1" style={{ color: locked ? "var(--text-4)" : "var(--text-1)" }}>
                      {badgeName(b.key)}
                    </div>
                    <div className="text-[10.5px] leading-snug" style={{ color: "var(--text-4)" }}>{badgeDesc(b.key)}</div>
                    {b.state === "earned" && (
                      <GoldPill>+{b.xp} XP · {b.date}</GoldPill>
                    )}
                    {b.state === "progress" && (
                      <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-semibold tabular-nums"
                        style={{ color: "var(--text-2)", background: "var(--bg-card)", border: "1px solid var(--border-md)" }}>
                        {b.cur} / {b.goal}
                      </span>
                    )}
                    {locked && (
                      <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-semibold"
                        style={{ color: "var(--text-4)", background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                        <Lock size={10} /> {t("gami.locked")}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </Card>
        )}

        {/* ════════ MY PROGRESS ════════ */}
        {view === "progress" && (
          <>
            <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
              {/* hero profile */}
              <Card className="relative overflow-hidden">
                <span aria-hidden className="absolute inset-0 pointer-events-none"
                  style={{ background: `radial-gradient(130% 110% at 85% -25%, ${hexA("#C8973F", 0.22)} 0%, transparent 60%)` }} />
                <div className="relative p-4 md:p-5 flex flex-col gap-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    <Avatar name={myName} size={64} ringPct={tierPct} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[16px] font-bold truncate">{tl(myName)}</span>
                        <span title={t("gami.reward.crown")} className="inline-flex"><Crown size={15} style={{ color: "var(--brand-text)" }} /></span>
                      </div>
                      <div className="text-[11.5px]" style={{ color: "var(--text-3)" }}>{t("role.supervisor")} · {ME.unit}</div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <GoldPill>{t(`gami.tier.${curTier.key}`)} · {curTier.numeral}</GoldPill>
                        <span className="text-[11px] tabular-nums" style={{ color: "var(--text-4)" }}>{fmtXp(ME.xp)} XP</span>
                      </div>
                    </div>
                    <Medallion size={72} numeral={curTier.numeral} metal={curTier.metal} />
                  </div>
                  <div>
                    <div className="flex items-baseline justify-between mb-1.5">
                      <MicroLabel>{t("gami.lifetimeXp")}</MicroLabel>
                      <span className="text-[11px] tabular-nums" style={{ color: "var(--text-3)" }}>
                        {nextTier ? t("gami.xpToNext").replace("{n}", fmtXp(nextTier.from - ME.xp)).replace("{tier}", t(`gami.tier.${nextTier.key}`)) : ""}
                      </span>
                    </div>
                    <div className="relative h-2.5 rounded-full overflow-hidden" style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
                      <span className="absolute inset-y-0 left-0 rounded-full gami-shimmer"
                        style={{ width: `${Math.round(tierPct * 100)}%`, background: `linear-gradient(90deg, #8A6226, #C8973F 40%, #F2D48C 50%, #C8973F 60%, #8A6226)` }} />
                    </div>
                    <div className="flex justify-between mt-1 text-[10.5px] tabular-nums" style={{ color: "var(--text-4)" }}>
                      <span>{fmtXp(curTier.from)}</span><span>{nextTier ? fmtXp(nextTier.from) : "∞"}</span>
                    </div>
                  </div>
                </div>
              </Card>

              {/* tier ladder */}
              <Card className="p-4">
                <MicroLabel style={{ marginBottom: 10 }}>{t("gami.profileTier")}</MicroLabel>
                <div className="grid grid-cols-4 gap-2">
                  {TIERS.map((tier, i) => {
                    const reached = ME.xp >= tier.from;
                    const current = i === ME.tier;
                    return (
                      <div key={tier.key} className="flex flex-col items-center gap-1 rounded-xl py-2.5 px-1"
                        style={current ? { background: "var(--brand-bg)", border: "1px solid var(--brand-border)" } : { border: "1px solid transparent" }}>
                        <Medallion size={52} numeral={tier.numeral} metal={tier.metal} locked={!reached} />
                        <div className="text-[10.5px] font-bold" style={{ color: reached ? "var(--text-1)" : "var(--text-4)" }}>{t(`gami.tier.${tier.key}`)}</div>
                        <div className="text-[9.5px] tabular-nums" style={{ color: "var(--text-4)" }}>{t("gami.fromXp").replace("{n}", fmtXp(tier.from))}</div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>

            {/* streaks */}
            <div className="grid gap-3 sm:grid-cols-3">
              {STREAKS.map((s) => {
                const Icon = s.icon;
                const pct = Math.min(1, s.days / s.next);
                return (
                  <Card key={s.key} className="p-3.5 flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center justify-center rounded-lg flex-shrink-0" style={{ width: 28, height: 28, background: hexA("#f97316", 0.14), color: "#f97316" }}>
                        <Icon size={15} />
                      </span>
                      <span className="text-[11px] font-bold uppercase leading-tight" style={{ letterSpacing: "0.05em", color: "var(--text-3)" }}>
                        {t(`gami.streak.${s.key}`)}
                      </span>
                    </div>
                    <div className="flex items-end gap-1.5">
                      <span className="gami-flame inline-flex"><Flame size={20} style={{ color: "#f97316" }} /></span>
                      <span className="tabular-nums" style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1 }}>{s.days}</span>
                      <span className="text-[11px] mb-0.5" style={{ color: "var(--text-3)" }}>{t("gami.days")}</span>
                      <span className="ml-auto text-[10.5px] tabular-nums" style={{ color: "var(--text-4)" }}>{t("gami.record")}: {s.best}</span>
                    </div>
                    <div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-inner)" }}>
                        <div className="h-full rounded-full" style={{ width: `${pct * 100}%`, background: "#f97316" }} />
                      </div>
                      <div className="flex justify-between mt-1 text-[10px] tabular-nums" style={{ color: "var(--text-4)" }}>
                        <span>{t("gami.nextMilestone")}</span><span>{s.days}/{s.next} · +{s.next >= 30 ? 200 : s.next >= 14 ? 100 : 50} XP</span>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>

            {/* score explain */}
            <Card>
              <SectionHead icon={TrendingUp} title={t("gami.scoreExplain")}
                right={<GoldPill>{t("gami.seasonName")}</GoldPill>} />
              <div className="p-4 grid gap-5 md:grid-cols-[auto_1fr] items-center">
                <div className="flex flex-col items-center gap-2 justify-self-center">
                  <span className="relative inline-flex">
                    <svg width="120" height="120" viewBox="0 0 120 120">
                      <circle cx="60" cy="60" r="50" fill="none" stroke="var(--bg-inner)" strokeWidth="9" />
                      <circle cx="60" cy="60" r="50" fill="none" stroke="var(--brand)" strokeWidth="9" strokeLinecap="round"
                        strokeDasharray={`${(2 * Math.PI * 50 * ME.score) / 100} ${2 * Math.PI * 50}`} transform="rotate(-90 60 60)" />
                      <text x="60" y="56" textAnchor="middle" fontSize="27" fontWeight="800" fill="var(--text-1)" style={{ letterSpacing: "-0.02em" }}>{fmt1(ME.score)}</text>
                      <text x="60" y="74" textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--text-4)" style={{ textTransform: "uppercase", letterSpacing: "0.08em" }}>{t("gami.points")}</text>
                    </svg>
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex items-center justify-center rounded-full tabular-nums" style={{ width: 24, height: 24, fontSize: 12, fontWeight: 800, background: MEDAL[2], color: "#fff" }}>2</span>
                    <span className="text-[12px] font-semibold">{t("gami.myRank")}</span>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-semibold tabular-nums"
                    style={{ color: "var(--kpi-amber)", background: hexA("#eab308", 0.12), border: `1px solid ${hexA("#eab308", 0.25)}` }}>
                    <ArrowUp size={11} /> {t("gami.gapToFirst").replace("{n}", fmt1(gapToFirst))}
                  </span>
                </div>
                <div className="flex flex-col gap-2.5 min-w-0">
                  {CATS.map((c) => {
                    const Icon = c.icon;
                    const hue = hues[c.key];
                    const contrib = c.weight * c.val;
                    return (
                      <div key={c.key} className="grid items-center gap-2" style={{ gridTemplateColumns: "minmax(120px, 190px) 1fr auto" }}>
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="inline-flex items-center justify-center rounded-md flex-shrink-0" style={{ width: 22, height: 22, background: hexA(hue, 0.14), color: hue }}>
                            <Icon size={12} />
                          </span>
                          <span className="text-[11.5px] font-semibold truncate">{t(`leaderboard.cat.${c.key}`)}</span>
                          <span className="text-[9.5px] tabular-nums flex-shrink-0" style={{ color: "var(--text-4)" }}>{Math.round(c.weight * 100)}%</span>
                        </div>
                        <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--bg-inner)" }}>
                          <div className="h-full rounded-full" style={{ width: `${c.val}%`, background: hue }} />
                        </div>
                        <div className="text-right tabular-nums">
                          <span className="text-[12.5px] font-bold">{c.val}</span>
                          <span className="text-[10px] ml-1" style={{ color: "var(--text-4)" }}>→ {fmt1(contrib)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>

            {/* XP ledger */}
            <Card>
              <SectionHead icon={Sparkles} title={t("gami.xpLedger")}
                right={<span className="text-[11px]" style={{ color: "var(--text-4)" }}>{t("gami.ledgerSub")}</span>} />
              <div className="p-2">
                {LEDGER.map((e, i) => {
                  const Icon = e.icon;
                  return (
                    <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-xl" style={i % 2 ? {} : { background: "var(--bg-inner)" }}>
                      <span className="inline-flex items-center justify-center rounded-lg flex-shrink-0" style={{ width: 28, height: 28, background: "var(--brand-bg)", color: "var(--brand-text)" }}>
                        <Icon size={14} />
                      </span>
                      <span className="text-[12.5px] flex-1 min-w-0 truncate">
                        {t(e.reason).replace("{b}", e.badge ? badgeName(e.badge) : "")}
                      </span>
                      <span className="text-[10.5px] tabular-nums flex-shrink-0" style={{ color: "var(--text-4)" }}>{e.when}</span>
                      <span className="text-[12px] font-bold tabular-nums flex-shrink-0" style={{ color: "var(--brand-text)" }}>+{e.xp} XP</span>
                    </div>
                  );
                })}
              </div>
            </Card>
          </>
        )}

        {/* ════════ SEASON ════════ */}
        {view === "season" && (
          <>
            <Card className="relative overflow-hidden">
              <span aria-hidden className="absolute inset-0 pointer-events-none"
                style={{ background: `radial-gradient(120% 140% at 82% -35%, ${hexA("#C8973F", 0.25)} 0%, transparent 65%)` }} />
              <div className="relative p-4 md:p-5 flex flex-wrap items-center gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="gami-live inline-flex rounded-full" style={{ width: 8, height: 8, background: "#22c55e" }} />
                    <span className="text-[15px] font-bold">{t("gami.seasonName")}</span>
                    <GoldPill>{t("gami.quarterChip")}</GoldPill>
                  </div>
                  <div className="text-[11.5px] mt-1" style={{ color: "var(--text-3)" }}>{t("gami.freezeNote")}</div>
                </div>
                <div className="text-center">
                  <div className="tabular-nums" style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1, color: "var(--brand-text)" }}>{daysLeft}</div>
                  <MicroLabel>{t("gami.daysLeftLbl")}</MicroLabel>
                </div>
              </div>
            </Card>

            {/* podium */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Trophy size={14} style={{ color: "var(--brand-text)" }} />
                <span className="text-xs font-semibold tracking-wider uppercase" style={{ color: "var(--text-3)" }}>{t("gami.podium")}</span>
              </div>
              <div className="grid gap-3 items-end pt-3" style={{ gridTemplateColumns: "1fr 1.16fr 1fr" }}>
                {[podium.find((p) => p.place === 2), podium.find((p) => p.place === 1), podium.find((p) => p.place === 3)].map((p) => {
                  const first = p.place === 1;
                  const medal = MEDAL[p.place];
                  const lift = first ? 14 : p.place === 2 ? 4 : 0;
                  const glow = first
                    ? `0 24px 56px -16px ${hexA(medal, 0.6)}, 0 6px 16px -8px ${hexA(medal, 0.42)}`
                    : `0 16px 40px -18px ${hexA(medal, 0.5)}`;
                  return (
                    <div key={p.place} className="relative flex flex-col rounded-2xl text-center overflow-hidden"
                      style={{ background: "var(--bg-card)", border: `1px solid ${hexA(medal, first ? 0.6 : 0.45)}`, boxShadow: glow, transform: `translateY(-${lift}px)` }}>
                      <span aria-hidden className="absolute inset-0 pointer-events-none"
                        style={{ background: `radial-gradient(135% 95% at 50% -22%, ${hexA(medal, first ? 0.45 : 0.35)} 0%, ${hexA(medal, 0.12)} 40%, transparent 72%)` }} />
                      <span aria-hidden className="absolute top-0 h-px pointer-events-none" style={{ left: 20, right: 20, background: `linear-gradient(90deg, transparent, ${hexA(medal, 0.95)}, transparent)` }} />
                      <span aria-hidden className="absolute pointer-events-none select-none tabular-nums font-black leading-none"
                        style={{ right: 4, bottom: -18, fontSize: first ? 110 : 88, color: hexA(medal, 0.11) }}>{p.place}</span>
                      {first && <span aria-hidden className="gami-halo absolute pointer-events-none rounded-full" style={{ inset: "-22% 14% auto 14%", height: "68%", background: `radial-gradient(circle at 50% 40%, ${hexA(medal, 0.5)} 0%, transparent 62%)` }} />}
                      <div className="relative flex flex-col items-center gap-1.5" style={{ padding: first ? "24px 12px 18px" : "18px 12px 14px" }}>
                        <span className="absolute flex items-center justify-center rounded-full tabular-nums" style={{ top: 0, left: 0, width: 24, height: 24, fontSize: 11.5, fontWeight: 800, background: medal, color: "#fff", boxShadow: `0 3px 10px -2px ${hexA(medal, 0.7)}` }}>{p.place}</span>
                        <span className="absolute flex items-center justify-center rounded-lg" style={{ top: 0, right: 0, width: 26, height: 26, color: "#fff", background: medal, boxShadow: `0 3px 12px -2px ${hexA(medal, 0.75)}` }}>{first ? <Crown size={14} /> : <Medal size={14} />}</span>
                        <Avatar name={p.name} size={first ? 52 : 42} color={p.color} />
                        <div className="flex items-center gap-1.5 max-w-full">
                          <span className="font-bold truncate" style={{ fontSize: first ? 15 : 13.5 }}>{tl(p.name)}</span>
                          {p.me && <GoldPill>{t("gami.me")}</GoldPill>}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-3)" }}>{p.unit}</div>
                        <div className="tabular-nums" style={{ fontSize: first ? 26 : 22, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.1 }}>{fmt1(p.score)}</div>
                        <span className="inline-flex items-center gap-1 text-[10.5px] px-1.5 py-0.5 rounded-full font-semibold tabular-nums"
                          style={{ color: theme === "light" ? "#15803d" : "#4ade80", background: hexA("#22c55e", 0.12) }}>
                          <ArrowUp size={10} /> +{fmt1(p.delta)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* my position strip */}
            <Card className="p-3.5 flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center justify-center rounded-full tabular-nums flex-shrink-0" style={{ width: 30, height: 30, fontSize: 13, fontWeight: 800, background: MEDAL[2], color: "#fff" }}>2</span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-bold truncate">{tl(myName)} — {t("gami.myRank")}</div>
                <div className="text-[11px]" style={{ color: "var(--text-3)" }}>{t("gami.gapToFirst").replace("{n}", fmt1(gapToFirst))} · {t("gami.standingsNote")}</div>
              </div>
              <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-semibold tabular-nums"
                style={{ color: theme === "light" ? "#15803d" : "#4ade80", background: hexA("#22c55e", 0.12), border: `1px solid ${hexA("#22c55e", 0.25)}` }}>
                <TrendingUp size={11} /> +{fmt1(ME.delta)} {t("gami.points")}
              </span>
            </Card>

            {/* ceremony timeline */}
            <Card>
              <SectionHead icon={ListOrdered} title={t("gami.ceremony")} right={<span className="text-[11px]" style={{ color: "var(--text-4)" }}>01.09 · 09:00</span>} />
              <div className="p-4 grid gap-3 sm:grid-cols-4">
                {CEREMONY.map((s, i) => {
                  const Icon = s.icon;
                  return (
                    <div key={s.key} className="relative flex sm:flex-col items-center sm:items-center gap-3 sm:gap-2 sm:text-center">
                      {i < CEREMONY.length - 1 && (
                        <span aria-hidden className="hidden sm:block absolute top-[19px] left-[calc(50%+26px)] right-[calc(-50%+26px)] h-px" style={{ background: "var(--brand-border)" }} />
                      )}
                      <span className="relative inline-flex items-center justify-center rounded-full flex-shrink-0"
                        style={{ width: 38, height: 38, background: "var(--brand-bg)", color: "var(--brand-text)", border: "1px solid var(--brand-border)" }}>
                        <Icon size={17} />
                        <span className="absolute -top-1 -left-1 inline-flex items-center justify-center rounded-full tabular-nums" style={{ width: 15, height: 15, fontSize: 9, fontWeight: 800, background: "var(--brand)", color: "#fff" }}>{i + 1}</span>
                      </span>
                      <span className="text-[11.5px] font-semibold leading-snug">{t(`gami.cer.${s.key}`)}</span>
                    </div>
                  );
                })}
              </div>
            </Card>
          </>
        )}

        {/* ════════ REWARDS ════════ */}
        {view === "rewards" && (
          <>
            <Card>
              <SectionHead icon={Gift} title={t("gami.catalog")} right={<span className="text-[11px] hidden sm:inline" style={{ color: "var(--text-4)" }}>{t("gami.catalogSub")}</span>} />
              <div className="grid gap-3 p-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
                {REWARDS.map((r) => {
                  const Icon = r.icon;
                  return (
                    <div key={r.key} className="relative overflow-hidden flex flex-col gap-2.5 rounded-2xl p-3.5" style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
                      <span aria-hidden className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(120px 120px at calc(100% - 4px) -6px, ${hexA("#C8973F", 0.16)}, transparent 70%)` }} />
                      <span className="relative inline-flex items-center justify-center rounded-xl" style={{ width: 40, height: 40, background: "var(--brand-bg)", color: "var(--brand-text)", border: "1px solid var(--brand-border)" }}>
                        <Icon size={19} />
                      </span>
                      <div className="relative">
                        <div className="text-[13px] font-bold leading-tight">{t(`gami.reward.${r.key}`)}</div>
                        <div className="text-[11px] mt-1 leading-snug" style={{ color: "var(--text-3)" }}>{t(`gami.reward.${r.key}Desc`)}</div>
                      </div>
                      <div className="relative mt-auto"><GoldPill>{t(`gami.${r.note}`)}</GoldPill></div>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* certificate preview */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <ScrollText size={14} style={{ color: "var(--brand-text)" }} />
                <span className="text-xs font-semibold tracking-wider uppercase" style={{ color: "var(--text-3)" }}>{t("gami.certPreview")}</span>
              </div>
              <div className="rounded-2xl p-2.5 max-w-[640px] mx-auto" style={{ background: "var(--bg-card)", border: "1px solid var(--brand-border)", boxShadow: `0 20px 50px -20px ${hexA("#C8973F", 0.35)}` }}>
                <div className="relative overflow-hidden rounded-xl px-6 py-8 text-center" style={{ border: `1.5px solid ${hexA("#C8973F", 0.55)}`, background: "var(--bg-inner)" }}>
                  <span aria-hidden className="absolute inset-2 rounded-lg pointer-events-none" style={{ border: `1px solid ${hexA("#C8973F", 0.3)}` }} />
                  <span aria-hidden className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(140% 90% at 50% -30%, ${hexA("#C8973F", 0.14)} 0%, transparent 60%)` }} />
                  <div className="relative flex flex-col items-center gap-3">
                    <div className="text-[10px] font-bold" style={{ letterSpacing: "0.42em", color: "var(--text-3)" }}>SAFIA DASHBOARD</div>
                    <Medallion size={84} glyph="champion" />
                    <div style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 24, fontWeight: 700, letterSpacing: "0.12em", color: "var(--brand-text)" }}>
                      {t("gami.certHeading")}
                    </div>
                    <div className="text-[11.5px]" style={{ color: "var(--text-3)" }}>{t("gami.certLine")}</div>
                    <div style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 30, fontStyle: "italic", lineHeight: 1.15 }}>{tl(myName)}</div>
                    <div className="text-[11px] tabular-nums" style={{ color: "var(--text-3)" }}>
                      06.2026 · {t("gami.certScore")}: 82,4 · {ME.unit}
                    </div>
                    <div className="flex flex-col items-center gap-1 mt-2">
                      <span aria-hidden className="block w-36 h-px" style={{ background: "var(--border-md)" }} />
                      <span className="text-[10px] uppercase" style={{ letterSpacing: "0.12em", color: "var(--text-4)" }}>{t("gami.certSigner")}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* grant log */}
            <TableCard icon={BadgeCheck} title={t("gami.grantLog")}
              right={<span className="text-[11px] tabular-nums" style={{ color: "var(--text-4)" }}>4</span>}>
              <thead><tr>
                <Th label={t("gami.colDate")} />
                <Th label={t("gami.colPerson")} />
                <Th label={t("gami.colReward")} />
                <Th label={t("gami.colSeason")} />
                <Th label={t("gami.colStatus")} />
              </tr></thead>
              <tbody>
                {[
                  { person: myName, me: true, reward: "crown", status: "stGranted", ok: true },
                  { person: myName, me: true, reward: "cert", status: "stGranted", ok: true },
                  { person: myName, me: true, reward: "dayOff", status: "stPending", ok: false },
                  { person: "S1 · 1-smena", me: false, reward: "dinner", status: "stGranted", ok: true },
                ].map((g, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 tabular-nums" style={{ color: "var(--text-3)" }}>01.07.2026</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1.5">{g.me ? tl(g.person) : g.person}{g.me && <Crown size={12} style={{ color: "var(--brand-text)" }} />}</span>
                    </td>
                    <td className="px-3 py-2">{t(`gami.reward.${g.reward}`)}</td>
                    <td className="px-3 py-2 tabular-nums" style={{ color: "var(--text-3)" }}>06.2026</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-semibold"
                        style={g.ok
                          ? { color: theme === "light" ? "#15803d" : "#4ade80", background: hexA("#22c55e", 0.12), border: `1px solid ${hexA("#22c55e", 0.25)}` }
                          : { color: "var(--kpi-amber)", background: hexA("#eab308", 0.12), border: `1px solid ${hexA("#eab308", 0.25)}` }}>
                        {t(`gami.${g.status}`)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableCard>
          </>
        )}
      </div>

      {/* badge detail modal */}
      {detailDef && (
        <Modal
          title={badgeName(detailDef.key)}
          subtitle={t("gami.collection")}
          icon={<Award size={18} style={{ color: "var(--brand-text)" }} />}
          onClose={() => setDetail(null)}
          footer={<Button variant="secondary" onClick={() => setDetail(null)}>{t("gami.close")}</Button>}
        >
          <div className="flex flex-col items-center gap-3 py-2 text-center">
            <Medallion size={150} glyph={detailDef.key} locked={detailDef.state === "locked"}
              progress={detailDef.state === "progress" ? detailDef.cur / detailDef.goal : null}
              counter={detailDef.count ?? null} />
            <div className="text-[13px] leading-snug px-2" style={{ color: "var(--text-2)" }}>{badgeDesc(detailDef.key)}</div>
            <div className="flex items-center gap-2 flex-wrap justify-center">
              <GoldPill>+{detailDef.xp} XP</GoldPill>
              {detailDef.count != null && <GoldPill>{t("gami.timesEarned").replace("{n}", detailDef.count)}</GoldPill>}
              {detailDef.team && <GoldPill>{t("gami.teamBadge")}</GoldPill>}
            </div>
            {detailDef.state === "earned" && (
              <div className="text-[11.5px] tabular-nums" style={{ color: "var(--text-4)" }}>{t("gami.earnedOn")}: {detailDef.date}</div>
            )}
            {detailDef.state === "progress" && (
              <div className="w-full max-w-[280px]">
                <div className="flex justify-between text-[10.5px] mb-1 tabular-nums" style={{ color: "var(--text-4)" }}>
                  <span>{t("gami.progressLabel")}</span><span>{detailDef.cur} / {detailDef.goal}</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
                  <div className="h-full rounded-full" style={{ width: `${(detailDef.cur / detailDef.goal) * 100}%`, background: "var(--brand)" }} />
                </div>
              </div>
            )}
            {detailDef.state === "locked" && (
              <div className="inline-flex items-center gap-1.5 text-[11.5px]" style={{ color: "var(--text-4)" }}>
                <Lock size={12} /> {t("gami.lockedHint")}
              </div>
            )}
          </div>
        </Modal>
      )}
    </Layout>
  );
}
