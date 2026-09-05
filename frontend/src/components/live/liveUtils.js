// Shared vocabulary of the live shift monitor (/live): the status palette,
// number formatting and the alert sentences. ONE place, so a colour on a KPI
// tile, a unit row, a cell tile and a feed card can never mean four things.

// Traffic-light statuses (the platform's status palette — red / yellow /
// green, grey for «not started / no data»); `info` is the neutral note tone
// of an informational alert (a closed day, a missing upload), never a status.
export const STATUS_COLOR = {
  crit: "#ef4444",
  warn: "#eab308",
  ok: "#22c55e",
  quiet: "#94a3b8",
  info: "#60a5fa",
};
export const STATUS_RANK = { crit: 3, warn: 2, ok: 1, quiet: 0 };

export const hexA = (hex, a) => {
  if (typeof hex !== "string" || hex[0] !== "#") return hex;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

// `t()` carries no parameters; every `{x}` in a live.* string is filled here.
export function tp(t, key, params = {}) {
  let s = t(key);
  for (const [k, v] of Object.entries(params)) {
    s = s.split(`{${k}}`).join(v == null || v === "" ? "—" : String(v));
  }
  return s;
}

export const fmtInt = (v) => (v == null || Number.isNaN(Number(v)) ? "—" : Math.round(Number(v)).toLocaleString("ru-RU"));
export const fmtPct = (v) => (v == null || Number.isNaN(Number(v)) ? "—" : `${Math.round(Number(v))}%`);
export const fmtHM = (mins) => {
  if (mins == null) return "—";
  const m = Math.max(0, Math.round(mins));
  return { h: Math.floor(m / 60), m: m % 60 };
};
export const clockOf = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
};
export const dateOf = (iso) => {
  if (!iso) return "—";
  const [y, m, d] = String(iso).split("-");
  return y && m && d ? `${d}.${m}.${y}` : iso;
};

// "Cat D3" → "D3" — the short code the category chips and the legend use.
export const catCode = (name) => String(name || "").replace(/^Cat\s*/i, "") || "?";

export function reducedMotion() {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
}

export const worstOf = (...statuses) =>
  statuses.reduce((a, b) => ((STATUS_RANK[b] ?? 0) > (STATUS_RANK[a] ?? 0) ? b : a), "quiet");

// The colour a plan status paints with — an unjudged state is neutral.
export function planColor(status) {
  if (status === "ok") return STATUS_COLOR.ok;
  if (status === "warn") return STATUS_COLOR.warn;
  if (status === "crit") return STATUS_COLOR.crit;
  return STATUS_COLOR.quiet;
}

// One sentence per alert kind, in the viewer's language. `tl` is the
// transliterator, because the register spells brigadirs in two alphabets.
export function alertText(t, a, tl) {
  const unit = tl ? tl(a.unit || "") : (a.unit || "");
  const cell = a.cell || "";
  switch (a.kind) {
    case "cell_stopped_now":
      return tp(t, "live.a.cell_stopped_now", { cell, since: a.since, m: fmtInt(a.minutes) });
    case "cell_idle":
      return tp(t, "live.a.cell_idle", { cell, m: fmtInt(a.minutes) });
    case "unit_idle":
      return tp(t, "live.a.unit_idle", { unit, m: fmtInt(a.minutes) }) +
        (a.basis === "estimate" ? t("live.a.unit_idle.est") : "");
    case "plan_pace":
      return tp(t, "live.a.plan_pace", { unit, pace: fmtInt(a.pace), pct: fmtInt(a.pct), exp: fmtInt(a.expected) });
    case "plan_noactual":
      return tp(t, "live.a.plan_noactual", { unit });
    case "plan_stale":
      return tp(t, "live.a.plan_stale", { unit, m: fmtInt(a.minutes) });
    case "no_attendance":
      return tp(t, "live.a.no_attendance", { unit });
    case "day_closed":
      return tp(t, "live.a.day_closed", { unit, pct: a.pct == null ? "—" : fmtInt(a.pct), idle: fmtInt(a.idle) });
    default:
      return a.kind;
  }
}
