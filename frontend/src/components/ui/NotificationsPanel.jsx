import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Info, CheckCircle, AlertTriangle, AlertCircle, Inbox, Bell, X } from "lucide-react";
import api from "../../utils/api";
import { useLang } from "../../context/LangContext";

const LS_KEY = "notif_read_ids";

function getReadIds() {
  try { return new Set(JSON.parse(localStorage.getItem(LS_KEY) || "[]")); }
  catch { return new Set(); }
}
function markRead(id) {
  const ids = getReadIds();
  ids.add(id);
  localStorage.setItem(LS_KEY, JSON.stringify([...ids]));
}
function markAllRead(ids) {
  localStorage.setItem(LS_KEY, JSON.stringify(ids));
}

function timeAgo(iso, t) {
  if (!iso) return "";
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (diff < 60)   return t("notif.timeAgo.s").replace("{n}", diff);
  if (diff < 3600) return t("notif.timeAgo.m").replace("{n}", Math.floor(diff / 60));
  if (diff < 86400) return t("notif.timeAgo.h").replace("{n}", Math.floor(diff / 3600));
  return t("notif.timeAgo.d").replace("{n}", Math.floor(diff / 86400));
}

const TYPE_META = {
  info:    { icon: Info,          color: "#3b82f6" },
  success: { icon: CheckCircle,   color: "#22c55e" },
  warning: { icon: AlertTriangle, color: "#f59e0b" },
  error:   { icon: AlertCircle,   color: "#ef4444" },
};

/**
 * Notifications state + read-tracking. Lifted into a hook so the Layout can both
 * show an unread indicator on the menu button and render the inline list inside
 * the dropdown while sharing a single source of truth for read state.
 */
export function useNotifications() {
  const { lang } = useLang();
  const [readIds, setReadIds] = useState(getReadIds);

  // lang is in the queryKey so switching languages refetches and the backend
  // re-renders every (template) notification in the newly selected language.
  const { data: notifications = [], refetch } = useQuery({
    queryKey: ["notifications", lang],
    queryFn: () => api.get("/api/notifications", { params: { lang } }).then(r => r.data),
    refetchInterval: 30_000,   // poll every 30 s
    staleTime: 20_000,
  });

  const unread = notifications.filter(n => !readIds.has(n.id)).length;

  function handleRead(id) {
    markRead(id);
    setReadIds(getReadIds());
  }
  function handleReadAll() {
    markAllRead(notifications.map(n => n.id));
    setReadIds(getReadIds());
  }

  return { notifications, readIds, unread, refetch, handleRead, handleReadAll };
}

/**
 * The notification list body — header (mark-all-read) + scrollable items.
 * Shared by the popover so the markup stays in one place.
 */
function NotificationsList({ notifications, readIds, unread, handleRead, handleReadAll }) {
  const { t } = useLang();
  return (
    <div className="px-4 pb-3 pt-2">
      {unread > 0 && (
        <div className="flex justify-end mb-2">
          <button
            onClick={handleReadAll}
            className="text-[10px] transition-colors"
            style={{ color: "var(--brand-text)" }}
          >
            {t("notif.markAllRead")}
          </button>
        </div>
      )}

      <div className="overflow-y-auto -mx-1" style={{ maxHeight: 320 }}>
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <Inbox size={26} style={{ color: "var(--text-4)" }} />
            <span className="text-[11px]" style={{ color: "var(--text-4)" }}>{t("notif.empty")}</span>
          </div>
        ) : (
          notifications.map(n => {
            const isRead = readIds.has(n.id);
            const meta   = TYPE_META[n.type] || TYPE_META.info;
            const Icon   = meta.icon;
            return (
              <div
                key={n.id}
                onClick={() => handleRead(n.id)}
                className="flex gap-2.5 px-1 py-2 cursor-pointer transition-colors rounded-lg hover:bg-white/5"
                style={{ opacity: isRead ? 0.6 : 1 }}
              >
                <div className="flex-shrink-0 mt-0.5">
                  <Icon size={14} style={{ color: meta.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className="text-[11px] font-semibold leading-snug"
                      style={{ color: isRead ? "var(--text-3)" : "var(--text-1)" }}
                    >
                      {n.title}
                    </span>
                    <span className="text-[9px] flex-shrink-0" style={{ color: "var(--text-4)" }}>
                      {timeAgo(n.created_at, t)}
                    </span>
                  </div>
                  <p className="text-[10px] mt-0.5 leading-relaxed" style={{ color: "var(--text-3)" }}>
                    {n.body}
                  </p>
                </div>
                {!isRead && (
                  <div
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5"
                    style={{ background: "#3b82f6" }}
                  />
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/**
 * Standalone notifications entry point for the header: a bell button carrying
 * the unread badge that opens a self-contained popover with the list. Shares a
 * single read-state source of truth with the Layout via the useNotifications hook.
 */
export default function NotificationsBell({ refetch, ...list }) {
  const { t } = useLang();
  const { unread } = list;
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640);
  const [panelTop, setPanelTop] = useState(56);
  const ref = useRef(null);
  const btnRef = useRef(null);

  useEffect(() => {
    function onDown(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    if (open) {
      if (btnRef.current) setPanelTop(btnRef.current.getBoundingClientRect().bottom + 8);
      refetch?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button
        ref={btnRef}
        onClick={() => setOpen(v => !v)}
        className="relative flex items-center justify-center p-1.5 rounded-lg transition-colors"
        style={{
          background: open ? "var(--brand)" : "var(--bg-inner)",
          border: `1px solid ${open ? "var(--brand)" : "var(--border)"}`,
          color: open ? "#fff" : "var(--text-2)",
        }}
        title={t("notif.title")}
        aria-label={t("notif.title")}
      >
        <Bell size={15} />
        {unread > 0 && (
          <span
            className="absolute -top-1.5 -right-1.5 min-w-4 h-4 px-1 rounded-full text-[9px] font-bold flex items-center justify-center"
            style={{ background: "#ef4444", color: "#fff", border: "2px solid var(--bg-base)" }}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="z-50 rounded-xl shadow-2xl flex flex-col"
          style={isMobile ? {
            position: "fixed",
            top: panelTop,
            left: 8,
            right: 8,
            maxHeight: `calc(100vh - ${panelTop}px - 12px)`,
            background: "var(--bg-card)",
            border: "1px solid var(--border-md)",
          } : {
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: 320,
            maxHeight: "80vh",
            background: "var(--bg-card)",
            border: "1px solid var(--border-md)",
          }}
        >
          {/* Panel header */}
          <div
            className="flex items-center justify-between px-4 py-2.5 flex-shrink-0"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <span className="flex items-center gap-2 text-xs font-semibold" style={{ color: "var(--text-1)" }}>
              <Bell size={14} />
              {t("notif.title")}
              {unread > 0 && (
                <span
                  className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: "#ef4444", color: "#fff" }}
                >
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </span>
            <button
              onClick={() => setOpen(false)}
              className="p-0.5 rounded transition-colors hover:bg-white/10"
              style={{ color: "var(--text-3)" }}
            >
              <X size={13} />
            </button>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            <NotificationsList {...list} />
          </div>
        </div>
      )}
    </div>
  );
}
