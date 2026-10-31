// «Xodim kartasi» — the page's shared vocabulary: its words, the date and
// tenure formats, and PersonLink, THE way a person's name elsewhere on the
// platform opens their card.
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useLang } from "../../context/LangContext";
import { useAuth } from "../../context/AuthContext";
import { usePageAccess } from "../../hooks/usePageAccess";
import { useCapabilities } from "../../hooks/useCapabilities";
import { canAccessPage } from "../../config/pages";
import { TXT, fill } from "../../pages/peopleText";

export { fill };

export function useP() {
  const { lang } = useLang();
  return useMemo(() => TXT[lang] || TXT.uz, [lang]);
}

/** May this viewer open `page` (the route guard's own answer)? */
export function useCanOpen(page) {
  const { auth } = useAuth();
  const { access } = usePageAccess();
  const { capPages, deniedPages } = useCapabilities();
  return canAccessPage(auth?.role, page, access, capPages, deniedPages);
}

/** May this viewer open the card at all (`people` page access)? */
export const useCanOpenPeople = () => useCanOpen("people");

/** Verifix spells names in CAPITALS («QODIROVA DILNOZA BAXTIYOR QIZI»); a
 *  shouted name reads in title case (only the first letter of each word is
 *  raised, /kelish's rule, so «O'G'LI» reads «O'g'li»). A name already in
 *  mixed case is left as typed. */
export function nameCase(s) {
  const v = String(s || "");
  if (/\p{Ll}/u.test(v)) return v;
  return v.toLocaleLowerCase().replace(/(^|[\s-])(\S)/gu, (_, a, b) => a + b.toLocaleUpperCase());
}

export function fmtDate(iso) {
  if (!iso) return "—";
  const d = String(iso).slice(0, 10).split("-");
  return d.length === 3 ? `${d[2]}.${d[1]}.${d[0]}` : iso;
}

export function fmtShort(iso) {
  if (!iso) return "—";
  const d = String(iso).slice(0, 10).split("-");
  return d.length === 3 ? `${d[2]}.${d[1]}` : iso;
}

export function tenureText(months, P) {
  if (months == null) return "—";
  if (months < 1) return P.tenureLess;
  const y = Math.floor(months / 12), m = months % 12;
  if (!y) return fill(P.tenureM, { m });
  if (!m) return fill(P.tenureY, { y });
  return fill(P.tenureYM, { y, m });
}

/** A neutral chip — a property, never a status. */
export function Chip({ icon: Icon, children, title, className = "" }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-[2px] text-[11px] font-medium whitespace-nowrap ${className}`}
      style={{ background: "var(--bg-inner)", color: "var(--text-2)", border: "1px solid var(--border)" }}
    >
      {Icon && <Icon size={11} aria-hidden="true" />}
      {children}
    </span>
  );
}

/**
 * THE pressable person reference — a name rendered as CONTENT elsewhere on the
 * platform opens their card. `employeeId` when the row carries the Verifix id
 * (a live day, the compliance list); otherwise the NAME (+ the row's cell
 * `code`) goes through `/people?find=…`, which opens the card when the name is
 * one person and lists the namesakes when it is not — never a guess.
 *
 * Inert (plain text) for a viewer who may not open the card, so a link never
 * 403s. Clicks stop propagation, so it nests in clickable rows (CellLink's
 * rule); the look is CellLink's dotted underline (`.cell-link`).
 */
export function PersonLink({ employeeId, name, code, children, className = "", title, style }) {
  const navigate = useNavigate();
  const can = useCanOpenPeople();
  const to = employeeId
    ? `/people/${encodeURIComponent(employeeId)}`
    : name
      ? `/people?${new URLSearchParams({ find: name, ...(code ? { code } : {}) }).toString()}`
      : null;
  if (!can || !to) {
    return <span className={className} title={title} style={style}>{children}</span>;
  }
  return (
    <button
      type="button"
      className={`cell-link text-left ${className}`}
      title={title}
      style={style}
      onClick={(e) => { e.stopPropagation(); navigate(to); }}
    >
      {children}
    </button>
  );
}

/** A refusal from the server, in words. */
export function errText(err, P) {
  const raw = err?.response?.data?.detail_raw ?? err?.response?.data?.detail;
  const code = raw && typeof raw === "object" ? raw.code : null;
  if (code && P.err[code]) return P.err[code];
  if (!err?.response) return P.err.network;
  if (typeof raw === "string") return raw;
  return P.err.generic;
}
