import { Pencil, Trash2, Square, Play, Sunrise, Layers2 } from "lucide-react";
import Button from "../ui/Button";
import { CATEGORY_COLORS } from "../../utils/chartPalette";
import { CATS, iconFor } from "./categories";
import { fmtDur } from "../../utils/idleTime";

// ONE ojidaniya, rendered the same way on both tabs — the category-grouped
// «Kutish» list hides the category chip (its heading already says it) and the
// timeline's chronological log shows it.
//
// Every fact on the row carries a shape as well as a colour: the stopped answer
// is an icon + word, the midnight carry is a labelled chip, and an overlap says
// what it means in its tooltip rather than relying on the reader to work out
// why one row is tinted.
export default function IntervalRow({
  iv, t, showCategory = false, overlapping = false, onEdit, onDelete, dense = false,
}) {
  const idx = CATS.findIndex((c) => c.name === iv.category);
  const code = idx >= 0 ? CATS[idx].code : "";
  const color = CATEGORY_COLORS[(idx < 0 ? 0 : idx) % CATEGORY_COLORS.length];
  const Icon = iconFor(code);

  return (
    <div
      className={`group flex items-start gap-2 ${dense ? "px-2.5 py-1.5" : "px-3 py-2"} transition-colors`}
      style={{ borderTop: "1px solid var(--border)" }}
    >
      <div className="min-w-0 flex-1 flex flex-col gap-0.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          {showCategory && (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0"
              style={{ background: `${color}22`, color, border: `1px solid ${color}55` }}
            >
              <Icon size={10} />
              {t("idleCell.category")} {code}
            </span>
          )}
          <span className="text-xs font-semibold tabular-nums" style={{ color: "var(--text-1)" }}>
            {iv.start} → {iv.end}
          </span>
          <span className="text-[11px] tabular-nums" style={{ color: "var(--text-3)" }}>
            {fmtDur(iv.minutes, t)}
          </span>

          {/* Did the cell stop for THIS one — the answer that decides whether
              these minutes enter the day's total at all. */}
          <span
            className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0"
            style={iv.stopped
              ? { background: "rgba(239,68,68,0.14)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.35)" }
              : { background: "rgba(148,163,184,0.14)", color: "var(--text-3)", border: "1px solid rgba(148,163,184,0.35)" }}
            title={iv.stopped ? t("idleCell.stoppedHint") : t("idleCell.notCountedHint")}
          >
            {iv.stopped ? <Square size={9} /> : <Play size={9} />}
            {iv.stopped ? t("idleCell.stopped") : t("idleCell.notStopped")}
          </span>

          {iv.next_day && (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0"
              style={{ background: "rgba(148,163,184,0.18)", color: "var(--text-2)" }}
              title={t("idleCell.nextDayHint")}
            >
              <Sunrise size={9} />
              {t("idleCell.nextDay")}
            </span>
          )}

          {/* The whole reason this page was rebuilt: these minutes are shared
              with another ojidaniya, and are counted ONCE. */}
          {overlapping && (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0"
              style={{ background: "rgba(234,179,8,0.16)", color: "#eab308", border: "1px solid rgba(234,179,8,0.4)" }}
              title={t("idleCell.overlapHint")}
            >
              <Layers2 size={9} />
              {t("idleCell.overlapChip")}
            </span>
          )}
        </div>

        <div className="text-[11px] leading-snug break-words" style={{ color: "var(--text-3)" }} title={iv.note}>
          {iv.note}
        </div>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        <Button
          size="sm" variant="secondary" tint icon={<Pencil size={13} />}
          className="min-h-[32px] min-w-[32px]"
          aria-label={t("idleCell.editInterval")}
          title={t("idleCell.editInterval")}
          onClick={() => onEdit(iv)}
        />
        <Button
          size="sm" variant="danger" tint icon={<Trash2 size={13} />}
          className="min-h-[32px] min-w-[32px]"
          aria-label={t("idleCell.deleteInterval")}
          title={t("idleCell.deleteInterval")}
          onClick={() => onDelete(iv)}
        />
      </div>
    </div>
  );
}
