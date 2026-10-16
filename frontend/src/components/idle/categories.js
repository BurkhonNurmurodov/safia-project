import {
  Snowflake, PackageCheck, Wrench, Container, Warehouse, PackagePlus, Building2,
  Truck, FlaskConical, ClipboardList, Sparkles, Hourglass, Layers,
} from "lucide-react";
import { CATEGORY_COLORS } from "../../utils/chartPalette";

// Ojidaniya categories, A→Z. MUST mirror the backend's IDLE_CATEGORIES.
// `code` is the "downtime.cat.<code>.label" / ".note" i18n suffix; `name` is
// what the backend stores. Cat H is ALWAYS a real stop — it never had a
// To'xtamaganda half (its second source column is a headcount), so the
// stopped/not-stopped question is not asked of it on either side.
//
// `cleaners` marks the category whose entry must say HOW MANY PEOPLE it took —
// «Tozalovchilar» (2026-09-29): not everybody in a cell cleans, and the
// figures count only those who did. Mirrors the backend's
// `sheets_reader.CLEANERS_CATS`; the form and the live recorder both ask it
// off this flag, never off the category's name.
//
// `notInLoad` marks a category the загрузка does NOT count — shown on the
// Ojidaniya page and nowhere else. Mirrors the backend's
// `sheets_reader.OJIDANIYA_ONLY_CATS`, the ONE definition; nobody carries it
// since 2026-10-16, when Cat H followed Cat I into the загрузка (the
// operator's directive), so `OJIDANIYA_ONLY_CATS` below is empty and the
// «Barchasi / Zagruzkada hisoblanadi» toggle on /downtime is not drawn —
// flag a category here the day the backend's set gains one, and it is back.
export const CATS = [
  { code: "A",  name: "Cat A" },
  { code: "A2", name: "Cat A2" },
  { code: "B",  name: "Cat B" },
  { code: "C",  name: "Cat C" },
  { code: "D",  name: "Cat D" },
  { code: "D2", name: "Cat D2" },
  { code: "D3", name: "Cat D3" },
  { code: "E",  name: "Cat E" },
  { code: "F",  name: "Cat F" },
  { code: "G",  name: "Cat G" },
  { code: "H",  name: "Cat H", alwaysStopped: true, cleaners: true },
  { code: "I",  name: "Cat I" },
];

// The categories the загрузка leaves out, by stored name — the client twin of
// `sheets_reader.OJIDANIYA_ONLY_CATS` (see `notInLoad` above). Empty today.
export const OJIDANIYA_ONLY_CATS = CATS.filter((c) => c.notInLoad).map((c) => c.name);

// Themed icon per category — mirrors CategoryLegendModal.jsx CAT_ICON.
export const CAT_ICON = {
  A: Snowflake, A2: PackageCheck, B: Wrench, C: Container, D: Warehouse,
  D2: PackagePlus, D3: Building2, E: Truck, F: FlaskConical, G: ClipboardList,
  H: Sparkles, I: Hourglass,
};

export const iconFor = (code) => CAT_ICON[code] || Layers;
export const catByName = (name) => CATS.find((c) => c.name === name) || null;
export const catIndex = (name) => CATS.findIndex((c) => c.name === name);

// THE identity hue of an ojidaniya category, keyed by its canonical A→Z
// position above — never by the position one page's own list happens to give
// it. A page shows the categories its scope has, sorted by whatever that page
// sorts by (the Daily donut by minutes, the Ojidaniya page by the response's
// list, which the «загрузкада» toggle shortens), so a positional hue makes the
// same Cat I red on one screen and cyan on the next. An unknown name keeps the
// first slot, exactly as the timeline and the register already gave it.
export const catColor = (name) => {
  const i = catIndex(name);
  return CATEGORY_COLORS[(i < 0 ? 0 : i) % CATEGORY_COLORS.length];
};
