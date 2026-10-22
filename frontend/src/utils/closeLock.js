// THE words for a brigadir's day-close clock — `close_lock` on the live close
// check and on approvals/day (backend `services/close_window`, 2026-10-22: S1
// from 12:00, S2 from 23:00). The date is named only when the clock falls on
// the next morning.
export function closeLockText(t, lk) {
  if (!lk) return "";
  const fill = (s, p) => String(s).replace(/\{(\w+)\}/g, (_, k) => (p[k] ?? ""));
  if (!lk.opens_on) return fill(t("staffClose.lockedUntil"), { t: lk.close_from });
  const [y, m, d] = lk.opens_on.split("-");
  return fill(t("staffClose.lockedUntilDate"), { d: `${d}.${m}.${y}`, t: lk.close_from });
}
