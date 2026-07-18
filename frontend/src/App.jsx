import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { RouteTransitionProvider } from "./context/RouteTransitionContext";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FilterProvider } from "./context/FilterContext";
import { ThemeProvider } from "./context/ThemeContext";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { GhostProvider } from "./context/GhostContext";
import { LangProvider, useLang } from "./context/LangContext";
// Pages are lazy-loaded so each ships as its own chunk and downloads only when
// first visited — this keeps the initial bundle small and speeds up loading.
// A branded <PageLoader/> is shown (via Suspense) while a page's chunk loads.
//
// A page chunk's filename is content-hashed (e.g. Kaizen-<hash>.js). After a
// redeploy the old hash no longer exists on the server, so a client that still
// holds the previous index.html/main bundle 404s when it tries to import that
// page. lazyWithReload catches that failure and hands off to the shared
// stale-version handler defined in index.html (window.__staleReload): it shows
// a calm "A new version is available. Reloading…" notice and does a single
// reload to pull a fresh index.html pointing at the current hashes — so the
// user recovers instead of hitting the red "App failed to start" screen. That
// handler is guarded: if a reload can't fix it (a cached index.html still
// pointing at old hashes) it shows "please reopen the app" instead of looping.
function lazyWithReload(importer) {
  return lazy(() =>
    importer().catch((err) => {
      if (typeof window.__staleReload === "function") {
        window.__staleReload();
        return new Promise(() => {}); // never resolves — the overlay takes over
      }
      // Fallback if the boot script is unavailable: one guarded reload.
      const KEY = "chunkReloadAt";
      let last = 0;
      try { last = Number(sessionStorage.getItem(KEY) || 0); } catch { /* storage blocked */ }
      if (Date.now() - last > 10_000) {
        try { sessionStorage.setItem(KEY, String(Date.now())); } catch { /* storage blocked */ }
        window.location.reload();
        return new Promise(() => {}); // never resolves — nothing renders before reload
      }
      throw err;
    })
  );
}
const Overview = lazyWithReload(() => import("./pages/Overview"));
const Zagruzka = lazyWithReload(() => import("./pages/Zagruzka"));
const Leaderboard = lazyWithReload(() => import("./pages/Leaderboard"));
const BrigadirProfile = lazyWithReload(() => import("./pages/BrigadirProfile"));
const Workers = lazyWithReload(() => import("./pages/Workers"));
const PlanFulfillment = lazyWithReload(() => import("./pages/PlanFulfillment"));
const Downtime = lazyWithReload(() => import("./pages/Downtime"));
const AdminUpload = lazyWithReload(() => import("./pages/admin/AdminUpload"));
const Staff = lazyWithReload(() => import("./pages/Staff"));
const Daily = lazyWithReload(() => import("./pages/Daily"));
const Production = lazyWithReload(() => import("./pages/Production"));
const Trudoyomkost = lazyWithReload(() => import("./pages/Trudoyomkost"));
const Leaders = lazyWithReload(() => import("./pages/Leaders"));
const Kaizen = lazyWithReload(() => import("./pages/Kaizen"));
const Quality = lazyWithReload(() => import("./pages/Quality"));
const Concerns = lazyWithReload(() => import("./pages/Concerns"));
const Tasks = lazyWithReload(() => import("./pages/Tasks"));
const UsersActivity = lazyWithReload(() => import("./pages/UsersActivity"));
const SetupTimes = lazyWithReload(() => import("./pages/SetupTimes"));
const BroadcastReceivers = lazyWithReload(() => import("./pages/BroadcastReceivers"));
const Login = lazyWithReload(() => import("./pages/Login"));
import PageLoader from "./components/ui/PageLoader";
import ErrorBoundary from "./components/ui/ErrorBoundary";
import { usePageAccess } from "./hooks/usePageAccess";
import { canAccessPage, firstAccessibleRoute, ROLE_LABEL_KEYS } from "./config/pages";
import { useTranslit } from "./utils/transliterate";

const qc = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, retry: 1 } },
});

