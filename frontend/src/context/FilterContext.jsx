import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../utils/api";

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

export function FilterProvider({ children }) {
  const [, setSearchParams] = useSearchParams();

  const [dateFrom,    setDateFromState]    = useState(() => init("date_from"));
  const [dateTo,      setDateToState]      = useState(() => init("date_to"));
  const [shift,       setShiftState]       = useState(() => { const s = init("shift"); return s ? Number(s) : null; });
  const [unit,        setUnitState]        = useState(() => init("unit", "min"));
  const [brigadirIds, setBrigadirIdsState] = useState(() => initArr("manager_id"));
  const [ready,       setReady]            = useState(false);

  // On mount: if dates are known (URL or localStorage), go ready immediately.
  // Otherwise fetch the available range from the DB.
  useEffect(() => {
    if (dateFrom && dateTo) {
      setReady(true);
      return;
    }
    api.get("/api/attendance/range")
      .then((r) => {
        const from = r.data?.date_from;
        const to   = r.data?.date_to;
        if (to) {
          // Default to the last 14 days of available data.
          const start = lastNDaysFrom(to, from);
          setDateFromState(start); LS.set("date_from", start);
          setDateToState(to);      LS.set("date_to",   to);
        } else if (from) {
          setDateFromState(from);  LS.set("date_from", from);
        }
      })
      .finally(() => setReady(true));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

    // URL
    setSearchParams(prev => {
      const p = new URLSearchParams(prev);
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
