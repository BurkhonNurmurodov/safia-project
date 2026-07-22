export function fmtPct(val, decimals = 1) {
  if (val === null || val === undefined) return "—";
  return `${(val * 100).toFixed(decimals)}%`;
}

export function fmtTime(val, unit = "min", decimals = 1, minLabel, hrsLabel) {
  if (val === null || val === undefined) return "—";
  if (unit === "hrs") return `${(val / 60).toFixed(decimals)} ${hrsLabel ?? "hrs"}`;
  return `${Number(val).toFixed(decimals)} ${minLabel ?? "min"}`;
}

// Compound duration from minutes, dropping empty leading units: "8 daq",
// "1 soat 35 daq", "3 kun 22 soat". Use this instead of fmtTime(…, "hrs")
// wherever values can be small: fractional hours at one decimal is a 6-minute
// bucket, so 3 min and 8 min both render "0.1 soat" — distinct numbers collapse
// into the same label. Minutes are always emitted when nothing larger is
// present, so a value never renders empty. Labels are passed in (not looked up)
// to keep this a pure formatter — callers supply t("general.unitDay") etc.
export function fmtDuration(mins, { day = "d", hour = "h", min = "m" } = {}) {
  if (mins === null || mins === undefined) return "—";
  const total = Math.round(Number(mins));
  if (!Number.isFinite(total)) return "—";
  const sign = total < 0 ? "-" : "";
  const abs = Math.abs(total);
  const days = Math.floor(abs / 1440);
  const hrs = Math.floor((abs % 1440) / 60);
  const rem = abs % 60;
  const parts = [];
  if (days) parts.push(`${days} ${day}`);
  if (hrs) parts.push(`${hrs} ${hour}`);
  if (rem || parts.length === 0) parts.push(`${rem} ${min}`);
  return sign + parts.join(" ");
}

export function fmtNum(val, decimals = 1) {
  if (val === null || val === undefined) return "—";
  return Number(val).toFixed(decimals);
}

export function pctToDisplay(val) {
  if (val === null || val === undefined) return null;
  return Math.round(val * 100);
}

export function statusColor(status) {
  switch (status) {
    case "Over Capacity": return "text-green-400";
    case "On Track": return "text-yellow-300";
    case "Monitor": return "text-orange-400";
    case "Needs Attention": return "text-red-400";
    default: return "text-gray-400";
  }
}

// Fallback badge classes (used when no live segment color is supplied). Mirrors
// the D = P − A bands: Monitor blue, Good green, On Track yellow, Needs Attention red.
export function statusBg(status) {
  switch (status) {
    case "Monitor": return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    case "Good": return "bg-green-500/20 text-green-400 border-green-500/30";
    case "Over Capacity": return "bg-green-500/20 text-green-400 border-green-500/30";
    case "On Track": return "bg-yellow-500/20 text-yellow-300 border-yellow-500/30";
    case "Needs Attention": return "bg-red-500/20 text-red-400 border-red-500/30";
    default: return "bg-gray-500/20 text-gray-400 border-gray-500/30";
  }
}

export function utilColor(val) {
  if (val === null || val === undefined) return "#6b7280";
  const pct = val * 100;
  if (pct >= 105) return "#22c55e";
  if (pct >= 95) return "#84cc16";
  if (pct >= 90) return "#f97316";
  return "#ef4444";
}

export function utilBgClass(val) {
  if (val === null || val === undefined) return "bg-gray-700 text-gray-400";
  const pct = val * 100;
  if (pct >= 105) return "bg-green-500 text-white";
  if (pct >= 95) return "bg-yellow-400 text-gray-900";
  if (pct >= 90) return "bg-orange-500 text-white";
  return "bg-red-500 text-white";
}
