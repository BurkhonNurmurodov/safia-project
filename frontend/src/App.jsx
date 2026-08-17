import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FilterProvider } from "./context/FilterContext";
import { FactoryProvider } from "./context/FactoryContext";
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
const AdminPanel = lazyWithReload(() => import("./pages/admin/AdminPanel"));
const Staff = lazyWithReload(() => import("./pages/Staff"));
const Daily = lazyWithReload(() => import("./pages/Daily"));
const Production = lazyWithReload(() => import("./pages/Production"));
const Trudoyomkost = lazyWithReload(() => import("./pages/Trudoyomkost"));
const Leaders = lazyWithReload(() => import("./pages/Leaders"));
const LeaderDayReport = lazyWithReload(() => import("./pages/LeaderDayReport"));
const Cells = lazyWithReload(() => import("./pages/Cells"));
const CellDetails = lazyWithReload(() => import("./pages/CellDetails"));
const Kaizen = lazyWithReload(() => import("./pages/Kaizen"));
const Quality = lazyWithReload(() => import("./pages/Quality"));
const WorkerConcerns = lazyWithReload(() => import("./pages/WorkerConcerns"));
const Concerns = lazyWithReload(() => import("./pages/Concerns"));
const Tasks = lazyWithReload(() => import("./pages/Tasks"));
const UsersActivity = lazyWithReload(() => import("./pages/UsersActivity"));
const SetupTimes = lazyWithReload(() => import("./pages/SetupTimes"));
const IdleCell = lazyWithReload(() => import("./pages/IdleCell"));
const ZagruzkaCell = lazyWithReload(() => import("./pages/ZagruzkaCell"));
const BroadcastReceivers = lazyWithReload(() => import("./pages/BroadcastReceivers"));
const BroadcastRecord = lazyWithReload(() => import("./pages/BroadcastRecord"));
const Gamification = lazyWithReload(() => import("./pages/Gamification"));
const Login = lazyWithReload(() => import("./pages/Login"));
const WebLogin = lazyWithReload(() => import("./pages/WebLogin"));
const Profile = lazyWithReload(() => import("./pages/Profile"));
const NotFound = lazyWithReload(() => import("./pages/NotFound"));
import PageLoader from "./components/ui/PageLoader";
import ErrorBoundary from "./components/ui/ErrorBoundary";
import ErrorScreen from "./components/ui/ErrorScreen";
import {
  ArrowUpCircle, SmartphoneNfc, UserPlus, Clock, UserX, WifiOff, AlertTriangle, Lock, ChevronRight,
} from "lucide-react";
import FindInPage from "./components/FindInPage";
import DocumentTitle from "./components/DocumentTitle";
import { usePageAccess } from "./hooks/usePageAccess";
import { useCapabilities } from "./hooks/useCapabilities";
import { canAccessPage, firstAccessibleRoute, ROLE_LABEL_KEYS } from "./config/pages";
import { useTranslit } from "./utils/transliterate";
import { inTelegram } from "./utils/session";

const qc = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, retry: 1 } },
});

