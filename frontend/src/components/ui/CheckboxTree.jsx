import { useMemo, useState } from "react";
import { Check, ChevronRight, Minus } from "lucide-react";

/**
 * Canonical nested checkbox tree — THE template for hierarchical multi-select
 * (parent groups with expand/collapse + tri-state "select all" checkboxes,
 * individually selectable leaves). Supports ARBITRARY nesting: the admin
 * Broadcast picker uses three levels — role ▸ profile ▸ Telegram user.
 *
 * A node is a BRANCH when it carries a `children` array (expandable, with a
 * tri-state rollup checkbox), otherwise a LEAF (directly selectable). Selection
 * is a flat array of LEAF keys, so the same leaf key appearing under several
 * branches is mirrored automatically — toggling it anywhere toggles it
 * everywhere (used for one Telegram user held across multiple profiles).
 *
 * Props:
 *   groups   – [{ key, label, icon, children:[…] }]; a child may be a leaf
 *              { key, label, sub, disabled, hint } or another branch with its
 *              own `children`. `sub` renders muted under the label; `hint`
 *              renders as a chip on disabled rows (e.g. "no registered users").
 *   selected – array of selected LEAF keys (controlled)
 *   onChange – (nextSelectedArray) => void
 *   filter   – search string: matches leaf label/sub; a branch-label match
 *              keeps the whole subtree; matching auto-expands
 *   emptyText – centered muted text when the filter matches nothing
 */

const isBranch = (n) => Array.isArray(n.children);

// Unique, enabled leaf keys in a node's subtree (for rollup + select-all).
function leafKeys(node) {
  if (!isBranch(node)) return node.disabled ? [] : [node.key];
  return node.children.flatMap(leafKeys);
}
const uniqLeaves = (node) => [...new Set(leafKeys(node))];

// Every selectable leaf key across a set of groups (page-level select-all).
export function collectLeafKeys(groups) {
  return [...new Set((groups || []).flatMap(leafKeys))];
}

function filterNode(node, q) {
  const selfMatch =
    (node.label || "").toLowerCase().includes(q) ||
    (node.sub || "").toLowerCase().includes(q);
  if (!isBranch(node)) return selfMatch ? node : null;
  if (selfMatch) return node; // branch label matches → keep whole subtree
  const kids = node.children.map((c) => filterNode(c, q)).filter(Boolean);
  return kids.length ? { ...node, children: kids } : null;
}

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

function TreeNode({ node, depth, sel, expanded, toggleExpand, toggleLeaf, toggleBranch, forceOpen }) {
  // ── Leaf ────────────────────────────────────────────────────────────────
  if (!isBranch(node)) {
    const on = sel.has(node.key);
    return (
      <div
        role="checkbox"
        aria-checked={on}
        aria-disabled={node.disabled || undefined}
        className={`flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors ${
          node.disabled ? "cursor-not-allowed" : "cursor-pointer hover:bg-[var(--bg-inner)]"
        }`}
        onClick={() => toggleLeaf(node)}
      >
        <CheckBox state={on ? "on" : "off"} disabled={node.disabled} />
        <span className="min-w-0" style={{ opacity: node.disabled ? 0.5 : 1 }}>
          <span className="block text-[13px] truncate" style={{ color: "var(--text-1)" }}>
            {node.label}
          </span>
          {node.sub && (
            <span className="block text-[11px] truncate" style={{ color: "var(--text-4)" }}>
              {node.sub}
            </span>
          )}
        </span>
        {node.disabled && node.hint && (
          <span
            className="ml-auto flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded-full whitespace-nowrap"
            style={{ background: "var(--bg-accent)", color: "var(--text-4)", border: "1px solid var(--border)" }}
          >
            {node.hint}
          </span>
        )}
      </div>
    );
  }

  // ── Branch ──────────────────────────────────────────────────────────────
  const Icon = node.icon;
  const keys = uniqLeaves(node);
  const onCount = keys.filter((k) => sel.has(k)).length;
  const state = onCount === 0 ? "off" : onCount === keys.length ? "on" : "some";
  const open = forceOpen || expanded.has(node.key);
  const topLevel = depth === 0;

  return (
    <div>
      <div
        className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors hover:bg-[var(--bg-inner)]"
        onClick={() => toggleExpand(node.key)}
      >
        <ChevronRight
          size={14}
          className="flex-shrink-0 transition-transform"
          style={{ color: "var(--text-4)", transform: open ? "rotate(90deg)" : "none" }}
        />
        <span
          onClick={(e) => { e.stopPropagation(); toggleBranch(node); }}
          className="flex items-center"
          role="checkbox"
          aria-checked={state === "some" ? "mixed" : state === "on"}
        >
          <CheckBox state={state} disabled={!keys.length} />
        </span>
        {Icon && <Icon size={13} className="flex-shrink-0" style={{ color: "var(--brand-text)" }} />}
        <span
          className={topLevel
            ? "text-xs font-semibold uppercase tracking-wider truncate"
            : "text-[13px] font-medium truncate"}
          style={{ color: topLevel ? "var(--text-2)" : "var(--text-1)" }}
        >
          {node.label}
        </span>
        <span
          className="ml-auto text-[10px] font-medium tabular-nums flex-shrink-0"
          style={{ color: onCount > 0 ? "var(--brand-text)" : "var(--text-4)" }}
        >
          {onCount}/{keys.length}
        </span>
      </div>
      {open && (
        <div className="pl-5">
          {node.children.map((c) => (
            <TreeNode
              key={c.key}
              node={c}
              depth={depth + 1}
              sel={sel}
              expanded={expanded}
              toggleExpand={toggleExpand}
              toggleLeaf={toggleLeaf}
              toggleBranch={toggleBranch}
              forceOpen={forceOpen}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CheckboxTree({ groups, selected, onChange, filter = "", emptyText }) {
  const [expanded, setExpanded] = useState(() => new Set());
  const sel = useMemo(() => new Set(selected), [selected]);
  const q = filter.trim().toLowerCase();

  const visible = useMemo(() => {
    if (!q) return groups;
    return (groups || []).map((g) => filterNode(g, q)).filter(Boolean);
  }, [groups, q]);

  const toggleLeaf = (node) => {
    if (node.disabled) return;
    const next = new Set(sel);
    next.has(node.key) ? next.delete(node.key) : next.add(node.key);
    onChange([...next]);
  };

  const toggleBranch = (node) => {
    const keys = uniqLeaves(node);
    if (!keys.length) return;
    const allOn = keys.every((k) => sel.has(k));
    const next = new Set(sel);
    keys.forEach((k) => (allOn ? next.delete(k) : next.add(k)));
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
      {visible.map((g) => (
        <TreeNode
          key={g.key}
          node={g}
          depth={0}
          sel={sel}
          expanded={expanded}
          toggleExpand={toggleExpand}
          toggleLeaf={toggleLeaf}
          toggleBranch={toggleBranch}
          forceOpen={!!q}
        />
      ))}
    </div>
  );
}
