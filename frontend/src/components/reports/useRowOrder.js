// The order a reader put the figures of «Hisobotlar» in — one list of row keys
// per table, saved for the active PROFILE in ui-prefs (it travels across
// devices, like every table's column choice). The page reads it twice: the
// tables draw their rows in it, and the download sends it so the file follows
// the screen.
//
// Shape: { "<section>.<block>": [rowKey, …] }. A table with no entry keeps the
// server's order; putting a table back in that order deletes its entry, so the
// pref only ever holds what somebody actually moved.
import { useCallback, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "../../utils/api";

const PREF = "reports.rows";
const QK = ["ui-pref", PREF];
const SAVE_AFTER_MS = 600;  // a run of arrow-key moves is ONE save

/** Rows in the saved order. A figure the list has never seen (added to the
 *  report since) goes at the end, in the server's order, so nothing vanishes. */
export function ordered(rows, keys) {
  if (!Array.isArray(keys) || !keys.length) return rows;
  const pos = new Map(keys.map((k, i) => [k, i]));
  const known = rows.filter((r) => pos.has(r.key)).sort((a, b) => pos.get(a.key) - pos.get(b.key));
  return [...known, ...rows.filter((r) => !pos.has(r.key))];
}

export function useRowOrder({ onSaveError } = {}) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: QK,
    queryFn: () => api.get(`/api/ui-prefs/${PREF}`).then((r) => r.data?.value),
    staleTime: Infinity,
  });
  const order = data && typeof data === "object" && !Array.isArray(data) ? data : {};

  const save = useMutation({
    mutationFn: (value) => api.put(`/api/ui-prefs/${PREF}`, { value }),
    onError: () => onSaveError?.(),
  });
  // `mutate` through a ref, so `flush` is stable and the unmount flush below
  // runs on unmount only — never on a re-render in the middle of a run.
  const mutate = useRef(save.mutate);
  mutate.current = save.mutate;
  const timer = useRef(null);
  const pending = useRef(null);
  const flush = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = null;
    if (pending.current) {
      mutate.current(pending.current);
      pending.current = null;
    }
  }, []);
  useEffect(() => () => flush(), [flush]);

  /** Put one table's rows in `keys`; `null` (or the server's own order, which
   *  the caller sends as null) drops the entry. `now` saves at once — a drop —
   *  where a key press waits for the run to end. */
  const setBlock = useCallback((blockKey, keys, now = false) => {
    const cur = qc.getQueryData(QK);
    const next = { ...(cur && typeof cur === "object" && !Array.isArray(cur) ? cur : {}) };
    if (keys && keys.length) next[blockKey] = keys; else delete next[blockKey];
    qc.setQueryData(QK, next);
    pending.current = next;
    clearTimeout(timer.current);
    if (now) flush(); else timer.current = setTimeout(flush, SAVE_AFTER_MS);
  }, [qc, flush]);

  return { order, setBlock };
}
