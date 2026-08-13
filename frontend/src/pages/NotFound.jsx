import { useLocation, useNavigate } from "react-router-dom";
import { Compass } from "lucide-react";
import Layout from "../components/layout/Layout";
import ErrorScreen from "../components/ui/ErrorScreen";
import { useLang } from "../context/LangContext";
import { useAuth } from "../context/AuthContext";
import { usePageAccess } from "../hooks/usePageAccess";
import { useCapabilities } from "../hooks/useCapabilities";
import { firstAccessibleRoute } from "../config/pages";

/**
 * The catch-all route. Until it existed an unknown URL matched nothing and
 * React Router rendered an empty document — a blank screen, indistinguishable
 * from a crash or a dead connection, with no way back except retyping the
 * address. Stale bookmarks, bot deep links to a route that was later renamed
 * and mistyped URLs all landed there.
 *
 * It renders INSIDE Layout on purpose: the person is signed in, so the sidebar
 * is the fastest way out and the fix is one tap on any page they recognise.
 * The button is the belt to that braces — it goes wherever their role actually
 * starts, which is not always "/".
 */
export default function NotFound() {
  const { t } = useLang();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { auth } = useAuth();
  const { access } = usePageAccess();
  const { capPages, deniedPages } = useCapabilities();

  const home = firstAccessibleRoute(auth?.role, access, capPages, deniedPages) || "/";

  return (
    <Layout title={t("notFound.title")}>
      <ErrorScreen
        inline
        tone="neutral"
        icon={Compass}
        code="404"
        live="status"
        title={t("notFound.title")}
        message={t("notFound.message")}
        action={{ label: t("notFound.home"), onClick: () => navigate(home, { replace: true }) }}
        secondary={{ label: t("notFound.back"), onClick: () => navigate(-1) }}
        // The URL they actually asked for. Muted, at the bottom, because it
        // matters only when someone reports the broken link to an admin.
        footnote={pathname}
      />
    </Layout>
  );
}
