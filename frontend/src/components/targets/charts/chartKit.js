// Plain helpers shared by the Targets charts — scales, round ticks, date
// labels, the chart colours. Kept out of the .jsx files so each of those
// exports components only (fast refresh).
import { parseISO, GREY, STATUS_COLOR } from "../../../utils/targets";
import { GREEN, AMBER, RED } from "../../../utils/statusBands";

export const msOf = (iso) => parseISO(iso).getTime();
export const DAY_MS = 86400000;

// A linear scale: domain [d0, d1] → range [r0, r1].
export const scale = (d0, d1, r0, r1) => (v) =>
  d1 === d0 ? (r0 + r1) / 2 : r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Round tick values for a value axis («nice numbers»): 0 / 25 / 50, never 0 / 23 / 46.
export function niceTicks(min, max, count = 4) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0];
  let lo0 = min, hi0 = max;
  if (lo0 === hi0) { const d = Math.abs(lo0) || 1; lo0 -= d / 2; hi0 += d / 2; }
  const raw = (hi0 - lo0) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const lo = Math.floor(lo0 / step) * step;
  const hi = Math.ceil(hi0 / step) * step;
  const out = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Number(v.toFixed(10)));
  return out;
}

// A month or day-month label that stays short without colliding: a name of
// four letters or fewer is kept whole, so «Iyun» and «Iyul» never both
// become «Iyu».
const cut = (s) => (s.length > 4 ? s.slice(0, 3) : s);
export const shortMonth = (t, monthIndex) => cut(t(`cal.m${monthIndex}`));
export function dayLabel(iso, t) {
  const [, m, d] = iso.split("-");
  return `${parseInt(d, 10)} ${cut(t(`cal.mg${parseInt(m, 10) - 1}`))}`;
}

// The colour a CHART MARK wears for a status. Same as the chips except
// «achieved», drawn a deeper green so it stays apart from «on track» where the
// two touch (a donut). Never beside red: under protanopia the two collapse.
export const MARK_COLOR = { ...STATUS_COLOR, achieved: "#15803d" };
export const ZONE = { ok: GREEN, risk: AMBER, behind: RED, none: GREY };

// Rough rendered width of a label at the charts' 11px font — enough to keep
// two labels from landing on each other. Wide on purpose: an over-estimate
// drops a label early, an under-estimate draws text over text.
export const textPx = (s, px = 11) => Math.ceil(String(s).length * px * 0.6) + 4;
