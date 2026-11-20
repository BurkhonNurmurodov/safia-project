import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useLocation, useNavigationType, useSearchParams } from "react-router-dom";
import api from "../utils/api";
import { useAuth } from "./AuthContext";

const FilterContext = createContext(null);

const LS = {
  get: (key, fallback = "") => localStorage.getItem(`zf_${key}`) || fallback,
  set: (key, val) => val ? localStorage.setItem(`zf_${key}`, val) : localStorage.removeItem(`zf_${key}`),
};

// Read a value from URL first, then localStorage, then fallback
function init(key, fallback = "") {
  return new URLSearchParams(window.location.search).get(key)
    || LS.get(key, fallback);
}

// Default range = the last 14 days of available data (anchored at `to`,
// never reaching before the first available day `from`).
const DEFAULT_RANGE_DAYS = 14;
function minusDaysISO(iso, days) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function lastNDaysFrom(to, from, n = DEFAULT_RANGE_DAYS) {
  let start = minusDaysISO(to, n - 1);   // inclusive window of n days
  if (from && start < from) start = from; // clamp to earliest available day
  return start;
}
function initArr(key) {
  const fromUrl = new URLSearchParams(window.location.search).getAll(key).map(Number).filter(Boolean);
  if (fromUrl.length) return fromUrl;
  try { return JSON.parse(LS.get(key, "[]")); } catch { return []; }
}

// A link that NAMES the shared scope — the very params this provider writes:
// `date_from` + `date_to` (both, real days, in order), and optionally `shift`
// and `manager_id`. Such a URL is a COMPLETE statement, exactly as the one
// written below is: no `shift` means both shifts, no `manager_id` every
// brigadir. Null when the URL names no period.
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
function readLink(search) {
  const q = new URLSearchParams(search);
  const from = q.get("date_from");
  const to = q.get("date_to");
  if (!ISO_DAY.test(from || "") || !ISO_DAY.test(to || "") || from > to) return null;
  const shift = Number(q.get("shift"));
  return {
    from, to,
    shift: shift === 1 || shift === 2 ? shift : null,
    ids: q.getAll("manager_id").map(Number).filter(Boolean),
  };
}
const sameIds = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

export function FilterProvider({ children }) {
  const [, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navType = useNavigationType();
  const { auth } = useAuth();

  const [dateFrom,    setDateFromState]    = useState(() => init("date_from"));
  const [dateTo,      setDateToState]      = useState(() => init("date_to"));
  const [shift,       setShiftState]       = useState(() => { const s = init("shift"); return s ? Number(s) : null; });
  const [unit,        setUnitState]        = useState(() => init("unit", "min"));
  const [brigadirIds, setBrigadirIdsState] = useState(() => initArr("manager_id"));
  const [ready,       setReady]            = useState(false);

  // A link pressed INSIDE the app that names the scope is honoured — the same
  // URL a fresh tab already opens on (`init` above). Until 2026-11-20 only the
  // first load read the address bar, so `/zagruzka?date_from=…` pressed on a
  // page was ignored: the provider was already standing on its own dates. The
  // first callers are «Hisobotlar»'s figures (utils/scopeLinks.js), each of
  // which opens its page on the month it was read for.
  //
  // PUSH only: a link somebody pressed. Never this provider's own URL sync (a
  // REPLACE), a redirect, or Back / Forward (POP) — an older entry's params
  // must not quietly undo a period picked since. Adopted DURING the render the
  // navigation arrives in, so the page it opens never asks for the old scope.
  const [seenKey, setSeenKey] = useState(location.key);
  if (seenKey !== location.key) {
    setSeenKey(location.key);
    const link = navType === "PUSH" ? readLink(location.search) : null;
    if (link) {
      setDateFromState(link.from);
      setDateToState(link.to);
      setShiftState(link.shift);
      setBrigadirIdsState((cur) => (sameIds(cur, link.ids) ? cur : link.ids));
    }
  }

  // If dates are known (URL or localStorage), go ready immediately. Otherwise
  // fetch the available range from the DB — but only once the session is
  // approved, since /api/attendance/range now requires auth (and the initData
  // guard). Re-runs when auth resolves so a first-ever login still populates it.
  useEffect(() => {
    if (dateFrom && dateTo) {
      setReady(true);
      return;
    }
    if (auth?.status !== "approved") return;
    api.get("/api/attendance/range")
      .then((r) => {
        const from = r.data?.date_from;
        const to   = r.data?.date_to;
        // `cur ||`: a link may have named the period while this was on its
        // way, and it stands. The sync effect below stores whichever won.
        if (to) {
          // Default to the last 14 days of available data.
          const start = lastNDaysFrom(to, from);
          setDateFromState((cur) => cur || start);
          setDateToState((cur) => cur || to);
        } else if (from) {
          setDateFromState((cur) => cur || from);
        }
      })
      .catch(() => {})
      .finally(() => setReady(true));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth?.status]);

  // Sync all filter state → URL and localStorage whenever it changes.
  // Skip the very first render to avoid overwriting URL with empty values.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    if (!dateFrom && !dateTo) return;

    // localStorage
    LS.set("date_from", dateFrom);
    LS.set("date_to",   dateTo);
    LS.set("shift",     shift ? String(shift) : "");
    LS.set("unit",      unit !== "min" ? unit : "");
    LS.set("manager_id", brigadirIds.length ? JSON.stringify(brigadirIds) : "");

    // URL. Built on the address bar as it IS, not on this render's copy of
    // it: a page that has just dropped a link's own params (`useUrlScope`
    // runs before this — a child's effect) must not have them written back.
    setSearchParams(() => {
      const p = new URLSearchParams(window.location.search);
      if (dateFrom) p.set("date_from", dateFrom); else p.delete("date_from");
      if (dateTo)   p.set("date_to",   dateTo);   else p.delete("date_to");
      if (shift)    p.set("shift",     String(shift)); else p.delete("shift");
      if (unit && unit !== "min") p.set("unit", unit); else p.delete("unit");
      p.delete("manager_id");
      brigadirIds.forEach(id => p.append("manager_id", String(id)));
      return p;
    }, { replace: true });
  }, [dateFrom, dateTo, shift, unit, brigadirIds]); // eslint-disable-line react-hooks/exhaustive-deps

  function setDateFrom(val)    { setDateFromState(val); }
  function setDateTo(val)      { setDateToState(val); }
  function setShift(val)       { setShiftState(val); }
  function setUnit(val)        { setUnitState(val); }
  function setBrigadirIds(ids) { setBrigadirIdsState(ids); }

  const params = {
    ...(dateFrom       ? { date_from: dateFrom }       : {}),
    ...(dateTo         ? { date_to: dateTo }           : {}),
    ...(shift          ? { shift }                     : {}),
    ...(brigadirIds.length ? { manager_id: brigadirIds } : {}),
  };

  return (
    <FilterContext.Provider value={{
      dateFrom, setDateFrom,
      dateTo, setDateTo,
      shift, setShift,
      brigadirIds, setBrigadirIds,
      unit, setUnit,
      params,
      ready,
    }}>
      {children}
    </FilterContext.Provider>
  );
}

export const useFilters = () => useContext(FilterContext);
