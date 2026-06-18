import { useChartTheme } from "../../hooks/useChartTheme";
import ReactApexChart from "react-apexcharts";

export default function TrendChart({ dates, series, unit = "min", height = 220 }) {
  const { chartTheme, gridColor, labelColor, legendColor, tooltipTheme } = useChartTheme();
  const options = {
    chart: {
      type: "line", background: "transparent", toolbar: { show: false }, zoom: { enabled: false },
      animations: { enabled: false },
      redrawOnParentResize: false, redrawOnWindowResize: false,
    },
    stroke: { curve: "smooth", width: 2, dashArray: series.map((s) => s.dashed ? 4 : 0) },
    colors: series.map((s) => s.color || "#C8973F"),
    xaxis: {
      categories: dates,
      labels: { style: { colors: labelColor, fontSize: "10px" }, rotate: -45 },
      tickAmount: Math.min(dates.length, 10),
    },
    yaxis: {
      labels: {
        style: { colors: labelColor, fontSize: "10px" },
        formatter: (v) => unit === "hrs" ? `${(v / 60).toFixed(1)}h` : `${Math.round(v)}`,
      },
    },
    grid: { borderColor: gridColor, strokeDashArray: 3 },
    legend: {
      labels: { colors: legendColor },
      fontSize: "11px",
    },
    tooltip: {
      theme: "dark",
      y: {
        formatter: (v) => unit === "hrs" ? `${(v / 60).toFixed(2)} hrs` : `${v?.toFixed(1)} min`,
      },
    },
    markers: { size: 3, strokeWidth: 0 },
    theme: chartTheme,
  };

  return (
    <ReactApexChart
      type="line"
      series={series.map(({ name, data, color, dashed }) => ({ name, data }))}
      options={options}
      height={height}
    />
  );
}
