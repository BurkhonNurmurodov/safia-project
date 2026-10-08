// A day's workers on a PHONE (below `sm`) — every column the desktop table
// carries, none dropped. A nine-column table scrolled sideways lost the name on
// the first swipe, so each worker reads top to bottom instead:
//
//   name (+ the task they were moved to)            hours  (+ «so far»)
//   status · move · role · cell · schedule
//   clock in–out · early minutes · effective hours
//
// The values are the table's own, formatted by the caller exactly as its cells
// format them — this file lays them out and decides nothing. A value the row
// does not have is left out rather than printed as a dash: «erta — daq» would
// be a label with nothing behind it. Hours keep their «—», the one figure every
// row is read for.
import { Fragment } from "react";
import { FolderOpen } from "lucide-react";
import CellLink from "../ui/CellLink";
import { useLang } from "../../context/LangContext";

const fill = (s, p) => String(s).replace(/\{(\w+)\}/g, (_, k) => (p[k] ?? ""));

// Items separated by a middle dot, laid out as running text so a long item
// wraps like a sentence. The dot is glued to the item BEFORE it by a no-break
// space, so a wrapped line never starts with a stray «·». `as="span"` inside a
// button, where a <div> is not allowed.
export function Dotted({ parts, className, style, as: Tag = "div" }) {
  const shown = parts.filter(Boolean);
  if (!shown.length) return null;
  return (
    <Tag className={className} style={style}>
      {shown.map((p, i) => (
        <Fragment key={i}>
          {p}
          {i < shown.length - 1 && (
            <>
              <span aria-hidden="true" style={{ color: "var(--text-4)" }}>{"\u00A0·"}</span>{" "}
            </>
          )}
        </Fragment>
      ))}
    </Tag>
  );
}

/**
 * items: [{
 *   key, name, task?, status?, note?, role?, cell?: {id, code}, schedule?,
 *   clock?, hours? (formatted, null = none), soFar?, early? (minutes), eff? (formatted)
 * }]
 */
export default function StaffPhoneList({ items, label }) {
  const { t } = useLang();
  // A part that is one fact moves to the next line WHOLE rather than splitting
  // («08:00 -» / «20:00»); only a part longer than a full line wraps inside.
  const unit = "inline-block max-w-full";
  return (
    <ul aria-label={label}>
      {items.map((it) => (
        // The hours float right, so the name and the line under it run beside
        // them and every line after takes the card's full width.
        <li key={it.key} className="px-4 py-3 border-b last:border-b-0 flow-root" style={{ borderColor: "var(--border)" }}>
          {/* The figure the row is read for, on the right edge so a column of
              them can be run down; «so far» under it while the day still runs. */}
          <div className="float-right ml-3 text-right leading-snug tabular-nums whitespace-nowrap">
            {it.hours != null ? (
              <>
                <span className="text-[15px] font-semibold" style={{ color: "var(--text-1)" }}>{it.hours}</span>
                <span className="text-xs ml-1" style={{ color: "var(--text-3)" }}>{t("daily.hrs")}</span>
              </>
            ) : (
              <span className="text-[15px]" style={{ color: "var(--text-3)" }}>—</span>
            )}
            {it.soFar && (
              <div className="text-[11px]" style={{ color: "var(--text-3)" }}>{t("staffLive.sum.soFar")}</div>
            )}
          </div>

          <div className="text-[15px] leading-snug font-medium break-words" style={{ color: "var(--text-1)" }}>
            {it.name}
            {it.task && (
              <span className="ml-1.5 inline-flex items-center gap-1 align-[1px] text-[11px] leading-4 font-medium px-1.5 rounded-full"
                style={{ background: "var(--brand-bg)", color: "var(--brand-text)", border: "1px solid var(--border-md)" }}>
                <FolderOpen size={11} aria-hidden="true" />
                <span className="sr-only">{t("staff.onTask")}: </span>{it.task}
              </span>
            )}
          </div>

          <Dotted
            className="mt-0.5 text-[13px] leading-5 break-words"
            style={{ color: "var(--text-3)" }}
            parts={[
              it.status,
              it.note,
              it.role && <span className={unit}>{it.role}</span>,
              it.cell && (
                // The code is a link onto /cells/:id; its tap pad reaches past
                // the four digits so a thumb lands on it.
                <CellLink id={it.cell.id}
                  className="font-mono relative before:absolute before:-inset-x-2 before:-inset-y-2.5 before:content-['']"
                  style={{ color: "var(--text-2)" }}>
                  {it.cell.code}
                </CellLink>
              ),
              it.schedule && <span className={`${unit} tabular-nums`}>{it.schedule}</span>,
            ]}
          />

          <Dotted
            className="mt-1 text-[13px] leading-5 tabular-nums"
            style={{ color: "var(--text-2)" }}
            parts={[
              <span className={unit}>{it.clock || "—"}</span>,
              it.early != null && <span className={unit}>{fill(t("staff.m.early"), { n: it.early })}</span>,
              it.eff != null && <span className={unit}>{fill(t("staff.m.eff"), { v: it.eff })}</span>,
            ]}
          />
        </li>
      ))}
    </ul>
  );
}
