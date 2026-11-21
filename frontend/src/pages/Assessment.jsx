import Layout from "../components/layout/Layout";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import AssessmentList from "../components/assessment/AssessmentList";
import QuestionBank from "../components/assessment/QuestionBank";
import TicketList from "../components/assessment/TicketList";
import MaterialList from "../components/assessment/MaterialList";
import { useAT } from "../components/assessment/assessmentUtil";
import { useAuth } from "../context/AuthContext";
import { useCapabilities } from "../hooks/useCapabilities";
import { usePersistentState } from "../hooks/usePersistentState";

/**
 * «Nomzodlarni baholash» (/assessment) — the panel that grades a Supervisor
 * candidate in a live, verbal assessment. Laboratory, page key `assessment`
 * (admin-only until the operator opens it to the judges).
 *
 * Four tabs: the sittings (every judge's door into a scorecard, /assessment/:id),
 * «Biletlar» — every drawn set as a numbered ticket, opened whole (2026-11-20) —
 * the question bank the 20 questions are drawn from, and «Materiallar» — the
 * files a candidate prepares from (2026-11-21). The tickets, the bank and the
 * materials are the admin's alone, and the server refuses them to anybody else.
 */
export default function Assessment() {
  const T = useAT();
  const { auth } = useAuth();
  const { adminOn } = useCapabilities();
  const isAdmin = auth?.role === "admin" || adminOn("assessment");
  const [tab, setTab] = usePersistentState("assessment_tab", "list");
  const view = isAdmin ? tab : "list";

  return (
    <Layout title={T.title}>
      <div className="space-y-4">
        {isAdmin && (
          <SegmentedToggle asTabs value={view} onChange={setTab} ariaLabel={T.title}
            options={[["list", T.tabList], ["tickets", T.tabTickets], ["bank", T.tabBank], ["materials", T.tabMaterials]]} />
        )}
        {view === "bank" ? <QuestionBank /> : view === "tickets" ? <TicketList />
          : view === "materials" ? <MaterialList /> : <AssessmentList isAdmin={isAdmin} />}
      </div>
    </Layout>
  );
}
