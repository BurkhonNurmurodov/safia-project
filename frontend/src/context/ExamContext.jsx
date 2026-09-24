/**
 * The exam's client engine («Imtihon»).
 *
 * Mounted ONCE in App.jsx above the routes (Layout remounts per navigation),
 * it owns the mode switch (utils/examMode.js), the current task, and the
 * three automatic check triggers: a route change, a change in the pages'
 * persisted UI state (polled every 2 s, posted only when it moved), and a
 * successful sandbox write (the api.js hook). It renders the bottom task strip
 * on every page while the mode is on; the band under the header is rendered
 * by Layout off the same context.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "../utils/api";
import { useAuth } from "./AuthContext";
import { useLang } from "./LangContext";
import {
  enterExamMode, examState, isExamOn, leaveExamMode, onExamMutation, subscribeExam, uiSnapshot,
} from "../utils/examMode";
import { APP_VERSION } from "../utils/version";
import ExamStrip from "../components/exam/ExamStrip";

const ExamContext = createContext(null);
export const useExam = () => useContext(ExamContext);

const HIDDEN_PATHS = ["/login", "/proof/camera"];
const UI_POLL_MS = 2000;
const ADVANCE_MS = 1200;

export function ExamProvider({ children }) {
  const { auth } = useAuth();
  const { lang } = useLang();
  const qc = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const [mode, setMode] = useState(() => examState());
  const [flash, setFlash] = useState(null);       // task key that just passed
  const [busy, setBusy] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [wrong, setWrong] = useState(0);          // bumps to tell the sheet «not yet»
  const lastUi = useRef("");
  const checkTimer = useRef(null);
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => subscribeExam(setMode), []);

  const approved = auth?.status === "approved";
  const meQ = useQuery({
    queryKey: ["exam-me"],
    queryFn: () => api.get("/api/exam/me").then((r) => r.data),
    enabled: approved,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  const me = meQ.data;

  const attemptId = mode?.attemptId ?? null;
  const attempt = useMemo(() => {
    if (!attemptId || !me) return null;
    if (me.attempt?.id === attemptId) return me.attempt;
    if (me.practice?.id === attemptId) return me.practice;
    return null;
  }, [attemptId, me]);

  // A mode left in sessionStorage by a previous load is honoured only while
  // its attempt is still running — otherwise the switch is thrown back.
  useEffect(() => {
    if (!attemptId || !me) return;
    if (!attempt || attempt.status !== "running") leaveExamMode();
  }, [attemptId, me, attempt]);

  const [current, setCurrentState] = useState(null);
  useEffect(() => {
    if (attempt) setCurrentState(attempt.current_task || null);
  }, [attempt?.id, attempt?.current_task]);   // eslint-disable-line react-hooks/exhaustive-deps

  const tasks = attempt?.tasks || [];
  const currentTask = tasks.find((t) => t.key === current) || null;
  const on = !!attemptId && !!attempt && attempt.status === "running";

  const refreshMe = useCallback(() => qc.invalidateQueries({ queryKey: ["exam-me"] }), [qc]);

  // ── the switch ────────────────────────────────────────────────────────────
  const enter = useCallback(async (att, taskKey) => {
    if (!me) return;
    enterExamMode({ attemptId: att.id, kind: att.kind, prefixes: me.sandbox_prefixes, parkedKeys: me.parked_keys });
    // Real rows must never linger under sandbox rows or the reverse: the
    // query keys carry no mode discriminator.
    qc.removeQueries({ predicate: (q) => q.queryKey?.[0] !== "exam-me" });
    lastUi.current = "";
    try {
      await api.post(`/api/exam/live/${att.id}/resume`);
      const key = taskKey || att.current_task || null;
      if (key) {
        await api.post(`/api/exam/live/${att.id}/current`, { task_key: key, path: location.pathname, ui: uiSnapshot() });
        setCurrentState(key);
      }
    } catch { /* the mode is on regardless; the next action re-syncs */ }
    refreshMe();
  }, [me, qc, refreshMe, location.pathname]);

  const leave = useCallback(async () => {
    const id = examState()?.attemptId;
    if (id) { try { await api.post(`/api/exam/live/${id}/pause`); } catch { /* ignore */ } }
    leaveExamMode();
    qc.removeQueries({ predicate: (q) => q.queryKey?.[0] !== "exam-me" });
    setSheetOpen(false);
    refreshMe();
    navigate("/exam");
  }, [qc, refreshMe, navigate]);

  // ── the current task ──────────────────────────────────────────────────────
  const setCurrent = useCallback(async (key) => {
    if (!on) return;
    setCurrentState(key);
    setSheetOpen(false);
    try {
      await api.post(`/api/exam/live/${attemptId}/current`, { task_key: key, path: location.pathname, ui: uiSnapshot() });
    } catch { /* ignore */ }
    refreshMe();
  }, [on, attemptId, location.pathname, refreshMe]);

  const check = useCallback(async ({ answer, taskKey } = {}) => {
    if (!on) return null;
    const key = taskKey || current;
    if (!key) return null;
    setBusy(true);
    try {
      const r = await api.post(`/api/exam/live/${attemptId}/check`, {
        task_key: key, answer, lang, app_version: APP_VERSION,
        path: location.pathname, ui: uiSnapshot(),
      });
      const data = r.data;
      if (data.passed) {
        setSheetOpen(false);
        setFlash(key);
        refreshMe();
        const delay = reduced ? 0 : ADVANCE_MS;
        setTimeout(() => {
          setFlash((f) => (f === key ? null : f));
          if (data.next) setCurrent(data.next);
        }, delay);
      } else if (answer !== undefined) {
        setWrong((n) => n + 1);
      }
      if (data.status === "unavailable") refreshMe();
      return data;
    } catch {
      return null;
    } finally {
      setBusy(false);
    }
  }, [on, current, attemptId, lang, location.pathname, refreshMe, setCurrent, reduced]);

  // Automatic checks are debounced: a page saving three things in a row is
  // one check, not three.
  const checkSoon = useCallback((delay = 350) => {
    if (!on || !current) return;
    clearTimeout(checkTimer.current);
    checkTimer.current = setTimeout(() => { check(); }, delay);
  }, [on, current, check]);

  const skip = useCallback(async () => {
    if (!on || !current) return;
    setBusy(true);
    try {
      const r = await api.post(`/api/exam/live/${attemptId}/skip`, { task_key: current });
      setSheetOpen(false);
      setCurrentState(r.data.next || null);
      refreshMe();
    } catch { /* ignore */ } finally { setBusy(false); }
  }, [on, current, attemptId, refreshMe]);

  const next = useCallback(() => {
    if (!on || !tasks.length) return;
    const order = tasks.map((t) => t.key);
    const i = current ? order.indexOf(current) : -1;
    for (let k = 1; k <= order.length; k += 1) {
      const t = tasks[(i + k) % order.length];
      if (t.status === "open" || t.status === "skipped") { setCurrent(t.key); return; }
    }
  }, [on, tasks, current, setCurrent]);

  // ── the three triggers ────────────────────────────────────────────────────
  // 1. a route change → a visit event, then a check
  useEffect(() => {
    if (!on) return;
    api.post(`/api/exam/live/${attemptId}/events`, { kind: "visit", path: location.pathname, ui: uiSnapshot() })
      .then(() => checkSoon(600)).catch(() => {});
  }, [on, attemptId, location.pathname]);   // eslint-disable-line react-hooks/exhaustive-deps

  // 2. the pages' persisted state moved → a ui event, then a check
  useEffect(() => {
    if (!on) return undefined;
    const tick = () => {
      const snap = uiSnapshot();
      const s = JSON.stringify(snap);
      if (s === lastUi.current) return;
      lastUi.current = s;
      api.post(`/api/exam/live/${attemptId}/events`, { kind: "ui", path: location.pathname, ui: snap })
        .then(() => checkSoon(300)).catch(() => {});
    };
    const id = setInterval(tick, UI_POLL_MS);
    return () => clearInterval(id);
  }, [on, attemptId, location.pathname, checkSoon]);

  // 3. a sandbox write succeeded → a check
  useEffect(() => {
    if (!on) return undefined;
    return onExamMutation(() => checkSoon(400));
  }, [on, checkSoon]);

  const hidden = HIDDEN_PATHS.some((p) => location.pathname.startsWith(p));

  const value = useMemo(() => ({
    me, meLoading: meQ.isLoading, refreshMe, on, attempt, attemptId, mode,
    tasks, current, currentTask, flash, busy, wrong,
    enter, leave, setCurrent, check, skip, next,
    sheetOpen, openSheet: () => setSheetOpen(true), closeSheet: () => setSheetOpen(false),
  }), [me, meQ.isLoading, refreshMe, on, attempt, attemptId, mode, tasks, current, currentTask,
       flash, busy, wrong, enter, leave, setCurrent, check, skip, next, sheetOpen]);

  return (
    <ExamContext.Provider value={value}>
      {children}
      {on && !hidden && <ExamStrip />}
    </ExamContext.Provider>
  );
}
