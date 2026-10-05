import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "../utils/api";
import { useAuth } from "./AuthContext";
import { useExam } from "./ExamContext";
import { useLang } from "./LangContext";
import { useFilters } from "./FilterContext";
import { useFactory } from "./FactoryContext";

/**
 * «Yordamchi» — the AI assistant's client state (services/assistant.py).
 *
 * Mounted ABOVE the routes, like the exam engine, because Layout remounts on
 * every navigation and a conversation must survive the user moving between
 * pages — that is half the point of a panel that sits beside every page.
 *
 * It owns: whether the panel is open, which chat it shows, sending, the
 * Confirm / Cancel of a plan, and the page context sent with each message
 * (route, filters, the pages this person can open) so «why is this red?» is
 * answerable without the user describing their screen.
 *
 * Who sees it is decided by the SERVER (`/api/assistant/me`): the `assistant`
 * page (admin-only until the operator opens it) or a tab an admin opened as
 * somebody else. Never during an exam.
 */
const Ctx = createContext(null);
export const useAssistant = () => useContext(Ctx);

const OPEN_KEY = "assistant_open";
const THREAD_KEY = "assistant_thread";
export const ACTIVE = ["running", "executing"];

function readSession(key, fallback) {
  try {
    const v = sessionStorage.getItem(key);
    return v === null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}
function writeSession(key, value) {
  try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* storage refused */ }
}

export function AssistantProvider({ children }) {
  const { auth } = useAuth();
  const exam = useExam();
  const { lang } = useLang();
  const filters = useFilters() || {};
  const { factory } = useFactory();
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const approved = auth?.status === "approved";
  const meQ = useQuery({
    queryKey: ["assistant", "me", auth?.token ? auth.token.slice(-16) : ""],
    queryFn: () => api.get("/api/assistant/me").then((r) => r.data),
    enabled: approved,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const me = meQ.data;
  const allowed = !!me?.allowed && !exam?.on;

  const [open, setOpenState] = useState(() => readSession(OPEN_KEY, false));
  const [threadId, setThreadState] = useState(() => readSession(THREAD_KEY, null));
  const setOpen = useCallback((v) => {
    setOpenState((prev) => {
      const next = typeof v === "function" ? v(prev) : v;
      writeSession(OPEN_KEY, next);
      return next;
    });
  }, []);
  const setThreadId = useCallback((id) => {
    setThreadState(id);
    writeSession(THREAD_KEY, id);
  }, []);

  // `pages` — the pages this person can open, in their own words (Chat builds
  // the list: it renders only for a signed-in viewer, where the page-access
  // queries belong) — so a link the model offers is one the reader can follow.
  const context = useCallback((pages) => ({
    path: location.pathname,
    search: location.search.replace(/^\?/, "").slice(0, 400),
    title: document.title?.replace(/\s*[—|-]\s*Safia.*$/i, "") || "",
    lang,
    device: window.matchMedia?.("(max-width: 767px)")?.matches ? "phone" : "desktop",
    filters: {
      ...(filters.dateFrom ? { date_from: filters.dateFrom } : {}),
      ...(filters.dateTo ? { date_to: filters.dateTo } : {}),
      ...(filters.shift ? { shift: filters.shift } : {}),
      ...(filters.brigadirIds?.length ? { manager_ids: filters.brigadirIds } : {}),
      ...(factory ? { factory } : {}),
    },
    pages: pages || [],
  }), [location.pathname, location.search, lang, filters.dateFrom, filters.dateTo,
       filters.shift, filters.brigadirIds, factory]);

  const send = useCallback(async ({ text, attachments = [], voice = null, thread, pages }) => {
    const tid = thread === undefined ? threadId : thread;
    const r = await api.post("/api/assistant/messages", {
      thread_id: tid || null, text, attachments, voice, context: context(pages),
    });
    const d = r.data;
    if (d.thread_id !== tid) setThreadId(d.thread_id);
    qc.setQueryData(["assistant", "thread", d.thread_id], (old) => ({
      thread: old?.thread || { id: d.thread_id, title: text?.slice(0, 80) || "" },
      messages: [...(old?.messages || []).map((m) => (
        m.role === "assistant" && m.data?.status === "awaiting"
          ? { ...m, data: { ...m.data, status: "cancelled",
              plan: m.data.plan ? { ...m.data.plan, state: "superseded" } : m.data.plan } }
          : m)), d.user_message, d.assistant_message],
      run: { id: d.run_id, status: "running" },
    }));
    qc.invalidateQueries({ queryKey: ["assistant", "threads"] });
    return d;
  }, [threadId, context, qc, setThreadId]);

  const refresh = useCallback((tid) => {
    qc.invalidateQueries({ queryKey: ["assistant", "thread", tid ?? threadId] });
  }, [qc, threadId]);

  const confirm = useCallback(async (runId, approve) => {
    const r = await api.post(`/api/assistant/runs/${runId}/confirm`, { approve });
    refresh();
    return r.data;
  }, [refresh]);

  const cancel = useCallback(async (runId) => {
    const r = await api.post(`/api/assistant/runs/${runId}/cancel`);
    refresh();
    return r.data;
  }, [refresh]);

  const newChat = useCallback(() => setThreadId(null), [setThreadId]);

  // A link the model was ASKED to open is followed once, when it arrives.
  const followed = useRef(new Set(readSession("assistant_followed", [])));
  const follow = useCallback((msgId, link) => {
    const key = `${msgId}:${link.path}`;
    if (followed.current.has(key)) return false;
    followed.current.add(key);
    writeSession("assistant_followed", [...followed.current].slice(-50));
    navigate(link.path);
    return true;
  }, [navigate]);

  // Closing an exam or losing access closes the panel rather than leaving a
  // drawer nobody may use on screen.
  useEffect(() => {
    if (!allowed && open && meQ.isSuccess) setOpen(false);
  }, [allowed, open, meQ.isSuccess, setOpen]);

  const value = useMemo(() => ({
    me, allowed, open, setOpen, toggle: () => setOpen((v) => !v),
    threadId, setThreadId, newChat, send, confirm, cancel, refresh, follow,
    onPage: location.pathname === "/assistant",
  }), [me, allowed, open, setOpen, threadId, setThreadId, newChat, send, confirm, cancel,
       refresh, follow, location.pathname]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
