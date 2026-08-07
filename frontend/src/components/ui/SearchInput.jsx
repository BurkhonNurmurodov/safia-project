import { Search, X } from "lucide-react";

/**
 * Canonical search input — THE template for every text-filter box
 * (magnifier icon inside a bordered inner-bg input, clear-X when non-empty).
 *
 * Props:
 *   value / onChange – controlled value; onChange receives the string
 *   placeholder      – pass the page's translation
 *   className        – wrapper classes (widths etc.)
 *   inputClassName   – override input sizing (default "text-sm pl-8 pr-7 py-2",
 *                      38px — the toolbar baseline: FilterPanel trigger,
 *                      SegmentedToggle md, Button lg)
 *   clearable        – show the X button when there is text (default true)
 */
export default function SearchInput({
  value,
  onChange,
  placeholder,
  className = "",
  inputClassName = "text-sm pl-8 pr-7 py-2",
  clearable = true,
}) {
  return (
    <div className={`relative ${className}`}>
      <Search
        size={13}
        className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
        style={{ color: "var(--text-4)" }}
      />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-lg outline-none ${inputClassName}`}
        style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}
      />
      {clearable && value && (
        <button
          onClick={() => onChange("")}
          className="absolute right-2 top-1/2 -translate-y-1/2"
          style={{ color: "var(--text-4)" }}
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}
