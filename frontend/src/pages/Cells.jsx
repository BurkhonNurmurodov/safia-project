import Layout from "../components/layout/Layout";
import ProfilesManagement from "./admin/ProfilesManagement";
import { useLang } from "../context/LangContext";
import { useCapabilities, CAP } from "../hooks/useCapabilities";

/**
 * Cells registry — the verifix/SAP code + workshop-name + supervisor/leader
 * register. Promoted 2026-07-28 from an admin-panel tab to a first-class
 * sidebar page. Two independent grants gate it (a real admin holds both):
 *   • page.view.cells    → open the page (read-only view)
 *   • admin.cells.manage → add / edit / delete cells (the "edit" grant)
 * Both are handed out per person on the admin «Permissions» tab.
 *
 * Reuses ProfilesManagement in `cellsOnly` mode; `canEdit` hides every write
 * control (Add button, row Edit/Delete, the Actions column) for a view-only
 * grantee — the backend enforces the same split, so a hidden button that
 * somehow fired would still 403.
 */
export default function Cells() {
  const { t } = useLang();
  const { can, isLoading } = useCapabilities();
  // While the grant query is in flight, default to read-only so a slow
  // response never briefly exposes edit controls. Admins come back holding
  // the whole catalog, so can() is the single question.
  const canEdit = !isLoading && can(CAP.CELLS_MANAGE);

  return (
    <Layout title={t("nav.cells")}>
      <ProfilesManagement cellsOnly canEdit={canEdit} />
    </Layout>
  );
}
