/**
 * The «Jurnal» vocabulary — ONE place that says what a category, an outcome and
 * a source LOOK like, and one helper that turns any stored key into readable
 * text.
 *
 * The backend ships KEYS and never sentences (see backend/app/routers/logs.py),
 * so every string on this tab is resolved here. Two rules the whole tab rests
 * on:
 *
 * **Colour on this page means STATUS, never identity.** The four outcomes own
 * the traffic light (#22c55e / #eab308 / #ef4444) and `danger` owns red. The
 * fourteen categories are deliberately NOT hued: giving «attendance» the
 * categorical palette's red would put a red chip next to a red «denied» chip
 * and make the one colour that has to mean something mean two things. The rail
 * separates them by ICON and by the selected row's brand background instead.
 *
 * **Every mark carries a shape as well as a colour.** An outcome is an icon and
 * a word before it is a hue, so the register still reads on a monochrome print
 * and for anybody who cannot separate the amber from the red.
 */
import {
  ClipboardCheck, FileText, IdCard, LogIn, Building2, ListChecks, BadgeCheck,
  Factory, MessagesSquare, Megaphone, RefreshCw, Sliders, Trash2, CircleHelp,
  CheckCircle2, Ban, ShieldX, TriangleAlert,
  Send, Globe, Bot, Cpu,
} from "lucide-react";

/** Traffic light + the platform's "not started" slate. Never re-spelled inline. */
export const GREEN = "#22c55e";
export const AMBER = "#eab308";
export const RED = "#ef4444";
export const SLATE = "#94a3b8";

/** One icon per category, in the order the API returns them. */
export const CAT_ICON = {
  attendance:    ClipboardCheck,
  documents:     FileText,
  identity:      IdCard,
  sessions:      LogIn,
  org:           Building2,
  leader_config: ListChecks,
  leader_review: BadgeCheck,
  shopfloor:     Factory,
  collab:        MessagesSquare,
  comms:         Megaphone,
  sync_export:   RefreshCw,
  config:        Sliders,
  danger:        Trash2,
  other:         CircleHelp,
};

export const DANGER_CAT = "danger";

/**
 * The four outcomes. `refused` and `error` are deliberately different GLYPHS,
 * not the same triangle in two colours — a business rule saying no and the
 * server falling over are different events and must not need a colour match to
 * be told apart.
 */
export const OUTCOME = {
  done:    { color: GREEN, Icon: CheckCircle2 },
  refused: { color: AMBER, Icon: Ban },
  denied:  { color: RED,   Icon: ShieldX },
  error:   { color: RED,   Icon: TriangleAlert },
};

export const SRC_ICON = { telegram: Send, web: Globe, bot: Bot, system: Cpu };

// ── text ─────────────────────────────────────────────────────────────────────

/**
 * THE fallback for a key nobody has translated yet.
 *
 * The register grows an action key every time somebody adds a mutating route,
 * and the translation table always trails it by at least one deploy. Printing
 * `attendance.day_reopened` at a reader is a leak of the schema; printing
 * «Day reopened» is the same fact in words. Strips the category prefix (the
 * column beside it already says which section this is), unpacks the
 * underscores and capitalises once.
 */
export function prettify(key) {
  const raw = String(key ?? "");
  if (!raw) return "";
  const tail = raw.includes(".") ? raw.slice(raw.indexOf(".") + 1) : raw;
  const words = tail.replace(/[._]+/g, " ").trim();
  if (!words) return raw;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * `logs.act.x` / `logs.cat.x` / `logs.f.x` → the translation, or the prettified
 * key when there isn't one. `t()` returns the key itself when it misses, which
 * is the miss signal.
 */
export function labelOf(t, prefix, key) {
  if (key == null || key === "") return "";
  const full = `${prefix}${key}`;
  const text = t(full);
  return text === full ? prettify(key) : text;
}

/**
 * Whole-sentence templates — never concatenate translated fragments; word order
 * differs between the four languages. An unknown placeholder is left standing
 * rather than blanked, so a mis-typed key shows up instead of hiding.
 */
export function tpl(s, vars = {}) {
  return String(s ?? "").replace(/\{(\w+)\}/g, (m, k) =>
    (vars[k] === undefined || vars[k] === null ? m : String(vars[k])));
}

// ── values ───────────────────────────────────────────────────────────────────

/** First matching `details` entry, by preference order. `null` when none. */
export function detail(row, keys) {
  const list = row?.details || [];
  for (const k of keys) {
    const hit = list.find((d) => d.k === k);
    if (hit && hit.v !== null && hit.v !== "" && hit.v !== undefined) return hit.v;
  }
  return null;
}

/** First non-empty of a list of candidate values. */
export function firstOf(...vals) {
  for (const v of vals) if (v !== null && v !== undefined && v !== "") return v;
  return null;
}

/**
 * Group-separated number. `details` values are whatever a handler stored, so a
 * non-numeric one is passed through verbatim — printing «не число» at somebody
 * because a count turned out to be a word is worse than printing the word.
 */
export const num = (n) => {
  if (n === null || n === undefined || n === "") return "";
  const v = typeof n === "number" ? n : Number(n);
  return Number.isFinite(v) ? v.toLocaleString("ru-RU") : String(n);
};

/** "2026-08-23" → "23.08.2026" */
export const fmtDay = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join(".") : "");
/** "2026-08-23" → "23.08" — for the second line of a narrow time cell. */
export const fmtDayShort = (iso) => (iso ? `${String(iso).slice(8, 10)}.${String(iso).slice(5, 7)}` : "");

/**
 * Relative age, on the bell's existing 4-language key family — the register and
 * the notification list should not learn to say "3 hours ago" two ways.
 */
export function timeAgo(iso, t) {
  if (!iso) return "";
  const diff = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diff < 60) return tpl(t("notif.timeAgo.s"), { n: diff });
  if (diff < 3600) return tpl(t("notif.timeAgo.m"), { n: Math.floor(diff / 60) });
  if (diff < 86400) return tpl(t("notif.timeAgo.h"), { n: Math.floor(diff / 3600) });
  return tpl(t("notif.timeAgo.d"), { n: Math.floor(diff / 86400) });
}

/**
 * A role name, on the vocabulary the rest of the app already owns
 * (`role.*` from the profile screens, `roles.*` from the registration list).
 * No new key family: the register must not teach a second word for «Brigadir».
 */
export function roleLabel(t, role) {
  if (!role) return "";
  const a = `role.${role}`;
  if (t(a) !== a) return t(a);
  return labelOf(t, "roles.", role);
}
