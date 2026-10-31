// «Nomzodlarni baholash» — the page's shared vocabulary: its words, the one
// look of a department / type chip, the verdict colours, and the one way a
// refusal from the server is put into words.
import { useMemo } from "react";
import { BadgeCheck, Users, Factory, HardHat, Sparkles, BookOpen, Wrench } from "lucide-react";
import { useLang } from "../../context/LangContext";
import { TXT, fill } from "../../pages/assessmentText";

export { fill };

export function useAT() {
  const { lang } = useLang();
  return useMemo(() => TXT[lang] || TXT.uz, [lang]);
}

// A department and a question type are CATEGORIES, not statuses: an icon and a
// word in a neutral chip. Colour on this page means a verdict and nothing else.
export const DEPT_ICON = { okk: BadgeCheck, hr: Users, production: Factory, tb: HardHat, kaizen: Sparkles };
export const TYPE_ICON = { theory: BookOpen, practical: Wrench };

// The draw's blocks — which block a question's department belongs to.
export const BLOCK_OF = { kaizen: "kp", production: "kp", tb: "tb", hr: "hr", okk: "okk" };
export const BLOCK_ORDER = ["kp", "tb", "hr", "okk"];

// Verdict colours: the status palette's 700 shades, so a white label reads on
// both themes (the toggle's selected pill) — and the plain hexes for a mark.
export const VERDICT = {
  pass: { bg: "#15803d", fg: "#ffffff", ink: "var(--status-ok)", hex: "#22c55e" },
  fail: { bg: "#b91c1c", fg: "#ffffff", ink: "var(--status-bad)", hex: "#ef4444" },
};

export function Chip({ icon: Icon, children, title }) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-[2px] text-[11px] font-medium whitespace-nowrap"
      style={{ background: "var(--bg-inner)", color: "var(--text-2)", border: "1px solid var(--border)" }}
    >
      {Icon && <Icon size={11} aria-hidden="true" />}
      {children}
    </span>
  );
}

export function DeptChip({ dept, T }) {
  return <Chip icon={DEPT_ICON[dept]}>{T.dept[dept] || dept}</Chip>;
}

export function TypeChip({ type, T }) {
  return <Chip icon={TYPE_ICON[type]}>{T.type[type] || type}</Chip>;
}

/** A whole percent, «—» when there is nothing to divide. */
export const pct0 = (v) => (v == null ? "—" : `${Math.round(v)}%`);

export function fmtDate(iso) {
  if (!iso) return "—";
  const d = String(iso).slice(0, 10).split("-");
  return d.length === 3 ? `${d[2]}.${d[1]}.${d[0]}` : iso;
}

/** The server sends every instant on the PLANT's wall clock (Tashkent); it is
 *  printed as sent — never converted into the browser's own zone. */
export function fmtDateTime(iso) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  return m ? `${m[3]}.${m[2]} ${m[4]}:${m[5]}` : "—";
}

/** The server's refusal, in the reader's words. `detail_raw` is where
 *  utils/api.js keeps a structured detail it flattened. */
export function errText(err, T) {
  const raw = err?.response?.data?.detail_raw ?? err?.response?.data?.detail;
  const d = raw && typeof raw === "object" ? raw : null;
  if (!err?.response) return T.err.network;
  if (d?.code === "seat_taken" && d.judge) return fill(T.err.seat_taken_by, { judge: d.judge });
  if (d?.code && T.err[d.code]) return T.err[d.code];
  if (typeof raw === "string" && raw.length < 160) return raw;
  return T.err.generic;
}

export const detailOf = (err) => {
  const raw = err?.response?.data?.detail_raw ?? err?.response?.data?.detail;
  return raw && typeof raw === "object" ? raw : null;
};
