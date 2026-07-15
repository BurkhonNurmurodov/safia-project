import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check, Trash2, Search } from "lucide-react";

/**
 * Styled custom select — dropdown is rendered via createPortal so it is never
 * clipped by an ancestor's overflow:hidden (e.g. modal cards with rounded
 * corners).  Position is computed from the trigger's getBoundingClientRect()
 * and flips upward automatically when there is not enough space below.
 *
 * Props:
 *   value        – current selected value (string)
 *   onChange     – (value: string) => void
 *   options      – string[] | { value: string, label: string }[]
 *   placeholder  – text shown when nothing is selected (optional)
 *   className    – extra classes on the wrapper element (optional)
 *   triggerClassName – size/spacing classes for the trigger button; override to
 *                  match a compact toolbar (default "px-3 py-2 text-sm")
 *   style        – extra inline styles on the trigger button (optional)
 *   disabled     – boolean (optional)
 *   onRemove     – (option) => void; when set, options flagged `removable: true`
 *                  render a small trash button that calls this instead of
 *                  selecting the option (optional)
 *   removeTitle  – tooltip text for the remove button (optional)
 *   searchable   – boolean; renders a filter box pinned to the top of the
 *                  dropdown and narrows the list by label as you type. Use for
 *                  long option lists (optional)
 *   searchPlaceholder – placeholder text for the search box (optional)
 */