function AuthGate({ children }) {
  const { auth, loading, botUsername, webLogin } = useAuth();
  const { t } = useLang();

  if (loading) {
    return <PageLoader />;
  }

  // Opened in an ordinary browser with no live session — the password screen.
  // It renders in place of the app rather than at a /login route so that a
  // deep link (a bookmarked page, a bot deep-link followed on a laptop) is
  // still the URL in the address bar once the person signs in.
  if (auth?.status === "web_login") {
    return (
      <Suspense fallback={<PageLoader />}>
        <WebLogin onSuccess={webLogin} />
      </Suspense>
    );
  }

  if (auth?.status === "outdated_telegram") {
    const tgVersion = window.Telegram?.WebApp?.version;
    return (
      <ErrorScreen
        tone="warning"
        icon={ArrowUpCircle}
        title={t("auth.oldTgTitle")}
        message={t("auth.oldTgMsg")}
        action={{ label: t("auth.updateTg"), href: "https://telegram.org/dl" }}
        footnote={tgVersion ? `Telegram API v${tgVersion}` : null}
      />
    );
  }

  if (auth?.status === "no_init_data") {
    return (
      <ErrorScreen
        tone="warning"
        icon={SmartphoneNfc}
        title={t("auth.noInitTitle")}
        message={t("auth.noInitMsg")}
        action={botUsername ? { label: t("auth.openBot"), href: `https://t.me/${botUsername}` } : null}
        // The user agent is diagnostic, not an instruction. It used to sit in
        // the open at --text-4, where it read as part of the message and the
        // user was left parsing a Mozilla string; behind the disclosure it is
        // still one tap away for whoever is actually debugging the WebView.
        detail={navigator.userAgent}
        detailLabel={t("error.details")}
      />
    );
  }

  if (auth?.status === "not_registered") {
    const tg = window.Telegram?.WebApp;
    if (tg?.initData) {
      // Opened inside Telegram — sendData won't work from menu button, guide them to bot
      return (
        <ErrorScreen
          tone="brand"
          icon={UserPlus}
          live="status"
          title={t("auth.notRegisteredTitle")}
          message={t("auth.notRegisteredMsg")}
          action={
            botUsername
              ? {
                  label: t("auth.openBot"),
                  onClick: () => tg.openTelegramLink(`https://t.me/${botUsername}?start=register`),
                }
              : null
          }
        />
      );
    }
    return <Navigate to="/login" replace />;
  }

  if (auth?.status === "pending") {
    return (
      <ErrorScreen
        tone="warning"
        icon={Clock}
        live="status"
        title={t("auth.pendingTitle")}
        message={t("auth.pendingMsg")}
        // Approval happens in the bot, out of this tab's sight: without a way
        // to re-ask, the only way to learn it landed is to kill the app and
        // reopen it.
        action={{ label: t("auth.checkAgain"), onClick: () => window.location.reload() }}
      />
    );
  }

  if (auth?.status === "rejected") {
    return (
      <ErrorScreen
        tone="danger"
        icon={UserX}
        title={t("auth.rejectedTitle")}
        message={t("auth.rejectedMsg")}
      />
    );
  }

  // The catch-all also covers status "error" — the /api/auth request never
  // came back. That is overwhelmingly a dead connection rather than a broken
  // account, so it gets its own screen and, above all, a retry: the previous
  // shared "⚠️ something is wrong" card offered no control at all and left a
  // supervisor on a weak signal with nothing to tap.
  if (auth?.status !== "approved") {
    const offline = auth?.status === "error";
    return (
      <ErrorScreen
        tone={offline ? "warning" : "danger"}
        icon={offline ? WifiOff : AlertTriangle}
        title={offline ? t("auth.offlineTitle") : t("error.title")}
        message={offline ? t("auth.offlineMsg") : t("auth.errorMsg")}
        action={{ label: t("error.reload"), onClick: () => window.location.reload() }}
      />
    );
  }

  return children;
}

/** Strictly admin-only. Used by pages that are not part of the capability
 *  catalog (e.g. /gamification) — a grant must never widen those. */
function RequireAdmin({ children }) {
  const { auth } = useAuth();
  if (auth?.role !== "admin") return <Navigate to="/" replace />;
  return children;
}

/**
 * Gates the ADMIN view of the profile page (/profile/:ptype/:pid) — the same
 * audience as the Profiles tab it navigates from: admins, plus grantees of the
 * `admin.profiles.manage` capability (its panel tab id is "profiles"). The
 * backend enforces every write regardless; this only spares a denied visitor a
 * page of buttons that would all 403.
 */
function RequireProfilesManage({ children }) {
  const { auth } = useAuth();
  const { capTabs, isLoading } = useCapabilities();
  if (auth?.role === "admin") return children;
  if (isLoading) return <PageLoader />;
  if (capTabs.includes("profiles")) return children;
  return <Navigate to="/profile" replace />;
}

