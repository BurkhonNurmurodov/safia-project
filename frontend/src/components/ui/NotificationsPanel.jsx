import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Info, CheckCircle, AlertTriangle, AlertCircle, Inbox, Bell, ChevronDown } from "lucide-react";
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
  const [readIds, setReadIds] = useState(getReadIds);

  const { data: notifications = [], refetch } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.get("/api/notifications").then(r => r.data),
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

/** Inline notifications list rendered as a section inside the menu dropdown. */
export default function NotificationsSection({ notifications, readIds, unread, handleRead, handleReadAll }) {
  const { t } = useLang();

  return (
    <div className="px-4 py-3" style={{ borderTop: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1.5" style={{ color: "var(--text-4)" }}>
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
        {unread > 0 && (
          <button
            onClick={handleReadAll}
            className="text-[10px] transition-colors"
            style={{ color: "var(--brand-text)" }}
          >
            {t("notif.markAllRead")}
          </button>
        )}
      </div>

      <div
        className="overflow-y-auto -mx-1"
        style={{ maxHeight: 200 }}
      >
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 gap-2">
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
