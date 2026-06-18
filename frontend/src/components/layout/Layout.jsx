import { useState, useRef, useEffect } from "react";
import Sidebar from "./Sidebar";
import GlobalFilters from "./GlobalFilters";
import { useTheme } from "../../context/ThemeContext";
import { useLang } from "../../context/LangContext";
import { useFilters } from "../../context/FilterContext";
import { useAuth } from "../../context/AuthContext";
import { Sun, Moon, Menu, SlidersHorizontal, X, Check, LogOut } from "lucide-react";
import NotificationsPanel from "../ui/NotificationsPanel";

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

// ─── UserProfile ──────────────────────────────────────────────────────────────

function UserProfile() {
  const { auth, leaveRole, switchRole } = useAuth();
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
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

          {/* Sign out from current profile */}
          <button
            onClick={() => { setOpen(false); setConfirmLogout(true); }}
            className="w-full flex items-center gap-3 px-4 py-3 text-xs"
            style={{ color: "var(--text-3)" }}
            onMouseEnter={e => e.currentTarget.style.color = "#ef4444"}
            onMouseLeave={e => e.currentTarget.style.color = "var(--text-3)"}
          >
            <LogOut size={14} />
            <span>{t("nav.signOut")}</span>
          </button>
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

const LANG_FLAGS = { uz: "🇺🇿", uz_cyrl: "🇺🇿", ru: "🇷🇺", en: "🇬🇧" };
const langLabel = (code) => (code === "uz_cyrl" ? "ЎЗ" : code.toUpperCase());

function LangDropdown({ lang, setLang, languages }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
        style={{
          background: open ? "var(--brand)" : "var(--bg-inner)",
          border: "1px solid var(--border-md)",
          color: open ? "#fff" : "var(--text-2)",
        }}
      >
        {LANG_FLAGS[lang] || "🌐"} {langLabel(lang)}
      </button>
      {open && (
        <div
          className="absolute right-0 mt-1.5 rounded-xl overflow-hidden z-50"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border-md)", boxShadow: "0 8px 24px rgba(0,0,0,0.18)", minWidth: 110 }}
        >
          {languages.map(({ code }) => (
            <button
              key={code}
              onClick={() => { setLang(code); setOpen(false); }}
              className="flex items-center gap-2 w-full px-3 py-2 text-xs transition-colors"
              style={{
                background: lang === code ? "var(--brand-bg)" : "transparent",
                color: lang === code ? "var(--brand-text)" : "var(--text-2)",
                fontWeight: lang === code ? 600 : 400,
              }}
              onMouseEnter={e => { if (lang !== code) e.currentTarget.style.background = "var(--bg-inner)"; }}
              onMouseLeave={e => { if (lang !== code) e.currentTarget.style.background = "transparent"; }}
            >
              {LANG_FLAGS[code] || "🌐"} {langLabel(code)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Telegram Desktop on Windows/Linux floats its window-control buttons (−□×)
// over the top-right corner of the WebApp. Detect and compensate.
const TG_PLATFORM = window.Telegram?.WebApp?.platform ?? "";
const IS_TDESKTOP = TG_PLATFORM === "tdesktop"; // Windows / Linux

export default function Layout({ children, title, showFilters = true }) {
  const { theme, toggle } = useTheme();
  const { lang, setLang, t, languages } = useLang();
  const { dateFrom, dateTo, shift, unit, brigadirIds } = useFilters();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarPinned, setSidebarPinned] = useState(
    () => localStorage.getItem("sidebar_pinned") === "true"
  );
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef(null);
  const [filterPanelTop, setFilterPanelTop] = useState(56);
  const [isMobileFilter, setIsMobileFilter] = useState(() => window.innerWidth < 640);

  function toggleSidebarPin() {
    setSidebarPinned(v => {
      const next = !v;
      localStorage.setItem("sidebar_pinned", String(next));
      return next;
    });
  }

  const activeCount = [
    !!(dateFrom || dateTo),
    shift !== null,
    unit !== "min",
    brigadirIds.length > 0,
  ].filter(Boolean).length;

  useEffect(() => {
    function handleClickOutside(e) {
      if (filterRef.current && !filterRef.current.contains(e.target)) {
        setFilterOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const update = () => setIsMobileFilter(window.innerWidth < 640);
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    if (filterOpen && filterRef.current) {
      const r = filterRef.current.getBoundingClientRect();
      setFilterPanelTop(r.bottom + 8);
    }
  }, [filterOpen]);

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

            {/* Right: filter button + lang + theme */}
            <div className="flex items-center gap-2 flex-shrink-0">

              {/* Filter button + dropdown */}
              {showFilters && (
                <div className="relative" ref={filterRef}>
                  <button
                    onClick={() => setFilterOpen(v => !v)}
                    className="relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    style={{
                      background: filterOpen ? "var(--brand)" : "var(--bg-inner)",
                      border: `1px solid ${filterOpen ? "var(--brand)" : "var(--border)"}`,
                      color: filterOpen ? "#fff" : "var(--text-2)",
                    }}
                  >
                    <SlidersHorizontal size={14} />
                    <span>{t("filter.filters") || "Filters"}</span>
                    {activeCount > 0 && (
                      <span
                        className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center"
                        style={{ background: "var(--brand)", color: "#fff", border: "2px solid var(--bg-base)" }}
                      >
                        {activeCount}
                      </span>
                    )}
                  </button>

                  {/* Dropdown panel */}
                  {filterOpen && (
                    <div
                      className="z-50 rounded-xl shadow-2xl"
                      style={isMobileFilter ? {
                        position: "fixed",
                        top: filterPanelTop,
                        left: 8,
                        right: 8,
                        background: "var(--bg-card)",
                        border: "1px solid var(--border-md)",
                      } : {
                        position: "absolute",
                        top: "calc(100% + 8px)",
                        right: 0,
                        width: 248,
                        background: "var(--bg-card)",
                        border: "1px solid var(--border-md)",
                      }}
                    >
                      {/* Panel header */}
                      <div
                        className="flex items-center justify-between px-4 py-2.5"
                        style={{ borderBottom: "1px solid var(--border)" }}
                      >
                        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
                          {t("filter.filters") || "Filters"}
                        </span>
                        <button
                          onClick={() => setFilterOpen(false)}
                          className="p-0.5 rounded transition-colors hover:bg-white/10"
                          style={{ color: "var(--text-3)" }}
                        >
                          <X size={13} />
                        </button>
                      </div>

                      {/* Filter content */}
                      <div className="p-4">
                        <GlobalFilters />
                      </div>

                      {/* Language section */}
                      <div
                        className="px-4 py-3"
                        style={{ borderTop: "1px solid var(--border)" }}
                      >
                        <span className="text-[10px] font-semibold uppercase tracking-wider block mb-2" style={{ color: "var(--text-4)" }}>
                          {t("filter.language") || "Language"}
                        </span>
                        <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--border-md)", width: "fit-content" }}>
                          {languages.map(({ code }) => (
                            <button
                              key={code}
                              onClick={() => setLang(code)}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors"
                              style={lang === code
                                ? { background: "var(--brand)", color: "#fff", fontWeight: 600 }
                                : { background: "var(--bg-inner)", color: "var(--text-3)" }}
                            >
                              {LANG_FLAGS[code] || "🌐"} {langLabel(code)}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Language switcher — always visible when filters panel is hidden */}
              {!showFilters && (
                <LangDropdown lang={lang} setLang={setLang} languages={languages} />
              )}

              {/* Notifications */}
              <NotificationsPanel />

              {/* Theme toggle */}
              <button
                onClick={toggle}
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors"
                style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-2)" }}
                title={theme === "dark" ? t("theme.dark") : t("theme.light")}
              >
                {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
              </button>

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
