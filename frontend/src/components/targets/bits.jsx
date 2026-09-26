// Small shared pieces of the Targets board — the status chip, the area tag, the
// type icon, the pace bar, a result's value. One spelling each, so the board,
// a goal's page and the update dialog cannot draw one fact three ways.
import { Hash, CircleDashed, TrendingUp, TrendingDown, Check, Shapes } from "lucide-react";
import { STATUS_COLOR, hexA, fill } from "../../utils/targets";
import { GREEN } from "../../utils/statusBands";
import { TYPE_ICON, STATUS_ICON, AREA_ICON, krParts } from "./targetsUi";

export function StatusChip({ status, t, size = "sm", className = "" }) {
  const Icon = STATUS_ICON[status] ?? CircleDashed;
  const c = STATUS_COLOR[status] ?? STATUS_COLOR.not_started;
  const sm = size === "sm";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold whitespace-nowrap flex-shrink-0 ${sm ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs"} ${className}`}
      style={{ background: hexA(c, 0.14), color: c, border: `1px solid ${hexA(c, 0.35)}` }}
    >
      <Icon size={sm ? 11 : 13} strokeWidth={2.4} aria-hidden />
      {t(`targets.st.${status}`)}
    </span>
  );
}

// The goal's area — an icon and a name in the muted text colour. Deliberately
// colourless: colour on this board is the status, and only the status.
export function AreaTag({ category, t, iconStyle, className = "" }) {
  const Icon = AREA_ICON[category] ?? Shapes;
  return (
    <span className={`inline-flex items-center gap-1.5 min-w-0 ${className}`}>
      <Icon size={13} strokeWidth={2.2} className="flex-shrink-0" style={iconStyle} aria-hidden />
      <span className="truncate">{t(`targets.cat.${category}`)}</span>
    </span>
  );
}

export function TypeIcon({ type, size = 13, style, className = "" }) {
  const Icon = TYPE_ICON[type] ?? Hash;
  return <Icon size={size} strokeWidth={2.2} style={style} className={className} aria-hidden />;
}

export function DirIcon({ direction, size = 12, style }) {
  const Icon = direction === "down" ? TrendingDown : TrendingUp;
  return <Icon size={size} strokeWidth={2.4} style={style} aria-hidden />;
}

// The «plan for today» mark: a short upright bar. Drawn on the pace bar AND in
// front of the caption that names it, so the reader never needs a legend to
// connect the two.
export function PlanTick({ className = "" }) {
  return (
    <span
      aria-hidden
      className={`inline-block rounded-full flex-shrink-0 ${className}`}
      style={{ width: 2, height: 11, background: "var(--text-2)" }}
    />
  );
}

// Progress so far as a filled bar, with today's linear PLAN marked across it:
// fill past the mark is ahead of plan, fill short of it is behind. `ring` is
// the surface the bar sits on — it outlines the mark where the fill runs under
// it, so the mark reads on any status colour in either theme.
export function PaceBar({ progress, expected, color, height = 8, label, ring = "var(--bg-card)", className = "" }) {
  const p = Math.min(1, Math.max(0, progress || 0)) * 100;
  const e = expected === null || expected === undefined ? null : Math.min(1, Math.max(0, expected)) * 100;
  return (
    <div className={`relative ${className}`} role="img" aria-label={label} style={{ paddingBlock: e === null ? 0 : 3 }}>
      <div className="w-full rounded-full overflow-hidden" style={{ height, background: "var(--bg-accent)" }}>
        <div
          className="h-full rounded-full"
          style={{ width: `${p}%`, background: color, transition: "width .5s var(--ease-out)" }}
        />
      </div>
      {e !== null && (
        <span
          aria-hidden
          className="absolute top-0 bottom-0 rounded-full"
          style={{
            left: `clamp(0px, calc(${e}% - 1px), calc(100% - 2px))`, width: 2,
            background: "var(--text-2)", boxShadow: `0 0 0 1.5px ${ring}`,
          }}
        />
      )}
    </div>
  );
}

export function MiniBar({ value, color, height = 5, className = "w-full" }) {
  const p = Math.min(1, Math.max(0, value || 0)) * 100;
  return (
    <div className={`rounded-full overflow-hidden ${className}`} style={{ height, background: "var(--bg-accent)" }}>
      <div className="h-full rounded-full" style={{ width: `${p}%`, background: color, transition: "width .5s var(--ease-out)" }} />
    </div>
  );
}

// A result's value in its own terms: «47 → 40 daq», «Bajarildi», «2 / 5».
export function KrValue({ tg, t, className = "" }) {
  if (tg.type === "boolean") {
    return tg.done ? (
      <span className={`inline-flex items-center gap-1 font-medium whitespace-nowrap ${className}`} style={{ color: GREEN }}>
        <Check size={13} strokeWidth={2.6} aria-hidden />{t("targets.markDone")}
      </span>
    ) : (
      <span className={`whitespace-nowrap ${className}`} style={{ color: "var(--text-3)" }}>{t("targets.markUndone")}</span>
    );
  }
  if (tg.type === "tasks") {
    const items = tg.items ?? [];
    const d = items.filter((i) => i.done).length;
    return (
      <span className={`tabular-nums whitespace-nowrap ${className}`} aria-label={fill(t("targets.tasksDone"), { done: d, total: items.length })}>
        <span className="font-semibold" style={{ color: "var(--text-1)" }}>{d}</span>
        <span style={{ color: "var(--text-3)" }}> / {items.length}</span>
      </span>
    );
  }
  const { cur, tgt, unit } = krParts(tg, t);
  return (
    <span className={`tabular-nums whitespace-nowrap ${className}`} aria-label={fill(t("targets.krAria"), { cur: `${cur}${unit}`, tgt: `${tgt}${unit}` })}>
      <span aria-hidden className="font-semibold" style={{ color: "var(--text-1)" }}>{cur}</span>
      <span aria-hidden style={{ color: "var(--text-3)" }}> → {tgt}{unit}</span>
    </span>
  );
}
