// One goal on the board: its area, its status, the ring, the pace bar and the
// first few key results. Every figure comes from utils/targets — the card
// computes nothing of its own.
import { CalendarClock, Pencil, Trash2, ArrowUpRight } from "lucide-react";
import Button from "../ui/Button";
import ProgressRing from "./ProgressRing";
import { StatusChip, CategoryTag, TypeIcon, OwnerAvatar, PaceBar, MiniBar } from "./bits";
import { valueLabel } from "./targetsUi";
import { useLang } from "../../context/LangContext";
import { AMBER, RED } from "../../utils/statusBands";
import {
  goalProgress, goalStatus, elapsed, daysLeft, targetProgress, targetStatus,
  fmtPct, fmtDate, fill, hexA, categoryColor,
  STATUS_COLOR, RISK_STATUSES,
} from "../../utils/targets";

const MAX_ROWS = 4;

// «12 kun qoldi» / «Bugun oxirgi kun» / «3 kun kechikdi» — red once the date
// has passed, amber in the last three days, muted otherwise.
export function DaysLeft({ left, t, className = "" }) {
  if (left === null || left === undefined) return null;
  const txt = left < 0
    ? fill(t("targets.daysOver"), { n: -left })
    : left === 0 ? t("targets.dueToday") : fill(t("targets.daysLeft"), { n: left });
  const color = left < 0 ? RED : left <= 3 ? AMBER : "var(--text-4)";
  return <span className={`text-[11px] whitespace-nowrap ${className}`} style={{ color }}>{txt}</span>;
}

export default function GoalCard({ goal, today, onOpen, onEdit, onDelete }) {
  const { t } = useLang();
  const p = goalProgress(goal);
  const st = goalStatus(goal, today);
  const e = elapsed(goal, today);
  const left = daysLeft(goal, today);
  const color = STATUS_COLOR[st];
  const targets = goal.targets ?? [];
  const done = targets.filter((tg) => targetProgress(tg) >= 1).length;
  const rows = targets.slice(0, MAX_ROWS);

  return (
    <div
      className="rounded-2xl p-4 pl-5 flex flex-col gap-3 relative overflow-hidden"
      style={{
        background: "var(--bg-card)",
        border: `1px solid ${RISK_STATUSES.has(st) ? hexA(color, 0.45) : "var(--border)"}`,
      }}
    >
      {/* The area's colour as a spine on the left edge — a category, so it
          never competes with the status chip for the reader's eye. */}
      <span aria-hidden className="absolute left-0 top-0 bottom-0 w-1" style={{ background: categoryColor(goal.category) }} />

      <div className="flex items-center justify-between gap-2">
        <CategoryTag category={goal.category} t={t} />
        <StatusChip status={st} t={t} />
      </div>

      <div className="min-w-0">
        <button
          type="button"
          onClick={onOpen}
          className="text-left font-semibold text-sm leading-snug hover:underline underline-offset-2"
          style={{ color: "var(--text-1)" }}
        >
          {goal.title}
        </button>
        {goal.description && (
          <p className="text-xs mt-1 line-clamp-2" style={{ color: "var(--text-3)" }}>{goal.description}</p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <ProgressRing value={p} size={72} stroke={8} color={color} />
        <div className="min-w-0 flex-1 space-y-1.5 text-xs">
          <div className="flex items-center gap-1.5 min-w-0">
            <OwnerAvatar name={goal.owner} size={20} />
            <span className="truncate" style={{ color: goal.owner ? "var(--text-2)" : "var(--text-4)" }}>
              {goal.owner || t("targets.noOwner")}
            </span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <CalendarClock size={13} className="flex-shrink-0" style={{ color: "var(--text-4)" }} />
            <span style={{ color: "var(--text-2)" }}>{goal.due ? fmtDate(goal.due, t, today) : t("targets.noDates")}</span>
            {st !== "achieved" && <DaysLeft left={left} t={t} />}
          </div>
          <div className="flex items-center gap-1.5" title={t("targets.expectedHint")}>
            <span style={{ color: "var(--text-4)" }}>{t("targets.expected")}:</span>
            <span className="font-mono font-semibold tabular-nums" style={{ color: "var(--text-2)" }}>
              {e === null ? "—" : fmtPct(e)}
            </span>
          </div>
        </div>
      </div>

      <PaceBar progress={p} expected={e} color={color} />

      <ul className="space-y-1.5">
        {rows.map((tg) => (
          <li key={tg.id} className="flex items-center gap-2 text-xs min-w-0">
            <TypeIcon type={tg.type} size={12} className="flex-shrink-0" style={{ color: "var(--text-4)" }} />
            <span className="truncate flex-1 min-w-0" style={{ color: "var(--text-2)" }}>{tg.title}</span>
            <MiniBar
              value={targetProgress(tg)}
              color={STATUS_COLOR[targetStatus(tg, goal, today)]}
              className="w-14 flex-shrink-0"
            />
            <span className="font-mono tabular-nums whitespace-nowrap flex-shrink-0 text-[11px]" style={{ color: "var(--text-3)" }}>
              {valueLabel(tg, t)}
            </span>
          </li>
        ))}
        {targets.length > MAX_ROWS && (
          <li className="text-[11px]" style={{ color: "var(--text-4)" }}>+{targets.length - MAX_ROWS}</li>
        )}
      </ul>

      <div className="flex items-center justify-between gap-2 pt-2 mt-auto" style={{ borderTop: "1px solid var(--border)" }}>
        <span className="text-[11px] whitespace-nowrap" style={{ color: "var(--text-4)" }}>
          {fill(t("targets.resultsCount"), { done, total: targets.length })}
        </span>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="secondary" tint icon={<Pencil size={12} />} onClick={onEdit} aria-label={t("common.edit")} title={t("common.edit")} />
          <Button size="sm" variant="danger" tint icon={<Trash2 size={12} />} onClick={onDelete} aria-label={t("common.delete")} title={t("common.delete")} />
          <Button size="sm" variant="primary" tint icon={<ArrowUpRight size={12} />} onClick={onOpen}>{t("targets.viewDetail")}</Button>
        </div>
      </div>
    </div>
  );
}
