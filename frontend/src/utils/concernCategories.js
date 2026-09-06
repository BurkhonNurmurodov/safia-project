// THE department categories a concern falls under — one definition, shared by
// /concerns (the management register) and /cell-concerns (what the shop floor
// types in). Keys are stable and must stay in sync with CATEGORIES in
// backend/app/routers/concerns.py; labels render per language through
// `concerns.category.<key>`, so the four locales remain the one place the words
// live.
//
// These lived as three private consts inside Concerns.jsx until the cell page
// needed the same fifteen departments. Two copies of a whitelist is how one
// page comes to offer a category the other cannot render.
import {
  Wrench, Boxes, Warehouse, Refrigerator, ShoppingCart, Truck, MonitorCog,
  Droplets, CalendarRange, Users, FlaskConical, Wheat, Shield, ChefHat, Ellipsis,
} from "lucide-react";

export const CATEGORIES = [
  "ars", "inventory", "warehouse", "fridge", "procurement", "logistics",
  "it", "washing", "plan", "hr", "technologist", "raw_material",
  "security", "kitchen", "other",
];

// Per-category identity hue for the category chip — the shared generic-first
// category order (red, green, blue, yellow, … — see utils/chartPalette), keyed
// by the department so each one reads consistently everywhere.
export const CATEGORY_COLOR = {
  ars: "#ef4444", inventory: "#22c55e", warehouse: "#3b82f6", fridge: "#eab308",
  procurement: "#f97316", logistics: "#a855f7", it: "#14b8a6", washing: "#ec4899",
  plan: "#6366f1", hr: "#84cc16", technologist: "#06b6d4", raw_material: "#d946ef",
  security: "#0ea5e9", kitchen: "#b45309",
  // «Другой отдел» is a catch-all, not a department with an identity — slate,
  // the same de-emphasis every «Остальные» fold gets, so it never competes.
  other: "#94a3b8",
};

// Icon per department — same visual language as the downtime category legend
// (Wrench = repair service, Warehouse, Truck = logistics, FlaskConical =
// technologist), extended to the departments the legend doesn't cover.
export const CATEGORY_ICON = {
  ars: Wrench, inventory: Boxes, warehouse: Warehouse, fridge: Refrigerator,
  procurement: ShoppingCart, logistics: Truck, it: MonitorCog, washing: Droplets,
  plan: CalendarRange, hr: Users, technologist: FlaskConical, raw_material: Wheat,
  security: Shield, kitchen: ChefHat, other: Ellipsis,
};
