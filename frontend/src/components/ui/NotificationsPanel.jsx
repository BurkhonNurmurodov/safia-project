import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bell, X, Info, CheckCircle, AlertTriangle, AlertCircle, Inbox } from "lucide-react";
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

export default function NotificationsPanel() {
  const [open, setOpen]   = useState(false);
  const [readIds, setReadIds] = useState(getReadIds);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640);
  const [panelTop, setPanelTop] = useState(56);
  const panelRef = useRef(null);
  const { t } = useLang();

  const { data: notifications = [], refetch } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.get("/api/notifications").then(r => r.data),
    refetchInterval: 30_000,   // poll every 30 s
    staleTime: 20_000,
  });

  const unread = notifications.filter(n => !readIds.has(n.id)).length;

  // Close on outside click
  useEffect(() => {
    function handler(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    if (open && panelRef.current) {
      const r = panelRef.current.getBoundingClientRect();
      setPanelTop(r.bottom + 8);
    }
  }, [open]);

  function handleOpen() {
    setOpen(v => !v);
    if (!open) refetch();
  }

  function handleRead(id) {
    markRead(id);
    setReadIds(getReadIds());
  }

  function handleReadAll() {
    markAllRead(notifications.map(n => n.id));
    setReadIds(getReadIds());
  }

  return (
    <div className="relative flex-shrink-0" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={handleOpen}
        className="relative w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
        style={{
          background: open ? "var(--brand)" : "var(--bg-inner)",
          border: `1px solid ${open ? "var(--brand)" : "var(--border)"}`,
          color: open ? "#fff" : "var(--text-2)",
        }}
        title={t("common.notifications")}
      >
        <Bell size={14} />
        {unread > 0 && (
          <span
            className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-0.5 rounded-full text-[9px] font-bold flex items-center justify-center"
            style={{ background: "#ef4444", color: "#fff", border: "2px solid var(--bg-base)" }}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          className="z-50 rounded-xl shadow-2xl flex flex-col"
          style={isMobile ? {
            position: "fixed",
            top: panelTop,
            left: 8,
            right: 8,
            maxHeight: 480,
            background: "var(--bg-card)",
            border: "1px solid var(--border-md)",
          } : {
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: 320,
            maxHeight: 480,
            background: "var(--bg-card)",
            border: "1px solid var(--border-md)",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 flex-shrink-0"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>
                {t("notif.title")}
              </span>
              {unread > 0 && (
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: "#ef4444", color: "#fff" }}
                >
                  {unread}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <button
                  onClick={handleReadAll}
                  className="text-[10px] transition-colors"
                  style={{ color: "var(--brand-text)" }}
                >
                  {t("notif.markAllRead")}
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-0.5 rounded hover:bg-white/10 transition-colors"
                style={{ color: "var(--text-3)" }}
              >
                <X size={13} />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="overflow-y-auto flex-1">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Inbox size={32} style={{ color: "var(--text-4)" }} />
                <span className="text-xs" style={{ color: "var(--text-4)" }}>{t("notif.empty")}</span>
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
                    className="flex gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-white/5"
                    style={{
                      borderBottom: "1px solid var(--border)",
                      opacity: isRead ? 0.6 : 1,
                    }}
                  >
                    {/* Type icon */}
                    <div className="flex-shrink-0 mt-0.5">
                      <Icon size={15} style={{ color: meta.color }} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <span
                          className="text-xs font-semibold leading-snug"
                          style={{ color: isRead ? "var(--text-3)" : "var(--text-1)" }}
                        >
                          {n.title}
                        </span>
                        <span className="text-[10px] flex-shrink-0" style={{ color: "var(--text-4)" }}>
                          {timeAgo(n.created_at, t)}
                        </span>
                      </div>
                      <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: "var(--text-3)" }}>
                        {n.body}
                      </p>
                    </div>

                    {/* Unread dot */}
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
      )}
    </div>
  );
}
