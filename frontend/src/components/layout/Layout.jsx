import { useState, useRef, useEffect } from "react";
import Sidebar from "./Sidebar";
import GlobalFilters from "./GlobalFilters";
import { useTheme } from "../../context/ThemeContext";
import { useLang } from "../../context/LangContext";
import { useFilters } from "../../context/FilterContext";
import { useAuth } from "../../context/AuthContext";
import { useGhost } from "../../context/GhostContext";
import { Sun, Moon, Menu, SlidersHorizontal, X, Check, LogOut, Ghost, Settings } from "lucide-react";
import NotificationsBell, { useNotifications } from "../ui/NotificationsPanel";

// ─── helpers ──────────────────────────────────────────────────────────────────

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

const LANG_FLAGS = { uz: "🇺🇿", uz_cyrl: "🇺🇿", ru: "🇷🇺", en: "🇬🇧" };
const langLabel = (code) => (code === "uz_cyrl" ? "ЎЗ" : code.toUpperCase());

// ─── UserProfile ──────────────────────────────────────────────────────────────
// Avatar in the header that opens a popover for role-switch / sign-out.

function UserProfile() {
  const { auth, leaveRole, switchRole } = useAuth();
  const { lang, setLang, t, languages } = useLang();
  const { theme, toggle } = useTheme();
  const { ghost, toggleGhost } = useGhost();
  const [open, setOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onDown(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  if (!auth || auth.status !== "approved") return null;

  const name     = auth.full_name || "";
  const tkey     = ROLE_TKEYS[auth.role];
  const role     = tkey ? t(tkey) : (auth.role ?? "");
  const initials = nameInitials(name);
  const color    = nameToColor(name);
  const others   = (auth.roles ?? []).filter(r => r.id !== auth.active_role_ref);

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button onClick={() => setOpen(v => !v)} className="flex items-center gap-2">
        <div className="hidden md:block leading-tight text-right">
          <div className="text-xs font-semibold" style={{ color: "var(--text-1)" }}>{name}</div>
          <div className="text-[10px]" style={{ color: "var(--text-3)" }}>{role}</div>
        </div>
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0 select-none"
          style={{ background: color }}
        >
          {initials}
        </div>
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 z-50 rounded-xl overflow-hidden"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            boxShadow: "0 8px 24px rgba(0,0,0,.15)",
            minWidth: 220,
          }}
        >
          {/* Active profile at top */}
          <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0 select-none"
              style={{ background: color }}
            >
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold truncate" style={{ color: "var(--text-1)" }}>{name}</div>
              <div className="text-[10px] truncate" style={{ color: "var(--text-3)" }}>{role}</div>
            </div>
            <Check size={14} style={{ color: "var(--brand-text)", flexShrink: 0 }} />
          </div>

          {/* Other profiles */}
          {others.map(r => {
        const rName     = r.full_name || "";
        const rTkey     = ROLE_TKEYS[r.role];
        const rRole     = rTkey ? t(rTkey) : (r.role ?? "");
        const isPending = r.status === "pending";
        return (
          <button
            key={r.id}
            disabled={isPending}
            onClick={() => { switchRole(r.id); setOpen(false); }}
            className="w-full flex items-center gap-3 px-4 py-3 text-left"
            style={{
              borderBottom: "1px solid var(--border)",
              opacity: isPending ? 0.55 : 1,
              cursor: isPending ? "default" : "pointer",
            }}
            onMouseEnter={e => { if (!isPending) e.currentTarget.style.background = "var(--bg-inner)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = ""; }}
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0 select-none"
              style={{ background: nameToColor(rName) }}
            >
              {nameInitials(rName)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold truncate" style={{ color: "var(--text-1)" }}>{rName}</div>
              <div className="text-[10px] truncate flex items-center gap-1.5" style={{ color: "var(--text-3)" }}>
                {rRole}
                {isPending && (
                  <span
                    className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
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

          {/* Settings — language, theme, ghost, sign out */}
          <button
            onClick={() => { setOpen(false); setSettingsOpen(true); }}
            className="w-full flex items-center gap-3 px-4 py-3 text-xs"
            style={{ color: "var(--text-2)" }}
            onMouseEnter={e => e.currentTarget.style.background = "var(--bg-inner)"}
            onMouseLeave={e => e.currentTarget.style.background = ""}
          >
            <Settings size={14} />
            <span>{t("menu.settings") || "Settings"}</span>
          </button>
        </div>
      )}

      {settingsOpen && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={() => setSettingsOpen(false)}
        >
          <div
            className="rounded-2xl flex flex-col overflow-hidden"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              boxShadow: "0 12px 40px rgba(0,0,0,.25)",
              minWidth: 300,
              maxWidth: 360,
              width: "100%",
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div
              className="flex items-center justify-between px-5 py-3.5 flex-shrink-0"
              style={{ borderBottom: "1px solid var(--border)" }}
            >
              <span className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--text-1)" }}>
                <Settings size={15} />
                {t("menu.settings") || "Settings"}
              </span>
              <button
                onClick={() => setSettingsOpen(false)}
                className="p-0.5 rounded transition-colors hover:bg-white/10"
                style={{ color: "var(--text-3)" }}
              >
                <X size={15} />
              </button>
            </div>

            {/* Language */}
            <div className="px-5 py-4">
              <span className="text-[10px] font-semibold uppercase tracking-wider block mb-2" style={{ color: "var(--text-4)" }}>
                {t("filter.language") || "Language"}
              </span>
              <div className="flex flex-wrap gap-2">
                {languages.map(({ code }) => (
                  <button
                    key={code}
                    onClick={() => setLang(code)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors"
                    style={lang === code
                      ? { background: "var(--brand)", color: "#fff", fontWeight: 600, border: "1px solid var(--brand)" }
                      : { background: "var(--bg-inner)", color: "var(--text-3)", border: "1px solid var(--border-md)" }}
                  >
                    {LANG_FLAGS[code] || "🌐"} {langLabel(code)}
                  </button>
                ))}
              </div>
            </div>

            {/* Appearance — theme + ghost (admin) */}
            <div className="px-5 py-4" style={{ borderTop: "1px solid var(--border)" }}>
              <span className="text-[10px] font-semibold uppercase tracking-wider block mb-2" style={{ color: "var(--text-4)" }}>
                {t("menu.appearance") || "Appearance"}
              </span>

              {/* Theme switch */}
              <div className="flex items-center justify-between py-1">
                <span className="text-xs" style={{ color: "var(--text-2)" }}>{t("menu.theme") || "Theme"}</span>
                <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--border-md)" }}>
                  <button
                    onClick={() => { if (theme !== "light") toggle(); }}
                    className="px-2.5 py-1.5 flex items-center justify-center transition-colors"
                    style={theme === "light"
                      ? { background: "var(--brand)", color: "#fff" }
                      : { background: "var(--bg-inner)", color: "var(--text-3)" }}
                    title={t("theme.light")}
                  >
                    <Sun size={13} />
                  </button>
                  <button
                    onClick={() => { if (theme !== "dark") toggle(); }}
                    className="px-2.5 py-1.5 flex items-center justify-center transition-colors"
                    style={theme === "dark"
                      ? { background: "var(--brand)", color: "#fff" }
                      : { background: "var(--bg-inner)", color: "var(--text-3)" }}
                    title={t("theme.dark")}
                  >
                    <Moon size={13} />
                  </button>
                </div>
              </div>

              {/* Ghost mode — admin only */}
              {auth?.role === "admin" && (
                <div className="flex items-center justify-between py-1 mt-1">
                  <span className="text-xs flex items-center gap-1.5" style={{ color: "var(--text-2)" }}>
                    <Ghost size={13} /> {t("ghost.label")}
                  </span>
                  <button
                    onClick={toggleGhost}
                    className="px-3 py-1 rounded-lg text-[11px] font-semibold transition-colors"
                    style={ghost
                      ? { background: "#7c3aed", color: "#fff", border: "1px solid #7c3aed" }
                      : { background: "var(--bg-inner)", color: "var(--text-3)", border: "1px solid var(--border-md)" }}
                    title={ghost ? t("ghost.tooltipOn") : t("ghost.tooltipOff")}
                  >
                    {ghost ? "ON" : "OFF"}
                  </button>
                </div>
              )}
            </div>

            {/* Sign out from current profile */}
            <button
              onClick={() => { setSettingsOpen(false); setConfirmLogout(true); }}
              className="w-full flex items-center gap-3 px-5 py-3.5 text-xs"
              style={{ color: "var(--text-3)", borderTop: "1px solid var(--border)" }}
              onMouseEnter={e => e.currentTarget.style.color = "#ef4444"}
              onMouseLeave={e => e.currentTarget.style.color = "var(--text-3)"}
            >
              <LogOut size={14} />
              <span>{t("nav.signOut")}</span>
            </button>
          </div>
        </div>
      )}

      {confirmLogout && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={() => setConfirmLogout(false)}
        >
          <div
            className="rounded-2xl p-6 flex flex-col gap-4"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              boxShadow: "0 12px 40px rgba(0,0,0,.25)",
              minWidth: 280,
              maxWidth: 340,
            }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex flex-col gap-1">
              <span className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>
                {t("nav.signOutConfirmTitle")}
              </span>
              <span className="text-xs" style={{ color: "var(--text-3)" }}>
                {t("nav.signOutConfirmText")}
              </span>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmLogout(false)}
                className="px-4 py-2 rounded-lg text-xs font-medium"
                style={{
                  background: "var(--bg-inner)",
                  color: "var(--text-2)",
                  border: "1px solid var(--border)",
                }}
              >
                {t("nav.signOutCancel")}
              </button>
              <button
                onClick={() => { leaveRole(auth.active_role_ref); setConfirmLogout(false); }}
                className="px-4 py-2 rounded-lg text-xs font-medium text-white"
                style={{ background: "#ef4444" }}
              >
                {t("nav.signOutConfirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Telegram Desktop on Windows/Linux floats its window-control buttons (−□×)
// over the top-right corner of the WebApp. Detect and compensate.
const TG_PLATFORM = window.Telegram?.WebApp?.platform ?? "";
const IS_TDESKTOP = TG_PLATFORM === "tdesktop"; // Windows / Linux

export default function Layout({ children, title, showFilters = true, filterSlot = null }) {
  const { t } = useLang();
  const { dateFrom, dateTo, shift, unit, brigadirIds } = useFilters();
  const notif = useNotifications();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarPinned, setSidebarPinned] = useState(
    () => localStorage.getItem("sidebar_pinned") === "true"
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const [menuPanelTop, setMenuPanelTop] = useState(56);
  const [isMobileMenu, setIsMobileMenu] = useState(() => window.innerWidth < 640);

  function toggleSidebarPin() {
    setSidebarPinned(v => {
      const next = !v;
      localStorage.setItem("sidebar_pinned", String(next));
      return next;
    });
  }

  // Active global-filter count — only meaningful where the Filters section shows.
  const activeCount = [
    !!(dateFrom || dateTo),
    shift !== null,
    unit !== "min",
    brigadirIds.length > 0,
  ].filter(Boolean).length;

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const update = () => setIsMobileMenu(window.innerWidth < 640);
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    if (menuOpen && menuRef.current) {
      const r = menuRef.current.getBoundingClientRect();
      setMenuPanelTop(r.bottom + 8);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuOpen]);

  // Badge: global filters use the active-filter count; pages that only inject a
  // unit slot (e.g. Daily) flag a single active filter when not on minutes.
  const filterBadgeCount = showFilters ? activeCount : (filterSlot && unit !== "min" ? 1 : 0);

  // The filters menu only appears on pages that actually expose filters.
  const hasFilters = showFilters || !!filterSlot;

  return (
    <div className="flex h-screen" style={{ background: "var(--bg-base)", color: "var(--text-1)", overflow: "clip" }}>
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        pinned={sidebarPinned}
        onTogglePin={toggleSidebarPin}
      />

      {/* Offset matches sidebar width: 60px collapsed, 256px pinned */}
      <div className={`flex-1 flex flex-col min-w-0 transition-all duration-200 ${sidebarPinned ? "md:ml-64" : "md:ml-[60px]"}`}>
        {/* Header */}
        <header
          className="flex-shrink-0"
          style={{ background: "var(--bg-base)", borderBottom: "1px solid var(--border)", paddingTop: "var(--tg-safe-top, 0px)" }}
        >
          <div
            className="flex items-center justify-between px-4 md:px-6 py-3 gap-3"
            style={IS_TDESKTOP ? { paddingRight: "150px" } : undefined}
          >
            {/* Left: hamburger + title */}
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => setSidebarOpen(true)}
                className="md:hidden p-1.5 rounded-lg flex-shrink-0"
                style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-2)" }}
              >
                <Menu size={16} />
              </button>
              <h1 className="text-sm md:text-base font-semibold truncate" style={{ color: "var(--text-1)" }}>
                {title}
              </h1>
            </div>

            {/* Right: notifications bell + filters menu (hidden when no filters) + account */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Notifications — standalone bell in the header */}
              <NotificationsBell {...notif} />

              {/* Filters menu — only on pages that actually have filters */}
              {hasFilters && (
                <div className="relative" ref={menuRef}>
                  <button
                    onClick={() => setMenuOpen(v => !v)}
                    className="relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    style={{
                      background: menuOpen ? "var(--brand)" : "var(--bg-inner)",
                      border: `1px solid ${menuOpen ? "var(--brand)" : "var(--border)"}`,
                      color: menuOpen ? "#fff" : "var(--text-2)",
                    }}
                  >
                    <SlidersHorizontal size={14} />
                    <span>{t("filter.filters") || "Filters"}</span>
                    {/* Active-filter count */}
                    {filterBadgeCount > 0 && (
                      <span
                        className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center"
                        style={{ background: "var(--brand)", color: "#fff", border: "2px solid var(--bg-base)" }}
                      >
                        {filterBadgeCount}
                      </span>
                    )}
                  </button>

                  {/* Dropdown panel */}
                  {menuOpen && (
                    <div
                      className="z-50 rounded-xl shadow-2xl flex flex-col"
                      style={isMobileMenu ? {
                        position: "fixed",
                        top: menuPanelTop,
                        left: 8,
                        right: 8,
                        maxHeight: `calc(100vh - ${menuPanelTop}px - 12px)`,
                        background: "var(--bg-card)",
                        border: "1px solid var(--border-md)",
                      } : {
                        position: "absolute",
                        top: "calc(100% + 8px)",
                        right: 0,
                        width: 288,
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
                        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
                          {t("filter.filters") || "Filters"}
                        </span>
                        <button
                          onClick={() => setMenuOpen(false)}
                          className="p-0.5 rounded transition-colors hover:bg-white/10"
                          style={{ color: "var(--text-3)" }}
                        >
                          <X size={13} />
                        </button>
                      </div>

                      {/* Scrollable body */}
                      <div className="flex-1 min-h-0 overflow-y-auto">
                        <div className="p-4">
                          {showFilters && <GlobalFilters />}
                          {filterSlot && <div className={showFilters ? "mt-3" : ""}>{filterSlot}</div>}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* User profile */}
              <UserProfile />
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
