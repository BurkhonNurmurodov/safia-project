import { Suspense } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import Layout from "../../components/layout/Layout";
import PageLoader from "../../components/ui/PageLoader";
import { SkeletonCard, SkeletonTable } from "../../components/ui/Skeleton";
import { useLang } from "../../context/LangContext";
import { useAuth } from "../../context/AuthContext";
import { useCapabilities } from "../../hooks/useCapabilities";
import { ADMIN_NAV, ADMIN_HOME, adminPage, adminAllows, firstAdminPage } from "../../config/adminNav";
import { appEntry } from "../../utils/apps";
import { ADMIN_PAGES } from "./adminPages";

/**
 * The admin app's page frame — what every /panel/<id> route renders.
 *
 * The admin panel was ONE page whose destinations swapped by ?tab= behind a
 * sidebar and a bottom sheet of its own. Every destination is a page now: its
 * own URL, its own chunk, its own header title and browser-tab title, and the
 * app's sidebar (Layout) lists them in their four sections. This frame owns
 * the three things every page shares:
 *
 *   - ACCESS, per page: an admin opens every page; anybody else only the pages
 *     their capability grants name. A page they may not open lands them on
 *     the first one they may, with the amber «you may not open that» band —
 *     never a silent snap somewhere unrelated; nothing at all → «/».
 *   - the one content column (max-w-6xl): a page renders no frame of its own,
 *     so moving between pages never moves the column's edge;
 *   - the page's one-line description, and the red «Xavfli» chip on a page
 *     that can destroy data.
 *
 * Unsaved edits are guarded by Layout (components/layout/LeaveGuard.jsx).
 */
export default function AdminPage({ id }) {
  const { t } = useLang();
  const { auth } = useAuth();
  const { capTabs, isLoading } = useCapabilities();
  const { state } = useLocation();
  const isAdmin = auth?.role === "admin";
  const n = ADMIN_NAV.find((x) => x.id === id);
  const Page = n ? ADMIN_PAGES[n.id] : null;

  if (!n || !Page) return <Navigate to={ADMIN_HOME} replace />;
  if (!isAdmin && isLoading) return <PageLoader where="caps" />;
  if (!adminAllows(n, isAdmin, capTabs)) {
    const first = firstAdminPage(isAdmin, capTabs);
    return first
      ? <Navigate to={adminPage(first.id)} state={{ deniedTab: n.id }} replace />
      : <Navigate to="/" replace />;
  }

  const denied = state?.deniedTab && state.deniedTab !== n.id;

  return (
    <Layout title={t(n.labelKey)}>
      <div className="max-w-6xl">
        {denied && (
          <div
            className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-xs mb-4"
            style={{ background: "rgba(234,179,8,0.10)", border: "1px solid rgba(234,179,8,0.30)", color: "var(--status-warn)" }}
          >
            <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
            <span>{t("admin.tabDenied")}</span>
          </div>
        )}
        <div className="flex items-start gap-2 mb-4">
          {n.danger && (
            <span
              className="text-[11px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider flex-shrink-0"
              style={{ background: "rgba(239,68,68,0.12)", color: "var(--status-bad)" }}
            >
              {t("admin.group.danger")}
            </span>
          )}
          <p className="text-xs leading-snug" style={{ color: "var(--text-3)" }}>
            {t(n.descKey)}
          </p>
        </div>
        <Suspense fallback={<PageSkeleton />}>
          <Page />
        </Suspense>
      </div>
    </Layout>
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-4">
      <SkeletonCard />
      <SkeletonTable rows={6} cols={5} />
    </div>
  );
}

/**
 * /panel — the admin app's home. An admin lands on the page the app was left
 * on (the launcher tile's rule, utils/apps.js), else its first page; anybody
 * else on the first page their grants open, and with none on «/».
 */
export function AdminHome() {
  const { auth } = useAuth();
  const { capTabs, isLoading } = useCapabilities();
  const isAdmin = auth?.role === "admin";
  if (isAdmin) return <Navigate to={appEntry("admin")} replace />;
  if (isLoading) return <PageLoader where="caps" />;
  const first = firstAdminPage(false, capTabs);
  return <Navigate to={first ? adminPage(first.id) : "/"} replace />;
}
