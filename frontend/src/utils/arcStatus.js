// ARC ticket status → traffic-light tone. The ARC API ships a free-form
// `normalized_status` string plus its own `status_color`; the platform's status
// palette is fixed (red / yellow / green / grey, brand gold never a status), so
// the string is matched by vocabulary first and the remote colour is only a
// last resort for a status nobody has named yet.
//
//   toneFor(normalized_status, status_color) → { color, dashed }
//   `dashed` marks a NEW / pending ticket, whose grey would otherwise be
//   indistinguishable from a cancelled one.

export const C_DONE = "#22c55e";
export const C_DOING = "#eab308";
export const C_OVERDUE = "#ef4444";
export const C_GREY = "#94a3b8";

const RX_DONE = /(complet|finish|done|закрыт|выполн|заверш|bajarildi|yakun)/;
const RX_CANCEL = /(cancel|отмен|deny|отказ|rad|bekor)/;
const RX_DOING = /(progress|в работе|process|accept|принят|jarayon|qabul)/;
const RX_NEW = /(new|нов|pending|ожид|wait|kut|yangi|created)/;

// A remote colour is used only when it is a plain #RGB / #RRGGBB hex — the one
// form `hexA` can tint. A named colour, rgb() or an alpha hex would leave the
// chip with background === text colour, and a bare word like "warning" would
// leak into an inline style as no colour at all.
const RX_CSS_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function toneFor(normalizedStatus, statusColor) {
  const s = String(normalizedStatus || "").toLowerCase();
  if (RX_DONE.test(s)) return { color: C_DONE, dashed: false };
  if (RX_CANCEL.test(s)) return { color: C_GREY, dashed: false };
  if (RX_DOING.test(s)) return { color: C_DOING, dashed: false };
  if (RX_NEW.test(s)) return { color: C_GREY, dashed: true };
  const c = String(statusColor || "").trim();
  if (c && RX_CSS_COLOR.test(c)) return { color: c, dashed: false };
  return { color: C_GREY, dashed: false };
}

// Soft rgba tint from a #hex; non-hex colours pass through untinted.
export function hexA(hex, a) {
  if (typeof hex !== "string" || hex[0] !== "#" || (hex.length !== 7 && hex.length !== 4)) return hex;
  const h = hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;
  const n = parseInt(h.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
