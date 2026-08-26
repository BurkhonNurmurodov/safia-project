// ARC ticket status → the register's ONE visual vocabulary.
//
// IT's internal API ships a bare INTEGER and nothing else — no label, no
// colour of its own — so the vocabulary is the documented code table and the
// WORDS live in the four locales (`arc.st.<code>`). Anything that needs to
// name or colour a status goes through here, so the register chip, the filter
// dots and the mobile card's stripe can never disagree.
//
//   0  Создана                          — filed, nobody has picked it up
//   1  В работе                         — a brigade has it, started_at stamped
//   3  Завершена                        — done, the author confirmed
//   4  Отклонена                        — denied, deny_reason says why
//   6  Обработана, ждёт подтверждения    — done, waiting on the author
//
// TWO axes, and both must be drawn on EVERY surface:
//
//   HUE = the derived state the BACKEND computed (`_derived` in routers/arc.py):
//   amber = open (0, 1) · green = done (3 AND 6, because `is_done = status IN
//   (3, 6)`) · grey = cancelled (4). The chip therefore cannot contradict the
//   KPI strip, the «Ochiq / Yakunlangan / Bekor» toggle or the analysis stacks,
//   which all count 6 as done — a status painted amber while every number on
//   the page calls it finished is two answers to one question. Red belongs to
//   LATE alone, a separate fact that rides beside any status.
//
//   FILL = whose move it is. Solid = settled, or with IT. A RING = waiting on
//   somebody: 0 waits for IT to pick it up, 6 waits for the author to confirm.
//
// The ring is the load-bearing half and it used not to be drawn anywhere but
// the chip's border: the filter list painted a plain disc, so «Yakunlangan»
// (502) and «Tasdiq kutilmoqda» (1035) were two identical green circles and
// the register's biggest pile — the one waiting on OUR side — read as finished
// work. Draw a status dot with `dotStyle()`; never hand-roll a dot from
// `toneFor(x).color`, which is how that half goes missing again.

export const C_DONE = "#22c55e";
export const C_DOING = "#eab308";
export const C_OVERDUE = "#ef4444";
export const C_GREY = "#94a3b8";

export const ST_NEW = 0;
export const ST_DOING = 1;
export const ST_DONE = 3;
export const ST_DENIED = 4;
export const ST_HANDLED = 6;

// In the order a ticket travels, which is the order the filter lists them.
export const STATUS_CODES = [ST_NEW, ST_DOING, ST_HANDLED, ST_DONE, ST_DENIED];

const TONES = {
  // Open, nobody has picked it up — amber like every other open ticket (the
  // KPI «Ochiq» counts it), hollow because it is waiting on IT to start.
  [ST_NEW]: { color: C_DOING, waiting: true },
  [ST_DOING]: { color: C_DOING, waiting: false },
  [ST_DONE]: { color: C_DONE, waiting: false },
  // Denied is a status, not a failure — red stays reserved for LATE, which is
  // a separate fact that can ride beside any status. Grey matches the
  // «cancelled» series in the analysis stacks.
  [ST_DENIED]: { color: C_GREY, waiting: false },
  // IT finished it; the author has not confirmed. Done (so: green), but the
  // ring says the move is ours.
  [ST_HANDLED]: { color: C_DONE, waiting: true },
};

export function toneFor(status) {
  return TONES[status] || { color: C_GREY, waiting: false };
}

// THE status dot, for the chip and the filter list alike. A ring is drawn with
// an inset shadow rather than a border so the mark keeps its stated size
// whatever box-sizing the caller sits in.
export function dotStyle(status, size = 8) {
  const { color, waiting } = toneFor(status);
  if (!waiting) return { width: size, height: size, background: color };
  const ring = Math.max(1.5, Math.round(size / 3.5));
  return { width: size, height: size, background: "transparent", boxShadow: `inset 0 0 0 ${ring}px ${color}` };
}

// The phone card's 3px left stripe is too coarse for a ring, so the waiting
// half rides on strength instead: a settled ticket gets the full hue, one
// still waiting on somebody the same hue at 45%.
export function stripeColor(status) {
  const { color, waiting } = toneFor(status);
  return waiting ? hexA(color, 0.45) : color;
}

// The status in the viewer's language. A code the API starts sending that
// nobody has named yet renders as «#7» — visible and obviously unmapped,
// never a raw translation key.
export function statusName(status, t) {
  if (status === null || status === undefined || status === "") return "—";
  const n = Number(status);
  return STATUS_CODES.includes(n) ? t(`arc.st.${n}`) : `#${status}`;
}

// Soft rgba tint from a #hex; non-hex colours pass through untinted.
export function hexA(hex, a) {
  if (typeof hex !== "string" || hex[0] !== "#" || (hex.length !== 7 && hex.length !== 4)) return hex;
  const h = hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;
  const n = parseInt(h.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
