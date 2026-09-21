// Plain (non-component) pieces shared by the Targets components — kept out of
// the .jsx files so each of those exports components only (fast refresh).
import {
  Hash, Percent, Coins, ToggleLeft, ListChecks, Trophy, CircleCheck, TriangleAlert,
  CircleAlert, Clock, CircleDashed,
} from "lucide-react";
import { fmtNumber, fmtValue } from "../../utils/targets";

// The house control skin (TimeField's): bg-inner, border, rounded-xl.
export const INPUT_CLS = "w-full rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--brand-ring)]";
export const INPUT_STYLE = { background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" };

export const TYPE_ICON = { number: Hash, percent: Percent, currency: Coins, boolean: ToggleLeft, tasks: ListChecks };
export const STATUS_ICON = {
  achieved: Trophy, on_track: CircleCheck, at_risk: TriangleAlert,
  behind: CircleAlert, overdue: Clock, not_started: CircleDashed,
};

// «43,2 mln» for a card row that cannot spare «43 200 000» — millions and
// billions only; anything smaller prints in full.
export function fmtCompact(v, t) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${fmtNumber(n / 1e9)} ${t("targets.mlrd")}`;
  if (abs >= 1e6) return `${fmtNumber(n / 1e6)} ${t("targets.mln")}`;
  return fmtNumber(n);
}

// «47 / 40 daq» · «88 / 95%» · «43,2 mln / 30 mln so'm» · «2/5» · «Bajarildi»
export function valueLabel(tg, t) {
  if (tg.type === "boolean") return tg.done ? t("targets.markDone") : t("targets.markUndone");
  if (tg.type === "tasks") {
    const items = tg.items ?? [];
    return `${items.filter((i) => i.done).length}/${items.length}`;
  }
  if (tg.type === "percent") return `${fmtNumber(tg.current)} / ${fmtValue(tg.target, tg)}`;
  const unit = tg.type === "currency" ? (tg.unit || "so'm") : tg.unit;
  return `${fmtCompact(tg.current, t)} / ${fmtCompact(tg.target, t)}${unit ? ` ${unit}` : ""}`;
}
