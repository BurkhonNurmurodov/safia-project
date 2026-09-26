// The goals, shared by the board (/targets) and a goal's own page
// (/targets/:id). They live as ONE JSON blob per profile in
// `/api/ui-prefs/targets_lab` — a laboratory page, not a register — and the
// react-query cache is the single copy both pages read and write, so moving
// between them never loses an edit and never shows two versions of a goal.
//
// Writes are optimistic (the cache changes at once) and saved after a short
// pause. The pending save lives at MODULE level, not in a component: leaving
// the board for a goal's page mid-pause must not cancel it, and the last page
// of the two to unmount flushes whatever is still waiting.
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "../../utils/api";
import { normalizeGoal, todayISO } from "../../utils/targets";
import { buildDemoGoals } from "./demoGoals";

const PREF_KEY = "targets_lab";
const QKEY = ["targets", "goals"];
const SAVE_DELAY = 600;

// ── save state — one per app, read by whichever page is on screen ────────────
let saveState = { status: "idle", at: 0 }; // idle · saving · saved · error
const listeners = new Set();
const emit = (next) => {
  saveState = next;
  listeners.forEach((l) => l());
};
const subscribe = (l) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export const useSaveState = () => useSyncExternalStore(subscribe, () => saveState);

let timer = null;
let pending = null; // the latest goals list still waiting to be written
let consumers = 0;

async function flush() {
  clearTimeout(timer);
  timer = null;
  if (!pending) return;
  const goals = pending;
  pending = null;
  emit({ status: "saving", at: Date.now() });
  try {
    await api.put(`/api/ui-prefs/${PREF_KEY}`, {
      value: { v: 1, goals, savedAt: new Date().toISOString() },
    });
    // A newer edit queued meanwhile has its own timer — it will say «saved».
    if (!pending) emit({ status: "saved", at: Date.now() });
  } catch {
    // Keep the failed list for the retry unless a newer one replaced it.
    if (!pending) pending = goals;
    emit({ status: "error", at: Date.now() });
  }
}

function schedule(goals) {
  pending = goals;
  clearTimeout(timer);
  timer = setTimeout(flush, SAVE_DELAY);
}

export const retrySave = () => flush();

export function useGoals() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: QKEY,
    queryFn: async () => {
      const r = await api.get(`/api/ui-prefs/${PREF_KEY}`);
      const v = r.data?.value;
      // A saved EMPTY list stays empty: «I deleted them» is not «I have never
      // been here». Only a profile that never saved anything sees the samples,
      // and they are not written back until somebody changes something.
      if (Array.isArray(v?.goals)) return { goals: v.goals.map(normalizeGoal) };
      return { goals: buildDemoGoals(todayISO()), samples: true };
    },
    staleTime: Infinity,
    retry: 1,
  });

  useEffect(() => {
    consumers += 1;
    return () => {
      consumers -= 1;
      if (!consumers && pending) flush();
    };
  }, []);

  const setGoals = useCallback((next) => {
    const cur = qc.getQueryData(QKEY)?.goals ?? [];
    const goals = typeof next === "function" ? next(cur) : next;
    qc.setQueryData(QKEY, { goals });
    schedule(goals);
  }, [qc]);

  return {
    goals: q.data?.goals ?? null,
    isError: q.isError,
    refetch: q.refetch,
    setGoals,
  };
}
