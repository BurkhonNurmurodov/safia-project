// Data hooks of the notification centre. Read state lives on the SERVER now
// (notification_reads, per person) — the old localStorage list gave a phone, a
// desktop and the Android app three different answers for one person.
import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "../../utils/api";

export const SUMMARY_KEY = ["notif", "summary"];
export const QUEUE_KEY = ["notif", "queue"];

// What the header bell polls: {queue, unread, fresh}. A minute is plenty for
// a number whose job is «is anything waiting» — the Telegram DM is the push.
export function useNotifSummary() {
  return useQuery({
    queryKey: SUMMARY_KEY,
    queryFn: () => api.get("/api/notifications/summary").then((r) => r.data),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

// Every read / seen write answers with fresh counts — the badge takes them
// from the answer instead of asking again.
export function useApplyCounts() {
  const qc = useQueryClient();
  return useCallback((data) => {
    if (!data) return;
    qc.setQueryData(SUMMARY_KEY, (old) => ({
      ...(old || {}),
      ...(data.unread != null ? { unread: data.unread } : {}),
      ...(data.fresh != null ? { fresh: data.fresh } : {}),
    }));
  }, [qc]);
}

export function useMarkRead() {
  const apply = useApplyCounts();
  return useMutation({
    mutationFn: (ids) => api.post("/api/notifications/read", { ids }).then((r) => r.data),
    onSuccess: apply,
  });
}

export function useMarkAllRead() {
  const apply = useApplyCounts();
  return useMutation({
    mutationFn: () => api.post("/api/notifications/read-all").then((r) => r.data),
    onSuccess: apply,
  });
}

export function useMarkSeen() {
  const apply = useApplyCounts();
  return useMutation({
    mutationFn: (upto) => api.post("/api/notifications/seen", { upto }).then((r) => r.data),
    onSuccess: apply,
  });
}

// After a decision from the bell, every surface that lists the same request
// must re-read it — /staff keeps its own queries.
export function useRefreshAfterDecision() {
  const qc = useQueryClient();
  return useCallback(() => {
    qc.invalidateQueries({ queryKey: SUMMARY_KEY });
    for (const k of ["staff-documents", "staff-documents-pending-count", "staff-attendance",
                     "leader-disputes", "leader-late-proofs"]) {
      qc.invalidateQueries({ queryKey: [k] });
    }
  }, [qc]);
}

export function useNotifPrefs(enabled = true) {
  return useQuery({
    queryKey: ["notif", "prefs"],
    queryFn: () => api.get("/api/notifications/prefs").then((r) => r.data),
    enabled,
    staleTime: 60_000,
  });
}

export function useSaveNotifPrefs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (prefs) => api.put("/api/notifications/prefs", { prefs }).then((r) => r.data),
    onSuccess: (data) => qc.setQueryData(["notif", "prefs"], data),
  });
}
