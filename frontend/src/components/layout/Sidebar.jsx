import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import logoSrc from "../../assets/logo.png";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard, BarChart2, Users, Target, Clock,
  Settings, X, PanelLeftClose, PanelLeftOpen, Fingerprint, CalendarCheck, Trophy,
  ChevronDown, Check, Factory, Gauge, ClipboardCheck, Sparkles, Activity, ShieldAlert,
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
  { to: "/kaizen", page: "kaizen", key: "nav.kaizen", icon: Sparkles },
  { to: "/concerns", page: "concerns", key: "nav.concerns", icon: ShieldAlert },
  { to: "/activity", page: "activity", key: "nav.activity", icon: Activity },
];

function fmtDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${parseInt(d)} ${months[parseInt(m) - 1]} ${y}`;
}

// Profile display mirrors the header's UserProfile (Layout.jsx)
const ROLE_TKEYS = {
  "admin":        "role.admin",
  "top-manager":  "role.topManager",
  "shift-manager":"role.manager",
  "supervisor":   "role.supervisor",
};

function nameInitials(name = "") {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function nameToColor(name = "") {
  let hash = 0;
  for (const c of name) hash = c.charCodeAt(0) + ((hash << 5) - hash);
  return `hsl(${Math.abs(hash) % 360}, 50%, 42%)`;
}

export default function Sidebar({ open, onClose, pinned, onTogglePin }) {
  const [hovered, setHovered] = useState(false);
  const [rolesOpen, setRolesOpen] = useState(false);
  const location = useLocation();
  const { auth, switchRole } = useAuth();
  const { t }    = useLang();
  const { access } = usePageAccess();
  const isAdmin  = auth?.role === "admin";

  // Multi-role: every role instance the user holds (pending ones included).
  // Admins who also registered regular roles get an "admin" profile in the list,
  // so the switcher is shown for them too (a plain admin has no roles array).
  const roles = auth?.roles || [];
  const showSwitcher = roles.length > 0;

  const roleLabel = (r) => {
    const base = t(`roles.${r.role}`);
    return r.full_name && r.full_name !== base ? `${base} — ${r.full_name}` : base;
  };

  // Profile shown in the footer — same data as the header's UserProfile
  const profileName = auth?.full_name || "";
  const profileRole = ROLE_TKEYS[auth?.role] ? t(ROLE_TKEYS[auth.role]) : (auth?.role ?? "");

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
  const links = ALL_LINKS.filter(l => canAccessPage(auth?.role, l.page, access));

  const { data: range } = useQuery({
    queryKey: ["attendance-range"],
    queryFn: () => api.get("/api/attendance/range").then(r => r.data),
    staleTime: 300_000,
  });

  // Sidebar is expanded when: mobile drawer open, pinned, or hovered on desktop
  const expanded = open || pinned || hovered;

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
        <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto overflow-x-hidden">
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
                  ...(isActive
                    ? { background: "var(--brand-bg)", color: "var(--brand-text)", fontWeight: 500 }
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
        </nav>

        {/* Footer */}
        <div className="px-2 py-3 space-y-1 overflow-hidden" style={{ borderTop: "1px solid var(--border)" }}>
          {showSwitcher && (
            <div>
              {/* Profile (mirrors the header) + account-switch arrow */}
              <button
                onClick={() => setRolesOpen(v => !v)}
                title={!expanded ? profileName : undefined}
                className="flex items-center rounded-lg text-sm transition-colors w-full"
                style={{
                  gap: "10px",
                  padding: "8px 10px",
                  background: rolesOpen ? "var(--bg-inner)" : "transparent",
                  justifyContent: !expanded ? "center" : undefined,
                }}
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0 select-none"
                  style={{ background: nameToColor(profileName) }}
                >
                  {nameInitials(profileName)}
                </div>
                <div
                  className="flex-1 min-w-0 text-left leading-tight transition-all duration-200"
                  style={{ opacity: expanded ? 1 : 0, maxWidth: expanded ? 200 : 0, overflow: "hidden" }}
                >
                  <div className="text-xs font-semibold truncate" style={{ color: "var(--text-1)" }}>
                    {profileName}
                  </div>
                  <div className="text-[10px] truncate" style={{ color: "var(--text-3)" }}>
                    {profileRole}
                  </div>
                </div>
                {expanded && (
                  <ChevronDown
                    size={13}
                    className="flex-shrink-0 transition-transform"
                    style={{ color: "var(--text-3)", transform: rolesOpen ? "rotate(180deg)" : "none" }}
                  />
                )}
              </button>

              {/* Account list — switch only; new accounts are added via /register in the bot */}
              {rolesOpen && expanded && (
                <div
                  className="mt-1 rounded-lg overflow-hidden"
                  style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}
                >
                  {/* Active profile at top */}
                  <div
                    className="flex items-center gap-2.5 px-3 py-2.5"
                    style={{ borderBottom: roles.filter(r => r.id !== auth?.active_role_ref).length > 0 ? "1px solid var(--border)" : "none" }}
                  >
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 select-none"
                      style={{ background: nameToColor(profileName) }}
                    >
                      {nameInitials(profileName)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold truncate" style={{ color: "var(--text-1)" }}>{profileName}</div>
                      <div className="text-[10px] truncate" style={{ color: "var(--text-3)" }}>{profileRole}</div>
                    </div>
                    <Check size={11} style={{ color: "var(--brand-text)", flexShrink: 0 }} />
                  </div>

                  {/* Other profiles */}
                  {roles.filter(r => r.id !== auth?.active_role_ref).map((r, i, arr) => {
                    const isPending = r.status === "pending";
                    const rName     = r.full_name || "";
                    const rRole     = t(`roles.${r.role}`);
                    return (
                      <button
                        key={r.id}
                        disabled={isPending}
                        onClick={() => switchRole(r.id)}
                        className="w-full min-w-0 text-left flex items-center gap-2.5 px-3 py-2.5"
                        style={{
                          borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none",
                          opacity: isPending ? 0.55 : 1,
                          cursor: isPending ? "default" : "pointer",
                        }}
                      >
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 select-none"
                          style={{ background: nameToColor(rName) }}
                        >
                          {nameInitials(rName)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold truncate" style={{ color: "var(--text-2)" }}>{rName}</div>
                          <div className="text-[10px] truncate flex items-center gap-1.5" style={{ color: "var(--text-3)" }}>
                            {rRole}
                            {isPending && (
                              <span
                                className="text-[9px] font-semibold px-1 py-0.5 rounded-full"
                                style={{ background: "rgba(234,179,8,0.15)", color: "#eab308", border: "1px solid rgba(234,179,8,0.3)" }}
                              >
                                {t("roles.pending")}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

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
