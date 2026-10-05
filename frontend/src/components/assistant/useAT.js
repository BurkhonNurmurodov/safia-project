import { useCallback } from "react";
import { useLang } from "../../context/LangContext";

/** `t()` with «{name}» placeholders filled — the assistant's strings carry
 *  counts and names, and the platform's `t` takes a key alone. */
export default function useAT() {
  const { t } = useLang();
  return useCallback((key, vars) => {
    const s = t(key);
    return vars ? String(s).replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m)) : s;
  }, [t]);
}
