import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FilterProvider } from "./context/FilterContext";
import { ThemeProvider } from "./context/ThemeContext";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { GhostProvider } from "./context/GhostContext";
import { LangProvider, useLang } from "./context/LangContext";
// Pages are lazy-loaded so each ships as its own chunk and downloads only when
// first visited — this keeps the initial bundle small and speeds up loading.
// A branded <PageLoader/> is shown (via Suspense) while a page's chunk loads.
const Overview = lazy(() => import("./pages/Overview"));
const Zagruzka = lazy(() => import("./pages/Zagruzka"));
const Leaderboard = lazy(() => import("./pages/Leaderboard"));
const BrigadirProfile = lazy(() => import("./pages/BrigadirProfile"));
const Workers = lazy(() => import("./pages/Workers"));
const PlanFulfillment = lazy(() => import("./pages/PlanFulfillment"));
const Downtime = lazy(() => import("./pages/Downtime"));
const AdminUpload = lazy(() => import("./pages/admin/AdminUpload"));
const Staff = lazy(() => import("./pages/Staff"));
const Daily = lazy(() => import("./pages/Daily"));
const Production = lazy(() => import("./pages/Production"));
const Trudoyomkost = lazy(() => import("./pages/Trudoyomkost"));
const Leaders = lazy(() => import("./pages/Leaders"));
const Kaizen = lazy(() => import("./pages/Kaizen"));
const UsersActivity = lazy(() => import("./pages/UsersActivity"));
const Login = lazy(() => import("./pages/Login"));
import PageLoader from "./components/ui/PageLoader";
import ErrorBoundary from "./components/ui/ErrorBoundary";
import { usePageAccess } from "./hooks/usePageAccess";
import { canAccessPage, firstAccessibleRoute } from "./config/pages";

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

/** Shown when a role has no accessible pages at all. */
function NoAccess() {
  const { t } = useLang();
  return (
    <div className="flex items-center justify-center min-h-screen px-6" style={{ background: "var(--bg-base)" }}>
      <div className="text-center max-w-xs">
        <div className="text-5xl mb-4">🔒</div>
        <p className="text-sm" style={{ color: "var(--text-3)" }}>
          {t("access.noPages")}
        </p>
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
  if (isLoading) return null;
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
            <Route path="/activity" element={<AuthGate><RequirePage page="activity"><UsersActivity /></RequirePage></AuthGate>} />
            <Route
              path="/admin/upload"
              element={<AuthGate><RequireAdmin><AdminUpload /></RequireAdmin></AuthGate>}
            />
            <Route path="/admin" element={<Navigate to="/admin/upload" replace />} />
          </Routes>
          </Suspense>
        </FilterProvider>
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
