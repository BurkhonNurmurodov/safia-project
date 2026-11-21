// «Auditlar» helpers shared by the register and the analysis
// (services/panel_audits.py is the server's twin of the bands).

// The technologists' audit bands (tech_audit): above 90 · above 80 · above 70 · else.
export const BANDS = [
  { key: "a90", min: 90, color: "#22c55e" },
  { key: "a80", min: 80, color: "#eab308" },
  { key: "a70", min: 70, color: "#f97316" },
  { key: "low", min: -1, color: "#ef4444" },
];
export const TARGET = 90;

export function bandOf(v) {
  if (v == null) return null;
  return BANDS.find((b) => v > b.min) || BANDS[BANDS.length - 1];
}
export const bandColor = (v) => bandOf(v)?.color || "#94a3b8";

export const fmtPct = (v, digits = 1) =>
  v == null ? "—" : `${Number(v).toFixed(digits).replace(/\.0+$/, "")}%`;

export function fmtDay(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y.slice(2)}`;
}

// The panel names a workshop «1 - 2811 - Фасовка»: its list number, the code,
// the name. The list number means nothing outside the panel's own page.
// Only a list number FOLLOWED by a code is dropped — «4413 - Кремовый цех» stays whole.
export const shopLabel = (s) => String(s || "").replace(/^\s*\d{1,3}\s*-\s*(?=\d)/, "");