function AuthGate({ children }) {
  const { auth, loading, botUsername } = useAuth();
  const { t } = useLang();

  if (loading) {
    return <PageLoader />;
  }

  if (auth?.status === "outdated_telegram") {
    const tgVersion = window.Telegram?.WebApp?.version;
    return (
      <div className="flex items-center justify-center min-h-screen px-6" style={{ background: "var(--bg-base)" }}>
        <div className="text-center max-w-xs">
          <div className="text-5xl mb-4">🔄</div>
          <h2 className="text-lg font-semibold mb-2" style={{ color: "var(--text-1)" }}>
            {t("auth.oldTgTitle")}
          </h2>
          <p className="text-sm mb-5" style={{ color: "var(--text-3)" }}>
            {t("auth.oldTgMsg")}
          </p>
          <a
            href="https://telegram.org/dl"
            target="_blank"
            rel="noreferrer"
            className="inline-block px-5 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: "var(--brand)", color: "#fff" }}
          >
            {t("auth.updateTg")}
          </a>
          {tgVersion && (
            <p className="text-[10px] mt-6" style={{ color: "var(--text-4)" }}>
              Telegram API v{tgVersion}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (auth?.status === "no_init_data") {
    return (
      <div className="flex items-center justify-center min-h-screen px-6" style={{ background: "var(--bg-base)" }}>
        <div className="text-center max-w-xs">
          <div className="text-5xl mb-4">📵</div>
          <h2 className="text-lg font-semibold mb-2" style={{ color: "var(--text-1)" }}>
            {t("auth.noInitTitle")}
          </h2>
          <p className="text-sm mb-5" style={{ color: "var(--text-3)" }}>
            {t("auth.noInitMsg")}
          </p>
          {botUsername && (
            <a
              href={`https://t.me/${botUsername}`}
              className="inline-block px-5 py-2.5 rounded-xl text-sm font-semibold"
              style={{ background: "var(--brand)", color: "#fff" }}
            >
              {t("auth.openBot")}
            </a>
          )}
          <p className="text-[10px] mt-6" style={{ color: "var(--text-4)", wordBreak: "break-word" }}>
            {navigator.userAgent}
          </p>
        </div>
      </div>
    );
  }

  if (auth?.status === "not_registered") {
    const tg = window.Telegram?.WebApp;
    if (tg?.initData) {
      // Opened inside Telegram — sendData won't work from menu button, guide them to bot
      return (
        <div className="flex items-center justify-center min-h-screen px-6" style={{ background: "var(--bg-base)" }}>
          <div className="text-center max-w-xs">
            <div className="text-5xl mb-4">👋</div>
            <h2 className="text-lg font-semibold mb-2" style={{ color: "var(--text-1)" }}>
              {t("auth.notRegisteredTitle")}
            </h2>
            <p className="text-sm mb-5" style={{ color: "var(--text-3)" }}>
              {t("auth.notRegisteredMsg")}
            </p>
            {botUsername && (
              <button
                onClick={() => {
                  tg.openTelegramLink(`https://t.me/${botUsername}?start=register`);
                }}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: "var(--brand)", color: "#fff" }}
              >
                {t("auth.openBot")}
              </button>
            )}
          </div>
        </div>
      );
    }
    return <Navigate to="/login" replace />;
  }

  if (auth?.status === "pending") {
    return (
      <div className="flex items-center justify-center min-h-screen px-6" style={{ background: "var(--bg-base)" }}>
        <div className="text-center max-w-xs">
          <div className="text-5xl mb-4">⏳</div>
          <h2 className="text-lg font-semibold mb-2" style={{ color: "var(--text-1)" }}>
            {t("auth.pendingTitle")}
          </h2>
          <p className="text-sm" style={{ color: "var(--text-3)" }}>
            {t("auth.pendingMsg")}
          </p>
        </div>
      </div>
    );
  }

  if (auth?.status === "rejected") {
    return (
      <div className="flex items-center justify-center min-h-screen px-6" style={{ background: "var(--bg-base)" }}>
        <div className="text-center max-w-xs">
          <div className="text-5xl mb-4">❌</div>
          <h2 className="text-lg font-semibold mb-2" style={{ color: "var(--text-1)" }}>
            {t("auth.rejectedTitle")}
          </h2>
          <p className="text-sm" style={{ color: "var(--text-3)" }}>
            {t("auth.rejectedMsg")}
          </p>
        </div>
      </div>
    );
  }

  if (auth?.status !== "approved") {
    return (
      <div className="flex items-center justify-center min-h-screen px-6" style={{ background: "var(--bg-base)" }}>
        <div className="text-center max-w-xs">
          <div className="text-5xl mb-4">⚠️</div>
          <p className="text-sm" style={{ color: "var(--text-3)" }}>
            {t("auth.errorMsg")}
          </p>
        </div>
      </div>
    );
  }

  return children;
}

function RequireAdmin({ children }) {
  const { auth } = useAuth();
  if (auth?.role !== "admin") return <Navigate to="/" replace />;
  return children;
}

/**
 * Shown when the active role has no accessible pages. This screen renders
 * OUTSIDE the Layout (no sidebar/role-switcher), so it must offer its own
 * escape hatches — otherwise a multi-role user (e.g. an admin who switched
 * into a page-less role) would be permanently trapped here.
 */
function NoAccess() {
  const { t } = useLang();
  const { tl } = useTranslit();
  const { auth, switchRole, logout } = useAuth();
  const others = (auth?.roles ?? []).filter(
    (r) => r.id !== auth?.active_role_ref && r.status === "approved",
  );
  // An account that holds an admin profile can fix this itself (Access tab) —
  // "contact an administrator" would read like a pending confirmation.
  const isAdminAccount = (auth?.roles ?? []).some((r) => r.role === "admin");
  return (
    <div className="flex items-center justify-center min-h-screen px-6" style={{ background: "var(--bg-base)" }}>
      <div className="text-center max-w-xs w-full">
        <div className="text-5xl mb-4">🔒</div>
        <p className="text-sm mb-6" style={{ color: "var(--text-3)" }}>
          {t(isAdminAccount ? "access.noPagesAdmin" : "access.noPages")}
        </p>

        {others.length > 0 && (
          <div className="space-y-2 mb-5 text-left">
            <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-4)" }}>
              {t("access.switchProfile")}
            </p>
            {others.map((r) => {
              const rTkey = ROLE_LABEL_KEYS[r.role];
              const rRole = rTkey ? t(rTkey) : (r.role ?? "");
              return (
                <button
                  key={r.id}
                  onClick={() => switchRole(r.id)}
                  className="w-full text-left px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
                  style={{ background: "var(--bg-card)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--brand)")}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border-md)")}
                >
                  {tl(r.full_name) || rRole}
                  <span className="ml-2 text-xs" style={{ color: "var(--text-3)" }}>· {rRole}</span>
                </button>
              );
            })}
          </div>
        )}

        <button onClick={logout} className="text-xs underline" style={{ color: "var(--text-3)" }}>
          {t("nav.signOut")}
        </button>
      </div>
    </div>
  );
}

