import { useChartTheme } from "../../hooks/useChartTheme";
import ReactApexChart from "react-apexcharts";
import { fmtPct } from "../../utils/formatters";
import { useLang } from "../../context/LangContext";

const STAGE_KEYS = ["baseline_util", "adjusted_util", "after_idle_util", "after_early_util", "net_util"];
const STAGE_LABEL_KEYS = [
  "overview.funnelPlanned",
  "overview.funnelActual",
  "overview.funnelAfterIdle",
  "overview.funnelAfterEarly",
  "overview.funnelFinal",
];

const STAGE_COLORS = ["#ef4444", "#f97316", "#eab308", "#84cc16", "#22c55e"];

export default function FunnelChart({ data, height = 320 }) {
  const { chartTheme, gridColor, labelColor, legendColor, tooltipTheme } = useChartTheme();
  const { t } = useLang();
  const values = STAGE_KEYS.map((key) => {
    const v = data?.[key];
    return v !== null && v !== undefined ? Math.round(v * 100) : 0;
  });
  const labels = STAGE_LABEL_KEYS.map((k) => t(k));

  const options = {
    chart: {
      type: "bar", background: "transparent", toolbar: { show: false },
      animations: { enabled: false },
      redrawOnParentResize: false, redrawOnWindowResize: false,
    },
    plotOptions: {
      bar: {
        horizontal: true,
        distributed: true,
        barHeight: "70%",
        isFunnel: true,
      },
    },
    colors: STAGE_COLORS,
    dataLabels: {
      enabled: true,
      formatter: (val) => `${val}%`,
      style: { fontSize: "12px", fontWeight: 700, colors: ["#fff"] },
      dropShadow: { enabled: false },
    },
    xaxis: {
      categories: labels,
      labels: { style: { colors: legendColor, fontSize: "11px" } },
      max: Math.max(...values, 110),
    },
    yaxis: { labels: { style: { colors: legendColor, fontSize: "11px" } } },
    grid: { borderColor: gridColor },
    tooltip: {
      theme: "dark",
      y: { formatter: (v) => `${v}%` },
    },
    legend: { show: false },
    theme: chartTheme,
  };

  return (
    <ReactApexChart
      type="bar"
      series={[{ name: t("overview.funnelSeries"), data: values }]}
      options={options}
      height={height}
    />
  );
}
