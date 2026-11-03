// «Pechlar» (/ovens) — the page's small helpers over /api/ovens/* (backend
// services/revent_analytics.py). Nothing here measures anything.
import { useLang } from "../../context/LangContext";
import { TXT } from "../../pages/ovensText";

export { fill } from "../../pages/ovensText";

/** The page's words in the reader's language. */
export function useOT() {
  const { lang } = useLang();
  return TXT[lang] || TXT.uz;
}

// Oven modes are CATEGORIES, not verdicts, so none wears a traffic-light hue:
// baking is blue (the work), standby teal, energy save purple, off the fold
// slate. A day with no log is the inner background, never a colour.
export const MODE_COLOR = {
  bake_manual: "#3b82f6", bake_recipe: "#6366f1", standby: "#14b8a6",
  energy_save: "#a855f7", off: "#94a3b8",
};
export const MODE_ORDER = ["bake_manual", "bake_recipe", "standby", "energy_save", "off"];
export const LANES = ["heat", "fan", "rotor", "steam", "damper_motor", "canopy_fan", "buzzer"];
export const LANE_COLOR = {
  door: "#ec4899", heat: "#f97316", fan: "#3b82f6", rotor: "#22c55e", steam: "#06b6d4",
  damper_motor: "#a855f7", canopy_fan: "#64748b", buzzer: "#eab308",
};
export const SENSOR_COLOR = { oven: "#3b82f6", core1: "#22c55e", core2: "#a855f7", prover: "#14b8a6" };

// Oven times are the oven's own wall clock with no zone ("2026-11-02T00:18:48"):
// read as text, never through Date in another zone.
export const hhmm = (iso) => (iso ? iso.slice(11, 16) : "");
export const ddmm = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : "");
export const ddmmyy = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : "");
/** A naive oven ISO time → epoch ms as if UTC (charts run with datetimeUTC). */
export const ovenMs = (iso) => Date.parse(`${iso}Z`);

/** «01.11 14:05» from a zoned ISO instant (server time), in the reader's clock. */
export function stamp(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export const fmtN = (n, d = 0) => (n == null ? "—"
  : Number(n).toLocaleString("ru-RU", { minimumFractionDigits: d, maximumFractionDigits: d }));
export const fmtH = (h) => (h == null ? "—" : fmtN(h, h >= 100 ? 0 : 1));

/** «1 soat 05 daq» style elapsed for live timers: h:mm:ss / mm:ss. */
export function clock(sec) {
  if (sec == null || !isFinite(sec)) return "—";
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const p = (n) => String(n).padStart(2, "0");
  return h ? `${h}:${p(m)}:${p(r)}` : `${m}:${p(r)}`;
}

/** «3 daq oldin» from seconds. */
export function ago(T, s) {
  if (s == null) return "";
  const v = s < 90 ? fillT(T.sec, Math.round(s)) : s < 5400 ? fillT(T.min, Math.round(s / 60))
    : s < 172800 ? fillT(T.hr, Math.round(s / 3600)) : fillT(T.day, Math.round(s / 86400));
  return T.ago.replace("{t}", v);
}
const fillT = (tpl, n) => tpl.replace("{n}", n);

export const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1;

/** The error code of an /api/ovens refusal, translated where the page knows it. */
export function errOf(T, err) {
  const raw = err?.response?.data?.detail_raw ?? err?.response?.data?.detail;
  const code = raw?.code;
  return (code && T.errs[code]) || raw?.message || T.loadError;
}

/** The refusal's code alone ("bad_ip", "duplicate", …), or null. */
export const errCode = (err) => (err?.response?.data?.detail_raw ?? err?.response?.data?.detail)?.code || null;
