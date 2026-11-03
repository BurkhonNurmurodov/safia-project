// «Odam soni» (components/workers/WorkersPage.jsx) — the ApexCharts pieces
// every chart on its three pages starts from, read off useChartTheme().
export function chartBase({ labelColor, legendColor, gridColor }) {
  return {
    baseChart: {
      background: "transparent", toolbar: { show: false }, animations: { enabled: false },
      redrawOnParentResize: false, redrawOnWindowResize: false, fontFamily: "inherit",
    },
    axisLabels:   { style: { colors: labelColor, fontSize: "10px" } },
    axisLabelsMd: { style: { colors: legendColor, fontSize: "11px" } },
    legendCfg:    { labels: { colors: legendColor }, fontSize: "11px", position: "top" },
    // Solid hairline grid — dashed gridlines read as thresholds/projections.
    gridCfg:      { borderColor: gridColor, strokeDashArray: 0 },
  };
}
