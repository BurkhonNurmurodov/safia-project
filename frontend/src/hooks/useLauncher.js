import { useCallback, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { usePageAccess } from "./usePageAccess";
import { useCapabilities } from "./useCapabilities";
import { canAccessPage } from "../config/pages";
import { linksOfApp, usesLauncher } from "../utils/apps";
import { resolveLayout } from "../utils/navLayout";

/**
 * «Ilovalar» for THIS viewer: whether «/» is their launcher (`on` — admins and
 * top-managers, utils/apps.js LAUNCHER_ROLES), which pages they may open
 * (`may`), the launcher's structure (`layout` — the code's own apps, or the
 * ones the operator arranged on the org chart: utils/navLayout.js) and its
 * apps holding at least one page they may open (`apps`, in the layout's order).
 *
 * `may` is the sidebar's own rule, never a second one: an admin opens
 * everything; anybody else a page link through the page-access matrix (and
 * their grants and denies), an admin-app page through a capability naming it,
 * and never an `adminOnly` link. So a top-manager's launcher shows exactly the
 * apps whose pages their sidebar would list — a tile can never open onto
 * «no access».
 */
export function useLauncher() {
  const { auth } = useAuth();
  const role = auth?.role;
  const isAdmin = role === "admin";
  const { access, nav, isLoading: accessLoading } = usePageAccess();
  const layout = useMemo(() => resolveLayout(nav), [nav]);
  const { capPages, capTabs, deniedPages, isLoading: capsLoading } = useCapabilities();

  const may = useCallback((l) => {
    if (isAdmin) return true;
    if (l.adminOnly) return false;
    // An admin-app page (`tab`), in whichever app the layout seats it.
    if (l.tab) return capTabs.includes(l.capKey ?? l.tab);
    return canAccessPage(role, l.page, access, capPages, deniedPages);
  }, [isAdmin, role, access, capPages, capTabs, deniedPages]);

  const apps = useMemo(
    () => layout.apps.filter((a) => linksOfApp(a.id, may, layout).length > 0),
    [may, layout],
  );

  return {
    on: usesLauncher(role),
    // An admin's pages need no answer, but their APPS do: the layout rides
    // with the page access (seeded by the sign-in, so this rarely waits), and
    // tiles drawn before it would jump as it lands. Anybody else waits for
    // their capabilities too, or the first frame would show the tiles of a
    // role nobody holds.
    loading: accessLoading || (!isAdmin && capsLoading),
    may,
    layout,
    apps,
  };
}
