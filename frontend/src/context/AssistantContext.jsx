import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BotMessageSquare, ShieldCheck } from "lucide-react";
import api from "../utils/api";
import { useAuth } from "./AuthContext";
import { useExam } from "./ExamContext";
import { useLang } from "./LangContext";
import { useFilters } from "./FilterContext";
import { useFactory } from "./FactoryContext";
import { useToast } from "../components/ui/Toast";
import useAT from "../components/assistant/useAT";

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
 *
 * It also WATCHES the chat whose answer was asked for last (`watchTid`): while
 * that answer is being worked on out of sight — panel closed, another page,
 * another chat on screen — the thread is re-read every few seconds, and when
 * it finishes the header button gets a dot and a toast says so with a way
 * back («Javob tayyor — Ochish»). A reply can take minutes; nobody should
 * have to sit and watch a spinner to learn it is done.
 */
const Ctx = createContext(null);
export const useAssistant = () => useContext(Ctx);

const OPEN_KEY = "assistant_open";
const THREAD_KEY = "assistant_thread";
const WATCH_KEY = "assistant_watch";
const WATCH_POLL_MS = 3000;
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

  // ── the watched chat ──────────────────────────────────────────────────────
  const [watchTid, setWatchState] = useState(() => readSession(WATCH_KEY, readSession(THREAD_KEY, null)));
  const setWatchTid = useCallback((id) => {
    setWatchState(id);
    writeSession(WATCH_KEY, id);
  }, []);
  const onPage = location.pathname === "/assistant";
  // The chat the answer belongs to is ON SCREEN: then the chat itself polls
  // every second and shows the answer; nothing here needs to.
  const viewing = (open || onPage) && threadId != null && threadId === watchTid;
  const viewingRef = useRef(viewing);
  viewingRef.current = viewing;
  const onPageRef = useRef(onPage);
  onPageRef.current = onPage;

  const watchQ = useQuery({
    queryKey: ["assistant", "thread", watchTid],
    queryFn: () => api.get(`/api/assistant/threads/${watchTid}`).then((r) => r.data),
    enabled: allowed && !!watchTid,
    staleTime: 15_000,
    retry: false,
    refetchOnWindowFocus: (query) => ACTIVE.includes(query.state.data?.run?.status),
    refetchInterval: (query) => (!viewing && ACTIVE.includes(query.state.data?.run?.status)
      ? WATCH_POLL_MS : false),
  });
  // A watched chat deleted on another device stops being watched.
  useEffect(() => {
    if (watchQ.error?.response?.status === 404) setWatchTid(null);
  }, [watchQ.error, setWatchTid]);

  const watchRun = watchQ.data?.run || null;
  const busy = ACTIVE.includes(watchRun?.status);
  const [unread, setUnread] = useState(false);
  useEffect(() => { if (viewing) setUnread(false); }, [viewing]);
  const attention = !viewing && (unread || watchRun?.status === "awaiting_confirm");

  const at = useAT();
  const toast = useToast();
  const openWatched = useCallback(() => {
    setThreadId(watchTid);
    if (!onPageRef.current) setOpen(true);
  }, [watchTid, setThreadId, setOpen]);
  const openRef = useRef(openWatched);
  openRef.current = openWatched;

  // Tell the user when the answer finished OUT OF SIGHT — only on a change we
  // saw happen (working → finished), never for a chat that was already
  // finished when the page loaded, and never for one the user stopped.
  const prevRun = useRef(null);
  useEffect(() => {
    const prev = prevRun.current;
    prevRun.current = watchRun ? { id: watchRun.id, status: watchRun.status, tid: watchTid } : null;
    if (!watchRun || !prev || prev.id !== watchRun.id || prev.tid !== watchTid) return;
    if (!ACTIVE.includes(prev.status) || ACTIVE.includes(watchRun.status)) return;
    if (viewingRef.current || watchRun.status === "cancelled") return;
    const raw = watchQ.data?.thread?.title || at("assistant.untitled");
    const title = raw.length > 60 ? `${raw.slice(0, 59)}…` : raw;
    const action = { label: at("assistant.notice.open"), onClick: () => openRef.current() };
    if (watchRun.status === "awaiting_confirm") {
      toast.info(at("assistant.notice.plan", { title }), 8000, { icon: ShieldCheck, action });
    } else if (watchRun.status === "done") {
      setUnread(true);
      toast.info(at("assistant.notice.done", { title }), 8000, { icon: BotMessageSquare, action });
    } else {
      setUnread(true);
      toast.error(at("assistant.notice.error", { title }), undefined, { action });
    }
  }, [watchRun?.id, watchRun?.status, watchTid]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = useCallback(async ({ text, attachments = [], voice = null, thread, pages }) => {
    const tid = thread === undefined ? threadId : thread;
    const r = await api.post("/api/assistant/messages", {
      thread_id: tid || null, text, attachments, voice, context: context(pages),
    });
    const d = r.data;
    if (d.thread_id !== tid) setThreadId(d.thread_id);
    setWatchTid(d.thread_id);
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
  }, [threadId, context, qc, setThreadId, setWatchTid]);

  const refresh = useCallback((tid) => {
    qc.invalidateQueries({ queryKey: ["assistant", "thread", tid ?? threadId] });
  }, [qc, threadId]);

  // The plan card sits in the chat on screen, so a Confirm makes THAT chat the
  // one to watch while its changes are made and the report is written.
  const confirm = useCallback(async (runId, approve) => {
    const r = await api.post(`/api/assistant/runs/${runId}/confirm`, { approve });
    if (threadId) setWatchTid(threadId);
    refresh();
    return r.data;
  }, [refresh, threadId, setWatchTid]);

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

  // Opening the panel while the watched chat has something new opens THAT
  // chat — the dot on the button is about it, not about whatever was shown.
  const toggle = useCallback(() => {
    if (!open && attention && watchTid && threadId !== watchTid) setThreadId(watchTid);
    setOpen((v) => !v);
  }, [open, attention, watchTid, threadId, setThreadId, setOpen]);

  const value = useMemo(() => ({
    me, allowed, open, setOpen, toggle,
    threadId, setThreadId, newChat, send, confirm, cancel, refresh, follow,
    onPage, busy, attention, viewing,
  }), [me, allowed, open, setOpen, toggle, threadId, setThreadId, newChat, send, confirm, cancel,
       refresh, follow, onPage, busy, attention, viewing]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {toast.node}
    </Ctx.Provider>
  );
}
