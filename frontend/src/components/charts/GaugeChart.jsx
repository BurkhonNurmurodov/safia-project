import ReactApexChart from "react-apexcharts";
import { useTheme } from "../../context/ThemeContext";

const ZONES = [
  { limit: 0.85, color: "#ef4444" },   // < 85% — red
  { limit: 0.90, color: "#f97316" },   // 85–90% — orange
  { limit: 0.95, color: "#eab308" },   // 90–95% — yellow
  { limit: 1.05, color: "#22c55e" },   // 95–105% — green
  { limit: 9.99, color: "#f59e0b" },   // > 105% — amber (over capacity)
];

function gaugeColor(val) {
  if (val === null || val === undefined) return "#6b7280";
  for (const z of ZONES) if (val < z.limit) return z.color;
  return "#C8973F";
}

export default function GaugeChart({ value, label = "Difference", size = 180 }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const pct = value !== null && value !== undefined ? Math.round(value * 100) : null;
  const color = gaugeColor(value);

  const options = {
    chart: { type: "radialBar", background: "transparent", sparkline: { enabled: true }, animations: { enabled: false }, redrawOnParentResize: false, redrawOnWindowResize: false },
    plotOptions: {
      radialBar: {
        startAngle: -135,
        endAngle: 135,
        hollow: { size: "55%" },
        track: { background: isDark ? "#1e2235" : "#e5e7eb", strokeWidth: "100%" },
        dataLabels: {
          name: { show: true, color: isDark ? "#9ca3af" : "#6b7280", fontSize: "11px", offsetY: 20 },
          value: {
            show: true,
            color: color,
            fontSize: "22px",
            fontWeight: 700,
            fontFamily: "inherit",
            offsetY: -10,
            formatter: (v) => `${v}%`,
          },
        },
      },
    },
    fill: { colors: [color] },
    stroke: { lineCap: "round" },
    labels: [label],
    theme: { mode: isDark ? "dark" : "light" },
  };

  return (
    <ReactApexChart
      type="radialBar"
      series={[pct ?? 0]}
      options={options}
      height={size}
      width={size}
    />
  );
}
