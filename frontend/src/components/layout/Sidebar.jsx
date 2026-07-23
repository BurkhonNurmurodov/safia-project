import { useState, useRef, useLayoutEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
// Inlined base64 logo baked into the JS bundle — no network fetch, so it can
// never get stuck on a poisoned cache entry for the stable /logo.png URL. See
// assets/logoChrome.js for the full rationale.
import logoSrc from "../../assets/logoChrome.js";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard, BarChart2, Users, Target, Clock,
  Settings, X, PanelLeftClose, PanelLeftOpen, Fingerprint, CalendarCheck, Trophy,
  Factory, Gauge, ClipboardCheck, Sparkles, Activity, ShieldAlert, ListTodo,
  MessageSquareWarning, Headset, Wrench, Bot,
} from "lucide-react";
import api from "../../utils/api";
import { useAuth } from "../../context/AuthContext";
import { useLang } from "../../context/LangContext";
import { usePageAccess } from "../../hooks/usePageAccess";
import { canAccessPage } from "../../config/pages";

const ALL_LINKS = [
  { to: "/",         page: "overview", key: "nav.overview",       icon: LayoutDashboard },
  { to: "/zagruzka", page: "zagruzka", key: "nav.zagruzka",        icon: BarChart2 },
  { to: "/leaderboard", page: "leaderboard", key: "nav.leaderboard", icon: Trophy },
  { to: "/workers",  page: "workers",  key: "nav.workers",         icon: Users },
  { to: "/plan",     page: "plan",     key: "nav.planFulfillment", icon: Target },
  { to: "/downtime", page: "downtime", key: "nav.idleTime",        icon: Clock },
  { to: "/staff",    page: "staff",    key: "nav.staff",           icon: Fingerprint },
  { to: "/daily",    page: "daily",    key: "nav.daily",           icon: CalendarCheck },
  { to: "/production", page: "production", key: "nav.production",    icon: Factory },
  { to: "/trudoyomkost", page: "trudoyomkost", key: "nav.trudoyomkost", icon: Gauge },
  { to: "/leaders", page: "leaders", key: "nav.leaders", icon: ClipboardCheck },
  // Admin-only copy of leaders monitoring, fed by the in-bot checklist —
  // independent of the sheet-driven page above (no page-access key).
  { to: "/leaders-bot", adminOnly: true, key: "nav.leadersBot", icon: Bot },
  { to: "/kaizen", page: "kaizen", key: "nav.kaizen", icon: Sparkles },
  { to: "/quality", page: "quality", key: "nav.quality", icon: MessageSquareWarning },
  { to: "/concerns", page: "concerns", key: "nav.concerns", icon: ShieldAlert },
  { to: "/tasks", page: "tasks", key: "nav.tasks", icon: ListTodo },
  { to: "/activity", page: "activity", key: "nav.activity", icon: Activity },
  { to: "/setup-times", page: "setup", key: "nav.setupTimes", icon: Wrench },
];

// Layout (and this sidebar) remounts on every route change, which would reset
// the nav list's scroll to the top. Keep the last offset at module level and
// restore it on mount so the list stays where the user left it.
let savedNavScroll = 0;

function fmtDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${parseInt(d)} ${months[parseInt(m) - 1]} ${y}`;
}

export default function Sidebar({ open, onClose, pinned, onTogglePin }) {
  const [hovered, setHovered] = useState(false);
  const location = useLocation();
  const { auth } = useAuth();
  const { t }    = useLang();
  const { access } = usePageAccess();
  const isAdmin  = auth?.role === "admin";

  const BADGE_ROLES = ["admin", "shift-manager"];
  const showBadge = BADGE_ROLES.includes(auth?.role);

  const { data: pendingData } = useQuery({
    queryKey: ["staff-documents-pending-count"],
    queryFn: () => api.get("/api/staff/documents/pending-count").then(r => r.data),
    enabled: showBadge,
    refetchInterval: 30_000,
  });
  const pendingCount = pendingData?.count ?? 0;

  const withSearch = (path) => `${path}${location.search}`;
  const links = ALL_LINKS.filter(l =>
    l.adminOnly ? isAdmin : canAccessPage(auth?.role, l.page, access));

  const { data: range } = useQuery({
    queryKey: ["attendance-range"],
    queryFn: () => api.get("/api/attendance/range").then(r => r.data),
    staleTime: 300_000,
  });

  // Sidebar is expanded when: mobile drawer open, pinned, or hovered on desktop
  const expanded = open || pinned || hovered;

  // Sliding active-page indicator — measure the active NavLink and move one
  // shared pill to it (glides between items instead of the highlight cutting).
  const navRef = useRef(null);

  // Restore the pre-navigation scroll offset once the links have rendered.
  // links.length is a dep because page access can resolve after mount — the
  // list grows and the earlier restore would have been clamped to 0. Once the
  // user scrolls, onScroll keeps savedNavScroll current, so re-running this is
  // a no-op.
  useLayoutEffect(() => {
    if (navRef.current) navRef.current.scrollTop = savedNavScroll;
  }, [links.length]);

  const [ind, setInd] = useState({ top: 0, height: 0, show: false, anim: false });
  useLayoutEffect(() => {
    const el = navRef.current?.querySelector('[aria-current="page"]');
    if (!el) { setInd(p => (p.show ? { ...p, show: false } : p)); return; }
    // anim: only glide when the pill was already showing (i.e. moving between
    // items). On first appearance it snaps into place with no slide.
    setInd(p => ({ top: el.offsetTop, height: el.offsetHeight, show: true, anim: p.show }));
  }, [location.pathname, expanded, links.length]);

  return (
    <>
      {/* Backdrop — mobile only */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          background:  "var(--bg-card)",
          borderRight: "1px solid var(--border)",
          boxShadow:   (hovered && !pinned) ? "4px 0 24px rgba(0,0,0,0.25)" : "none",
        }}
        className={`
          fixed inset-y-0 left-0 flex flex-col flex-shrink-0
          transition-all duration-200 ease-in-out
          z-40
          w-64
          ${open ? "translate-x-0" : "-translate-x-full"}
          md:translate-x-0
          ${expanded ? "md:w-64" : "md:w-[60px]"}
          ${!pinned && hovered ? "md:z-50" : pinned ? "md:z-20" : "md:z-20"}
        `}
      >
        {/* Header */}
        <div
          className="flex items-center flex-shrink-0 px-3 gap-2 overflow-hidden"
          style={{
            borderBottom: "1px solid var(--border)",
            minHeight: 60,
            paddingTop: "calc(var(--tg-safe-top, 0px) + 0.75rem)",
            paddingBottom: "0.75rem",
          }}
        >
          {/* Collapsed: logo icon (desktop only, not expanded) */}
          {!expanded && (
            <div className="hidden md:flex w-full items-center justify-center">
              <img
                src={logoSrc}
                alt="Safia"
                className="w-8 h-8 rounded-full object-cover flex-shrink-0"
              />
            </div>
          )}

          {/* Expanded: logo + brand text + pin button */}
          {expanded && (
            <>
              <img
                src={logoSrc}
                alt="Safia"
                className="w-9 h-9 rounded-full object-cover flex-shrink-0"
              />
              <div className="flex-1 min-w-0 overflow-hidden">
                <div
                  className="text-xs font-semibold uppercase tracking-widest mb-0.5 whitespace-nowrap"
                  style={{ color: "var(--brand-text)" }}
                >
                  Zagruzka
                </div>
                <div className="text-[11px] whitespace-nowrap" style={{ color: "var(--text-3)" }}>
                  {t("nav.appSubtitle")}
                </div>
              </div>

              {/* Desktop: pin toggle button */}
              <button
                onClick={onTogglePin}
                className="hidden md:flex p-1.5 rounded-lg flex-shrink-0 transition-colors hover:bg-white/10"
                style={{ color: pinned ? "var(--brand-text)" : "var(--text-3)" }}
                title={pinned ? "Unpin sidebar" : "Pin sidebar open"}
              >
                {pinned ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
              </button>

              {/* Mobile: close button */}
              <button
                onClick={onClose}
                className="md:hidden p-1 rounded flex-shrink-0"
                style={{ color: "var(--text-3)" }}
              >
                <X size={16} />
              </button>
            </>
          )}
        </div>

        {/* Nav */}
        <nav
          ref={navRef}
          onScroll={(e) => { savedNavScroll = e.currentTarget.scrollTop; }}
          className="relative flex-1 py-3 px-2 space-y-0.5 overflow-y-auto overflow-x-hidden"
        >
          {links.map(({ to, key, icon: Icon }) => {
            const isStaff = to === "/staff";
            const badge = isStaff && showBadge && pendingCount > 0;
            return (
              <NavLink
                key={to}
                to={withSearch(to)}
                end={to === "/"}
                onClick={onClose}
                title={!expanded ? t(key) : undefined}
                className="flex items-center rounded-lg text-sm transition-colors"
                style={({ isActive }) => ({
                  gap: "12px",
                  padding: "10px",
                  position: "relative",
                  zIndex: 1,
                  // Background now comes from the sliding indicator behind it;
                  // the link only carries the active text color + weight.
                  ...(isActive
                    ? { color: "var(--brand-text)", fontWeight: 500 }
                    : { color: "var(--text-3)" }),
                  justifyContent: !expanded ? "center" : undefined,
                })}
              >
                {/* Icon + dot badge when collapsed */}
                <div className="relative flex-shrink-0">
                  <Icon size={16} />
                  {badge && !expanded && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500" />
                  )}
                </div>

                <span
                  className="truncate whitespace-nowrap transition-all duration-200 flex-1"
                  style={{
                    opacity:  expanded ? 1 : 0,
                    maxWidth: expanded ? 200 : 0,
                    overflow: "hidden",
                    display:  "block",
                  }}
                >
                  {t(key)}
                </span>

                {/* Count badge when expanded */}
                {badge && expanded && (
                  <span className="ml-auto flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{ background: "#ef4444", color: "#fff", minWidth: 18, textAlign: "center" }}>
                    {pendingCount}
                  </span>
                )}
              </NavLink>
            );
          })}

          {/* Active-page indicator — one gold pill that glides between items.
              Rendered last so the first link stays the flow's first child;
              marginTop:0 cancels the space-y gap on this absolute element. */}
          <div
            aria-hidden
            className="sidebar-ind absolute left-2 right-2 rounded-lg pointer-events-none"
            style={{
              top: 0,
              height: ind.height,
              transform: `translateY(${ind.top}px)`,
              opacity: ind.show ? 1 : 0,
              marginTop: 0,
              background: "var(--brand-bg)",
              zIndex: 0,
              ...(ind.anim ? null : { transition: "none" }),
            }}
          />
        </nav>

        {/* Footer */}
        <div className="px-2 py-3 space-y-1 overflow-hidden" style={{ borderTop: "1px solid var(--border)" }}>
          {isAdmin && (
            <NavLink
              to={withSearch("/admin/upload")}
              onClick={onClose}
              title={!expanded ? t("nav.admin") : undefined}
              className="flex items-center rounded-lg text-sm transition-colors"
              style={({ isActive }) => ({
                gap: "12px",
                padding: "10px",
                color:      isActive ? "var(--text-1)" : "var(--text-3)",
                background: isActive ? "var(--bg-inner)" : "transparent",
                justifyContent: !expanded ? "center" : undefined,
              })}
            >
              <Settings size={16} className="flex-shrink-0" />
              <span
                className="truncate whitespace-nowrap transition-all duration-200"
                style={{ opacity: expanded ? 1 : 0, maxWidth: expanded ? 200 : 0, overflow: "hidden", display: "block" }}
              >
                {t("nav.admin")}
              </span>
            </NavLink>
          )}

          {!isAdmin && (
            <a
              href="https://t.me/burkhon_n"
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                const tg = window?.Telegram?.WebApp;
                const url = "https://t.me/burkhon_n";
                if (tg?.openTelegramLink || tg?.openLink) {
                  e.preventDefault();
                  try {
                    if (tg.platform === "macos") {
                      tg.openLink(url);
                    } else if (tg.openTelegramLink) {
                      tg.openTelegramLink(url);
                    } else {
                      tg.openLink(url);
                    }
                  } catch (err) {
                    window.open(url, "_blank");
                  }
                }
                // Delay onClose to prevent unmounting the <a> before the browser can process target="_blank"
                setTimeout(() => onClose?.(), 150);
              }}
              title={!expanded ? t("nav.support") : undefined}
              className="flex items-center rounded-lg text-sm transition-colors"
              style={{
                gap: "12px",
                padding: "10px",
                color: "var(--text-3)",
                justifyContent: !expanded ? "center" : undefined,
              }}
            >
              <Headset size={16} className="flex-shrink-0" />
              <span
                className="truncate whitespace-nowrap transition-all duration-200"
                style={{ opacity: expanded ? 1 : 0, maxWidth: expanded ? 200 : 0, overflow: "hidden", display: "block" }}
              >
                {t("nav.support")}
              </span>
            </a>
          )}

          {range?.date_to && (
            <div
              className="flex items-center rounded-lg overflow-hidden"
              title={!expanded ? `${t("nav.dataThrough")} ${fmtDate(range.date_to)}` : undefined}
              style={{ gap: "12px", padding: "8px 10px", justifyContent: !expanded ? "center" : undefined }}
            >
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
              <div
                className="text-[10px] leading-tight whitespace-nowrap transition-all duration-200"
                style={{
                  color:    "var(--text-4)",
                  opacity:  expanded ? 1 : 0,
                  maxWidth: expanded ? 200 : 0,
                  overflow: "hidden",
                  display:  "block",
                }}
              >
                {t("nav.dataThrough")}{" "}
                <span style={{ color: "var(--text-3)" }}>{fmtDate(range.date_to)}</span>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
