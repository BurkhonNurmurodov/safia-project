// Plain (non-component) pieces shared by the Targets components — kept out of
// the .jsx files so each of those exports components only (fast refresh).
import {
  Hash, Percent, Coins, ToggleLeft, ListChecks, Trophy, CircleCheck, TriangleAlert,
  CircleAlert, Clock, CircleDashed, Factory, ShieldCheck, Users, Wallet, HardHat, Shapes,
} from "lucide-react";
import { fmtNumber, fmtPct, fill, GREY } from "../../utils/targets";
import { GREEN, AMBER, RED } from "../../utils/statusBands";

// The house control skin (TimeField's): bg-inner, border, rounded-xl. 16px text
// on a phone — a smaller font makes iOS zoom the whole page into the field the
// moment it is tapped — and 14px from sm up; leading-5 keeps it 38px either way.
export const INPUT_CLS = "w-full rounded-xl px-3 py-2 text-base sm:text-sm leading-5 outline-none focus:ring-2 focus:ring-[var(--brand-ring)]";
export const INPUT_STYLE = { background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" };

export const TYPE_ICON = { number: Hash, percent: Percent, currency: Coins, boolean: ToggleLeft, tasks: ListChecks };
export const STATUS_ICON = {
  achieved: Trophy, on_track: CircleCheck, at_risk: TriangleAlert,
  behind: CircleAlert, overdue: Clock, not_started: CircleDashed,
};
// A goal's AREA is told by an icon and its name, never by a colour: on this
// board colour means STATUS, and the categorical palette opens on red, green
// and yellow — an on-track goal in a red area used to wear a red stripe.
export const AREA_ICON = {
  production: Factory, quality: ShieldCheck, people: Users, cost: Wallet, safety: HardHat, other: Shapes,
};
export const GROUP_ICON = { attention: TriangleAlert, on_track: CircleCheck, not_started: CircleDashed, achieved: Trophy };

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

// A numeric result as «now → target», the unit once at the end: «47 → 40 daq»,
// «81% → 90%», «43,2 mln → 30 mln so'm». The arrow reads the same for a result
// that must grow and one that must shrink, where «27 / 10» read as «27 of 10».
export function krParts(tg, t) {
  if (tg.type === "percent") return { cur: `${fmtNumber(tg.current)}%`, tgt: `${fmtNumber(tg.target)}%`, unit: "" };
  const unit = tg.type === "currency" ? (tg.unit || "so'm") : tg.unit;
  return { cur: fmtCompact(tg.current, t), tgt: fmtCompact(tg.target, t), unit: unit ? ` ${unit}` : "" };
}

// The colour a group is drawn in: «needs attention» is red while any of its
// goals is behind or overdue, amber when all it holds is «at risk».
export function groupColor(key, counts) {
  if (key === "attention") return (counts.overdue || counts.behind) ? RED : AMBER;
  if (key === "not_started") return GREY;
  return GREEN;
}

// The sentence under a pace bar: what the plan says for today and how far the
// goal stands from it — the reason behind the chip, in words.
export function paceCaption({ st, p, e, t }) {
  if (st === "achieved") return { text: t("targets.pace.achieved") };
  if (e === null) return { text: t("targets.noDates") };
  const plan = fill(t("targets.pace.plan"), { e: fmtPct(e) });
  if (st === "not_started") return { plan, tail: t("targets.pace.notStarted") };
  const gap = Math.round((e - p) * 100);
  const tail = gap > 0 ? fill(t("targets.pace.behind"), { d: `${gap}%` })
    : gap < 0 ? fill(t("targets.pace.ahead"), { d: `${-gap}%` })
      : t("targets.pace.onPlan");
  return { plan, tail };
}
