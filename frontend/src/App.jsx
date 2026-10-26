import { lazy, Suspense } from "react";
import { importWithRecovery } from "./utils/importRecovery";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { isNetworkError, isDown, subscribeConnectivity, OFFLINE_RETRY_MS } from "./utils/connectivity";
import { queryPersister } from "./utils/offlineCache";
import { FilterProvider } from "./context/FilterContext";
import { FactoryProvider } from "./context/FactoryContext";
import { ExamProvider } from "./context/ExamContext";
import { AssistantProvider } from "./context/AssistantContext";
import AssistantPanel from "./components/assistant/AssistantPanel";
import { ThemeProvider } from "./context/ThemeContext";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { GhostProvider } from "./context/GhostContext";
import { LangProvider, useLang } from "./context/LangContext";
// Pages are lazy-loaded so each ships as its own chunk and downloads only when
// first visited — this keeps the initial bundle small and speeds up loading.
// A branded <PageLoader/> is shown (via Suspense) while a page's chunk loads.
// A chunk that fails to load recovers through utils/importRecovery.js.

// /staff-live → /staff, carrying the query string (a bare <Navigate> drops it).
function StaffLiveRedirect() {
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: "/staff", search, hash }} replace />;
}

// The three leaders' KPI pages were merged into «Liderlar KPI» (2026-10-19):
// each retired route lands on its own tab, the rest of the query kept.
function KpiTabRedirect({ tab }) {
  const { search, hash } = useLocation();
  const sp = new URLSearchParams(search);
  sp.set("tab", tab);
  return <Navigate to={{ pathname: "/leaders-kpi", search: `?${sp.toString()}`, hash }} replace />;
}

