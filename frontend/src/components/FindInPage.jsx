import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { Search, ChevronUp, ChevronDown, X } from "lucide-react";
import { useLang } from "../context/LangContext";

/**
 * Browser-style "find on page", opened with ⌘F / Ctrl+F on EVERY page.
 *
 * Mounted once at the app root (App.jsx) so it works across all routes. It
 * highlights matches with the CSS Custom Highlight API (`CSS.highlights`) —
 * which paints via live Ranges WITHOUT mutating the DOM, so it never fights
 * React's render tree. Where that API is missing (very old WebViews) it
 * degrades to count + scroll-to-match, no visual highlight.
 *
 * The highlight colors live in index.css (`::highlight(safia-find-all)` /
 * `::highlight(safia-find-current)`).
 */

const HL_ALL = "safia-find-all";
const HL_CUR = "safia-find-current";
const canHighlight =
  typeof CSS !== "undefined" &&
  !!CSS.highlights &&
  typeof Highlight !== "undefined";

function isVisible(el) {
  if (!el) return false;
  if (typeof el.checkVisibility === "function") {
    return el.checkVisibility({ visibilityProperty: true });
  }
  const cs = getComputedStyle(el);
  return cs.display !== "none" && cs.visibility !== "hidden";
}

export default function FindInPage() {
  const { t } = useLang();
  const location = useLocation();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [total, setTotal] = useState(0);
  const [current, setCurrent] = useState(0); // 1-based; 0 = none

  const inputRef = useRef(null);
  const barRef = useRef(null);
  const rangesRef = useRef([]);
  const idxRef = useRef(0); // 0-based active match
  const openRef = useRef(false);
  const debounceRef = useRef(0);

  const clear = useCallback(() => {
    if (canHighlight) {
      CSS.highlights.delete(HL_ALL);
      CSS.highlights.delete(HL_CUR);
    }
    rangesRef.current = [];
  }, []);

  const paintCurrent = useCallback(() => {
    const ranges = rangesRef.current;
    if (!ranges.length) return;
    const range = ranges[idxRef.current];
    if (canHighlight) {
      const hl = new Highlight(range);
      hl.priority = 1; // paint the active match on top of the all-matches layer
      CSS.highlights.set(HL_CUR, hl);
    }
    const anchor =
      range.startContainer.nodeType === 1
        ? range.startContainer
        : range.startContainer.parentElement;
    anchor?.scrollIntoView({ block: "center", inline: "nearest" });
    setCurrent(idxRef.current + 1);
  }, []);

  const search = useCallback(
    (raw) => {
      clear();
      const needle = raw.trim().toLowerCase();
      if (!needle) {
        setTotal(0);
        setCurrent(0);
        return;
      }
      const ranges = [];
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode(node) {
            const v = node.nodeValue;
            if (!v || !v.trim()) return NodeFilter.FILTER_REJECT;
            const p = node.parentElement;
            if (!p) return NodeFilter.FILTER_REJECT;
            const tag = p.tagName;
            if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT")
              return NodeFilter.FILTER_REJECT;
            if (barRef.current && barRef.current.contains(p))
              return NodeFilter.FILTER_REJECT; // don't match our own bar
            if (p.closest("[data-find-ignore]")) return NodeFilter.FILTER_REJECT;
            if (!isVisible(p)) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
          },
        },
      );
      let node;
      while ((node = walker.nextNode())) {
        const hay = node.nodeValue.toLowerCase();
        let from = hay.indexOf(needle);
        while (from !== -1) {
          const r = document.createRange();
          r.setStart(node, from);
          r.setEnd(node, from + needle.length);
          ranges.push(r);
          from = hay.indexOf(needle, from + needle.length);
        }
      }
      rangesRef.current = ranges;
      setTotal(ranges.length);
      if (!ranges.length) {
        setCurrent(0);
        return;
      }
      if (canHighlight) CSS.highlights.set(HL_ALL, new Highlight(...ranges));
      idxRef.current = 0;
      paintCurrent();
    },
    [clear, paintCurrent],
  );

  // Debounced search as the user types.
  useEffect(() => {
    if (!open) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), 120);
    return () => clearTimeout(debounceRef.current);
  }, [query, open, search]);

  const go = useCallback(
    (delta) => {
      const n = rangesRef.current.length;
      if (!n) return;
      idxRef.current = (idxRef.current + delta + n) % n;
      paintCurrent();
    },
    [paintCurrent],
  );

  const close = useCallback(() => {
    setOpen(false);
    openRef.current = false;
    clear();
    setTotal(0);
    setCurrent(0);
  }, [clear]);

  const openBar = useCallback(() => {
    setOpen(true);
    openRef.current = true;
    // Focus + select once the input is mounted, so a re-press of ⌘F re-selects
    // the existing query (matching browser behaviour).
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, []);

  // Global ⌘F / Ctrl+F to open, Esc to close. Capture phase so it wins over
  // page-level handlers and suppresses the browser's native find bar.
  useEffect(() => {
    const onKey = (e) => {
      const key = e.key?.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && key === "f") {
        e.preventDefault();
        openBar();
      } else if (key === "escape" && openRef.current) {
        close();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [openBar, close]);

  // Route change ⇒ the previous matches are stale. Clear, then re-run once the
  // new page has had a moment to render.
  useEffect(() => {
    if (!openRef.current) return;
    clear();
    setTotal(0);
    setCurrent(0);
    const id = setTimeout(() => {
      if (openRef.current) search(query);
    }, 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Clean up highlights if this component ever unmounts.
  useEffect(() => () => clear(), [clear]);

  if (!open) return null;

  const onInputKey = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      go(e.shiftKey ? -1 : 1);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  const hasQuery = query.trim().length > 0;
  const noMatch = hasQuery && total === 0;

  return (
    <div
      ref={barRef}
      data-find-ignore
      role="search"
      className="fixed z-[9000] flex items-center gap-1.5 rounded-xl"
      style={{
        top: "calc(var(--tg-safe-top, 0px) + 12px)",
        right: "12px",
        background: "var(--bg-card)",
        border: "1px solid var(--border-md)",
        padding: "6px 8px",
        boxShadow: "0 10px 30px rgba(0,0,0,0.28)",
        maxWidth: "calc(100vw - 24px)",
      }}
    >
      <Search size={15} style={{ color: "var(--text-3)", flexShrink: 0 }} />
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onInputKey}
        placeholder={t("find.placeholder")}
        spellCheck={false}
        autoComplete="off"
        className="bg-transparent outline-none text-sm min-w-0"
        style={{ color: "var(--text-1)", width: "170px" }}
      />
      <span
        className="text-xs tabular-nums whitespace-nowrap px-0.5"
        style={{
          color: noMatch ? "#ef4444" : "var(--text-3)",
          minWidth: "46px",
          textAlign: "right",
        }}
      >
        {hasQuery ? (total ? `${current}/${total}` : t("find.noMatches")) : ""}
      </span>
      <div className="flex items-center gap-0.5" style={{ flexShrink: 0 }}>
        <button
          type="button"
          onClick={() => go(-1)}
          disabled={!total}
          title={t("find.prev")}
          aria-label={t("find.prev")}
          className="p-1 rounded-md transition-opacity hover:opacity-60 disabled:opacity-30 disabled:cursor-default"
          style={{ color: "var(--text-2)" }}
        >
          <ChevronUp size={16} />
        </button>
        <button
          type="button"
          onClick={() => go(1)}
          disabled={!total}
          title={t("find.next")}
          aria-label={t("find.next")}
          className="p-1 rounded-md transition-opacity hover:opacity-60 disabled:opacity-30 disabled:cursor-default"
          style={{ color: "var(--text-2)" }}
        >
          <ChevronDown size={16} />
        </button>
        <span
          aria-hidden
          style={{
            width: 1,
            height: 18,
            background: "var(--border-md)",
            margin: "0 2px",
          }}
        />
        <button
          type="button"
          onClick={close}
          title={t("find.close")}
          aria-label={t("find.close")}
          className="p-1 rounded-md transition-opacity hover:opacity-60"
          style={{ color: "var(--text-2)" }}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
