import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "../../utils/api";

/* «Verifix (test)» — what the section's pages share: the fetchers, the error
 * reader, the formatters and the vocabularies Verifix uses (mark types, day
 * kinds, schedule kinds), so seven pages say one thing about each.
 * Backend: /api/verifix-test (routers/verifix_explore.py). */

export const VFX = "/api/verifix-test";

export const vget = (path, params) =>
  api.get(`${VFX}${path}`, { params }).then((r) => r.data);

/** One page's Verifix read, with the page's «Yangilash»: `refresh()` asks
 * the server to bypass its few-minutes cache for this one fetch. A changed
 * parameter (another day, another location) is a new key, so the previous
 * answer is never shown under the new one. */
export function useVfx(key, path, params, options = {}) {
  const force = useRef(false);
  const q = useQuery({
    queryKey: ["vfx", ...key, params || null],
    queryFn: () => {
      const f = force.current;
      force.current = false;
      return vget(path, f ? { ...(params || {}), force: true } : params);
    },
    staleTime: 5 * 60_000,
    retry: false,
    ...options,
  });
  const refresh = () => { force.current = true; return q.refetch(); };
  return [q, refresh];
}

export const fill = (s, p = {}) =>
  String(s).replace(/\{(\w+)\}/g, (_, k) => (p[k] ?? ""));

/** The reason a Verifix read failed, as the router words it:
 * {code, message, status} — code ∈ not_configured · forbidden · auth ·
 * missing · bad_request · slow · error · not_found · network. */
export function vfxError(err) {
  if (!err) return null;
  const res = err.response;
  if (!res) return { code: "network", message: err.message };
  const d = res.data?.detail_raw ?? res.data?.detail;
  if (d && typeof d === "object") return { code: d.code || "error", message: d.message, status: d.status };
  return { code: res.status === 403 ? "denied" : "error", message: typeof d === "string" ? d : "" };
}

// ── formatting ────────────────────────────────────────────────────────────────

export const hm = (iso) => (iso ? iso.slice(11, 16) : "");
export const dmy = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : "");
export const dm = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : "");
export const num = (n) => (n == null ? "—" : Number(n).toLocaleString("ru-RU"));

/** 7.5 → "7:30" — hours as a clock reading, never a decimal. */
export const hmm = (h) => {
  if (h == null) return "—";
  const total = Math.round(h * 60);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

/** A clock that fell on another day than `day` carries the date: «06:10 · 03.10». */
export const clockOn = (iso, day) => {
  if (!iso) return "";
  return iso.slice(0, 10) === day ? hm(iso) : `${hm(iso)} · ${dm(iso)}`;
};

export const initials = (name) =>
  String(name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase() || "?";

export const shiftISO = (iso, n) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// ── status colours (the platform's traffic light) ─────────────────────────────

export const C_OK = "#22c55e";
export const C_WARN = "#eab308";
export const C_BAD = "#ef4444";
export const C_NONE = "#94a3b8";

/** A person's day, as `verifix_live._person` names it. */
export const DAY_STATUS = {
  inside: C_OK, break: C_WARN, left: C_NONE, absent: C_BAD,
  not_yet: C_NONE, off: C_NONE, no_out: C_BAD,
};

/** What a method answered on the API map. */
export const PROBE_TONE = {
  ok: C_OK, empty: C_NONE, forbidden: C_BAD, auth: C_BAD, missing: C_WARN,
  error: C_BAD, bad_request: C_WARN, slow: C_WARN, needs: C_NONE, unchecked: C_NONE, off: C_NONE,
};

export function probeState(m) {
  if (m.blocked) return "off";
  const s = m.probe?.status;
  if (!s) return m.needs?.length ? "needs" : "unchecked";
  if (s === "needs_input") return "needs";
  return s;
}

// Verifix's own letters (documented enums).
export const TRACK_TYPES = ["I", "O", "C", "M", "P", "T", "N"];
export const MARK_TYPES = ["F", "R", "T", "P", "Q", "M", "A", "C", "S", "J", "O", "X"];
export const DAY_KINDS = ["W", "R", "A", "H", "N"];
export const SCHEDULE_KINDS = ["F", "C", "H", "M", "A"];

/** A mark's source letter in words — the letter itself where Verifix sent one
 * its documentation does not name. */
export function markLabel(t, m) {
  if (!m) return "—";
  const s = t(`vfx.mark.${m}`);
  return s === `vfx.mark.${m}` ? m : s;
}

export const isCame = (s) => s === "inside" || s === "break" || s === "left" || s === "no_out";