function lazyWithReload(importer) {
  const Page = lazy(() => importWithRecovery(importer));
  // Fetch the chunk now without rendering it — see preloadOpenedRoute below.
  // A failure is swallowed here: the lazy load above meets the same failure
  // and recovers exactly as it always did.
  Page.preload = () => { importer().catch(() => {}); };
  return Page;
}
const Overview = lazyWithReload(() => import("./pages/Overview"));
// The shift dashboard has a route of its own so an admin or a top-manager can
// open it; /daily still forks a shift-manager to the same component.
const ShiftDaily = lazyWithReload(() => import("./pages/ShiftDaily"));
const Zagruzka = lazyWithReload(() => import("./pages/Zagruzka"));
const Leaderboard = lazyWithReload(() => import("./pages/Leaderboard"));
const BrigadirProfile = lazyWithReload(() => import("./pages/BrigadirProfile"));
const Workers = lazyWithReload(() => import("./pages/Workers"));
const PlanFulfillment = lazyWithReload(() => import("./pages/PlanFulfillment"));
const Ontime = lazyWithReload(() => import("./pages/Ontime"));
// «Hisobotlar» — the platform's period report (Laboratory, admin-only).
const Reports = lazyWithReload(() => import("./pages/Reports"));
const Downtime = lazyWithReload(() => import("./pages/Downtime"));
const AdminPanel = lazyWithReload(() => import("./pages/admin/AdminPanel"));
const Staff = lazyWithReload(() => import("./pages/Staff"));
const Daily = lazyWithReload(() => import("./pages/Daily"));
const Production = lazyWithReload(() => import("./pages/Production"));
const Trudoyomkost = lazyWithReload(() => import("./pages/Trudoyomkost"));
const Leaders = lazyWithReload(() => import("./pages/Leaders"));
const LeaderDayReport = lazyWithReload(() => import("./pages/LeaderDayReport"));
const LeaderUnitReport = lazyWithReload(() => import("./pages/LeaderUnitReport"));
const LeaderAppeal = lazyWithReload(() => import("./pages/LeaderAppeal"));
const Cells = lazyWithReload(() => import("./pages/Cells"));
const CellDetails = lazyWithReload(() => import("./pages/CellDetails"));
const Kaizen = lazyWithReload(() => import("./pages/Kaizen"));
const Quality = lazyWithReload(() => import("./pages/Quality"));
const LeadersKpi = lazyWithReload(() => import("./pages/LeadersKpi"));
const Concerns = lazyWithReload(() => import("./pages/Concerns"));
const CellConcerns = lazyWithReload(() => import("./pages/CellConcerns"));
const Tasks = lazyWithReload(() => import("./pages/Tasks"));
const UsersActivity = lazyWithReload(() => import("./pages/UsersActivity"));
const SetupTimes = lazyWithReload(() => import("./pages/SetupTimes"));
const IdleCell = lazyWithReload(() => import("./pages/IdleCell"));
const ZagruzkaCell = lazyWithReload(() => import("./pages/ZagruzkaCell"));
const LiveOverview = lazyWithReload(() => import("./pages/LiveOverview"));
const Kelish = lazyWithReload(() => import("./pages/Kelish"));
const Arc = lazyWithReload(() => import("./pages/Arc"));
const Education = lazyWithReload(() => import("./pages/Education"));
const Exam = lazyWithReload(() => import("./pages/Exam"));
const EducationLesson = lazyWithReload(() => import("./pages/EducationLesson"));
const BroadcastReceivers = lazyWithReload(() => import("./pages/BroadcastReceivers"));
const BroadcastRecord = lazyWithReload(() => import("./pages/BroadcastRecord"));
const Gamification = lazyWithReload(() => import("./pages/Gamification"));
const Targets = lazyWithReload(() => import("./pages/Targets"));
const TargetGoal = lazyWithReload(() => import("./pages/TargetGoal"));
// «Verifix (test)» — the attendance system's API, page by page (admin-only).
const VfxApiMap = lazyWithReload(() => import("./pages/verifix/VfxApiMap"));
const VfxEmployees = lazyWithReload(() => import("./pages/verifix/VfxEmployees"));
const VfxJobs = lazyWithReload(() => import("./pages/verifix/VfxJobs"));
const VfxTimesheet = lazyWithReload(() => import("./pages/verifix/VfxTimesheet"));
const VfxHrMoves = lazyWithReload(() => import("./pages/verifix/VfxHrMoves"));
const VfxTimebooks = lazyWithReload(() => import("./pages/verifix/VfxTimebooks"));
const VfxShifts = lazyWithReload(() => import("./pages/verifix/VfxShifts"));
const VfxDictionaries = lazyWithReload(() => import("./pages/verifix/VfxDictionaries"));
const ProofCamera = lazyWithReload(() => import("./pages/ProofCamera"));
const Login = lazyWithReload(() => import("./pages/Login"));
const WebLogin = lazyWithReload(() => import("./pages/WebLogin"));
const Profile = lazyWithReload(() => import("./pages/Profile"));
const Notifications = lazyWithReload(() => import("./pages/Notifications"));
const Assistant = lazyWithReload(() => import("./pages/Assistant"));
const NotFound = lazyWithReload(() => import("./pages/NotFound"));