/**
 * Gates the /admin panel specifically. Admins always pass. A non-admin passes
 * only while holding at least one capability whose tab lives in the panel —
 * and then sees ONLY those tabs (AdminPanel filters by the same list), so
 * "run the Users tab" never becomes "run the admin panel". Deliberately
 * separate from RequireAdmin so widening the panel can't widen anything else.
 */
function RequireAdminPanel({ children }) {
  const { auth } = useAuth();
  const { capTabs, isLoading } = useCapabilities();
  if (auth?.role === "admin") return children;
  if (isLoading) return <PageLoader />;
  if (capTabs.length > 0) return children;
  return <Navigate to="/" replace />;
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
    <ErrorScreen
      tone="neutral"
      icon={Lock}
      code="403"
      live="status"
      title={t("access.noPagesTitle")}
      message={t(isAdminAccount ? "access.noPagesAdmin" : "access.noPages")}
      secondary={{ label: t("nav.signOut"), onClick: logout }}
    >
      {others.length > 0 && (
        <div className="space-y-2 text-left">
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
                // Hover used to be painted by onMouseEnter/onMouseLeave, which
                // never fire on a touchscreen — on the phone this app mostly
                // runs on, the row sat inert. The affordance is now the chevron
                // and the border, present at rest on every input.
                className="w-full flex items-center gap-2 text-left px-4 py-2.5 rounded-xl text-sm font-medium transition-colors hover:border-[var(--brand)]"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}
              >
                <span className="flex-1 min-w-0 truncate">
                  {tl(r.full_name) || rRole}
                  <span className="ml-2 text-xs" style={{ color: "var(--text-3)" }}>· {rRole}</span>
                </span>
                <ChevronRight size={15} style={{ color: "var(--text-4)" }} aria-hidden="true" />
              </button>
            );
          })}
        </div>
      )}
    </ErrorScreen>
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
  const { capPages, deniedPages, isLoading: capsLoading } = useCapabilities();
  if (isLoading || capsLoading) return <PageLoader />;
  if (canAccessPage(auth?.role, page, access, capPages, deniedPages)) return children;
  // The redirect target has to respect the denies too, or a person blocked from
  // their role's first page is bounced straight back into it and loops.
  const dest = firstAccessibleRoute(auth?.role, access, capPages, deniedPages);
  if (!dest || dest === window.location.pathname) return <NoAccess />;
  return <Navigate to={dest} replace />;
}

