// Small shared pieces of the notification rows.

// The category (or queue kind) icon in a neutral chip; its INK carries the
// row's status tone when it has one — the only colour on a row.
export function IconChip({ Icon, ink }) {
  return (
    <span
      aria-hidden="true"
      className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
      style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}
    >
      <Icon size={16} style={{ color: ink || "var(--text-2)" }} />
    </span>
  );
}

// A soft status chip — tinted ground, the status ink, an icon beside the words
// so it never leans on colour alone.
const CHIP = {
  ok:   { bg: "rgba(34,197,94,0.12)",  fg: "var(--status-ok)" },
  warn: { bg: "rgba(234,179,8,0.14)",  fg: "var(--status-warn)" },
  bad:  { bg: "rgba(239,68,68,0.12)",  fg: "var(--status-bad)" },
  hot:  { bg: "rgba(249,115,22,0.12)", fg: "#f97316" },
};

export function StatusChip({ tone = "ok", icon: Icon, children }) {
  const c = CHIP[tone] || CHIP.ok;
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ background: c.bg, color: c.fg }}
    >
      {Icon && <Icon size={12} aria-hidden="true" />}
      {children}
    </span>
  );
}

// The 8px «unread» mark. Rendered for every row — hidden, not removed, when
// read — so read and unread rows keep one left edge.
export function UnreadDot({ on, label }) {
  return (
    <span className="flex-shrink-0 w-2 pt-3" aria-hidden={!on}>
      <span
        className="block w-2 h-2 rounded-full"
        style={{ background: "var(--brand)", visibility: on ? "visible" : "hidden" }}
        title={on ? label : undefined}
      />
      {on && <span className="sr-only">{label}</span>}
    </span>
  );
}