// The page being OPENED starts downloading at boot, in parallel with the
// sign-in (2026-10-23). A lazy page used to be fetched only once its route
// rendered — after the sign-in AND the access check had answered — so its code
// was one more network round trip in a row on every page load. Path → page,
// by the path's first segment (deeper paths named where they differ); a path
// not listed simply loads as before. Only a fetch: nothing renders, nothing is
// decided, and a page the viewer may not open costs its download and nothing
// else.
const ROUTE_PAGES = {
  "": Overview, zagruzka: Zagruzka, leaderboard: Leaderboard, brigadir: BrigadirProfile,
  workers: Workers, plan: PlanFulfillment, ontime: Ontime, downtime: Downtime,
  reports: Reports,
  staff: Staff, daily: Daily, "shift-daily": ShiftDaily, production: Production,
  trudoyomkost: Trudoyomkost, cells: Cells, kaizen: Kaizen, quality: Quality,
  concerns: Concerns, "cell-concerns": CellConcerns, "leaders-kpi": LeadersKpi,
  tasks: Tasks, activity: UsersActivity, "setup-times": SetupTimes, "idle-cell": IdleCell,
  "zagruzka-cell": ZagruzkaCell, live: LiveOverview, kelish: Kelish, arc: Arc,
  education: Education, exam: Exam, targets: Targets, profile: Profile,
  notifications: Notifications, assistant: Assistant, proof: ProofCamera,
  admin: AdminPanel, "broadcast-receivers": BroadcastReceivers, broadcast: BroadcastRecord,
};
// «/» is what the Telegram menu button opens, and a role without the overview
// is redirected from it to its first page (RequirePage) — remembered here, so
// the page that will actually open is the one fetched early.
const HOME_ROUTE_KEY = "homeRoute";
function preloadOpenedRoute() {
  try {
    let path = window.location.pathname;
    if (path === "/") path = localStorage.getItem(HOME_ROUTE_KEY) || "/";
    const parts = path.split("/").filter(Boolean);
    const [first = "", second] = parts;
    let Page = ROUTE_PAGES[first];
    if (first === "leaders") {
      Page = second === "report" ? LeaderDayReport
        : second === "unit-report" ? LeaderUnitReport
        : second === "appeal" ? LeaderAppeal : Leaders;
    } else if (first === "cells" && second) Page = CellDetails;
    else if (first === "education" && second) Page = EducationLesson;
    else if (first === "targets" && second) Page = TargetGoal;
    Page?.preload?.();
  } catch { /* a hint only */ }
}
preloadOpenedRoute();
import PageLoader from "./components/ui/PageLoader";
import ErrorBoundary, { ScopedErrorBoundary } from "./components/ui/ErrorBoundary";
import ErrorScreen from "./components/ui/ErrorScreen";
import {
  ArrowUpCircle, SmartphoneNfc, UserPlus, Clock, UserX, WifiOff, AlertTriangle, Lock, ChevronRight,
  UserRoundCog,
} from "lucide-react";
import FindInPage from "./components/FindInPage";
import OpenInAppPrompt from "./components/layout/OpenInAppPrompt";
import DocumentTitle from "./components/DocumentTitle";
import { usePageAccess } from "./hooks/usePageAccess";
import { useCapabilities } from "./hooks/useCapabilities";
import { canAccessPage, firstAccessibleRoute, ROLE_LABEL_KEYS } from "./config/pages";
import { useTranslit } from "./utils/transliterate";
import { inTelegram } from "./utils/session";

// A request that failed for want of a CONNECTION is tried again for as long
// as the connection is down (utils/connectivity.js) — every OFFLINE_RETRY_MS
// while the app knows it is offline, with the usual backoff otherwise — and
// never becomes an error: a page keeps showing what it has, and one that has
// nothing yet keeps its skeleton rather than printing an empty table as
// «nothing here». Any other failure keeps the one retry it always had.
// `networkMode: "always"` is what makes that the ONLY rule: react-query's own
// pause-while-offline follows `navigator.onLine`, which is true on a Wi-Fi
// with no internet behind it, and a PAUSED pending query reads as «loaded,
// empty» to every page. Mutations are "always" too — a change made offline
// fails and says so; it is never queued and fired later behind the person's
// back.
// `persister`: every answer is kept on the device and served back the first
// time a query mounts with nothing in memory (utils/offlineCache.js) — the
// pages open on their last data at once, offline too, and refresh behind it.
const backoff = (count) => Math.min(1000 * 2 ** count, 30_000);
const qc = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: (count, err) => (isNetworkError(err) ? true : count < 1),
      retryDelay: (count, err) => (isNetworkError(err) && isDown() ? OFFLINE_RETRY_MS : backoff(count)),
      networkMode: "always",
      persister: queryPersister,
    },
    mutations: { networkMode: "always" },
  },
});

// Back online after a real gap: every page on screen re-reads at once (a
// query still sleeping between two retries is cancelled and sent now), so the
// data the band called «last loaded» is replaced within a second of the
// connection returning, not at each query's own next attempt.
let downSince = 0;
subscribeConnectivity((s) => {
  if (s.down) { downSince = s.since; return; }
  if (!downSince) return;
  const lasted = Date.now() - downSince;
  downSince = 0;
  if (lasted >= 3_000) qc.invalidateQueries({ refetchType: "active" }).catch(() => {});
});