function LogoutOverlay() {
  const { countdown } = useAuth();
  const { t } = useLang();
  if (countdown === null) return null;
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)", paddingTop: "var(--tg-safe-top, 0px)", paddingBottom: "var(--tg-safe-bottom, 0px)" }}>
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
         {/* Which PLANT the factory-aware pages report on. Above the routes on
             purpose: the selection is shared by all six of them, so navigating
             between them must never reset or contradict it. */}
         <FactoryProvider>
          <DocumentTitle />
          <LogoutOverlay />
          <FindInPage />
          <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Registration is a Telegram flow — it needs the bot to sign the
                profile claim. A browser landing here (a stale bookmark, a
                deep-link followed on a laptop) gets the password screen at "/"
                instead of a picker that can only 401. */}
            <Route path="/login" element={inTelegram() ? <Login /> : <Navigate to="/" replace />} />
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
            {/* One leader's verified day. AUTH-ONLY, deliberately not page-gated:
                it is the destination of the verification DM, and the brigadir
                being told their unit's score is often somebody nobody granted
                the /leaders page to. The backend scopes the row itself. */}
            <Route path="/leaders/report/:uid" element={<AuthGate><LeaderDayReport /></AuthGate>} />
            {/* The retired per-shift admin copies and the bot-only page they
                replaced — old bookmarks and Telegram buttons land on the one
                merged page, whose Smena filter does the narrowing now. */}
            <Route path="/leaders-shift1" element={<Navigate to="/leaders" replace />} />
            <Route path="/leaders-shift2" element={<Navigate to="/leaders" replace />} />
            <Route path="/leaders-bot" element={<Navigate to="/leaders" replace />} />
            <Route path="/cells" element={<AuthGate><RequirePage page="cells"><Cells /></RequirePage></AuthGate>} />
            {/* One cell's card — where every CellLink on the platform lands.
                Auth-only on purpose (like /profile): cells are pressable from
                attendance, setup times, production and quality, so the page
                must open for viewers who don't hold the /cells register page.
                The read endpoint is gated the same way; every write keeps its
                own capability/admin guard. */}
            <Route path="/cells/:id" element={<AuthGate><CellDetails /></AuthGate>} />
            <Route path="/kaizen" element={<AuthGate><RequirePage page="kaizen"><Kaizen /></RequirePage></AuthGate>} />
            <Route path="/quality" element={<AuthGate><RequirePage page="quality"><Quality /></RequirePage></AuthGate>} />
            <Route path="/concerns" element={<AuthGate><RequirePage page="concerns"><Concerns /></RequirePage></AuthGate>} />
            <Route path="/worker-concerns" element={<AuthGate><RequirePage page="worker-concerns"><WorkerConcerns /></RequirePage></AuthGate>} />
            <Route path="/tasks" element={<AuthGate><RequirePage page="tasks"><Tasks /></RequirePage></AuthGate>} />
            <Route path="/activity" element={<AuthGate><RequirePage page="activity"><UsersActivity /></RequirePage></AuthGate>} />
            <Route path="/setup-times" element={<AuthGate><RequirePage page="setup"><SetupTimes /></RequirePage></AuthGate>} />
            <Route path="/idle-cell" element={<AuthGate><RequirePage page="idle-cell"><IdleCell /></RequirePage></AuthGate>} />
            <Route path="/zagruzka-cell" element={<AuthGate><RequirePage page="zagruzka-cell"><ZagruzkaCell /></RequirePage></AuthGate>} />
            {/* Safia Honors — gamification design preview, admin-only demo (no page-access key). */}
            <Route path="/gamification" element={<AuthGate><RequireAdmin><Gamification /></RequireAdmin></AuthGate>} />
            {/* Own profile — every approved role has one, so no page-access
                gate: it is identity, not a data page. */}
            <Route path="/profile" element={<AuthGate><Profile /></AuthGate>} />
            {/* Admin management view of one profile — where the Profiles tab
                rows navigate instead of opening an edit modal. */}
            <Route path="/profile/:ptype/:pid" element={<AuthGate><RequireProfilesManage><Profile /></RequireProfilesManage></AuthGate>} />
            <Route
              path="/admin/upload"
              element={<AuthGate><RequireAdminPanel><AdminPanel /></RequireAdminPanel></AuthGate>}
            />
            {/* /broadcast mini-app recipient picker — opened from the bot's inline
                button; admin membership is enforced server-side (active role may
                not be "admin"), and it renders its own minimal, non-fullscreen UI. */}
            <Route
              path="/broadcast-receivers"
              element={<AuthGate><BroadcastReceivers /></AuthGate>}
            />
            {/* One broadcast's record — where every history row lands, and where
                a completed send hands off to watching it. RequireAdmin matches
                the backend: every /api/broadcast read is verify_admin, so a
                capability grantee would only get a page of 403s. */}
            <Route
              path="/broadcast/:id"
              element={<AuthGate><RequireAdmin><BroadcastRecord /></RequireAdmin></AuthGate>}
            />
            <Route path="/admin" element={<Navigate to="/admin/upload" replace />} />
            {/* Catch-all. Must stay LAST — it matches whatever nothing above
                did. Behind AuthGate so a signed-out visitor on a bad URL gets
                the login screen (and keeps their deep link), not a 404. */}
            <Route path="*" element={<AuthGate><NotFound /></AuthGate>} />
          </Routes>
          </Suspense>
         </FactoryProvider>
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
