import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Bell, CheckCircle2, Settings, X } from "lucide-react";
import api from "../../utils/api";
import { useLang } from "../../context/LangContext";
import { SkeletonBlock } from "../ui/Skeleton";
import { useToast } from "../ui/Toast";
import FeedEntry from "./FeedEntry";
import QueueItem from "./QueueItem";
import NotifPrefsModal from "./NotifPrefsModal";
import { dayLabel, fmt } from "./notifMeta";
import {
  useMarkAllRead, useMarkRead, useMarkSeen, useNotifSummary,
} from "./useNotifCenter";
import { pushSeen } from "../../utils/androidPush";

const PANEL_Z = 900;   // above the page and its own popovers; dialogs sit higher

/**
 * THE header bell (2026-10-01). Its red number counts what is WAITING ON THE
 * VIEWER (services/notif_queue) and nothing else — so it reaches zero when the
 * work is done, which the old «unread rows» badge never could. Anything new
 * that waits on nobody is a quiet dot, cleared by opening the bell.
 */
export default function NotificationBell() {
  const { t } = useLang();
  const { pathname } = useLocation();
  const { data: sum } = useNotifSummary();
  const queue = sum?.queue ?? 0;
  const fresh = sum?.fresh ?? 0;
  const [open, setOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const btnRef = useRef(null);
  const toast = useToast();

  // Swing the bell when something new lands — a silent cue, important in a
  // Telegram mini-app where nothing else moves. CSS honours reduced motion.
  const prev = useRef({ queue, fresh });
  const [ring, setRing] = useState(false);
  useEffect(() => {
    const grew = queue > prev.current.queue || fresh > prev.current.fresh;
    prev.current = { queue, fresh };
    if (!grew) return undefined;
    setRing(true);
    const id = setTimeout(() => setRing(false), 800);
    return () => clearTimeout(id);
  }, [queue, fresh]);

  // A navigation (a row opened, the back button) closes the panel.
  useEffect(() => { setOpen(false); }, [pathname]);

  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) btnRef.current?.focus();
  }, []);

  const label = queue > 0
    ? `${t("notif.title")}, ${fmt(t("notif.waitingN"), { n: queue })}`
    : fresh > 0 ? `${t("notif.title")}, ${t("notif.newDot")}` : t("notif.title");

  return (
    <div className="relative flex-shrink-0">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex items-center justify-center p-1.5 rounded-lg transition-colors"
        style={{
          background: open ? "var(--brand)" : "var(--bg-inner)",
          border: `1px solid ${open ? "var(--brand)" : "var(--border)"}`,
          color: open ? "#fff" : "var(--text-2)",
        }}
        title={label}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Bell size={15} className={ring ? "bell-swing" : undefined} />
        {queue > 0 ? (
          <span
            className={`absolute -top-1.5 -right-1.5 min-w-4 h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${ring ? "badge-pop" : ""}`}
            style={{ background: "#ef4444", color: "#fff", border: "2px solid var(--bg-base)" }}
            aria-hidden="true"
          >
            {queue > 99 ? "99+" : queue}
          </span>
        ) : fresh > 0 ? (
          <span
            className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full ${ring ? "badge-pop" : ""}`}
            style={{ background: "var(--brand)", border: "2px solid var(--bg-base)" }}
            aria-hidden="true"
          />
        ) : null}
      </button>

      {open && (
        <NotifPanel
          anchorRef={btnRef}
          onClose={close}
          onSettings={() => { setOpen(false); setPrefsOpen(true); }}
        />
      )}
      {prefsOpen && (
        <NotifPrefsModal onClose={() => setPrefsOpen(false)}
          onSaved={() => toast.success(t("notif.prefs.saved"))} />
      )}
      {toast.node}
    </div>
  );
}

function NotifPanel({ anchorRef, onClose, onSettings }) {
  const { t, lang } = useLang();
  const panelRef = useRef(null);
  const [pos, setPos] = useState(null);

  // Fetched fresh on every open, and NOT refetched while open: a list that
  // rearranges itself under a reader's finger is the one thing it must not do.
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["notif", "center", lang],
    queryFn: () => api.get("/api/notifications/center", { params: { lang } }).then((r) => r.data),
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    staleTime: Infinity,
    gcTime: 60_000,
  });
  const seen = useMarkSeen();
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();
  const [decided, setDecided] = useState({});
  const [readIds, setReadIds] = useState(() => new Set());
  const [allRead, setAllRead] = useState(false);

  // Opening the bell is what «seen» means: the dot clears, the rows stay
  // highlighted until each is opened or «Hammasini o'qildi» is pressed.
  const topId = data?.top_id;
  useEffect(() => {
    if (topId) seen.mutate(topId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topId]);
  // …and in the Android app the phone's own notifications come down with it.
  useEffect(() => { pushSeen(); }, []);

  useLayoutEffect(() => {
    const place = () => {
      const r = anchorRef.current?.getBoundingClientRect();
      if (!r) return;
      const top = r.bottom + 8;
      setPos(window.innerWidth < 640
        ? { top, left: 8, right: 8 }
        : { top, right: Math.max(8, window.innerWidth - r.right), width: 440 });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [anchorRef]);

  // Focus moves into the panel once it is placed — it renders a frame after
  // mount, when its position is known — so a keyboard user lands inside it.
  const placed = pos != null;
  useEffect(() => {
    if (placed) panelRef.current?.focus({ preventScroll: true });
  }, [placed]);

  // Escape and a press outside close it.
  useEffect(() => {
    // Escape belongs to whatever holds focus: a confirm dialog opened from a
    // row answers it first, and must not take the panel down with it.
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      const a = document.activeElement;
      if (a && a !== document.body && !panelRef.current?.contains(a) && !anchorRef.current?.contains(a)) return;
      onClose(true);
    };
    const onDown = (e) => {
      if (panelRef.current?.contains(e.target) || anchorRef.current?.contains(e.target)) return;
      // A dialog opened from inside the panel lives in its own portal.
      if (e.target.closest?.(".modal-backdrop")) return;
      onClose(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [onClose, anchorRef]);

  const onDecided = useCallback((key, v) => {
    setDecided((d) => {
      const n = { ...d };
      if (v) n[key] = v; else delete n[key];
      return n;
    });
  }, []);

  const read = useCallback((ids) => {
    setReadIds((s) => { const n = new Set(s); ids.forEach((i) => n.add(i)); return n; });
    markRead.mutate(ids);
  }, [markRead]);

  const queue = data?.queue;
  const feed = data?.feed;
  const entries = feed?.entries || [];
  const isUnread = (e) => e.unread && !allRead && !e.ids.every((i) => readIds.has(i));
  const anyUnread = entries.some(isUnread) || (data?.unread ?? 0) > 0;

  // Entries by the plant's day, newest first — the order they arrived in.
  const days = [];
  for (const e of entries) {
    const last = days[days.length - 1];
    if (last && last.day === e.day) last.items.push(e);
    else days.push({ day: e.day, items: [e] });
  }
  const hidden = (queue?.total ?? 0) - (queue?.items?.length ?? 0);

  if (!pos) return null;
  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={t("notif.title")}
      tabIndex={-1}
      className="rounded-xl shadow-2xl flex flex-col outline-none"
      style={{
        position: "fixed",
        zIndex: PANEL_Z,
        top: pos.top,
        left: pos.left,
        right: pos.right,
        width: pos.width,
        maxHeight: `min(680px, calc(100dvh - ${pos.top}px - 12px - var(--tg-safe-bottom, 0px)))`,
        background: "var(--bg-card)",
        border: "1px solid var(--border-md)",
      }}
    >
      <div className="flex items-center justify-between gap-2 pl-4 pr-2 py-2 flex-shrink-0"
        style={{ borderBottom: "1px solid var(--border)" }}>
        <span className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>{t("notif.title")}</span>
        <span className="flex items-center gap-0.5">
          {anyUnread && (
            <button type="button"
              className="text-xs font-medium px-2 py-2 max-sm:py-3 rounded-lg hover:bg-[var(--bg-inner)]"
              style={{ color: "var(--brand-text)" }}
              disabled={markAll.isPending}
              onClick={() => { setAllRead(true); markAll.mutate(); }}>
              {t("notif.markAllRead")}
            </button>
          )}
          <button type="button" aria-label={t("notif.settings")} title={t("notif.settings")}
            className="w-8 h-8 max-sm:w-10 max-sm:h-10 flex items-center justify-center rounded-lg hover:bg-[var(--bg-inner)]"
            style={{ color: "var(--text-3)" }} onClick={onSettings}>
            <Settings size={16} />
          </button>
          <button type="button" aria-label={t("notif.close")} title={t("notif.close")}
            className="w-8 h-8 max-sm:w-10 max-sm:h-10 flex items-center justify-center rounded-lg hover:bg-[var(--bg-inner)]"
            style={{ color: "var(--text-3)" }} onClick={() => onClose(true)}>
            <X size={16} />
          </button>
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        {isLoading ? (
          <PanelSkeleton />
        ) : isError ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm" style={{ color: "var(--text-2)" }}>{t("notif.loadError")}</p>
            <button type="button" className="text-sm font-medium mt-2 underline underline-offset-2"
              style={{ color: "var(--brand-text)" }} onClick={() => refetch()}>
              {t("notif.retry")}
            </button>
          </div>
        ) : (
          <>
            {(queue?.total ?? 0) > 0 ? (
              <section aria-label={t("notif.queueTitle")}>
                <h3 className="px-4 pt-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider"
                  style={{ color: "var(--text-3)" }}>
                  {t("notif.queueTitle")} · <span style={{ color: "var(--text-1)" }}>{queue.total}</span>
                </h3>
                {queue.items.map((it) => (
                  <QueueItem key={it.key} item={it} decided={decided[it.key]}
                    onDecided={onDecided} onOpen={() => onClose(false)} />
                ))}
                {hidden > 0 && (
                  <Link to="/notifications?tab=queue" onClick={() => onClose(false)}
                    className="flex items-center gap-1.5 px-4 py-3 text-[13px] font-medium hover:underline underline-offset-2"
                    style={{ color: "var(--brand-text)", borderTop: "1px solid var(--border)", paddingLeft: 60 }}>
                    {fmt(t("notif.queueMore"), { n: hidden })}
                    <ArrowRight size={14} aria-hidden="true" />
                  </Link>
                )}
              </section>
            ) : (
              <p className="flex items-center gap-2 px-4 py-3 text-[13px]" style={{ color: "var(--text-3)" }}>
                <CheckCircle2 size={16} style={{ color: "var(--status-ok)" }} aria-hidden="true" />
                {t("notif.queueClear")}
              </p>
            )}

            {days.length === 0 ? (
              <div className="px-4 py-8 text-center" style={{ borderTop: "1px solid var(--border)" }}>
                <p className="text-sm font-medium" style={{ color: "var(--text-2)" }}>{t("notif.emptyTitle")}</p>
                <p className="text-[13px] mt-1" style={{ color: "var(--text-3)" }}>{t("notif.emptyText")}</p>
              </div>
            ) : days.map((d) => (
              <section key={d.day || "x"} aria-label={dayLabel(d.day, feed.today, t)}>
                <h3 className="px-4 pt-4 pb-1.5 text-[11px] font-semibold uppercase tracking-wider"
                  style={{ color: "var(--text-3)", borderTop: "1px solid var(--border)" }}>
                  {dayLabel(d.day, feed.today, t)}
                </h3>
                {d.items.map((e) => (
                  <FeedEntry key={e.key} entry={e} unread={isUnread(e)} onRead={read}
                    onOpen={() => onClose(false)} />
                ))}
              </section>
            ))}
          </>
        )}
      </div>

      <Link to="/notifications?tab=history" onClick={() => onClose(false)}
        className="flex items-center justify-center gap-1.5 px-4 py-3 text-[13px] font-medium flex-shrink-0 hover:underline underline-offset-2 rounded-b-xl"
        style={{ color: "var(--brand-text)", borderTop: "1px solid var(--border)" }}>
        {t("notif.seeAll")}
        <ArrowRight size={14} aria-hidden="true" />
      </Link>
    </div>,
    document.body,
  );
}

function PanelSkeleton() {
  return (
    <div className="px-4 py-3 space-y-4" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex gap-3">
          <SkeletonBlock className="w-8 h-8 rounded-lg flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <SkeletonBlock className="h-3.5 w-3/4" />
            <SkeletonBlock className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
