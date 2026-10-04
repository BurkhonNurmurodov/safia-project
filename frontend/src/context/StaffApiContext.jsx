// Which «Verifix to'g'irlash» a tree of /staff components is talking to.
//
// `/staff-live` (the lab, 2026-10-04) is /staff with ONE difference — the
// source (the operator: «the same rule applies for everything … the only
// difference should be the source»). So it renders /staff's own components,
// and this context is all that tells them apart: the API base, a prefix that
// keeps the two pages' react-query caches and remembered filters apart, and the
// row key — a worker NAME on /staff, a Verifix employee id on the live page.
// No provider = /staff, so every existing caller (Daily included) is unchanged.
import { createContext, useContext } from "react";

export const STAFF_API = {
  live: false,
  base: "/api/staff",
  qk: (head, ...rest) => [head, ...rest],
  pk: (key) => key,
  rowKey: (w) => w.worker_name,
};

export const LIVE_STAFF_API = {
  live: true,
  base: "/api/staff-live",
  qk: (head, ...rest) => [`live:${head}`, ...rest],
  pk: (key) => key.replace(/^staff_/, "staff_live_"),
  rowKey: (w) => w.employee_id,
};

const Ctx = createContext(STAFF_API);

export function StaffApiProvider({ live = false, children }) {
  return <Ctx.Provider value={live ? LIVE_STAFF_API : STAFF_API}>{children}</Ctx.Provider>;
}

export function useStaffApi() {
  return useContext(Ctx);
}
