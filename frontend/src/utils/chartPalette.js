// Shared categorical chart palette (user directive 2026-07-23).
//
// Wherever a chart color represents a CATEGORY (roles, units, products,
// projects, request types, people…) it must come from this list, assigned in
// this exact order — generic hues first (red, green, blue, yellow), exotic
// hues only after the generic ones are already on screen. Brand gold #C8973F
// is never a category color. Applies to every page except /leaders.
//
// Status/traffic-light palettes (green=good / yellow=warning / red=bad /
// grey=not-started) and value-intensity ramps (heatmaps) are SEMANTIC, not
// categorical — they keep their own colors and never use this list.
export const CATEGORY_COLORS = [
  "#ef4444", // red
  "#22c55e", // green
  "#3b82f6", // blue
  "#eab308", // yellow
  "#f97316", // orange
  "#a855f7", // purple
  "#14b8a6", // teal
  "#ec4899", // pink
  "#6366f1", // indigo
  "#84cc16", // lime
  "#06b6d4", // cyan
  "#d946ef", // fuchsia
  "#0ea5e9", // sky
  "#b45309", // brown
  "#15803d", // dark green
  "#6d28d9", // deep violet
  "#64748b", // slate
  "#0d9488", // dark teal
];

// «Остальные / Boshqalar / Other» fold buckets are de-emphasis slate — a bucket
// must not compete for an identity hue.
export const FOLD_COLOR = "#94a3b8";

// A platform ROLE is a category too: one fixed hue each, none of them a
// traffic-light colour (a status chip usually sits right beside the role).
// The Users register's chips and the profile page's header share this map.
export const ROLE_COLORS = {
  "top-manager":   CATEGORY_COLORS[5],  // purple
  "shift-manager": CATEGORY_COLORS[2],  // blue
  supervisor:      CATEGORY_COLORS[6],  // teal
  leader:          CATEGORY_COLORS[4],  // orange
  "idle-owner":    CATEGORY_COLORS[7],  // pink
  guest:           FOLD_COLOR,
};

export const categoryColor = (i) => CATEGORY_COLORS[i % CATEGORY_COLORS.length];

// Stable category→color map from an ordered key list (order = share size or
// first appearance — whatever the page already sorts by). Fold keys get slate
// without consuming a palette slot.
export const assignCategoryColors = (keys, foldKeys = []) => {
  const map = {};
  let i = 0;
  for (const k of keys) map[k] = foldKeys.includes(k) ? FOLD_COLOR : categoryColor(i++);
  return map;
};
