import { useCallback, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { usePageAccess } from "./usePageAccess";
import { useCapabilities } from "./useCapabilities";
import { canAccessPage } from "../config/pages";
import { APPS } from "../config/navLinks";
import { linksOfApp, usesLauncher } from "../utils/apps";

/**
 * «Ilovalar» for THIS viewer: whether «/» is their launcher (`on` — admins and
 * top-managers, utils/apps.js LAUNCHER_ROLES), which pages they may open
 * (`may`), and the apps holding at least one of them (`apps`, in APPS order).
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
  const { access, isLoading: accessLoading } = usePageAccess();
  const { capPages, capTabs, deniedPages, isLoading: capsLoading } = useCapabilities();

  const may = useCallback((l) => {
    if (isAdmin) return true;
    if (l.adminOnly) return false;
    if (l.app === "admin") return capTabs.includes(l.capKey ?? l.tab);
    return canAccessPage(role, l.page, access, capPages, deniedPages);
  }, [isAdmin, role, access, capPages, capTabs, deniedPages]);

  const apps = useMemo(
    () => APPS.filter((a) => linksOfApp(a.id, may).length > 0),
    [may],
  );

  return {
    on: usesLauncher(role),
    // An admin needs no answer to know their apps; anybody else waits for it,
    // or the first frame would show the tiles of a role nobody holds.
    loading: !isAdmin && (accessLoading || capsLoading),
    may,
    apps,
  };
}
