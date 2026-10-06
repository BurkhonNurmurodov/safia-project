// Which source a tree of «Verifix to'g'irlash» (/staff) components reads.
//
// From the first live shift-day (`live_day.LIVE_FROM`, 2026-10-06) /staff reads
// a live day through `TODAY_STAFF_API` (the operator's rulings of 2026-10-06):
// the live doors (`/api/staff-live`), a react-query prefix that keeps the two
// sources' caches apart, and the row key — a Verifix employee id, where a file
// day keys its rows by the worker NAME. Remembered filters stay /staff's own
// (`pk`), so a filter set on one day carries to the next whatever its source.
// The page picks the source per DAY: a day before the floor keeps the file flow
// it was filed under. No provider (or a null `value`) = the file source, so
// every other caller (Daily included) is unchanged.
//
// (The lab page /staff-live, which read every day live in a look of its own,
// was retired on 2026-10-06; its route redirects to /staff.)
import { createContext, useContext } from "react";

export const STAFF_API = {
  live: false,
  base: "/api/staff",
  qk: (head, ...rest) => [head, ...rest],
  pk: (key) => key,
  rowKey: (w) => w.worker_name,
};

// /staff on a live day: the live source in /staff's memory. The `live:` query
// prefix is load-bearing — `LiveCloseCheck` and Daily read keys under it.
export const TODAY_STAFF_API = {
  live: true,
  base: "/api/staff-live",
  qk: (head, ...rest) => [`live:${head}`, ...rest],
  pk: (key) => key,
  rowKey: (w) => w.employee_id,
};

const Ctx = createContext(STAFF_API);

export function StaffApiProvider({ value = null, children }) {
  return <Ctx.Provider value={value || STAFF_API}>{children}</Ctx.Provider>;
}

export function useStaffApi() {
  return useContext(Ctx);
}
