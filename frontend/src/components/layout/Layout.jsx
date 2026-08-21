import { useState, useRef, useEffect } from "react";
import Sidebar from "./Sidebar";
import { useTheme } from "../../context/ThemeContext";
import { useLang } from "../../context/LangContext";
import { useAuth } from "../../context/AuthContext";
import { useGhost } from "../../context/GhostContext";
import { Sun, Moon, Menu, Check, LogOut, Ghost, Globe, UserRound, UserPlus, Loader2 } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import NotificationsBell, { useNotifications } from "../ui/NotificationsPanel";
import ProfileAvatar, { useMyProfileDetails } from "../ui/ProfileAvatar";
import AddProfileModal from "./AddProfileModal";
import UpdatePrompt from "./UpdatePrompt";
import useActivityPing from "../../hooks/useActivityPing";
import { useTranslit } from "../../utils/transliterate";
import { ROLE_LABEL_KEYS } from "../../config/pages";
import { ScopedErrorBoundary } from "../ui/ErrorBoundary";

// ─── helpers ──────────────────────────────────────────────────────────────────

const LANG_FLAGS = { uz: "🇺🇿", uz_cyrl: "🇺🇿", ru: "🇷🇺", en: "🇬🇧" };
const LANG_NAMES = { uz: "O'zbekcha", uz_cyrl: "Ўзбекча", ru: "Русский", en: "English" };
const langLabel = (code) => (code === "uz_cyrl" ? "ЎЗ" : code.toUpperCase());

// Shared header icon-button look (bell-sized, 15px glyph).
const iconBtnStyle = (active) => ({
  background: active ? "var(--brand)" : "var(--bg-inner)",
  border: `1px solid ${active ? "var(--brand)" : "var(--border)"}`,
  color: active ? "#fff" : "var(--text-2)",
});

// ─── UserProfile ──────────────────────────────────────────────────────────────
// Avatar in the header that opens a popover: my profile, role switch, add
// profile, sign out. (Language, theme and ghost sit directly on the header
// bar now — the Settings modal is gone.)

