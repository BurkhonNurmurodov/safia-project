import { useTheme } from "../context/ThemeContext";

export function useChartTheme() {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  return {
    chartTheme: { mode: isDark ? "dark" : "light" },
    // --bg-card as hex — Apex needs literal colors (seam strokes between
    // stacked-area bands must match the card surface).
    cardBg: isDark ? "#1a1d27" : "#ffffff",
    gridColor: isDark ? "#1e2235" : "#e5e7eb",
    labelColor: isDark ? "#6b7280" : "#9ca3af",
    legendColor: isDark ? "#9ca3af" : "#374151",
    tooltipTheme: isDark ? "dark" : "light",
    background: "transparent",
  };
}