/**
 * Gates a route by the admin-configured page-access matrix. Admin always
 * passes. A denied user is redirected to their first accessible page, or shown
 * a "no pages" notice if they have none (avoids redirect loops).
 */
function RequirePage({ page, children }) {
  const { auth } = useAuth();
  const { access, isLoading } = usePageAccess();
  if (isLoading) return <PageLoader />;
  if (canAccessPage(auth?.role, page, access)) return children;
  const dest = firstAccessibleRoute(auth?.role, access);
  if (!dest || dest === window.location.pathname) return <NoAccess />;
  return <Navigate to={dest} replace />;
}

function LogoutOverlay() {
  const { countdown } = useAuth();
  const { t } = useLang();
  if (countdown === null) return null;
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)", paddingTop: "var(--tg-safe-top, 0px)" }}>
      <div className="text-center px-8 py-10 rounded-2xl"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border-md)" }}>
        <div className="text-5xl font-bold mb-3" style={{ color: "var(--brand-text)" }}>
          {countdown}
        </div>
        <p className="text-sm" style={{ color: "var(--text-3)" }}>
          {t("common.signingOut")}
        </p>
      </div>
    </div>
  );
}

// Wraps app after auth is available so we can seed language from profile
function AppWithLang() {
  const { auth } = useAuth();
  const defaultLang = !localStorage.getItem("lang") && auth?.language
    ? auth.language
    : (localStorage.getItem("lang") || "uz");

  return (
    <LangProvider defaultLang={defaultLang}>
      <BrowserRouter>
        <RouteTransitionProvider>
        <FilterProvider>
          <LogoutOverlay />
          <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<AuthGate><RequirePage page="overview"><Overview /></RequirePage></AuthGate>} />
            <Route path="/zagruzka" element={<AuthGate><RequirePage page="zagruzka"><Zagruzka /></RequirePage></AuthGate>} />
            <Route path="/leaderboard" element={<AuthGate><RequirePage page="leaderboard"><Leaderboard /></RequirePage></AuthGate>} />
            <Route path="/brigadir/:id" element={<AuthGate><RequirePage page="overview"><BrigadirProfile /></RequirePage></AuthGate>} />
            <Route path="/workers" element={<AuthGate><RequirePage page="workers"><Workers /></RequirePage></AuthGate>} />
            <Route path="/plan" element={<AuthGate><RequirePage page="plan"><PlanFulfillment /></RequirePage></AuthGate>} />
            <Route path="/downtime" element={<AuthGate><RequirePage page="downtime"><Downtime /></RequirePage></AuthGate>} />
            <Route path="/staff" element={<AuthGate><RequirePage page="staff"><Staff /></RequirePage></AuthGate>} />
            <Route path="/daily" element={<AuthGate><RequirePage page="daily"><Daily /></RequirePage></AuthGate>} />
            <Route path="/production" element={<AuthGate><RequirePage page="production"><Production /></RequirePage></AuthGate>} />
            <Route path="/trudoyomkost" element={<AuthGate><RequirePage page="trudoyomkost"><Trudoyomkost /></RequirePage></AuthGate>} />
            <Route path="/leaders" element={<AuthGate><RequirePage page="leaders"><Leaders /></RequirePage></AuthGate>} />
            <Route path="/kaizen" element={<AuthGate><RequirePage page="kaizen"><Kaizen /></RequirePage></AuthGate>} />
            <Route path="/quality" element={<AuthGate><RequirePage page="quality"><Quality /></RequirePage></AuthGate>} />
            <Route path="/concerns" element={<AuthGate><RequirePage page="concerns"><Concerns /></RequirePage></AuthGate>} />
            <Route path="/tasks" element={<AuthGate><RequirePage page="tasks"><Tasks /></RequirePage></AuthGate>} />
            <Route path="/activity" element={<AuthGate><RequirePage page="activity"><UsersActivity /></RequirePage></AuthGate>} />
            <Route path="/setup-times" element={<AuthGate><RequirePage page="setup"><SetupTimes /></RequirePage></AuthGate>} />
            <Route
              path="/admin/upload"
              element={<AuthGate><RequireAdmin><AdminUpload /></RequireAdmin></AuthGate>}
            />
            {/* /broadcast mini-app recipient picker — opened from the bot's inline
                button; admin membership is enforced server-side (active role may
                not be "admin"), and it renders its own minimal, non-fullscreen UI. */}
            <Route
              path="/broadcast-receivers"
              element={<AuthGate><BroadcastReceivers /></AuthGate>}
            />
            <Route path="/admin" element={<Navigate to="/admin/upload" replace />} />
          </Routes>
          </Suspense>
        </FilterProvider>
        </RouteTransitionProvider>
      </BrowserRouter>
    </LangProvider>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={qc}>
        <ThemeProvider>
          <AuthProvider>
            <GhostProvider>
              <AppWithLang />
            </GhostProvider>
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
