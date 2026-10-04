// «Kadrlar qo'nimsizligi» — the small pieces the page, the explain dialog and
// the rules dialog share: number and date formats, the score's colour, the
// score scale drawn from the rule the server sent (never a second copy of it).
// The two small components that draw them live in TurnoverBits.jsx.
import { fill } from "../../pages/turnoverText";

export const START_MONTH = "2026-10";   // from here the IMS computes every month by itself
export const PAST_FROM = "2025-01";     // earlier months: an admin's «Hisoblash», saved

const pad = (n) => String(n).padStart(2, "0");

export const n0 = (v) => (v == null ? "—" : Number(v).toLocaleString("ru-RU").replace(/\u00a0/g, " "));
export const pct1 = (v) => (v == null ? "—" : `${Number(v).toFixed(1)}%`);
export const pts = (v) => (v == null ? "—" : Number(v).toFixed(2));

export const dmy = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : "—");
// "2026-10-04T23:40+05:00" → "04.10 23:40" — the plant's wall clock, as sent.
export const dmHm = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)} ${iso.slice(11, 16)}` : "—");

export const monthLabel = (ym, t) => {
  if (!ym) return "";
  const [y, m] = ym.split("-").map(Number);
  return `${t(`cal.m${m - 1}`)} ${y}`;
};

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// The month a reader most likely came for: the last month that has ENDED
// (HR reads a finished month), else the one running — never before the start.
export const defaultMonth = () => {
  const d = new Date();
  const cur = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  const p = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  const prev = `${p.getFullYear()}-${pad(p.getMonth() + 1)}`;
  if (prev >= START_MONTH) return prev;
  return cur < START_MONTH ? START_MONTH : cur;
};

export const scoreTone = (s) => (s == null ? null : s >= 4 ? "ok" : s === 3 ? "warn" : "bad");
const INK = { ok: "var(--status-ok)", warn: "var(--status-warn)", bad: "var(--status-bad)" };
export const toneInk = (tone) => (tone ? INK[tone] : "var(--text-3)");

export const tenure = (days, T) => {
  if (days == null) return "—";
  if (days < 31) return fill(T.days, { n: days });
  if (days < 365) return fill(T.months, { n: Math.floor(days / 30.44) });
  return fill(T.years, { y: Math.floor(days / 365.25), m: Math.floor((days % 365.25) / 30.44) });
};

// The scale as rows, lowest rate first: {label, score, from, to}.
export function bandRows(rule) {
  const bands = [...(rule?.bands || [])].sort((a, b) => a.max - b.max);
  const out = [];
  let prev = null;
  for (const b of bands) {
    out.push({
      label: prev == null ? `≤ ${b.max}%` : `${(prev + 0.1).toFixed(1).replace(/\.0$/, "")}–${b.max}%`,
      score: b.score, from: prev, to: b.max,
    });
    prev = b.max;
  }
  out.push({ label: `> ${prev ?? 0}%`, score: rule?.worst ?? 1, from: prev, to: null });
  return out;
}

export const bandOf = (rate, rule) => {
  if (rate == null) return -1;
  return bandRows(rule).findIndex((b) => (b.to == null ? rate > (b.from ?? 0) : rate <= b.to));
};

export const weightPct = (rule) => Math.round((rule?.weight ?? 0.2) * 100);
