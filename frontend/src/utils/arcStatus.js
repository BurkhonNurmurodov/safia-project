// ARC ticket status → traffic-light tone.
//
// IT's internal API ships a bare INTEGER and nothing else — no label, no
// colour of its own — so the vocabulary is the documented code table and the
// WORDS live in the four locales (`arc.st.<code>`). Anything that needs to
// name or colour a status goes through here, so the register chip, the filter
// dots and the mobile card's stripe can never disagree.
//
//   0  Создана                          — filed, nobody has picked it up
//   1  В работе                         — a brigade has it, started_at stamped
//   3  Завершена                        — done, the author is asked to rate it
//   4  Отклонена                        — denied, deny_reason says why
//   6  Обработана, ждёт подтверждения    — done, waiting on the author
//
// `dashed` marks a status that is WAITING ON SOMEBODY — a fresh ticket and a
// handled-but-unconfirmed one — so neither reads as settled at a glance.

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
  [ST_NEW]: { color: C_GREY, dashed: true },
  [ST_DOING]: { color: C_DOING, dashed: false },
  [ST_DONE]: { color: C_DONE, dashed: false },
  // Denied is a status, not a failure — red stays reserved for LATE, which is
  // a separate fact that can ride beside any status.
  [ST_DENIED]: { color: C_GREY, dashed: false },
  [ST_HANDLED]: { color: C_DONE, dashed: true },
};

export function toneFor(status) {
  return TONES[status] || { color: C_GREY, dashed: false };
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
