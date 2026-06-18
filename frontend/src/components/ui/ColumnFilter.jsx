// Shared per-column table-filter primitives.
// Used by the Staff "Requests"/Workers tables and the Overview supervisor table.
import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { SlidersHorizontal, X, ChevronDown } from "lucide-react";
import { useLang } from "../../context/LangContext";

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

export function TxtFilter({ value, onChange }) {
  const { t } = useLang();
  return (
    <div className="relative">
      <input
        value={value} onChange={e => onChange(e.target.value)}
        placeholder={t("staff.filter")} autoFocus
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

export function OptsFilter({ opts, sel, onChange, render }) {
  const { t } = useLang();
  return (
    <div>
      <div className="max-h-44 overflow-y-auto space-y-0.5 mb-1">
        {opts.length === 0 && (
          <p className="text-xs text-center py-2" style={{ color: "var(--text-4)" }}>{t("staff.noOptionsShort")}</p>
        )}
        {opts.map(o => (
          <label key={o}
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
        ))}
      </div>
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

// ── Consolidated filter button ───────────────────────────────────────────────
// Collapses every column filter into one top-right "Filtrlar" control, mirroring
// the Staff page: a dropdown on desktop and a slide-up bottom sheet on mobile.
// Driven by a declarative `sections` list so the same filter content renders in
// both surfaces:
//   { key, icon, label, active, display, render: () => <control/> }

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
function PanelField({ icon: Icon, label, active, display, children }) {
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
          {children}
        </div>
      )}
    </div>
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
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(3px)" }} />
      <div style={{
        position: "relative", background: "var(--bg-card)", borderRadius: "20px 20px 0 0",
        maxHeight: "82vh", display: "flex", flexDirection: "column",
        animation: "slideUpSheet 0.22s cubic-bezier(0.32,0.72,0,1) both",
        paddingBottom: "max(env(safe-area-inset-bottom), 12px)",
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
          {sections.map(s => (
            <div key={s.key} className="py-3 px-4" style={{ borderBottom: "1px solid var(--border)" }}>
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-4)" }}>{s.label}</p>
              {s.render()}
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

export function FilterPanel({ sections, activeCount, anyActive, onClearAll }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const ref = useRef(null);     // desktop trigger wrapper
  const popRef = useRef(null);  // portaled dropdown panel

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

  return (
    <>
      {/* Mobile: bottom sheet */}
      <button
        onClick={() => setSheetOpen(true)}
        className="flex md:hidden items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors flex-shrink-0"
        style={{
          background: "var(--bg-card)",
          border: `1px solid ${anyActive ? "var(--brand)" : "var(--border-md)"}`,
          color: anyActive ? "var(--text-1)" : "var(--text-3)",
        }}
      >
        <SlidersHorizontal size={14} style={{ color: anyActive ? "var(--brand)" : "var(--text-4)", flexShrink: 0 }} />
        <span>{t("filter.filters")}</span>
        {activeCount > 0 && <CountBadge n={activeCount} />}
      </button>

      {/* Desktop: dropdown */}
      <div ref={ref} className="relative hidden md:block flex-shrink-0">
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors"
          style={{
            background: "var(--bg-card)",
            border: `1px solid ${open || anyActive ? "var(--brand)" : "var(--border-md)"}`,
            color: anyActive ? "var(--text-1)" : "var(--text-3)",
          }}
        >
          <SlidersHorizontal size={14} style={{ color: anyActive ? "var(--brand)" : "var(--text-4)", flexShrink: 0 }} />
          <span className="whitespace-nowrap">{t("filter.filters")}</span>
          {activeCount > 0 && <CountBadge n={activeCount} />}
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
              {anyActive && (
                <button onClick={onClearAll} className="text-[11px] flex items-center gap-1 px-2 py-1 rounded-lg"
                  style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-3)" }}>
                  <X size={11} /> {t("staff.clearAll")}
                </button>
              )}
            </div>
            <div className="flex flex-col gap-2">
              {sections.map(s => (
                <PanelField key={s.key} icon={s.icon} label={s.label} active={s.active} display={s.display}>
                  {s.render()}
                </PanelField>
              ))}
            </div>
          </div>,
          document.body
        )}
      </div>

      {sheetOpen && (
        <FilterSheet sections={sections} anyActive={anyActive} onClearAll={onClearAll} onClose={() => setSheetOpen(false)} />
      )}
    </>
  );
}
