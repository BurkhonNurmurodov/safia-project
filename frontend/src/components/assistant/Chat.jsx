import { useCallback, useEffect, useMemo, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, KeyRound, BotMessageSquare } from "lucide-react";
import api from "../../utils/api";
import { saveBlob } from "../../utils/exportXlsx";
import useAT from "./useAT";
import { useAuth } from "../../context/AuthContext";
import { ACTIVE, useAssistant } from "../../context/AssistantContext";
import { usePageAccess } from "../../hooks/usePageAccess";
import { useCapabilities } from "../../hooks/useCapabilities";
import { PAGES, canAccessPage } from "../../config/pages";
import { useToast } from "../ui/Toast";
import { SkeletonBlock } from "../ui/Skeleton";
import Button from "../ui/Button";
import Message from "./Message";
import Composer from "./Composer";
import { tipsFor } from "./tips";

// Refusals of a SEND, each with words of its own (backend routers/assistant.py).
const SEND_ERRORS = ["running", "busy", "not_configured", "no_access", "exam"];

/**
 * One conversation: the messages and the composer under them. The panel and
 * the full page draw the SAME component, so a chat reads one way wherever it
 * is opened. While the assistant works the thread is re-read every second;
 * at rest it is not polled at all.
 */
export default function Chat({ variant = "panel", onNavigate, onConfigure }) {
  const t = useAT();
  const A = useAssistant();
  const toast = useToast({ position: "bottom" });
  const composer = useRef(null);
  const endRef = useRef(null);
  const listRef = useRef(null);
  const tid = A.threadId;
  const { auth } = useAuth();
  const { access } = usePageAccess();
  const { capPages, deniedPages } = useCapabilities();
  const pages = useMemo(() => (auth?.role ? PAGES.filter((p) => p.key !== "assistant"
      && canAccessPage(auth.role, p.key, access, capPages, deniedPages))
    .map((p) => ({ path: p.route, label: t(p.labelKey) })) : []),
  [auth?.role, access, capPages, deniedPages, t]);

  const q = useQuery({
    queryKey: ["assistant", "thread", tid],
    queryFn: () => api.get(`/api/assistant/threads/${tid}`).then((r) => r.data),
    enabled: !!tid && A.allowed,
    refetchInterval: (query) => {
      const d = query.state.data;
      const st = d?.run?.status;
      return ACTIVE.includes(st) ? 1000 : false;
    },
    refetchOnWindowFocus: true,
    retry: (n, e) => e?.response?.status !== 404 && n < 2,
  });

  // A chat that no longer exists (deleted on another device) starts afresh.
  useEffect(() => {
    if (q.error?.response?.status === 404) A.newChat();
  }, [q.error]); // eslint-disable-line react-hooks/exhaustive-deps

  const msgs = useMemo(() => q.data?.messages || [], [q.data]);
  const run = q.data?.run || null;
  const running = !!run && ACTIVE.includes(run.status);
  const planWaiting = run?.status === "awaiting_confirm";
  // The clock of the reply being written: the server's count at the last read,
  // and when that read landed (Message ticks it on from there).
  const elapsed = running ? { base: run.elapsed_s ?? 0, at: q.dataUpdatedAt } : null;

  // Follow the bottom while the reader is already there; never yank them
  // back down while they are reading something further up.
  const atBottom = useRef(true);
  const lastSig = useRef("");
  useEffect(() => {
    const last = msgs[msgs.length - 1];
    const sig = `${msgs.length}:${last?.updated_at}:${(last?.data?.steps || []).length}`;
    if (sig === lastSig.current) return;
    const first = !lastSig.current;
    lastSig.current = sig;
    if (first || atBottom.current) {
      requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: "end" }));
    }
  }, [msgs]);

  const onScroll = (e) => {
    const el = e.currentTarget;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  // A link the user ASKED to be opened is followed once, when it arrives.
  useEffect(() => {
    const last = msgs[msgs.length - 1];
    if (!last || last.role !== "assistant" || last.data?.status !== "done") return;
    const nav = (last.data?.links || []).find((l) => l.navigate);
    if (nav && A.follow(last.id, nav)) onNavigate?.(nav.path, { auto: true });
  }, [msgs]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = useCallback(async (body) => {
    try {
      await A.send({ ...body, pages });
      atBottom.current = true;
      return true;
    } catch (e) {
      const code = e?.response?.data?.detail;
      toast.error(t(SEND_ERRORS.includes(code) ? `assistant.err.${code}` : "assistant.err.send"));
      return false;
    }
  }, [A, t, toast, pages]);

  const retry = useCallback(() => {
    const lastUser = [...msgs].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    send({ text: lastUser.text, attachments: (lastUser.data?.attachments || []).map((a) => a.id) });
  }, [msgs, send]);

  const openFile = useCallback(async (f) => {
    try {
      if (A.me?.web) {
        const r = await api.get(`/api/assistant/files/${f.id}`, { responseType: "blob" });
        saveBlob(r.data, f.name);
      } else {
        await api.post(`/api/assistant/files/${f.id}/telegram`);
        toast.success(t("assistant.file.sentTelegram"));
      }
    } catch {
      toast.error(t("assistant.file.openFailed"));
    }
  }, [A.me?.web, t, toast]);

  const navigateTo = useCallback((path) => {
    onNavigate?.(path, { auto: false });
  }, [onNavigate]);

  const page = variant === "page";
  const empty = !tid || (!q.isLoading && msgs.length === 0);
  const configured = A.me?.configured !== false;

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div ref={listRef} onScroll={onScroll}
        className={`flex-1 min-h-0 overflow-y-auto overscroll-contain ${page ? "px-1 sm:px-2" : "px-4"} py-4`}>
        {!configured ? (
          <NotConfigured onConfigure={onConfigure} canConfigure={A.me?.can_configure} />
        ) : tid && q.isLoading ? (
          <div className="space-y-4" aria-busy>
            <SkeletonBlock className="h-9 w-2/3 ml-auto rounded-2xl" />
            <SkeletonBlock className="h-24 w-full rounded-xl" />
          </div>
        ) : empty ? (
          <Welcome onPick={(s) => send({ text: s })} onPage={page} />
        ) : (
          <div className={`space-y-5 ${page ? "max-w-3xl mx-auto" : ""}`}>
            {msgs.map((m) => (
              <Message key={m.id} m={m} run={run}
                elapsed={running && m.run_id === run.id ? elapsed : null}
                onConfirm={(rid, approve) => A.confirm(rid, approve)}
                onCancel={(rid) => A.cancel(rid)}
                onRetry={retry}
                onFile={openFile}
                onNavigate={navigateTo} />
            ))}
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div className={`flex-shrink-0 ${page ? "px-1 sm:px-2 pt-2" : "px-3 pt-2"}`}
        style={{ paddingBottom: page ? "0.25rem" : "calc(0.75rem + var(--tg-safe-bottom, 0px))" }}>
        <div className={page ? "max-w-3xl mx-auto" : ""}>
          {/* A new message cancels a waiting plan (services/assistant.py) —
              said BEFORE somebody types «also add …» expecting to amend it. */}
          {planWaiting && (
            <p className="flex items-start gap-1.5 text-xs leading-snug mb-1.5 px-0.5" style={{ color: "var(--text-2)" }}>
              <AlertTriangle size={13} className="mt-px flex-shrink-0" style={{ color: "var(--status-warn)" }} aria-hidden="true" />
              <span>{t("assistant.planWaiting")}</span>
            </p>
          )}
          <Composer ref={composer} onSend={send} running={running} stopping={running && !!run?.stop_asked}
            onStop={() => run && A.cancel(run.id)} disabled={!configured} voiceOn={A.me?.voice !== false}
            autoFocus={variant === "panel"} />
          <p className="text-[11px] mt-1.5 text-center" style={{ color: "var(--text-3)" }}>
            {t("assistant.footnote")}
          </p>
        </div>
      </div>
      {toast.node}
    </div>
  );
}

/** An empty chat: who this is, and questions to start from — about the page
 *  the panel was opened on (tips.js), since that is what the reader is
 *  looking at. The full page has no page beside it, so it gets general ones. */
function Welcome({ onPick, onPage }) {
  const t = useAT();
  const { pathname } = useLocation();
  const tips = tipsFor(pathname, onPage);
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-2 py-6">
      <span className="w-11 h-11 rounded-2xl flex items-center justify-center mb-3"
        style={{ background: "rgba(var(--brand-rgb),0.14)", color: "var(--brand-text)" }}>
        <BotMessageSquare size={20} />
      </span>
      <p className="text-base font-semibold" style={{ color: "var(--text-1)" }}>{t("assistant.welcome.title")}</p>
      <p className="text-sm mt-1 max-w-sm" style={{ color: "var(--text-3)" }}>{t("assistant.welcome.body")}</p>
      <div className="mt-5 grid gap-2 w-full max-w-sm">
        {tips.map((k) => (
          <button key={k} type="button" onClick={() => onPick(t(k))}
            className="text-left text-sm px-3.5 py-2.5 rounded-xl hover:bg-[var(--bg-inner)] transition-colors"
            style={{ border: "1px solid var(--border-md)", color: "var(--text-1)" }}>
            {t(k)}
          </button>
        ))}
      </div>
    </div>
  );
}

function NotConfigured({ onConfigure, canConfigure }) {
  const t = useAT();
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-4 py-8">
      <span className="w-11 h-11 rounded-2xl flex items-center justify-center mb-3"
        style={{ background: "rgba(234,179,8,0.14)", color: "#eab308" }}>
        <KeyRound size={20} />
      </span>
      <p className="text-base font-semibold" style={{ color: "var(--text-1)" }}>{t("assistant.noKey.title")}</p>
      <p className="text-sm mt-1 max-w-sm" style={{ color: "var(--text-3)" }}>
        {t(canConfigure ? "assistant.noKey.admin" : "assistant.noKey.user")}
      </p>
      {canConfigure && onConfigure && (
        <Button className="mt-4" size="lg" onClick={onConfigure}>{t("assistant.noKey.open")}</Button>
      )}
    </div>
  );
}
