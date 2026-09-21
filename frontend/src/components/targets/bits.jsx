// Small shared pieces of the Targets board — the status chip, the type icon,
// the owner avatar, the pace bar. One spelling each, so the card, the table
// and the detail modal cannot draw one status three ways.
import { Hash, CircleDashed, TrendingUp, TrendingDown, UserRound } from "lucide-react";
import { STATUS_COLOR, categoryColor, hexA } from "../../utils/targets";
import { TYPE_ICON, STATUS_ICON } from "./targetsUi";

export function StatusChip({ status, t, size = "sm" }) {
  const Icon = STATUS_ICON[status] ?? CircleDashed;
  const c = STATUS_COLOR[status] ?? STATUS_COLOR.not_started;
  const sm = size === "sm";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold whitespace-nowrap ${sm ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs"}`}
      style={{ background: hexA(c, 0.14), color: c, border: `1px solid ${hexA(c, 0.35)}` }}
    >
      <Icon size={sm ? 11 : 13} strokeWidth={2.4} />
      {t(`targets.st.${status}`)}
    </span>
  );
}

export function CategoryTag({ category, t, className = "" }) {
  const c = categoryColor(category);
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${className}`} style={{ color: "var(--text-3)" }}>
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c }} />
      {t(`targets.cat.${category}`)}
    </span>
  );
}

export function TypeIcon({ type, size = 13, style, className = "" }) {
  const Icon = TYPE_ICON[type] ?? Hash;
  return <Icon size={size} strokeWidth={2.2} style={style} className={className} />;
}

export function DirIcon({ direction, size = 12, style }) {
  const Icon = direction === "down" ? TrendingDown : TrendingUp;
  return <Icon size={size} strokeWidth={2.4} style={style} />;
}

const initials = (name) =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

export function OwnerAvatar({ name, size = 22 }) {
  const has = !!(name && name.trim());
  return (
    <span
      className="inline-grid place-items-center rounded-full flex-shrink-0 font-bold"
      title={has ? name : undefined}
      style={{
        width: size, height: size, fontSize: Math.round(size * 0.4),
        background: has ? "var(--brand-bg)" : "transparent",
        color: has ? "var(--brand-text)" : "var(--text-4)",
        border: has ? "1px solid var(--brand-border)" : "1px dashed var(--border-md)",
      }}
    >
      {has ? initials(name) : <UserRound size={Math.round(size * 0.55)} />}
    </span>
  );
}

// A horizontal progress bar with the linear EXPECTATION marked on it (▲ under
// the track): the fill ahead of the marker reads as on pace at a glance, and a
// marker with nothing behind it is a goal nobody has touched.
export function PaceBar({ progress, expected, color, height = 8, className = "" }) {
  const p = Math.min(1, Math.max(0, progress || 0)) * 100;
  const e = expected === null || expected === undefined ? null : Math.min(1, Math.max(0, expected)) * 100;
  return (
    <div className={`relative ${className}`} style={{ paddingBottom: e === null ? 0 : 8 }}>
      <div className="w-full rounded-full overflow-hidden" style={{ height, background: "var(--bg-accent)" }}>
        <div
          className="h-full rounded-full"
          style={{ width: `${p}%`, background: color, transition: "width .5s var(--ease-out)" }}
        />
      </div>
      {e !== null && (
        <span
          aria-hidden
          className="absolute"
          style={{
            left: `calc(${e}% - 4px)`, top: height + 1, width: 0, height: 0,
            borderLeft: "4px solid transparent", borderRight: "4px solid transparent",
            borderBottom: "6px solid var(--text-3)",
          }}
        />
      )}
    </div>
  );
}

export function MiniBar({ value, color, className = "w-full" }) {
  const p = Math.min(1, Math.max(0, value || 0)) * 100;
  return (
    <div className={`rounded-full overflow-hidden ${className}`} style={{ height: 5, background: "var(--bg-accent)" }}>
      <div className="h-full rounded-full" style={{ width: `${p}%`, background: color, transition: "width .5s var(--ease-out)" }} />
    </div>
  );
}
