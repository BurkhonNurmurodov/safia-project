import { lazy } from "react";
import { importWithRecovery } from "./importRecovery";

// A lazy-loaded page: its own chunk, downloaded only when first visited, and a
// chunk that fails to load recovers through utils/importRecovery.js. Shared by
// App.jsx's routes and the admin app's page map (pages/admin/adminPages.js).
export function lazyWithReload(importer) {
  const Page = lazy(() => importWithRecovery(importer));
  // Fetch the chunk now without rendering it — see preloadOpenedRoute in
  // App.jsx. A failure is swallowed here: the lazy load above meets the same
  // failure and recovers exactly as it always did.
  Page.preload = () => { importer().catch(() => {}); };
  return Page;
}
