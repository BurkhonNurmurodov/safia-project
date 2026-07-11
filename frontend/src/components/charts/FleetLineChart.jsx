import { useRef, useState, useEffect, useLayoutEffect } from "react";
import ReactApexChart from "react-apexcharts";
import { Users, ChevronDown } from "lucide-react";
import { useChartTheme } from "../../hooks/useChartTheme";
import { useLang } from "../../context/LangContext";
import { useDragSelect } from "../../hooks/useDragSelect";

const LINE_COLORS = [
  "#3b82f6", "#ef4444", "#22c55e", "#eab308", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316", "#C8973F", "#84cc16",
  "#06b6d4", "#a855f7",
];

const AVG_COLOR = "#f59e0b"; // brand golden

const DEFAULT_HEATMAP_SEGMENTS = [
  { from: 0,   color: "#ef4444" },
  { from: 85,  color: "#22c55e" },
  { from: 101, color: "#3b82f6" },
];

const DEFAULT_DIFF_SEGMENTS = [
  { from: -9999, color: "#3b82f6" },
  { from: -20,   color: "#22c55e" },
  { from: 1,     color: "#eab308" },
  { from: 6,     color: "#ef4444" },
];

// Stable color per manager based on their position in the managers array
function managerColor(name, managers) {
  const idx = managers.indexOf(name);
  return LINE_COLORS[(idx < 0 ? 0 : idx) % LINE_COLORS.length];
}

