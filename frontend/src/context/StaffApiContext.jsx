// Which «Verifix to'g'irlash» a tree of /staff components is talking to.
//
// `/staff-live` (2026-10-04, built to replace /staff) is /staff with ONE difference — the
// source (the operator: «the same rule applies for everything … the only
// difference should be the source»). So it renders /staff's own components,
// and this context is all that tells them apart: the API base, a prefix that
// keeps the two pages' react-query caches and remembered filters apart, and the
// row key — a worker NAME on /staff, a Verifix employee id on the live page.
// No provider = /staff, so every existing caller (Daily included) is unchanged.
//
// From the first live shift-day (`live_day.LIVE_FROM`, 2026-10-07) /staff
// itself reads a live day through `TODAY_STAFF_API` (the operator's rulings of
// 2026-10-06): the live doors, cache and row key, with /staff's OWN remembered
// keys and /staff's own look (`chrome: false` — one status column, none of the
// live page's strip, figures or freshness line). The page picks it per DAY:
// a day before the floor keeps the file flow it was filed under.
import { createContext, useContext } from "react";

export const STAFF_API = {
  live: false,
  chrome: false,
  base: "/api/staff",
  qk: (head, ...rest) => [head, ...rest],
  pk: (key) => key,
  rowKey: (w) => w.worker_name,
};

export const LIVE_STAFF_API = {
  live: true,
  chrome: true,
  base: "/api/staff-live",
  qk: (head, ...rest) => [`live:${head}`, ...rest],
  pk: (key) => key.replace(/^staff_/, "staff_live_"),
  rowKey: (w) => w.employee_id,
};

// /staff on a live day: the live source in /staff's look and memory.
export const TODAY_STAFF_API = {
  live: true,
  chrome: false,
  base: "/api/staff-live",
  qk: LIVE_STAFF_API.qk,
  pk: (key) => key,
  rowKey: (w) => w.employee_id,
};

const Ctx = createContext(STAFF_API);

export function StaffApiProvider({ live = false, value = null, children }) {
  return <Ctx.Provider value={value || (live ? LIVE_STAFF_API : STAFF_API)}>{children}</Ctx.Provider>;
}

export function useStaffApi() {
  return useContext(Ctx);
}
