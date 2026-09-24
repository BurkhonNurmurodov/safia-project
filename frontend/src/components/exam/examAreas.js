/**
 * The exam's eight areas — one hue each, in CATEGORY_COLORS order, shared by
 * the strip, the leader page and the admin bank so an area is one colour on
 * every surface. The backend twin is services/exam_bank.AREAS.
 */
import { CATEGORY_COLORS } from "../../utils/chartPalette";
import {
  ListTodo, MessageSquareWarning, MessageSquarePlus, Timer, Crown, BarChart2,
  PlaySquare, UserRound,
} from "lucide-react";

export const AREAS = [
  { key: "tasks",         letter: "A", color: CATEGORY_COLORS[0], Icon: ListTodo },
  { key: "concerns",      letter: "B", color: CATEGORY_COLORS[1], Icon: MessageSquareWarning },
  { key: "cell_concerns", letter: "C", color: CATEGORY_COLORS[2], Icon: MessageSquarePlus },
  { key: "idle",          letter: "D", color: CATEGORY_COLORS[3], Icon: Timer },
  { key: "leaders",       letter: "E", color: CATEGORY_COLORS[4], Icon: Crown },
  { key: "analysis",      letter: "F", color: CATEGORY_COLORS[5], Icon: BarChart2 },
  { key: "education",     letter: "G", color: CATEGORY_COLORS[6], Icon: PlaySquare },
  { key: "profile",       letter: "H", color: CATEGORY_COLORS[7], Icon: UserRound },
];

export const AREA_BY_KEY = Object.fromEntries(AREAS.map((a) => [a.key, a]));

export const areaOf = (key) => AREA_BY_KEY[key] || AREAS[0];

/** Status → RequestStateChip state + i18n key. */
export const TASK_STATE = {
  passed:      { chip: "approved", key: "exam.st.passed" },
  open:        { chip: "pending",  key: "exam.st.open" },
  skipped:     { chip: "neutral",  key: "exam.st.skipped" },
  unavailable: { chip: "neutral",  key: "exam.st.unavailable" },
};

/** `{n}`-style interpolation — t() takes one argument on this platform. */
export const fill = (s, vars) =>
  String(s ?? "").replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? String(vars[k]) : m));

export const ATTEMPT_STATE = {
  assigned:  { chip: "pending",  key: "exam.attempt.assigned" },
  running:   { chip: "pending",  key: "exam.attempt.running" },
  submitted: { chip: "approved", key: "exam.attempt.submitted" },
  expired:   { chip: "rejected", key: "exam.attempt.expired" },
  cancelled: { chip: "neutral",  key: "exam.attempt.cancelled" },
};