// Build ApexCharts yaxis annotation bands
function buildYBands(segs) {
  return segs.map((seg, i) => ({
    y:           seg.from === -9999 ? -9999 : seg.from,
    y2:          i < segs.length - 1 ? segs[i + 1].from : 9999,
    fillColor:   seg.color,
    opacity:     0.20,
    borderWidth: 0,
    label:       { text: "" },
  }));
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function getValue(cell, mode) {
  if (!cell) return null;
  if (mode === "planned")
    return cell.baseline_util != null ? Math.round(cell.baseline_util * 100) : null;
  if (mode === "diff")
    return cell.baseline_util != null && cell.net_util != null
      ? Math.round((cell.baseline_util - cell.net_util) * 100) : null;
  return cell.net_util != null ? Math.round(cell.net_util * 100) : null;
}

function buildSeries(name, dates, data, mode) {
  return { name, data: dates.map((d) => getValue(data[name]?.[d], mode)) };
}

// How many horizontal "DD.MM" date labels fit in a chart of the given width.
// A DD.MM label + comfortable gap needs ~52px; ~46px is reserved for the y-axis
// gutter. Cap at 12 so a wide desktop axis stays clean, floor at 2. Returns
// undefined (→ show every label) when they already fit, so short ranges are
// untouched. This is what makes the axis responsive: ~5 labels on a phone,
// ~12 on desktop — instead of one fixed count that overlaps on small screens.
function ticksForWidth(width, count) {
  if (!width) return undefined;
  const fit = Math.min(12, Math.max(2, Math.floor((width - 46) / 52)));
  return count > fit ? fit : undefined;
}

// ─── manager picker ───────────────────────────────────────────────────────────

// The fleet-trend supervisor picker. Lives in the chart CARD HEADER (see
// Overview) so the card shows one aligned control row — never a floating filter
// pill below the title. Controlled: the parent owns `selected` (Set) + `showAvg`
// so the header dropdown and the chart share one source of truth. Trigger wears
// the canonical toolbar chrome (rounded-xl, bg-card, 38px, brand when active).
export function FleetManagerPicker({
  managers = [], selected, onToggleManager, showAvg, onToggleAvg, onClearAll,
}) {
  const { t } = useLang();
  const dropRef = useRef(null);
  const [dropOpen, setDropOpen] = useState(false);
  const [search, setSearch]     = useState("");

  useEffect(() => {
    function onDown(e) {
      if (dropRef.current && !dropRef.current.contains(e.target)) setDropOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const dragRow = useDragSelect(
    (name) => selected.has(name),
    (name, value) => { if (selected.has(name) !== value) onToggleManager(name); },
  );

  const selectedArr = [...selected];
  const filtered = managers.filter((n) => !search || n.toLowerCase().includes(search.toLowerCase()));
  const active = selected.size > 0;

  return (
    <div className="flex items-center gap-2 flex-wrap justify-end">
      {/* Selected chips render before the trigger so the button keeps its place. */}
      {selectedArr.map((name) => {
        const c = managerColor(name, managers);
        return (
          <span key={name}
            className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full"
            style={{ background: c + "33", color: c, border: `1px solid ${c}55` }}>
            {name.split(" ")[0]}
            <button onClick={() => onToggleManager(name)} className="ml-0.5 opacity-70 hover:opacity-100"
              style={{ fontSize: 11, lineHeight: 1 }} aria-label="remove">×</button>
          </span>
        );
      })}

      <div className="relative flex-shrink-0" ref={dropRef}>
        <button
          onClick={() => { setDropOpen((o) => !o); setSearch(""); }}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-colors"
          style={{
            background: "var(--bg-card)",
            border: `1px solid ${dropOpen || active ? "var(--brand)" : "var(--border-md)"}`,
            color: active ? "var(--text-1)" : "var(--text-3)",
          }}>
          <Users size={14} style={{ color: active ? "var(--brand)" : "var(--text-4)", flexShrink: 0 }} />
          <span className="whitespace-nowrap">{t("fleet.pick")}{active ? ` · ${selected.size}` : ""}</span>
          <ChevronDown size={13} style={{ color: "var(--text-4)", flexShrink: 0,
            transform: dropOpen ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
        </button>

        {dropOpen && (
          <div className="absolute top-full right-0 mt-1 z-30 rounded-xl overflow-hidden"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)",
              boxShadow: "0 8px 24px rgba(0,0,0,.18)", width: 220, maxHeight: 300,
              display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "8px 10px 6px", borderBottom: "1px solid var(--border)" }}>
              <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder={t("common.search")}
                className="w-full text-xs outline-none rounded-md px-2 py-1"
                style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" }} />
            </div>

            {!search && (
              <label className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-white/5 transition-colors"
                style={{ fontSize: 12, color: "var(--text-2)", borderBottom: "1px solid var(--border)" }}>
                <input type="checkbox" checked={showAvg} onChange={onToggleAvg}
                  className="accent-amber-500" style={{ width: 13, height: 13 }} />
                <span style={{ color: AVG_COLOR, fontWeight: 600 }}>{t("fleet.avg")}</span>
              </label>
            )}

            <div style={{ overflowY: "auto", flex: 1 }}>
              {filtered.map((name) => {
                const c = managerColor(name, managers);
                return (
                  <label key={name} {...dragRow(name)}
                    className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-white/5 transition-colors"
                    style={{ fontSize: 12, color: "var(--text-2)" }}>
                    <input type="checkbox" checked={selected.has(name)} onChange={() => onToggleManager(name)}
                      style={{ width: 13, height: 13, accentColor: c }} />
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: c, flexShrink: 0 }} />
                    {name}
                  </label>
                );
              })}
              {filtered.length === 0 && (
                <div className="px-3 py-3 text-[11px]" style={{ color: "var(--text-4)" }}>{t("fleet.noMatch")}</div>
              )}
            </div>

            {active && (
              <div style={{ padding: "6px 10px", borderTop: "1px solid var(--border)" }}>
                <button onClick={onClearAll}
                  className="w-full text-[11px] py-1 rounded-lg font-medium transition-colors"
                  style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-3)" }}>
                  {t("fleet.clear")}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── component ────────────────────────────────────────────────────────────────

// Controlled: `selected` (Set of manager names) and `showAvg` are owned by the
// parent so the header <FleetManagerPicker> drives this chart. No toolbar of its
// own — the parent renders the picker in the card header row.
export default function FleetLineChart({
  dates           = [],
  managers        = [],
  data            = {},
  mode            = "actual",
  height          = 300,
  selected        = new Set(),
  showAvg         = true,
  heatmapSegments = DEFAULT_HEATMAP_SEGMENTS,
  diffSegments    = DEFAULT_DIFF_SEGMENTS,
}) {
  const { chartTheme, gridColor, labelColor, legendColor, tooltipTheme } = useChartTheme();
  const { t } = useLang();
  const apexRef = useRef(null);
  const wrapRef = useRef(null);

  // ── responsive re-fit ─────────────────────────────────────────────────────────
  // ApexCharts bakes a fixed pixel width into its SVG at mount time. In the
  // Telegram WebView the first mount can happen before the layout has settled to
  // the real phone width, so the chart locks a too-wide value and never corrects
  // it — the whole page then scrolls sideways and the y-axis slides off-screen.
  // redrawOnParentResize/WindowResize are off (kept off on purpose), so we drive
  // the re-fit ourselves: watch the wrapper and, whenever its width actually
  // changes, ask Apex to re-measure via updateOptions (the only call proven to
  // re-fit the canvas). Guarded by last-width + rAF so it never loops.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let lastW = Math.round(el.getBoundingClientRect().width);
    let raf = 0;
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0].contentRect.width);
      if (w === lastW || w === 0) return;
      lastW = w;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        try { apexRef.current?.updateOptions({}, false, false); } catch { /* chart torn down */ }
      });
    });
    ro.observe(el);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  // ── series ──────────────────────────────────────────────────────────────────

  // Fleet AVG: mean of all managers per date
  const avgData = dates.map((d) => {
    const vals = managers.map((n) => getValue(data[n]?.[d], mode)).filter((v) => v != null);
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  });

  const selectedArr = [...selected]; // preserves insertion order

  const series = [
    ...(showAvg ? [{ name: t("fleet.avg"), data: avgData }] : []),
    ...selectedArr.map((name) => buildSeries(name, dates, data, mode)),
  ];

  const colors       = [...(showAvg ? [AVG_COLOR] : []), ...selectedArr.map((n) => managerColor(n, managers))];
  const strokeWidths = [...(showAvg ? [3]         : []), ...selectedArr.map(() => 1.5)];
  const dashArrays   = [...(showAvg ? [0]         : []), ...selectedArr.map(() => 0)];

  const isDiff     = mode === "diff";
  const activeSegs = isDiff
    ? (diffSegments?.length    ? diffSegments    : DEFAULT_DIFF_SEGMENTS)
    : (heatmapSegments?.length ? heatmapSegments : DEFAULT_HEATMAP_SEGMENTS);

  const yBands = buildYBands(activeSegs);

  const options = {
    chart: {
      type: "area",
      background: "transparent",
      toolbar: { show: false },
      animations: { enabled: false },
      redrawOnParentResize: false,
      redrawOnWindowResize: false,
      zoom: { enabled: false },
      events: {
        mounted: (c) => { apexRef.current = c; },
        updated: (c) => { apexRef.current = c; },
      },
    },
    stroke: { curve: "smooth", width: strokeWidths, dashArray: dashArrays },
    dataLabels: { enabled: false },
    fill: { type: "solid", opacity: 0.15 },
    colors,

    xaxis: {
      categories: dates.map((d) => d.slice(0, 5)),
      // Dense date axis: keep labels horizontal (never Apex's default -45°
      // slant), thin them to ~10 evenly-spaced anchors for long ranges, and let
      // Apex drop any that still collide on narrow screens. Full DD.MM stays in
      // the tooltip, so no precision is lost — only the crammed ribbon.
      tickAmount: dates.length > 12 ? Math.min(10, dates.length) : undefined,
      tickPlacement: "on",
      labels: {
        rotate: 0,
        rotateAlways: false,
        hideOverlappingLabels: true,
        trim: false,
        style: { colors: labelColor, fontSize: "10px" },
      },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      labels: {
        formatter: (v) => v == null ? "—" : isDiff ? `${v > 0 ? "+" : ""}${v}%` : `${v}%`,
        style: { colors: labelColor, fontSize: "10px" },
      },
    },
    annotations: {
      yaxis: [
        ...(isDiff ? [{ y: 0, borderColor: "rgba(128,128,128,.35)", strokeDashArray: 4, borderWidth: 2, label: { text: "" } }] : []),
      ],
    },

    grid: { borderColor: gridColor },
    tooltip: {
      theme: tooltipTheme,
      y: { formatter: (v) => v == null ? "—" : isDiff ? `${v > 0 ? "+" : ""}${v}%` : `${v}%` },
    },
    legend: {
      show: true,
      labels: { colors: legendColor },
      fontSize: "11px",
      itemMargin: { horizontal: 8, vertical: 3 },
    },
    markers: {
      size: dates.length <= 10 ? 3 : 0,
      hover: { size: 5 },
    },
    theme: chartTheme,
  };

  // ── render ──────────────────────────────────────────────────────────────────
  // w-full + min-w-0 wrapper: this is the element the ResizeObserver watches, and
  // min-w-0 lets it (and the chart) shrink inside any flex/grid parent instead of
  // being forced to the SVG's baked width. The actual anti-overflow cure is the
  // updateOptions re-fit above.
  return (
    <div ref={wrapRef} className="w-full min-w-0">
      <ReactApexChart
        key={mode}
        type="area"
        series={series}
        options={options}
        height={height}
      />
    </div>
  );
}