function AuthGate({ children }) {
  const { auth, loading, botUsername, webLogin } = useAuth();
  const { t } = useLang();

  if (loading) {
    return <PageLoader where="auth" />;
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

  // The «open as this profile» link was spent, expired (a minute), or the login
  // was disabled between the two presses. This tab was opened to BE somebody
  // else, so it says the link is dead rather than quietly signing the admin in
  // as themselves — the one outcome that looks like it worked and is not.
  if (auth?.status === "impersonate_failed") {
    return (
      <ErrorScreen
        tone="warning"
        icon={UserRoundCog}
        title={t("weblogin.impFailedTitle")}
        message={t("weblogin.impFailedMsg")}
        action={{ label: t("weblogin.impClose"), onClick: () => window.close() }}
        secondary={{ label: t("weblogin.impContinue"), href: "/" }}
      />
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
  if (isLoading) return <PageLoader where="caps" />;
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
  if (isLoading) return <PageLoader where="caps" />;
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
  if (isLoading || capsLoading) return <PageLoader where="access" />;
  if (canAccessPage(auth?.role, page, access, capPages, deniedPages)) {
    if (page === "overview" && window.location.pathname === "/") {
      try { localStorage.removeItem(HOME_ROUTE_KEY); } catch { /* a hint only */ }
    }
    return children;
  }
  // The redirect target has to respect the denies too, or a person blocked from
  // their role's first page is bounced straight back into it and loops.
  const dest = firstAccessibleRoute(auth?.role, access, capPages, deniedPages);
  if (!dest || dest === window.location.pathname) return <NoAccess />;
  if (window.location.pathname === "/") {
    try { localStorage.setItem(HOME_ROUTE_KEY, dest); } catch { /* a hint only */ }
  }
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
          {/* «Open in the app» — the website in a phone's browser, on a phone
              that has the Android app. Above the routes, so the login screen
              offers it too. */}
          <OpenInAppPrompt />
          {/* «Imtihon» — the dashboard exam's client engine: the mode switch, the
              current task and the bottom strip. Above the routes because Layout
              remounts per navigation; inside the router because it watches it. */}
          <ExamProvider>
          {/* «Yordamchi» — the AI assistant. Above the routes for the same
              reason as the exam engine: Layout remounts per navigation, and a
              conversation (and the side panel holding it) must survive the
              user moving between pages. Inside the exam provider, which hides
              it for the length of an exam. */}
          <AssistantProvider>
          <AssistantPanel />
          {/* Scoped ABOVE the routes and BELOW the shell: a page that throws
              is caught here, keeps the session alive, and clears itself the
              moment the user navigates somewhere else — no reload, nothing
              re-fetched. The boundary in App() below is the last resort for a
              provider blowing up, which is the only failure this one cannot
              reach. Outside Suspense on purpose, so a lazy chunk that rejects
              past lazyWithReload's own recovery still lands on the card
              instead of on a blank screen. */}
          <ScopedErrorBoundary>
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
            <Route path="/ontime" element={<AuthGate><RequirePage page="ontime"><Ontime /></RequirePage></AuthGate>} />
            {/* «Hisobotlar» — the period report. Page key `reports`: admin-only
                until the operator opens it on the Access tab. */}
            <Route path="/reports" element={<AuthGate><RequirePage page="reports"><Reports /></RequirePage></AuthGate>} />
            <Route path="/downtime" element={<AuthGate><RequirePage page="downtime"><Downtime /></RequirePage></AuthGate>} />
            <Route path="/staff" element={<AuthGate><RequirePage page="staff"><Staff /></RequirePage></AuthGate>} />
            <Route path="/daily" element={<AuthGate><RequirePage page="daily"><Daily /></RequirePage></AuthGate>} />
            <Route path="/shift-daily" element={<AuthGate><RequirePage page="shift-daily"><ShiftDaily /></RequirePage></AuthGate>} />
            <Route path="/production" element={<AuthGate><RequirePage page="production"><Production /></RequirePage></AuthGate>} />
            <Route path="/trudoyomkost" element={<AuthGate><RequirePage page="trudoyomkost"><Trudoyomkost /></RequirePage></AuthGate>} />
            <Route path="/leaders" element={<AuthGate><RequirePage page="leaders"><Leaders /></RequirePage></AuthGate>} />
            {/* One leader's verified day. AUTH-ONLY, deliberately not page-gated:
                it is the destination of the verification DM, and the brigadir
                being told their unit's score is often somebody nobody granted
                the /leaders page to. The backend scopes the row itself. */}
            <Route path="/leaders/report/:uid" element={<AuthGate><LeaderDayReport /></AuthGate>} />
            {/* One brigadir's whole day — every leader's report in one place.
                Where the brigadir's day digest DM lands, so AUTH-ONLY for the
                same reason; the backend scopes the unit itself. */}
            <Route path="/leaders/unit-report/:mid/:date" element={<AuthGate><LeaderUnitReport /></AuthGate>} />
            {/* One objection's or late proof's CHAT (2026-09-26) — the ruling
                buttons, the evidence, then the conversation. Where the Telegram
                «Open chat» button lands, so AUTH-ONLY for the same reason as the
                day report; the backend scopes the row and its parties itself. */}
            <Route path="/leaders/appeal/:kind/:id" element={<AuthGate><LeaderAppeal /></AuthGate>} />
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
            <Route path="/cell-concerns" element={<AuthGate><RequirePage page="cell-concerns"><CellConcerns /></RequirePage></AuthGate>} />
            <Route path="/leaders-kpi" element={<AuthGate><RequirePage page="leaders-kpi"><LeadersKpi /></RequirePage></AuthGate>} />
            <Route path="/worker-concerns" element={<KpiTabRedirect tab="concerns" />} />
            <Route path="/tasks" element={<AuthGate><RequirePage page="tasks"><Tasks /></RequirePage></AuthGate>} />
            {/* Retired 2026-09-04: both tiers of the task board live on /tasks. A bot
                deep-link or a bookmark onto the old page lands on the merged one. */}
            <Route path="/brigadir-tasks" element={<Navigate to="/tasks" replace />} />
            <Route path="/activity" element={<AuthGate><RequirePage page="activity"><UsersActivity /></RequirePage></AuthGate>} />
            <Route path="/setup-times" element={<AuthGate><RequirePage page="setup"><SetupTimes /></RequirePage></AuthGate>} />
            <Route path="/idle-cell" element={<AuthGate><RequirePage page="idle-cell"><IdleCell /></RequirePage></AuthGate>} />
            {/* «Mening toifam» lived here for a few hours on 2026-09-10 and was
                withdrawn: a «Kutish mas'uli» reads /downtime and /idle-cell
                narrowed to their own categories instead. Redirected rather than
                404-ed — a bookmark, a DM link or a tab left open on the old
                bundle must land on the register, not on a dead end. */}
            <Route path="/idle-owner" element={<Navigate to="/downtime" replace />} />
            <Route path="/zagruzka-cell" element={<AuthGate><RequirePage page="zagruzka-cell"><ZagruzkaCell /></RequirePage></AuthGate>} />
            <Route path="/live" element={<AuthGate><RequirePage page="live"><LiveOverview /></RequirePage></AuthGate>} />
            <Route path="/kelish" element={<AuthGate><RequirePage page="kelish"><Kelish /></RequirePage></AuthGate>} />
            <Route path="/turnover" element={<KpiTabRedirect tab="turnover" />} />
            <Route path="/foreign-objects" element={<KpiTabRedirect tab="foreign" />} />
            <Route path="/arc" element={<AuthGate><RequirePage page="arc"><Arc /></RequirePage></AuthGate>} />
            {/* The two ARC pages are ONE from 2026-10-05 — /arc reads both apps. */}
            <Route path="/arc-legacy" element={<Navigate to="/arc" replace />} />
            {/* «Ta'lim». The watch page is its own route rather than a modal so the
                lesson DM can link straight at it, the back button works, and a leader
                can send a colleague the lesson they were both assigned. */}
            <Route path="/education" element={<AuthGate><RequirePage page="education"><Education /></RequirePage></AuthGate>} />
            <Route path="/education/:id" element={<AuthGate><RequirePage page="education"><EducationLesson /></RequirePage></AuthGate>} />
            {/* «Imtihon» — the dashboard exam a leader sits; a supervisor reads their unit. */}
            <Route path="/exam" element={<AuthGate><RequirePage page="exam"><Exam /></RequirePage></AuthGate>} />
            {/* Safia Honors — gamification design preview, admin-only demo (no page-access key). */}
            <Route path="/gamification" element={<AuthGate><RequireAdmin><Gamification /></RequireAdmin></AuthGate>} />
            {/* «Maqsadlar» — goal board test screen, admin-only (no page-access key); goals live per profile in ui-prefs. */}
            <Route path="/targets" element={<AuthGate><RequireAdmin><Targets /></RequireAdmin></AuthGate>} />
            <Route path="/targets/:id" element={<AuthGate><RequireAdmin><TargetGoal /></RequireAdmin></AuthGate>} />
            {/* «Verifix to'g'irlash · Jonli» was retired on 2026-10-06 once /staff read
                live days itself. Its links (Telegram cards, bell rows) carry
                ?tab=&unit=&date=, which /staff reads, so the redirect keeps them. */}
            <Route path="/staff-live" element={<StaffLiveRedirect />} />
            <Route path="/verifix" element={<Navigate to="/verifix/api" replace />} />
            <Route path="/verifix/api" element={<AuthGate><RequireAdmin><VfxApiMap /></RequireAdmin></AuthGate>} />
            <Route path="/verifix/employees" element={<AuthGate><RequireAdmin><VfxEmployees /></RequireAdmin></AuthGate>} />
            <Route path="/verifix/jobs" element={<AuthGate><RequireAdmin><VfxJobs /></RequireAdmin></AuthGate>} />
            <Route path="/verifix/timesheet" element={<AuthGate><RequireAdmin><VfxTimesheet /></RequireAdmin></AuthGate>} />
            <Route path="/verifix/hr" element={<AuthGate><RequireAdmin><VfxHrMoves /></RequireAdmin></AuthGate>} />
            <Route path="/verifix/timebooks" element={<AuthGate><RequireAdmin><VfxTimebooks /></RequireAdmin></AuthGate>} />
            <Route path="/verifix/shifts" element={<AuthGate><RequireAdmin><VfxShifts /></RequireAdmin></AuthGate>} />
            {/* Removed pages land on the map: «Ish haqi» (wages are off, 2026-10-03) and seven
                more on 2026-10-04 — their methods stay readable on the map's raw viewer. */}
            {["payroll", "structure", "marks", "onsite", "devices", "requests", "absences", "incidents"].map((p) => (
              <Route key={p} path={`/verifix/${p}`} element={<Navigate to="/verifix/api" replace />} />
            ))}
            <Route path="/verifix/dictionaries" element={<AuthGate><RequireAdmin><VfxDictionaries /></RequireAdmin></AuthGate>} />
            {/* Own profile — every approved role has one, so no page-access
                gate: it is identity, not a data page. */}
            <Route path="/profile" element={<AuthGate><Profile /></AuthGate>} />
            {/* The bell's full page — auth-only like /profile: every session has notifications. */}
            <Route path="/notifications" element={<AuthGate><Notifications /></AuthGate>} />
            {/* Access is the SERVER's answer (/api/assistant/me): the
                `assistant` page, or a tab an admin opened as somebody else. */}
            <Route path="/assistant" element={<AuthGate><Assistant /></AuthGate>} />
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
            {/* The in-app camera a leader shoots checklist proofs with, opened
                from the bot's web_app button on a camera task. AUTH-ONLY and
                deliberately not page-gated, like /leaders/report/:uid: the
                leader filing the proof holds no /leaders grant, and a button
                the platform told them to press must not land on "no access".
                The backend scopes every read and write to the leader profiles
                the calling account actually holds. Outside Layout because it
                is a full-screen camera — a sidebar over a viewfinder would be
                the only chrome on the platform nobody could use. */}
            <Route path="/proof/camera" element={<AuthGate><ProofCamera /></AuthGate>} />
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
          </ScopedErrorBoundary>
          </AssistantProvider>
          </ExamProvider>
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
