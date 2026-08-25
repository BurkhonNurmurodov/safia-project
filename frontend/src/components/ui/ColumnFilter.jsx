// Shared per-column table-filter primitives.
// Used by the Staff "Requests"/Workers tables and the Overview supervisor table.
import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { SlidersHorizontal, X, ChevronDown, Check } from "lucide-react";
import { useLang } from "../../context/LangContext";
import { useDragSelect } from "../../hooks/useDragSelect";

// A column header with a popover filter. Pass `label` to render it next to the
// trigger, or omit it when the header already renders its own (sortable) label.
export function ColFilter({ label, active, children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const popRef = useRef(null);
  const [pos, setPos] = useState(null);
  useEffect(() => {
    if (!open) return;
    function h(e) {
      if (ref.current && ref.current.contains(e.target)) return;
      if (popRef.current && popRef.current.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  useEffect(() => {
    if (!open) { setPos(null); return; }
    function update() {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const minWidth = 180;
      let left = rect.left;
      const maxLeft = window.innerWidth - minWidth - 8;
      if (left > maxLeft) left = Math.max(8, maxLeft);
      setPos({ top: rect.bottom + 6, left, minWidth });
    }
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative inline-flex items-center gap-1 select-none">
      {label && <span style={{ color: "var(--text-3)" }}>{label}</span>}
      <button
        onClick={() => setOpen(o => !o)}
        className="p-0.5 rounded transition-colors"
        style={{
          color: active ? "var(--brand-text)" : "var(--text-4)",
          background: active ? "var(--brand-bg)" : "transparent",
        }}
      >
        <SlidersHorizontal size={10} />
      </button>
      {open && pos && createPortal(
        <div
          ref={popRef}
          className="rounded-xl p-3"
          style={{
            position: "fixed",
            top: pos.top,
            left: pos.left,
            zIndex: 1000,
            background: "var(--bg-card)",
            border: "1px solid var(--border-md)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
            minWidth: pos.minWidth,
          }}
          onClick={e => e.stopPropagation()}
        >
          {children}
        </div>,
        document.body
      )}
    </div>
  );
}

export function TxtFilter({ value, onChange, placeholder }) {
  const { t } = useLang();
  return (
    <div className="relative">
      <input
        value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder || t("staff.filter")} autoFocus
        className="w-full text-xs pl-2.5 py-1.5 pr-6 rounded-lg outline-none"
        style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}
      />
      {value && (
        <button onClick={() => onChange("")} className="absolute right-1.5 top-1/2 -translate-y-1/2"
          style={{ color: "var(--text-4)" }}>
          <X size={10} />
        </button>
      )}
    </div>
  );
}

// `searchable` adds a filter box above the checkboxes — needed once a column's
// distinct values run into the hundreds (worker names, clock strings), where
// scrolling a raw list is useless. Typing narrows the visible checkboxes only;
// "select all" still means every option, not just the matching ones.
// `groupBy` (optional) buckets the rows under small caption headers — pass a
// fn returning an option's group label. Groups keep the order they first
// appear in `opts`, so the caller controls both the group and the row order.
// `labelOf` (optional) gives the plain-text label used for search and the row
// tooltip when `render` returns a node AND the option itself is an opaque id
// (a category uuid rendered as «name · count») — without it the search box
// would match the id, never the name.
export function OptsFilter({ opts, sel, onChange, render, searchable = false, groupBy = null, labelOf = null, note = null }) {
  const { t } = useLang();
  const [q, setQ] = useState("");
  // `render` may return a node (chips, icons) — fall back to `labelOf`, then
  // the raw option, so search and the row tooltip stay meaningful instead of
  // "[object Object]".
  const label = (o) => {
    if (labelOf) return String(labelOf(o) ?? "");
    const r = render ? render(o) : o;
    return typeof r === "string" || typeof r === "number" ? String(r) : String(o ?? "");
  };
  const shown = searchable && q.trim()
    ? opts.filter(o => label(o).toLowerCase().includes(q.trim().toLowerCase()))
    : opts;
  // [groupLabel, opts[]] in first-appearance order; null when ungrouped.
  const groups = groupBy
    ? [...shown.reduce((m, o) => {
        const g = groupBy(o) ?? "";
        (m.get(g) || m.set(g, []).get(g)).push(o);
        return m;
      }, new Map())]
    : null;
  // `onChange` replaces the whole array and can't compose functional updates, so
  // keep a working Set snapshotted for the duration of a drag.
  const selRef = useRef(sel);
  useEffect(() => { selRef.current = sel; });
  const workRef = useRef(null);
  const dragRow = useDragSelect(
    o => selRef.current.includes(o),
    (o, value) => {
      const work = workRef.current || new Set(selRef.current);
      workRef.current = work;
      if (work.has(o) === value) return;
      value ? work.add(o) : work.delete(o);
      onChange([...work]);
    },
    {
      onStart: () => { workRef.current = new Set(selRef.current); },
      onEnd:   () => { workRef.current = null; },
    },
  );
  const optRow = (o) => (
    <label key={o}
      {...dragRow(o)}
      title={label(o)}
      className="flex items-center gap-2 px-1.5 py-1 rounded-lg cursor-pointer text-xs"
      style={{ color: "var(--text-2)" }}
      onMouseEnter={e => e.currentTarget.style.background = "var(--bg-inner)"}
      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
    >
      <input type="checkbox" checked={sel.includes(o)}
        onChange={() => onChange(sel.includes(o) ? sel.filter(v => v !== o) : [...sel, o])}
        style={{ accentColor: "var(--brand)" }} />
      <span className="truncate">{render ? render(o) : (o || "—")}</span>
    </label>
  );
  return (
    <div>
      {/* Same contract as PickFilter's: a list narrowed by something OUTSIDE
          it says so above itself, or a short list reads as a dimension with
          nothing in it. */}
      {note && (
        <p className="text-[11px] leading-snug mb-1.5" style={{ color: "var(--text-3)" }}>{note}</p>
      )}
      {searchable && (
        <input
          value={q} onChange={e => setQ(e.target.value)}
          placeholder={t("common.search")} autoFocus
          className="w-full text-xs px-2.5 py-1.5 mb-1.5 rounded-lg outline-none"
          style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}
        />
      )}
      <div className="max-h-44 overflow-y-auto space-y-0.5 mb-1">
        {shown.length === 0 && (
          <p className="text-xs text-center py-2" style={{ color: "var(--text-4)" }}>{t("staff.noOptionsShort")}</p>
        )}
        {groups
          ? groups.map(([g, items]) => (
              <div key={g}>
                <div className="px-1.5 pt-1.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wide"
                  style={{ color: "var(--text-4)" }}>{g}</div>
                <div className="space-y-0.5">{items.map(optRow)}</div>
              </div>
            ))
          : shown.map(optRow)}
      </div>
      {searchable && shown.length < opts.length && (
        <p className="text-[10px] text-center pb-1" style={{ color: "var(--text-4)" }}>
          {shown.length} / {opts.length}
        </p>
      )}
      {opts.length > 0 && sel.length < opts.length && (
        <button onClick={() => onChange([...opts])} className="text-[10px] w-full text-center pt-1 border-t"
          style={{ color: "var(--text-4)", borderColor: "var(--border)" }}>
          {t("staff.selectAll")}
        </button>
      )}
      {sel.length > 0 && (
        <button onClick={() => onChange([])} className="text-[10px] w-full text-center pt-1 border-t"
          style={{ color: "var(--text-4)", borderColor: "var(--border)" }}>
          {t("staff.clearAll")}
        </button>
      )}
    </div>
  );
}

export function RngFilter({ minV, maxV, onMin, onMax }) {
  const { t } = useLang();
  const s = {
    background: "var(--bg-inner)", border: "1px solid var(--border-md)",
    color: "var(--text-1)", borderRadius: 6, padding: "4px 8px",
    fontSize: 12, width: "100%", outline: "none",
  };
  return (
    <div className="space-y-2">
      <div>
        <label className="text-[10px] block mb-0.5" style={{ color: "var(--text-4)" }}>{t("staff.min")}</label>
        <input type="number" step="any" value={minV} onChange={e => onMin(e.target.value)} style={s} />
      </div>
      <div>
        <label className="text-[10px] block mb-0.5" style={{ color: "var(--text-4)" }}>{t("staff.max")}</label>
        <input type="number" step="any" value={maxV} onChange={e => onMax(e.target.value)} style={s} />
      </div>
      {(minV || maxV) && (
        <button onClick={() => { onMin(""); onMax(""); }}
          className="text-[10px] w-full text-center pt-1 border-t"
          style={{ color: "var(--text-4)", borderColor: "var(--border)" }}>
          {t("staff.clearAll")}
        </button>
      )}
    </div>
  );
}

// Single-select option list for FilterPanel sections (factory, supervisor,
// leader, cell, …) — the panel-embedded replacement for a toolbar
// <StyledSelect>. Radio semantics: picking a row REPLACES the value and closes
// the hosting dropdown (via `close`, passed by the panel surface — the mobile
// sheet passes a no-op so multi-filter adjustment stays one gesture).
// opts: [{ value, label, title? }] — `label` may be a node; `title` (or a
// string label) feeds search. The empty/default option belongs IN `opts`
// (e.g. «All supervisors») so the list always shows where "off" is.
// `note` explains WHY the list is this short — a level of a cascade that another
// filter narrowed says so at 11px/--text-3 above the list, because a silently
// shortened list reads as missing data. `empty` replaces the generic "nothing
// here" when the narrowing itself emptied it, so the page can offer the way out
// (clear the parent) right where the dead end is.
export function PickFilter({ opts, value, onChange, searchable = false, close, note = null, empty = null }) {
  const { t } = useLang();
  const [q, setQ] = useState("");
  const label = (o) => o.title ?? (typeof o.label === "string" ? o.label : String(o.value ?? ""));
  const shown = searchable && q.trim()
    ? opts.filter(o => label(o).toLowerCase().includes(q.trim().toLowerCase()))
    : opts;
  return (
    <div>
      {note && (
        <p className="text-[11px] leading-snug mb-1.5" style={{ color: "var(--text-3)" }}>{note}</p>
      )}
      {searchable && (
        <input
          value={q} onChange={e => setQ(e.target.value)}
          placeholder={t("common.search")} autoFocus
          className="w-full text-xs px-2.5 py-1.5 mb-1.5 rounded-lg outline-none"
          style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}
        />
      )}
      <div className="max-h-52 overflow-y-auto space-y-0.5">
        {shown.length === 0 && (
          // A search that matched nothing is the user's own doing — it always
          // gets the plain message. `empty` is for a list that had nothing to
          // show in the first place.
          empty && !q.trim()
            ? <div className="py-1">{empty}</div>
            : <p className="text-xs text-center py-2" style={{ color: "var(--text-4)" }}>{t("staff.noOptionsShort")}</p>
        )}
        {shown.map(o => {
          const sel = o.value === value;
          return (
            <button
              key={String(o.value)} title={label(o)}
              onClick={() => { onChange(o.value); close && close(); }}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-left"
              style={{
                background: sel ? "var(--brand-bg)" : "transparent",
                color: sel ? "var(--brand-text)" : "var(--text-2)",
                fontWeight: sel ? 600 : 400,
              }}
            >
              <span className="flex-1 truncate min-w-0">{o.label}</span>
              {sel && <Check size={12} style={{ flexShrink: 0 }} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Consolidated filter button ───────────────────────────────────────────────
// Table-toolbar filters, driven by a declarative `sections` list so the same
// filter content renders in every surface:
//   { key, icon, label, active, display, render: ({close}) => <control/>,
//     onClear?, static?, group? }
// `group` (a translated caption) splits the collapsed surfaces into labelled
// blocks in first-appearance order — a page with a scope CHAIN (plant → shift →
// brigadir → leader → cell) and a set of record filters reads as two short
// lists instead of one anonymous stack of ten. Sections without a `group` keep
// the flat list, so nothing changes for pages that don't set it.
// Three surfaces by available space:
//   · wide screens where the whole toolbar row fits on ONE line — each filter
//     unfolds into its own dropdown control;
//   · md+ where the row would wrap (tablet, many filters) — the single grouped
//     "Filtrlar" dropdown;
//   · below md — the grouped trigger opening a slide-up bottom sheet.
// The fit check measures the real toolbar row, so FilterPanel must be a DIRECT
// child of that flex row (no intermediate wrapper).
//
// Whenever the controls are NOT visible inline (mobile, or md+ grouped), every
// ACTIVE section renders as a CHIP in a flex-1 strip beside the trigger — the
// filter state stays readable and each chip's ✕ (`onClear`) resets just that
// filter without opening anything. Tapping the chip body opens the panel. A
// `static: true` section (a locked viewer's plant) is an inert chip: always
// visible, never counted, never clearable, absent from the panel itself.

// Sections bucketed by `group`, groups in the order they first appear. One
// bucket with an empty caption = the flat list every existing page renders.
function groupSections(list) {
  const out = [];
  const seen = new Map();
  for (const s of list) {
    const g = s.group || "";
    let bucket = seen.get(g);
    if (!bucket) { bucket = { key: g || "_", label: g, items: [] }; seen.set(g, bucket); out.push(bucket); }
    bucket.items.push(s);
  }
  return out;
}

// Caption over a block of filters. Sits one step above the per-filter labels
// (11px vs 10px, --text-3 vs --text-4) so the eye reads "group, then filters".
function GroupCaption({ label, first }) {
  if (!label) return null;
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wider"
      style={{ color: "var(--text-3)", marginTop: first ? 0 : 4 }}>
      {label}
    </p>
  );
}

function CountBadge({ n }) {
  return (
    <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full"
      style={{ background: "var(--brand)", color: "#fff", lineHeight: 1.2 }}>
      {n}
    </span>
  );
}

// One collapsible filter row inside the desktop dropdown. Expands INLINE (not as
// an absolute overlay) so a long filter list scrolls within the height-capped
// panel instead of a bottom row's sub-menu spilling off the viewport.
// `renderContent({close})` lets single-pick controls collapse the row again
// after a choice — the pick is the last thing the user wanted here.
function PanelField({ icon: Icon, label, active, display, renderContent }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm transition-colors"
        style={{
          background: "var(--bg-card)",
          border: `1px solid ${open || active ? "var(--brand)" : "var(--border-md)"}`,
          color: active ? "var(--text-1)" : "var(--text-3)",
        }}
      >
        {Icon && <Icon size={13} style={{ color: "var(--text-4)", flexShrink: 0 }} />}
        <span className="flex-1 text-left truncate">{active && display ? display : label}</span>
        <ChevronDown size={13}
          style={{ color: "var(--text-4)", flexShrink: 0,
            transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
      </button>
      {open && (
        <div className="mt-1.5 rounded-xl p-3"
          style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)" }}>
          {renderContent && renderContent({ close: () => setOpen(false) })}
        </div>
      )}
    </div>
  );
}

// Active-filter chip for the collapsed surfaces. The body opens the panel; the
// ✕ resets just this filter (`onClear`). `static` sections (a locked viewer's
// plant) render inert: readable scope, no implied choice.
function FilterChip({ s, onOpen, className = "" }) {
  const { t } = useLang();
  const Icon = s.icon;
  const inert = !!s.static;
  const text = s.display || s.label;
  const clearable = !inert && !!s.onClear;
  return (
    <span
      className={`inline-flex items-center rounded-full flex-shrink-0 ${className}`}
      style={{
        background: inert ? "var(--bg-inner)" : "var(--brand-bg)",
        border: `1px solid ${inert ? "var(--border-md)" : "transparent"}`,
        color: inert ? "var(--text-2)" : "var(--brand-text)",
        height: 30,
      }}
    >
      <button
        type="button"
        onClick={inert ? undefined : onOpen}
        className="flex items-center gap-1.5 pl-2.5 text-xs font-medium min-w-0"
        style={{ color: "inherit", paddingRight: clearable ? 2 : 10, cursor: inert ? "default" : "pointer" }}
        title={typeof text === "string" ? text : undefined}
        aria-label={typeof s.label === "string" ? s.label : undefined}
      >
        {Icon && <Icon size={12} style={{ flexShrink: 0, opacity: 0.85 }} />}
        <span className="truncate max-w-[130px] whitespace-nowrap">{text}</span>
      </button>
      {clearable && (
        <button
          type="button"
          onClick={s.onClear}
          aria-label={`${typeof s.label === "string" ? s.label : ""} — ${t("staff.clearAll")}`}
          className="flex items-center justify-center h-full pl-1 pr-2 rounded-r-full"
          style={{ color: "inherit" }}
        >
          <X size={12} />
        </button>
      )}
    </span>
  );
}

// Mobile slide-up sheet listing every filter expanded.
function FilterSheet({ sections, anyActive, onClearAll, onClose }) {
  const { t } = useLang();
  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div onClick={onClose}
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(3px)" }} />
      <div style={{
        position: "relative", background: "var(--bg-card)", borderRadius: "20px 20px 0 0",
        maxHeight: "82vh", display: "flex", flexDirection: "column",
        animation: "slideUpSheet 0.22s cubic-bezier(0.32,0.72,0,1) both",
        paddingBottom: "calc(12px + var(--tg-safe-bottom, 0px))",
      }}>
        <div className="flex justify-center pt-3 pb-1">
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--border-md)" }} />
        </div>
        <div className="flex items-center justify-between px-4 pb-3 pt-1" style={{ borderBottom: "1px solid var(--border)" }}>
          <span className="text-base font-semibold" style={{ color: "var(--text-1)" }}>{t("filter.filters")}</span>
          <div className="flex items-center gap-2">
            {anyActive && (
              <button onClick={onClearAll} className="text-xs px-3 py-1.5 rounded-lg"
                style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-3)" }}>
                {t("staff.clearAll")}
              </button>
            )}
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full"
              style={{ background: "var(--bg-inner)", color: "var(--text-3)" }}>
              <X size={15} />
            </button>
          </div>
        </div>
        <div style={{ overflowY: "auto", flex: 1 }}>
          {groupSections(sections).map((g, gi) => (
            <div key={g.key}>
              {/* No border of its own — the previous section's bottom rule is
                  already there, and two hairlines meeting read as a defect. The
                  extra top padding is what separates one group from the next. */}
              {g.label && (
                <div className={`px-4 pb-1 ${gi ? "pt-5" : "pt-4"}`}>
                  <GroupCaption label={g.label} first />
                </div>
              )}
              {g.items.map(s => (
                <div key={s.key} className="py-3 px-4" style={{ borderBottom: "1px solid var(--border)" }}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-4)" }}>{s.label}</p>
                    {s.active && s.onClear && (
                      <button onClick={s.onClear} className="text-[10px] flex items-center gap-0.5"
                        style={{ color: "var(--text-4)" }}>
                        <X size={10} /> {t("staff.clearAll")}
                      </button>
                    )}
                  </div>
                  {s.render({ close: () => {} })}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      <style>{`@keyframes slideUpSheet { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
    </div>,
    document.body
  );
}

const PANEL_WIDTH = 300;
const INLINE_POP_WIDTH = 240;
// Single canonical trigger size — SearchInput and md Button match its height (38px).
const TRIGGER_CLS = "items-center gap-2 rounded-xl px-3 py-2 text-sm";

// One filter as its own toolbar dropdown — the unfolded form of a FilterPanel
// section on wide screens. Trigger matches the canonical toolbar-control size.
// `renderContent({close})` so single-pick controls close the dropdown on pick.
function InlineFilterField({ icon: Icon, label, active, display, renderContent }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const popRef = useRef(null);
  const [pos, setPos] = useState(null);
  useEffect(() => {
    if (!open) return;
    function onOutside(e) {
      if (ref.current && ref.current.contains(e.target)) return;
      if (popRef.current && popRef.current.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);
  // Portaled like the grouped panel — the table card is `overflow-hidden`.
  useEffect(() => {
    if (!open) { setPos(null); return; }
    function update() {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - INLINE_POP_WIDTH - 8));
      setPos({ top: rect.bottom + 6, left });
    }
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);
  return (
    <div ref={ref} className="flex-shrink-0">
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex ${TRIGGER_CLS} transition-colors`}
        style={{
          background: "var(--bg-card)",
          border: `1px solid ${open || active ? "var(--brand)" : "var(--border-md)"}`,
          color: active ? "var(--text-1)" : "var(--text-3)",
        }}
      >
        {Icon && <Icon size={14} style={{ color: active ? "var(--brand)" : "var(--text-4)", flexShrink: 0 }} />}
        {/* Cap the label so a long active `display` doesn't reflow the row. */}
        <span className="whitespace-nowrap max-w-[150px] truncate">{active && display ? display : label}</span>
        <ChevronDown size={13}
          style={{ color: "var(--text-4)", flexShrink: 0,
            transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
      </button>
      {open && pos && createPortal(
        <div
          ref={popRef}
          className="rounded-xl p-3"
          style={{
            position: "fixed", top: pos.top, left: pos.left, zIndex: 1000,
            width: INLINE_POP_WIDTH,
            maxHeight: `calc(100vh - ${pos.top + 12}px)`, overflowY: "auto",
            background: "var(--bg-card)", border: "1px solid var(--border-md)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
          }}
        >
          <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-4)" }}>{label}</p>
          {renderContent && renderContent({ close: () => setOpen(false) })}
        </div>,
        document.body
      )}
    </div>
  );
}

// Square clear-all control closing the inline row; height = canonical trigger.
function ClearAllBtn({ onClick, title }) {
  return (
    <button onClick={onClick} title={title}
      className="flex items-center justify-center rounded-xl flex-shrink-0 transition-colors"
      style={{ width: 38, height: 38, background: "var(--bg-card)",
        border: "1px solid var(--border-md)", color: "var(--text-3)" }}>
      <X size={14} />
    </button>
  );
}

export function FilterPanel({ sections, activeCount, anyActive, onClearAll, forceGroup = false }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);        // grouped dropdown
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pos, setPos] = useState(null);
  // md+: grouped button (true) vs one dropdown per filter (false).
  const [collapsed, setCollapsed] = useState(true);
  const ref = useRef(null);        // grouped trigger wrapper
  const popRef = useRef(null);     // portaled grouped panel
  const wrapRef = useRef(null);    // md+ container — a direct toolbar-row child
  const measureRef = useRef(null); // invisible natural-width copy of the inline row

  // Interactive vs inert scope sections; count/clear-all fall back to the
  // section metadata so pages don't have to duplicate the bookkeeping.
  const real = sections.filter(s => !s.static);
  const statics = sections.filter(s => s.static);
  // Sections the page PINS to the toolbar keep their own inline dropdown even
  // when everything else folds into the grouped «Filtrlar» button. On a page
  // carrying a dozen filters the fit check can never unfold the row, so the two
  // or three controls the reader actually steers the page with — the org chain
  // — sit a press away behind a button that says nothing about them. Pinning
  // names those; nothing else about the panel moves. Below md nothing is
  // pinned: there is no room for an inline control, so the sheet keeps them all.
  const pinned = real.filter(s => s.pinned);
  const rest = real.filter(s => !s.pinned);
  const cnt = activeCount ?? real.filter(s => s.active).length;
  const any = anyActive ?? cnt > 0;
  // The grouped button speaks for what it HOLDS. A pinned filter states itself
  // on the row, so counting it here would badge the panel over nothing.
  const restCnt = rest.filter(s => s.active).length;
  const restAny = restCnt > 0;
  const clearAll = onClearAll ?? (() => real.forEach(s => s.onClear && s.onClear()));
  const chips = real.filter(s => s.active);
  const hasChips = statics.length + chips.length > 0;
  // A chip tap re-opens whichever collapsed surface this viewport uses.
  const openPanel = () => {
    if (window.matchMedia("(min-width: 768px)").matches) setOpen(true);
    else setSheetOpen(true);
  };

  // Close on click outside either the trigger or the portaled panel.
  useEffect(() => {
    if (!open) return;
    function onOutside(e) {
      if (ref.current && ref.current.contains(e.target)) return;
      if (popRef.current && popRef.current.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  // The table card is `overflow-hidden`, so the dropdown is rendered in a portal
  // with fixed positioning anchored to the trigger — otherwise it gets clipped.
  useEffect(() => {
    if (!open) return;
    function update() {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const left = Math.max(8, Math.min(rect.right - PANEL_WIDTH, window.innerWidth - PANEL_WIDTH - 8));
      setPos({ top: rect.bottom + 6, left });
    }
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  // Unfolding removes the grouped trigger — drop its orphaned dropdown with it.
  useEffect(() => { if (!collapsed) setOpen(false); }, [collapsed]);

  // Fit check: the filters unfold only while the WHOLE toolbar row still fits on
  // one line — natural inline-row width (hidden measurer) + every sibling
  // control (flex-grow spacers contribute 0) vs the row's content width.
  // No deps: re-measures on every render so label/sibling changes are picked up;
  // the setState bail-out keeps it loop-free.
  useLayoutEffect(() => {
    // Callers can pin the grouped button (e.g. filters parked on the right of a
    // toolbar whose left side already carries its own controls) — skip the unfold.
    if (forceGroup) { if (!collapsed) setCollapsed(true); return; }
    const wrap = wrapRef.current;
    const parent = wrap?.parentElement;
    if (!parent) return;
    function update() {
      const meas = measureRef.current;
      if (!meas) return;
      const cs = getComputedStyle(parent);
      const avail = parent.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
      const gap = parseFloat(cs.columnGap) || 0;
      let total = meas.offsetWidth;
      let n = 1;
      for (const el of parent.children) {
        if (el === wrap || el.offsetWidth === 0) continue;
        if (parseFloat(getComputedStyle(el).flexGrow) > 0) continue;
        total += el.offsetWidth;
        n += 1;
      }
      setCollapsed(total + gap * (n - 1) > avail);
    }
    update();
    const ro = new ResizeObserver(update);
    ro.observe(parent);
    if (measureRef.current) ro.observe(measureRef.current);
    return () => ro.disconnect();
  });

  // Nothing left to open. A view whose whole scope is fixed — a locked viewer
  // pinned to one unit holding one cell — keeps only inert `static` chips, and
  // a trigger that opens an empty panel reads as a broken control rather than
  // as "there is nothing to narrow here". The chips still render: they are the
  // scope, and dropping them would leave the toolbar silent about it.
  if (real.length === 0) {
    if (!statics.length) return null;
    return (
      <div className="flex items-center gap-1.5 flex-1 min-w-0 overflow-x-auto no-scrollbar self-center">
        {statics.map(s => <FilterChip key={s.key} s={s} />)}
      </div>
    );
  }

  return (
    <>
      {/* Mobile: bottom sheet. Once chips carry the filter state, the trigger
          drops its text — the chips explain themselves, the row stays short. */}
      <button
        onClick={() => setSheetOpen(true)}
        className={`flex md:hidden ${TRIGGER_CLS} transition-colors flex-shrink-0`}
        aria-label={t("filter.filters")}
        style={{
          background: "var(--bg-card)",
          border: `1px solid ${any ? "var(--brand)" : "var(--border-md)"}`,
          color: any ? "var(--text-1)" : "var(--text-3)",
        }}
      >
        <SlidersHorizontal size={14} style={{ color: any ? "var(--brand)" : "var(--text-4)", flexShrink: 0 }} />
        {!hasChips && <span>{t("filter.filters")}</span>}
        {cnt > 0 && <CountBadge n={cnt} />}
      </button>

      {/* md+: separate per-filter dropdowns while the row fits, grouped otherwise */}
      <div ref={wrapRef} className="relative hidden md:flex items-center gap-2 flex-shrink-0">
        {/* 0×0 clip box so the measurer's natural width never leaks scrollable
            overflow (phantom scrollbars) into ancestors. */}
        <div aria-hidden style={{ position: "absolute", top: 0, left: 0, width: 0, height: 0, overflow: "hidden" }}>
          <div
            ref={measureRef}
            className="flex items-center gap-2"
            style={{ width: "max-content", visibility: "hidden", pointerEvents: "none" }}
          >
            {statics.map(s => <FilterChip key={s.key} s={s} />)}
            {real.map(s => (
              <InlineFilterField key={s.key} icon={s.icon} label={s.label} active={s.active} display={s.display} />
            ))}
            {any && <ClearAllBtn />}
          </div>
        </div>

        {!collapsed && statics.map(s => <FilterChip key={s.key} s={s} />)}
        {(collapsed ? pinned : real).map(s => (
          <InlineFilterField key={s.key} icon={s.icon} label={s.label} active={s.active} display={s.display}
            renderContent={({ close }) => s.render({ close })} />
        ))}
        {/* Clear-all lives on the row while there is no panel to carry it —
            unfolded, or collapsed with every section pinned. */}
        {(!collapsed || !rest.length) && any && <ClearAllBtn onClick={clearAll} title={t("staff.clearAll")} />}

        {collapsed && rest.length > 0 && (
          <div ref={ref} className="relative">
            <button
              onClick={() => setOpen(o => !o)}
              className={`flex ${TRIGGER_CLS} transition-colors`}
              style={{
                background: "var(--bg-card)",
                border: `1px solid ${open || restAny ? "var(--brand)" : "var(--border-md)"}`,
                color: restAny ? "var(--text-1)" : "var(--text-3)",
              }}
            >
              <SlidersHorizontal size={14} style={{ color: restAny ? "var(--brand)" : "var(--text-4)", flexShrink: 0 }} />
              <span className="whitespace-nowrap">{t("filter.filters")}</span>
              {restCnt > 0 && <CountBadge n={restCnt} />}
              <ChevronDown size={13}
                style={{ color: "var(--text-4)", flexShrink: 0, marginLeft: 2,
                  transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
            </button>
            {open && pos && createPortal(
              <div
                ref={popRef}
                className="rounded-xl p-3"
                style={{
                  position: "fixed", top: pos.top, left: pos.left, zIndex: 1000,
                  width: PANEL_WIDTH,
                  maxHeight: `calc(100vh - ${pos.top + 12}px)`, overflowY: "auto",
                  background: "var(--bg-card)", border: "1px solid var(--border-md)",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
                }}
              >
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-4)" }}>
                    {t("filter.filters")}
                  </span>
                  {any && (
                    <button onClick={clearAll} className="text-[11px] flex items-center gap-1 px-2 py-1 rounded-lg"
                      style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-3)" }}>
                      <X size={11} /> {t("staff.clearAll")}
                    </button>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  {groupSections(rest).map((g, gi) => (
                    <div key={g.key} className="flex flex-col gap-2">
                      <GroupCaption label={g.label} first={gi === 0} />
                      {g.items.map(s => (
                        <PanelField key={s.key} icon={s.icon} label={s.label} active={s.active} display={s.display}
                          renderContent={({ close }) => s.render({ close })} />
                      ))}
                    </div>
                  ))}
                </div>
              </div>,
              document.body
            )}
          </div>
        )}
      </div>

      {/* Collapsed surfaces: the filter state as chips — always readable, each
          resettable in place. flex-1 so the strip doubles as the row's spacer;
          hidden while the md+ row is unfolded (the real controls are visible). */}
      {hasChips && (
        <div
          className={`${collapsed ? "flex" : "flex md:hidden"} items-center gap-1.5 flex-1 min-w-0 overflow-x-auto no-scrollbar self-center`}
        >
          {statics.map(s => <FilterChip key={s.key} s={s} />)}
          {/* A pinned section carries its state in its own trigger from md+ —
              its chip would be the same fact twice. It stays below md, where
              the filter itself lives in the sheet. */}
          {chips.map(s => (
            <FilterChip key={s.key} s={s} onOpen={openPanel} className={s.pinned ? "md:hidden" : ""} />
          ))}
        </div>
      )}

      {sheetOpen && (
        <FilterSheet sections={real} anyActive={any} onClearAll={clearAll} onClose={() => setSheetOpen(false)} />
      )}
    </>
  );
}
