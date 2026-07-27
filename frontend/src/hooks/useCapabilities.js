import { useQuery } from "@tanstack/react-query";
import api from "../utils/api";

/**
 * The signed-in profile's personal admin capabilities.
 *
 * Mirrors backend/app/capabilities.py. The page-access matrix says which PAGES
 * a ROLE may open; this says which admin-only ACTIONS this ONE person may
 * perform — approve transfers, fix attendance, run the Users tab.
 *
 * Deliberately a live query rather than something baked into the JWT: a grant,
 * and above all a REVOKE, must land on the next page load instead of waiting
 * for the person to log out and back in. Admins come back holding the whole
 * catalog at "all", so `can()` is the single question every gate asks — no
 * `role === "admin" || …` at the call sites.
 */
export function useCapabilities() {
  const { data, isLoading } = useQuery({
    queryKey: ["my-capabilities"],
    queryFn: () => api.get("/api/my-capabilities").then((r) => r.data),
    staleTime: 60_000,
  });

  const caps = data?.caps ?? {};
  const pageScopes = data?.page_scopes ?? {};
  return {
    caps,
    // Pages these grants unlock on their own — merged into the page-access
    // check so a granted approver can reach the queue they were given without
    // the page being opened for every peer holding their role.
    capPages: data?.pages ?? [],
    // Admin-panel tabs a non-admin grantee may open.
    capTabs: data?.tabs ?? [],
    // {page: "own" | "all"} for the personal page-view grants this person holds.
    pageScopes,
    /** Does this person hold the capability at all? */
    can: (key) => caps[key] != null,
    /** "own" | "all" | undefined — how far the grant reaches. */
    scopeOf: (key) => caps[key],
    /** Full admin reach (every unit, shift and date) for this capability. */
    canAll: (key) => caps[key] === "all",
    /**
     * Does this person read the WHOLE factory on `pageKey`?
     *
     * The flag a scoped page asks before pinning its viewer to their own unit:
     * true means drop the pin and offer the picker, exactly as the backend has
     * already decided (app/capabilities.page_scope_is_all). Admins come back
     * true for every page. Undefined while the query is in flight, which reads
     * as false — the narrow view — so a slow response never briefly widens one.
     */
    seesAllOn: (pageKey) => pageScopes[pageKey] === "all",
    isLoading,
  };
}

// ── the catalog, mirrored from backend/app/capabilities.py ───────────────────
// Keys only; labels live in the i18n files under caps.<key>.

export const CAP = {
  DOCUMENTS_APPROVE: "staff.documents.approve",
  REQUESTS_APPROVE:  "staff.requests.approve",
  ATTENDANCE_EDIT:   "staff.attendance.edit",
  ATTENDANCE_DELETE: "staff.attendance.delete",
  DAY_REOPEN:        "staff.day.reopen",
  CLEANUP:           "admin.cleanup",
  USERS_MANAGE:      "admin.users.manage",
  PROFILES_MANAGE:   "admin.profiles.manage",
  CELLS_MANAGE:      "admin.cells.manage",
};
