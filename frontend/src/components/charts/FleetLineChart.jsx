import { useRef, useState, useEffect, useCallback } from "react";
import ReactApexChart from "react-apexcharts";
import { useChartTheme } from "../../hooks/useChartTheme";
import { useLang } from "../../context/LangContext";

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

// ─── component ────────────────────────────────────────────────────────────────

export default function FleetLineChart({
  dates           = [],
  managers        = [],
  data            = {},
  mode            = "actual",
  height          = 300,
  heatmapSegments = DEFAULT_HEATMAP_SEGMENTS,
  diffSegments    = DEFAULT_DIFF_SEGMENTS,
}) {
  const { chartTheme, gridColor, labelColor, legendColor, tooltipTheme } = useChartTheme();
  const { t } = useLang();
  const apexRef   = useRef(null);
  const dropRef   = useRef(null);

  const [selected, setSelected]     = useState(new Set());   // manager names added by user
  const [showAvg,  setShowAvg]      = useState(true);        // Fleet AVG line visible
  const [dropOpen, setDropOpen]     = useState(false);
  const [search,   setSearch]       = useState("");

  // Close dropdown when clicking outside
  useEffect(() => {
    function onDown(e) {
      if (dropRef.current && !dropRef.current.contains(e.target)) setDropOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const toggleManager = useCallback((name) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }, []);

  const clearAll = () => setSelected(new Set());

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
    fill: {
      type: "gradient",
      gradient: { shadeIntensity: 1, opacityFrom: 0.65, opacityTo: 0.02, stops: [0, 85, 100] },
    },
    colors,

    xaxis: {
      categories: dates.map((d) => d.slice(0, 5)),
      labels: { style: { colors: labelColor, fontSize: "10px" } },
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

  // ── filtered manager list for dropdown ──────────────────────────────────────
  const filtered = managers.filter((n) =>
    !search || n.toLowerCase().includes(search.toLowerCase())
  );

  // ── render ──────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">

        {/* Add supervisor dropdown */}
        <div className="relative" ref={dropRef}>
          <button
            onClick={() => { setDropOpen((o) => !o); setSearch(""); }}
            className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-lg transition-colors"
            style={{
              background: "var(--bg-inner)",
              border: "1px solid var(--border-md)",
              color: "var(--text-2)",
            }}
          >
            Filter
            <span style={{ opacity: 0.4, fontSize: 9 }}>▾</span>
          </button>

          {dropOpen && (
            <div
              className="absolute top-full left-0 mt-1 z-30 rounded-xl overflow-hidden"
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                boxShadow: "0 8px 24px rgba(0,0,0,.18)",
                width: 220,
                maxHeight: 300,
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* Search */}
              <div style={{ padding: "8px 10px 6px", borderBottom: "1px solid var(--border)" }}>
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("common.search")}
                  className="w-full text-xs outline-none rounded-md px-2 py-1"
                  style={{
                    background: "var(--bg-inner)",
                    border: "1px solid var(--border-md)",
                    color: "var(--text-1)",
                  }}
                />
              </div>

              {/* Fleet AVG toggle */}
              {!search && (
                <label
                  className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-white/5 transition-colors"
                  style={{ fontSize: 12, color: "var(--text-2)", borderBottom: "1px solid var(--border)" }}
                >
                  <input
                    type="checkbox"
                    checked={showAvg}
                    onChange={() => setShowAvg((v) => !v)}
                    className="accent-amber-500"
                    style={{ width: 13, height: 13 }}
                  />
                  <span style={{ color: AVG_COLOR, fontWeight: 600 }}>{t("fleet.avg")}</span>
                </label>
              )}

              {/* Manager list */}
              <div style={{ overflowY: "auto", flex: 1 }}>
                {filtered.map((name) => {
                  const c = managerColor(name, managers);
                  return (
                    <label
                      key={name}
                      className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-white/5 transition-colors"
                      style={{ fontSize: 12, color: "var(--text-2)" }}
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(name)}
                        onChange={() => toggleManager(name)}
                        style={{ width: 13, height: 13, accentColor: c }}
                      />
                      <span
                        style={{ width: 8, height: 8, borderRadius: "50%", background: c, flexShrink: 0 }}
                      />
                      {name}
                    </label>
                  );
                })}
                {filtered.length === 0 && (
                  <div className="px-3 py-3 text-[11px]" style={{ color: "var(--text-4)" }}>{t("fleet.noMatch")}</div>
                )}
              </div>

              {/* Clear all — inside modal */}
              {selected.size > 0 && (
                <div style={{ padding: "6px 10px", borderTop: "1px solid var(--border)" }}>
                  <button
                    onClick={clearAll}
                    className="w-full text-[11px] py-1 rounded-lg font-medium transition-colors"
                    style={{
                      background: "var(--bg-inner)",
                      border: "1px solid var(--border-md)",
                      color: "var(--text-3)",
                    }}
                  >
                    Clear all
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Selected chips */}
        {selectedArr.map((name) => {
          const c = managerColor(name, managers);
          return (
            <span
              key={name}
              className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full"
              style={{ background: c + "33", color: c, border: `1px solid ${c}55` }}
            >
              {name.split(" ")[0]}
              <button
                onClick={() => toggleManager(name)}
                className="ml-0.5 opacity-70 hover:opacity-100"
                style={{ fontSize: 11, lineHeight: 1 }}
              >
                ×
              </button>
            </span>
          );
        })}
      </div>

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
