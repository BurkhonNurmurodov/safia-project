import { useTheme } from "../context/ThemeContext";

export function useChartTheme() {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  return {
    chartTheme: { mode: isDark ? "dark" : "light" },
    gridColor: isDark ? "#1e2235" : "#e5e7eb",
    labelColor: isDark ? "#6b7280" : "#9ca3af",
    legendColor: isDark ? "#9ca3af" : "#374151",
    tooltipTheme: isDark ? "dark" : "light",
    background: "transparent",
  };
}