export default function StyledSelect({
  value,
  onChange,
  options = [],
  placeholder,
  className = "",
  triggerClassName = "px-3 py-2 text-sm",
  style = {},
  disabled = false,
  onRemove,
  removeTitle,
  searchable = false,
  searchPlaceholder,
}) {
  const [open, setOpen]           = useState(false);
  const [dropStyle, setDropStyle] = useState({});
  const [query, setQuery]         = useState("");
  const triggerRef                = useRef(null);
  const listRef                   = useRef(null);
  const searchRef                 = useRef(null);

  // Normalise options → [{ value, label }]
  const opts = options.map((o) =>
    typeof o === "string" ? { value: o, label: o } : o,
  );

  // Filtered view when searchable — match against the label's plain text
  // (labels are usually strings here; non-string nodes fall through unfiltered).
  const q = query.trim().toLowerCase();
  const shown = searchable && q
    ? opts.filter((o) => String(o.label ?? "").toLowerCase().includes(q))
    : opts;

  const selectedOpt = opts.find((o) => o.value === value);

  // ── position helpers ────────────────────────────────────────────────────────
  function computeDropStyle() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return {};
    const vw         = window.innerWidth;
    const vh         = window.innerHeight;
    const spaceBelow = vh - rect.bottom - 8;
    const spaceAbove = rect.top - 8;
    const maxH       = Math.min(300, Math.max(spaceBelow, spaceAbove, 120));
    const openUp     = spaceBelow < 160 && spaceAbove > spaceBelow;
    // Grow to fit the option rows (label + radio dot) instead of being locked to
    // a narrow trigger — a 4-char select like a year picker would otherwise clip
    // its rows. Never narrower than the trigger; anchor to whichever edge keeps
    // the menu on-screen (right-anchor once the trigger is past the midline).
    const rightAnchored = rect.left > vw / 2;
    return {
      position:  "fixed",
      ...(rightAnchored ? { right: vw - rect.right } : { left: rect.left }),
      minWidth:  rect.width,
      width:     "max-content",
      maxWidth:  Math.min(340, vw - 16),
      zIndex:    9999,
      maxHeight: maxH,
      ...(openUp
        ? { bottom: vh - rect.top + 4 }
        : { top: rect.bottom + 4 }),
    };
  }

  function openDropdown() {
    setQuery("");
    setDropStyle(computeDropStyle());
    setOpen(true);
  }

  function toggle() {
    if (open) setOpen(false);
    else openDropdown();
  }

  // ── close / reposition on scroll ───────────────────────────────────────────
  useEffect(() => {
    if (!open) return;

    const onDown = (e) => {
      const inTrigger = triggerRef.current?.contains(e.target);
      const inList    = listRef.current?.contains(e.target);
      if (!inTrigger && !inList) setOpen(false);
    };
    const onKey    = (e) => { if (e.key === "Escape") setOpen(false); };
    const onScroll = () => setDropStyle(computeDropStyle());

    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown",   onKey);
    window.addEventListener("scroll",      onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown",   onKey);
      window.removeEventListener("scroll",      onScroll, true);
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll selected option into view when list opens
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector("[data-selected='true']");
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [open]);

  // Focus the search box as soon as the searchable dropdown opens.
  useEffect(() => {
    if (open && searchable) searchRef.current?.focus();
  }, [open, searchable]);

  function pick(val) {
    onChange(val);
    setOpen(false);
  }

  // ── portal dropdown ─────────────────────────────────────────────────────────
  const dropdown = open
    ? createPortal(
        <div
          ref={listRef}
          style={{
            ...dropStyle,
            background:   "var(--bg-card)",
            border:       "1px solid var(--border-md)",
            borderRadius: 12,
            boxShadow:    "0 8px 32px rgba(0,0,0,0.35)",
            overflowY:    "auto",
          }}
        >
          {/* Sticky search box for long lists */}
          {searchable && (
            <div
              className="sticky top-0 flex items-center gap-2 px-3 py-2"
              style={{ background: "var(--bg-card)", borderBottom: "1px solid var(--border)", zIndex: 1 }}
            >
              <Search size={14} style={{ flexShrink: 0, color: "var(--text-4)" }} />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full bg-transparent text-sm outline-none"
                style={{ color: "var(--text-1)" }}
              />
            </div>
          )}

          {/* Optional placeholder row */}
          {placeholder && (
            <div
              className="px-4 py-3 text-sm"
              style={{ color: "var(--text-4)", borderBottom: "1px solid var(--border)" }}
            >
              {placeholder}
            </div>
          )}

          {searchable && shown.length === 0 && (
            <div className="px-4 py-4 text-sm text-center" style={{ color: "var(--text-4)" }}>
              —
            </div>
          )}

          {shown.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                data-selected={isSelected}
                onClick={() => pick(opt.value)}
                className="w-full text-left px-4 py-3 text-sm flex items-center justify-between gap-3 transition-colors"
                style={{
                  borderBottom: "1px solid var(--border)",
                  background:   isSelected
                    ? "var(--brand-hover, rgba(200,151,63,.12))"
                    : "transparent",
                  color: isSelected ? "var(--brand-text, #C8973F)" : "var(--text-1)",
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) e.currentTarget.style.background = "var(--bg-inner)";
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) e.currentTarget.style.background = "transparent";
                }}
              >
                <span className="leading-snug">{opt.label}</span>
                <span style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
                  {onRemove && opt.removable && (
                    <span
                      role="button"
                      tabIndex={0}
                      title={removeTitle}
                      onClick={(e) => { e.stopPropagation(); onRemove(opt); }}
                      onMouseDown={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault(); e.stopPropagation(); onRemove(opt);
                        }
                      }}
                      style={{
                        display:        "flex",
                        alignItems:     "center",
                        justifyContent: "center",
                        width:          22,
                        height:         22,
                        borderRadius:   6,
                        color:          "var(--text-4)",
                        transition:     "all 0.1s",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "rgba(239,68,68,0.12)";
                        e.currentTarget.style.color = "#ef4444";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                        e.currentTarget.style.color = "var(--text-4)";
                      }}
                    >
                      <Trash2 size={13} />
                    </span>
                  )}
                  <span
                    style={{
                      flexShrink:     0,
                      width:          18,
                      height:         18,
                      borderRadius:   "50%",
                      border:         isSelected
                        ? "2px solid var(--brand, #C8973F)"
                        : "2px solid var(--text-4)",
                      display:        "flex",
                      alignItems:     "center",
                      justifyContent: "center",
                      background:     isSelected ? "var(--brand, #C8973F)" : "transparent",
                      transition:     "all 0.1s",
                    }}
                  >
                    {isSelected && <Check size={10} strokeWidth={3} color="#fff" />}
                  </span>
                </span>
              </button>
            );
          })}
        </div>,
        document.body,
      )
    : null;

  // ── render ──────────────────────────────────────────────────────────────────
  return (
    <div className={`relative ${className}`} style={style}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={toggle}
        className={`w-full flex items-center justify-between gap-2 rounded-lg text-left outline-none transition-colors ${triggerClassName}`}
        style={{
          background: "var(--bg-inner)",
          border:     `1px solid ${open ? "var(--brand)" : "var(--border-md)"}`,
          color:      selectedOpt ? "var(--text-1)" : "var(--text-4)",
          cursor:     disabled ? "not-allowed" : "pointer",
          opacity:    disabled ? 0.5 : 1,
        }}
      >
        <span className="truncate min-w-0">
          {selectedOpt?.label ?? placeholder ?? "—"}
        </span>
        <ChevronDown
          size={14}
          style={{
            flexShrink: 0,
            color:      "var(--text-4)",
            transform:  open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.15s ease",
          }}
        />
      </button>

      {dropdown}
    </div>
  );
}
