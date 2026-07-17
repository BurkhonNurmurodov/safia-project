import { useMemo, useState } from "react";
import { Check, ChevronRight, Minus } from "lucide-react";

/**
 * Canonical nested checkbox tree — THE template for hierarchical multi-select
 * (parent groups with expand/collapse + tri-state "select all" checkboxes,
 * individually selectable children). First used by the admin Broadcast
 * recipients picker (roles → profiles).
 *
 * Props:
 *   groups   – [{ key, label, icon, children: [{ key, label, sub, disabled, hint }] }]
 *              `sub` renders muted under the label; `hint` renders as a small
 *              chip on disabled rows (e.g. "not registered").
 *   selected – array of selected CHILD keys (controlled)
 *   onChange – (nextSelectedArray) => void
 *   filter   – search string: matches child label/sub (group label matches
 *              keep the whole group); matching auto-expands
 *   emptyText – centered muted text when the filter matches nothing
 */

function CheckBox({ state, disabled }) { // state: "on" | "some" | "off"
  const on = state !== "off";
  return (
    <span
      className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-colors"
      style={on
        ? { background: "var(--brand)", border: "1px solid var(--brand)", color: "#fff" }
        : { background: "var(--bg-inner)", border: "1px solid var(--border-md)", opacity: disabled ? 0.4 : 1 }}
    >
      {state === "on" && <Check size={11} strokeWidth={3} />}
      {state === "some" && <Minus size={11} strokeWidth={3} />}
    </span>
  );
}

export default function CheckboxTree({ groups, selected, onChange, filter = "", emptyText }) {
  const [expanded, setExpanded] = useState(() => new Set());
  const sel = useMemo(() => new Set(selected), [selected]);
  const q = filter.trim().toLowerCase();

  const visible = useMemo(() => {
    if (!q) return groups;
    return groups
      .map((g) => {
        if (g.label.toLowerCase().includes(q)) return g;
        const children = g.children.filter((c) =>
          c.label.toLowerCase().includes(q) || (c.sub || "").toLowerCase().includes(q));
        return children.length ? { ...g, children } : null;
      })
      .filter(Boolean);
  }, [groups, q]);

  const toggleChild = (c) => {
    if (c.disabled) return;
    const next = new Set(sel);
    next.has(c.key) ? next.delete(c.key) : next.add(c.key);
    onChange([...next]);
  };

  const toggleGroup = (g) => {
    const enabled = g.children.filter((c) => !c.disabled);
    if (!enabled.length) return;
    const allOn = enabled.every((c) => sel.has(c.key));
    const next = new Set(sel);
    enabled.forEach((c) => (allOn ? next.delete(c.key) : next.add(c.key)));
    onChange([...next]);
  };

  const toggleExpand = (key) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  if (!visible.length) {
    return (
      <div className="py-8 text-center text-xs" style={{ color: "var(--text-4)" }}>
        {emptyText}
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {visible.map((g) => {
        const Icon = g.icon;
        const enabled = g.children.filter((c) => !c.disabled);
        const onCount = enabled.filter((c) => sel.has(c.key)).length;
        const state = onCount === 0 ? "off" : onCount === enabled.length ? "on" : "some";
        const open = q ? true : expanded.has(g.key);
        return (
          <div key={g.key}>
            <div
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors hover:bg-[var(--bg-inner)]"
              onClick={() => toggleExpand(g.key)}
            >
              <ChevronRight
                size={14}
                className="flex-shrink-0 transition-transform"
                style={{ color: "var(--text-4)", transform: open ? "rotate(90deg)" : "none" }}
              />
              <span
                onClick={(e) => { e.stopPropagation(); toggleGroup(g); }}
                className="flex items-center"
                role="checkbox"
                aria-checked={state === "some" ? "mixed" : state === "on"}
              >
                <CheckBox state={state} disabled={!enabled.length} />
              </span>
              {Icon && <Icon size={13} className="flex-shrink-0" style={{ color: "var(--brand-text)" }} />}
              <span className="text-xs font-semibold uppercase tracking-wider truncate" style={{ color: "var(--text-2)" }}>
                {g.label}
              </span>
              <span
                className="ml-auto text-[10px] font-medium tabular-nums flex-shrink-0"
                style={{ color: onCount > 0 ? "var(--brand-text)" : "var(--text-4)" }}
              >
                {onCount}/{enabled.length}
              </span>
            </div>
            {open && (
              <div className="pl-7">
                {g.children.map((c) => (
                  <div
                    key={c.key}
                    role="checkbox"
                    aria-checked={sel.has(c.key)}
                    aria-disabled={c.disabled || undefined}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors ${
                      c.disabled ? "cursor-not-allowed" : "cursor-pointer hover:bg-[var(--bg-inner)]"
                    }`}
                    onClick={() => toggleChild(c)}
                  >
                    <CheckBox state={sel.has(c.key) ? "on" : "off"} disabled={c.disabled} />
                    <span className="min-w-0" style={{ opacity: c.disabled ? 0.5 : 1 }}>
                      <span className="block text-[13px] truncate" style={{ color: "var(--text-1)" }}>
                        {c.label}
                      </span>
                      {c.sub && (
                        <span className="block text-[11px] truncate" style={{ color: "var(--text-4)" }}>
                          {c.sub}
                        </span>
                      )}
                    </span>
                    {c.disabled && c.hint && (
                      <span
                        className="ml-auto flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded-full whitespace-nowrap"
                        style={{ background: "var(--bg-accent)", color: "var(--text-4)", border: "1px solid var(--border)" }}
                      >
                        {c.hint}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