function UserProfile() {
  const { auth, switchRole, leaveRole, logout, webSession, botUsername,
          webProfiles, addWebProfile, switchWebProfile } = useAuth();
  const { t } = useLang();
  const { tl } = useTranslit();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  // { username, expired } while the credential dialog is up; null when closed.
  const [addProfile, setAddProfile] = useState(null);
  const [switching, setSwitching] = useState("");
  const ref = useRef(null);
  const { data: me } = useMyProfileDetails();

  useEffect(() => {
    function onDown(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  if (!auth || auth.status !== "approved") return null;

  const name   = tl(auth.full_name || "");
  const tkey   = ROLE_LABEL_KEYS[auth.role];
  const role   = tkey ? t(tkey) : (auth.role ?? "");
  const others = (auth.roles ?? []).filter(r => r.id !== auth.active_role_ref);
  // Browser only: the other profiles this machine is signed in as. `roles` is
  // always empty on a web session, so these never appear alongside each other.
  const activeUsername = auth.web_login?.username || "";
  const walletOthers = webSession
    ? (webProfiles ?? []).filter(p => p.username !== activeUsername)
    : [];

  /** Switch to a wallet profile. A dead stored token reopens the credential
   *  dialog on that username instead of dropping the row. */
  async function pickWebProfile(username) {
    if (switching) return;
    setSwitching(username);
    const r = await switchWebProfile(username);
    if (r?.ok) return;             // the page is reloading — leave the menu as it is
    setSwitching("");
    setOpen(false);
    setAddProfile({ username, expired: true });
  }

  const rowHover = {
    onMouseEnter: (e) => { e.currentTarget.style.background = "var(--bg-inner)"; },
    onMouseLeave: (e) => { e.currentTarget.style.background = ""; },
  };

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button onClick={() => setOpen(v => !v)} className="flex items-center gap-2">
        <div className="hidden md:block leading-tight text-right">
          <div className="text-xs font-semibold" style={{ color: "var(--text-1)" }}>{name}</div>
          <div className="text-[10px]" style={{ color: "var(--text-3)" }}>{role}</div>
        </div>
        <ProfileAvatar name={name} colorKey={auth.full_name || ""}
                       profileKey={me?.profile_key} photoVer={me?.photo_ver} size={32} />
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 z-50 rounded-xl"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            boxShadow: "0 8px 24px rgba(0,0,0,.15)",
            minWidth: 220,
            // An account may hold many profiles, and the popover is anchored in a
            // header the page cannot scroll: past ~4 rows the tail (sign out
            // included) fell off the bottom of a phone screen unreachable.
            maxHeight: "min(72vh, 560px)",
            overflowX: "hidden",
            overflowY: "auto",
          }}
        >
          {/* Active profile at top */}
          <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
            <ProfileAvatar name={name} colorKey={auth.full_name || ""}
                           profileKey={me?.profile_key} photoVer={me?.photo_ver} size={32} />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold truncate" style={{ color: "var(--text-1)" }}>{name}</div>
              <div className="text-[10px] truncate" style={{ color: "var(--text-3)" }}>{role}</div>
            </div>
            <Check size={14} style={{ color: "var(--brand-text)", flexShrink: 0 }} />
          </div>

          {/* My profile — the page itself */}
          <button
            onClick={() => { setOpen(false); navigate("/profile"); }}
            className="w-full flex items-center gap-3 px-4 py-3 text-xs"
            style={{ color: "var(--text-2)", borderBottom: "1px solid var(--border)" }}
            {...rowHover}
          >
            <UserRound size={14} />
            <span>{t("profile.myProfile")}</span>
          </button>

          {/* Other profiles */}
          {others.map(r => {
            const rName     = tl(r.full_name || "");
            const rTkey     = ROLE_LABEL_KEYS[r.role];
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
                <ProfileAvatar name={rName} colorKey={r.full_name || ""}
                               profileKey={r.profile_key} photoVer={r.photo_ver} size={32} />
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

          {/* Other profiles signed in on this browser. Tapping one swaps the
              session to the token already held for it — no password, which is
              the point of the wallet. */}
          {walletOthers.map(p => {
            const pName = tl(p.full_name || "");
            const pTkey = ROLE_LABEL_KEYS[p.role];
            const pRole = pTkey ? t(pTkey) : (p.role ?? "");
            const busy  = switching === p.username;
            return (
              <button
                key={p.username}
                disabled={Boolean(switching)}
                onClick={() => pickWebProfile(p.username)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left"
                style={{
                  borderBottom: "1px solid var(--border)",
                  opacity: switching && !busy ? 0.55 : 1,
                  cursor: switching ? "default" : "pointer",
                }}
                onMouseEnter={e => { if (!switching) e.currentTarget.style.background = "var(--bg-inner)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = ""; }}
              >
                <ProfileAvatar name={pName} colorKey={p.full_name || ""}
                               profileKey={p.profile_key} photoVer={p.photo_ver} size={32} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold truncate" style={{ color: "var(--text-1)" }}>{pName}</div>
                  <div className="text-[10px] truncate" style={{ color: "var(--text-3)" }}>
                    {pRole} · {p.username}
                  </div>
                </div>
                {busy && <Loader2 size={13} className="animate-spin flex-shrink-0" style={{ color: "var(--text-3)" }} />}
              </button>
            );
          })}

          {/* Add new profile.
              In Telegram this runs the bot's register flow (language → web form
              → phone number): navigating to /login in-app would skip the bot's
              contact request, so open the bot deep link instead.
              In a BROWSER a profile is proven by its own username + password, so
              ask for the credential here and keep the current profile signed in
              beside it. */}
          <button
            onClick={() => {
              setOpen(false);
              if (webSession) {
                setAddProfile({ username: "", expired: false });
                return;
              }
              const tg = window.Telegram?.WebApp;
              if (tg?.openTelegramLink && botUsername) {
                tg.openTelegramLink(`https://t.me/${botUsername}?start=register`);
              } else {
                navigate("/login");
              }
            }}
            className="w-full flex items-center gap-3 px-4 py-3 text-xs"
            style={{ color: "var(--text-2)", borderBottom: "1px solid var(--border)" }}
            {...rowHover}
          >
            <UserPlus size={14} />
            <span>{t("menu.addProfile") || "Add new profile"}</span>
          </button>

          {/* Sign out.
              In Telegram this is an UNREGISTER: it drops the profile binding
              and the person has to /start again. In a browser it must only
              end the session — reading "sign out" on a website as "delete my
              account" would be indefensible — so the confirm is skipped and
              logout() just clears the token. */}
          <button
            onClick={() => {
              setOpen(false);
              if (webSession) logout();
              else setConfirmLogout(true);
            }}
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

      {addProfile && (
        <AddProfileModal
          open
          presetUsername={addProfile.username}
          expired={addProfile.expired}
          onClose={() => setAddProfile(null)}
          onAdded={addWebProfile}
        />
      )}

      {confirmLogout && (
        <div
          className="modal-backdrop fixed inset-0 z-[9999] flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={() => setConfirmLogout(false)}
        >
          <div
            className="modal-card rounded-2xl p-6 flex flex-col gap-4"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border-md)",
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

// ─── Header controls: language · theme · ghost ────────────────────────────────
// These lived inside the old Settings modal; they are one-tap toggles, so they
// earn header cells of their own instead of a modal between the person and a
// theme switch. Sized to match the notifications bell (p-1.5, 15px glyph).

function LangSwitcher() {
  const { lang, setLang, t, languages } = useLang();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onDown(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 p-1.5 rounded-lg transition-colors"
        style={iconBtnStyle(open)}
        title={t("filter.language") || "Language"}
        aria-label={t("filter.language") || "Language"}
      >
        <Globe size={15} />
        <span className="hidden md:inline text-[10px] font-bold leading-none">{langLabel(lang)}</span>
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 z-50 rounded-xl overflow-hidden"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            boxShadow: "0 8px 24px rgba(0,0,0,.15)",
            minWidth: 170,
          }}
        >
          {languages.map(({ code }, i) => (
            <button
              key={code}
              onClick={() => { setLang(code); setOpen(false); }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs"
              style={{
                color: lang === code ? "var(--text-1)" : "var(--text-2)",
                fontWeight: lang === code ? 600 : 400,
                borderBottom: i < languages.length - 1 ? "1px solid var(--border)" : "none",
              }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--bg-inner)"}
              onMouseLeave={e => e.currentTarget.style.background = ""}
            >
              <span>{LANG_FLAGS[code] || "🌐"}</span>
              <span className="flex-1 text-left">{LANG_NAMES[code] || langLabel(code)}</span>
              {lang === code && <Check size={13} style={{ color: "var(--brand-text)" }} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ThemeButton() {
  const { theme, toggle } = useTheme();
  const { t } = useLang();
  const next = theme === "dark" ? t("theme.light") : t("theme.dark");
  return (
    <button
      onClick={toggle}
      className="flex items-center justify-center p-1.5 rounded-lg transition-colors flex-shrink-0"
      style={iconBtnStyle(false)}
      title={next}
      aria-label={next}
    >
      {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  );
}

function GhostButton() {
  const { auth } = useAuth();
  const { ghost, toggleGhost } = useGhost();
  const { t } = useLang();
  if (auth?.role !== "admin") return null;
  return (
    <button
      onClick={toggleGhost}
      className="flex items-center justify-center p-1.5 rounded-lg transition-colors flex-shrink-0"
      style={ghost
        ? { background: "#7c3aed", border: "1px solid #7c3aed", color: "#fff" }
        : iconBtnStyle(false)}
      title={ghost ? t("ghost.tooltipOn") : t("ghost.tooltipOff")}
      aria-label={t("ghost.label")}
      aria-pressed={ghost}
    >
      <Ghost size={15} />
    </button>
  );
}

// Telegram Desktop on Windows/Linux floats its window-control buttons (−□×)
// over the top-right corner of the WebApp. Detect and compensate.
const TG_PLATFORM = window.Telegram?.WebApp?.platform ?? "";
const IS_TDESKTOP = TG_PLATFORM === "tdesktop"; // Windows / Linux

// ─── Scroll memory ────────────────────────────────────────────────────────────
// The <main> viewport below is THE scroll container for every page, and Layout
// remounts on each route change (resetting scrollTop to 0). Remember the last
// position per pathname so returning to a page lands where the user left off.
// Mirrored to sessionStorage so it also survives the stale-version reload.
const scrollMemory = new Map(); // pathname -> scrollTop
const SCROLL_MEM_KEY = "page_scroll_mem";
try {
  const saved = JSON.parse(sessionStorage.getItem(SCROLL_MEM_KEY) || "{}");
  for (const [k, v] of Object.entries(saved)) scrollMemory.set(k, v);
} catch { /* corrupt/unavailable storage — start empty */ }
let scrollFlush = 0;
function rememberScroll(pathname, top) {
  scrollMemory.set(pathname, top);
  cancelAnimationFrame(scrollFlush);
  scrollFlush = requestAnimationFrame(() => {
    try {
      sessionStorage.setItem(SCROLL_MEM_KEY, JSON.stringify(Object.fromEntries(scrollMemory)));
    } catch { /* quota/blocked — in-memory map still works for this session */ }
  });
}

export default function Layout({ children, title }) {
  const notif = useNotifications();
  useActivityPing(); // heartbeat for the Users-Activity dashboard
  const { pathname } = useLocation();
  const mainRef = useRef(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Restore the remembered position. Page data arrives async (skeletons are
  // shorter than the real content), so retry each frame until the container
  // is tall enough to hold the target offset — giving up if the user scrolls
  // first, or clamping best-effort after 4s (content may have gotten shorter).
  useEffect(() => {
    const el = mainRef.current;
    const target = scrollMemory.get(pathname) || 0;
    if (!el || target <= 0) return undefined;
    let raf = 0;
    let done = false;
    const deadline = performance.now() + 4000;
    const stop = () => { done = true; cancelAnimationFrame(raf); };
    const attempt = () => {
      if (done) return;
      if (el.scrollHeight - el.clientHeight >= target || performance.now() > deadline) {
        el.scrollTop = target; // browser clamps if the page ended up shorter
        stop();
        return;
      }
      raf = requestAnimationFrame(attempt);
    };
    el.addEventListener("wheel", stop, { passive: true });
    el.addEventListener("touchstart", stop, { passive: true });
    attempt();
    return () => {
      stop();
      el.removeEventListener("wheel", stop);
      el.removeEventListener("touchstart", stop);
    };
  }, [pathname]);
  // Pinned by default on a real desktop viewport: the app arrived from a phone,
  // where a collapsed rail is right, but on a browser a permanently visible nav
  // is what makes the product legible — there is room for it and hiding it just
  // costs a click on every navigation. Still a remembered per-device choice.
  const [sidebarPinned, setSidebarPinned] = useState(() => {
    const saved = localStorage.getItem("sidebar_pinned");
    if (saved !== null) return saved === "true";
    return window.matchMedia?.("(min-width: 1024px)")?.matches ?? false;
  });

  function toggleSidebarPin() {
    setSidebarPinned(v => {
      const next = !v;
      localStorage.setItem("sidebar_pinned", String(next));
      return next;
    });
  }

  return (
    <div className="flex h-screen" style={{ background: "var(--bg-base)", color: "var(--text-1)", overflow: "clip" }}>
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        pinned={sidebarPinned}
        onTogglePin={toggleSidebarPin}
      />

      {/* Offset matches sidebar width: 60px collapsed, 256px pinned. The side
          insets are 0 everywhere except a landscape Android phone, where the
          nav bar sits on one edge — padding the whole column keeps the header
          and the content clear of it together, so nothing shifts relative to
          anything else. */}
      <div
        className={`flex-1 flex flex-col min-w-0 transition-all duration-200 ${sidebarPinned ? "md:ml-64" : "md:ml-[60px]"}`}
        style={{ paddingLeft: "var(--tg-safe-left, 0px)", paddingRight: "var(--tg-safe-right, 0px)" }}
      >
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

            {/* Right: bell · language · theme · ghost(admin) · account */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Notifications — standalone bell in the header */}
              <NotificationsBell {...notif} />

              {/* Language · theme · ghost — former Settings-modal controls */}
              <LangSwitcher />
              <ThemeButton />
              <GhostButton />

              {/* User profile */}
              <UserProfile />
            </div>
          </div>
        </header>

        {/* Content viewport. Layout remounts on every route change, so the
            .page-enter wrapper replays its fade-up once per navigation — a
            light, instant-feeling swap in place of the old logo overlay. */}
        <div className="relative flex-1 min-h-0">
          <main
            ref={mainRef}
            onScroll={(e) => rememberScroll(pathname, e.currentTarget.scrollTop)}
            className="h-full overflow-y-auto overflow-x-hidden p-4 md:p-6"
          >
            {/* The column is bounded and centred so that on a wide desktop
                monitor the content does not smear edge to edge — a table whose
                first and last column sit a head-turn apart is harder to read
                than the same table with margin either side. On phones and
                laptops the cap never binds, so nothing changes there. */}
            {/* The inset alone only guarantees the last row is not COVERED by the
                system bar — it would still end flush against it, which reads as
                broken and puts a 44px tap target a thumb-width from the Back
                button. One spacing step on top keeps the page ending where the
                app ends. */}
            <div className="page-enter mx-auto w-full"
              style={{ maxWidth: "var(--content-max)", paddingBottom: "calc(var(--tg-safe-bottom, 0px) + 1rem)" }}>
              {/* The innermost boundary, and the one that does the most work:
                  a table, chart or modal that throws costs the CONTENT column
                  and nothing else — the sidebar, the bell and the profile menu
                  stay up, so the user is never stranded on a dead-end screen
                  with a reload button as their only way out. */}
              <ScopedErrorBoundary inline>
                {children}
              </ScopedErrorBoundary>
            </div>
          </main>
        </div>
      </div>

      {/* Notices a newer build and offers a reload. Portals to body, so it sits
          outside the column regardless of where it is mounted. */}
      <UpdatePrompt />
    </div>
  );
}
