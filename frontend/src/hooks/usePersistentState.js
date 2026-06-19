import { useState, useEffect } from "react";

// Drop-in replacement for useState that mirrors its value to localStorage, so a
// selection survives the component unmounting (e.g. navigating to another page
// and coming back). Values are JSON-encoded, so strings, numbers, null and
// arrays all round-trip. `initial` may be a value or a lazy initializer fn.
export function usePersistentState(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) return JSON.parse(raw);
    } catch {
      /* corrupt/unavailable storage → fall back to initial */
    }
    return typeof initial === "function" ? initial() : initial;
  });

  useEffect(() => {
    try {
      if (value === null || value === undefined) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* private mode / quota — degrade to in-memory state */
    }
  }, [key, value]);

  return [value, setValue];
}
