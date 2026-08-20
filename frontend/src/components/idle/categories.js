import {
  Snowflake, Wrench, Container, Warehouse, PackagePlus, Building2, Truck,
  FlaskConical, ClipboardList, Sparkles, Hourglass, Layers,
} from "lucide-react";

// Ojidaniya categories, A→Z. MUST mirror the backend's IDLE_CATEGORIES.
// `code` is the "downtime.cat.<code>.label" / ".note" i18n suffix; `name` is
// what the backend stores. Cat H is ALWAYS a real stop — it never had a
// To'xtamaganda half (its second source column is a headcount), so the
// stopped/not-stopped question is not asked of it on either side.
export const CATS = [
  { code: "A",  name: "Cat A" },
  { code: "B",  name: "Cat B" },
  { code: "C",  name: "Cat C" },
  { code: "D",  name: "Cat D" },
  { code: "D2", name: "Cat D2" },
  { code: "D3", name: "Cat D3" },
  { code: "E",  name: "Cat E" },
  { code: "F",  name: "Cat F" },
  { code: "G",  name: "Cat G" },
  { code: "H",  name: "Cat H", alwaysStopped: true },
  { code: "I",  name: "Cat I" },
];

// Themed icon per category — mirrors CategoryLegendModal.jsx CAT_ICON.
export const CAT_ICON = {
  A: Snowflake, B: Wrench, C: Container, D: Warehouse, D2: PackagePlus,
  D3: Building2, E: Truck, F: FlaskConical, G: ClipboardList, H: Sparkles, I: Hourglass,
};

export const iconFor = (code) => CAT_ICON[code] || Layers;
export const catByName = (name) => CATS.find((c) => c.name === name) || null;
export const catIndex = (name) => CATS.findIndex((c) => c.name === name);
